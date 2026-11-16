/**
 * impro-tool.js — IMPRO TOOL : le minuteur de l'arbitre, à portée de clic
 * depuis la barre du haut, sur n'importe quelle page.
 *
 * POURQUOI. Pendant un match, l'arbitre a besoin de trois choses en moins
 * d'une seconde : lancer le caucus (20 s), siffler la fin, et faire le kazoo.
 * Le chrono du Studio est dans l'écran de match, celui des échauffements dans
 * la fiche d'un exercice : aucun des deux n'est joignable depuis la page où
 * l'on se trouve. Ce fichier ajoute un bouton ⏱️ à la barre commune et une
 * fenêtre qui s'ouvre par-dessus la page, sans la quitter.
 *
 * CE QU'IL FAIT
 *   · Compte à rebours : 20 s (caucus) en un bouton, puis 30 s, 1 min,
 *     1 min 30… jusqu'à 15 min dans une liste déroulante.
 *   · Sifflet d'arbitre à la fin, activable (case à cocher, mémorisée).
 *   · Sifflet et kazoo à la demande, pour ponctuer une impro.
 *   · Le décompte survit au changement de page : la fin est une date, gardée
 *     dans localStorage, et le bouton de la barre affiche le temps restant.
 *
 * SONS. Rien à télécharger : tout est synthétisé au Web Audio (bruit blanc
 * dans un passe-bande résonant + fondamentale qui tremble pour le sifflet,
 * dent de scie grésillante et nasale pour le kazoo). iOS ne laisse créer ni
 * reprendre un AudioContext que pendant un geste : on le débloque donc à
 * chaque clic dans l'outil, pour que la sonnerie de fin — qui part d'un
 * minuteur, donc hors geste — sorte bien.
 *
 * STYLE INJECTÉ. La CSS de l'outil est dans ce fichier et non dans
 * styles.css, parce que `/js/*` est servi en no-cache (voir _headers) alors
 * qu'une feuille de style n'est rafraîchie que par un ?v= bumpé sur les
 * quatorze pages. Un seul fichier à déployer, donc, et rien à bumper.
 *
 * À charger après js/topbar.js (il s'insère dans la barre que celui-ci
 * construit) et après data/all-fr.js (traductions).
 */
