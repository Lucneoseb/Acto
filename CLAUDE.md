# Acto — The Impro Studio

Static web app (vanilla JS, no build step) deployed on Netlify at
**https://thriving-trifle-e565e3.netlify.app/**.

It's a French-language randomizer for theatre improvisation. Auth, per-user
stats, impro event log, and an admin dashboard all run on **Supabase**
(project `gssotstyevehbzydzhlq`).

## Layout

- `index.html` + `js/auth.js` + `js/app.js` — public app, gated behind a Supabase
  email/password login (`#authScreen` → `#mainApp`).
- `accounts1234.html` — self-contained admin dashboard. Reads `profiles.is_admin`
  for the current user; gated screens are `#loadingGate`, `#loginGate`,
  `#forbiddenGate`, `#adminApp`.
- `data/` — i18n JSON + the bundled `data/all.js` payload of exercises,
  constraints, themes consumed by `app.js`.
- `bundled.html` — single-file build of the public app (offline distribution).

## Database

Only **`supabase-setup-all.sql`** is in use. The other `supabase-setup*.sql`
files are legacy and can be ignored. The "all" file is idempotent — safe to
re-run. After first signup, promote yourself to admin:

```sql
update public.profiles set is_admin = true
where email = 'your@email.com';
```

## Testing with Chrome MCP

The `mcp__Claude_in_Chrome__*` tools are available. Standard loop:

1. `tabs_context_mcp { createIfEmpty: true }` to get a tab id.
2. `navigate { url, tabId }` to either the live Netlify URL or a local server
   URL (the navigate tool prepends `https://` if missing, so `file:///` URLs
   don't work — run `python -m http.server` and use `http://localhost:8000`
   for local testing).
3. `read_page { tabId, filter: "all" }` to confirm the rendered DOM.
4. `read_console_messages { tabId, pattern: "admin|error|supabase" }` —
   `accounts1234.html` logs `[admin] init starting…`, `[admin] session: …`,
   `[admin] profile: …` so you can pinpoint where the boot stalls.
5. `read_network_requests { tabId, urlPattern: "supabase" }` — confirms
   `auth/v1/*` and `rest/v1/profiles|impro_events` calls and their statuses.

`mcp__Claude_Preview__*` is also available for headless previews of the static
folder.

## Gotchas

- **HTML `hidden` is not enough on flex containers.** Any element with an
  explicit `display:` rule needs `[hidden] { display: none !important; }` in
  CSS; otherwise the `hidden` attribute is silently ignored. This bit
  `accounts1234.html` (all four gates rendered stacked).
- **Publishable key + SDK version.** The Supabase client uses the new
  `sb_publishable_…` key. Both pages load `@supabase/supabase-js@2` from
  jsDelivr — keep that pin in sync between `index.html` and
  `accounts1234.html`.
- **Two Supabase clients.** `js/auth.js` exports `window.actoSupabase`;
  `accounts1234.html` creates its own client. Don't try to share state
  between them via JS — each page owns its own session via localStorage.
