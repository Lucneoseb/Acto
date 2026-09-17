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
 *   · 🎲 Tirage      — une contrainte de la Communauté (les défis express),
 *                      avec l'un de SES sujets ; les contraintes et exercices de
 *                      l'appli seulement en repli (voir AVEC_JEUX_APPLI) ;
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
  var ideesLocale = "", chargement = false, repliTirage = null;

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
  /* ── les contraintes de la Communauté, versées au tirage et à « Mon défi » ──
     Les défis express (et tout défi validé par l'admin) n'existaient que dans
     l'onglet Communauté : impossibles à tirer au sort, absents de la liste des
     contraintes de « Mon défi ». Chaque contrainte de la base y devient un jeu de
     plus, avec sa description et SES sujets. Un défi sans niveau vaut pour tous. */
  function jeuxCommunaute(level) {
    if (!Array.isArray(idees)) return [];
    var parNom = {}, liste = [];
    idees.forEach(function (x) {
      if (!x.category) return;                                // thème seul : pas de contrainte à tirer
      if (x.level && level && x.level !== level) return;
      var k = cle(x.category), j = parNom[k];
      if (!j) { j = parNom[k] = { name: x.category, desc: x.category_desc || "", sujets: [] }; liste.push(j); }
      if (!j.desc && x.category_desc) j.desc = x.category_desc;
      j.sujets.push(x);
    });
    return liste;
  }
  // Jeux du tirage et de la liste : ceux de l'appli, puis ceux de la Communauté.
  // Même nom des deux côtés : un seul jeu, qui reçoit les sujets de la base.
  /* Pour l'instant, le tirage et « Mon défi » ne proposent QUE les défis de la
     Communauté — les défis express. Les contraintes et exercices de l'appli n'y
     reviennent que si la base est vide ou injoignable, pour que le tirage ne soit
     jamais vide. true : les deux sources mélangées, à chance égale. */
  var AVEC_JEUX_APPLI = false;

  // complet = true : toujours les deux sources (savoir si une contrainte saisie
  // existe déjà quelque part, sans dépendre du réglage ci-dessus).
  function tousLesJeux(level, complet) {
    if (!AVEC_JEUX_APPLI && !complet) {
      var estNat = natures(level);
      var seuls = jeuxCommunaute(level).filter(function (c) { return !estNat(c.name); });
      if (seuls.length) return seuls;
    }
    var liste = jeux(level), index = {}, estNature = natures(level);
    liste.forEach(function (j) { index[cle(j.name)] = j; });
    jeuxCommunaute(level).forEach(function (c) {
      if (estNature(c.name)) return;
      var j = index[cle(c.name)];
      if (j) { if (!j.desc) j.desc = c.desc; j.sujets = c.sujets; }
      else { liste.push(c); index[cle(c.name)] = c; }
    });
    return liste;
  }
  function trouverJeu(level, nom, complet) {
    var k = cle(nom);
    return k ? (listeJeux(level, complet).filter(function (j) { return cle(j.name) === k; })[0] || null) : null;
  }
  /* Liste de « Mon défi » : les jeux du tirage, plus les contraintes proposées par
     les utilisateurs (validées, ou en attente pour leur auteur) — une contrainte
     écrite ou modifiée reste ainsi disponible tout de suite à celui qui l'a
     proposée, marquée ✳ jusqu'à la validation. */
  function listeJeux(level, complet) {
    var liste = tousLesJeux(level, complet), index = {}, estNature = natures(level);
    liste.forEach(function (j) { index[cle(j.name)] = j; });
    ((S.gen.contraintesProposees && S.gen.contraintesProposees(level)) || []).forEach(function (p) {
      if (estNature(p.name)) return;
      var j = index[cle(p.name)];
      // Même nom : la description proposée par l'utilisateur, encore en attente,
      // prime pour lui — c'est sa version, et la re-proposer serait un doublon.
      if (j) { if (p.desc && (p.pending || !j.desc)) j.desc = p.desc; return; }
      j = { name: p.name, desc: p.desc, enAttente: p.pending };
      liste.push(j); index[cle(p.name)] = j;
    });
    return liste;
  }
  function nomsJeux(level) {
    var loc = S.locale();
    return listeJeux(level).map(function (j) { return j.name; }).sort(function (x, y) { return x.localeCompare(y, loc); });
  }
  // Thèmes proposés dans « Mon défi » : les sujets de la contrainte choisie d'abord,
  // puis tous les autres (thèmes de l'appli et sujets de la Communauté).
  function sujetsProposes(level, nomJeu) {
    var d = S.data(), loc = S.locale(), vus = {}, tete = [], reste = [];
    function ajoute(liste, txt) { var k = cle(txt); if (!k || vus[k]) return; vus[k] = true; liste.push(String(txt)); }
    var j = trouverJeu(level, nomJeu);
    if (j && j.sujets) j.sujets.forEach(function (x) { if (x.theme) ajoute(tete, x.theme); });
    var communaute = jeuxCommunaute(level);
    // Thèmes de l'appli : seulement s'ils sont réactivés, ou si la base est vide.
    if (AVEC_JEUX_APPLI || !communaute.length) ((d.themes && d.themes[level]) || []).forEach(function (x) { ajoute(reste, x); });
    communaute.forEach(function (c) { c.sujets.forEach(function (x) { if (x.theme) ajoute(reste, x.theme); }); });
    reste.sort(function (x, y) { return x.localeCompare(y, loc); });
    return tete.concat(reste);
  }
  function options(liste) { return liste.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join(""); }

  function tirer(level) {
    level = level || "debutant";
    // Thème, nombre de jouteurs et durée : le générateur habituel.
    var seg = S.gen.newSegmentFor("match", level);
    S.gen.fillSegment(seg, level);
    // Chaque contrainte ou exercice a la même chance, ceux de la Communauté compris.
    var pool = tousLesJeux(level);
    var jeu = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    var n = parseInt(seg.players, 10);
    if (!(n > 0)) n = 2;                          // « Toute l'équipe » → un défi se joue à quelques-uns
    var theme = seg.theme || "", duree = seg.durationSec || 120, idee = null;
    // Contrainte de la Communauté : l'un de SES sujets, avec ses jouteurs et sa durée.
    if (jeu && jeu.sujets && jeu.sujets.length) {
      idee = jeu.sujets[Math.floor(Math.random() * jeu.sujets.length)];
      theme = idee.theme || "";
      if (parseInt(idee.players, 10) > 0) n = parseInt(idee.players, 10);
      if (parseInt(idee.duration_sec, 10) > 0) duree = parseInt(idee.duration_sec, 10);
    }
    // Un exercice a ses limites : « Le miroir » se joue à deux, pas à cinq.
    if (jeu && jeu.min && n < jeu.min) n = jeu.min;
    if (jeu && jeu.max && n > jeu.max) n = jeu.max;
    if (n > 12) n = 12;
    return { jeu: jeu, theme: theme, players: n, durationSec: duree, enAttente: !!(idee && idee.status === "pending") };
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
    // Le premier tirage attend la base : sans elle, il ne pourrait pas sortir un
    // défi de la Communauté (voir blocTirage).
    if (!epreuve) epreuve = { mode: "tirage", level: "debutant", tirage: null, idee: null, recherche: "",
                              brouillon: { category: "", categoryDesc: "", theme: "", players: "2", durationSec: 0, partager: true } };
    if (ideesLocale !== S.locale()) idees = null;   // la base est propre à chaque langue
    if (idees === null) chargerIdees();
    render();
  }

  /* ── base communautaire ─────────────────────────────────────────────────── */
  function chargerIdees() {
    var c = sb();
    if (!c || !c.rpc) { idees = "erreur"; return; }
    if (chargement) return;
    chargement = true;
    var loc = S.locale();
    Promise.resolve(c.rpc("list_challenge_ideas", { p_locale: loc })).then(function (r) {
      // Fonction absente (migration pas encore passée) ou erreur : on le dit
      // plutôt qu'une base vide, qui laisserait croire qu'il n'y a rien.
      chargement = false; ideesLocale = loc;
      idees = (r && !r.error && Array.isArray(r.data)) ? r.data : "erreur";
      apresChargement();
    }, function () { chargement = false; idees = "erreur"; apresChargement(); });
  }
  function apresChargement() {
    if (!root || !root.isConnected || !epreuve) return;
    if (epreuve.mode === "base") render();
    else if (epreuve.mode === "tirage" && !epreuve.tirage) { epreuve.tirage = tirer(epreuve.level); render(); }
    else if (epreuve.mode === "manuel") majListesManuel();   // pas de re-rendu : la saisie en cours reste intacte
  }
  function majListesManuel() {
    if (!root || epreuve.mode !== "manuel") return;
    var dl = root.querySelector("#defiJeux"), dt = root.querySelector("#defiThemes"), nom = root.querySelector('[data-f="category"]');
    if (dl) dl.innerHTML = options(nomsJeux(epreuve.level));
    if (dt) dt.innerHTML = options(sujetsProposes(epreuve.level, nom ? nom.value : ""));
  }

  /* Proposition à la communauté, une fois le défi envoyé. Le thème et la
     contrainte rejoignent aussi leurs bases s'ils n'y sont pas déjà : écrire un
     défi, c'est enrichir tout le monde. */
  // Déjà dans la base : un défi express choisi tel quel dans les listes de « Mon défi ».
  function dansLaBase(categorie, theme) {
    if (!Array.isArray(idees)) return false;
    var kc = cle(categorie), kt = cle(theme);
    return idees.some(function (x) { return cle(x.category) === kc && cle(x.theme) === kt; });
  }
  function sujetConnu(theme) {
    var kt = cle(theme);
    return !!kt && Array.isArray(idees) && idees.some(function (x) { return cle(x.theme) === kt; });
  }

  /* Deux choses distinctes, une fois le défi réellement envoyé :
       1. le défi lui-même rejoint la base de défis — seulement si la case est cochée ;
       2. un thème, une contrainte ou un exercice nouveaux OU MODIFIÉS partent
          TOUJOURS à l'admin, pour rejoindre ensuite la base commune. Ils servent
          déjà au défi envoyé et restent disponibles à leur auteur (✳). */
  function proposer(snap, saisie, partager) {
    var c = sb(); if (!c || !c.rpc || !connecte()) return;
    var loc = S.locale(), lv = epreuve.level, n = parseInt(snap.players, 10);
    var defiPropose = partager && !dansLaBase(saisie.category, saisie.theme);   // rien en double
    var nouveautes = 0;
    if (defiPropose) Promise.resolve(c.rpc("submit_challenge_idea", {
      p_locale: loc, p_level: lv,
      p_category: saisie.category || null, p_category_desc: saisie.categoryDesc || null,
      p_theme: saisie.theme || null,
      p_players: (n > 0 && n <= 12) ? n : null, p_duration_sec: parseInt(snap.durationSec, 10) || null
    })).then(function (r) {
      if (r && r.error) { console.warn("[defis] proposition", r.error.message || r.error); return; }
      idees = null; chargerIdees();   // la base a changé : on la recharge (tirage et listes comprises)
      toast(t("defiShared"));
    }, function () { /* hors ligne : le défi est parti, seule la proposition manque */ });

    var d = S.data();
    var themes = (d.themes && d.themes[lv]) || [];
    // Un sujet de défi express n'est pas un thème de match : il reste dans la base des défis.
    if (saisie.theme && !sujetConnu(saisie.theme) && !themes.some(function (x) { return cle(x) === cle(saisie.theme); })) {
      nouveautes++;
      Promise.resolve(c.rpc("submit_user_text", { p_kind: "theme", p_mode: "", p_level: lv, p_locale: loc, p_text: saisie.theme, p_description: null }))
        .then(function (r) { if (!(r && r.error)) S.gen.ajouterEnAttente("theme", { name: saisie.theme, level: lv }); }, function () {});
    }
    // Contrainte ou exercice nouveaux, OU description modifiée : à l'admin, avec
    // la description (il la voit en modérant). Inchangés : rien à proposer.
    var connu = saisie.category ? trouverJeu(lv, saisie.category, true) : null;
    if (saisie.category && (!connu || cle(connu.desc) !== cle(saisie.categoryDesc))) {
      nouveautes++;
      Promise.resolve(c.rpc("submit_user_text", { p_kind: "constraint", p_mode: "match", p_level: lv, p_locale: loc, p_text: saisie.category, p_description: saisie.categoryDesc || null }))
        .then(function (r) { if (!(r && r.error)) S.gen.ajouterEnAttente("constraint", { name: saisie.category, desc: saisie.categoryDesc, level: lv, mode: "match" }); }, function () {});
    }
    if (nouveautes && !defiPropose) toast(t("defiEditSubmitted"));
  }

  /* ✎ Modifier : le défi tiré, ou choisi dans la Communauté, passe dans « Mon
     défi » pour changer de contrainte ou d'exercice (dans la liste, ou écrit),
     modifier sa description, changer ou retirer le thème. */
  function modifierDefi() {
    var src = null;
    if (epreuve.mode === "tirage" && epreuve.tirage) {
      var tr = epreuve.tirage;
      src = { category: tr.jeu ? tr.jeu.name : "", categoryDesc: tr.jeu ? tr.jeu.desc : "", theme: tr.theme, players: tr.players, durationSec: tr.durationSec };
    } else if (epreuve.mode === "base" && epreuve.idee) {
      var x = epreuve.idee;
      src = { category: x.category, categoryDesc: x.category_desc, theme: x.theme, players: x.players, durationSec: x.duration_sec };
    }
    if (!src) return;
    var b = epreuve.brouillon;
    b.category = src.category || ""; b.categoryDesc = src.categoryDesc || ""; b.theme = src.theme || "";
    b.players = String(parseInt(src.players, 10) || 2); b.durationSec = parseInt(src.durationSec, 10) || 0;
    epreuve.mode = "manuel";
    render();
    var champ = root.querySelector('[data-f="category"]'); if (champ) { try { champ.focus(); } catch (e) { /* ignore */ } }
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
    if (!epreuve.tirage) {
      if (idees === null) {
        // Base lente ou injoignable : on tire sans elle plutôt que d'attendre.
        if (!repliTirage) repliTirage = setTimeout(function () {
          repliTirage = null;
          if (epreuve && !epreuve.tirage && root && root.isConnected && epreuve.mode === "tirage") { epreuve.tirage = tirer(epreuve.level); render(); }
        }, 2500);
        return '<div class="suite-defi-h">' + esc(t("defiDrawTitle")) + '</div><p class="suite-sub">' + esc(t("commonLoading")) + '</p>';
      }
      epreuve.tirage = tirer(epreuve.level);
    }
    var tr = epreuve.tirage, jeu = tr.jeu;
    return '<div class="suite-defi-h">' + esc(t("defiDrawTitle")) + '</div>' + carte([
      { l: t("defiGameLabel"), v: jeu ? jeu.name + (tr.enAttente ? " ✳" : "") : t("valueNone"), desc: jeu ? jeu.desc : "" },
      { l: t("fieldTheme"), v: tr.theme || t("valueNone") },
      { l: t("fieldPlayers"), v: jouteurs(tr.players) },
      { l: t("fieldDuration"), v: S.formatSec(tr.durationSec) }
    ], '<button class="suite-btn suite-btn-ghost" data-act="redraw">🎲 ' + esc(t("defiRedraw")) + '</button>' +
       '<button class="suite-btn suite-btn-ghost" data-act="edit">✎ ' + esc(t("defiEditBtn")) + '</button>' +
       '<button class="suite-btn suite-btn-primary" data-act="send">🎯 ' + esc(t("defiSendBtn")) + '</button>');
  }

  function blocBase() {
    if (idees === null) chargerIdees();
    if (idees === null) return '<p class="suite-sub">' + esc(t("commonLoading")) + '</p>';
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
      if (x.category && x.theme) meta.push(x.category);   // sans thème, la contrainte est déjà le titre
      if (x.players) meta.push(jouteurs(x.players));
      if (x.level) meta.push(niveauLabel(x.level));
      var choisi = epreuve.idee && epreuve.idee.id === x.id;
      return '<button type="button" class="suite-defi-idea' + (choisi ? " is-on" : "") + '" data-idea="' + esc(x.id) + '" aria-pressed="' + (choisi ? "true" : "false") + '">' +
        '<span class="suite-defi-idea-theme">' + esc(x.theme || x.category) + (x.status === "pending" ? ' <span class="suite-defi-pending" title="' + esc(t("pendingTitle")) + '">✳</span>' : '') + '</span>' +
        (meta.length ? '<span class="suite-defi-idea-meta">' + esc(meta.join(" · ")) + '</span>' : '') +
      '</button>';
    }).join("") + '</div>';
    if (epreuve.idee) {
      var x = epreuve.idee;
      html += carte([
        { l: t("defiGameLabel"), v: x.category || t("valueNone"), desc: x.category_desc || "" },
        { l: t("fieldTheme"), v: x.theme || t("valueNone") },
        { l: t("fieldPlayers"), v: jouteurs(x.players) }
      ], '<button class="suite-btn suite-btn-ghost" data-act="edit">✎ ' + esc(t("defiEditBtn")) + '</button>' +
         '<button class="suite-btn suite-btn-primary" data-act="send">🎯 ' + esc(t("defiSendBtn")) + '</button>');
    }
    return html;
  }

  function blocManuel() {
    var b = epreuve.brouillon, d = S.data(), lv = epreuve.level, loc = S.locale();
    var themes = sujetsProposes(lv, b.category), noms = nomsJeux(lv);
    return '<div class="suite-defi-card suite-defi-form">' +
      '<fieldset class="suite-defi-jeu">' +
        '<legend>' + esc(t("defiGameLabel")) + '</legend>' +
        '<label class="suite-set-field"><span>' + esc(t("defiGameName")) + '</span>' +
          '<input type="text" class="suite-input" data-f="category" list="defiJeux" maxlength="120" value="' + esc(b.category) + '" placeholder="' + esc(t("defiGameNamePh")) + '" /></label>' +
        '<datalist id="defiJeux">' + options(noms) + '</datalist>' +
        '<label class="suite-set-field"><span>' + esc(t("defiGameDesc")) + '</span>' +
          '<textarea class="suite-input" data-f="categoryDesc" rows="2" maxlength="600" placeholder="' + esc(t("defiGameDescPh")) + '">' + esc(b.categoryDesc) + '</textarea></label>' +
      '</fieldset>' +
      '<div class="suite-set-field"><span id="defiThemeLbl">' + esc(t("defiThemeOptional")) + '</span>' +
        '<div class="suite-defi-theme-row">' +
          '<input type="text" class="suite-input" aria-labelledby="defiThemeLbl" data-f="theme" list="defiThemes" maxlength="300" value="' + esc(b.theme) + '" placeholder="' + esc(t("defiManualThemePh")) + '" />' +
          '<button type="button" class="suite-icon-btn" data-act="theme-clear" aria-label="' + esc(t("defiThemeClear")) + '" title="' + esc(t("defiThemeClear")) + '">✕</button>' +
        '</div></div>' +
      '<datalist id="defiThemes">' + options(themes) + '</datalist>' +
      '<label class="suite-set-field"><span>' + esc(t("challengePlayersLabel")) + '</span>' +
        '<input type="number" class="suite-input suite-defi-players" data-f="players" min="1" max="12" inputmode="numeric" value="' + esc(b.players) + '" /></label>' +
      (connecte()
        ? '<label class="suite-set-toggle"><input type="checkbox" data-f="partager"' + (b.partager ? " checked" : "") + ' /> <span>' + esc(t("defiManualShare")) + '</span></label>'
        : '') +
      (connecte() ? '<p class="suite-help">' + esc(t("defiEditHelp")) + '</p>' : '') +
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

    /* Choisir une contrainte connue (liste ou frappe exacte) remplit sa description
       et met SES sujets en tête des thèmes proposés. Une description posée ainsi
       suit le nom : remplacée si l'on choisit une autre contrainte, retirée si l'on
       tape un nom inconnu — jamais celle que l'on a écrite soi-même. */
    var nom = root.querySelector('[data-f="category"]'), desc = root.querySelector('[data-f="categoryDesc"]');
    if (nom && desc) {
      var dernier = cle(nom.value);
      var majNom = function () {
        var j = trouverJeu(epreuve.level, nom.value), auto = desc.getAttribute("data-auto");
        var libre = !String(desc.value || "").trim() || (auto !== null && desc.value === auto);
        if (j && j.desc) { if (libre) { desc.value = j.desc; desc.setAttribute("data-auto", j.desc); } }
        else if (auto !== null && desc.value === auto) { desc.value = ""; desc.removeAttribute("data-auto"); }
        var k = j ? cle(j.name) : "";
        if (k !== dernier) {
          dernier = k;
          var dt = root.querySelector("#defiThemes"); if (dt) dt.innerHTML = options(sujetsProposes(epreuve.level, nom.value));
        }
      };
      nom.addEventListener("input", majNom);
      nom.addEventListener("change", majNom);
    }

    var edit = root.querySelector('[data-act="edit"]');
    if (edit) edit.onclick = modifierDefi;
    var efface = root.querySelector('[data-act="theme-clear"]');
    if (efface) efface.onclick = function () {
      var th = root.querySelector('[data-f="theme"]'); if (!th) return;
      th.value = ""; epreuve.brouillon.theme = "";
      try { th.focus(); } catch (e) { /* ignore */ }
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
    var errAvant = root.querySelector('[data-r="err"]'); if (errAvant) errAvant.hidden = true;   // pas de message périmé après correction
    var b = epreuve.brouillon, saisie = {
      category: String(b.category || "").trim(),
      categoryDesc: String(b.categoryDesc || "").trim(),
      theme: String(b.theme || "").trim(),
      players: String(b.players || "").trim()
    };
    // Un thème OU une contrainte : un défi peut ne porter qu'une contrainte
    // (« Le téléachat de l'absurde »), ou qu'un thème.
    if (!saisie.theme && !saisie.category) { erreur(t("defiManualNeedOne"), "category"); return; }
    // Saisie à la main : même règle que le tirage, pas de Mixte ni de Comparée.
    if (saisie.category && natures(epreuve.level)(saisie.category)) { erreur(t("defiNoNature"), "category"); return; }
    // Une contrainte sans description est incompréhensible pour qui reçoit le défi.
    if (saisie.category && !saisie.categoryDesc) { erreur(t("defiGameDescRequired"), "categoryDesc"); return; }
    var partager = b.partager && connecte();
    window.ActoChallenge.open(instantane({ category: saisie.category, categoryDesc: saisie.categoryDesc, theme: saisie.theme,
      players: saisie.players, durationSec: b.durationSec || 120, level: epreuve.level }), {
      onCreated: function (snap) { proposer(snap, saisie, partager); }
    });
  }

  window.ActoDefis = { mount: mount };
})();
