/* ============================================================
   Impro Studio — App logic
   - Mode toggle (troupe / match)
   - Level selector
   - Theme input or random
   - Slot-machine animated reveal
   ============================================================ */

(() => {
  "use strict";

  const DATA = window.IMPRO_DATA;

  /* ----------------- State ----------------- */
  const state = {
    mode: "troupe",           // "troupe" | "match"
    level: "debutant",         // "debutant" | "confirme" | "expert"
    customThemes: [],          // user-supplied themes
    useCustom: false,          // true if textarea has content
  };

  /* ----------------- Helpers ----------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pick   = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sample = (arr, n) => {
    const copy = [...arr];
    const out = [];
    for (let i = 0; i < n && copy.length; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  };

  /* ----------------- Mode toggle ----------------- */
  const matchOnlyEls = () => $$(".match-only");

  const setMode = (mode) => {
    state.mode = mode;
    $$(".mode-btn").forEach((b) => {
      const isActive = b.dataset.mode === mode;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    matchOnlyEls().forEach((el) => {
      el.hidden = mode !== "match";
    });
  };

  $$(".mode-btn").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode))
  );

  /* ----------------- Level selector ----------------- */
  const setLevel = (lvl) => {
    state.level = lvl;
    $$(".level-btn").forEach((b) => {
      const isActive = b.dataset.level === lvl;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-checked", isActive ? "true" : "false");
    });
  };

  $$(".level-btn").forEach((b) =>
    b.addEventListener("click", () => setLevel(b.dataset.level))
  );

  /* ----------------- Themes input ----------------- */
  const themesInput = $("#themesInput");
  const themeStatus = $("#themeStatus");
  const useRandomBtn = $("#useRandomBtn");

  const updateThemeState = () => {
    const lines = themesInput.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    state.customThemes = lines;
    state.useCustom = lines.length > 0;
    themeStatus.textContent = state.useCustom
      ? `Mode : ${lines.length} thème${lines.length > 1 ? "s" : ""} personnel${lines.length > 1 ? "s" : ""}`
      : "Mode : aléatoire";
  };

  themesInput.addEventListener("input", updateThemeState);
  useRandomBtn.addEventListener("click", () => {
    themesInput.value = "";
    updateThemeState();
    themesInput.focus();
  });

  /* ----------------- Generate ----------------- */
  const generateBtn = $("#generateBtn");
  const rerollBar = $("#rerollBar");

  /**
   * Pick a fresh value for a given target based on current state.
   * @returns {{value: string, meta?: string}}
   */
  const pickFor = (target) => {
    const { mode, level } = state;
    switch (target) {
      case "exercise": {
        const ex = pick(DATA.exercises[mode][level]);
        return { value: ex.name, meta: ex.desc };
      }
      case "constraint": {
        return { value: pick(DATA.constraints[mode][level]) };
      }
      case "theme": {
        const pool = state.useCustom ? state.customThemes : DATA.themes[level];
        return { value: pick(pool) };
      }
      case "category": {
        const cat = pick(DATA.categories);
        return { value: cat.name, meta: cat.desc };
      }
      case "duration": {
        return { value: pick(DATA.durations[level]) };
      }
      case "players": {
        return { value: pick(DATA.players[level]) };
      }
    }
    return { value: "—" };
  };

  /**
   * Build a "spin pool" - pad results with random distractors so
   * the reel can scroll convincingly before settling.
   */
  const buildSpinPool = (target, finalValue) => {
    const { mode, level } = state;
    let pool = [];
    switch (target) {
      case "exercise":   pool = DATA.exercises[mode][level].map((e) => e.name); break;
      case "constraint": pool = DATA.constraints[mode][level]; break;
      case "theme":      pool = state.useCustom ? state.customThemes : DATA.themes[level]; break;
      case "category":   pool = DATA.categories.map((c) => c.name); break;
      case "duration":   pool = DATA.durations[level]; break;
      case "players":    pool = DATA.players[level]; break;
    }
    // Always at least 6 distractors before final
    const distractors = sample(pool.filter((p) => p !== finalValue), Math.min(8, pool.length));
    while (distractors.length < 6) distractors.push(pick(pool));
    return [...distractors, finalValue];
  };

  /**
   * Animate a single reel: scroll through items, then settle on final.
   * Returns a Promise that resolves once settled.
   */
  const spinReel = (target, delay = 0) => {
    return new Promise((resolve) => {
      const reelEl   = $(`.reel[data-target="${target}"]`);
      const trackEl  = $(`#reel-${target}`);
      const cardEl   = $(`#card-${target}`);
      const metaEl   = $(`#meta-${target}`);

      const result   = pickFor(target);
      const items    = buildSpinPool(target, result.value);

      // Build track HTML
      trackEl.innerHTML = items
        .map((item, i) => {
          const isFinal = i === items.length - 1;
          return `<div class="reel-item${isFinal ? " final" : ""}">${escapeHtml(item)}</div>`;
        })
        .join("");

      reelEl.classList.remove("settled");

      setTimeout(() => {
        // Step 1: spinning blur
        reelEl.classList.add("spinning");
        // Reset position
        trackEl.style.transition = "none";
        trackEl.style.transform = "translateY(0)";

        const itemHeight = 4.5 * 16; // 4.5rem in px (matches CSS)
        const targetIndex = items.length - 1;
        const totalDistance = targetIndex * itemHeight;

        // Step 2: after a short blur period, animate scroll to final
        const spinDuration = 550 + Math.random() * 150; // ms of blur
        setTimeout(() => {
          reelEl.classList.remove("spinning");
          // Animate scroll
          const settleDuration = 900 + Math.random() * 300;
          trackEl.style.transition = `transform ${settleDuration}ms cubic-bezier(0.15, 0.85, 0.25, 1)`;
          // Force reflow
          // eslint-disable-next-line no-unused-expressions
          trackEl.offsetHeight;
          trackEl.style.transform = `translateY(-${totalDistance}px)`;

          // Step 3: settle
          setTimeout(() => {
            reelEl.classList.add("settled");
            cardEl.classList.add("revealed");
            if (metaEl) metaEl.textContent = result.meta || "";
            sparkleBurst(cardEl);
            resolve(result);
          }, settleDuration + 30);
        }, spinDuration);
      }, delay);
    });
  };

  /**
   * Generate everything in sequence with staggered animations.
   */
  const generateAll = async () => {
    if (generateBtn.disabled) return;

    // Validate themes
    if (state.useCustom && state.customThemes.length === 0) {
      themesInput.focus();
      return;
    }

    generateBtn.disabled = true;
    rerollBar.hidden = false;

    // Reset all card revealed state
    $$(".card").forEach((c) => {
      c.classList.remove("revealed");
      c.classList.add("appearing");
    });
    setTimeout(() => $$(".card").forEach((c) => c.classList.remove("appearing")), 600);

    // Determine targets in display order
    const targets = state.mode === "match"
      ? ["category", "exercise", "constraint", "theme", "duration", "players"]
      : ["exercise", "constraint", "theme"];

    // Stagger spin starts
    const promises = targets.map((t, i) => spinReel(t, i * 220));
    await Promise.all(promises);

    generateBtn.disabled = false;
  };

  generateBtn.addEventListener("click", generateAll);

  /* ----------------- Re-roll individual ----------------- */
  $$(".reroll-btn").forEach((b) => {
    b.addEventListener("click", async () => {
      const target = b.dataset.reroll;
      b.disabled = true;
      await spinReel(target, 0);
      b.disabled = false;
    });
  });

  /* ----------------- Sparkle burst on reveal ----------------- */
  const SPARKLES = ["✨", "⭐", "🎭", "💫", "🌟"];

  const sparkleBurst = (cardEl) => {
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
  };

  /* ----------------- Utilities ----------------- */
  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  /* ----------------- Sources list ----------------- */
  const sourcesList = $("#sourcesList");
  if (sourcesList && Array.isArray(window.IMPRO_SOURCES)) {
    sourcesList.innerHTML = window.IMPRO_SOURCES
      .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a></li>`)
      .join("");
  }

  /* ----------------- Init ----------------- */
  setMode("troupe");
  setLevel("debutant");
  updateThemeState();

  // Keyboard: Enter on textarea + Cmd/Ctrl triggers generate
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      generateAll();
    }
  });
})();
