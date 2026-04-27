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
    isGenerating: false
  };

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el && v != null) el.textContent = v;
  }

  function applyTranslations() {
    const t = store.ui;
    document.documentElement.lang = store.locale;
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

    const teamA = $("#teamA"), teamB = $("#teamB");
    if (teamA) teamA.placeholder = t.teamA ?? "";
    if (teamB) teamB.placeholder = t.teamB ?? "";

    setText("themesHint",       t.themesHint);
    const themesInput = $("#themesInput");
    if (themesInput) themesInput.placeholder = t.themesPlaceholder ?? "";
    setText("useRandomBtn",     t.useRandom);
    refreshThemeStatus();

    setText("generateLabel",    t.generate);

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
    if (!themesInput) return;
    const lines = themesInput.value.split("\n").map(s => s.trim()).filter(Boolean);
    state.customThemes = lines;
    state.useCustom    = lines.length > 0;
    const status = $("#themeStatus");
    if (!status) return;
    if (state.useCustom) {
      // statusCustom is a JSON string template, NOT a function (since JSON can't carry functions).
      // We do simple pluralization manually.
      const plural = lines.length > 1;
      const lc = store.locale;
      const labels = {
        fr: `Mode : ${lines.length} thème${plural?"s":""} personnel${plural?"s":""}`,
        en: `Mode: ${lines.length} custom theme${plural?"s":""}`,
        de: `Modus: ${lines.length} eigene${plural?"":""} Thema${plural?"s":""}`,
        es: `Modo: ${lines.length} tema${plural?"s":""} personal${plural?"es":""}`,
        pt: `Modo: ${lines.length} tema${plural?"s":""} pessoal${plural?"is":""}`,
        nl: `Modus: ${lines.length} eigen thema${plural?"'s":""}`
      };
      status.textContent = labels[lc] || labels.fr;
    } else {
      status.textContent = t.statusRandom ?? "";
    }
  }

  function pickFor(target) {
    const data = store.data;
    const { mode, level } = state;
    switch (target) {
      case "exercise":   { const ex = pick(data.exercises[mode][level]); return { value: ex.name, meta: ex.desc }; }
      case "constraint": return { value: pick(data.constraints[mode][level]) };
      case "theme":      { const pool = state.useCustom ? state.customThemes : data.themes[level]; return { value: pick(pool) }; }
      case "category":   { const c = pick(data.categories); return { value: c.name, meta: c.desc }; }
      case "duration":   return { value: pick(data.durations[level]) };
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
    if (state.useCustom && state.customThemes.length === 0) { $("#themesInput").focus(); return; }
    state.isGenerating = true;
    $("#generateBtn").disabled = true;
    $("#rerollBar").hidden = false;
    $$(".card").forEach(c => { c.classList.remove("revealed"); c.classList.add("appearing"); });
    setTimeout(() => $$(".card").forEach(c => c.classList.remove("appearing")), 600);
    const targets = state.mode === "match"
      ? ["category", "exercise", "constraint", "theme", "duration", "players"]
      : ["exercise", "constraint", "theme"];
    await Promise.all(targets.map((t, i) => spinTarget(t, i * 220)));
    state.isGenerating = false;
    $("#generateBtn").disabled = false;
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

    initSettings();

    store.addEventListener("change", () => {
      if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.startViewTransition(applyTranslations);
      } else {
        applyTranslations();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
