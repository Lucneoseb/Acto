/**
 * inspirations.js — public page that lists approved inspiration_videos from
 * Supabase, with a live search filter + a submission popup (gated on auth).
 *
 * Works for unauthenticated visitors (RLS policy allows anon SELECT on
 * status='approved'). The "Proposer une vidéo" button opens a sign-in
 * hint if the user isn't logged in.
 */
(function () {
  "use strict";

  if (!window.actoConfig || !window.actoUtils) {
    document.body.innerHTML =
      '<div class="inspire-empty"><strong>Configuration manquante</strong>' +
      'js/config.js / js/utils.js non chargés.</div>';
    return;
  }
  const { url: SUPABASE_URL, key: SUPABASE_KEY } = window.actoConfig.supabase;
  const { escapeHtml } = window.actoUtils;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ------------------------------------------------------------------
     i18n — pulled from window.IMPRO_BUNDLE.ui (the same i18n bundle the
     main app uses). Fallbacks let the page boot even if a key is missing.
     ------------------------------------------------------------------ */
  const ui = () => {
    const locale = (localStorage.getItem("impro-studio:locale:v1") || "fr").trim();
    const all = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui) || {};
    return all[locale] || all.fr || {};
  };
  function t(key, fallback) {
    const v = ui()[key];
    return (typeof v === "string" && v.length) ? v : (fallback || "");
  }

  /* ------------------------------------------------------------------
     Static label maps — content_type / nature / category render values.
     Stored as enum keys server-side, displayed as locale labels here.
     ------------------------------------------------------------------ */
  const LABEL_TYPE_FR = {
    chaine: "Chaîne", match_impro: "Match d'impro", spectacle: "Spectacle longue forme",
    tutoriel: "Tutoriel", documentaire: "Documentaire", cabaret: "Cabaret",
    format_court: "Format court"
  };
  const LABEL_TYPE_EN = {
    chaine: "Channel", match_impro: "Impro match", spectacle: "Long-form show",
    tutoriel: "Tutorial", documentaire: "Documentary", cabaret: "Cabaret",
    format_court: "Short form"
  };
  const LABEL_NATURE_FR = { mixte: "Mixte", comparee: "Comparée", na: "N/A" };
  const LABEL_NATURE_EN = { mixte: "Mixed", comparee: "Compared", na: "N/A" };
  const LABEL_CAT_FR = {
    libre: "Libre", a_la_maniere_de: "À la manière de", chantee: "Chantée",
    rimee: "Rimée", sans_paroles: "Sans paroles", costumee: "Costumée",
    doublee: "Doublée", silencieuse: "Silencieuse", sportive: "Sportive",
    sans_contact: "Sans contact", a_2: "À 2", a_3: "À 3"
  };
  const LABEL_CAT_EN = {
    libre: "Free", a_la_maniere_de: "In the manner of", chantee: "Sung",
    rimee: "Rhymed", sans_paroles: "Silent", costumee: "Costumed",
    doublee: "Dubbed", silencieuse: "Silent (Wikiversité)", sportive: "Sport-themed",
    sans_contact: "No contact", a_2: "Duo", a_3: "Trio"
  };
  function labelType(v)    { const l = (ui().__locale__ === "en") ? LABEL_TYPE_EN    : LABEL_TYPE_FR;    return l[v] || v || ""; }
  function labelNature(v)  { const l = (ui().__locale__ === "en") ? LABEL_NATURE_EN  : LABEL_NATURE_FR;  return l[v] || v || ""; }
  function labelCategory(v){ const l = (ui().__locale__ === "en") ? LABEL_CAT_EN     : LABEL_CAT_FR;     return l[v] || v || ""; }
  // Quick locale guess for the labels: the ui() locale isn't directly
  // here, derive from current locale string.
  function curLocale() {
    return (localStorage.getItem("impro-studio:locale:v1") || "fr").trim();
  }
  function L(v, frMap, enMap) {
    return curLocale() === "en" ? (enMap[v] || v || "") : (frMap[v] || v || "");
  }

  /* ------------------------------------------------------------------
     Page text setup — pulls labels from i18n bundle, falls back to FR.
     ------------------------------------------------------------------ */
  function applyTexts() {
    document.title = t("inspirePageTitle", "Acto — Inspirations");
    const head = $("#inspirePageTitle"); if (head) head.textContent = "🎭 " + t("inspirePageTitleShort", "Inspirations");
    const blurb = $("#inspireBlurb"); if (blurb) blurb.textContent = t("inspireBlurb",
      "Une sélection vidéo de la communauté impro : matchs, longue forme, tutoriels, chaînes… Tape ci-dessous pour filtrer.");
    const qInput = $("#inspireQuery"); if (qInput) qInput.placeholder = t("inspireSearchPlaceholder",
      "Tape une catégorie, un thème, un nom de troupe, une nature…");
    const addBtn = $("#inspireAddBtn"); if (addBtn) addBtn.textContent = t("inspireAddBtn", "+ Proposer une vidéo");
    const back = document.querySelector(".inspire-back a"); if (back) back.textContent = t("inspireBackToApp", "← Retour à l'app");
    // Column headers
    $("#hdrTitle").textContent    = t("inspireColTitle",    "Titre / Lien");
    $("#hdrChannel").textContent  = t("inspireColChannel",  "Chaîne / Troupe");
    $("#hdrType").textContent     = t("inspireColType",     "Type");
    $("#hdrNature").textContent   = t("inspireColNature",   "Nature");
    $("#hdrCategory").textContent = t("inspireColCategory", "Catégorie");
    $("#hdrTheme").textContent    = t("inspireColTheme",    "Thème");
    $("#hdrDuration").textContent = t("inspireColDuration", "Durée");
    $("#hdrNotes").textContent    = t("inspireColNotes",    "Notes");
    // Top-action labels (Rules / Inspirations / Settings). Target ONLY the
    // text span (not the emoji span which carries aria-hidden) — earlier
    // a blanket `.top-trigger span` selector hit both spans and ended up
    // duplicating the label as "🎭 Inspirations" → "Inspirations Inspirations".
    $$(".top-trigger span:not([aria-hidden])").forEach((s) => {
      const btn = s.closest(".top-trigger");
      if (!btn) return;
      if (btn.classList.contains("rules-trigger"))    s.textContent = t("rulesLabelText", "Règles");
      if (btn.classList.contains("inspire-trigger"))  s.textContent = t("inspireLabelText", "Inspirations");
      if (btn.classList.contains("settings-trigger")) s.textContent = t("settingsLabelText", "Réglages");
    });
    // Submit dialog labels
    $("#inspireSubmitTitle").textContent = t("inspireSubmitTitle", "Proposer une inspiration");
    $("#inspireSubmitHelp").textContent  = t("inspireSubmitHelp",
      "La proposition sera envoyée à l'admin pour validation avant publication.");
    $("#lblSubmitVideoUrl").textContent  = t("inspireSubmitFieldUrl",      "Lien vidéo (YouTube, Vimeo, …)");
    $("#lblSubmitTitle").textContent     = t("inspireSubmitFieldTitle",    "Titre *");
    $("#lblSubmitChannel").textContent   = t("inspireSubmitFieldChannel",  "Chaîne / Troupe");
    $("#lblSubmitContentType").textContent = t("inspireSubmitFieldType",   "Type *");
    $("#lblSubmitNature").textContent    = t("inspireSubmitFieldNature",   "Nature");
    $("#lblSubmitCategory").textContent  = t("inspireSubmitFieldCategory", "Catégorie");
    $("#lblSubmitTheme").textContent     = t("inspireSubmitFieldTheme",    "Thème");
    $("#lblSubmitDuration").textContent  = t("inspireSubmitFieldDuration", "Durée");
    $("#lblSubmitNotes").textContent     = t("inspireSubmitFieldNotes",    "Notes / Description");
    $("#inspireSubmitCancelBtn").textContent  = t("rosterCancel",           "Annuler");
    $("#inspireSubmitConfirmBtn").textContent = t("inspireSubmitConfirmBtn","Envoyer");
  }

  /* ------------------------------------------------------------------
     Data load — anon SELECT on approved videos.
     ------------------------------------------------------------------ */
  let allVideos = [];

  async function loadVideos() {
    const status = $("#inspireStatus");
    if (status) status.textContent = t("inspireLoading", "Chargement…");
    const body = $("#inspireBody");
    if (body) body.innerHTML = renderLoadingSkeleton();
    const { data, error } = await sb.from("inspiration_videos")
      .select("id, title, channel, content_type, nature, category, theme, duration_text, notes, video_url, locale, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[inspirations] load failed", error);
      if (body) body.innerHTML =
        '<div class="inspire-empty"><strong>' +
        escapeHtml(t("inspireLoadError", "Erreur de chargement")) +
        '</strong><div>' + escapeHtml(error.message) + '</div></div>';
      if (status) status.textContent = "";
      return;
    }
    allVideos = data || [];
    renderSuggestions();
    applyFilter();
  }

  function renderLoadingSkeleton() {
    return Array.from({ length: 3 }).map(() =>
      '<div class="inspire-row inspire-loading">' +
        '<div class="col-title">…</div><div class="col-channel">…</div>' +
        '<div class="col-type">…</div><div class="col-nature">…</div>' +
        '<div class="col-category">…</div><div class="col-theme">…</div>' +
        '<div class="col-duration">…</div><div class="col-notes">…</div>' +
      '</div>'
    ).join("");
  }

  /* ------------------------------------------------------------------
     Suggestion chips — derived from the actual data so the user can
     click one to inject a token into the search. Limited to the top
     8 most-common values across types/natures/categories.
     ------------------------------------------------------------------ */
  function renderSuggestions() {
    const wrap = $("#inspireSuggestions");
    if (!wrap) return;
    const seen = new Set();
    const chips = [];
    function pushChip(rawValue, label) {
      const lbl = (label || "").trim();
      if (!lbl || seen.has(lbl.toLowerCase())) return;
      seen.add(lbl.toLowerCase());
      chips.push({ raw: rawValue, label: lbl });
    }
    // Order matters — most useful filters first.
    const types = new Map(), nats = new Map(), cats = new Map();
    for (const v of allVideos) {
      if (v.content_type) types.set(v.content_type, (types.get(v.content_type) || 0) + 1);
      if (v.nature)       nats.set(v.nature,         (nats.get(v.nature)         || 0) + 1);
      if (v.category)     cats.set(v.category,       (cats.get(v.category)       || 0) + 1);
    }
    const sortBy = (m) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    sortBy(types).slice(0, 4).forEach(v => pushChip(v, L(v, LABEL_TYPE_FR, LABEL_TYPE_EN)));
    sortBy(nats).slice(0, 2).forEach(v => pushChip(v, L(v, LABEL_NATURE_FR, LABEL_NATURE_EN)));
    sortBy(cats).slice(0, 4).forEach(v => pushChip(v, L(v, LABEL_CAT_FR, LABEL_CAT_EN)));
    wrap.innerHTML = chips.map(c =>
      '<button type="button" class="inspire-chip" data-token="' + escapeHtml(c.label) + '">' +
        escapeHtml(c.label) +
      '</button>'
    ).join("");
    wrap.querySelectorAll(".inspire-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const tok = btn.dataset.token;
        const q = $("#inspireQuery");
        if (!q) return;
        // Toggle: if the chip's label is already in the query, remove it; otherwise add it.
        const lc = (q.value || "").toLowerCase();
        if (lc.includes(tok.toLowerCase())) {
          q.value = q.value.replace(new RegExp(escapeRegex(tok), "ig"), "").replace(/\s+/g, " ").trim();
          btn.classList.remove("is-active");
        } else {
          q.value = (q.value + " " + tok).trim();
          btn.classList.add("is-active");
        }
        applyFilter();
        q.focus();
      });
    });
  }
  function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* ------------------------------------------------------------------
     Filter — splits the query into tokens (space-separated), each token
     must match somewhere in title/channel/theme/notes OR the label of
     content_type/nature/category. ALL tokens must hit.
     ------------------------------------------------------------------ */
  function videoMatches(v, tokens) {
    if (tokens.length === 0) return true;
    const haystack = [
      v.title, v.channel, v.theme, v.notes,
      L(v.content_type, LABEL_TYPE_FR,   LABEL_TYPE_EN),
      L(v.nature,       LABEL_NATURE_FR, LABEL_NATURE_EN),
      L(v.category,     LABEL_CAT_FR,    LABEL_CAT_EN),
      // Also try the raw enum keys so power users can type "match_impro".
      v.content_type, v.nature, v.category, v.duration_text
    ].filter(Boolean).join(" ").toLowerCase();
    return tokens.every(tok => haystack.includes(tok));
  }

  function applyFilter() {
    const q = (($("#inspireQuery") && $("#inspireQuery").value) || "").trim();
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = allVideos.filter(v => videoMatches(v, tokens));
    renderRows(list, q);
    const status = $("#inspireStatus");
    if (status) {
      if (list.length === 0 && allVideos.length > 0) {
        status.textContent = t("inspireNoResults", "Aucun résultat pour cette recherche.");
      } else {
        const tpl = t("inspireResultCount", "{n} résultat·s · {total} au total");
        status.textContent = tpl.replace("{n}", list.length).replace("{total}", allVideos.length);
      }
    }
  }

  function renderRows(list, query) {
    const body = $("#inspireBody");
    if (!body) return;
    if (list.length === 0) {
      body.innerHTML =
        '<div class="inspire-empty">' +
          '<strong>' + escapeHtml(t("inspireEmptyTitle", "Pas encore d'inspiration ici")) + '</strong>' +
          '<div>' + escapeHtml(t("inspireEmptyBlurb",
            "Sois la première personne à proposer une vidéo via le bouton « + Proposer ».")) +
          '</div>' +
        '</div>';
      return;
    }
    body.innerHTML = list.map(v => renderRow(v)).join("");
  }

  function renderRow(v) {
    const typeLbl = v.content_type ? L(v.content_type, LABEL_TYPE_FR, LABEL_TYPE_EN) : "";
    const natLbl  = v.nature       ? L(v.nature,       LABEL_NATURE_FR, LABEL_NATURE_EN) : "";
    const catLbl  = v.category     ? L(v.category,     LABEL_CAT_FR, LABEL_CAT_EN) : "";
    const titleCell = v.video_url
      ? '<a href="' + escapeHtml(v.video_url) + '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(v.title || "(sans titre)") +
        '</a>'
      : '<span class="no-link">' + escapeHtml(v.title || "(sans titre)") + '</span>';
    return (
      '<div class="inspire-row">' +
        '<div class="col-title">'    + titleCell                                              + '</div>' +
        '<div class="col-channel">'  + escapeHtml(v.channel || "—")                           + '</div>' +
        '<div class="col-type">'     + (typeLbl ? '<span class="tag">' + escapeHtml(typeLbl) + '</span>' : "—") + '</div>' +
        '<div class="col-nature">'   + (natLbl  ? '<span class="tag">' + escapeHtml(natLbl)  + '</span>' : "—") + '</div>' +
        '<div class="col-category">' + (catLbl  ? '<span class="tag">' + escapeHtml(catLbl)  + '</span>' : "—") + '</div>' +
        '<div class="col-theme">'    + escapeHtml(v.theme || "—")                             + '</div>' +
        '<div class="col-duration">' + escapeHtml(v.duration_text || "—")                     + '</div>' +
        '<div class="col-notes">'    + escapeHtml(v.notes || "")                              + '</div>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------------
     Submit dialog wiring — gated on auth. If signed-out, surface a hint
     instead of opening the form (RLS will reject the insert anyway).
     ------------------------------------------------------------------ */
  async function openSubmitDialog() {
    // Refresh session check (the page might have been open a while).
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) {
      alert(t("inspireSubmitNeedsAuth",
        "Connecte-toi sur l'app pour proposer une vidéo. Le lien : "
      ) + window.location.origin + "/index.html");
      return;
    }
    const dlg = $("#inspireSubmitDialog");
    if (!dlg) return;
    // Reset fields
    ["submitVideoUrl","submitTitle","submitChannel","submitTheme","submitDuration","submitNotes"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.getElementById("submitContentType").value = "match_impro";
    document.getElementById("submitNature").value = "";
    document.getElementById("submitCategory").value = "";
    refreshMatchFieldsVisibility();
    const err = $("#submitError"); err.hidden = true; err.textContent = "";
    const ok  = $("#submitSuccess"); ok.hidden = true; ok.textContent = "";
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    setTimeout(() => { const t = document.getElementById("submitTitle"); if (t) t.focus(); }, 0);
  }
  function closeSubmitDialog() {
    const dlg = $("#inspireSubmitDialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  function refreshMatchFieldsVisibility() {
    // Nature + Catégorie only meaningful for match_impro entries — but
    // we keep them visible for "spectacle" / "format_court" too since
    // those can carry a constraint. Hide entirely only for chaîne /
    // tutoriel / documentaire / cabaret.
    const t = document.getElementById("submitContentType").value;
    const wrap = document.getElementById("submitMatchFields");
    const hideFor = new Set(["chaine","tutoriel","documentaire","cabaret"]);
    if (wrap) wrap.style.display = hideFor.has(t) ? "none" : "";
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const err = $("#submitError");
    const ok  = $("#submitSuccess");
    err.hidden = true; err.textContent = "";
    ok.hidden = true; ok.textContent = "";
    const title = (document.getElementById("submitTitle").value || "").trim();
    if (!title) {
      err.textContent = t("inspireSubmitErrTitle", "Le titre est obligatoire.");
      err.hidden = false;
      return;
    }
    const payload = {
      p_title:         title,
      p_channel:       document.getElementById("submitChannel").value || "",
      p_content_type:  document.getElementById("submitContentType").value,
      p_nature:        document.getElementById("submitNature").value || "",
      p_category:      document.getElementById("submitCategory").value || "",
      p_theme:         document.getElementById("submitTheme").value || "",
      p_duration_text: document.getElementById("submitDuration").value || "",
      p_notes:         document.getElementById("submitNotes").value || "",
      p_video_url:     document.getElementById("submitVideoUrl").value || "",
      p_locale:        curLocale()
    };
    const submitBtn = $("#inspireSubmitConfirmBtn");
    const cancelBtn = $("#inspireSubmitCancelBtn");
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true; cancelBtn.disabled = true;
    submitBtn.textContent = t("inspireSubmitSending", "Envoi…");
    try {
      const { error } = await sb.rpc("submit_inspiration_video", payload);
      if (error) throw error;
      ok.textContent = t("inspireSubmitOk", "✓ Proposition envoyée à l'admin pour validation.");
      ok.hidden = false;
      submitBtn.textContent = originalLabel;
      submitBtn.disabled = false; cancelBtn.disabled = false;
      setTimeout(closeSubmitDialog, 1500);
    } catch (e) {
      console.error("[inspirations] submit failed", e);
      err.textContent = (t("inspireSubmitErr", "Échec de l'envoi") + " : " + ((e && e.message) || e));
      err.hidden = false;
      submitBtn.textContent = originalLabel;
      submitBtn.disabled = false; cancelBtn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function wire() {
    applyTexts();
    const q = $("#inspireQuery");
    if (q) {
      q.addEventListener("input", applyFilter);
      q.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { q.value = ""; applyFilter(); }
      });
    }
    const addBtn = $("#inspireAddBtn");
    if (addBtn) addBtn.addEventListener("click", openSubmitDialog);
    const closeBtn = $("#inspireSubmitCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeSubmitDialog);
    const cancelBtn = $("#inspireSubmitCancelBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", closeSubmitDialog);
    const form = $("#inspireSubmitForm");
    if (form) form.addEventListener("submit", submitForm);
    const typeSel = document.getElementById("submitContentType");
    if (typeSel) typeSel.addEventListener("change", refreshMatchFieldsVisibility);
    // Toggle body.is-signed-in so the Settings nav button shows/hides
    // consistently with the other pages.
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) document.body.classList.add("is-signed-in");
      else                          document.body.classList.remove("is-signed-in");
    }).catch(() => {});
    sb.auth.onAuthStateChange((event, session) => {
      if (session && session.user) document.body.classList.add("is-signed-in");
      else                          document.body.classList.remove("is-signed-in");
    });
    loadVideos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
