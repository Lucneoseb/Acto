/**
 * topbar.js — La barre de navigation du haut, la même sur toutes les pages.
 *
 * POURQUOI. Chaque page avait sa propre copie de la barre, chacune différente :
 * le Studio montrait 🎭 🎲 🔥 💡 et l'avatar, Inspirations n'avait pas le Match
 * rapide, Mes impros n'avait que 🎭, et six pages n'avaient rien du tout. On ne
 * savait jamais comment revenir ni où aller. Ce script construit la barre du
 * Studio partout, depuis un seul endroit :
 *
 *     🏠 Accueil · 🎭 Inspirations · 🎲 Match rapide · 🔥 Échauffement rapide ·
 *     💡 Idées · [boutons propres à la page] · avatar du compte
 *
 * Les boutons propres à une page (Règles, Réglages, Défis du Match rapide…)
 * sont gardés tels quels, avec leurs écouteurs : seuls les liens communs sont
 * remplacés. Leurs id (homeLabelText, inspireLabelText…) sont conservés, car du
 * code de page les cible pour la traduction.
 *
 * AVATAR. Le Studio a le profil (js/suite/account.js) et laisse ses initiales
 * dans localStorage ; ici on les reprend, sinon on les déduit de la session
 * Supabase stockée par le SDK. Un clic ouvre le Studio, menu du compte déplié.
 * Sans session : un bouton « Se connecter ».
 *
 * Charger après data/all-fr.js (traductions). Le Studio (welcome.html) garde sa
 * propre barre, qui est la référence de celle-ci.
 */
