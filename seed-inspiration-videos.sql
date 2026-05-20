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

-- ─── C) Impro.Comedy shorts (33 entries, scraped from /shorts and verified ───
-- via YouTube oEmbed). The full catalog of the channel's short-form output
-- at seed time — chaîne francophone basée à Nancy, formats Fausse Conférence,
-- Un mot à la fois, FREEZE, Lettre Interdite, Émotions, Tribunal, etc.
-- Tous content_type='format_court'.

-- 1. Fausse Conférence — Johnny Hallyday en hongrois
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Il chante Johnny Hallyday en Hongrois !" IMPRO : Fausse Conférence Traduite', 'Impro.Comedy', 'format_court', null, null, 'Fausse conférence traduite', null, 'Short Impro.Comedy — format Fausse Conférence Traduite', 'https://www.youtube.com/shorts/sRXWvzkpbJM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Il chante Johnny Hallyday en Hongrois !" IMPRO : Fausse Conférence Traduite');

-- 2. Fausse Conférence — Il s'est tapé ma meuf
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Il s''est tapé ma meuf !" IMPRO : Fausse conférence', 'Impro.Comedy', 'format_court', null, null, 'Fausse conférence', null, 'Short Impro.Comedy — format Fausse Conférence', 'https://www.youtube.com/shorts/THR73DxMuN8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Il s''est tapé ma meuf !" IMPRO : Fausse conférence');

-- 3. Tribunal — Il est en train d'immoler le tribunal
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Il est en train d''immoler le tribunal !" IMPRO', 'Impro.Comedy', 'format_court', null, null, 'Tribunal', null, 'Short Impro.Comedy — format Tribunal', 'https://www.youtube.com/shorts/2rURRbcf3dI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Il est en train d''immoler le tribunal !" IMPRO');

-- 4. Tribunal — Défendre un enfant pyromane
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Impro Tribunal : Il doit défendre un enfant pyromane !', 'Impro.Comedy', 'format_court', null, null, 'Tribunal', null, 'Short Impro.Comedy — format Tribunal, plaidoirie improvisée', 'https://www.youtube.com/shorts/Xloo2TJnJuA', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Impro Tribunal : Il doit défendre un enfant pyromane !');

-- 5. Tribunal — Procès d'un enfant du public (Live de Noël P1)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'IMPRO : Ils font le procès d''un enfant du public ! P1 — Impro Comedy Live de Noël', 'Impro.Comedy', 'format_court', null, null, 'Tribunal', null, 'Short Impro.Comedy — extrait du Live de Noël, format Tribunal', 'https://www.youtube.com/shorts/u_YwaMCfkn0', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'IMPRO : Ils font le procès d''un enfant du public ! P1 — Impro Comedy Live de Noël');

-- 6. Lettre Interdite — Le C
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Interdit de prononcer le C ! IMPRO : Lettre Interdite', 'Impro.Comedy', 'format_court', null, null, 'Lettre interdite', null, 'Short Impro.Comedy — format Lettre Interdite (C)', 'https://www.youtube.com/shorts/Fd1PpNAzLnM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Interdit de prononcer le C ! IMPRO : Lettre Interdite');

-- 7. Un Mot à la fois — Vous êtes complétement débile
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Vous êtes complétement débile ?!" IMPRO : Un Mot à la fois !', 'Impro.Comedy', 'format_court', null, null, 'Un mot à la fois', null, 'Short Impro.Comedy — format Un mot à la fois', 'https://www.youtube.com/shorts/wNKRpLpJPKY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Vous êtes complétement débile ?!" IMPRO : Un Mot à la fois !');

-- 8. Un Mot à la fois — Je vous assigne en Justice
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Je vous assigne en Justice !" IMPRO : Un Mot à la fois !', 'Impro.Comedy', 'format_court', null, null, 'Un mot à la fois', null, 'Short Impro.Comedy — format Un mot à la fois', 'https://www.youtube.com/shorts/zoWqY_LCkNQ', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Je vous assigne en Justice !" IMPRO : Un Mot à la fois !');

-- 9. Un mec bourré intervient en spectacle
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Un mec bourré intervient en spectacle ! IMPRO', 'Impro.Comedy', 'format_court', null, null, 'Interaction public', null, 'Short Impro.Comedy — gestion d''un spectateur turbulent en live', 'https://www.youtube.com/shorts/DRSzFS2Pnug', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Un mec bourré intervient en spectacle ! IMPRO');

-- 10. FREEZE — Flûte du sourcil
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"J''ai sorti une flûte de mon sourcil !" IMPRO : FREEZE !', 'Impro.Comedy', 'format_court', null, null, 'Freeze', null, 'Short Impro.Comedy — format Freeze (changement de position)', 'https://www.youtube.com/shorts/xFGAmFyKMKM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"J''ai sorti une flûte de mon sourcil !" IMPRO : FREEZE !');

