/**
 * js/suite/locale-loader.js — charge la langue de l'utilisateur à la demande.
 *
 * POURQUOI. Le Studio embarquait les sept langues dans deux fichiers :
 * data/all.js (85 Ko compressés) et js/suite/i18n.js (55 Ko). Un visiteur n'en
 * lit qu'une : 120 des 140 Ko étaient transférés pour rien, sur mobile compris.
 *
 * COMMENT. La page charge le FRANÇAIS en synchrone — il n'est pas optionnel,
 * c'est le repli de t() quand une clé manque — puis, si la langue choisie est
 * une autre, ce module ajoute les deux fichiers correspondants. Les fichiers
 * par langue FUSIONNENT dans le bundle (voir build-data.js), donc l'ordre
 * n'a pas d'importance et rien n'est écrasé.
 *
 * Le premier rendu attend `window.actoLocaleReady` (voir shell.js) : sans cette
 * attente, un germanophone verrait sa page s'afficher en français puis basculer.
 * Si le chargement échoue (réseau coupé, fichier absent), la promesse se résout
 * quand même : on reste en français plutôt que de bloquer le Studio.
 */
(function () {
  "use strict";

  var LOCALE_KEY = "impro-studio:locale:v1";
  var SUPPORTED = ["fr", "en", "de", "es", "pt", "nl", "it"];
  var charges = { fr: true };          // le français est déjà dans la page
  var enCours = {};

  // La version de cache est celle de ce script : les fichiers de langue sont
  // régénérés en même temps que le reste, ils partagent donc le même ?v=.
  function version() {
    try {
      var s = document.currentScript || document.querySelector('script[src*="locale-loader"]');
      var m = s && s.src && s.src.match(/[?&]v=([^&]+)/);
      return m ? m[1] : "";
    } catch (e) { return ""; }
  }
  var V = version();
  function url(chemin) { return chemin + (V ? "?v=" + V : ""); }

  function script(src) {
    return new Promise(function (resolve) {
      var el = document.createElement("script");
      el.src = src;
      el.async = false;                // exécution dans l'ordre d'insertion
      el.onload = function () { resolve(true); };
      el.onerror = function () { resolve(false); };   // jamais bloquer : on retombe en français
      document.head.appendChild(el);
    });
  }

  function charge(code) {
    if (SUPPORTED.indexOf(code) < 0) return Promise.resolve("fr");
    if (charges[code]) return Promise.resolve(code);
    if (enCours[code]) return enCours[code];
    enCours[code] = Promise.all([
      script(url("./data/all-" + code + ".js")),
      script(url("./js/suite/i18n-" + code + ".js"))
    ]).then(function (r) {
      var ok = r[0] && r[1];
      if (ok) charges[code] = true;
      delete enCours[code];
      return ok ? code : "fr";
    });
    return enCours[code];
  }

  function voulue() {
    var l = "";
    try { l = localStorage.getItem(LOCALE_KEY) || ""; } catch (e) { /* stockage privé */ }
    if (SUPPORTED.indexOf(l) < 0) l = String((navigator && navigator.language) || "fr").slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(l) >= 0 ? l : "fr";
  }

  /* Les pages classiques (Match rapide, échauffements, inspirations…) rendent
     leur contenu sur DOMContentLoaded, avant que la langue demandée ne soit
     arrivée : elles s'afficheraient en français puis se corrigeraient. On
     rappelle donc leurs points de re-traduction dès que le fichier est là.
     Un francophone ne voit jamais rien de tout ça — le français est déjà dans
     la page, en synchrone, comme avant. */
  function reappliquer(code) {
    try { if (typeof window.applyTranslations === "function") window.applyTranslations(); } catch (e) { /* ignore */ }
    try { if (typeof window.actoTopbarI18n === "function") window.actoTopbarI18n(); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent("acto:locale-ready", { detail: { locale: code } })); } catch (e) { /* ignore */ }
  }

  window.actoLocaleLoad = charge;                 // utilisé par core.js au changement de langue
  window.actoLocaleLoaded = function (c) { return !!charges[c]; };
  var voulu = voulue();
  window.actoLocaleReady = charge(voulu).then(function (c) {
    if (c !== "fr") reappliquer(c);              // le Studio, lui, attend cette promesse avant son premier rendu
    return c;
  });
})();
