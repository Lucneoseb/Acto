-- ============================================================================
--  migrate-shared-matches.sql  —  Collaborative match editing (#80)
--
--  A prepared match (the Suite "session" object) can be pushed to the server so
--  several people co-edit it. Access is by CAPABILITY TOKEN (a share link) — no
--  per-user ACL table. The Studio is login-gated, so editing requires an account
--  but ANY logged-in user holding the link+token can read & write. Live co-edit
--  is handled client-side over a Supabase Realtime broadcast channel keyed by the
--  match id; this table is the durable store + last-write-wins reconciliation.
--
--  Idempotent — safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_bytes / gen_random_uuid

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
