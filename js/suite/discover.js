/**
 * js/suite/discover.js — Découverte section.
 *
 * Onboarding for newcomers: what impro is, how to set up a session, a few
 * coaching tips, and a handful of dead-simple exercises (drawn from the
 * bundled débutant exercises) that launch a timer-only run — no scores, no
 * teams. Reuses the suite design system + i18n.
 *
 * Routes: #/discover (page) et #/discover/regles (article long « Le match
 * d'impro : règles, déroulement, arbitrage », contenu dans rules-content.js).
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
  /* La sous-route de l'article porte la section à ouvrir :
     /decouverte/regles              → tout replié
     /decouverte/regles/arbitrage    → cette section dépliée
     C'est ce segment qui rend l'adresse de la barre envoyable telle quelle. */
  function mount(container, sub, nav) {
    root = container; navigate = nav || navigate;
    var parts = String(sub || "").split("/");
    if (parts[0] === "regles" || parts[0] === "rules") renderRules(parts[1] || "");
    else render();
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
      // Le match d'impro : la section demandée en tête de page, avec ses cinq
      // règles essentielles et un « En savoir plus » vers l'article complet.
      '<section class="suite-discover-feature" aria-labelledby="discoverMatchH">' +
        '<div class="suite-discover-h" id="discoverMatchH"><span aria-hidden="true">🏆</span>' + esc(t("discoverMatchTitle")) + '</div>' +
        '<p class="suite-discover-body">' + esc(t("discoverMatchTeaser")) + '</p>' +
        '<ul>' + String(t("discoverMatchPoints") || "").split("\n").filter(Boolean).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join("") + '</ul>' +
        '<button class="suite-btn suite-btn-primary" data-act="match-rules" type="button">' + esc(t("sectionMoreInfo")) + ' →</button>' +
      '</section>' +
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

    // Le bouton « Règles » de l'en-tête et le « En savoir plus » de la section
    // mènent tous deux à l'article — l'ancien résumé en popup était trop court.
    var rulesBtn = root.querySelector('[data-act="rules"]');
    if (rulesBtn) rulesBtn.onclick = function () { navigate("#/discover/regles"); };
    var matchBtn = root.querySelector('[data-act="match-rules"]');
    if (matchBtn) matchBtn.onclick = function () { navigate("#/discover/regles"); };
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
     ARTICLE : le match d'impro (règles, déroulement, arbitrage)
     Contenu dans rules-content.js (fr, en) ; les autres langues reçoivent
     l'anglais, avec un bandeau qui le dit.
     ============================================================ */
  /* Planche de gestes : [[clé du visuel, intitulé, description], …].
     Un visuel = assets/gestes/<clé>.jpg (600×750). Les dimensions sont
     écrites en dur sur la balise : sans elles, la grille saute pendant le
     chargement différé. welcome.html porte un <base href="/">, donc le
     chemin relatif reste bon sur /decouverte/regles. */
  var ART_V = "20261110";
  /* `cols` fige le nombre de colonnes quand l'ordre de lecture compte : les
     signes de temps vont par trois, du plus long au plus court, et la coupure
     après « 30 s. » fait partie du propos. Sans ça, la grille auto-fill en met
     quatre et la lecture se casse. */
  function artGrid(list, cols) {
    var cartes = (list || []).map(function (a) {
      return '<li class="suite-art-card">' +
        '<img class="suite-art-fig" src="assets/gestes/' + encodeURIComponent(a[0]) + ".jpg?v=" + ART_V + '"' +
          ' width="600" height="750" loading="lazy" decoding="async" alt="">' +
        '<b class="suite-art-h">' + esc(a[1]) + "</b>" +
        '<span class="suite-art-d">' + esc(a[2]) + "</span></li>";
    }).join("");
    if (!cartes) return "";
    var cls = "suite-art-grid" + (cols === 3 ? " suite-art-grid-3" : "");
    return '<ul class="' + cls + '">' + cartes + "</ul>";
  }

  /* L'adresse suit la section ouverte, sans passer par le routeur : on la
     remplace (pas d'empilement dans l'historique, un accordéon n'est pas une
     navigation) pour qu'elle soit copiable depuis la barre d'adresse. Les
     identifiants de section sont les mêmes en français et en anglais, donc un
     lien reçu s'ouvre au bon endroit quelle que soit la langue du lecteur. */
  function majUrl(id) {
    try {
      var base = location.pathname.split("/").filter(Boolean).slice(0, 2);
      if (base.length < 2) return;                       // repli en ancre : on n'y touche pas
      var p = "/" + base.join("/") + (id ? "/" + id : "");
      if (p !== location.pathname) {
        history.replaceState({ acto: 1 }, "", p + (location.search || ""));
      }
    } catch (e) { /* ignore */ }
  }

  function renderRules(ouvrir) {
    var loc = S.locale(), C = window.ActoRulesContent || {};
    var art = C[loc] || C.en || C.fr;
    if (!art) { render(); return; }
    var connus = {};
    art.sections.forEach(function (s) { connus[s.id] = true; });
    if (!connus[ouvrir]) ouvrir = "";
    var note = (art !== C[loc]) ? '<p class="suite-article-note">' + esc(t("rulesLangNote")) + '</p>' : "";
    function blocks(bs) {
      return (bs || []).map(function (b) {
        if (b.p)  return '<p>' + esc(b.p) + '</p>';
        if (b.h3) return '<h3>' + esc(b.h3) + '</h3>';
        if (b.ul) return '<ul>' + b.ul.map(function (li) { return '<li>' + esc(li) + '</li>'; }).join("") + '</ul>';
        if (b.dl) return '<dl>' + b.dl.map(function (d) { return '<dt>' + esc(d[0]) + '</dt><dd>' + esc(d[1]) + '</dd>'; }).join("") + '</dl>';
        if (b.ol) return '<ol>' + b.ol.map(function (li) { return '<li>' + esc(li) + '</li>'; }).join("") + '</ol>';
        if (b.arts) return artGrid(b.arts, b.cols);
        if (b.note) return '<p class="suite-art-credit">' + esc(b.note) + '</p>';
        return "";
      }).join("");
    }
    /* Un accordéon par section, tout replié au départ : la pile des titres
       tient lieu de sommaire, il n'y en a donc plus de séparé. Une seule
       section ouverte à la fois. */
    function accordeon(s) {
      var id = esc(s.id), on = (s.id === ouvrir);
      return '<section class="suite-acc" id="regles-' + id + '" data-sec="' + id + '">' +
        '<h2 class="suite-acc-h">' +
          '<button class="suite-acc-btn" type="button" id="regles-' + id + '-b"' +
            ' aria-expanded="' + (on ? "true" : "false") + '" aria-controls="regles-' + id + '-p">' +
            '<span class="suite-acc-t">' + esc(s.h) + '</span>' +
            '<span class="suite-acc-i" aria-hidden="true"></span>' +
          '</button>' +
        '</h2>' +
        '<div class="suite-acc-p" id="regles-' + id + '-p" role="region"' +
          ' aria-labelledby="regles-' + id + '-b"' + (on ? "" : " hidden") + '>' + blocks(s.blocks) + '</div>' +
      '</section>';
    }

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="back">← ' + esc(t("sectionDiscoverTitle")) + '</button>' +
        '<h1 class="suite-h1">🏆 ' + esc(art.title) + '</h1>' +
      '</div>' +
      '<article class="suite-article">' +
        note +
        '<p class="suite-article-intro">' + esc(art.intro) + '</p>' +
        '<div class="suite-acc-liste">' + art.sections.map(accordeon).join("") + '</div>' +
        '<div class="suite-article-foot">' +
          '<button class="suite-btn suite-btn-primary" data-act="go-match" type="button">🏆 ' + esc(t("sectionMatchTitle")) + '</button>' +
          '<button class="suite-btn suite-btn-ghost" data-act="back" type="button">← ' + esc(t("sectionDiscoverTitle")) + '</button>' +
        '</div>' +
      '</article>';
    root.querySelectorAll('[data-act="back"]').forEach(function (b) { b.onclick = function () { navigate("#/discover"); }; });
    var gm = root.querySelector('[data-act="go-match"]');
    if (gm) gm.onclick = function () { navigate("#/match"); };

    var boutons = [].slice.call(root.querySelectorAll(".suite-acc-btn"));
    function panneau(b) { return document.getElementById(b.getAttribute("aria-controls")); }
    function replier(b) {
      b.setAttribute("aria-expanded", "false");
      var p = panneau(b); if (p) p.hidden = true;
    }
    boutons.forEach(function (b) {
      b.onclick = function () {
        var sec = b.parentNode.parentNode.getAttribute("data-sec");
        var ouvert = b.getAttribute("aria-expanded") === "true";
        /* Replier une section située plus haut raccourcit la page : sans
           recalage, le titre cliqué remonte sous les yeux de l'utilisateur. */
        var avant = b.getBoundingClientRect().top;
        boutons.forEach(replier);
        if (!ouvert) {
          b.setAttribute("aria-expanded", "true");
          var p = panneau(b); if (p) p.hidden = false;
        }
        majUrl(ouvert ? "" : sec);
        var apres = b.getBoundingClientRect().top;
        if (apres !== avant) { try { window.scrollBy(0, apres - avant); } catch (e) { /* ignore */ } }
      };
    });
    /* Lien reçu sur une section : on l'amène sous les yeux plutôt que de
       laisser le lecteur chercher laquelle s'est ouverte. */
    if (ouvrir) {
      var cible = root.querySelector('#regles-' + ouvrir + '-b');
      if (cible) {
        try { cible.scrollIntoView({ block: "start" }); window.scrollBy(0, -12); }
        catch (e) { /* ignore */ }
        return;
      }
    }
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  /* ============================================================
     SIMPLE TIMER OVERLAY (no scores, no teams)
     ============================================================ */
  /* Le chrono vit au niveau du <body>, hors du conteneur que le routeur
     redessine. Mesuré : en quittant Découverte pendant qu'il tourne, le panneau
     restait à l'écran par-dessus la page suivante, son intervalle actif et son
     gong encore à venir. On garde donc de quoi le fermer depuis le routeur. */
  var fermerChrono = null;

  function openChrono(exo) {
    if (fermerChrono) fermerChrono();          // un seul chrono à la fois
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
      var pct = total > 0 ? Math.round(100 * (total - remaining) / total) : 0;
      if (bar) bar.style.width = pct + "%";
      var barW = ov.querySelector("#exoBarWrap");
      if (barW) { barW.setAttribute("aria-valuenow", String(pct)); barW.setAttribute("aria-valuetext", fmt(remaining)); }
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
    function close() {
      if (iv) { clearInterval(iv); iv = null; }
      ov.remove();
      if (fermerChrono === close) fermerChrono = null;
    }

    ov.innerHTML =
      '<div class="suite-exo-panel">' +
        '<button class="suite-exo-close" data-act="close" aria-label="' + esc(t("commonClose")) + '">✕</button>' +
        '<div class="suite-exo-title">' + esc(exo.name) + '</div>' +
        (exo.desc ? '<p class="suite-exo-paneldesc">' + esc(exo.desc) + '</p>' : '') +
        '<div id="exoChrono" class="live-chrono ' + cls() + '">' + fmt(remaining) + '</div>' +
        '<div class="live-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="exoBarWrap">' +
          '<span id="exoBar" style="width:0%"></span></div>' +
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
    fermerChrono = close;
    paint();
  }

  window.ActoDiscover = {
    mount: mount,
    // Appelé par le routeur avant chaque navigation (voir shell.js).
    cleanup: function () { if (fermerChrono) fermerChrono(); }
  };
})();
