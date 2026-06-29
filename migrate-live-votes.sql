-- ============================================================================
--  migrate-live-votes.sql — public (audience) voting for live matches.
--
--  The audience scans a "Vote" QR (vote.html?code=<CODE>) and votes — no login.
--  Votes are deduped per device (a random voter key kept in localStorage), one
--  per impro round, and the referee REVEALS the tally (the score itself stays
--  manual — the public result is informational). Stars: the public ranks the
--  jouteurs; the referee still assigns the medals.
--
--  All access is via anon-granted SECURITY DEFINER RPCs (no table RLS exposure,
--  no Realtime Authorization needed — the presenter reads the tally over REST).
--  Idempotent — safe to re-run.
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