-- 11. Telenovela — Il m'avait juré qu'il était décédé
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Il m''avait juré qu''il était décédé !" IMPRO : Telenovela', 'Impro.Comedy', 'format_court', null, 'a_la_maniere_de', 'Telenovela', null, 'Short Impro.Comedy — à la manière de la telenovela', 'https://www.youtube.com/shorts/Ta-D7-cN1Vg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Il m''avait juré qu''il était décédé !" IMPRO : Telenovela');

-- 12. Le public termine — Il dégaine des apôtres
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Il dégaine des apôtres !" IMPRO : Le public termine !', 'Impro.Comedy', 'format_court', null, null, 'Le public termine', null, 'Short Impro.Comedy — le public termine la phrase', 'https://www.youtube.com/shorts/7CQIh8CAPBI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Il dégaine des apôtres !" IMPRO : Le public termine !');

-- 13. ABC — De l'eau dans ton vin
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"De l''eau dans ton vin ?" IMPRO : ABC', 'Impro.Comedy', 'format_court', null, null, 'ABC', null, 'Short Impro.Comedy — format ABC (répliques par ordre alphabétique)', 'https://www.youtube.com/shorts/XrlAYQj2Tsg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"De l''eau dans ton vin ?" IMPRO : ABC');

-- 14. Lettre Interdite — Un moment privilégié
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Un moment privilégié !" IMPRO : LETTRE INTERDITE', 'Impro.Comedy', 'format_court', null, null, 'Lettre interdite', null, 'Short Impro.Comedy — format Lettre Interdite', 'https://www.youtube.com/shorts/dz7fO2braOI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Un moment privilégié !" IMPRO : LETTRE INTERDITE');

-- 15. CHANGE — Mon père est sorti de la photocopieuse
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Mon père est sorti de la photocopieuse !" IMPRO : CHANGE !', 'Impro.Comedy', 'format_court', null, null, 'Change', null, 'Short Impro.Comedy — format Change (l''arbitre relance la phrase)', 'https://www.youtube.com/shorts/pFJEl1DNv8s', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Mon père est sorti de la photocopieuse !" IMPRO : CHANGE !');

-- 16. Genres — Tornade sur Charleville-Mézières
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Une tornade sur Charleville Mézières ! IMPRO : Genres !', 'Impro.Comedy', 'format_court', null, null, 'Genres', null, 'Short Impro.Comedy — format Genres (changement de registre)', 'https://www.youtube.com/shorts/Pc6iVv-5Rzg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Une tornade sur Charleville Mézières ! IMPRO : Genres !');

-- 17. Un Mot à la Fois — Vous trichez ?! [Bonus]
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"VOUS TRICHEZ ?!" IMPRO : Un Mot à la Fois. [Bonus]', 'Impro.Comedy', 'format_court', null, null, 'Un mot à la fois', null, 'Short Impro.Comedy — bonus du format Un mot à la fois', 'https://www.youtube.com/shorts/KyK_nd9kaXQ', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"VOUS TRICHEZ ?!" IMPRO : Un Mot à la Fois. [Bonus]');

-- 18. Un Mot à la fois — On va vous traquer
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"On va vous traquer." IMPRO : Un Mot à la fois !', 'Impro.Comedy', 'format_court', null, null, 'Un mot à la fois', null, 'Short Impro.Comedy — format Un mot à la fois', 'https://www.youtube.com/shorts/-Gb4s9Tvhoo', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"On va vous traquer." IMPRO : Un Mot à la fois !');

-- 19. Un mot à la fois — Les violets sont immangeables
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Les violets sont immangeables" IMPRO : Un mot à la fois !', 'Impro.Comedy', 'format_court', null, null, 'Un mot à la fois', null, 'Short Impro.Comedy — format Un mot à la fois', 'https://www.youtube.com/shorts/3KLskkxMfzw', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Les violets sont immangeables" IMPRO : Un mot à la fois !');

-- 20. FREEZE — On avait dit qu'on pimentait notre couple
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"On avait dit qu''on pimentait notre couple !" IMPRO : FREEZE !', 'Impro.Comedy', 'format_court', null, null, 'Freeze', null, 'Short Impro.Comedy — format Freeze', 'https://www.youtube.com/shorts/hSKmIFIdJKk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"On avait dit qu''on pimentait notre couple !" IMPRO : FREEZE !');

-- 21. 3 MOTS — J'adore être riche
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"J''adore être riche !" IMPRO : 3 MOTS !', 'Impro.Comedy', 'format_court', null, null, '3 mots', null, 'Short Impro.Comedy — format 3 mots (chaque réplique de 3 mots)', 'https://www.youtube.com/shorts/12e83mjxpBM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"J''adore être riche !" IMPRO : 3 MOTS !');

