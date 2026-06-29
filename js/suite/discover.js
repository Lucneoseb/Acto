/**
 * js/suite/discover.js — Découverte section.
 *
 * Onboarding for newcomers: what impro is, how to set up a session, a few
 * coaching tips, and a handful of dead-simple exercises (drawn from the
 * bundled débutant exercises) that launch a timer-only run — no scores, no
 * teams. Reuses the suite design system + i18n.
 *
 * Route: #/discover (single page).
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  var root = null, navigate = function () {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(k) { return S.t(k); }

  /* ---------- end-of-chrono sound ---------- */
  var _ac = null;
  function beep(freq, start, dur) {
    try {
      if (!_ac) { var AC = window.AudioContext || window.webkitAudioContext; _ac = AC ? new AC() : null; }
      if (!_ac) return;
      if (_ac.state === "suspended") _ac.resume();
      var o = _ac.createOscillator(), g = _ac.createGain();
      o.type = "sine"; o.frequency.value = freq; o.connect(g); g.connect(_ac.destination);
      var t0 = _ac.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) { /* ignore */ }
  }
  function playEndSound() {
    beep(660, 0, 0.25); beep(880, 0.28, 0.25); beep(1180, 0.56, 0.4);
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* ignore */ }
  }

  /* ============================================================
     PAGE
     ============================================================ */
  function mount(container, sub, nav) {
    root = container; navigate = nav || navigate;
    render();
  }

  function contentCard(icon, title, body) {
    return '<div class="suite-discover-card">' +
      '<div class="suite-discover-h"><span aria-hidden="true">' + icon + '</span>' + esc(title) + '</div>' +
      '<p class="suite-discover-body">' + esc(body) + '</p>' +
    '</div>';
  }
  function infoPopup(title, body) {
    if (window.actoSuitePopup) { window.actoSuitePopup(title, body); return; }
    try { window.alert(title + "\n\n" + body); } catch (e) { /* ignore */ }
  }

  function simpleExercises() {
    var d = S.data();
    var pool = (d.exercises && d.exercises.troupe && d.exercises.troupe.debutant) || [];
    return pool.slice(0, 8);
  }

  function render() {
    var ex = simpleExercises();
    var exCards = ex.length
      ? ex.map(function (e, i) {
          return '<div class="suite-exo-card" data-exo="' + i + '">' +
            '<div class="suite-exo-main">' +
              '<div class="suite-exo-name">' + esc(e.name) + '</div>' +
              (e.desc ? '<div class="suite-exo-desc">' + esc(e.desc) + '</div>' : '') +
            '</div>' +
            '<button class="suite-btn suite-btn-mini suite-btn-primary" data-act="launch-exo" data-exo="' + i + '">' + esc(t("discoverLaunchBtn")) + '</button>' +
          '</div>';
        }).join("")
      : '<p class="suite-empty">' + esc(t("setlistEmpty")) + '</p>';

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<h1 class="suite-h1">✨ ' + esc(t("sectionDiscoverTitle")) + '</h1>' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="rules">📜 ' + esc(t("discoverRulesBtn")) + '</button>' +
      '</div>' +
      '<div class="suite-discover-grid">' +
        contentCard("🎭", t("discoverIntroTitle"), t("discoverIntroBody")) +
        contentCard("🛠️", t("discoverSetupTitle"), t("discoverSetupBody")) +
        contentCard("💡", t("discoverTipsTitle"), t("discoverTipsBody")) +
        '<button class="suite-discover-card suite-discover-card-btn" data-act="concepts" type="button">' +
          '<div class="suite-discover-h"><span aria-hidden="true">🌍</span>' + esc(t("discoverConceptsTitle")) + '</div>' +
          '<p class="suite-discover-body">' + esc(t("discoverConceptsTeaser")) + '</p>' +
          '<span class="suite-discover-more">' + esc(t("sectionMoreInfo")) + ' →</span>' +
        '</button>' +
      '</div>' +
      '<div class="suite-discover-exos">' +
        '<h2 class="suite-h2">' + esc(t("discoverExercisesTitle")) + '</h2>' +
        '<p class="suite-help">' + esc(t("discoverExercisesBlurb")) + '</p>' +
        '<div class="suite-exo-list">' + exCards + '</div>' +
      '</div>';

    var rulesBtn = root.querySelector('[data-act="rules"]');
    if (rulesBtn) rulesBtn.onclick = function () { infoPopup(t("discoverRulesTitle"), t("discoverRulesBody")); };
    var conceptsBtn = root.querySelector('[data-act="concepts"]');
    if (conceptsBtn) conceptsBtn.onclick = function () { infoPopup(t("discoverConceptsTitle"), t("discoverConceptsBody")); };
    root.querySelectorAll('[data-act="launch-exo"]').forEach(function (b) {
      b.onclick = function () {
        var e = ex[parseInt(b.getAttribute("data-exo"), 10)];
        if (e) openChrono(e);
      };
    });
  }

  /* ============================================================
     SIMPLE TIMER OVERLAY (no scores, no teams)
     ============================================================ */
  function openChrono(exo) {
    var total = 180, remaining = total, running = false, endAt = 0, iv = null;

    var ov = document.createElement("div");
    ov.className = "suite-exo-overlay";
    document.body.appendChild(ov);

    function fmt(s) { return S.formatSec(s); }
    function cls() { return remaining <= 10 ? "is-danger" : remaining <= 30 ? "is-warn" : ""; }

    function paint() {
      var disp = ov.querySelector("#exoChrono");
      if (disp) { disp.textContent = fmt(remaining); disp.className = "live-chrono " + cls(); }
      var bar = ov.querySelector("#exoBar");
      if (bar) bar.style.width = (total > 0 ? (100 * (total - remaining) / total) : 0) + "%";
      var prim = ov.querySelector('[data-act="prim"]');
      if (prim) prim.textContent = running ? t("livePause") : (remaining > 0 && remaining < total ? t("liveResume") : t("liveStart"));
    }
    function tick() {
      if (!running) return;
      remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      paint();
      if (remaining <= 0) { running = false; clearInterval(iv); iv = null; playEndSound(); paint(); }
    }
    function start() { running = true; endAt = Date.now() + remaining * 1000; iv = setInterval(tick, 250); paint(); }
    function pause() { running = false; if (iv) { clearInterval(iv); iv = null; } remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000)); paint(); }
    function reset(sec) { running = false; if (iv) { clearInterval(iv); iv = null; } total = sec != null ? sec : total; remaining = total; paint(); }
    function close() { if (iv) clearInterval(iv); ov.remove(); }

    ov.innerHTML =
      '<div class="suite-exo-panel">' +
        '<button class="suite-exo-close" data-act="close" aria-label="' + esc(t("commonClose")) + '">✕</button>' +
        '<div class="suite-exo-title">' + esc(exo.name) + '</div>' +
        (exo.desc ? '<p class="suite-exo-paneldesc">' + esc(exo.desc) + '</p>' : '') +
        '<div id="exoChrono" class="live-chrono ' + cls() + '">' + fmt(remaining) + '</div>' +
        '<div class="live-bar"><span id="exoBar" style="width:0%"></span></div>' +
        '<div class="live-timer-btns">' +
          '<button class="suite-btn suite-btn-primary live-prim" data-act="prim">' + esc(t("liveStart")) + '</button>' +
          '<button class="suite-btn suite-btn-ghost" data-act="reset">' + esc(t("liveReset")) + '</button>' +
          '<button class="suite-btn suite-btn-ghost" data-act="add30">+30s</button>' +
        '</div>' +
        '<div class="suite-exo-presets">' +
          [60, 120, 180, 300].map(function (s) {
            return '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-preset="' + s + '">' + fmt(s) + '</button>';
          }).join("") +
        '</div>' +
      '</div>';

    ov.querySelector('[data-act="close"]').onclick = close;
    ov.querySelector('[data-act="prim"]').onclick = function () { if (running) pause(); else start(); };
    ov.querySelector('[data-act="reset"]').onclick = function () { reset(total); };
    ov.querySelector('[data-act="add30"]').onclick = function () {
      remaining += 30; if (remaining > total) total = remaining; if (running) endAt = Date.now() + remaining * 1000; paint();
    };
    ov.querySelectorAll("[data-preset]").forEach(function (b) {
      b.onclick = function () { reset(parseInt(b.getAttribute("data-preset"), 10)); };
    });
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    paint();
  }

  window.ActoDiscover = { mount: mount };
})();
