-- ============================================================================
--  migrate-2026-09-admin-edition.sql
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. Depuis la page admin, il manquait trois choses :
--   · MODIFIER un defi de la base (on pouvait seulement approuver, cacher ou
--     supprimer) — impossible de corriger une description ou un sujet ;
--   · AJOUTER un defi a la main (seuls les utilisateurs en proposaient) ;
--   · MODIFIER ou SUPPRIMER un echauffement LIVRE avec l'appli (on pouvait
--     seulement le cacher). Les echauffements ajoutes par l'admin, eux, etaient
--     deja modifiables.
--
--  Meme principe que les listes bundled (replace_bundled_item) pour les
--  echauffements livres : on cache l'original et on publie un remplacant dans
--  warmup_exercises. Le fichier livre n'est jamais touche.
--
--  Tout est reserve a l'admin (public.is_admin()).
-- ============================================================================

-- ── 1. modifier un defi de la base ──────────────────────────────────────────
create or replace function public.update_challenge_idea(
  p_id            uuid,
  p_category      text,
  p_category_desc text,
  p_theme         text,
  p_players       integer,
  p_duration_sec  integer,
  p_level         text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cat   text := nullif(btrim(coalesce(p_category, '')), '');
  v_desc  text := nullif(btrim(coalesce(p_category_desc, '')), '');
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if v_cat is null and v_theme is null then raise exception 'theme or category is required'; end if;
  if v_cat is not null and v_desc is null then raise exception 'category description is required'; end if;
  if v_cat is not null and length(v_cat) > 120 then raise exception 'category too long'; end if;
  if v_theme is not null and length(v_theme) > 300 then raise exception 'theme too long'; end if;
  if v_desc is not null and length(v_desc) > 600 then raise exception 'description too long'; end if;
  if p_level is not null and p_level <> '' and p_level not in ('debutant','confirme','expert') then
    raise exception 'invalid level: %', p_level;
  end if;
  update public.challenge_ideas
     set category      = v_cat,
         category_desc = v_desc,
         theme         = v_theme,
         players       = case when p_players between 1 and 12 then p_players else null end,
         duration_sec  = case when p_duration_sec between 10 and 3600 then p_duration_sec else null end,
         level         = nullif(btrim(coalesce(p_level, '')), '')
   where id = p_id;
  if not found then raise exception 'challenge idea not found'; end if;
end $$;
revoke all on function public.update_challenge_idea(uuid, text, text, text, integer, integer, text) from public;
grant  execute on function public.update_challenge_idea(uuid, text, text, text, integer, integer, text) to authenticated;

-- ── 2. ajouter un defi a la main (publie tout de suite) ─────────────────────
create or replace function public.admin_add_challenge_idea(
  p_locale        text,
  p_level         text,
  p_category      text,
  p_category_desc text,
  p_theme         text,
  p_players       integer,
  p_duration_sec  integer
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cat   text := nullif(btrim(coalesce(p_category, '')), '');
  v_desc  text := nullif(btrim(coalesce(p_category_desc, '')), '');
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
  v_id    uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if coalesce(p_locale, '') not in ('fr','en','de','es','pt','nl','it') then raise exception 'invalid locale'; end if;
  if v_cat is null and v_theme is null then raise exception 'theme or category is required'; end if;
  if v_cat is not null and v_desc is null then raise exception 'category description is required'; end if;
  if v_cat is not null and length(v_cat) > 120 then raise exception 'category too long'; end if;
  if v_theme is not null and length(v_theme) > 300 then raise exception 'theme too long'; end if;
  if v_desc is not null and length(v_desc) > 600 then raise exception 'description too long'; end if;
  if p_level is not null and p_level <> '' and p_level not in ('debutant','confirme','expert') then
    raise exception 'invalid level: %', p_level;
  end if;
  -- Deja la (meme contrainte + meme sujet, meme langue) : on rend l'existant.
  select id into v_id from public.challenge_ideas
   where locale = p_locale
     and lower(coalesce(category, '')) = lower(coalesce(v_cat, ''))
     and lower(coalesce(theme, ''))    = lower(coalesce(v_theme, ''))
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.challenge_ideas (locale, level, category, category_desc, theme, players, duration_sec,
                                      submitted_by, status, approved_by, approved_at)
  values (p_locale, nullif(btrim(coalesce(p_level, '')), ''), v_cat, v_desc, v_theme,
          case when p_players between 1 and 12 then p_players else null end,
          case when p_duration_sec between 10 and 3600 then p_duration_sec else null end,
          auth.uid(), 'approved', auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_add_challenge_idea(text, text, text, text, text, integer, integer) from public;
grant  execute on function public.admin_add_challenge_idea(text, text, text, text, text, integer, integer) to authenticated;

-- ── 3. modifier un echauffement LIVRE ───────────────────────────────────────
--     L'original est cache, un remplacant approuve prend sa place.
create or replace function public.replace_bundled_warmup(
  p_locale           text,
  p_original_name    text,
  p_type             text,
  p_subtype          text,
  p_name             text,
  p_description      text,
  p_duration_seconds integer,
  p_participants     text,
  p_source           text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_orig text := nullif(btrim(coalesce(p_original_name, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_id   uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if coalesce(p_locale, '') not in ('fr','en','de','es','pt','nl','it') then raise exception 'invalid locale'; end if;
  if v_orig is null or v_name is null then raise exception 'name is empty'; end if;
  if v_desc is null then raise exception 'description is required'; end if;

  insert into public.bundled_hidden_items (kind, mode, level, locale, text, hidden_by)
  values ('warmup', null, null, p_locale, v_orig, auth.uid())
  on conflict (kind, coalesce(mode, ''), coalesce(level, ''), locale, lower(text)) do nothing;

  select id into v_id from public.warmup_exercises
   where locale = p_locale and lower(name) = lower(v_name)
   limit 1;
  if v_id is not null then
    update public.warmup_exercises
       set type = coalesce(nullif(btrim(coalesce(p_type, '')), ''), type),
           subtype = nullif(btrim(coalesce(p_subtype, '')), ''),
           name = v_name, description = v_desc,
           duration_seconds = p_duration_seconds,
           participants = nullif(btrim(coalesce(p_participants, '')), ''),
           source = nullif(btrim(coalesce(p_source, '')), ''),
           status = 'approved', approved_by = auth.uid(), approved_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.warmup_exercises (type, subtype, name, description, duration_seconds, participants, source,
                                       locale, submitted_by, status, approved_by, approved_at)
  values (coalesce(nullif(btrim(coalesce(p_type, '')), ''), 'Échauffement'),
          nullif(btrim(coalesce(p_subtype, '')), ''), v_name, v_desc, p_duration_seconds,
          nullif(btrim(coalesce(p_participants, '')), ''), nullif(btrim(coalesce(p_source, '')), ''),
          p_locale, auth.uid(), 'approved', auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.replace_bundled_warmup(text, text, text, text, text, text, integer, text, text) from public;
grant  execute on function public.replace_bundled_warmup(text, text, text, text, text, text, integer, text, text) to authenticated;

-- ── 4. supprimer un echauffement LIVRE ──────────────────────────────────────
--     Cache l'original ET efface un eventuel remplacant du meme nom.
create or replace function public.delete_bundled_warmup(p_locale text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if coalesce(p_locale, '') not in ('fr','en','de','es','pt','nl','it') then raise exception 'invalid locale'; end if;
  if v_name is null then raise exception 'name is empty'; end if;

  insert into public.bundled_hidden_items (kind, mode, level, locale, text, hidden_by)
  values ('warmup', null, null, p_locale, v_name, auth.uid())
  on conflict (kind, coalesce(mode, ''), coalesce(level, ''), locale, lower(text)) do nothing;

  delete from public.warmup_exercises
   where locale = p_locale and lower(name) = lower(v_name);
end $$;
revoke all on function public.delete_bundled_warmup(text, text) from public;
grant  execute on function public.delete_bundled_warmup(text, text) to authenticated;

-- ============================================================================
--  Verification : depuis la page admin, « ✎ Éditer » doit apparaitre sur un
--  defi et sur un echauffement livre, et l'import CSV doit pouvoir creer,
--  modifier et supprimer des lignes.
-- ============================================================================