-- 22. Lettre L Interdite — Quelqu'un a triché
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Quelqu''un a triché ! IMPRO : Lettre L Interdite !', 'Impro.Comedy', 'format_court', null, null, 'Lettre interdite', null, 'Short Impro.Comedy — format Lettre Interdite (L)', 'https://www.youtube.com/shorts/bDpaup9EjYA', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Quelqu''un a triché ! IMPRO : Lettre L Interdite !');

-- 23. Fausse Conférence — Elles me font des frotti frotta
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Elles me font des frotti frotta !" IMPRO : Fausse Conférence', 'Impro.Comedy', 'format_court', null, null, 'Fausse conférence', null, 'Short Impro.Comedy — format Fausse Conférence', 'https://www.youtube.com/shorts/wpPqziqXbzQ', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Elles me font des frotti frotta !" IMPRO : Fausse Conférence');

-- 24. Émotions — Vous avez une très grosse cravate
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Vous avez une très grosse cravate..." IMPRO : Émotions', 'Impro.Comedy', 'format_court', null, null, 'Émotions', null, 'Short Impro.Comedy — format Émotions (changement d''émotion sur signal)', 'https://www.youtube.com/shorts/IakVSb2L6XE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Vous avez une très grosse cravate..." IMPRO : Émotions');

-- 25. Émotions — Espèce de petit enfoiré
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Espèce de petit enfoiré!" IMPRO : Émotions', 'Impro.Comedy', 'format_court', null, null, 'Émotions', null, 'Short Impro.Comedy — format Émotions', 'https://www.youtube.com/shorts/BvLq7bLPdGE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Espèce de petit enfoiré!" IMPRO : Émotions');

-- 26. Chanson improvisée — Vestiaire des filles
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"J''ai composé une chanson pour le vestiaire des filles" IMPRO', 'Impro.Comedy', 'format_court', null, null, 'Chantée', null, 'Short Impro.Comedy — chanson improvisée', 'https://www.youtube.com/shorts/u47Z_LSv5Ic', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"J''ai composé une chanson pour le vestiaire des filles" IMPRO');

-- 27. Lettre Interdite — Mi enfant, mi taupe
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Mi enfant, Mi Taupe !" IMPRO : Lettre Interdite', 'Impro.Comedy', 'format_court', null, null, 'Lettre interdite', null, 'Short Impro.Comedy — format Lettre Interdite', 'https://www.youtube.com/shorts/pEunPOgdspo', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Mi enfant, Mi Taupe !" IMPRO : Lettre Interdite');

-- 28. ABC — Ils ont installé des fenêtres
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Ils ont installé des fenêtres ?!" IMPRO ABC', 'Impro.Comedy', 'format_court', null, null, 'ABC', null, 'Short Impro.Comedy — format ABC', 'https://www.youtube.com/shorts/4pqQkQpsVxk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Ils ont installé des fenêtres ?!" IMPRO ABC');

-- 29. PAROLES — On m'appelle l'Ovni
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"On m''appelle l''Ovni." IMPRO PAROLES !', 'Impro.Comedy', 'format_court', null, null, 'Paroles', null, 'Short Impro.Comedy — format Paroles (citation imposée)', 'https://www.youtube.com/shorts/IOBLh8jsmX8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"On m''appelle l''Ovni." IMPRO PAROLES !');

-- 30. TWIST — Il invoque un démon breton
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Il invoque un démon breton ! (IMPRO : TWIST !)', 'Impro.Comedy', 'format_court', null, null, 'Twist', null, 'Short Impro.Comedy — format Twist (retournement narratif)', 'https://www.youtube.com/shorts/xa35iCPRIXM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Il invoque un démon breton ! (IMPRO : TWIST !)');

-- 31. Halte là !
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Halte là ! — Impro.Comedy', 'Impro.Comedy', 'format_court', null, null, null, null, 'Short Impro.Comedy — extrait de spectacle', 'https://www.youtube.com/shorts/irIUrWVXkQU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Halte là ! — Impro.Comedy');

-- 32. Je t'assure que ça va être bon !
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Je t''assure que ça va être bon !" — Impro.Comedy', 'Impro.Comedy', 'format_court', null, null, null, null, 'Short Impro.Comedy — extrait de spectacle', 'https://www.youtube.com/shorts/n9iQEXFcrB4', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Je t''assure que ça va être bon !" — Impro.Comedy');

-- 33. Très très très drôle !
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '"Très très très drôle !" — Impro.Comedy', 'Impro.Comedy', 'format_court', null, null, null, null, 'Short Impro.Comedy — extrait de spectacle', 'https://www.youtube.com/shorts/UAKhEskHicg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '"Très très très drôle !" — Impro.Comedy');

