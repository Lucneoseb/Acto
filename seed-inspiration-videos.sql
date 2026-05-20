-- seed-inspiration-videos.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Seed data for public.inspiration_videos. Two sections:
--   A) The 19 curated entries from the original Google Sheet (URLs not in
--      the CSV export — admin will fill them in via the edit UI). All are
--      inserted with status='approved' and locale='fr'.
--   B) 15 additional well-known impro videos researched on YouTube. Each
--      URL was verified alive via the YouTube oEmbed endpoint at seed time;
--      duration_text is left NULL because oEmbed does not expose it
--      reliably and the JS-rendered watch page is not scrapable headlessly.
--      The admin can fill durations in via the edit UI.
--
-- Usage:
--   1. Apply supabase-setup-all.sql first (creates the table + RPCs).
--   2. Open the Supabase SQL editor and run this file. It is idempotent —
--      every insert is guarded by `not exists (… where title = …)` so it
--      can be re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── A) Spreadsheet seed (19 entries, status='approved', locale='fr') ───

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Impro.Comedy (chaîne)', 'Impro.Comedy', 'chaine', null, null, null, null, 'Point de départ — sketchs et formats courts d''impro', 'https://www.youtube.com/@Impro.Comedy', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Impro.Comedy (chaîne)');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi – L''improvisation théâtrale (chaîne)', 'LiFi', 'chaine', null, null, null, null, 'Ligue Française d''Improvisation, +30 ans, matchs pro', 'https://www.youtube.com/@lifilimprovisationtheatrale', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi – L''improvisation théâtrale (chaîne)');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les Improtagonistes (chaîne)', 'Les Improtagonistes', 'chaine', null, null, null, null, 'Troupe issue de la LiFi — matchs + longue forme', 'https://www.youtube.com/c/LesImprotagonistes', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les Improtagonistes (chaîne)');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Improvidence – Théâtre d''impro (chaîne)', 'Improvidence', 'chaine', null, null, null, null, '1er théâtre français 100% impro (Lyon + Bordeaux)', 'https://www.youtube.com/channel/UC1DygC-ZlJltS6kE_N11V5Q', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Improvidence – Théâtre d''impro (chaîne)');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Théâtre Improvisation (chaîne)', 'Théâtre Improvisation', 'chaine', null, null, null, null, 'Chaîne dédiée aux spectacles et reportages impro', 'https://www.youtube.com/channel/UCkswVEUhvKhuCHIQBflPstg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Théâtre Improvisation (chaîne)');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Match impro Festival Théa'' Fleurance', 'Festival Théa'' Fleurance', 'match_impro', 'mixte', 'libre', 'Dans le feu de l''action', null, 'Festival 2020 — Tarbes / Mirande / Condom', 'https://www.youtube.com/watch?v=jU8R9caLhlE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Match impro Festival Théa'' Fleurance');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'La Ligue d''Impro : Frapper sans entrer', 'La Ligue d''Impro', 'match_impro', null, null, 'Frapper sans entrer', null, null, 'https://www.youtube.com/watch?v=5CIVmU60-QY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'La Ligue d''Impro : Frapper sans entrer');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les catégories partie II – L''IMPRO DE 1 à Z', 'Improtéine', 'tutoriel', null, null, 'Catégories d''impro', null, 'Pédagogique : décrypte les catégories en match', 'https://www.youtube.com/watch?v=FjLQl1QKcss', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les catégories partie II – L''IMPRO DE 1 à Z');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Match d''impro international : Belgique vs Québec', '1''Assaut D''1mpro', 'match_impro', null, null, 'International', null, 'Mondial d''Impro 2007 — confrontation internationale', 'https://www.youtube.com/watch?v=ZemkX11JI98', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Match d''impro international : Belgique vs Québec');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Improvisades — match d''improvisation théâtrale', 'Improvisades', 'match_impro', null, null, null, null, null, 'https://www.youtube.com/watch?v=jsvNeqHs-xc', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Improvisades — match d''improvisation théâtrale');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'La zone libre des songes — HeroCorp vs Lily', 'HeroCorp / Lily', 'match_impro', null, 'a_la_maniere_de', 'La zone libre des songes', '7 min', 'Transbordeur, 24/03/2013, contrainte SF', 'https://www.youtube.com/watch?v=oDSH_p6mMfs', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'La zone libre des songes — HeroCorp vs Lily');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Improvisation comparée "coup de mou" — catégorie chantée', null, 'match_impro', 'comparee', 'chantee', 'Coup de mou', null, 'Bonne illustration de la catégorie chantée', 'https://www.youtube.com/watch?v=1hWMAPQUuzE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Improvisation comparée "coup de mou" — catégorie chantée');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les "Restons Calmes !" — match d''impro', 'Restons Calmes', 'match_impro', null, null, null, null, null, 'https://www.youtube.com/watch?v=BETbEwCI0nU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les "Restons Calmes !" — match d''impro');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'MATCH D''IMPROVISATION : Équipe de France – Lyon', 'Théâtre Improvisation', 'match_impro', null, null, 'France vs Lyon', null, null, 'https://www.youtube.com/watch?v=HsccV-ImjX0', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'MATCH D''IMPROVISATION : Équipe de France – Lyon');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Festival Improneuf — 1/4 finale : Paris vs Tortues d''Janine', 'Ligue Improvisation Paris / Tortues d''Janine', 'match_impro', null, null, 'Festival Improneuf', null, null, 'https://www.youtube.com/watch?v=ugf22AuQ9XU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Festival Improneuf — 1/4 finale : Paris vs Tortues d''Janine');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Le match d''impro : une invention québécoise', 'maprofdefrançais', 'documentaire', null, null, 'Histoire / origine du match', null, 'Contexte historique', 'https://www.youtube.com/watch?v=YQ_ChfOfpwY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Le match d''impro : une invention québécoise');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Le match d''impro théâtre', 'YEP''S', 'tutoriel', null, null, 'Présentation du format', null, 'Bonne introduction pour débutants', 'https://www.youtube.com/watch?v=D73wDVMa10k', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Le match d''impro théâtre');

insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro L''Engrenage — Saison 1 Match 11', 'L''Engrenage', 'match_impro', null, null, null, null, null, 'https://www.youtube.com/watch?v=_peLWjiGxOQ', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro L''Engrenage — Saison 1 Match 11');

-- ─── B) Researched additions (15 entries, verified via YouTube oEmbed) ───
--
-- Each video_url was confirmed alive at seed time by hitting
-- https://www.youtube.com/oembed?url=…&format=json and receiving a
-- valid JSON payload. duration_text is left NULL — oEmbed does not
-- expose it; admin can fill it via the edit UI after viewing.

-- 1. UCB ASSSSCAT (the legendary UCB longform show)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Upright Citizens Brigade — ASSSSCAT Improv', 'Upright Citizens Brigade', 'spectacle', null, null, 'Harold / longue forme', null, 'Le show longue forme historique de l''UCB (New York) — référence absolue du Harold', 'https://www.youtube.com/watch?v=P4HTxmqNTCY', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Upright Citizens Brigade — ASSSSCAT Improv');

-- 2. Improvised Shakespeare — Wednesday at the Waffle House
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'The Improvised Shakespeare Company — Wednesday at the Waffle House', 'The 92nd Street Y', 'spectacle', null, 'a_la_maniere_de', 'Shakespeare improvisé', null, 'Une pièce entière improvisée à la manière de Shakespeare à partir d''un titre du public', 'https://www.youtube.com/watch?v=Ljh_LeMucJI', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'The Improvised Shakespeare Company — Wednesday at the Waffle House');

-- 3. Improvised Shakespeare Company Stand Up - 2009 (Just For Laughs)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Improvised Shakespeare Company Stand Up — 2009', 'Just For Laughs', 'spectacle', null, 'a_la_maniere_de', 'Shakespeare improvisé', null, 'Captation Just For Laughs (Montréal) — extrait représentatif de la troupe', 'https://www.youtube.com/watch?v=rX77W-0iQmY', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Improvised Shakespeare Company Stand Up — 2009');

-- 4. Del Close 1986 — the Harold's founder
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Del Close 1986', 'city worker', 'documentaire', null, null, 'Naissance du Harold', null, 'Profil 1986 de Del Close (créateur du Harold) — archive historique', 'https://www.youtube.com/watch?v=dQzzLmR93o8', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Del Close 1986');

-- 5. LNI — Demi-finales SCC2019
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Toujours prêt" — ORANGES | SCC2019 Demi-finales', 'Théâtre de la LNI', 'match_impro', 'mixte', null, 'Toujours prêt', null, 'Coupe Charade 2019 — demi-finale de la Ligue Nationale d''Improvisation (Québec)', 'https://www.youtube.com/watch?v=11qnwm2pNZU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Toujours prêt" — ORANGES | SCC2019 Demi-finales');

