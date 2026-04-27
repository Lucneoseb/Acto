/**
 * build-data.js — Regenerate data/all.js from the JSON files.
 *
 * Run after editing any file in data/ :
 *     node build-data.js
 *
 * data/all.js is what the page actually loads (so it works on file://
 * without a server). The JSON files are the source of truth and are
 * the easiest format for editing.
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
