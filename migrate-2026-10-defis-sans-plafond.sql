-- ============================================================================
--  migrate-2026-10-defis-sans-plafond.sql
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. Supabase ne renvoie jamais plus de 1000 lignes par reponse
--  (max_rows), quel que soit le limit demande : mesure le 30/10/2026,
--  ?limit=5000 rend 1000 lignes. Au-dela, une liste est tronquee EN SILENCE.
--  Pour les defis, trois listes etaient concernees :
--   · list_challenge_ideas     : la base des defis (Tirage, Mon defi,
--                                Communaute) — en plus bornee a 2000 en dur ;
--   · list_my_challenges       : les defis que j'ai envoyes ;
--   · list_received_challenges : les defis que j'ai recus.
--
--  COMMENT. Le client lit desormais ces listes PAR PAGES de 1000
--  (actoUtils.readAllPages, js/utils.js). Pour que deux pages ne se
--  chevauchent pas, chaque appel doit trier exactement pareil : le tri de
--  chaque fonction se termine donc par une cle unique (id, token). Sans elle,
--  deux defis ex aequo pouvaient changer de place d'un appel a l'autre et
--  l'un d'eux sauter ou apparaitre deux fois.
--
--  Meme signature qu'avant : « create or replace » suffit, et les anciennes
--  versions du client (une seule requete, sans pages) marchent toujours.
--  Les fichiers d'origine (migrate-2026-09-defis-communaute.sql,
--  migrate-challenges.sql, supabase-setup-all.sql) portent la meme definition :
--  les rejouer ne remet pas le plafond.
-- ============================================================================

-- ── la base des defis ───────────────────────────────────────────────────────
create or replace function public.list_challenge_ideas(p_locale text)
returns table(id uuid, level text, category text, category_desc text, theme text, players integer, duration_sec integer, status text, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.level, c.category, c.category_desc, c.theme, c.players, c.duration_sec, c.status,
         (auth.uid() is not null and c.submitted_by = auth.uid()) as is_mine
    from public.challenge_ideas c
   where c.locale = p_locale
     and (c.status = 'approved' or (auth.uid() is not null and c.submitted_by = auth.uid() and c.status = 'pending'))
   order by c.status = 'approved' desc, lower(coalesce(c.theme, c.category)), c.id;
$$;
revoke all on function public.list_challenge_ideas(text) from public;
grant  execute on function public.list_challenge_ideas(text) to anon, authenticated;

-- ── les defis que j'ai envoyes ──────────────────────────────────────────────
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
  order by created_at desc, token;
$$;
revoke all on function public.list_my_challenges() from public;
grant execute on function public.list_my_challenges() to authenticated;

-- ── les defis que j'ai recus ────────────────────────────────────────────────
create or replace function public.list_received_challenges()
returns table(token text, sender_name text, title text, status text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select c.token,
         coalesce(nullif(btrim(sp.nom_scene), ''), nullif(btrim(sp.prenom), ''), 'Acto'),
         coalesce(c.epreuve_snapshot->>'title', ''), c.status, c.created_at
  from public.challenges c
  left join public.profiles sp on sp.id = c.sender_id
  where c.recipient_user_id = auth.uid()
  order by c.created_at desc, c.token;
$$;
revoke all on function public.list_received_challenges() from public;
grant execute on function public.list_received_challenges() to authenticated;
