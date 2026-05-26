-- migrate-inspirations-categories-v2.sql
-- Extends the inspiration_videos.category enum with new short-form impro
-- formats that were previously stuffed into the `theme` text field, then
-- migrates existing rows so `category` carries the format and `theme`
-- carries only the actual match / scene name.
--
-- Idempotent: safe to re-run. Run AFTER migrate-inspirations.sql.

-- ─── 1. Extend the CHECK constraint with the new enum values ───
-- New keys:
--   trois_mots       — "3 mots" / "Trois mots" format
--   abc              — "ABC" / "ABCdaire" alphabetical impro
--   carte_blanche    — full creative freedom format
--   contee           — "Contée" / "Contes" — storytelling format
--   freeze           — Freeze / Tag-out
--   un_mot_a_la_fois — Word-at-a-time collaborative narration
--   carre_hollandais — 4 actors form a square, rotate roles ("carré
--                      hollandais") between scenes — classic LiFi format
-- Polar / Télénovela / "à la manière de X" stay on the existing
-- `a_la_maniere_de` value with the X kept in the `theme` field.
do $$
begin
  alter table public.inspiration_videos
    drop constraint if exists inspiration_videos_category_chk;
  alter table public.inspiration_videos
    add constraint inspiration_videos_category_chk
      check (category is null or category in (
        'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
        'doublee','silencieuse','sportive','sans_contact','a_2','a_3',
        -- v2 additions:
        'trois_mots','abc','carte_blanche','contee','freeze','un_mot_a_la_fois','carre_hollandais'
      )) not valid;
  begin
    alter table public.inspiration_videos validate constraint inspiration_videos_category_chk;
  exception when check_violation then
    raise notice 'inspiration_videos_category_chk validate: some legacy rows violate, constraint kept NOT VALID';
  end;
end$$;

-- ─── 2. Fix legacy "sans_parole" (singular) typo that was inserted before
--      the constraint was tightened. Map to canonical 'sans_paroles'.
update public.inspiration_videos
   set category = 'sans_paroles'
 where category = 'sans_parole';

-- ─── 3. Migrate theme → category for entries where the theme field
--      actually holds a format name (mis-tagged data from the YouTube
--      titles scrape). Order matters: more specific first.

-- 3a. "Un mot à la fois" — exact phrase has priority (avoids accidental
--     matches like "Un mot à la suite" or similar variants).
update public.inspiration_videos
   set category = 'un_mot_a_la_fois',
       theme    = case
                    when lower(theme) = 'un mot à la fois' then null
                    else theme  -- preserve any extra context
                  end
 where category is null
   and theme ilike '%un mot à la fois%';

-- 3b. "3 mots" / "Trois mots"
update public.inspiration_videos
   set category = 'trois_mots',
       theme    = case
                    when lower(trim(theme)) in ('3 mots','trois mots','3 mots imposés','trois mots imposés') then null
                    else theme
                  end
 where category is null
   and (theme ilike '3 mots%' or theme ilike '%trois mots%');

-- 3c. ABC / ABCdaire
update public.inspiration_videos
   set category = 'abc',
       theme    = case when lower(trim(theme)) in ('abc','abcdaire') then null else theme end
 where category is null
   and (theme ilike 'abc%' or theme ilike '%abcdaire%');

-- 3d. Carte Blanche
update public.inspiration_videos
   set category = 'carte_blanche',
       theme    = case when lower(trim(theme)) = 'carte blanche' then null else theme end
 where category is null
   and theme ilike '%carte blanche%';

-- 3e. Chantée (with or without accent)
update public.inspiration_videos
   set category = 'chantee',
       theme    = case when lower(trim(theme)) in ('chantée','chantee') then null else theme end
 where category is null
   and (theme ilike '%chantée%' or theme ilike '%chantee%');

-- 3f. Contée / Contes
update public.inspiration_videos
   set category = 'contee',
       theme    = case when lower(trim(theme)) in ('contée','contee','contes') then null else theme end
 where category is null
   and (theme ilike '%contée%' or theme ilike '%contes%');

-- 3g. Freeze
update public.inspiration_videos
   set category = 'freeze',
       theme    = case when lower(trim(theme)) = 'freeze' then null else theme end
 where category is null
   and theme ilike '%freeze%';

-- 3h. Polar → a_la_maniere_de + keep "polar" as the theme (descriptive style).
update public.inspiration_videos
   set category = 'a_la_maniere_de',
       theme    = case when theme is null or trim(theme) = '' then 'polar' else theme end
 where category is null
   and theme ilike '%polar%';

-- 3i. Télénovela → a_la_maniere_de + keep télénovela as the theme.
update public.inspiration_videos
   set category = 'a_la_maniere_de',
       theme    = case
                    when theme is null or trim(theme) = '' then 'télénovela'
                    else theme
                  end
 where category is null
   and (theme ilike '%télénovela%' or theme ilike '%telenovela%');

-- 3j. Carré hollandais
update public.inspiration_videos
   set category = 'carre_hollandais',
       theme    = case when lower(trim(theme)) in ('carré hollandais','carre hollandais') then null else theme end
 where category is null
   and (theme ilike '%carré hollandais%' or theme ilike '%carre hollandais%');

-- ─── 4. Sanity check (visible in the SQL editor output) ───
select category, count(*) as n
  from public.inspiration_videos
 where category in (
   'trois_mots','abc','carte_blanche','contee','freeze','un_mot_a_la_fois','carre_hollandais',
   'a_la_maniere_de','chantee','sans_paroles'
 )
 group by category
 order by n desc;
