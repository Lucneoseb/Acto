/**
 * app.js — Single classic-script bundle (works on file:// and HTTP)
 *
 * Reads data from `window.IMPRO_BUNDLE` (loaded via data/all.js).
 * Internal organization mirrors the ES-module version but stays as
 * one IIFE so it loads without a server.
 *
 * The settings panel still allows editing all the lists; edits are
 * persisted in localStorage. The canonical content lives in
 * data/*.json — to refresh data/all.js after edits, run:
 *     node build-data.js
 */
(function () {
  "use strict";

  /* ============================================================
     STATS TRACKING (Supabase RPC bump_stats)
     ============================================================ */
  const stats = {
    pending: {
      delta_generated: 0,
      delta_played: 0,
      delta_impro_seconds: 0,
      delta_records: 0,
      delta_record_seconds: 0
    },
    improStartedAt: 0,        // ms timestamp when chrono was last (re)started
    improPlayedThisRound: false, // true once chrono.start was called for current impro
    recordStartedAt: 0,       // ms timestamp when MediaRecorder started
    flushTimer: null
  };
  function statsHasUser() {
    return !!(window.actoSupabase && window.actoAuth && window.actoAuth.state && window.actoAuth.state.user);
  }
  function statsAnyPending() {
    const p = stats.pending;
    return p.delta_generated || p.delta_played || p.delta_impro_seconds || p.delta_records || p.delta_record_seconds;
  }
  async function statsFlush() {
    if (!statsHasUser() || !statsAnyPending()) return;
    const snapshot = Object.assign({}, stats.pending);
    stats.pending = {
      delta_generated: 0,
      delta_played: 0,
      delta_impro_seconds: 0,
      delta_records: 0,
      delta_record_seconds: 0
    };
    try {
      await window.actoSupabase.rpc("bump_stats", snapshot);
    } catch (e) {
      // Restore on error
      console.warn("stats flush failed", e);
      Object.keys(snapshot).forEach(k => stats.pending[k] += snapshot[k]);
    }
  }
  function statsImproStartTracking() {
    if (!stats.improStartedAt) {
      stats.improStartedAt = Date.now();
      if (!stats.improPlayedThisRound) {
        stats.improPlayedThisRound = true;
        stats.pending.delta_played++;
        // Log a new event row for this impro
        improEventLogStart();
      }
    }
  }
  function statsImproStopTracking() {
    if (stats.improStartedAt) {
      const elapsed = Math.floor((Date.now() - stats.improStartedAt) / 1000);
      if (elapsed > 0) {
        stats.pending.delta_impro_seconds += elapsed;
        improEvent.pendingSecondsToCommit += elapsed;
        improEventCommitPlayed();   // fire-and-forget
      }
      stats.improStartedAt = 0;
    }
  }
  function statsImproNew() {
    statsImproStopTracking();   // commit any time on the previous impro
    improEventReset();
    stats.improPlayedThisRound = false;
    stats.pending.delta_generated++;
  }
  function statsRecordStartTracking() {
    if (!stats.recordStartedAt) stats.recordStartedAt = Date.now();
    // Mark current impro event as "was_recorded" (logs event first if needed)
    if (!improEvent.id) improEventLogStart();
    setTimeout(improEventMarkRecorded, 200); // tiny delay in case logStart is in-flight
  }
  function statsRecordStopTracking() {
    if (stats.recordStartedAt) {
      const elapsed = Math.floor((Date.now() - stats.recordStartedAt) / 1000);
      if (elapsed > 0) stats.pending.delta_record_seconds += elapsed;
      stats.recordStartedAt = 0;
    }
  }
  function statsRecordFinalized() {
    statsRecordStopTracking();
    stats.pending.delta_records++;
  }
  // Periodic flush + flush on page hide / unload
  stats.flushTimer = setInterval(statsFlush, 30000);
  window.addEventListener("beforeunload", () => {
    statsImproStopTracking();
    statsRecordStopTracking();
    statsFlush();
  });
  window.addEventListener("pagehide", () => {
    statsImproStopTracking();
    statsRecordStopTracking();
    statsFlush();
  });
  window.actoStats = { flush: statsFlush };

  /* ============================================================
     IMPRO EVENT TRACKING (impro_events table)
     ============================================================ */
  const improEvent = {
    id: null,                  // uuid of current event row, once logged
    pendingSecondsToCommit: 0, // played seconds not yet sent to server
    wasRecordedSent: false     // flag so we only set was_recorded once
  };
  function improEventReset() {
    improEvent.id = null;
    improEvent.pendingSecondsToCommit = 0;
    improEvent.wasRecordedSent = false;
  }
  async function improEventLogStart() {
    if (improEvent.id) return; // already logged for this impro
    if (!window.actoSupabase || !window.actoAuth || !window.actoAuth.state || !window.actoAuth.state.user) return;
    const ex = state.currentExercise || {};
    try {
      // In Match mode the official announcement has no separate "constraint"
      // (the Catégorie IS the style constraint). We repurpose the constraint
      // column to log the Nature (Mixte / Comparée) so the admin can still
      // filter / aggregate the meaningful match metadata.
      const constraintForLog = state.mode === "match"
        ? (state.currentNature || "")
        : (state.currentConstraint || "");
      const { data, error } = await window.actoSupabase.rpc("log_impro_event", {
        p_mode: state.mode,
        p_level: state.level,
        p_exercise: ex.name || "",
        p_constraint: constraintForLog,
        p_theme: state.currentTheme || "",
        p_duration_planned: state.currentDurationSec || state.chronoTotal || 0
      });
      if (!error) improEvent.id = data;
    } catch (e) {
      console.warn("log_impro_event failed", e);
    }
    // Once the event row exists, attach the configured roster(s) so the
    // participants show up in their own analytics. Fire-and-forget — failures
    // here must never block the impro flow.
    // Match mode: combine rosterA + rosterB. Troupe: state.roster.
    const combinedRoster = state.mode === "match"
      ? [...(state.rosterA || []), ...(state.rosterB || [])]
      : (state.roster || []);
    if (improEvent.id && combinedRoster.length > 0) {
      try {
        await window.actoSupabase.rpc("add_impro_participants", {
          p_event_id: improEvent.id,
          p_participants: combinedRoster.map(p => ({
            user_id: p.user_id || "",
            nom_scene: p.nom_scene || ""
          }))
        });
      } catch (e) { console.warn("add_impro_participants failed", e); }
    }
  }
  async function improEventCommitPlayed() {
    if (!improEvent.id || !window.actoSupabase) return;
    const sec = improEvent.pendingSecondsToCommit;
    if (sec <= 0) return;
    improEvent.pendingSecondsToCommit = 0;
    try {
      await window.actoSupabase.rpc("update_impro_event", {
        p_event_id: improEvent.id,
        p_add_played_seconds: sec,
        p_set_was_recorded: null
      });
    } catch (e) {
      console.warn("update_impro_event (played) failed", e);
      improEvent.pendingSecondsToCommit += sec;
    }
  }
  async function improEventMarkRecorded() {
    if (!improEvent.id || improEvent.wasRecordedSent || !window.actoSupabase) return;
    improEvent.wasRecordedSent = true;
    try {
      await window.actoSupabase.rpc("update_impro_event", {
        p_event_id: improEvent.id,
        p_add_played_seconds: 0,
        p_set_was_recorded: true
      });
    } catch (e) {
      console.warn("update_impro_event (recorded) failed", e);
      improEvent.wasRecordedSent = false;
    }
  }

  /* ============================================================
     0. CONSTANTS
     ============================================================ */
  const STORAGE_KEY = "impro-studio:overrides:v1";
  const LOCALE_KEY  = "impro-studio:locale:v1";
  // Three roster slots: troupe (one team) + match (Team A and Team B).
  // Match mode uses A/B; troupe mode uses the legacy single roster.
  const ROSTER_KEYS = {
    troupe: "impro-studio:roster:v1",
    a:      "impro-studio:rosterA:v1",
    b:      "impro-studio:rosterB:v1"
  };
  const ITEM_HEIGHT_REM = 4.5;
  const SPARKLES = ["✨", "⭐", "🎭", "💫", "🌟"];

  /* ============================================================
     1. DATA STORE
     ============================================================ */
  function createStore() {
    const bundle = window.IMPRO_BUNDLE || { locales: {}, ui: {}, data: {} };

    // Pick the active locale in this priority:
    //   1. user's explicit choice from a previous visit (localStorage)
    //   2. browser/device preferred language(s) (navigator.languages)
    //   3. French (the original default)
    function detectBrowserLocale() {
      const list = (navigator.languages && navigator.languages.length)
        ? navigator.languages
        : [navigator.language || "fr"];
      for (const raw of list) {
        const code = String(raw || "").toLowerCase().split(/[-_]/)[0];
        if (code && bundle.locales[code]) return code;
      }
      return "fr";
    }
    let locale = localStorage.getItem(LOCALE_KEY);
    if (!locale || !bundle.locales[locale]) {
      locale = detectBrowserLocale();
    }

    let overrides = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) overrides = JSON.parse(raw);
    } catch (e) { /* ignore */ }

    const target = new EventTarget();

    function persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
    function emit() { target.dispatchEvent(new CustomEvent("change")); }

    function deepMerge(dst, src) {
      if (!src || typeof src !== "object") return dst;
      for (const k of Object.keys(src)) {
        const v = src[k];
        if (Array.isArray(v))                 dst[k] = v.slice();
        else if (v && typeof v === "object")  dst[k] = deepMerge(dst[k] ?? {}, v);
        else                                  dst[k] = v;
      }
      return dst;
    }

    function getData() {
      const base = bundle.data[locale] ?? {};
      const over = overrides[locale];
      if (!over) return base;
      return deepMerge(structuredClone(base), over);
    }

    function getUi() { return bundle.ui[locale] ?? bundle.ui.fr ?? {}; }

    function setLocale(code) {
      if (!bundle.locales[code]) return;
      locale = code;
      localStorage.setItem(LOCALE_KEY, code);
      emit();
    }

    function setLocaleData(next) {
      overrides[locale] = next;
      persist(); emit();
    }
    function resetLocale() {
      delete overrides[locale];
      persist(); emit();
    }
    function exportLocale() {
      return JSON.stringify(getData(), null, 2);
    }
    function importLocale(text) {
      const parsed = JSON.parse(text);
      validate(parsed);
      setLocaleData(parsed);
    }

    function validate(d) {
      const need = ["exercises", "constraints", "themes", "categories", "durations", "players"];
      for (const k of need) if (!(k in d)) throw new Error(`Clé manquante : ${k}`);
      for (const m of ["troupe", "match"]) if (!d.exercises[m]) throw new Error(`Manque exercises.${m}`);
    }

    return {
      get locale()  { return locale; },
      get locales() { return bundle.locales; },
      get ui()      { return getUi(); },
      get data()    { return getData(); },
      setLocale, setLocaleData, resetLocale, exportLocale, importLocale,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target)
    };
  }

  const store = createStore();

  /* ============================================================
     2. SLOT-MACHINE ANIMATION
     ============================================================ */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function spinReel({ reelEl, trackEl, cardEl, metaEl, items, meta = "", delay = 0 }) {
    return new Promise((resolve) => {
      trackEl.innerHTML = items
        .map((it, i) => `<div class="reel-item${i === items.length - 1 ? " final" : ""}">${escapeHtml(it)}</div>`)
        .join("");
      reelEl.classList.remove("settled");
      setTimeout(() => {
        reelEl.classList.add("spinning");
        trackEl.style.transition = "none";
        trackEl.style.transform = "translateY(0)";
        const px = ITEM_HEIGHT_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
        const total = (items.length - 1) * px;
        const spinMs = 550 + Math.random() * 150;
        setTimeout(() => {
          reelEl.classList.remove("spinning");
          const settleMs = 900 + Math.random() * 300;
          trackEl.style.transition = `transform ${settleMs}ms cubic-bezier(.15,.85,.25,1)`;
          // force reflow
          // eslint-disable-next-line no-unused-expressions
          trackEl.offsetHeight;
          trackEl.style.transform = `translateY(-${total}px)`;
          setTimeout(() => {
            reelEl.classList.add("settled");
            cardEl.classList.add("revealed");
            if (metaEl) metaEl.textContent = meta || "";
            burst(cardEl);
            resolve();
          }, settleMs + 30);
        }, spinMs);
      }, delay);
    });
  }

  function burst(cardEl) {
    const rect = cardEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("span");
      s.className = "sparkle";
      s.textContent = SPARKLES[Math.floor(Math.random() * SPARKLES.length)];
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
      const dist = 50 + Math.random() * 50;
      s.style.left = `${cx}px`;
      s.style.top  = `${cy}px`;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      cardEl.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    }
  }

  function buildSpinPool(pool, finalValue) {
    const arr = pool.filter((p) => p !== finalValue);
    const distractors = sample(arr, Math.min(8, arr.length));
    while (distractors.length < 6) distractors.push(pool[Math.floor(Math.random() * pool.length)]);
    return [...distractors, finalValue];
  }
  function sample(arr, n) {
    const c = arr.slice(), out = [];
    for (let i = 0; i < n && c.length; i++)
      out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
    return out;
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /**
   * Shuffle bags — random without replacement, by category.
   *
   * Each call to `pickFromBag(key, pool)` returns an item that hasn't been
   * picked since the bag was last refilled. When the bag empties, it is
   * automatically reshuffled from the full pool. If the underlying pool
   * changes (e.g. user switches level / mode / locale), the bag is reset.
   *
   * The bag is keyed per (target × mode × level × pool-size × pool-shape) so
   * concurrent contexts don't fight each other.
   */
  const _bags = {};
  function _shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function _poolFingerprint(pool) {
    // Cheap signature: length + a few sample values. Catches level/mode swaps.
    if (!pool || !pool.length) return "0";
    const head = pool[0];
    const tail = pool[pool.length - 1];
    const sample = (typeof head === "object") ? (head && head.name) : String(head);
    const sampleT = (typeof tail === "object") ? (tail && tail.name) : String(tail);
    return pool.length + ":" + sample + "|" + sampleT;
  }
  function pickFromBag(key, pool) {
    if (!pool || pool.length === 0) return undefined;
    const fp = _poolFingerprint(pool);
    let bag = _bags[key];
    if (!bag || bag.fp !== fp || bag.remaining.length === 0) {
      bag = { fp, remaining: _shuffleArray(pool) };
      _bags[key] = bag;
    }
    return bag.remaining.shift();
  }

  /* ============================================================
     3. UI BINDINGS
     ============================================================ */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    mode:  "troupe",
    level: "debutant",
    customThemes: [],
    useCustom: false,
    isGenerating: false,
    // Duration picker
    durationRandom: true,
    durationManualSec: 90,
    // Current generated values
    currentExercise: null,
    currentConstraint: "",
    currentTheme: "",
    currentDurationSec: 0,
    // Chrono
    chronoRunning: false,
    chronoRemaining: 0,
    chronoTotal: 0,
    chronoInterval: null,
    chronoLastBeepAt: -1,
    // Audience
    audienceEnabled: false,
    audienceIntervalSec: 45,
    audienceTimer: null,
    // Rosters — arrays of { user_id?: uuid, nom_scene: string }
    //   roster   = Troupe mode (single composition)
    //   rosterA  = Match mode Team A
    //   rosterB  = Match mode Team B
    roster:  loadRosterFromStorage("troupe"),
    rosterA: loadRosterFromStorage("a"),
    rosterB: loadRosterFromStorage("b"),
    // Match Comparée only:
    //   firstStarter — random "a" | "b" picked at impro generation
    //                  to tell the troupes which team chooses first
    //                  (play or pass).
    //   currentRecordingTeam — which team is in the camera RIGHT NOW;
    //                  used for the indicator + filename.
    //   recordedTeamsSet — Set of teams already finalized for the
    //                  current impro_event ("a", "b"); drives the
    //                  "Record the other team" CTA.
    firstStarter: null,
    currentRecordingTeam: null,
    recordedTeamsSet: new Set()
  };

  function loadRosterFromStorage(target) {
    try {
      const raw = localStorage.getItem(ROSTER_KEYS[target]);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  /* Team names (Match mode A / B) are persisted independently of the
     roster lists: the user can rename the teams without touching the
     player lineup. Stored as plain strings under TEAM_NAME_KEYS. */
  const TEAM_NAME_KEYS = {
    a:      "acto-team-name-a",
    b:      "acto-team-name-b",
    troupe: "acto-team-name-troupe"
  };
  function loadTeamNameFromStorage(side) {
    try {
      const raw = localStorage.getItem(TEAM_NAME_KEYS[side]);
      return (raw == null) ? "" : String(raw);
    } catch (e) { return ""; }
  }
  function persistTeamName(side, value) {
    try {
      const v = String(value == null ? "" : value);
      if (v) localStorage.setItem(TEAM_NAME_KEYS[side], v);
      else   localStorage.removeItem(TEAM_NAME_KEYS[side]);
    } catch (e) { /* ignore */ }
  }

  /* ----------------------------------------------------------------
     Persist the most-recently generated impro across reloads.
     The user expects the cards (Theme / Constraint / Exercise / etc.)
     to still show their last picked values after a refresh or after
     coming back from another app. We save the in-memory state.current*
     to localStorage on every change, and replay it on boot.
     ---------------------------------------------------------------- */
  const LAST_IMPRO_KEY = "acto-last-impro:v1";

  function saveLastImpro() {
    try {
      // Skip if nothing meaningful has been picked yet (avoids overwriting
      // a real saved impro with a blank state on first paint).
      const hasContent =
        state.currentTheme ||
        state.currentConstraint ||
        (state.currentExercise && state.currentExercise.name) ||
        (state.currentCategory && state.currentCategory.name) ||
        state.currentNature ||
        state.currentPlayers != null ||
        state.currentDurationSec;
      if (!hasContent) return;
      const payload = {
        mode:               state.mode,
        level:              state.level,
        currentExercise:    state.currentExercise || null,
        currentConstraint:  state.currentConstraint || "",
        currentTheme:       state.currentTheme || "",
        currentCategory:    state.currentCategory || null,
        currentNature:      state.currentNature || "",
        currentPlayers:     state.currentPlayers != null ? state.currentPlayers : null,
        currentDurationSec: state.currentDurationSec || 0,
        ts:                 Date.now()
      };
      localStorage.setItem(LAST_IMPRO_KEY, JSON.stringify(payload));
    } catch (e) { /* localStorage may be full or disabled; ignore */ }
  }

  function loadLastImpro() {
    try {
      const raw = localStorage.getItem(LAST_IMPRO_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      return data;
    } catch (e) { return null; }
  }

  /**
   * Replay a saved impro on top of the current DOM:
   *   - restore mode + level (so card layout matches),
   *   - restore state.current* values,
   *   - paint each card's reel as a single settled item,
   *   - paint exercise/category descriptions,
   *   - show the chrono section pre-loaded with the saved duration,
   *   - refresh the Match-mode nature banner + audience card.
   * Called once from boot() — silently no-ops if there's nothing to replay.
   */
  function restoreLastImpro() {
    const saved = loadLastImpro();
    if (!saved) return;

    // Mode + level — driving the card layout class on body and the duration slider.
    if (saved.mode  === "troupe" || saved.mode  === "match")    setMode(saved.mode);
    if (saved.level === "debutant" || saved.level === "confirme" || saved.level === "expert") setLevel(saved.level);

    // Push values back into state so further reroll/edit/Generate logic
    // sees the same context as before the reload.
    state.currentExercise    = saved.currentExercise || null;
    state.currentConstraint  = saved.currentConstraint || "";
    state.currentTheme       = saved.currentTheme || "";
    state.currentCategory    = saved.currentCategory || null;
    state.currentNature      = saved.currentNature || "";
    state.currentPlayers     = saved.currentPlayers != null ? saved.currentPlayers : null;
    state.currentDurationSec = saved.currentDurationSec || 0;

    // Helper: paint a reel without animating — single .final item.
    function paintReel(target, value) {
      const text = String(value == null ? "" : value);
      if (!text) return;
      const reelEl  = $(`.reel[data-target="${target}"]`);
      const trackEl = $(`#reel-${target}`);
      const cardEl  = $(`#card-${target}`);
      if (trackEl) {
        trackEl.style.transition = "none";
        trackEl.style.transform  = "translateY(0)";
        trackEl.innerHTML = `<div class="reel-item final">${escapeHtml(text)}</div>`;
      }
      if (reelEl) reelEl.classList.add("settled");
      if (cardEl) cardEl.classList.add("revealed");
    }

    // Paint cards based on which mode we're in. (Visible cards differ —
    // CSS hides the irrelevant ones for the active mode.)
    paintReel("theme",      state.currentTheme);
    paintReel("constraint", state.currentConstraint);
    paintReel("exercise",   state.currentExercise && state.currentExercise.name);
    paintReel("category",   state.currentCategory && state.currentCategory.name);
    paintReel("players",    state.currentPlayers);

    // Meta lines under exercise / category cards (descriptions).
    const exDesc = (state.currentExercise && state.currentExercise.desc) || "";
    const exMeta = $("#meta-exercise");
    if (exMeta) exMeta.textContent = exDesc;
    const catDesc = (state.currentCategory && state.currentCategory.desc) || "";
    const catMeta = $("#meta-category");
    if (catMeta) catMeta.textContent = catDesc;

    // Match-mode banner.
    if (state.mode === "match" && typeof refreshNatureBanner === "function") {
      try { refreshNatureBanner(); } catch (e) {}
    }

    // Show + populate the chrono section with the saved duration.
    if (state.currentDurationSec > 0) {
      const __chronoSection = $("#chronoSection");
      if (__chronoSection) __chronoSection.hidden = false;
      try { chronoReset(); } catch (e) {}
    }

    // Audience card visibility depends on currentExercise.needsAudience.
    try { refreshAudienceCard(); } catch (e) {}
  }

  // Per-level max duration (seconds), 30s step
  const LEVEL_MAX_DURATION = { debutant: 180, confirme: 300, expert: 480 };

  /* ============================================================
     2.5 AUDIO (synthesized via Web Audio API)
     ============================================================ */
  let _audioCtx = null;
  function audio() {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioCtx = new Ctx();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  }
  function playTick() {
    const ctx = audio(); if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + i * 0.05);
      o.stop(now + 0.8);
    });
  }
  function playAudienceBeep() {
    const ctx = audio(); if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(660, now);
    o.frequency.exponentialRampToValueAtTime(440, now + 0.25);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.connect(g); g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.4);
  }
  function playEndGong() {
    const ctx = audio(); if (!ctx) return;
    const now = ctx.currentTime;
    [220, 330, 440].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? "sawtooth" : "sine";
      o.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.25 / (i + 1), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      o.connect(g); g.connect(ctx.destination);
      o.start(now);
      o.stop(now + 1.7);
    });
  }
  // Sharp "GO!" sound played at the end of the 3-2-1 pre-countdown
  function playGoSound() {
    const ctx = audio(); if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1200, now);
    o.frequency.exponentialRampToValueAtTime(720, now + 0.35);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    o.connect(g); g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.6);
  }
  function playApplause(durSec) {
    const ctx = audio(); if (!ctx) return;
    durSec = durSec || 4;
    const bufferSize = ctx.sampleRate * durSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const n = Math.random() * 2 - 1;
      const t = i / ctx.sampleRate;
      const env = Math.min(1, t * 3) * Math.max(0, 1 - (t / durSec));
      const crackle = 0.6 + 0.4 * Math.sin(2 * Math.PI * (8 + Math.random() * 4) * t);
      data[i] = n * env * crackle * 0.7;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start();
  }

  /* ============================================================
     2.6 DURATION HELPERS
     ============================================================ */
  function formatSec(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return s + " s";
    if (s === 0) return m + " min";
    return m + " min " + (s < 10 ? "0" + s : s);
  }
  function formatMMSS(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }
  function durationSteps(level) {
    const max = LEVEL_MAX_DURATION[level] || 180;
    const out = [];
    for (let s = 30; s <= max; s += 30) out.push(s);
    return out;
  }
  function pickDurationSec() {
    const max = LEVEL_MAX_DURATION[state.level] || 180;
    if (state.durationRandom) {
      const steps = durationSteps(state.level);
      // Use a shuffle bag too — exhaust all step values before any repeats.
      return pickFromBag("duration:" + state.level, steps);
    }
    return Math.min(Math.max(30, state.durationManualSec), max);
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el && v != null) el.textContent = v;
  }

  window.applyTranslations = function applyTranslations() {
    const t = store.ui;
    document.documentElement.lang = store.locale;
    document.title = "Acto — The Impro Studio";

    setText("titleLine",        t.title);
    setText("titleAccent",      t.titleAccent);
    setText("subtitle",         t.subtitle);
    setText("subtitle2",        t.subtitle2);
    setText("label01",          t.label01);
    setText("label02",          t.label02);
    setText("label03",          t.label03);
    setText("labelTeams",       t.labelTeams);
    setText("labelRoster",      t.labelRoster);
    refreshRosterStatus();
    setText("modeTroupeTitle",  t.modeTroupe);
    setText("modeTroupeDesc",   t.modeTroupeDesc);
    setText("modeMatchTitle",   t.modeMatch);
    setText("modeMatchDesc",    t.modeMatchDesc);
    setText("levelDebutant",    t.levelDebutant);
    setText("levelConfirme",    t.levelConfirme);
    setText("levelExpert",      t.levelExpert);

    const teamA = $("#teamA"), teamB = $("#teamB"), teamTroupe = $("#teamTroupe");
    if (teamA) teamA.placeholder = t.teamA ?? "";
    if (teamB) teamB.placeholder = t.teamB ?? "";
    if (teamTroupe) teamTroupe.placeholder = t.teamTroupe ?? "";

    setText("themesModeRandomLabel", t.themesModeRandom);
    setText("themesModeCustomLabel", t.themesModeCustom);
    setText("themesEditBtnLabel",    t.themeEditBtn);
    setText("themesDlgTitle",        t.themesDlgTitle);
    setText("themesDlgHint",         t.themesDlgHint);
    setText("themesDlgClear",        t.themesDlgClear);
    setText("themesDlgSave",         t.themesDlgSave);
    const themesInput = $("#themesInput");
    if (themesInput) themesInput.placeholder = t.themesPlaceholder ?? "";
    refreshThemeStatus();

    setText("generateLabel",    t.generate);

    setText("labelCardCategory",   t.cardCategory);
    setText("labelCardExercise",   t.cardExercise);
    setText("labelCardConstraint", t.cardConstraint);
    setText("labelCardTheme",      t.cardTheme);
    setText("labelCardDuration",   t.cardDuration);
    setText("labelCardPlayers",    t.cardPlayers);
    setText("labelCardNature",     t.cardNature);
    refreshNatureBanner();

    // Duration block
    setText("label04",              t.label04);
    setText("durationRandomLabel",  t.durationRandomLabel);
    const __slider = document.getElementById("durationSlider");
    if (__slider) {
      __slider.max  = LEVEL_MAX_DURATION[state.level] || 180;
      if (state.durationManualSec > __slider.max) state.durationManualSec = __slider.max;
      __slider.value = state.durationManualSec;
    }
    setText("durationValue",  formatSec(state.durationManualSec));
    setText("durationMaxHelp", (t.durationMaxHelp || "") + formatSec(LEVEL_MAX_DURATION[state.level] || 180));

    // Chrono section
    setText("labelCardChrono",  t.cardChrono);
    if (!state.chronoRunning) {
      const isPaused = state.chronoRemaining > 0 && state.chronoRemaining < state.chronoTotal;
      setText("chronoStartBtn", isPaused ? (t.chronoResume || t.chronoStart) : (t.chronoStart || "Start"));
    }
    setText("chronoPauseBtn",   t.chronoPause || "Pause");
    setText("chronoResetBtn",   t.chronoReset || "Reset");

    // Audience block
    setText("labelCardAudience",      t.audienceTitle);
    setText("audienceHint",           t.audienceHint);
    setText("audienceToggleLabelText",t.audienceTitle);
    setText("audienceIntervalLabel",  t.audienceIntervalLabel);
    setText("audienceFlashMsg",       t.audienceFlashMsg);
    setText("audienceIntervalValue",  formatSec(state.audienceIntervalSec));

    if (!state.isGenerating) {
      const dash = t.emDash ?? "—";
      const place = t.placeholder ?? "—";
      setReelPlaceholder("reel-exercise",   place);
      setReelPlaceholder("reel-constraint", dash);
      setReelPlaceholder("reel-theme",      dash);
      setReelPlaceholder("reel-category",   dash);
      setReelPlaceholder("reel-duration",   dash);
      setReelPlaceholder("reel-players",    dash);
    }

    setText("footerText",       t.footer);
    setText("footerSupportLabel", t.supportLabel);
    setText("footerCredit",     t.footerCredit);
    setText("recordOpenBtn",     t.recordOpenBtn);
    setText("recorderRecLabel",  t.recordRec);
    setText("recorderPauseLabel",t.recordPauseBtn);
    setText("recorderStopLabel", t.recordStopBtn);
    setText("recorderConfirmTitle", t.recordConfirmStopTitle);
    setText("recorderConfirmMsg",   t.recordConfirmStopMsg);
    setText("recorderConfirmYes",   t.recordConfirmStopYes);
    setText("recorderConfirmNo",    t.recordConfirmStopNo);
    setText("recorderPreviewTitle", t.recordPreviewTitle);
    setText("recorderExitBtn",      t.recordExitBtn);
    const __dl = document.getElementById("recorderDownloadLink");
    if (__dl) __dl.textContent = t.recordDownload || "";
    setText("settingsLabelText",t.settings);
    setText("rulesLabelText",   t.rulesBtn);
    setText("dlgTitle",         t.settings);
    setText("dlgLanguageLabel", t.language);
    setText("settingsPersonalizeLink", t.settingsPersonalize);
    if (window.actoAuth && typeof window.actoAuth.applyTranslations === "function") {
      window.actoAuth.applyTranslations();
    }
  }
  function setReelPlaceholder(id, txt) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="reel-item placeholder">${escapeHtml(txt)}</div>`;
  }

  /** Update the Nature banner (Match mode only) with the current value. */
  function refreshNatureBanner() {
    const el = document.getElementById("natureValue");
    if (!el) return;
    el.textContent = state.currentNature || "—";
    // Re-trigger the appearing animation each pick / reroll
    el.classList.remove("appearing");
    void el.offsetWidth;
    el.classList.add("appearing");
    // Tirage banner is a satellite of the nature banner — stays in sync.
    refreshTirageBanner();
  }

  /** Lookup label for "Team A" / "Team B" using the user's typed
   *  values where possible, otherwise the i18n placeholder fallbacks. */
  function teamDisplayName(side) {
    const t = store.ui;
    if (side === "a") {
      const v = ($("#teamA") && $("#teamA").value || "").trim();
      return v || t.teamA || "Team A";
    }
    if (side === "b") {
      const v = ($("#teamB") && $("#teamB").value || "").trim();
      return v || t.teamB || "Team B";
    }
    return "";
  }

  /** Show / update / hide the "🎲 X commence" banner depending on the
   *  current nature pick. Hidden in Mixte / Troupe / un-generated. */
  function refreshTirageBanner() {
    const el = document.getElementById("card-tirage");
    if (!el) return;
    const t = store.ui;
    const isComparee = state.mode === "match"
      && /compar/i.test(state.currentNature || "");
    if (!isComparee || !state.firstStarter) {
      el.hidden = true;
      return;
    }
    const txt = $("#tirageText");
    if (txt) {
      const name = teamDisplayName(state.firstStarter);
      const tpl = (state.firstStarter === "a")
        ? (t.tirageStartsA || "🎲 {team} starts.")
        : (t.tirageStartsB || "🎲 {team} starts.");
      txt.textContent = tpl.replace("{team}", name);
    }
    el.hidden = false;
  }

  /** Re-roll which team starts (random). Called from the 🎲 button on
   *  the tirage banner if the Comparée nature is active. */
  function rollFirstStarter() {
    state.firstStarter = (Math.random() < 0.5) ? "a" : "b";
    // The default "currently-recording" team also resets to whoever
    // starts so the recorder UI matches expectations.
    state.currentRecordingTeam = state.firstStarter;
    refreshTirageBanner();
  }
  /** Flip the result without re-rolling — used by the team that
   *  decides to PASS the start to the other team. */
  function flipFirstStarter() {
    if (!state.firstStarter) return rollFirstStarter();
    state.firstStarter = (state.firstStarter === "a") ? "b" : "a";
    state.currentRecordingTeam = state.firstStarter;
    refreshTirageBanner();
  }

  function setMode(mode) {
    state.mode = mode;
    $$(".mode-btn").forEach((b) => {
      const a = b.dataset.mode === mode;
      b.classList.toggle("active", a);
      b.setAttribute("aria-selected", a ? "true" : "false");
    });
    $$(".match-only").forEach((el) => { el.hidden = mode !== "match"; });
    $$(".troupe-only").forEach((el) => { el.hidden = mode !== "troupe"; });
    // Set a body-level class so CSS can reorder the result cards per mode
    // (Match: Nature → Thème → Joueurs → Catégorie | Troupe: Exercice → Contrainte → Thème).
    document.body.classList.toggle("mode-match",  mode === "match");
    document.body.classList.toggle("mode-troupe", mode === "troupe");
    refreshAudienceCard();
    // Ensure the tirage banner + recording-team indicator follow the
    // mode: hidden in Troupe, conditionally visible in Match.
    try { refreshTirageBanner(); } catch (e) {}
    try { refreshRecordingTeamIndicator(); } catch (e) {}
  }
  function setLevel(level) {
    state.level = level;
    $$(".level-btn").forEach((b) => {
      const a = b.dataset.level === level;
      b.classList.toggle("active", a);
      b.setAttribute("aria-checked", a ? "true" : "false");
    });
    const __slider = $("#durationSlider");
    const __max = LEVEL_MAX_DURATION[level] || 180;
    if (__slider) {
      __slider.max = __max;
      if (state.durationManualSec > __max) state.durationManualSec = __max;
      __slider.value = state.durationManualSec;
    }
    setText("durationValue",  formatSec(state.durationManualSec));
    const __t = store.ui;
    setText("durationMaxHelp", (__t.durationMaxHelp || "") + formatSec(__max));
  }
  function refreshAudienceCard() {
    const card = $("#card-audience");
    if (!card) return;
    const visible = state.mode === "troupe"
      && state.currentExercise
      && state.currentExercise.needsAudience === true;
    card.hidden = !visible;
    if (!visible) {
      stopAudienceLoop();
      const tog = $("#audienceToggle");
      if (tog) tog.checked = false;
      state.audienceEnabled = false;
      const wrap = $("#audienceIntervalWrap");
      if (wrap) wrap.hidden = true;
      const flash = $("#audienceFlash");
      if (flash) flash.hidden = true;
    }
  }
  function refreshThemeStatus() {
    const t = store.ui;
    const themesInput = $("#themesInput");
    // Re-parse textarea content (split by newline OR commas, trim, filter empties)
    if (themesInput) {
      const lines = themesInput.value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      state.customThemes = lines;
    }
    const status = $("#themeStatus");
    if (!status) return;
    if (state.useCustom) {
      const n = state.customThemes.length;
      if (n === 0) {
        status.textContent = t.themesEmpty || "";
      } else {
        const plural = n > 1;
        const lc = store.locale;
        const labels = {
          fr: `${n} thème${plural?"s":""} personnel${plural?"s":""}`,
          en: `${n} custom theme${plural?"s":""}`,
          de: `${n} eigene${plural?"s":""} Thema${plural?"s":""}`,
          es: `${n} tema${plural?"s":""} personal${plural?"es":""}`,
          pt: `${n} tema${plural?"s":""} pessoal${plural?"is":""}`,
          nl: `${n} eigen thema${plural?"'s":""}`
        };
        status.textContent = labels[lc] || labels.fr;
      }
    } else {
      status.textContent = "";
    }
  }
  function setThemesMode(mode) {
    state.useCustom = mode === "custom";
    $$(".themes-mode-btn").forEach(b => {
      const a = b.dataset.themesMode === mode;
      b.classList.toggle("active", a);
      b.setAttribute("aria-selected", a ? "true" : "false");
    });
    const row = $("#themesCustomRow");
    if (row) row.hidden = mode !== "custom";
    refreshThemeStatus();
  }
  function openThemesDialog() {
    const dlg = $("#themesDialog");
    if (!dlg) return;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    setTimeout(() => { const ta = $("#themesInput"); if (ta) ta.focus(); }, 0);
  }
  function closeThemesDialog() {
    const dlg = $("#themesDialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  /* ============================================================
     1.5 ROSTER (team / troupe composition)
     ============================================================ */

  // Working copy used while the dialog is open. Committed to the right state
  // field (state.roster / rosterA / rosterB) on Save. The active target is
  // tracked in `rosterDraftTarget` ("troupe" | "a" | "b").
  let rosterDraft = [];
  let rosterDraftTarget = "troupe";

  function getRosterFor(target) {
    if (target === "a") return state.rosterA;
    if (target === "b") return state.rosterB;
    return state.roster;
  }
  function setRosterFor(target, list) {
    if (target === "a")      state.rosterA = list;
    else if (target === "b") state.rosterB = list;
    else                     state.roster  = list;
  }
  function persistRoster(target) {
    try { localStorage.setItem(ROSTER_KEYS[target], JSON.stringify(getRosterFor(target))); }
    catch (e) { /* localStorage may be full / disabled */ }
  }

  function refreshRosterStatus() {
    refreshOneRosterStatus("troupe", "rosterStatus", "rosterEditBtnLabel");
    refreshOneRosterStatus("a",      "rosterStatusA", "rosterEditBtnLabelA");
    refreshOneRosterStatus("b",      "rosterStatusB", "rosterEditBtnLabelB");
  }
  function refreshOneRosterStatus(target, statusId, btnLabelId) {
    const t = store.ui;
    const list = getRosterFor(target);
    const n = list.length;
    const btnLabel = document.getElementById(btnLabelId);
    if (btnLabel) {
      btnLabel.textContent = (target === "troupe")
        ? (t.rosterEditBtn || "Configurer la composition")
        : (t.rosterEditBtnShort || "👥 Composition");
    }
    const status = document.getElementById(statusId);
    if (!status) return;
    if (n === 0) {
      status.textContent = t.rosterStatusEmpty || "";
      status.classList.remove("active");
      return;
    }
    // Render the actor names directly instead of a count. The team
    // name (Match A / B and Troupe) prefixes the line when set, e.g.
    // "Les Improbables : Bowie, Lavalanche, Phoenix".
    const names = list.map(p => (p && p.nom_scene) || "").filter(Boolean).join(", ");
    let prefix = "";
    if (target === "a") {
      const v = ($("#teamA") && $("#teamA").value || "").trim();
      prefix = (v || ($("#teamA") && $("#teamA").placeholder) || "Team A") + " : ";
    } else if (target === "b") {
      const v = ($("#teamB") && $("#teamB").value || "").trim();
      prefix = (v || ($("#teamB") && $("#teamB").placeholder) || "Team B") + " : ";
    } else if (target === "troupe") {
      const v = ($("#teamTroupe") && $("#teamTroupe").value || "").trim();
      // Only prefix if the user actually named the troupe — keep the
      // status clean ("Bowie, Lavalanche, Phoenix") otherwise.
      if (v) prefix = v + " : ";
    }
    status.textContent = prefix + names;
    status.classList.add("active");
  }

  function renderRosterDraftList() {
    const t = store.ui;
    const list  = $("#rosterList");
    const empty = $("#rosterEmpty");
    if (!list) return;
    list.innerHTML = "";
    if (!rosterDraft.length) {
      if (empty) { empty.textContent = t.rosterListEmpty || ""; empty.hidden = false; }
      return;
    }
    if (empty) empty.hidden = true;
    rosterDraft.forEach((p, idx) => {
      const isAbsent = p.present === false;
      const li = document.createElement("li");
      li.className = "roster-chip" + (p.user_id ? " roster-chip-user" : " roster-chip-guest")
                     + (isAbsent ? " is-absent" : "");
      // The ::after pseudo-element reads its label from this attribute
      // so we keep the i18n string in sync with the active locale.
      li.setAttribute("data-absent-label", t.rosterChipAbsent || "absent");
      li.setAttribute("title", t.rosterPresenceHint || "");
      const name = document.createElement("span");
      name.className = "roster-chip-name";
      name.textContent = p.nom_scene;
      const tag = document.createElement("span");
      tag.className = "roster-chip-tag";
      tag.textContent = p.user_id ? "✓" : "✎";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "roster-chip-remove";
      rm.setAttribute("aria-label", t.rosterRemove || "Remove");
      rm.textContent = "✕";
      rm.addEventListener("click", (ev) => {
        // Don't bubble to the chip click handler (which would toggle
        // presence) — remove the chip outright.
        ev.stopPropagation();
        rosterDraft.splice(idx, 1);
        renderRosterDraftList();
      });
      // Click on the chip body → toggle presence for tonight. Absent
      // members are filtered out on Save (active roster only); the
      // saved-team server copy is unaffected.
      li.addEventListener("click", () => {
        // present is undefined or true → currently present → become absent.
        // present === false → currently absent → become present.
        rosterDraft[idx].present = (rosterDraft[idx].present === false);
        renderRosterDraftList();
      });
      li.append(tag, name, rm);
      list.appendChild(li);
    });
  }

  let rosterSearchTimer = null;
  let rosterLastSearchedQuery = "";
  function setRosterSearchStatus(state, query) {
    const t = store.ui;
    const el = $("#rosterSearchStatus");
    if (!el) return;
    if (state === "idle") { el.textContent = ""; el.className = "roster-search-status"; return; }
    if (state === "searching") {
      el.textContent = t.rosterSearchSearching || "…";
      el.className = "roster-search-status searching";
      return;
    }
    if (state === "found") {
      el.textContent = (t.rosterSearchFound || "{n} résultat(s)").replace("{n}", query);
      el.className = "roster-search-status found";
      return;
    }
    if (state === "none") {
      el.textContent = (t.rosterSearchNone || "Aucun acteur trouvé pour « {q} »").replace("{q}", query);
      el.className = "roster-search-status none";
      return;
    }
  }
  function renderRosterSearchResults(rows, query) {
    const ul = $("#rosterSearchResults");
    if (!ul) return;
    ul.innerHTML = "";
    // Filter out users already on the draft so the dropdown only shows pickable hits.
    const filteredRows = (rows || []).filter(row => !rosterDraft.some(p => p.user_id === row.id));
    const q = (query || "").trim();
    if (!filteredRows.length) {
      ul.hidden = true;
      // Only call this "none" when there WAS a query — empty input shouldn't yell.
      if (q) setRosterSearchStatus("none", q); else setRosterSearchStatus("idle");
      return;
    }
    setRosterSearchStatus("found", String(filteredRows.length));
    filteredRows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "roster-search-item";
      li.tabIndex = 0;
      li.innerHTML =
        `<span class="roster-search-stage">${escapeHtml(row.nom_scene || "")}</span>` +
        `<span class="roster-search-prenom">${escapeHtml(row.prenom || "")}</span>`;
      const pick = () => {
        rosterDraft.push({ user_id: row.id, nom_scene: row.nom_scene });
        const input = $("#rosterSearchInput");
        if (input) input.value = "";
        ul.hidden = true;
        renderRosterDraftList();
      };
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      ul.appendChild(li);
    });
    ul.hidden = ul.children.length === 0;
  }

  async function searchRosterUsers(q) {
    const trimmed = (q || "").trim();
    if (!window.actoSupabase || !window.actoAuth || !window.actoAuth.state || !window.actoAuth.state.user) {
      // Search requires being authenticated; silently no-op.
      renderRosterSearchResults([], trimmed);
      return;
    }
    if (!trimmed) {
      renderRosterSearchResults([], "");
      return;
    }
    setRosterSearchStatus("searching", trimmed);
    rosterLastSearchedQuery = trimmed;
    try {
      const { data, error } = await window.actoSupabase.rpc("search_users_by_stage_name", { p_query: trimmed });
      // Discard out-of-order responses (user has typed more since this call started).
      if (rosterLastSearchedQuery !== trimmed) return;
      if (error) { console.warn("roster search failed", error); renderRosterSearchResults([], trimmed); return; }
      // Show ALL matches including the current user — useful for Match mode
      // where the launcher might still want to add themselves to a team roster.
      renderRosterSearchResults(data || [], trimmed);
    } catch (e) {
      console.warn("roster search threw", e);
      renderRosterSearchResults([], trimmed);
    }
  }

  function openRosterDialog(target) {
    const dlg = $("#rosterDialog");
    if (!dlg) return;
    rosterDraftTarget = target || "troupe";
    rosterDraft = getRosterFor(rosterDraftTarget).slice();
    const search = $("#rosterSearchInput");
    const adhoc  = $("#rosterAdHocInput");
    const t = store.ui;
    if (search) {
      search.value = "";
      search.placeholder = t.rosterSearchPlaceholder || "";
    }
    if (adhoc) {
      adhoc.value = "";
      adhoc.placeholder = t.rosterAdHocPlaceholder || "";
    }
    // Show the team / troupe name in the dialog title when set.
    let titleText = t.rosterDialogTitle || "Composition";
    if (rosterDraftTarget === "a") {
      const teamName = ($("#teamA") && $("#teamA").value) || "Team A";
      titleText = (titleText) + " — " + teamName;
    } else if (rosterDraftTarget === "b") {
      const teamName = ($("#teamB") && $("#teamB").value) || "Team B";
      titleText = (titleText) + " — " + teamName;
    } else if (rosterDraftTarget === "troupe") {
      const tn = ($("#teamTroupe") && $("#teamTroupe").value || "").trim();
      if (tn) titleText = titleText + " — " + tn;
    }
    setText("rosterDialogTitle",  titleText);
    setText("rosterDialogHint",   t.rosterDialogHint);
    setText("rosterTeamNameLabel", t.rosterTeamNameLabel || "Team name");
    setText("rosterAdHocAddBtn",  t.rosterAdHocAdd);
    setText("rosterCancelBtn",    t.rosterCancel || t.authDeleteCancel);
    setText("rosterSaveBtn",      t.rosterSave);

    // Pre-fill the team-name input from the active source:
    //   Match A/B → the #teamA / #teamB input on the main page
    //   Troupe    → its own localStorage slot
    const teamNameInput = $("#rosterTeamNameInput");
    if (teamNameInput) {
      let initial = "";
      if (rosterDraftTarget === "a") {
        initial = ($("#teamA") && $("#teamA").value) || "";
      } else if (rosterDraftTarget === "b") {
        initial = ($("#teamB") && $("#teamB").value) || "";
      } else {
        initial = loadTeamNameFromStorage("troupe");
      }
      teamNameInput.value = initial;
      teamNameInput.placeholder = t.rosterTeamNamePlaceholder || "";
    }
    refreshTeamNameStatus();

    setRosterSearchStatus("idle");
    renderRosterSearchResults([], "");
    renderRosterDraftList();
    // Saved-teams: render the dropdown right away (cached entries
    // appear instantly), then refresh from the server in background.
    renderSavedTeamsControls();
    if (isSignedIn()) {
      loadSavedTeamsList().then(renderSavedTeamsControls).catch(() => {});
    }
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }
  function closeRosterDialog() {
    const dlg = $("#rosterDialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }
  function saveRoster() {
    // Persist the team name FIRST. For Match A/B we also push the new
    // value into the #teamA / #teamB input so the main-page label
    // updates without needing a page reload.
    const tnInput = $("#rosterTeamNameInput");
    const teamName = tnInput ? (tnInput.value || "").trim() : "";
    if (rosterDraftTarget === "a") {
      const ta = $("#teamA");
      if (ta) {
        ta.value = teamName;
        persistTeamName("a", teamName);
      }
    } else if (rosterDraftTarget === "b") {
      const tb = $("#teamB");
      if (tb) {
        tb.value = teamName;
        persistTeamName("b", teamName);
      }
    } else {
      const tt = $("#teamTroupe");
      if (tt) {
        tt.value = teamName;
      }
      persistTeamName("troupe", teamName);
    }

    // Active roster = only members marked present. Strip the `present`
    // flag itself before persisting so we don't store transient state
    // alongside the long-lived participant entries.
    const activeRoster = rosterDraft
      .filter(p => p && p.present !== false)
      .map(({ present, ...rest }) => rest);
    setRosterFor(rosterDraftTarget, activeRoster);
    persistRoster(rosterDraftTarget);
    closeRosterDialog();
    refreshRosterStatus();
  }

  /* ================================================================
     SAVED TEAMS  — server-shared rosters

     Lets a user persist a (team_name, members[]) pair to Supabase
     where every authenticated user can read it. The dialog surfaces
     load / update / delete actions. Saving requires explicit consent
     because the team name and stage names become public-readable to
     other Acto users.
     ================================================================ */
  let savedTeams = [];
  let savedTeamsLoaded = false;

  function isSignedIn() {
    return !!(window.actoSupabase && window.actoAuth
              && window.actoAuth.state && window.actoAuth.state.user);
  }

  /** Update the inline team-name availability hint based on the
   *  cached `savedTeams` list. Three states:
   *    available   → no saved team has this name (any owner)
   *    self        → user already has a team with this name; saving
   *                  will UPDATE it (the unique index ensures this)
   *    other       → another user has a team with the same name;
   *                  technically not a conflict (unique on owner_id +
   *                  lower(name)) but worth surfacing for clarity.
   */
  function refreshTeamNameStatus() {
    const input  = $("#rosterTeamNameInput");
    const status = $("#rosterTeamNameStatus");
    if (!input || !status) return;
    const t = store.ui;
    const v = (input.value || "").trim();
    if (!v) {
      status.hidden = true;
      status.textContent = "";
      status.className = "roster-team-name-status";
      return;
    }
    const lcv = v.toLowerCase();
    const meId = (window.actoAuth && window.actoAuth.state && window.actoAuth.state.user
                  && window.actoAuth.state.user.id) || null;
    const mine  = savedTeams.find(s => s.owner_id === meId && s.name.toLowerCase() === lcv);
    const other = !mine && savedTeams.find(s => s.name.toLowerCase() === lcv);

    status.hidden = false;
    if (mine) {
      status.textContent = (t.rosterTeamNameTakenSelf || "You already have a team named “{name}”").replace("{name}", mine.name);
      status.className = "roster-team-name-status is-self";
    } else if (other) {
      status.textContent = (t.rosterTeamNameTakenOther || "Someone else has named a team “{name}”").replace("{name}", other.name);
      status.className = "roster-team-name-status is-other";
    } else {
      status.textContent = t.rosterTeamNameAvailable || "Name available";
      status.className = "roster-team-name-status is-available";
    }
  }

  /** Fetch every shared team from Supabase. Cached on `savedTeams` so
   *  subsequent dialog opens don't refetch unless an action invalidates. */
  async function loadSavedTeamsList() {
    if (!isSignedIn()) { savedTeams = []; savedTeamsLoaded = false; return; }
    try {
      const { data, error } = await window.actoSupabase
        .from("saved_teams")
        .select("id, owner_id, name, members, updated_at")
        .order("name", { ascending: true })
        .limit(2000);
      if (error) {
        console.warn("[acto] loadSavedTeamsList error", error);
        savedTeams = [];
      } else {
        savedTeams = (data || []).map(row => ({
          id:       row.id,
          owner_id: row.owner_id,
          name:     row.name,
          members:  Array.isArray(row.members) ? row.members : []
        }));
      }
    } catch (e) {
      console.warn("[acto] loadSavedTeamsList threw", e);
      savedTeams = [];
    }
    savedTeamsLoaded = true;
  }

  /** Repaint the <select> + enable/disable load/update/delete buttons. */
  function renderSavedTeamsControls() {
    const sel    = $("#savedTeamsSelect");
    const labelEl= $("#savedTeamsLabel");
    const loadBtn= $("#savedTeamsLoadBtn");
    const upBtn  = $("#savedTeamsUpdateBtn");
    const delBtn = $("#savedTeamsDeleteBtn");
    const saveBtn= $("#savedTeamsSaveBtn");
    const t = store.ui;
    if (labelEl) labelEl.textContent = t.savedTeamsLabel || "Saved teams";
    if (loadBtn) loadBtn.textContent = t.savedTeamsLoadBtn   || "Load";
    if (upBtn)   upBtn.textContent   = t.savedTeamsUpdateBtn || "Update";
    if (delBtn)  delBtn.textContent  = t.savedTeamsDeleteBtn || "Delete";
    if (saveBtn) saveBtn.textContent = t.savedTeamsSaveBtn   || "Save this team";

    if (!sel) return;
    sel.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t.savedTeamsPlaceholder || "— Pick a team —";
    sel.appendChild(placeholder);

    if (!savedTeams.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.disabled = true;
      opt.textContent = t.savedTeamsEmpty || "No saved teams yet.";
      sel.appendChild(opt);
    } else {
      const meId = (window.actoAuth && window.actoAuth.state && window.actoAuth.state.user
                    && window.actoAuth.state.user.id) || null;
      for (const team of savedTeams) {
        const opt = document.createElement("option");
        opt.value = team.id;
        const isMine = team.owner_id === meId;
        const mark = isMine ? " ★" : "";
        opt.textContent = `${team.name} (${team.members.length})${mark}`;
        sel.appendChild(opt);
      }
    }
    syncSavedTeamsButtons();
  }

  function syncSavedTeamsButtons() {
    const sel    = $("#savedTeamsSelect");
    const loadBtn= $("#savedTeamsLoadBtn");
    const upBtn  = $("#savedTeamsUpdateBtn");
    const delBtn = $("#savedTeamsDeleteBtn");
    const saveBtn= $("#savedTeamsSaveBtn");
    const id = sel && sel.value;
    const team = id ? savedTeams.find(t => t.id === id) : null;
    const meId = (window.actoAuth && window.actoAuth.state && window.actoAuth.state.user
                  && window.actoAuth.state.user.id) || null;
    const isMine = !!(team && meId && team.owner_id === meId);

    if (loadBtn) loadBtn.disabled = !team;
    if (upBtn)   { upBtn.disabled  = !isMine; upBtn.hidden  = !isMine; }
    if (delBtn)  { delBtn.disabled = !isMine; delBtn.hidden = !isMine; }
    if (saveBtn) saveBtn.disabled = !isSignedIn();
  }

  /** Replace the active draft (rosterDraft) with the picked team's
   *  members. For Match teams (a/b), also overwrite the team-name input. */
  function loadSavedTeamIntoDraft() {
    const sel = $("#savedTeamsSelect");
    if (!sel || !sel.value) return;
    const team = savedTeams.find(t => t.id === sel.value);
    if (!team) return;
    // Reset every loaded member to "present" — the user can then click
    // any chip to mark someone absent for tonight only.
    rosterDraft = team.members.map(m => ({ ...m, present: true }));
    // Push the team's name into the dialog's team-name input AND into
    // the matching main-page slot so the label updates immediately.
    const tnInput = $("#rosterTeamNameInput");
    if (tnInput) tnInput.value = team.name;
    if (rosterDraftTarget === "a") {
      const teamA = $("#teamA");
      if (teamA) { teamA.value = team.name; persistTeamName("a", team.name); }
    } else if (rosterDraftTarget === "b") {
      const teamB = $("#teamB");
      if (teamB) { teamB.value = team.name; persistTeamName("b", team.name); }
    } else {
      const teamTroupe = $("#teamTroupe");
      if (teamTroupe) { teamTroupe.value = team.name; persistTeamName("troupe", team.name); }
    }
    refreshTeamNameStatus();
    renderRosterDraftList();
    refreshRosterStatus();
  }

  /** Build the team-name to use when saving. The dialog's team-name
   *  input is the source of truth now; we fall back to the main-page
   *  Match A/B inputs (for legacy reasons) and finally to a prompt. */
  function pickTeamNameForSave() {
    const t = store.ui;
    const tn = $("#rosterTeamNameInput");
    if (tn && tn.value && tn.value.trim()) return tn.value.trim();
    if (rosterDraftTarget === "a") {
      const v = $("#teamA"); return (v && v.value && v.value.trim()) || prompt(t.savedTeamsNamePrompt || "Team name:", "");
    }
    if (rosterDraftTarget === "b") {
      const v = $("#teamB"); return (v && v.value && v.value.trim()) || prompt(t.savedTeamsNamePrompt || "Team name:", "");
    }
    return prompt(t.savedTeamsNamePrompt || "Team name:", "");
  }

  /** Strip member objects to the public shape the table stores: only
   *  user_id (optional) + nom_scene. The transient `present` flag is
   *  intentionally dropped — the saved team retains its FULL roster
   *  regardless of who's absent tonight. */
  function publicMembersFromDraft() {
    return rosterDraft.map(p => {
      const out = { nom_scene: (p && p.nom_scene) || "" };
      if (p && p.user_id) out.user_id = p.user_id;
      return out;
    }).filter(m => m.nom_scene);
  }

  async function actionSaveCurrentTeam() {
    const t = store.ui;
    if (!isSignedIn()) {
      alert(t.savedTeamsLoginRequired || "Sign in first.");
      return;
    }
    const members = publicMembersFromDraft();
    if (!members.length) return;
    const name = (pickTeamNameForSave() || "").trim();
    if (!name) return;
    if (!confirm(t.savedTeamsWarning || "Saving will share the team name and actor stage names with other users. Continue?")) return;

    // Upsert by (owner_id, lower(name)) — use the unique index. Easier
    // to do an explicit insert + fall back to update on conflict.
    const meId = window.actoAuth.state.user.id;
    try {
      const { error: insErr } = await window.actoSupabase
        .from("saved_teams")
        .insert({ owner_id: meId, name, members });
      if (insErr) {
        // Conflict on the unique (owner_id, lower(name)) index → update existing.
        if (String(insErr.code) === "23505" || /duplicate key/i.test(insErr.message || "")) {
          const existing = savedTeams.find(s => s.owner_id === meId && s.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            const { error: updErr } = await window.actoSupabase
              .from("saved_teams")
              .update({ name, members })
              .eq("id", existing.id);
            if (updErr) { alert("❌ " + updErr.message); return; }
          } else {
            // We don't have it cached — fetch fresh and retry once via update.
            await loadSavedTeamsList();
            const fresh = savedTeams.find(s => s.owner_id === meId && s.name.toLowerCase() === name.toLowerCase());
            if (fresh) {
              const { error: updErr } = await window.actoSupabase
                .from("saved_teams")
                .update({ name, members })
                .eq("id", fresh.id);
              if (updErr) { alert("❌ " + updErr.message); return; }
            }
          }
        } else {
          alert("❌ " + insErr.message);
          return;
        }
      }
    } catch (e) {
      alert("❌ " + (e && e.message || e));
      return;
    }
    await loadSavedTeamsList();
    renderSavedTeamsControls();
  }

  async function actionUpdateSelectedTeam() {
    const sel = $("#savedTeamsSelect");
    if (!sel || !sel.value) return;
    const team = savedTeams.find(s => s.id === sel.value);
    if (!team) return;
    const t = store.ui;
    const msg = (t.savedTeamsConfirmUpdate || "Replace saved {name} contents with the current roster?").replace("{name}", team.name);
    if (!confirm(msg)) return;
    const members = publicMembersFromDraft();
    try {
      const { error } = await window.actoSupabase
        .from("saved_teams")
        .update({ members })
        .eq("id", team.id);
      if (error) { alert("❌ " + error.message); return; }
    } catch (e) { alert("❌ " + (e && e.message || e)); return; }
    await loadSavedTeamsList();
    renderSavedTeamsControls();
    sel.value = team.id;
    syncSavedTeamsButtons();
  }

  async function actionDeleteSelectedTeam() {
    const sel = $("#savedTeamsSelect");
    if (!sel || !sel.value) return;
    const team = savedTeams.find(s => s.id === sel.value);
    if (!team) return;
    const t = store.ui;
    const msg = (t.savedTeamsConfirmDelete || "Permanently delete {name}?").replace("{name}", team.name);
    if (!confirm(msg)) return;
    try {
      const { error } = await window.actoSupabase
        .from("saved_teams")
        .delete()
        .eq("id", team.id);
      if (error) { alert("❌ " + error.message); return; }
    } catch (e) { alert("❌ " + (e && e.message || e)); return; }
    await loadSavedTeamsList();
    renderSavedTeamsControls();
  }

  function pickFor(target) {
    const data = store.data;
    const { mode, level } = state;
    switch (target) {
      case "exercise":   {
        const ex = pickFromBag("exercise:" + mode + ":" + level, data.exercises[mode][level]);
        state.currentExercise = ex;
        let meta = (ex && ex.desc) || "";
        if (mode === "troupe" && ex && ex.needsAudience) {
          const t = store.ui;
          const badge = t.audienceBadge || "Audience interaction";
          meta = badge + " — " + meta;
        }
        return { value: ex && ex.name, meta: meta };
      }
      case "constraint": {
        // Match no longer uses a separate constraint (the official rules fold
        // it into "Catégorie"). Troupe still picks one normally.
        const v = pickFromBag("constraint:" + mode + ":" + level, data.constraints[mode][level]);
        state.currentConstraint = v;
        return { value: v };
      }
      case "nature": {
        // Match-only. Mirrors the referee's first announcement card: the
        // improvisation is either Mixte (both teams together) or Comparée
        // (one team plays, then the other on the same theme).
        const t = store.ui;
        const opts = [
          t.natureMixte    || "Mixte",
          t.natureComparee || "Comparée"
        ];
        const v = pickFromBag("nature", opts);
        state.currentNature = v;
        return { value: v };
      }
      case "players": {
        const v = pickFromBag("players:" + level, data.players[level]);
        state.currentPlayers = v;
        return { value: v };
      }
      case "theme": {
        const pool = state.useCustom ? state.customThemes : data.themes[level];
        const bagKey = state.useCustom ? "theme:custom" : ("theme:level:" + level);
        const v = pickFromBag(bagKey, pool);
        state.currentTheme = v;
        return { value: v };
      }
      case "category":   {
        const c = pickFromBag("category", data.categories);
        state.currentCategory = c;
        // In Match mode the Category card replaces Exercise. Mirror the picked
        // category onto state.currentExercise so the recorder overlay (which
        // reads currentExercise.name + .desc) renders the category instead.
        state.currentExercise = { name: c && c.name, desc: c && c.desc };
        return { value: c && c.name, meta: c && c.desc };
      }
      case "duration":   {
        const sec = pickDurationSec();
        state.currentDurationSec = sec;
        return { value: formatSec(sec) };
      }
    }
    return { value: "—" };
  }
  function poolFor(target) {
    const data = store.data;
    const t = store.ui;
    const { mode, level } = state;
    switch (target) {
      case "exercise":   return data.exercises[mode][level].map(e => e.name);
      case "constraint": return data.constraints[mode][level];
      case "theme":      return state.useCustom ? state.customThemes : data.themes[level];
      case "category":   return data.categories.map(c => c.name);
      case "duration":   return durationSteps(level).map(formatSec);
      case "players":    return data.players[level];
      case "nature":     return [t.natureMixte || "Mixte", t.natureComparee || "Comparée"];
    }
    return [];
  }
  async function spinTarget(target, delay) {
    const reelEl  = $(`.reel[data-target="${target}"]`);
    const trackEl = $(`#reel-${target}`);
    const cardEl  = $(`#card-${target}`);
    const metaEl  = $(`#meta-${target}`);
    const result  = pickFor(target);
    const pool    = poolFor(target);
    const items   = buildSpinPool(pool, result.value);
    await spinReel({ reelEl, trackEl, cardEl, metaEl, items, meta: result.meta, delay });
  }
  async function generateAll() {
    if (state.isGenerating) return;
    if (state.useCustom && state.customThemes.length === 0) { openThemesDialog(); return; }
    state.isGenerating = true;
    $("#generateBtn").disabled = true;
    statsImproNew();
    chronoReset();
    $$(".card").forEach(c => { c.classList.remove("revealed"); c.classList.add("appearing"); });
    setTimeout(() => $$(".card").forEach(c => c.classList.remove("appearing")), 600);
    // Both modes pick the duration silently — the chrono card displays it.
    state.currentDurationSec = pickDurationSec();
    let targets;
    if (state.mode === "match") {
      // Match: official announcement order = Nature → Thème → Joueurs → Catégorie.
      // Nature has no slot reel (just a banner) — pick it instantly here so the
      // value is ready by the time the cycling overlay reads currentNature.
      pickFor("nature");
      // Fresh generation = fresh draw + fresh record tracking. Only
      // matters for Comparée; refreshTirageBanner gates on nature.
      state.recordedTeamsSet = new Set();
      state.firstStarter = (Math.random() < 0.5) ? "a" : "b";
      state.currentRecordingTeam = state.firstStarter;
      refreshNatureBanner();
      targets = ["theme", "players", "category"];
    } else {
      targets = ["exercise", "constraint", "theme"];
    }
    try {
      await Promise.all(targets.map((t, i) => spinTarget(t, i * 220)));
    } catch (e) {
      console.error("generateAll: spin failed", e);
    } finally {
      state.isGenerating = false;
      $("#generateBtn").disabled = false;
      const __chronoSection = $("#chronoSection");
      if (__chronoSection) __chronoSection.hidden = false;
      // Safety: if duration didn't get set somehow, compute it now
      if (!state.currentDurationSec) state.currentDurationSec = pickDurationSec();
      chronoReset();
      refreshAudienceCard();
      saveLastImpro();
    }
  }

  /* ============================================================
     3.5 CHRONO + AUDIENCE LOOP
     ============================================================ */
  function chronoReset() {
    if (state.chronoInterval) { clearInterval(state.chronoInterval); state.chronoInterval = null; }
    state.chronoRunning = false;
    state.chronoTotal = state.currentDurationSec || 0;
    state.chronoRemaining = state.chronoTotal;
    state.chronoLastBeepAt = state.chronoTotal;
    const display = $("#chronoDisplay");
    if (display) {
      display.textContent = formatMMSS(state.chronoTotal);
      display.classList.remove("warn", "danger", "ended");
    }
    const bar = $("#chronoProgressBar");
    if (bar) bar.style.width = "0%";
    const t = store.ui;
    setText("chronoStartBtn", t.chronoStart || "Start");
    setText("chronoPauseBtn", t.chronoPause || "Pause");
    setText("chronoResetBtn", t.chronoReset || "Reset");
    const startBtn = $("#chronoStartBtn"), pauseBtn = $("#chronoPauseBtn");
    if (startBtn) startBtn.disabled = state.chronoTotal <= 0;
    if (pauseBtn) pauseBtn.disabled = true;
    stopAudienceLoop();
    const flash = $("#audienceFlash");
    if (flash) flash.hidden = true;
  }
  function chronoStart() {
    if (state.chronoRunning) return;
    if (state.chronoRemaining <= 0) state.chronoRemaining = state.chronoTotal || state.currentDurationSec;
    if (state.chronoRemaining <= 0) return;
    audio();
    state.chronoRunning = true;
    statsImproStartTracking();
    const startBtn = $("#chronoStartBtn"), pauseBtn = $("#chronoPauseBtn");
    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    state.chronoInterval = setInterval(chronoTick, 1000);
    if (state.audienceEnabled) startAudienceLoop();
  }
  function chronoPause() {
    if (!state.chronoRunning) return;
    state.chronoRunning = false;
    statsImproStopTracking();
    if (state.chronoInterval) { clearInterval(state.chronoInterval); state.chronoInterval = null; }
    const startBtn = $("#chronoStartBtn"), pauseBtn = $("#chronoPauseBtn");
    if (startBtn) {
      startBtn.disabled = false;
      const t = store.ui;
      startBtn.textContent = t.chronoResume || t.chronoStart || "Resume";
    }
    if (pauseBtn) pauseBtn.disabled = true;
    stopAudienceLoop();
  }
  function chronoTick() {
    state.chronoRemaining--;
    const display = $("#chronoDisplay");
    if (display) display.textContent = formatMMSS(Math.max(0, state.chronoRemaining));
    const bar = $("#chronoProgressBar");
    if (bar && state.chronoTotal > 0) {
      const elapsed = state.chronoTotal - state.chronoRemaining;
      bar.style.width = Math.min(100, (elapsed / state.chronoTotal) * 100) + "%";
    }
    if (display) {
      if (state.chronoRemaining <= 10) {
        display.classList.add("danger");
        display.classList.remove("warn");
      } else if (state.chronoRemaining <= 30) {
        display.classList.add("warn");
        display.classList.remove("danger");
      }
    }
    if (state.chronoRemaining > 0
        && state.chronoRemaining % 30 === 0
        && state.chronoRemaining !== state.chronoLastBeepAt) {
      state.chronoLastBeepAt = state.chronoRemaining;
      playTick();
    }
    if (state.chronoRemaining <= 0) {
      if (state.chronoInterval) { clearInterval(state.chronoInterval); state.chronoInterval = null; }
      state.chronoRunning = false;
      statsImproStopTracking();
      const startBtn = $("#chronoStartBtn"), pauseBtn = $("#chronoPauseBtn");
      if (startBtn) {
        startBtn.disabled = false;
        const t = store.ui;
        startBtn.textContent = t.chronoStart || "Start";
      }
      if (pauseBtn) pauseBtn.disabled = true;
      if (display) display.classList.add("ended");
      stopAudienceLoop();
      playEndGong();
      setTimeout(() => playApplause(5), 700);
    }
  }
  function startAudienceLoop() {
    stopAudienceLoop();
    if (!state.audienceEnabled) return;
    if (state.mode !== "troupe") return;
    if (!state.currentExercise || !state.currentExercise.needsAudience) return;
    const flash = $("#audienceFlash");
    if (flash) flash.hidden = false;
    state.audienceTimer = setInterval(() => {
      flashAudienceBanner();
      recShowAudienceCue();
      playAudienceBeep();
    }, state.audienceIntervalSec * 1000);
  }
  function stopAudienceLoop() {
    if (state.audienceTimer) { clearInterval(state.audienceTimer); state.audienceTimer = null; }
  }
  function flashAudienceBanner() {
    const f = $("#audienceFlash");
    if (!f) return;
    f.hidden = false;
    f.classList.add("flash-on");
    setTimeout(() => f.classList.remove("flash-on"), 1200);
  }

  /* ============================================================
     3.6 RECORDER — 3-2-1 PRE-COUNTDOWN + AUDIENCE CUE OVERLAY
     ============================================================ */
  let recCdTimer = null;
  function recPlayPreCountdown(onComplete) {
    const overlay = $("#recorderPreCountdown");
    if (!overlay) { onComplete && onComplete(); return; }
    if (recCdTimer) { clearInterval(recCdTimer); recCdTimer = null; }
    let n = 3;
    function paint(text) {
      overlay.textContent = text;
      overlay.classList.remove("flash");
      // force reflow then re-add to retrigger animation
      void overlay.offsetWidth;
      overlay.classList.add("flash");
    }
    overlay.hidden = false;
    paint(String(n));
    playTick();
    recCdTimer = setInterval(() => {
      n--;
      if (n > 0) {
        paint(String(n));
        playTick();
      } else {
        clearInterval(recCdTimer); recCdTimer = null;
        paint("GO !");
        playGoSound();
        setTimeout(() => {
          overlay.hidden = true;
          overlay.classList.remove("flash");
          if (typeof onComplete === "function") onComplete();
        }, 750);
      }
    }, 1000);
  }
  function recCancelPreCountdown() {
    if (recCdTimer) { clearInterval(recCdTimer); recCdTimer = null; }
    const overlay = $("#recorderPreCountdown");
    if (overlay) { overlay.hidden = true; overlay.classList.remove("flash"); }
  }

  let recAudCueHideTimer = null;
  function recShowAudienceCue() {
    // Only show when the recorder modal is visible
    const modal = $("#recorderModal");
    if (!modal || modal.hidden) return;
    const cue = $("#recorderAudienceCue");
    const txt = $("#recorderAudienceCueText");
    if (!cue) return;
    const t = store.ui;
    if (txt) txt.textContent = t.audienceFlashMsg || "Public !";
    cue.classList.remove("show");
    void cue.offsetWidth;
    cue.hidden = false;
    cue.classList.add("show");
    if (recAudCueHideTimer) clearTimeout(recAudCueHideTimer);
    recAudCueHideTimer = setTimeout(() => {
      cue.classList.remove("show");
      setTimeout(() => { cue.hidden = true; }, 350);
      recAudCueHideTimer = null;
    }, 5000);
  }
  function recHideAudienceCue() {
    if (recAudCueHideTimer) { clearTimeout(recAudCueHideTimer); recAudCueHideTimer = null; }
    const cue = $("#recorderAudienceCue");
    if (cue) { cue.classList.remove("show"); cue.hidden = true; }
  }

  let recDescHideTimer = null;
  function recShowExerciseDesc(opts) {
    opts = opts || {};
    const desc = state.currentExercise && state.currentExercise.desc;
    if (!desc) return;
    rec.descShouldDraw = true;  // canvas overlay (gets recorded)
    const popup = $("#recorderExerciseDesc");
    const txt   = $("#recorderExerciseDescText");
    if (popup && txt) {
      txt.textContent = desc;
      recPositionExerciseDesc();
      popup.classList.remove("show");
      void popup.offsetWidth;
      popup.hidden = false;
      popup.classList.add("show");
    }
    if (recDescHideTimer) { clearTimeout(recDescHideTimer); recDescHideTimer = null; }
    if (!opts.persistent) {
      recDescHideTimer = setTimeout(recHideExerciseDesc, opts.duration || 5000);
    }
  }
  function recArmExerciseDescHide(delayMs) {
    if (recDescHideTimer) clearTimeout(recDescHideTimer);
    recDescHideTimer = setTimeout(recHideExerciseDesc, delayMs == null ? 6000 : delayMs);
  }
  function recHideExerciseDesc() {
    if (recDescHideTimer) { clearTimeout(recDescHideTimer); recDescHideTimer = null; }
    rec.descShouldDraw = false;  // stop drawing on canvas (and in recording)
    const popup = $("#recorderExerciseDesc");
    if (popup) {
      popup.classList.remove("show");
      setTimeout(() => { popup.hidden = true; }, 350);
    }
  }
  // Position the description popup directly under the canvas top-right panel.
  // Handles object-fit: contain by computing the actual content rect inside the
  // .recorder-canvas element. Falls back to CSS defaults if data isn't ready.
  function recPositionExerciseDesc() {
    const popup = $("#recorderExerciseDesc");
    const cnv   = rec.canvas;
    if (!popup) return;
    if (!cnv || !cnv.width || !cnv.height || rec.panelBottomY == null) {
      popup.style.top = popup.style.left = popup.style.right = popup.style.width =
        popup.style.maxWidth = popup.style.bottom = "";
      return;
    }
    const cnvRect = cnv.getBoundingClientRect();
    if (cnvRect.height <= 0 || cnvRect.width <= 0) return;
    const cnvAR = cnv.width / cnv.height;
    const eleAR = cnvRect.width / cnvRect.height;
    let contentLeft, contentTop, contentWidth, contentHeight;
    if (cnvAR > eleAR) {
      contentWidth  = cnvRect.width;
      contentHeight = cnvRect.width / cnvAR;
      contentLeft   = cnvRect.left;
      contentTop    = cnvRect.top + (cnvRect.height - contentHeight) / 2;
    } else {
      contentHeight = cnvRect.height;
      contentWidth  = cnvRect.height * cnvAR;
      contentTop    = cnvRect.top;
      contentLeft   = cnvRect.left + (cnvRect.width - contentWidth) / 2;
    }
    const ratio = contentWidth / cnv.width;
    const panelBottomVP = contentTop + rec.panelBottomY * ratio;
    const panelLeftVP   = contentLeft + rec.panelLeftX * ratio;
    const panelWidthVP  = rec.panelWidth * ratio;
    const gap = Math.max(8, Math.round(panelWidthVP * 0.025));
    popup.style.top      = (panelBottomVP + gap) + "px";
    popup.style.left     = panelLeftVP + "px";
    popup.style.right    = "auto";
    popup.style.width    = panelWidthVP + "px";
    popup.style.maxWidth = "none";
    popup.style.bottom   = "auto";
  }

  /* ============================================================
     4. SETTINGS DIALOG

     Holds the language selector + the read-only account info block +
     a link to the dedicated personalize page (mes-impros.html). The
     old inline JSON editor (and its reset/import/export controls)
     used to live here; it was retired in favor of the friendlier
     dedicated page where users toggle visibility per item and add
     their own — see mes-impros.html.
     ============================================================ */
  let dialogEl, langSelect, statusEl;

  function initSettings() {
    dialogEl    = $("#settingsDialog");
    langSelect  = $("#langSelect");
    statusEl    = $("#settingsStatus");

    $("#settingsBtn").addEventListener("click", openDialog);
    $("#settingsClose").addEventListener("click", () => dialogEl.close());
    dialogEl.addEventListener("click", (e) => { if (e.target === dialogEl) dialogEl.close(); });

    langSelect.addEventListener("change", () => store.setLocale(langSelect.value));
  }

  function openDialog() {
    langSelect.innerHTML = "";
    for (const [code, meta] of Object.entries(store.locales)) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${meta.flag} ${meta.name}`;
      if (code === store.locale) opt.selected = true;
      langSelect.appendChild(opt);
    }
    setStatus("");
    dialogEl.showModal();
  }

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.dataset.kind = isError ? "error" : "ok";
  }

  /* ============================================================
     4.b PHASE 2 — APPROVED USER SUBMISSIONS

     Once an admin flips a row in `user_submissions` to status='approved',
     it should start appearing alongside the bundled themes / categories /
     constraints / exercises in everyone's random picks. This loader
     fetches every approved row for the current locale and merges them
     into the in-memory bundle.

     Notes:
     - We mutate `window.IMPRO_BUNDLE.data[locale]` directly so the store's
       getters see the new entries, AND so re-fetching `data.themes[level]`
       in the shuffle bag returns the augmented array (its fingerprint then
       changes, which auto-resets the bag — no manual reset needed).
     - Pool comparisons are case-insensitive (`p.name`/`p`) so an existing
       bundled item is never duplicated.
     - Authenticated reads only — RLS policy
       `authenticated_read_approved_submissions` filters on the server.
     ============================================================ */
  async function loadApprovedSubmissionsIntoBundle() {
    if (!window.actoSupabase) return;
    const bundle = window.IMPRO_BUNDLE;
    if (!bundle || !bundle.data) return;
    const locale = (typeof store !== "undefined" && store.locale) ? store.locale : "fr";
    const target = bundle.data[locale];
    if (!target) return;

    const lc = (s) => String(s || "").trim().toLowerCase();

    // Fetch approved submissions + hidden bundled items in parallel.
    let approvedRows = [], hiddenRows = [];
    try {
      const [a, h] = await Promise.all([
        window.actoSupabase
          .from("user_submissions")
          .select("kind,mode,level,locale,text,description")
          .eq("status", "approved")
          .eq("locale", locale)
          .limit(2000),
        window.actoSupabase
          .from("bundled_hidden_items")
          .select("kind,mode,level,locale,text")
          .eq("locale", locale)
          .limit(2000)
      ]);
      if (a.error) console.warn("[acto] approved submissions read error", a.error);
      else approvedRows = a.data || [];
      if (h.error) console.warn("[acto] hidden items read error", h.error);
      else hiddenRows = h.data || [];
    } catch (e) {
      console.warn("[acto] loadApprovedSubmissions threw", e);
      return;
    }

    // 1. Merge approved submissions into the bundled pool.
    let merged = 0;
    for (const s of approvedRows) {
      const text = (s.text || "").trim();
      if (!text) continue;
      const desc = (s.description || "").trim();

      if (s.kind === "theme") {
        if (!s.level) continue;
        target.themes = target.themes || {};
        const arr = (target.themes[s.level] = target.themes[s.level] || []);
        if (!arr.some(t => lc(t) === lc(text))) { arr.push(text); merged++; }

      } else if (s.kind === "category") {
        target.categories = target.categories || [];
        const arr = target.categories;
        if (!arr.some(c => lc(c && c.name || c) === lc(text))) {
          arr.push({ name: text, desc });
          merged++;
        }

      } else if (s.kind === "constraint") {
        if (!s.mode || !s.level) continue;
        target.constraints = target.constraints || {};
        target.constraints[s.mode] = target.constraints[s.mode] || {};
        const arr = (target.constraints[s.mode][s.level] = target.constraints[s.mode][s.level] || []);
        if (!arr.some(c => lc(c) === lc(text))) { arr.push(text); merged++; }

      } else if (s.kind === "exercise") {
        if (!s.mode || !s.level) continue;
        target.exercises = target.exercises || {};
        target.exercises[s.mode] = target.exercises[s.mode] || {};
        const arr = (target.exercises[s.mode][s.level] = target.exercises[s.mode][s.level] || []);
        if (!arr.some(e => lc(e && e.name) === lc(text))) {
          arr.push({ name: text, desc });
          merged++;
        }
      }
    }

    // 2. Filter out admin-hidden bundled items.
    let removed = 0;
    for (const h of hiddenRows) {
      const text = (h.text || "").trim();
      if (!text) continue;

      if (h.kind === "theme") {
        if (!h.level || !target.themes || !target.themes[h.level]) continue;
        const before = target.themes[h.level].length;
        target.themes[h.level] = target.themes[h.level].filter(t => lc(t) !== lc(text));
        removed += before - target.themes[h.level].length;

      } else if (h.kind === "category") {
        if (!target.categories) continue;
        const before = target.categories.length;
        target.categories = target.categories.filter(c => lc(c && c.name || c) !== lc(text));
        removed += before - target.categories.length;

      } else if (h.kind === "constraint") {
        if (!h.mode || !h.level || !target.constraints || !target.constraints[h.mode] || !target.constraints[h.mode][h.level]) continue;
        const arr = target.constraints[h.mode][h.level];
        const before = arr.length;
        target.constraints[h.mode][h.level] = arr.filter(c => lc(c) !== lc(text));
        removed += before - target.constraints[h.mode][h.level].length;

      } else if (h.kind === "exercise") {
        if (!h.mode || !h.level || !target.exercises || !target.exercises[h.mode] || !target.exercises[h.mode][h.level]) continue;
        const arr = target.exercises[h.mode][h.level];
        const before = arr.length;
        target.exercises[h.mode][h.level] = arr.filter(e => lc(e && e.name) !== lc(text));
        removed += before - target.exercises[h.mode][h.level].length;
      }
    }

    // 3. Apply per-user pool customization from localStorage on top.
    const userStats = applyUserLocalPool(target, locale);

    if (merged || removed || userStats.added || userStats.hidden) {
      console.log(`[acto] pool reconciled (${locale}): +${merged} approved · -${removed} admin-hidden · +${userStats.added} user · -${userStats.hidden} user-hidden`);
    }
  }

  /**
   * Apply per-user pool customization stored in localStorage. Runs on
   * boot regardless of auth (so logged-out users still see their own
   * prefs from /mes-impros.html), and again whenever the locale changes.
   *
   *   acto-user-added:v1   — user's local additions (only visible to them)
   *   acto-user-hidden:v1  — user's per-device hide list
   *
   * Both are arrays of { kind, mode, level, locale, text [, desc] }.
   * Returns { added, hidden } counters for logging.
   */
  function applyUserLocalPool(target, locale) {
    if (!target) return { added: 0, hidden: 0 };
    const lc = (s) => String(s || "").trim().toLowerCase();
    let added = 0, hidden = 0;

    // Additions first — items the user wants to see in their pool.
    try {
      const raw = localStorage.getItem("acto-user-added:v1");
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        for (const a of list) {
          if (!a || a.locale !== locale) continue;
          const text = (a.text || "").trim();
          if (!text) continue;
          const desc = (a.desc || "").trim();

          if (a.kind === "theme" && a.level) {
            target.themes = target.themes || {};
            const arr = (target.themes[a.level] = target.themes[a.level] || []);
            if (!arr.some(t => lc(t) === lc(text))) { arr.push(text); added++; }
          } else if (a.kind === "category") {
            target.categories = target.categories || [];
            if (!target.categories.some(c => lc(c && c.name || c) === lc(text))) {
              target.categories.push({ name: text, desc });
              added++;
            }
          } else if (a.kind === "constraint" && a.mode && a.level) {
            target.constraints = target.constraints || {};
            target.constraints[a.mode] = target.constraints[a.mode] || {};
            const arr = (target.constraints[a.mode][a.level] = target.constraints[a.mode][a.level] || []);
            if (!arr.some(c => lc(c) === lc(text))) { arr.push(text); added++; }
          } else if (a.kind === "exercise" && a.mode && a.level) {
            target.exercises = target.exercises || {};
            target.exercises[a.mode] = target.exercises[a.mode] || {};
            const arr = (target.exercises[a.mode][a.level] = target.exercises[a.mode][a.level] || []);
            if (!arr.some(e => lc(e && e.name) === lc(text))) {
              arr.push({ name: text, desc });
              added++;
            }
          }
        }
      }
    } catch (e) { /* malformed localStorage — ignore */ }

    // Hides — strip items the user has chosen not to see.
    try {
      const raw = localStorage.getItem("acto-user-hidden:v1");
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        for (const h of list) {
          if (!h || h.locale !== locale) continue;
          const text = (h.text || "").trim();
          if (!text) continue;

          if (h.kind === "theme" && h.level && target.themes && target.themes[h.level]) {
            const before = target.themes[h.level].length;
            target.themes[h.level] = target.themes[h.level].filter(t => lc(t) !== lc(text));
            hidden += before - target.themes[h.level].length;
          } else if (h.kind === "category" && target.categories) {
            const before = target.categories.length;
            target.categories = target.categories.filter(c => lc(c && c.name || c) !== lc(text));
            hidden += before - target.categories.length;
          } else if (h.kind === "constraint" && h.mode && h.level
                     && target.constraints && target.constraints[h.mode]
                     && target.constraints[h.mode][h.level]) {
            const arr = target.constraints[h.mode][h.level];
            const before = arr.length;
            target.constraints[h.mode][h.level] = arr.filter(c => lc(c) !== lc(text));
            hidden += before - target.constraints[h.mode][h.level].length;
          } else if (h.kind === "exercise" && h.mode && h.level
                     && target.exercises && target.exercises[h.mode]
                     && target.exercises[h.mode][h.level]) {
            const arr = target.exercises[h.mode][h.level];
            const before = arr.length;
            target.exercises[h.mode][h.level] = arr.filter(e => lc(e && e.name) !== lc(text));
            hidden += before - target.exercises[h.mode][h.level].length;
          }
        }
      }
    } catch (e) { /* ignore */ }

    return { added, hidden };
  }

  /* ============================================================
     5. BOOT
     ============================================================ */
  function boot() {
    if (!window.IMPRO_BUNDLE) {
      console.error("IMPRO_BUNDLE missing — make sure data/all.js loaded before js/app.js.");
      return;
    }

    applyTranslations();

    $$(".mode-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $$(".level-btn").forEach(b => b.addEventListener("click", () => setLevel(b.dataset.level)));
    // Sync the initial mode so CSS card-order classes apply on first paint.
    setMode(state.mode);

    /* Themes mode toggle + modal */
    $$(".themes-mode-btn").forEach(b =>
      b.addEventListener("click", () => setThemesMode(b.dataset.themesMode))
    );
    const __themesEditBtn = $("#themesEditBtn");
    if (__themesEditBtn) __themesEditBtn.addEventListener("click", openThemesDialog);
    const __themesDlg     = $("#themesDialog");
    const __themesDlgClose= $("#themesDlgClose");
    const __themesDlgSave = $("#themesDlgSave");
    const __themesDlgClear= $("#themesDlgClear");
    const __themesInput   = $("#themesInput");
    if (__themesDlgClose) __themesDlgClose.addEventListener("click", closeThemesDialog);
    if (__themesDlg) __themesDlg.addEventListener("click", (e) => { if (e.target === __themesDlg) closeThemesDialog(); });
    if (__themesDlgClear) __themesDlgClear.addEventListener("click", () => {
      if (__themesInput) { __themesInput.value = ""; __themesInput.focus(); }
      refreshThemeStatus();
    });
    if (__themesDlgSave) __themesDlgSave.addEventListener("click", () => {
      refreshThemeStatus();
      closeThemesDialog();
    });
    if (__themesInput) __themesInput.addEventListener("input", refreshThemeStatus);
    // Initialize hidden state of custom row
    setThemesMode(state.useCustom ? "custom" : "random");

    /* Roster wiring — three triggers (Troupe, Match Team A, Match Team B)
       all share the same dialog. The clicked button decides which roster
       gets edited. */
    const __rosterEditBtn  = $("#rosterEditBtn");
    const __rosterEditBtnA = $("#rosterEditBtnA");
    const __rosterEditBtnB = $("#rosterEditBtnB");
    const __rosterDlg     = $("#rosterDialog");
    const __rosterClose   = $("#rosterDialogClose");
    const __rosterCancel  = $("#rosterCancelBtn");
    const __rosterSave    = $("#rosterSaveBtn");
    const __rosterSearch  = $("#rosterSearchInput");
    const __rosterAdHocIn = $("#rosterAdHocInput");
    const __rosterAdHocBtn= $("#rosterAdHocAddBtn");
    if (__rosterEditBtn)  __rosterEditBtn.addEventListener("click",  () => openRosterDialog("troupe"));
    if (__rosterEditBtnA) __rosterEditBtnA.addEventListener("click", () => openRosterDialog("a"));
    if (__rosterEditBtnB) __rosterEditBtnB.addEventListener("click", () => openRosterDialog("b"));
    if (__rosterClose)   __rosterClose.addEventListener("click", closeRosterDialog);
    if (__rosterCancel)  __rosterCancel.addEventListener("click", closeRosterDialog);
    if (__rosterSave)    __rosterSave.addEventListener("click", saveRoster);
    if (__rosterDlg)     __rosterDlg.addEventListener("click", (e) => { if (e.target === __rosterDlg) closeRosterDialog(); });

    // Saved-teams wiring (CRUD on the shared saved_teams table).
    const __savedSel    = $("#savedTeamsSelect");
    const __savedLoad   = $("#savedTeamsLoadBtn");
    const __savedUpdate = $("#savedTeamsUpdateBtn");
    const __savedDelete = $("#savedTeamsDeleteBtn");
    const __savedSave   = $("#savedTeamsSaveBtn");
    if (__savedSel)    __savedSel.addEventListener("change", syncSavedTeamsButtons);
    if (__savedLoad)   __savedLoad.addEventListener("click", loadSavedTeamIntoDraft);
    if (__savedUpdate) __savedUpdate.addEventListener("click", actionUpdateSelectedTeam);
    if (__savedDelete) __savedDelete.addEventListener("click", actionDeleteSelectedTeam);
    if (__savedSave)   __savedSave.addEventListener("click", actionSaveCurrentTeam);

    // Team-name input: refresh the availability hint on every keystroke
    // AND keep the matching main-page input (#teamA / #teamB / #teamTroupe)
    // in sync so the label visible behind the dialog updates live.
    const __rosterTeamName = $("#rosterTeamNameInput");
    if (__rosterTeamName) {
      __rosterTeamName.addEventListener("input", () => {
        refreshTeamNameStatus();
        const v = __rosterTeamName.value;
        if (rosterDraftTarget === "a" && $("#teamA")) {
          $("#teamA").value = v;
          persistTeamName("a", v);
          refreshRosterStatus();
        } else if (rosterDraftTarget === "b" && $("#teamB")) {
          $("#teamB").value = v;
          persistTeamName("b", v);
          refreshRosterStatus();
        } else if (rosterDraftTarget === "troupe" && $("#teamTroupe")) {
          $("#teamTroupe").value = v;
          persistTeamName("troupe", v);
          refreshRosterStatus();
        }
      });
    }
    if (__rosterSearch) {
      __rosterSearch.addEventListener("input", () => {
        clearTimeout(rosterSearchTimer);
        const q = __rosterSearch.value;
        rosterSearchTimer = setTimeout(() => searchRosterUsers(q), 200);
      });
    }
    function commitAdHoc() {
      if (!__rosterAdHocIn) return;
      const name = (__rosterAdHocIn.value || "").trim();
      if (!name) return;
      // Don't add a duplicate ad-hoc name (case-insensitive).
      const key = name.toLowerCase();
      if (rosterDraft.some(p => !p.user_id && (p.nom_scene || "").toLowerCase() === key)) {
        __rosterAdHocIn.value = "";
        return;
      }
      rosterDraft.push({ nom_scene: name });
      __rosterAdHocIn.value = "";
      renderRosterDraftList();
    }
    if (__rosterAdHocBtn) __rosterAdHocBtn.addEventListener("click", commitAdHoc);
    if (__rosterAdHocIn) {
      __rosterAdHocIn.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commitAdHoc(); }
      });
    }

    /* Team-name persistence — same pattern for Match A, Match B AND
       Troupe so the troupe can be named ("Les Improbables") and the
       name shows up in the rosterStatus prefix on the main page. */
    const __teamA = $("#teamA"), __teamB = $("#teamB"), __teamTroupe = $("#teamTroupe");
    if (__teamA) {
      const saved = loadTeamNameFromStorage("a");
      if (saved) __teamA.value = saved;
      __teamA.addEventListener("input", () => {
        persistTeamName("a", __teamA.value);
        refreshRosterStatus();
        // Tirage banner shows the team name — re-render so renames
        // are visible immediately.
        refreshTirageBanner();
        refreshRecordingTeamIndicator();
      });
    }
    if (__teamB) {
      const saved = loadTeamNameFromStorage("b");
      if (saved) __teamB.value = saved;
      __teamB.addEventListener("input", () => {
        persistTeamName("b", __teamB.value);
        refreshRosterStatus();
        refreshTirageBanner();
        refreshRecordingTeamIndicator();
      });
    }
    if (__teamTroupe) {
      const saved = loadTeamNameFromStorage("troupe");
      if (saved) __teamTroupe.value = saved;
      __teamTroupe.addEventListener("input", () => {
        persistTeamName("troupe", __teamTroupe.value);
        refreshRosterStatus();
      });
    }
    refreshRosterStatus();

    /* Match d'impro rules dialog — content is populated based on the
       active locale at open time (translations live in RULES_CONTENT).
       Close paths: the X button in the header, click on the backdrop, or Esc. */
    const __rulesOpen      = $("#rulesBtn");
    const __rulesDlg       = $("#rulesDialog");
    const __rulesClose     = $("#rulesDialogClose");
    const __rulesBody      = $("#rulesBody");
    function openRulesDialog() {
      if (!__rulesDlg) return;
      if (dialogEl && dialogEl.open) dialogEl.close();
      const RULES = window.actoRules || { fr: "" };
      const lang = (RULES[store.locale] ? store.locale : "fr");
      const t = store.ui;
      const titleEl = $("#rulesDialogTitle");
      if (titleEl) titleEl.textContent = "📖 " + (t.rulesTitle || "Règles du match d'impro");
      if (__rulesBody) __rulesBody.innerHTML = RULES[lang];
      if (typeof __rulesDlg.showModal === "function") __rulesDlg.showModal();
      else __rulesDlg.setAttribute("open", "");
    }
    function closeRulesDialog() {
      if (!__rulesDlg) return;
      if (typeof __rulesDlg.close === "function") __rulesDlg.close();
      else __rulesDlg.removeAttribute("open");
    }
    if (__rulesOpen)  __rulesOpen.addEventListener("click", openRulesDialog);
    if (__rulesClose) __rulesClose.addEventListener("click", closeRulesDialog);
    if (__rulesDlg)   __rulesDlg.addEventListener("click", (e) => { if (e.target === __rulesDlg) closeRulesDialog(); });

    $("#generateBtn").addEventListener("click", generateAll);

    /* === Edit-value dialog (✎ button on each card) ===
       Lets the user override the picked Theme / Constraint / Category /
       Exercise. If the typed value isn't in the bundled pool, it's also
       submitted to the admin via the submit_user_text RPC. */
    const __evDlg     = $("#editValueDialog");
    const __evInput   = $("#editValueInput");
    const __evClose   = $("#editValueClose");
    const __evCancel  = $("#editValueCancel");
    const __evSave    = $("#editValueSave");
    const __evStatus  = $("#editValueStatus");
    // Description support — only meaningful for exercise/category cards.
    const __evDescWrap   = $("#editValueDescWrap");
    const __evDescLabel  = $("#editValueDescLabel");
    const __evDescInput  = $("#editValueDescInput");

    function openEditValueDialog(target) {
      if (!__evDlg) return;
      const t = store.ui;
      const labelMap = {
        theme:      t.cardTheme      || "Thème",
        constraint: t.cardConstraint || "Contrainte",
        category:   t.cardCategory   || "Catégorie",
        exercise:   t.cardExercise   || "Exercice"
      };
      // The dialog is now a pure "suggest a new entry to the admin" flow —
      // we no longer pre-fill the input with the rolled value. The user
      // types a brand-new theme/constraint/category/exercise; on save it
      // creates a pending user_submission, the admin reviews it, and once
      // approved it joins the bundled pool for everyone.
      $("#editValueTitle").textContent = (t.editValueTitle || "Ajouter") + " — " + labelMap[target];
      $("#editValueLabel").textContent = labelMap[target];
      $("#editValueHelp").textContent  = t.editValueHelp || "Ta proposition sera envoyée à l'admin pour validation.";
      $("#editValueCancel").textContent = t.rosterCancel || "Annuler";
      $("#editValueSave").textContent   = t.editValueSave || "Soumettre";
      __evInput.value = "";
      __evStatus.hidden = true;
      __evStatus.textContent = "";
      __evStatus.classList.remove("error");
      // Description field: only show for exercise/category targets so the
      // user can explain how the new exercise/category works.
      const showDesc = (target === "exercise" || target === "category");
      if (__evDescWrap) __evDescWrap.hidden = !showDesc;
      if (showDesc) {
        if (__evDescLabel) __evDescLabel.textContent = t.editValueDescLabel || "Description";
        if (__evDescInput) {
          __evDescInput.placeholder = t.editValueDescPlaceholder || "";
          __evDescInput.value = "";
        }
      } else if (__evDescInput) {
        __evDescInput.value = "";
      }
      __evDlg.dataset.editTarget = target;
      if (typeof __evDlg.showModal === "function") __evDlg.showModal();
      else __evDlg.setAttribute("open", "");
      setTimeout(() => __evInput.focus(), 50);
    }

    function closeEditValueDialog() {
      if (!__evDlg) return;
      if (typeof __evDlg.close === "function") __evDlg.close();
      else __evDlg.removeAttribute("open");
    }

    /** True if `value` is already present in the bundled pool for `target`,
     *  case-insensitive. Used to decide whether to submit it to the admin. */
    function isValueInPool(target, value) {
      const pool = poolFor(target) || [];
      const v = String(value || "").trim().toLowerCase();
      return pool.some(p => {
        const pv = (typeof p === "object") ? (p && p.name) : p;
        return String(pv || "").trim().toLowerCase() === v;
      });
    }

    /** Persist a new entry to the user's local pool (visible only to them
     *  on this device + on /mes-impros). De-dupes case-insensitively against
     *  the existing list so a re-submit doesn't pile up duplicates. The
     *  shape mirrors what applyUserLocalPool() reads back. */
    function pushUserLocalAddition(entry) {
      try {
        const raw = localStorage.getItem("acto-user-added:v1");
        const list = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(list) ? list : [];
        const lc = (s) => String(s || "").trim().toLowerCase();
        const dupe = arr.some(a =>
          a && a.kind === entry.kind
          && (a.mode  || "") === (entry.mode  || "")
          && (a.level || "") === (entry.level || "")
          && a.locale === entry.locale
          && lc(a.text) === lc(entry.text)
        );
        if (!dupe) arr.push(entry);
        localStorage.setItem("acto-user-added:v1", JSON.stringify(arr));
      } catch (e) { /* localStorage full / unavailable — silent */ }
    }

    async function saveEditValue() {
      const target = __evDlg && __evDlg.dataset.editTarget;
      if (!target) return;
      const t = store.ui;
      const value = (__evInput.value || "").trim();
      if (!value) {
        __evStatus.textContent = t.editValueErrorEmpty || "Le texte est obligatoire.";
        __evStatus.classList.add("error");
        __evStatus.hidden = false;
        return;
      }
      // Description is collected only for exercise/category targets where
      // a "how does it work" explanation makes sense.
      const wantsDesc = (target === "exercise" || target === "category");
      const desc = wantsDesc ? (__evDescInput && __evDescInput.value || "").trim() : "";

      // Reject duplicates against the current pool so the user gets a clear
      // message instead of a silent no-op.
      if (isValueInPool(target, value)) {
        __evStatus.textContent = t.editValueErrorDuplicate
          || "Cette entrée existe déjà dans la liste.";
        __evStatus.classList.add("error");
        __evStatus.hidden = false;
        return;
      }

      // (kind, mode, level) tuple used by both submit_user_text and the
      // local pool. Theme: level only. Category: mode='match' only. Both
      // constraint and exercise: mode + level from the current generation.
      const meta = {
        kind:   target,
        mode:   (target === "exercise" || target === "constraint") ? state.mode
              : (target === "category" ? "match" : ""),
        level:  (target === "exercise" || target === "constraint" || target === "theme") ? state.level
              : "",
        locale: store.locale || "fr",
        text:   value,
        desc:   wantsDesc ? desc : ""
      };

      // 1) Apply locally: override the rolled value so the impro proceeds
      //    with what the user typed. (Restores the pre-2026-05 behavior.)
      if (target === "theme") {
        state.currentTheme = value;
      } else if (target === "constraint") {
        state.currentConstraint = value;
      } else {
        state.currentExercise = {
          name: value,
          desc: desc || (state.currentExercise && state.currentExercise.desc) || ""
        };
        if (target === "category") state.currentCategory = state.currentExercise;
      }
      // Update the visible reel without re-spinning.
      const trackEl = $("#reel-" + target);
      if (trackEl) {
        trackEl.style.transition = "none";
        trackEl.style.transform = "translateY(0)";
        trackEl.innerHTML = `<div class="reel-item final">${escapeHtml(value)}</div>`;
      }
      const metaEl = $("#meta-" + target);
      if (metaEl && (target === "category" || target === "exercise")) {
        metaEl.textContent = (state.currentExercise && state.currentExercise.desc) || "";
      }
      saveLastImpro();

      // 2) Persist in the user's per-device additions list. The next time
      //    applyUserLocalPool() runs (locale change, page reload), this
      //    entry shows up in /mes-impros and is eligible for future rolls.
      pushUserLocalAddition(meta);

      // 3) Submit to admin queue — this is the part that needs auth + RPC.
      //    If the user is signed out, we still want (1) and (2) to take
      //    effect, but skip the submit and tell them so. RPC errors here
      //    don't roll back the local-pool addition: the local data is
      //    durable, the admin propagation is best-effort.
      if (!(window.actoSupabase && window.actoAuth && window.actoAuth.state.user)) {
        __evStatus.textContent = t.editValueErrorNotSignedIn
          || "Connecte-toi pour soumettre la proposition à l'admin (l'entrée a été ajoutée localement).";
        __evStatus.classList.add("error");
        __evStatus.hidden = false;
        return;
      }

      // Disable buttons during RPC so a fast double-click can't create dupes.
      const saveBtn   = $("#editValueSave");
      const cancelBtn = $("#editValueCancel");
      const originalSaveLabel = saveBtn ? saveBtn.textContent : "";
      if (saveBtn)   { saveBtn.disabled = true; saveBtn.textContent = t.editValueSaving || "Envoi…"; }
      if (cancelBtn) cancelBtn.disabled = true;
      __evStatus.hidden = true; __evStatus.classList.remove("error"); __evStatus.textContent = "";

      try {
        const { error } = await Promise.resolve(window.actoSupabase.rpc("submit_user_text", {
          p_kind:        meta.kind,
          p_mode:        meta.mode,
          p_level:       meta.level,
          p_locale:      meta.locale,
          p_text:        meta.text,
          p_description: wantsDesc ? (desc || null) : null
        }));
        if (error) throw error;
        __evStatus.textContent = t.editValueSubmitted
          || "✓ Ajouté à ta liste et proposé à l'admin pour tous.";
        __evStatus.classList.remove("error");
        __evStatus.hidden = false;
        if (saveBtn)   { saveBtn.disabled = false; saveBtn.textContent = originalSaveLabel; }
        if (cancelBtn) cancelBtn.disabled = false;
        setTimeout(closeEditValueDialog, 1200);
      } catch (err) {
        // Local override + local pool already happened — only the admin
        // propagation failed. Tell the user that's a partial success.
        console.warn("submit_user_text failed", err);
        const failLbl = t.editValueSubmitFailed || "Échec de la soumission à l'admin";
        __evStatus.textContent = (err && err.message)
          ? failLbl + " : " + err.message
          : failLbl + ".";
        __evStatus.classList.add("error");
        __evStatus.hidden = false;
        if (saveBtn)   { saveBtn.disabled = false; saveBtn.textContent = originalSaveLabel; }
        if (cancelBtn) cancelBtn.disabled = false;
      }
    }

    if (__evClose)  __evClose.addEventListener("click",  closeEditValueDialog);
    if (__evCancel) __evCancel.addEventListener("click", closeEditValueDialog);
    if (__evSave)   __evSave.addEventListener("click",   saveEditValue);
    if (__evDlg)    __evDlg.addEventListener("click", (e) => { if (e.target === __evDlg) closeEditValueDialog(); });
    if (__evInput) {
      __evInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveEditValue(); }
      });
    }
    $$(".card-edit").forEach((b) =>
      b.addEventListener("click", () => {
        if (state.isGenerating) return;
        openEditValueDialog(b.dataset.edit);
      })
    );

    $$(".card-reroll").forEach((b) =>
      b.addEventListener("click", async () => {
        if (state.isGenerating) return;
        const target = b.dataset.reroll;
        if (target === "chrono") {
          chronoReset();
          state.currentDurationSec = pickDurationSec();
          state.chronoTotal = state.currentDurationSec;
          state.chronoRemaining = state.chronoTotal;
          const display = $("#chronoDisplay");
          if (display) display.textContent = formatMMSS(state.chronoTotal);
          saveLastImpro();
          return;
        }
        if (target === "nature") {
          // Nature has no slot reel — just re-pick + refresh the banner.
          pickFor("nature");
          // Match Comparée only: any change to the nature implies a
          // fresh setup, so we re-roll the first-starter and clear
          // the "this team has already recorded" tracking. Mixte wins
          // → these are no-ops (the banner just hides).
          if (state.mode === "match" && /compar/i.test(state.currentNature || "")) {
            state.firstStarter = (Math.random() < 0.5) ? "a" : "b";
            state.currentRecordingTeam = state.firstStarter;
            state.recordedTeamsSet = new Set();
          }
          refreshNatureBanner();
          refreshRecordingTeamIndicator();
          saveLastImpro();
          return;
        }
        b.disabled = true;
        await spinTarget(target, 0);
        b.disabled = false;
        if (target === "exercise") refreshAudienceCard();
        saveLastImpro();
      })
    );

    /* Duration picker controls */
    const __durChk = $("#durationRandomChk");
    const __durManual = $("#durationManualWrap");
    const __durSlider = $("#durationSlider");
    if (__durChk) {
      __durChk.addEventListener("change", (e) => {
        state.durationRandom = e.target.checked;
        if (__durManual) __durManual.hidden = state.durationRandom;
        // If user disabled random and chrono isn't running, reflect manual value live
        if (!state.durationRandom && !state.chronoRunning) {
          state.currentDurationSec = state.durationManualSec;
          chronoReset();
        }
      });
      if (__durManual) __durManual.hidden = state.durationRandom;
    }
    if (__durSlider) {
      __durSlider.max = LEVEL_MAX_DURATION[state.level] || 180;
      __durSlider.value = state.durationManualSec;
      __durSlider.addEventListener("input", (e) => {
        state.durationManualSec = Number(e.target.value);
        setText("durationValue", formatSec(state.durationManualSec));
        // Live-update the chrono so the user immediately sees their pick
        if (!state.durationRandom && !state.chronoRunning) {
          state.currentDurationSec = state.durationManualSec;
          chronoReset();
        }
      });
    }
    setText("durationValue", formatSec(state.durationManualSec));

    /* Chrono controls */
    const __cStart = $("#chronoStartBtn");
    const __cPause = $("#chronoPauseBtn");
    const __cReset = $("#chronoResetBtn");
    if (__cStart) __cStart.addEventListener("click", chronoStart);
    if (__cPause) __cPause.addEventListener("click", chronoPause);
    if (__cReset) __cReset.addEventListener("click", chronoReset);

    /* Audience controls */
    const __aTog = $("#audienceToggle");
    const __aSlider = $("#audienceIntervalSlider");
    const __aWrap = $("#audienceIntervalWrap");
    if (__aTog) {
      __aTog.addEventListener("change", (e) => {
        state.audienceEnabled = e.target.checked;
        if (__aWrap) __aWrap.hidden = !state.audienceEnabled;
        if (state.audienceEnabled && state.chronoRunning) startAudienceLoop();
        else stopAudienceLoop();
        const flash = $("#audienceFlash");
        if (flash && !state.audienceEnabled) flash.hidden = true;
      });
    }
    if (__aSlider) {
      __aSlider.addEventListener("input", (e) => {
        state.audienceIntervalSec = Number(e.target.value);
        setText("audienceIntervalValue", formatSec(state.audienceIntervalSec));
        if (state.audienceEnabled && state.chronoRunning) startAudienceLoop();
      });
    }

    /* Video recorder controls */
    const __recOpenBtn   = $("#recordOpenBtn");
    const __recRecBtn    = $("#recorderRecordBtn");
    const __recSwitch    = $("#recorderSwitchCamBtn");
    const __recPauseBtn  = $("#recorderPauseBtn");
    const __recStopBtn   = $("#recorderStopBtn");
    const __recCfmYes    = $("#recorderConfirmYes");
    const __recCfmNo     = $("#recorderConfirmNo");
    const __recExitBtn   = $("#recorderExitBtn");
    if (__recOpenBtn)  __recOpenBtn.addEventListener("click", recOpen);
    if (__recSwitch)   __recSwitch.addEventListener("click", recSwitchCamera);
    if (__recRecBtn)   __recRecBtn.addEventListener("click", () => {
      if (rec.isRecording) return;
      audio(); // unlock audio context on user gesture (required by mobile Safari)
      // Recording starts IMMEDIATELY so the 17s intro + 3-2-1 + logo flash
      // are all baked into the final video file (just like a real match).
      // The HTML #recorderPreCountdown overlay is skipped — the entire
      // ceremony is now drawn on the canvas itself.
      recStart();
      // The exercise / category description is shown DURING the intro
      // (below the value on its slide), so the floating popup is no longer
      // needed once recording starts. Hide it for the entire session.
      recHideExerciseDesc();
    });
    if (__recPauseBtn) __recPauseBtn.addEventListener("click", recPauseResume);
    if (__recStopBtn)  __recStopBtn.addEventListener("click", recRequestStop);
    if (__recCfmYes)   __recCfmYes.addEventListener("click", recConfirmStop);
    if (__recCfmNo)    __recCfmNo.addEventListener("click", recCancelStop);
    if (__recExitBtn)  __recExitBtn.addEventListener("click", recClose);

    // Participants editor inputs: live-update the filename whenever
    // the user tweaks team / actor names so the download has the
    // right name. The download <a> uses its `download` attribute, so
    // we just have to keep that attribute fresh.
    ["recParticipantsTeamA","recParticipantsTeamB","recParticipantsTroupeName",
     "recParticipantsActorsA","recParticipantsActorsB","recParticipantsTroupeActors"
    ].forEach(id => {
      const el = $("#" + id);
      if (!el) return;
      el.addEventListener("input", () => {
        const link = $("#recorderDownloadLink");
        if (link) link.download = computeRecordedVideoFilename(rec.videoExt || "webm");
      });
    });

    // Push the (possibly-edited) participants to the server right
    // before the file actually downloads. Fire-and-forget so the
    // browser doesn't delay the download.
    const __recDl = $("#recorderDownloadLink");
    if (__recDl) {
      __recDl.addEventListener("click", () => {
        try { pushRecorderParticipantsToServer(); } catch (e) { /* ignore */ }
      });
    }

    // Match Comparée: tirage banner flip button.
    const __tirageFlip = $("#tirageFlipBtn");
    if (__tirageFlip) __tirageFlip.addEventListener("click", flipFirstStarter);

    // Match Comparée: team selector chips. Clicking either chip
    // updates state.currentRecordingTeam (if recording isn't live yet)
    // and refreshes both the selector AND the floating indicator chip
    // inside the camera UI so the operator sees the change instantly.
    [["recorderTeamChipA", "a"], ["recorderTeamChipB", "b"]].forEach(([id, side]) => {
      const chip = $("#" + id);
      if (!chip) return;
      chip.addEventListener("click", () => {
        if (rec.isRecording) return;
        state.currentRecordingTeam = side;
        refreshRecordingTeamIndicator();
      });
    });

    // Match Comparée: "Record the other team" button on the preview
    // popup. Switches the active recording team to the one not yet
    // finalized, hides the popup, and re-opens the recorder for a
    // fresh capture. The first video stays available via the user's
    // download (already triggered on click), so we don't need to
    // preserve the old blob URL here.
    const __recOther = $("#recorderRecordOtherBtn");
    if (__recOther) {
      __recOther.addEventListener("click", async () => {
        const done = state.recordedTeamsSet;
        const next = (done && done.has("a")) ? "b"
                   : (done && done.has("b")) ? "a"
                   : (state.currentRecordingTeam === "a" ? "b" : "a");
        state.currentRecordingTeam = next;
        // Reset the camera/recorder UI to the idle state for a 2nd take.
        rec.chunks = [];
        rec.recorder = null;
        rec.isRecording = false;
        rec.isPaused = false;
        rec.elapsedBeforePause = 0;
        rec._chronoArmed = false;
        // The first impro consumed the chrono — reset it so the 2nd team
        // gets a fresh full-duration timer that starts on GO.
        try { chronoReset(); } catch (e) { /* ignore */ }
        recHidePreviewPopup();
        const stage = $("#recorderStage");
        if (stage) stage.classList.remove("recorder-stage-finished");
        if (rec.canvas) rec.canvas.style.display = "";
        recShowIdleControls();
        refreshRecordingTeamIndicator();
        // Re-open the camera (recOpen is idempotent — modal already
        // visible, recStartCamera replaces the existing stream).
        try { await recOpen(); } catch (e) { /* recOpen logs its own */ }
      });
    }

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        generateAll();
      }
    });

    initSettings();

    store.addEventListener("change", () => {
      if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.startViewTransition(applyTranslations);
      } else {
        applyTranslations();
      }
      // Locale changed → re-apply user-local prefs on the new locale's
      // pool, then re-fetch approved submissions if signed in.
      try {
        const b = window.IMPRO_BUNDLE;
        if (b && b.data && b.data[store.locale]) applyUserLocalPool(b.data[store.locale], store.locale);
      } catch (e) { /* ignore */ }
      if (window.actoAuth && window.actoAuth.state && window.actoAuth.state.user) {
        loadApprovedSubmissionsIntoBundle().catch(() => {});
      }
    });

    // Apply user-local pool prefs (additions + hides) NOW, regardless of
    // auth state — this is a per-device feature stored in localStorage,
    // so it has to work for logged-out users too.
    try {
      const b = window.IMPRO_BUNDLE;
      if (b && b.data && b.data[store.locale]) applyUserLocalPool(b.data[store.locale], store.locale);
    } catch (e) { /* ignore */ }

    // Phase 2: pull approved user submissions into the in-memory pool.
    // Runs on every auth state change (login/refresh/initial-session) so a
    // fresh page load picks them up as soon as the session resolves.
    if (window.actoSupabase && window.actoSupabase.auth) {
      window.actoSupabase.auth.onAuthStateChange((event, session) => {
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
            && session && session.user) {
          loadApprovedSubmissionsIntoBundle().catch(() => {});
        }
      });
      // The auth listener above only fires on *transitions*. If app.js boots
      // after auth.js has already restored a session, no event will arrive —
      // load now in that case.
      if (window.actoAuth && window.actoAuth.state && window.actoAuth.state.user) {
        loadApprovedSubmissionsIntoBundle().catch(() => {});
      }
    }

    // Re-paint the most recent impro from localStorage so the user keeps
    // their last picks across reloads / app-switches. Runs after all UI
    // wiring so setMode / chronoReset / refreshAudienceCard exist.
    try { restoreLastImpro(); } catch (e) { console.warn("[acto] restoreLastImpro failed", e); }
  }


  /* ============================================================
     6. VIDEO RECORDER (camera + canvas overlay + MediaRecorder)
     ============================================================ */
  const rec = {
    stream: null,
    videoEl: null,
    canvas: null,
    ctx: null,
    rafId: null,
    recorder: null,
    chunks: [],
    facingMode: "environment",
    isRecording: false,
    isPaused: false,
    startedAt: 0,
    elapsedBeforePause: 0,
    recTimerId: null,
    blobUrl: null,
    logoImg: null,
    logoLoaded: false
  };
  // Preload the brand logo (used as watermark)
  (function recPreloadLogo() {
    try {
      const img = new Image();
      img.onload  = () => { rec.logoLoaded = true; };
      img.onerror = () => { rec.logoLoaded = false; };
      img.src = "./assets/logo.png?v=20260541";
      rec.logoImg = img;
    } catch (e) { /* ignore */ }
  })();

  function recIsSupported() {
    return !!(navigator.mediaDevices &&
              navigator.mediaDevices.getUserMedia &&
              window.MediaRecorder &&
              window.HTMLCanvasElement.prototype.captureStream);
  }
  function recPickMime() {
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    for (const m of candidates) {
      try { if (window.MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
    }
    return "";
  }
  async function recOpen() {
    const t = store.ui;
    const modal = $("#recorderModal");
    if (!modal) return;
    if (!recIsSupported()) { recShowError(t.recordUnsupported || "Recording not supported", ""); modal.hidden = false; return; }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    rec.videoEl = $("#recorderVideo");
    rec.canvas  = $("#recorderCanvas");
    rec.ctx     = rec.canvas ? rec.canvas.getContext("2d") : null;
    recHideError();
    recHideConfirm();
    recHidePreviewPopup();
    recShowIdleControls();
    refreshRecordingTeamIndicator();
    await recStartCamera();
    // After the camera is live and the first frame has rendered (panel rect
    // known), pop the description in & let it follow the panel.
    setTimeout(() => {
      recShowExerciseDesc({ persistent: true });
      recPositionExerciseDesc();
    }, 120);
  }
  async function recStartCamera() {
    const t = store.ui;
    try {
      const constraints = {
        video: { facingMode: rec.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        // Explicit audio constraints (vs `audio: true`) so iOS / Android
        // honour them — without these, some mobile browsers silently route
        // the camera stream without a usable mic track.
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      rec.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (rec.stream.getAudioTracks().length === 0) {
        console.warn("[recorder] getUserMedia returned no audio track — mic permission may have been denied");
      }
      if (rec.videoEl) {
        rec.videoEl.srcObject = rec.stream;
        await rec.videoEl.play().catch(() => {});
      }
      recDrawLoop();
    } catch (e) {
      let hint = "";
      if (location && location.protocol === "file:") hint = t.recordHttpsHint || "";
      recShowError((t.recordCamError || "Camera error") + " (" + (e && e.name ? e.name : "Error") + ")", hint);
    }
  }
  function recStopCamera() {
    if (rec.rafId) cancelAnimationFrame(rec.rafId);
    rec.rafId = null;
    if (rec.stream) {
      rec.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      rec.stream = null;
    }
    if (rec.videoEl) {
      try { rec.videoEl.pause(); } catch (e) {}
      rec.videoEl.srcObject = null;
    }
  }
  function recDrawLoop() {
    if (!rec.ctx || !rec.videoEl) return;
    const v = rec.videoEl;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    if (rec.canvas.width !== w || rec.canvas.height !== h) {
      rec.canvas.width = w; rec.canvas.height = h;
    }
    rec.ctx.drawImage(v, 0, 0, w, h);
    recDrawLogoWatermark(rec.ctx, w, h);

    // Cinematic pre-live ceremony — plays for the first PRE_LIVE_MS of every
    // recording. The user sees the official announcement (intro), then the
    // 3-2-1, then a logo flourish, all baked into the video file. When the
    // recording is paused (rec.startedAt = 0) we treat the ceremony as
    // frozen at its last elapsed value.
    if (rec.isRecording) {
      const liveSession = rec.startedAt > 0 ? (Date.now() - rec.startedAt) : 0;
      const elapsed = liveSession + (rec.elapsedBeforePause || 0);
      if (elapsed < PRE_LIVE_MS) {
        recMaybeTriggerIntroSounds(elapsed);
        const phase = recIntroPhase(elapsed);
        if (phase === "intro")          recDrawIntro(rec.ctx, w, h, elapsed);
        else if (phase === "countdown") recDrawCountdown(rec.ctx, w, h, elapsed);
        else                            recDrawGoFlash(rec.ctx, w, h, elapsed);
        // No top-right cycling overlay or description popup during the ceremony.
        rec.rafId = requestAnimationFrame(recDrawLoop);
        return;
      }
    }

    // Live phase — usual overlays
    recDrawTopOverlay(rec.ctx, w, h);
    recDrawDescription(rec.ctx, w, h);
    recDrawBottomOverlay(rec.ctx, w, h);
    const __desc = document.getElementById("recorderExerciseDesc");
    if (__desc && !__desc.hidden) recPositionExerciseDesc();
    rec.rafId = requestAnimationFrame(recDrawLoop);
  }
  function recDrawLogoWatermark(ctx, w, h) {
    if (!rec.logoLoaded || !rec.logoImg) return;
    const isPortrait = h >= w;
    // A bit bigger than before, glued to the very corner.
    const logoW = isPortrait
      ? Math.min(Math.round(w * 0.20), 240)
      : Math.min(Math.round(w * 0.26), 300);
    const ratio = (rec.logoImg.naturalWidth && rec.logoImg.naturalHeight)
      ? rec.logoImg.naturalHeight / rec.logoImg.naturalWidth : 0.66;
    const logoH = Math.round(logoW * ratio);
    // Effectively zero left margin so the logo touches the corner.
    const x = 0;
    const y = Math.round(w * 0.003);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur  = Math.round(w * 0.022);
    ctx.shadowOffsetY = 3;
    ctx.globalAlpha = 0.96;
    try { ctx.drawImage(rec.logoImg, x, y, logoW, logoH); } catch (e) { /* ignore */ }
    ctx.restore();
  }

  // Draw the exercise description ON THE CANVAS (so it ends up in the recording).
  // Sits just under the top-right E/C/T panel, same width and background.
  // Body text uses the cyan EXERCICE accent color.
  function recDrawDescription(ctx, w, h) {
    if (!rec.descShouldDraw) return;
    if (!state.currentExercise || !state.currentExercise.desc) return;
    if (rec.panelBottomY == null || rec.panelLeftX == null || !rec.panelWidth) return;
    const baseDim = Math.min(w, h);
    const fs      = Math.max(13, Math.round(baseDim * 0.026));
    const padX    = Math.round(baseDim * 0.022);
    const padY    = Math.round(baseDim * 0.022);
    const lineGap = Math.round(baseDim * 0.005);
    const radius  = Math.round(baseDim * 0.022);
    const boxX    = rec.panelLeftX;
    const boxW    = rec.panelWidth;
    const maxTextW = boxW - padX * 2;
    ctx.font = "500 " + fs + 'px Inter, "Helvetica Neue", sans-serif';
    const lines = recWrapText(ctx, state.currentExercise.desc, maxTextW);
    if (!lines.length) return;
    const boxH = padY * 2 + lines.length * (fs + lineGap);
    const gap  = Math.round(baseDim * 0.014);
    const boxY = rec.panelBottomY + gap;
    ctx.fillStyle = "rgba(10, 6, 18, 0.78)";
    recRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = REC_COLORS.exercise;
    ctx.textAlign = "left";
    let y = boxY + padY;
    for (const line of lines) {
      y += fs;
      ctx.fillText(line, boxX + padX, y);
      y += lineGap;
    }
  }
  // recUpdateChronoChip removed — single canvas timer (bottom-center)
  // Helper: word-wrap text into lines that fit within maxW (current ctx font assumed)
  function recWrapText(ctx, text, maxW) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
      const trial = current ? current + " " + word : word;
      if (ctx.measureText(trial).width <= maxW || !current) {
        current = trial;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // Card accent colors (mirror styles.css :root --c-* variables)
  const REC_COLORS = {
    exercise:   "#6dd3c5",
    constraint: "#ffae5c",
    theme:      "#b794f4"
  };

  /* ============================================================
     6.5 RECORDER — INTRO CEREMONY (drawn ON the canvas, IN the recording)
     Order: 17s sexy intro (info reveal) → 3s countdown → 1s GO + logo
     After this, the cycling overlay (recDrawTopOverlay) takes over.
     ============================================================ */
  const INTRO_MS     = 17000;
  const COUNTDOWN_MS = 3000;
  const GO_MS        = 1000;
  const PRE_LIVE_MS  = INTRO_MS + COUNTDOWN_MS + GO_MS;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function recIntroPhase(elapsedMs) {
    if (elapsedMs < INTRO_MS)               return "intro";
    if (elapsedMs < INTRO_MS + COUNTDOWN_MS) return "countdown";
    if (elapsedMs < PRE_LIVE_MS)             return "go";
    return "live";
  }

  /**
   * Items shown one-by-one during the 17s intro. Mirrors the official
   * referee announcement order for Match (Nature → Thème → Joueurs →
   * Catégorie → Durée), and the matching flow for Troupe (Exercice →
   * Contrainte → Thème → Durée).
   *
   * The Catégorie slide (Match) and Exercice slide (Troupe) carry the
   * description text in `desc`, rendered below the value during the intro
   * so the spectator gets the rule explanation as part of the announcement.
   */
  function recBuildIntroItems() {
    const t = store.ui;
    const ex = state.currentExercise || {};
    const items = [];
    if (state.mode === "match") {
      if (state.currentNature) items.push({
        label: (t.cardNature || "Nature").toUpperCase(),
        value: state.currentNature
      });
      if (state.currentTheme) items.push({
        label: (t.recordOverlayTheme || "Thème").toUpperCase(),
        value: state.currentTheme
      });
      if (state.currentPlayers) items.push({
        label: (t.cardPlayers || "Joueurs").toUpperCase(),
        value: state.currentPlayers
      });
      if (ex.name) items.push({
        label: (t.cardCategory || "Catégorie").toUpperCase(),
        value: ex.name,
        desc:  ex.desc || ""
      });
    } else {
      if (ex.name) items.push({
        label: (t.recordOverlayExercise || "Exercice").toUpperCase(),
        value: ex.name,
        desc:  ex.desc || ""
      });
      if (state.currentConstraint) items.push({
        label: (t.recordOverlayCons || "Contrainte").toUpperCase(),
        value: state.currentConstraint
      });
      if (state.currentTheme) items.push({
        label: (t.recordOverlayTheme || "Thème").toUpperCase(),
        value: state.currentTheme
      });
    }
    // Both modes always end with the duration — it's the last thing the
    // referee announces before signalling the caucus.
    if (state.currentDurationSec) items.push({
      label: (t.cardDuration || "Durée").toUpperCase(),
      value: formatSec(state.currentDurationSec)
    });
    return items;
  }

  function recDrawIntro(ctx, w, h, elapsedMs) {
    const items = recBuildIntroItems();
    if (!items.length) return;
    const slotMs   = INTRO_MS / items.length;
    const slotIdx  = Math.min(items.length - 1, Math.floor(elapsedMs / slotMs));
    const inSlotMs = elapsedMs - slotIdx * slotMs;
    const item     = items[slotIdx];

    const IN_MS  = 600;
    const OUT_MS = 600;
    const holdMs = slotMs - IN_MS - OUT_MS;
    let opacity = 1, scale = 1, ty = 0;
    if (inSlotMs < IN_MS) {
      const e = easeOutCubic(inSlotMs / IN_MS);
      opacity = e;
      scale   = 0.85 + 0.15 * e;
      ty      = 60 * (1 - e);
    } else if (inSlotMs > IN_MS + holdMs) {
      const e = easeOutCubic(Math.min(1, (inSlotMs - IN_MS - holdMs) / OUT_MS));
      opacity = 1 - e;
      scale   = 1 - 0.15 * e;
      ty      = -60 * e;
    }

    // Stage curtain — darkens the camera so the text reads cleanly.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);

    const baseDim   = Math.min(w, h);
    const labelSize = Math.max(20, Math.round(baseDim * 0.034));
    const valueSize = Math.max(48, Math.round(baseDim * 0.10));
    const descSize  = Math.max(16, Math.round(baseDim * 0.024));
    const maxTextW  = w * 0.85;
    const maxDescW  = w * 0.78;

    // Pre-wrap value + optional description so we can vertically center the
    // whole block (label + value + desc) around (w/2, h/2 + ty).
    ctx.font = "400 " + valueSize + 'px "Bebas Neue", Inter, sans-serif';
    const valueLines = recWrapText(ctx, item.value, maxTextW);
    ctx.font = "400 " + descSize + 'px Inter, "Helvetica Neue", sans-serif';
    const descLines = item.desc ? recWrapText(ctx, item.desc, maxDescW) : [];

    const valueBlockH = valueLines.length * valueSize * 0.95;
    const descBlockH  = descLines.length  * (descSize * 1.25);
    const totalH      = labelSize + valueSize * 0.4 + valueBlockH
                      + (descBlockH ? descSize * 1.2 + descBlockH : 0);
    const startY = -totalH / 2;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(w / 2, h / 2 + ty);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";

    // LABEL (gold, above the value)
    ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
    ctx.fillStyle = "#f5c451";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 14;
    let yCursor = startY + labelSize;
    ctx.fillText(item.label, 0, yCursor);
    yCursor += valueSize * 0.4;

    // VALUE (white, huge, with a warm gold glow)
    ctx.font = "400 " + valueSize + 'px "Bebas Neue", Inter, sans-serif';
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(245,196,81,0.65)";
    ctx.shadowBlur = 28;
    for (const line of valueLines) {
      yCursor += valueSize * 0.95;
      ctx.fillText(line, 0, yCursor);
    }

    // DESCRIPTION (smaller, soft white) — only on slides that carry desc
    // (Catégorie in Match, Exercice in Troupe). Mirrors the rule explanation
    // a referee or coach would give just after announcing the category.
    if (descLines.length) {
      yCursor += descSize * 1.2;
      ctx.font = "400 " + descSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 10;
      for (const line of descLines) {
        yCursor += descSize * 1.25;
        ctx.fillText(line, 0, yCursor);
      }
    }
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function recDrawCountdown(ctx, w, h, elapsedMs) {
    const phaseMs = elapsedMs - INTRO_MS;
    const second  = Math.min(2, Math.floor(phaseMs / 1000));
    const number  = String(3 - second); // "3", "2", "1"
    const t       = (phaseMs - second * 1000) / 1000;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);

    const baseDim = Math.min(w, h);
    const fs = Math.round(baseDim * 0.4);

    // Each tick: scale 0.6 → 1.15, opacity 1 → 0.6 over 1 second
    const e = easeOutCubic(Math.min(1, t));
    const scale   = 0.6 + 0.55 * e;
    const opacity = 1 - 0.4 * e;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "400 " + fs + 'px "Bebas Neue", Inter, sans-serif';
    ctx.fillStyle = "#f5c451";
    ctx.shadowColor = "rgba(245,196,81,0.6)";
    ctx.shadowBlur = 40;
    ctx.fillText(number, 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";
  }

  function recDrawGoFlash(ctx, w, h, elapsedMs) {
    const phaseMs = elapsedMs - INTRO_MS - COUNTDOWN_MS;
    const t = Math.min(1, phaseMs / GO_MS);

    // Quick white flash for the first 150ms, then dark stage.
    if (t < 0.15) {
      const a = 0.65 * (1 - t / 0.15);
      ctx.fillStyle = "rgba(255,255,255," + a + ")";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, w, h);
    }

    // Logo enters: fade in 0.15-0.45, hold 0.45-0.85, fade out 0.85-1
    let alpha;
    if (t < 0.15) alpha = 0;
    else if (t < 0.45) alpha = (t - 0.15) / 0.30;
    else if (t < 0.85) alpha = 1;
    else              alpha = (1 - t) / 0.15;

    if (rec.logoLoaded && rec.logoImg) {
      const baseDim = Math.min(w, h);
      const logoW = Math.round(baseDim * 0.55);
      const ratio = (rec.logoImg.naturalWidth && rec.logoImg.naturalHeight)
        ? rec.logoImg.naturalHeight / rec.logoImg.naturalWidth : 0.66;
      const logoH = Math.round(logoW * ratio);
      const x = (w - logoW) / 2;
      const y = (h - logoH) / 2;
      // Subtle scale-up on entry
      const eIn = easeOutCubic(Math.min(1, (t - 0.15) / 0.30));
      const scale = 0.92 + 0.08 * eIn;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.shadowColor = "rgba(245,196,81,0.85)";
      ctx.shadowBlur  = 70;
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      try { ctx.drawImage(rec.logoImg, -logoW / 2, -logoH / 2, logoW, logoH); } catch (e) {}
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  /** Trigger countdown / GO sounds at the right moments. Idempotent: each
   *  cue plays at most once per recording session. The chrono is also
   *  armed here so it starts on "GO", not at the start of recording. */
  function recMaybeTriggerIntroSounds(elapsedMs) {
    const cdStart = INTRO_MS;
    if (!rec._tick3 && elapsedMs >= cdStart)               { rec._tick3 = true;   playTick(); }
    if (!rec._tick2 && elapsedMs >= cdStart + 1000)        { rec._tick2 = true;   playTick(); }
    if (!rec._tick1 && elapsedMs >= cdStart + 2000)        { rec._tick1 = true;   playTick(); }
    if (!rec._goPlayed && elapsedMs >= cdStart + 3000)     {
      rec._goPlayed = true;
      playGoSound();
    }
    // Start the chrono when the 3-2-1 ceremony ends (on "GO"). Using the
    // RAF-driven elapsed clock means the chrono naturally pauses with the
    // recorder — if the user pauses during the ceremony, elapsed freezes
    // and we won't fire chronoStart() until they resume and reach GO.
    if (!rec._chronoArmed && elapsedMs >= cdStart + 3000) {
      rec._chronoArmed = true;
      if (!state.chronoRunning && state.chronoTotal > 0) chronoStart();
    }
  }

  // Helper: rounded rectangle path
  function recRoundedRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /**
   * Build the ordered list of items the top-right overlay can show.
   * In Match mode we follow the official announcement order
   * (Thème → Joueurs → Catégorie). Items with empty/null values are skipped.
   */
  function recBuildOverlayItems() {
    const t = store.ui;
    const items = [];
    if (state.mode === "match") {
      // Match: official announcement order = Nature → Thème → Joueurs → Catégorie → Durée
      if (state.currentNature) {
        items.push({ key: "nature",
          label: (t.cardNature || "Nature").toUpperCase(),
          value: state.currentNature,
          color: REC_COLORS.theme });
      }
      if (state.currentTheme) {
        items.push({ key: "theme",
          label: (t.recordOverlayTheme || "Thème").toUpperCase(),
          value: state.currentTheme,
          color: REC_COLORS.theme });
      }
      if (state.currentPlayers) {
        items.push({ key: "players",
          label: (t.cardPlayers || "Joueurs").toUpperCase(),
          value: state.currentPlayers,
          color: REC_COLORS.constraint });
      }
      if (state.currentExercise && state.currentExercise.name) {
        items.push({ key: "category",
          label: (t.cardCategory || "Catégorie").toUpperCase(),
          value: state.currentExercise.name,
          color: REC_COLORS.exercise });
      }
    } else {
      // Troupe: Exercice → Contrainte → Thème → Durée
      if (state.currentExercise && state.currentExercise.name) {
        items.push({ key: "exercise",
          label: (t.recordOverlayExercise || "Exercice").toUpperCase(),
          value: state.currentExercise.name,
          color: REC_COLORS.exercise });
      }
      if (state.currentConstraint) {
        items.push({ key: "constraint",
          label: (t.recordOverlayCons || "Contrainte").toUpperCase(),
          value: state.currentConstraint,
          color: REC_COLORS.constraint });
      }
      if (state.currentTheme) {
        items.push({ key: "theme",
          label: (t.recordOverlayTheme || "Thème").toUpperCase(),
          value: state.currentTheme,
          color: REC_COLORS.theme });
      }
    }
    // Durée — last item of the announcement, both modes.
    if (state.currentDurationSec) {
      items.push({ key: "duration",
        label: (t.cardDuration || "Durée").toUpperCase(),
        value: formatSec(state.currentDurationSec),
        color: REC_COLORS.constraint });
    }
    return items;
  }

  /**
   * Draw a small (one-item) info card in the top-right corner. Used during
   * the cycling overlay while recording — each item appears for SLOT_VISIBLE
   * seconds, then disappears for SLOT_HIDDEN seconds, then the next item
   * cycles in. Loops forever until the recording stops.
   */
  function recDrawSingleItem(ctx, w, h, item) {
    const baseDim = Math.min(w, h);
    const subSize = Math.max(13, Math.round(baseDim * 0.026));
    const labelSize = Math.max(10, Math.round(baseDim * 0.018));
    const padX = Math.round(baseDim * 0.022);
    const padY = Math.round(baseDim * 0.022);
    const lineGap = Math.round(baseDim * 0.005);
    const isPortrait = h >= w;
    const maxBoxW = isPortrait
      ? Math.min(w * 0.78, 620)
      : Math.min(w * 0.50, 720);
    const maxTextW = maxBoxW - padX * 2;

    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    const lines = recWrapText(ctx, item.value, maxTextW);

    let blockW = 0;
    ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
    blockW = Math.max(blockW, ctx.measureText(item.label).width);
    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    for (const l of lines) blockW = Math.max(blockW, ctx.measureText(l).width);
    blockW = Math.min(blockW + padX * 2, maxBoxW);

    const blockH = padY * 2 + labelSize + lineGap + lines.length * (subSize + lineGap);
    const margin = Math.round(w * 0.025);
    const boxX = w - blockW - margin;
    const boxY = margin;

    ctx.fillStyle = "rgba(10, 6, 18, 0.78)";
    recRoundedRect(ctx, boxX, boxY, blockW, blockH, Math.round(baseDim * 0.022));
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "left";
    let y = boxY + padY;
    ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
    ctx.fillStyle = item.color;
    y += labelSize;
    ctx.fillText(item.label, boxX + padX, y);
    y += lineGap;

    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    ctx.fillStyle = "#fff";
    for (const line of lines) {
      y += subSize;
      ctx.fillText(line, boxX + padX, y);
      y += lineGap;
    }

    rec.panelTopY    = boxY;
    rec.panelLeftX   = boxX;
    rec.panelWidth   = blockW;
    rec.panelBottomY = boxY + blockH;
  }

  function recDrawTopOverlay(ctx, w, h) {
    const ex = state.currentExercise;
    const t  = store.ui;
    if (!ex && !state.currentConstraint && !state.currentTheme) return;

    // === Cycling mode: while recording (after the ceremony), show one item at a time ===
    if (rec.isRecording) {
      const items = recBuildOverlayItems();
      if (!items.length) return;
      const elapsedMs = (rec.startedAt > 0 ? Date.now() - rec.startedAt : 0)
                     + (rec.elapsedBeforePause || 0);
      // The cycling timer starts AFTER the ceremony, so subtract PRE_LIVE_MS.
      // (recDrawLoop already gates this branch, but extra safety.)
      const liveMs = elapsedMs - PRE_LIVE_MS;
      if (liveMs < 0) return;
      const liveSec = liveMs / 1000;
      const SLOT_VISIBLE = 3;  // seconds an item stays on screen
      const SLOT_HIDDEN  = 3;  // seconds the rectangle disappears between items
      const SLOT_TOTAL   = SLOT_VISIBLE + SLOT_HIDDEN;
      const cyclePeriod  = items.length * SLOT_TOTAL;
      const position     = liveSec % cyclePeriod;
      const slotIndex    = Math.floor(position / SLOT_TOTAL);
      const inSlot       = position % SLOT_TOTAL;
      if (inSlot >= SLOT_VISIBLE) {
        // Hidden phase — draw nothing. Keep the previous panel rect so the
        // exercise-description popup that follows it doesn't snap around.
        return;
      }
      recDrawSingleItem(ctx, w, h, items[slotIndex]);
      return;
    }

    // === Preview mode: render all sections (the recorder isn't recording yet) ===
    // Sizing — small text. Anchored on min(w, h) so portrait & landscape match.
    const baseDim   = Math.min(w, h);
    const titleSize = Math.max(16, Math.round(baseDim * 0.040));
    const subSize   = Math.max(13, Math.round(baseDim * 0.026));
    const labelSize = Math.max(10, Math.round(baseDim * 0.018));
    const padX      = Math.round(baseDim * 0.022);
    const padY      = Math.round(baseDim * 0.022);
    const lineGap   = Math.round(baseDim * 0.005);
    const sectionGap= Math.round(baseDim * 0.012);

    const isPortrait = h >= w;
    const maxBoxW = isPortrait
      ? Math.min(w * 0.78, 620)
      : Math.min(w * 0.50, 720);
    const maxTextW = maxBoxW - padX * 2;

    // Pre-wrap each section (title now uses subSize, same as body text)
    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    const titleLines = ex ? recWrapText(ctx, ex.name, maxTextW) : [];
    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    const consLines  = state.currentConstraint ? recWrapText(ctx, state.currentConstraint, maxTextW) : [];
    const themeLines = state.currentTheme      ? recWrapText(ctx, state.currentTheme,      maxTextW) : [];

    // Match mode only: a smaller sub-line under the constraint text showing
    // how many players are involved (e.g., "2 joueurs"). Mirrors the meta
    // line of the constraint card on the main page.
    const playerSize = Math.round(subSize * 0.85);
    ctx.font = "500 " + playerSize + 'px Inter, "Helvetica Neue", sans-serif';
    const playerLines = (state.mode === "match" && state.currentPlayers)
      ? recWrapText(ctx, state.currentPlayers, maxTextW)
      : [];

    // Compute longest line to size the bg
    let blockW = 0;
    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    for (const l of titleLines) blockW = Math.max(blockW, ctx.measureText(l).width);
    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    for (const l of consLines)  blockW = Math.max(blockW, ctx.measureText(l).width);
    for (const l of themeLines) blockW = Math.max(blockW, ctx.measureText(l).width);
    ctx.font = "500 " + playerSize + 'px Inter, "Helvetica Neue", sans-serif';
    for (const l of playerLines) blockW = Math.max(blockW, ctx.measureText(l).width);
    // In Match mode the exercise slot holds a Category, so the label flips.
    const titleLabel = state.mode === "match"
      ? (t.cardCategory || "Catégorie").toUpperCase()
      : (t.recordOverlayExercise || "Exercice").toUpperCase();
    ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
    if (titleLines.length) blockW = Math.max(blockW, ctx.measureText(titleLabel).width);
    if (consLines.length)  blockW = Math.max(blockW, ctx.measureText((t.recordOverlayCons || "Contrainte").toUpperCase()).width);
    if (themeLines.length) blockW = Math.max(blockW, ctx.measureText((t.recordOverlayTheme || "Thème").toUpperCase()).width);
    // Always use the full max width so the box has a predictable size
    // (and the HTML description popup below it can match exactly).
    blockW = maxBoxW;

    // Compute height (each section now has label + lines)
    let blockH = padY;
    if (titleLines.length) blockH += labelSize + lineGap + titleLines.length * (subSize + lineGap);
    if (consLines.length)  blockH += sectionGap + labelSize + lineGap + consLines.length  * (subSize + lineGap);
    // Player sub-line sits inside the constraint section — small extra gap then n lines.
    if (consLines.length && playerLines.length) {
      blockH += Math.round(lineGap * 1.5) + playerLines.length * (playerSize + lineGap);
    }
    if (themeLines.length) blockH += sectionGap + labelSize + lineGap + themeLines.length * (subSize + lineGap);
    blockH += padY;

    // Position: TOP-RIGHT corner (not interfering with the top-left logo)
    const margin = Math.round(w * 0.025);
    const boxX = w - blockW - margin;
    const boxY = margin;

    // Background
    ctx.fillStyle = "rgba(10, 6, 18, 0.78)";
    recRoundedRect(ctx, boxX, boxY, blockW, blockH, Math.round(baseDim * 0.022));
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw text inside
    ctx.textAlign = "left";
    let y = boxY + padY;

    if (titleLines.length) {
      ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = REC_COLORS.exercise;
      y += labelSize;
      ctx.fillText(titleLabel, boxX + padX, y);
      y += lineGap;
      ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = "#fff";
      for (const line of titleLines) {
        y += subSize;
        ctx.fillText(line, boxX + padX, y);
        y += lineGap;
      }
    }

    if (consLines.length) {
      y += sectionGap;
      ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = REC_COLORS.constraint;
      y += labelSize;
      ctx.fillText((t.recordOverlayCons || "Contrainte").toUpperCase(), boxX + padX, y);
      y += lineGap;
      ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = "#fff";
      for (const line of consLines) {
        y += subSize;
        ctx.fillText(line, boxX + padX, y);
        y += lineGap;
      }
      if (playerLines.length) {
        y += Math.round(lineGap * 1.5);
        ctx.font = "500 " + playerSize + 'px Inter, "Helvetica Neue", sans-serif';
        ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
        for (const line of playerLines) {
          y += playerSize;
          ctx.fillText(line, boxX + padX, y);
          y += lineGap;
        }
      }
    }

    if (themeLines.length) {
      y += sectionGap;
      ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = REC_COLORS.theme;
      y += labelSize;
      ctx.fillText((t.recordOverlayTheme || "Thème").toUpperCase(), boxX + padX, y);
      y += lineGap;
      ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = "#fff";
      for (const line of themeLines) {
        y += subSize;
        ctx.fillText(line, boxX + padX, y);
        y += lineGap;
      }
    }

    // Save panel rect (canvas-px) so the HTML description popup can position
    // itself directly below the panel without overlap.
    rec.panelTopY    = boxY;
    rec.panelLeftX   = boxX;
    rec.panelWidth   = blockW;
    rec.panelBottomY = boxY + blockH;
  }

  function recDrawBottomOverlay(ctx, w, h) {
    if (state.chronoTotal <= 0) return;
    const remaining = state.chronoRemaining > 0
      ? state.chronoRemaining
      : (state.chronoRunning ? 0 : state.chronoTotal);

    const baseDim = Math.min(w, h);
    const fs = Math.max(26, Math.round(baseDim * 0.075));
    const padX = Math.round(fs * 0.55);
    const padY = Math.round(fs * 0.22);
    const margin = Math.max(95, Math.round(baseDim * 0.10));

    const timeStr = formatMMSS(remaining);
    ctx.font = "400 " + fs + 'px "Bebas Neue", Inter, sans-serif';
    const tw = ctx.measureText(timeStr).width;
    const boxW = tw + padX * 2;
    const boxH = fs + padY * 2;
    const boxX = Math.round((w - boxW) / 2);
    // Centered on screen before recording starts; jumps to bottom-center as
    // soon as the recording begins (after the 3-2-1 countdown).
    const boxY = rec.isRecording
      ? (h - margin - boxH)
      : Math.round((h - boxH) / 2);

    let color = "#ffffff";
    if (state.chronoRemaining > 0 && state.chronoRemaining <= 10) color = "#f87171";
    else if (state.chronoRemaining > 0 && state.chronoRemaining <= 30) color = "#fbbf24";

    ctx.fillStyle = "rgba(10, 6, 18, 0.78)";
    recRoundedRect(ctx, boxX, boxY, boxW, boxH, boxH / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.fillText(timeStr, boxX + boxW / 2, boxY + boxH / 2 + Math.round(fs * 0.04));
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";
  }
    function recTrunc(text, maxW, ctx) {
    if (!text) return "";
    if (ctx.measureText(text).width <= maxW) return text;
    const ell = "…";
    let s = text;
    while (s.length > 4 && ctx.measureText(s + ell).width > maxW) s = s.slice(0, -1);
    return s + ell;
  }
  function recStart() {
    if (!rec.stream || rec.isRecording) return;
    const canvasStream = rec.canvas.captureStream(30);
    // Build the composite stream piece by piece: some MediaRecorder
    // implementations on iOS/Android silently drop audio when tracks are
    // passed via the `new MediaStream([...])` array form. addTrack() is the
    // reliable path on every browser.
    const composite = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => composite.addTrack(t));
    const audioTracks = rec.stream.getAudioTracks();
    audioTracks.forEach(t => composite.addTrack(t));
    if (audioTracks.length === 0) {
      console.warn("[recorder] no audio track on camera stream — recording will be silent");
    }
    const mime = recPickMime();
    try {
      const opts = { videoBitsPerSecond: 4_000_000 };
      if (mime) opts.mimeType = mime;
      // Always pin an audio bitrate when audio is present. Some mobile
      // encoders default to 0 (= no audio) when this option is missing.
      if (audioTracks.length > 0) opts.audioBitsPerSecond = 128_000;
      rec.recorder = new MediaRecorder(composite, opts);
    } catch (e) {
      const t = store.ui;
      recShowError((t.recordUnsupported || "Recording not supported") + " (" + e.message + ")", "");
      return;
    }
    rec.chunks = [];
    rec.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) rec.chunks.push(e.data); };
    rec.recorder.onstop = () => recFinalize();
    rec.recorder.start(1000);
    rec.isRecording = true;
    rec.isPaused = false;
    rec.startedAt = Date.now();
    rec.elapsedBeforePause = 0;
    // Reset the one-shot intro flags so the ceremony plays its sounds again
    // for this fresh recording session. `_chronoArmed` defers the chrono
    // start until the 3-2-1-GO ceremony ends — see recMaybeTriggerIntroSounds.
    rec._tick3 = rec._tick2 = rec._tick1 = rec._goPlayed = rec._chronoArmed = false;
    statsRecordStartTracking();
    // The team is locked once recording starts — hide the selector,
    // keep only the indicator chip visible.
    refreshRecorderTeamSelector();
    recShowActiveControls();
    recRefreshPauseLabel();
    const ind = $("#recorderRecIndicator");
    if (ind) ind.hidden = false;
    rec.recTimerId = setInterval(recUpdateRecElapsed, 500);
    // The chrono no longer starts here — it would race against the 20s
    // ceremony (intro 17s + countdown 3s) and burn most of a short impro
    // before "GO". Instead, recMaybeTriggerIntroSounds arms it exactly
    // when the GO sound plays.
  }
  function recUpdateRecElapsed() {
    const tEl = $("#recorderRecTime");
    if (!tEl) return;
    const baseMs = rec.elapsedBeforePause || 0;
    const live   = (rec.isPaused || !rec.startedAt) ? 0 : (Date.now() - rec.startedAt);
    tEl.textContent = formatMMSS(Math.floor((baseMs + live) / 1000));
  }
  function recPauseResume() {
    if (!rec.recorder) return;
    if (rec.recorder.state === "recording") {
      try { rec.recorder.pause(); } catch (e) { return; }
      rec.elapsedBeforePause += Date.now() - rec.startedAt;
      rec.startedAt = 0;
      rec.isPaused = true;
      statsRecordStopTracking();
      if (state.chronoRunning) chronoPause();
      recRefreshPauseLabel();
    } else if (rec.recorder.state === "paused") {
      try { rec.recorder.resume(); } catch (e) { return; }
      rec.startedAt = Date.now();
      rec.isPaused = false;
      statsRecordStartTracking();
      if (!state.chronoRunning && state.chronoRemaining > 0) chronoStart();
      recRefreshPauseLabel();
    }
  }
  function recRefreshPauseLabel() {
    const t = store.ui;
    const icon = $("#recorderPauseIcon");
    const lbl  = $("#recorderPauseLabel");
    if (rec.isPaused) {
      if (icon) icon.textContent = "▶";
      if (lbl)  lbl.textContent  = t.recordResumeBtn || "Resume";
    } else {
      if (icon) icon.textContent = "⏸";
      if (lbl)  lbl.textContent  = t.recordPauseBtn || "Pause";
    }
  }
  function recRequestStop() {
    // Show the confirm dialog
    const c = $("#recorderConfirm");
    if (c) c.hidden = false;
  }
  function recCancelStop()  { const c = $("#recorderConfirm"); if (c) c.hidden = true; }
  function recHideConfirm() { const c = $("#recorderConfirm"); if (c) c.hidden = true; }
  function recConfirmStop() {
    recHideConfirm();
    recStop();   // recorder.stop() → onstop → recFinalize()
  }
  function recStop() {
    if (!rec.recorder || rec.recorder.state === "inactive") return;
    try { rec.recorder.stop(); } catch (e) {}
    rec.isRecording = false;
    rec.isPaused = false;
    if (rec.recTimerId) { clearInterval(rec.recTimerId); rec.recTimerId = null; }
    const ind = $("#recorderRecIndicator");
    if (ind) ind.hidden = true;
    if (state.chronoRunning) chronoPause();
  }
  /** Sanitize a free-form name for use inside a filename. Strips
   *  diacritics, keeps letters/digits/spaces/dashes/underscores, and
   *  caps the length so the resulting filename stays usable on every
   *  filesystem. */
  function slugForFilename(s, max) {
    const cleaned = String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 _-]+/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return cleaned.slice(0, max || 30);
  }

  /** Build the filename for the just-recorded video using whatever the
   *  user has typed into the participants editor (falls back to the
   *  active rosters / team-name inputs if the editor is empty). For
   *  Match Comparée we name after the SINGLE team being recorded. */
  function computeRecordedVideoFilename(ext) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const segs = [];
    if (state.mode === "match") {
      const aName = ($("#recParticipantsTeamA") && $("#recParticipantsTeamA").value)
                 || ($("#teamA") && $("#teamA").value) || "";
      const bName = ($("#recParticipantsTeamB") && $("#recParticipantsTeamB").value)
                 || ($("#teamB") && $("#teamB").value) || "";
      const aSlug = slugForFilename(aName, 20);
      const bSlug = slugForFilename(bName, 20);
      const isComparee = /compar/i.test(state.currentNature || "");
      if (isComparee && state.currentRecordingTeam) {
        // Comparée → solo team name in the filename.
        const sideSlug = (state.currentRecordingTeam === "a") ? aSlug : bSlug;
        const fallback = (state.currentRecordingTeam === "a") ? "TeamA" : "TeamB";
        segs.push(sideSlug || fallback);
      } else if (aSlug || bSlug) {
        segs.push((aSlug || "TeamA") + "-vs-" + (bSlug || "TeamB"));
      }
    } else {
      const tName = ($("#recParticipantsTroupeName") && $("#recParticipantsTroupeName").value)
                 || ($("#teamTroupe") && $("#teamTroupe").value) || "";
      const tSlug = slugForFilename(tName, 25);
      if (tSlug) segs.push(tSlug);
      const actors = (($("#recParticipantsTroupeActors") && $("#recParticipantsTroupeActors").value) || "")
        .split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 3)
        .map(n => slugForFilename(n, 12)).filter(Boolean).join("-");
      if (actors) segs.push(actors);
    }
    segs.push(ts);
    return "acto-" + segs.filter(Boolean).join("-") + "." + (ext || "webm");
  }

  /** Show / update / hide the floating "🎬 Recording: Team X" chip
   *  inside the camera UI. Visible only in Match Comparée. */
  function refreshRecordingTeamIndicator() {
    const el = $("#recorderTeamIndicator");
    if (el) {
      const t = store.ui;
      const isCompareeMatch = state.mode === "match"
        && /compar/i.test(state.currentNature || "");
      if (!isCompareeMatch || !state.currentRecordingTeam) {
        el.hidden = true;
      } else {
        const name = teamDisplayName(state.currentRecordingTeam);
        const tpl = t.recordingTeamLabel || "🎬 Recording: {team}";
        setText("recorderTeamLabel", tpl.replace("{team}", name));
        el.hidden = false;
      }
    }
    // The team selector mirrors the indicator's visibility condition
    // BUT only while the recorder is idle — once recording is live,
    // the team is locked.
    refreshRecorderTeamSelector();
  }

  /** Show / update / hide the "Which team are you recording?" picker
   *  shown above the big record button in the idle state. */
  function refreshRecorderTeamSelector() {
    const sel = $("#recorderTeamSelector");
    if (!sel) return;
    const t = store.ui;
    const isCompareeMatch = state.mode === "match"
      && /compar/i.test(state.currentNature || "");
    // Idle = the user hasn't pressed the big red button yet. Once
    // rec.isRecording flips true, we lock the picker.
    const isIdle = !rec.isRecording;
    if (!isCompareeMatch || !isIdle) {
      sel.hidden = true;
      return;
    }
    setText("recorderTeamSelectorLabel", t.recordingTeamSelectorLabel || "Which team?");
    const chipA = $("#recorderTeamChipA");
    const chipB = $("#recorderTeamChipB");
    if (chipA) {
      chipA.textContent = teamDisplayName("a");
      chipA.classList.toggle("is-selected", state.currentRecordingTeam === "a");
    }
    if (chipB) {
      chipB.textContent = teamDisplayName("b");
      chipB.classList.toggle("is-selected", state.currentRecordingTeam === "b");
    }
    sel.hidden = false;
  }

  /** Show / hide the "Record the other team" button on the preview
   *  popup. Only meaningful in Match Comparée after exactly one team
   *  has been finalized. Click → reset the recorder state for the
   *  OTHER team and re-open it. */
  function refreshRecordOtherTeamButton() {
    const btn = $("#recorderRecordOtherBtn");
    if (!btn) return;
    const t = store.ui;
    const isComparee = state.mode === "match"
      && /compar/i.test(state.currentNature || "");
    const oneDone = state.recordedTeamsSet && state.recordedTeamsSet.size === 1;
    if (!isComparee || !oneDone) { btn.hidden = true; return; }
    btn.textContent = t.recordOtherTeamBtn || "🎬 Record the other team";
    btn.hidden = false;
  }

  /** Pre-fill the editor with the current rosters + team names. Show
   *  the troupe row OR the two match rows depending on state.mode. */
  function populateRecorderParticipants() {
    const t = store.ui;
    const hint = $("#recorderParticipantsHint");
    if (hint) hint.textContent = t.recordParticipantsHint || "";

    const troupeRow = document.querySelector('.recorder-participant-row[data-team="troupe"]');
    const aRow      = document.querySelector('.recorder-participant-row[data-team="a"]');
    const bRow      = document.querySelector('.recorder-participant-row[data-team="b"]');
    if (state.mode === "match") {
      if (troupeRow) troupeRow.hidden = true;
      if (aRow) aRow.hidden = false;
      if (bRow) bRow.hidden = false;
      setText("recParticipantsLabelA", t.recordParticipantsTeamA || "Team A");
      setText("recParticipantsLabelB", t.recordParticipantsTeamB || "Team B");
      const ph = t.recordParticipantsActorsPlaceholder || "";
      const tA = $("#recParticipantsTeamA");   if (tA) tA.value = ($("#teamA") && $("#teamA").value) || "";
      const tB = $("#recParticipantsTeamB");   if (tB) tB.value = ($("#teamB") && $("#teamB").value) || "";
      const aA = $("#recParticipantsActorsA"); if (aA) { aA.placeholder = ph; aA.value = (state.rosterA || []).map(p => p && p.nom_scene).filter(Boolean).join("\n"); }
      const aB = $("#recParticipantsActorsB"); if (aB) { aB.placeholder = ph; aB.value = (state.rosterB || []).map(p => p && p.nom_scene).filter(Boolean).join("\n"); }
    } else {
      if (aRow) aRow.hidden = true;
      if (bRow) bRow.hidden = true;
      if (troupeRow) troupeRow.hidden = false;
      setText("recParticipantsTroupeLabel", t.recordParticipantsTroupe || "Troupe");
      const ph = t.recordParticipantsActorsPlaceholder || "";
      const tT = $("#recParticipantsTroupeName"); if (tT) tT.value = ($("#teamTroupe") && $("#teamTroupe").value) || "";
      const aT = $("#recParticipantsTroupeActors"); if (aT) { aT.placeholder = ph; aT.value = (state.roster || []).map(p => p && p.nom_scene).filter(Boolean).join("\n"); }
    }
  }

  /** Push the (possibly-edited) participants list to the server so the
   *  impro_event analytics reflect who actually performed. Idempotent:
   *  add_impro_participants() does DELETE+INSERT under the hood. */
  function pushRecorderParticipantsToServer() {
    if (!improEvent.id || !window.actoSupabase
        || !window.actoAuth || !window.actoAuth.state || !window.actoAuth.state.user) return;
    const lines = (s) => (s || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
    let members = [];
    if (state.mode === "match") {
      const namesA = lines($("#recParticipantsActorsA") && $("#recParticipantsActorsA").value);
      const namesB = lines($("#recParticipantsActorsB") && $("#recParticipantsActorsB").value);
      // Try to recover user_ids from the launch-time rosters when the
      // edited name still matches; otherwise treat as ad-hoc guests.
      const matchUid = (name, src) => {
        const lcn = String(name || "").trim().toLowerCase();
        const hit = (src || []).find(p => (p.nom_scene || "").trim().toLowerCase() === lcn && p.user_id);
        return hit ? hit.user_id : null;
      };
      members = namesA.map(n => ({ user_id: matchUid(n, state.rosterA), nom_scene_text: n }))
        .concat(namesB.map(n => ({ user_id: matchUid(n, state.rosterB), nom_scene_text: n })));
    } else {
      const namesT = lines($("#recParticipantsTroupeActors") && $("#recParticipantsTroupeActors").value);
      const matchUid = (name) => {
        const lcn = String(name || "").trim().toLowerCase();
        const hit = (state.roster || []).find(p => (p.nom_scene || "").trim().toLowerCase() === lcn && p.user_id);
        return hit ? hit.user_id : null;
      };
      members = namesT.map(n => ({ user_id: matchUid(n), nom_scene_text: n }));
    }
    Promise.resolve(window.actoSupabase.rpc("add_impro_participants", {
      p_event_id: improEvent.id,
      p_members:  members
    })).catch(err => console.warn("[acto] participants update failed", err));
  }

  function recFinalize() {
    statsRecordFinalized();
    if (rec.blobUrl) { try { URL.revokeObjectURL(rec.blobUrl); } catch (e) {} rec.blobUrl = null; }
    const mime = (rec.recorder && rec.recorder.mimeType) || "video/webm";
    const ext  = /mp4/i.test(mime) ? "mp4" : "webm";
    const blob = new Blob(rec.chunks, { type: mime });
    rec.blobUrl = URL.createObjectURL(blob);
    rec.videoExt = ext;

    // Populate the participants editor with the active rosters so the
    // user just confirms (or tweaks) before downloading. The filename
    // is recomputed live whenever the inputs change.
    populateRecorderParticipants();
    const fname = computeRecordedVideoFilename(ext);
    const link = $("#recorderDownloadLink");
    if (link) {
      link.href = rec.blobUrl;
      link.download = fname;
      link.textContent = store.ui.recordDownload || "Download";
    }
    const prev = $("#recorderPreview");
    if (prev) {
      prev.src = rec.blobUrl;
      prev.hidden = false;
      try { prev.load(); } catch (e) {}
    }
    // Stop the camera now — preview popup takes over the screen
    recStopCamera();
    // Hide the camera UI
    const stage = $("#recorderStage");
    if (stage) stage.classList.add("recorder-stage-finished");
    const top  = $("#recorderTopBar");
    if (top)  top.hidden = true;
    const idle = $("#recorderControlsIdle");
    if (idle) idle.hidden = true;
    const act  = $("#recorderControlsActive");
    if (act)  act.hidden = true;
    if (rec.canvas) rec.canvas.style.display = "none";
    // Match Comparée: remember which team we just recorded so the
    // "Record the other team" CTA can appear on the preview popup
    // when exactly one of the two teams is done.
    if (state.mode === "match" && /compar/i.test(state.currentNature || "")
        && state.currentRecordingTeam) {
      state.recordedTeamsSet.add(state.currentRecordingTeam);
    }
    refreshRecordOtherTeamButton();
    // Show preview popup
    const pop = $("#recorderPreviewPopup");
    if (pop) pop.hidden = false;
  }
  function recHidePreviewPopup() {
    const pop = $("#recorderPreviewPopup");
    if (pop) pop.hidden = true;
    const prev = $("#recorderPreview");
    if (prev) { try { prev.pause(); } catch (e) {} prev.removeAttribute("src"); prev.hidden = true; }
  }
  function recShowIdleControls() {
    const idle = $("#recorderControlsIdle");
    if (idle) idle.hidden = false;
    const act = $("#recorderControlsActive");
    if (act) act.hidden = true;
  }
  function recShowActiveControls() {
    const idle = $("#recorderControlsIdle");
    if (idle) idle.hidden = true;
    const act = $("#recorderControlsActive");
    if (act) act.hidden = false;
  }
  // (recAgain removed — exit & re-open instead)
  async function recSwitchCamera() {
    rec.facingMode = (rec.facingMode === "environment") ? "user" : "environment";
    if (rec.stream) rec.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    rec.stream = null;
    await recStartCamera();
  }
  function recClose() {
    recCancelPreCountdown();
    recHideAudienceCue();
    recHideExerciseDesc();
    rec.descShouldDraw = false;
    statsRecordStopTracking();
    statsFlush();
    if (rec.isRecording) { try { recStop(); } catch (e) {} }
    recStopCamera();
    if (rec.blobUrl) { try { URL.revokeObjectURL(rec.blobUrl); } catch (e) {} rec.blobUrl = null; }
    rec.chunks = [];
    rec.recorder = null;
    rec.isRecording = false;
    rec.isPaused = false;
    rec.elapsedBeforePause = 0;
    const modal = $("#recorderModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
    recHideConfirm();
    recHidePreviewPopup();
    const stage = $("#recorderStage");
    if (stage) stage.classList.remove("recorder-stage-finished");
    const top = $("#recorderTopBar");
    if (top) top.hidden = false;
    if (rec.canvas) rec.canvas.style.display = "";
    recShowIdleControls();
  }
  // recResetUI/recHidePreview removed — covered by recShowIdleControls/recHidePreviewPopup
  function recShowError(msg, hint) {
    const wrap = $("#recorderError");
    const m = $("#recorderErrorMsg");
    const h = $("#recorderErrorHint");
    if (m) m.textContent = msg || "";
    if (h) { h.textContent = hint || ""; h.hidden = !hint; }
    if (wrap) wrap.hidden = false;
    if (rec.canvas) rec.canvas.style.display = "none";
  }
  function recHideError() {
    const wrap = $("#recorderError");
    if (wrap) wrap.hidden = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
