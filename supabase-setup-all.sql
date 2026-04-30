-- =====================================================================
-- Acto — COMPLETE Supabase setup (single-file version)
-- =====================================================================
-- Run this once in your project's SQL editor:
--   https://supabase.com/dashboard/project/gssotstyevehbzydzhlq/sql/new
-- Paste the WHOLE content, hit "Run". Idempotent: safe to re-run.
--
-- Includes (in this order):
--   PART 1 — Profiles table, RLS, updated_at trigger, delete_my_account RPC
--   PART 2 — Stats columns + bump_stats RPC + is_admin helper + admin RLS
--   PART 3 — impro_events table + log_impro_event + update_impro_event RPCs
--
-- After running, promote yourself to admin (replace the email):
--   update public.profiles set is_admin = true
--   where email = 'lucneoseb@gmail.com';
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║                       PART 1 — PROFILES                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1.1 PROFILES TABLE — one row per authenticated user.
create table if not exists public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  email         text        not null,
  prenom        text        not null,
  nom           text        not null,
  date_naissance date       not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 1.1b STAGE NAME — optional, used by the player-roster feature.
--      Idempotent so the column is added on existing tables without erroring.
alter table public.profiles
  add column if not exists nom_scene text;

-- 1.2 ROW LEVEL SECURITY — owner-only by default.
alter table public.profiles enable row level security;

drop policy if exists "select_own_profile" on public.profiles;
create policy "select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "insert_own_profile" on public.profiles;
create policy "insert_own_profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "update_own_profile" on public.profiles;
create policy "update_own_profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "delete_own_profile" on public.profiles;
create policy "delete_own_profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- 1.3 UPDATED_AT trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 1.4 SELF-DELETE RPC — lets the authenticated user nuke their own auth row.
--     Cascades onto profiles via the FK on delete cascade.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║                  PART 2 — STATS + ADMIN GATE                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 2.1 STATS COLUMNS on profiles.
alter table public.profiles
  add column if not exists login_count             integer       not null default 0,
  add column if not exists last_login_at           timestamptz,
  add column if not exists total_impros_generated  integer       not null default 0,
  add column if not exists total_impros_played     integer       not null default 0,
  add column if not exists total_impro_seconds     integer       not null default 0,
  add column if not exists total_records_count     integer       not null default 0,
  add column if not exists total_record_seconds    integer       not null default 0,
  add column if not exists is_admin                boolean       not null default false;

