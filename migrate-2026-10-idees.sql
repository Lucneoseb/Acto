-- ============================================================================
--  migrate-2026-10-idees.sql
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq),
--  AVANT seed-2026-10-idees.sql.
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. Le generateur d'idees (page /idees.html) tire au sort un element
--  dans une categorie : une expression, une emotion, un lieu, un metier...
--  C'est un outil d'echauffement et d'ecriture, utilisable sans compte.
--
--  DEUX TABLES. Une categorie (le bouton) porte plusieurs contenus (ce qui est
--  tire). Les contenus sont effaces avec leur categorie (on delete cascade) :
--  une categorie supprimee n'a aucune raison de laisser ses mots derriere elle.
--
--  LECTURE PUBLIQUE. La page est consultable sans compte : anon lit les lignes
--  actives, en direct, sans RPC. Il n'y a rien de confidentiel ici et une
--  fonction de lecture n'apporterait qu'un aller-retour de plus.
--
--  ECRITURE ADMIN. Tout passe par les quatre fonctions ci-dessous, reservees a
--  public.is_admin(). Aucune politique insert/update/delete n'existe : meme un
--  compte connecte ne peut pas ecrire dans ces tables en direct.
-- ============================================================================

-- ── 1. les tables ───────────────────────────────────────────────────────────

