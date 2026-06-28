-- ============================================================================
-- migrate-teams.sql — Saved teams (rosters) for the Studio.
--
-- A logged-in user can save teams with a name, colour, logo and a roster of
-- players. Each player may carry a photo and, when that player has an Acto
-- account, a link to their user id (so per-player stats can attribute to them).
--
-- Private per-user data → plain owner-scoped RLS (no RPC needed for CRUD).
-- The client reads/writes via the authenticated Supabase client directly.
--
-- Idempotent: safe to re-run. Requires public.search_users_by_stage_name()
-- (already in supabase-setup-all.sql) for the account-link search in the UI.
-- ============================================================================

create table if not exists public.acto_teams (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null default '',
  color       text        not null default '#6dd3c5',
  logo        text,                                    -- downscaled data URL
  players     jsonb       not null default '[]'::jsonb, -- [{id,name,photo,user_id}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists acto_teams_owner_idx on public.acto_teams (owner_id);

-- Keep updated_at fresh on every update.
create or replace function public.acto_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists acto_teams_touch on public.acto_teams;
create trigger acto_teams_touch
  before update on public.acto_teams
  for each row execute function public.acto_touch_updated_at();

-- ---- RLS: owner-only CRUD ---------------------------------------------------
alter table public.acto_teams enable row level security;

drop policy if exists acto_teams_select_own on public.acto_teams;
create policy acto_teams_select_own on public.acto_teams
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists acto_teams_insert_own on public.acto_teams;
create policy acto_teams_insert_own on public.acto_teams
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists acto_teams_update_own on public.acto_teams;
create policy acto_teams_update_own on public.acto_teams
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists acto_teams_delete_own on public.acto_teams;
create policy acto_teams_delete_own on public.acto_teams
  for delete to authenticated
  using (owner_id = auth.uid());

-- Admins may also read every team (handy for support/debugging). Optional.
drop policy if exists acto_teams_select_admin on public.acto_teams;
create policy acto_teams_select_admin on public.acto_teams
  for select to authenticated
  using (public.is_admin());
