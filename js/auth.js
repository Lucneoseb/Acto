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
    // Set-new-password dialog (PASSWORD_RECOVERY)
    setText("authResetTitle",          t.authResetTitle);
    setText("authResetPasswordLabel",  t.authPassword);
    setText("authResetConfirmLabel",   t.authConfirmPassword);
    setText("authResetSubmitBtn",      t.authResetSave);
    setText("authNoAccountText",       t.authNoAccount);
    setText("authOpenSignupBtn",       t.authCreateAccount);
    setText("authPendingTitle",        t.authPendingTitle);
    setText("authResendBtn",           t.authResendEmail);
    setText("authBackToLoginBtn",      t.authBackToLogin);
    setText("authSignupTitle",         t.authSignupTitle);
    setText("authSignupPrenomLabel",   t.authPrenom);
    setText("authSignupNomLabel",      t.authNom);
    setText("authSignupDobLabel",      t.authDob);
    setText("authSignupStageNameLabel", t.authStageName);
    const sStage = $("authSignupStageName");
    if (sStage) sStage.placeholder = t.authStageNamePlaceholder || "";
    const dobD = $("authSignupDobDay");   if (dobD) dobD.placeholder = t.authDobDay   || "JJ";
    const dobM = $("authSignupDobMonth"); if (dobM) dobM.placeholder = t.authDobMonth || "MM";
    const dobY = $("authSignupDobYear");  if (dobY) dobY.placeholder = t.authDobYear  || "AAAA";
    setText("authSignupEmailLabel",    t.authEmail);
    setText("authSignupPasswordLabel", t.authPassword);
    setText("authSignupConfirmLabel",  t.authConfirmPassword);
    setText("authSignupSubmitBtn",     t.authSignupSubmit);
    setText("authAccountTitle",        t.authAccountSection);
    // Labels for the read-only account-info field list.
    setText("accountLabelEmail",       t.authEmail);
    setText("accountLabelPrenom",      t.authPrenom);
    setText("accountLabelNom",         t.authNom);
    setText("accountLabelDob",         t.authDob);
    setText("accountLabelStage",       t.authStageName);
    setText("authLogoutBtn",           t.authLogout);
    setText("authOpenEditBtn",         t.authEditAccount);
    setText("authEditTitle",           t.authEditAccountTitle);
    setText("authEditPrenomLabel",     t.authPrenom);
    setText("authEditNomLabel",        t.authNom);
    setText("authEditDobLabel",        t.authDob);
    setText("authEditStageNameLabel",  t.authStageName);
    const eStage = $("authEditStageName");
    if (eStage) eStage.placeholder = t.authStageNamePlaceholder || "";
    setText("authEditCancelBtn",       t.authDeleteCancel);
    setText("authEditSaveBtn",         t.authEditSave);
    const eDobD = $("authEditDobDay");   if (eDobD) eDobD.placeholder = t.authDobDay   || "JJ";
    const eDobM = $("authEditDobMonth"); if (eDobM) eDobM.placeholder = t.authDobMonth || "MM";
    const eDobY = $("authEditDobYear");  if (eDobY) eDobY.placeholder = t.authDobYear  || "AAAA";
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
    if (!u) return;
    const p = window.actoAuth.state.profile || {};
    setText("accountValEmail",  u.email || "");
    setText("accountValPrenom", p.prenom || "");
    setText("accountValNom",    p.nom    || "");
    setText("accountValStage",  p.nom_scene || "");
    setText("accountValDob",    formatDobForLocale(p.date_naissance));
    refreshAccountStats();
  }

  /** Populate the "📊 Mes statistiques" section in Settings from the
   *  profile row + a one-time count from impro_participants for the
   *  "impros I performed" line (server-side aggregate). */
  async function refreshAccountStats() {
    const sect = $("authStatsSection");
    if (!sect) return;
    const u = window.actoAuth.state.user;
    const p = window.actoAuth.state.profile || {};
    if (!u) { sect.hidden = true; return; }
    sect.hidden = false;
    const t = ui();
    setText("authStatsTitle",       t.authStatsTitle       || "📊 My stats");
    setText("statsLabelLaunched",   t.statsLabelLaunched   || "Impros I started");
    setText("statsLabelPerformed",  t.statsLabelPerformed  || "Impros I performed");
    setText("statsLabelImproSec",   t.statsLabelImproSec   || "Improv playing time");
    setText("statsLabelRecordCount",t.statsLabelRecordCount|| "Videos recorded");
    setText("statsLabelRecordSec",  t.statsLabelRecordSec  || "Time on camera");

    const fmtSec = (window.actoUtils && window.actoUtils.fmtSec) || (s => String(Math.round((s||0)/60)) + " min");
    setText("statsValLaunched",    String(p.total_impros_played    || 0));
    setText("statsValImproSec",    fmtSec(p.total_impro_seconds    || 0));
    setText("statsValRecordCount", String(p.total_records_count    || 0));
    setText("statsValRecordSec",   fmtSec(p.total_record_seconds   || 0));
    // Participations count — live query against impro_participants.
    setText("statsValPerformed", "…");
    try {
      const { count } = await sb
        .from("impro_participants")
        .select("event_id", { count: "exact", head: true })
        .eq("user_id", u.id);
      setText("statsValPerformed", String(count || 0));
    } catch (e) {
      setText("statsValPerformed", String(p.participation_count || 0));
    }
  }

  /** Format an ISO date (YYYY-MM-DD) using the active app locale.
   *  Falls back to the raw string if Intl can't parse it, and avoids
   *  the timezone trap of `new Date('YYYY-MM-DD')` (UTC midnight) by
   *  building the Date with explicit Y/M/D components. */
  function formatDobForLocale(iso) {
    if (!iso || typeof iso !== "string") return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    const date = new Date(y, mo - 1, d);
    if (isNaN(date)) return iso;
    const locale = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.locales && currentLocale())
      ? currentLocale() : "fr";
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
    } catch (e) {
      return iso;
    }
  }
  function currentLocale() {
    try {
      const stored = localStorage.getItem("impro-studio:locale:v1");
      if (stored) return stored;
    } catch (e) { /* ignore */ }
    return (navigator.language || "fr").split(/[-_]/)[0];
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
    // Toggle body class so CSS hides the Settings button (account management
    // is meaningless before sign-in). Rules stays visible regardless.
    document.body.classList.remove("is-signed-in");
  }
  function showPendingScreen(email) {
    window.actoAuth.state.pendingEmail = email;
    const main = $("mainApp"); if (main) main.hidden = true;
    const scr  = $("authScreen"); if (scr)  scr.hidden = false;
    const loginCard = document.querySelector("#authScreen .auth-card:not(.auth-pending)");
    if (loginCard) loginCard.hidden = true;
    const card = $("authPendingCard"); if (card) card.hidden = false;
    refreshPendingMsg();
    // Confirm-email screen is still pre-signed-in territory.
    document.body.classList.remove("is-signed-in");
  }
  function showApp(user) {
    window.actoAuth.state.user = user;
    const main = $("mainApp"); if (main) main.hidden = false;
    const scr  = $("authScreen"); if (scr)  scr.hidden = true;
    const accSec = $("authAccountSection"); if (accSec) accSec.hidden = false;
    refreshAccountInfo();
    // Reveal the Settings button now that there's a real account to manage.
    document.body.classList.add("is-signed-in");
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
    // Stage name is REQUIRED — used by the player roster feature to identify
    // who participated in an impro (with or without an account on Acto).
    const nom_scene = ($("authSignupStageName").value || "").trim();

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

    if (!email || !pass || !confirm || !prenom || !nom || !nom_scene
        || !dayStr || !monthStr || !yearStr) {
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
    // Proactive uniqueness check — catches a duplicate before we create the
    // auth row (which can't be cleanly rolled back from the client).
    try {
      const { data: taken } = await sb.rpc("is_stage_name_taken", { p_name: nom_scene });
      if (taken === true) {
        if (btn) btn.disabled = false;
        return showError("authSignupError", t.authErrorStageNameTaken
          || "Ce nom de scène est déjà pris.");
      }
    } catch (e) { /* RPC missing → fall back to DB-level uniqueness */ }
    try {
      const { data, error } = await sb.auth.signUp({
        email, password: pass,
        options: {
          data: { prenom, nom, date_naissance: dob, nom_scene },
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
            date_naissance: dob,
            nom_scene
          });
        } catch (e) { /* will retry after confirmation */ }
      }
    } catch (e) {
      console.error("signup error", e);
      showError("authSignupError", friendlyProfileError(e, t));
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

  // Shown when the user returns from the reset email link (PASSWORD_RECOVERY).
  function openResetPasswordDialog() {
    applyAuthTranslations();
    showError("authResetError", "");
    const dlg = $("resetPasswordDialog");
    if (!dlg) return;
    const p = $("authResetPassword"); if (p) p.value = "";
    const c = $("authResetConfirm"); if (c) c.value = "";
    if (typeof dlg.showModal === "function") {
      try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); }
    } else dlg.setAttribute("open", "");
    if (p) setTimeout(() => p.focus(), 50);
  }

  async function submitNewPassword() {
    const t = ui();
    const pass    = $("authResetPassword").value;
    const confirm = $("authResetConfirm").value;
    showError("authResetError", "");
    if (pass.length < 8)  return showError("authResetError", t.authErrorPasswordShort);
    if (pass !== confirm) return showError("authResetError", t.authErrorPasswordMismatch);
    const btn = $("authResetSubmitBtn");
    if (btn) btn.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ password: pass });
      if (error) throw error;
      recoveryActive = false;
      const dlg = $("resetPasswordDialog");
      if (dlg && dlg.open) dlg.close();
      // Password changed — the user is authenticated, so enter the app.
      try {
        const { data } = await sb.auth.getUser();
        if (data && data.user) {
          window.actoAuth.state.user = data.user;
          showApp(data.user);
          ensureProfile(data.user).catch(() => {});
        }
      } catch (e) { /* getUser failed; app will recover on next load */ }
    } catch (e) {
      showError("authResetError", e.message || String(e));
    } finally {
      if (btn) btn.disabled = false;
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
            date_naissance: meta.date_naissance || null,
            nom_scene: meta.nom_scene || null
          }),
          6000, "profile-insert"
        );
      }
      const { data: profile } = await withTimeout(
        sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        6000, "profile-fetch"
      );
      window.actoAuth.state.profile = profile || null;
      // Now that we have prenom/nom/dob/nom_scene, repaint the read-only
      // account info block in case the settings dialog is already open.
      try { refreshAccountInfo(); } catch (e) { /* ignore */ }
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
    // Wipe per-user localStorage so the next user on a shared device
    // doesn't see the previous user's roster names / saved teams /
    // "added by me" pool. (The audit flagged these keys as surviving
    // logout previously.)
    try { await clearStaleLocalSession(); } catch (e) { /* best-effort */ }
    window.actoAuth.state.user = null;
    window.actoAuth.state.profile = null;
    showAuthScreen();
  }

  /** Open the edit-account dialog and pre-fill it with the current profile. */
  function openEditDialog() {
    const p = window.actoAuth.state.profile || {};
    const dlg = $("editAccountDialog");
    if (!dlg) return;
    showError("authEditError", "");
    const prenom = $("authEditPrenom"); if (prenom) prenom.value = p.prenom || "";
    const nom    = $("authEditNom");    if (nom)    nom.value    = p.nom    || "";
    const stage  = $("authEditStageName"); if (stage) stage.value = p.nom_scene || "";
    // Split the stored ISO date_naissance back into JJ / MM / AAAA fields.
    const dob = (p.date_naissance || "").split("-");
    const day = $("authEditDobDay"), month = $("authEditDobMonth"), year = $("authEditDobYear");
    if (year)  year.value  = dob[0] || "";
    if (month) month.value = dob[1] || "";
    if (day)   day.value   = dob[2] || "";
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }

  /** Persist the edited prenom / nom / DOB. Email is intentionally not touched. */
  async function editAccount() {
    const t = ui();
    const user = window.actoAuth.state.user;
    if (!user) return;
    const prenom = $("authEditPrenom").value.trim();
    const nom    = $("authEditNom").value.trim();
    const nom_scene = ($("authEditStageName").value || "").trim();
    const dayStr   = $("authEditDobDay").value.trim();
    const monthStr = $("authEditDobMonth").value.trim();
    const yearStr  = $("authEditDobYear").value.trim();
    if (!prenom || !nom || !nom_scene || !dayStr || !monthStr || !yearStr) {
      return showError("authEditError", t.authErrorRequired);
    }
    const day = parseInt(dayStr, 10), month = parseInt(monthStr, 10), year = parseInt(yearStr, 10);
    let dobValid = false, dob = "";
    if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)
        && yearStr.length === 4
        && day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
      const probe = new Date(year, month - 1, day);
      dobValid = probe.getFullYear() === year
              && probe.getMonth() === month - 1
              && probe.getDate() === day;
      if (dobValid) {
        dob = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      }
    }
    if (!dobValid) return showError("authEditError", t.authErrorDobInvalid);
    const age = ageFromDob(dob);
    if (isNaN(age)) return showError("authEditError", t.authErrorDobInvalid);
    if (age < 13)   return showError("authEditError", t.authErrorDobYoung);

    showError("authEditError", "");
    const btn = $("authEditSaveBtn");
    if (btn) btn.disabled = true;
    // Proactive uniqueness check — same RPC also excludes the caller, so a
    // user keeping their own stage name won't get blocked.
    try {
      const { data: taken } = await sb.rpc("is_stage_name_taken", { p_name: nom_scene });
      if (taken === true) {
        if (btn) btn.disabled = false;
        return showError("authEditError", t.authErrorStageNameTaken
          || "Ce nom de scène est déjà pris.");
      }
    } catch (e) { /* RPC missing → fall back to DB-level uniqueness */ }
    try {
      const { data, error } = await sb.from("profiles")
        .update({ prenom, nom, date_naissance: dob, nom_scene })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      // Refresh local state so any UI reading from window.actoAuth.state.profile sees the new values.
      if (data) window.actoAuth.state.profile = data;
      // Repaint the read-only account-info block in the settings dialog.
      try { refreshAccountInfo(); } catch (e) { /* ignore */ }
      const dlg = $("editAccountDialog");
      if (dlg && dlg.open) dlg.close();
    } catch (e) {
      console.error("editAccount failed:", e);
      showError("authEditError", friendlyProfileError(e, t));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /**
   * Translate raw Postgres / Supabase errors from a profile insert/update into
   * a user-friendly message. Falls back to the raw message if we don't recognise
   * the error code.
   */
  function friendlyProfileError(e, t) {
    const msg  = (e && e.message) ? String(e.message) : String(e);
    const code = e && e.code ? String(e.code) : "";
    // Postgres unique_violation = 23505. Our index is profiles_nom_scene_unique.
    if (code === "23505" || /profiles_nom_scene_unique|duplicate key/i.test(msg)) {
      return t.authErrorStageNameTaken || "Ce nom de scène est déjà pris.";
    }
    // Postgres check_violation = 23514. Our constraint is profiles_nom_scene_clean.
    if (code === "23514" || /profiles_nom_scene_clean|is_clean_stage_name|check constraint/i.test(msg)) {
      return t.authErrorStageNameUnsuitable || "Ce nom de scène contient un terme inapproprié.";
    }
    return msg;
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

    const resetForm = $("resetPasswordForm");
    if (resetForm) resetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitNewPassword();
    });

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

    // Edit-account dialog wiring
    const openEdit  = $("authOpenEditBtn");
    const editDlg   = $("editAccountDialog");
    const closeEdit = $("authEditCloseBtn");
    const cancelEdit= $("authEditCancelBtn");
    const editForm  = $("authEditForm");
    if (openEdit && editDlg) openEdit.addEventListener("click", openEditDialog);
    if (closeEdit && editDlg) closeEdit.addEventListener("click", () => editDlg.close());
    if (cancelEdit && editDlg) cancelEdit.addEventListener("click", () => editDlg.close());
    if (editForm) editForm.addEventListener("submit", (e) => { e.preventDefault(); editAccount(); });
    // DOB triplet auto-advance + numeric-only filter for the edit dialog
    const editDobDay   = $("authEditDobDay");
    const editDobMonth = $("authEditDobMonth");
    const editDobYear  = $("authEditDobYear");
    wireDobField(editDobDay,   2, editDobMonth);
    wireDobField(editDobMonth, 2, editDobYear);
    wireDobField(editDobYear,  4, null);

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
  // True while the user is mid password-reset (clicked the email link) so the
  // accompanying SIGNED_IN/INITIAL_SESSION doesn't whisk them into the app
  // before they've actually chosen a new password.
  let recoveryActive = false;

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryActive = true;
      showAuthScreen();
      openResetPasswordDialog();
      return;
    }
    if (recoveryActive &&
        (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
      // Stay on the reset dialog until the new password is submitted.
      return;
    }
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
        // PostgrestBuilder from sb.rpc() is thenable but lacks .catch — wrap.
        Promise.resolve(sb.rpc("bump_stats", { delta_login: 1 }))
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
   *
   * Also clears Acto-specific keys that contain teammate names, last-impro
   * picks, and the user's per-device additions/hides — these aren't
   * sensitive PII (no emails / no DOB / no tokens) but on a shared device
   * the next user shouldn't see the previous user's roster or
   * "added by me" list. Without this wipe, those keys persisted
   * indefinitely after logout (audit finding).
   */
  async function clearStaleLocalSession() {
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* SDK might throw if already signed out */ }
    try {
      const ACTO_PREFIXES = [
        "acto-",                     // acto-team-name-*, acto-last-impro:*, acto-user-added/hidden/filter:*
        "impro-studio:roster",       // teammate UUIDs + stage names
        "impro-studio:rosterA",
        "impro-studio:rosterB"
        // NOTE: impro-studio:locale and impro-studio:overrides are intentionally
        // kept — they're per-device preferences (language, custom data overrides)
        // that should survive logout.
      ];
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("sb-") || k.toLowerCase().includes("supabase")) {
          toRemove.push(k);
          continue;
        }
        if (ACTO_PREFIXES.some(p => k.startsWith(p))) {
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
