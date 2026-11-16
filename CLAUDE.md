# Acto — The Impro Studio

Static web app (vanilla JS, no build step) deployed on **Cloudflare Workers
Static Assets** at the custom domain **https://acto-theimprostudio.com**
(legacy URLs `https://acto-theimprostudio.lucneoseb.workers.dev` and
`https://thriving-trifle-e565e3.netlify.app` may still resolve during the
migration window).

Deploy is auto-triggered by every push to `main` via Cloudflare Workers
Builds — see `wrangler.toml` and `.assetsignore` at the repo root. The
`netlify.toml` is kept around only for parity reference; the live config
is `_headers` (read by Cloudflare).

It's a French-language randomizer for theatre improvisation. Auth, per-user
stats, impro event log, and an admin dashboard all run on **Supabase**
(project `gssotstyevehbzydzhlq`).

## File layout

```
.
├── index.html             — public app shell
├── admin.html      — admin dashboard (self-contained; loads config + utils)
├── styles.css             — all visual styling for index.html
├── netlify.toml           — legacy headers config (Netlify, kept for parity)
├── wrangler.toml          — Cloudflare Worker Static Assets config (live)
├── _headers               — security/cache headers served by Cloudflare
├── .assetsignore          — files excluded from Cloudflare upload (.git, etc.)
├── .gitignore             — excludes .claude/, OS cruft, future .env
├── README.md              — project blurb
├── CLAUDE.md              — this file
├── supabase-setup-all.sql — single idempotent SQL setup (the only one in use)
├── build-data.js          — Node script that regenerates data/all.js
├── verify.js              — `node verify.js` avant chaque push : i18n, ?v=, SRI, routes, PWA, syntaxe
├── sw.js                  — service worker « réseau d'abord » (hors ligne) ; procédure de désactivation en tête de fichier
├── manifest.webmanifest   — PWA installable (icônes carrées dans assets/icon-*.png, générées depuis logo.png)
├── vendor/                — Supabase SDK + qrcode-generator auto-hébergés (SRI dans chaque page)
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
    ├── app.js     — main app logic (mode/level/theme picker, slot reels, chrono, audience cue, recorder)
    ├── topbar.js  — barre du haut commune (voir « Barre de navigation » ci-dessous)
    └── impro-tool.js — IMPRO TOOL : minuteur + sifflet + kazoo, en pop-up depuis la barre
```

## Script load order (`index.html`)

```
@supabase/supabase-js@2  → js/config.js  → js/utils.js  → data/all.js  → js/auth.js  → js/app.js
```

`admin.html` is self-contained but follows the same prefix:
```
@supabase/supabase-js@2  → js/config.js  → js/utils.js  → (inline admin script)
```

`window.actoConfig` and `window.actoUtils` are the single source of truth —
never duplicate Supabase URLs/keys or helpers like `escapeHtml`/`fmtSec`
inside another file.

## Database

Only **`supabase-setup-all.sql`** is in use. It's idempotent — safe to re-run.

**It really does hold the whole schema now (2026-07-29).** It didn't before:
six feature schemas — échauffements, équipes, stats joueurs, vues/notes des
inspirations, keep-alive, codes de direct — lived only in their `migrate-*.sql`,
so a database built from the "reference" file alone came up silently
incomplete. They are folded in at the end of the file, newest definition last
(a later migration that redefines an earlier function wins by position).

`migrate-*.sql` files are kept as history. Re-applying one is harmless but
never necessary. One exception worth knowing: `migrate-keepalive-feed.sql`
carries the shared feed token in clear text; the fold-in deliberately leaves
that `insert` out, so setting `acto_secrets.feed_token` stays a manual step.

After first signup, promote yourself to admin:

```sql
update public.profiles set is_admin = true
where email = 'your@email.com';
```

## Working directory

**Always edit files in `I:\Perso\GitActo\Acto\` directly** — never inside
`.claude/worktrees/...`. SourceTree only sees the main checkout. Worktrees
are useful for read-only exploration, not for the primary edit target.

Le dépôt était sur `H:\Perso\GitActo\` jusqu'au 30/10/2026. Le volume `I:`
n'enregistre pas la propriété des fichiers : git exige une fois
`git config --global --add safe.directory I:/Perso/GitActo/Acto`.

## Testing with Chrome MCP

The `mcp__Claude_in_Chrome__*` tools are available. Standard loop:

1. `tabs_context_mcp { createIfEmpty: true }` to get a tab id.
2. `navigate { url, tabId }` to either the live custom domain
   `https://acto-theimprostudio.com` or a local server URL (the navigate
   tool prepends `https://` if missing, so `file:///` URLs don't work —
   run `python -m http.server` and use `http://localhost:8000` for local
   testing).