-- ─── D) LiFi — Ligue Française d'Improvisation (9 entries, verified via watch-page metadata) ───
-- NB: every video on this channel uses the channel name as its YouTube title,
-- so the titles below are descriptive synthèses tirées des descriptions des vidéos.

-- D.1 Spectacle « Cétoiki » — contes interactifs
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Spectacle « Cétoiki » (contes interactifs)', 'LiFi', 'spectacle', null, null, 'Contes / reine des contes', null, 'Spectacle LiFi où le public choisit le déroulement de l''histoire', 'https://www.youtube.com/watch?v=KcNv5mZhsEc', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Spectacle « Cétoiki » (contes interactifs)');

-- D.2 Match de fin d'année des apprentis
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Match d''impro des apprentis (fin d''année)', 'LiFi', 'match_impro', null, null, null, null, 'Match de fin d''année des apprentis de la LiFi', 'https://www.youtube.com/watch?v=6swjoCvMRlI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Match d''impro des apprentis (fin d''année)');

-- D.3 Vidéo pédagogique « Comment se passe un match d'impro »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Ça se passe comment un match d''impro ?', 'LiFi', 'tutoriel', null, null, null, null, 'Vidéo explicative sur le déroulement d''un match d''impro', 'https://www.youtube.com/watch?v=hmsDFFz0Pms', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Ça se passe comment un match d''impro ?');

-- D.4 Documentaire « Une rencontre improvisée avec la LiFi »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Une rencontre improvisée avec la LiFi (documentaire)', 'LiFi', 'documentaire', null, null, null, null, 'Film de Géraldine Dehayes sur les coulisses des ateliers et matchs LiFi', 'https://www.youtube.com/watch?v=4jk6phm_NvM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Une rencontre improvisée avec la LiFi (documentaire)');

-- D.5 Improvisation comparée « Tour de magie »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Impro comparée « Tour de magie » (Faites entrer l''accusé)', 'LiFi', 'match_impro', 'comparee', null, 'Tour de magie', '3 minutes', 'Catégorie LiFi — impro comparée à la manière de « Faites entrer l''accusé »', 'https://www.youtube.com/watch?v=g-Ha61Pkoh0', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Impro comparée « Tour de magie » (Faites entrer l''accusé)');

-- D.6 Improvisation mixte « Le temps du séchage »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Impro mixte « Le temps du séchage »', 'LiFi', 'match_impro', 'mixte', null, 'Le temps du séchage', '5 minutes', 'Catégorie LiFi — impro mixte', 'https://www.youtube.com/watch?v=3XhyB_BAIyU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Impro mixte « Le temps du séchage »');

-- D.7 Improvisation comparée « Galerie »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Impro comparée « Galerie »', 'LiFi', 'match_impro', 'comparee', null, 'Galerie', '2 minutes', 'Catégorie LiFi — impro comparée', 'https://www.youtube.com/watch?v=sbZMK48rAlI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Impro comparée « Galerie »');

-- D.8 Teaser match d'improvisation
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Teaser : la LiFi présente un match d''impro', 'LiFi', 'match_impro', null, null, null, null, 'Teaser de présentation des matchs LiFi', 'https://www.youtube.com/watch?v=ESUNm-90w2Q', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Teaser : la LiFi présente un match d''impro');

-- D.9 Teaser LiFi Impro Junior
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LiFi — Teaser LiFi Impro Junior (ateliers ados)', 'LiFi', 'documentaire', null, null, null, null, 'Présentation des stages et ateliers LiFi Impro Junior pour les adolescents', 'https://www.youtube.com/watch?v=ycarunN5QS4', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LiFi — Teaser LiFi Impro Junior (ateliers ados)');

-- ─── E) Les Improtagonistes (19 entries, verified via watch-page metadata) ───

-- E.1 Teaser « Le Béret de la Tortue »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Teaser le Béret de la Tortue', 'Les Improtagonistes', 'spectacle', null, null, null, null, 'Teaser du spectacle « Le Béret de la Tortue » — Collectif Théâtral de Courbevoie / Improtagonistes', 'https://www.youtube.com/watch?v=Nq6s1b-HiuI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Teaser le Béret de la Tortue');

-- E.2 Match Improtagonistes vs Traits d'Union (2018)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'IMPROTAGONISTES vs TRAITS D''UNION le 26/01/17', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro Improtagonistes contre Traits d''Union — saison 2017/2018', 'https://www.youtube.com/watch?v=BgEu6N_mnVM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'IMPROTAGONISTES vs TRAITS D''UNION le 26/01/17');

-- E.3 Improtagonistes vs LISM
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'IMPROTAGONISTES vs LISM !', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro Improtagonistes contre LISM (Seine-et-Marne)', 'https://www.youtube.com/watch?v=Ums90y21Afw', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'IMPROTAGONISTES vs LISM !');

