# Supabase keep-alive + inspiration auto-feed

A free GitHub Action runs **twice a week** (Mon + Thu). Every run it:

1. **Reads** from Supabase → counts as activity, so the free project is **never
   paused** for the 7-day inactivity rule.
2. **Pulls** the newest uploads from a list of impro YouTube channels and adds the
   new ones as **`pending`** inspiration videos. You then **accept or reject** them
   from the admin page (they're tagged *“Ajout automatique (feed)”* in Notes).

It runs on GitHub's servers — **your PC does not need to be on.**

Files: `.github/workflows/keepalive-feed.yml`, `scripts/feed.mjs`,
`scripts/feed-sources.json`, `migrate-keepalive-feed.sql`.

---

## One-time setup (≈ 3 min)

Your shared token is already set inside `migrate-keepalive-feed.sql` (last line).

### 1. Create the backend (Supabase → SQL Editor)
Run **`migrate-keepalive-feed.sql`** (idempotent — safe to re-run). It creates the
`acto_secrets` table + `feed_add_inspiration` RPC and stores your token.

### 2. Add the same token to GitHub
Repo **Settings → Secrets and variables → Actions → New repository secret**
- Name: `FEED_TOKEN`
- Value: the token on the last line of `migrate-keepalive-feed.sql`.

### 3. Push these files to the **default branch** (`main`)
GitHub only runs *scheduled* workflows from the default branch.

### 4. (Optional) Test it now
Repo **Actions** tab → **“Supabase keep-alive + inspiration feed”** → **Run workflow**.
Check the run log: you should see `keep-alive read → HTTP 200` and
`feed done: +N pending …`. New items appear in the admin **🎭 Inspirations** view.

---

## Notes & tuning

- **Keep-alive works even before the feed is set up.** Just pushing the workflow keeps
  the project alive; the feed turns on once `FEED_TOKEN` is set in both places.
- **Add/remove channels:** edit `scripts/feed-sources.json`. To get a channel's id,
  open its YouTube page → *View Source* → search `"channelId":"UC…`. Only ids
  matching `UC…` (24 chars) are used.
- **Knobs** (env in the workflow yaml): `FEED_MAX` (max new items per run, default 12),
  `FEED_PER_CHANNEL` (default 4), `FEED_DAYS` (ignore uploads older than this, default 120).
- **Security:** the publishable key + URL are public by design. The only secret is
  `FEED_TOKEN`, which only allows inserting *pending* inspirations (nothing else).
- GitHub auto-disables scheduled workflows after **60 days with no repo commits** —
  any push (or a manual run) re-arms it.
