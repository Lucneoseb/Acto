-- =====================================================================
-- Acto — Supabase setup
-- Run this once in your project's SQL editor:
--   https://supabase.com/dashboard/project/gssotstyevehbzydzhlq/sql/new
-- Paste the whole content, hit "Run".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES TABLE
--    One row per authenticated user, holding the custom fields the
--    sign-up form collects (prenom, nom, date de naissance).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  email         text        not null,
  prenom        text        not null,
  nom           text        not null,
  date_naissance date       not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
--    A user can only read / write their own profile row.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3. AUTO-UPDATE updated_at
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. SELF-DELETE RPC
--    The Supabase client cannot directly delete from auth.users (admin
--    only). This SECURITY DEFINER function lets the authenticated user
--    delete their own auth account; the cascade on profiles cleans up.
-- ---------------------------------------------------------------------
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
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================
-- DONE. After running, you can verify in Database → Tables that the
-- "profiles" table exists with RLS enabled, and in Database → Functions
-- that "delete_my_account" exists.
-- =====================================================================