-- E.4 Match Improtagonistes vs Free Rouges (caritatif AIDES)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Match d''impro : IMPROTAGONISTES vs FREE ROUGES !', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro caritatif au profit de l''association AIDES', 'https://www.youtube.com/watch?v=NDjMnBheMUU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Match d''impro : IMPROTAGONISTES vs FREE ROUGES !');

-- E.5 Improtagonistes invitent les Non-Sens
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les IMPROTAGONISTES invitent les NON-SENS !', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro Improtagonistes vs Non-Sens — Centre d''Animation Les Halles', 'https://www.youtube.com/watch?v=k-4OvN8YUcY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les IMPROTAGONISTES invitent les NON-SENS !');

-- E.6 Concept « Les Passagers » avec guests
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les Improtagonistes présentent : "LES PASSAGERS - SPÉCIAL GUESTS"', 'Les Improtagonistes', 'spectacle', null, null, null, null, 'Concept « Les Passagers » avec joueurs invités — Improtagonistes', 'https://www.youtube.com/watch?v=4RfWc4jE5TM', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les Improtagonistes présentent : "LES PASSAGERS - SPÉCIAL GUESTS"');

-- E.7 Match Improtagonistes vs Traits d'Union (14 avril)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Match d''impro "Les Improtagonistes vs Les Traits d''Union"', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro Improtagonistes vs Traits d''Union — Les Halles', 'https://www.youtube.com/watch?v=Up-BJs_xlm4', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Match d''impro "Les Improtagonistes vs Les Traits d''Union"');

-- E.8 Match Improtagonistes vs Drôles de Cailles
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Match d''impro "Improtagonistes vs Drôles de Cailles"', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro Improtagonistes vs Drôles de Cailles', 'https://www.youtube.com/watch?v=Uf2_RoovfGk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Match d''impro "Improtagonistes vs Drôles de Cailles"');

-- E.9 Match Femmes vs Hommes
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LES IMPROTAGONISTES présentent : MATCH D''IMPRO "FEMMES vs HOMMES"', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro thématique « Femmes vs Hommes » — Improtagonistes', 'https://www.youtube.com/watch?v=FgLTVO2IYC4', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LES IMPROTAGONISTES présentent : MATCH D''IMPRO "FEMMES vs HOMMES"');

-- E.10 Impro Bingo (Apérock Café)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LES IMPROTAGONISTES présentent : "Impro Bingo" le retour !', 'Les Improtagonistes', 'spectacle', null, null, null, null, 'Concept « Impro Bingo » à l''Apérock Café — Improtagonistes', 'https://www.youtube.com/watch?v=nMsTuOXqyZw', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LES IMPROTAGONISTES présentent : "Impro Bingo" le retour !');

-- E.11 Teaser « Les Passagers »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les IMPROTAGONISTES présentent : "Les passagers" (teaser 01)', 'Les Improtagonistes', 'spectacle', null, null, null, null, 'Teaser du concept « Les Passagers » — Improtagonistes', 'https://www.youtube.com/watch?v=roobE-O5pdU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les IMPROTAGONISTES présentent : "Les passagers" (teaser 01)');

-- E.12 Match Improtagonistes vs Malades de l'Imaginaire
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LES IMPROTAGONISTES vs LES MALADES DE L''IMAGINAIRE', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Revanche entre Improtagonistes et Les Malades de l''Imaginaire', 'https://www.youtube.com/watch?v=2xjUq78nBeY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LES IMPROTAGONISTES vs LES MALADES DE L''IMAGINAIRE');

-- E.13 Match Jeunots vs Anciens (anniversaire)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les Improtagonistes présentent "Les Jeunots vs Les Anciens"', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match anniversaire des Improtagonistes : Jeunots vs Anciens', 'https://www.youtube.com/watch?v=pSze1Ht5zio', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les Improtagonistes présentent "Les Jeunots vs Les Anciens"');

-- E.14 « Le Défi des Résidents » (3 troupes)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les Improtagonistes présentent "Le Défi des Résidents"', 'Les Improtagonistes', 'spectacle', null, null, null, null, 'Spectacle au Patronage Laïque Jules Vallès — 3 troupes d''impro', 'https://www.youtube.com/watch?v=HLrMNLr5Wvo', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les Improtagonistes présentent "Le Défi des Résidents"');

-- E.15 Match Improtagonistes vs Arbitres
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'MATCH D''IMPRO : IMPROTAGONISTES VS ARBITRES !', 'Les Improtagonistes', 'match_impro', null, null, null, null, 'Match d''impro inversé : les arbitres jouent contre les Improtagonistes', 'https://www.youtube.com/watch?v=UnLU369liDY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'MATCH D''IMPRO : IMPROTAGONISTES VS ARBITRES !');

