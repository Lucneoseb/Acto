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
  const SUPABASE_URL = "https://gssotstyevehbzydzhlq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Xf7VpU-g-01tErkZSeMZSg_rqPhvFNx";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase SDK missing — make sure the CDN <script> is loaded BEFORE auth.js.");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit"
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
  function emailValid(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
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
    const dob     = $("authSignupDob").value;

    if (!email || !pass || !confirm || !prenom || !nom || !dob) {
      return showError("authSignupError", t.authErrorRequired);
    }
    if (!emailValid(email)) return showError("authSignupError", t.authErrorEmailFormat);
    if (pass.length < 8)    return showError("authSignupError", t.authErrorPasswordShort);
    if (pass !== confirm)   return showError("authSignupError", t.authErrorPasswordMismatch);
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
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
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
      showError("authLoginError", e.message || String(e));
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
  async function ensureProfile(user) {
    if (!user) return;
    try {
      const { data: existing } = await sb
        .from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (!existing) {
        const meta = user.user_metadata || {};
        await sb.from("profiles").insert({
          id: user.id,
          email: user.email,
          prenom: meta.prenom || "",
          nom: meta.nom || "",
          date_naissance: meta.date_naissance || null
        });
      }
      const { data: profile } = await sb
        .from("profiles").select("*").eq("id", user.id).maybeSingle();
      window.actoAuth.state.profile = profile || null;
    } catch (e) {
      console.warn("ensureProfile failed", e);
    }
  }

  /* ------------------------------------------------------------------
     7. LOGOUT + ACCOUNT DELETE
     ------------------------------------------------------------------ */
  async function logout() {
    try { await sb.auth.signOut(); } catch (e) { console.warn(e); }
    window.actoAuth.state.user = null;
    window.actoAuth.state.profile = null;
    showAuthScreen();
  }

  async function deleteAccount() {
    const t = ui();
    const inp = $("authDeleteInput");
    const expected = (t.authDeleteWord || "DELETE").trim();
    if (!inp || inp.value.trim() !== expected) {
      return showError("authDeleteError", t.authDeleteConfirm || "Confirmation required");
    }
    showError("authDeleteError", "");
    const btn = $("authDeleteConfirmBtn");
    if (btn) btn.disabled = true;
    try {
      const { error } = await sb.rpc("delete_my_account");
      if (error) throw error;
      // Sign out locally too
      try { await sb.auth.signOut(); } catch (e) {}
      const dlg = $("deleteAccountDialog");
      if (dlg && dlg.open) dlg.close();
      window.actoAuth.state.user = null;
      window.actoAuth.state.profile = null;
      showAuthScreen();
    } catch (e) {
      showError("authDeleteError", e.message || String(e));
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
      confirmDel.disabled = (delInput.value.trim() !== (t.authDeleteWord || "DELETE"));
    });
    if (confirmDel) confirmDel.addEventListener("click", deleteAccount);
  }

  /* ------------------------------------------------------------------
     9. AUTH STATE LISTENER + INITIAL CHECK
     ------------------------------------------------------------------ */
  sb.auth.onAuthStateChange(async (event, session) => {
    if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
        && session && session.user) {
      const wasLoggedOut = !window.actoAuth.state.user;
      window.actoAuth.state.user = session.user;
      await ensureProfile(session.user);
      showApp(session.user);
      // Increment login_count + last_login_at on a fresh login (not on token refresh)
      if (event === "SIGNED_IN" && wasLoggedOut) {
        try { await sb.rpc("bump_stats", { delta_login: 1 }); } catch (e) { console.warn("login bump failed", e); }
      }
      if (typeof window.applyTranslations === "function") {
        try { window.applyTranslations(); } catch (e) {}
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
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        await ensureProfile(session.user);
        showApp(session.user);
      } else {
        showAuthScreen();
      }
    } catch (e) {
      console.warn("getSession failed", e);
      showAuthScreen();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
