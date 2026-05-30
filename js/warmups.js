/**
 * warmups.js — standalone warmup exercise library.
 *
 * Loads data/warmups.json (a static, curated list maintained out of band)
 * and renders filterable cards. The "🎲 Tirage aléatoire" button picks one
 * matching the active filters. Each card with a duration shows a "Lancer
 * chrono" button that opens a modal countdown.
 *
 * The page is gated behind authentication via styles.css `.warmup-trigger`
 * but the page itself doesn't enforce a session check — the gate is the
 * visibility of the nav button. Anyone with the direct URL can read it.
 */
(function () {
  "use strict";

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let WARMUPS = { exercises: [], types: [] };
  let activeFilter = ""; // type slug or ""
  let activeQuery = "";
  let pickedId = null;

  // ─── i18n — reads UI strings from the bundled IMPRO_BUNDLE.ui (data/all.js).
  function uiStrings() {
    const loc = (localStorage.getItem("impro-studio:locale:v1") || "fr").trim();
    const all = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui) || {};
    return all[loc] || all.fr || {};
  }
  function t(key, fallback) {
    const v = uiStrings()[key];
    return (typeof v === "string" && v.length) ? v : (fallback || "");
  }

  // Supabase client (optional — the static JSON works without it; the
  // client only adds community-submitted approved exercises + the submit
  // flow). Created lazily in boot().
  let sb = null;
  function getSb() {
    if (sb) return sb;
    try {
      const cfg = window.actoConfig && window.actoConfig.supabase;
      if (!cfg || !window.supabase) return null;
      sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      return sb;
    } catch (e) { return null; }
  }

  // ─────────────────────────────────────────────────────────────────
  //   Data loading
  // ─────────────────────────────────────────────────────────────────
  function currentLocale() {
    const supported = ["fr", "en", "de", "es", "pt", "nl", "it"];
    let loc = (localStorage.getItem("impro-studio:locale:v1") || "").trim().toLowerCase();
    if (!supported.includes(loc)) {
      // Derive from the browser, fall back to FR.
      const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "fr";
      loc = String(nav).toLowerCase().split(/[-_]/)[0];
      if (!supported.includes(loc)) loc = "fr";
    }
    return loc;
  }

  async function loadData() {
    // Locale-specific exercise file (data/warmups-<locale>.json), with a
    // hard fallback to the French base if the translation is missing or
    // fails to load.
    const loc = currentLocale();
    const tryFetch = async (url) => {
      const r = await fetch(url + "?v=" + Date.now());
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return r.json();
    };
    try {
      WARMUPS = await tryFetch("./data/warmups-" + loc + ".json");
    } catch (e1) {
      try {
        WARMUPS = await tryFetch("./data/warmups-fr.json");
      } catch (e2) {
        try {
          // Legacy single-file path (pre-i18n) — last resort.
          WARMUPS = await tryFetch("./data/warmups.json");
        } catch (e) {
          console.warn("[warmups] failed to load any warmups data file", e1, e2, e);
      // Fallback: ship a minimal placeholder so the page is functional
      // even before the scrape agent has finished writing the file.
      WARMUPS = {
        exercises: [
          {
            id: "le-miroir",
            type: "Concentration",
            name: "Le miroir",
            description: "Deux joueurs face à face. L'un fait des mouvements lents, l'autre l'imite en miroir parfait. On accélère progressivement, puis on inverse les rôles.",
            duration_seconds: 180,
            participants: "2 joueurs",
            source: "Classique"
          },
          {
            id: "le-bouchon",
            type: "Voix",
            name: "Le bouchon",
            description: "Placez un bouchon en liège entre les dents, articulez un texte ou improvisez en lisant un poème — pour libérer la mâchoire et la voix.",
            duration_seconds: 120,
            participants: "Tous",
            source: "Classique"
          },
          {
            id: "le-zip-zap-zop",
            type: "Énergie",
            name: "Zip Zap Zop",
            description: "En cercle. Un joueur envoie « zip » avec un geste vers un voisin, qui passe « zap » à un autre, puis « zop ». Tempo qui monte progressivement.",
            duration_seconds: 240,
            participants: "Tous",
            source: "Classique"
          },
          {
            id: "yes-and",
            type: "Écoute",
            name: "Yes, and…",
            description: "Toute proposition de votre partenaire est acceptée et enrichie avec « oui, et… ». Aucune négation. Règle d'or de l'impro.",
            duration_seconds: 300,
            participants: "Tous",
            source: "Classique"
          }
        ],
        types: [
          "Énergie","Concentration","Écoute","Confiance","Imagination",
          "Voix","Corps","Statut","Émotion","Construction d'histoire",
          "Personnage","Pantomime","Plateau (ensemble)","Mémoire"
        ]
      };
        }
      }
    }
  }

  /** Fetch approved community-submitted exercises from Supabase and merge
   *  them into WARMUPS.exercises. Tagged with `_community: true` so the UI
   *  can badge them. De-duped by lowercase name against the static base. */
  async function mergeCommunityExercises() {
    const client = getSb();
    if (!client) return;
    try {
      const { data, error } = await client
        .from("warmup_exercises")
        .select("id, type, subtype, name, description, duration_seconds, participants, source, locale, created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) { console.warn("[warmups] community fetch", error); return; }
      const existing = new Set((WARMUPS.exercises || []).map(e => (e.name || "").trim().toLowerCase()));
      (data || []).forEach(r => {
        const key = (r.name || "").trim().toLowerCase();
        if (!key || existing.has(key)) return;
        existing.add(key);
        WARMUPS.exercises.push({
          id: "db-" + r.id,
          type: r.type,
          subtype: r.subtype || "",
          name: r.name,
          description: r.description,
          duration_seconds: r.duration_seconds || null,
          participants: r.participants || "",
          source: r.source || "Communauté",
          _community: true
        });
      });
    } catch (e) { console.warn("[warmups] community merge failed", e); }
  }

  // ─────────────────────────────────────────────────────────────────
  //   Rendering
  // ─────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtDuration(sec) {
    if (sec == null) return "";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return s + "s";
    if (s === 0) return m + " min";
    return m + ":" + String(s).padStart(2, "0") + " min";
  }

  function populateTypeFilter() {
    const sel = $("#warmupTypeFilter");
    if (!sel) return;
    // Distinct types from the loaded exercises, sorted by frequency.
    const counts = new Map();
    (WARMUPS.exercises || []).forEach(e => {
      if (!e.type) return;
      counts.set(e.type, (counts.get(e.type) || 0) + 1);
    });
    const types = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => ({ t, n }));
    sel.innerHTML = '<option value="">' + escapeHtml(t("warmupsTypeAll", "Tous les types")) + '</option>'
      + types.map(({ t: ty, n }) => `<option value="${escapeHtml(ty)}">${escapeHtml(ty)} (${n})</option>`).join("");
  }

  function getFiltered() {
    const q = activeQuery.toLowerCase();
    return (WARMUPS.exercises || []).filter(e => {
      if (activeFilter && e.type !== activeFilter) return false;
      if (q) {
        const hay = [e.name, e.description, e.type, e.participants].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderList() {
    const list = getFiltered();
    const status = $("#warmupStatus");
    if (status) {
      status.textContent = t("warmupsCount", "{n} / {total} exercices")
        .replace("{n}", list.length).replace("{total}", (WARMUPS.exercises || []).length);
    }
    const wrap = $("#warmupList");
    if (!wrap) return;
    if (list.length === 0) {
      wrap.innerHTML = '<div class="warmup-empty">' +
        '<strong>' + escapeHtml(t("warmupsEmptyTitle", "Aucun exercice ne correspond à ces filtres.")) + '</strong>' +
        '<div>' + escapeHtml(t("warmupsEmptyBlurb", "Change le type ou efface la recherche.")) + '</div></div>';
      return;
    }
    const chronoLbl = t("warmupsCardChronoBtn", "⏱ Lancer chrono");
    const communityLbl = t("warmupsCommunityTag", "Communauté");
    wrap.innerHTML = list.map(e => {
      const meta = [];
      if (e.participants) meta.push('<span class="meta-chip">' + escapeHtml(e.participants) + '</span>');
      if (e.duration_seconds) meta.push('<span class="meta-chip">⏱ ' + escapeHtml(fmtDuration(e.duration_seconds)) + '</span>');
      if (e.source) meta.push('<span class="meta-chip" title="Source">' + escapeHtml(e.source) + '</span>');
      const chronoBtn = e.duration_seconds
        ? '<button type="button" data-action="chrono" data-id="' + escapeHtml(e.id) + '">' + escapeHtml(chronoLbl) + '</button>'
        : '';
      const isPicked = pickedId === e.id;
      const communityTag = e._community
        ? '<span class="card-community-tag">' + escapeHtml(communityLbl) + '</span>'
        : '';
      const subtypeBit = e.subtype ? ' · ' + escapeHtml(e.subtype) : '';
      return '<div class="warmup-card' + (isPicked ? ' is-picked' : '') + (e._community ? ' is-community' : '') + '" data-id="' + escapeHtml(e.id) + '">' +
        '<span class="card-type">' + escapeHtml(e.type || "") + subtypeBit + communityTag + '</span>' +
        '<h3>' + escapeHtml(e.name) + '</h3>' +
        '<p>' + escapeHtml(e.description) + '</p>' +
        (meta.length ? '<div class="card-meta">' + meta.join("") + '</div>' : "") +
        (chronoBtn ? '<div class="card-actions">' + chronoBtn + '</div>' : "") +
      '</div>';
    }).join("");
  }

  // ─────────────────────────────────────────────────────────────────
  //   Random picker → result popup
  // ─────────────────────────────────────────────────────────────────
  let drawnExercise = null;

  function pickRandom() {
    const list = getFiltered();
    if (list.length === 0) return;
    const choice = list[Math.floor(Math.random() * list.length)];
    pickedId = choice.id;
    drawnExercise = choice;
    renderList(); // keep the card highlighted underneath the popup
    openDrawPopup(choice);
  }

  function openDrawPopup(e) {
    const overlay = $("#drawOverlay");
    if (!overlay) return;
    $("#drawExoType").textContent = (e.type || "") + (e.subtype ? " · " + e.subtype : "");
    $("#drawExoName").textContent = e.name || "";
    $("#drawExoDesc").textContent = e.description || "";
    const meta = [];
    if (e.participants) meta.push('<span class="meta-chip">' + escapeHtml(e.participants) + '</span>');
    if (e.duration_seconds) meta.push('<span class="meta-chip">⏱ ' + escapeHtml(fmtDuration(e.duration_seconds)) + '</span>');
    if (e.source) meta.push('<span class="meta-chip">' + escapeHtml(e.source) + '</span>');
    $("#drawExoMeta").innerHTML = meta.join("");
    overlay.hidden = false;
  }
  function closeDrawPopup() {
    const overlay = $("#drawOverlay");
    if (overlay) overlay.hidden = true;
  }

  // ─────────────────────────────────────────────────────────────────
  //   Chrono overlay (with optional custom-duration setter + end sound)
  // ─────────────────────────────────────────────────────────────────
  const chrono = {
    total: 0, remaining: 0, running: false,
    intervalId: null, exercise: null
  };

  /** Play an end-of-chrono sound via the Web Audio API (no asset file
   *  needed). Three rising beeps. Tolerant of autoplay restrictions —
   *  if the AudioContext can't start, it silently no-ops. */
  function playEndSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const beep = (t, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.32);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + t); osc.stop(now + t + 0.34);
      };
      beep(0,    660);
      beep(0.38, 880);
      beep(0.76, 1180);
      // Close the context shortly after the last beep ends.
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1500);
    } catch (e) { /* ignore — audio is best-effort */ }
  }

  function openChrono(exercise) {
    chrono.exercise = exercise;
    const overlay = $("#chronoOverlay");
    if (!overlay) return;
    $("#chronoExoName").textContent = exercise.name || "";
    $("#chronoExoType").textContent = (exercise.type || "") + (exercise.subtype ? " · " + exercise.subtype : "");
    const setBox = $("#chronoSet");
    if (exercise.duration_seconds) {
      // Preset duration → hide the custom setter, prime the countdown.
      if (setBox) setBox.hidden = true;
      chrono.total = exercise.duration_seconds;
    } else {
      // No duration → show the custom setter, default 3 min.
      if (setBox) setBox.hidden = false;
      const min = $("#chronoSetMin"), sec = $("#chronoSetSec");
      if (min) min.value = 3;
      if (sec) sec.value = 0;
      chrono.total = readCustomDuration();
    }
    chrono.remaining = chrono.total;
    chrono.running = false;
    $("#chronoStartBtn").textContent = t("warmupsChronoStart", "▶ Démarrer");
    refreshChronoDisplay();
    overlay.hidden = false;
  }

  /** Read the minutes+seconds inputs into a total seconds count. */
  function readCustomDuration() {
    const min = parseInt(($("#chronoSetMin") || {}).value, 10) || 0;
    const sec = parseInt(($("#chronoSetSec") || {}).value, 10) || 0;
    return Math.max(0, min * 60 + Math.min(59, Math.max(0, sec)));
  }

  function closeChrono() {
    chronoStop();
    const overlay = $("#chronoOverlay");
    if (overlay) overlay.hidden = true;
  }

  function refreshChronoDisplay() {
    const el = $("#chronoDisplay");
    if (!el) return;
    const m = Math.floor(chrono.remaining / 60);
    const s = chrono.remaining % 60;
    el.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    el.classList.toggle("is-warning", chrono.remaining > 0 && chrono.remaining <= 10);
    el.classList.toggle("is-done",    chrono.remaining <= 0);
  }

  function chronoTick() {
    if (chrono.remaining > 0) {
      chrono.remaining--;
      refreshChronoDisplay();
      if (chrono.remaining === 0) {
        chronoStop();
        playEndSound();
        try { if (navigator.vibrate) navigator.vibrate([180, 60, 180, 60, 180]); } catch (e) {}
      }
    } else {
      chronoStop();
    }
  }

  function chronoStart() {
    if (chrono.running) return;
    // If the custom setter is visible (no preset duration), read it now.
    const setBox = $("#chronoSet");
    if (setBox && !setBox.hidden) {
      chrono.total = readCustomDuration();
      chrono.remaining = chrono.total;
      // Lock the setter while running so the countdown is stable.
      setBox.hidden = true;
    }
    if (chrono.remaining <= 0) chrono.remaining = chrono.total;
    if (chrono.remaining <= 0) return;
    chrono.running = true;
    chrono.intervalId = setInterval(chronoTick, 1000);
    refreshChronoDisplay();
    $("#chronoStartBtn").textContent = t("warmupsChronoPause", "⏸ Pause");
  }

  function chronoStop() {
    if (chrono.intervalId) clearInterval(chrono.intervalId);
    chrono.intervalId = null;
    chrono.running = false;
    const btn = $("#chronoStartBtn");
    if (btn) btn.textContent = chrono.remaining > 0 ? t("warmupsChronoResume", "▶ Reprendre") : t("warmupsChronoStart", "▶ Démarrer");
  }

  function chronoReset() {
    chronoStop();
    // If the exercise had no preset duration, re-show the setter.
    const setBox = $("#chronoSet");
    if (chrono.exercise && !chrono.exercise.duration_seconds && setBox) {
      setBox.hidden = false;
      chrono.total = readCustomDuration();
    }
    chrono.remaining = chrono.total;
    refreshChronoDisplay();
    const btn = $("#chronoStartBtn");
    if (btn) btn.textContent = t("warmupsChronoStart", "▶ Démarrer");
  }

  // ─────────────────────────────────────────────────────────────────
  //   Submit dialog (community contribution)
  // ─────────────────────────────────────────────────────────────────
  /** Parse a free-form duration string ("3 min", "90 s", "2:30") into
   *  seconds, or null if empty/unparseable. */
  function parseDuration(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return null;
    // mm:ss
    let m = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    // "X min" / "X minutes" / "X m"
    m = s.match(/^(\d+(?:[.,]\d+)?)\s*m(?:in|inutes?)?\.?$/);
    if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
    // "X s" / "X sec" / "X secondes"
    m = s.match(/^(\d+)\s*s(?:ec(?:ondes?)?)?\.?$/);
    if (m) return parseInt(m[1], 10);
    // bare number → assume minutes if small, seconds otherwise
    m = s.match(/^(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); return n <= 20 ? n * 60 : n; }
    return null;
  }

  async function openSubmitDialog() {
    const client = getSb();
    const { data } = client ? await client.auth.getSession() : { data: { session: null } };
    if (!data || !data.session || !data.session.user) {
      alert("Connecte-toi sur l'app pour proposer un exercice : " + window.location.origin + "/index.html");
      return;
    }
    const dlg = $("#warmupSubmitDialog");
    if (!dlg) return;
    ["warmupAddSubtype","warmupAddName","warmupAddDescription","warmupAddDuration",
     "warmupAddParticipants","warmupAddSource"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("warmupAddType").value = "Échauffement";
    const err = $("#warmupSubmitError"); if (err) { err.hidden = true; err.textContent = ""; }
    const ok  = $("#warmupSubmitSuccess"); if (ok) { ok.hidden = true; ok.textContent = ""; }
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    setTimeout(() => { const n = $("#warmupAddName"); if (n) n.focus(); }, 0);
  }
  function closeSubmitDialog() {
    const dlg = $("#warmupSubmitDialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }
  async function submitWarmup(ev) {
    ev.preventDefault();
    const err = $("#warmupSubmitError");
    const ok  = $("#warmupSubmitSuccess");
    if (err) { err.hidden = true; err.textContent = ""; }
    if (ok)  { ok.hidden = true; ok.textContent = ""; }
    const name = (document.getElementById("warmupAddName").value || "").trim();
    const desc = (document.getElementById("warmupAddDescription").value || "").trim();
    if (!name || !desc) {
      if (err) { err.textContent = "Le nom et la description sont obligatoires."; err.hidden = false; }
      return;
    }
    const client = getSb();
    if (!client) {
      if (err) { err.textContent = "Connexion à la base impossible."; err.hidden = false; }
      return;
    }
    const submitBtn = $("#warmupSubmitConfirmBtn");
    const cancelBtn = $("#warmupSubmitCancelBtn");
    const origLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Envoi…"; }
    if (cancelBtn) cancelBtn.disabled = true;
    try {
      const { error } = await client.rpc("submit_warmup_exercise", {
        p_type:             document.getElementById("warmupAddType").value,
        p_subtype:          document.getElementById("warmupAddSubtype").value || "",
        p_name:             name,
        p_description:      desc,
        p_duration_seconds: parseDuration(document.getElementById("warmupAddDuration").value),
        p_participants:     document.getElementById("warmupAddParticipants").value || "",
        p_source:           document.getElementById("warmupAddSource").value || "",
        p_locale:           (localStorage.getItem("impro-studio:locale:v1") || "fr").trim()
      });
      if (error) throw error;
      if (ok) { ok.textContent = "✓ Proposition envoyée à l'admin pour validation."; ok.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origLabel; }
      if (cancelBtn) cancelBtn.disabled = false;
      setTimeout(closeSubmitDialog, 1500);
    } catch (e) {
      console.warn("[warmups] submit failed", e);
      if (err) { err.textContent = "Échec de l'envoi : " + ((e && e.message) || e); err.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origLabel; }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //   Wiring
  // ─────────────────────────────────────────────────────────────────
  function wire() {
    const query = $("#warmupQuery");
    if (query) query.addEventListener("input", () => {
      activeQuery = query.value.trim();
      renderList();
    });
    const filter = $("#warmupTypeFilter");
    if (filter) filter.addEventListener("change", () => {
      activeFilter = filter.value;
      renderList();
    });
    const rand = $("#warmupRandomBtn");
    if (rand) rand.addEventListener("click", pickRandom);
    // Submit dialog wiring
    const addBtn = $("#warmupAddBtn");
    if (addBtn) addBtn.addEventListener("click", openSubmitDialog);
    const closeBtn = $("#warmupSubmitCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeSubmitDialog);
    const cancelBtn = $("#warmupSubmitCancelBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", closeSubmitDialog);
    const form = $("#warmupSubmitForm");
    if (form) form.addEventListener("submit", submitWarmup);
    // Card actions (chrono button)
    const list = $("#warmupList");
    if (list) list.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      const exercise = (WARMUPS.exercises || []).find(e => e.id === id);
      if (!exercise) return;
      if (btn.dataset.action === "chrono") openChrono(exercise);
    });
    // Chrono controls
    const chronoCloseBtn = $("#chronoCloseBtn");
    if (chronoCloseBtn) chronoCloseBtn.addEventListener("click", closeChrono);
    const startBtn = $("#chronoStartBtn");
    if (startBtn) startBtn.addEventListener("click", () => {
      if (chrono.running) chronoStop();
      else chronoStart();
    });
    const resetBtn = $("#chronoResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", chronoReset);

    // Custom-duration preset chips (30s / 1min / 2min / 5min)
    const presets = $("#chronoSet");
    if (presets) presets.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-sec]");
      if (!b) return;
      const sec = parseInt(b.dataset.sec, 10) || 0;
      const minEl = $("#chronoSetMin"), secEl = $("#chronoSetSec");
      if (minEl) minEl.value = Math.floor(sec / 60);
      if (secEl) secEl.value = sec % 60;
      chrono.total = readCustomDuration();
      chrono.remaining = chrono.total;
      refreshChronoDisplay();
    });
    // Live-update the displayed countdown as the user types a custom time.
    ["chronoSetMin", "chronoSetSec"].forEach(id => {
      const el = $("#" + id);
      if (el) el.addEventListener("input", () => {
        if (chrono.running) return;
        chrono.total = readCustomDuration();
        chrono.remaining = chrono.total;
        refreshChronoDisplay();
      });
    });

    // Draw-result popup buttons
    const drawClose  = $("#drawCloseBtn");
    const drawClose2 = $("#drawCloseBtn2");
    if (drawClose)  drawClose.addEventListener("click", closeDrawPopup);
    if (drawClose2) drawClose2.addEventListener("click", closeDrawPopup);
    const drawRedraw = $("#drawRedrawBtn");
    if (drawRedraw) drawRedraw.addEventListener("click", pickRandom);
    const drawChrono = $("#drawChronoBtn");
    if (drawChrono) drawChrono.addEventListener("click", () => {
      if (drawnExercise) { closeDrawPopup(); openChrono(drawnExercise); }
    });

    // Close any overlay on Esc.
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (!$("#chronoOverlay").hidden) closeChrono();
      else if (!$("#drawOverlay").hidden) closeDrawPopup();
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //   Auth state — keep body.is-signed-in in sync so the top-actions
  //   layout uses the same visibility rules as the rest of the app.
  // ─────────────────────────────────────────────────────────────────
  function syncAuthClass() {
    const client = getSb();
    if (!client) {
      // No SDK available — best-effort: assume signed in so the
      // Échauffement nav doesn't itself disappear on this very page.
      document.body.classList.add("is-signed-in");
      return;
    }
    client.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) document.body.classList.add("is-signed-in");
      else                          document.body.classList.remove("is-signed-in");
    }).catch(() => {});
    client.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) document.body.classList.add("is-signed-in");
      else                          document.body.classList.remove("is-signed-in");
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //   Boot
  // ─────────────────────────────────────────────────────────────────
  /** Translate the static HTML chrome (labels, buttons, placeholders) from
   *  the i18n bundle. Called once at boot after data loads. */
  function applyStaticTexts() {
    const setText = (sel, key, fb) => { const el = $(sel); if (el) el.textContent = t(key, fb); };
    const setPh   = (sel, key, fb) => { const el = $(sel); if (el) el.placeholder = t(key, fb); };
    setText("#warmupsPageTitle", "warmupsPageTitle", "Échauffement");
    // Keep the 🔥 prefix on the H1.
    const h1 = $("#warmupsPageTitle"); if (h1) h1.textContent = "🔥 " + t("warmupsPageTitle", "Échauffement");
    setText("#warmupsBlurb", "warmupsBlurb", "");
    setPh("#warmupQuery", "warmupsSearchPlaceholder", "");
    setText("#warmupRandomBtn", "warmupsRandomBtn", "🎲 Tirage aléatoire");
    setText("#warmupAddBtn", "warmupsAddBtn", "+ Proposer un exercice");
    const back = $(".warmup-back a"); if (back) back.textContent = t("warmupsBackToApp", "← Retour à l'app");
    // Draw popup
    setText("#drawBadge", "warmupsDrawBadge", "🎲 Tirage");
    setText("#drawChronoBtn", "warmupsDrawChrono", "⏱ Lancer le chrono");
    setText("#drawRedrawBtn", "warmupsDrawRedraw", "🎲 Relancer");
    setText("#drawCloseBtn2", "warmupsDrawClose", "✕ Fermer");
    // Chrono
    setText("#chronoStartBtn", "warmupsChronoStart", "▶ Démarrer");
    setText("#chronoResetBtn", "warmupsChronoReset", "↺ Reset");
    setText("#chronoSetLabel", "warmupsChronoSetLabel", "Aucune durée définie — choisis-en une :");
    // Submit dialog
    setText("#warmupSubmitTitle", "warmupsSubmitTitle", "Proposer un exercice");
    setText("#warmupSubmitHelp", "warmupsSubmitHelp", "");
    setText("#warmupSubmitConfirmBtn", "warmupsSubmitSend", "Envoyer");
    setText("#warmupSubmitCancelBtn", "warmupsSubmitCancel", "Annuler");
    // Submit dialog field labels (the <span> inside each <label>)
    const labelByFor = [
      ["warmupAddType", "warmupsFieldType", "Type *"],
      ["warmupAddSubtype", "warmupsFieldSubtype", "Sous-type"],
      ["warmupAddName", "warmupsFieldName", "Nom de l'exercice *"],
      ["warmupAddDescription", "warmupsFieldDescription", "Description *"],
      ["warmupAddDuration", "warmupsFieldDuration", "Durée (optionnel)"],
      ["warmupAddParticipants", "warmupsFieldParticipants", "Participants"],
      ["warmupAddSource", "warmupsFieldSource", "Source (optionnel)"]
    ];
    labelByFor.forEach(([inputId, key, fb]) => {
      const inp = document.getElementById(inputId);
      const span = inp && inp.closest("label") && inp.closest("label").querySelector("span");
      if (span) span.textContent = t(key, fb);
    });
  }

  async function boot() {
    syncAuthClass();
    await loadData();
    applyStaticTexts();
    // Merge community-approved exercises from Supabase (best-effort — the
    // static base renders immediately, community ones appear once fetched).
    await mergeCommunityExercises();
    populateTypeFilter();
    renderList();
    wire();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