-- E.16 Impro Bingo (12/10/14)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'IMPRO BINGO le 12/10/14', 'Les Improtagonistes', 'spectacle', null, null, null, null, 'Soirée « Impro Bingo » à l''Apérock Café — Improtagonistes', 'https://www.youtube.com/watch?v=MNryzwBV6S8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'IMPRO BINGO le 12/10/14');

-- E.17 Clip saison 2014/2015
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les Improtagonistes : Saison parisienne 2014 / 2015', 'Les Improtagonistes', 'documentaire', null, null, null, null, 'Clip de présentation de la saison parisienne 2014/2015', 'https://www.youtube.com/watch?v=Xasy5TqjmXk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les Improtagonistes : Saison parisienne 2014 / 2015');

-- E.18 Extrait Improtagonistes vs LiFi — comédie musicale (La télécommande)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Match Improtagonistes vs LIFI : "La télécommande" (extrait)', 'Les Improtagonistes', 'match_impro', null, 'chantee', 'La télécommande', null, 'Extrait — impro à la manière d''une comédie musicale, Improtagonistes vs LiFi', 'https://www.youtube.com/watch?v=PgRkJM8ETRk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Match Improtagonistes vs LIFI : "La télécommande" (extrait)');

-- E.19 Clip Improtagonistes 2014/2015
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Clip Improtagonistes 2014/2015', 'Les Improtagonistes', 'documentaire', null, null, null, null, 'Clip estival des Improtagonistes — saison 2014/2015', 'https://www.youtube.com/watch?v=8fRZ2bTTEdk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Clip Improtagonistes 2014/2015');

-- ─── F) Improvidence — Théâtre d'impro (Lyon / Bordeaux) (20 entries, verified via watch-page metadata) ───

-- F.1 Teaser « La fin justifie les moyens »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser spectacle] La fin justifie les moyens', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — spectacle improvisé Improvidence', 'https://www.youtube.com/watch?v=sdx_YlPxgEw', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser spectacle] La fin justifie les moyens');

-- F.2 Confort Zone (huis clos)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Confort Zone Expérience immersive en huis clos', 'Improvidence', 'spectacle', null, null, null, null, 'Spectacle immersif en huis clos — Improvidence', 'https://www.youtube.com/watch?v=w2X-W1QXFAU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Confort Zone Expérience immersive en huis clos');

-- F.3 Teaser « Témoins »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[teaser spectacle] Témoins', 'Improvidence', 'spectacle', null, null, 'Mariage', null, 'Teaser — Mathilde et Thomas, témoins de mariage, comédie improvisée Improvidence', 'https://www.youtube.com/watch?v=kbfzB0QQGlY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[teaser spectacle] Témoins');

-- F.4 Teaser « De Jour en Jour »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser spectacle] De Jour en Jour', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — spectacle sur l''évolution d''une relation au fil des décennies', 'https://www.youtube.com/watch?v=mOannzhCW7U', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser spectacle] De Jour en Jour');

-- F.5 Teaser « La Doublure » (Christophe Bouquet)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser Spectacle] La Doublure', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — solo improvisé inspiré d''une personne du public, par Christophe Bouquet', 'https://www.youtube.com/watch?v=ggSILbgVNa8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser Spectacle] La Doublure');

-- F.6 Teaser « C'est ici que ça se passe »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser] C''est ici que ça se passe', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — spectacle improvisé interactif basé sur les anecdotes du public', 'https://www.youtube.com/watch?v=JyfcPJbPWTo', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser] C''est ici que ça se passe');

-- F.7 Teaser « Scènes de Crime »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser spectacle] Scènes de Crime', 'Improvidence', 'spectacle', null, null, 'Polar / enquête', null, 'Teaser — spectacle improvisé policier façon Thomson et Thompson', 'https://www.youtube.com/watch?v=kHh0P72wSk4', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser spectacle] Scènes de Crime');

-- F.8 Teaser « Ex Nihilo »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser] Spectacle - Ex Nihilo', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — spectacle improvisé Ex Nihilo : 2 comédiens et 1 musicien partent de rien', 'https://www.youtube.com/watch?v=x5vICbvL8Gw', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser] Spectacle - Ex Nihilo');

-- F.9 « Je vous jure c'est de l'impro ! »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Spectacle] Je vous jure c''est de l''impro ! Teaser', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — spectacle dominical à l''Improvidence', 'https://www.youtube.com/watch?v=USkI4RI4TLw', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Spectacle] Je vous jure c''est de l''impro ! Teaser');

-- F.10 « La Doublure » (extrait long)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'LA DOUBLURE', 'Improvidence', 'spectacle', null, null, null, null, 'Spectacle improvisé « La Doublure » — Christophe Bouquet (Philippe Cardon)', 'https://www.youtube.com/watch?v=_5mfgDmHqoo', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'LA DOUBLURE');

