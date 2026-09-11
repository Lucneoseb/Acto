-- ============================================================================
--  Acto — contenus caches : visibles de tous, echauffements inclus
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  DEUX PROBLEMES, UNE MIGRATION.
--
--  1. Un visiteur NON CONNECTE voyait encore ce que l'admin avait cache.
--     La politique de lecture exigeait un compte (auth.uid() is not null) :
--     sans session, la liste des masquages revenait vide et le client ne
--     filtrait rien. Le Match rapide comme le Studio etaient concernes.
--
--     On ouvre la lecture a anon — mais sur les SEULES colonnes utiles au
--     filtrage. Une politique RLS porte sur les lignes, pas sur les colonnes :
--     sans restriction de colonnes, un anonyme aurait pu lire hidden_by,
--     l'identifiant de l'admin qui a cache l'element. Les privileges par
--     colonne ferment cette porte ; PostgREST les respecte.
--
--  2. Impossible de cacher un echauffement livre (data/warmups-*.json) : la
--     table n'acceptait que theme / category / constraint / exercise. On
--     ajoute 'warmup'. Pour un echauffement, mode et level restent NULL.
-- ============================================================================

-- ── 1. lecture anonyme, colonnes utiles seulement ───────────────────────────
revoke select on public.bundled_hidden_items from anon;
grant  select (kind, mode, level, locale, text) on public.bundled_hidden_items to anon;

drop policy if exists "anon_reads_hidden_items" on public.bundled_hidden_items;
create policy "anon_reads_hidden_items"
  on public.bundled_hidden_items for select
  to anon
  using (true);

-- (la politique existante « everyone_reads_hidden_items » continue de servir
--  les comptes connectes, admin compris : rien ne change pour eux)

-- ── 2. le type 'warmup' ─────────────────────────────────────────────────────
alter table public.bundled_hidden_items
  drop constraint if exists bundled_hidden_items_kind_check;
alter table public.bundled_hidden_items
  add constraint bundled_hidden_items_kind_check
  check (kind in ('theme','category','constraint','exercise','warmup'));

create or replace function public.hide_bundled_item(
  p_kind   text,
  p_mode   text,
  p_level  text,
  p_locale text,
  p_text   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_text text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_kind not in ('theme','category','constraint','exercise','warmup') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  if p_locale is null or p_locale not in ('fr','en','de','es','pt','nl','it') then
    raise exception 'invalid locale: %', p_locale;
  end if;
  v_text := nullif(trim(coalesce(p_text, '')), '');
  if v_text is null then
    raise exception 'text is empty';
  end if;
  -- Idempotent : deja cache -> on renvoie l'identifiant existant.
  select id into new_id
    from public.bundled_hidden_items
   where kind = p_kind
     and coalesce(mode,  '') = coalesce(p_mode,  '')
     and coalesce(level, '') = coalesce(p_level, '')
     and locale = p_locale
     and lower(text) = lower(v_text)
   limit 1;
  if new_id is not null then return new_id; end if;
  insert into public.bundled_hidden_items (kind, mode, level, locale, text, hidden_by)
  values (p_kind, nullif(p_mode, ''), nullif(p_level, ''), p_locale, v_text, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.hide_bundled_item(text, text, text, text, text) from public;
grant  execute on function public.hide_bundled_item(text, text, text, text, text) to authenticated;

-- ============================================================================
--  Verification, depuis n'importe quel navigateur NON connecte :
--    https://gssotstyevehbzydzhlq.supabase.co/rest/v1/bundled_hidden_items?select=kind,text
--    (avec l'en-tete apikey = cle publique) -> la liste doit revenir.
--    Le meme appel avec select=hidden_by doit etre REFUSE.
-- ============================================================================
