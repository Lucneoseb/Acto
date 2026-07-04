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

-- 1.1b STAGE NAME — used by the player-roster feature. Required at the app
--      level (signup + edit), but kept nullable in DB so legacy rows survive.
--      Idempotent so the column is added on existing tables without erroring.
alter table public.profiles
  add column if not exists nom_scene text;

-- Make date_naissance nullable so the auth-user trigger (1.1f) can create a
-- profile even if the metadata is missing. The app form still enforces it.
alter table public.profiles
  alter column date_naissance drop not null;

-- 1.1c STAGE NAME UNIQUENESS — case-insensitive. Partial index so existing
--      rows with NULL nom_scene aren't fighting for the same slot.
create unique index if not exists profiles_nom_scene_unique
  on public.profiles (lower(nom_scene))
  where nom_scene is not null;

-- 1.1d STAGE NAME CONTENT FILTER — rejects a small built-in list of common
--      French/English vulgarities. Whole-word match (\m…\M) so legitimate
--      names containing those letters in another context still go through.
--      Extend the regex below if you spot something that slips by.
create or replace function public.is_clean_stage_name(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name is null
      or lower(p_name) !~* '\m(merde|putain|connard|connasse|enculé|enculee|encule|salope|salaud|fdp|nique|ntm|conard|conasse|pute|tapette|tarlouze|fuck|shit|bitch|asshole|cunt|nigger|nigga|faggot|whore)\M';
$$;

-- Add the CHECK constraint only if it doesn't exist yet (manual idempotency
-- because Postgres has no `add constraint if not exists`).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_nom_scene_clean'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_nom_scene_clean
      check (public.is_clean_stage_name(nom_scene));
  end if;
end $$;

