/**
 * topbar-i18n.js — Traduit la barre de navigation des pages secondaires.
 *
 * Mesuré (audit 2026-09-07) : quickgame.html traduit sa barre (« Accueil »,
 * « Règles », « Inspirations », « Échauffement », « Réglages ») parce que ses
 * <span> portent un id que js/app.js cible. Les MÊMES boutons, copiés dans
 * warmups.html, inspirations.html, inspiration.html et mes-impros.html,
 * n'avaient pas d'id : ils restaient en français quelle que soit la langue
 * choisie, alors que tout le reste de la page était traduit.
 *
 * Les clés existent déjà dans data/ui.json ; il ne manquait que le câblage.
 * Fichier séparé plutôt qu'un ajout à utils.js, qui est volontairement
 * sans effet de bord sur le DOM.
 *
 * Charger APRÈS data/all.js sur toute page qui affiche cette barre.
 */
(function () {
  "use strict";

  var CLES = {
    homeLabelText:     "homeBtn",
    rulesLabelText:    "rulesBtn",
    inspireLabelText:  "inspireLabelText",
    warmupLabelText:   "warmupsPageTitle",
    // quickgame.html emploie « warmupsLabelText » (avec s) pour le même bouton :
    // les deux graphies existent dans les pages, on couvre les deux plutôt que
    // de renommer un id que du JS de page cible peut-être ailleurs.
    warmupsLabelText:  "warmupsPageTitle",
    quickWarmupLabelText: "quickWarmupBtn",
    settingsLabelText: "settings"
  };

  function ui() {
    var loc = "fr";
    try { loc = (localStorage.getItem("impro-studio:locale:v1") || "fr").trim(); } catch (e) { /* stockage privé */ }
    var all = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui) || {};
    return all[loc] || all.fr || {};
  }

  function appliquer() {
    var t = ui();
    Object.keys(CLES).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;                      // la page n'a pas ce bouton
      var v = t[CLES[id]];
      if (typeof v === "string" && v) el.textContent = v;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", appliquer);
  else appliquer();

  // La langue peut changer dans un autre onglet (le sélecteur vit sur d'autres
  // pages) : on suit, sans recharger.
  window.addEventListener("storage", function (e) {
    if (e && e.key === "impro-studio:locale:v1") appliquer();
  });

  window.actoTopbarI18n = appliquer;   // ré-application manuelle après un rendu
})();
