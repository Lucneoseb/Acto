-- ============================================================================
-- migrate-keepalive-feed.sql
--
-- Backend for the twice-weekly "keep-alive + inspiration auto-feed" GitHub
-- Action (.github/workflows/keepalive-feed.yml + scripts/feed.mjs).
--
-- WHAT IT DOES
--   * acto_secrets        — a private key/value table (RLS denies ALL direct
--                          access; only SECURITY DEFINER functions can read it).
--   * feed_add_inspiration(...) — a token-gated RPC, callable with the PUBLIC
--                          publishable key, that inserts ONE 'pending'
--                          inspiration video (deduped). The shared token keeps
--                          random visitors from spamming the queue.
--
-- The Action calls this RPC (a DB write) twice a week, which both (a) fills your
-- admin review queue with fresh impro videos and (b) counts as activity so the
-- free Supabase project is never paused for inactivity.
--
-- Idempotent — safe to re-run.
--
-- Your shared token is already set at the BOTTOM of this file. Use the SAME
-- value as the GitHub repo secret named FEED_TOKEN.
-- ============================================================================

-- 1. Private secrets store -----------------------------------------------------
create table if not exists public.acto_secrets (
  name  text primary key,
  value text not null
);
alter table public.acto_secrets enable row level security;
-- Intentionally NO policies: anon/authenticated get zero direct access.
-- Only SECURITY DEFINER functions (which run as the owner) can read it.
revoke all on table public.acto_secrets from anon, authenticated;

-- 2. Token-gated pending insert -----------------------------------------------
create or replace function public.feed_add_inspiration(
  p_token        text,
  p_title        text,
  p_url          text,
  p_channel      text default null,
  p_content_type text default 'spectacle',
  p_locale       text default 'fr'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
  v_ct     text;
begin
  select value into expected from public.acto_secrets where name = 'feed_token';
  if expected is null or p_token is null or p_token <> expected then
    raise exception 'unauthorized';
  end if;

  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_url), '') = '' then
    return 'skipped:empty';
  end if;

  -- Dedupe: skip if this exact URL is already in the table (any status).
  if exists (select 1 from public.inspiration_videos where video_url = p_url) then
    return 'duplicate';
  end if;

  -- Validate content_type against the table's enum; fall back to a safe default.
  v_ct := lower(coalesce(p_content_type, ''));
  if v_ct not in ('chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court') then
    v_ct := 'spectacle';
  end if;

  insert into public.inspiration_videos
    (title, channel, content_type, video_url, locale, status, notes)
  values
    (left(p_title, 300), left(p_channel, 200), v_ct, p_url,
     coalesce(nullif(btrim(p_locale), ''), 'fr'), 'pending', 'Ajout automatique (feed)');

  return 'added';
end;
$$;

revoke all on function public.feed_add_inspiration(text, text, text, text, text, text) from public;
grant  execute on function public.feed_add_inspiration(text, text, text, text, text, text) to anon, authenticated;

-- 3. Your shared feed token --------------------------------------------------
-- Use this SAME value as the GitHub repo secret FEED_TOKEN.
insert into public.acto_secrets (name, value)
values ('feed_token', 'nvSKCFUEXuIok8YlKy_o_Vr_JdI_xa4G')
on conflict (name) do update set value = excluded.value;