-- 6. LNI sur TV5 — Équipe Québec
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'TV5 — Ligue Nationale d''Improvisation (LNI) Équipe Québec', 'FabTeeVee', 'match_impro', null, null, null, null, 'Captation TV5 — match de la LNI, format québécois classique', 'https://www.youtube.com/watch?v=YQcSSr47oKE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'TV5 — Ligue Nationale d''Improvisation (LNI) Équipe Québec');

-- 7. La LNI a 35 ans
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'La LNI a 35 ans', 'Théâtre de la LNI', 'documentaire', null, null, 'Histoire de la LNI', null, 'Rétrospective des 35 ans de la Ligue Nationale d''Improvisation', 'https://www.youtube.com/watch?v=5PnM3FB2JwQ', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'La LNI a 35 ans');

-- 8. 35e anniversaire LNI (DGQ Paris)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '35e anniversaire de la Ligue Nationale d''Improvisation du Québec', 'DGQParis', 'documentaire', null, null, 'Histoire de la LNI', null, 'Reportage anniversaire — invention québécoise du match d''impro', 'https://www.youtube.com/watch?v=aaF0w9VVL7g', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '35e anniversaire de la Ligue Nationale d''Improvisation du Québec');

-- 9. Improtéine — C'est quoi "improviser" ?
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'C''est quoi "improviser" ? — L''IMPRO DE 1 à Z', 'Improtéine', 'tutoriel', null, null, 'Fondamentaux', null, 'Épisode introductif de la série pédagogique d''Improtéine', 'https://www.youtube.com/watch?v=kXggGOp8axs', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'C''est quoi "improviser" ? — L''IMPRO DE 1 à Z');

-- 10. Improtéine — Les punitions, partie II
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les punitions, partie II — L''IMPRO DE 1 à Z', 'Improtéine', 'tutoriel', null, null, 'Règles du match', null, 'Décrypte les punitions de match (cabotinage, rudesse, etc.)', 'https://www.youtube.com/watch?v=5Ql5Xs_VIp0', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les punitions, partie II — L''IMPRO DE 1 à Z');

-- 11. Improtéine — L'importance du personnage
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'L''importance du personnage — L''IMPRO DE 1 à Z', 'Improtéine', 'tutoriel', null, null, 'Construction du personnage', null, 'Pédagogie sur l''ancrage et la construction du personnage en impro', 'https://www.youtube.com/watch?v=PBQpYKrj3ds', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'L''importance du personnage — L''IMPRO DE 1 à Z');

-- 12. Improtéine — L'importance de l'histoire
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'L''importance de l''histoire — L''IMPRO DE 1 à Z', 'Improtéine', 'tutoriel', null, null, 'Narration', null, 'Pédagogie sur la structure narrative et la dramaturgie en impro', 'https://www.youtube.com/watch?v=1Q-gCC7K-U8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'L''importance de l''histoire — L''IMPRO DE 1 à Z');

-- 13. Keith Johnstone — sur l'origine du Theatresports
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Keith Johnstone on the origin of Theatresports (Part 13 of 20)', 'Canada''s Theatre Museum', 'documentaire', null, null, 'Theatresports', null, 'Entretien avec le créateur du Theatresports — comment le format est né en Alberta', 'https://www.youtube.com/watch?v=hkCuGGMVr4s', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Keith Johnstone on the origin of Theatresports (Part 13 of 20)');

-- 14. Middleditch & Schwartz — Trailer (Netflix)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Middleditch & Schwartz — Official Trailer (Netflix)', 'Netflix', 'spectacle', null, null, 'Duo longform', null, 'Bande-annonce du premier special d''impro longform sur Netflix — un duo, une suggestion, 50 min d''histoire', 'https://www.youtube.com/watch?v=2Vao8d50hzw', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Middleditch & Schwartz — Official Trailer (Netflix)');

-- 15. Whose Line UK — Ryan Stiles & Greg Proops (Batman & Robin)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Whose Line UK — Ryan Stiles & Greg Proops as Batman and Robin (S04E05)', 'Comedy Hits', 'format_court', null, 'a_la_maniere_de', 'Film & Theater Styles', null, 'Format court "à la manière de" — un grand classique du format Whose Line', 'https://www.youtube.com/watch?v=xpnNfKeauwM', 'en', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Whose Line UK — Ryan Stiles & Greg Proops as Batman and Robin (S04E05)');

-- ─── End of seed ───
