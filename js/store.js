/**
 * store.js — Data loading & persistence
 *
 * Loads locale JSON files and merges any user customizations stored
 * in localStorage. Single source of truth for the app's data.
 *
 * Best practices applied:
 *  - ES modules (native, no bundler needed)
 *  - Async/await with fetch
 *  - Graceful fallback if fetch is unavailable (e.g. file://)
 *  - Pub/sub via EventTarget for reactive UI updates
 */

const STORAGE_KEY = "impro-studio:overrides:v1";
const LOCALE_KEY  = "impro-studio:locale:v1";

/** Bundled fallback used when fetch fails (file:// protocol). */
const FALLBACK_URL_BASE = "./data/";

class DataStore extends EventTarget {
  /** @type {string} */
  #locale = "fr";
  /** @type {Object<string, any>} */
  #cache  = Object.create(null);   // raw JSON loaded from /data
  /** @type {Object<string, any>} */
  #overrides = Object.create(null); // user edits, merged on top
  /** @type {Object<string, any>} */
  #ui = Object.create(null);
  /** @type {Object<string, {name:string,flag:string}>} */
  #locales = Object.create(null);

  // --- public API ---

  get locale()   { return this.#locale; }
  get locales()  { return this.#locales; }
  get ui()       { return this.#ui[this.#locale] ?? this.#ui.fr ?? {}; }
  get data() {
    const base = this.#cache[this.#locale] ?? {};
    const over = this.#overrides[this.#locale];
    return over ? deepMerge(structuredClone(base), over) : base;
  }

  async init() {
    // Restore preferred locale
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved) this.#locale = saved;

    // Restore overrides
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.#overrides = JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to load overrides from localStorage:", e);
    }

    // Load metadata + UI strings
    [this.#locales, this.#ui] = await Promise.all([
      fetchJSON(FALLBACK_URL_BASE + "locales.json"),
      fetchJSON(FALLBACK_URL_BASE + "ui.json")
    ]);

    // Load the active locale + queue others lazily
    await this.loadLocale(this.#locale);
    queueMicrotask(() => {
      for (const code of Object.keys(this.#locales)) {
        if (code !== this.#locale) this.loadLocale(code).catch(() => {});
      }
    });
  }

  async loadLocale(code) {
    if (this.#cache[code]) return;
    try {
      this.#cache[code] = await fetchJSON(`${FALLBACK_URL_BASE}${code}.json`);
    } catch (e) {
      console.warn(`Could not load locale ${code}:`, e);
      this.#cache[code] = {}; // empty so app doesn't crash
    }
  }

  async setLocale(code) {
    if (!this.#locales[code]) return;
    this.#locale = code;
    localStorage.setItem(LOCALE_KEY, code);
    if (!this.#cache[code]) await this.loadLocale(code);
    this.#emit("change");
  }

  /** Replace the entire data tree for the active locale. */
  setLocaleData(newData) {
    this.#overrides[this.#locale] = newData;
    this.#persist();
    this.#emit("change");
  }

  /** Reset overrides for active locale (revert to bundled JSON). */
  resetLocale() {
    delete this.#overrides[this.#locale];
    this.#persist();
    this.#emit("change");
  }

  /** Reset all locales. */
  resetAll() {
    this.#overrides = Object.create(null);
    this.#persist();
    this.#emit("change");
  }

  /** Export current (merged) data as a JSON string. */
  exportLocale() {
    return JSON.stringify(this.data, null, 2);
  }

  /** Import JSON text into the active locale's overrides. */
  importLocale(jsonText) {
    const parsed = JSON.parse(jsonText); // throws on invalid JSON
    validateData(parsed);
    this.setLocaleData(parsed);
  }

  // --- private ---

  #persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#overrides));
  }

  #emit(type) {
    this.dispatchEvent(new CustomEvent(type));
  }
}

/** Fetch with proper error handling. */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Deep-merge `src` into `dst` (mutates `dst`). */
function deepMerge(dst, src) {
  if (!src || typeof src !== "object") return dst;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (Array.isArray(v))           dst[k] = v.slice();
    else if (v && typeof v === "object") dst[k] = deepMerge(dst[k] ?? {}, v);
    else                                  dst[k] = v;
  }
  return dst;
}

/** Sanity-check a data object before accepting it. */
function validateData(d) {
  const need = ["exercises", "constraints", "themes", "categories", "durations", "players"];
  for (const k of need) {
    if (!(k in d)) throw new Error(`Missing key: ${k}`);
  }
  for (const m of ["troupe", "match"]) {
    if (!d.exercises[m]) throw new Error(`Missing exercises.${m}`);
  }
}

export const store = new DataStore();
