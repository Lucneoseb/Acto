/**
 * js/inspiration.js — public single-improv share page (inspiration.html?id=…).
 *
 * Shows one approved inspiration card (anon-readable via RLS), records a view,
 * offers a copy-link share + a "see others" button, and — when logged in —
 * a personal A–F rating + comment (set_inspiration_rating). No login required
 * to view, so share links work for anyone.
 */
(function () {
  "use strict";

  if (!window.actoConfig || !window.supabase) {
    document.getElementById("insp1Root").innerHTML = '<div class="insp1-empty">Configuration manquante.</div>';
    return;
  }
  var CFG = window.actoConfig.supabase;
  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var esc = (window.actoUtils && window.actoUtils.escapeHtml) || function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function locale() { try { return (localStorage.getItem("impro-studio:locale:v1") || "fr").trim(); } catch (e) { return "fr"; } }
  function en() { return locale() === "en"; }

  /* page-specific strings (FR + EN, FR fallback) */
  var STR = {
    fr: { share: "Copier le lien", shared: "Lien copié ✓", others: "Voir d'autres improvisations", watch: "▶ Regarder la vidéo",
      views: "{n} vue(s)", notFound: "Improvisation introuvable.", rateTitle: "Ton classement perso (A = préféré)",
      comment: "Un commentaire pour toi…", save: "Enregistrer ma note", saved: "Note enregistrée ✓", clear: "Effacer",
      loginHint: "Connecte-toi pour noter et classer cette impro." },
    en: { share: "Copy link", shared: "Link copied ✓", others: "See other improvs", watch: "▶ Watch the video",
      views: "{n} view(s)", notFound: "Improv not found.", rateTitle: "Your personal ranking (A = favourite)",
      comment: "A note to yourself…", save: "Save my grade", saved: "Grade saved ✓", clear: "Clear",
      loginHint: "Sign in to grade and rank this improv." }
  };
  function s(k) { var m = STR[locale()] || STR.fr; return m[k] != null ? m[k] : STR.fr[k]; }

  /* content_type / category / nature labels (mirror inspirations.js) */
  var T_FR = { chaine: "Chaîne", match_impro: "Match d'impro", spectacle: "Spectacle longue forme", tutoriel: "Tutoriel", documentaire: "Documentaire", cabaret: "Cabaret", format_court: "Format court" };
  var T_EN = { chaine: "Channel", match_impro: "Impro match", spectacle: "Long-form show", tutoriel: "Tutorial", documentaire: "Documentary", cabaret: "Cabaret", format_court: "Short form" };
  var N_FR = { mixte: "Mixte", comparee: "Comparée", na: "N/A" }, N_EN = { mixte: "Mixed", comparee: "Compared", na: "N/A" };
  function L(map_fr, map_en, v) { if (!v) return ""; var m = en() ? map_en : map_fr; return m[v] || v; }

  // Only ever emit http(s) hrefs — escaping doesn't neutralize javascript:/data:
  // URL schemes, and video_url is attacker-influenced (submitted by users).
  function safeHttpUrl(u) {
    try { var p = new URL(String(u), location.href); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : null; }
    catch (e) { return null; }
  }
  function embedUrl(url) {
    if (!url) return null;
    var yt = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (yt) return "https://www.youtube.com/embed/" + yt[1];
    var vm = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return "https://player.vimeo.com/video/" + vm[1];
    return null;
  }

  function param(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }

  var ID = param("id");
  var root = document.getElementById("insp1Root");
  var me = null, currentGrade = null;

  if (!ID) { root.innerHTML = '<div class="insp1-empty">' + esc(s("notFound")) + '</div>'; return; }

  // Fetch the approved inspiration, then render.
  Promise.resolve(sb.from("inspiration_videos").select("*").eq("id", ID).eq("status", "approved").maybeSingle())
    .then(function (res) {
      if (res.error || !res.data) { root.innerHTML = '<div class="insp1-empty">' + esc(s("notFound")) + '</div>'; return; }
      render(res.data);
      // record the view (fire-and-forget; works for anon too)
      try { Promise.resolve(sb.rpc("record_inspiration_view", { p_id: ID })).catch(function () {}); } catch (e) {}
      // load auth + the user's rating
      sb.auth.getSession().then(function (sess) {
        me = sess && sess.data && sess.data.session && sess.data.session.user;
        if (me) loadMyRating();
        renderRating(res.data);
      });
    })
    .catch(function () { root.innerHTML = '<div class="insp1-empty">' + esc(s("notFound")) + '</div>'; });

  function render(v) {
    var emb = embedUrl(v.video_url);
    var safeUrl = safeHttpUrl(v.video_url);
    var tags = [];
    if (v.content_type) tags.push('<span class="insp1-tag is-type">' + esc(L(T_FR, T_EN, v.content_type)) + '</span>');
    if (v.nature) tags.push('<span class="insp1-tag">' + esc(L(N_FR, N_EN, v.nature)) + '</span>');
    if (v.theme) tags.push('<span class="insp1-tag">' + esc(v.theme) + '</span>');
    if (v.duration_text) tags.push('<span class="insp1-tag">⏱ ' + esc(v.duration_text) + '</span>');

    root.innerHTML =
      '<div class="insp1-card">' +
        '<h1 class="insp1-title">' + esc(v.title || "") + '</h1>' +
        (v.channel ? '<p class="insp1-chan">' + esc(v.channel) + '</p>' : '') +
        (tags.length ? '<div class="insp1-tags">' + tags.join("") + '</div>' : '') +
        // Le lecteur intégré ET le lien, jamais l'un OU l'autre. C'était un
        // ou-exclusif : dès que embedUrl() savait construire une URL — donc
        // pour toute vidéo YouTube — le lien de secours n'était plus rendu.
        // Or la CSP du site interdisait justement d'encadrer youtube.com
        // (`default-src 'self'` sans `frame-src`) : l'iframe était bloquée, le
        // lien absent, et la vidéo devenait tout simplement inatteignable.
        // La CSP est corrigée dans _headers, mais on garde le lien : un
        // bloqueur de contenu, un mode restreint ou une future directive
        // rateraient à nouveau la cible, et une vidéo sans porte de sortie est
        // le pire résultat possible sur une page qui n'existe que pour elle.
        (emb ? '<div class="insp1-video"><iframe src="' + esc(emb) + '" title="" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>' : '') +
        (safeUrl ? '<p><a class="insp1-watch" href="' + esc(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(s("watch")) + '</a></p>' : '') +
        (v.notes ? '<p class="insp1-notes">' + esc(v.notes) + '</p>' : '') +
        '<p class="insp1-views">👁 ' + esc(s("views").replace("{n}", (v.view_count || 0) + 1)) + '</p>' +
        '<div class="insp1-actions">' +
          '<button type="button" class="insp1-btn insp1-btn-primary" id="insp1Share">🔗 ' + esc(s("share")) + '</button>' +
          '<a class="insp1-btn" href="./inspirations.html">🎭 ' + esc(s("others")) + '</a>' +
        '</div>' +
        '<div id="insp1Rate"></div>' +
      '</div>';

    var shareBtn = document.getElementById("insp1Share");
    if (shareBtn) shareBtn.onclick = function () {
      var url = location.href;
      var done = function () { shareBtn.textContent = "✓ " + s("shared"); setTimeout(function () { shareBtn.textContent = "🔗 " + s("share"); }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt(s("share"), url); });
      else window.prompt(s("share"), url);
    };
  }

  function loadMyRating() {
    Promise.resolve(sb.from("inspiration_ratings").select("grade,comment").eq("inspiration_id", ID).maybeSingle())
      .then(function (res) {
        if (res && res.data) { currentGrade = res.data.grade; paintRating(res.data.grade, res.data.comment || ""); }
      }).catch(function () {});
  }

  function renderRating() {
    var box = document.getElementById("insp1Rate"); if (!box) return;
    if (!me) {
      box.innerHTML = '<div class="insp1-rate"><p class="insp1-login-hint">' + esc(s("loginHint")) + ' <a href="./login.html">→</a></p></div>';
      return;
    }
    var grades = ["A", "B", "C", "D", "E", "F"];
    box.innerHTML = '<div class="insp1-rate">' +
      '<div class="insp1-rate-h">' + esc(s("rateTitle")) + '</div>' +
      '<div class="insp1-grades">' + grades.map(function (g) { return '<button type="button" class="insp1-grade" data-g="' + g + '">' + g + '</button>'; }).join("") + '</div>' +
      '<textarea class="insp1-comment" id="insp1Comment" maxlength="2000" placeholder="' + esc(s("comment")) + '"></textarea>' +
      '<div class="insp1-rate-actions">' +
        '<button type="button" class="insp1-btn insp1-btn-primary" id="insp1Save">' + esc(s("save")) + '</button>' +
        '<button type="button" class="insp1-btn" id="insp1Clear">' + esc(s("clear")) + '</button>' +
        '<span class="insp1-rate-msg" id="insp1Msg"></span>' +
      '</div>' +
    '</div>';
    box.querySelectorAll(".insp1-grade").forEach(function (b) {
      b.onclick = function () { currentGrade = b.getAttribute("data-g"); paintGrades(); };
    });
    document.getElementById("insp1Save").onclick = save;
    document.getElementById("insp1Clear").onclick = clearRating;
    paintGrades();
  }
  function paintGrades() {
    document.querySelectorAll(".insp1-grade").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-g") === currentGrade); });
  }
  function paintRating(grade, comment) {
    currentGrade = grade; paintGrades();
    var c = document.getElementById("insp1Comment"); if (c) c.value = comment || "";
  }
  function msg(text, ok) { var el = document.getElementById("insp1Msg"); if (el) { el.textContent = text; el.className = "insp1-rate-msg" + (ok ? " is-ok" : ""); } }
  function save() {
    if (!currentGrade) { msg(en() ? "Pick a grade first." : "Choisis une note d'abord.", false); return; }
    var comment = (document.getElementById("insp1Comment") || {}).value || "";
    var b = document.getElementById("insp1Save"); b.disabled = true;
    Promise.resolve(sb.rpc("set_inspiration_rating", { p_id: ID, p_grade: currentGrade, p_comment: comment }))
      .then(function (res) { b.disabled = false; if (res && res.error) { msg(res.error.message || "Erreur", false); return; } msg(s("saved"), true); })
      .catch(function () { b.disabled = false; msg("Erreur", false); });
  }
  function clearRating() {
    var b = document.getElementById("insp1Clear"); b.disabled = true;
    Promise.resolve(sb.rpc("delete_inspiration_rating", { p_id: ID })).then(function () {
      b.disabled = false; currentGrade = null; paintGrades();
      var c = document.getElementById("insp1Comment"); if (c) c.value = "";
      msg("", true);
    }).catch(function () { b.disabled = false; });
  }
})();
