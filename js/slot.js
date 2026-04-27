/**
 * slot.js — Slot-machine reel animation
 *
 * Pure presentation logic, no data coupling. Given a target element
 * and a list of items ending with the final value, animates a spin.
 */

const ITEM_HEIGHT_REM = 4.5;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

const SPARKLES = ["✨", "⭐", "🎭", "💫", "🌟"];

/**
 * Spin a single reel. The final item must be the last one in `items`.
 * @returns {Promise<void>} resolves once settled animation completes
 */
export function spinReel({ reelEl, trackEl, cardEl, metaEl, items, meta = "", delay = 0 }) {
  return new Promise((resolve) => {
    trackEl.innerHTML = items
      .map((it, i) => `<div class="reel-item${i === items.length - 1 ? " final" : ""}">${escapeHtml(it)}</div>`)
      .join("");

    reelEl.classList.remove("settled");

    setTimeout(() => {
      reelEl.classList.add("spinning");
      trackEl.style.transition = "none";
      trackEl.style.transform = "translateY(0)";

      const px = ITEM_HEIGHT_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const total = (items.length - 1) * px;

      const spinMs = 550 + Math.random() * 150;
      setTimeout(() => {
        reelEl.classList.remove("spinning");
        const settleMs = 900 + Math.random() * 300;
        trackEl.style.transition = `transform ${settleMs}ms cubic-bezier(.15,.85,.25,1)`;
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        trackEl.offsetHeight;
        trackEl.style.transform = `translateY(-${total}px)`;

        setTimeout(() => {
          reelEl.classList.add("settled");
          cardEl.classList.add("revealed");
          if (metaEl) metaEl.textContent = meta || "";
          burst(cardEl);
          resolve();
        }, settleMs + 30);
      }, spinMs);
    }, delay);
  });
}

function burst(cardEl) {
  const rect = cardEl.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  for (let i = 0; i < 6; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    s.textContent = SPARKLES[Math.floor(Math.random() * SPARKLES.length)];
    const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
    const dist = 50 + Math.random() * 50;
    s.style.left = `${cx}px`;
    s.style.top  = `${cy}px`;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    cardEl.appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }
}

/** Build a "spin pool" — pad final value with random distractors for the scroll. */
export function buildSpinPool(pool, finalValue) {
  const arr = pool.filter((p) => p !== finalValue);
  const distractors = sample(arr, Math.min(8, arr.length));
  while (distractors.length < 6) distractors.push(pool[Math.floor(Math.random() * pool.length)]);
  return [...distractors, finalValue];
}

function sample(arr, n) {
  const c = arr.slice();
  const out = [];
  for (let i = 0; i < n && c.length; i++) {
    out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  }
  return out;
}