-- 2.2 ATOMIC INCREMENT RPC — server-side clamping prevents negative deltas.
create or replace function public.bump_stats(
  delta_login           integer default 0,
  delta_generated       integer default 0,
  delta_played          integer default 0,
  delta_impro_seconds   integer default 0,
  delta_records         integer default 0,
  delta_record_seconds  integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.profiles set
    login_count            = login_count            + greatest(0, coalesce(delta_login,          0)),
    total_impros_generated = total_impros_generated + greatest(0, coalesce(delta_generated,      0)),
    total_impros_played    = total_impros_played    + greatest(0, coalesce(delta_played,         0)),
    total_impro_seconds    = total_impro_seconds    + greatest(0, coalesce(delta_impro_seconds,  0)),
    total_records_count    = total_records_count    + greatest(0, coalesce(delta_records,        0)),
    total_record_seconds   = total_record_seconds   + greatest(0, coalesce(delta_record_seconds, 0)),
    last_login_at          = case
      when coalesce(delta_login, 0) > 0 then now()
      else last_login_at
    end
  where id = auth.uid();
end;
$$;

revoke all on function public.bump_stats(integer, integer, integer, integer, integer, integer) from public;
grant  execute on function public.bump_stats(integer, integer, integer, integer, integer, integer) to authenticated;

-- 2.3 is_admin() HELPER — avoids recursive RLS lookup.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- 2.4 ADMIN-READS-ALL RLS POLICY — admins see every profile row.
drop policy if exists "admins_read_all_profiles" on public.profiles;
create policy "admins_read_all_profiles"
  on public.profiles for select
  using (public.is_admin());


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║              PART 3 — IMPRO EVENTS (per-launch logs)              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 3.1 EVENTS TABLE — one row per impro that was actually started.
create table if not exists public.impro_events (
  id                       uuid          primary key default gen_random_uuid(),
  user_id                  uuid          not null references auth.users(id) on delete cascade,
  launched_at              timestamptz   not null default now(),
  mode                     text          not null,                -- 'troupe' | 'match'
  level                    text          not null,                -- 'debutant' | 'confirme' | 'expert'
  exercise_name            text,
  constraint_name          text,
  theme_name               text,
  duration_planned_seconds integer       not null default 0,
  duration_played_seconds  integer       not null default 0,
  was_recorded             boolean       not null default false
);

create index if not exists impro_events_user_id_idx     on public.impro_events (user_id);
create index if not exists impro_events_launched_at_idx on public.impro_events (launched_at desc);
create index if not exists impro_events_mode_idx        on public.impro_events (mode);
create index if not exists impro_events_level_idx       on public.impro_events (level);

-- 3.2 ROW LEVEL SECURITY — owner-only + admin-read-all.
alter table public.impro_events enable row level security;

drop policy if exists "select_own_events"        on public.impro_events;
drop policy if exists "admins_select_all_events" on public.impro_events;

create policy "select_own_events"
  on public.impro_events for select
  using (auth.uid() = user_id);

create policy "admins_select_all_events"
  on public.impro_events for select
  using (public.is_admin());

-- 3.3 LOG RPC — called when an impro is first launched (chrono start).
--     Returns the new event id so the client can update it later.
create or replace function public.log_impro_event(
  p_mode             text,
  p_level            text,
  p_exercise         text,
  p_constraint       text,
  p_theme            text,
  p_duration_planned integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.impro_events (
    user_id, mode, level,
    exercise_name, constraint_name, theme_name,
    duration_planned_seconds
  ) values (
    auth.uid(),
    coalesce(p_mode,  ''),
    coalesce(p_level, ''),
    p_exercise, p_constraint, p_theme,
    greatest(0, coalesce(p_duration_planned, 0))
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.log_impro_event(text, text, text, text, text, integer) from public;
grant  execute on function public.log_impro_event(text, text, text, text, text, integer) to authenticated;

-- 3.4 UPDATE RPC — incrementally update played duration + was_recorded.
--     Only the owner can update (defensive check inside).
--     p_add_played_seconds is ADDED (incremental); pass NULL to skip.
--     p_set_was_recorded TRUE → sets to true; FALSE/NULL → no change.
create or replace function public.update_impro_event(
  p_event_id            uuid,
  p_add_played_seconds  integer default null,
  p_set_was_recorded    boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.impro_events
     set duration_played_seconds = duration_played_seconds + greatest(0, coalesce(p_add_played_seconds, 0)),
         was_recorded            = case
           when coalesce(p_set_was_recorded, false) then true
           else was_recorded
         end
   where id = p_event_id and user_id = auth.uid();
end;
$$;

revoke all on function public.update_impro_event(uuid, integer, boolean) from public;
grant  execute on function public.update_impro_event(uuid, integer, boolean) to authenticated;


-- =====================================================================
-- DONE.
--
-- Verification checklist (Supabase dashboard):
--   • Database → Tables → "profiles" and "impro_events" both exist
--     with the 🔒 RLS enabled badge.
--   • Database → Functions → all five present:
--       delete_my_account, bump_stats, is_admin,
--       log_impro_event, update_impro_event
--
-- Don't forget to:
--   1. Enable email confirmation:
--      Authentication → Providers → Email → "Confirm email" ON
--   2. Set redirect URL:
--      Authentication → URL Configuration →
--      Site URL: https://thriving-trifle-e565e3.netlify.app
--      Redirect URLs: same
--   3. Promote yourself to admin (after first signup):
--      update public.profiles set is_admin = true
--      where email = 'lucneoseb@gmail.com';
-- =====================================================================
