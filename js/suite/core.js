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
    _locale = code;
    try { localStorage.setItem(LOCALE_KEY, code); } catch (e) { /* ignore */ }
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
  function data() {
    return BUNDLE.data[_locale] || BUNDLE.data.fr || {};
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
  function ensureWarmups() {
    if (_warmups && _warmupsLocale === _locale) return Promise.resolve(_warmups);
    if (_warmupsLoading && _warmupsLocale === _locale) return _warmupsLoading;
    _warmupsLocale = _locale;
    var loc = _locale;
    _warmupsLoading = fetch("./data/warmups-" + loc + ".json")
      .then(function (r) { if (!r.ok) throw new Error("no locale file"); return r.json(); })
      .catch(function () { return fetch("./data/warmups-fr.json").then(function (r) { return r.json(); }); })
      .then(function (j) { _warmups = (j && j.exercises) || []; return _warmups; })
      .catch(function () { _warmups = []; return _warmups; });
    return _warmupsLoading;
  }
  function drawWarmup() {
    if (!_warmups || !_warmups.length) return null;
    var w = pickFromBag("warmup", _warmups);
    return w ? { name: w.name, desc: w.description || "", duration_seconds: w.duration_seconds || null, wtype: w.type || "" } : null;
  }
  function drawTrainingExercise(level) {
    var d = data();
    var pool = (d.exercises && d.exercises.troupe && d.exercises.troupe[level]) || [];
    var ex = pickFromBag("trainex:" + level, pool);
    return ex ? { name: ex.name, desc: ex.desc || "" } : null;
  }
  // Full option lists for the inline editor selects.
  function warmupOptions() {
    return (_warmups || []).map(function (w) {
      return { name: w.name, desc: w.description || "", duration_seconds: w.duration_seconds || null };
    });
  }
  function trainingExerciseOptions(level) {
    var d = data();
    return ((d.exercises && d.exercises.troupe && d.exercises.troupe[level]) || [])
      .map(function (e) { return { name: e.name, desc: e.desc || "" }; });
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
    return { setlist: segs, warnings: [] };
  }

  /* ============================================================
     SESSIONS STORE (localStorage, local-first)
     ============================================================ */
  var INDEX_KEY = "acto-suite:index:v1";
  function sessionKey(id) { return "acto-suite:session:" + id + ":v1"; }

  function readIndex() {
    try {
      var raw = localStorage.getItem(INDEX_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeIndex(arr) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(arr)); } catch (e) { /* ignore */ }
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
  function saveSession(session) {
    if (!session.id) session.id = uid();
    if (!session.createdAt) session.createdAt = Date.now();
    session.updatedAt = Date.now();
    try { localStorage.setItem(sessionKey(session.id), JSON.stringify(session)); }
    catch (e) { /* ignore */ }
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
    writeIndex(idx);
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
    copy.title = (src.title || "") + " (copie)";
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
    } catch (e) { /* ignore */ }
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
    var defs = (opts && opts.teams) ? opts.teams : loadDefaultTeams();
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
      drawCategory: drawCategory,
      drawTheme: drawTheme,
      drawPlayers: drawPlayers,
      drawDurationSec: drawDurationSec,
      drawWarmup: drawWarmup,
      drawTrainingExercise: drawTrainingExercise,
      warmupOptions: warmupOptions,
      trainingExerciseOptions: trainingExerciseOptions,
      ensureWarmups: ensureWarmups,
      segTitle: segTitle,
      segSubtitle: segSubtitle,
      durationSteps: durationSteps,
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
      saveDefaultTeams: saveDefaultTeams
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
