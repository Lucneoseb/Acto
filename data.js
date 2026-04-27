/* ============================================================
   Impro Studio — Data
   Curated content for French improv: exercises, constraints,
   themes and (for matches) categories, durations, players.

   Sources d'inspiration :
   - Tadam Impro (https://www.tadam-impro.fr)
   - Théâtre Instant Présent (https://theatreinstantpresent.org)
   - Cours Le Foyer (https://www.courslefoyer.com)
   - Wikiversité — Liste de thèmes d'improvisation
   - Evenice — 10 exercices solo
   - Impro-Exo (https://impro-exo.fr)
   - Dramaction — Le cercle d'improvisations
   - InFamily — 40 exercices d'improvisation théâtrale
   ============================================================ */

const IMPRO_DATA = {

  /* ---------------- EXERCISES ---------------- */
  exercises: {
    troupe: {
      debutant: [
        { name: "Le miroir",              desc: "Deux joueurs face à face. L'un fait des mouvements lents, l'autre l'imite en miroir parfait. On accélère progressivement. (Tadam Impro)" },
        { name: "Les chaises",            desc: "Une équipe a 30s pour bâtir une structure avec des chaises. Une autre équipe a 40s pour préparer une impro à partir de cette structure. (Tadam Impro)" },
        { name: "Le discours funéraire",  desc: "Chacun improvise un discours d'hommage à son animal de compagnie. Ton solennel, drôle, ou les deux. (Tadam Impro)" },
        { name: "Histoire collective",    desc: "En cercle, un mot chacun. L'histoire se construit collectivement, sans hésiter ni reprendre." },
        { name: "Le thème à incarner",    desc: "Le groupe est en mouvement, un meneur lance un thème (musée, pyramides...). Le groupe le recrée immédiatement. (Tadam Impro)" },
        { name: "Conversation bizarre",   desc: "Deux joueurs improvisent une situation décalée : oiseau qui explique l'arbre à un autre oiseau, puce qui se dispute avec un chien. (Tadam Impro)" },
        { name: "Yes, and...",            desc: "Toute proposition est acceptée et enrichie. Règle d'or de l'impro selon InFamily : ne jamais bloquer." },
        { name: "L'objet imaginaire",     desc: "Un joueur manipule un objet invisible. Les autres devinent et le relancent en y ajoutant un usage." },
        { name: "Cercle de questions",    desc: "Un joueur au centre du cercle. Les autres lui posent des questions en rafale. Il répond précisément à chacune. (Dramaction)" },
        { name: "Émotions sur commande",  desc: "Le meneur lance une émotion. Les joueurs basculent immédiatement et la justifient en scène." },
        { name: "La machine humaine",     desc: "Un par un, les joueurs entrent et ajoutent un geste/son répétitif. La machine se construit organiquement." },
        { name: "ABC",                    desc: "Une scène où chaque réplique commence par la lettre suivante de l'alphabet. À, B, C... jusqu'à Z." },
        { name: "Le bus",                 desc: "Un arrêt de bus. À chaque arrivée, un nouveau personnage monte avec son univers. La scène mute à chaque fois." },
        { name: "Pantomime",              desc: "Une scène entièrement mimée à partir d'un thème (un muet explique à un autre qu'il est en feu). (Dramaction)" },
        { name: "Trois personnages",      desc: "Trois joueurs entrent et campent leur personnage en moins de 30 secondes, juste par la posture et la voix." },
        { name: "Émotion qui passe",      desc: "Un joueur transmet une émotion en silence à son voisin par un geste, qui la transmet à son tour. (Dramaction)" },
        { name: "Le Freeze",              desc: "Deux joueurs improvisent depuis une posture donnée. À tout moment, un autre joueur tape dans ses mains pour figer la scène et remplacer un joueur. La scène repart différemment. (Impro-Exo)" },
        { name: "Début-milieu-fin en 30s", desc: "Commencer une impro, faire bouger l'enjeu, et conclure — le tout en 30 secondes chrono. Travail de rythme. (Impro-Exo)" },
        { name: "Conversation à émotion changeante", desc: "Une conversation en duo. Toutes les 1-2 minutes, un meneur crie une émotion. Les joueurs basculent dans cette tonalité. (MentorShow)" }
      ],
      confirme: [
        { name: "Pause-Reprise",          desc: "Le meneur arrête la scène, change un élément (lieu, époque, statut), et la fait reprendre." },
        { name: "Trois mots imposés",     desc: "Trois mots tirés au sort doivent être placés naturellement dans la scène." },
        { name: "Le statut",              desc: "Chaque personnage a un statut social caché (1 à 10). Le public doit le deviner." },
        { name: "Doublage",               desc: "Deux joueurs miment, deux autres parlent pour eux depuis l'extérieur du plateau." },
        { name: "Conférence d'experts",   desc: "Un panel d'experts d'un sujet absurde répond aux questions du public avec sérieux." },
        { name: "Last word, first word",  desc: "Chaque réplique doit commencer par le dernier mot de la précédente." },
        { name: "Histoire à rebours",     desc: "Raconter une histoire en commençant par la fin et en remontant scène par scène." },
        { name: "Genres mélangés",        desc: "Le meneur change de genre toutes les 30 secondes (western, polar, romance, horreur...)." },
        { name: "Le triple statut",       desc: "Chaque personnage a un secret, un objectif et un obstacle. Tous se révèlent en cours de scène." },
        { name: "Scène inversée",         desc: "On commence par le climax et on remonte jusqu'à la rencontre des personnages." },
        { name: "Le chœur désaccordé",    desc: "Une chorale sur scène — un membre est désaccordé ou hors rythme. Tout le drame vient de lui. (Wikiversité)" },
        { name: "Acteurs en coulisses",   desc: "Une scène se joue côté coulisses pendant que le 'spectacle' a lieu côté scène. Mise en abyme. (Wikiversité)" },
        { name: "L'ascenseur en panne",   desc: "Espace ultra-restreint, plusieurs personnages, le huis-clos est forcé. Classique de l'impro. (Wikiversité)" },
        { name: "La réunion de profs",    desc: "Une réunion d'enseignants où chaque prof a un agenda caché et un élève fétiche." },
        { name: "Le retour au passé",     desc: "À un moment-clé, un joueur tape dans ses mains. La scène revient 1 minute en arrière et se rejoue différemment." },
        { name: "Le personnage tiré",     desc: "Chaque joueur tire un type de personnage (clown, séducteur, paranoïaque) qu'il doit jouer sans le nommer." }
      ],
      expert: [
        { name: "Le Harold",              desc: "Forme longue : trois scènes en parallèle s'entrelacent, se répondent et se nourrissent. Format Del Close." },
        { name: "La Boule de feu",        desc: "Tous les joueurs sur scène. À chaque temps fort, un duo se détache pour une mini-scène, puis revient au groupe." },
        { name: "L'improvisation chantée", desc: "Une scène entièrement chantée avec mélodie improvisée, rimes et structure couplet/refrain." },
        { name: "Le monologue partagé",   desc: "Un long monologue est repris par chaque joueur, qui le déforme et l'enrichit en assumant le même personnage." },
        { name: "Forme libre 20 minutes", desc: "Une seule scène, vingt minutes, sans interruption ni bascule. Tenir un monde entier." },
        { name: "L'opéra impro",          desc: "Récitatifs et arias chantés en alternance, livret entièrement improvisé, voix lyriques." },
        { name: "Le miroir Pirandello",   desc: "Les personnages prennent conscience qu'ils sont improvisés... mais doivent continuer la scène quand même." },
        { name: "Scène à deux temps",     desc: "Une scène se joue, puis se rejoue dix ans plus tard avec les conséquences logiques de la première." },
        { name: "Improvisation muette",   desc: "Spectacle de 15 minutes, intégralement sans paroles, avec intrigue claire et résolue." },
        { name: "Le théâtre dans le théâtre", desc: "Les personnages improvisent à leur tour une pièce dans la scène. Trois niveaux de fiction superposés." },
        { name: "La Maison (Del Close)",  desc: "Forme longue où chaque scène ouvre des thèmes que les suivantes reprennent et approfondissent." },
        { name: "Le Deconstructed",       desc: "Une seule scène est jouée, puis dépiautée et recommencée selon plusieurs angles narratifs." },
        { name: "Tchekhovienne",          desc: "Long format à la Tchekhov : pas de climax, des personnages qui se ratent, l'inaction comme moteur." },
        { name: "Beckettienne",           desc: "Long format absurde : silences habités, attente, langage qui se vide. À l'image d'En attendant Godot." }
      ]
    },
    match: {
      debutant: [
        { name: "Improvisation simple",   desc: "Une équipe joue, l'autre attend. Forme classique du match d'impro de la LNI." },
        { name: "Improvisation mixte",    desc: "Les deux équipes jouent ensemble dans la même improvisation, en équilibre numérique." },
        { name: "Improvisation comparée", desc: "Chaque équipe joue tour à tour la même proposition. Le public compare et vote." },
        { name: "Mixte sans paroles",     desc: "Les deux équipes ensemble, mais en silence absolu pendant toute la scène." },
        { name: "Comparée chantée",       desc: "Chaque équipe joue le thème en y intégrant au moins un passage chanté." },
        { name: "Comparée avec accessoire",desc: "Un accessoire imposé doit être central. Chaque équipe l'utilise à sa façon." }
      ],
      confirme: [
        { name: "À la manière de",        desc: "Style d'auteur ou de genre imposé : Molière, Audiard, film noir... (Catégorie LNI classique)" },
        { name: "Mixte avec accessoire",  desc: "Un objet imposé doit être central à l'improvisation. Les deux équipes négocient en scène." },
        { name: "Comparée à contrainte",  desc: "Chaque équipe joue le thème avec une contrainte tirée au sort différemment." },
        { name: "Mixte avec personnage imposé", desc: "Un type de personnage imposé doit apparaître dès la première minute." },
        { name: "Improvisation à rebours",desc: "L'équipe doit jouer la scène en commençant par la fin et en remontant." },
        { name: "Mixte par phrases",      desc: "Les joueurs ne peuvent parler que par phrases entières et complètes — pas d'interruption." },
        { name: "Comparée rimée",         desc: "Toutes les répliques doivent rimer (octosyllabes ou rimes plates)." },
        { name: "Comparée muette",        desc: "Aucune parole : seul le geste et l'expression racontent l'histoire." }
      ],
      expert: [
        { name: "Chantée et dansée",      desc: "Mini-musical : alternance dialogues, chants et chorégraphies improvisés. Style Broadway impro." },
        { name: "À la manière de + époque",desc: "Style d'auteur ET époque historique imposés. Les deux doivent être lisibles dès l'entrée." },
        { name: "Mixte en alexandrins",   desc: "Toutes les répliques en alexandrins (12 pieds), rimes plates ou croisées. Niveau classique." },
        { name: "Comparée silencieuse + bruitée", desc: "Une équipe joue muette, l'autre uniquement en bruitages. Même thème, lectures inverses." },
        { name: "Sans héros",             desc: "L'improvisation doit fonctionner sans personnage principal identifiable. Choralité totale." },
        { name: "À thèse",                desc: "L'improvisation doit défendre une thèse philosophique annoncée à l'avance par l'arbitre." },
        { name: "À la manière de Tchekhov", desc: "Style russe fin XIXᵉ : ennui aristocratique, samovars, silences chargés, monologues." },
        { name: "Rétro-pédalage temporel",desc: "La scène avance puis revient en arrière toutes les 30 secondes. Boucle vertigineuse." }
      ]
    }
  },

  /* ---------------- CONSTRAINTS ---------------- */
  constraints: {
    troupe: {
      debutant: [
        "En chuchotant",
        "En marchant en cercle pendant toute la scène",
        "Avec un seul mot répété",
        "En se tenant la main du début à la fin",
        "Sans toucher le sol avec ses talons",
        "Avec une seule émotion (joie, tristesse, colère...)",
        "En dansant en permanence",
        "Sans regarder son partenaire",
        "Avec les yeux fermés",
        "En faisant des bruitages au lieu de parler",
        "Une réplique sur deux est obligatoirement chantée",
        "Tout le monde dos au public",
        "Personne ne s'assoit ni ne se couche"
      ],
      confirme: [
        "Sans utiliser le mot « non »",
        "Sans utiliser de pronoms personnels",
        "En rimes systématiques",
        "À la manière de Molière",
        "À la manière d'un film noir des années 40",
        "Avec une réplique sur deux chantée",
        "En ralenti de A à Z",
        "En accéléré de A à Z",
        "Avec un mot interdit choisi par le public",
        "En alternant français et langue inventée",
        "À la manière d'un dessin animé pour enfants",
        "Avec un narrateur extérieur qui commente",
        "Dans le style d'un journal télévisé",
        "À la manière d'un documentaire animalier"
      ],
      expert: [
        "Avec rétro-pédalage temporel : la scène avance puis revient en arrière toutes les 30s",
        "À plusieurs voix : chaque personnage est joué simultanément par 2 acteurs",
        "En théâtre d'ombres uniquement",
        "Avec une narration extérieure qui contredit l'action",
        "En vers libres et en hexamètres",
        "À la manière de Beckett (silences, absurde, attente)",
        "Avec un quatrième mur permanent (les acteurs s'adressent au public)",
        "En palindrome : la scène doit pouvoir être jouée à l'envers",
        "Sans un seul verbe d'action",
        "Avec une langue entièrement inventée mais cohérente",
        "À la manière du théâtre Nô",
        "En mise en abyme (la pièce parle d'une pièce qui se joue)",
        "Avec une seule réplique audible par minute",
        "Toute la scène à la première personne du pluriel"
      ]
    },
    match: {
      debutant: [
        "En chuchotant",
        "En chantant",
        "Avec un accessoire imposé",
        "Avec une phrase imposée à placer",
        "En dansant",
        "À la manière d'un dessin animé",
        "Avec une émotion imposée",
        "En mode comédie musicale",
        "Avec des accents régionaux imposés",
        "Sans toucher le sol",
        "Avec un mot interdit",
        "À la manière du muet (Chaplin, Keaton)"
      ],
      confirme: [
        "À la manière de Shakespeare",
        "À la manière d'un film d'horreur",
        "À la manière d'Audiard",
        "En vers",
        "Sans utiliser le mot « non »",
        "Avec un mot interdit choisi par l'arbitre",
        "À la manière des frères Coen",
        "À la manière d'un péplum",
        "En science-fiction des années 60",
        "Avec une seule réplique audible par minute",
        "À la manière du muet (Chaplin, Keaton)",
        "Avec un narrateur omniscient extérieur",
        "À la manière d'un soap opera",
        "À la manière d'un manga"
      ],
      expert: [
        "En alexandrins du début à la fin",
        "À la manière de Tchekhov",
        "À la manière du théâtre Nô japonais",
        "Avec rétro-pédalage temporel",
        "À la manière d'un Wes Anderson",
        "À la manière de la Commedia dell'arte",
        "Avec un sous-texte philosophique imposé",
        "En cluedo (le coupable doit être révélé à la fin)",
        "À la manière du théâtre de l'absurde",
        "Avec un personnage qui sait qu'il est dans une fiction",
        "À la manière de Pirandello",
        "À la manière d'un Tarantino",
        "En forme de tragédie grecque (chœur + héros + hubris)",
        "À la manière d'un Bergman"
      ]
    }
  },

  /* ---------------- THEMES (pool when random) ---------------- */
  themes: {
    debutant: [
      // Quotidien / situations simples
      "Le rendez-vous chez le coiffeur",
      "Premier jour à l'école",
      "Une soirée pizza qui dégénère",
      "L'oubli des clés sur le palier",
      "Le métro un lundi matin",
      "Les voisins du dessus font la fête",
      "Le piquenique sous la pluie",
      "Le supermarché à 19h59",
      "La panne d'ascenseur",
      "Le mariage du cousin",
      "Le baby-sitting du soir",
      "L'attente chez le médecin",
      "L'examen du permis de conduire",
      "L'apéro qui s'éternise",
      "Le déménagement raté",
      "La queue à la boulangerie",
      "La leçon de cuisine catastrophique",
      "Le karaoké entre amis",
      "Le jour de la rentrée",
      "Le retour de vacances",
      // Drôles / décalés
      "Expliquer Snapchat à sa grand-mère",
      "Le jury d'un concours de chant qui ne s'entend pas",
      "Une émission culinaire avec une recette absurde",
      "Le commentaire d'un match de pétanque comme si c'était la finale du mondial",
      "Un super-héros aux pouvoirs inutiles",
      "Le journal télévisé d'une planète lointaine",
      "Documentaire animalier sur les humains",
      "Réunion d'évaluation au boulot qui dérape",
      "Un interrogatoire de police pour une bêtise minuscule",
      "Le dimanche en famille avec les pièces rapportées"
    ],
    confirme: [
      "Le dernier dimanche du monde",
      "Un chat qui parle à son maître",
      "Le rendez-vous manqué",
      "La lettre jamais envoyée",
      "Le voyage en train sans destination",
      "L'hôtel oublié des cartes",
      "Le rêve qui revient toutes les nuits",
      "Deux inconnus dans un ascenseur en panne",
      "L'enterrement d'un parfait inconnu",
      "Les trois souhaits du génie",
      "Le concierge qui sait tout",
      "La photo qu'on n'aurait pas dû voir",
      "Le frère qu'on n'a jamais connu",
      "L'écrivain face à son personnage",
      "Le dernier appel téléphonique",
      "La maison qui change la nuit",
      "Le bal masqué des regrets",
      "L'horloger du temps perdu",
      "La gare des âmes en transit",
      "Le miroir qui ment",
      // Wikiversité-inspirées
      "Les acteurs surpris en coulisses",
      "Le chœur désaccordé",
      "La réunion de profs où l'on parle d'un seul élève",
      "L'ascenseur bloqué entre deux étages",
      "La leçon qui ne fait aucun sens",
      // Décalées
      "Le savant fou et son assistant désabusé",
      "Dark Vador appelle pour rompre",
      "Une thérapie de couple entre deux objets",
      "La déposition de l'unique témoin",
      "Le diner où personne n'ose parler"
    ],
    expert: [
      "Le procès de la mémoire collective",
      "La dernière conversation entre Dieu et Diable",
      "L'archiviste des vies non vécues",
      "Le théorème indémontrable du bonheur",
      "Le silence d'après la révélation",
      "L'asile des poètes oubliés",
      "Le testament d'une langue morte",
      "Les heures volées de Schrödinger",
      "La chambre où l'on entre seul",
      "Le sablier de la conscience",
      "L'ultime représentation du Globe Theatre",
      "Les sept péchés capitaux à dîner",
      "Le manuscrit de Borges",
      "Le rêve dans le rêve dans le rêve",
      "L'exilé revenu trop tard",
      "Le funambule entre deux mondes",
      "La symphonie inachevée du condamné",
      "Le banquet des absents",
      "La frontière qui n'existait pas",
      "Le philosophe et la fourmi",
      "Trois sœurs qui n'iront jamais à Moscou",
      "Le veilleur de nuit du musée des oublis",
      "L'huissier des âmes en surplus",
      "La conférence de presse de l'oubli",
      "Le dernier traducteur de l'inutile",
      // Thèmes authentiques de la banque Dramaction
      "Autobiographie d'un virus",
      "Autopsie de l'âme sœur",
      "Autel du péché",
      "Autour de la fontaine des ablutions",
      "L'amour est un bouquet de violence",
      "Amour à la carte",
      "Amour flou",
      "L'étranger de l'ascenseur",
      "Investissement dans un ascenseur",
      "Dispute avec des mots aimables",
      "Dispute chez la coiffeuse",
      "Le baiser de la mort",
      "Baisers cachés",
      "Le bal des démasqués",
      "Le bal des vampires",
      "Le banc des vieux",
      "La banque du souvenir",
      "Bateau ivre",
      "Le cinéma des autres"
    ]
  },

  /* ---------------- MATCH-SPECIFIC: categories ----------------
     Catégories officielles inspirées de la LNI (Ligue Nationale
     d'Improvisation) et de la liste Dramaction. Les catégories
     "saute-mouton", "videoway", "sensorielle" sont issues du
     répertoire dramaction.qc.ca/fr/improvisation/categories/
  ----------------------------------------------------------- */
  categories: [
    { name: "Mixte",                          desc: "Les deux équipes jouent ensemble, en équilibre numérique, sur le même thème." },
    { name: "Comparée",                       desc: "Chaque équipe joue tour à tour la même proposition. Le public compare et vote." },
    { name: "Mixte à la manière de",          desc: "Style d'auteur ou de genre imposé : Molière, Audiard, film noir..." },
    { name: "Comparée à la manière de",       desc: "Chaque équipe joue le thème dans le style imposé, à sa façon." },
    { name: "Mixte chantée",                  desc: "Improvisation entièrement ou partiellement chantée, mélodies et paroles improvisées." },
    { name: "Comparée chantée",               desc: "Chaque équipe propose sa version chantée du même thème." },
    { name: "Mixte sans paroles",             desc: "Aucun mot prononcé : seul le geste raconte. Concentration extrême." },
    { name: "Sans paroles avec soutien musical", desc: "Improvisation muette, mais l'écriture est rigoureusement influencée par l'ambiance musicale imposée. (Dramaction)" },
    { name: "Mixte rimée",                    desc: "Toutes les répliques riment. Octosyllabes ou alexandrins selon niveau." },
    { name: "Comparée rimée",                 desc: "Chaque équipe livre sa version rimée du thème." },
    { name: "Mixte avec accessoire",          desc: "Un objet imposé doit être central à l'improvisation." },
    { name: "Comparée à contrainte",          desc: "Chaque équipe joue le thème avec une contrainte tirée au sort différente." },
    { name: "Sans thème ni caucus",           desc: "Aucun thème annoncé, aucun temps de concertation. Pure inventivité immédiate. (Dramaction)" },
    { name: "Saute-mouton",                   desc: "Quatre improvisations différentes, un thème par impro. La 1ʳᵉ avec un joueur, on en ajoute un à chaque impro suivante. (Dramaction)" },
    { name: "Videoway",                       desc: "Mixte avec 4 canaux TV (F1-F4), contenu différent par canal. L'arbitre saute d'un canal à l'autre sans ordre prédéfini. (Dramaction)" },
    { name: "Sensorielle",                    desc: "Un des cinq sens d'un improvisateur est stimulé. Cette sensation doit nourrir toute l'écriture de l'impro. (Dramaction)" },
    { name: "Mixte à thèse",                  desc: "L'improvisation doit défendre une thèse philosophique annoncée à l'avance." },
    { name: "Comparée libre",                 desc: "Aucune contrainte de forme, juste le thème. Liberté totale de traitement." }
  ],

  /* ---------------- MATCH-SPECIFIC: durations ---------------- */
  durations: {
    debutant:  ["30 secondes", "1 minute", "1 minute 30", "2 minutes"],
    confirme:  ["1 minute", "2 minutes", "3 minutes", "4 minutes", "5 minutes"],
    expert:    ["3 minutes", "5 minutes", "7 minutes", "10 minutes", "15 minutes", "20 minutes"]
  },

  /* ---------------- MATCH-SPECIFIC: number of players ---------------- */
  players: {
    debutant:  ["1 joueur", "2 joueurs", "3 joueurs", "Toute l'équipe"],
    confirme:  ["1 joueur", "2 joueurs", "3 joueurs", "4 joueurs", "Toute l'équipe", "Capitaine seul"],
    expert:    ["1 joueur", "2 joueurs", "Mixte 1 + 1", "Mixte 2 + 2", "3 joueurs imposés", "Toute l'équipe", "Capitaine + 1"]
  }
};

