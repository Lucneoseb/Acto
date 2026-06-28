-- ============================================================================
-- migrate-stats.sql — Per-player match stats (event-sourced).
--
-- One row per (player account) per match. The referee submits results at the
-- end of a match via record_match_results(); each linked player accrues an
-- outcome (win/loss/draw) and possibly a star (or/argent/bronze). A player
-- reads their own totals via get_my_stats() on the account page.
--
-- Event-sourced (not counters) → idempotent re-submits, no read-modify-write
-- races, and a history we can aggregate or extend later.
--
-- Soft trust: the writing RPC is SECURITY DEFINER and inserts rows for OTHER
-- users' accounts (the players), so any authenticated referee could in theory
-- inflate stats. Acceptable for a small community app; submitted_by is recorded
-- for audit. Requires public.is_admin() (in supabase-setup-all.sql).
--
-- Idempotent: safe to re-run.
-- ============================================================================

create table if not exists public.acto_match_results (
  id             uuid        primary key default gen_random_uuid(),
  match_uid      text        not null,                 -- client session id (dedup key)
  submitted_by   uuid        not null references auth.users(id) on delete cascade,
  player_user_id uuid        not null references auth.users(id) on delete cascade,
  player_name    text,
  team_name      text,
  outcome        text        not null check (outcome in ('win', 'loss', 'draw')),
  star           text        check (star in ('or', 'argent', 'bronze')),  -- nullable
  created_at     timestamptz not null default now()
);

create index if not exists acto_match_results_player_idx on public.acto_match_results (player_user_id);
create index if not exists acto_match_results_match_idx  on public.acto_match_results (match_uid, submitted_by);

alter table public.acto_match_results enable row level security;

-- Read: your own rows (as player), your own submissions (as referee), or admin.
drop policy if exists acto_results_select_own on public.acto_match_results;
create policy acto_results_select_own on public.acto_match_results
  for select to authenticated
  using (player_user_id = auth.uid() or submitted_by = auth.uid() or public.is_admin());
-- No direct insert/update/delete policies → writes only via the RPC below.

-- record_match_results — referee submits the match outcome for its linked
-- players. Idempotent per (match_uid, submitted_by): re-submitting replaces this
-- referee's rows for that match. p_results = [{user_id,name,team,outcome,star}].
create or replace function public.record_match_results(p_match_uid text, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  rec jsonb;
  n   int  := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_match_uid is null or length(trim(p_match_uid)) = 0 then raise exception 'match_uid required'; end if;

  -- Replace this referee's previous rows for this match (idempotent re-submit).
  delete from public.acto_match_results
   where match_uid = p_match_uid and submitted_by = me;

  for rec in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) as t(value)
  loop
    if (rec->>'user_id') is null or length(trim(rec->>'user_id')) = 0 then continue; end if;
    -- Tolerate one bad row (a deleted account → FK violation, or a malformed
    -- user_id → invalid uuid) instead of aborting the entire match submission.
    -- outcome/star are normalized to valid values so a junk caller can't trip
    -- the CHECK constraints and roll the whole batch back.
    begin
      insert into public.acto_match_results
        (match_uid, submitted_by, player_user_id, player_name, team_name, outcome, star)
      values (
        p_match_uid, me,
        (rec->>'user_id')::uuid,
        nullif(rec->>'name', ''),
        nullif(rec->>'team', ''),
        case when nullif(rec->>'outcome', '') in ('win', 'loss', 'draw') then rec->>'outcome' else 'draw' end,
        case when nullif(rec->>'star', '') in ('or', 'argent', 'bronze') then rec->>'star' else null end
      );
      n := n + 1;
    exception
      when foreign_key_violation then null;        -- stale/deleted account → skip row
      when invalid_text_representation then null;  -- malformed user_id → skip row
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.record_match_results(text, jsonb) from public;
grant  execute on function public.record_match_results(text, jsonb) to authenticated;

-- get_my_stats — aggregate totals for the calling user.
create or replace function public.get_my_stats()
returns table(matches bigint, wins bigint, draws bigint, losses bigint, gold bigint, silver bigint, bronze bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct match_uid)                       as matches,
    count(*) filter (where outcome = 'win')         as wins,
    count(*) filter (where outcome = 'draw')        as draws,
    count(*) filter (where outcome = 'loss')        as losses,
    count(*) filter (where star = 'or')             as gold,
    count(*) filter (where star = 'argent')         as silver,
    count(*) filter (where star = 'bronze')         as bronze
  from public.acto_match_results
  where player_user_id = auth.uid();
$$;

revoke all on function public.get_my_stats() from public;
grant  execute on function public.get_my_stats() to authenticated;
