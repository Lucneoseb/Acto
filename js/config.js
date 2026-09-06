/**
 * config.js — Single source of truth for runtime configuration.
 *
 * Loaded as a classic script BEFORE auth.js, app.js, and any inline page
 * script that talks to Supabase. Exposes its values on window.actoConfig
 * so non-module pages (admin.html) and scripts share the same config.
 *
 * The publishable key is public-by-design (it's served to every browser).
 * Row Level Security is what actually protects data — see supabase-setup-all.sql.
 */
(function () {
  "use strict";

  const CONFIG = Object.freeze({
    supabase: Object.freeze({
      url: "https://gssotstyevehbzydzhlq.supabase.co",
      key: "sb_publishable_Xf7VpU-g-01tErkZSeMZSg_rqPhvFNx"
    }),
    site: Object.freeze({
      // Used as the redirect target for email confirmation + password reset.
      // Falls back to current origin so local dev / Netlify previews work too.
      redirectUrl: function () {
        return window.location.origin + window.location.pathname;
      }
    }),
    auth: Object.freeze({
      // Social sign-in buttons only render for the providers listed here. Add a
      // provider ONLY after you've enabled it in the Supabase dashboard
      // (Authentication → Providers) and set its Client ID/Secret — otherwise
      // clicking it lands the user on Supabase's raw "provider is not enabled"
      // error page. Empty = e-mail/password + magic link only.
      //   e.g. oauthProviders: ["google"]   or   ["google", "apple"]
      oauthProviders: Object.freeze(["google"])
    })
  });

  window.actoConfig = CONFIG;

  /* ------------------------------------------------------------------
     HORS LIGNE : service worker « réseau d'abord » (voir sw.js).
     Inscrit après le chargement complet pour ne pas concurrencer les
     ressources de la page. En ligne, il ne change rien à ce qui est servi ;
     hors ligne, une page déjà visitée s'ouvre quand même (les coachings et
     matchs préparés sont dans localStorage). ------------------------------- */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function (e) { console.warn("[sw] inscription refusée", e && e.message); });
    });
  }

  /* ------------------------------------------------------------------
     FILET : une erreur JS non rattrapée laisse souvent une page à moitié
     rendue, sans rien à cliquer. On affiche une fois, discrètement, de quoi
     recharger. Uniquement pour nos propres scripts (même origine) : une
     extension de navigateur qui plante ne doit pas alarmer l'utilisateur. */
  var actoErrShown = false;
  window.addEventListener("error", function (ev) {
    if (actoErrShown) return;
    var src = ev && ev.filename ? String(ev.filename) : "";
    if (!src || src.indexOf(location.origin) !== 0) return;
    if (!ev.error && !ev.message) return;
    actoErrShown = true;
    var fr = (document.documentElement.lang || "fr").slice(0, 2) === "fr";
    var d = document.createElement("div");
    d.setAttribute("role", "alert");
    d.style.cssText = "position:fixed;left:50%;bottom:calc(1rem + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99998;" +
      "display:flex;gap:.6rem;align-items:center;max-width:calc(100vw - 2rem);padding:.6rem .9rem;border-radius:12px;" +
      "background:#2a0e2c;color:#f5f0ea;border:1px solid rgba(245,196,81,.5);box-shadow:0 8px 30px rgba(0,0,0,.5);" +
      "font:500 .9rem/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
    d.innerHTML = '<span>' + (fr ? "Un problème est survenu sur cette page." : "Something went wrong on this page.") + '</span>' +
      '<button type="button" style="min-height:40px;padding:.4rem .8rem;border-radius:9px;border:1px solid rgba(245,196,81,.5);background:rgba(245,196,81,.14);color:#f5c451;font:600 .9rem/1 inherit;cursor:pointer;white-space:nowrap">' + (fr ? "Recharger" : "Reload") + '</button>' +
      '<button type="button" aria-label="' + (fr ? "Fermer" : "Close") + '" style="min-height:40px;min-width:40px;border:none;background:none;color:#f5f0ea;font-size:1.1rem;cursor:pointer">✕</button>';
    var btns = d.querySelectorAll("button");
    btns[0].onclick = function () { location.reload(); };
    btns[1].onclick = function () { d.remove(); };
    (document.body || document.documentElement).appendChild(d);
  });

  /* ------------------------------------------------------------------
     FILET : le SDK Supabase vient d'un CDN, et un CDN, ça tombe.

     Mesuré : avec cdn.jsdelivr.net injoignable, /login rendait 0 caractère
     et 0 pixel — une page ENTIÈREMENT BLANCHE. auth.js sort en effet dès sa
     ligne 16 (« Supabase SDK missing ») avant d'avoir révélé #authScreen, qui
     est `hidden` dans le HTML. Aucun message, rien à cliquer, aucune idée de
     ce qui se passe. Ça arrive derrière un proxy d'entreprise, avec certains
     bloqueurs de pub, sur un wifi de salle capricieux — et c'est la porte
     d'entrée du produit.

     Ce fichier est chargé juste après le SDK sur LES 11 PAGES : un seul point
     de contrôle suffit. On ne cherche pas à réparer, seulement à ne pas
     laisser l'utilisateur devant une page vide.

     Volontairement autonome : ni i18n (data/all.js n'est pas encore chargé),
     ni CSS externe (il peut manquer aussi). FR + EN couvrent l'essentiel d'un
     mode dégradé. ------------------------------------------------------- */
  if (!window.supabase || !window.supabase.createClient) {
    var afficher = function () {
      if (document.getElementById("actoSdkDown")) return;
      var d = document.createElement("div");
      d.id = "actoSdkDown";
      d.setAttribute("role", "alert");
      d.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;" +
        "flex-direction:column;align-items:center;justify-content:center;gap:.9rem;" +
        "padding:2rem 1.4rem;text-align:center;background:#0c0814;color:#f5f0ea;" +
        "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
      d.innerHTML =
        '<div style="font-size:2.4rem">🎭</div>' +
        '<h1 style="margin:0;font-size:1.25rem;color:#f5c451">Acto — The Impro Studio</h1>' +
        '<p style="margin:0;max-width:26rem;line-height:1.5">' +
          'Impossible de charger une ressource externe nécessaire à la connexion. ' +
          'Un bloqueur de publicité, un réseau d’entreprise ou une coupure passagère ' +
          'peuvent en être la cause.' +
        '</p>' +
        '<p style="margin:0;max-width:26rem;line-height:1.5;opacity:.75;font-size:.9rem">' +
          'Couldn’t load an external resource required to sign in. An ad blocker, ' +
          'a corporate network or a temporary outage may be the cause.' +
        '</p>' +
        '<button type="button" style="margin-top:.4rem;min-height:44px;padding:.6rem 1.2rem;' +
          'border-radius:10px;border:1px solid rgba(245,196,81,.5);background:rgba(245,196,81,.12);' +
          'color:#f5c451;font:600 1rem/1 inherit;cursor:pointer">Réessayer · Retry</button>';
      d.querySelector("button").onclick = function () { window.location.reload(); };
      (document.body || document.documentElement).appendChild(d);
    };
    if (document.body) afficher();
    else document.addEventListener("DOMContentLoaded", afficher);
  }
})();
