/**
 * js/suite/auth.js — login gate for the Studio (welcome.html).
 *
 * The Studio requires a logged-in account. This runs early: if there's a
 * Supabase session it reveals the page (and exposes window.actoUser /
 * window.actoSuiteSb for the collaborative features); otherwise it redirects
 * to the login page (/login). Fail-closed: any error → login.
 */
(function () {
  "use strict";

  function go(url) { try { window.location.replace(url); } catch (e) { window.location.href = url; } }
  /* On emporte l'adresse entière à travers la connexion — chemin propre
     compris, pas seulement l'ancre : /decouverte/regles/temps, un partage
     /collab/<id>/<jeton>, un match… L'invité déconnecté revient donc
     exactement là où pointait le lien qu'on lui a envoyé. */
  function loginUrl() {
    var u = (window.actoUtils && window.actoUtils.returnPath()) || "";
    return "login.html" + (u ? "?next=" + encodeURIComponent(u) : "");
  }
  function reveal() { document.body.classList.remove("suite-auth-checking"); }

  var cfg = (window.actoConfig && window.actoConfig.supabase) || null;
  if (!window.supabase || !cfg) { go("login.html"); return; }

  var sb;
  try {
    sb = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  } catch (e) { go("login.html"); return; }
  window.actoSuiteSb = sb;

  var settled = false;
  function decide(session) {
    if (settled) return; settled = true;
    if (session && session.user) {
      window.actoUser = session.user;
      window.actoAuth = { state: { user: session.user } };
      reveal();
      // Build the top-corner account menu now that we know who's logged in.
      try { if (window.ActoAccount) window.ActoAccount.init(); } catch (e) { /* ignore */ }
      // Invitations reçues par e-mail avant d'avoir (ou pendant qu'on avait
      // déjà) un compte : seul le trigger d'inscription les transformait en
      // accès, donc un compte existant ne voyait jamais le partage. On réclame
      // les siennes à chaque ouverture — silencieux, et sans jamais bloquer.
      try {
        Promise.resolve(sb.rpc("claim_my_pending_collaborations")).then(function (r) {
          if (r && !r.error && r.data > 0) {
            window.actoClaimed = r.data;
            try { window.dispatchEvent(new CustomEvent("acto:collab-claimed", { detail: { n: r.data } })); } catch (e) { /* ignore */ }
          }
        }, function () { /* migration pas encore passée : sans effet */ });
      } catch (e) { /* ignore */ }
    } else {
      go(loginUrl());
    }
  }

  // If getSession hangs (offline), fail closed → login after a short wait.
  var to = setTimeout(function () { decide(null); }, 6000);
  sb.auth.getSession()
    .then(function (res) { clearTimeout(to); decide(res && res.data && res.data.session); })
    .catch(function () { clearTimeout(to); decide(null); });

  // Bounce to login if the user signs out (e.g. in another tab).
  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") go("login.html"); });
})();