3. `read_page { tabId, filter: "all" }` to confirm the rendered DOM.
4. `read_console_messages { tabId, pattern: "admin|error|supabase" }` —
   `admin.html` logs `[admin] init starting…`, `[admin] session: …`,
   `[admin] profile: …` so you can pinpoint where the boot stalls.
5. `read_network_requests { tabId, urlPattern: "supabase" }` — confirms
   `auth/v1/*` and `rest/v1/profiles|impro_events` calls and their statuses.

## Barre de navigation

Toutes les pages publiques sauf le Studio (welcome.html, qui garde la sienne et
sert de modèle) et admin.html chargent `js/topbar.js` en fin de `<body>`. Le
script reconstruit `.top-actions` (ou la crée) : 🏠 Accueil · 🎭 Inspirations ·
🎲 Match rapide · 🔥 Échauffement rapide · 💡 Idées, puis les boutons propres à
la page (Règles, Réglages, Défis…, déplacés avec leurs écouteurs), puis
l'avatar du compte (lien `welcome.html?compte=1`, qui ouvre le menu du compte) ou
« Se connecter ». **Ne pas recopier ces liens communs dans une page** : il suffit
d'y laisser ses propres boutons dans `.top-actions`. Nouvelle page : charger
`data/all-fr.js` puis `js/topbar.js`. Si son contenu commence tout en haut,
lui donner `margin-top: calc(var(--acto-topbar-bas) + 0.75rem)` sous
`body.has-acto-topbar` (voir styles.css), sinon il passe sous la barre fixe.

## IMPRO TOOL (js/impro-tool.js)

