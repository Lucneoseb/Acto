/**
 * build-data.js — Regenerate data/all.js from the JSON files.
 *
 * Run after editing any file in data/ :
 *     node build-data.js
 *
 * data/all.js is what the page actually loads (so it works on file://
 * without a server). The JSON files are the source of truth and are
 * the easiest format for editing.
 *
 * ── Découpage par langue (2026-09-08) ──────────────────────────────────────
 * Mesuré : data/all.js pèse 85 Ko compressés dont 72 pour six langues que le
 * visiteur ne lira jamais. On génère donc AUSSI un fichier par langue :
 *
 *   data/all-<code>.js  →  window.IMPRO_BUNDLE = { locales (toutes), ui: {code},
 *                          data: {code} }   — ou fusionné dans un bundle déjà là.
 *
 * `locales` reste complet partout : c'est le sélecteur de langue (nom + drapeau),
 * quelques centaines d'octets.
 *
 * data/all.js entier reste généré : les pages classiques (quickgame, warmups…)
 * le chargent toujours, et il sert de filet si un fichier par langue manque.
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

const locales = readJSON("locales.json");
const ui      = readJSON("ui.json");
const data    = {};

for (const code of Object.keys(locales)) {
  const file = `${code}.json`;
  if (!fs.existsSync(path.join(DATA_DIR, file))) {
    console.warn(`! ${file} is missing — locale ${code} will be empty.`);
    data[code] = {};
    continue;
  }
  data[code] = readJSON(file);
}

const bundle = { locales, ui, data };
const js = `/* AUTO-GENERATED from data/*.json — run \`node build-data.js\` after edits. */
window.IMPRO_BUNDLE = ${JSON.stringify(bundle, null, 2)};
`;

const outFile = path.join(DATA_DIR, "all.js");
fs.writeFileSync(outFile, js);
console.log(`✓ Wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
console.log(`  ${Object.keys(locales).length} locales, ${Object.keys(data).length} data files merged.`);

/* ── un fichier par langue ─────────────────────────────────────────────────
   Chacun FUSIONNE dans le bundle existant plutôt que de l'écraser : la page
   charge le français d'abord (repli obligatoire de t()), puis la langue de
   l'utilisateur par-dessus. L'ordre de chargement n'a donc pas d'importance. */
let totalLang = 0;
for (const code of Object.keys(locales)) {
  const part = { locales, ui: { [code]: ui[code] || {} }, data: { [code]: data[code] || {} } };
  const src = `/* AUTO-GENERATED — langue « ${code} ». Voir build-data.js. */
(function () {
  var B = window.IMPRO_BUNDLE;
  var P = ${JSON.stringify(part)};
  if (!B) { window.IMPRO_BUNDLE = P; return; }
  B.locales = B.locales || {};
  for (var k in P.locales) if (P.locales.hasOwnProperty(k)) B.locales[k] = P.locales[k];
  B.ui = B.ui || {};   for (var a in P.ui)   if (P.ui.hasOwnProperty(a))   B.ui[a]   = P.ui[a];
  B.data = B.data || {}; for (var b in P.data) if (P.data.hasOwnProperty(b)) B.data[b] = P.data[b];
})();
`;
  const f = path.join(DATA_DIR, `all-${code}.js`);
  fs.writeFileSync(f, src);
  totalLang += fs.statSync(f).size;
}
console.log(`✓ Wrote ${Object.keys(locales).length} per-locale bundles (data/all-<code>.js, ${(totalLang / 1024).toFixed(1)} KB total)`);

/* ── i18n du Studio, découpé par langue ────────────────────────────────────
   js/suite/i18n.js est écrit à la main (FR fait foi) et pèse 55 Ko compressés
   pour sept langues. On en tire un fichier par langue, sur le même principe de
   fusion que les données : la page charge le français — repli obligatoire de
   t() — puis la langue de l'utilisateur par-dessus.

   Le fichier complet reste généré-tel-quel : quickgame.html et les pages
   classiques le chargent encore, et il sert de filet. */
{
  const src = fs.readFileSync(path.join(__dirname, "js", "suite", "i18n.js"), "utf8");
  const box = {};
  new Function("window", src)(box);
  const I = box.ACTO_SUITE_I18N;
  if (!I) {
    console.warn("! i18n.js n'expose pas ACTO_SUITE_I18N — fichiers par langue non générés");
  } else {
    let n = 0, octets = 0;
    for (const code of Object.keys(I)) {
      const out = `/* AUTO-GENERATED — i18n « ${code} ». Voir build-data.js. */
(function () {
  var T = window.ACTO_SUITE_I18N || (window.ACTO_SUITE_I18N = {});
  T[${JSON.stringify(code)}] = ${JSON.stringify(I[code])};
})();
`;
      const f = path.join(__dirname, "js", "suite", `i18n-${code}.js`);
      fs.writeFileSync(f, out);
      n++; octets += fs.statSync(f).size;
    }
    console.log(`✓ Wrote ${n} per-locale i18n files (js/suite/i18n-<code>.js, ${(octets / 1024).toFixed(1)} KB total)`);
  }
}