create table if not exists public.idea_categories (
  id         uuid primary key default gen_random_uuid(),
  locale     text    not null default 'fr' check (locale in ('fr','en','de','es','pt','nl','it')),
  slug       text    not null check (slug ~ '^[a-z0-9_]{1,40}$'),  -- identifiant stable, sert aux imports CSV
  label      text    not null check (length(btrim(label)) between 1 and 60),
  emoji      text    check (emoji is null or length(emoji) <= 16),  -- ZWJ : 🧑‍🍳 compte 3 caractères, une famille jusqu'à 11
  position   integer not null default 0,     -- ordre des boutons sur la page
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idea_categories_slug_idx
  on public.idea_categories (locale, slug);
create index if not exists idea_categories_order_idx
  on public.idea_categories (locale, position, label);

create table if not exists public.idea_items (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.idea_categories(id) on delete cascade,
  content     text not null check (length(btrim(content)) between 1 and 300),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idea_items_cat_idx on public.idea_items (category_id);
-- Meme mot deux fois dans la meme categorie : c'est une erreur de saisie, et
-- ca fausserait le tirage. L'index sert aussi a rejouer le seed sans doublon.
create unique index if not exists idea_items_uniq
  on public.idea_items (category_id, lower(btrim(content)));

-- ── 2. lecture ──────────────────────────────────────────────────────────────

alter table public.idea_categories enable row level security;
alter table public.idea_items      enable row level security;

drop policy if exists "anon_read_idea_categories"   on public.idea_categories;
drop policy if exists "admins_read_idea_categories" on public.idea_categories;
drop policy if exists "anon_read_idea_items"        on public.idea_items;
drop policy if exists "admins_read_idea_items"      on public.idea_items;

-- Tout le monde, compte ou pas, lit ce qui est actif : c'est le catalogue public.
create policy "anon_read_idea_categories"
  on public.idea_categories for select
  to anon, authenticated
  using (is_active);

-- Un contenu n'est public que si SA CATEGORIE l'est aussi : masquer une
-- categorie doit retirer ses contenus de l'API, pas seulement de la page.
create policy "anon_read_idea_items"
  on public.idea_items for select
  to anon, authenticated
  using (is_active and exists (
    select 1 from public.idea_categories c
     where c.id = idea_items.category_id and c.is_active
  ));

-- L'admin voit aussi ce qui est desactive, pour pouvoir le reactiver.
create policy "admins_read_idea_categories"
  on public.idea_categories for select
  to authenticated
  using (public.is_admin());

create policy "admins_read_idea_items"
  on public.idea_items for select
  to authenticated
  using (public.is_admin());

grant select on public.idea_categories to anon, authenticated;
grant select on public.idea_items      to anon, authenticated;

-- ── 3. ecriture : categories ────────────────────────────────────────────────
-- Sans p_id on cree ; avec p_id on met a jour. Sans p_id mais avec un slug
-- deja pris dans cette langue, on met a jour cette ligne-la plutot que de
-- refuser : un import CSV rejoue deux fois doit rester sans effet.
--
-- Le slug n'est DEDUIT du libelle qu'a la creation. En mise a jour, un slug
-- vide garde l'ancien : renommer « Lieu » en « Lieux » ne doit pas changer
-- l'identifiant auquel les fichiers CSV de contenus font reference.

create or replace function public.admin_save_idea_category(
  p_id        uuid,
  p_locale    text,
  p_slug      text,
  p_label     text,
  p_emoji     text,
  p_position  integer,
  p_is_active boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_slug  text := lower(btrim(coalesce(p_slug, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_loc   text := lower(btrim(coalesce(p_locale, 'fr')));
  v_pos   integer := coalesce(p_position, 0);
  v_act   boolean := coalesce(p_is_active, true);
  v_id    uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if v_label is null then raise exception 'label is required'; end if;
  if length(v_label) > 60 then raise exception 'label too long (60 max)'; end if;
  if v_loc not in ('fr','en','de','es','pt','nl','it') then raise exception 'invalid locale: %', v_loc; end if;
  if v_slug <> '' and v_slug !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'invalid identifier "%": lowercase letters, digits and _ only', v_slug;
  end if;

  if p_id is not null then
    begin
      update public.idea_categories
         set locale = v_loc,
             slug = case when v_slug = '' then slug else v_slug end,
             label = v_label, emoji = v_emoji, position = v_pos, is_active = v_act
       where id = p_id
       returning id into v_id;
    exception when unique_violation then
      raise exception 'identifier already used in this language: %', coalesce(nullif(v_slug, ''), '(unchanged)');
    end;
    if v_id is null then raise exception 'idea category not found'; end if;
    return v_id;
  end if;

  -- Creation sans slug : on le derive du libelle. translate() plutot que
  -- l'extension unaccent, qui n'est pas activee sur ce projet ; œ et æ
  -- d'abord, parce que translate() ne remplace qu'un caractere par un seul.
  if v_slug = '' then
    v_slug := replace(replace(lower(v_label), 'œ', 'oe'), 'æ', 'ae');
    v_slug := translate(v_slug, 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
    v_slug := left(btrim(regexp_replace(v_slug, '[^a-z0-9]+', '_', 'g'), '_'), 40);
    v_slug := btrim(v_slug, '_');
    if v_slug = '' then
      raise exception 'cannot derive an identifier from "%": please set one', v_label;
    end if;
  end if;

  insert into public.idea_categories (locale, slug, label, emoji, position, is_active)
  values (v_loc, v_slug, v_label, v_emoji, v_pos, v_act)
  on conflict (locale, slug) do update
    set label = excluded.label, emoji = excluded.emoji,
        position = excluded.position, is_active = excluded.is_active
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_save_idea_category(uuid, text, text, text, text, integer, boolean) from public;
grant  execute on function public.admin_save_idea_category(uuid, text, text, text, text, integer, boolean) to authenticated;

create or replace function public.admin_delete_idea_category(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  delete from public.idea_categories where id = p_id;   -- les contenus suivent (on delete cascade)
  if not found then raise exception 'idea category not found'; end if;
end $$;
revoke all on function public.admin_delete_idea_category(uuid) from public;
grant  execute on function public.admin_delete_idea_category(uuid) to authenticated;

-- ── 4. ecriture : contenus ──────────────────────────────────────────────────

create or replace function public.admin_save_idea_item(
  p_id          uuid,
  p_category_id uuid,
  p_content     text,
  p_is_active   boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_txt text := nullif(btrim(coalesce(p_content, '')), '');
  v_act boolean := coalesce(p_is_active, true);
  v_id  uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if v_txt is null then raise exception 'content is required'; end if;
  if length(v_txt) > 300 then raise exception 'content too long'; end if;

  if p_id is not null then
    begin
      update public.idea_items
         set category_id = coalesce(p_category_id, category_id),
             content = v_txt, is_active = v_act
       where id = p_id
       returning id into v_id;
    exception
      when unique_violation then raise exception 'this content already exists in this category';
      when foreign_key_violation then raise exception 'idea category not found';
    end;
    if v_id is null then raise exception 'idea item not found'; end if;
    return v_id;
  end if;

  if p_category_id is null then raise exception 'category is required'; end if;
  if not exists (select 1 from public.idea_categories where id = p_category_id) then
    raise exception 'idea category not found';
  end if;
  -- Deja present : on renvoie la ligne existante (et on la reactive au passage).
  select id into v_id from public.idea_items
   where category_id = p_category_id and lower(btrim(content)) = lower(v_txt);
  if v_id is not null then
    update public.idea_items set content = v_txt, is_active = v_act where id = v_id;
    return v_id;
  end if;
  insert into public.idea_items (category_id, content, is_active)
  values (p_category_id, v_txt, v_act)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_save_idea_item(uuid, uuid, text, boolean) from public;
grant  execute on function public.admin_save_idea_item(uuid, uuid, text, boolean) to authenticated;

create or replace function public.admin_delete_idea_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  delete from public.idea_items where id = p_id;
  if not found then raise exception 'idea item not found'; end if;
end $$;
revoke all on function public.admin_delete_idea_item(uuid) from public;
grant  execute on function public.admin_delete_idea_item(uuid) to authenticated;
