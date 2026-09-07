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
        else if (act === "stats") openStats();
        else openSettings();
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
  function openSettings() {
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
    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
  }

  /* ---------- fenêtre Statistiques ----------
     Ce que la personne a réellement fait : combien de matchs, de spectacles, de
     coachings, de défis — et pour les matchs, le détail victoires / étoiles.
     Les compteurs par section viennent de get_my_activity (voir la migration
     2026-09-activite) ; sans elle, la fenêtre montre les matchs seuls plutôt
     que de rester vide. */
  function statTile(icone, valeur, libelle) {
    return '<div class="suite-stat-tile"><span class="suite-stat-ico" aria-hidden="true">' + icone + '</span>' +
      '<span class="suite-stat-val">' + esc(String(valeur)) + '</span>' +
      '<span class="suite-stat-lbl">' + esc(libelle) + '</span></div>';
  }
  function openStats() {
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-acc-dialog";
    dlg.innerHTML = '<div class="suite-dialog-body suite-acc-dlgbody">' +
      '<h2 class="suite-dialog-title">📊 ' + esc(t("accountStatsTitle")) + '</h2>' +
      '<div class="suite-stat-grid" id="suiteStatGrid">' + esc(t("commonLoading")) + '</div>' +
      '<div id="suiteStatMatch"></div>' +
      '<div id="suiteStatMembers"></div>' +
      '<div class="suite-dialog-actions"><button type="button" class="suite-btn suite-btn-ghost" data-act="close">' + esc(t("commonClose")) + '</button></div>' +
    '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); }
    dlg.querySelector('[data-act="close"]').onclick = close;
    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");

    if (!sb()) { var g0 = dlg.querySelector("#suiteStatGrid"); if (g0) g0.textContent = "—"; return; }

    // Compteurs par section (migration facultative : on dégrade proprement).
    Promise.resolve(sb().rpc("get_my_activity")).then(function (res) {
      var g = dlg.querySelector("#suiteStatGrid"); if (!g) return;
      var a = (res && !res.error) ? ((Array.isArray(res.data) ? res.data[0] : res.data) || {}) : null;
      if (!a) { g.innerHTML = '<p class="suite-sub">' + esc(t("accountStatsPending")) + '</p>'; return; }
      g.innerHTML =
        statTile("🏆", a.matches || 0, t("sectionMatchTitle")) +
        statTile("🎪", a.shows || 0, t("sectionShowTitle")) +
        statTile("🏋️", a.trainings || 0, t("sectionTrainTitle")) +
        statTile("🎯", a.challenges || 0, t("sectionDefiTitle")) +
        statTile("🎭", a.impros || 0, t("accountStImpros")) +
        statTile("⏱", Math.round((a.played_seconds || 0) / 60), t("accountStMinutes"));
    }, function () {
      var g = dlg.querySelector("#suiteStatGrid"); if (g) g.innerHTML = '<p class="suite-sub">' + esc(t("accountStatsPending")) + '</p>';
    });

    /* Les membres que j'ai fait jouer. La RPC ne renvoie que MES séances, donc
       la liste est vide pour qui n'a jamais animé : dans ce cas on n'affiche
       rien du tout plutôt qu'un tableau désert. */
    Promise.resolve(sb().rpc("get_member_activity")).then(function (res) {
      var el = dlg.querySelector("#suiteStatMembers"); if (!el) return;
      if (!res || res.error) return;                      // migration pas passée : section absente
      var rows = res.data || [];
      if (!rows.length) return;
      el.innerHTML = '<h3 class="suite-acc-h3">👥 ' + esc(t("accountStMembers")) + '</h3>' +
        '<p class="suite-acc-membershint">' + esc(t("accountStMembersHint")) + '</p>' +
        '<div class="suite-members">' +
          '<div class="suite-member suite-member-head">' +
            '<span class="suite-member-nm">' + esc(t("accountStMemberName")) + '</span>' +
            '<span class="suite-member-n" title="' + esc(t("sectionTrainTitle")) + '">🏋️</span>' +
            '<span class="suite-member-n" title="' + esc(t("sectionMatchTitle")) + '">🏆</span>' +
            '<span class="suite-member-n" title="' + esc(t("sectionShowTitle")) + '">🎪</span>' +
            '<span class="suite-member-n" title="' + esc(t("accountStBlocks")) + '">🎭</span>' +
          '</div>' +
          rows.map(function (m) {
            var vu = m.last_seen ? new Date(m.last_seen).toLocaleDateString(S.locale()) : "";
            return '<div class="suite-member">' +
              '<span class="suite-member-nm">' + esc(m.name || "—") +
                (m.user_id ? '' : ' <span class="suite-member-free">' + esc(t("accountStNoAccount")) + '</span>') +
                (vu ? '<span class="suite-member-seen">' + esc(tf("accountStLastSeen", { date: vu })) + '</span>' : '') +
              '</span>' +
              '<span class="suite-member-n">' + (m.trainings || 0) + '</span>' +
              '<span class="suite-member-n">' + (m.matches || 0) + '</span>' +
              '<span class="suite-member-n">' + (m.shows || 0) + '</span>' +
              '<span class="suite-member-n">' + (m.blocks || 0) + '</span>' +
            '</div>';
          }).join("") +
        '</div>';
    }, function () { /* la section est un bonus : silence si indisponible */ });

    // Détail des matchs : victoires / nuls / défaites et étoiles.
    Promise.resolve(sb().rpc("get_my_stats")).then(function (res) {
      var el = dlg.querySelector("#suiteStatMatch"); if (!el) return;
      if (res && res.error) return;
      var r = (Array.isArray(res.data) ? res.data[0] : res.data) || {};
      if (!(r.matches > 0)) return;                   // aucun match joué : pas de bloc vide
      el.innerHTML = '<h3 class="suite-acc-h3">🏆 ' + esc(t("accountStMatchDetail")) + '</h3>' +
        '<div class="suite-acc-stats">' +
          '<div class="suite-acc-stat">' + (r.wins || 0) + ' ' + esc(t("accountStWins")) + ' · ' + (r.draws || 0) + ' ' + esc(t("accountStDraws")) + ' · ' + (r.losses || 0) + ' ' + esc(t("accountStLosses")) + '</div>' +
          '<div class="suite-acc-stat">' + (r.gold || 0) + ' 🥇 · ' + (r.silver || 0) + ' 🥈 · ' + (r.bronze || 0) + ' 🥉</div>' +
        '</div>';
    }).catch(function () { /* le détail est un bonus */ });
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