-- F.11 « Faites nous confiance »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'FAITES NOUS CONFIANCE', 'Improvidence', 'spectacle', null, null, null, null, 'Spectacle improvisé « Faites-nous confiance » — Thierry Bilisko & Fabien Strobel', 'https://www.youtube.com/watch?v=z47dfpBFo8c', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'FAITES NOUS CONFIANCE');

-- F.12 Extrait « Familia Mea »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Extrait spectacle] Familia Mea', 'Improvidence', 'spectacle', null, null, 'Couple / famille', null, 'Extrait du spectacle improvisé « Familia Mea » — Improvidence', 'https://www.youtube.com/watch?v=2-wp9hLDo1Q', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Extrait spectacle] Familia Mea');

-- F.13 Stage comédie musicale improvisée (Antoine Lefort)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Comédie Musicale improvisée avec Antoine Lefort', 'Improvidence', 'tutoriel', null, 'chantee', null, null, 'Présentation d''un stage de comédie musicale improvisée à l''Improvidence', 'https://www.youtube.com/watch?v=_bFzjeixONA', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Comédie Musicale improvisée avec Antoine Lefort');

-- F.14 Teaser « Catch Impro »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser spectacle] Catch Impro', 'Improvidence', 'match_impro', null, null, null, null, 'Concept Catch Impro — deux duos s''affrontent sous l''arbitrage FICI', 'https://www.youtube.com/watch?v=4K4jiiedtc0', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser spectacle] Catch Impro');

-- F.15 Teaser « Mon Pote »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser] Mon Pote', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — spectacle « Mon Pote » par l''Équipe Bis à l''Improvidence', 'https://www.youtube.com/watch?v=WDBy5Zggzc8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser] Mon Pote');

-- F.16 Teaser « C'est l'histoire d'un homme... »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser] C''est l''histoire d''un homme...', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser d''un spectacle improvisé Improvidence', 'https://www.youtube.com/watch?v=HAbkm-_Cas8', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser] C''est l''histoire d''un homme...');

-- F.17 Teaser « Pirates ! » (jeune public)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser spectacle ] Pirates ! Contes improvisés', 'Improvidence', 'spectacle', null, null, 'Pirates', null, 'Teaser — spectacle jeune public « Pirates ! » par la Cie Hic & Nunc', 'https://www.youtube.com/watch?v=csrMYwvFHXI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser spectacle ] Pirates ! Contes improvisés');

-- F.18 Teaser « Frichti »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser Spectacle] Frichti', 'Improvidence', 'spectacle', null, null, null, null, 'Teaser — « Frichti d''impro », spectacle interactif avec 50 contraintes', 'https://www.youtube.com/watch?v=CPSVpLJiB2A', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser Spectacle] Frichti');

-- F.19 Reportage France 3
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'reportage France 3 Théâtre Improvidence Impronlive', 'Improvidence', 'documentaire', null, null, null, null, 'Reportage France 3 sur le Théâtre Improvidence et ImprOnLive', 'https://www.youtube.com/watch?v=oiZPUfmvHJs', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'reportage France 3 Théâtre Improvidence Impronlive');

-- F.20 Teaser ImprOnLive « Le dernier show avant la fin du monde »
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select '[Teaser] Le dernier show avant la fin du monde - Spectacle en live streaming', 'Improvidence', 'spectacle', null, null, 'Fin du monde', null, 'Teaser ImprOnLive — spectacle en live streaming hebdomadaire', 'https://www.youtube.com/watch?v=t9WLmfhdyFk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = '[Teaser] Le dernier show avant la fin du monde - Spectacle en live streaming');

-- ─── G) Théâtre Improvisation (20 entries, verified via watch-page metadata) ───

-- G.1 Catégorie sans parole
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Catégorie sans parole', 'Théâtre Improvisation', 'match_impro', null, 'sans_paroles', null, null, 'Démonstration de la catégorie « sans parole » en impro', 'https://www.youtube.com/watch?v=bjCyNgVXTaI', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Catégorie sans parole');

-- G.2 Catégorie Doublage (LIPAIX vs LOLITA)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Catégorie Doublage', 'Théâtre Improvisation', 'match_impro', null, 'doublee', null, null, 'Catégorie « doublage » — match LIPAIX (Aix) vs LOLITA (Strasbourg)', 'https://www.youtube.com/watch?v=_cguuwfqYLo', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Catégorie Doublage');

-- G.3 Interview Jamel Debbouze — révélation
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'L''improvisation théâtrale, une révélation pour Jamel Debbouze !', 'Théâtre Improvisation', 'documentaire', null, null, null, null, 'Interview — Jamel Debbouze raconte sa découverte de l''impro', 'https://www.youtube.com/watch?v=dxmu8sC9I1Q', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'L''improvisation théâtrale, une révélation pour Jamel Debbouze !');

