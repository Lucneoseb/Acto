/**
 * js/suite/account.js — Studio user-avatar menu + account settings.
 *
 * Renders an avatar button in the Studio top corner (#suiteAccount). Click →
 * dropdown with account info, a language picker, "settings" (edit profile /
 * change password / stats / delete account) and log out. Reads/writes via the
 * gate's Supabase client (window.actoSuiteSb) + window.actoUser.
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  function t(k) { return S.t(k); }
  function tf(k, v) { return S.tf(k, v); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function sb() { return window.actoSuiteSb || null; }
  function user() { return window.actoUser || null; }

  var root = null, profile = null, menuOpen = false, inited = false;

  function init() {
    if (inited) return;
    var el = document.getElementById("suiteAccount");
    if (!el || !user()) return;   // not ready yet — a later call (poll) will succeed
    inited = true;
    root = el;
    renderButton();
    loadProfile();
    S.onLocaleChange(function () { if (root) renderButton(); });
  }

  function displayName() {
    var p = profile || {};
    return (p.nom_scene || ((p.prenom || "") + " " + (p.nom || "")).trim() || (user().email || "")).trim();
  }
  function initials() {
    var base = displayName() || (user().email || "?");
    var parts = base.split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function loadProfile() {
    if (!sb() || !user()) return;
    Promise.resolve(sb().from("profiles").select("prenom,nom,nom_scene,email,date_naissance").eq("id", user().id).single())
      .then(function (res) { if (res && res.data) { profile = res.data; renderButton(); } })
      .catch(function () { /* ignore */ });
  }

  function renderButton() {
    if (!root) return;
    root.innerHTML =
      '<button class="suite-acc-btn" id="suiteAccBtn" type="button" aria-haspopup="true" aria-expanded="' + (menuOpen ? "true" : "false") + '" aria-label="' + esc(t("accountMenu")) + '">' +
        '<span class="suite-acc-avatar">' + esc(initials()) + '</span>' +
      '</button>' +
      (menuOpen ? menuHtml() : "");
    wire();
  }

  function menuHtml() {
    var locales = S.locales() || {};
    var langOpts = Object.keys(locales).map(function (code) {
      var l = locales[code] || {};
      return '<option value="' + esc(code) + '"' + (code === S.locale() ? " selected" : "") + '>' + esc((l.flag ? l.flag + " " : "") + (l.name || code)) + '</option>';
    }).join("");
    return '<div class="suite-acc-menu" role="menu">' +
      '<div class="suite-acc-head"><span class="suite-acc-avatar suite-acc-avatar-lg">' + esc(initials()) + '</span>' +
        '<div class="suite-acc-id"><div class="suite-acc-name">' + esc(displayName()) + '</div><div class="suite-acc-email">' + esc(user().email || "") + '</div></div></div>' +
      '<label class="suite-acc-lang"><span>🌐 ' + esc(t("accountLanguage")) + '</span><select id="suiteAccLang">' + langOpts + '</select></label>' +
      '<button class="suite-acc-item" type="button" data-act="settings">⚙️ ' + esc(t("accountSettings")) + '</button>' +
      '<button class="suite-acc-item" type="button" data-act="stats">📊 ' + esc(t("accountStats")) + '</button>' +
      '<button class="suite-acc-item suite-acc-logout" type="button" data-act="logout">🚪 ' + esc(t("accountLogout")) + '</button>' +
    '</div>';
  }

  function wire() {
    var btn = root.querySelector("#suiteAccBtn");
    if (btn) btn.onclick = function (e) { e.stopPropagation(); menuOpen = !menuOpen; renderButton(); };
    var lang = root.querySelector("#suiteAccLang");
    if (lang) { lang.onclick = function (e) { e.stopPropagation(); }; lang.onchange = function () { S.setLocale(lang.value); }; }
    root.querySelectorAll(".suite-acc-item").forEach(function (b) {
      b.onclick = function () {
        var act = b.getAttribute("data-act");
        menuOpen = false; renderButton();
        if (act === "logout") doLogout();
        else openSettings(act === "stats");
      };
    });
  }

  document.addEventListener("click", function (e) { if (menuOpen && root && !root.contains(e.target)) { menuOpen = false; renderButton(); } });
  document.addEventListener("keydown", function (e) { if (menuOpen && e.key === "Escape") { menuOpen = false; renderButton(); } });

  function doLogout() {
    function go() { try { window.location.replace("login.html"); } catch (e) { window.location.href = "login.html"; } }
    try { Promise.resolve(sb().auth.signOut()).then(go).catch(go); } catch (e) { go(); }
  }

  /* ---------- settings dialog ---------- */
  function field(f, label, val, type) {
    return '<label class="suite-set-field"><span>' + esc(label) + '</span>' +
      '<input type="' + (type || "text") + '" class="suite-input" data-f="' + f + '" value="' + esc(val) + '" /></label>';
  }
  function openSettings(scrollStats) {
    var p = profile || {};
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-acc-dialog";
    dlg.innerHTML = '<div class="suite-dialog-body suite-acc-dlgbody">' +
      '<h2 class="suite-dialog-title">' + esc(t("accountTitle")) + '</h2>' +
      '<div class="suite-acc-grid">' +
        field("prenom", t("accountFirstName"), p.prenom || "") +
        field("nom", t("accountLastName"), p.nom || "") +
        field("nom_scene", t("accountStageName"), p.nom_scene || "") +
        field("date_naissance", t("accountDob"), p.date_naissance || "", "date") +
      '</div>' +
      '<label class="suite-set-field"><span>' + esc(t("accountEmail")) + '</span><input type="email" class="suite-input" value="' + esc(user().email || "") + '" disabled /></label>' +
      '<button type="button" class="suite-btn suite-btn-primary" data-act="save-profile">' + esc(t("accountSave")) + '</button>' +
      '<p class="suite-acc-msg" data-msg="profile" hidden></p>' +
      '<hr class="suite-acc-sep" />' +
      '<h3 class="suite-acc-h3">' + esc(t("accountPasswordTitle")) + '</h3>' +
      '<label class="suite-set-field"><span>' + esc(t("accountNewPassword")) + '</span><input type="password" class="suite-input" data-f="newpw" autocomplete="new-password" /></label>' +
      '<button type="button" class="suite-btn suite-btn-ghost" data-act="change-pw">' + esc(t("accountChangePassword")) + '</button>' +
      '<p class="suite-acc-msg" data-msg="pw" hidden></p>' +
      '<hr class="suite-acc-sep" />' +
      '<h3 class="suite-acc-h3">' + esc(t("accountStatsTitle")) + '</h3>' +
      '<div class="suite-acc-stats" id="suiteAccStats">' + esc(t("commonLoading")) + '</div>' +
      '<hr class="suite-acc-sep" />' +
      '<button type="button" class="suite-btn suite-btn-danger suite-acc-del" data-act="delete">' + esc(t("accountDelete")) + '</button>' +
      '<p class="suite-acc-msg" data-msg="del" hidden></p>' +
      '<div class="suite-dialog-actions"><button type="button" class="suite-btn suite-btn-ghost" data-act="close">' + esc(t("commonClose")) + '</button></div>' +
    '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) {} dlg.remove(); }
    function msg(which, text, ok) { var el = dlg.querySelector('[data-msg="' + which + '"]'); if (el) { el.textContent = text; el.hidden = !text; el.className = "suite-acc-msg" + (ok ? " is-ok" : " is-err"); } }
    function val(f) { var el = dlg.querySelector('[data-f="' + f + '"]'); return el ? el.value.trim() : ""; }

    dlg.querySelector('[data-act="close"]').onclick = close;
    dlg.querySelector('[data-act="save-profile"]').onclick = function () {
      var patch = { prenom: val("prenom"), nom: val("nom"), nom_scene: val("nom_scene") || null, date_naissance: val("date_naissance") || null };
      if (!sb()) { msg("profile", t("accountSaveError"), false); return; }
      var b = dlg.querySelector('[data-act="save-profile"]'); b.disabled = true;
      Promise.resolve(sb().from("profiles").update(patch).eq("id", user().id)).then(function (res) {
        b.disabled = false;
        if (res && res.error) { msg("profile", (res.error.message || t("accountSaveError")), false); return; }
        profile = Object.assign(profile || {}, patch); renderButton();
        msg("profile", t("accountSaved"), true);
      }).catch(function () { b.disabled = false; msg("profile", t("accountSaveError"), false); });
    };
    dlg.querySelector('[data-act="change-pw"]').onclick = function () {
      var pw = val("newpw");
      if (pw.length < 8) { msg("pw", t("accountPasswordShort"), false); return; }
      var b = dlg.querySelector('[data-act="change-pw"]'); b.disabled = true;
      Promise.resolve(sb().auth.updateUser({ password: pw })).then(function (res) {
        b.disabled = false;
        if (res && res.error) { msg("pw", (res.error.message || t("accountPasswordError")), false); return; }
        var el = dlg.querySelector('[data-f="newpw"]'); if (el) el.value = "";
        msg("pw", t("accountPasswordChanged"), true);
      }).catch(function () { b.disabled = false; msg("pw", t("accountPasswordError"), false); });
    };
    dlg.querySelector('[data-act="delete"]').onclick = function () {
      if (!window.confirm(t("accountDeleteConfirm"))) return;
      var b = dlg.querySelector('[data-act="delete"]'); b.disabled = true;
      Promise.resolve(sb().rpc("delete_my_account")).then(function (res) {
        if (res && res.error) { b.disabled = false; msg("del", (res.error.message || t("accountDeleteError")), false); return; }
        try { sb().auth.signOut(); } catch (e) {}
        try { window.location.replace("login.html"); } catch (e) { window.location.href = "login.html"; }
      }).catch(function () { b.disabled = false; msg("del", t("accountDeleteError"), false); });
    };
    // stats
    if (sb()) {
      Promise.resolve(sb().rpc("get_my_stats")).then(function (res) {
        var el = dlg.querySelector("#suiteAccStats"); if (!el) return;
        if (res && res.error) { el.textContent = "—"; return; }
        var r = (Array.isArray(res.data) ? res.data[0] : res.data) || {};
        el.innerHTML =
          '<div class="suite-acc-stat">' + tf("accountStMatches", { n: r.matches || 0 }) + '</div>' +
          '<div class="suite-acc-stat">' + (r.wins || 0) + ' ' + esc(t("accountStWins")) + ' · ' + (r.draws || 0) + ' ' + esc(t("accountStDraws")) + ' · ' + (r.losses || 0) + ' ' + esc(t("accountStLosses")) + '</div>' +
          '<div class="suite-acc-stat">' + (r.gold || 0) + ' 🥇 · ' + (r.silver || 0) + ' 🥈 · ' + (r.bronze || 0) + ' 🥉</div>';
      }).catch(function () { var el = dlg.querySelector("#suiteAccStats"); if (el) el.textContent = "—"; });
    }
    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
    if (scrollStats) { var s = dlg.querySelector("#suiteAccStats"); if (s && s.scrollIntoView) try { s.scrollIntoView(); } catch (e) {} }
  }

  window.ActoAccount = { init: init };

  // Self-bootstrap: the login gate sets window.actoUser asynchronously, and its
  // callback can run before OR after this script loads, so poll briefly until
  // the user is available (the gate also calls init() directly when it can).
  var _bootIv = setInterval(function () {
    if (inited) { clearInterval(_bootIv); return; }
    if (window.actoUser) init();
  }, 120);
  setTimeout(function () { clearInterval(_bootIv); }, 9000);
})();
