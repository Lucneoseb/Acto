/**
 * js/suite/shell.js — Suite shell: launcher + hash router + locale chrome.
 *
 * One document hosts every section; routing swaps the contents of #suiteRoot
 * without reloading. Sections:
 *   #/           → Accueil (4 section cards)
 *   #/match/*    → Match section (js/suite/match.js)
 *   #/show       → Spectacle (stub, Phase 4)
 *   #/train      → Coaching (ex-Entraînement ; l'identifiant interne reste `training`)
 *   #/discover   → Découverte (stub, Phase 4)
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  var rootEl = document.getElementById("suiteRoot");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(k) { return S.t(k); }

  /* ---------- routing ---------- */
  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    return { section: parts[0] || "home", sub: parts.slice(1).join("/") };
  }
  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  // route section → program kind
  var PROGRAM_KIND = { match: "match", show: "show", train: "training" };

  function render() {
    var r = parseHash();
    document.documentElement.lang = S.locale();
    // Top-bar "🏠 Accueil" → the launcher (#/). Redundant on the home page itself,
    // so hide it there; visible on every section so the user always has a way back.
    var homeBtn = document.getElementById("suiteHomeBtn");
    if (homeBtn) homeBtn.style.display = (r.section === "home") ? "none" : "";
    // tear down any live/display engine + collab editing state before routing
    if (window.ActoLive && window.ActoLive.cleanup) window.ActoLive.cleanup();
    if (window.ActoProgram && window.ActoProgram.cleanup) window.ActoProgram.cleanup();

    // Live presenter hides all shell chrome. The public display + record device
    // now live on the standalone, code-joined join.html (no longer in-shell routes).
    if (PROGRAM_KIND[r.section] && r.sub === "live") { syncSectionNav(null); window.ActoLive.mountPresenter(rootEl, navigate); return; }

    // Account-based collaborative editor reached from "Partagés avec moi" (#/collab/<id>).
    if (r.section === "collab") {
      syncSectionNav("match");
      window.ActoProgram.mountCollab(rootEl, navigate, r.sub);
      window.scrollTo(0, 0);
      return;
    }

    if (r.section === "teams") {
      syncSectionNav("home");
      window.ActoTeams.mount(rootEl, navigate);
      window.scrollTo(0, 0);
      return;
    }

    if (r.section === "contribute") {
      syncSectionNav("home");
      window.ActoContribute.mount(rootEl, r.sub, navigate);
      window.scrollTo(0, 0);
      return;
    }

    if (PROGRAM_KIND[r.section]) {
      syncSectionNav(r.section);
      window.ActoProgram.mount(rootEl, r.sub, navigate, PROGRAM_KIND[r.section]);
    } else if (r.section === "discover") {
      syncSectionNav("discover");
      window.ActoDiscover.mount(rootEl, r.sub, navigate);
    } else {
      syncSectionNav("home");
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- persistent section switcher ---------- */
  var NAV_SECTIONS = [
    { id: "discover", route: "discover", icon: "✨", labelKey: "sectionDiscoverTitle" },
    { id: "match",    route: "match",    icon: "🏆", labelKey: "sectionMatchTitle" },
    { id: "show",     route: "show",     icon: "🎪", labelKey: "sectionShowTitle" },
    { id: "train",    route: "train",    icon: "🏋️", labelKey: "sectionTrainTitle" }
  ];
  function syncSectionNav(active) {
    var nav = document.getElementById("suiteSectionNav");
    if (!nav) return;
    // Hidden on home (the launcher IS the hub) and in live/display mode.
    if (active === null || active === "home") { nav.hidden = true; nav.innerHTML = ""; return; }
    nav.hidden = false;
    nav.innerHTML = NAV_SECTIONS.map(function (s) {
      return '<button class="suite-navpill' + (s.id === active ? " is-on" : "") + '" data-route="' + s.route + '">' +
        '<span class="suite-navpill-icon" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="suite-navpill-label">' + esc(t(s.labelKey)) + '</span>' +
      '</button>';
    }).join("");
    nav.querySelectorAll(".suite-navpill").forEach(function (b) {
      b.onclick = function () { navigate("#/" + b.getAttribute("data-route")); };
    });
  }

  /* ---------- Accueil ---------- */
  function renderHome() {
    rootEl.innerHTML =
      '<div class="suite-home-head">' +
        '<h1 class="suite-home-title">' + esc(t("suiteHomeTitle")) + '</h1>' +
        '<p class="suite-home-sub">' + esc(t("suiteHomeSubtitle")) + '</p>' +
      '</div>' +
      '<div class="suite-launch-grid">' +
        launchCard("discover", "✨", t("sectionDiscoverTitle"), t("sectionDiscoverDesc"), false) +
        launchCard("match", "🏆", t("sectionMatchTitle"), t("sectionMatchDesc"), false) +
        launchCard("show", "🎪", t("sectionShowTitle"), t("sectionShowDesc"), false) +
        launchCard("train", "🏋️", t("sectionTrainTitle"), t("sectionTrainDesc"), false) +
      '</div>' +
      '<div class="suite-home-extra">' +
        // "Mes équipes" now lives on the Match page (teams are match rosters).
        '<button class="suite-home-link" data-section="contribute">💡 ' + esc(t("contribTitle")) + '</button>' +
      '</div>';
    rootEl.querySelectorAll(".suite-launch-card").forEach(function (c) {
      var go = function () { navigate("#/" + c.getAttribute("data-section")); };
      c.onclick = go;
      c.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
    var TITLE_KEY = { discover: "sectionDiscoverTitle", match: "sectionMatchTitle", show: "sectionShowTitle", train: "sectionTrainTitle" };
    var INFO_KEY = { discover: "sectionDiscoverInfo", match: "sectionMatchInfo", show: "sectionShowInfo", train: "sectionTrainInfo" };
    rootEl.querySelectorAll(".suite-launch-info").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var sec = b.getAttribute("data-info");
        openInfoPopup(t(TITLE_KEY[sec]), t(INFO_KEY[sec]));
      };
    });
    rootEl.querySelectorAll(".suite-home-link").forEach(function (c) {
      c.onclick = function () { navigate("#/" + c.getAttribute("data-section")); };
    });
  }
  function launchCard(section, icon, title, desc) {
    return '<div class="suite-launch-card" data-section="' + section + '" role="button" tabindex="0">' +
      '<button class="suite-launch-info" type="button" data-info="' + section + '" aria-label="' + esc(t("sectionMoreInfo")) + '">ⓘ</button>' +
      '<span class="suite-launch-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="suite-launch-title">' + esc(title) + '</span>' +
      '<span class="suite-launch-desc">' + esc(desc) + '</span>' +
    '</div>';
  }

  /* ---------- reusable info popup (sections, rules, concepts) ---------- */
  function openInfoPopup(title, body) {
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-info-dialog";
    dlg.innerHTML = '<div class="suite-dialog-body">' +
      '<h2 class="suite-dialog-title">' + esc(title) + '</h2>' +
      '<div class="suite-info-text">' + String(body || "").split("\n").filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join("") + '</div>' +
      '<div class="suite-dialog-actions"><button type="button" data-r="close" class="suite-btn suite-btn-primary">' + esc(t("commonClose")) + '</button></div>' +
    '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); }
    dlg.querySelector('[data-r="close"]').onclick = close;
    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
  }
  window.actoSuitePopup = openInfoPopup;   // reused by discover.js (rules / concepts)

  /* ---------- locale chrome ---------- */
  function buildLocalePicker() {
    var sel = document.getElementById("suiteLocale");
    if (!sel) return;
    var locales = S.locales() || {};
    sel.innerHTML = Object.keys(locales).map(function (code) {
      var l = locales[code];
      var label = (l.flag ? l.flag + " " : "") + (l.name || code);
      return '<option value="' + esc(code) + '"' + (code === S.locale() ? " selected" : "") + '>' + esc(label) + '</option>';
    }).join("");
    sel.onchange = function () { S.setLocale(sel.value); };
  }

  function applyStaticChrome() {
    // top-bar i18n labels + footer
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v != null) el.textContent = v;
    });
    var footer = document.getElementById("suiteFooter");
    if (footer) footer.textContent = t("footer") || "Acto · The Impro Studio";
  }

  /* ---------- boot ---------- */
  buildLocalePicker();
  applyStaticChrome();
  S.onLocaleChange(function () {
    var sel = document.getElementById("suiteLocale");
    if (sel) sel.value = S.locale();
    applyStaticChrome();
    render();
  });
  window.addEventListener("hashchange", render);
  render();
})();
