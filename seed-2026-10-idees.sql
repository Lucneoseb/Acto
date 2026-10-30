-- ============================================================================
--  seed-2026-10-idees.sql
--  A passer dans l'editeur SQL Supabase APRES migrate-2026-10-idees.sql.
--  Idempotent : re-executable sans creer de doublon, et sans jamais ecraser
--  ce qui a ete fait depuis la page admin (libelle, emoji, ordre, masquage
--  d'une categorie existante restent tels quels). Seule consequence d'un
--  second passage : un contenu de base SUPPRIME depuis l'admin revient.
-- ============================================================================

do $seed$
declare
  rec    record;
  v_cat  uuid;
  v_txt  text;
begin
  for rec in
    select * from (values
      ('expression', 'Expression', '💬', 10, array[
        'Mettre la charrue avant les bœufs',
        'Tomber des nues',
        'Chercher midi à quatorze heures',
        'Jeter l''éponge'
      ]::text[]),
      ('emotion', 'Émotion', '💓', 20, array[
        'Joie hystérique',
        'Colère refoulée',
        'Peur panique',
        'Mélancolie douce'
      ]),
      ('mot', 'Mot', '🔤', 30, array[
        'Parapluie',
        'Scaphandre',
        'Révolution',
        'Spatule',
        'Cacahuète'
      ]),
      ('personnage', 'Personnage', '🎩', 40, array[
        'Un roi déchu',
        'Un détective myope',
        'Une grand-mère hackeuse',
        'Un fantôme amnésique'
      ]),
      ('action', 'Action', '⚡', 50, array[
        'Enterrer un trésor',
        'Désamorcer une bombe',
        'Fuir un mariage',
        'Voler à l''étalage'
      ]),
      ('univers', 'Univers', '🌌', 60, array[
        'Science-fiction cyberpunk',
        'Far West',
        'Années folles (1920)',
        'Huis clos théâtral'
      ]),
      ('intention', 'Intention', '🎯', 70, array[
        'Prouver son innocence',
        'Séduire à tout prix',
        'Obtenir une promotion',
        'Faire avouer l''autre'
      ]),
      ('theme', 'Thème', '🎨', 80, array[
        'La trahison',
        'L''amour impossible',
        'Le choc des générations',
        'La fin du monde'
      ]),
      ('lieu', 'Lieu', '📍', 90, array[
        'Un ascenseur en panne',
        'Une station spatiale',
        'Une cuisine de grand restaurant',
        'Une file d''attente'
      ]),
      ('relation', 'Relation', '🔗', 100, array[
        'Anciens amants',
        'Père et fils fâchés',
        'Rivaux professionnels',
        'Deux inconnus dans un train'
      ]),
      ('metier', 'Métier', '🧰', 110, array[
        'Croque-mort',
        'Astronaute',
        'Testeur de matelas',
        'Avocat du diable'
      ]),
      ('categorie', 'Catégorie', '🎭', 120, array[
        'À la manière de Molière',
        'Sans paroles (Mime)',
        'Zapping',
        'Abécédaire'
      ]),
      ('prenom', 'Prénom', '🏷️', 130, array[
        'Jean-Jacques',
        'Gertrude',
        'Apollon',
        'Ursula'
      ])
    ) as t(slug, label, emoji, pos, items)
  loop
    insert into public.idea_categories (locale, slug, label, emoji, position)
    values ('fr', rec.slug, rec.label, rec.emoji, rec.pos)
    on conflict (locale, slug) do nothing;
    -- « do nothing » ne renvoie aucune ligne quand la categorie existe deja :
    -- on relit son id dans les deux cas.
    select id into v_cat from public.idea_categories
     where locale = 'fr' and slug = rec.slug;

    foreach v_txt in array rec.items loop
      insert into public.idea_items (category_id, content)
      select v_cat, v_txt
       where not exists (
         select 1 from public.idea_items
          where category_id = v_cat
            and lower(btrim(content)) = lower(btrim(v_txt))
       );
    end loop;
  end loop;
end $seed$;

-- Verification rapide : 13 categories, et le nombre de contenus par categorie.
select c.position, c.slug, c.label, count(i.id) as contenus
  from public.idea_categories c
  left join public.idea_items i on i.category_id = c.id
 where c.locale = 'fr'
 group by c.position, c.slug, c.label
 order by c.position;
