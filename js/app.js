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
    let locale = localStorage.getItem(LOCALE_KEY) || "fr";
    if (!bundle.locales[locale]) locale = "fr";

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

  function applyTranslations() {
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
    setText("recordOpenBtn",    t.recordOpenBtn);
    setText("recorderRecLabel", t.recordRec);
    setText("recorderAgainBtn", t.recordAgain);
    const __dl = document.getElementById("recorderDownloadLink");
    if (__dl) __dl.textContent = t.recordDownload || "";
    setText("settingsLabelText",t.settings);
    setText("dlgTitle",         t.settings);
    setText("dlgLanguageLabel", t.language);
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
      case "constraint": { const v = pick(data.constraints[mode][level]); state.currentConstraint = v; return { value: v }; }
      case "theme":      { const pool = state.useCustom ? state.customThemes : data.themes[level]; const v = pick(pool); state.currentTheme = v; return { value: v }; }
      case "category":   { const c = pick(data.categories); return { value: c.name, meta: c.desc }; }
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
    chronoReset();
    $$(".card").forEach(c => { c.classList.remove("revealed"); c.classList.add("appearing"); });
    setTimeout(() => $$(".card").forEach(c => c.classList.remove("appearing")), 600);
    let targets;
    if (state.mode === "match") {
      // Match mode: duration is one of the slot-machine reels (pickFor sets state.currentDurationSec)
      targets = ["category", "exercise", "constraint", "theme", "duration", "players"];
    } else {
      // Troupe mode: pick duration silently (no reel for it). Chrono will use this value.
      state.currentDurationSec = pickDurationSec();
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
    const startBtn = $("#chronoStartBtn"), pauseBtn = $("#chronoPauseBtn");
    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    state.chronoInterval = setInterval(chronoTick, 1000);
    if (state.audienceEnabled) startAudienceLoop();
  }
  function chronoPause() {
    if (!state.chronoRunning) return;
    state.chronoRunning = false;
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
          if (state.mode === "match") {
            const reelEl = $('.reel[data-target="duration"]');
            const trackEl = $("#reel-duration");
            const cardEl  = $("#card-duration");
            const metaEl  = $("#meta-duration");
            if (reelEl && trackEl && cardEl) {
              const value = formatSec(state.currentDurationSec);
              const items = buildSpinPool(durationSteps(state.level).map(formatSec), value);
              await spinReel({ reelEl, trackEl, cardEl, metaEl, items, meta: "", delay: 0 });
            }
          }
          return;
        }
        b.disabled = true;
        await spinTarget(target, 0);
        b.disabled = false;
        if (target === "exercise") refreshAudienceCard();
        if (target === "duration") {
          state.chronoTotal = state.currentDurationSec;
          state.chronoRemaining = state.chronoTotal;
          const display = $("#chronoDisplay");
          if (display) display.textContent = formatMMSS(state.chronoTotal);
        }
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
    const __recOpenBtn  = $("#recordOpenBtn");
    const __recCloseBtn = $("#recorderCloseBtn");
    const __recRecBtn   = $("#recorderRecordBtn");
    const __recSwitch   = $("#recorderSwitchCamBtn");
    const __recAgainBtn = $("#recorderAgainBtn");
    if (__recOpenBtn)  __recOpenBtn.addEventListener("click", recOpen);
    if (__recCloseBtn) __recCloseBtn.addEventListener("click", recClose);
    if (__recSwitch)   __recSwitch.addEventListener("click", recSwitchCamera);
    if (__recAgainBtn) __recAgainBtn.addEventListener("click", recAgain);
    if (__recRecBtn)   __recRecBtn.addEventListener("click", () => {
      if (rec.isRecording) recStop(); else recStart();
    });

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
    startedAt: 0,
    recTimerId: null,
    blobUrl: null,
    logoImg: null,        // preloaded brand logo for watermark
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
    recHidePreview();
    recResetUI();
    await recStartCamera();
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
    recDrawBottomOverlay(rec.ctx, w, h);
    recDrawLogoWatermark(rec.ctx, w, h);
    recUpdateChronoChip();
    rec.rafId = requestAnimationFrame(recDrawLoop);
  }
  function recDrawLogoWatermark(ctx, w, h) {
    if (!rec.logoLoaded || !rec.logoImg) return;
    // Logo target width = ~22% of canvas width, capped
    const logoW = Math.min(Math.round(w * 0.22), 260);
    const ratio = (rec.logoImg.naturalWidth && rec.logoImg.naturalHeight)
      ? rec.logoImg.naturalHeight / rec.logoImg.naturalWidth : 0.66;
    const logoH = Math.round(logoW * ratio);
    // Position: top-right with margin (below the safe zone reserved by HTML toolbar)
    const margin = Math.round(w * 0.025);
    const reserveTop = Math.round(w * 0.13);
    const x = w - logoW - margin;
    const y = reserveTop + Math.round(w * 0.005);
    // Subtle drop shadow for legibility
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur  = Math.round(w * 0.018);
    ctx.shadowOffsetY = 2;
    ctx.globalAlpha = 0.95;
    try { ctx.drawImage(rec.logoImg, x, y, logoW, logoH); } catch (e) { /* ignore */ }
    ctx.restore();
  }
  function recUpdateChronoChip() {
    const chip = document.getElementById("recorderChronoChip");
    const tEl  = document.getElementById("recorderChronoTime");
    if (!chip || !tEl) return;
    if (state.chronoTotal > 0) {
      const remaining = state.chronoRemaining > 0
        ? state.chronoRemaining
        : (state.chronoRunning ? 0 : state.chronoTotal);
      tEl.textContent = formatMMSS(remaining);
      chip.hidden = false;
      chip.classList.toggle("warn",   state.chronoRemaining > 0 && state.chronoRemaining <= 30 && state.chronoRemaining > 10);
      chip.classList.toggle("danger", state.chronoRemaining > 0 && state.chronoRemaining <= 10);
    } else {
      chip.hidden = true;
    }
  }
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

  function recDrawTopOverlay(ctx, w, h) {
    const ex = state.currentExercise;
    const t  = store.ui;
    if (!ex && !state.currentConstraint && !state.currentTheme) return;

    // Sizing based on width (so portrait & landscape both look right)
    const padX        = Math.round(w * 0.045);
    const padTop      = Math.round(w * 0.04);
    const lineGap     = Math.round(w * 0.012);
    const blockGap    = Math.round(w * 0.022);
    const titleSize   = Math.max(28, Math.round(w * 0.062));
    const labelSize   = Math.max(14, Math.round(w * 0.028));
    const subSize     = Math.max(20, Math.round(w * 0.045));
    const maxTextW    = w - padX * 2;

    // Pre-compute line arrays
    ctx.font = "700 " + titleSize + 'px Inter, "Helvetica Neue", sans-serif';
    const titleLines = ex ? recWrapText(ctx, ex.name, maxTextW) : [];

    ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
    const consLines  = state.currentConstraint ? recWrapText(ctx, state.currentConstraint, maxTextW) : [];
    const themeLines = state.currentTheme      ? recWrapText(ctx, state.currentTheme,      maxTextW) : [];

    // Reserve a top safe-zone so the canvas overlay never collides with
    // the HTML toolbar (close / switch cam buttons, chrono chip).
    const reserveTop  = Math.round(w * 0.13);

    // Total block height
    const sectionH = (count, sz) => count > 0 ? labelSize + lineGap + count * (sz + lineGap) : 0;
    const blockH = reserveTop + padTop
      + (titleLines.length ? titleLines.length * (titleSize + lineGap) : 0)
      + (consLines.length  ? blockGap + sectionH(consLines.length,  subSize) : 0)
      + (themeLines.length ? blockGap + sectionH(themeLines.length, subSize) : 0)
      + padTop;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, blockH);
    grad.addColorStop(0, "rgba(10, 6, 18, 0.88)");
    grad.addColorStop(1, "rgba(10, 6, 18, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, blockH);

    let y = reserveTop + padTop;

    // Title (exercise name) — colored with exercise accent
    if (titleLines.length) {
      ctx.font = "700 " + titleSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.textAlign = "left";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = REC_COLORS.exercise;
      for (const line of titleLines) {
        y += titleSize;
        ctx.fillText(line, padX, y);
        y += lineGap;
      }
      ctx.shadowBlur = 0;
    }

    // Constraint section
    if (consLines.length) {
      y += blockGap;
      ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = REC_COLORS.constraint;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6;
      const lbl = (t.recordOverlayCons || "Contrainte").toUpperCase();
      y += labelSize;
      ctx.fillText(lbl, padX, y);
      y += lineGap;
      ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = "#fff";
      for (const line of consLines) {
        y += subSize;
        ctx.fillText(line, padX, y);
        y += lineGap;
      }
      ctx.shadowBlur = 0;
    }

    // Theme section
    if (themeLines.length) {
      y += blockGap;
      ctx.font = "700 " + labelSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = REC_COLORS.theme;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6;
      const lbl = (t.recordOverlayTheme || "Thème").toUpperCase();
      y += labelSize;
      ctx.fillText(lbl, padX, y);
      y += lineGap;
      ctx.font = "500 " + subSize + 'px Inter, "Helvetica Neue", sans-serif';
      ctx.fillStyle = "#fff";
      for (const line of themeLines) {
        y += subSize;
        ctx.fillText(line, padX, y);
        y += lineGap;
      }
      ctx.shadowBlur = 0;
    }
  }
  function recDrawBottomOverlay(ctx, w, h) {
    const barH = Math.max(110, Math.round(w * 0.18));
    const grad = ctx.createLinearGradient(0, h - barH, 0, h);
    grad.addColorStop(0, "rgba(10, 6, 18, 0)");
    grad.addColorStop(1, "rgba(10, 6, 18, 0.92)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - barH, w, barH);

    const remaining = state.chronoTotal > 0
      ? (state.chronoRemaining > 0 ? state.chronoRemaining : (state.chronoRunning ? 0 : state.chronoTotal))
      : 0;
    const timeStr = state.chronoTotal > 0 ? formatMMSS(remaining) : "";

    if (timeStr) {
      const fs = Math.max(56, Math.round(w * 0.13));
      ctx.font = "400 " + fs + 'px "Bebas Neue", Inter, sans-serif';
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 12;
      let color = "#fff";
      if (state.chronoRemaining > 0 && state.chronoRemaining <= 10) color = "#f87171";
      else if (state.chronoRemaining > 0 && state.chronoRemaining <= 30) color = "#fbbf24";
      ctx.fillStyle = color;
      ctx.fillText(timeStr, w / 2, h - Math.round(barH * 0.32));
      ctx.shadowBlur = 0;
    }

    if (state.chronoTotal > 0) {
      const pct = (state.chronoTotal - remaining) / state.chronoTotal;
      const barY = h - 8;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(0, barY, w, 8);
      const grd = ctx.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, "#6dd3c5"); grd.addColorStop(0.5, "#f5c451"); grd.addColorStop(1, "#ff6b8a");
      ctx.fillStyle = grd;
      ctx.fillRect(0, barY, Math.max(0, Math.min(1, pct)) * w, 8);
    }
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
    rec.startedAt = Date.now();
    const recBtn = $("#recorderRecordBtn");
    if (recBtn) {
      recBtn.dataset.recording = "true";
      recBtn.setAttribute("aria-label", store.ui.recordStopBtn || "Stop");
    }
    const lbl = $("#recorderRecordLabel");
    if (lbl) lbl.textContent = store.ui.recordStopBtn || "Stop";
    const ind = $("#recorderRecIndicator");
    if (ind) ind.hidden = false;
    rec.recTimerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - rec.startedAt) / 1000);
      const tEl = $("#recorderRecTime");
      if (tEl) tEl.textContent = formatMMSS(elapsed);
    }, 500);
    // Auto-start chrono if a duration was generated and chrono not running
    if (!state.chronoRunning && state.chronoTotal > 0) chronoStart();
  }
  function recStop() {
    if (!rec.recorder || rec.recorder.state === "inactive") return;
    try { rec.recorder.stop(); } catch (e) {}
    rec.isRecording = false;
    if (rec.recTimerId) { clearInterval(rec.recTimerId); rec.recTimerId = null; }
    const ind = $("#recorderRecIndicator");
    if (ind) ind.hidden = true;
  }
  function recFinalize() {
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
    if (rec.canvas) rec.canvas.style.display = "none";
    const bottom = $("#recorderBottomBar");
    if (bottom) bottom.hidden = true;
    const finish = $("#recorderFinishBar");
    if (finish) finish.hidden = false;
  }
  function recAgain() {
    recHidePreview();
    if (rec.canvas) rec.canvas.style.display = "";
    const bottom = $("#recorderBottomBar");
    if (bottom) bottom.hidden = false;
    const recBtn = $("#recorderRecordBtn");
    if (recBtn) {
      delete recBtn.dataset.recording;
      recBtn.setAttribute("aria-label", store.ui.recordStartBtn || "Start");
    }
    const lbl = $("#recorderRecordLabel");
    if (lbl) lbl.textContent = store.ui.recordStartBtn || "Start";
    rec.chunks = [];
    rec.recorder = null;
  }
  async function recSwitchCamera() {
    rec.facingMode = (rec.facingMode === "environment") ? "user" : "environment";
    if (rec.stream) rec.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    rec.stream = null;
    await recStartCamera();
  }
  function recClose() {
    if (rec.isRecording) { try { recStop(); } catch (e) {} }
    recStopCamera();
    if (rec.blobUrl) { try { URL.revokeObjectURL(rec.blobUrl); } catch (e) {} rec.blobUrl = null; }
    rec.chunks = [];
    rec.recorder = null;
    const modal = $("#recorderModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
    recResetUI();
  }
  function recResetUI() {
    if (rec.canvas) rec.canvas.style.display = "";
    const bottom = $("#recorderBottomBar");
    if (bottom) bottom.hidden = false;
    const finish = $("#recorderFinishBar");
    if (finish) finish.hidden = true;
    const ind = $("#recorderRecIndicator");
    if (ind) ind.hidden = true;
    const recBtn = $("#recorderRecordBtn");
    if (recBtn) {
      delete recBtn.dataset.recording;
      recBtn.setAttribute("aria-label", store.ui.recordStartBtn || "Start");
    }
    const lbl = $("#recorderRecordLabel");
    if (lbl) lbl.textContent = store.ui.recordStartBtn || "Start";
    recHidePreview();
  }
  function recHidePreview() {
    const prev = $("#recorderPreview");
    if (prev) { prev.hidden = true; try { prev.pause(); } catch (e) {} prev.removeAttribute("src"); }
  }
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
