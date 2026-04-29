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
      const { data, error } = await window.actoSupabase.rpc("log_impro_event", {
        p_mode: state.mode,
        p_level: state.level,
        p_exercise: ex.name || "",
        p_constraint: state.currentConstraint || "",
        p_theme: state.currentTheme || "",
        p_duration_planned: state.currentDurationSec || state.chronoTotal || 0
      });
      if (!error) improEvent.id = data;
    } catch (e) {
      console.warn("log_impro_event failed", e);
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
    audienceTimer: null
  };

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
      return steps[Math.floor(Math.random() * steps.length)];
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
    setText("label01",          t.label01);
    setText("label02",          t.label02);
    setText("label03",          t.label03);
    setText("labelTeams",       t.labelTeams);
    setText("modeTroupeTitle",  t.modeTroupe);
    setText("modeTroupeDesc",   t.modeTroupeDesc);
    setText("modeMatchTitle",   t.modeMatch);
    setText("modeMatchDesc",    t.modeMatchDesc);
    setText("levelDebutant",    t.levelDebutant);
    setText("levelConfirme",    t.levelConfirme);
    setText("levelExpert",      t.levelExpert);

    const teamA = $("#teamA"), teamB = $("#teamB");
    if (teamA) teamA.placeholder = t.teamA ?? "";
    if (teamB) teamB.placeholder = t.teamB ?? "";

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
    setText("dlgTitle",         t.settings);
    setText("dlgLanguageLabel", t.language);
    if (window.actoAuth && typeof window.actoAuth.applyTranslations === "function") {
      window.actoAuth.applyTranslations();
    }
  }
  function setReelPlaceholder(id, txt) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="reel-item placeholder">${escapeHtml(txt)}</div>`;
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
    refreshAudienceCard();
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

  function pickFor(target) {
    const data = store.data;
    const { mode, level } = state;
    switch (target) {
      case "exercise":   {
        const ex = pick(data.exercises[mode][level]);
        state.currentExercise = ex;
        let meta = ex.desc || "";
        if (mode === "troupe" && ex.needsAudience) {
          const t = store.ui;
          const badge = t.audienceBadge || "Audience interaction";
          meta = badge + " — " + meta;
        }
        return { value: ex.name, meta: meta };
      }
      case "constraint": {
        const v = pick(data.constraints[mode][level]);
        state.currentConstraint = v;
        // In Match mode the players card is gone; the player count lives as
        // the meta sub-line of the constraint card. Re-pick on every reroll
        // so the count stays in sync with the constraint.
        if (mode === "match") {
          state.currentPlayers = pick(data.players[level]);
          return { value: v, meta: state.currentPlayers };
        }
        return { value: v };
      }
      case "theme":      { const pool = state.useCustom ? state.customThemes : data.themes[level]; const v = pick(pool); state.currentTheme = v; return { value: v }; }
      case "category":   {
        const c = pick(data.categories);
        state.currentCategory = c;
        // In Match mode the Category card replaces Exercise. Mirror the picked
        // category onto state.currentExercise so the recorder overlay (which
        // reads currentExercise.name + .desc) renders the category instead.
        state.currentExercise = { name: c.name, desc: c.desc };
        return { value: c.name, meta: c.desc };
      }
      case "duration":   {
        const sec = pickDurationSec();
        state.currentDurationSec = sec;
        return { value: formatSec(sec) };
      }
      case "players":    return { value: pick(data.players[level]) };
    }
    return { value: "—" };
  }
  function poolFor(target) {
    const data = store.data;
    const { mode, level } = state;
    switch (target) {
      case "exercise":   return data.exercises[mode][level].map(e => e.name);
      case "constraint": return data.constraints[mode][level];
      case "theme":      return state.useCustom ? state.customThemes : data.themes[level];
      case "category":   return data.categories.map(c => c.name);
      case "duration":   return durationSteps(level).map(formatSec);
      case "players":    return data.players[level];
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
    const targets = state.mode === "match"
      ? ["category", "constraint", "theme"]
      : ["exercise", "constraint", "theme"];
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
     ============================================================ */
  let dialogEl, langSelect, editorList, statusEl, importInput;

  function initSettings() {
    dialogEl    = $("#settingsDialog");
    langSelect  = $("#langSelect");
    editorList  = $("#editorList");
    statusEl    = $("#settingsStatus");
    importInput = $("#importJsonFile");

    $("#settingsBtn").addEventListener("click", openDialog);
    $("#settingsClose").addEventListener("click", () => dialogEl.close());
    dialogEl.addEventListener("click", (e) => { if (e.target === dialogEl) dialogEl.close(); });

    langSelect.addEventListener("change", () => store.setLocale(langSelect.value));

    $("#saveBtn").addEventListener("click", saveAll);
    $("#resetBtn").addEventListener("click", resetCurrent);
    $("#exportBtn").addEventListener("click", exportCurrent);
    $("#importBtn").addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", importFromFile);

    store.addEventListener("change", () => {
      if (dialogEl.open) renderEditor();
    });
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
    renderEditor();
    setStatus("");
    dialogEl.showModal();
  }

  function renderEditor() {
    const data = store.data;
    editorList.innerHTML = "";

    const branches = [
      { key: "exercises.troupe.debutant", label: "🎬 Exercices · Troupe · Débutant",  arr: data?.exercises?.troupe?.debutant },
      { key: "exercises.troupe.confirme", label: "🎬 Exercices · Troupe · Confirmé",  arr: data?.exercises?.troupe?.confirme },
      { key: "exercises.troupe.expert",   label: "🎬 Exercices · Troupe · Expert",    arr: data?.exercises?.troupe?.expert },
      { key: "exercises.match.debutant",  label: "⚔️ Exercices · Match · Débutant",   arr: data?.exercises?.match?.debutant },
      { key: "exercises.match.confirme",  label: "⚔️ Exercices · Match · Confirmé",   arr: data?.exercises?.match?.confirme },
      { key: "exercises.match.expert",    label: "⚔️ Exercices · Match · Expert",     arr: data?.exercises?.match?.expert },
      { key: "constraints.troupe.debutant", label: "🔒 Contraintes · Troupe · Débutant", arr: data?.constraints?.troupe?.debutant },
      { key: "constraints.troupe.confirme", label: "🔒 Contraintes · Troupe · Confirmé", arr: data?.constraints?.troupe?.confirme },
      { key: "constraints.troupe.expert",   label: "🔒 Contraintes · Troupe · Expert",   arr: data?.constraints?.troupe?.expert },
      { key: "constraints.match.debutant",  label: "🔒 Contraintes · Match · Débutant",  arr: data?.constraints?.match?.debutant },
      { key: "constraints.match.confirme",  label: "🔒 Contraintes · Match · Confirmé",  arr: data?.constraints?.match?.confirme },
      { key: "constraints.match.expert",    label: "🔒 Contraintes · Match · Expert",    arr: data?.constraints?.match?.expert },
      { key: "themes.debutant",  label: "💭 Thèmes · Débutant",  arr: data?.themes?.debutant },
      { key: "themes.confirme",  label: "💭 Thèmes · Confirmé",  arr: data?.themes?.confirme },
      { key: "themes.expert",    label: "💭 Thèmes · Expert",    arr: data?.themes?.expert },
      { key: "categories",       label: "🎯 Catégories (match)", arr: data?.categories }
    ];

    for (const b of branches) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${b.label}  (${b.arr?.length ?? 0})`;
      details.appendChild(summary);
      const ta = document.createElement("textarea");
      ta.dataset.key = b.key;
      ta.spellcheck = false;
      ta.value = JSON.stringify(b.arr ?? [], null, 2);
      ta.rows = Math.min(20, (b.arr?.length ?? 0) + 2);
      details.appendChild(ta);
      editorList.appendChild(details);
    }
  }

  function setNestedKey(obj, dotted, value) {
    const parts = dotted.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function saveAll() {
    try {
      const next = structuredClone(store.data);
      for (const ta of editorList.querySelectorAll("textarea[data-key]")) {
        const parsed = JSON.parse(ta.value);
        if (!Array.isArray(parsed)) throw new Error(`${ta.dataset.key} doit être un tableau JSON`);
        setNestedKey(next, ta.dataset.key, parsed);
      }
      store.setLocaleData(next);
      setStatus("✅ Modifications enregistrées (localStorage).");
    } catch (e) {
      setStatus(`❌ ${e.message}`, true);
    }
  }
  function resetCurrent() {
    if (!confirm("Réinitialiser cette langue aux valeurs par défaut ?")) return;
    store.resetLocale();
    renderEditor();
    setStatus("↩️ Réinitialisé.");
  }
  function exportCurrent() {
    const blob = new Blob([store.exportLocale()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `impro-studio-${store.locale}.json`; a.click();
    URL.revokeObjectURL(url);
    setStatus(`💾 Téléchargé : impro-studio-${store.locale}.json`);
  }
  async function importFromFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      store.importLocale(text);
      renderEditor();
      setStatus(`📥 Importé : ${file.name}`);
    } catch (err) {
      setStatus(`❌ Import invalide : ${err.message}`, true);
    } finally {
      e.target.value = "";
    }
  }
  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.dataset.kind = isError ? "error" : "ok";
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

    $("#generateBtn").addEventListener("click", generateAll);

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
          return;
        }
        b.disabled = true;
        await spinTarget(target, 0);
        b.disabled = false;
        if (target === "exercise") refreshAudienceCard();
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
      audio(); // unlock audio context on user gesture
      recPlayPreCountdown(() => {
        recStart();
        // The description popup was already shown at modal-open;
        // schedule it to fade out 6 s after the countdown ends.
        recArmExerciseDescHide(5000);
      });
    });
    if (__recPauseBtn) __recPauseBtn.addEventListener("click", recPauseResume);
    if (__recStopBtn)  __recStopBtn.addEventListener("click", recRequestStop);
    if (__recCfmYes)   __recCfmYes.addEventListener("click", recConfirmStop);
    if (__recCfmNo)    __recCfmNo.addEventListener("click", recCancelStop);
    if (__recExitBtn)  __recExitBtn.addEventListener("click", recClose);

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
    });
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
      img.src = "./assets/logo.png";
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
        audio: true
      };
      rec.stream = await navigator.mediaDevices.getUserMedia(constraints);
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
    recDrawTopOverlay(rec.ctx, w, h);
    recDrawDescription(rec.ctx, w, h);
    recDrawBottomOverlay(rec.ctx, w, h);
    recDrawLogoWatermark(rec.ctx, w, h);
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

  function recDrawTopOverlay(ctx, w, h) {
    const ex = state.currentExercise;
    const t  = store.ui;
    if (!ex && !state.currentConstraint && !state.currentTheme) return;

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
    const audio = rec.stream.getAudioTracks();
    const tracks = canvasStream.getVideoTracks().concat(audio);
    const composite = new MediaStream(tracks);
    const mime = recPickMime();
    try {
      rec.recorder = mime ? new MediaRecorder(composite, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
                          : new MediaRecorder(composite);
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
    statsRecordStartTracking();
    recShowActiveControls();
    recRefreshPauseLabel();
    const ind = $("#recorderRecIndicator");
    if (ind) ind.hidden = false;
    rec.recTimerId = setInterval(recUpdateRecElapsed, 500);
    if (!state.chronoRunning && state.chronoTotal > 0) chronoStart();
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
  function recFinalize() {
    statsRecordFinalized();
    if (rec.blobUrl) { try { URL.revokeObjectURL(rec.blobUrl); } catch (e) {} rec.blobUrl = null; }
    const mime = (rec.recorder && rec.recorder.mimeType) || "video/webm";
    const ext  = /mp4/i.test(mime) ? "mp4" : "webm";
    const blob = new Blob(rec.chunks, { type: mime });
    rec.blobUrl = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fname = "acto-impro-" + ts + "." + ext;
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
