/**
 * js/suite/rules-content.js — « Le match d'impro : règles, déroulement,
 * arbitrage ». Article long de la section Découverte (#/discover/regles).
 *
 * Contenu éditorial, pas d'interface : window.ActoRulesContent = { fr, en }.
 * Les autres langues du Studio reçoivent l'anglais (un bandeau le signale) —
 * traduire un article de cette taille dans sept langues se fera à la demande.
 *
 * Structure d'un article :
 *   { title, intro, sections: [ { id, h, blocks: [ {p}, {ul:[…]}, {dl:[[terme, définition]…]}, {h3} ] } ] }
 * Tout est du texte brut : discover.js échappe et met en forme.
 *
 * Les règles varient d'une ligue à l'autre (durées, seuils de fautes,
 * égalités) : le texte le dit et décrit ce qui est commun à presque toutes.
 */
(function () {
  "use strict";

  var FR = {
    title: "Le match d'impro : règles, déroulement, arbitrage",
    intro: "Deux équipes, un arbitre, un public qui vote : le match d'improvisation est le format le plus connu de l'impro théâtrale. Voici comment il se joue, comment on l'arbitre, et le vocabulaire pour s'y retrouver.",
    sections: [
      { id: "origines", h: "D'où vient le match d'impro ?", blocks: [
        { p: "Le match d'improvisation naît à Montréal en 1977. Robert Gravel et Yvon Leduc, du Théâtre expérimental de Montréal, cherchent à ramener le public vers le théâtre et empruntent au sport national québécois — le hockey sur glace — tout son décorum : une patinoire, des maillots, un arbitre à sifflet, des pénalités, un tableau des scores. La Ligue nationale d'improvisation (LNI) est fondée dans la foulée et joue toujours." },
        { p: "Le format traverse l'Atlantique dans les années 1980 : la France, puis la Belgique et la Suisse créent leurs ligues, et l'on joue aujourd'hui des matchs d'impro sur tous les continents, en dizaines de langues. Presque au même moment, à Calgary, Keith Johnstone invente le Theatresports, un cousin qui repose sur la même idée : mettre en scène l'improvisation comme une compétition sportive, pour le plaisir du public." }
      ]},
      { id: "acteurs", h: "Qui est sur la patinoire ?", blocks: [
        { dl: [
          ["Les deux équipes", "En général cinq ou six joueurs chacune (souvent mixtes), un capitaine, et un entraîneur — le « coach » — qui conseille pendant le caucus et gère les entrées en jeu. Chaque équipe a sa couleur de maillot."],
          ["L'arbitre", "Le maître du jeu : il tire et lit les cartes, siffle le début et la fin des improvisations, sanctionne les fautes, fait compter les votes et tranche les litiges. Il est souvent aidé de deux assistants qui tiennent le temps et comptent les cartons."],
          ["Le maître de cérémonie", "Il présente les équipes, chauffe la salle, annonce les thèmes et les résultats, et rappelle au public comment voter."],
          ["Le musicien", "Présent dans beaucoup de ligues, il improvise en direct l'ambiance sonore des scènes et accompagne les catégories chantées."],
          ["Le public", "Il est juge : après chaque improvisation, il vote pour l'équipe qu'il a préférée en levant un carton bicolore — une couleur par équipe. Et il a le droit de désapprouver l'arbitre, bruyamment."]
        ]}
      ]},
      { id: "deroulement", h: "Le déroulement d'un match", blocks: [
        { p: "Un match se joue en deux ou trois périodes de vingt à quarante-cinq minutes selon les ligues (la LNI joue trois périodes de trente minutes), séparées par des pauses. Il commence par la présentation des équipes — parfois un hymne, toujours des maillots — et se termine par la désignation des meilleurs joueurs, les « étoiles », et une poignée de main." },
        { p: "Chaque improvisation suit le même rituel :" },
        { ul: [
          "L'arbitre tire une carte au hasard et la lit au micro : le titre ou thème, la catégorie, la nature, le nombre de joueurs et la durée.",
          "Le caucus : vingt à trente secondes pendant lesquelles chaque équipe se concerte avec son coach — qui joue, avec quelle idée de départ.",
          "Coup de sifflet : l'improvisation commence. Les joueurs entrent sur la patinoire depuis leur banc.",
          "Coup de sifflet : elle s'arrête, quand le temps est écoulé ou quand l'arbitre en décide ainsi.",
          "Le vote : le public lève son carton du côté de l'équipe qu'il a préférée. Les assistants comptent ; l'équipe majoritaire marque un point.",
          "L'arbitre annonce le résultat, les fautes éventuelles, et enchaîne sur la carte suivante."
        ]},
        { p: "Selon les ligues, une égalité donne un point à chaque équipe, à aucune, ou se départage sur une improvisation supplémentaire. C'est l'un des points à préciser aux équipes avant le match." }
      ]},
      { id: "carte", h: "Lire la carte : nature, catégorie, thème", blocks: [
        { h3: "La nature" },
        { dl: [
          ["Mixte", "Les deux équipes jouent ensemble, en même temps, une seule et même histoire. C'est la nature la plus courante — et celle qui demande le plus d'écoute, puisqu'on construit avec des partenaires… adverses."],
          ["Comparée", "Les équipes jouent l'une après l'autre, sur la même carte, chacune pendant la durée annoncée. L'ordre est tiré au sort — palet lancé sur la patinoire, pile ou face. Le public compare les deux versions, d'où le nom."]
        ]},
        { h3: "La catégorie" },
        { p: "« Libre » signifie sans contrainte de forme : les joueurs font ce qu'ils veulent du thème. Les catégories imposées, elles, dictent une manière de jouer. Parmi les plus répandues :" },
        { ul: [
          "Chantée : tout ou partie de l'improvisation est chantée.",
          "Muette, ou sans paroles : tout passe par le corps, le regard, les objets.",
          "Rimée : les répliques riment.",
          "À la manière de… : un auteur, un cinéaste, un genre (Molière, Tarantino, le western, le film d'horreur).",
          "Doublage : des joueurs jouent en silence pendant que d'autres, à l'écart, leur prêtent leur voix.",
          "Poursuite : l'improvisation reprend exactement là où la précédente s'est arrêtée.",
          "Dramatique, ou « sans humour » : le rire est interdit, l'émotion obligatoire.",
          "Avec accessoire : un objet imposé doit être utilisé — et détourné.",
          "Abécédaire : chaque réplique commence par la lettre suivante de l'alphabet."
        ]},
        { h3: "Le reste de la carte" },
        { p: "Le nombre de joueurs (un, deux, trois… ou « illimité »), la durée (d'une à vingt minutes, le plus souvent entre deux et six), et le thème — une phrase, un titre, parfois un simple mot. Une bonne carte se lit vite et se comprend du premier coup, par le public comme par les joueurs." }
      ]},
      { id: "fautes", h: "Les fautes", blocks: [
        { p: "L'arbitre sanctionne ce qui abîme le jeu. Chaque faute est annoncée au micro, accompagnée d'un geste codifié, et brièvement expliquée. La liste exacte et les seuils varient d'une ligue à l'autre ; celles-ci se retrouvent presque partout :" },
        { dl: [
          ["Obstruction", "Empêcher l'histoire d'avancer : refuser ou bloquer les propositions des partenaires, monopoliser la scène, casser ce que les autres construisent."],
          ["Manque d'écoute", "Ne pas tenir compte de ce qui a été dit ou joué avant soi — le personnage change de nom, le lieu se contredit."],
          ["Cabotinage", "Jouer pour soi ou pour faire rire le public, au détriment de la scène et des partenaires."],
          ["Cliché", "Recourir à des idées toutes faites, des personnages ou des ressorts éculés."],
          ["Décrochage", "Sortir de son personnage : rire, commenter, redevenir soi-même au milieu de la scène."],
          ["Retard de jeu", "Tarder à entrer en jeu, laisser un blanc qui s'éternise, gagner du temps."],
          ["Rudesse excessive", "Toute violence physique ou verbale réelle : on peut jouer une bagarre, pas se battre."],
          ["Refus de personnage", "Ne pas accepter le personnage, la situation ou le rôle que le jeu vous donne."],
          ["Procédure illégale", "Ne pas respecter la carte : mauvaise catégorie, thème ignoré, entrée depuis le mauvais côté, joueur qui sort de la patinoire sans raison."],
          ["Nombre illégal de joueurs", "Plus de joueurs sur la patinoire que la carte n'en autorise."],
          ["Confusion", "Une improvisation devenue illisible : trop d'intrigues, personne ne sait plus où l'on est."],
          ["Mauvaise conduite", "Comportement inacceptable envers l'arbitre, le public ou un adversaire. C'est la faute grave, qui peut valoir l'expulsion."]
        ]},
        { p: "Les fautes se cumulent. La règle la plus répandue : toutes les trois fautes d'une équipe, un point est accordé à l'équipe adverse ; et un joueur qui accumule trop de fautes personnelles est expulsé pour le reste du match. Certaines ligues comptent par joueur, d'autres par équipe, d'autres distinguent fautes mineures et majeures — à vérifier dans le règlement local." }
      ]},
      { id: "arbitrage", h: "L'arbitrage : l'art du juste milieu", blocks: [
        { p: "Arbitrer, ce n'est pas seulement siffler. L'arbitre est le gardien du jeu — il garantit que la carte est respectée, que les histoires peuvent naître, que le rythme tient et que personne ne se blesse — et il est en même temps un personnage du spectacle. Le public adore le huer ; c'est prévu, c'est même le jeu." },
        { h3: "Ce qu'un bon arbitre fait" },
        { ul: [
          "Il est lisible : chaque décision est annoncée au micro et expliquée en une phrase. Le public doit comprendre pourquoi il y a faute.",
          "Il est constant : les mêmes critères du début à la fin du match, pour les deux équipes.",
          "Il est rare : une faute doit rester un événement. Un arbitre qui siffle tout étouffe le jeu ; un arbitre qui ne siffle rien laisse l'obstruction gagner.",
          "Il protège l'histoire : sa priorité est de sanctionner ce qui empêche les joueurs de construire ensemble — obstruction, manque d'écoute, cabotinage — plus que les maladresses.",
          "Il tient le temps : montre ou chronomètre, assistants au signal, sifflet net à la fin de la durée. Une improvisation qui déborde perd le public.",
          "Il prépare ses cartes : il alterne mixte et comparée, libre et catégories imposées, courtes et longues, et garde quelques cartes fortes pour la fin.",
          "Il briefe les équipes avant le match : les règles locales, le seuil de fautes, ce qui se passe en cas d'égalité, les catégories qui seront jouées.",
          "Il reste impartial dans le fond et théâtral dans la forme : sévère, sûr de lui, jamais méprisant. On peut se moquer de l'arbitre ; l'arbitre ne se moque de personne."
        ]},
        { h3: "Le vote et ses litiges" },
        { p: "Le vote se fait à main levée avec les cartons ; les assistants comptent chacun une moitié de salle et l'arbitre annonce le résultat. En cas de doute, on recompte plutôt que de trancher au jugé. Un carton levé des deux côtés, ou un vote après le signal, ne compte pas. Et si le public conteste une décision à coups de sifflets, l'arbitre écoute… et maintient sa décision : c'est aussi ça, le personnage." },
        { h3: "La pantoufle" },
        { p: "Tradition québécoise : les spectateurs mécontents d'une décision jettent leur pantoufle — ou leur chaussure — sur la patinoire. Certaines ligues distribuent des pantoufles en tissu à l'entrée pour la peine. C'est un cri du cœur, pas une révolte : l'arbitre ramasse, sourit, et continue." }
      ]},
      { id: "lexique", h: "Petit lexique", blocks: [
        { dl: [
          ["Caucus", "Les secondes de concertation accordées aux équipes après la lecture de la carte."],
          ["Carte (ou carton)", "La fiche tirée par l'arbitre : thème, catégorie, nature, nombre de joueurs, durée."],
          ["Catégorie", "La contrainte de forme imposée à l'improvisation (libre, chantée, rimée…)."],
          ["Nature", "Mixte (ensemble) ou comparée (chacune son tour)."],
          ["Patinoire", "L'aire de jeu, souvent délimitée par une bande, comme au hockey."],
          ["Palet (ou rondelle)", "Le disque que l'arbitre lance pour tirer au sort l'équipe qui commence une comparée."],
          ["Banc", "L'endroit où les joueurs attendent, d'où ils entrent en jeu et où ils reviennent."],
          ["Coach (entraîneur)", "La personne qui conseille l'équipe pendant le caucus et gère les entrées."],
          ["Capitaine", "Le joueur qui représente son équipe auprès de l'arbitre."],
          ["Cartons de vote", "Les cartons bicolores du public, une couleur par équipe."],
          ["Étoiles", "Les joueurs les plus remarqués du match, désignés à la fin."],
          ["Pantoufle", "L'arme du spectateur en désaccord avec l'arbitre."]
        ]}
      ]},
      { id: "au-dela", h: "Au-delà du match", blocks: [
        { p: "Le match est la porte d'entrée, pas le tout de l'improvisation. La longue forme (le Harold, la Soirée) construit une seule grande histoire pendant une heure ; le cabaret enchaîne de courts numéros variés ; le catch impro oppose des duos masqués dans un ring ; le Theatresports, l'impro musicale, la comédie improvisée façon série télé… Dans Acto, la section Spectacle sert à préparer ces formats sans score ni équipes." }
      ]},
      { id: "acto", h: "Et dans Acto ?", blocks: [
        { p: "La section Match tire les cartes pour vous (nature, catégorie, thème, nombre de joueurs, durée), gère le caucus, le chronomètre et le vote, affiche le tableau des scores sur un écran public et compte les fautes. Le Coaching prépare les entraînements de la troupe avec échauffements et exercices ; la Découverte, où vous êtes, propose des exercices simples à lancer tout de suite." }
      ]}
    ]
  };

  var EN = {
    title: "The impro match: rules, flow, refereeing",
    intro: "Two teams, a referee, an audience that votes: the improvisation match is the best-known format of theatrical impro. Here is how it is played, how it is refereed, and the vocabulary you need to follow it.",
    sections: [
      { id: "origines", h: "Where does the impro match come from?", blocks: [
        { p: "The improvisation match was born in Montréal in 1977. Robert Gravel and Yvon Leduc, of the Théâtre expérimental de Montréal, wanted to bring audiences back to the theatre and borrowed the whole decorum of Québec's national sport, ice hockey: a rink, jerseys, a referee with a whistle, penalties, a scoreboard. The Ligue nationale d'improvisation (LNI) was founded right after — and still plays today." },
        { p: "The format crossed the Atlantic in the 1980s: France, then Belgium and Switzerland founded their leagues, and impro matches are now played on every continent, in dozens of languages. Almost at the same time, in Calgary, Keith Johnstone invented Theatresports, a cousin built on the same idea: staging improvisation as a sporting competition, for the audience's pleasure." }
      ]},
      { id: "acteurs", h: "Who is on the rink?", blocks: [
        { dl: [
          ["The two teams", "Usually five or six players each (often mixed), a captain, and a coach who advises during the huddle and manages who goes on. Each team has its own jersey colour."],
          ["The referee", "The master of the game: draws and reads the cards, whistles the start and end of each improvisation, calls fouls, has the votes counted and settles disputes. Often helped by two assistants who keep time and count the cards."],
          ["The master of ceremonies", "Introduces the teams, warms up the room, announces themes and results, and reminds the audience how to vote."],
          ["The musician", "Present in many leagues, improvising the soundtrack of the scenes live and accompanying the sung categories."],
          ["The audience", "The judge: after every improvisation it votes for the team it preferred by raising a two-coloured card — one colour per team. It is also entitled to disapprove of the referee, loudly."]
        ]}
      ]},
      { id: "deroulement", h: "How a match unfolds", blocks: [
        { p: "A match is played in two or three periods of twenty to forty-five minutes depending on the league (the LNI plays three thirty-minute periods), separated by breaks. It opens with the presentation of the teams — sometimes an anthem, always jerseys — and closes with the naming of the best players, the “stars”, and a handshake." },
        { p: "Every improvisation follows the same ritual:" },
        { ul: [
          "The referee draws a card at random and reads it out: the title or theme, the category, the nature, the number of players and the duration.",
          "The huddle (“caucus”): twenty to thirty seconds during which each team confers with its coach — who plays, with which opening idea.",
          "Whistle: the improvisation begins. Players enter the rink from their bench.",
          "Whistle: it stops, when time is up or when the referee decides so.",
          "The vote: the audience raises its card on the side of the team it preferred. The assistants count; the team with the majority scores a point.",
          "The referee announces the result and any fouls, then moves on to the next card."
        ]},
        { p: "Depending on the league, a tie gives a point to each team, to neither, or is settled with an extra improvisation. It is one of the things to clarify with the teams before the match." }
      ]},
      { id: "carte", h: "Reading the card: nature, category, theme", blocks: [
        { h3: "The nature" },
        { dl: [
          ["Mixed (mixte)", "Both teams play together, at the same time, one single story. The most common nature — and the one that demands the most listening, since you build with partners who are… opponents."],
          ["Compared (comparée)", "The teams play one after the other, on the same card, each for the announced duration. The order is drawn — a puck thrown onto the rink, a coin toss. The audience compares the two versions, hence the name."]
        ]},
        { h3: "The category" },
        { p: "“Free” means no constraint of form: the players do what they want with the theme. Imposed categories dictate a way of playing. Among the most widespread:" },
        { ul: [
          "Sung: all or part of the improvisation is sung.",
          "Silent, or without words: everything goes through the body, the eyes, the objects.",
          "Rhymed: the lines rhyme.",
          "In the style of…: an author, a filmmaker, a genre (Molière, Tarantino, the western, the horror film).",
          "Dubbed: some players act in silence while others, off to the side, lend them their voices.",
          "Continuation: the improvisation picks up exactly where the previous one stopped.",
          "Dramatic, or “no laughs”: laughter is forbidden, emotion compulsory.",
          "With a prop: an imposed object must be used — and repurposed.",
          "Alphabet: each line starts with the next letter of the alphabet."
        ]},
        { h3: "The rest of the card" },
        { p: "The number of players (one, two, three… or “unlimited”), the duration (from one to twenty minutes, most often between two and six), and the theme — a sentence, a title, sometimes a single word. A good card reads fast and is understood at once, by the audience as much as by the players." }
      ]},
      { id: "fautes", h: "Fouls", blocks: [
        { p: "The referee penalises whatever damages the game. Every foul is announced on the microphone, with a codified gesture, and briefly explained. The exact list and thresholds vary from league to league; these are found almost everywhere:" },
        { dl: [
          ["Obstruction", "Stopping the story from moving forward: refusing or blocking partners' offers, hogging the stage, breaking what others are building."],
          ["Lack of listening", "Ignoring what was said or played before you — the character changes name, the place contradicts itself."],
          ["Showboating (cabotinage)", "Playing for yourself or for the laugh, to the detriment of the scene and your partners."],
          ["Cliché", "Falling back on ready-made ideas, worn-out characters or devices."],
          ["Breaking character (décrochage)", "Stepping out of your character: laughing, commenting, becoming yourself in the middle of the scene."],
          ["Delay of game", "Being slow to enter, letting a silence drag on, playing for time."],
          ["Excessive roughness", "Any real physical or verbal violence: you may play a fight, not have one."],
          ["Refusal of character", "Not accepting the character, situation or role the game hands you."],
          ["Illegal procedure", "Not respecting the card: wrong category, theme ignored, entering from the wrong side, leaving the rink without reason."],
          ["Illegal number of players", "More players on the rink than the card allows."],
          ["Confusion", "An improvisation that has become unreadable: too many plots, nobody knows where we are any more."],
          ["Misconduct", "Unacceptable behaviour towards the referee, the audience or an opponent. The serious foul, which can mean expulsion."]
        ]},
        { p: "Fouls add up. The most widespread rule: every three fouls by a team, the opposing team is awarded a point; and a player who accumulates too many personal fouls is expelled for the rest of the match. Some leagues count per player, others per team, others distinguish minor and major fouls — check the local rulebook." }
      ]},
      { id: "arbitrage", h: "Refereeing: the art of the right measure", blocks: [
        { p: "Refereeing is not only whistling. The referee is the guardian of the game — making sure the card is respected, that stories can be born, that the pace holds and nobody gets hurt — and at the same time a character in the show. The audience loves to boo the referee; it is expected, it is even part of the game." },
        { h3: "What a good referee does" },
        { ul: [
          "Is readable: every decision is announced on the microphone and explained in one sentence. The audience must understand why there is a foul.",
          "Is consistent: the same criteria from the start to the end of the match, for both teams.",
          "Is sparing: a foul must remain an event. A referee who whistles everything smothers the game; one who whistles nothing lets obstruction win.",
          "Protects the story: the priority is to penalise what stops players from building together — obstruction, lack of listening, showboating — more than clumsiness.",
          "Keeps time: a watch or timer, assistants on the signal, a clean whistle at the end of the duration. An improvisation that overruns loses the audience.",
          "Prepares the cards: alternates mixed and compared, free and imposed categories, short and long, and keeps a few strong cards for the end.",
          "Briefs the teams before the match: local rules, the foul threshold, what happens in a tie, which categories will be played.",
          "Stays impartial in substance and theatrical in form: stern, self-assured, never contemptuous. One may mock the referee; the referee mocks no one."
        ]},
        { h3: "The vote and its disputes" },
        { p: "The vote is by show of cards; each assistant counts half of the room and the referee announces the result. When in doubt, recount rather than guess. A card raised on both sides, or a vote after the signal, does not count. And if the audience protests a decision with whistles, the referee listens… and upholds the decision: that, too, is the character." },
        { h3: "The slipper" },
        { p: "A Québec tradition: spectators unhappy with a decision throw their slipper — or their shoe — onto the rink. Some leagues hand out cloth slippers at the door for that very purpose. It is a cry from the heart, not a revolt: the referee picks it up, smiles, and carries on." }
      ]},
      { id: "lexique", h: "A short glossary", blocks: [
        { dl: [
          ["Caucus (huddle)", "The seconds of conferring granted to the teams after the card is read."],
          ["Card", "The slip drawn by the referee: theme, category, nature, number of players, duration."],
          ["Category", "The constraint of form imposed on the improvisation (free, sung, rhymed…)."],
          ["Nature", "Mixed (together) or compared (one after the other)."],
          ["Rink", "The playing area, often bounded by boards, as in hockey."],
          ["Puck", "The disc the referee throws to draw which team starts a compared improvisation."],
          ["Bench", "Where the players wait, from where they enter the game and where they return."],
          ["Coach", "The person who advises the team during the huddle and manages who goes on."],
          ["Captain", "The player who represents the team with the referee."],
          ["Voting cards", "The audience's two-coloured cards, one colour per team."],
          ["Stars", "The most noticed players of the match, named at the end."],
          ["Slipper", "The weapon of the spectator who disagrees with the referee."]
        ]}
      ]},
      { id: "au-dela", h: "Beyond the match", blocks: [
        { p: "The match is the doorway, not the whole of improvisation. Long form (the Harold, la Soirée) builds one big story over an hour; cabaret strings together short varied pieces; catch impro pits masked duos against each other in a ring; Theatresports, musical impro, improvised TV-style comedy… In Acto, the Show section is there to prepare these formats without scores or teams." }
      ]},
      { id: "acto", h: "And in Acto?", blocks: [
        { p: "The Match section draws the cards for you (nature, category, theme, number of players, duration), runs the huddle, the timer and the vote, shows the scoreboard on a public screen and counts fouls. Coaching prepares the troupe's rehearsals with warm-ups and exercises; Discovery, where you are now, offers simple exercises to launch right away." }
      ]}
    ]
  };

  window.ActoRulesContent = { fr: FR, en: EN };
})();