-- G.4 Interview Jamel Debbouze — sa vie
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Comment l''improvisation a sauvé la vie de Jamel Debbouze', 'Théâtre Improvisation', 'documentaire', null, null, null, null, 'Interview — Jamel Debbouze sur le rôle de l''impro dans sa vie', 'https://www.youtube.com/watch?v=tWaBz-Pnu6M', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Comment l''improvisation a sauvé la vie de Jamel Debbouze');

-- G.5 Ligue Engrenage — match 12
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 12', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 12 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=vP4itCb-FiU', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 12');

-- G.6 Spectacle FBI Béziers
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Spectacle d''improvisation avec le FBI', 'Théâtre Improvisation', 'spectacle', null, null, null, null, 'Spectacle d''impro de la Fédération Biterroise d''Improvisation (FBI)', 'https://www.youtube.com/watch?v=6L9PkOuxnAY', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Spectacle d''improvisation avec le FBI');

-- G.7 Improspectus Montpellier
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les Improspectus   Théatre d''improvisation', 'Théâtre Improvisation', 'spectacle', null, null, null, null, 'Spectacle des Improspectus — Maison Pour Tous Voltaire, Montpellier (2012)', 'https://www.youtube.com/watch?v=xg9E9QviVvc', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les Improspectus   Théatre d''improvisation');

-- G.8 Ligue Engrenage — match 11
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 11', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 11 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=_peLWjiGxOQ', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 11');

-- G.9 Impropolis 2013 — Improspectus vs Lolita
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Impropolis 2013:   Improspectus vs Lolita', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Festival Impropolis 2013 — match Improspectus vs Lolita', 'https://www.youtube.com/watch?v=sWCafKxbghs', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Impropolis 2013:   Improspectus vs Lolita');

-- G.10 La Lolita (Strasbourg) — présentation
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'La Lolita  -  Théâtre d''Improvisation à Strasbourg: c''est quoi ?', 'Théâtre Improvisation', 'documentaire', null, null, null, null, 'Présentation de la LOLITA, ligue d''impro de Strasbourg fondée en 1993', 'https://www.youtube.com/watch?v=YpNLYxx0Lqg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'La Lolita  -  Théâtre d''Improvisation à Strasbourg: c''est quoi ?');

-- G.11 Ligue Engrenage — match 10
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 10', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 10 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=_b_poDo--Qk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 10');

-- G.12 Ligue Engrenage — match 9
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 9', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 9 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=jwi-rLHLrfA', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 9');

-- G.13 Cabaret d'impro Espace des Possibles
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Cabaret d''impro à l''Espace des Possibles.', 'Théâtre Improvisation', 'spectacle', null, null, null, null, 'Spectacle d''impro à l''Espace des Possibles (août 2021)', 'https://www.youtube.com/watch?v=q5dQGIv-hto', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Cabaret d''impro à l''Espace des Possibles.');

-- G.14 La Lina — présentation
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Le théâtre d''impro. avec la LINA', 'Théâtre Improvisation', 'documentaire', null, null, null, null, 'Présentation de la LINA — théâtre d''impro', 'https://www.youtube.com/watch?v=aMfdLOfY6Kg', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Le théâtre d''impro. avec la LINA');

-- G.15 Trophée d'Impro Culture & Diversité
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Finale du trophée d''impro Culture & Diversité', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Finale du Trophée d''Impro Culture & Diversité à la Comédie-Française', 'https://www.youtube.com/watch?v=ZCif1YoOQDA', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Finale du trophée d''impro Culture & Diversité');

-- G.16 Ligue Engrenage — match 8
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 8', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 8 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=LJXPcRRvmgE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 8');

-- G.17 Ligue Engrenage — match 7
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 7', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 7 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=UDuy-Qr5OJE', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 7');

-- G.18 Ligue Engrenage — match 6
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 6', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 6 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=wWVTWbPzQnk', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 6');

-- G.19 Ligue Engrenage — match 5
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Ligue Impro l''Engrenage   saison 1   match 5', 'Théâtre Improvisation', 'match_impro', null, null, null, null, 'Match 5 — Ligue d''impro l''Engrenage à La Factrie', 'https://www.youtube.com/watch?v=53eOb2vkNyA', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Ligue Impro l''Engrenage   saison 1   match 5');

-- G.20 Les déglingués (troupe Impro à Rêves en Saône)
insert into public.inspiration_videos (title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, status)
select 'Les déglingués', 'Théâtre Improvisation', 'spectacle', null, null, null, null, 'Premier spectacle de la troupe « Improvisons à Rêves en Saône »', 'https://www.youtube.com/watch?v=kYGBb-e611w', 'fr', 'approved'
where not exists (select 1 from public.inspiration_videos where title = 'Les déglingués');

-- ─── End of seed ───
