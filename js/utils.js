/**
 * utils.js — Pure helpers shared across pages.
 *
 * Loaded as a classic script. Exposes window.actoUtils so non-module pages
 * (accounts1234.html) and scripts can reuse the same implementations
 * instead of redefining them inline.
 *
 * No DOM-mutating helpers here — keep this file side-effect-free.
 */
(function () {
  "use strict";

  /** HTML-escape an arbitrary value for safe innerHTML interpolation. */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /** Format a duration in seconds as "HhMMm", "MmSSs", or "SSs". */
  function fmtSec(s) {
    const n = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const ss = n % 60;
    if (h > 0) return h + "h" + String(m).padStart(2, "0") + "m";
    if (m > 0) return m + "m" + String(ss).padStart(2, "0") + "s";
    return ss + "s";
  }

  /** Format a timestamp as a localized short date+time, or "—" when invalid. */
  function fmtDate(s, locale) {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d)) return "—";
    return d.toLocaleString(locale || "fr-FR", { dateStyle: "short", timeStyle: "short" });
  }

  /** Compute integer age (years) from an ISO date-of-birth, or null when invalid. */
  function ageOf(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d)) return null;
    const today = new Date();
    let a = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
    return a;
  }

  /**
   * Race a promise against a timeout. The timeout reason carries `label`
   * so callers can identify which awaited operation stalled.
   */
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout: " + (label || "operation"))), ms))
    ]);
  }

  /** Validate an email with a simple shape check (server is the real authority). */
  function emailValid(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  }

  window.actoUtils = Object.freeze({
    escapeHtml, fmtSec, fmtDate, ageOf, withTimeout, emailValid
  });
})();
