/**
 * verify.js — Contrôles de cohérence du site, sans navigateur.
 *
 *     node verify.js
 *
 * Sort en erreur (code 1) dès qu'un contrôle échoue. À lancer avant chaque
 * push : ce sont les erreurs qui ne se voient pas en développement (une clé
 * i18n oubliée dans une langue, un ?v= qui diverge entre deux pages, une
 * route ajoutée au routeur mais pas dans _redirects, un data/all.js pas
 * régénéré) et qui n'apparaissent qu'en production, chez un utilisateur.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const existe = (p) => fs.existsSync(path.join(ROOT, p));
let erreurs = 0, controles = 0;
function ok(msg) { controles++; console.log("  ✓ " + msg); }
function ko(msg) { controles++; erreurs++; console.log("  ✗ " + msg); }

const PAGES = fs.readdirSync(ROOT).filter((f) => /\.html$/.test(f)).sort();
const LOCALES = ["fr", "en", "de", "es", "pt", "nl", "it"];

/* ── 1. i18n du Studio : mêmes clés dans les 7 langues ─────────────────────── */
console.log("i18n (js/suite/i18n.js)");
const w = {}; new Function("window", lire("js/suite/i18n.js"))(w);
const I18N = w.ActoSuiteI18N || Object.values(w).find((v) => v && typeof v === "object" && v.fr);
if (!I18N) ko("export de i18n.js introuvable");
else {
  const toutes = new Set(); LOCALES.forEach((l) => Object.keys(I18N[l] || {}).forEach((k) => toutes.add(k)));
  LOCALES.forEach((l) => {
    const manque = [...toutes].filter((k) => !I18N[l] || I18N[l][k] === undefined);
    if (manque.length) ko(l + " : " + manque.length + " clé(s) manquante(s) : " + manque.slice(0, 8).join(", "));
  });
  ok(toutes.size + " clés × " + LOCALES.length + " langues");
}

/* ── 2. i18n des pages classiques : data/ui.json ───────────────────────────── */
console.log("i18n (data/ui.json)");
const UI = JSON.parse(lire("data/ui.json"));
{
  const toutes = new Set(); LOCALES.forEach((l) => Object.keys(UI[l] || {}).forEach((k) => toutes.add(k)));
  LOCALES.forEach((l) => {
    const manque = [...toutes].filter((k) => !UI[l] || UI[l][k] === undefined);
    if (manque.length) ko(l + " : " + manque.length + " clé(s) manquante(s) : " + manque.slice(0, 8).join(", "));
  });
  ok(toutes.size + " clés × " + LOCALES.length + " langues");
}

