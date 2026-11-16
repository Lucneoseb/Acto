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
  var CAUCUS     = 20;
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

  /** Le signe de la main à donner pour un temps restant donné.
   *
   *  Le chronomètre n'est presque jamais dans la main de l'arbitre : le maître
   *  de cérémonie tient la durée et la transmet en silence, par une poignée de
   *  signes convenus. L'outil tient le chronomètre, donc il doit aussi dire
   *  lequel. Les seuils suivent l'article « Tenir le temps » : dix minutes, le
   *  nombre de minutes restantes, trente secondes, dix, le décompte final —
   *  et l'entonnoir de conclusion dans la dernière minute, le moment où il
   *  sert : à trente secondes une histoire peut encore atterrir.
   *
   *  Au-delà de dix minutes, aucun signe : on ne prévient pas si tôt. */
  function signe(reste) {
    var s = Math.ceil(reste);
    if (s <= 0) return null;
    if (s <= 5)  return { cle: "temps-decompte",        titre: "5 "  + t("improToolUnitSec", "s"), desc: t("improToolSignFive",   "La main se retourne, doigts vers le haut : 5, 4, 3, 2, 1.") };
    if (s <= 10) return { cle: "temps-dix-secondes",    titre: "10 " + t("improToolUnitSec", "s"), desc: t("improToolSignTen",    "La main ouverte, paume vers le sol, secouée de gauche à droite.") };
    if (s <= 30) return { cle: "temps-trente-secondes", titre: "30 " + t("improToolUnitSec", "s"), desc: t("improToolSignThirty", "L'index et le majeur croisés, pointés vers le bas.") };
    if (s <= 60) return { cle: "temps-conclure",        titre: t("improToolSignConclusion", "Conclusion"), desc: t("improToolSignFunnel", "Les deux mains ouvertes en entonnoir : amenez la fin.") };
    if (s > 600) return null;
    var m = Math.ceil(s / 60);
    if (m >= 10) return { cle: "temps-dix-minutes", titre: "10 " + t("improToolUnitMin", "min"), desc: t("improToolSignFist", "Le poing fermé, doigts vers le bas.") };
    return { cle: "temps-minutes", titre: m + " " + t("improToolUnitMin", "min"), desc: t("improToolSignMinutes", "Un doigt tendu vers le bas par minute restante.") };
  }

  /* ─── état mémorisé ─────────────────────────────────────────────────────
     Le minuteur est une DATE de fin, pas un compteur : un intervalle est
     bridé quand l'onglet passe en arrière-plan (jusqu'à 1 fois/minute), et
     un décompte qui s'additionne dériverait de plusieurs secondes sur un
     caucus de 20 s. Corollaire utile : la date se garde dans localStorage,
     donc le décompte continue quand on change de page.                      */
  var etat = { duree: CAUCUS, sifflet: true, total: CAUCUS, finAt: 0, enCours: false, reste: CAUCUS };

  function lireEtat() {
    try {
      var brut = localStorage.getItem(CLE_ETAT);
      if (!brut) return;
      var e = JSON.parse(brut) || {};
      if (DUREES.indexOf(e.duree) >= 0) etat.duree = e.duree;
      if (typeof e.sifflet === "boolean") etat.sifflet = e.sifflet;
      etat.total = (typeof e.total === "number" && e.total > 0) ? e.total : etat.duree;
      // Un décompte en cours est repris s'il n'est pas déjà échu ; sinon on
      // repart propre sur la durée choisie (ne pas siffler une fin vieille
      // de dix minutes au premier chargement de page).
      if (e.enCours && typeof e.finAt === "number" && e.finAt > Date.now()) {
        etat.finAt = e.finAt; etat.enCours = true;
        etat.reste = (e.finAt - Date.now()) / 1000;
      } else {
        etat.enCours = false; etat.finAt = 0;
        etat.total = etat.duree;
        etat.reste = (!e.enCours && typeof e.reste === "number" && e.reste > 0 && e.reste <= etat.total) ? e.reste : etat.total;
      }
    } catch (e) { /* stockage indisponible : valeurs par défaut */ }
  }
  function ecrireEtat() {
    try {
      localStorage.setItem(CLE_ETAT, JSON.stringify({
        duree: etat.duree, sifflet: etat.sifflet, total: etat.total,
        enCours: etat.enCours, finAt: etat.finAt, reste: etat.reste
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

  /** Sifflet d'arbitre à bille.
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
  function sifflet(duree) {
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

  /** Kazoo (gazou).
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
  function kazoo() {
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
    ".itool-sign{display:flex;gap:.7rem;align-items:center;text-align:left;margin:0 0 .9rem;padding:.5rem .6rem;",
      "border-radius:14px;background:rgba(0,0,0,.3);border:1px solid rgba(245,196,81,.22)}",
    ".itool-sign[hidden]{display:none!important}",
    ".itool-sign.is-new{animation:itool-sign-in .6s ease-out 3}",
    "@keyframes itool-sign-in{0%,100%{border-color:rgba(245,196,81,.22);background:rgba(0,0,0,.3)}",
      "40%{border-color:var(--gold,#f5c451);background:rgba(245,196,81,.18)}}",
    ".itool-sign-img{flex:0 0 auto;width:64px;height:80px;object-fit:contain;border-radius:9px;background:rgba(0,0,0,.35)}",
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
    ".itool-caucus{display:block;width:100%;margin:0 0 .9rem;padding:.8rem 1rem;border-radius:14px;cursor:pointer;",
      "font:700 1.05rem/1 Inter,sans-serif;letter-spacing:.03em;color:#2a0e2c;border:0;",
      "background:linear-gradient(135deg,var(--gold,#f5c451),var(--gold-soft,#fde08a));",
      "box-shadow:0 8px 24px rgba(245,196,81,.25)}",
    ".itool-caucus:hover{filter:brightness(1.07)}",
    ".itool-row{display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem}",
    ".itool-row>label{flex:0 0 auto;font-size:.85rem;color:var(--ink-muted,rgba(245,240,234,.65))}",
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
  var btnCaucus = null, liste = null, btnDemarrer = null, btnReset = null, caseSifflet = null;
  var blocSigne = null, imgSigne = null, dernierSigne = null;

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
        '<div class="itool-time">0:20</div>' +
        '<div class="itool-bar"><i></i></div>' +
        '<p class="itool-status" role="status"></p>' +
        '<div class="itool-sign" hidden>' +
          '<img class="itool-sign-img" width="600" height="750" alt="" loading="lazy" decoding="async" />' +
          '<div class="itool-sign-txt">' +
            '<span class="itool-sign-cap"></span>' +
            '<b class="itool-sign-h"></b>' +
            '<span class="itool-sign-d"></span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="itool-caucus" data-act="caucus"></button>' +
        '<div class="itool-row">' +
          '<label for="itoolDuree"></label>' +
          '<select class="itool-select" id="itoolDuree"></select>' +
        '</div>' +
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
    btnCaucus   = fond.querySelector('[data-act="caucus"]');
    liste       = fond.querySelector("#itoolDuree");
    btnDemarrer = fond.querySelector('[data-act="start"]');
    btnReset    = fond.querySelector('[data-act="reset"]');
    caseSifflet = fond.querySelector("#itoolSifflet");
    blocSigne   = fond.querySelector(".itool-sign");
    imgSigne    = fond.querySelector(".itool-sign-img");

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
      if (act === "caucus")  { choisir(CAUCUS); demarrer(); }
      if (act === "start")   basculer();
      if (act === "reset")   reinitialiser();
      if (act === "whistle") sifflet();
      if (act === "kazoo")   kazoo();
    });
    liste.addEventListener("change", function () {
      var v = parseInt(liste.value, 10);
      if (!isNaN(v)) { choisir(v); }
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
    fond.querySelector('.itool-row > label[for="itoolDuree"]').textContent = t("improToolDuration", "Durée");
    fond.querySelector('[data-act="close"].itool-close').textContent = t("improToolClose", "Fermer");
    fond.querySelector(".itool-check span").textContent = "🔊 " + t("improToolWhistleEnd", "Sifflet à la fin");
    btnCaucus.textContent = "🗣️ " + t("improToolCaucus", "Caucus") + " " + libelleDuree(CAUCUS);
    btnReset.textContent = "↺ " + t("improToolReset", "Réinitialiser");
    fond.querySelector('[data-act="whistle"]').textContent = "📣 " + t("improToolWhistle", "Sifflet");
    fond.querySelector('[data-act="kazoo"]').textContent = "🎺 " + t("improToolKazoo", "Kazoo");
    liste.innerHTML = DUREES.map(function (s) {
      return '<option value="' + s + '">' + libelleDuree(s) + (s === CAUCUS ? " · " + t("improToolCaucus", "Caucus") : "") + "</option>";
    }).join("");
    liste.value = String(etat.duree);
    caseSifflet.checked = !!etat.sifflet;
    dernierSigne = null;                           // les libellés du signe aussi
    rendre();
  }

  /* ─── affichage ────────────────────────────────────────────────────────── */
  function rendre() {
    var reste = etat.enCours ? Math.max(0, (etat.finAt - Date.now()) / 1000) : etat.reste;
    var fini = reste <= 0 && etat.total > 0 && !etat.enCours && etat.reste <= 0;

    if (bouton) {
      var court = etat.enCours || (etat.reste > 0 && etat.reste < etat.total);
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
    rendreSigne(reste);
    btnDemarrer.textContent = etat.enCours
      ? "⏸ " + t("improToolPause", "Pause")
      : (etat.reste > 0 && etat.reste < etat.total
          ? "▶ " + t("improToolResume", "Reprendre")
          : "▶ " + t("improToolStart", "Démarrer"));
  }

  /** Le signe de la main, pendant un décompte seulement. Le visuel n'est
   *  chargé qu'au moment où il s'affiche (loading="lazy" ne suffit pas : on ne
   *  pose le src qu'ici), donc une page qui n'ouvre jamais l'outil ne télécharge
   *  aucune des six images.
   *
   *  Il clignote trois fois à chaque changement : un signe se donne AU moment
   *  où il tombe, une seule fois et franchement — un arbitre qui agite la main
   *  pendant vingt secondes vole la scène aux joueurs. Le reste du temps il
   *  reste affiché, pour qu'un coup d'œil suffise à le retrouver. */
  function rendreSigne(reste) {
    var actif = etat.enCours || (etat.reste > 0 && etat.reste < etat.total);
    var sg = actif ? signe(reste) : null;
    if (!sg) {
      blocSigne.hidden = true;
      dernierSigne = null;
      return;
    }
    var id = sg.cle + "|" + sg.titre;
    if (id !== dernierSigne) {
      dernierSigne = id;
      var src = "/assets/gestes/" + sg.cle + ".jpg?v=" + ART_V;
      if (imgSigne.getAttribute("src") !== src) imgSigne.setAttribute("src", src);
      blocSigne.querySelector(".itool-sign-cap").textContent = t("improToolSignTitle", "Signe à faire");
      blocSigne.querySelector(".itool-sign-h").textContent = sg.titre;
      blocSigne.querySelector(".itool-sign-d").textContent = sg.desc;
      imgSigne.setAttribute("alt", sg.titre + " — " + sg.desc);
      blocSigne.classList.remove("is-new");
      void blocSigne.offsetWidth;                  // relance l'animation
      blocSigne.classList.add("is-new");
    }
    blocSigne.hidden = false;
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

  function choisir(secondes) {
    etat.duree = secondes;
    etat.total = secondes;
    etat.reste = secondes;
    etat.enCours = false;
    etat.finAt = 0;
    relacherEcran();
    if (liste) liste.value = String(secondes);
    ecrireEtat(); rendre();
  }
  function demarrer() {
    debloquerAudio();
    var reste = (etat.reste > 0 && etat.reste <= etat.total) ? etat.reste : etat.total;
    etat.finAt = Date.now() + reste * 1000;
    etat.enCours = true;
    garderEcran();
    battre(); ecrireEtat(); rendre();
  }
  function pause() {
    etat.reste = Math.max(0, (etat.finAt - Date.now()) / 1000);
    etat.enCours = false;
    etat.finAt = 0;
    relacherEcran();
    ecrireEtat(); rendre();
  }
  function basculer() { if (etat.enCours) pause(); else demarrer(); }
  function reinitialiser() {
    etat.enCours = false; etat.finAt = 0;
    etat.total = etat.duree; etat.reste = etat.duree;
    relacherEcran();
    ecrireEtat(); rendre();
  }
  function terminer() {
    etat.enCours = false; etat.finAt = 0; etat.reste = 0;
    relacherEcran();
    ecrireEtat(); rendre();
    if (etat.sifflet) sifflet(0.8);
    try { if (navigator.vibrate) navigator.vibrate([140, 70, 140]); } catch (e) { /* ignore */ }
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
    if (etat.enCours) battre();
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
    demarrer: function (secondes) { if (secondes) choisir(secondes); demarrer(); ouvrir(); }
  };
})();
