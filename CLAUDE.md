# Acto — The Impro Studio

Static web app (vanilla JS, no build step) deployed on Netlify at
**https://thriving-trifle-e565e3.netlify.app/**.

It's a French-language randomizer for theatre improvisation. Auth, per-user
stats, impro event log, and an admin dashboard all run on **Supabase**
(project `gssotstyevehbzydzhlq`).

## File layout

```
.
├── index.html             — public app shell
├── accounts1234.html      — admin dashboard (self-contained; loads config + utils)
├── styles.css             — all visual styling for index.html
├── netlify.toml           — security headers + cache policy
├── .gitignore             — excludes .claude/, OS cruft, future .env
├── README.md              — project blurb
├── CLAUDE.md              — this file
├── supabase-setup-all.sql — single idempotent SQL setup (the only one in use)
├── build-data.js          — Node script that regenerates data/all.js
├── assets/
│   └── logo.png           — hero logo (also used as favicon today)
├── data/
│   ├── all.js             — generated bundle, loaded by index.html as IMPRO_BUNDLE
│   ├── locales.json       — list of supported locales
│   ├── ui.json            — UI string translations
│   └── {fr,en,de,es,nl,pt}.json — per-locale exercise/constraint/theme data
└── js/
    ├── config.js  — runtime config (Supabase URL/key) on window.actoConfig
    ├── utils.js   — pure helpers (escapeHtml, fmtSec, fmtDate, ageOf, withTimeout, emailValid) on window.actoUtils
    ├── auth.js    — Supabase email/password auth (signup, login, profile, account delete)
    └── app.js     — main app logic (mode/level/theme picker, slot reels, chrono, audience cue, recorder)
```

## Script load order (`index.html`)

```
@supabase/supabase-js@2  → js/config.js  → js/utils.js  → data/all.js  → js/auth.js  → js/app.js
```

`accounts1234.html` is self-contained but follows the same prefix:
```
@supabase/supabase-js@2  → js/config.js  → js/utils.js  → (inline admin script)
```

`window.actoConfig` and `window.actoUtils` are the single source of truth —
never duplicate Supabase URLs/keys or helpers like `escapeHtml`/`fmtSec`
inside another file.

## Database

Only **`supabase-setup-all.sql`** is in use. It's idempotent — safe to re-run.
After first signup, promote yourself to admin:

```sql
update public.profiles set is_admin = true
where email = 'your@email.com';
```

## Working directory

**Always edit files in `H:\Perso\GitActo\Acto\` directly** — never inside
`.claude/worktrees/...`. SourceTree only sees the main checkout. Worktrees
are useful for read-only exploration, not for the primary edit target.

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

## Gotchas

- **HTML `hidden` is not enough on flex containers.** Any element with an
  explicit `display:` rule needs `[hidden] { display: none !important; }` in
  CSS; otherwise the `hidden` attribute is silently ignored. This bit
  `accounts1234.html` (all four gates rendered stacked).
- **Login can hang** if a browser extension or corporate firewall blocks
  `supabase.co`. `js/auth.js` now wraps `signInWithPassword` in a 10 s
  timeout via `actoUtils.withTimeout` and surfaces an explicit French
  message; check incognito mode if a real user reports the bug.
- **Two Supabase clients.** `js/auth.js` exports `window.actoSupabase`;
  `accounts1234.html` creates its own client. Each page owns its own
  session via `localStorage` — don't try to share state between them.
- **Publishable key + SDK version.** Both pages load
  `@supabase/supabase-js@2` from jsDelivr — keep that pin in sync.
