/**
 * rules.js — Match d'impro rules content, one HTML string per locale.
 *
 * Loaded as a classic script before app.js. Exposes window.actoRules so the
 * rules dialog can swap content based on the active store.locale without
 * needing a separate fetch when the user changes language.
 *
 * Edit translations here; no build step needed (no JSON regeneration).
 */
(function () {
  "use strict";

  const FR = `
<p>Le match d'improvisation théâtrale (créé au Québec en 1977 par Robert Gravel et Yvon Leduc) possède un décorum et des règles très strictes, inspirées du hockey sur glace.</p>

<h3>L'annonce du thème — l'ordre officiel</h3>
<p>L'arbitre principal tire un carton (« la carte ») et annonce les éléments toujours dans cet ordre :</p>
<ol>
  <li><strong>La nature de l'improvisation</strong> :
    <ul>
      <li><strong>Mixte</strong> — les deux équipes jouent ensemble sur la patinoire.</li>
      <li><strong>Comparée</strong> — une équipe joue, puis l'autre joue à son tour sur le même thème.</li>
    </ul>
  </li>
  <li><strong>Le titre (le thème)</strong> — le sujet de l'improvisation.</li>
  <li><strong>Le nombre de joueurs</strong> — souvent « libre » (toute l'équipe), parfois restreint (« deux par équipe »).</li>
  <li><strong>La catégorie (ou contrainte de style)</strong> — le style théâtral imposé (souvent « libre »).</li>
  <li><strong>La durée</strong> — généralement entre 2 et 5 minutes, parfois plus.</li>
</ol>

<h3>Le caucus</h3>
<p>Après ces 5 informations, l'arbitre siffle. Les équipes ont <strong>20 secondes</strong> exactement pour se concerter, trouver une idée et décider qui monte sur la patinoire. Au second coup de sifflet, l'improvisation commence immédiatement — un retard à entrer en scène se sanctionne par une faute de « Retard ».</p>

<h3>Les catégories les plus fréquentes</h3>
<ul>
  <li><strong>Libre</strong> — aucune contrainte de forme.</li>
  <li><strong>À la manière de…</strong> — la catégorie reine. Genre imposé : Molière, Western, Science-fiction, Telenovela, Film noir, Tarantino, comédie musicale…</li>
  <li><strong>Chantée</strong> — dialogues chantés (souvent avec un musicien improvisateur).</li>
  <li><strong>Rimes</strong> — toutes les répliques riment, souvent en alexandrins (« à la manière de Racine »).</li>
  <li><strong>Muette</strong> — interdiction absolue de parler. Tout passe par le mime et le corps.</li>
  <li><strong>Grommelot (sans frontières)</strong> — langue inventée, mais l'intention reste compréhensible.</li>
  <li><strong>Abécédaire</strong> — chaque réplique commence par la lettre suivante de l'alphabet.</li>
  <li><strong>Fusillade</strong> — souvent sans caucus ; chaque joueur fait un gag de 10 secondes sur un thème donné.</li>
</ul>

<h3>Les thèmes (titres)</h3>
<p>Les thèmes peuvent être absolument tout :</p>
<ul>
  <li><strong>Situations</strong> : « Le dernier bus », « Panne de courant », « Le secret ».</li>
  <li><strong>Phrases ou proverbes</strong> : « Il ne fallait pas ouvrir cette porte », « Tel est pris qui croyait prendre ».</li>
  <li><strong>Mots abstraits ou uniques</strong> : « Jaune », « Rupture », « L'infini ».</li>
  <li><strong>Titres absurdes ou poétiques</strong> : « Le pingouin a mangé ma montre », « La tristesse du grille-pain ».</li>
</ul>

<h3>Les fautes</h3>
<p>L'arbitre, sifflet et maillot rayé, est le maître du jeu. Trois fautes accumulées par une équipe donnent un point à l'équipe adverse. Les plus courantes :</p>
<ul>
  <li><strong>Cliché</strong> — blague connue, jeu de mots facile, situation vue mille fois.</li>
  <li><strong>Cabotinage</strong> — un joueur « fait le show » au détriment de l'histoire et de ses partenaires.</li>
  <li><strong>Décrochage</strong> — sortir de son personnage (par exemple éclater de rire d'une réplique du partenaire).</li>
  <li><strong>Refus de personnage / Refus d'idée</strong> — l'autre dit « voilà ton épée », tu réponds « non, c'est un parapluie ». Tu refuses la proposition imposée.</li>
  <li><strong>Confusion</strong> — l'histoire devient incompréhensible.</li>
  <li><strong>Non-respect de la catégorie</strong> — parler en muette, ne pas rimer en rimes, etc.</li>
</ul>`;

  const EN = `
<p>The theatrical improv match (created in Quebec in 1977 by Robert Gravel and Yvon Leduc) follows strict rules and decorum, inspired by ice hockey.</p>

<h3>The theme announcement — official order</h3>
<p>The main referee draws a card and announces the items always in this order:</p>
<ol>
  <li><strong>Nature of the improvisation</strong>:
    <ul>
      <li><strong>Mixte</strong> — both teams play together on the rink.</li>
      <li><strong>Comparée</strong> — one team plays, then the other on the same theme.</li>
    </ul>
  </li>
  <li><strong>Title (theme)</strong> — the subject of the improvisation.</li>
  <li><strong>Number of players</strong> — often "open" (full team), sometimes restricted ("two per team").</li>
  <li><strong>Category (style constraint)</strong> — the imposed theatrical style (often "free").</li>
  <li><strong>Duration</strong> — usually 2 to 5 minutes, sometimes longer.</li>
</ol>

<h3>The caucus</h3>
<p>After these 5 announcements, the referee blows the whistle. Teams have exactly <strong>20 seconds</strong> to confer, find an idea and decide who steps onto the rink. At the second whistle, the improvisation starts immediately — being late to enter is penalised with a "Delay" foul.</p>

<h3>Most common categories</h3>
<ul>
  <li><strong>Libre (Free)</strong> — no constraint on form.</li>
  <li><strong>À la manière de… (In the style of…)</strong> — the queen of categories. Imposed genre: Molière, Western, Sci-fi, Telenovela, Film noir, Tarantino, musical…</li>
  <li><strong>Chantée (Sung)</strong> — dialogue must be sung (often with an improvising musician).</li>
  <li><strong>Rimes (Rhyming)</strong> — every line must rhyme, often in alexandrines.</li>
  <li><strong>Muette (Mute)</strong> — absolute silence. Everything goes through mime and body.</li>
  <li><strong>Grommelot</strong> — invented gibberish, but the intent must remain understandable.</li>
  <li><strong>Abécédaire (Alphabet)</strong> — each line starts with the next letter of the alphabet.</li>
  <li><strong>Fusillade (Shootout)</strong> — often without caucus; each player does a 10-second gag on a given theme.</li>
</ul>

<h3>The themes (titles)</h3>
<p>Themes can be absolutely anything:</p>
<ul>
  <li><strong>Situations</strong>: "The last bus", "Power outage", "The secret".</li>
  <li><strong>Phrases or proverbs</strong>: "You shouldn't have opened that door", "Caught in his own trap".</li>
  <li><strong>Abstract or single words</strong>: "Yellow", "Breakup", "Infinity".</li>
  <li><strong>Absurd or poetic titles</strong>: "The penguin ate my watch", "The sadness of the toaster".</li>
</ul>

<h3>The fouls</h3>
<p>The referee, with whistle and striped jersey, is the master of the game. Three fouls accumulated by a team give a point to the opposing team. The most common:</p>
<ul>
  <li><strong>Cliché</strong> — known joke, easy pun, situation seen a thousand times.</li>
  <li><strong>Cabotinage (Hamming)</strong> — a player "puts on a show" at the expense of the story and partners.</li>
  <li><strong>Décrochage (Breaking character)</strong> — leaving your character (e.g. cracking up at a partner's line).</li>
  <li><strong>Refus de personnage / d'idée (Refusal)</strong> — your partner says "here's your sword", you reply "no, it's an umbrella". You reject the imposed proposition.</li>
  <li><strong>Confusion</strong> — the story becomes incomprehensible.</li>
  <li><strong>Non-respect de la catégorie (Off-category)</strong> — speaking during a Mute, not rhyming during Rhymes, etc.</li>
</ul>`;

  const DE = `
<p>Das Improvisationstheater-Match (1977 in Québec von Robert Gravel und Yvon Leduc geschaffen) folgt strengen Regeln und Ritualen, inspiriert vom Eishockey.</p>

<h3>Die Themenansage — offizielle Reihenfolge</h3>
<p>Der Hauptschiedsrichter zieht eine Karte und sagt die Elemente immer in dieser Reihenfolge an:</p>
<ol>
  <li><strong>Art der Improvisation</strong>:
    <ul>
      <li><strong>Mixte</strong> — beide Teams spielen gemeinsam auf dem Eis.</li>
      <li><strong>Comparée</strong> — ein Team spielt, dann das andere zum gleichen Thema.</li>
    </ul>
  </li>
  <li><strong>Titel (Thema)</strong> — das Thema der Improvisation.</li>
  <li><strong>Spielerzahl</strong> — oft „frei" (ganzes Team), manchmal eingeschränkt („zwei pro Team").</li>
  <li><strong>Kategorie (Stilvorgabe)</strong> — der vorgeschriebene Theaterstil (oft „frei").</li>
  <li><strong>Dauer</strong> — meist zwischen 2 und 5 Minuten, manchmal länger.</li>
</ol>

<h3>Der Caucus</h3>
<p>Nach diesen 5 Informationen pfeift der Schiedsrichter. Die Teams haben genau <strong>20 Sekunden</strong>, um sich zu beraten, eine Idee zu finden und zu entscheiden, wer auf das Eis geht. Beim zweiten Pfiff beginnt die Improvisation sofort — Verspätung beim Auftritt wird mit einem „Verzögerungs"-Foul geahndet.</p>

<h3>Häufigste Kategorien</h3>
<ul>
  <li><strong>Libre (Frei)</strong> — keine Formvorgabe.</li>
  <li><strong>À la manière de… (Im Stil von…)</strong> — die Königskategorie. Vorgegebenes Genre: Molière, Western, Science-Fiction, Telenovela, Film noir, Tarantino, Musical…</li>
  <li><strong>Chantée (Gesungen)</strong> — Dialoge werden gesungen (oft mit Begleitmusiker).</li>
  <li><strong>Rimes (Reimend)</strong> — jede Zeile reimt sich, oft in Alexandrinern.</li>
  <li><strong>Muette (Stumm)</strong> — absolutes Sprechverbot. Alles geht über Mimik und Körper.</li>
  <li><strong>Grommelot</strong> — erfundene Sprache, aber die Absicht muss verständlich bleiben.</li>
  <li><strong>Abécédaire (Alphabet)</strong> — jede Zeile beginnt mit dem nächsten Buchstaben.</li>
  <li><strong>Fusillade (Schießerei)</strong> — oft ohne Caucus; jeder Spieler liefert einen 10-Sekunden-Gag zu einem Thema.</li>
</ul>

<h3>Die Themen (Titel)</h3>
<p>Themen können absolut alles sein:</p>
<ul>
  <li><strong>Situationen</strong>: „Der letzte Bus", „Stromausfall", „Das Geheimnis".</li>
  <li><strong>Sätze oder Sprichwörter</strong>: „Du hättest diese Tür nicht öffnen sollen", „Wer anderen eine Grube gräbt…".</li>
  <li><strong>Abstrakte oder einzelne Wörter</strong>: „Gelb", „Trennung", „Unendlichkeit".</li>
  <li><strong>Absurde oder poetische Titel</strong>: „Der Pinguin hat meine Uhr gegessen", „Die Traurigkeit des Toasters".</li>
</ul>

<h3>Die Fouls</h3>
<p>Der Schiedsrichter mit Pfeife und gestreiftem Trikot ist Spielmeister. Drei Fouls eines Teams geben dem Gegner einen Punkt. Die häufigsten:</p>
<ul>
  <li><strong>Cliché</strong> — bekannter Witz, einfaches Wortspiel, tausendmal gesehene Situation.</li>
  <li><strong>Cabotinage (Aufdringlich)</strong> — ein Spieler „macht eine Show" auf Kosten der Geschichte und der Partner.</li>
  <li><strong>Décrochage (Aus der Rolle fallen)</strong> — die Figur verlassen (z. B. über die Replik des Partners lachen).</li>
  <li><strong>Refus de personnage / d'idée (Ablehnung)</strong> — der andere sagt „hier ist dein Schwert", du antwortest „nein, das ist ein Regenschirm". Du lehnst die Vorgabe ab.</li>
  <li><strong>Confusion (Verwirrung)</strong> — die Geschichte wird unverständlich.</li>
  <li><strong>Non-respect de la catégorie (Kategorienverstoß)</strong> — bei Stumm sprechen, bei Reim nicht reimen, etc.</li>
</ul>`;

  const ES = `
<p>El match de improvisación teatral (creado en Quebec en 1977 por Robert Gravel e Yvon Leduc) sigue un decoro y reglas muy estrictas, inspiradas en el hockey sobre hielo.</p>

<h3>El anuncio del tema — el orden oficial</h3>
<p>El árbitro principal saca una tarjeta y anuncia los elementos siempre en este orden:</p>
<ol>
  <li><strong>La naturaleza de la improvisación</strong>:
    <ul>
      <li><strong>Mixte</strong> — los dos equipos juegan juntos en la pista.</li>
      <li><strong>Comparée</strong> — un equipo juega, luego el otro sobre el mismo tema.</li>
    </ul>
  </li>
  <li><strong>El título (tema)</strong> — el sujeto de la improvisación.</li>
  <li><strong>Número de jugadores</strong> — a menudo "libre" (todo el equipo), a veces restringido ("dos por equipo").</li>
  <li><strong>La categoría (restricción de estilo)</strong> — el estilo teatral impuesto (a menudo "libre").</li>
  <li><strong>La duración</strong> — generalmente entre 2 y 5 minutos, a veces más.</li>
</ol>

<h3>El caucus</h3>
<p>Después de estas 5 informaciones, el árbitro silba. Los equipos tienen exactamente <strong>20 segundos</strong> para concertarse, encontrar una idea y decidir quién sube a la pista. Al segundo silbato, la improvisación empieza inmediatamente — un retraso en entrar a escena se sanciona con una falta de "Retraso".</p>

<h3>Las categorías más frecuentes</h3>
<ul>
  <li><strong>Libre</strong> — ninguna restricción de forma.</li>
  <li><strong>À la manière de… (Al estilo de…)</strong> — la categoría reina. Género impuesto: Molière, Western, Ciencia-ficción, Telenovela, Film noir, Tarantino, comedia musical…</li>
  <li><strong>Chantée (Cantada)</strong> — los diálogos deben cantarse (a menudo con un músico improvisador).</li>
  <li><strong>Rimes (Rimas)</strong> — todas las réplicas riman, a menudo en alejandrinos.</li>
  <li><strong>Muette (Muda)</strong> — prohibición absoluta de hablar. Todo pasa por el mimo y el cuerpo.</li>
  <li><strong>Grommelot</strong> — lengua inventada, pero la intención debe quedar comprensible.</li>
  <li><strong>Abécédaire (Abecedario)</strong> — cada réplica empieza con la siguiente letra del alfabeto.</li>
  <li><strong>Fusillade (Tiroteo)</strong> — a menudo sin caucus; cada jugador hace un gag de 10 segundos sobre un tema.</li>
</ul>

<h3>Los temas (títulos)</h3>
<p>Los temas pueden ser absolutamente todo:</p>
<ul>
  <li><strong>Situaciones</strong>: "El último autobús", "Apagón", "El secreto".</li>
  <li><strong>Frases o proverbios</strong>: "No había que abrir esa puerta", "Cae quien creía atrapar".</li>
  <li><strong>Palabras abstractas o únicas</strong>: "Amarillo", "Ruptura", "El infinito".</li>
  <li><strong>Títulos absurdos o poéticos</strong>: "El pingüino se comió mi reloj", "La tristeza de la tostadora".</li>
</ul>

<h3>Las faltas</h3>
<p>El árbitro, con silbato y camiseta a rayas, es el maestro del juego. Tres faltas acumuladas por un equipo dan un punto al equipo adversario. Las más comunes:</p>
<ul>
  <li><strong>Cliché</strong> — chiste conocido, juego de palabras fácil, situación vista mil veces.</li>
  <li><strong>Cabotinage (Histrionismo)</strong> — un jugador "monta el show" en detrimento de la historia y sus compañeros.</li>
  <li><strong>Décrochage (Salida de personaje)</strong> — salir del personaje (por ejemplo reírse de una réplica del compañero).</li>
  <li><strong>Refus de personnage / d'idée (Rechazo)</strong> — el otro dice "aquí tienes tu espada", tú respondes "no, es un paraguas". Rechazas la propuesta impuesta.</li>
  <li><strong>Confusion (Confusión)</strong> — la historia se vuelve incomprensible.</li>
  <li><strong>Non-respect de la catégorie</strong> — hablar en Muda, no rimar en Rimas, etc.</li>
</ul>`;

  const PT = `
<p>O match de improvisação teatral (criado em Quebec em 1977 por Robert Gravel e Yvon Leduc) segue regras muito estritas e um decoro inspirado no hóquei no gelo.</p>

<h3>O anúncio do tema — a ordem oficial</h3>
<p>O árbitro principal tira um cartão e anuncia os elementos sempre nesta ordem:</p>
<ol>
  <li><strong>A natureza da improvisação</strong>:
    <ul>
      <li><strong>Mixte</strong> — as duas equipas jogam juntas na pista.</li>
      <li><strong>Comparée</strong> — uma equipa joga, depois a outra sobre o mesmo tema.</li>
    </ul>
  </li>
  <li><strong>O título (tema)</strong> — o assunto da improvisação.</li>
  <li><strong>Número de jogadores</strong> — muitas vezes "livre" (toda a equipa), às vezes restrito ("dois por equipa").</li>
  <li><strong>A categoria (restrição de estilo)</strong> — o estilo teatral imposto (muitas vezes "livre").</li>
  <li><strong>A duração</strong> — geralmente entre 2 e 5 minutos, às vezes mais.</li>
</ol>

<h3>O caucus</h3>
<p>Depois destas 5 informações, o árbitro apita. As equipas têm exatamente <strong>20 segundos</strong> para se concertarem, encontrar uma ideia e decidir quem sobe à pista. Ao segundo apito, a improvisação começa imediatamente — um atraso a entrar em cena é sancionado com uma falta de "Atraso".</p>

<h3>As categorias mais frequentes</h3>
<ul>
  <li><strong>Libre (Livre)</strong> — nenhuma restrição de forma.</li>
  <li><strong>À la manière de… (À maneira de…)</strong> — a categoria rainha. Género imposto: Molière, Western, Ficção científica, Telenovela, Filme noir, Tarantino, comédia musical…</li>
  <li><strong>Chantée (Cantada)</strong> — os diálogos devem ser cantados (muitas vezes com um músico improvisador).</li>
  <li><strong>Rimes (Rimas)</strong> — todas as réplicas rimam, frequentemente em alexandrinos.</li>
  <li><strong>Muette (Muda)</strong> — proibição absoluta de falar. Tudo passa pelo mimo e pelo corpo.</li>
  <li><strong>Grommelot</strong> — língua inventada, mas a intenção tem de ficar compreensível.</li>
  <li><strong>Abécédaire (Abecedário)</strong> — cada réplica começa pela letra seguinte do alfabeto.</li>
  <li><strong>Fusillade (Tiroteio)</strong> — muitas vezes sem caucus; cada jogador faz uma piada de 10 segundos sobre um tema.</li>
</ul>

<h3>Os temas (títulos)</h3>
<p>Os temas podem ser absolutamente tudo:</p>
<ul>
  <li><strong>Situações</strong>: "O último autocarro", "Falha de energia", "O segredo".</li>
  <li><strong>Frases ou provérbios</strong>: "Não devias ter aberto aquela porta", "Tal é apanhado quem pensava apanhar".</li>
  <li><strong>Palavras abstratas ou únicas</strong>: "Amarelo", "Ruptura", "O infinito".</li>
  <li><strong>Títulos absurdos ou poéticos</strong>: "O pinguim comeu o meu relógio", "A tristeza da torradeira".</li>
</ul>

<h3>As faltas</h3>
<p>O árbitro, com apito e camisola às riscas, é o senhor do jogo. Três faltas acumuladas por uma equipa dão um ponto à equipa adversária. As mais comuns:</p>
<ul>
  <li><strong>Cliché</strong> — piada conhecida, trocadilho fácil, situação vista mil vezes.</li>
  <li><strong>Cabotinage</strong> — um jogador "faz o espetáculo" em prejuízo da história e dos parceiros.</li>
  <li><strong>Décrochage (Sair do personagem)</strong> — sair do personagem (por exemplo, rir de uma réplica do parceiro).</li>
  <li><strong>Refus de personnage / d'idée (Recusa)</strong> — o outro diz "aqui está a tua espada", respondes "não, é um guarda-chuva". Recusas a proposta imposta.</li>
  <li><strong>Confusion (Confusão)</strong> — a história torna-se incompreensível.</li>
  <li><strong>Non-respect de la catégorie</strong> — falar em Muda, não rimar em Rimas, etc.</li>
</ul>`;

  const NL = `
<p>De improvisatietheater-match (in 1977 in Quebec gecreëerd door Robert Gravel en Yvon Leduc) volgt strikte regels en decorum, geïnspireerd op ijshockey.</p>

<h3>De aankondiging van het thema — officiële volgorde</h3>
<p>De hoofdscheidsrechter trekt een kaart en kondigt de elementen altijd in deze volgorde aan:</p>
<ol>
  <li><strong>De aard van de improvisatie</strong>:
    <ul>
      <li><strong>Mixte</strong> — beide teams spelen samen op de baan.</li>
      <li><strong>Comparée</strong> — één team speelt, daarna het andere op hetzelfde thema.</li>
    </ul>
  </li>
  <li><strong>De titel (het thema)</strong> — het onderwerp van de improvisatie.</li>
  <li><strong>Aantal spelers</strong> — vaak "vrij" (heel het team), soms beperkt ("twee per team").</li>
  <li><strong>De categorie (stijlvoorschrift)</strong> — de opgelegde theatrale stijl (vaak "vrij").</li>
  <li><strong>De duur</strong> — meestal tussen 2 en 5 minuten, soms langer.</li>
</ol>

<h3>De caucus</h3>
<p>Na deze 5 mededelingen fluit de scheidsrechter. De teams hebben precies <strong>20 seconden</strong> om te overleggen, een idee te vinden en te beslissen wie de baan op gaat. Bij het tweede fluitsignaal begint de improvisatie onmiddellijk — te laat de scène betreden wordt bestraft met een "Vertraging"-fout.</p>

<h3>Meest voorkomende categorieën</h3>
<ul>
  <li><strong>Libre (Vrij)</strong> — geen vormbeperking.</li>
  <li><strong>À la manière de… (In de stijl van…)</strong> — de koninklijke categorie. Opgelegd genre: Molière, Western, Sciencefiction, Telenovela, Film noir, Tarantino, musical…</li>
  <li><strong>Chantée (Gezongen)</strong> — dialogen moeten gezongen worden (vaak met improviserende muzikant).</li>
  <li><strong>Rimes (Rijmen)</strong> — alle zinnen rijmen, vaak in alexandrijnen.</li>
  <li><strong>Muette (Stom)</strong> — absoluut verbod om te spreken. Alles gaat via mime en lichaam.</li>
  <li><strong>Grommelot</strong> — verzonnen taal, maar de bedoeling moet begrijpelijk blijven.</li>
  <li><strong>Abécédaire (ABC)</strong> — elke zin begint met de volgende letter van het alfabet.</li>
  <li><strong>Fusillade (Vuurpeloton)</strong> — vaak zonder caucus; elke speler doet een gag van 10 seconden over een thema.</li>
</ul>

<h3>De thema's (titels)</h3>
<p>Thema's kunnen absoluut alles zijn:</p>
<ul>
  <li><strong>Situaties</strong>: "De laatste bus", "Stroomonderbreking", "Het geheim".</li>
  <li><strong>Zinnen of spreekwoorden</strong>: "Je had die deur niet mogen openen", "Wie een kuil graaft voor een ander…".</li>
  <li><strong>Abstracte of enkele woorden</strong>: "Geel", "Breuk", "Het oneindige".</li>
  <li><strong>Absurde of poëtische titels</strong>: "De pinguïn heeft mijn horloge opgegeten", "Het verdriet van de broodrooster".</li>
</ul>

<h3>De fouten</h3>
<p>De scheidsrechter, met fluit en gestreept shirt, is de spelmeester. Drie fouten van één team geven een punt aan de tegenstander. De meest voorkomende:</p>
<ul>
  <li><strong>Cliché</strong> — bekende grap, makkelijke woordspeling, duizendmaal gezien.</li>
  <li><strong>Cabotinage (Showvertoon)</strong> — een speler "zet een show op" ten koste van het verhaal en zijn partners.</li>
  <li><strong>Décrochage (Uit personage stappen)</strong> — je personage verlaten (bijv. lachen om een replica van de partner).</li>
  <li><strong>Refus de personnage / d'idée (Weigering)</strong> — de ander zegt "hier is je zwaard", jij antwoordt "nee, dat is een paraplu". Je weigert het opgelegde idee.</li>
  <li><strong>Confusion (Verwarring)</strong> — het verhaal wordt onbegrijpelijk.</li>
  <li><strong>Non-respect de la catégorie</strong> — spreken bij Stom, niet rijmen bij Rijmen, etc.</li>
</ul>`;

  window.actoRules = { fr: FR, en: EN, de: DE, es: ES, pt: PT, nl: NL };
})();