(function () {
  "use strict";

  var CLE_ETAT   = "acto:improtool:v1";
  var LOCALE_KEY = "impro-studio:locale:v1";
  /* Le caucus dure vingt secondes presque partout — c'est la valeur par
     défaut — mais les ligues varient, et un atelier prend son temps. */
  var CAUCUS_DEFAUT = 20;
  var CAUCUS_DUREES = [10, 15, 20, 30, 45, 60, 90];
  /* 20 s (le caucus), puis tous les 30 s jusqu'à 6 min, puis les durées
     longues d'un atelier ou d'un spectacle. */
  var DUREES = [20, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480, 540, 600, 720, 900];

  /* Les visuels des signes de temps, ceux de l'article « Le match d'impro »
     (assets/gestes/, 600×750). Le ?v= est celui de js/suite/discover.js :
     /assets/* est servi immuable, les deux doivent rester alignés. */
  var ART_V = "20261110";

  /* ─── traductions (data/ui.json, comme js/topbar.js) ───────────────────── */
  function ui() {
    var loc = "fr";
    try { loc = (localStorage.getItem(LOCALE_KEY) || "fr").trim(); } catch (e) { /* stockage privé */ }
    var all = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui) || {};
    return all[loc] || all.fr || {};
  }
  function t(cle, repli) { var v = ui()[cle]; return (typeof v === "string" && v) ? v : repli; }

  function libelleDuree(s) {
    var m = Math.floor(s / 60), r = s % 60;
    if (!m) return r + " " + t("improToolUnitSec", "s");
    return m + " " + t("improToolUnitMin", "min") + (r ? " " + r : "");
  }
  function mmss(s) {
    s = Math.max(0, Math.ceil(s));
    var m = Math.floor(s / 60);
    return m + ":" + ("0" + (s % 60)).slice(-2);
  }

  /** Le signe de la main à donner, aux marques de temps et nulle part ailleurs.
   *
   *  Le chronomètre n'est presque jamais dans la main de l'arbitre : le maître
   *  de cérémonie tient la durée et la transmet en silence, par une poignée de
   *  signes convenus (article « Tenir le temps », js/suite/rules-content.js).
   *  L'outil tient le chronomètre, donc il doit aussi dire lequel.
   *
   *  Un signe ne reste PAS affiché : il apparaît deux secondes avant sa marque
   *  et disparaît deux secondes après, le reste du temps l'encadré est vide.
   *  C'est la règle de l'article — un signe se donne au moment où il tombe,
   *  une seule fois et franchement ; un arbitre qui agite la main pendant
   *  vingt secondes vole la scène aux joueurs.
   *
   *  Les marques : dix minutes (le poing, la durée de la période), chaque
   *  minute entière ensuite (un doigt par minute), puis trente secondes — où
   *  l'on donne aussi l'entonnoir de conclusion, le moment où il sert : à
   *  trente secondes une histoire peut encore atterrir —, dix secondes, et le
   *  décompte final. Au-delà de dix minutes, rien : on ne prévient pas si tôt. */
  var FENETRE = 2;

  function signe(reste) {
    function a(x) { return Math.abs(reste - x) <= FENETRE; }
    var sec = t("improToolUnitSec", "s"), min = t("improToolUnitMin", "min");
    if (a(600)) return {
      cles: ["temps-dix-minutes"], titre: "10 " + min,
      desc: t("improToolSignFist", "Le poing fermé, doigts vers le bas.") };
    // Deux signes à la même marque : les doigts croisés DIT trente secondes,
    // l'entonnoir dit quoi en faire. Les deux visuels, mais une seule phrase,
    // celle de l'entonnoir : les doigts croisés se lisent sur l'image, et
    // deux descriptions faisaient un pavé de cinq lignes sur un téléphone.
    if (a(30)) return {
      cles: ["temps-trente-secondes", "temps-conclure"],
      titre: "30 " + sec + " · " + t("improToolSignConclusion", "Conclusion"),
      desc: t("improToolSignFunnel", "Les deux mains ouvertes en entonnoir : amenez la fin.") };
    if (a(10)) return {
      cles: ["temps-dix-secondes"], titre: "10 " + sec,
      desc: t("improToolSignTen", "La main ouverte, paume vers le sol, secouée de gauche à droite.") };
    if (a(5)) return {
      cles: ["temps-decompte"], titre: "5 " + sec,
      desc: t("improToolSignFive", "La main se retourne, doigts vers le haut : 5, 4, 3, 2, 1.") };
    for (var m = 9; m >= 1; m--) if (a(m * 60)) return {
      cles: ["temps-minutes"], titre: m + " " + min,
      desc: t("improToolSignMinutes", "Un doigt tendu vers le bas par minute restante.") };
    return null;
  }

  /* ─── état mémorisé ─────────────────────────────────────────────────────
     Le minuteur est une DATE de fin, pas un compteur : un intervalle est
     bridé quand l'onglet passe en arrière-plan (jusqu'à 1 fois/minute), et
     un décompte qui s'additionne dériverait de plusieurs secondes sur un
     caucus de 20 s. Corollaire utile : la date se garde dans localStorage,
     donc le décompte continue quand on change de page.

     DEUX TEMPS. Une improvisation se lance en deux temps : le caucus, vingt
     secondes où les équipes se concertent, puis l'impro elle-même. L'outil
     enchaîne les deux — le coup de sifflet de fin de caucus EST le départ de
     l'impro, il n'y a rien à cliquer entre les deux — ou part directement sur
     l'impro quand il n'y a pas de caucus à tenir.

       phase    : null au repos, puis "caucus" ou "impro"
       enchaine : une impro suit le caucus en cours
       caucus   : la durée du caucus (20 s par défaut)
       duree    : la durée d'impro choisie, indépendante du caucus
       total    : la durée de la phase en cours, pour la barre de progression */
  var DUREE_DEFAUT = 180;
  var etat = {
    caucus: CAUCUS_DEFAUT, duree: DUREE_DEFAUT, sifflet: true,
    phase: null, enchaine: false,
    total: DUREE_DEFAUT, reste: DUREE_DEFAUT, finAt: 0, enCours: false
  };

  function lireEtat() {
    try {
      var brut = localStorage.getItem(CLE_ETAT);
      if (!brut) return;
      var e = JSON.parse(brut) || {};
      if (DUREES.indexOf(e.duree) >= 0) etat.duree = e.duree;
      if (CAUCUS_DUREES.indexOf(e.caucus) >= 0) etat.caucus = e.caucus;
      if (typeof e.sifflet === "boolean") etat.sifflet = e.sifflet;
      var maintenant = Date.now();
      var phase = (e.phase === "caucus" || e.phase === "impro") ? e.phase : null;
      var fin = (typeof e.finAt === "number") ? e.finAt : 0;

      if (e.enCours && fin > maintenant) {
        // Décompte encore en cours : on le reprend tel quel.
        etat.phase = phase; etat.enchaine = !!e.enchaine;
        etat.total = (typeof e.total === "number" && e.total > 0) ? e.total : etat.duree;
        etat.finAt = fin; etat.enCours = true;
        etat.reste = (fin - maintenant) / 1000;
      } else if (e.enCours && phase === "caucus" && e.enchaine && fin + etat.duree * 1000 > maintenant) {
        // Le caucus s'est terminé pendant qu'on était ailleurs : l'impro qu'il
        // devait lancer court depuis. On la reprend à la bonne seconde plutôt
        // que de perdre l'enchaînement — c'est tout l'intérêt de garder une
        // date de fin et pas un compteur.
        etat.phase = "impro"; etat.enchaine = false;
        etat.total = etat.duree;
        etat.finAt = fin + etat.duree * 1000;
        etat.enCours = true;
        etat.reste = (etat.finAt - maintenant) / 1000;
      } else if (!e.enCours && phase && typeof e.reste === "number" && e.reste > 0) {
        // En pause : on garde la phase et le temps restant.
        etat.phase = phase; etat.enchaine = !!e.enchaine;
        etat.total = (typeof e.total === "number" && e.total > 0) ? e.total : etat.duree;
        etat.reste = Math.min(e.reste, etat.total);
      } else {
        // Rien en cours, ou une fin déjà vieille : on repart au repos. Ne pas
        // siffler une fin d'il y a dix minutes au premier chargement de page.
        repos();
      }
    } catch (e) { /* stockage indisponible : valeurs par défaut */ }
  }
  function repos() {
    etat.phase = null; etat.enchaine = false; etat.enCours = false;
    etat.finAt = 0; etat.total = etat.duree; etat.reste = etat.duree;
  }
  function ecrireEtat() {
    try {
      localStorage.setItem(CLE_ETAT, JSON.stringify({
        caucus: etat.caucus, duree: etat.duree, sifflet: etat.sifflet,
        phase: etat.phase, enchaine: etat.enchaine,
        total: etat.total, enCours: etat.enCours, finAt: etat.finAt, reste: etat.reste
      }));
    } catch (e) { /* ignore */ }
  }

  /* ─── sons (Web Audio, aucun fichier) ──────────────────────────────────── */
  var _ac = null, _bruit = null, _master = null, _amorce = false;

  function ac() {
    try {
      if (!_ac) { var AC = window.AudioContext || window.webkitAudioContext; _ac = AC ? new AC() : null; }
      // iOS re-suspend le contexte à chaque passage en arrière-plan : on
      // reprend à chaque fois, se verrouiller sur un drapeau tuerait le son
      // pour le reste de la soirée.
      if (_ac && _ac.state === "suspended") _ac.resume();
    } catch (e) { _ac = null; }
    return _ac;
  }
  /** À appeler depuis un geste utilisateur : crée et réveille le contexte, et
   *  joue un échantillon muet, seule façon de l'armer sur iOS/Safari. */
  function debloquerAudio() {
    var c = ac(); if (!c) return;
    if (_amorce && c.state === "running") return;
    try {
      var s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination); s.start(0);
      _amorce = true;
    } catch (e) { /* on réessaiera au prochain clic */ }
    // Le geste est aussi le bon moment pour aller chercher les deux sons :
    // le sifflet de fin part d'un minuteur, il ne doit pas attendre un
    // téléchargement à ce moment-là.
    charger("sifflet"); charger("kazoo");
  }
  /** Sortie commune, avec un limiteur : le sifflet et le kazoo sont des sons
   *  volontairement forts, sans lui ils saturaient en écrêtage sale. */
  function master(c) {
    if (_master && _master.context === c) return _master;
    var g = c.createGain(); g.gain.value = 0.9;
    var lim = c.createDynamicsCompressor();
    try {
      lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20;
      lim.attack.value = 0.002; lim.release.value = 0.08;
    } catch (e) { /* valeurs par défaut */ }
    g.connect(lim); lim.connect(c.destination);
    _master = g; return g;
  }
  function bruitBlanc(c) {
    if (_bruit && _bruit.sampleRate === c.sampleRate) return _bruit;
    var n = Math.floor(c.sampleRate), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    _bruit = b; return b;
  }

  /* ─── les deux sons, enregistrés ───────────────────────────────────────
     Un vrai sifflet d'arbitre et un vrai kazoo (assets/sons/), découpés et
     mis au même niveau perçu : la valeur efficace de leurs 300 ms les plus
     fortes est la même, ce qui prédit la sonie bien mieux que la moyenne du
     fichier — le kazoo est une note tenue discrète entre deux attaques, sa
     moyenne ment. Les gains ci-dessous amènent les deux à la sonie de la
     synthèse, puis le limiteur de master() garde la crête en dessous de 1.

     Chargés à la demande, décodés une fois : une page où l'outil n'est
     jamais ouvert ne télécharge rien. */
  var SONS = {
    sifflet: { url: "/assets/sons/sifflet.mp3", gain: 0.22, buffer: null, enCharge: false },
    kazoo:   { url: "/assets/sons/kazoo.mp3",   gain: 1.0,  buffer: null, enCharge: false }
  };
  function charger(nom) {
    var s = SONS[nom]; if (!s || s.buffer || s.enCharge) return;
    var c = ac(); if (!c) return;
    s.enCharge = true;
    fetch(s.url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (donnees) {
        return new Promise(function (ok, ko) {
          // Safari ancien ne rend pas de promesse : on passe les deux rappels
          // ET on branche celle qui existe peut-être.
          var p = c.decodeAudioData(donnees, ok, ko);
          if (p && p.then) p.then(ok, ko);
        });
      })
      .then(function (b) { s.buffer = b; s.enCharge = false; })
      .catch(function () { s.enCharge = false; });   // on retentera au prochain clic
  }
  /** Joue l'enregistrement. Rend false s'il n'est pas (encore) là : l'appelant
   *  bascule alors sur la synthèse, pour qu'un sifflet de fin ne soit jamais
   *  muet — hors ligne au premier usage, ou décodage refusé. */
  function jouer(nom) {
    var s = SONS[nom], c = ac();
    if (!c || !s) return false;
    if (!s.buffer) { charger(nom); return false; }
    try {
      var src = c.createBufferSource(); src.buffer = s.buffer;
      var g = c.createGain(); g.gain.value = s.gain;
      src.connect(g); g.connect(master(c));
      src.start();
      return true;
    } catch (e) { return false; }
  }

  function sifflet(duree) { if (!jouer("sifflet")) siffletSynthese(duree); }
  function kazoo()        { if (!jouer("kazoo"))   kazooSynthese(); }

  /** Sifflet d'arbitre à bille — SECOURS, quand l'enregistrement n'est pas là.
   *
   *  Un sifflet est un son TONAL, presque pur, pas une bouffée de souffle :
   *  la première version mettait le bruit blanc devant (gain 2,5 contre 0,33
   *  pour la fondamentale) et faisait « chhh », pas « fuiiit ». Ici le corps
   *  du son est une fondamentale à 3150 Hz plus un partiel inharmonique à
   *  1,34× — les deux chambres d'un sifflet d'arbitre, qui battent ensemble —
   *  et le bruit n'est plus qu'un filet d'air autour de la fondamentale.
   *
   *  La bille module l'amplitude (±28 % à 28 Hz) ET la hauteur (±30 Hz) : le
   *  trille vient surtout de l'amplitude. Déviation plus large = le porteur
   *  s'efface dans ses bandes latérales et on entend une sirène.
   *
   *  Niveau mesuré au rendu hors ligne : crête 0,38, valeur efficace 0,119,
   *  contre 0,96 / 0,254 pour la version « soufflée » — 6,6 dB de moins, et
   *  la tonalité à 3 kHz tombe là où l'oreille est la plus sensible, donc
   *  l'écart perçu est plus faible que le chiffre. Zéro échantillon écrêté. */
  function siffletSynthese(duree) {
    var c = ac(); if (!c) return;
    duree = duree || 0.62;
    var t0 = c.currentTime + 0.015, t1 = t0 + duree;
    var F = 3150;

    var sortie = c.createGain();
    sortie.gain.setValueAtTime(0.0001, t0);
    sortie.gain.exponentialRampToValueAtTime(0.27, t0 + 0.012);   // attaque sèche
    sortie.gain.setValueAtTime(0.27, Math.max(t0 + 0.02, t1 - 0.05));
    sortie.gain.exponentialRampToValueAtTime(0.0001, t1);
    sortie.connect(master(c));

    // La bille qui roule : 28 tours par seconde, en amplitude et en hauteur.
    var bille = c.createOscillator(); bille.type = "sine"; bille.frequency.value = 28;
    var trille = c.createGain(); trille.gain.value = 0.72;
    var gTrille = c.createGain(); gTrille.gain.value = 0.28;
    bille.connect(gTrille); gTrille.connect(trille.gain);
    trille.connect(sortie);

    var o1 = c.createOscillator(); o1.type = "sine";
    o1.frequency.setValueAtTime(F * 0.93, t0);
    o1.frequency.linearRampToValueAtTime(F, t0 + 0.035);          // la montée de l'attaque
    o1.frequency.setValueAtTime(F, Math.max(t0 + 0.04, t1 - 0.05));
    o1.frequency.linearRampToValueAtTime(F * 0.97, t1);           // et la chute du relâché
    var fm = c.createGain(); fm.gain.value = 30;
    bille.connect(fm); fm.connect(o1.frequency);
    o1.connect(trille);

    var o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = F * 1.34;
    var fm2 = c.createGain(); fm2.gain.value = 40;                // même trille, à l'échelle
    bille.connect(fm2); fm2.connect(o2.frequency);
    var g2 = c.createGain(); g2.gain.value = 0.3;
    o2.connect(g2); g2.connect(trille);

    var bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = F; bp.Q.value = 3;
    var air = c.createBufferSource();
    air.buffer = bruitBlanc(c); air.loop = true;
    var gAir = c.createGain(); gAir.gain.value = 0.32;
    air.connect(bp); bp.connect(gAir); gAir.connect(trille);

    // Le « tchiff » du départ : une bouffée d'air large, 45 ms, hors trille.
    var bpAttaque = c.createBiquadFilter();
    bpAttaque.type = "bandpass"; bpAttaque.frequency.value = 4200; bpAttaque.Q.value = 0.9;
    var souffle = c.createBufferSource();
    souffle.buffer = bruitBlanc(c); souffle.loop = true;
    var gChiff = c.createGain();
    gChiff.gain.setValueAtTime(0.85, t0);
    gChiff.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
    souffle.connect(bpAttaque); bpAttaque.connect(gChiff); gChiff.connect(sortie);

    [bille, o1, o2, air, souffle].forEach(function (n) { n.start(t0); n.stop(t1 + 0.02); });
  }

  /** Kazoo (gazou) — SECOURS, même rôle que siffletSynthese.
   *
   *  Un kazoo ne se souffle pas : on CHANTE dedans, et une membrane de papier
   *  grésille sur la voix. Ce grésillement est une SATURATION — elle ajoute
   *  des harmoniques —, pas un hachage de l'amplitude : la première version
   *  modulait à 55 Hz, ce qui donnait un trémolo de vieille radio.
   *
   *  Donc : une dent de scie (la voix), poussée dans une courbe tanh
   *  asymétrique (la membrane ; asymétrique pour obtenir les harmoniques
   *  paires autant que les impaires — une saturation symétrique donne une
   *  clarinette), un coupe-bas à 500 Hz qui dégraisse le fondamental, puis
   *  deux bosses à 1,2 et 2,7 kHz : le nasillard. Un filet de bruit à 3,2 kHz
   *  fait le papier. Mesuré : crête 0,54, valeur efficace 0,11 — même force
   *  que la version précédente, timbre entièrement refait.
   *
   *  La hauteur bouge à chaque pression : dix kazoos identiques, ça lasse. */
  function kazooSynthese() {
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + 0.015, duree = 0.72, t1 = t0 + duree;
    var f0 = 350 + Math.random() * 70;

    var sortie = c.createGain();
    sortie.gain.setValueAtTime(0.0001, t0);
    sortie.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
    sortie.gain.setValueAtTime(0.18, t1 - 0.12);
    sortie.gain.exponentialRampToValueAtTime(0.0001, t1);
    sortie.connect(master(c));

    var o = c.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(f0 * 0.88, t0);
    o.frequency.linearRampToValueAtTime(f0, t0 + 0.06);           // « pwa- »
    o.frequency.setValueAtTime(f0, t1 - 0.14);
    o.frequency.linearRampToValueAtTime(f0 * 0.86, t1);           // « -èèt »

    var vib = c.createOscillator(); vib.type = "sine"; vib.frequency.value = 5.5;
    var gVib = c.createGain(); gVib.gain.value = f0 * 0.025;
    vib.connect(gVib); gVib.connect(o.frequency);

    var pousse = c.createGain(); pousse.gain.value = 2;
    var membrane = c.createWaveShaper(); membrane.oversample = "4x";
    membrane.curve = courbeMembrane();

    // Le flottement du papier : léger, 42 Hz, 12 % — pas un trémolo.
    var flottement = c.createGain(); flottement.gain.value = 0.88;
    var flo = c.createOscillator(); flo.type = "sine"; flo.frequency.value = 42;
    var gFlo = c.createGain(); gFlo.gain.value = 0.12;
    flo.connect(gFlo); gFlo.connect(flottement.gain);

    var coupeBas = c.createBiquadFilter();
    coupeBas.type = "highpass"; coupeBas.frequency.value = 500; coupeBas.Q.value = 0.7;
    var nasal1 = c.createBiquadFilter();
    nasal1.type = "peaking"; nasal1.frequency.value = 1200; nasal1.Q.value = 1.0; nasal1.gain.value = 11;
    var nasal2 = c.createBiquadFilter();
    nasal2.type = "peaking"; nasal2.frequency.value = 2700; nasal2.Q.value = 1.3; nasal2.gain.value = 8;
    var coupeHaut = c.createBiquadFilter();
    coupeHaut.type = "lowpass"; coupeHaut.frequency.value = 6500; coupeHaut.Q.value = 0.7;

    var papier = c.createBiquadFilter();
    papier.type = "bandpass"; papier.frequency.value = 3200; papier.Q.value = 1.2;
    var grain = c.createBufferSource();
    grain.buffer = bruitBlanc(c); grain.loop = true;
    var gGrain = c.createGain(); gGrain.gain.value = 0.07;
    grain.connect(papier); papier.connect(gGrain); gGrain.connect(flottement);

    o.connect(pousse); pousse.connect(membrane); membrane.connect(flottement);
    flottement.connect(coupeBas); coupeBas.connect(nasal1); nasal1.connect(nasal2);
    nasal2.connect(coupeHaut); coupeHaut.connect(sortie);
    [o, vib, flo, grain].forEach(function (n) { n.start(t0); n.stop(t1 + 0.02); });
  }

  /** La courbe de la membrane : tanh décalée, donc asymétrique. Calculée une
   *  fois — 2048 points à chaque pression du bouton, c'est du gâchis. */
  var _courbe = null;
  function courbeMembrane() {
    if (_courbe) return _courbe;
    var N = 2048, K = 2.4, B = 0.6;
    var dc = Math.tanh(B), haut = Math.tanh(K + B), bas = Math.tanh(-K + B);
    var cu = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var x = i * 2 / (N - 1) - 1;
      cu[i] = (Math.tanh(K * x + B) - dc) / Math.max(haut - dc, dc - bas);
    }
    _courbe = cu; return cu;
  }

  /* ─── écran qui ne s'éteint pas pendant un décompte ────────────────────── */
  var _wl = null, _wlDemande = false;
  function garderEcran() {
    try {
      if (!navigator.wakeLock || _wl || _wlDemande) return;
      _wlDemande = true;
      navigator.wakeLock.request("screen").then(function (wl) {
        _wlDemande = false; _wl = wl;
        wl.addEventListener("release", function () { _wl = null; });
      }).catch(function () { _wlDemande = false; });
    } catch (e) { _wlDemande = false; }
  }
  function relacherEcran() {
    try { if (_wl) _wl.release(); } catch (e) { /* ignore */ }
    _wl = null; _wlDemande = false;
  }

  /* ─── CSS ──────────────────────────────────────────────────────────────── */
  var CSS = [
    ".itool-badge{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:.02em}",
    ".itool-trigger.is-running{border-color:var(--gold,#f5c451);color:var(--gold-soft,#fde08a)}",
    ".itool-trigger.is-done{animation:itool-flash .5s steps(1) 6}",
    "@keyframes itool-flash{0%,100%{background:rgba(245,196,81,.35)}50%{background:rgba(15,8,25,.65)}}",
    ".itool-overlay{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;",
      "padding:1rem;background:rgba(12,8,20,.92);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}",
    ".itool-overlay[hidden]{display:none!important}",
    ".itool-panel{position:relative;width:min(420px,100%);max-height:calc(100svh - 1.5rem);overflow-y:auto;",
      "padding:1.5rem 1.5rem 1.25rem;border-radius:20px;text-align:center;color:var(--ink,#f5f0ea);",
      "background:linear-gradient(180deg,rgba(245,196,81,.09),rgba(255,255,255,.04)),#160d22;",
      "border:1px solid rgba(245,196,81,.4);box-shadow:0 25px 60px rgba(0,0,0,.6);",
      "font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".itool-title{margin:0 2rem .9rem 0;font-family:'Bebas Neue',Inter,sans-serif;font-size:1.45rem;",
      "letter-spacing:.08em;color:var(--gold,#f5c451);text-align:left}",
    ".itool-x{position:absolute;top:.5rem;right:.6rem;appearance:none;background:transparent;border:0;cursor:pointer;",
      "color:var(--ink-muted,rgba(245,240,234,.65));font-size:1.4rem;line-height:1;padding:.2rem .5rem;border-radius:8px}",
    ".itool-x:hover{color:var(--ink,#f5f0ea)}",
    ".itool-time{font-family:'Bebas Neue',Inter,sans-serif;font-size:clamp(62px,19vw,104px);line-height:1;",
      "font-variant-numeric:tabular-nums;letter-spacing:.02em;color:var(--ink,#f5f0ea);",
      "text-shadow:0 0 30px rgba(245,196,81,.3);transition:color .2s,text-shadow .2s}",
    ".itool-time.is-warn{color:#fbbf24;text-shadow:0 0 35px rgba(251,191,36,.5)}",
    ".itool-time.is-danger{color:#f87171;text-shadow:0 0 40px rgba(248,113,113,.6);animation:itool-pulse .8s infinite alternate}",
    ".itool-time.is-done{color:var(--gold,#f5c451);text-shadow:0 0 50px rgba(245,196,81,.7)}",
    "@keyframes itool-pulse{from{transform:scale(1)}to{transform:scale(1.05)}}",
    ".itool-bar{height:7px;margin:.5rem 0 1rem;border-radius:999px;background:rgba(0,0,0,.45);overflow:hidden}",
    ".itool-bar>i{display:block;height:100%;width:100%;border-radius:999px;",
      "background:linear-gradient(90deg,#6dd3c5,var(--gold,#f5c451),#ff6b8a);transition:width .25s linear}",
    ".itool-status{min-height:1.1rem;margin:0 0 .75rem;font-size:.85rem;font-weight:600;letter-spacing:.04em;",
      "color:var(--gold,#f5c451)}",
    // Le créneau garde sa hauteur même quand aucun signe n'est dû : sans lui,
    // le panneau sauterait à chaque marque et à chaque fin de marque.
    ".itool-slot{display:flex;align-items:center;min-height:92px;margin:0 0 .9rem}",
    ".itool-slot[hidden]{display:none!important}",
    ".itool-sign{display:flex;gap:.7rem;align-items:center;width:100%;text-align:left;padding:.5rem .6rem;",
      "border-radius:14px;background:rgba(0,0,0,.3);border:1px solid rgba(245,196,81,.22)}",
    ".itool-sign.is-off{visibility:hidden}",
    ".itool-sign.is-new{animation:itool-sign-in .6s ease-out 3}",
    "@keyframes itool-sign-in{0%,100%{border-color:rgba(245,196,81,.22);background:rgba(0,0,0,.3)}",
      "40%{border-color:var(--gold,#f5c451);background:rgba(245,196,81,.18)}}",
    ".itool-sign-figs{display:flex;gap:.3rem;flex:0 0 auto}",
    ".itool-sign-img{display:block;width:58px;height:72px;object-fit:contain;border-radius:9px;background:rgba(0,0,0,.35)}",
    ".itool-sign-txt{min-width:0}",
    ".itool-sign-cap{display:block;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;",
      "color:var(--ink-faint,rgba(245,240,234,.52))}",
    // Pas de Bebas Neue ici : c'est une capitale-only, et « 30 s » y devient
    // « 30 S », ce qui se lit mal pour une unité.
    ".itool-sign-h{display:block;margin:.1rem 0 .2rem;font:700 1rem/1.1 Inter,system-ui,sans-serif;",
      "letter-spacing:.01em;color:var(--gold,#f5c451)}",
    ".itool-sign-d{display:block;font-size:.78rem;line-height:1.3;color:var(--ink-muted,rgba(245,240,234,.65))}",
    "@media (prefers-reduced-motion:reduce){.itool-sign.is-new{animation:none;border-color:var(--gold,#f5c451)}",
      ".itool-time.is-danger{animation:none}}",
    ".itool-phase{display:inline-block;margin:0 0 .2rem;padding:.2rem .7rem;border-radius:999px;",
      "font:700 .68rem/1.4 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}",
    ".itool-phase[hidden]{display:none!important}",
    ".itool-phase.is-caucus{color:var(--gold,#f5c451);background:rgba(245,196,81,.14);",
      "border:1px solid rgba(245,196,81,.4)}",
    ".itool-phase.is-impro{color:#6dd3c5;background:rgba(109,211,197,.14);border:1px solid rgba(109,211,197,.45)}",
    ".itool-caucus{display:block;width:100%;margin:0 0 .5rem;padding:.8rem 1rem;border-radius:14px;cursor:pointer;",
      "font:700 1.02rem/1.2 Inter,sans-serif;letter-spacing:.02em;color:#2a0e2c;border:0;",
      "background:linear-gradient(135deg,var(--gold,#f5c451),var(--gold-soft,#fde08a));",
      "box-shadow:0 8px 24px rgba(245,196,81,.25)}",
    ".itool-caucus:hover{filter:brightness(1.07)}",
    ".itool-go{display:block;width:100%;margin:0 0 .9rem;padding:.7rem 1rem;border-radius:14px;cursor:pointer;",
      "font:700 1rem/1.2 Inter,sans-serif;letter-spacing:.02em;color:#6dd3c5;",
      "background:rgba(109,211,197,.1);border:1px solid rgba(109,211,197,.5)}",
    ".itool-go:hover{background:rgba(109,211,197,.2);color:#9fe8de}",
    ".itool-go:focus-visible{outline:2px solid #6dd3c5;outline-offset:2px}",
    ".itool-btn:disabled{opacity:.4;cursor:default}",
    ".itool-btn:disabled:hover{border-color:rgba(245,196,81,.3);background:rgba(255,255,255,.07)}",
    ".itool-btn.is-primary:disabled:hover{background:linear-gradient(135deg,#6dd3c5,#84e1bc)}",
    ".itool-row{display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem}",
    // Largeur figée : sans elle, « Caucus » étant plus large qu'« Impro »,
    // les deux listes déroulantes ne commençaient pas au même endroit.
    ".itool-row>label{flex:0 0 4rem;font-size:.85rem;color:var(--ink-muted,rgba(245,240,234,.65))}",
    ".itool-select{flex:1 1 auto;min-width:0;padding:.6rem .7rem;border-radius:12px;cursor:pointer;",
      "font:600 1rem/1.2 Inter,sans-serif;color:var(--ink,#f5f0ea);background:rgba(0,0,0,.4);",
      "border:1px solid rgba(245,196,81,.3)}",
    ".itool-select:focus-visible,.itool-btn:focus-visible,.itool-x:focus-visible,.itool-caucus:focus-visible{",
      "outline:2px solid var(--gold,#f5c451);outline-offset:2px}",
    ".itool-btn{flex:1 1 0;padding:.65rem .8rem;border-radius:12px;cursor:pointer;font:600 .95rem/1.2 Inter,sans-serif;",
      "color:var(--ink,#f5f0ea);background:rgba(255,255,255,.07);border:1px solid rgba(245,196,81,.3)}",
    ".itool-btn:hover{border-color:var(--gold,#f5c451);background:rgba(255,255,255,.12)}",
    ".itool-btn.is-primary{color:#2a0e2c;border-color:transparent;font-weight:700;",
      "background:linear-gradient(135deg,#6dd3c5,#84e1bc)}",
    ".itool-check{display:flex;gap:.55rem;align-items:center;justify-content:center;margin:.25rem 0 .75rem;",
      "font-size:.9rem;color:var(--ink,#f5f0ea);cursor:pointer}",
    ".itool-check input{width:18px;height:18px;accent-color:var(--gold,#f5c451);cursor:pointer}",
    ".itool-sep{margin:.9rem 0 .6rem;border:0;border-top:1px solid rgba(245,196,81,.18)}",
    ".itool-close{width:100%;margin-top:.9rem;padding:.6rem;border-radius:12px;cursor:pointer;",
      "font:600 .9rem/1.2 Inter,sans-serif;color:var(--ink-muted,rgba(245,240,234,.65));",
      "background:transparent;border:1px solid rgba(245,240,234,.2)}",
    ".itool-close:hover{color:var(--ink,#f5f0ea);border-color:rgba(245,240,234,.45)}",
    "@media (max-height:520px){.itool-panel{padding:1rem 1.1rem}.itool-time{font-size:clamp(44px,13vw,64px)}}"
  ].join("");

  function injecterCss() {
    if (document.getElementById("itool-css")) return;
    var s = document.createElement("style");
    s.id = "itool-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ─── DOM ──────────────────────────────────────────────────────────────── */
  var bouton = null, etiquette = null, pastille = null;
  var fond = null, panneau = null, affichage = null, barre = null, statut = null;
  var btnCaucus = null, btnImpro = null, badgePhase = null;
  var listeCaucus = null, liste = null, btnDemarrer = null, btnReset = null, caseSifflet = null;
  var creneauSigne = null, blocSigne = null, figuresSigne = null, dernierSigne = null;

  function construireBouton() {
    var barreHaut = document.querySelector(".top-actions");
    if (!barreHaut || barreHaut.querySelector(".itool-trigger")) return;
    bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "top-trigger itool-trigger";
    bouton.innerHTML = '<span aria-hidden="true" style="font-size:1.1rem;">⏱️</span>' +
      '<span class="itool-label"></span><span class="itool-badge" aria-hidden="true" hidden></span>';
    etiquette = bouton.querySelector(".itool-label");
    pastille = bouton.querySelector(".itool-badge");
    // Après les cinq liens communs de js/topbar.js (🏠 🎭 🎲 🔥 💡) et avant
    // les boutons propres à la page : la place du ⏱️ ne bouge pas d'une page
    // à l'autre. À défaut (le Studio garde sa propre barre), avant l'avatar.
    var apres = barreHaut.querySelector('[data-topbar="idees"]');
    var avant = barreHaut.querySelector('[data-topbar="compte"], .suite-account');
    if (apres && apres.parentNode === barreHaut) barreHaut.insertBefore(bouton, apres.nextSibling);
    else if (avant && avant.parentNode === barreHaut) barreHaut.insertBefore(bouton, avant);
    else barreHaut.appendChild(bouton);
    bouton.addEventListener("click", function () { debloquerAudio(); ouvrir(); });
  }

  function construirePanneau() {
    fond = document.createElement("div");
    fond.className = "itool-overlay";
    fond.hidden = true;
    fond.innerHTML =
      '<div class="itool-panel" role="dialog" aria-modal="true" aria-labelledby="itoolTitle">' +
        '<button type="button" class="itool-x" data-act="close">✕</button>' +
        '<h2 class="itool-title" id="itoolTitle">⏱️ IMPRO TOOL</h2>' +
        '<div class="itool-phase" hidden></div>' +
        '<div class="itool-time">3:00</div>' +
        '<div class="itool-bar"><i></i></div>' +
        '<p class="itool-status" role="status"></p>' +
        '<div class="itool-slot" hidden>' +
          '<div class="itool-sign is-off">' +
            '<span class="itool-sign-figs"></span>' +
            '<div class="itool-sign-txt">' +
              '<span class="itool-sign-cap"></span>' +
              '<b class="itool-sign-h"></b>' +
              '<span class="itool-sign-d"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Les durées d'abord : les deux boutons de départ portent leurs
        // valeurs, donc on les choisit avant de lire ce qu'ils proposent.
        '<div class="itool-row">' +
          '<label for="itoolCaucus"></label>' +
          '<select class="itool-select" id="itoolCaucus"></select>' +
        '</div>' +
        '<div class="itool-row">' +
          '<label for="itoolDuree"></label>' +
          '<select class="itool-select" id="itoolDuree"></select>' +
        '</div>' +
        '<button type="button" class="itool-caucus" data-act="caucus"></button>' +
        '<button type="button" class="itool-go" data-act="impro"></button>' +
        '<div class="itool-row">' +
          '<button type="button" class="itool-btn is-primary" data-act="start"></button>' +
          '<button type="button" class="itool-btn" data-act="reset"></button>' +
        '</div>' +
        '<hr class="itool-sep" />' +
        '<label class="itool-check"><input type="checkbox" id="itoolSifflet" /><span></span></label>' +
        '<div class="itool-row">' +
          '<button type="button" class="itool-btn" data-act="whistle"></button>' +
          '<button type="button" class="itool-btn" data-act="kazoo"></button>' +
        '</div>' +
        '<button type="button" class="itool-close" data-act="close"></button>' +
      '</div>';
    document.body.appendChild(fond);

    panneau     = fond.querySelector(".itool-panel");
    affichage   = fond.querySelector(".itool-time");
    barre       = fond.querySelector(".itool-bar > i");
    statut      = fond.querySelector(".itool-status");
    badgePhase  = fond.querySelector(".itool-phase");
    btnCaucus   = fond.querySelector('[data-act="caucus"]');
    btnImpro    = fond.querySelector('[data-act="impro"]');
    listeCaucus = fond.querySelector("#itoolCaucus");
    liste       = fond.querySelector("#itoolDuree");
    btnDemarrer = fond.querySelector('[data-act="start"]');
    btnReset    = fond.querySelector('[data-act="reset"]');
    caseSifflet = fond.querySelector("#itoolSifflet");
    creneauSigne  = fond.querySelector(".itool-slot");
    blocSigne     = fond.querySelector(".itool-sign");
    figuresSigne  = fond.querySelector(".itool-sign-figs");

    // Un clic hors du panneau ferme, comme partout ailleurs dans l'app.
    fond.addEventListener("click", function (ev) {
      debloquerAudio();
      if (ev.target === fond) fermer();
    });
    panneau.addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest("[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "close")   fermer();
      if (act === "caucus")  lancerCaucus();
      if (act === "impro")   lancerImpro();
      if (act === "start")   basculer();
      if (act === "reset")   reinitialiser();
      if (act === "whistle") sifflet();
      if (act === "kazoo")   kazoo();
    });
    liste.addEventListener("change", function () {
      var v = parseInt(liste.value, 10);
      if (!isNaN(v)) choisirDuree(v);
    });
    listeCaucus.addEventListener("change", function () {
      var v = parseInt(listeCaucus.value, 10);
      if (!isNaN(v)) choisirCaucus(v);
    });
    caseSifflet.addEventListener("change", function () {
      etat.sifflet = !!caseSifflet.checked;
      ecrireEtat();
    });
    traduire();
  }

  /** Libellés et options : relus à chaque changement de langue. */
  function traduire() {
    if (etiquette) etiquette.textContent = t("improToolBtn", "Impro Tool");
    if (!fond) return;
    fond.querySelector(".itool-x").setAttribute("aria-label", t("improToolClose", "Fermer"));
    // Libellés courts et alignés — « Caucus » / « Impro » —, la phrase
    // complète allant sur le nom accessible : deux fois « Durée de… » dans
    // une colonne de 110 px ne tenait pas sur un téléphone.
    var etiqCaucus = fond.querySelector('.itool-row > label[for="itoolCaucus"]');
    var etiqImpro = fond.querySelector('.itool-row > label[for="itoolDuree"]');
    etiqCaucus.textContent = t("improToolCaucus", "Caucus");
    etiqImpro.textContent = t("improToolImpro", "Impro");
    listeCaucus.setAttribute("aria-label", t("improToolDurationCaucus", "Durée du caucus"));
    liste.setAttribute("aria-label", t("improToolDurationImpro", "Durée de l'impro"));
    fond.querySelector('[data-act="close"].itool-close').textContent = t("improToolClose", "Fermer");
    fond.querySelector(".itool-check span").textContent = "🔊 " + t("improToolWhistleEnd", "Sifflet à la fin");
    btnReset.textContent = "↺ " + t("improToolReset", "Réinitialiser");
    fond.querySelector('[data-act="whistle"]').textContent = "📣 " + t("improToolWhistle", "Sifflet");
    fond.querySelector('[data-act="kazoo"]').textContent = "🎺 " + t("improToolKazoo", "Kazoo");
    function options(l) {
      return l.map(function (s) { return '<option value="' + s + '">' + libelleDuree(s) + "</option>"; }).join("");
    }
    listeCaucus.innerHTML = options(CAUCUS_DUREES);
    listeCaucus.value = String(etat.caucus);
    liste.innerHTML = options(DUREES);
    liste.value = String(etat.duree);
    caseSifflet.checked = !!etat.sifflet;
    dernierSigne = null;                           // les libellés du signe aussi
    majLancements();
    rendre();
  }

  /** Les deux départs portent la durée choisie, pour qu'on sache ce qu'on
   *  lance sans relire la liste : « Caucus 20 s → 3 min » et « Impro 3 min ».
   *  Relu quand la durée ou la langue change, pas quatre fois par seconde. */
  function majLancements() {
    if (!fond) return;
    var impro = libelleDuree(etat.duree);
    btnCaucus.textContent = "🗣️ " + t("improToolCaucus", "Caucus") + " " + libelleDuree(etat.caucus) + " → " + impro;
    btnImpro.textContent = "▶ " + t("improToolImpro", "Impro") + " " + impro;
  }

  /* ─── affichage ────────────────────────────────────────────────────────── */
  function rendre() {
    var reste = etat.enCours ? Math.max(0, (etat.finAt - Date.now()) / 1000) : etat.reste;
    var fini = !etat.enCours && !!etat.phase && etat.reste <= 0;

    if (bouton) {
      var court = etat.enCours || (!!etat.phase && etat.reste > 0 && etat.reste < etat.total);
      bouton.classList.toggle("is-running", !!etat.enCours);
      if (court) {
        pastille.textContent = mmss(reste);
        pastille.hidden = false;
        etiquette.hidden = true;
      } else {
        pastille.hidden = true;
        etiquette.hidden = false;
      }
      bouton.setAttribute("aria-label", t("improToolBtn", "Impro Tool") +
        (etat.enCours ? " — " + mmss(reste) : ""));
    }
    if (!fond) return;

    affichage.textContent = mmss(reste);
    affichage.classList.toggle("is-done", fini);
    affichage.classList.toggle("is-danger", !fini && reste > 0 && reste <= 5);
    affichage.classList.toggle("is-warn", !fini && reste > 5 && reste <= Math.max(10, etat.total * 0.25));
    barre.style.width = (etat.total > 0 ? Math.max(0, Math.min(100, (reste / etat.total) * 100)) : 0) + "%";
    statut.textContent = fini ? t("improToolDone", "Terminé !") : "";

    // Quelle phase court : sans ça, un décompte de vingt secondes ne dit pas
    // s'il s'agit du caucus ou d'une impro très courte.
    badgePhase.hidden = !etat.phase;
    if (etat.phase) {
      badgePhase.textContent = etat.phase === "caucus"
        ? "🗣️ " + t("improToolCaucus", "Caucus")
        : "🎭 " + t("improToolImpro", "Impro");
      badgePhase.classList.toggle("is-caucus", etat.phase === "caucus");
      badgePhase.classList.toggle("is-impro", etat.phase === "impro");
    }

    rendreSigne(reste);
    btnDemarrer.textContent = etat.enCours
      ? "⏸ " + t("improToolPause", "Pause")
      // « Reprendre » seulement s'il reste vraiment du temps : à zéro, le
      // bouton relance la phase depuis le début, c'est « Démarrer ».
      : (etat.phase && etat.reste > 0 ? "▶ " + t("improToolResume", "Reprendre")
                                      : "▶ " + t("improToolStart", "Démarrer"));
    // Au repos, rien à mettre en pause ni à remettre à zéro : les deux départs
    // sont les seules portes d'entrée.
    btnDemarrer.disabled = !etat.phase;
    btnReset.disabled = !etat.phase;
  }

  /** Le signe de la main, pendant un décompte seulement, et seulement dans sa
   *  fenêtre de quatre secondes. Les visuels ne sont demandés qu'au moment où
   *  ils s'affichent (loading="lazy" ne suffit pas : le src n'est posé qu'ici),
   *  donc une page qui n'ouvre jamais l'outil ne télécharge aucune des six
   *  images, et une qui ne va jamais au bout n'en télécharge qu'une partie.
   *
   *  Le créneau garde sa hauteur entre deux marques : l'encadré devient
   *  invisible, il ne disparaît pas. */
  function rendreSigne(reste) {
    // Pendant l'impro seulement : les signes de temps s'adressent aux joueurs
    // en scène. Pendant les vingt secondes du caucus, le grand chiffre suffit.
    var actif = etat.phase === "impro" && (etat.enCours || (etat.reste > 0 && etat.reste < etat.total));
    creneauSigne.hidden = !actif;
    var sg = actif ? signe(reste) : null;
    if (!sg) {
      blocSigne.classList.add("is-off");
      blocSigne.classList.remove("is-new");
      dernierSigne = null;
      return;
    }
    var id = sg.cles.join(",") + "|" + sg.titre;
    if (id !== dernierSigne) {
      dernierSigne = id;
      // Pas de loading="lazy" : la balise n'est créée qu'au moment où le signe
      // doit s'afficher, le report est déjà fait — et « lazy » dans un bloc
      // encore invisible retardait le chargement jusqu'après la fenêtre, donc
      // deux cadres vides pendant les quatre secondes qui comptent.
      figuresSigne.innerHTML = sg.cles.map(function (cle) {
        return '<img class="itool-sign-img" src="/assets/gestes/' + encodeURIComponent(cle) + ".jpg?v=" + ART_V + '"' +
          ' width="600" height="750" decoding="async" alt="" />';
      }).join("");
      blocSigne.querySelector(".itool-sign-cap").textContent = t("improToolSignTitle", "Signe à faire");
      blocSigne.querySelector(".itool-sign-h").textContent = sg.titre;
      blocSigne.querySelector(".itool-sign-d").textContent = sg.desc;
      figuresSigne.setAttribute("aria-label", sg.titre + " — " + sg.desc);
      blocSigne.classList.remove("is-new");
      void blocSigne.offsetWidth;                  // relance l'animation
      blocSigne.classList.add("is-new");
    }
    blocSigne.classList.remove("is-off");
  }

  /* ─── minuteur ─────────────────────────────────────────────────────────── */
  var tic = 0;
  function battre() {
    if (tic) return;
    // 4 fois par seconde : le changement de seconde affiché ne traîne jamais
    // plus de 250 ms, pour un coût nul.
    tic = window.setInterval(function () {
      if (!etat.enCours) return;
      if (Date.now() >= etat.finAt) { terminer(); return; }
      rendre();
    }, 250);
  }
  function arreterBattement() {
    if (tic) { window.clearInterval(tic); tic = 0; }
  }

  /** La durée d'impro choisie. Elle ne touche PAS au décompte en cours : on
   *  peut changer la durée de l'impro pendant le caucus qui la précède, c'est
   *  même le moment où l'arbitre la décide. Au repos, l'affichage la suit. */
  function choisirDuree(secondes) {
    etat.duree = secondes;
    if (!etat.phase) { etat.total = secondes; etat.reste = secondes; }
    if (liste) liste.value = String(secondes);
    ecrireEtat(); majLancements(); rendre();
  }

  function lancer(phase, secondes, enchaine) {
    debloquerAudio();
    etat.phase = phase;
    etat.enchaine = !!enchaine;
    etat.total = secondes;
    etat.reste = secondes;
    etat.finAt = Date.now() + secondes * 1000;
    etat.enCours = true;
    dernierSigne = null;
    garderEcran(); battre(); ecrireEtat(); rendre();
  }
  function choisirCaucus(secondes) {
    etat.caucus = secondes;
    if (listeCaucus) listeCaucus.value = String(secondes);
    ecrireEtat(); majLancements();
  }
  function lancerCaucus() { lancer("caucus", etat.caucus, true); }
  function lancerImpro()  { lancer("impro", etat.duree, false); }

  function reprendre() {
    if (!etat.phase) { lancerImpro(); return; }   // rien en cours : l'impro, par défaut
    debloquerAudio();
    var reste = (etat.reste > 0 && etat.reste <= etat.total) ? etat.reste : etat.total;
    etat.finAt = Date.now() + reste * 1000;
    etat.enCours = true;
    garderEcran(); battre(); ecrireEtat(); rendre();
  }
  function pause() {
    etat.reste = Math.max(0, (etat.finAt - Date.now()) / 1000);
    etat.enCours = false;
    etat.finAt = 0;
    relacherEcran();
    ecrireEtat(); rendre();
  }
  function basculer() { if (etat.enCours) pause(); else reprendre(); }
  function reinitialiser() {
    repos();
    relacherEcran();
    ecrireEtat(); rendre();
  }

  /** Fin d'une phase. Si c'était le caucus d'un enchaînement, l'impro part
   *  dans la foulée : le coup de sifflet est le départ, il n'y a rien à
   *  cliquer entre les deux — personne n'a une main libre à ce moment-là. */
  function terminer() {
    var enchaine = etat.enchaine && etat.phase === "caucus";
    etat.enCours = false; etat.finAt = 0; etat.reste = 0;
    if (etat.sifflet) sifflet(0.8);
    try { if (navigator.vibrate) navigator.vibrate([140, 70, 140]); } catch (e) { /* ignore */ }
    if (enchaine) { lancer("impro", etat.duree, false); return; }
    etat.enchaine = false;
    relacherEcran();
    ecrireEtat(); rendre();
    // Fenêtre fermée : le bouton de la barre clignote, pour que la fin se
    // voie aussi quand on est sur une autre partie de la page.
    if (bouton && (!fond || fond.hidden)) {
      bouton.classList.add("is-done");
      window.setTimeout(function () { if (bouton) bouton.classList.remove("is-done"); }, 3200);
    }
  }

  /* ─── ouverture / fermeture ────────────────────────────────────────────── */
  var dernierFocus = null;
  function ouvrir() {
    if (!fond) construirePanneau();
    dernierFocus = document.activeElement;
    fond.hidden = false;
    dernierSigne = null;                           // le signe en cours se signale à l'ouverture
    rendre();
    try { btnCaucus.focus(); } catch (e) { /* ignore */ }
  }
  function fermer() {
    if (!fond || fond.hidden) return;
    fond.hidden = true;
    rendre();
    try { if (dernierFocus && dernierFocus.focus) dernierFocus.focus(); } catch (e) { /* ignore */ }
  }
  function ouverte() { return !!fond && !fond.hidden; }

  /* ─── démarrage ────────────────────────────────────────────────────────── */
  function demarrerOutil() {
    injecterCss();
    lireEtat();
    construireBouton();
    // Décompte repris d'une autre page : le sifflet peut tomber avant tout
    // clic ici, donc on le charge tout de suite. Sinon rien n'est demandé au
    // réseau tant que l'outil n'est pas ouvert.
    if (etat.enCours) { battre(); charger("sifflet"); }
    rendre();

    document.addEventListener("keydown", function (ev) {
      if (!ouverte()) return;
      if (ev.key === "Escape") { ev.preventDefault(); fermer(); return; }
      // Espace : démarrer / mettre en pause, sauf si l'on est dans la liste
      // déroulante ou sur la case à cocher (l'espace y a déjà un sens).
      if (ev.key === " " || ev.code === "Space") {
        var a = document.activeElement;
        if (a && (a.tagName === "SELECT" || a.tagName === "INPUT")) return;
        ev.preventDefault(); basculer();
      }
    });
    // Retour d'onglet : l'intervalle a pu être bridé, on recale l'affichage.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      if (etat.enCours && Date.now() >= etat.finAt) terminer(); else rendre();
      if (etat.enCours) garderEcran();                 // le verrou est perdu en arrière-plan
    });
    window.addEventListener("acto:locale-ready", traduire);
    window.addEventListener("storage", function (ev) {
      if (ev && ev.key === LOCALE_KEY) traduire();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrerOutil);
  else demarrerOutil();

  window.actoImproTool = {
    ouvrir: ouvrir, fermer: fermer, sifflet: sifflet, kazoo: kazoo,
    // Une durée hors liste laisserait le menu déroulant vide : on prend la
    // plus proche de celles qu'il propose.
    demarrer: function (secondes, avecCaucus) {
      if (secondes) {
        choisirDuree(DUREES.reduce(function (meilleur, d) {
          return Math.abs(d - secondes) < Math.abs(meilleur - secondes) ? d : meilleur;
        }, DUREES[0]));
      }
      ouvrir();
      if (avecCaucus) lancerCaucus(); else lancerImpro();
    }
  };
})();
