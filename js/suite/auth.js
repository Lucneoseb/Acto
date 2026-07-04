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
  // Carry the intended deep link (e.g. a #/collab/<id>/<token> share link) through
  // login so an invited-but-logged-out collaborator lands back on the right match.
  function loginUrl() {
    var h = window.location.hash || "";
    return "login.html" + (h.length > 2 ? "?next=" + encodeURIComponent(h) : "");
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
