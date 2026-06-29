-- ============================================================================
--  ⚠️  NOT IN USE / EXPERIMENTAL (2026-06-29).
--  Applied + live-tested against the project, but Supabase Realtime Authorization
--  DENIED even a confirmed member (valid user JWT + row in shared_match_members)
--  read access to a private channel ("Unauthorized: You do not have permissions
--  to read from this Channel topic"). Root cause is in Realtime's private-channel
--  RLS/auth path (likely the new sb_publishable_ key or realtime.topic() in the
--  receive check) and would need iterative SQL debugging with uncertain payoff.
--  The client was NOT switched to `private: true`, so this migration is INERT —
--  it only affects channels opened privately, and none are. Safe to leave or to
--  roll back (see the ROLLBACK block at the very bottom of this file).
-- ============================================================================
--  migrate-realtime-auth.sql — lock down the live + collab Realtime channels.
--
--  Until now acto-live:<CODE> (public scoreboard / filming) and
--  acto-collab:<id> (co-editing) were PUBLIC broadcast channels: any subscriber
--  holding the code/id could also PUBLISH — forge a scoreboard or inject collab
--  edits. This migration makes those channels PRIVATE and authorizes who may
--  RECEIVE vs BROADCAST via RLS policies on realtime.messages.
--
--  SAFE TO RUN ANY TIME: RLS on realtime.messages is only enforced for channels
--  the client opens with `private: true`. Today's channels are public, so they
--  keep working unchanged after this runs. Ship the `private: true` client
--  AFTER this migration is applied.
--
--  Idempotent — safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── registry: which account owns a live join code (the presenter) ──────────
create table if not exists public.live_codes (
  code       text primary key,
  owner      uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.live_codes enable row level security;   -- all access via the SECURITY DEFINER RPC below

-- Presenter claims its code at launch. Only the same owner may re-claim a code
-- (prevents another account from hijacking an in-use code).
create or replace function public.live_code_claim(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into public.live_codes(code, owner) values (upper(p_code), auth.uid())
  on conflict (code) do update set owner = excluded.owner
    where public.live_codes.owner = auth.uid();
end $$;
revoke all on function public.live_code_claim(text) from public;
grant execute on function public.live_code_claim(text) to authenticated;

-- ── registry: collaborators who presented a valid share token ──────────────
create table if not exists public.shared_match_members (
  match_id   uuid not null references public.shared_matches(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.shared_match_members enable row level security;

-- Join a shared match (token-gated) → become a Realtime member of its channel.
create or replace function public.shared_match_join(p_id uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not exists (select 1 from public.shared_matches where id = p_id and share_token = p_token) then
    return false;
  end if;
  insert into public.shared_match_members(match_id, user_id) values (p_id, auth.uid())
    on conflict do nothing;
  return true;
end $$;
revoke all on function public.shared_match_join(uuid, text) from public;
grant execute on function public.shared_match_join(uuid, text) to authenticated;

-- The creator is implicitly a member of their own shared match.
create or replace function public.shared_match_create(p_title text, p_data jsonb)
returns table(id uuid, share_token text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tok text;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into public.shared_matches(owner, title, data, updated_by)
    values (auth.uid(), coalesce(p_title, ''), p_data, auth.uid())
    returning shared_matches.id, shared_matches.share_token into v_id, v_tok;
  insert into public.shared_match_members(match_id, user_id) values (v_id, auth.uid())
    on conflict do nothing;
  return query select v_id, v_tok;
end $$;
grant execute on function public.shared_match_create(text, jsonb) to authenticated;

-- ── RLS on realtime.messages (enforced ONLY for private channels) ──────────
-- LIVE board: anyone may RECEIVE (the projector is public); only the code's
-- owner (the presenter) may BROADCAST. So an audience viewer can watch but
-- cannot inject a forged board.
drop policy if exists "acto_live_receive" on realtime.messages;
create policy "acto_live_receive" on realtime.messages
  for select to anon, authenticated
  using ( realtime.topic() like 'acto-live:%' );

drop policy if exists "acto_live_broadcast" on realtime.messages;
create policy "acto_live_broadcast" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'acto-live:%'
    and exists (
      select 1 from public.live_codes c
      where c.code = upper(split_part(realtime.topic(), ':', 2))
        and c.owner = (select auth.uid())
    )
  );

-- COLLAB: only members (those who presented a valid token via shared_match_join,
-- plus the owner) may RECEIVE or BROADCAST. An id-without-token party is shut out.
drop policy if exists "acto_collab_receive" on realtime.messages;
create policy "acto_collab_receive" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'acto-collab:%'
    and exists (
      select 1 from public.shared_match_members m
      where m.match_id::text = split_part(realtime.topic(), ':', 2)
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "acto_collab_broadcast" on realtime.messages;
create policy "acto_collab_broadcast" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'acto-collab:%'
    and exists (
      select 1 from public.shared_match_members m
      where m.match_id::text = split_part(realtime.topic(), ':', 2)
        and m.user_id = (select auth.uid())
    )
  );

-- ============================================================================
--  ROLLBACK (optional — the migration is inert, so this is only for tidiness).
--  Run this block to remove everything this file added. Order matters:
--  shared_match_create must be reverted to NOT write shared_match_members
--  BEFORE that table is dropped.
-- ============================================================================
-- drop policy if exists "acto_live_receive"     on realtime.messages;
-- drop policy if exists "acto_live_broadcast"   on realtime.messages;
-- drop policy if exists "acto_collab_receive"   on realtime.messages;
-- drop policy if exists "acto_collab_broadcast" on realtime.messages;
-- -- revert shared_match_create to the plain version (no member insert):
-- create or replace function public.shared_match_create(p_title text, p_data jsonb)
-- returns table(id uuid, share_token text)
-- language plpgsql security definer set search_path = public as $$
-- declare v_id uuid; v_tok text;
-- begin
--   if auth.uid() is null then raise exception 'auth required'; end if;
--   insert into public.shared_matches(owner, title, data, updated_by)
--     values (auth.uid(), coalesce(p_title, ''), p_data, auth.uid())
--     returning shared_matches.id, shared_matches.share_token into v_id, v_tok;
--   return query select v_id, v_tok;
-- end $$;
-- drop function if exists public.shared_match_join(uuid, text);
-- drop function if exists public.live_code_claim(text);
-- drop table if exists public.shared_match_members;
-- drop table if exists public.live_codes;