(function () {
  "use strict";

  var LOCALE_KEY = "impro-studio:locale:v1";
  var LIENS = [
    { cle: "home",    href: "./welcome.html",        icone: "🏠", id: "homeLabelText",        i18n: "homeBtn",          repli: "Accueil" },
    { cle: "inspire", href: "./inspirations.html",   icone: "🎭", id: "inspireLabelText",     i18n: "inspireLabelText", repli: "Inspirations", classe: "inspire-trigger" },
    { cle: "quick",   href: "./quickgame.html",      icone: "🎲", id: "quickgameLabelText",   i18n: "quickgameBtn",     repli: "Match rapide" },
    { cle: "warmup",  href: "./warmups.html?draw=1", icone: "🔥", id: "quickWarmupLabelText", i18n: "quickWarmupBtn",   repli: "Échauffement rapide" },
    { cle: "idees",   href: "./idees.html",          icone: "💡", id: "ideasLabelText",       i18n: "ideasBtn",         repli: "Idées" }
  ];
  // Un élément de l'ancienne barre est un lien commun — donc remplacé — s'il
  // pointe vers l'une de ces pages, ou s'il en porte la classe ou l'id de
  // libellé (sur Inspirations, 🎭 est un <button> sans adresse). Tout le
  // reste (Règles, Réglages, Défis…) est gardé.
  var COMMUNS = /^\/(welcome|studio|inspirations|quickgame|warmups|idees)?(\.html)?$/;
  var MARQUES_COMMUNES = ".home-trigger, .inspire-trigger, .warmup-trigger, #homeLabelText, #inspireLabelText, " +
    "#quickgameLabelText, #quickWarmupLabelText, #ideasLabelText, #warmupLabelText, #warmupsLabelText";
  function estCommun(el) {
    if (el.matches && el.matches(MARQUES_COMMUNES)) return true;
    if (el.querySelector && el.querySelector(MARQUES_COMMUNES)) return true;
    if (el.tagName === "A") {
      try { return COMMUNS.test(new URL(el.getAttribute("href") || "", window.location.href).pathname); }
      catch (e) { return false; }
    }
    return false;
  }

  function page() {
    var p = window.location.pathname.replace(/\.html$/, "").replace(/^\/+/, "");
    return p.split("/")[0] || "welcome";
  }
  var ACTIF = { inspirations: "inspire", quickgame: "quick", warmups: "warmup", idees: "idees" };

  /* ─── traductions (data/ui.json, comme topbar-i18n.js) ─────────────────── */
  function ui() {
    var loc = "fr";
    try { loc = (localStorage.getItem(LOCALE_KEY) || "fr").trim(); } catch (e) { /* stockage privé */ }
    var all = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui) || {};
    return all[loc] || all.fr || {};
  }
  function t(cle, repli) { var v = ui()[cle]; return (typeof v === "string" && v) ? v : repli; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ─── session : lue telle que le SDK Supabase la stocke ─────────────────── */
  function cleSession() {
    try {
      var url = window.actoConfig && window.actoConfig.supabase && window.actoConfig.supabase.url;
      if (url) return "sb-" + new URL(url).hostname.split(".")[0] + "-auth-token";
    } catch (e) { /* ignore */ }
    return "sb-gssotstyevehbzydzhlq-auth-token";
  }
  function utilisateur() {
    try {
      var brut = localStorage.getItem(cleSession());
      if (!brut) return null;
      var s = JSON.parse(brut);
      return (s && (s.user || (s.currentSession && s.currentSession.user))) || null;
    } catch (e) { return null; }
  }
  function initiales(u) {
    try { var c = localStorage.getItem("acto:topbar:initiales"); if (c) return c; } catch (e) { /* ignore */ }
    var m = (u && u.user_metadata) || {};
    var base = String(m.full_name || m.name || (u && u.email) || "?").trim();
    if (base.indexOf("@") > 0) base = base.split("@")[0];
    var parts = base.split(/[\s._-]+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ─── rendu ─────────────────────────────────────────────────────────────── */
  function lien(l, actif) {
    var libelle = t(l.i18n, l.repli);
    return '<a class="top-trigger acto-topbar-link' + (l.classe ? " " + l.classe : "") + (actif ? " is-active" : "") + '"' +
      ' href="' + l.href + '" aria-label="' + esc(libelle) + '"' + (actif ? ' aria-current="page"' : "") + ' data-topbar="' + l.cle + '">' +
      '<span aria-hidden="true" style="font-size:1.1rem;">' + l.icone + '</span>' +
      '<span id="' + l.id + '">' + esc(libelle) + '</span>' +
    '</a>';
  }
  function compte() {
    var u = utilisateur();
    if (u) {
      var libelle = t("authAccountSection", "Mon compte");
      return '<a class="acto-avatar-link" href="./welcome.html?compte=1" aria-label="' + esc(libelle) + '" title="' + esc(libelle) + '" data-topbar="compte">' +
        '<span class="acto-avatar">' + esc(initiales(u)) + '</span></a>';
    }
    if (page() === "login") return "";
    var connexion = t("authLoginBtn", "Se connecter");
    return '<a class="top-trigger acto-topbar-link" href="./login.html" aria-label="' + esc(connexion) + '" data-topbar="compte">' +
      '<span aria-hidden="true" style="font-size:1.1rem;">👤</span><span>' + esc(connexion) + '</span></a>';
  }

  var barre = null;
  function construire() {
    barre = document.querySelector(".top-actions");
    if (!barre) {
      barre = document.createElement("div");
      barre.className = "top-actions";
      document.body.insertBefore(barre, document.body.firstChild);
    }
    barre.classList.add("acto-topbar");
    // Boutons propres à la page : tout ce qui n'est pas un lien commun ni un
    // élément déjà posé par ce script. Déplacés tels quels (écouteurs compris).
    var extras = Array.prototype.filter.call(barre.children, function (el) {
      return !el.hasAttribute("data-topbar") && !estCommun(el);
    });
    var actif = ACTIF[page()];
    barre.innerHTML = LIENS.map(function (l) { return lien(l, l.cle === actif); }).join("");
    extras.forEach(function (el) { barre.appendChild(el); });
    barre.insertAdjacentHTML("beforeend", compte());
    document.body.classList.add("has-acto-topbar");
    ajuster();
  }

  // Une seule ligne, toujours : si les libellés ne tiennent pas (la barre
  // passait sur deux lignes entre 640 et 1150 px et recouvrait les titres),
  // icônes seules, comme sur mobile. La hauteur réelle de la barre est publiée
  // dans --acto-topbar-bas ; les pages dont le contenu commence tout en haut
  // (Idées, Inspiration, Connexion) s'en servent pour ne pas passer dessous.
  function surPlusieursLignes() {
    var h = 0;
    Array.prototype.forEach.call(barre.children, function (el) { if (el.offsetHeight > h) h = el.offsetHeight; });
    return h > 0 && barre.offsetHeight > h * 1.5;
  }
  function ajuster() {
    if (!barre) return;
    barre.classList.remove("is-compact");
    if (surPlusieursLignes()) barre.classList.add("is-compact");
    var bas = Math.ceil(barre.getBoundingClientRect().bottom);
    if (bas > 0) document.documentElement.style.setProperty("--acto-topbar-bas", bas + "px");
  }
  var ajustement = 0;
  function ajusterBientot() {
    if (ajustement) return;
    ajustement = window.requestAnimationFrame(function () { ajustement = 0; ajuster(); });
  }

  // Traduction et session peuvent changer après coup : langue chargée à la
  // demande (locale-loader.js), connexion ou déconnexion dans un autre onglet.
  function rafraichir() {
    if (!barre) return;
    LIENS.forEach(function (l) {
      var s = document.getElementById(l.id), libelle = t(l.i18n, l.repli);
      if (s) { s.textContent = libelle; s.parentNode.setAttribute("aria-label", libelle); }
    });
    var ancien = barre.querySelector('[data-topbar="compte"]');
    if (ancien) ancien.remove();
    barre.insertAdjacentHTML("beforeend", compte());
    ajuster();
  }

  function demarrer() {
    construire();
    // Les largeurs changent encore après coup : police web, boutons de page
    // affichés une fois la session connue (Réglages…).
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajusterBientot);
    window.addEventListener("load", ajusterBientot);
    if (window.ResizeObserver) new ResizeObserver(ajusterBientot).observe(barre);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
  window.addEventListener("resize", ajusterBientot);
  window.addEventListener("acto:locale-ready", rafraichir);
  window.addEventListener("storage", function (e) {
    if (!e || e.key === LOCALE_KEY || e.key === cleSession() || e.key === "acto:topbar:initiales") rafraichir();
  });
  window.actoTopbar = { rafraichir: rafraichir };
})();
