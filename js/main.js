/**
 * main.js — Application entry point
 *
 * Wires the data store, the slot-machine animation, the i18n bindings
 * and the settings dialog together. Kept deliberately thin: every
 * concern lives in its own module.
 *
 * Modern practices used:
 *  - ES modules with explicit imports
 *  - Async/await
 *  - EventTarget pub/sub between modules
 *  - <dialog> for the settings modal
 *  - View Transitions API for locale swaps (where supported)
 *  - matchMedia for reduced-motion respect
 *  - structuredClone for safe data copies
 */

import { store }                      from "./store.js";
import { spinReel, buildSpinPool }    from "./slot.js";
import { initSettings }               from "./settings.js";

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  mode:  "troupe",       // "troupe" | "match"
  level: "debutant",
  customThemes: [],
  useCustom: false,
  isGenerating: false
};

/* =========================================================
   BOOT
   ========================================================= */
(async function boot() {
  await store.init();

  applyTranslations();
  bindControls();
  initSettings();

  store.addEventListener("change", () => {
    withViewTransition(() => applyTranslations());
  });
})();

/* =========================================================
   I18N — apply translations to the DOM
   ========================================================= */
function applyTranslations() {
  const t = store.ui;
  document.documentElement.lang = store.locale;

  // <title> + meta
  document.title = `${t.title ?? "Impro"} ${t.titleAccent ?? "Studio"}`;

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

  $("#teamA").placeholder = t.teamA ?? "";
  $("#teamB").placeholder = t.teamB ?? "";

  $("#themesHint").textContent = t.themesHint ?? "";
  $("#themesInput").placeholder = t.themesPlaceholder ?? "";
  $("#useRandomBtn").textContent = t.useRandom ?? "";
  refreshThemeStatus();

  setText("generateLabel",    t.generate);

  // Card labels
  setText("labelCardCategory",   t.cardCategory);
  setText("labelCardExercise",   t.cardExercise);
  setText("labelCardConstraint", t.cardConstraint);
  setText("labelCardTheme",      t.cardTheme);
  setText("labelCardDuration",   t.cardDuration);
  setText("labelCardPlayers",    t.cardPlayers);

  setText("rerollLabel",      t.rerollLabel);
  setText("rerollExercise",   t.rerollExercise);
  setText("rerollConstraint", t.rerollConstraint);
  setText("rerollTheme",      t.rerollTheme);
  setText("rerollCategory",   t.rerollCategory);
  setText("rerollDuration",   t.rerollDuration);
  setText("rerollPlayers",    t.rerollPlayers);

  // Reset cards to placeholder text
  if (!state.isGenerating) {
    $("#reel-exercise").innerHTML   = `<div class="reel-item placeholder">${t.placeholder ?? "—"}</div>`;
    $("#reel-constraint").innerHTML = `<div class="reel-item placeholder">${t.emDash ?? "—"}</div>`;
    $("#reel-theme").innerHTML      = `<div class="reel-item placeholder">${t.emDash ?? "—"}</div>`;
    $("#reel-category").innerHTML   = `<div class="reel-item placeholder">${t.emDash ?? "—"}</div>`;
    $("#reel-duration").innerHTML   = `<div class="reel-item placeholder">${t.emDash ?? "—"}</div>`;
    $("#reel-players").innerHTML    = `<div class="reel-item placeholder">${t.emDash ?? "—"}</div>`;
  }

  setText("footerText",       t.footer);
  setText("sourcesLabel",     t.sourcesLabel);
  setText("settingsLabelText", t.settings);

  // Settings dialog headings
  setText("dlgTitle",         t.settings);
  setText("dlgLanguageLabel", t.language);
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el && v != null) el.textContent = v;
}

/* =========================================================
   CONTROLS — mode, level, theme input
   ========================================================= */
