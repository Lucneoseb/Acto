/**
 * js/suite/defis.js — Section « Défis » du Studio (#/defis).
 *
 * Le défi existait déjà (js/challenge.js + defi.html), mais on ne pouvait en
 * envoyer un que depuis le Match rapide, après avoir tiré une impro. Cette
 * section en fait une entrée à part entière : on compose une épreuve, on
 * l'envoie — et on retrouve au même endroit ses défis envoyés et reçus.
 *
 * Une épreuve de défi = une CONTRAINTE DE JEU ou un EXERCICE (nom + description),
 * un thème, un nombre de jouteurs. Jamais une nature de match — « Mixte » et
 * « Comparée » supposent deux équipes départagées par le public, sans objet
 * pour un défi. Trois façons de la composer :
 *   · 🎲 Tirage      — une contrainte ou un exercice de troupe, un thème ;
 *   · 📚 Communauté  — les défis écrits par d'autres et validés par l'admin
 *                      (plus les siens en attente, marqués ✳) ;
 *   · ✍️ Mon défi    — tout saisi à la main.
 *
 * Un défi écrit à la main peut rejoindre la base commune : proposé au moment où
 * il est RÉELLEMENT envoyé (jamais à l'ouverture de la modale, qu'on peut
 * annuler), avec son thème et sa contrainte s'ils sont nouveaux. L'auteur s'en
 * ressert aussitôt ; les autres y ont accès une fois l'admin passé.
 *
 * L'envoi lui-même reste celui de challenge.js : même modale, même RPC, même
 * page de réalisation côté destinataire. On ne fait que l'alimenter. La
 * description voyage dans `subtitle`, que defi.html affiche déjà sous le titre
 * et dans sa fenêtre ⓘ.
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  var root = null, navigate = function () {};
  // Gardé le temps de la visite : on retrouve son brouillon en revenant.
  var epreuve = null;            // { mode, level, tirage, idee, brouillon, recherche }
  var idees = null;              // null = pas chargée · [] = chargée · "erreur"

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(k) { return S.t(k); }
  function tf(k, v) { return S.tf(k, v); }
  function sb() { return window.actoSuiteSb || null; }
  function connecte() { return !!(sb() && window.actoUser); }
  function cle(n) { return String(n == null ? "" : n).trim().toLowerCase(); }
  function toast(msg) {
    var el = document.createElement("div");
    el.className = "suite-toast";
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    el.textContent = msg;
    document.body.appendChild(el);
    // Même cycle que les autres toasts du Studio : .is-in l'affiche, puis on le retire.
    setTimeout(function () { el.classList.add("is-in"); }, 10);
    setTimeout(function () { el.classList.remove("is-in"); }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }
  function niveauLabel(lv) { return t(lv === "confirme" ? "levelConfirme" : lv === "expert" ? "levelExpert" : "levelDebutant"); }
  function jouteurs(n) { n = parseInt(n, 10); return n > 0 ? tf("defiPlayersChip", { n: n }) : t("valueNone"); }

  /* ── natures de match : jamais dans un défi ─────────────────────────────────
     Les exercices de troupe comptent 13 catégories de match adaptées (« Mixte
     chantée », « Comparée rimée »…). Elles supposent deux équipes départagées par
     le public : sans objet pour un défi. Mesuré : 4 tirages sur 60 en sortaient.
     Leurs noms changent selon la langue et ne suivent pas toujours le libellé de
     nature (« Gemischt », mais aussi « Mixte nach Art von » en allemand) : on les
     repère sur les données FRANÇAISES, qui font référence, puis on reporte par
     position dans la langue courante. Les libellés localisés servent de filet
     (propositions de la communauté, données partielles). */
  function natures(level) {
    var B = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.data) || {}, noms = {};
    var nat = (S.natureLabels && S.natureLabels()) || {};
    var prefixes = [nat.mixte, nat.comparee, "mixte", "compar"].filter(Boolean).map(cle);
    try {
      var fr = (B.fr && B.fr.exercises.troupe[level]) || [];
      var ici = ((B[S.locale()] || B.fr).exercises.troupe[level]) || [];
      fr.forEach(function (e, i) { if (/^(mixte|compar)/i.test(e.name) && ici[i]) noms[cle(ici[i].name)] = true; });
    } catch (e) { /* données partielles : les préfixes prennent le relais */ }
    return function (nom) {
      var k = cle(nom);
      return !!noms[k] || prefixes.some(function (p) { return k.indexOf(p) === 0; });
    };
  }

  /* ── les jeux d'un défi : contraintes + exercices de troupe ─────────────── */
  function jeux(level) {
    var d = S.data(), estNature = natures(level);
    var contraintes = ((d.constraints && d.constraints.match && d.constraints.match[level]) || [])
      .map(function (c) { return { name: String(c), desc: "" }; });
    var exercices = ((d.exercises && d.exercises.troupe && d.exercises.troupe[level]) || [])
      .map(function (e) { return { name: e.name, desc: e.desc || "", min: e.minPlayers, max: e.maxPlayers }; });
    return contraintes.concat(exercices).filter(function (j) { return !estNature(j.name); });
  }
  function trouverJeu(level, nom) {
    var k = cle(nom);
    return jeux(level).filter(function (j) { return cle(j.name) === k; })[0] || null;
  }

  function tirer(level) {
    level = level || "debutant";
    // Thème, nombre de jouteurs et durée : le générateur habituel.
    var seg = S.gen.newSegmentFor("match", level);
    S.gen.fillSegment(seg, level);
    var pool = jeux(level);
    var jeu = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    var n = parseInt(seg.players, 10);
    if (!(n > 0)) n = 2;                          // « Toute l'équipe » → un défi se joue à quelques-uns
    // Un exercice a ses limites : « Le miroir » se joue à deux, pas à cinq.
    if (jeu && jeu.min && n < jeu.min) n = jeu.min;
    if (jeu && jeu.max && n > jeu.max) n = jeu.max;
    if (n > 12) n = 12;
    return { jeu: jeu, theme: seg.theme || "", players: n, durationSec: seg.durationSec || 120 };
  }

  // Même forme de snapshot pour les trois modes.
  function instantane(o) {
    var n = parseInt(o.players, 10);
    return {
      kind: "impro",
      title: o.category || o.theme || "",
      subtitle: o.categoryDesc || "",            // defi.html l'affiche sous le titre et dans ⓘ
      theme: o.theme || "",
      category: o.category || "",
      nature: "",
      players: (n > 0) ? String(n) : "",       // nombre nu, comme le fait la modale d'envoi
      durationSec: parseInt(o.durationSec, 10) || 120,
      level: o.level || epreuve.level || "",
      constraint: ""
    };
  }

  function mount(container, sub, nav) {
    root = container; navigate = nav || navigate;
    if (!epreuve) epreuve = { mode: "tirage", level: "debutant", tirage: tirer("debutant"), idee: null, recherche: "",
                              brouillon: { category: "", categoryDesc: "", theme: "", players: "2", partager: true } };
    render();
  }

  /* ── base communautaire ─────────────────────────────────────────────────── */
  function chargerIdees() {
    var c = sb();
    if (!c || !c.rpc) { idees = "erreur"; return; }
    Promise.resolve(c.rpc("list_challenge_ideas", { p_locale: S.locale() })).then(function (r) {
      // Fonction absente (migration pas encore passée) ou erreur : on le dit
      // plutôt qu'une base vide, qui laisserait croire qu'il n'y a rien.
      idees = (r && !r.error && Array.isArray(r.data)) ? r.data : "erreur";
      if (root && root.isConnected && epreuve.mode === "base") render();
    }, function () { idees = "erreur"; if (root && root.isConnected && epreuve.mode === "base") render(); });
  }

  /* Proposition à la communauté, une fois le défi envoyé. Le thème et la
     contrainte rejoignent aussi leurs bases s'ils n'y sont pas déjà : écrire un
     défi, c'est enrichir tout le monde. */
  function proposer(snap, saisie) {
    var c = sb(); if (!c || !c.rpc) return;
    var loc = S.locale(), lv = epreuve.level, n = parseInt(snap.players, 10);
    Promise.resolve(c.rpc("submit_challenge_idea", {
      p_locale: loc, p_level: lv,
      p_category: saisie.category || null, p_category_desc: saisie.categoryDesc || null,
      p_theme: saisie.theme,
      p_players: (n > 0 && n <= 12) ? n : null, p_duration_sec: parseInt(snap.durationSec, 10) || null
    })).then(function (r) {
      if (r && r.error) { console.warn("[defis] proposition", r.error.message || r.error); return; }
      idees = null;   // la base a changé : rechargée à la prochaine visite de l'onglet
      toast(t("defiShared"));
    }, function () { /* hors ligne : le défi est parti, seule la proposition manque */ });

    var d = S.data();
    var themes = (d.themes && d.themes[lv]) || [];
    if (saisie.theme && !themes.some(function (x) { return cle(x) === cle(saisie.theme); })) {
      Promise.resolve(c.rpc("submit_user_text", { p_kind: "theme", p_mode: "", p_level: lv, p_locale: loc, p_text: saisie.theme, p_description: null }))
        .then(function (r) { if (!(r && r.error)) S.gen.ajouterEnAttente("theme", { name: saisie.theme, level: lv }); }, function () {});
    }
    // Contrainte nouvelle : rejoint la base des contraintes, AVEC sa description
    // (l'admin la voit en modérant).
    if (saisie.category && !trouverJeu(lv, saisie.category)) {
      Promise.resolve(c.rpc("submit_user_text", { p_kind: "constraint", p_mode: "match", p_level: lv, p_locale: loc, p_text: saisie.category, p_description: saisie.categoryDesc || null }))
        .then(function (r) { if (!(r && r.error)) S.gen.ajouterEnAttente("constraint", { name: saisie.category, desc: saisie.categoryDesc, level: lv, mode: "match" }); }, function () {});
    }
  }

  /* ── rendu ──────────────────────────────────────────────────────────────── */
  function carte(lignes, actions) {
    return '<div class="suite-defi-card">' +
      '<div class="suite-defi-rows">' +
        lignes.map(function (r) {
          return '<div class="suite-defi-row"><span class="suite-defi-l">' + esc(r.l) + '</span>' +
            '<span class="suite-defi-v">' + esc(r.v) +
              (r.desc ? '<span class="suite-defi-desc">' + esc(r.desc) + '</span>' : '') +
            '</span></div>';
        }).join("") +
      '</div>' +
      '<div class="suite-defi-actions">' + actions + '</div>' +
    '</div>';
  }

  function blocTirage() {
    var tr = epreuve.tirage, jeu = tr.jeu;
    return '<div class="suite-defi-h">' + esc(t("defiDrawTitle")) + '</div>' + carte([
      { l: t("defiGameLabel"), v: jeu ? jeu.name : t("valueNone"), desc: jeu ? jeu.desc : "" },
      { l: t("fieldTheme"), v: tr.theme || t("valueNone") },
      { l: t("fieldPlayers"), v: jouteurs(tr.players) },
      { l: t("fieldDuration"), v: S.formatSec(tr.durationSec) }
    ], '<button class="suite-btn suite-btn-ghost" data-act="redraw">🎲 ' + esc(t("defiRedraw")) + '</button>' +
       '<button class="suite-btn suite-btn-primary" data-act="send">🎯 ' + esc(t("defiSendBtn")) + '</button>');
  }

  function blocBase() {
    if (idees === null) { chargerIdees(); return '<p class="suite-sub">' + esc(t("commonLoading")) + '</p>'; }
    if (idees === "erreur") return '<p class="suite-sub">' + esc(t("defiBaseError")) + '</p>';
    var q = cle(epreuve.recherche);
    var liste = idees.filter(function (x) {
      return !q || cle(x.theme).indexOf(q) >= 0 || cle(x.category).indexOf(q) >= 0;
    });
    var html = '<input type="search" class="suite-input suite-defi-search" data-act="search" value="' + esc(epreuve.recherche) +
      '" placeholder="' + esc(t("defiBaseSearch")) + '" aria-label="' + esc(t("defiBaseSearch")) + '" />';
    if (idees.some(function (x) { return x.status === "pending"; })) html += '<p class="suite-defi-note">' + esc(t("catalogPendingNote")) + '</p>';
    if (!idees.length) return html + '<p class="suite-sub">' + esc(t("defiBaseEmpty")) + '</p>';
    if (!liste.length) return html + '<p class="suite-sub">' + esc(t("defiBaseNoMatch")) + '</p>';
    html += '<div class="suite-defi-ideas">' + liste.map(function (x) {
      var meta = [];
      if (x.category) meta.push(x.category);
      if (x.players) meta.push(jouteurs(x.players));
      if (x.level) meta.push(niveauLabel(x.level));
      var choisi = epreuve.idee && epreuve.idee.id === x.id;
      return '<button type="button" class="suite-defi-idea' + (choisi ? " is-on" : "") + '" data-idea="' + esc(x.id) + '" aria-pressed="' + (choisi ? "true" : "false") + '">' +
        '<span class="suite-defi-idea-theme">' + esc(x.theme) + (x.status === "pending" ? ' <span class="suite-defi-pending" title="' + esc(t("pendingTitle")) + '">✳</span>' : '') + '</span>' +
        (meta.length ? '<span class="suite-defi-idea-meta">' + esc(meta.join(" · ")) + '</span>' : '') +
      '</button>';
    }).join("") + '</div>';
    if (epreuve.idee) {
      var x = epreuve.idee;
      html += carte([
        { l: t("defiGameLabel"), v: x.category || t("valueNone"), desc: x.category_desc || "" },
        { l: t("fieldTheme"), v: x.theme },
        { l: t("fieldPlayers"), v: jouteurs(x.players) }
      ], '<button class="suite-btn suite-btn-primary" data-act="send">🎯 ' + esc(t("defiSendBtn")) + '</button>');
    }
    return html;
  }

  function blocManuel() {
    var b = epreuve.brouillon, d = S.data(), lv = epreuve.level, loc = S.locale();
    var themes = ((d.themes && d.themes[lv]) || []).slice().sort(function (x, y) { return String(x).localeCompare(String(y), loc); });
    var noms = jeux(lv).map(function (j) { return j.name; }).sort(function (x, y) { return x.localeCompare(y, loc); });
    return '<div class="suite-defi-card suite-defi-form">' +
      '<fieldset class="suite-defi-jeu">' +
        '<legend>' + esc(t("defiGameLabel")) + '</legend>' +
        '<label class="suite-set-field"><span>' + esc(t("defiGameName")) + '</span>' +
          '<input type="text" class="suite-input" data-f="category" list="defiJeux" maxlength="120" value="' + esc(b.category) + '" placeholder="' + esc(t("defiGameNamePh")) + '" /></label>' +
        '<datalist id="defiJeux">' + noms.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join("") + '</datalist>' +
        '<label class="suite-set-field"><span>' + esc(t("defiGameDesc")) + '</span>' +
          '<textarea class="suite-input" data-f="categoryDesc" rows="2" maxlength="600" placeholder="' + esc(t("defiGameDescPh")) + '">' + esc(b.categoryDesc) + '</textarea></label>' +
      '</fieldset>' +
      '<label class="suite-set-field"><span>' + esc(t("fieldTheme")) + ' <span class="suite-req">*</span></span>' +
        '<input type="text" class="suite-input" data-f="theme" list="defiThemes" maxlength="300" value="' + esc(b.theme) + '" placeholder="' + esc(t("defiManualThemePh")) + '" /></label>' +
      '<datalist id="defiThemes">' + themes.map(function (x) { return '<option value="' + esc(x) + '"></option>'; }).join("") + '</datalist>' +
      '<label class="suite-set-field"><span>' + esc(t("challengePlayersLabel")) + '</span>' +
        '<input type="number" class="suite-input suite-defi-players" data-f="players" min="1" max="12" inputmode="numeric" value="' + esc(b.players) + '" /></label>' +
      (connecte()
        ? '<label class="suite-set-toggle"><input type="checkbox" data-f="partager"' + (b.partager ? " checked" : "") + ' /> <span>' + esc(t("defiManualShare")) + '</span></label>'
        : '') +
      '<p class="suite-defi-err" data-r="err" role="alert" hidden></p>' +
      '<div class="suite-defi-actions"><button class="suite-btn suite-btn-primary" data-act="send">🎯 ' + esc(t("defiSendBtn")) + '</button></div>' +
    '</div>';
  }

  function render() {
    var modes = [["tirage", "defiModeDraw"], ["base", "defiModeBase"], ["manuel", "defiModeManual"]];
    var corps = epreuve.mode === "base" ? blocBase() : epreuve.mode === "manuel" ? blocManuel() : blocTirage();

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="home">← ' + esc(t("suiteHomeTitle")) + '</button>' +
        '<h1 class="suite-h1">🎯 ' + esc(t("sectionDefiTitle")) + '</h1>' +
        '<p class="suite-sub">' + esc(t("sectionDefiDesc")) + '</p>' +
      '</div>' +
      '<div class="suite-seg suite-defi-modes" role="tablist">' +
        modes.map(function (m) {
          var on = epreuve.mode === m[0];
          return '<button type="button" role="tab" class="suite-seg-opt' + (on ? " is-on" : "") +
            '" aria-selected="' + (on ? "true" : "false") + '" data-mode="' + m[0] + '">' + esc(t(m[1])) + '</button>';
        }).join("") +
      '</div>' +
      (epreuve.mode !== "base"
        ? '<div class="suite-field">' +
            '<label class="suite-label">' + esc(t("prepLevel")) + '</label>' +
            '<div class="suite-seg" data-seg="level">' +
              S.levels.map(function (lv) {
                return '<button type="button" class="suite-seg-opt' + (epreuve.level === lv ? " is-on" : "") +
                  '" data-level="' + lv + '">' + esc(niveauLabel(lv)) + '</button>';
              }).join("") +
            '</div>' +
          '</div>'
        : '') +
      corps +
      '<div class="suite-defi-links">' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="mine">📤 ' + esc(t("defiMine")) + '</button>' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="received">📥 ' + esc(t("defiReceived")) + '</button>' +
      '</div>';

    brancher();
  }

  function brancher() {
    root.querySelector('[data-act="home"]').onclick = function () { navigate("#/"); };
    root.querySelectorAll("[data-mode]").forEach(function (b) {
      b.onclick = function () { lireBrouillon(); epreuve.mode = b.getAttribute("data-mode"); render(); };
    });
    root.querySelectorAll('[data-seg="level"] .suite-seg-opt').forEach(function (b) {
      b.onclick = function () {
        lireBrouillon();
        epreuve.level = b.getAttribute("data-level");
        if (epreuve.mode === "tirage") epreuve.tirage = tirer(epreuve.level);   // le niveau change le tirage : on retire
        render();
      };
    });
    var redraw = root.querySelector('[data-act="redraw"]');
    if (redraw) redraw.onclick = function () { epreuve.tirage = tirer(epreuve.level); render(); };

    var recherche = root.querySelector('[data-act="search"]');
    if (recherche) recherche.oninput = function () {
      epreuve.recherche = recherche.value;
      var pos = recherche.selectionStart;
      render();
      var r2 = root.querySelector('[data-act="search"]');
      if (r2) { r2.focus(); try { r2.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    };
    root.querySelectorAll("[data-idea]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-idea");
        epreuve.idee = (Array.isArray(idees) ? idees : []).filter(function (x) { return x.id === id; })[0] || null;
        render();
      };
    });

    // Choisir une suggestion connue remplit sa description, si le champ est vide.
    var nom = root.querySelector('[data-f="category"]'), desc = root.querySelector('[data-f="categoryDesc"]');
    if (nom && desc) nom.onchange = function () {
      if (String(desc.value || "").trim()) return;
      var j = trouverJeu(epreuve.level, nom.value);
      if (j && j.desc) desc.value = j.desc;
    };

    var send = root.querySelector('[data-act="send"]');
    if (send) send.onclick = envoyer;
    root.querySelector('[data-act="mine"]').onclick = function () { if (window.ActoChallenge) window.ActoChallenge.openMine(); };
    root.querySelector('[data-act="received"]').onclick = function () { if (window.ActoChallenge) window.ActoChallenge.openReceived(); };
  }

  // La saisie survit aux changements d'onglet et de niveau.
  function lireBrouillon() {
    if (epreuve.mode !== "manuel" || !root) return;
    var b = epreuve.brouillon;
    ["category", "categoryDesc", "theme", "players"].forEach(function (k) {
      var el = root.querySelector('[data-f="' + k + '"]'); if (el) b[k] = String(el.value || "");
    });
    var p = root.querySelector('[data-f="partager"]'); if (p) b.partager = !!p.checked;
  }

  function erreur(msg, champ) {
    var err = root.querySelector('[data-r="err"]');
    if (err) { err.textContent = msg; err.hidden = false; }
    var el = root.querySelector('[data-f="' + champ + '"]'); if (el) el.focus();
  }

  function envoyer() {
    if (!window.ActoChallenge) return;
    if (epreuve.mode === "tirage") {
      var tr = epreuve.tirage;
      window.ActoChallenge.open(instantane({ category: tr.jeu ? tr.jeu.name : "", categoryDesc: tr.jeu ? tr.jeu.desc : "",
        theme: tr.theme, players: tr.players, durationSec: tr.durationSec, level: epreuve.level }));
      return;
    }
    if (epreuve.mode === "base") {
      var x = epreuve.idee; if (!x) return;
      window.ActoChallenge.open(instantane({ category: x.category, categoryDesc: x.category_desc, theme: x.theme,
        players: x.players, durationSec: x.duration_sec, level: x.level }));
      return;
    }

    lireBrouillon();
    var b = epreuve.brouillon, saisie = {
      category: String(b.category || "").trim(),
      categoryDesc: String(b.categoryDesc || "").trim(),
      theme: String(b.theme || "").trim(),
      players: String(b.players || "").trim()
    };
    if (!saisie.theme) { erreur(t("defiManualThemeRequired"), "theme"); return; }
    // Saisie à la main : même règle que le tirage, pas de Mixte ni de Comparée.
    if (saisie.category && natures(epreuve.level)(saisie.category)) { erreur(t("defiNoNature"), "category"); return; }
    // Une contrainte sans description est incompréhensible pour qui reçoit le défi.
    if (saisie.category && !saisie.categoryDesc) { erreur(t("defiGameDescRequired"), "categoryDesc"); return; }
    var partager = b.partager && connecte();
    window.ActoChallenge.open(instantane({ category: saisie.category, categoryDesc: saisie.categoryDesc, theme: saisie.theme,
      players: saisie.players, durationSec: 120, level: epreuve.level }), {
      onCreated: function (snap) { if (partager) proposer(snap, saisie); }
    });
  }

  window.ActoDefis = { mount: mount };
})();
