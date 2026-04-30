/**
 * auth.js — Supabase email/password authentication for Acto.
 *
 * Loads BEFORE js/app.js. The existing app boot is gated behind a successful
 * sign-in: when no user is authenticated, the app's <main id="mainApp">
 * stays hidden and the auth screen is shown instead.
 *
 * Project URL + publishable key are public-by-design (browser code).
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
     0. CONFIG
     ------------------------------------------------------------------ */
  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase SDK missing — make sure the CDN <script> is loaded BEFORE auth.js.");
    return;
  }
  if (!window.actoConfig || !window.actoUtils) {
    console.error("actoConfig/actoUtils missing — make sure js/config.js and js/utils.js are loaded BEFORE auth.js.");
    return;
  }

  const { supabase: SB_CFG, site: SITE } = window.actoConfig;
  const { emailValid, withTimeout } = window.actoUtils;

  // PKCE flow is the default and the right choice for email/password auth.
  // Don't override with "implicit" — that's an OAuth-only flow and combined
  // with detectSessionInUrl it makes refreshes flaky.
  const sb = window.supabase.createClient(SB_CFG.url, SB_CFG.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  // Export so app.js (or anything else) can reuse it
  window.actoSupabase = sb;
  window.actoAuth = { state: { user: null, profile: null } };

  /* ------------------------------------------------------------------
     1. UTILS
     ------------------------------------------------------------------ */
  const $  = (id) => document.getElementById(id);
  const ui = () => (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui[localStorage.getItem("impro-studio:locale:v1") || "fr"]) || {};
  function setText(id, v) {
    const el = $(id);
    if (el && v != null) el.textContent = v;
  }
  function showError(id, msg) {
    const el = $(id);
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.textContent = msg;
    el.hidden = false;
  }
  function ageFromDob(dob) {
    if (!dob) return NaN;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return NaN;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  }
  function fmt(template, vars) {
    return String(template || "").replace(/\{(\w+)\}/g, (_, k) =>
      (vars && vars[k] != null) ? vars[k] : "");
  }

  /* ------------------------------------------------------------------
     2. UI APPLY-TRANSLATIONS (auth-specific bits)
        We patch into the existing applyTranslations flow by exposing
        a function that app.js can call, AND by reacting to locale change.
     ------------------------------------------------------------------ */
  function applyAuthTranslations() {
    const t = ui();
    setText("authLoginTitle",          t.authLoginTitle);
    setText("authEmailLabel",          t.authEmail);
    setText("authPasswordLabel",       t.authPassword);
    setText("authLoginSubmitBtn",      t.authLoginBtn);
    setText("authForgotBtn",           t.authForgotPassword);
    setText("authNoAccountText",       t.authNoAccount);
    setText("authOpenSignupBtn",       t.authCreateAccount);
    setText("authPendingTitle",        t.authPendingTitle);
    setText("authResendBtn",           t.authResendEmail);
    setText("authBackToLoginBtn",      t.authBackToLogin);
    setText("authSignupTitle",         t.authSignupTitle);
    setText("authSignupPrenomLabel",   t.authPrenom);
    setText("authSignupNomLabel",      t.authNom);
    setText("authSignupDobLabel",      t.authDob);
    const dobD = $("authSignupDobDay");   if (dobD) dobD.placeholder = t.authDobDay   || "JJ";
    const dobM = $("authSignupDobMonth"); if (dobM) dobM.placeholder = t.authDobMonth || "MM";
    const dobY = $("authSignupDobYear");  if (dobY) dobY.placeholder = t.authDobYear  || "AAAA";
    setText("authSignupEmailLabel",    t.authEmail);
    setText("authSignupPasswordLabel", t.authPassword);
    setText("authSignupConfirmLabel",  t.authConfirmPassword);
    setText("authSignupSubmitBtn",     t.authSignupSubmit);
    setText("authAccountTitle",        t.authAccountSection);
    setText("authLogoutBtn",           t.authLogout);
    setText("authOpenDeleteBtn",       t.authDeleteAccount);
    setText("authDeleteTitle",         t.authDeleteAccount);
    setText("authDeleteConfirmMsg",    t.authDeleteConfirm);
    setText("authDeleteCancelBtn",     t.authDeleteCancel);
    setText("authDeleteConfirmBtn",    t.authDeleteConfirmBtn);
    const di = $("authDeleteInput");
    if (di) di.placeholder = t.authDeleteWord || "DELETE";
    refreshAccountInfo();
    refreshPendingMsg();
  }
  window.actoAuth.applyTranslations = applyAuthTranslations;

  function refreshAccountInfo() {
    const u = window.actoAuth.state.user;
    const t = ui();
    if (u) setText("authAccountInfo", fmt(t.authAccountInfo, { email: u.email }));
  }
  function refreshPendingMsg() {
    const t = ui();
    const email = window.actoAuth.state.pendingEmail || "";
    if (email) setText("authPendingMsg", fmt(t.authPendingMsg, { email }));
  }

  /* ------------------------------------------------------------------
     3. SCREEN STATE
     ------------------------------------------------------------------ */
  function showAuthScreen() {
    const main = $("mainApp"); if (main) main.hidden = true;
    const scr  = $("authScreen"); if (scr)  scr.hidden = false;
    const card = $("authPendingCard"); if (card) card.hidden = true;
    const form = $("authLoginForm"); if (form) form.parentElement.hidden = false;
    // Account actions (logout / delete account) only make sense when signed in.
    const accSec = $("authAccountSection"); if (accSec) accSec.hidden = true;
  }
  function showPendingScreen(email) {
    window.actoAuth.state.pendingEmail = email;
    const main = $("mainApp"); if (main) main.hidden = true;
    const scr  = $("authScreen"); if (scr)  scr.hidden = false;
    const loginCard = document.querySelector("#authScreen .auth-card:not(.auth-pending)");
    if (loginCard) loginCard.hidden = true;
    const card = $("authPendingCard"); if (card) card.hidden = false;
    refreshPendingMsg();
  }
  function showApp(user) {
    window.actoAuth.state.user = user;
    const main = $("mainApp"); if (main) main.hidden = false;
    const scr  = $("authScreen"); if (scr)  scr.hidden = true;
    const accSec = $("authAccountSection"); if (accSec) accSec.hidden = false;
    refreshAccountInfo();
  }

  /* ------------------------------------------------------------------
     4. SIGN-UP FLOW
     ------------------------------------------------------------------ */
  async function signUp() {
    const t = ui();
    const email   = $("authSignupEmail").value.trim();
    const pass    = $("authSignupPassword").value;
    const confirm = $("authSignupConfirm").value;
    const prenom  = $("authSignupPrenom").value.trim();
    const nom     = $("authSignupNom").value.trim();

    // DOB is now three numeric fields (day / month / year). Combine them into
    // an ISO YYYY-MM-DD string and check the calendar date is real (e.g. so
    // 31/02/1990 doesn't sneak through as 02/03/1990 via Date()'s rollover).
    const dayStr   = $("authSignupDobDay").value.trim();
    const monthStr = $("authSignupDobMonth").value.trim();
    const yearStr  = $("authSignupDobYear").value.trim();
    const day   = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year  = parseInt(yearStr, 10);
    let dob = "";
    let dobValid = false;
    if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)
        && yearStr.length === 4
        && day   >= 1 && day   <= 31
        && month >= 1 && month <= 12
        && year  >= 1900) {
      const probe = new Date(year, month - 1, day);
      dobValid = probe.getFullYear() === year
              && probe.getMonth() === month - 1
              && probe.getDate() === day;
      if (dobValid) {
        dob = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      }
    }

    if (!email || !pass || !confirm || !prenom || !nom || !dayStr || !monthStr || !yearStr) {
      return showError("authSignupError", t.authErrorRequired);
    }
    if (!emailValid(email)) return showError("authSignupError", t.authErrorEmailFormat);
    if (pass.length < 8)    return showError("authSignupError", t.authErrorPasswordShort);
    if (pass !== confirm)   return showError("authSignupError", t.authErrorPasswordMismatch);
    if (!dobValid)          return showError("authSignupError", t.authErrorDobInvalid);
    const age = ageFromDob(dob);
    if (isNaN(age))         return showError("authSignupError", t.authErrorDobInvalid);
    if (age < 13)           return showError("authSignupError", t.authErrorDobYoung);

    showError("authSignupError", "");
    const btn = $("authSignupSubmitBtn");
    if (btn) btn.disabled = true;
    try {
      const { data, error } = await sb.auth.signUp({
        email, password: pass,
        options: {
          data: { prenom, nom, date_naissance: dob },
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
      // Success — close dialog, show pending screen
      const dlg = $("signupDialog");
      if (dlg && dlg.open) dlg.close();
      showPendingScreen(email);
      // Try to insert profile row immediately (RLS allows once auth.uid() = id;
      // for confirm-flow we'll re-insert on first login via ensureProfile()).
      if (data && data.user) {
        try {
          await sb.from("profiles").insert({
            id: data.user.id,
            email,
            prenom, nom,
            date_naissance: dob
          });
        } catch (e) { /* will retry after confirmation */ }
      }
    } catch (e) {
      console.error("signup error", e);
      showError("authSignupError", e.message || String(e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------
     5. LOGIN FLOW
     ------------------------------------------------------------------ */
  async function login(ev) {
    if (ev) ev.preventDefault();
    const t = ui();
    const email = $("authLoginEmail").value.trim();
    const pass  = $("authLoginPassword").value;
    if (!email || !pass) return showError("authLoginError", t.authErrorRequired);
    if (!emailValid(email)) return showError("authLoginError", t.authErrorEmailFormat);
    showError("authLoginError", "");
    const btn = $("authLoginSubmitBtn");
    if (btn) btn.disabled = true;
    try {
      const { error } = await withTimeout(
        sb.auth.signInWithPassword({ email, password: pass }),
        10000,
        "network-timeout"
      );
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("not confirm") || msg.includes("confirm")) {
          showError("authLoginError", t.authErrorEmailNotConfirmed);
        } else if (msg.includes("invalid") || msg.includes("credential")) {
          showError("authLoginError", t.authErrorInvalidCredentials);
        } else {
          showError("authLoginError", error.message);
        }
      }
      // onAuthStateChange handles the rest on success
    } catch (e) {
      const raw = e && e.message ? String(e.message) : String(e);
      if (raw.startsWith("timeout:")) {
        // Login hung — most often caused by a stale local session blocking
        // the SDK. Wipe it so the next attempt starts clean.
        await clearStaleLocalSession();
        showError("authLoginError",
          "Délai d'attente dépassé. La session locale a été réinitialisée — réessaie.");
      } else {
        showError("authLoginError", raw);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function resendConfirmation() {
    const t = ui();
    const email = window.actoAuth.state.pendingEmail;
    if (!email) return;
    showError("authPendingError", "");
    try {
      const { error } = await sb.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      showError("authPendingError", t.authResetSent || "Email sent");
      const el = $("authPendingError");
      if (el) {
        el.hidden = false;
        el.style.color = "var(--gold-soft, #fde08a)";
      }
    } catch (e) {
      showError("authPendingError", e.message || String(e));
    }
  }

  async function forgotPassword() {
    const t = ui();
    const email = $("authLoginEmail").value.trim();
    if (!email || !emailValid(email)) {
      return showError("authLoginError", t.authErrorEmailFormat);
    }
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      showError("authLoginError", t.authResetSent);
      const el = $("authLoginError");
      if (el) el.style.color = "var(--gold-soft, #fde08a)";
    } catch (e) {
      showError("authLoginError", e.message || String(e));
    }
  }

  /* ------------------------------------------------------------------
     6. PROFILE
     ------------------------------------------------------------------ */
  /**
   * Look up (or create) the profile row for a freshly-authenticated user
   * and stash it on window.actoAuth.state.profile. Wrapped in timeouts so
   * it can never block the UI if the database is slow or RLS is misconfigured.
   * Always resolves — failures are logged, not thrown.
   */
  async function ensureProfile(user) {
    if (!user) return;
    try {
      const { data: existing } = await withTimeout(
        sb.from("profiles").select("id").eq("id", user.id).maybeSingle(),
        6000, "profile-lookup"
      );
      if (!existing) {
        const meta = user.user_metadata || {};
        await withTimeout(
          sb.from("profiles").insert({
            id: user.id,
            email: user.email,
            prenom: meta.prenom || "",
            nom: meta.nom || "",
            date_naissance: meta.date_naissance || null
          }),
          6000, "profile-insert"
        );
      }
      const { data: profile } = await withTimeout(
        sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        6000, "profile-fetch"
      );
      window.actoAuth.state.profile = profile || null;
    } catch (e) {
      console.warn("[auth] ensureProfile failed (UI not blocked):", e && e.message ? e.message : e);
    }
  }

  /* ------------------------------------------------------------------
     7. LOGOUT + ACCOUNT DELETE
     ------------------------------------------------------------------ */
  async function logout() {
    // Close the settings dialog up front so the UI doesn't linger over the
    // login screen after sign-out.
    const dlg = $("settingsDialog"); if (dlg && dlg.open) dlg.close();
    try { await sb.auth.signOut(); } catch (e) { console.warn(e); }
    window.actoAuth.state.user = null;
    window.actoAuth.state.profile = null;
    showAuthScreen();
  }

  async function deleteAccount() {
    const t = ui();
    const inp = $("authDeleteInput");
    const expected = (t.authDeleteWord || "DELETE").trim().toUpperCase();
    const typed    = inp ? (inp.value || "").trim().toUpperCase() : "";
    if (!inp || typed !== expected) {
      return showError("authDeleteError", t.authDeleteConfirm || "Confirmation required");
    }
    showError("authDeleteError", "");
    const btn = $("authDeleteConfirmBtn");
    if (btn) btn.disabled = true;
    try {
      const { data, error } = await sb.rpc("delete_my_account");
      if (error) {
        console.error("delete_my_account RPC error:", error);
        // Common case: RPC missing → guide the user to the SQL setup
        if (/function .*delete_my_account.* does not exist/i.test(error.message || "")) {
          throw new Error("La fonction delete_my_account n'existe pas — exécute le SQL setup dans Supabase.");
        }
        throw error;
      }
      console.log("delete_my_account result:", data);
      try { await sb.auth.signOut(); } catch (e) {}
      const dlg = $("deleteAccountDialog");
      if (dlg && dlg.open) dlg.close();
      window.actoAuth.state.user = null;
      window.actoAuth.state.profile = null;
      showAuthScreen();
      // Force a page reload so any cached client session is cleared
      setTimeout(() => { try { window.location.reload(); } catch (e) {} }, 300);
    } catch (e) {
      console.error("deleteAccount failed:", e);
      const msg = (e && e.message) ? e.message : String(e);
      showError("authDeleteError", msg);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------
     8. WIRING
     ------------------------------------------------------------------ */
  function wireUp() {
    const loginForm = $("authLoginForm");
    if (loginForm) loginForm.addEventListener("submit", login);

    const forgot = $("authForgotBtn");
    if (forgot) forgot.addEventListener("click", forgotPassword);

    const openSignup = $("authOpenSignupBtn");
    const signupDlg  = $("signupDialog");
    if (openSignup && signupDlg) {
      openSignup.addEventListener("click", () => {
        showError("authSignupError", "");
        if (typeof signupDlg.showModal === "function") signupDlg.showModal();
        else signupDlg.setAttribute("open", "");
      });
    }
    const closeSignup = $("authSignupCloseBtn");
    if (closeSignup && signupDlg) closeSignup.addEventListener("click", () => signupDlg.close());

    const signupForm = $("authSignupForm");
    if (signupForm) signupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      signUp();
    });

    // DOB triplet UX:
    //   - strip non-digits as the user types
    //   - jump focus to the next field once the current one is full
    const dobDay   = $("authSignupDobDay");
    const dobMonth = $("authSignupDobMonth");
    const dobYear  = $("authSignupDobYear");
    function wireDobField(el, maxLen, nextEl) {
      if (!el) return;
      el.addEventListener("input", () => {
        const cleaned = el.value.replace(/\D/g, "").slice(0, maxLen);
        if (cleaned !== el.value) el.value = cleaned;
        if (nextEl && cleaned.length === maxLen) nextEl.focus();
      });
    }
    wireDobField(dobDay,   2, dobMonth);
    wireDobField(dobMonth, 2, dobYear);
    wireDobField(dobYear,  4, null);

    const resend = $("authResendBtn");
    if (resend) resend.addEventListener("click", resendConfirmation);

    const back = $("authBackToLoginBtn");
    if (back) back.addEventListener("click", () => {
      window.actoAuth.state.pendingEmail = null;
      showAuthScreen();
    });

    const logoutBtn = $("authLogoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    const openDel  = $("authOpenDeleteBtn");
    const delDlg   = $("deleteAccountDialog");
    const closeDel = $("authDeleteCloseBtn");
    const cancelDel= $("authDeleteCancelBtn");
    const confirmDel=$("authDeleteConfirmBtn");
    const delInput = $("authDeleteInput");
    if (openDel && delDlg) openDel.addEventListener("click", () => {
      showError("authDeleteError", "");
      if (delInput) { delInput.value = ""; }
      if (confirmDel) confirmDel.disabled = true;
      const settingsDlg = $("settingsDialog");
      if (settingsDlg && settingsDlg.open) settingsDlg.close();
      if (typeof delDlg.showModal === "function") delDlg.showModal();
      else delDlg.setAttribute("open", "");
    });
    if (closeDel && delDlg) closeDel.addEventListener("click", () => delDlg.close());
    if (cancelDel && delDlg) cancelDel.addEventListener("click", () => delDlg.close());
    if (delInput && confirmDel) delInput.addEventListener("input", () => {
      const t = ui();
      const expected = (t.authDeleteWord || "DELETE").trim().toUpperCase();
      const typed    = (delInput.value || "").trim().toUpperCase();
      confirmDel.disabled = (typed !== expected);
    });
    if (confirmDel) confirmDel.addEventListener("click", deleteAccount);
  }

  /* ------------------------------------------------------------------
     9. AUTH STATE LISTENER + INITIAL CHECK
     ------------------------------------------------------------------ */
  sb.auth.onAuthStateChange((event, session) => {
    if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
        && session && session.user) {
      const wasLoggedOut = !window.actoAuth.state.user;
      window.actoAuth.state.user = session.user;
      // Show the app IMMEDIATELY. Profile + stats bump load in the background
      // so a slow database query can never strand the user on the login screen.
      showApp(session.user);
      if (typeof window.applyTranslations === "function") {
        try { window.applyTranslations(); } catch (e) {}
      }
      ensureProfile(session.user).catch(() => {});
      if (event === "SIGNED_IN" && wasLoggedOut) {
        sb.rpc("bump_stats", { delta_login: 1 })
          .catch((e) => console.warn("[auth] login bump failed", e));
      }
    } else if (event === "SIGNED_OUT") {
      window.actoAuth.state.user = null;
      window.actoAuth.state.profile = null;
      showAuthScreen();
    }
  });

  async function init() {
    wireUp();
    applyAuthTranslations();
    // Default screen state until session check completes
    const main = $("mainApp"); if (main) main.hidden = true;
    const scr  = $("authScreen"); if (scr)  scr.hidden = false;

    // Detect Supabase auth errors in the URL hash (e.g. expired email link)
    // and surface them in the login form, then clean the URL.
    try {
      const hash = (window.location.hash || "").replace(/^#/, "");
      if (hash) {
        const params = new URLSearchParams(hash);
        const err = params.get("error");
        const code = params.get("error_code");
        const desc = params.get("error_description");
        if (err) {
          let msg = desc ? desc.replace(/\+/g, " ") : err;
          if (code === "otp_expired") {
            msg = (ui().authErrorEmailNotConfirmed || msg) + " — " + msg;
          }
          showError("authLoginError", msg);
          // Clean the URL so the error doesn't persist on reload
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }
    } catch (e) { console.warn("URL hash parse failed", e); }
    try {
      const { data, error } = await withTimeout(
        sb.auth.getSession(),
        5000,
        "init-getSession"
      );
      if (error) throw error;
      const session = data && data.session;
      if (session && session.user) {
        // Same rule as onAuthStateChange: show the app first, load the profile
        // in the background. Never block UI on the database.
        showApp(session.user);
        ensureProfile(session.user).catch(() => {});
        return;
      }
      // No session — fall through to clean any stale local state and show login.
      await clearStaleLocalSession();
      showAuthScreen();
    } catch (e) {
      // getSession threw OR timed out — usually means a corrupted token in
      // localStorage that the SDK can't refresh. Wipe the local state so the
      // next login attempt starts from a clean slate (avoids the "stuck on
      // login screen, must clear browser data" trap).
      console.warn("[auth] getSession failed, clearing local session:", e && e.message ? e.message : e);
      await clearStaleLocalSession();
      showAuthScreen();
    }
  }

  /**
   * Wipe all Supabase-related state from localStorage. Used when the SDK
   * gets into an inconsistent state (refresh-token failure, expired token
   * with no recovery, etc.) and a fresh login can't take over cleanly.
   */
  async function clearStaleLocalSession() {
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* SDK might throw if already signed out */ }
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("sb-") || k.toLowerCase().includes("supabase"))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) { console.warn("[auth] localStorage cleanup failed", e); }
  }
  window.actoAuth.clearStaleLocalSession = clearStaleLocalSession;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
