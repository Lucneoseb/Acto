-- =====================================================================
-- Acto — Per-impro event logging
-- Run AFTER supabase-setup.sql and supabase-setup-stats.sql.
-- Open: https://supabase.com/dashboard/project/gssotstyevehbzydzhlq/sql/new
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EVENTS TABLE
--    One row per impro that was actually started (chrono triggered).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
--    Users see only their own events; admins see everything.
-- ---------------------------------------------------------------------
alter table public.impro_events enable row level security;

drop policy if exists "select_own_events"        on public.impro_events;
drop policy if exists "admins_select_all_events" on public.impro_events;

create policy "select_own_events"
  on public.impro_events for select
  using (auth.uid() = user_id);

create policy "admins_select_all_events"
  on public.impro_events for select
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. LOG RPC — called when an impro is first launched (chrono start).
--    Returns the new event id so the client can later update it.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. UPDATE RPC — incrementally update played duration / was_recorded.
--    Only the owner can update (defensive check inside).
--    p_add_played_seconds is ADDED (incremental); pass NULL to skip.
--    p_set_was_recorded TRUE → set; FALSE → no-op (we never un-set).
-- ---------------------------------------------------------------------
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
-- DONE. Verify in Database → Tables that "impro_events" exists with
-- RLS, and in Database → Functions that log_impro_event +
-- update_impro_event are listed.
-- =====================================================================
