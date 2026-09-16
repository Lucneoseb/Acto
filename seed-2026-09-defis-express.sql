-- ============================================================================
--  Acto — 80 defis d'improvisation express (30 s a 1 min)
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq),
--  APRES migrate-2026-09-defis-communaute.sql.
-- ============================================================================
--
--  16 contraintes de jeu x 5 sujets imposes, publies directement (status
--  'approved') dans la base de defis : visibles par tous dans Studio -> Defis
--  -> Base, et dans la page admin #defis.
--
--  Chaque defi : contrainte (nom + description, affichee a qui recoit le defi),
--  sujet impose (le theme), 1 jouteur, 1 min de jeu. L'expediteur peut changer
--  le nombre de jouteurs, la duree et le caucus au moment de l'envoi. Pas de
--  niveau : la base les montre tous.
--
--  Deja passe la version a 50 defis ? Relancer ce fichier ajoute seulement
--  les 30 nouveaux (contraintes 11 a 16).
--
--  Re-executable : un defi deja present (meme contrainte + meme sujet, en
--  francais) n'est jamais ajoute une deuxieme fois.
-- ============================================================================

with contraintes(n, category, category_desc) as (values
  (1, 'L''Abécédaire',
       'Chaque nouvelle phrase prononcée doit impérativement commencer par la lettre suivante de l''alphabet (A, puis B, puis C...). L''improvisateur doit aller vite sans perdre le fil de son histoire.'),
  (2, 'La contradiction physique',
       'Le langage corporel (gestes, mimiques, posture) doit exprimer exactement l''inverse de l''émotion ou du propos raconté verbalement.'),
  (3, 'Le reportage animalier',
       'Raconter la scène avec le ton neutre, scientifique, analytique et chuchoté d''un présentateur de documentaire observant la faune sauvage.'),
  (4, 'Questions uniquement',
       'Interdiction absolue de prononcer une phrase affirmative ou exclamative. Toute la communication doit se faire sous forme d''interrogations.'),
  (5, 'L''ascenseur émotionnel',
       'Toutes les 10 secondes (annoncées par un maître du jeu), l''improvisateur doit changer radicalement d''émotion (tristesse, joie hystérique, colère, peur, séduction) sans changer de sujet.'),
  (6, 'Le commentaire sportif',
       'Raconter l''action avec l''énergie fulgurante, le débit mitraillette et le vocabulaire survolté d''un commentateur de finale de Coupe du Monde de football.'),
  (7, 'Le vendeur de l''extrême',
       'Tout présenter avec l''enthousiasme forcé, faux et excessif d''un influenceur ou d''un vendeur en porte-à-porte qui essaie de te vendre une "révolution".'),
  (8, 'Sans la lettre "E" (Lipogramme)',
       'L''improvisateur doit parler pendant 30 à 60 secondes sans jamais prononcer de mot contenant la lettre "E" (exercice intellectuel intense).'),
  (9, 'Le dernier mot triple',
       'L''improvisateur doit obligatoirement répéter trois fois de suite le dernier mot de chacune de ses phrases (effet comique garanti et rythme déstabilisant).'),
  (10, 'La comédie musicale improvisée',
       'L''improvisation ne peut pas être parlée : tout doit être chanté, ou du moins déclamé de façon très lyrique comme dans un opéra.'),
  (11, 'Le téléachat de l''absurde',
       'Adopter le ton sur-enthousiaste, argumentatif et commercial d''un animateur de téléachat pour vendre un objet totalement absurde, défectueux ou inutile.'),
  (12, 'La confession dramatique',
       'Avouer une faute quotidienne totalement insignifiante avec l''intensité, les larmes et le désespoir d''une tragédie grecque ou cornélienne.'),
  (13, 'Le super-héros du quotidien',
       'Être interviewé en tant que sauveur de l''humanité, mais l''exploit héroïque repose sur une compétence ménagère ou banale totalement surestimée.'),
  (14, 'Le critique déco de l''espace / fantastique',
       'Faire une critique d''aménagement d''intérieur (façon Stéphane Plaza) dans un environnement dangereux, fantastique ou de science-fiction, tout en gardant son tact.'),
  (15, 'L''excuse invraisemblable',
       'Justifier une situation banale de la vie courante avec un récit d''aventure épique, abracadabrant et impliquant souvent des animaux ou des complots.'),
  (16, 'La rupture culinaire',
       'Rompre avec tout le sérieux, les larmes et la gravité d''une vraie séparation sentimentale, mais l''unique raison de la rupture est une habitude culinaire inacceptable.')
),
sujets(n, theme) as (values
  -- 1. L'Abecedaire
  (1, 'Tu viens d''être enlevé par des extraterrestres, mais leur vaisseau spatial est atrocement mal décoré (moquette orange, tapisserie à fleurs). Tu essaies de leur faire comprendre avec tact.'),
  (1, 'Tu es un braqueur de banque extrêmement poli qui demande aux otages de faire un peu moins de bruit car tu as une migraine.'),
  (1, 'Tu es un coach de fitness totalement démotivé qui essaie de donner un cours dynamique tout en mangeant un burger.'),
  (1, 'Tu présentes ton invention révolutionnaire : une machine à tartiner le beurre. Sauf que tu en as secrètement très peur.'),
  (1, 'Tu es à un rendez-vous galant et tu te rends compte que la personne en face de toi est un vampire, mais un vampire très maladroit.'),
  -- 2. La contradiction physique
  (2, 'Tu es dans le bureau de ton patron pour justifier ton retard : tu as été pris en otage par un gang de pigeons exigeant du pain de mie.'),
  (2, 'Tu es un chirurgien qui vient d''annoncer avoir oublié sa montre connectée dans le ventre du patient.'),
  (2, 'Tu viens de gagner l''EuroMillions, mais tu détestes l''argent et tu trouves que c''est une malédiction.'),
  (2, 'Tu es guide touristique dans la ville la plus ennuyeuse du monde, et tu essaies de la vendre comme si c''était Las Vegas.'),
  (2, 'Tu avoues à ton meilleur ami que tu as accidentellement jeté son ordinateur portable par la fenêtre.'),
  -- 3. Le reportage animalier
  (3, 'Tu annonces à ton/ta partenaire que tu le/la quittes parce qu''il/elle met des glaçons dans son vin rouge.'),
  (3, 'Tu décris l''affrontement silencieux de deux collègues à la machine à café pour obtenir l''unique et dernière capsule.'),
  (3, 'Tu observes et décris un enfant qui élabore une stratégie complexe pour cacher ses brocolis sous la table.'),
  (3, 'Tu relates la migration migratoire d''un groupe de clients dans un supermarché vers une nouvelle caisse qui vient d''ouvrir.'),
  (3, 'Tu analyses le comportement d''un adolescent qui "range" sa chambre en poussant tout sous son lit.'),
  -- 4. Questions uniquement
  (4, 'Tu fais le téléachat d''un objet totalement inutile et cassé (ex: une fourchette avec une seule dent).'),
  (4, 'Deux espions se rencontrent dans un parc, mais ils ont tous les deux oublié le code secret pour s''identifier.'),
  (4, 'Tu fais ta demande en mariage, mais tu as un soudain trou de mémoire sur le prénom de la personne.'),
  (4, 'Tu interpelles un serveur au restaurant car tu es persuadé que ton plat (une salade) est encore vivant.'),
  (4, 'Tu es un détective interrogeant un suspect, mais tu es en réalité beaucoup plus coupable que lui.'),
  -- 5. L'ascenseur emotionnel
  (5, 'Tu avoues à ta famille que tu as mangé le dernier yaourt au citron.'),
  (5, 'Tu tiens un discours électoral pour promettre l''installation de fontaines de chocolat gratuites dans la ville.'),
  (5, 'Tu lis le testament d''un oncle lointain qui ne t''a légué qu''une collection de chaussettes trouées.'),
  (5, 'Tu es le premier astronaute sur Mars, et tu découvres que le sol est composé de gelée à la fraise.'),
  (5, 'Tu essaies désespérément de résilier ton abonnement internet auprès d''un service client automatisé.'),
  -- 6. Le commentaire sportif
  (6, 'Tu expliques comment tu viens de réaliser l''exploit héroïque de plier un drap-housse tout seul.'),
  (6, 'Le combat épique et acharné pour chasser une mouche très agile de ton salon.'),
  (6, 'Le déballage des courses et leur rangement dans le congélateur avant que les glaces ne fondent.'),
  (6, 'L''observation d''un étudiant qui rédige la toute dernière ligne de sa dissertation 30 secondes avant la fin de l''épreuve.'),
  (6, 'L''exploit de réussir à faire un créneau du premier coup dans une rue très étroite avec des gens qui regardent.'),
  -- 7. Le vendeur de l'extreme
  (7, 'Tu justifies le fait d''avoir raté ton permis de conduire comme s''il s''agissait d''un nouveau style de vie avant-gardiste.'),
  (7, 'Tu tentes de convaincre ton colocataire que ne plus jamais faire le ménage est un concept écologique novateur.'),
  (7, 'Tu présentes à des investisseurs ton nouveau projet : adopter des moustiques de compagnie pour stimuler les réflexes.'),
  (7, 'Tu expliques à ton patron que dormir sous son bureau sur le temps de travail augmente la synergie d''entreprise.'),
  (7, 'Tu vends un concept de restaurant luxueux où ce sont les clients qui doivent faire la plonge à la fin.'),
  -- 8. Sans la lettre "E" (Lipogramme)
  (8, 'Tu racontes tes pires vacances au camping sous la pluie.'),
  (8, 'Tu expliques brièvement les règles du jeu du loup-garou.'),
  (8, 'Tu passes une commande au drive d''un fast-food avec des exigences culinaires très pointues.'),
  (8, 'Tu es un méchant de film qui révèle son plan diabolique pour conquérir le monde.'),
  (8, 'Tu fais une grande déclaration d''amour tragique sur un quai de gare.'),
  -- 9. Le dernier mot triple
  (9, 'Tu es un médecin de télévision qui annonce un simple rhume comme si c''était une maladie mystique.'),
  (9, 'Tu es un parrain de la mafia qui explique avec menaces comment bien réussir la cuisson des pâtes.'),
  (9, 'Tu es un enfant pris sur le fait, qui tente de justifier pourquoi il a peint le chat familial en bleu schtroumpf.'),
  (9, 'Tu es un influenceur beauté réalisant un tutoriel maquillage en utilisant exclusivement de la boue.'),
  (9, 'Tu es le commandant de bord d''un avion rassurant les passagers alors que les deux moteurs viennent de s''éteindre.'),
  -- 10. La comedie musicale improvisee
  (10, 'La découverte dramatique d''une chaussette orpheline dans le tambour de la machine à laver.'),
  (10, 'L''appel paniqué à un plombier au milieu de la nuit pour des toilettes qui débordent.'),
  (10, 'Un duel tendu dans le Far West où les deux cow-boys se rendent compte qu''ils ont oublié leurs armes.'),
  (10, 'Les excuses maladroites à ton voisin du dessous après avoir accidentellement inondé son balcon en arrosant tes plantes.'),
  (10, 'Une plainte amère et poétique contre la météo changeante et la pluie qui a ruiné ta coiffure.'),
  -- 11. Le teleachat de l'absurde
  (11, 'Vendre un parapluie entièrement fait en sucre glace.'),
  (11, 'Vendre des lunettes de soleil totalement opaques pour mieux "dormir en marchant".'),
  (11, 'Vendre une fourchette avec une seule dent centrale (un cure-dent de luxe).'),
  (11, 'Vendre un dictionnaire dont toutes les pages sont vierges (pour inventer ses propres mots).'),
  (11, 'Vendre une bouteille d''eau déshydratée (où il suffit d''ajouter de l''eau).'),
  -- 12. La confession dramatique
  (12, 'Avouer à sa famille avoir mangé le dernier yaourt au citron du frigo.'),
  (12, 'Avouer avoir regardé le final de la série Netflix sans son ou sa partenaire.'),
  (12, 'Avouer avoir jeté le dessin (très laid) de son neveu de 4 ans à la poubelle.'),
  (12, 'Avouer avoir utilisé la serviette de bain de quelqu''un d''autre pour s''essuyer les mains.'),
  (12, 'Avouer avoir secrètement appuyé sur le bouton "fermer les portes" de l''ascenseur en voyant le voisin arriver.'),
  -- 13. Le super-heros du quotidien
  (13, 'Expliquer comment tu as sauvé le monde en réussissant à plier un drap-housse à la perfection.'),
  (13, 'Raconter ton combat héroïque pour faire des crêpes sans le moindre grumeau.'),
  (13, 'Détailler la stratégie qui t''a permis d''insérer la clé USB dans le bon sens du premier coup.'),
  (13, 'Expliquer l''adrénaline d''avoir arrêté le micro-ondes à 00:01 juste avant qu''il ne bipe au milieu de la nuit.'),
  (13, 'Relater comment tu as démêlé des écouteurs filaires en moins de 5 secondes.'),
  -- 14. Le critique deco de l'espace / fantastique
  (14, 'Dans le vaisseau d''extraterrestres cruels, critiquer la tapisserie à fleurs et la moquette orange.'),
  (14, 'Dans le donjon d''un vampire sanguinaire, suggérer de mettre plus de lumière naturelle et des tons pastel.'),
  (14, 'Dans la grotte d''un dragon, conseiller d''enlever tous ces tas d''or qui prennent la poussière et tassent l''espace.'),
  (14, 'Dans le repaire sous-marin d''un génie du crime, critiquer l''usage abusif du métal gris et des lumières néon rouges.'),
  (14, 'Dans une maison hantée, expliquer aux fantômes que les toiles d''araignées font "un peu cheap".'),
  -- 15. L'excuse invraisemblable
  (15, 'Justifier son retard au travail par une prise d''otage par un gang de pigeons exigeant du pain de mie.'),
  (15, 'Expliquer l''oubli de l''anniversaire de mariage par un enlèvement extraterrestre qui a déréglé les montres.'),
  (15, 'Expliquer à la police un excès de vitesse parce qu''on fuyait un nuage noir très menaçant et ciblé.'),
  (15, 'Justifier un devoir non rendu parce qu''un écureuil espion de la CIA l''a confisqué pour la sécurité nationale.'),
  (15, 'Expliquer qu''on a cassé le vase du salon lors d''un combat à l''épée inévitable avec le livreur de pizzas.'),
  -- 16. La rupture culinaire
  (16, 'Rompre parce que l''autre met des glaçons dans son vin rouge prestigieux.'),
  (16, 'Rompre parce que la personne mange sa pizza en commençant par la croûte.'),
  (16, 'Rompre parce qu''elle coupe impitoyablement ses spaghettis avec un couteau.'),
  (16, 'Rompre parce qu''il met l''eau avant les céréales dans son bol le matin.'),
  (16, 'Rompre parce qu''elle trempe ses frites dans de la mayonnaise mélangée à du Nutella.')
)
insert into public.challenge_ideas (locale, level, category, category_desc, theme, players, duration_sec, status, approved_at)
select 'fr', null, c.category, c.category_desc, s.theme, 1, 60, 'approved', now()
  from sujets s
  join contraintes c on c.n = s.n
 where not exists (
   select 1 from public.challenge_ideas d
    where d.locale = 'fr'
      and lower(coalesce(d.category, '')) = lower(c.category)
      and lower(coalesce(d.theme, '')) = lower(s.theme)
 );

-- ============================================================================
--  Verification (16 lignes, 5 defis chacune) :
--    select category, count(*) from public.challenge_ideas
--     where locale = 'fr' and status = 'approved' and submitted_by is null
--     group by category order by category;
--
--  Pour retirer ces 80 defis d'un coup :
--    delete from public.challenge_ideas
--     where locale = 'fr' and submitted_by is null and category in (
--      'L''Abécédaire',
--      'La contradiction physique',
--      'Le reportage animalier',
--      'Questions uniquement',
--      'L''ascenseur émotionnel',
--      'Le commentaire sportif',
--      'Le vendeur de l''extrême',
--      'Sans la lettre "E" (Lipogramme)',
--      'Le dernier mot triple',
--      'La comédie musicale improvisée',
--      'Le téléachat de l''absurde',
--      'La confession dramatique',
--      'Le super-héros du quotidien',
--      'Le critique déco de l''espace / fantastique',
--      'L''excuse invraisemblable',
--      'La rupture culinaire'
--     );
-- ============================================================================
