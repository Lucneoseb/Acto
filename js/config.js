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
    })
  });

  window.actoConfig = CONFIG;
})();
