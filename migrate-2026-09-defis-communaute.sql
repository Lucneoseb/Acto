-- ============================================================================
--  Acto — base de defis communautaire
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. Un defi, c'etait un tirage au sort ou rien. Desormais chacun peut
--  ecrire le sien et le proposer : une fois valide par l'admin, il rejoint une
--  base ou tout le monde peut piocher.
--
--  Un defi porte une CONTRAINTE DE JEU ou un EXERCICE (jamais une nature de
--  match a deux equipes, « Mixte » ou « Comparee », sans objet ici), avec son
--  NOM et sa DESCRIPTION — la personne qui recoit le defi doit comprendre
--  comment jouer (ex. « Mime T-Rex » : mimer l'action les bras colles au corps,
--  comme un T-Rex). Plus un theme et un nombre de jouteurs.
--
--  Meme cycle que les autres propositions (user_submissions, warmup_exercises) :
--  pending -> approved | rejected, valide depuis la page admin.
--
--  Lecture : via la fonction list_challenge_ideas(), jamais la table directement.
--  Elle ne renvoie que les colonnes utiles, les defis valides pour tous, et en
--  plus les propositions EN ATTENTE de l'appelant — pour qu'il puisse s'en
--  resservir avant la validation. submitted_by n'est jamais expose.
-- ============================================================================

create table if not exists public.challenge_ideas (
  id            uuid primary key default gen_random_uuid(),
  locale        text not null default 'fr' check (locale in ('fr','en','de','es','pt','nl','it')),
  level         text check (level in ('debutant','confirme','expert')),
  category      text check (category is null or length(category) <= 120),   -- nom de la contrainte / de l'exercice
  category_desc text check (category_desc is null or length(category_desc) <= 600),
  theme         text not null check (length(theme) between 1 and 300),
  players       integer check (players is null or players between 1 and 12),
  duration_sec  integer check (duration_sec is null or duration_sec between 10 and 3600),
  submitted_by  uuid references auth.users(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
-- Base deja creee par une version anterieure de ce fichier : on ajoute la colonne.
alter table public.challenge_ideas add column if not exists category_desc text;
create index if not exists challenge_ideas_status_idx on public.challenge_ideas (status, locale);
create index if not exists challenge_ideas_owner_idx  on public.challenge_ideas (submitted_by);

alter table public.challenge_ideas enable row level security;

-- Seul l'admin lit la table en direct (page de moderation). Tout le reste passe
-- par les fonctions ci-dessous.
drop policy if exists "admins_read_challenge_ideas" on public.challenge_ideas;
create policy "admins_read_challenge_ideas"
  on public.challenge_ideas for select
  to authenticated
  using (public.is_admin());

-- ── proposer un defi ────────────────────────────────────────────────────────
-- (signature elargie : l'ancienne, sans description, est retiree d'abord)
drop function if exists public.submit_challenge_idea(text, text, text, text, integer, integer);
create or replace function public.submit_challenge_idea(
  p_locale text, p_level text, p_category text, p_category_desc text, p_theme text, p_players integer, p_duration_sec integer
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
  v_cat   text := nullif(btrim(coalesce(p_category, '')), '');
  v_desc  text := nullif(btrim(coalesce(p_category_desc, '')), '');
  v_id    uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_theme is null then raise exception 'theme is empty'; end if;
  if length(v_theme) > 300 then raise exception 'theme too long'; end if;
  if v_cat is not null and length(v_cat) > 120 then raise exception 'category too long'; end if;
  -- Une contrainte sans description est incomprehensible pour qui recoit le defi.
  if v_cat is not null and v_desc is null then raise exception 'category description is required'; end if;
  if v_desc is not null and length(v_desc) > 600 then raise exception 'description too long'; end if;
  if coalesce(p_locale, '') not in ('fr','en','de','es','pt','nl','it') then raise exception 'invalid locale'; end if;
  if p_level is not null and p_level <> '' and p_level not in ('debutant','confirme','expert') then raise exception 'invalid level'; end if;
  -- Doublon : meme theme + meme categorie dans la meme langue, deja valide ou
  -- deja propose par cette personne -> on renvoie l'existant.
  select id into v_id from public.challenge_ideas
   where locale = p_locale
     and lower(theme) = lower(v_theme)
     and lower(coalesce(category, '')) = lower(coalesce(v_cat, ''))
     and (status = 'approved' or submitted_by = auth.uid())
   limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.challenge_ideas (locale, level, category, category_desc, theme, players, duration_sec, submitted_by)
  values (p_locale, nullif(p_level, ''), v_cat, v_desc, v_theme,
          case when p_players between 1 and 12 then p_players else null end,
          case when p_duration_sec between 10 and 3600 then p_duration_sec else null end,
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_challenge_idea(text, text, text, text, text, integer, integer) from public;
grant  execute on function public.submit_challenge_idea(text, text, text, text, text, integer, integer) to authenticated;

-- ── lire la base : valides pour tous + mes propositions en attente ─────────
-- (le type de retour change : Postgres exige de retirer la fonction d'abord)
drop function if exists public.list_challenge_ideas(text);
create or replace function public.list_challenge_ideas(p_locale text)
returns table(id uuid, level text, category text, category_desc text, theme text, players integer, duration_sec integer, status text, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.level, c.category, c.category_desc, c.theme, c.players, c.duration_sec, c.status,
         (auth.uid() is not null and c.submitted_by = auth.uid()) as is_mine
    from public.challenge_ideas c
   where c.locale = p_locale
     and (c.status = 'approved' or (auth.uid() is not null and c.submitted_by = auth.uid() and c.status = 'pending'))
   order by c.status = 'approved' desc, lower(c.theme)
   limit 2000;
$$;
revoke all on function public.list_challenge_ideas(text) from public;
grant  execute on function public.list_challenge_ideas(text) to anon, authenticated;

-- ── moderation (admin) ──────────────────────────────────────────────────────
create or replace function public.set_challenge_idea_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'invalid status: %', p_status; end if;
  update public.challenge_ideas
     set status      = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then now()      else approved_at end
   where id = p_id;
end $$;
revoke all on function public.set_challenge_idea_status(uuid, text) from public;
grant  execute on function public.set_challenge_idea_status(uuid, text) to authenticated;

create or replace function public.delete_challenge_idea(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  delete from public.challenge_ideas where id = p_id;
end $$;
revoke all on function public.delete_challenge_idea(uuid) from public;
grant  execute on function public.delete_challenge_idea(uuid) to authenticated;

-- ============================================================================
--  Verification :
--    select * from public.list_challenge_ideas('fr');   -- vide au depart
-- ============================================================================
