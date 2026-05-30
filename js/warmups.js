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
  async function loadData() {
    // The warmups.json file is referenced via a <script type="application/json">
    // tag in the HTML; we re-fetch it explicitly so we get parsed JSON
    // regardless of how the browser handled the tag.
    try {
      const r = await fetch("./data/warmups.json?v=" + Date.now());
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      WARMUPS = await r.json();
    } catch (e) {
      console.warn("[warmups] failed to load data/warmups.json", e);
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
    sel.innerHTML = '<option value="">Tous les types</option>'
      + types.map(({ t, n }) => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${n})</option>`).join("");
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
      status.textContent = list.length + " / " + (WARMUPS.exercises || []).length + " exercices";
    }
    const wrap = $("#warmupList");
    if (!wrap) return;
    if (list.length === 0) {
      wrap.innerHTML = '<div class="warmup-empty">' +
        '<strong>Aucun exercice ne correspond à ces filtres.</strong>' +
        '<div>Change le type ou efface la recherche.</div></div>';
      return;
    }
    wrap.innerHTML = list.map(e => {
      const meta = [];
      if (e.participants) meta.push('<span class="meta-chip">' + escapeHtml(e.participants) + '</span>');
      if (e.duration_seconds) meta.push('<span class="meta-chip">⏱ ' + escapeHtml(fmtDuration(e.duration_seconds)) + '</span>');
      if (e.source) meta.push('<span class="meta-chip" title="Source">' + escapeHtml(e.source) + '</span>');
      const chronoBtn = e.duration_seconds
        ? '<button type="button" data-action="chrono" data-id="' + escapeHtml(e.id) + '">⏱ Lancer chrono</button>'
        : '';
      const isPicked = pickedId === e.id;
      const communityTag = e._community
        ? '<span class="card-community-tag" title="Proposé par la communauté">Communauté</span>'
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
  //   Random picker
  // ─────────────────────────────────────────────────────────────────
  function pickRandom() {
    const list = getFiltered();
    if (list.length === 0) return;
    const choice = list[Math.floor(Math.random() * list.length)];
    pickedId = choice.id;
    renderList();
    // Scroll the picked card into view if it's off-screen.
    setTimeout(() => {
      const el = document.querySelector('.warmup-card[data-id="' + CSS.escape(choice.id) + '"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }

  // ─────────────────────────────────────────────────────────────────
  //   Chrono overlay
  // ─────────────────────────────────────────────────────────────────
  const chrono = {
    total: 0, remaining: 0, running: false,
    intervalId: null, exercise: null
  };

  function openChrono(exercise) {
    chrono.exercise = exercise;
    chrono.total = exercise.duration_seconds || 0;
    chrono.remaining = chrono.total;
    chrono.running = false;
    const overlay = $("#chronoOverlay");
    if (!overlay) return;
    $("#chronoExoName").textContent = exercise.name || "";
    $("#chronoExoType").textContent = exercise.type || "";
    $("#chronoStartBtn").textContent = "▶ Démarrer";
    refreshChronoDisplay();
    overlay.hidden = false;
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
        // Quick haptic + audio cue if available.
        try { if (navigator.vibrate) navigator.vibrate([180, 60, 180, 60, 180]); } catch (e) {}
      }
    } else {
      chronoStop();
    }
  }

  function chronoStart() {
    if (chrono.running) return;
    if (chrono.remaining <= 0) chrono.remaining = chrono.total;
    if (chrono.remaining <= 0) return;
    chrono.running = true;
    chrono.intervalId = setInterval(chronoTick, 1000);
    $("#chronoStartBtn").textContent = "⏸ Pause";
  }

  function chronoStop() {
    if (chrono.intervalId) clearInterval(chrono.intervalId);
    chrono.intervalId = null;
    chrono.running = false;
    const btn = $("#chronoStartBtn");
    if (btn) btn.textContent = chrono.remaining > 0 ? "▶ Reprendre" : "▶ Démarrer";
  }

  function chronoReset() {
    chronoStop();
    chrono.remaining = chrono.total;
    refreshChronoDisplay();
    const btn = $("#chronoStartBtn");
    if (btn) btn.textContent = "▶ Démarrer";
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
    // Close chrono on Esc
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !$("#chronoOverlay").hidden) closeChrono();
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
  async function boot() {
    syncAuthClass();
    await loadData();
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
