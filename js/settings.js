/**
 * settings.js — Settings dialog logic
 *
 * Visualize and edit the data lists (exercises, constraints, themes,
 * categories) directly inside the page. Edits are persisted in
 * localStorage. Users can also import/export the JSON.
 *
 * Built on the native <dialog> element with a custom "category panel"
 * editor — one textarea per JSON branch, validated on save.
 */

import { store } from "./store.js";

let dialogEl, langSelect, editorList, statusEl, importInput;

export function initSettings() {
  dialogEl   = document.getElementById("settingsDialog");
  langSelect = document.getElementById("langSelect");
  editorList = document.getElementById("editorList");
  statusEl   = document.getElementById("settingsStatus");
  importInput = document.getElementById("importJsonFile");

  // Open
  document.getElementById("settingsBtn").addEventListener("click", openDialog);
  // Close
  document.getElementById("settingsClose").addEventListener("click", () => dialogEl.close());
  // Click on backdrop closes
  dialogEl.addEventListener("click", (e) => {
    if (e.target === dialogEl) dialogEl.close();
  });

  // Language change → store.setLocale
  langSelect.addEventListener("change", () => store.setLocale(langSelect.value));

  // Save / Reset / Export / Import
  document.getElementById("saveBtn").addEventListener("click", saveAll);
  document.getElementById("resetBtn").addEventListener("click", resetCurrentLocale);
  document.getElementById("exportBtn").addEventListener("click", exportCurrent);
  document.getElementById("importBtn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", importFromFile);

  // Re-render when locale or data changes
  store.addEventListener("change", () => {
    if (dialogEl.open) renderEditor();
  });
}

function openDialog() {
  // Refill language picker
  langSelect.innerHTML = "";
  for (const [code, meta] of Object.entries(store.locales)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${meta.flag} ${meta.name}`;
    if (code === store.locale) opt.selected = true;
    langSelect.appendChild(opt);
  }
  renderEditor();
  setStatus("");
  dialogEl.showModal();
}

/** Render the editable JSON tree as one textarea per top-level branch. */
function renderEditor() {
  const data = store.data;
  editorList.innerHTML = "";

  const branches = [
    { key: "exercises.troupe.debutant", label: "🎬 Exercices · Troupe · Débutant",  arr: data?.exercises?.troupe?.debutant },
    { key: "exercises.troupe.confirme", label: "🎬 Exercices · Troupe · Confirmé",  arr: data?.exercises?.troupe?.confirme },
    { key: "exercises.troupe.expert",   label: "🎬 Exercices · Troupe · Expert",    arr: data?.exercises?.troupe?.expert },
    { key: "exercises.match.debutant",  label: "⚔️ Exercices · Match · Débutant",   arr: data?.exercises?.match?.debutant },
    { key: "exercises.match.confirme",  label: "⚔️ Exercices · Match · Confirmé",   arr: data?.exercises?.match?.confirme },
    { key: "exercises.match.expert",    label: "⚔️ Exercices · Match · Expert",     arr: data?.exercises?.match?.expert },
    { key: "constraints.troupe.debutant", label: "🔒 Contraintes · Troupe · Débutant", arr: data?.constraints?.troupe?.debutant },
    { key: "constraints.troupe.confirme", label: "🔒 Contraintes · Troupe · Confirmé", arr: data?.constraints?.troupe?.confirme },
    { key: "constraints.troupe.expert",   label: "🔒 Contraintes · Troupe · Expert",   arr: data?.constraints?.troupe?.expert },
    { key: "constraints.match.debutant",  label: "🔒 Contraintes · Match · Débutant",  arr: data?.constraints?.match?.debutant },
    { key: "constraints.match.confirme",  label: "🔒 Contraintes · Match · Confirmé",  arr: data?.constraints?.match?.confirme },
    { key: "constraints.match.expert",    label: "🔒 Contraintes · Match · Expert",    arr: data?.constraints?.match?.expert },
    { key: "themes.debutant",  label: "💭 Thèmes · Débutant",  arr: data?.themes?.debutant },
    { key: "themes.confirme",  label: "💭 Thèmes · Confirmé",  arr: data?.themes?.confirme },
    { key: "themes.expert",    label: "💭 Thèmes · Expert",    arr: data?.themes?.expert },
    { key: "categories",       label: "🎯 Catégories (match)", arr: data?.categories }
  ];

  for (const b of branches) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${b.label}  (${b.arr?.length ?? 0})`;
    details.appendChild(summary);

    const ta = document.createElement("textarea");
    ta.dataset.key = b.key;
    ta.spellcheck = false;
    ta.value = JSON.stringify(b.arr ?? [], null, 2);
    ta.rows = Math.min(20, (b.arr?.length ?? 0) + 2);
    details.appendChild(ta);

    editorList.appendChild(details);
  }
}

function setNestedKey(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Collect every textarea, parse JSON, save to store. */
function saveAll() {
  try {
    const next = structuredClone(store.data);
    for (const ta of editorList.querySelectorAll("textarea[data-key]")) {
      const parsed = JSON.parse(ta.value);
      if (!Array.isArray(parsed)) {
        throw new Error(`${ta.dataset.key} doit être un tableau JSON`);
      }
      setNestedKey(next, ta.dataset.key, parsed);
    }
    store.setLocaleData(next);
    setStatus("✅ Modifications enregistrées (localStorage).");
  } catch (e) {
    setStatus(`❌ ${e.message}`, true);
  }
}

function resetCurrentLocale() {
  if (!confirm("Réinitialiser cette langue aux valeurs par défaut ?")) return;
  store.resetLocale();
  renderEditor();
  setStatus("↩️ Réinitialisé.");
}

function exportCurrent() {
  const blob = new Blob([store.exportLocale()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `impro-studio-${store.locale}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`💾 Téléchargé : impro-studio-${store.locale}.json`);
}

async function importFromFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    store.importLocale(text);
    renderEditor();
    setStatus(`📥 Importé : ${file.name}`);
  } catch (err) {
    setStatus(`❌ Import invalide : ${err.message}`, true);
  } finally {
    e.target.value = ""; // allow re-uploading the same file
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.dataset.kind = isError ? "error" : "ok";
}