function bindControls() {
  $$(".mode-btn").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode))
  );

  $$(".level-btn").forEach((b) =>
    b.addEventListener("click", () => setLevel(b.dataset.level))
  );

  const themesInput  = $("#themesInput");
  const useRandomBtn = $("#useRandomBtn");

  themesInput.addEventListener("input", refreshThemeStatus);
  useRandomBtn.addEventListener("click", () => {
    themesInput.value = "";
    refreshThemeStatus();
    themesInput.focus();
  });

  $("#generateBtn").addEventListener("click", generateAll);

  $$(".reroll-btn").forEach((b) =>
    b.addEventListener("click", async () => {
      if (state.isGenerating) return;
      const target = b.dataset.reroll;
      b.disabled = true;
      await spinTarget(target, 0);
      b.disabled = false;
    })
  );

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      generateAll();
    }
  });
}

function setMode(mode) {
  state.mode = mode;
  $$(".mode-btn").forEach((b) => {
    const a = b.dataset.mode === mode;
    b.classList.toggle("active", a);
    b.setAttribute("aria-selected", a ? "true" : "false");
  });
  $$(".match-only").forEach((el) => { el.hidden = mode !== "match"; });
}

function setLevel(level) {
  state.level = level;
  $$(".level-btn").forEach((b) => {
    const a = b.dataset.level === level;
    b.classList.toggle("active", a);
    b.setAttribute("aria-checked", a ? "true" : "false");
  });
}

function refreshThemeStatus() {
  const t = store.ui;
  const themesInput = $("#themesInput");
  const lines = themesInput.value.split("\n").map(s => s.trim()).filter(Boolean);
  state.customThemes = lines;
  state.useCustom    = lines.length > 0;
  const status = $("#themeStatus");
  if (state.useCustom) {
    const label = (typeof t.statusCustom === "function")
      ? t.statusCustom(lines.length)
      : `${lines.length} themes`;
    status.textContent = label;
  } else {
    status.textContent = t.statusRandom ?? "";
  }
}

/* =========================================================
   GENERATE
   ========================================================= */
function pickFor(target) {
  const data  = store.data;
  const { mode, level } = state;
  switch (target) {
    case "exercise": {
      const ex = pick(data.exercises[mode][level]);
      return { value: ex.name, meta: ex.desc };
    }
    case "constraint": return { value: pick(data.constraints[mode][level]) };
    case "theme": {
      const pool = state.useCustom ? state.customThemes : data.themes[level];
      return { value: pick(pool) };
    }
    case "category": {
      const c = pick(data.categories);
      return { value: c.name, meta: c.desc };
    }
    case "duration": return { value: pick(data.durations[level]) };
    case "players":  return { value: pick(data.players[level]) };
  }
  return { value: "—" };
}

function poolFor(target) {
  const data  = store.data;
  const { mode, level } = state;
  switch (target) {
    case "exercise":   return data.exercises[mode][level].map(e => e.name);
    case "constraint": return data.constraints[mode][level];
    case "theme":      return state.useCustom ? state.customThemes : data.themes[level];
    case "category":   return data.categories.map(c => c.name);
    case "duration":   return data.durations[level];
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
  if (state.useCustom && state.customThemes.length === 0) {
    $("#themesInput").focus();
    return;
  }

  state.isGenerating = true;
  const btn = $("#generateBtn");
  btn.disabled = true;
  $("#rerollBar").hidden = false;

  $$(".card").forEach((c) => {
    c.classList.remove("revealed");
    c.classList.add("appearing");
  });
  setTimeout(() => $$(".card").forEach(c => c.classList.remove("appearing")), 600);

  const targets = state.mode === "match"
    ? ["category", "exercise", "constraint", "theme", "duration", "players"]
    : ["exercise", "constraint", "theme"];

  await Promise.all(targets.map((t, i) => spinTarget(t, i * 220)));

  state.isGenerating = false;
  btn.disabled = false;
}

/* =========================================================
   UTILITIES
   ========================================================= */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Wraps a UI mutation in document.startViewTransition when available. */
function withViewTransition(fn) {
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(fn);
  } else {
    fn();
  }
}