-- 1.1e STAGE NAME AVAILABILITY RPC — used by the client to give an early
--      "this name is taken" hint before insert/update. Excludes the caller
--      (so editing your own profile keeping the same name doesn't trigger).
--      Public-readable: signup needs to call this BEFORE auth.uid() exists.
create or replace function public.is_stage_name_taken(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where nom_scene is not null
      and lower(nom_scene) = lower(coalesce(p_name, ''))
      and (auth.uid() is null or id != auth.uid())
  );
$$;

grant execute on function public.is_stage_name_taken(text) to anon, authenticated;

-- 1.1f AUTO-CREATE PROFILE ON SIGNUP — fires inside the same transaction as
--      auth.users insert, so the unique nom_scene constraint is enforced
--      ATOMICALLY at signup time (not deferred until first login). Without
--      this trigger two users could pick the same stage name during the
--      email-confirmation gap.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, prenom, nom, date_naissance, nom_scene)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    coalesce(new.raw_user_meta_data ->> 'nom',    ''),
    nullif(new.raw_user_meta_data ->> 'date_naissance', '')::date,
    nullif(new.raw_user_meta_data ->> 'nom_scene', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

-- Whitelist enums so a tampered client (or buggy legacy event) can't
-- pollute analytics with arbitrary mode/level strings. Idempotent: drops
-- and recreates so re-running the script re-validates the rules.
-- NOT VALID first so any pre-existing dirty rows don't block the migration;
-- the immediate VALIDATE below catches them only if everything's clean.
do $$
begin
  alter table public.impro_events drop constraint if exists impro_events_mode_chk;
  alter table public.impro_events drop constraint if exists impro_events_level_chk;
  alter table public.impro_events
    add constraint impro_events_mode_chk
      check (mode in ('troupe','match')) not valid;
  alter table public.impro_events
    add constraint impro_events_level_chk
      check (level in ('debutant','confirme','expert')) not valid;
  -- Try to validate; if existing rows violate, the constraint stays NOT VALID
  -- (still enforced for new rows) and a NOTICE is raised for the operator.
  begin
    alter table public.impro_events validate constraint impro_events_mode_chk;
  exception when check_violation then
    raise notice 'impro_events_mode_chk: existing rows violate, constraint kept NOT VALID';
  end;
  begin
    alter table public.impro_events validate constraint impro_events_level_chk;
  exception when check_violation then
    raise notice 'impro_events_level_chk: existing rows violate, constraint kept NOT VALID';
  end;
end$$;

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


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║              PART 4 — IMPRO PARTICIPANTS (rosters)                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Each impro can have N participants. A participant is either:
--   • a registered Acto user (user_id IS NOT NULL) → impro shows up in
--     their analytics
--   • an ad-hoc name typed by the launcher (user_id IS NULL) → just stored
--     as a label, no analytics
-- nom_scene_text is captured at recording time so a later rename of the
-- user's stage name doesn't rewrite history.

-- 4.1 PARTICIPANTS TABLE
create table if not exists public.impro_participants (
  id              uuid          primary key default gen_random_uuid(),
  event_id        uuid          not null references public.impro_events(id) on delete cascade,
  user_id         uuid          references auth.users(id) on delete set null,
  nom_scene_text  text          not null,
  created_at      timestamptz   not null default now()
);

create index if not exists impro_participants_event_idx on public.impro_participants (event_id);
create index if not exists impro_participants_user_idx  on public.impro_participants (user_id);

-- 4.2 RLS — owner of the event AND each listed participant can read.
alter table public.impro_participants enable row level security;

drop policy if exists "select_own_participation"        on public.impro_participants;
drop policy if exists "admins_select_all_participation" on public.impro_participants;

create policy "select_own_participation"
  on public.impro_participants for select
  using (
    user_id = auth.uid()
    or event_id in (select id from public.impro_events where user_id = auth.uid())
  );

create policy "admins_select_all_participation"
  on public.impro_participants for select
  using (public.is_admin());

-- Inserts/deletes go through the RPC below — never direct from the client.

-- 4.3 ADD-PARTICIPANTS RPC — called after log_impro_event.
--     Replaces the participant list for the given event (idempotent re-call).
--     p_participants is a JSONB array of objects, each shaped:
--       { "user_id": "<uuid or empty>", "nom_scene": "<display name>" }
create or replace function public.add_impro_participants(
  p_event_id     uuid,
  p_participants jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_part  jsonb;
  v_uid   uuid;
  v_name  text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Only the launcher of the event can set its participants.
  select user_id into v_owner from public.impro_events where id = p_event_id;
  if v_owner is null then
    raise exception 'event not found';
  end if;
  if v_owner != auth.uid() then
    raise exception 'not your event';
  end if;
  -- Wipe + reinsert so the function is idempotent.
  delete from public.impro_participants where event_id = p_event_id;
  if p_participants is null or jsonb_typeof(p_participants) != 'array' then
    return;
  end if;
  for v_part in select * from jsonb_array_elements(p_participants) loop
    v_uid  := nullif(v_part->>'user_id', '')::uuid;
    v_name := coalesce(nullif(trim(v_part->>'nom_scene'), ''), '(anonyme)');
    insert into public.impro_participants (event_id, user_id, nom_scene_text)
    values (p_event_id, v_uid, v_name);
  end loop;
end;
$$;

revoke all on function public.add_impro_participants(uuid, jsonb) from public;
grant  execute on function public.add_impro_participants(uuid, jsonb) to authenticated;

-- 4.4 SEARCH-USERS RPC — powers the team-builder autocomplete.
--     The function name is kept for backward compat ("by stage name")
--     but the query now matches case-insensitively across stage name,
--     last name, first name AND email. Result rows still expose only
--     id + nom_scene + prenom — emails / last names are NEVER returned.
--     Profiles with a NULL/empty nom_scene stay excluded because they
--     can't be added to a roster (the chip displays the stage name).
--     Authenticated-only. Returns at most 20 hits.
create or replace function public.search_users_by_stage_name(p_query text)
returns table(id uuid, nom_scene text, prenom text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text;
begin
  -- Must be authenticated. Plus a 2-char minimum so an unprivileged user
  -- can't dump the entire profile table by passing an empty string.
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  q := nullif(trim(coalesce(p_query, '')), '');
  if q is null or length(q) < 2 then
    return;
  end if;
  -- Search ONLY on stage name + first name. We deliberately drop matching
  -- on email + last name: those would let an authenticated attacker
  -- enumerate the directory by domain (e.g. @gimbalcube.com → list every
  -- employee) or surname, both of which are private signals. Stage names
  -- are public-by-design (rosters surface them) and first names are
  -- low-signal so this trade-off keeps team search workable.
  return query
    select p.id, p.nom_scene, p.prenom
    from public.profiles p
    where p.nom_scene is not null
      and p.nom_scene <> ''
      and (
           p.nom_scene ilike '%' || q || '%'
        or p.prenom    ilike '%' || q || '%'
      )
    order by p.nom_scene asc
    limit 20;
end;
$$;

revoke all on function public.search_users_by_stage_name(text) from public;
grant  execute on function public.search_users_by_stage_name(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║         PART 5 — USER SUBMISSIONS (themes / categories /          ║
-- ║                    constraints / exercises typed by users)        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- When a user types a custom value in a card (theme, category, etc.) and
-- it doesn't match anything in the existing pool, the client logs it here.
-- The admin reviews pending rows on admin.html and approves the
-- ones worth promoting to the bundled data.

-- 5.1 SUBMISSIONS TABLE
create table if not exists public.user_submissions (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          references auth.users(id) on delete set null,
  kind            text          not null check (kind in ('theme','category','constraint','exercise')),
  mode            text,                                          -- 'match' | 'troupe' | NULL
  level           text,                                          -- 'debutant' | 'confirme' | 'expert' | NULL
  locale          text          not null,                        -- 'fr' | 'en' | 'de' | 'es' | 'pt' | 'nl'
  text            text          not null,
  status          text          not null default 'pending'
                                check (status in ('pending','approved','rejected')),
  approved_by     uuid          references auth.users(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz   not null default now()
);

-- 5.1b DESCRIPTION COLUMN — added in Phase A: lets the user (and the admin)
--      attach a free-form explanation to an exercise / category submission.
--      Idempotent so existing submissions get the column without erroring.
alter table public.user_submissions
  add column if not exists description text;

create index if not exists user_submissions_status_idx  on public.user_submissions (status);
create index if not exists user_submissions_kind_idx    on public.user_submissions (kind);
create index if not exists user_submissions_user_idx    on public.user_submissions (user_id);
create index if not exists user_submissions_created_idx on public.user_submissions (created_at desc);

-- Whitelist enums for mode/level (NULL allowed because theme has no mode
-- and category has neither mode nor level). Same NOT VALID + try-validate
-- pattern as impro_events above.
do $$
begin
  alter table public.user_submissions drop constraint if exists user_submissions_mode_chk;
  alter table public.user_submissions drop constraint if exists user_submissions_level_chk;
  alter table public.user_submissions
    add constraint user_submissions_mode_chk
      check (mode is null or mode in ('troupe','match')) not valid;
  alter table public.user_submissions
    add constraint user_submissions_level_chk
      check (level is null or level in ('debutant','confirme','expert')) not valid;
  begin
    alter table public.user_submissions validate constraint user_submissions_mode_chk;
  exception when check_violation then
    raise notice 'user_submissions_mode_chk: existing rows violate, constraint kept NOT VALID';
  end;
  begin
    alter table public.user_submissions validate constraint user_submissions_level_chk;
  exception when check_violation then
    raise notice 'user_submissions_level_chk: existing rows violate, constraint kept NOT VALID';
  end;
end$$;

-- 5.2 RLS — submitter can read their own rows; admins read everything.
alter table public.user_submissions enable row level security;

drop policy if exists "users_read_own_submissions"          on public.user_submissions;
drop policy if exists "admins_read_all_submissions"         on public.user_submissions;
drop policy if exists "authenticated_read_approved_submissions" on public.user_submissions;

create policy "users_read_own_submissions"
  on public.user_submissions for select
  using (user_id = auth.uid());

create policy "admins_read_all_submissions"
  on public.user_submissions for select
  using (public.is_admin());

-- Phase 2: any authenticated user can read submissions that have been
-- approved. The client merges them into the bundled pool at app startup so
-- approved user-submitted themes/categories/constraints/exercises start
-- showing up in random picks for everyone.
create policy "authenticated_read_approved_submissions"
  on public.user_submissions for select
  using (auth.uid() is not null and status = 'approved');

-- 5.3 SUBMIT RPC — called by the client when a user types a value that
--     doesn't already exist in the bundled pool. Caller must be authenticated.
--     Phase A: optional `p_description` for exercise/category context.
--     We drop the legacy 5-arg signature first so the new 6-arg version is
--     the only one the client can resolve to.
drop function if exists public.submit_user_text(text, text, text, text, text);
drop function if exists public.submit_user_text(text, text, text, text, text, text);

create or replace function public.submit_user_text(
  p_kind        text,
  p_mode        text,
  p_level       text,
  p_locale      text,
  p_text        text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_text text;
  v_desc text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('theme','category','constraint','exercise') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  -- Whitelist enums so a tampered client can't pollute the analytics with
  -- arbitrary mode/level strings. Empty/null are allowed (theme has no
  -- mode, category has neither mode nor level).
  if p_mode is not null and p_mode <> '' and p_mode not in ('troupe','match') then
    raise exception 'invalid mode: %', p_mode;
  end if;
  if p_level is not null and p_level <> '' and p_level not in ('debutant','confirme','expert') then
    raise exception 'invalid level: %', p_level;
  end if;
  v_text := nullif(trim(p_text), '');
  if v_text is null then
    raise exception 'text is empty';
  end if;
  -- Length caps: a malicious client could otherwise submit a 10 MB string
  -- and bloat user_submissions / the admin notification email.
  if length(v_text) > 500 then
    raise exception 'text too long (max 500 chars)';
  end if;
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is not null and length(v_desc) > 2000 then
    raise exception 'description too long (max 2000 chars)';
  end if;
  -- De-duplicate: don't insert if the same user already submitted the same
  -- (kind, mode, level, locale, lower(text)) tuple AND it's still pending.
  if exists (
    select 1 from public.user_submissions
    where user_id = auth.uid()
      and kind = p_kind
      and coalesce(mode, '')  = coalesce(p_mode, '')
      and coalesce(level, '') = coalesce(p_level, '')
      and locale = p_locale
      and lower(text) = lower(v_text)
      and status = 'pending'
  ) then
    -- Already pending: keep the row, but if the user typed a fresh
    -- description and the existing row had none, attach it now.
    update public.user_submissions
       set description = coalesce(description, v_desc)
     where user_id = auth.uid()
       and kind = p_kind
       and coalesce(mode, '')  = coalesce(p_mode, '')
       and coalesce(level, '') = coalesce(p_level, '')
       and locale = p_locale
       and lower(text) = lower(v_text)
       and status = 'pending'
       and description is null
       and v_desc is not null;
    select id into new_id from public.user_submissions
    where user_id = auth.uid()
      and kind = p_kind
      and coalesce(mode, '')  = coalesce(p_mode, '')
      and coalesce(level, '') = coalesce(p_level, '')
      and locale = p_locale
      and lower(text) = lower(v_text)
      and status = 'pending'
    limit 1;
    return new_id;
  end if;
  insert into public.user_submissions (user_id, kind, mode, level, locale, text, description)
  values (auth.uid(), p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_text, v_desc)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.submit_user_text(text, text, text, text, text, text) from public;
grant  execute on function public.submit_user_text(text, text, text, text, text, text) to authenticated;

-- 5.4 APPROVE / REJECT RPC — admin only.
create or replace function public.set_submission_status(
  p_submission_id uuid,
  p_status        text   -- 'approved' or 'rejected'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.user_submissions
     set status      = p_status,
         approved_by = auth.uid(),
         approved_at = now()
   where id = p_submission_id;
end;
$$;

revoke all on function public.set_submission_status(uuid, text) from public;
grant  execute on function public.set_submission_status(uuid, text) to authenticated;

-- 5.5 ADMIN UPDATE / DELETE RPCs — let the admin clean up bad submissions.
create or replace function public.update_user_submission(
  p_id          uuid,
  p_text        text,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
  v_desc text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_text := nullif(trim(coalesce(p_text, '')), '');
  if v_text is null then
    raise exception 'text is empty';
  end if;
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  update public.user_submissions
     set text        = v_text,
         description = v_desc
   where id = p_id;
end;
$$;

revoke all on function public.update_user_submission(uuid, text, text) from public;
grant  execute on function public.update_user_submission(uuid, text, text) to authenticated;

create or replace function public.delete_user_submission(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  delete from public.user_submissions where id = p_id;
end;
$$;

revoke all on function public.delete_user_submission(uuid) from public;
grant  execute on function public.delete_user_submission(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 5b — BUNDLED-DATA HIDDEN ITEMS (Phase B admin moderation)    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- The "bundled" themes / categories / constraints / exercises live in
-- static JSON files (data/*.json) that the client loads at boot. The
-- admin needs to be able to remove a specific entry per locale without
-- a redeploy — so we keep the JSON pristine and stash a per-locale
-- "hidden list" here. The client filters those items out of every pool
-- before random picking.

create table if not exists public.bundled_hidden_items (
  id          uuid          primary key default gen_random_uuid(),
  kind        text          not null check (kind in ('theme','category','constraint','exercise')),
  mode        text,                          -- 'troupe' | 'match' | NULL
  level       text,                          -- 'debutant' | 'confirme' | 'expert' | NULL
  locale      text          not null,
  text        text          not null,        -- canonical bundled name (case kept; lookup is case-insensitive)
  hidden_by   uuid          references auth.users(id) on delete set null,
  hidden_at   timestamptz   not null default now()
);

-- Composite uniqueness uses lower(text) so renaming case in the JSON
-- doesn't accidentally re-show a hidden item.
create unique index if not exists bundled_hidden_unique
  on public.bundled_hidden_items (
    kind,
    coalesce(mode,  ''),
    coalesce(level, ''),
    locale,
    lower(text)
  );

create index if not exists bundled_hidden_locale_idx on public.bundled_hidden_items (locale);
create index if not exists bundled_hidden_kind_idx   on public.bundled_hidden_items (kind);

alter table public.bundled_hidden_items enable row level security;

drop policy if exists "everyone_reads_hidden_items" on public.bundled_hidden_items;
drop policy if exists "admins_manage_hidden_items"  on public.bundled_hidden_items;

-- Any authenticated user reads hidden_items so the client can filter the
-- pool. Mutations go through the admin-only RPCs below.
create policy "everyone_reads_hidden_items"
  on public.bundled_hidden_items for select
  using (auth.uid() is not null);

create or replace function public.hide_bundled_item(
  p_kind   text,
  p_mode   text,
  p_level  text,
  p_locale text,
  p_text   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_text text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_kind not in ('theme','category','constraint','exercise') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  v_text := nullif(trim(coalesce(p_text, '')), '');
  if v_text is null then
    raise exception 'text is empty';
  end if;
  -- Idempotent: same item already hidden → return its id.
  select id into new_id
    from public.bundled_hidden_items
   where kind = p_kind
     and coalesce(mode,  '') = coalesce(p_mode,  '')
     and coalesce(level, '') = coalesce(p_level, '')
     and locale = p_locale
     and lower(text) = lower(v_text)
   limit 1;
  if new_id is not null then return new_id; end if;
  insert into public.bundled_hidden_items (kind, mode, level, locale, text, hidden_by)
  values (p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_text, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.hide_bundled_item(text, text, text, text, text) from public;
grant  execute on function public.hide_bundled_item(text, text, text, text, text) to authenticated;

create or replace function public.unhide_bundled_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  delete from public.bundled_hidden_items where id = p_id;
end;
$$;

revoke all on function public.unhide_bundled_item(uuid) from public;
grant  execute on function public.unhide_bundled_item(uuid) to authenticated;

-- 5b.4 REPLACE — admin "edits" a bundled item: hide the original, then
--      add a new approved user_submission with the override text+desc.
--      The Phase 2 client loader merges approved submissions back in, so
--      the new value shows up immediately on next page load.
create or replace function public.replace_bundled_item(
  p_kind          text,
  p_mode          text,
  p_level         text,
  p_locale        text,
  p_original_text text,
  p_new_text      text,
  p_new_desc      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig    text;
  v_new     text;
  v_desc    text;
  new_id    uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_kind not in ('theme','category','constraint','exercise') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  v_orig := nullif(trim(coalesce(p_original_text, '')), '');
  v_new  := nullif(trim(coalesce(p_new_text, '')), '');
  if v_orig is null or v_new is null then
    raise exception 'text is empty';
  end if;
  if length(v_new) > 500 then
    raise exception 'new text too long (max 500 chars)';
  end if;
  v_desc := nullif(trim(coalesce(p_new_desc, '')), '');
  if v_desc is not null and length(v_desc) > 2000 then
    raise exception 'description too long (max 2000 chars)';
  end if;

  -- 1) Hide the original (idempotent — silently no-op if already hidden).
  insert into public.bundled_hidden_items (kind, mode, level, locale, text, hidden_by)
  values (p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_orig, auth.uid())
  on conflict (kind, coalesce(mode, ''), coalesce(level, ''), locale, lower(text))
  do nothing;

  -- 2) Create an approved replacement submission (or reuse if same text already
  --    exists as approved → just refresh its description).
  if exists (
    select 1 from public.user_submissions
    where kind = p_kind
      and coalesce(mode, '')  = coalesce(p_mode, '')
      and coalesce(level, '') = coalesce(p_level, '')
      and locale = p_locale
      and lower(text) = lower(v_new)
      and status = 'approved'
  ) then
    update public.user_submissions
       set description = coalesce(v_desc, description)
     where kind = p_kind
       and coalesce(mode, '')  = coalesce(p_mode, '')
       and coalesce(level, '') = coalesce(p_level, '')
       and locale = p_locale
       and lower(text) = lower(v_new)
       and status = 'approved';
    select id into new_id from public.user_submissions
    where kind = p_kind
      and coalesce(mode, '')  = coalesce(p_mode, '')
      and coalesce(level, '') = coalesce(p_level, '')
      and locale = p_locale
      and lower(text) = lower(v_new)
      and status = 'approved'
    limit 1;
    return new_id;
  end if;

  insert into public.user_submissions (
    user_id, kind, mode, level, locale, text, description,
    status, approved_by, approved_at
  )
  values (
    auth.uid(), p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_new, v_desc,
    'approved', auth.uid(), now()
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.replace_bundled_item(text, text, text, text, text, text, text) from public;
grant  execute on function public.replace_bundled_item(text, text, text, text, text, text, text) to authenticated;

-- 5b.5 DELETE — strong removal: hide the bundled entry AND nuke the
--      corresponding user_submissions row(s) if any. Effectively the
--      item is gone for good (the JSON original is still hidden).
create or replace function public.delete_bundled_item(
  p_kind   text,
  p_mode   text,
  p_level  text,
  p_locale text,
  p_text   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_kind not in ('theme','category','constraint','exercise') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  v_text := nullif(trim(coalesce(p_text, '')), '');
  if v_text is null then
    raise exception 'text is empty';
  end if;

  -- 1) Hide the bundled JSON original (no-op if not present).
  insert into public.bundled_hidden_items (kind, mode, level, locale, text, hidden_by)
  values (p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_text, auth.uid())
  on conflict (kind, coalesce(mode, ''), coalesce(level, ''), locale, lower(text))
  do nothing;

  -- 2) Delete any matching user_submission (approved/pending/rejected).
  delete from public.user_submissions
   where kind = p_kind
     and coalesce(mode, '')  = coalesce(p_mode, '')
     and coalesce(level, '') = coalesce(p_level, '')
     and locale = p_locale
     and lower(text) = lower(v_text);
end;
$$;

revoke all on function public.delete_bundled_item(text, text, text, text, text) from public;
grant  execute on function public.delete_bundled_item(text, text, text, text, text) to authenticated;

-- 5b.6 ADD — admin-only direct insert of a new bundled-pool entry. Modelled
--      on the second half of replace_bundled_item: insert (or refresh) an
--      already-approved user_submission so the item shows up in the pool
--      on the next page load. Returns the submission id.
create or replace function public.add_bundled_item(
  p_kind        text,
  p_mode        text,
  p_level       text,
  p_locale      text,
  p_text        text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
  v_desc text;
  new_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_kind not in ('theme','category','constraint','exercise') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  v_text := nullif(trim(coalesce(p_text, '')), '');
  if v_text is null then
    raise exception 'text is empty';
  end if;
  if length(v_text) > 500 then
    raise exception 'text too long (max 500 chars)';
  end if;
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is not null and length(v_desc) > 2000 then
    raise exception 'description too long (max 2000 chars)';
  end if;

  -- If an approved submission with the same (kind, mode, level, locale,
  -- lower(text)) already exists → just update its description and return.
  if exists (
    select 1 from public.user_submissions
    where kind = p_kind
      and coalesce(mode, '')  = coalesce(p_mode, '')
      and coalesce(level, '') = coalesce(p_level, '')
      and locale = p_locale
      and lower(text) = lower(v_text)
      and status = 'approved'
  ) then
    update public.user_submissions
       set description = coalesce(v_desc, description)
     where kind = p_kind
       and coalesce(mode, '')  = coalesce(p_mode, '')
       and coalesce(level, '') = coalesce(p_level, '')
       and locale = p_locale
       and lower(text) = lower(v_text)
       and status = 'approved';
    select id into new_id from public.user_submissions
    where kind = p_kind
      and coalesce(mode, '')  = coalesce(p_mode, '')
      and coalesce(level, '') = coalesce(p_level, '')
      and locale = p_locale
      and lower(text) = lower(v_text)
      and status = 'approved'
    limit 1;
    -- Also unhide any lingering hide row so the admin sees the item live.
    delete from public.bundled_hidden_items
     where kind = p_kind
       and coalesce(mode, '')  = coalesce(p_mode, '')
       and coalesce(level, '') = coalesce(p_level, '')
       and locale = p_locale
       and lower(text) = lower(v_text);
    return new_id;
  end if;

  -- Fresh insert as approved (admin auto-approves their own additions).
  insert into public.user_submissions (
    user_id, kind, mode, level, locale, text, description,
    status, approved_by, approved_at
  )
  values (
    auth.uid(), p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_text, v_desc,
    'approved', auth.uid(), now()
  )
  returning id into new_id;

  -- Defensive: drop any matching hide row (admin re-adding something
  -- they previously hid should bring it back).
  delete from public.bundled_hidden_items
   where kind = p_kind
     and coalesce(mode, '')  = coalesce(p_mode, '')
     and coalesce(level, '') = coalesce(p_level, '')
     and locale = p_locale
     and lower(text) = lower(v_text);

  return new_id;
end;
$$;

revoke all on function public.add_bundled_item(text, text, text, text, text, text) from public;
grant  execute on function public.add_bundled_item(text, text, text, text, text, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 5c — SAVED TEAMS (sharable rosters)                          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A user can save a roster (team name + actor list) so other users can
-- load it into their own Match A / B / Troupe slot. Public read is the
-- whole point — that's the warning the client surfaces before saving.
-- Writes are restricted to the owner so nobody can clobber other users'
-- teams.

create table if not exists public.saved_teams (
  id          uuid          primary key default gen_random_uuid(),
  owner_id    uuid          not null references auth.users(id) on delete cascade,
  name        text          not null,
  -- Members shape: [{ user_id?: uuid, nom_scene: text }, …]
  -- (user_id is optional — ad-hoc guests have only nom_scene.)
  members     jsonb         not null default '[]'::jsonb,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

-- Owner + name is unique per user — keeps "save twice with same name"
-- from creating duplicates. Other owners CAN reuse the same team name,
-- which is fine since the UI lists "<name> (<owner email>)".
create unique index if not exists saved_teams_owner_name_unique
  on public.saved_teams (owner_id, lower(name));

create index if not exists saved_teams_owner_idx on public.saved_teams (owner_id);
create index if not exists saved_teams_updated_idx on public.saved_teams (updated_at desc);

alter table public.saved_teams enable row level security;

drop policy if exists "everyone_reads_saved_teams" on public.saved_teams;
drop policy if exists "owner_inserts_saved_teams"  on public.saved_teams;
drop policy if exists "owner_updates_saved_teams"  on public.saved_teams;
drop policy if exists "owner_deletes_saved_teams"  on public.saved_teams;

-- READ: any authenticated user can read every saved team — that's how
-- one team's roster ends up reusable by other users.
create policy "everyone_reads_saved_teams"
  on public.saved_teams for select
  using (auth.uid() is not null);

-- WRITE: only the owner can mutate their own rows.
create policy "owner_inserts_saved_teams"
  on public.saved_teams for insert
  with check (auth.uid() = owner_id);

create policy "owner_updates_saved_teams"
  on public.saved_teams for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner_deletes_saved_teams"
  on public.saved_teams for delete
  using (auth.uid() = owner_id);

-- Trigger to bump updated_at on row updates. Reuses set_updated_at()
-- from PART 1 (already defined for the profiles table).
drop trigger if exists saved_teams_set_updated_at on public.saved_teams;
create trigger saved_teams_set_updated_at
  before update on public.saved_teams
  for each row execute function public.set_updated_at();


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 6 — EMAIL NOTIFICATIONS ON NEW SUBMISSIONS (Phase 3)         ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- When a row is inserted into user_submissions (status='pending'), fire
-- a non-blocking HTTP POST to Resend so the admin gets an email with a
-- link to the admin dashboard.
--
-- One-time manual setup (after running this script):
--   1. Enable the pg_net extension (it's available in Supabase by default
--      but must be enabled in the Database → Extensions page).
--   2. Insert your Resend API key + addresses into app_secrets:
--      insert into public.app_secrets (key, value) values
--        ('resend_api_key', 're_xxxxxxxxxxxxxxxxxxx'),
--        ('admin_email',    'lucneoseb@gmail.com'),
--        ('from_email',     'Acto <noreply@acto.yourdomain>'),
--        ('admin_url',      'https://acto-theimprostudio.com/admin.html#impro')
--      on conflict (key) do update set value = excluded.value;
--   The `from_email` domain MUST be verified on Resend.
--   If app_secrets is missing any of these, the trigger silently no-ops.

-- 6.1 SECRETS TABLE — admin-only via RLS. The trigger reads it via
--     security definer (so it bypasses RLS) but we still gate writes.
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;

drop policy if exists "admins_read_app_secrets"   on public.app_secrets;
drop policy if exists "admins_write_app_secrets"  on public.app_secrets;
drop policy if exists "admins_update_app_secrets" on public.app_secrets;
drop policy if exists "admins_delete_app_secrets" on public.app_secrets;

create policy "admins_read_app_secrets"
  on public.app_secrets for select
  using (public.is_admin());

create policy "admins_write_app_secrets"
  on public.app_secrets for insert
  with check (public.is_admin());

create policy "admins_update_app_secrets"
  on public.app_secrets for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins_delete_app_secrets"
  on public.app_secrets for delete
  using (public.is_admin());

-- 6.2 EMAIL TRIGGER FUNCTION
-- Fires after each insert into user_submissions. Reads the four secrets,
-- builds an HTML email referencing the new submission, and POSTs it to
-- Resend. The pg_net call is fire-and-forget (returns a bigint request id
-- but we don't await it — the trigger completes immediately).
-- Tiny helper used by the email trigger below. Escapes the four characters
-- that have meaning in HTML element content. We deliberately don't try to
-- escape attribute-context characters here — the trigger inserts these
-- values only inside element bodies (<td>, <blockquote>, …), never inside
-- attributes.
create or replace function public.html_escape(s text)
returns text
language sql
immutable
as $$
  select replace(
           replace(
             replace(
               replace(coalesce(s, ''), '&', '&amp;'),
               '<', '&lt;'),
             '>', '&gt;'),
           '"', '&quot;')
$$;

create or replace function public.notify_admin_on_new_submission()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_api_key   text;
  v_admin     text;
  v_from      text;
  v_admin_url text;
  v_subject   text;
  v_kind_lbl  text;
  v_user_email text;
  v_html      text;
  v_payload   jsonb;
begin
  -- Only notify on freshly-inserted, pending rows. (set_submission_status
  -- updates rows after admin review — we don't want to spam on those.)
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;

  select value into v_api_key   from public.app_secrets where key = 'resend_api_key';
  select value into v_admin     from public.app_secrets where key = 'admin_email';
  select value into v_from      from public.app_secrets where key = 'from_email';
  select value into v_admin_url from public.app_secrets where key = 'admin_url';

  -- Missing config → silently no-op so the insert isn't blocked.
  if v_api_key is null or v_admin is null or v_from is null then
    return NEW;
  end if;
  if v_admin_url is null then
    v_admin_url := 'https://acto-theimprostudio.com/admin.html#impro';
  end if;

  v_kind_lbl := case NEW.kind
    when 'theme'      then 'thème'
    when 'category'   then 'catégorie'
    when 'constraint' then 'contrainte'
    when 'exercise'   then 'exercice'
    else NEW.kind
  end;

  -- Best-effort: include the submitter's email (won't fail if profile missing).
  begin
    select email into v_user_email
      from public.profiles
     where id = NEW.user_id;
  exception when others then
    v_user_email := null;
  end;

  v_subject := '[Acto] Nouvelle soumission — ' || v_kind_lbl;

  -- Every user-controlled value is run through public.html_escape so a
  -- malicious submitter can't inject markup into the admin's inbox.
  -- v_kind_lbl is hard-coded above so it's safe; v_admin_url is from
  -- app_secrets (admin-controlled) so it goes in unescaped — but we still
  -- pass it through html_escape defensively in case the admin pastes a
  -- URL with quotes.
  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a0f2b;background:#f5f0ea;padding:24px;">' ||
      '<h2 style="color:#b91c4d;margin:0 0 12px;">Nouvelle soumission utilisateur</h2>' ||
      '<p>Un utilisateur a proposé un nouveau <strong>' || v_kind_lbl || '</strong> :</p>' ||
      '<blockquote style="background:#fff;border-left:4px solid #f5c451;padding:12px 16px;margin:16px 0;font-size:1.1rem;">' ||
        public.html_escape(NEW.text) ||
      '</blockquote>' ||
      '<table style="border-collapse:collapse;font-size:0.9rem;">' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>'      || public.html_escape(coalesce(NEW.kind, ''))         || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Mode</td><td>'      || public.html_escape(coalesce(NEW.mode, '—'))        || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Niveau</td><td>'    || public.html_escape(coalesce(NEW.level, '—'))       || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Langue</td><td>'    || public.html_escape(coalesce(NEW.locale, '—'))      || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Soumis par</td><td>'|| public.html_escape(coalesce(v_user_email, NEW.user_id::text, '—')) || '</td></tr>' ||
      '</table>' ||
      '<p style="margin-top:24px;">' ||
        '<a href="' || public.html_escape(v_admin_url) || '" style="background:#f5c451;color:#1a0f2b;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">' ||
          '→ Examiner sur le tableau d''admin' ||
        '</a>' ||
      '</p>' ||
      '<p style="color:#999;font-size:0.8rem;margin-top:32px;">Acto · The Impro Studio</p>' ||
    '</div>';

  v_payload := jsonb_build_object(
    'from',    v_from,
    'to',      jsonb_build_array(v_admin),
    'subject', v_subject,
    'html',    v_html
  );

  -- Fire-and-forget HTTP POST to Resend. pg_net runs this asynchronously
  -- so the user's INSERT completes immediately even if Resend is slow.
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := v_payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 5000
  );

  return NEW;
exception when others then
  -- Never let a notification failure block the insert.
  raise warning 'notify_admin_on_new_submission failed: %', SQLERRM;
  return NEW;
end;
$$;

-- 6.3 TRIGGER WIRING
drop trigger if exists trg_notify_admin_on_new_submission on public.user_submissions;
create trigger trg_notify_admin_on_new_submission
  after insert on public.user_submissions
  for each row
  execute function public.notify_admin_on_new_submission();


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 7 — INSPIRATION VIDEOS (community-submitted impro links)     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A curated catalogue of inspirational impro videos (matches, longue form,
-- tutorials, channels) that visitors can browse to discover the art form.
-- Anyone can read approved entries (anon allowed — this is the public
-- show-and-tell), authenticated users can submit new ones (pending), and
-- admins moderate via the same approve/reject flow as user_submissions.

create table if not exists public.inspiration_videos (
  id            uuid          primary key default gen_random_uuid(),
  title         text          not null,
  channel       text,                                                  -- "Chaîne / Troupe" column from the seed sheet
  content_type  text          not null,                                -- chaine|match_impro|spectacle|tutoriel|documentaire|cabaret|format_court
  nature        text,                                                  -- mixte|comparee|na (match d'impro only)
  category      text,                                                  -- libre|a_la_maniere_de|chantee|rimee|sans_paroles|costumee|doublee|silencieuse|sportive|sans_contact|a_2|a_3
  theme         text,
  duration_text text,                                                  -- "7 min" — free-form, matches the seed sheet
  notes         text,
  video_url     text,                                                  -- YouTube / Vimeo / etc. NULL if the entry is a channel ref
  locale        text          not null default 'fr',
  submitted_by  uuid          references auth.users(id) on delete set null,
  status        text          not null default 'pending'
                              check (status in ('pending','approved','rejected')),
  approved_by   uuid          references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz   not null default now()
);

-- Whitelist enums (NOT VALID for legacy-safety, then try-validate).
do $$
begin
  alter table public.inspiration_videos drop constraint if exists inspiration_videos_content_type_chk;
  alter table public.inspiration_videos drop constraint if exists inspiration_videos_nature_chk;
  alter table public.inspiration_videos drop constraint if exists inspiration_videos_category_chk;
  alter table public.inspiration_videos
    add constraint inspiration_videos_content_type_chk
      check (content_type in (
        'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
      )) not valid;
  alter table public.inspiration_videos
    add constraint inspiration_videos_nature_chk
      check (nature is null or nature in ('mixte','comparee','na')) not valid;
  alter table public.inspiration_videos
    add constraint inspiration_videos_category_chk
      check (category is null or category in (
        'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
        'doublee','silencieuse','sportive','sans_contact','a_2','a_3','trois_mots','abc','carte_blanche','contee','freeze','un_mot_a_la_fois','carre_hollandais'
      )) not valid;
  begin alter table public.inspiration_videos validate constraint inspiration_videos_content_type_chk;
  exception when check_violation then raise notice 'inspiration_videos_content_type_chk kept NOT VALID'; end;
  begin alter table public.inspiration_videos validate constraint inspiration_videos_nature_chk;
  exception when check_violation then raise notice 'inspiration_videos_nature_chk kept NOT VALID'; end;
  begin alter table public.inspiration_videos validate constraint inspiration_videos_category_chk;
  exception when check_violation then raise notice 'inspiration_videos_category_chk kept NOT VALID'; end;
end$$;

create index if not exists inspiration_videos_status_idx       on public.inspiration_videos (status);
create index if not exists inspiration_videos_content_type_idx on public.inspiration_videos (content_type);
create index if not exists inspiration_videos_locale_idx       on public.inspiration_videos (locale);
create index if not exists inspiration_videos_created_idx      on public.inspiration_videos (created_at desc);

-- 7.2 RLS — public can read approved, owner can read their own pending,
--     admins read everything; writes via the RPCs only.
alter table public.inspiration_videos enable row level security;

drop policy if exists "anon_read_approved_inspirations"     on public.inspiration_videos;
drop policy if exists "owner_read_own_inspirations"         on public.inspiration_videos;
drop policy if exists "admins_read_all_inspirations"        on public.inspiration_videos;

-- ANYONE (incl. unauthenticated) can read approved entries — this is the
-- public catalogue. The page is consumable without an account.
create policy "anon_read_approved_inspirations"
  on public.inspiration_videos for select
  to anon, authenticated
  using (status = 'approved');

create policy "owner_read_own_inspirations"
  on public.inspiration_videos for select
  using (submitted_by = auth.uid());

create policy "admins_read_all_inspirations"
  on public.inspiration_videos for select
  using (public.is_admin());

-- 7.3 SUBMIT RPC — authenticated only. Inserts a pending row. The trigger
--     below pings the admin via Resend (if configured).
create or replace function public.submit_inspiration_video(
  p_title         text,
  p_channel       text,
  p_content_type  text,
  p_nature        text,
  p_category      text,
  p_theme         text,
  p_duration_text text,
  p_notes         text,
  p_video_url     text,
  p_locale        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  new_id  uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title is empty';
  end if;
  if length(v_title) > 200 then
    raise exception 'title too long (max 200 chars)';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'notes too long (max 2000 chars)';
  end if;
  if p_content_type not in (
    'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
  ) then
    raise exception 'invalid content_type: %', p_content_type;
  end if;
  if p_nature is not null and p_nature <> '' and p_nature not in ('mixte','comparee','na') then
    raise exception 'invalid nature: %', p_nature;
  end if;
  if p_category is not null and p_category <> '' and p_category not in (
    'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
    'doublee','silencieuse','sportive','sans_contact','a_2','a_3','trois_mots','abc','carte_blanche','contee','freeze','un_mot_a_la_fois','carre_hollandais'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;

  insert into public.inspiration_videos (
    title, channel, content_type, nature, category, theme,
    duration_text, notes, video_url, locale, submitted_by, status
  ) values (
    v_title,
    nullif(trim(coalesce(p_channel, '')), ''),
    p_content_type,
    nullif(p_nature, ''),
    nullif(p_category, ''),
    nullif(trim(coalesce(p_theme, '')), ''),
    nullif(trim(coalesce(p_duration_text, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''),
    coalesce(nullif(p_locale, ''), 'fr'),
    auth.uid(),
    'pending'
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.submit_inspiration_video(text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.submit_inspiration_video(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 7.4 SET STATUS — admin only (approve / reject).
create or replace function public.set_inspiration_video_status(
  p_id     uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.inspiration_videos
     set status      = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then now()      else approved_at end
   where id = p_id;
end;
$$;

revoke all on function public.set_inspiration_video_status(uuid, text) from public;
grant  execute on function public.set_inspiration_video_status(uuid, text) to authenticated;

-- 7.5 EDIT — admin only. Lets the admin tidy up titles / channels /
--     metadata before approving, or fix typos on already-approved rows.
create or replace function public.update_inspiration_video(
  p_id            uuid,
  p_title         text,
  p_channel       text,
  p_content_type  text,
  p_nature        text,
  p_category      text,
  p_theme         text,
  p_duration_text text,
  p_notes         text,
  p_video_url     text,
  p_locale        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title is empty';
  end if;
  if p_content_type not in (
    'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
  ) then
    raise exception 'invalid content_type: %', p_content_type;
  end if;
  if p_nature is not null and p_nature <> '' and p_nature not in ('mixte','comparee','na') then
    raise exception 'invalid nature: %', p_nature;
  end if;
  if p_category is not null and p_category <> '' and p_category not in (
    'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
    'doublee','silencieuse','sportive','sans_contact','a_2','a_3','trois_mots','abc','carte_blanche','contee','freeze','un_mot_a_la_fois','carre_hollandais'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;
  update public.inspiration_videos
     set title         = v_title,
         channel       = nullif(trim(coalesce(p_channel, '')), ''),
         content_type  = p_content_type,
         nature        = nullif(p_nature, ''),
         category      = nullif(p_category, ''),
         theme         = nullif(trim(coalesce(p_theme, '')), ''),
         duration_text = nullif(trim(coalesce(p_duration_text, '')), ''),
         notes         = nullif(trim(coalesce(p_notes, '')), ''),
         video_url     = nullif(trim(coalesce(p_video_url, '')), ''),
         locale        = coalesce(nullif(p_locale, ''), locale)
   where id = p_id;
end;
$$;

revoke all on function public.update_inspiration_video(uuid, text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.update_inspiration_video(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 7.5b ADMIN ADD — admin-only direct insert with status='approved'. Lets
--      curators add vetted videos straight to the public list without
--      the pending queue intermediate step. Mirror of submit_inspiration_video
--      but with admin gate + auto-approval.
create or replace function public.admin_add_inspiration_video(
  p_title         text,
  p_channel       text,
  p_content_type  text,
  p_nature        text,
  p_category      text,
  p_theme         text,
  p_duration_text text,
  p_notes         text,
  p_video_url     text,
  p_locale        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  new_id  uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title is empty';
  end if;
  if length(v_title) > 200 then
    raise exception 'title too long (max 200 chars)';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'notes too long (max 2000 chars)';
  end if;
  if p_content_type not in (
    'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
  ) then
    raise exception 'invalid content_type: %', p_content_type;
  end if;
  if p_nature is not null and p_nature <> '' and p_nature not in ('mixte','comparee','na') then
    raise exception 'invalid nature: %', p_nature;
  end if;
  if p_category is not null and p_category <> '' and p_category not in (
    'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
    'doublee','silencieuse','sportive','sans_contact','a_2','a_3','trois_mots','abc','carte_blanche','contee','freeze','un_mot_a_la_fois','carre_hollandais'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;

  insert into public.inspiration_videos (
    title, channel, content_type, nature, category, theme,
    duration_text, notes, video_url, locale,
    submitted_by, status, approved_by, approved_at
  ) values (
    v_title,
    nullif(trim(coalesce(p_channel, '')), ''),
    p_content_type,
    nullif(p_nature, ''),
    nullif(p_category, ''),
    nullif(trim(coalesce(p_theme, '')), ''),
    nullif(trim(coalesce(p_duration_text, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''),
    coalesce(nullif(p_locale, ''), 'fr'),
    auth.uid(),
    'approved',
    auth.uid(),
    now()
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.admin_add_inspiration_video(text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.admin_add_inspiration_video(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 7.6 DELETE — admin only.
create or replace function public.delete_inspiration_video(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  delete from public.inspiration_videos where id = p_id;
end;
$$;

revoke all on function public.delete_inspiration_video(uuid) from public;
grant  execute on function public.delete_inspiration_video(uuid) to authenticated;

-- 7.7 EMAIL TRIGGER — same Resend pattern as user_submissions. Silently
--     no-ops if app_secrets isn't configured (pg_net + Resend optional).
create or replace function public.notify_admin_on_new_inspiration()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_api_key   text;
  v_admin     text;
  v_from      text;
  v_admin_url text;
  v_subject   text;
  v_user_email text;
  v_html      text;
  v_payload   jsonb;
begin
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;
  select value into v_api_key   from public.app_secrets where key = 'resend_api_key';
  select value into v_admin     from public.app_secrets where key = 'admin_email';
  select value into v_from      from public.app_secrets where key = 'from_email';
  select value into v_admin_url from public.app_secrets where key = 'admin_url';
  if v_api_key is null or v_admin is null or v_from is null then return NEW; end if;
  if v_admin_url is null then
    v_admin_url := 'https://acto-theimprostudio.com/admin.html#inspirations';
  else
    -- Swap the hash to land on the inspirations tab specifically.
    v_admin_url := regexp_replace(v_admin_url, '#[a-z]+$', '') || '#inspirations';
  end if;
  begin
    select email into v_user_email from public.profiles where id = NEW.submitted_by;
  exception when others then v_user_email := null; end;

  v_subject := '[Acto] Nouvelle inspiration soumise — ' || coalesce(NEW.title, '(sans titre)');
  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a0f2b;background:#f5f0ea;padding:24px;">' ||
      '<h2 style="color:#b91c4d;margin:0 0 12px;">Nouvelle inspiration vidéo proposée</h2>' ||
      '<blockquote style="background:#fff;border-left:4px solid #f5c451;padding:12px 16px;margin:16px 0;font-size:1.1rem;">' ||
        public.html_escape(NEW.title) ||
      '</blockquote>' ||
      '<table style="border-collapse:collapse;font-size:0.9rem;">' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Chaîne / Troupe</td><td>' || public.html_escape(coalesce(NEW.channel, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>'             || public.html_escape(coalesce(NEW.content_type, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Nature</td><td>'           || public.html_escape(coalesce(NEW.nature, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Catégorie</td><td>'        || public.html_escape(coalesce(NEW.category, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Thème</td><td>'            || public.html_escape(coalesce(NEW.theme, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Durée</td><td>'            || public.html_escape(coalesce(NEW.duration_text, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">URL</td><td>'              || public.html_escape(coalesce(NEW.video_url, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Soumis par</td><td>'       || public.html_escape(coalesce(v_user_email, NEW.submitted_by::text, '—')) || '</td></tr>' ||
      '</table>' ||
      '<p style="margin-top:24px;">' ||
        '<a href="' || public.html_escape(v_admin_url) || '" style="background:#f5c451;color:#1a0f2b;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">' ||
          '→ Examiner sur le tableau d''admin' ||
        '</a>' ||
      '</p>' ||
      '<p style="color:#999;font-size:0.8rem;margin-top:32px;">Acto · The Impro Studio</p>' ||
    '</div>';

  v_payload := jsonb_build_object(
    'from', v_from, 'to', jsonb_build_array(v_admin),
    'subject', v_subject, 'html', v_html
  );
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := v_payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type',  'application/json'
    )
  );
  return NEW;
exception when others then
  raise warning 'notify_admin_on_new_inspiration failed: %', SQLERRM;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_admin_on_new_inspiration on public.inspiration_videos;
create trigger trg_notify_admin_on_new_inspiration
  after insert on public.inspiration_videos
  for each row
  execute function public.notify_admin_on_new_inspiration();


-- =====================================================================
-- DONE.
--
-- Verification checklist (Supabase dashboard):
--   • Database → Tables → "profiles", "impro_events", "impro_participants",
--     "user_submissions", "app_secrets", "bundled_hidden_items",
--     "saved_teams" all exist with the 🔒 RLS enabled badge.
--   • Database → Functions → all sixteen present:
--       delete_my_account, bump_stats, is_admin,
--       log_impro_event, update_impro_event,
--       add_impro_participants, search_users_by_stage_name,
--       submit_user_text, set_submission_status,
--       update_user_submission, delete_user_submission,
--       hide_bundled_item, unhide_bundled_item,
--       replace_bundled_item, delete_bundled_item,
--       notify_admin_on_new_submission
--   • Database → Extensions → pg_net is ENABLED (required by Phase 3).
--
-- Don't forget to:
--   1. Enable email confirmation:
--      Authentication → Providers → Email → "Confirm email" ON
--   2. Set redirect URL:
--      Authentication → URL Configuration →
--      Site URL: https://acto-theimprostudio.com
--      Redirect URLs:
--        https://acto-theimprostudio.com/**
--        https://www.acto-theimprostudio.com/**
--        (optionally) https://acto-theimprostudio.lucneoseb.workers.dev/**
--   3. Promote yourself to admin (after first signup):
--      update public.profiles set is_admin = true
--      where email = 'lucneoseb@gmail.com';
--   4. Wire Phase 3 notifications (optional — silently skipped if missing):
--      • Sign up at https://resend.com, verify a sender domain.
--      • Create an API key (Resend → API Keys).
--      • Run, as admin, in SQL editor:
--          insert into public.app_secrets (key, value) values
--            ('resend_api_key', 're_xxxxxxxxxxxxxxxxxxx'),
--            ('admin_email',    'lucneoseb@gmail.com'),
--            ('from_email',     'Acto <noreply@your-verified-domain>'),
--            ('admin_url',      'https://acto-theimprostudio.com/admin.html#impro')
--          on conflict (key) do update set value = excluded.value;
-- =====================================================================


-- =====================================================================
--  COLLABORATIVE MATCH EDITING (#80) — folded in from migrate-shared-matches.sql
--  Idempotent; also shipped as a standalone migration of the same name.
-- =====================================================================
create table if not exists public.shared_matches (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users(id) on delete set null,
  title       text not null default '',
  data        jsonb not null,                                   -- full session object
  share_token text not null default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.shared_matches enable row level security;

-- Owners may list their own shared matches directly (for a "my shared" view).
-- Everyone else goes through the SECURITY DEFINER RPCs (token-checked) below.
drop policy if exists shared_matches_owner_select on public.shared_matches;
create policy shared_matches_owner_select on public.shared_matches
  for select using (auth.uid() = owner);

drop policy if exists shared_matches_owner_delete on public.shared_matches;
create policy shared_matches_owner_delete on public.shared_matches
  for delete using (auth.uid() = owner);

-- ---- create: push a local match to the server, get back id + token ----------
create or replace function public.shared_match_create(p_title text, p_data jsonb)
returns table(id uuid, share_token text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tok text;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into public.shared_matches(owner, title, data, updated_by)
    values (auth.uid(), coalesce(p_title, ''), p_data, auth.uid())
    returning shared_matches.id, shared_matches.share_token into v_id, v_tok;
  return query select v_id, v_tok;
end $$;

-- ---- get: fetch by id + token (the capability) ------------------------------
create or replace function public.shared_match_get(p_id uuid, p_token text)
returns table(id uuid, title text, data jsonb, updated_at timestamptz, is_owner boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  -- Return a boolean "is this mine?" rather than leaking the owner's auth UUID.
  return query
    select m.id, m.title, m.data, m.updated_at, (m.owner = auth.uid()) as is_owner
    from public.shared_matches m
    where m.id = p_id and m.share_token = p_token;
end $$;

-- ---- save: last-write-wins update by id + token -----------------------------
--  Returns the new updated_at and the row's current updated_at BEFORE the write
--  so the client can detect (but this version simply overwrites — LWW).
create or replace function public.shared_match_save(p_id uuid, p_token text, p_title text, p_data jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_now timestamptz;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  update public.shared_matches
    set data = p_data,
        title = coalesce(p_title, title),
        updated_at = now(),
        updated_by = auth.uid()
    where id = p_id and share_token = p_token
    returning updated_at into v_now;
  if v_now is null then raise exception 'not found or bad token'; end if;
  return v_now;
end $$;

revoke all on function public.shared_match_create(text, jsonb) from public;
revoke all on function public.shared_match_get(uuid, text) from public;
revoke all on function public.shared_match_save(uuid, text, text, jsonb) from public;
grant execute on function public.shared_match_create(text, jsonb) to authenticated;
grant execute on function public.shared_match_get(uuid, text) to authenticated;
grant execute on function public.shared_match_save(uuid, text, text, jsonb) to authenticated;


-- ============================================================================
--  PUBLIC (AUDIENCE) LIVE VOTING — folded from migrate-live-votes.sql
-- ============================================================================
create extension if not exists pgcrypto;

-- ── impro votes: one row per (match code, round, device) ───────────────────
create table if not exists public.live_votes (
  code       text     not null,
  round      int      not null,                 -- the impro index (snapshot segIndex)
  voter      text     not null,                 -- anonymous per-device key
  choice     smallint not null check (choice in (0, 1)),  -- 0 = team A, 1 = team B
  created_at timestamptz not null default now(),
  primary key (code, round, voter)
);
alter table public.live_votes enable row level security;   -- access only via the RPCs below

create or replace function public.cast_live_vote(p_code text, p_round int, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_code is null or p_voter is null or p_choice not in (0, 1) then return; end if;
  if length(coalesce(p_voter, '')) > 80 or length(coalesce(p_code, '')) > 40 then return; end if;
  insert into public.live_votes(code, round, voter, choice)
    values (upper(p_code), p_round, p_voter, p_choice::smallint)
  on conflict (code, round, voter) do update set choice = excluded.choice, created_at = now();
end $$;
revoke all on function public.cast_live_vote(text, int, text, int) from public;
grant execute on function public.cast_live_vote(text, int, text, int) to anon, authenticated;

create or replace function public.get_live_vote_tally(p_code text, p_round int)
returns table(a bigint, b bigint)
language sql security definer set search_path = public stable as $$
  select count(*) filter (where choice = 0) as a,
         count(*) filter (where choice = 1) as b
  from public.live_votes where code = upper(p_code) and round = p_round;
$$;
revoke all on function public.get_live_vote_tally(text, int) from public;
grant execute on function public.get_live_vote_tally(text, int) to anon, authenticated;

-- ── star votes: one favourite jouteur per device, for the whole match ──────
create table if not exists public.live_star_votes (
  code       text not null,
  voter      text not null,
  player     text not null,                     -- player key (roster name)
  created_at timestamptz not null default now(),
  primary key (code, voter)
);
alter table public.live_star_votes enable row level security;

create or replace function public.cast_star_vote(p_code text, p_voter text, p_player text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_code is null or p_voter is null or coalesce(trim(p_player), '') = '' then return; end if;
  if length(p_voter) > 80 or length(p_code) > 40 or length(p_player) > 160 then return; end if;
  insert into public.live_star_votes(code, voter, player)
    values (upper(p_code), p_voter, trim(p_player))
  on conflict (code, voter) do update set player = excluded.player, created_at = now();
end $$;
revoke all on function public.cast_star_vote(text, text, text) from public;
grant execute on function public.cast_star_vote(text, text, text) to anon, authenticated;

create or replace function public.get_star_tally(p_code text)
returns table(player text, votes bigint)
language sql security definer set search_path = public stable as $$
  select player, count(*) as votes
  from public.live_star_votes where code = upper(p_code)
  group by player order by votes desc, player asc;
$$;
revoke all on function public.get_star_tally(text) from public;
grant execute on function public.get_star_tally(text) to anon, authenticated;


-- ============================================================================
--  DÉFIS À RELEVER (F1) — folded from migrate-challenges.sql
-- ============================================================================

-- ── challenges (NO video column: nothing is stored server-side) ─────────────
create table if not exists public.challenges (
  id                 uuid primary key default gen_random_uuid(),
  token              text unique not null default encode(gen_random_bytes(16), 'hex'),
  sender_id          uuid not null references auth.users(id) on delete cascade,
  recipient_user_id  uuid references auth.users(id) on delete set null,  -- set if aimed at a known user
  recipient_label    text,                                               -- free label (nom de scène / prénom) shown to the sender
  epreuve_snapshot   jsonb not null,                                     -- {kind,title,subtitle,theme,category,durationSec,players,level,…}
  message            text,
  status             text not null default 'sent'
                     check (status in ('sent','opened','done')),         -- 'done' = réalisé + partagé par le destinataire
  created_at         timestamptz not null default now(),
  opened_at          timestamptz,
  done_at            timestamptz
);
create index if not exists challenges_sender_idx    on public.challenges(sender_id);
create index if not exists challenges_recipient_idx on public.challenges(recipient_user_id);

alter table public.challenges enable row level security;

-- Sender fully manages their own; a targeted (logged-in) recipient can read theirs.
drop policy if exists challenges_sender_all on public.challenges;
create policy challenges_sender_all on public.challenges
  for all using (sender_id = auth.uid()) with check (sender_id = auth.uid());
drop policy if exists challenges_recipient_read on public.challenges;
create policy challenges_recipient_read on public.challenges
  for select using (recipient_user_id = auth.uid());

-- ── create (authenticated sender) → returns the token ──────────────────────
create or replace function public.create_challenge(
  p_snapshot jsonb,
  p_recipient_user_id uuid  default null,
  p_recipient_label   text  default null,
  p_message           text  default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'invalid snapshot';
  end if;
  -- Delivery is link-share: NEVER trust a sender-asserted recipient (it could push
  -- unsolicited rows into a stranger's "Défis reçus"). recipient_user_id stays null;
  -- the token link is the only way in. recipient_label is just the sender's own note.
  insert into public.challenges(sender_id, recipient_user_id, recipient_label, epreuve_snapshot, message)
    values (
      auth.uid(),
      null,
      nullif(btrim(coalesce(p_recipient_label, '')), ''),
      p_snapshot,
      nullif(btrim(coalesce(p_message, '')), '')
    )
    returning token into v_token;
  return v_token;
end $$;
revoke all on function public.create_challenge(jsonb, uuid, text, text) from public;
grant execute on function public.create_challenge(jsonb, uuid, text, text) to authenticated;

-- ── read by token (recipient, NO account required) ─────────────────────────
-- Returns the épreuve snapshot + the sender's DISPLAY name only. No ids, no
-- email, no last name — nom_scene (stage name) or first name, else 'Acto'.
create or replace function public.get_challenge_by_token(p_token text)
returns table(
  sender_name text,
  message     text,
  status      text,
  snapshot    jsonb,
  created_at  timestamptz
)
language sql security definer set search_path = public stable as $$
  select
    coalesce(nullif(btrim(sp.nom_scene), ''), nullif(btrim(sp.prenom), ''), 'Acto'),
    c.message, c.status, c.epreuve_snapshot, c.created_at
  from public.challenges c
  left join public.profiles sp on sp.id = c.sender_id
  where c.token = p_token;
$$;
revoke all on function public.get_challenge_by_token(text) from public;
grant execute on function public.get_challenge_by_token(text) to anon, authenticated;

-- ── status transitions (token-gated, idempotent, monotonic) ────────────────
create or replace function public.mark_challenge_opened(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.challenges
     set status = 'opened', opened_at = coalesce(opened_at, now())
   where token = p_token and status = 'sent';
end $$;
revoke all on function public.mark_challenge_opened(text) from public;
grant execute on function public.mark_challenge_opened(text) to anon, authenticated;

create or replace function public.mark_challenge_done(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.challenges
     set status = 'done', done_at = coalesce(done_at, now()),
         opened_at = coalesce(opened_at, now())
   where token = p_token and status in ('sent', 'opened');
end $$;
revoke all on function public.mark_challenge_done(text) from public;
grant execute on function public.mark_challenge_done(text) to anon, authenticated;

-- ── sender's list ("Mes défis") ────────────────────────────────────────────
create or replace function public.list_my_challenges()
returns table(
  token text, recipient_label text, title text, status text,
  created_at timestamptz, opened_at timestamptz, done_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select token, recipient_label, coalesce(epreuve_snapshot->>'title', ''), status,
         created_at, opened_at, done_at
  from public.challenges
  where sender_id = auth.uid()
  order by created_at desc;
$$;
revoke all on function public.list_my_challenges() from public;
grant execute on function public.list_my_challenges() to authenticated;

-- ── challenges aimed at me ("Défis reçus", for logged-in recipients) ───────
create or replace function public.list_received_challenges()
returns table(token text, sender_name text, title text, status text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select c.token,
         coalesce(nullif(btrim(sp.nom_scene), ''), nullif(btrim(sp.prenom), ''), 'Acto'),
         coalesce(c.epreuve_snapshot->>'title', ''), c.status, c.created_at
  from public.challenges c
  left join public.profiles sp on sp.id = c.sender_id
  where c.recipient_user_id = auth.uid()
  order by c.created_at desc;
$$;
revoke all on function public.list_received_challenges() from public;
grant execute on function public.list_received_challenges() to authenticated;


-- ============================================================================
--  COLLABORATION F2 (matchs + entraînements) — folded from migrate-collab.sql
-- ============================================================================
-- ── the shared resource (a match OR entraînement session, server-side) ──────
create table if not exists public.shared_resources (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('match', 'entrainement')),
  title         text not null default '',
  data          jsonb not null,                                    -- full Suite session object
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists shared_resources_owner_idx on public.shared_resources(owner_id);

-- ── collaborators (named accounts + roles; email invites are 'pending') ─────
create table if not exists public.resource_collaborators (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references public.shared_resources(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,  -- null while invited-by-email & unclaimed
  invited_email text,
  invited_label text,                                              -- nom de scène shown before claim
  role          text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  status        text not null default 'active' check (status in ('active', 'pending')),
  invited_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (resource_id, user_id),
  -- email is stored lower-cased (see add_collaborator), so a plain-column unique is
  -- enough — Postgres does NOT allow an expression like lower(...) in a table constraint.
  unique (resource_id, invited_email)
);
create index if not exists rc_user_idx  on public.resource_collaborators(user_id) where user_id is not null;
create index if not exists rc_email_idx on public.resource_collaborators(lower(invited_email)) where invited_email is not null;
create index if not exists rc_res_idx   on public.resource_collaborators(resource_id);

alter table public.shared_resources     enable row level security;
alter table public.resource_collaborators enable row level security;

-- ── access helpers (SECURITY DEFINER → bypass RLS internally, no recursion) ─
create or replace function public.can_access_resource(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r
                  where r.id = p_res and r.owner_id = auth.uid())
      or exists (select 1 from public.resource_collaborators c
                  where c.resource_id = p_res and c.user_id = auth.uid() and c.status = 'active');
$$;
create or replace function public.can_edit_resource(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r
                  where r.id = p_res and r.owner_id = auth.uid())
      or exists (select 1 from public.resource_collaborators c
                  where c.resource_id = p_res and c.user_id = auth.uid()
                    and c.status = 'active' and c.role in ('owner', 'editor'));
$$;
create or replace function public.is_resource_owner(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r where r.id = p_res and r.owner_id = auth.uid());
$$;
revoke all on function public.can_access_resource(uuid) from public;
revoke all on function public.can_edit_resource(uuid) from public;
revoke all on function public.is_resource_owner(uuid) from public;
grant execute on function public.can_access_resource(uuid) to authenticated;
grant execute on function public.can_edit_resource(uuid) to authenticated;
grant execute on function public.is_resource_owner(uuid) to authenticated;

-- ── RLS: read for owner + active collaborators; writes go through the RPCs ──
drop policy if exists sr_access_select on public.shared_resources;
create policy sr_access_select on public.shared_resources
  for select using (public.can_access_resource(id));
drop policy if exists sr_owner_all on public.shared_resources;
create policy sr_owner_all on public.shared_resources
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists rc_read on public.resource_collaborators;
create policy rc_read on public.resource_collaborators
  for select using (user_id = auth.uid() or public.is_resource_owner(resource_id));

-- ── create: push a local session to the server (owner) → returns id ─────────
create or replace function public.share_resource_create(p_type text, p_title text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_type not in ('match', 'entrainement') then raise exception 'bad type'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  insert into public.shared_resources(owner_id, resource_type, title, data, updated_by)
    values (auth.uid(), p_type, coalesce(p_title, ''), p_data, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

-- ── save: last-write-wins update (owner or active editor) ───────────────────
create or replace function public.save_shared_resource(p_id uuid, p_title text, p_data jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_now timestamptz;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not public.can_edit_resource(p_id) then raise exception 'not allowed'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  update public.shared_resources
     set data = p_data, title = coalesce(p_title, title), updated_at = now(), updated_by = auth.uid()
   where id = p_id
   returning updated_at into v_now;
  if v_now is null then raise exception 'not found'; end if;
  return v_now;
end $$;

-- ── get: the resource + my role (owner or active collaborator) ──────────────
create or replace function public.get_shared_resource(p_id uuid)
returns table(id uuid, resource_type text, title text, data jsonb, updated_at timestamptz, is_owner boolean, my_role text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not public.can_access_resource(p_id) then raise exception 'not allowed'; end if;
  return query
    select r.id, r.resource_type, r.title, r.data, r.updated_at,
           (r.owner_id = auth.uid()) as is_owner,
           case when r.owner_id = auth.uid() then 'owner'
                else coalesce((select c.role from public.resource_collaborators c
                                where c.resource_id = r.id and c.user_id = auth.uid() and c.status = 'active'), 'viewer')
           end as my_role
    from public.shared_resources r
    where r.id = p_id;
end $$;

-- ── "Partagés avec moi" (resources I collaborate on, not mine) ──────────────
drop function if exists public.list_shared_with_me();   -- return signature changed (added kind)
create or replace function public.list_shared_with_me()
returns table(id uuid, resource_type text, kind text, title text, updated_at timestamptz, role text, owner_name text)
language sql security definer set search_path = public stable as $$
  select r.id, r.resource_type, coalesce(r.data->>'kind', r.resource_type), r.title, r.updated_at, c.role,
         coalesce(nullif(btrim(op.nom_scene), ''), nullif(btrim(op.prenom), ''), 'Acto')
  from public.resource_collaborators c
  join public.shared_resources r on r.id = c.resource_id
  left join public.profiles op on op.id = r.owner_id
  where c.user_id = auth.uid() and c.status = 'active'
  order by r.updated_at desc;
$$;
revoke all on function public.list_shared_with_me() from public;
grant execute on function public.list_shared_with_me() to authenticated;

-- ── collaborators of a resource (owner or a collaborator can read the list) ─
create or replace function public.list_collaborators(p_res uuid)
returns table(id uuid, user_id uuid, name text, role text, status text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_access_resource(p_res) then raise exception 'not allowed'; end if;
  return query
    select c.id, c.user_id,
           coalesce(nullif(btrim(p.nom_scene), ''), nullif(btrim(p.prenom), ''), nullif(btrim(c.invited_label), ''), c.invited_email, '—'),
           c.role, c.status
    from public.resource_collaborators c
    left join public.profiles p on p.id = c.user_id
    where c.resource_id = p_res
    order by c.created_at asc;
end $$;

-- ── add a collaborator (owner only): by user_id → active, or email → pending ─
create or replace function public.add_collaborator(p_res uuid, p_user_id uuid, p_email text, p_label text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_role text := coalesce(nullif(p_role, ''), 'editor'); v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  if v_role not in ('editor', 'viewer') then v_role := 'editor'; end if;    -- can't grant 'owner' via this path
  if p_user_id is not null then
    if p_user_id = auth.uid() then raise exception 'owner is not a collaborator'; end if;
    insert into public.resource_collaborators(resource_id, user_id, invited_label, role, status, invited_by)
      values (p_res, p_user_id, nullif(btrim(coalesce(p_label, '')), ''), v_role, 'active', auth.uid())
      on conflict (resource_id, user_id) do update set role = excluded.role, status = 'active'
      returning id into v_id;
  elsif v_email is not null then
    insert into public.resource_collaborators(resource_id, invited_email, invited_label, role, status, invited_by)
      values (p_res, v_email, nullif(btrim(coalesce(p_label, '')), ''), v_role, 'pending', auth.uid())
      on conflict (resource_id, invited_email) do update set role = excluded.role
      returning id into v_id;
  else
    raise exception 'need a user or an email';
  end if;
  return v_id;
end $$;

-- ── change a collaborator role / remove (owner only) ────────────────────────
create or replace function public.set_collaborator_role(p_res uuid, p_collab uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  if coalesce(p_role, '') not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  update public.resource_collaborators set role = p_role where id = p_collab and resource_id = p_res;
end $$;
create or replace function public.remove_collaborator(p_res uuid, p_collab uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  delete from public.resource_collaborators where id = p_collab and resource_id = p_res;
end $$;

-- ── owner deletes a shared resource entirely ────────────────────────────────
create or replace function public.delete_shared_resource(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_resource_owner(p_id) then raise exception 'not owner'; end if;
  delete from public.shared_resources where id = p_id;   -- collaborators cascade
end $$;

revoke all on function public.share_resource_create(text, text, jsonb) from public;
revoke all on function public.save_shared_resource(uuid, text, jsonb) from public;
revoke all on function public.get_shared_resource(uuid) from public;
revoke all on function public.list_collaborators(uuid) from public;
revoke all on function public.add_collaborator(uuid, uuid, text, text, text) from public;
revoke all on function public.set_collaborator_role(uuid, uuid, text) from public;
revoke all on function public.remove_collaborator(uuid, uuid) from public;
revoke all on function public.delete_shared_resource(uuid) from public;
grant execute on function public.share_resource_create(text, text, jsonb) to authenticated;
grant execute on function public.save_shared_resource(uuid, text, jsonb) to authenticated;
grant execute on function public.get_shared_resource(uuid) to authenticated;
grant execute on function public.list_collaborators(uuid) to authenticated;
grant execute on function public.add_collaborator(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.set_collaborator_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_collaborator(uuid, uuid) to authenticated;
grant execute on function public.delete_shared_resource(uuid) to authenticated;

-- ── claim pending email-invites when the invited person signs up ────────────
create or replace function public.claim_pending_collaborations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Drop pending email-invites that would collide with an already-active row for
  -- this (resource, user) — else the unique(resource_id,user_id) constraint would
  -- raise and, since this runs in the signup transaction, BLOCK signup.
  delete from public.resource_collaborators c
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = lower(new.email)
     and exists (select 1 from public.resource_collaborators c2
                  where c2.resource_id = c.resource_id and c2.user_id = new.id);
  update public.resource_collaborators c
     set user_id = new.id, status = 'active', invited_email = null
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = lower(new.email);
  return new;
exception when others then
  return new;   -- never let collaboration-claiming break account creation
end $$;
drop trigger if exists trg_claim_pending_collaborations on auth.users;
create trigger trg_claim_pending_collaborations
  after insert on auth.users
  for each row execute function public.claim_pending_collaborations();
