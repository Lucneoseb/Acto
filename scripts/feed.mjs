/**
 * scripts/feed.mjs — twice-weekly Supabase keep-alive + inspiration auto-feed.
 *
 * Run by .github/workflows/keepalive-feed.yml (Node 20, no dependencies).
 *
 * 1. KEEP-ALIVE: makes a read request to Supabase every run. Any successful API
 *    request resets the free-tier "7 days of inactivity → pause" clock.
 * 2. AUTO-FEED (only if FEED_TOKEN is set): reads the impro YouTube channels in
 *    feed-sources.json, pulls their newest uploads from the public RSS feed
 *    (https://www.youtube.com/feeds/videos.xml — NOT consent-walled), and adds
 *    the new ones as 'pending' inspiration videos via the token-gated
 *    feed_add_inspiration RPC, deduped server-side. You then accept/reject them
 *    from the admin page.
 *
 * The script never exits non-zero — a feed hiccup must not look like a failed run.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// URL + publishable key are public-by-design (already served to every browser).
const SUPABASE_URL = process.env.SUPABASE_URL || "https://gssotstyevehbzydzhlq.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_Xf7VpU-g-01tErkZSeMZSg_rqPhvFNx";
const FEED_TOKEN   = process.env.FEED_TOKEN || "";
const MAX_PER_RUN  = parseInt(process.env.FEED_MAX || "12", 10);
const PER_CHANNEL  = parseInt(process.env.FEED_PER_CHANNEL || "4", 10);
const FEED_DAYS    = parseInt(process.env.FEED_DAYS || "120", 10);   // only propose uploads newer than this

function authHeaders() {
  return { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` };
}

async function keepAlive() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_videos?select=id&limit=1`, { headers: authHeaders() });
    console.log(`keep-alive read → HTTP ${r.status}`);
    return r.ok;
  } catch (e) {
    console.log(`keep-alive read failed: ${e.message}`);
    return false;
  }
}

function decodeXml(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function parseRss(xml, channelName) {
  const out = [];
  const cutoff = Date.now() - FEED_DAYS * 86400000;
  const entries = xml.split("<entry>").slice(1);
  for (const e of entries) {
    const idM = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!idM) continue;
    const pM = e.match(/<published>([^<]+)<\/published>/);
    const published = pM ? Date.parse(pM[1]) : NaN;
    if (!isNaN(published) && published < cutoff) continue;   // skip old uploads
    const tM = e.match(/<title>([\s\S]*?)<\/title>/);
    out.push({
      vid: idM[1],
      title: decodeXml((tM && tM[1]) || "").trim(),
      url: `https://www.youtube.com/watch?v=${idM[1]}`,
      channel: channelName,
      published
    });
  }
  return out;
}

function guessContentType(title) {
  const t = (title || "").toLowerCase();
  if (/\bmatch\b/.test(t)) return "match_impro";
  if (/cabaret/.test(t)) return "cabaret";
  if (/tuto|exercice|atelier|conseil/.test(t)) return "tutoriel";
  if (/documentaire|reportage|backstage|coulisses/.test(t)) return "documentaire";
  if (/spectacle|longform|impro long|long-?form/.test(t)) return "spectacle";
  return "format_court";
}

async function rpcAdd(v) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feed_add_inspiration`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        p_token: FEED_TOKEN, p_title: v.title, p_url: v.url,
        p_channel: v.channel, p_content_type: guessContentType(v.title), p_locale: "fr"
      })
    });
    const body = (await r.text()).replace(/^"|"$/g, "");
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: e.message };
  }
}

async function fetchChannel(s) {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(s.channel_id)}`, {
      headers: { "user-agent": "acto-feed/1.0" }
    });
    if (!r.ok) { console.log(`feed ${s.name}: HTTP ${r.status}`); return []; }
    return parseRss(await r.text(), s.name).slice(0, PER_CHANNEL);
  } catch (e) {
    console.log(`feed ${s.name}: ${e.message}`);
    return [];
  }
}

async function main() {
  const alive = await keepAlive();

  if (!FEED_TOKEN) {
    console.log("FEED_TOKEN not set → keep-alive only (set it to enable the auto-feed).");
    return;
  }

  let sources = [];
  try {
    sources = (JSON.parse(readFileSync(join(__dir, "feed-sources.json"), "utf8")).channels || [])
      .filter(s => s && /^UC[\w-]{20,}$/.test(s.channel_id || ""));
  } catch (e) { console.log(`feed-sources.json: ${e.message}`); }

  if (!sources.length) { console.log("no channel sources configured."); return; }
  console.log(`fetching ${sources.length} channel feed(s)…`);

  // Round-robin so one prolific channel doesn't dominate a run.
  const lists = await Promise.all(sources.map(fetchChannel));
  const candidates = [];
  let i = 0, more = true;
  while (more) {
    more = false;
    for (const list of lists) {
      if (i < list.length) { candidates.push(list[i]); more = true; }
    }
    i++;
  }

  let added = 0, dup = 0;
  for (const v of candidates) {
    if (added >= MAX_PER_RUN) break;
    const res = await rpcAdd(v);
    if (res.body.startsWith("added")) { added++; console.log(`  + ${v.title}`); }
    else if (res.body === "duplicate") { dup++; }
    else if (res.status >= 400) { console.log(`  ! ${v.title} → HTTP ${res.status} ${res.body}`); }
  }
  console.log(`feed done: +${added} pending, ${dup} already-known, ${candidates.length} scanned (alive=${alive}).`);
}

main().catch(e => { console.error("feed error:", e); process.exit(0); });
