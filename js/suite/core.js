/**
 * js/suite/core.js — Impro Suite core engine (no build step, classic script).
 *
 * Standalone foundation shared by every suite section. It deliberately does
 * NOT depend on js/app.js: the draw "policy" (shuffle-bag, per-level pools,
 * 30s duration steps) is re-implemented here as PURE functions reading
 * window.IMPRO_BUNDLE directly, so generating an N-segment setlist can never
 * contaminate app.js's shared `state` singleton.
 *
 * Exposes window.ActoSuite = { locale, setLocale, onLocaleChange, t, tf,
 *   data, levels, formatSec, gen, sessions }.
 */
(function () {
  "use strict";

  var LOCALE_KEY = "impro-studio:locale:v1";   // shared with the rest of the app
  var BUNDLE = window.IMPRO_BUNDLE || { locales: {}, ui: {}, data: {} };
  var SUITE_I18N = window.ACTO_SUITE_I18N || { fr: {} };

  var LEVEL_MAX_DURATION = { debutant: 180, confirme: 300, expert: 480 };
  // Average impro length = the midpoint of each level's 30s duration steps
  // (débutant 30–180 → 105, confirmé 30–300 → 165, expert 30–480 → 255), plus
  // a per-impro overhead (announce + caucus + vote + transitions). Using the
  // true step average keeps the DERIVED impro count consistent with the
  // ESTIMATED total, so a "1 h" match actually generates ≈ 1 h of content.
  var LEVEL_AVG_SEC = { debutant: 105, confirme: 165, expert: 255 };
  var OVERHEAD_SEC = 120;
  var LEVELS = ["debutant", "confirme", "expert"];

  /* ============================================================
     LOCALE + I18N
     ============================================================ */
  function detectLocale() {
    try {
      var stored = localStorage.getItem(LOCALE_KEY);
      if (stored && BUNDLE.locales[stored]) return stored;
    } catch (e) { /* ignore */ }
    var list = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || "fr"];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i] || "").toLowerCase().split(/[-_]/)[0];
      if (code && BUNDLE.locales[code]) return code;
    }
    return "fr";
  }

  var _locale = detectLocale();
  var _localeListeners = [];

  function locale() { return _locale; }
  function setLocale(code) {
    if (!BUNDLE.locales[code] || code === _locale) return;
    // La langue n'est peut-être pas encore dans la page (chargement à la
    // demande, voir locale-loader.js) : on la récupère AVANT de prévenir les
    // écouteurs, sinon l'interface se redessinerait en français.
    var manque = !BUNDLE.data[code] && typeof window.actoLocaleLoad === "function";
    if (manque) {
      window.actoLocaleLoad(code).then(function () { appliqueLocale(code); });
      return;
    }
    appliqueLocale(code);
  }
  function appliqueLocale(code) {
    _locale = code;
    try { localStorage.setItem(LOCALE_KEY, code); } catch (e) { /* ignore */ }
    reconcilierPool();     // les couches admin/perso sont par langue
    for (var i = 0; i < _localeListeners.length; i++) {
      try { _localeListeners[i](code); } catch (e) { /* ignore */ }
    }
  }
  function onLocaleChange(fn) { if (typeof fn === "function") _localeListeners.push(fn); }

  // Lookup order: suite strings (locale) → suite strings (fr) →
  // bundle UI (locale) → bundle UI (fr) → the key itself.
  function t(key) {
    var s = SUITE_I18N[_locale];
    if (s && s[key] != null) return s[key];
    var uiL = BUNDLE.ui[_locale];
    if (uiL && uiL[key] != null) return uiL[key];
    var sFr = SUITE_I18N.fr;
    if (sFr && sFr[key] != null) return sFr[key];
    var uiFr = BUNDLE.ui.fr;
    if (uiFr && uiFr[key] != null) return uiFr[key];
    return key;
  }
  // Template helper: tf("setlistSummary", {n: 8, time: "1 h 30"})
  function tf(key, vars) {
    var str = t(key);
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, name) {
      return (vars[name] != null) ? String(vars[name]) : m;
    });
  }

  function localesMap() { return BUNDLE.locales; }

  /* ============================================================
     DATA ACCESS (current locale)
     ============================================================ */
  /* Le pool réconcilié quand il existe (validé par l'admin, caché, personnalisé
     — voir reconcilierPool), sinon le bundle livré tel quel. */
  function data() {
    return (_fusion && _fusion[_locale]) || BUNDLE.data[_locale] || BUNDLE.data.fr || {};
  }
  function natureLabels() {
    return {
      mixte:    t("natureMixte")    || "Mixte",
      comparee: t("natureComparee") || "Comparée"
    };
  }

  /* ============================================================
     PURE DRAW POLICY — shuffle-bags + duration steps
     (ported from app.js, reading IMPRO_BUNDLE; no shared state)
     ============================================================ */
  var _bags = {};
  function _shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function _fingerprint(pool) {
    if (!pool || !pool.length) return "0";
    var head = pool[0], tail = pool[pool.length - 1];
    var h = (head && typeof head === "object") ? head.name : String(head);
    var tl = (tail && typeof tail === "object") ? tail.name : String(tail);
    return pool.length + ":" + h + "|" + tl;
  }
  // Random-without-replacement per key; auto-reshuffles when empty or when
  // the underlying pool changes (locale/level swap).
  function pickFromBag(key, pool) {
    if (!pool || pool.length === 0) return undefined;
    var fp = _fingerprint(pool);
    var bag = _bags[key];
    if (!bag || bag.fp !== fp || bag.remaining.length === 0) {
      bag = { fp: fp, remaining: _shuffle(pool) };
      _bags[key] = bag;
    }
    return bag.remaining.shift();
  }
  function resetBags() { _bags = {}; }

  function durationSteps(level) {
    var max = LEVEL_MAX_DURATION[level] || 180;
    var out = [];
    for (var s = 30; s <= max; s += 30) out.push(s);
    return out;
  }
  /* Durées PROPOSÉES dans l'éditeur — à ne pas confondre avec durationSteps(),
     qui borne le TIRAGE d'une impro (30 s → 3/5/8 min selon le niveau) et ne
     doit pas bouger : élargie, la génération sortirait des impros d'une heure.
     Un exercice de coaching, lui, dure couramment dix ou vingt minutes ; la
     liste s'arrêtait à trois, la vraie durée était donc insaisissable.
     Le pas se relâche avec la longueur : 30 s tant qu'on est court, la minute
     ensuite, cinq minutes au-delà d'une demi-heure. */
  function durationChoices(kind, level) {
    if (kind !== "training") return durationSteps(level);
    var out = [], s;
    for (s = 30;   s <= 600;  s += 30)  out.push(s);   // 30 s → 10 min
    for (s = 660;  s <= 1800; s += 60)  out.push(s);   // 11 min → 30 min
    for (s = 2100; s <= 5400; s += 300) out.push(s);   // 35 min → 1 h 30
    return out;
  }
  function formatSec(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  // Human-friendly long duration: "1 h 30", "45 min", "2 min 30"
  function formatLong(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + " " + t("unitHour") + (m > 0 ? " " + (m < 10 ? "0" + m : m) : "");
    if (s === 0) return m + " " + t("unitMin");
    return m + " " + t("unitMin") + " " + (s < 10 ? "0" + s : s);
  }

  /* ============================================================
     FIELD DRAWS (one value at a time; used by reroll too)
     ============================================================ */
  function drawCategory(level) {
    var d = data();
    var cats = (d.categories || []);
    var c = pickFromBag("cat", cats);
    return c ? { name: c.name, desc: c.desc || "" } : null;
  }
  function drawTheme(level) {
    var d = data();
    var pool = (d.themes && d.themes[level]) || [];
    return pickFromBag("theme:" + level, pool) || null;
  }
  function drawPlayers(level) {
    var d = data();
    var pool = (d.players && d.players[level]) || [];
    return pickFromBag("players:" + level, pool) || null;
  }
  function drawDurationSec(level) {
    return pickFromBag("duration:" + level, durationSteps(level)) || 90;
  }

  /* ============================================================
     SETLIST GENERATION (Match)
     ============================================================ */
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function deriveNbImpros(totalSec, level) {
    var perImpro = (LEVEL_AVG_SEC[level] || 120) + OVERHEAD_SEC;
    var n = Math.round(totalSec / perImpro);
    return Math.max(1, Math.min(40, n));
  }

  function newSegment(level) {
    return {
      id: uid(),
      type: "impro",
      status: "planned",
      category: null,
      freeCategory: false,
      theme: null,
      nature: "mixte",
      players: null,
      durationSec: drawDurationSec(level),
      starter: null,
      locks: {},          // { category:true, theme:true, ... }
      recordedFiles: []
    };
  }

  // Fill a segment's unlocked fields from fresh draws (type-aware).
  function fillSegment(seg, level) {
    if (seg.type === "warmup") {
      if (!seg.locks.warmup) seg.warmup = drawWarmup();
      if (!seg.locks.duration) seg.durationSec = (seg.warmup && seg.warmup.duration_seconds) || drawDurationSec(level);
      return seg;
    }
    if (seg.type === "exercise") {
      if (!seg.locks.exercise) seg.exercise = drawTrainingExercise(level);
      if (!seg.locks.duration) seg.durationSec = drawDurationSec(level);
      return seg;
    }
    // impro (match / show)
    if (!seg.locks.category) {
      if (seg.freeCategory) seg.category = null;
      else seg.category = drawCategory(level);
    }
    if (!seg.locks.theme) seg.theme = drawTheme(level);
    if (!seg.locks.players) seg.players = drawPlayers(level);
    if (!seg.locks.duration) seg.durationSec = drawDurationSec(level);
    // nature is assigned at the setlist level (count-constrained), not here.
    return seg;
  }

  // Spread N picks across `count` slots as evenly as possible (distinct idx).
  function spreadIndices(count, n) {
    n = Math.max(0, Math.min(count, n));
    if (n === 0) return [];
    if (n === count) {
      var all = [];
      for (var k = 0; k < count; k++) all.push(k);
      return all;
    }
    var idx = [];
    for (var i = 0; i < n; i++) {
      idx.push(Math.round(((i + 0.5) * count) / n) - 0 + 0);
    }
    // clamp + dedupe
    var seen = {}, out = [];
    for (var j = 0; j < idx.length; j++) {
      var v = Math.max(0, Math.min(count - 1, idx[j]));
      while (seen[v]) v = (v + 1) % count;
      seen[v] = true; out.push(v);
    }
    return out;
  }

  // opts: { level, nbImpros, nbCompare, nbCatLibre }
  // returns { setlist, warnings:[{key, vars}] }
  function buildMatchSetlist(opts) {
    resetBags();
    var level = opts.level || "debutant";
    var nbImpros = Math.max(1, Math.min(40, opts.nbImpros | 0));
    var warnings = [];

    var nbCompare = Math.max(0, opts.nbCompare | 0);
    if (nbCompare > nbImpros) {
      warnings.push({ key: "warnCompareClamp", vars: { n: nbCompare, applied: nbImpros } });
      nbCompare = nbImpros;
    }
    var nbCatLibre = Math.max(0, opts.nbCatLibre | 0);
    if (nbCatLibre > nbImpros) {
      warnings.push({ key: "warnCatLibreClamp", vars: { n: nbCatLibre, applied: nbImpros } });
      nbCatLibre = nbImpros;
    }

    var segs = [];
    for (var i = 0; i < nbImpros; i++) segs.push(newSegment(level));

    // Mark which impros are comparée (spread) and which are free-category.
    var compareIdx = spreadIndices(nbImpros, nbCompare);
    for (var c = 0; c < compareIdx.length; c++) segs[compareIdx[c]].nature = "comparee";
    var freeIdx = spreadIndices(nbImpros, nbCatLibre);
    var freeSet = {};
    for (var f = 0; f < freeIdx.length; f++) { freeSet[freeIdx[f]] = true; segs[freeIdx[f]].freeCategory = true; }

    for (var s = 0; s < segs.length; s++) fillSegment(segs[s], level);
    return { setlist: segs, warnings: warnings };
  }

  // Re-roll a single field of one segment (respects freeCategory).
  function rerollField(seg, field, level) {
    switch (field) {
      case "category":
        seg.freeCategory = false;
        seg.category = drawCategory(level);
        break;
      case "theme":    seg.theme = drawTheme(level); break;
      case "players":  seg.players = drawPlayers(level); break;
      case "duration": seg.durationSec = drawDurationSec(level); break;
      case "nature":   seg.nature = (seg.nature === "comparee") ? "mixte" : "comparee"; break;
      case "warmup":
        seg.warmup = drawWarmup();
        if (seg.warmup && seg.warmup.duration_seconds && !seg.locks.duration) seg.durationSec = seg.warmup.duration_seconds;
        break;
      case "exercise": seg.exercise = drawTrainingExercise(level); break;
    }
    return seg;
  }

  function estimateTotalSec(setlist) {
    var sum = 0;
    for (var i = 0; i < setlist.length; i++) sum += (setlist[i].durationSec || 0);
    return sum + setlist.length * OVERHEAD_SEC;
  }

  /* ============================================================
     WARM-UPS (Training section) — lazy-loaded from data/warmups-*.json
     ============================================================ */
  var _warmups = null, _warmupsLoading = null, _warmupsLocale = null;

  /* ── Contenu validé par l'admin (Supabase) ────────────────────────────────
     Deux tables alimentent les listes une fois la validation faite :
       · warmup_exercises → échauffements (ajouts admin + propositions validées)
       · user_submissions → exercices proposés par les utilisateurs
     La page /echauffements et le Match rapide les lisaient déjà. Le Studio, lui,
     ne connaissait que data/warmups-*.json et le bundle : un échauffement ajouté
     dans l'admin n'apparaissait JAMAIS dans la liste d'un coaching. On fusionne
     donc les deux sources, dédoublonnées par nom.
     Les fichiers statiques restent la base : hors ligne, ou si la requête
     échoue, la liste d'origine est là, entière. */
  var DELAI_COMMUNAUTE = 4000;
  var _ecouteContenu = [];

  function sbCore() { return window.actoSuiteSb || null; }
  function cleNom(n) { return String(n == null ? "" : n).trim().toLowerCase(); }
  /* Une requête ne doit jamais retarder un rendu : passé le délai on rend la
     main avec le contenu statique et la fusion servira à la prochaine
     ouverture. Un échec (hors ligne, RLS, table absente) donne une liste vide,
     jamais une erreur. */
  function requeteValidee(p) {
    return Promise.race([
      Promise.resolve(p).then(function (r) { return (r && r.data) || []; }, function () { return []; }),
      new Promise(function (r) { setTimeout(function () { r([]); }, DELAI_COMMUNAUTE); })
    ]);
  }
  function echauffementsValides() {
    var c = sbCore(); if (!c || !c.from) return Promise.resolve([]);
    // Pas de filtre de langue : c'est déjà le choix de la page /echauffements,
    // et l'admin peut saisir un exercice sous une autre langue que la sienne.
    try {
      return requeteValidee(c.from("warmup_exercises")
        .select("id, type, subtype, name, description, duration_seconds, participants, source")
        .eq("status", "approved").limit(2000));
    } catch (e) { return Promise.resolve([]); }
  }
  function propositionsValidees() {
    var c = sbCore(); if (!c || !c.from) return Promise.resolve([]);
    try {
      return requeteValidee(c.from("user_submissions")
        .select("kind, mode, level, text, description")
        .eq("status", "approved").eq("locale", _locale).limit(2000));
    } catch (e) { return Promise.resolve([]); }
  }
  function cachesAdmin() {
    var c = sbCore(); if (!c || !c.from) return Promise.resolve([]);
    // Lisible par les comptes connectés seulement (RLS) : un visiteur anonyme
    // verra donc encore les contenus cachés. C'est déjà le cas du Match rapide.
    try {
      return requeteValidee(c.from("bundled_hidden_items")
        .select("kind, mode, level, text")
        .eq("locale", _locale).limit(2000));
    } catch (e) { return Promise.resolve([]); }
  }

  /* ── Mes propositions pas encore validées ─────────────────────────────────
     Une proposition partait en modération et disparaissait de la vue de son
     auteur jusqu'à ce que l'admin la valide : impossible de s'en resservir le
     soir même. On récupère donc SES propres lignes en attente pour les
     remettre dans ses listes, marquées d'un ✳ (voir pendingTitle) — visibles
     par lui seul, ce que la RLS garantit déjà côté serveur.
     Le jour où l'admin valide, la ligne bascule en « approved » : elle arrive
     alors par la requête ordinaire et le ✳ disparaît de lui-même. */
  function monId() {
    try { return (window.actoUser && window.actoUser.id) || null; } catch (e) { return null; }
  }
  function mesEchauffementsEnAttente() {
    var c = sbCore(), uid = monId();
    if (!c || !c.from || !uid) return Promise.resolve([]);
    // Filtre explicite sur l'auteur : un admin voit TOUTES les lignes en
    // attente (RLS), et marquer celles des autres n'aurait aucun sens ici.
    try {
      return requeteValidee(c.from("warmup_exercises")
        .select("id, type, subtype, name, description, duration_seconds, participants, source")
        .eq("status", "pending").eq("submitted_by", uid).limit(500));
    } catch (e) { return Promise.resolve([]); }
  }
  function mesPropositionsEnAttente() {
    var c = sbCore(), uid = monId();
    if (!c || !c.from || !uid) return Promise.resolve([]);
    try {
      return requeteValidee(c.from("user_submissions")
        .select("kind, mode, level, text, description")
        .eq("status", "pending").eq("user_id", uid).eq("locale", _locale).limit(500));
    } catch (e) { return Promise.resolve([]); }
  }

  /* ── Réconciliation du pool ───────────────────────────────────────────────
     Trois couches s'ajoutent au contenu livré, exactement comme le fait déjà le
     Match rapide (js/app.js) :
       1. les propositions VALIDÉES par l'admin       (user_submissions)
       2. les contenus livrés que l'admin a CACHÉS    (bundled_hidden_items)
       3. les ajouts et masquages PERSONNELS          (« Mes impros », localStorage)
     Le Studio n'en appliquait aucune : un thème validé n'apparaissait jamais
     dans une préparation de match, une catégorie cachée par l'admin y restait
     visible, et un exercice masqué depuis « Mes impros » ressortait quand même.

     On ne touche PAS au bundle : on garde une copie réconciliée par langue.
     app.js, lui, mute window.IMPRO_BUNDLE en place — et les deux scripts
     cohabitent sur quickgame.html. Comme chaque ajout dédoublonne et chaque
     retrait filtre, l'ordre entre les deux n'a aucune importance. */
  var _valides = [];        // user_submissions approuvées
  var _caches  = [];        // bundled_hidden_items
  var _fusion  = {};        // langue -> données réconciliées

  function poolAjout(cible, e) {
    var texte = String(e.text || "").trim();
    if (!texte) return 0;
    var desc = String(e.desc || e.description || "").trim(), arr;
    if (e.kind === "theme") {
      if (!e.level) return 0;
      cible.themes = cible.themes || {};
      arr = cible.themes[e.level] = cible.themes[e.level] || [];
      if (arr.some(function (t) { return cleNom(t) === cleNom(texte); })) return 0;
      arr.push(texte); return 1;
    }
    if (e.kind === "category") {
      cible.categories = cible.categories || [];
      arr = cible.categories;
      if (arr.some(function (c) { return cleNom((c && c.name) || c) === cleNom(texte); })) return 0;
      arr.push({ name: texte, desc: desc, _pending: !!e._pending }); return 1;
    }
    if (e.kind === "constraint") {
      if (!e.mode || !e.level) return 0;
      cible.constraints = cible.constraints || {};
      cible.constraints[e.mode] = cible.constraints[e.mode] || {};
      arr = cible.constraints[e.mode][e.level] = cible.constraints[e.mode][e.level] || [];
      if (arr.some(function (c) { return cleNom(c) === cleNom(texte); })) return 0;
      arr.push(texte); return 1;
    }
    if (e.kind === "exercise") {
      if (!e.mode || !e.level) return 0;
      cible.exercises = cible.exercises || {};
      cible.exercises[e.mode] = cible.exercises[e.mode] || {};
      arr = cible.exercises[e.mode][e.level] = cible.exercises[e.mode][e.level] || [];
      if (arr.some(function (x) { return cleNom(x && x.name) === cleNom(texte); })) return 0;
      arr.push({ name: texte, desc: desc, _pending: !!e._pending }); return 1;
    }
    return 0;
  }

  function poolRetrait(cible, e) {
    var texte = String(e.text || "").trim();
    if (!texte) return 0;
    var arr, avant;
    if (e.kind === "theme") {
      if (!e.level || !cible.themes || !cible.themes[e.level]) return 0;
      avant = cible.themes[e.level].length;
      cible.themes[e.level] = cible.themes[e.level].filter(function (t) { return cleNom(t) !== cleNom(texte); });
      return avant - cible.themes[e.level].length;
    }
    if (e.kind === "category") {
      if (!cible.categories) return 0;
      avant = cible.categories.length;
      cible.categories = cible.categories.filter(function (c) { return cleNom((c && c.name) || c) !== cleNom(texte); });
      return avant - cible.categories.length;
    }
    if (e.kind === "constraint") {
      if (!e.mode || !e.level || !cible.constraints || !cible.constraints[e.mode] || !cible.constraints[e.mode][e.level]) return 0;
      arr = cible.constraints[e.mode][e.level]; avant = arr.length;
      cible.constraints[e.mode][e.level] = arr.filter(function (c) { return cleNom(c) !== cleNom(texte); });
      return avant - cible.constraints[e.mode][e.level].length;
    }
    if (e.kind === "exercise") {
      if (!e.mode || !e.level || !cible.exercises || !cible.exercises[e.mode] || !cible.exercises[e.mode][e.level]) return 0;
      arr = cible.exercises[e.mode][e.level]; avant = arr.length;
      cible.exercises[e.mode][e.level] = arr.filter(function (x) { return cleNom(x && x.name) !== cleNom(texte); });
      return avant - cible.exercises[e.mode][e.level].length;
    }
    return 0;
  }

  // « Mes impros » écrit ces deux listes ; elles valent pour cet appareil.
  function listeLocale(cle) {
    try {
      var raw = localStorage.getItem(cle);
      var l = raw ? JSON.parse(raw) : [];
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }

  function reconcilierPool() {
    var loc = _locale, brut = BUNDLE.data[loc];
    if (!brut) return;
    var ajoutsLocaux = listeLocale("acto-user-added:v1");
    var retraitsLocaux = listeLocale("acto-user-hidden:v1");
    // Rien à appliquer : on rend le bundle tel quel plutôt que d'en recopier
    // 150 Ko pour rien. C'est le cas de la grande majorité des visites.
    if (!_valides.length && !_caches.length && !ajoutsLocaux.length && !retraitsLocaux.length) {
      if (_fusion[loc]) { delete _fusion[loc]; resetBags(); }
      return;
    }
    var cible;
    try { cible = JSON.parse(JSON.stringify(brut)); } catch (e) { return; }
    var n = 0, r = 0;
    function pourCetteLangue(e) { return e && (!e.locale || e.locale === loc); }
    _valides.forEach(function (s) { if (pourCetteLangue(s)) n += poolAjout(cible, s); });
    _caches.forEach(function (h) { if (pourCetteLangue(h)) r += poolRetrait(cible, h); });
    ajoutsLocaux.forEach(function (a) { if (a && a.locale === loc) n += poolAjout(cible, a); });
    retraitsLocaux.forEach(function (h) { if (h && h.locale === loc) r += poolRetrait(cible, h); });
    _fusion[loc] = cible;
    resetBags();      // les pools ont changé : les tirages sans remise en cours sont périmés
    if (n || r) console.log("[suite] pool réconcilié (" + loc + ") : +" + n + " · -" + r);
  }
  /* Prévenu quand du contenu validé vient d'arriver APRÈS un premier rendu :
     l'éditeur se redessine pour que les nouvelles entrées soient dans la liste
     sans avoir à rouvrir la page. */
  function onContentReady(fn) { if (typeof fn === "function") _ecouteContenu.push(fn); }

  function ensureWarmups() {
    if (_warmups && _warmupsLocale === _locale) return Promise.resolve(_warmups);
    if (_warmupsLoading && _warmupsLocale === _locale) return _warmupsLoading;
    _warmupsLocale = _locale;
    var loc = _locale;
    var statique = fetch("./data/warmups-" + loc + ".json")
      .then(function (r) { if (!r.ok) throw new Error("no locale file"); return r.json(); })
      .catch(function () { return fetch("./data/warmups-fr.json").then(function (r) { return r.json(); }); })
      .then(function (j) { return (j && j.exercises) || []; });
    _warmupsLoading = Promise.all([statique, echauffementsValides(), propositionsValidees(), cachesAdmin(),
                                   mesEchauffementsEnAttente(), mesPropositionsEnAttente()])
      .then(function (r) {
        var base = r[0], ajouts = 0, vus = {};
        base.forEach(function (e) { vus[cleNom(e.name)] = true; });
        function ajouteEchauffement(row, attente) {
          var k = cleNom(row.name);
          if (!k || vus[k]) return;
          vus[k] = true; ajouts++;
          base.push({
            id: "db-" + row.id, type: row.type, subtype: row.subtype || "",
            name: row.name, description: row.description,
            duration_seconds: row.duration_seconds || null,
            participants: row.participants || "", source: row.source || "",
            _community: true, _pending: !!attente
          });
        }
        // Les validés d'abord : si l'admin a validé la proposition, c'est la
        // ligne publique qui gagne et le ✳ disparaît tout seul.
        (r[1] || []).forEach(function (row) { ajouteEchauffement(row, false); });
        (r[4] || []).forEach(function (row) { ajouteEchauffement(row, true); });
        _warmups = base;
        // Les propositions validées et les contenus cachés ne concernent pas que
        // les exercices de coaching : thèmes, catégories et contraintes passent
        // par la même réconciliation, qui reconstruit le pool de la langue.
        _valides = (r[2] || []).concat((r[5] || []).map(function (s) {
          return { kind: s.kind, mode: s.mode, level: s.level, text: s.text,
                   description: s.description, locale: _locale, _pending: true };
        }));
        _caches  = r[3] || [];
        ajouts += _valides.length + _caches.length;
        reconcilierPool();
        if (ajouts) {
          for (var i = 0; i < _ecouteContenu.length; i++) {
            try { _ecouteContenu[i](ajouts); } catch (e) { /* un écouteur fautif ne bloque pas les autres */ }
          }
        }
        return _warmups;
      })
      // Échec réseau : on ne retient RIEN, sinon la liste vide restait
      // « chargée » pour toute la session et plus aucun échauffement ne sortait.
      .catch(function () { _warmups = null; _warmupsLoading = null; return []; });
    return _warmupsLoading;
  }
  function drawWarmup() {
    if (!_warmups || !_warmups.length) return null;
    var w = pickFromBag("warmup", _warmups);
    return w ? { name: w.name, desc: w.description || "", duration_seconds: w.duration_seconds || null, wtype: w.type || "" } : null;
  }
  /* Exercices de troupe. Plus de fusion ici : data() rend déjà le pool
     réconcilié (validé + caché + personnel), pour cette liste comme pour les
     thèmes et les catégories. */
  function poolExercices(level) {
    var d = data();
    return (d.exercises && d.exercises.troupe && d.exercises.troupe[level]) || [];
  }
  /* Ajout immédiat d'une proposition qu'on vient d'envoyer : les requêtes ne
     sont rejouées qu'au prochain chargement, or l'auteur doit pouvoir s'en
     servir dans la foulée — c'est tout l'intérêt de proposer depuis l'éditeur. */
  function ajouterEnAttente(type, item) {
    if (!item || !item.name) return false;
    if (type === "warmup") {
      if (!_warmups) return false;
      if (_warmups.some(function (w) { return cleNom(w.name) === cleNom(item.name); })) return false;
      _warmups.push({
        id: "local-" + uid(), type: item.wtype || "Échauffement", subtype: "",
        name: item.name, description: item.desc || "",
        duration_seconds: item.duration_seconds || null,
        participants: "", source: "", _community: true, _pending: true
      });
      resetBags();
      return true;
    }
    _valides.push({ kind: "exercise", mode: "troupe", level: item.level || "debutant",
                    text: item.name, description: item.desc || "", locale: _locale, _pending: true });
    reconcilierPool();
    return true;
  }
  /* Le nom affiché sur une carte vient de la séance enregistrée, pas de la
     liste : c'est le pool qu'il faut interroger pour savoir s'il est encore
     en attente. */
  function estEnAttente(field, nom, level) {
    var k = cleNom(nom);
    if (!k) return false;
    if (field === "warmup") {
      return (_warmups || []).some(function (w) { return cleNom(w.name) === k && w._pending; });
    }
    return poolExercices(level).some(function (e) { return cleNom(e.name) === k && e._pending; });
  }

  function drawTrainingExercise(level) {
    var ex = pickFromBag("trainex:" + level, poolExercices(level));
    return ex ? { name: ex.name, desc: ex.desc || "" } : null;
  }
  /* Listes complètes des menus déroulants de l'éditeur, par ordre alphabétique :
     elles dépassent la centaine d'entrées, dans l'ordre du fichier on cherchait
     à l'œil. Le tri porte sur la copie affichée, jamais sur les pools de tirage,
     qui doivent rester dans leur ordre d'origine. */
  function parNom(a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), _locale || "fr", { sensitivity: "base" });
  }
  function warmupOptions() {
    return (_warmups || []).map(function (w) {
      return { name: w.name, desc: w.description || "", duration_seconds: w.duration_seconds || null, pending: !!w._pending };
    }).sort(parNom);
  }
  function trainingExerciseOptions(level) {
    return poolExercices(level)
      .map(function (e) { return { name: e.name, desc: e.desc || "", pending: !!e._pending }; })
      .sort(parNom);
  }
  /* ============================================================
     SEGMENT BUILDERS + generic title/subtitle (all kinds)
     ============================================================ */
  function newWarmupSegment(level) {
    return { id: uid(), type: "warmup", status: "planned", warmup: null,
      durationSec: drawDurationSec(level), locks: {}, recordedFiles: [] };
  }
  function newExerciseSegment(level) {
    return { id: uid(), type: "exercise", status: "planned", exercise: null,
      durationSec: drawDurationSec(level), locks: {}, recordedFiles: [] };
  }
  // Ad-hoc "add segment" during prepare/live, per kind.
  function newSegmentFor(kind, level) {
    if (kind === "training") return newExerciseSegment(level);
    var seg = newSegment(level);
    if (kind === "show") seg.nature = null;   // shows have no mixte/comparée
    return seg;
  }

  function segTitle(seg) {
    if (!seg) return "";
    if (seg.type === "warmup")   return (seg.warmup && seg.warmup.name) || "";
    if (seg.type === "exercise") return (seg.exercise && seg.exercise.name) || "";
    if (seg.freeCategory) return t("freeCategory");
    return (seg.category && seg.category.name) || "";
  }
  function segSubtitle(seg) {
    if (!seg) return "";
    if (seg.type === "warmup")   return (seg.warmup && seg.warmup.desc) || "";
    if (seg.type === "exercise") return (seg.exercise && seg.exercise.desc) || "";
    return seg.theme || "";
  }

  /* ============================================================
     SETLIST GENERATION (Show + Training)
     ============================================================ */
  // Show: like Match but no nature, no scoring. Supports a free-category count.
  // opts: { level, nbImpros, nbCatLibre } → { setlist, warnings }
  function buildShowSetlist(opts) {
    resetBags();
    var level = opts.level || "debutant";
    var nbImpros = Math.max(1, Math.min(40, opts.nbImpros | 0));
    var warnings = [];
    var nbCatLibre = Math.max(0, opts.nbCatLibre | 0);
    if (nbCatLibre > nbImpros) {
      warnings.push({ key: "warnCatLibreClamp", vars: { n: nbCatLibre, applied: nbImpros } });
      nbCatLibre = nbImpros;
    }
    var segs = [];
    for (var i = 0; i < nbImpros; i++) { var s = newSegment(level); s.nature = null; segs.push(s); }
    var freeIdx = spreadIndices(nbImpros, nbCatLibre);
    for (var f = 0; f < freeIdx.length; f++) segs[freeIdx[f]].freeCategory = true;
    for (var j = 0; j < segs.length; j++) fillSegment(segs[j], level);
    return { setlist: segs, warnings: warnings };
  }
  // Training: N warm-ups then N exercises. REQUIRES ensureWarmups() resolved first.
  // opts: { level, nbWarmups, nbExercises } → { setlist, warnings }
  function buildTrainingSetlist(opts) {
    resetBags();
    var level = opts.level || "debutant";
    var nw = Math.max(0, Math.min(30, opts.nbWarmups | 0));
    var ne = Math.max(0, Math.min(30, opts.nbExercises | 0));
    var segs = [], i;
    for (i = 0; i < nw; i++) { var w = newWarmupSegment(level); fillSegment(w, level); segs.push(w); }
    for (i = 0; i < ne; i++) { var e = newExerciseSegment(level); fillSegment(e, level); segs.push(e); }
    var warnings = [];
    if (opts.targetSec > 0) warnings = fitTrainingDurations(segs, opts.targetSec).warnings;
    return { setlist: segs, warnings: warnings };
  }

  /* Répartit les durées pour occuper TARGET_FILL de la séance. Le reste n'est
     pas du temps perdu : c'est ce qu'on passe à expliquer, débriefer, souffler —
     du temps qui n'apparaît pas dans le déroulé. Une séance calée à 100 %
     déborde toujours.

     Chaque bloc garde son poids relatif (un exercice tiré à 6 min reste plus
     long qu'un tiré à 2 min), arrondi au pas de 30 s, avec un plancher à 60 s.
     Les durées verrouillées (🔒) ne bougent pas : c'est le sens du cadenas. */
  var TARGET_FILL = 0.90;
  var FIT_MIN_SEC = 60;         // en dessous, un exercice n'a pas le temps d'exister
  var FIT_MAX_SEC = 900;        // 15 min : au-delà, mieux vaut ajouter un bloc que l'étirer
  function fitTrainingDurations(setlist, targetSec) {
    var warnings = [];
    if (!setlist || !setlist.length || !(targetSec > 0)) return { warnings: warnings };

    var libres = [], figes = 0, dejaPris = 0;
    setlist.forEach(function (s) {
      if (s.locks && s.locks.duration) { figes++; dejaPris += (s.durationSec || 0); }
      else libres.push(s);
    });
    if (!libres.length) { warnings.push({ key: "trainFitAllLocked", vars: {} }); return { warnings: warnings }; }

    var aRepartir = Math.round(targetSec * TARGET_FILL) - setlist.length * OVERHEAD_SEC - dejaPris;
    var pas = 30;

    // 1) part proportionnelle au tirage initial (un exercice tiré long le reste),
    //    arrondie au pas et bornée.
    var poids = libres.reduce(function (n, s) { return n + (s.durationSec || FIT_MIN_SEC); }, 0) || libres.length;
    libres.forEach(function (s) {
      var v = Math.round((((s.durationSec || FIT_MIN_SEC) / poids) * aRepartir) / pas) * pas;
      s.durationSec = Math.max(FIT_MIN_SEC, Math.min(FIT_MAX_SEC, v));
    });

    // 2) l'arrondi et les bornes laissent un écart : on le distribue par pas de
    //    30 s, au lieu de le faire absorber au dernier bloc — sinon il devenait
    //    deux fois plus long que les autres.
    function somme() { return libres.reduce(function (n, s) { return n + s.durationSec; }, 0); }
    var garde = 400;
    while (somme() < aRepartir && garde-- > 0) {
      var court = null;
      libres.forEach(function (s) { if (s.durationSec < FIT_MAX_SEC && (!court || s.durationSec < court.durationSec)) court = s; });
      if (!court) break;                       // tout est au plafond
      court.durationSec += pas;
    }
    garde = 400;
    while (somme() > aRepartir && garde-- > 0) {
      var long = null;
      libres.forEach(function (s) { if (s.durationSec > FIT_MIN_SEC && (!long || s.durationSec > long.durationSec)) long = s; });
      if (!long) break;                        // tout est au plancher
      long.durationSec -= pas;
    }

    // 3) ce que l'utilisateur doit savoir : la séance ne tient pas, ou elle est
    //    trop vide pour le temps réservé.
    var total = somme() + dejaPris + setlist.length * OVERHEAD_SEC;
    if (total > targetSec) warnings.push({ key: "trainFitTooShort", vars: { n: setlist.length } });
    // On ne peut pas atteindre le taux visé : trop peu de blocs, ou tous au
    // plafond de 15 min. Le dire, sinon la jauge reste basse sans explication.
    else if (total < targetSec * TARGET_FILL * 0.95) warnings.push({ key: "trainFitTooFew", vars: { n: setlist.length } });
    if (figes) warnings.push({ key: "trainFitLocked", vars: { n: figes } });
    return { warnings: warnings };
  }

  /* ============================================================
     SESSIONS STORE (localStorage, local-first)
     ============================================================ */
  var INDEX_KEY = "acto-suite:index:v1";
  function sessionKey(id) { return "acto-suite:session:" + id + ":v1"; }

  /* L'index n'est qu'une table des matières : chaque séance vit pour de bon
     sous acto-suite:session:<id>:v1. Quand il devenait illisible (écriture
     interrompue, quota atteint au mauvais moment, nettoyage par un tiers), on
     renvoyait une liste vide — TOUS les coachings disparaissaient de l'écran
     alors que rien n'était perdu. On le reconstruit à partir des séances
     réellement présentes. */
  function rebuildIndex() {
    var arr = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("acto-suite:session:") !== 0) continue;
        var s = null;
        try { s = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { continue; }
        if (!s || !s.id) continue;
        arr.push({
          id: s.id, kind: s.kind, title: s.title || "",
          matchDate: s.matchDate || "",
          updatedAt: s.updatedAt || s.createdAt || 0,
          nbImpros: (s.setlist || []).length
        });
      }
    } catch (e) { /* stockage inaccessible : on rend ce qu'on a pu lire */ }
    if (arr.length) { writeIndex(arr); console.warn("[sessions] index reconstruit (" + arr.length + " séance(s))"); }
    return arr;
  }

  function readIndex() {
    var raw = null;
    try { raw = localStorage.getItem(INDEX_KEY); } catch (e) { return []; }   // stockage bloqué par le navigateur
    if (!raw) return rebuildIndex();          // absent : compte neuf, ou index effacé alors que les séances sont là
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    } catch (e) { /* illisible : reconstruction ci-dessous */ }
    return rebuildIndex();
  }
  function writeIndex(arr) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(arr)); return true; }
    catch (e) { console.warn("[sessions] index non enregistré", e && e.message); return false; }
  }

  function listSessions(kind) {
    var idx = readIndex().slice().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return kind ? idx.filter(function (e) { return e.kind === kind; }) : idx;
  }
  function getSession(id) {
    try {
      var raw = localStorage.getItem(sessionKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  /* Copie sans les images. Les logos et avatars sont des data-URL recopiées
     dans CHAQUE séance : mesuré ~200 Ko pour deux équipes de douze, soit un
     plafond d'environ 24 séances enregistrées avant de saturer le quota de
     5 Mo. Même arbitrage que slimSnap côté direct — un tableau sans logo vaut
     mieux que pas de tableau du tout : ici, une séance sans photos vaut mieux
     qu'une soirée de préparation perdue. */
  function sansPhotos(session) {
    var c;
    try { c = JSON.parse(JSON.stringify(session)); } catch (e) { return null; }
    (c.teams || []).forEach(function (t) {
      if (!t) return;
      t.logo = null;
      (t.players || []).forEach(function (p) { if (p) p.photo = null; });
    });
    return c;
  }
  var _allege = false;   // la dernière sauvegarde a-t-elle dû abandonner les photos ?

  function saveSession(session) {
    if (!session.id) session.id = uid();
    if (!session.createdAt) session.createdAt = Date.now();
    session.updatedAt = Date.now();
    _allege = false;
    // Quota plein (photos d'équipe en data-URL, vieux navigateur) : l'échec
    // était avalé et l'index mis à jour quand même — une session fantôme dans
    // la liste, et des modifications perdues sans un mot. On renvoie null,
    // l'appelant prévient.
    try { localStorage.setItem(sessionKey(session.id), JSON.stringify(session)); }
    catch (e) {
      // Deuxième chance, sans les images. L'objet en mémoire garde les siennes :
      // l'écran ne change pas, seule la copie sur disque est allégée.
      var court = sansPhotos(session), sauve = false;
      if (court) {
        try { localStorage.setItem(sessionKey(session.id), JSON.stringify(court)); sauve = true; }
        catch (e2) { /* vraiment plein */ }
      }
      if (!sauve) { console.warn("[sessions] stockage impossible", e && e.message); return null; }
      _allege = true;
      console.warn("[sessions] quota atteint : séance enregistrée sans les photos");
    }
    var idx = readIndex();
    var entry = {
      id: session.id, kind: session.kind, title: session.title || "",
      matchDate: session.matchDate || "",
      updatedAt: session.updatedAt,
      nbImpros: (session.setlist || []).length
    };
    var found = false;
    for (var i = 0; i < idx.length; i++) {
      if (idx[i].id === session.id) { idx[i] = entry; found = true; break; }
    }
    if (!found) idx.push(entry);
    // La séance est bien écrite ; si l'index ne l'est pas, elle n'apparaîtrait
    // pas dans « Mes coachings ». On le signale plutôt que de laisser croire.
    if (!writeIndex(idx)) return null;
    return session;
  }
  function removeSession(id) {
    try { localStorage.removeItem(sessionKey(id)); } catch (e) { /* ignore */ }
    writeIndex(readIndex().filter(function (e) { return e.id !== id; }));
  }
  function duplicateSession(id) {
    var src = getSession(id);
    if (!src) return null;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.createdAt = Date.now();
    copy.title = (src.title || "") + " " + t("duplicateSuffix");
    // The duplicate MUST start un-shared — never alias the source's server resource,
    // else edits to the copy would overwrite the original shared_resources row.
    delete copy.collabId; delete copy.collabToken;
      // cloudId (miroir de compte, C6) : MEME piege. Sans ce delete,
      // enregistrer la copie ecraserait le miroir serveur de l'original.
      delete copy.cloudId;
    // fresh ids for segments
    (copy.setlist || []).forEach(function (s) { s.id = uid(); });
    return saveSession(copy);
  }

  /* ---- Default teams (remembered across matches) ---- */
  var TEAMS_KEY = "acto-suite:teams:v1";
  var DEFAULT_TEAM_COLORS = ["#6dd3c5", "#ff6b8a"];
  // Players can be plain name strings (manual entry) or rich objects from a
  // saved team: { name, photo, user_id, present }. Normalize to objects so the
  // live engine + stats can rely on user_id / present uniformly.
  function normPlayer(p) {
    if (p == null) return null;
    if (typeof p === "string") { var nm = p.trim(); return nm ? { name: nm, photo: null, user_id: null, present: true } : null; }
    var name = (p.name || "").trim();
    if (!name && !p.photo && !p.user_id) return null;
    return { name: name, photo: p.photo || null, user_id: p.user_id || null, present: p.present !== false };
  }
  function normPlayers(arr) { return (Array.isArray(arr) ? arr : []).map(normPlayer).filter(Boolean); }
  function playerName(p) { return typeof p === "string" ? p : ((p && p.name) || ""); }
  function playerUserId(p) { return typeof p === "string" ? null : ((p && p.user_id) || null); }
  function playerPresent(p) { return typeof p === "string" ? true : !(p && p.present === false); }
  function blankTeams() {
    return [
      { name: "", color: DEFAULT_TEAM_COLORS[0], logo: null, players: [] },
      { name: "", color: DEFAULT_TEAM_COLORS[1], logo: null, players: [] }
    ];
  }
  function loadDefaultTeams() {
    try {
      var raw = localStorage.getItem(TEAMS_KEY);
      if (raw) {
        var a = JSON.parse(raw);
        if (Array.isArray(a) && a.length === 2) {
          return a.map(function (t, i) {
            return {
              name: t.name || "",
              color: t.color || DEFAULT_TEAM_COLORS[i],
              logo: t.logo || null,
              players: normPlayers(t.players)
            };
          });
        }
      }
    } catch (e) { /* ignore */ }
    return blankTeams();
  }
  // Persist only team IDENTITY (name/color/logo/players), never score/penalties.
  function saveDefaultTeams(teams) {
    try {
      var slim = (teams || []).slice(0, 2).map(function (t, i) {
        return {
          name: t.name || "",
          color: t.color || DEFAULT_TEAM_COLORS[i],
          logo: t.logo || null,
          players: normPlayers(t.players)
        };
      });
      localStorage.setItem(TEAMS_KEY, JSON.stringify(slim));
    } catch (e) { console.warn("[teams] équipes par défaut non enregistrées", e && e.message); }
  }
  // Build a fresh live-team (identity + zeroed score/penalties) from a default.
  function liveTeam(def, i) {
    return {
      name: (def && def.name) || "",
      color: (def && def.color) || DEFAULT_TEAM_COLORS[i],
      logo: (def && def.logo) || null,
      players: normPlayers(def && def.players),
      score: 0,
      penalties: [false, false, false]
    };
  }

  /* ---- Active live match (the one currently being run / crash-recovery) ---- */
  var LIVE_KEY = "acto-suite:live:v1";
  function saveLive(session) {
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
  }
  function loadLive() {
    try { var raw = localStorage.getItem(LIVE_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function clearLive() {
    try { localStorage.removeItem(LIVE_KEY); } catch (e) { /* ignore */ }
  }

  function newMatchSession(opts) {
    opts = opts || {};
    var defs = opts.teams ? opts.teams : loadDefaultTeams();
    return {
      id: uid(),
      kind: "match",
      title: "",
      matchDate: opts.matchDate || "",   // YYYY-MM-DD, set in the prep form
      locale: _locale,
      level: opts.level || "debutant",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scoring: true,
      showScores: true,        // scores visible on the public display board
      filming: false,
      caucusSec: 30,           // caucus timer default (referee-configurable)
      voteSec: 20,             // audience-vote timer default
      stars: { or: null, argent: null, bronze: null },  // {team,name} per medal
      display: { cointoss: "ask" },  // 'ask' | 'app' | 'screen'
      teams: [liveTeam(defs[0], 0), liveTeam(defs[1], 1)],
      meta: { totalSec: opts.totalSec || 0, nbCompare: opts.nbCompare || 0, nbCatLibre: opts.nbCatLibre || 0 },
      setlist: [],
      cursor: 0,
      journal: []
    };
  }

  // Show + Training sessions: no teams, no scoring (Spectacle has no points;
  // Training is coach-facing). Same Session shape so the live engine reuses it.
  function newShowSession(opts) {
    opts = opts || {};
    return {
      id: uid(), kind: "show", title: "", matchDate: opts.matchDate || "", locale: _locale,
      level: opts.level || "debutant",
      createdAt: Date.now(), updatedAt: Date.now(),
      scoring: false, showScores: false, filming: false,
      caucusSec: 30, voteSec: 0,                  // a show has no audience vote
      display: { cointoss: "ask" }, teams: [],
      meta: { totalSec: opts.totalSec || 0, nbCatLibre: opts.nbCatLibre || 0 },
      setlist: [], cursor: 0, journal: []
    };
  }
  function newTrainingSession(opts) {
    opts = opts || {};
    return {
      id: uid(), kind: "training", title: "", locale: _locale,
      level: opts.level || "debutant",
      createdAt: Date.now(), updatedAt: Date.now(),
      scoring: false, showScores: false, filming: false,
      display: { cointoss: "ask" }, teams: [],
      meta: { nbWarmups: opts.nbWarmups || 0, nbExercises: opts.nbExercises || 0 },
      targetSec: opts.targetSec || 0,        // 0 = temps non défini
      participants: [],                      // feuille de présence de la séance

      setlist: [], cursor: 0, journal: []
    };
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  /* Nom accessible des dialogues. Chaque module crée ses <dialog> avec un
     <h2 class="suite-dialog-title"> mais sans aria-labelledby : un lecteur
     d'écran annonçait « dialogue », sans titre. Un seul observateur ici plutôt
     qu'une retouche dans les quatorze sites de création — et il couvre les
     dialogues à venir. */
  (function nameDialogs() {
    if (typeof MutationObserver !== "function" || !document.body) return;
    var n = 0;
    function name(dlg) {
      if (!dlg || dlg.getAttribute("aria-labelledby") || dlg.getAttribute("aria-label")) return;
      var h = dlg.querySelector("h1, h2, h3, .suite-dialog-title");
      if (!h) return;
      if (!h.id) h.id = "suite-dlg-title-" + (++n);
      dlg.setAttribute("aria-labelledby", h.id);
    }
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes, function (node) {
          if (node.nodeType !== 1) return;
          if (node.tagName === "DIALOG") name(node);
          else if (node.closest && node.closest("dialog")) name(node.closest("dialog"));   // contenu injecté après l'ajout
          else if (node.querySelectorAll) [].forEach.call(node.querySelectorAll("dialog"), name);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
    [].forEach.call(document.querySelectorAll("dialog"), name);
  })();

  /* Les ajouts et masquages personnels (« Mes impros ») sont dans
     localStorage : rien à attendre du réseau, on les applique tout de
     suite. Les couches serveur viendront s'y ajouter à l'arrivée des
     requêtes (voir ensureWarmups). */
  reconcilierPool();
  /* Pour un non-francophone, les données de sa langue arrivent APRÈS ce point
     (locale-loader.js les charge à la demande) : la réconciliation ci-dessus
     n''a alors rien trouvé à recopier. On la rejoue à leur arrivée. */
  try {
    window.addEventListener("acto:locale-ready", function () { reconcilierPool(); });
  } catch (e) { /* ignore */ }

  window.ActoSuite = {
    // locale + i18n
    locale: locale,
    setLocale: setLocale,
    onLocaleChange: onLocaleChange,
    locales: localesMap,
    t: t,
    tf: tf,
    // data
    data: data,
    levels: LEVELS.slice(),
    natureLabels: natureLabels,
    // formatting
    formatSec: formatSec,
    formatLong: formatLong,
    // generator
    gen: {
      deriveNbImpros: deriveNbImpros,
      buildMatchSetlist: buildMatchSetlist,
      buildShowSetlist: buildShowSetlist,
      buildTrainingSetlist: buildTrainingSetlist,
      newSegment: newSegment,
      newSegmentFor: newSegmentFor,
      newWarmupSegment: newWarmupSegment,
      newExerciseSegment: newExerciseSegment,
      fillSegment: fillSegment,
      rerollField: rerollField,
      estimateTotalSec: estimateTotalSec,
      OVERHEAD_SEC: OVERHEAD_SEC,
      fitTrainingDurations: fitTrainingDurations,
      TARGET_FILL: TARGET_FILL,
      drawCategory: drawCategory,
      drawTheme: drawTheme,
      drawPlayers: drawPlayers,
      drawDurationSec: drawDurationSec,
      drawWarmup: drawWarmup,
      drawTrainingExercise: drawTrainingExercise,
      warmupOptions: warmupOptions,
      trainingExerciseOptions: trainingExerciseOptions,
      ensureWarmups: ensureWarmups,
      onContentReady: onContentReady,
      segTitle: segTitle,
      segSubtitle: segSubtitle,
      durationSteps: durationSteps,
      durationChoices: durationChoices,
      ajouterEnAttente: ajouterEnAttente,
      estEnAttente: estEnAttente,
      uid: uid
    },
    // sessions
    sessions: {
      list: listSessions,
      get: getSession,
      save: saveSession,
      remove: removeSession,
      duplicate: duplicateSession,
      newMatch: newMatchSession,
      newShow: newShowSession,
      newTraining: newTrainingSession,
      loadDefaultTeams: loadDefaultTeams,
      saveDefaultTeams: saveDefaultTeams,
      // vrai quand la dernière save() a dû sacrifier les photos faute de place
      lastStripped: function () { return _allege; }
    },
    // player helpers (players may be strings or {name,photo,user_id,present})
    players: {
      norm: normPlayer,
      normAll: normPlayers,
      name: playerName,
      userId: playerUserId,
      present: playerPresent
    },
    // active live match
    live: {
      save: saveLive,
      load: loadLive,
      clear: clearLive
    }
  };
})();