/* ---------- Sources d'inspiration (affichées dans le footer) ---------- */
const IMPRO_SOURCES = [
  { name: "Tadam Impro — 10 exercices pour débutants",
    url:  "https://www.tadam-impro.fr/blogs/news/10-exercices-dimprovisation-pour-debutant-a-faire-avec-ses-amis" },
  { name: "Théâtre Instant Présent — Exercices d'improvisation",
    url:  "https://theatreinstantpresent.org/theatre-social/exercices-improvisation/" },
  { name: "Cours Le Foyer — Improvisation théâtrale : exercices et techniques",
    url:  "https://www.courslefoyer.com/fiches-conseil/improvisation-theatrale-exercices-et-techniques-pour-progresser" },
  { name: "Wikiversité — Liste de thèmes d'improvisation",
    url:  "https://fr.wikiversity.org/wiki/Exercices_de_th%C3%A9%C3%A2tre/Liste_de_th%C3%A8mes_d%27improvisation" },
  { name: "Evenice — 10 exercices solo pour améliorer ses impros",
    url:  "https://www.evenice.fr/10-exercices-a-faire-seul-pour-ameliorer-ses-impros/" },
  { name: "Impro-Exo — Exercices classés par thématique",
    url:  "https://impro-exo.fr/thematique/" },
  { name: "Dramaction — Le cercle d'improvisations",
    url:  "https://www.dramaction.qc.ca/fr/le-cercle-d%E2%80%99improvisations/" },
  { name: "Dramaction — Catégories d'improvisation (LNI)",
    url:  "https://www.dramaction.qc.ca/fr/improvisation/categories/" },
  { name: "Dramaction — L'ultime banque de thèmes (5557 thèmes A→Z)",
    url:  "https://www.dramaction.qc.ca/fr/improvisation/themes-dimprovisation/" },
  { name: "Passion-Improvisation — 100 thèmes originaux pour cabaret/match",
    url:  "https://www.passion-improvisation.com/100-themes-originaux-pour-des-impros-de-cabaret-ou-de-match/" },
  { name: "InFamily — 40 exercices d'improvisation théâtrale",
    url:  "https://www.infamily.fr/40-exercices-dimprovisation-theatrale/" },
  { name: "Impro-Exo — Démarrer une impro",
    url:  "https://impro-exo.fr/thematique/demarrer-une-impro" },
  { name: "Impro etc. — À la découverte de l'impro rimée",
    url:  "https://improetc.wordpress.com/2014/06/06/a-la-decouverte-dun-exercice-limpro-rimee/" },
  { name: "MentorShow — 5 exercices d'improvisation",
    url:  "https://mentorshow.com/blog/exercices-d-improvisation" }
];

/* expose for app.js */
if (typeof window !== "undefined") {
  window.IMPRO_DATA    = IMPRO_DATA;
  window.IMPRO_SOURCES = IMPRO_SOURCES;
}