Le minuteur de l'arbitre, ouvrable depuis la barre du haut sur les douze pages
publiques (welcome.html compris ; pas admin.html ni index.html, qui n'est
qu'une redirection). Un fichier, autonome : il insère lui-même son bouton ⏱️
dans `.top-actions`, juste après 💡 Idées, injecte sa propre CSS (`.itool-*`)
et construit sa fenêtre dans `<body>`.

Contenu : compte à rebours avec le caucus (20 s) en un bouton et une liste
déroulante 30 s → 15 min, signe de temps à faire affiché pendant le décompte,
sifflet d'arbitre à la fin (case mémorisée), sifflet et kazoo à la demande,
fermeture par le ✕, le bouton « Fermer », Échap ou un clic hors du panneau ;
Espace démarre/met en pause.

Quatre choses à savoir avant d'y toucher :

- **La fin est une date, pas un compteur.** `finAt` est gardée dans
  localStorage (`acto:improtool:v1`), donc le décompte survit au changement de
  page — le bouton de la barre affiche alors le temps restant à la place de
  son libellé — et ne dérive pas quand l'onglet passe en arrière-plan, où les
  intervalles sont bridés à une fois par minute.
- **La CSS est dans le JS, volontairement.** `/js/*` est servi en no-cache
  (voir `_headers`) ; une règle ajoutée à styles.css n'atteindrait les
  utilisateurs qu'avec un `?v=` bumpé sur les quatorze pages. Le CSP autorise
  `style-src 'unsafe-inline'`, l'injection passe.
- **Les signes de temps** reprennent les six visuels de `assets/gestes/`, ceux
  de l'article « Le match d'impro » — même `?v=` que `js/suite/discover.js`,
  à garder aligné. L'échelle est dans `signe()` : rien au-delà de 10 min, le
  poing de 10:00 à 9:01, N doigts jusqu'à 1:01, l'entonnoir de conclusion dans
  la dernière minute, puis 30 s, 10 s et le décompte. Le `src` n'est posé qu'au
  moment de l'affichage (`loading="lazy"` ne suffit pas) : une page qui n'ouvre
  jamais l'outil ne télécharge aucune des six images. Le bloc clignote trois
  fois à chaque changement, parce qu'un signe se donne AU moment où il tombe.
- **Les sons sont synthétisés** (Web Audio, aucun fichier) et refaits le
  2026-11-16, la première version ne ressemblant ni à l'un ni à l'autre :
  - **Sifflet** : un son TONAL, pas une bouffée d'air. Fondamentale 3150 Hz +
    partiel à 1,34× (les deux chambres), bille qui module l'amplitude de ±28 %
    à 28 Hz et la hauteur de ±30 Hz seulement — au-delà, le porteur s'efface
    dans ses bandes latérales et on entend une sirène. Le bruit n'est qu'un
    filet d'air (0,32) autour de la fondamentale. Mesuré crête 0,38 / efficace
    0,119, soit 6,6 dB sous la version soufflée, jugée trop forte.
  - **Kazoo** : on chante dedans, une membrane grésille. Le grésillement est
    une SATURATION (courbe tanh **asymétrique**, pour les harmoniques paires
    autant qu'impaires — symétrique on obtient une clarinette), pas un hachage
    de l'amplitude : moduler à 55 Hz donnait un trémolo de vieille radio.
    Coupe-bas 500 Hz, bosses à 1,2 et 2,7 kHz pour le nasillard, filet de bruit
    à 3,2 kHz pour le papier. Mesuré crête 0,54 / efficace 0,11.
  - Les niveaux et le contenu spectral se vérifient au rendu hors ligne
    (`OfflineAudioContext` + Goertzel sur la partie tenue) ; zéro échantillon
    écrêté grâce au limiteur de `master()`. Les retoucher à l'oreille sans
    remesurer, c'est revenir à un sifflet inaudible ou saturé.
  - iOS ne réveille un AudioContext que pendant un geste : `debloquerAudio()`
    est rappelé à chaque clic dans l'outil, sans drapeau qui se verrouille.

## Gotchas

- **HTML `hidden` is not enough on flex containers.** Any element with an
  explicit `display:` rule needs `[hidden] { display: none !important; }` in
  CSS; otherwise the `hidden` attribute is silently ignored. This bit
  `admin.html` (all four gates rendered stacked).
- **Login can hang** if a browser extension or corporate firewall blocks
  `supabase.co`. `js/auth.js` now wraps `signInWithPassword` in a 10 s
  timeout via `actoUtils.withTimeout` and surfaces an explicit French
  message; check incognito mode if a real user reports the bug.
- **Two Supabase clients.** `js/auth.js` exports `window.actoSupabase`;
  `admin.html` creates its own client. Each page owns its own
  session via `localStorage` — don't try to share state between them.
- **Publishable key + SDK version.** The Supabase SDK is **self-hosted** since
  2026-09-05: `vendor/supabase-js-2.47.10.min.js`, loaded by all 11 pages with
  the same SRI hash it had on jsDelivr (verified byte-identical on import).
  `qrcode-generator` lives in `vendor/` too, so no page loads any third-party
  script and the CSP `script-src` is `'self'` only. To upgrade the SDK:
  download the UMD build, compute `sha384` (base64), replace the file AND the
  `integrity` attribute in every page, keep the pin identical everywhere.


## Traductions : chargement par langue

Les pages ne chargent plus les sept langues. `build-data.js` génère, à partir
de `data/*.json` et de `js/suite/i18n.js` :

```
data/all.js              — les 7 langues (admin.html seul le charge encore :
                           il modère les soumissions de toutes les langues)
data/all-<code>.js       — une langue, qui FUSIONNE dans le bundle existant
js/suite/i18n-<code>.js  — idem pour les chaînes du Studio
```

Chaque page charge **le français en synchrone** (c'est le repli de `t()`, il
n'est pas optionnel) puis `js/suite/locale-loader.js`, qui ajoute la langue de
l'utilisateur si elle diffère. Le Studio attend `window.actoLocaleReady` avant
son premier rendu (sinon un germanophone verrait la page s'afficher en français
puis basculer) ; les pages classiques sont re-traduites à l'arrivée du fichier,
via `window.applyTranslations`, `window.actoTopbarI18n` et l'événement
`acto:locale-ready`.

Mesuré : 140 Ko compressés de traductions par page → 23 Ko pour un francophone,
33 Ko pour les autres.

**Conséquence à ne pas oublier : après toute édition de `js/suite/i18n.js` ou
d'un `data/*.json`, relancer `node build-data.js`.** Sans ça, les pages servent
les anciennes traductions sans le moindre signe visible — `node verify.js`
attrape le cas (contrôle « fichiers générés »).

## Avant de pousser

```bash
node verify.js
```

Seize contrôles sans navigateur : parité des clés i18n (7 langues, i18n.js et
ui.json), clés appelées sans traduction, `data/all.js` régénéré, un seul `?v=`
sur toutes les pages, SRI des scripts vendorisés conforme au fichier, routes du
Studio présentes dans `_redirects`/`_headers`/`sw.js`, manifeste et icônes,
syntaxe de tous les scripts (admin inline compris). Code de sortie 1 en cas
d'échec.
