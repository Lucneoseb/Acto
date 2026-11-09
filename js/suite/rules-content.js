/**
 * js/suite/rules-content.js — « Le match d'impro : règles, déroulement,
 * arbitrage ». Article long de la section Découverte (#/discover/regles).
 *
 * Contenu éditorial, pas d'interface : window.ActoRulesContent = { fr, en }.
 * Les autres langues du Studio reçoivent l'anglais (un bandeau le signale) —
 * traduire un article de cette taille dans sept langues se fera à la demande.
 *
 * Structure d'un article :
 *   { title, intro, sections: [ { id, h, blocks: [ {p}, {ul:[…]}, {ol:[…]},
 *     {dl:[[terme, définition]…]}, {h3}, {arts:[[clé, intitulé, geste]…]},
 *     {note} ] } ] }
 * Tout est du texte brut : discover.js échappe et met en forme. Les blocs
 * {arts} ne portent que des clés de dessin — les SVG sont dans rules-art.js.
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
          ["L'arbitre", "Le maître du jeu : il tire et lit les cartes, siffle le début et la fin des improvisations, sanctionne les fautes, fait compter les votes et tranche les litiges. Beaucoup d'arbitres portent aussi un gazou — un kazoo : ils le font sonner avant le coup de sifflet final pour annoncer qu'une faute va tomber."],
          ["Les assistants-arbitres", "Deux, le plus souvent, postés de part et d'autre de l'aire de jeu. Ils comptent chacun une moitié de salle au moment du vote, ramassent les pantoufles entre deux improvisations et signalent à l'arbitre ce qu'il n'a pas pu voir. Toutes les ligues n'en ont pas : sans eux, l'arbitre compte seul."],
          ["Le maître de cérémonie", "Il présente les équipes, chauffe la salle, explique les catégories au public, annonce les résultats et rappelle comment voter. C'est aussi lui, très souvent, qui tient le chronomètre — celui de l'improvisation et celui de la période — et qui transmet le temps restant à l'arbitre par signes de la main."],
          ["Le musicien", "Présent dans beaucoup de ligues, il improvise en direct l'ambiance sonore des scènes, accompagne les catégories chantées et lance les jingles qui ponctuent l'annonce des cartes."],
          ["Le public", "Il est juge : après chaque improvisation, il vote pour l'équipe qu'il a préférée en levant un carton bicolore — une couleur par équipe. Et il a le droit de désapprouver l'arbitre, bruyamment."]
        ]}
      ]},
      { id: "deroulement", h: "Le déroulement d'un match", blocks: [
        { p: "Un match se joue en deux ou trois périodes de vingt à quarante-cinq minutes selon les ligues (la LNI joue trois périodes de trente minutes ; en Belgique, deux mi-temps de quarante-cinq), séparées par un entracte dont le maître de cérémonie annonce la durée." },
        { h3: "L'entrée en scène" },
        { ol: [
          "Le maître de cérémonie ouvre la soirée et chauffe la salle.",
          "Le staff arbitral entre sous les huées — c'est la tradition. L'arbitre en profite souvent pour vérifier, avec un sérieux de façade, la solidité des installations.",
          "L'équipe visiteuse entre dans l'ordre : le coach, le capitaine, l'assistant-capitaine, puis les autres jouteurs.",
          "L'équipe locale entre de la même manière.",
          "Les hymnes, si les deux équipes en ont un."
        ]},
        { p: "À la fin du match, on repart dans l'ordre inverse : score et vainqueur annoncés, puis l'équipe visiteuse, l'équipe locale et le staff arbitral renvoyés en coulisses un à un. Entre les deux, on désigne les meilleurs joueurs — les « étoiles » — et tout le monde se serre la main." },
        { h3: "L'annonce de la carte" },
        { p: "Beaucoup de ligues annoncent toujours dans le même ordre, en quatre temps séparés par un jingle : le public reconnaît la musique et sait exactement où l'on en est." },
        { ol: [
          "« La prochaine improvisation sera mixte (ou comparée) et aura pour titre… »",
          "« Nombre de jouteurs… Catégorie… »",
          "« Et le tout pour une durée de… »",
          "« Caucus » — et les vingt secondes commencent."
        ]},
        { h3: "L'improvisation" },
        { ul: [
          "Le caucus : vingt secondes (trente dans certaines ligues) pendant lesquelles chaque équipe se concerte avec son coach — qui joue, avec quelle idée de départ.",
          "Coup de sifflet : l'improvisation commence. Les joueurs entrent sur la patinoire depuis leur banc, et ils ont intérêt à y être : arriver en retard, c'est déjà une faute.",
          "Coup de sifflet : elle s'arrête, quand le temps est écoulé ou quand l'arbitre en décide ainsi. S'il a vu une faute, il fait d'abord sonner son gazou.",
          "Les capitaines — eux seuls — peuvent alors monter demander une explication à l'arbitre. S'ils ne montent pas, ou s'il n'y a pas de faute, on passe directement au vote.",
          "Le vote : le public lève son carton du côté de l'équipe qu'il a préférée. Les assistants comptent ; l'équipe majoritaire marque un point.",
          "L'arbitre annonce le résultat, les fautes éventuelles, et enchaîne sur la carte suivante."
        ]},
        { p: "Selon les ligues, une égalité donne un point à chaque équipe, à aucune, ou se départage sur une improvisation supplémentaire. C'est l'un des points à préciser aux équipes avant le match." }
      ]},
      { id: "decorum", h: "Le décorum : ce qui change d'une ligue à l'autre", blocks: [
        { p: "Le match est né avec la panoplie complète du hockey. Dans les faits, chaque ligue garde ce qui lui parle, et ce qui paraît gravé dans le marbre à Montréal se joue autrement à Bruxelles ou à Lyon. Quelques écarts très courants :" },
        { ul: [
          "La patinoire : beaucoup d'équipes jouent sur un plateau nu, sans bande. Quand elle existe, elle devrait avoir trois entrées — une par équipe, une centrale — mais on en voit souvent deux, parfois une seule.",
          "Les vareuses : loin d'être systématiques. Certaines équipes jouent en civil, et la couleur ne vit plus que sur les cartons de vote.",
          "Les hymnes : certaines équipes en ont un, d'autres pas. On ne les joue que si les deux en ont.",
          "Les assistants-arbitres : pas toujours présents. L'arbitre compte alors les votes seul.",
          "La composition : en Belgique, cinq contre cinq avec au moins un représentant de chaque sexe en jeu, là où le règlement d'origine demandait trois et trois.",
          "Les pantoufles : chez les amateurs, on ne les lance que sur l'arbitre, jamais pendant une improvisation."
        ]},
        { p: "D'où la seule règle vraiment universelle : se mettre d'accord avant de jouer. Le briefing que l'arbitre fait aux deux équipes tient lieu de règlement pour la soirée." }
      ]},
      { id: "carte", h: "Lire la carte : nature, catégorie, thème", blocks: [
        { h3: "La nature" },
        { dl: [
          ["Mixte", "Les deux équipes jouent ensemble, en même temps, une seule et même histoire. C'est la nature la plus courante — et celle qui demande le plus d'écoute, puisqu'on construit avec des partenaires… adverses."],
          ["Comparée", "Les équipes jouent l'une après l'autre, sur la même carte, chacune pendant la durée annoncée. L'ordre est tiré au sort — palet lancé sur la patinoire, pile ou face. Le public compare les deux versions, d'où le nom. L'équipe qui attend doit se taire : parler au banc pendant que l'autre joue vaut une faute."]
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
        { p: "L'arbitre sanctionne ce qui abîme le jeu. Une faute peut viser les deux équipes, une seule, ou un jouteur en particulier. La liste exacte et les seuils varient d'une ligue à l'autre ; celles-ci se retrouvent presque partout :" },
        { dl: [
          ["Obstruction", "Empêcher l'histoire d'avancer : refuser ou bloquer les propositions des partenaires, monopoliser la scène, casser ce que les autres construisent."],
          ["Manque d'écoute", "Ne pas tenir compte de ce qui a été dit ou joué avant soi — le personnage change de nom, le lieu se contredit, on traverse la table installée dix secondes plus tôt."],
          ["Cabotinage", "Jouer pour soi ou pour faire rire le public, au détriment de la scène et des partenaires."],
          ["Cliché", "Recourir à des idées toutes faites, des personnages ou des ressorts éculés — et les personnages célèbres, qui font le travail à la place du jouteur."],
          ["Décrochage", "Sortir de son personnage : rire, commenter, redevenir soi-même au milieu de la scène."],
          ["Retard de jeu", "Tarder à entrer en jeu après le caucus, laisser un blanc qui s'éternise, gagner du temps — ou une histoire qui n'avance plus."],
          ["Rudesse excessive", "Toute violence physique ou verbale réelle : on peut jouer une bagarre, pas se battre. Imposer ses idées en force relève de la même faute."],
          ["Refus de personnage", "Ne pas accepter le personnage, la situation ou le rôle que le jeu vous donne — y compris rester planté dans l'aire de jeu sans jamais entrer dans l'histoire."],
          ["Sortie de thème", "Ne pas exploiter ce qui a été annoncé : le titre, la nature, la catégorie, le nombre de jouteurs ou la durée."],
          ["Procédure illégale", "Enfreindre une règle du match : entrer du mauvais côté, quitter l'aire de jeu sans raison, parler au banc pendant une comparée."],
          ["Accessoire illégal", "Utiliser un objet qui n'est pas prévu. Seule la vareuse — et parfois une écharpe — sert d'accessoire ; le reste se mime."],
          ["Nombre illégal de joueurs", "Plus de joueurs sur la patinoire que la carte n'en autorise, ou une équipe incomplète au coup d'envoi."],
          ["Confusion", "Une improvisation devenue illisible : trop d'intrigues, trop de lieux, personne ne sait plus qui est qui."],
          ["Mauvaise conduite", "Comportement inacceptable envers l'arbitre, le public ou un adversaire, ou propos hors sujet pour un spectacle tout public. C'est la faute grave, qui peut valoir l'expulsion."]
        ]},
        { h3: "Les gestes de l'arbitre" },
        { p: "Chaque faute a son geste. L'arbitre siffle, désigne l'équipe ou le jouteur fautif, fait le signe, puis annonce la faute au micro et l'explique en une phrase : au fond de la salle, on doit comprendre même sans entendre. Voici les plus répandus." },
        { arts: [
          ["faute-obstruction", "Obstruction", "Les deux avant-bras levés, paumes vers l'avant : le mur."],
          ["faute-ecoute", "Manque d'écoute", "La main en cornet derrière l'oreille."],
          ["faute-cabotinage", "Cabotinage", "La main près du visage, doigts écartés qui frétillent."],
          ["faute-cliche", "Cliché", "Une jambe repliée vers l'avant, le pas qu'on refait : déjà vu."],
          ["faute-decrochage", "Décrochage", "Un poing levé au-dessus de l'épaule, qui monte et descend."],
          ["faute-retard", "Retard de jeu", "L'avant-bras dressé, la main qui tourne : ça n'avance pas."],
          ["faute-rudesse", "Rudesse excessive", "Le poing frappé dans la paume ouverte."],
          ["faute-refus", "Refus de personnage", "L'arbitre tourne le dos, bras croisés."],
          ["faute-procedure", "Procédure illégale", "Une main à plat qui tape l'avant-bras opposé."],
          ["faute-nombre", "Nombre illégal", "La main à plat posée sur le dessus du crâne."],
          ["faute-confusion", "Confusion", "Les deux poings qui tournent l'un autour de l'autre, devant le ventre."],
          ["faute-conduite", "Mauvaise conduite", "Les deux bras tendus à l'horizontale."]
        ]},
        { note: "Dessins Acto. Le répertoire complet vient du Québec et toutes les ligues n'en reprennent pas toute la grammaire — les fautes majeures et mineures, par exemple, n'existent pas partout. Demandez les gestes de la maison avant d'aller arbitrer ailleurs." },
        { h3: "Combien de fautes avant un point ?" },
        { p: "Les fautes se cumulent. La règle la plus répandue : trois fautes dans le camp d'une équipe — sifflées à l'équipe ou à l'un de ses jouteurs — et l'équipe adverse marque un point. Un jouteur qui prend deux fautes personnelles est exclu pour le reste du match ; dans beaucoup de ligues, ses deux fautes sortent alors du compteur de l'équipe. D'autres comptent uniquement par équipe, d'autres distinguent mineures et majeures et peuvent « majorer » une faute déjà sifflée : à vérifier dans le règlement local." },
        { p: "Rien n'interdit non plus à un arbitre d'inventer une faute pour la soirée, du moment qu'il l'explique : « manque de vocabulaire » pour un jouteur qui jure toutes les dix secondes, « déjà-vu » pour celui qui ressort son numéro à chaque carte." }
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
        { h3: "Les assistants-arbitres" },
        { p: "Deux assistants encadrent l'aire de jeu. Ils comptent chacun une moitié de salle au moment du vote, ramassent les pantoufles entre deux improvisations et signalent à l'arbitre ce que son dos tourné lui a caché. Pendant une comparée, ils vérifient aussi que l'équipe au banc se tait pendant que l'autre joue : l'assistant qui entend parler laisse tomber un ruban sur l'aire de jeu, et l'arbitre siffle une procédure illégale sans avoir eu à quitter la scène des yeux." },
        { h3: "Le vote et ses litiges" },
        { p: "Le vote se fait à main levée avec les cartons ; les assistants comptent chacun une moitié de salle et l'arbitre annonce le résultat. En cas de doute, on recompte plutôt que de trancher au jugé. Un carton levé des deux côtés, ou un vote après le signal, ne compte pas. Et si le public conteste une décision à coups de sifflets, l'arbitre écoute… et maintient sa décision : c'est aussi ça, le personnage." },
        { h3: "La pantoufle" },
        { p: "Tradition québécoise : les spectateurs mécontents d'une décision jettent leur pantoufle — ou leur chaussure — sur l'aire de jeu. Certaines ligues en distribuent en tissu à l'entrée pour la peine. Chez les amateurs, elle ne se lance que sur l'arbitre, et seulement entre deux improvisations ; en professionnel, on tolère parfois qu'elle vole pendant l'improvisation, dans l'aire de jeu mais jamais sur les jouteurs, pour dire que la qualité n'y est pas. Si le sol se couvre, l'arbitre peut interrompre le temps d'un « nettoyage » : les assistants ramassent, et les joueurs en profitent pour aller chercher une idée auprès de leur équipe. C'est un cri du cœur, pas une révolte : l'arbitre ramasse, sourit, et continue." }
      ]},
      { id: "temps", h: "Tenir le temps : les signes de la main", blocks: [
        { p: "Le chronomètre n'est presque jamais dans la main de l'arbitre : c'est le maître de cérémonie, ou un assistant, qui tient la durée de l'improvisation et celle de la période. Il la transmet en silence, depuis le bord du plateau, par une poignée de signes convenus. L'arbitre reçoit le signe et le répercute aux jouteurs — à ceux qui improvisent comme à ceux qui attendent au banc." },
        { cols: 3, arts: [
          ["temps-dix-minutes", "10 min", "Le poing fermé, doigts vers le bas : dix minutes. C'est le signe de la durée de la période."],
          ["temps-minutes", "3 min", "Un doigt tendu vers le bas par minute restante. Trois doigts : trois minutes."],
          ["temps-trente-secondes", "30 s.", "L'index et le majeur croisés, pointés vers le bas."],
          ["temps-dix-secondes", "10 s.", "La main ouverte, paume vers le sol, secouée de gauche à droite."],
          ["temps-decompte", "5 s.", "La main se retourne, doigts vers le haut : cinq, quatre, trois, deux, un."],
          ["temps-conclure", "Conclusion", "Les deux mains ouvertes, paumes face à face, dessinent un entonnoir : amenez la fin de l'histoire."]
        ]},
        { note: "Dessins Acto, d'après les signes les plus courants en Belgique et au Québec. Fixez-les avec votre maître de cérémonie avant le match : un signe mal lu coûte une fin d'improvisation." },
        { p: "Deux habitudes qui sauvent une fin de scène : donner le signe assez tôt pour qu'il serve — à trente secondes une histoire peut encore atterrir, à dix elle ne fait plus que s'arrêter — et le donner une seule fois, franchement. Un arbitre qui agite la main pendant vingt secondes vole la scène aux joueurs." }
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
          ["Gazou", "Le kazoo de l'arbitre : il le fait sonner en fin d'improvisation pour annoncer qu'une faute va être sifflée."],
          ["Vareuse", "Le maillot de l'équipe — et le seul accessoire qu'un jouteur ait le droit d'utiliser en jeu."],
          ["Coach (entraîneur)", "La personne qui conseille l'équipe pendant le caucus et gère les entrées."],
          ["Capitaine", "Le joueur qui représente son équipe auprès de l'arbitre — le seul à pouvoir monter demander une explication."],
          ["Assistant-arbitre", "L'un des deux adjoints de l'arbitre : comptage des votes, pantoufles ramassées, fautes signalées."],
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
          ["The referee", "The master of the game: draws and reads the cards, whistles the start and end of each improvisation, calls fouls, has the votes counted and settles disputes. Many referees also carry a kazoo, which they sound just before the closing whistle to announce that a foul is coming."],
          ["The assistant referees", "Two of them, usually, posted on either side of the playing area. Each counts half of the room at vote time, picks up the slippers between improvisations and flags whatever the referee could not see. Not every league has them: without them, the referee counts alone."],
          ["The master of ceremonies", "Introduces the teams, warms up the room, explains the categories to the audience, announces results and reminds people how to vote. Very often they also hold the clock — for the improvisation and for the period — and pass the time left to the referee with hand signs."],
          ["The musician", "Present in many leagues, improvising the soundtrack of the scenes live, accompanying the sung categories and playing the jingles that punctuate the reading of a card."],
          ["The audience", "The judge: after every improvisation it votes for the team it preferred by raising a two-coloured card — one colour per team. It is also entitled to disapprove of the referee, loudly."]
        ]}
      ]},
      { id: "deroulement", h: "How a match unfolds", blocks: [
        { p: "A match is played in two or three periods of twenty to forty-five minutes depending on the league (the LNI plays three thirty-minute periods; Belgium plays two forty-five-minute halves), separated by an interval whose length the master of ceremonies announces." },
        { h3: "Walking on" },
        { ol: [
          "The master of ceremonies opens the evening and warms up the room.",
          "The refereeing staff walks on to a chorus of boos — that is the tradition. The referee usually takes the chance to check, with a perfectly straight face, that the set is solid.",
          "The visiting team walks on in order: coach, captain, assistant captain, then the rest of the players.",
          "The home team does the same.",
          "Anthems, if both teams have one."
        ]},
        { p: "At the end, everything runs backwards: score and winner announced, then the visiting team, the home team and the refereeing staff sent backstage one by one. In between, the best players — the “stars” — are named, and everyone shakes hands." },
        { h3: "Reading out the card" },
        { p: "Many leagues always announce in the same order, in four beats separated by a jingle: the audience recognises the music and knows exactly where things stand." },
        { ol: [
          "“The next improvisation will be mixed (or compared) and its title is…”",
          "“Number of players… Category…”",
          "“And all of it for a duration of…”",
          "“Huddle” — and the twenty seconds start."
        ]},
        { h3: "The improvisation" },
        { ul: [
          "The huddle (“caucus”): twenty seconds (thirty in some leagues) during which each team confers with its coach — who plays, with which opening idea.",
          "Whistle: the improvisation begins. Players enter the rink from their bench, and they had better be there: being late is already a foul.",
          "Whistle: it stops, when time is up or when the referee decides so. If a foul was spotted, the kazoo sounds first.",
          "The captains — and only the captains — may then come up and ask the referee to explain. If they do not, or if there was no foul, the vote follows straight away.",
          "The vote: the audience raises its card on the side of the team it preferred. The assistants count; the team with the majority scores a point.",
          "The referee announces the result and any fouls, then moves on to the next card."
        ]},
        { p: "Depending on the league, a tie gives a point to each team, to neither, or is settled with an extra improvisation. It is one of the things to clarify with the teams before the match." }
      ]},
      { id: "decorum", h: "Decorum: what changes from league to league", blocks: [
        { p: "The match was born with the full hockey kit. In practice every league keeps what speaks to it, and what looks carved in stone in Montréal is played differently in Brussels or Lyon. A few very common departures:" },
        { ul: [
          "The rink: many teams play on a bare stage, with no boards at all. When there is a rink it should have three entrances — one per team, one in the middle — but two is common, and sometimes there is only one.",
          "Jerseys: far from systematic. Some teams play in their own clothes, and the colours survive only on the voting cards.",
          "Anthems: some teams have one, some do not. They are played only if both teams have one.",
          "Assistant referees: not always there. The referee then counts the votes alone.",
          "Line-ups: in Belgium, five against five with at least one player of each sex on the floor, where the original rulebook asked for three and three.",
          "Slippers: in the amateur circuit they are thrown at the referee only, and never during an improvisation."
        ]},
        { p: "Hence the only truly universal rule: agree before you play. The briefing the referee gives both teams is the rulebook for that evening." }
      ]},
      { id: "carte", h: "Reading the card: nature, category, theme", blocks: [
        { h3: "The nature" },
        { dl: [
          ["Mixed (mixte)", "Both teams play together, at the same time, one single story. The most common nature — and the one that demands the most listening, since you build with partners who are… opponents."],
          ["Compared (comparée)", "The teams play one after the other, on the same card, each for the announced duration. The order is drawn — a puck thrown onto the rink, a coin toss. The audience compares the two versions, hence the name. The waiting team must keep quiet: talking on the bench while the others play is a foul."]
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
        { p: "The referee penalises whatever damages the game. A foul can be called on both teams, on one team, or on a single player. The exact list and thresholds vary from league to league; these are found almost everywhere:" },
        { dl: [
          ["Obstruction", "Stopping the story from moving forward: refusing or blocking partners' offers, hogging the stage, breaking what others are building."],
          ["Lack of listening", "Ignoring what was said or played before you — the character changes name, the place contradicts itself, someone walks through the table set up ten seconds earlier."],
          ["Showboating (cabotinage)", "Playing for yourself or for the laugh, to the detriment of the scene and your partners."],
          ["Cliché", "Falling back on ready-made ideas, worn-out characters or devices — famous characters included, since they do the player's work for them."],
          ["Breaking character (décrochage)", "Stepping out of your character: laughing, commenting, becoming yourself in the middle of the scene."],
          ["Delay of game", "Being slow to come on after the huddle, letting a silence drag on, playing for time — or a story that simply stops moving."],
          ["Excessive roughness", "Any real physical or verbal violence: you may play a fight, not have one. Forcing your ideas on everyone else counts as the same foul."],
          ["Refusal of character", "Not accepting the character, situation or role the game hands you — including standing in the playing area without ever joining the story."],
          ["Off theme", "Not using what was announced: the title, the nature, the category, the number of players or the duration."],
          ["Illegal procedure", "Breaking a rule of the match: entering from the wrong side, leaving the playing area without reason, talking on the bench during a compared improvisation."],
          ["Illegal prop", "Using an object that is not allowed. Only the jersey — and sometimes a scarf — may serve as a prop; everything else is mimed."],
          ["Illegal number of players", "More players on the rink than the card allows, or a team short at kick-off."],
          ["Confusion", "An improvisation that has become unreadable: too many plots, too many places, nobody knows who is who any more."],
          ["Misconduct", "Unacceptable behaviour towards the referee, the audience or an opponent, or material unfit for an all-ages show. The serious foul, which can mean expulsion."]
        ]},
        { h3: "The referee's gestures" },
        { p: "Every foul has its gesture. The referee whistles, points at the team or the player at fault, makes the sign, then announces the foul on the microphone and explains it in one sentence: at the back of the room it should be clear even unheard. Here are the most widespread." },
        { arts: [
          ["faute-obstruction", "Obstruction", "Both forearms up, palms forward: the wall."],
          ["faute-ecoute", "Lack of listening", "A cupped hand behind the ear."],
          ["faute-cabotinage", "Showboating", "A hand beside the face, fingers spread and wiggling."],
          ["faute-cliche", "Cliché", "One leg folded forward, the same step taken again: seen it before."],
          ["faute-decrochage", "Breaking character", "A fist raised above the shoulder, moving up and down."],
          ["faute-retard", "Delay of game", "Forearm upright, hand turning: this is going nowhere."],
          ["faute-rudesse", "Excessive roughness", "A fist punched into the open palm."],
          ["faute-refus", "Refusal of character", "The referee turns their back, arms crossed."],
          ["faute-procedure", "Illegal procedure", "A flat hand tapping the opposite forearm."],
          ["faute-nombre", "Illegal number", "A flat hand laid on top of the head."],
          ["faute-confusion", "Confusion", "Both fists circling around each other in front of the belly."],
          ["faute-conduite", "Misconduct", "Both arms held straight out to the sides."]
        ]},
        { note: "Acto drawings. The full repertoire comes from Québec and not every league uses all of its grammar — major and minor fouls, for instance, do not exist everywhere. Ask for the house gestures before refereeing somewhere new." },
        { h3: "How many fouls before a point?" },
        { p: "Fouls add up. The most widespread rule: three fouls on one team's side — called on the team or on one of its players — and the opposing team scores a point. A player who collects two personal fouls is sent off for the rest of the match; in many leagues those two fouls then leave the team's tally. Others count by team only, others distinguish minor and major fouls and may upgrade a foul already called: check the local rulebook." },
        { p: "Nothing stops a referee from inventing a foul for the evening either, as long as they explain it: “lack of vocabulary” for a player swearing every ten seconds, “déjà-vu” for the one wheeling out the same routine on every card." }
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
        { h3: "The assistant referees" },
        { p: "Two assistants frame the playing area. Each counts half of the room at vote time, picks up the slippers between improvisations and flags whatever the referee's turned back hid from them. During a compared improvisation they also check that the waiting team keeps quiet: the assistant who hears talking drops a ribbon onto the playing area, and the referee calls illegal procedure without ever taking their eyes off the scene." },
        { h3: "The vote and its disputes" },
        { p: "The vote is by show of cards; each assistant counts half of the room and the referee announces the result. When in doubt, recount rather than guess. A card raised on both sides, or a vote after the signal, does not count. And if the audience protests a decision with whistles, the referee listens… and upholds the decision: that, too, is the character." },
        { h3: "The slipper" },
        { p: "A Québec tradition: spectators unhappy with a decision throw their slipper — or their shoe — onto the playing area. Some leagues hand out cloth slippers at the door for that very purpose. In the amateur circuit it is thrown at the referee only, and only between improvisations; at professional level it is sometimes tolerated during the improvisation, into the playing area but never at the players, as a way of saying the quality is not there. If the floor fills up, the referee may stop for a “clean-up”: the assistants collect, and the players use the pause to fetch an idea from their team. It is a cry from the heart, not a revolt: the referee picks it up, smiles, and carries on." }
      ]},
      { id: "temps", h: "Keeping time: the hand signs", blocks: [
        { p: "The clock is almost never in the referee's hand: the master of ceremonies, or an assistant, holds both the improvisation's duration and the period's. They pass it on in silence, from the edge of the stage, with a handful of agreed signs. The referee takes the sign and relays it to the players — those improvising and those waiting on the bench." },
        { cols: 3, arts: [
          ["temps-dix-minutes", "10 min", "A closed fist, fingers down: ten minutes. This is the sign for the length of the period."],
          ["temps-minutes", "3 min", "One finger pointing down per minute left. Three fingers: three minutes."],
          ["temps-trente-secondes", "30 s.", "Index and middle finger crossed, pointing down."],
          ["temps-dix-secondes", "10 s.", "An open hand, palm to the floor, shaken from side to side."],
          ["temps-decompte", "5 s.", "The hand turns over, fingers up: five, four, three, two, one."],
          ["temps-conclure", "Conclusion", "Both open hands, palms facing each other, shaping a funnel: bring the story to an end."]
        ]},
        { note: "Acto drawings, after the signs most commonly used in Belgium and Québec. Settle them with your master of ceremonies before the match: a misread sign costs an ending." },
        { p: "Two habits that save the end of a scene: give the sign early enough for it to be useful — at thirty seconds a story can still land, at ten it can only stop — and give it once, clearly. A referee waving for twenty seconds steals the scene from the players." }
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
          ["Kazoo (gazou)", "The referee's kazoo, sounded at the end of an improvisation to announce that a foul is about to be called."],
          ["Jersey (vareuse)", "The team's shirt — and the only prop a player is allowed to use in play."],
          ["Coach", "The person who advises the team during the huddle and manages who goes on."],
          ["Captain", "The player who represents the team with the referee — the only one allowed to come up and ask for an explanation."],
          ["Assistant referee", "One of the referee's two aides: counting votes, collecting slippers, flagging fouls."],
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
