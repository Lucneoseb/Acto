-- =====================================================================
-- Acto — Stats + Admin extension
-- Run AFTER supabase-setup.sql (which created the profiles table).
-- Open: https://supabase.com/dashboard/project/gssotstyevehbzydzhlq/sql/new
-- Paste the whole content, hit "Run".
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. STATS COLUMNS on profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists login_count             integer       not null default 0,
  add column if not exists last_login_at           timestamptz,
  add column if not exists total_impros_generated  integer       not null default 0,
  add column if not exists total_impros_played     integer       not null default 0,
  add column if not exists total_impro_seconds     integer       not null default 0,
  add column if not exists total_records_count     integer       not null default 0,
  add column if not exists total_record_seconds    integer       not null default 0,
  add column if not exists is_admin                boolean       not null default false;

-- ---------------------------------------------------------------------
-- 2. ATOMIC INCREMENT RPC
--    The client sends a batch of deltas; the server adds them to the
--    user's own row. Negative or null deltas are clamped to 0 to avoid
--    cheating from the browser.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3. is_admin() HELPER (avoids recursive RLS lookup)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. ADMIN-READS-ALL RLS POLICY
--    Regular users can only read their own profile (existing policy).
--    Admins can read every profile.
-- ---------------------------------------------------------------------
drop policy if exists "admins_read_all_profiles" on public.profiles;
create policy "admins_read_all_profiles"
  on public.profiles for select
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. PROMOTE YOURSELF TO ADMIN
--    Run this manually ONCE, with your own email.
--    Replace 'your-email@example.com' below.
-- ---------------------------------------------------------------------
-- update public.profiles set is_admin = true where email = 'lucneoseb@gmail.com';

-- =====================================================================
-- DONE. To verify:
--   • Database → Tables → profiles → confirm new columns exist.
--   • Database → Functions → bump_stats + is_admin should be visible.
--   • After running the UPDATE above, your profile row should show
--     is_admin = true.
-- =====================================================================