/* ── 3. Clés appelées par le code mais absentes partout ─────────────────────── */
console.log("clés fantômes");
{
  const fichiers = ["welcome.html", "quickgame.html", ...fs.readdirSync(path.join(ROOT, "js/suite")).map((f) => "js/suite/" + f), "js/challenge.js"]
    .filter(existe);
  const code = fichiers.map(lire).join("\n");
  const appelees = new Set(); let m;
  const re = /\b(?:t|tf|S\.t|S\.tf)\(\s*"([A-Za-z0-9_]+)"/g; while ((m = re.exec(code))) appelees.add(m[1]);
  const re2 = /data-i18n="([A-Za-z0-9_]+)"/g; while ((m = re2.exec(code))) appelees.add(m[1]);
  const connue = (k) => (I18N && I18N.fr && I18N.fr[k] !== undefined) || (UI.fr && UI.fr[k] !== undefined);
  const fantomes = [...appelees].filter((k) => !connue(k));
  if (fantomes.length) ko(fantomes.length + " clé(s) appelée(s) sans traduction : " + fantomes.join(", "));
  else ok(appelees.size + " clés appelées, toutes connues");
}

/* ── 4. data/all.js régénéré depuis data/*.json ? ──────────────────────────── */
console.log("data/all.js");
{
  const avant = fs.readFileSync(path.join(ROOT, "data/all.js"));
  try {
    execFileSync(process.execPath, [path.join(ROOT, "build-data.js")], { stdio: "ignore" });
    const apres = fs.readFileSync(path.join(ROOT, "data/all.js"));
    if (Buffer.compare(avant, apres) === 0) ok("à jour (identique à une régénération)");
    else { fs.writeFileSync(path.join(ROOT, "data/all.js"), avant); ko("PAS à jour : lancer `node build-data.js` (fichier restauré tel quel)"); }
  } catch (e) { fs.writeFileSync(path.join(ROOT, "data/all.js"), avant); ko("build-data.js a échoué : " + e.message); }
}

/* ── 5. ?v= identique sur toutes les pages ──────────────────────────────────── */
console.log("cache-busting ?v=");
{
  const vs = {};
  // seulement les feuilles de style et scripts : les images portent leur propre ?v=
  PAGES.forEach((p) => { const s = lire(p); let m; const re = /\.(?:css|js)\?v=(\d{8,})/g; while ((m = re.exec(s))) (vs[m[1]] = vs[m[1]] || new Set()).add(p); });
  const versions = Object.keys(vs);
  if (versions.length <= 1) ok("une seule valeur" + (versions[0] ? " : " + versions[0] : ""));
  else ko(versions.length + " valeurs différentes : " + versions.map((v) => v + " (" + [...vs[v]].join(", ") + ")").join(" | "));
}

/* ── 6. Scripts vendorisés : même integrity partout, et vraie ───────────────── */
console.log("vendor/ (SRI)");
{
  const tags = {};
  PAGES.forEach((p) => { const s = lire(p); let m; const re = /<script src="\/vendor\/([^"]+)"[^>]*integrity="([^"]+)"/g; while ((m = re.exec(s))) (tags[m[1]] = tags[m[1]] || new Set()).add(m[2]); });
  Object.keys(tags).forEach((f) => {
    const hs = [...tags[f]];
    if (!existe("vendor/" + f)) { ko("vendor/" + f + " absent"); return; }
    const reel = "sha384-" + crypto.createHash("sha384").update(fs.readFileSync(path.join(ROOT, "vendor", f))).digest("base64");
    if (hs.length !== 1) ko(f + " : " + hs.length + " integrity différents entre pages");
    else if (hs[0] !== reel) ko(f + " : integrity des pages ≠ empreinte du fichier");
    else ok(f + " : integrity identique partout et conforme au fichier");
  });
  const externes = PAGES.filter((p) => /<script src="https?:\/\//.test(lire(p)));
  if (externes.length) ko("script externe encore chargé par : " + externes.join(", "));
  else ok("aucun script tiers");
}

/* ── 7. Routes du Studio : shell.js ↔ _redirects ↔ sw.js ───────────────────── */
console.log("routes");
{
  const shell = lire("js/suite/shell.js");
  const m = /var PUB_SECTION = \{([^}]*)\}/.exec(shell);
  const sections = m ? [...m[1].matchAll(/:\s*"([a-z]+)"/g)].map((x) => x[1]) : [];
  const redir = lire("_redirects");
  const manqueR = sections.filter((s) => !new RegExp("^/" + s + "(\\s|/\\*)", "m").test(redir));
  if (manqueR.length) ko("_redirects ne réécrit pas : " + manqueR.map((s) => "/" + s).join(", ")); else ok(sections.length + " sections réécrites dans _redirects");
  const sw = existe("sw.js") ? lire("sw.js") : "";
  const manqueS = sections.filter((s) => sw && !new RegExp("\\b" + s + "\\b").test(sw));
  if (manqueS.length) ko("sw.js ne connaît pas : " + manqueS.join(", ")); else if (sw) ok("sw.js connaît les " + sections.length + " sections");
  const headers = lire("_headers");
  const manqueH = sections.filter((s) => !new RegExp("^/" + s + "(\\s*$|/\\*)", "m").test(headers));   // /collab n'existe que sous /collab/*
  if (manqueH.length) ko("_headers sans règle no-cache pour : " + manqueH.map((s) => "/" + s).join(", ")); else ok("_headers couvre les " + sections.length + " sections");
}

/* ── 8. PWA : manifest et icônes ───────────────────────────────────────────── */
console.log("PWA");
if (!existe("manifest.webmanifest")) ko("manifest.webmanifest absent");
else {
  try {
    const man = JSON.parse(lire("manifest.webmanifest"));
    const absentes = (man.icons || []).map((i) => i.src.replace(/^\//, "")).filter((p) => !existe(p));
    if (absentes.length) ko("icônes absentes : " + absentes.join(", ")); else ok((man.icons || []).length + " icônes présentes");
    const sansLien = PAGES.filter((p) => !/rel="manifest"/.test(lire(p)) && !/^(admin|index)\.html$/.test(p));
    if (sansLien.length) ko("pages sans <link rel=\"manifest\"> : " + sansLien.join(", ")); else ok("manifest lié sur toutes les pages publiques");
  } catch (e) { ko("manifest.webmanifest invalide : " + e.message); }
}

/* ── 9. Syntaxe des scripts ────────────────────────────────────────────────── */
console.log("syntaxe");
{
  const js = ["sw.js", "verify.js", "build-data.js", ...fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f),
    ...fs.readdirSync(path.join(ROOT, "js/suite")).map((f) => "js/suite/" + f)].filter(existe);
  let mauvais = 0;
  js.forEach((f) => { try { execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "ignore" }); } catch (e) { mauvais++; ko(f + " : erreur de syntaxe"); } });
  if (!mauvais) ok(js.length + " fichiers JS analysés");
  // scripts inline de admin.html
  const admin = lire("admin.html");
  const inl = [...admin.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  let bad = 0;
  inl.forEach((src, i) => { const tmp = path.join(require("os").tmpdir(), "acto-admin-inline-" + i + ".js"); fs.writeFileSync(tmp, src); try { execFileSync(process.execPath, ["--check", tmp], { stdio: "ignore" }); } catch (e) { bad++; ko("admin.html script inline #" + i + " : erreur de syntaxe"); } fs.unlinkSync(tmp); });
  if (!bad) ok("admin.html : " + inl.length + " script(s) inline OK");
}

console.log("\n" + (erreurs ? erreurs + " contrôle(s) en échec sur " + controles : controles + " contrôles OK"));
process.exit(erreurs ? 1 : 0);
