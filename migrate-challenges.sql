-- ============================================================================
--  migrate-challenges.sql — "Défis à relever" (Fonctionnalité 1).
--
--  A challenge = a snapshot of a drawn épreuve/exercice that one user sends to
--  someone via a SHAREABLE LINK (/defi?token=<token>). Delivery is link-share
--  (copy / native share / QR) — there is NO email sending and NO video storage.
--  The recipient records locally and returns the video via the OS share sheet
--  or a local download; the blob NEVER touches the server. "Mes défis" tracks
--  only the status (sent → opened → done).
--
--  All recipient-side access is via anon-granted, token-gated SECURITY DEFINER
--  RPCs (the token is the capability — the table itself is never exposed to
--  anon). Additive + idempotent — safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

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
