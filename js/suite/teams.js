/**
 * js/suite/teams.js — "Mes équipes" library + team editor (window.ActoTeams).
 *
 * A logged-in user manages saved teams here: name, colour, logo, and a roster
 * of players each with an optional photo and an optional link to an Acto
 * account (so future per-player stats attribute to them). Persists via
 * ActoTeamsDB (Supabase, owner-scoped). Reached at #/teams.
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
  function DB() { return window.ActoTeamsDB; }
  function uid() { return DB() ? DB().uid() : ("p_" + Math.random().toString(36).slice(2, 10)); }

  /* ---- image downscale (logo ~256px, avatar ~128px square) ---- */
  function fileToImage(file, maxEdge, square, cb) {
    if (!file) { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height, canvas = document.createElement("canvas"), ctx;
          if (square) {
            var s = Math.min(w, h);
            canvas.width = canvas.height = maxEdge;
            ctx = canvas.getContext("2d");
            ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, maxEdge, maxEdge);
          } else {
            var scale = Math.min(1, maxEdge / Math.max(w, h));
            canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
            ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          cb(canvas.toDataURL("image/jpeg", 0.82));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  /* ============================================================
     LIBRARY
     ============================================================ */
  var root = null, navigate = function () {};

  function mount(container, nav) {
    root = container; navigate = nav || navigate;
    render([], "loading");
    if (!DB() || !DB().available()) { render([], "offline"); return; }
    DB().list().then(function (res) {
      if (res.error) { render([], "error"); return; }
      render(res.data || [], "ok");
    });
  }

  function render(teams, state) {
    var body;
    if (state === "loading") body = '<div class="teams-empty">' + esc(t("commonLoading")) + '</div>';
    else if (state === "offline") body = '<div class="teams-empty">' + esc(t("teamsOffline")) + '</div>';
    else if (state === "error") body = '<div class="teams-empty">' + esc(t("teamsLoadError")) + '</div>';
    else if (!teams.length) body = '<div class="teams-empty">' + esc(t("teamsEmpty")) + '</div>';
    else body = '<div class="teams-grid">' + teams.map(card).join("") + '</div>';

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="home">' + esc(t("commonBack")) + '</button>' +
        '<h1 class="suite-section-title">' + esc(t("teamsLibTitle")) + '</h1>' +
        '<button class="suite-btn suite-btn-primary" data-act="new"' + ((!DB() || !DB().available()) ? " disabled" : "") + '>+ ' + esc(t("teamsNew")) + '</button>' +
      '</div>' +
      '<p class="suite-section-sub">' + esc(t("teamsSub")) + '</p>' +
      body;

    root.querySelector('[data-act="home"]').onclick = function () { navigate("#/match"); };
    var nb = root.querySelector('[data-act="new"]');
    if (nb) nb.onclick = function () { openEditor(null); };
    root.querySelectorAll('[data-act="edit"]').forEach(function (b) {
      b.onclick = function () { var tm = teams[+b.getAttribute("data-i")]; openEditor(tm); };
    });
    root.querySelectorAll('[data-act="del"]').forEach(function (b) {
      b.onclick = function () {
        var tm = teams[+b.getAttribute("data-i")];
        if (!window.confirm(tf("teamsDeleteConfirm", { name: tm.name || t("teamsUnnamed") }))) return;
        DB().remove(tm.id).then(function () { mount(root, navigate); });
      };
    });
  }

  function card(tm, i) {
    var logo = tm.logo
      ? '<img class="teams-card-logo" src="' + esc(tm.logo) + '" alt="" />'
      : '<span class="teams-card-logo teams-card-logo-ph" style="background:' + esc(tm.color || "#888") + '"></span>';
    var n = (tm.players || []).length;
    return '<div class="teams-card" style="--team:' + esc(tm.color || "#888") + '">' +
      '<div class="teams-card-h">' + logo +
        '<div class="teams-card-meta">' +
          '<div class="teams-card-name">' + esc(tm.name || t("teamsUnnamed")) + '</div>' +
          '<div class="teams-card-count">' + tf("teamsPlayerCount", { n: n }) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="teams-card-actions">' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="edit" data-i="' + i + '">' + esc(t("commonEdit")) + '</button>' +
        '<button class="suite-btn suite-btn-mini suite-btn-danger" data-act="del" data-i="' + i + '">' + esc(t("commonDelete")) + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     EDITOR (dialog)
     ============================================================ */
  function openEditor(team) {
    var isNew = !team;
    var work = {
      id: team ? team.id : null,
      name: team ? team.name : "",
      color: team ? team.color : "#6dd3c5",
      logo: team ? team.logo : null,
      players: team ? (team.players || []).map(function (p) { return { id: p.id || uid(), name: p.name || "", photo: p.photo || null, user_id: p.user_id || null }; }) : []
    };

    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-team-dialog";
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) {} dlg.remove(); }

    function readInputs() {
      var nameIn = dlg.querySelector(".team-name-in"); if (nameIn) work.name = nameIn.value;
      var colIn = dlg.querySelector(".team-color-in"); if (colIn) work.color = colIn.value;
      dlg.querySelectorAll(".team-player-name").forEach(function (inp) {
        var p = work.players[+inp.getAttribute("data-i")]; if (p) p.name = inp.value;
      });
    }

    function playerRow(p, i) {
      var ava = p.photo
        ? '<img class="team-pl-photo" src="' + esc(p.photo) + '" alt="" />'
        : '<span class="team-pl-photo team-pl-photo-ph">👤</span>';
      var link = p.user_id
        ? '<button type="button" class="team-pl-link is-linked" data-act="unlink" data-i="' + i + '" title="' + esc(t("teamsUnlink")) + '">🔗 ' + esc(t("teamsLinked")) + '</button>'
        : '<button type="button" class="team-pl-link" data-act="link" data-i="' + i + '">＋ ' + esc(t("teamsLinkAccount")) + '</button>';
      return '<div class="team-pl-row">' +
        '<button type="button" class="team-pl-ava" data-act="photo" data-i="' + i + '">' + ava + '</button>' +
        '<input type="text" class="suite-input team-player-name" data-i="' + i + '" value="' + esc(p.name) + '" placeholder="' + esc(t("teamsPlayerName")) + '" />' +
        link +
        '<button type="button" class="team-pl-del" data-act="pl-del" data-i="' + i + '" aria-label="' + esc(t("commonDelete")) + '">✕</button>' +
        '<input type="file" accept="image/*" class="team-pl-file" data-i="' + i + '" hidden />' +
      '</div>';
    }

    function render() {
      var logoPrev = work.logo
        ? '<div class="suite-logo-prev has"><img src="' + esc(work.logo) + '" alt="" /></div>'
        : '<div class="suite-logo-prev"></div>';
      dlg.innerHTML =
        '<div class="suite-dialog-body suite-team-edit-body">' +
          '<h2 class="suite-dialog-title">' + esc(isNew ? t("teamsNew") : t("teamsEdit")) + '</h2>' +
          '<div class="team-edit-top">' +
            '<label class="suite-set-field team-name-field"><span>' + esc(t("teamName")) + '</span>' +
              '<input type="text" class="suite-input team-name-in" value="' + esc(work.name) + '" placeholder="' + esc(t("teamName")) + '" /></label>' +
            '<label class="suite-set-field team-color-field"><span>' + esc(t("teamColor")) + '</span>' +
              '<input type="color" class="team-color-in" value="' + esc(work.color || "#6dd3c5") + '" /></label>' +
          '</div>' +
          '<div class="suite-team-logo-row">' + logoPrev +
            '<div class="suite-team-logo-btns">' +
              '<button type="button" class="suite-btn suite-btn-mini suite-btn-ghost" data-act="logo-pick">' + esc(t("teamLogoAdd")) + '</button>' +
              (work.logo ? '<button type="button" class="suite-btn suite-btn-mini suite-btn-danger" data-act="logo-clear">' + esc(t("teamLogoRemove")) + '</button>' : "") +
            '</div>' +
            '<input type="file" accept="image/*" class="team-logo-file" hidden />' +
          '</div>' +
          '<div class="team-pl-head">' + esc(t("teamsRoster")) + ' <span class="team-pl-n">' + work.players.length + '</span></div>' +
          '<div class="team-pl-list">' + work.players.map(playerRow).join("") + '</div>' +
          '<button type="button" class="suite-btn suite-btn-ghost team-pl-add" data-act="pl-add">+ ' + esc(t("teamsAddPlayer")) + '</button>' +
          '<div class="suite-dialog-actions">' +
            '<button type="button" class="suite-btn suite-btn-ghost" data-act="cancel">' + esc(t("commonCancel")) + '</button>' +
            '<button type="button" class="suite-btn suite-btn-primary" data-act="save">' + esc(t("commonSave")) + '</button>' +
          '</div>' +
          '<p class="team-edit-err" hidden></p>' +
        '</div>';
      wire();
    }

    function wire() {
      dlg.querySelector('[data-act="cancel"]').onclick = close;
      dlg.querySelector('[data-act="save"]').onclick = doSave;
      // logo
      dlg.querySelector('[data-act="logo-pick"]').onclick = function () { dlg.querySelector(".team-logo-file").click(); };
      dlg.querySelector(".team-logo-file").onchange = function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        readInputs(); fileToImage(f, 256, false, function (d) { if (d) work.logo = d; render(); });
      };
      var lc = dlg.querySelector('[data-act="logo-clear"]'); if (lc) lc.onclick = function () { readInputs(); work.logo = null; render(); };
      // add / remove players
      dlg.querySelector('[data-act="pl-add"]').onclick = function () { readInputs(); work.players.push({ id: uid(), name: "", photo: null, user_id: null }); render(); };
      dlg.querySelectorAll('[data-act="pl-del"]').forEach(function (b) {
        b.onclick = function () { readInputs(); work.players.splice(+b.getAttribute("data-i"), 1); render(); };
      });
      // photo per player
      dlg.querySelectorAll('[data-act="photo"]').forEach(function (b) {
        b.onclick = function () { dlg.querySelector('.team-pl-file[data-i="' + b.getAttribute("data-i") + '"]').click(); };
      });
      dlg.querySelectorAll(".team-pl-file").forEach(function (f) {
        f.onchange = function (e) {
          var i = +f.getAttribute("data-i"), file = e.target.files && e.target.files[0]; if (!file) return;
          readInputs(); fileToImage(file, 128, true, function (d) { if (d) work.players[i].photo = d; render(); });
        };
      });
      // account link / unlink
      dlg.querySelectorAll('[data-act="link"]').forEach(function (b) {
        b.onclick = function () { readInputs(); openLinkPopup(+b.getAttribute("data-i")); };
      });
      dlg.querySelectorAll('[data-act="unlink"]').forEach(function (b) {
        b.onclick = function () { readInputs(); work.players[+b.getAttribute("data-i")].user_id = null; render(); };
      });
    }

    /* ---- account search sub-popup ---- */
    function openLinkPopup(playerIdx) {
      var pop = document.createElement("dialog");
      pop.className = "suite-dialog suite-link-dialog";
      pop.innerHTML =
        '<div class="suite-dialog-body">' +
          '<h2 class="suite-dialog-title">' + esc(t("teamsLinkAccount")) + '</h2>' +
          '<input type="search" class="suite-input link-q" placeholder="' + esc(t("teamsSearchPlaceholder")) + '" autocomplete="off" />' +
          '<div class="link-results"></div>' +
          '<div class="suite-dialog-actions"><button type="button" class="suite-btn suite-btn-ghost" data-act="close">' + esc(t("commonClose")) + '</button></div>' +
        '</div>';
      document.body.appendChild(pop);
      function closePop() { try { if (pop.open) pop.close(); } catch (e) {} pop.remove(); }
      pop.querySelector('[data-act="close"]').onclick = closePop;
      var q = pop.querySelector(".link-q"), out = pop.querySelector(".link-results"), tmr = null;
      function search() {
        var val = q.value.trim();
        if (val.length < 2) { out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchHint")) + '</div>'; return; }
        out.innerHTML = '<div class="link-hint">' + esc(t("commonLoading")) + '</div>';
        DB().searchUsers(val).then(function (res) {
          var rows = res.data || [];
          if (res.error) { out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchError")) + '</div>'; return; }
          if (!rows.length) { out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchNone")) + '</div>'; return; }
          out.innerHTML = rows.map(function (r) {
            return '<button type="button" class="link-res" data-id="' + esc(r.id) + '" data-nm="' + esc(r.nom_scene || r.prenom || "") + '">' +
              '<span class="link-res-nm">' + esc(r.nom_scene || "—") + '</span>' +
              (r.prenom ? '<span class="link-res-pn">' + esc(r.prenom) + '</span>' : '') +
            '</button>';
          }).join("");
          out.querySelectorAll(".link-res").forEach(function (b) {
            b.onclick = function () {
              var p = work.players[playerIdx];
              p.user_id = b.getAttribute("data-id");
              if (!p.name) p.name = b.getAttribute("data-nm");
              closePop(); render();
            };
          });
        });
      }
      q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(search, 250); };
      q.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(tmr); search(); } };
      out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchHint")) + '</div>';
      if (typeof pop.showModal === "function") { try { pop.showModal(); } catch (e) { pop.setAttribute("open", ""); } } else pop.setAttribute("open", "");
      setTimeout(function () { try { q.focus(); } catch (e) {} }, 30);
    }

    function showErr(msg) { var e = dlg.querySelector(".team-edit-err"); if (e) { e.textContent = msg; e.hidden = !msg; } }

    function doSave() {
      readInputs();
      work.name = (work.name || "").trim();
      work.players = work.players.map(function (p) { return { id: p.id || uid(), name: (p.name || "").trim(), photo: p.photo || null, user_id: p.user_id || null }; })
                                 .filter(function (p) { return p.name || p.photo || p.user_id; });
      if (!work.name) { showErr(t("teamsNeedName")); return; }
      if (!DB() || !DB().available()) { showErr(t("teamsOffline")); return; }
      var saveBtn = dlg.querySelector('[data-act="save"]'); if (saveBtn) saveBtn.disabled = true;
      var op = work.id
        ? DB().update(work.id, { name: work.name, color: work.color, logo: work.logo, players: work.players })
        : DB().create({ name: work.name, color: work.color, logo: work.logo, players: work.players });
      op.then(function (res) {
        if (res.error) { showErr(t("teamsSaveError")); if (saveBtn) saveBtn.disabled = false; return; }
        close(); mount(root, navigate);
      });
    }

    render();
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
  }

  window.ActoTeams = { mount: mount, openEditor: openEditor };
})();
