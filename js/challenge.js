/* ============================================================================
 *  challenge.js — window.ActoChallenge : "Envoyer comme défi" (Fonctionnalité 1,
 *  côté lanceur). Self-contained: injects its own CSS + a <dialog>, so it works
 *  on the styles.css pages (quickgame, warmups) and the suite.css pages alike.
 *
 *  Delivery is LINK-SHARE (no email): create_challenge → a /defi?token=… link the
 *  sender shares (copy / native share / QR). No video ever touches the server.
 *  i18n via window.ActoSuite.t when present, else a small FR fallback.
 * ========================================================================== */
(function () {
  "use strict";

  var FB = {
    challengeSend: "Envoyer comme défi", challengeModalTitle: "Envoyer ce défi",
    challengeRecipientLabel: "À qui ? (optionnel)", challengeSearchPh: "Chercher un nom de scène…",
    challengeSearchHint: "Ou laisse vide : tu obtiens un lien à partager à qui tu veux.",
    challengeSearchNone: "Aucun comédien trouvé.", challengeSearchErr: "Recherche indisponible.",
    challengeChosen: "Défi pour {name}", challengeClear: "changer",
    challengeMsgLabel: "Petit mot (optionnel)", challengeMsgPh: "Relève ce défi 😄",
    challengeCreate: "Créer le lien du défi", challengeCreating: "Création…",
    challengeNeedLogin: "Connecte-toi pour envoyer un défi.", challengeErr: "Impossible de créer le défi.",
    challengePlayersLabel: "Nombre d'improvisateurs",
    challengeTimeLabel: "Minutage du défi", challengePlayTime: "Temps de jeu", challengeCaucus: "Caucus",
    challengeRedrawBtn: "Re-tirer le défi",
    receivedMasked: "Défi surprise",
    challengeReadyTitle: "Défi prêt !",
    challengeReadySub: "Partage ce lien : il ouvre le défi et l'enregistrement vidéo. La vidéo te reviendra par le canal que le destinataire choisira.",
    challengeCopy: "Copier le lien", challengeShareBtn: "Partager",
    challengeShareText: "Je te lance un défi d'impro surprise 🎁 Relève-le ici :",
    myChallengesTitle: "Mes défis", myChallengesEmpty: "Tu n'as pas encore envoyé de défi.",
    receivedTitle: "Défis reçus", receivedEmpty: "Aucun défi reçu pour l'instant.",
    challengeStatusSent: "Envoyé", challengeStatusOpened: "Ouvert", challengeStatusDone: "Relevé",
    challengeTo: "À {name}", challengeFromName: "De {name}",
    challengeRelink: "Revoir le lien", challengeRelever: "Relever",
    commonClose: "Fermer", commonBack: "Retour"
  };
  function S() { return window.ActoSuite; }
  function T(k) { var s = S(); return (s && s.t) ? s.t(k) : (FB[k] || k); }
  function TF(k, v) {
    var s = S();
    if (s && s.tf) return s.tf(k, v);
    var out = FB[k] || k; for (var p in v) out = out.replace(new RegExp("\\{" + p + "\\}", "g"), v[p]); return out;
  }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sbc() { return window.actoSupabase || window.actoSuiteSb || null; }
  function baseUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ""); }
  function fmtSec(s) { var S2 = S(); return S2 && S2.formatSec ? S2.formatSec(s) : (s + "s"); }
  function debounce(fn, ms) { var h; return function () { var a = arguments, self = this; clearTimeout(h); h = setTimeout(function () { fn.apply(self, a); }, ms); }; }

  /* ---- one-time CSS ------------------------------------------------------ */
  var CSS =
    ".chg-dlg{border:none;background:transparent;padding:0;max-width:min(94vw,30rem);width:100%;color:var(--ink,#f4f0e6);}" +
    ".chg-dlg::backdrop{background:rgba(6,4,12,0.66);backdrop-filter:blur(2px);}" +
    ".chg-card{background:var(--bg-velvet,#171022);border:1px solid rgba(255,255,255,0.13);border-radius:18px;padding:1.2rem 1.15rem;display:flex;flex-direction:column;gap:0.8rem;box-shadow:0 24px 60px rgba(0,0,0,0.5);max-height:88svh;overflow:auto;}" +
    ".chg-h{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:.5px;margin:0;color:var(--gold,#d4af37);}" +
    ".chg-sub{margin:0;color:var(--ink-muted,#b9b2c7);font-size:.92rem;line-height:1.5;}" +
    ".chg-ep{border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);border-radius:12px;padding:0.6rem 0.75rem;}" +
    ".chg-ep-t{font-family:'Playfair Display',serif;color:var(--gold,#d4af37);font-size:1.05rem;margin:0 0 .3rem;}" +
    ".chg-chips{display:flex;flex-wrap:wrap;gap:.3rem;}" +
    ".chg-chip{font:600 .76rem/1 'Inter',sans-serif;color:var(--ink,#f4f0e6);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:999px;padding:.28rem .5rem;}" +
    ".chg-field{display:flex;flex-direction:column;gap:.35rem;}" +
    ".chg-label{font:600 .82rem/1 'Inter',sans-serif;color:var(--ink-muted,#b9b2c7);}" +
    ".chg-in,.chg-ta{width:100%;box-sizing:border-box;background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.16);border-radius:10px;color:var(--ink,#f4f0e6);font:400 .95rem/1.3 'Inter',sans-serif;padding:.55rem .7rem;}" +
    ".chg-ta{min-height:3.2rem;resize:vertical;}" +
    ".chg-in:focus,.chg-ta:focus{outline:none;border-color:var(--gold,#d4af37);}" +
    ".chg-res{display:flex;flex-direction:column;gap:.25rem;max-height:11rem;overflow:auto;}" +
    ".chg-res-row{display:flex;align-items:center;gap:.5rem;text-align:left;appearance:none;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);border-radius:10px;padding:.45rem .6rem;color:var(--ink,#f4f0e6);font:600 .9rem/1 'Inter',sans-serif;}" +
    ".chg-res-row:hover{border-color:var(--gold,#d4af37);}" +
    ".chg-res-sub{color:var(--ink-faint,#8b8397);font-weight:400;font-size:.82rem;}" +
    ".chg-hint{color:var(--ink-faint,#8b8397);font-size:.8rem;}" +
    ".chg-chosen{display:flex;align-items:center;gap:.5rem;color:var(--ink,#f4f0e6);font-weight:600;font-size:.92rem;}" +
    ".chg-link-link{cursor:pointer;color:var(--gold-soft,#e8c766);text-decoration:underline;font-size:.82rem;background:none;border:none;padding:0;}" +
    ".chg-actions{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end;}" +
    ".chg-btn{appearance:none;cursor:pointer;border-radius:10px;padding:.6rem .95rem;font:700 .92rem/1 'Inter',sans-serif;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--ink,#f4f0e6);}" +
    ".chg-btn:hover{border-color:var(--gold,#d4af37);}" +
    ".chg-btn.pri{background:linear-gradient(180deg,var(--gold,#d4af37),#b9932c);border-color:transparent;color:#1a1206;}" +
    ".chg-btn:disabled{opacity:.55;cursor:default;}" +
    ".chg-btn.grow{flex:1 1 auto;}" +
    ".chg-playersrow{display:flex;gap:.45rem;align-items:center;}" +
    ".chg-players{width:5.2rem;flex:0 0 auto;text-align:center;font-weight:700;}" +
    ".chg-playersrow .chg-btn{flex:1 1 auto;}" +
    ".chg-timerow{display:flex;gap:.5rem;align-items:center;justify-content:space-between;margin-top:.35rem;}" +
    ".chg-tlab{display:flex;gap:.4rem;align-items:center;font:600 .9rem/1 'Inter',sans-serif;color:var(--ink,#f4f0e6);flex:1 1 auto;}" +
    ".chg-tsel{flex:0 0 auto;width:auto;min-width:6.5rem;padding:.4rem .5rem;}" +
    ".chg-check{display:flex;gap:.45rem;align-items:center;font:600 .9rem/1 'Inter',sans-serif;color:var(--ink,#f4f0e6);cursor:pointer;flex:1 1 auto;}" +
    ".chg-check input{width:1.05rem;height:1.05rem;accent-color:var(--gold,#d4af37);}" +
    ".chg-tsel:disabled{opacity:.4;}" +
    ".chg-linkbox{display:flex;align-items:center;gap:.4rem;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:.45rem .55rem;}" +
    ".chg-linkbox input{flex:1 1 auto;background:none;border:none;color:var(--ink,#f4f0e6);font:500 .82rem/1.2 'Inter',monospace;min-width:0;}" +
    ".chg-qr{margin:.2rem auto 0;background:#fff;border-radius:12px;padding:8px;width:160px;max-width:60vw;}" +
    ".chg-qr svg{display:block;width:100%;height:auto;}" +
    ".chg-list{display:flex;flex-direction:column;gap:.5rem;}" +
    ".chg-row{display:flex;align-items:center;gap:.6rem;text-align:left;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);border-radius:12px;padding:.6rem .7rem;}" +
    ".chg-row-main{flex:1 1 auto;min-width:0;}" +
    ".chg-row-t{font-weight:600;font-size:.92rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".chg-row-sub{color:var(--ink-faint,#8b8397);font-size:.8rem;}" +
    ".chg-badge{flex:0 0 auto;font:700 .72rem/1 'Inter',sans-serif;border-radius:999px;padding:.28rem .5rem;text-transform:uppercase;letter-spacing:.04em;}" +
    ".chg-badge.sent{color:#c9c2d6;background:rgba(255,255,255,0.08);}" +
    ".chg-badge.opened{color:#e8c766;background:rgba(212,175,55,0.14);}" +
    ".chg-badge.done{color:#7ad19a;background:rgba(60,180,110,0.16);}" +
    ".chg-empty{color:var(--ink-muted,#b9b2c7);text-align:center;padding:1rem 0;}" +
    ".chg-toast{position:fixed;left:50%;bottom:1.4rem;transform:translateX(-50%);background:var(--bg-velvet,#171022);border:1px solid var(--gold,#d4af37);color:var(--ink,#f4f0e6);border-radius:10px;padding:.6rem .9rem;font:600 .9rem 'Inter';z-index:99999;box-shadow:0 12px 30px rgba(0,0,0,.5);}";
  function ensureCss() { if (document.getElementById("acto-chg-css")) return; var st = document.createElement("style"); st.id = "acto-chg-css"; st.textContent = CSS; document.head.appendChild(st); }

  function toast(msg) {
    var el = document.createElement("div"); el.className = "chg-toast"; el.textContent = msg; document.body.appendChild(el);
    setTimeout(function () { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(function () { el.remove(); }, 320); }, 1600);
  }

  function openDialog(innerHtml) {
    ensureCss();
    var dlg = document.createElement("dialog"); dlg.className = "chg-dlg";
    dlg.innerHTML = '<div class="chg-card">' + innerHtml + "</div>";
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) {} dlg.remove(); }
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });   // click backdrop
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
    return { dlg: dlg, card: dlg.querySelector(".chg-card"), close: close };
  }

  function chips(s) {
    var out = "";
    if (s.category) out += '<span class="chg-chip">🏷 ' + esc(s.category) + "</span>";
    if (s.theme) out += '<span class="chg-chip">🎭 ' + esc(s.theme) + "</span>";
    var d = parseInt(s.durationSec, 10); if (d > 0) out += '<span class="chg-chip">⏱ ' + esc(fmtSec(d)) + "</span>";
    if (s.players) out += '<span class="chg-chip">👥 ' + esc(s.players) + "</span>";
    return out ? '<div class="chg-chips">' + out + "</div>" : "";
  }

  function buildQr(url) {
    try {
      if (!window.qrcode) return "";
      var qr = window.qrcode(0, "M"); qr.addData(url); qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { return ""; }
  }

  /* ---- create flow ------------------------------------------------------- */
  function open(snapshot) {
    snapshot = snapshot || {};
    if (!sbc()) { toast(T("challengeNeedLogin")); return; }
    var recipient = null;   // {id, label}

    function epCardHtml(s) {
      return '<div class="chg-ep-t">' + esc(s.title || "") + "</div>" +
        (s.subtitle ? '<p class="chg-sub">' + esc(s.subtitle) + "</p>" : "") + chips(s);
    }
    // Timing controls the sender sets: play time (impro) + optional caucus.
    var DUR_OPTS = [30, 45, 60, 90, 120, 150, 180, 240, 300], CAUCUS_OPTS = [10, 15, 20, 30, 45, 60, 90];
    function fmtDurLabel(s) { var m = Math.floor(s / 60), sec = s % 60; return (m ? (m + " min" + (sec ? " " + sec : "")) : (sec + " s")); }
    function optList(vals, sel) { return vals.map(function (v) { return '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + esc(fmtDurLabel(v)) + "</option>"; }).join(""); }
    var initDur = parseInt(snapshot.durationSec, 10); if (DUR_OPTS.indexOf(initDur) < 0) initDur = 90;
    var initCau = (snapshot.caucusSec != null && snapshot.caucusSec !== "") ? parseInt(snapshot.caucusSec, 10) : 20;
    var initCauOn = initCau > 0; if (!initCauOn) initCau = 20;
    var canRedraw = !!(window.actoApp && window.actoApp.challengeRedraw);
    var h = '<h2 class="chg-h">📣 ' + esc(T("challengeModalTitle")) + "</h2>" +
      '<div class="chg-ep" data-rc="ep">' + epCardHtml(snapshot) + "</div>" +
      '<div class="chg-field"><span class="chg-label">' + esc(T("challengePlayersLabel")) + "</span>" +
        '<div class="chg-playersrow">' +
          '<input class="chg-in chg-players" data-rc="players" type="number" min="1" max="12" inputmode="numeric" value="' + esc(String(parseInt(snapshot.players, 10) || "")) + '" />' +
          (canRedraw ? '<button type="button" class="chg-btn" data-rc="redraw">🎲 ' + esc(T("challengeRedrawBtn")) + "</button>" : "") +
        "</div></div>" +
      '<div class="chg-field"><span class="chg-label">' + esc(T("challengeTimeLabel")) + "</span>" +
        '<label class="chg-timerow"><span class="chg-tlab">🎬 ' + esc(T("challengePlayTime")) + "</span>" +
          '<select class="chg-in chg-tsel" data-rc="playtime">' + optList(DUR_OPTS, initDur) + "</select></label>" +
        '<div class="chg-timerow">' +
          '<label class="chg-check"><input type="checkbox" data-rc="caucuson"' + (initCauOn ? " checked" : "") + " /> <span>⏸ " + esc(T("challengeCaucus")) + "</span></label>" +
          '<select class="chg-in chg-tsel" data-rc="caucustime"' + (initCauOn ? "" : " disabled") + ">" + optList(CAUCUS_OPTS, initCau) + "</select>" +
        "</div></div>" +
      '<div class="chg-field"><span class="chg-label">' + esc(T("challengeRecipientLabel")) + "</span>" +
        '<div data-rc="slot"></div>' +
        '<input class="chg-in" data-rc="search" type="text" placeholder="' + esc(T("challengeSearchPh")) + '" autocomplete="off" />' +
        '<div class="chg-res" data-rc="results"></div>' +
        '<span class="chg-hint" data-rc="hint">' + esc(T("challengeSearchHint")) + "</span></div>" +
      '<label class="chg-field"><span class="chg-label">' + esc(T("challengeMsgLabel")) + "</span>" +
        '<textarea class="chg-ta" data-rc="msg" maxlength="240" placeholder="' + esc(T("challengeMsgPh")) + '"></textarea></label>' +
      '<div class="chg-actions"><button type="button" class="chg-btn" data-rc="cancel">' + esc(T("commonClose")) + "</button>" +
        '<button type="button" class="chg-btn pri grow" data-rc="create">🔗 ' + esc(T("challengeCreate")) + "</button></div>";

    var ui = openDialog(h);
    var search = ui.card.querySelector('[data-rc="search"]');
    var results = ui.card.querySelector('[data-rc="results"]');
    var slot = ui.card.querySelector('[data-rc="slot"]');
    var hint = ui.card.querySelector('[data-rc="hint"]');
    var createBtn = ui.card.querySelector('[data-rc="create"]');
    var playersIn = ui.card.querySelector('[data-rc="players"]');
    var playTimeSel = ui.card.querySelector('[data-rc="playtime"]');
    var caucusChk = ui.card.querySelector('[data-rc="caucuson"]');
    var caucusSel = ui.card.querySelector('[data-rc="caucustime"]');
    var epEl = ui.card.querySelector('[data-rc="ep"]');
    ui.card.querySelector('[data-rc="cancel"]').onclick = ui.close;

    // Fold the sender's overrides (improviser count, play time, caucus) into the
    // snapshot. The 🎲 redraw pulls a fresh theme + catégorie/exercice honouring
    // the improviser count.
    function applyPlayersOverride() {
      var n = playersIn ? parseInt(playersIn.value, 10) : NaN;
      if (!isNaN(n) && n > 0) snapshot.players = String(n);
      if (playTimeSel) snapshot.durationSec = parseInt(playTimeSel.value, 10) || snapshot.durationSec;
      if (caucusChk && caucusSel) snapshot.caucusSec = caucusChk.checked ? (parseInt(caucusSel.value, 10) || 20) : 0;
    }
    if (playersIn) playersIn.addEventListener("change", function () {
      applyPlayersOverride();
      if (epEl) epEl.innerHTML = epCardHtml(snapshot);
    });
    if (playTimeSel) playTimeSel.addEventListener("change", function () { applyPlayersOverride(); if (epEl) epEl.innerHTML = epCardHtml(snapshot); });
    if (caucusChk) caucusChk.addEventListener("change", function () { if (caucusSel) caucusSel.disabled = !caucusChk.checked; applyPlayersOverride(); });
    if (caucusSel) caucusSel.addEventListener("change", applyPlayersOverride);
    applyPlayersOverride();   // seed the snapshot with the initial timing values
    var redrawBtn = ui.card.querySelector('[data-rc="redraw"]');
    if (redrawBtn) redrawBtn.onclick = function () {
      try {
        var fresh = window.actoApp.challengeRedraw(playersIn ? playersIn.value : null);
        if (fresh) snapshot = fresh;
      } catch (e) { /* keep the current snapshot */ }
      applyPlayersOverride();
      if (epEl) epEl.innerHTML = epCardHtml(snapshot);
    };

    function showChosen() {
      slot.innerHTML = '<div class="chg-chosen">✅ ' + esc(TF("challengeChosen", { name: recipient.label })) + ' <button type="button" class="chg-link-link" data-rc="clear">' + esc(T("challengeClear")) + "</button></div>";
      search.style.display = "none"; results.innerHTML = ""; hint.style.display = "none";
      slot.querySelector('[data-rc="clear"]').onclick = function () { recipient = null; slot.innerHTML = ""; search.style.display = ""; hint.style.display = ""; search.value = ""; search.focus(); };
    }
    var doSearch = debounce(function () {
      var q = search.value.trim();
      if (q.length < 2) { results.innerHTML = ""; return; }
      var sb = sbc(); if (!sb) return;
      Promise.resolve(sb.rpc("search_users_by_stage_name", { p_query: q })).then(function (res) {
        if (res && res.error) { results.innerHTML = '<div class="chg-hint">' + esc(T("challengeSearchErr")) + "</div>"; return; }
        var rows = (res && res.data) || [];
        if (!rows.length) { results.innerHTML = '<div class="chg-hint">' + esc(T("challengeSearchNone")) + "</div>"; return; }
        results.innerHTML = rows.slice(0, 8).map(function (r) {
          return '<button type="button" class="chg-res-row" data-id="' + esc(r.id) + '" data-nm="' + esc(r.nom_scene || "") + '">' +
            "🎭 " + esc(r.nom_scene || "") + (r.prenom ? ' <span class="chg-res-sub">· ' + esc(r.prenom) + "</span>" : "") + "</button>";
        }).join("");
        [].forEach.call(results.querySelectorAll(".chg-res-row"), function (b) {
          b.onclick = function () { recipient = { id: b.getAttribute("data-id"), label: b.getAttribute("data-nm") }; showChosen(); };
        });
      }, function () { results.innerHTML = '<div class="chg-hint">' + esc(T("challengeSearchErr")) + "</div>"; });
    }, 260);
    search.addEventListener("input", doSearch);

    createBtn.onclick = function () {
      var sb = sbc(); if (!sb) { toast(T("challengeNeedLogin")); return; }
      applyPlayersOverride();
      var msg = ui.card.querySelector('[data-rc="msg"]').value.trim();
      createBtn.disabled = true; createBtn.textContent = T("challengeCreating");
      Promise.resolve(sb.rpc("create_challenge", {
        p_snapshot: snapshot,
        p_recipient_user_id: recipient ? recipient.id : null,
        p_recipient_label: recipient ? recipient.label : null,
        p_message: msg || null
      })).then(function (res) {
        if (res && res.error) { createBtn.disabled = false; createBtn.textContent = "🔗 " + T("challengeCreate"); toast(T("challengeErr")); return; }
        var token = res && res.data; if (!token) { createBtn.disabled = false; createBtn.textContent = "🔗 " + T("challengeCreate"); toast(T("challengeErr")); return; }
        ui.close();
        renderShare(String(token));
      }, function () { createBtn.disabled = false; createBtn.textContent = "🔗 " + T("challengeCreate"); toast(T("challengeErr")); });
    };
  }

  /* ---- share-link screen ------------------------------------------------- */
  // NO SPOILER: the share message never carries the épreuve title — the recipient
  // must discover it in the video announce.
  function renderShare(token) {
    var link = baseUrl() + "defi.html?token=" + encodeURIComponent(token);
    var qr = buildQr(link);
    var h = '<h2 class="chg-h">🎉 ' + esc(T("challengeReadyTitle")) + "</h2>" +
      '<p class="chg-sub">' + esc(T("challengeReadySub")) + "</p>" +
      '<div class="chg-linkbox"><input type="text" readonly value="' + esc(link) + '" data-rc="url" /></div>' +
      (qr ? '<div class="chg-qr" aria-label="QR">' + qr + "</div>" : "") +
      '<div class="chg-actions">' +
        '<button type="button" class="chg-btn" data-rc="close">' + esc(T("commonClose")) + "</button>" +
        (navigator.share ? '<button type="button" class="chg-btn" data-rc="share">📤 ' + esc(T("challengeShareBtn")) + "</button>" : "") +
        '<button type="button" class="chg-btn pri grow" data-rc="copy">📋 ' + esc(T("challengeCopy")) + "</button></div>";
    var ui = openDialog(h);
    ui.card.querySelector('[data-rc="close"]').onclick = ui.close;
    var urlIn = ui.card.querySelector('[data-rc="url"]');
    urlIn.addEventListener("focus", function () { urlIn.select(); });
    var copyBtn = ui.card.querySelector('[data-rc="copy"]'), copyLabel = copyBtn.textContent;
    copyBtn.onclick = function () {
      function ok() { copyBtn.textContent = "✓"; setTimeout(function () { copyBtn.textContent = copyLabel; }, 1400); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function () { urlIn.focus(); urlIn.select(); });
      else { urlIn.focus(); urlIn.select(); try { document.execCommand("copy"); ok(); } catch (e) {} }
    };
    var shareBtn = ui.card.querySelector('[data-rc="share"]');
    if (shareBtn) shareBtn.onclick = function () {
      try { navigator.share({ title: T("challengeModalTitle"), text: T("challengeShareText"), url: link }).catch(function () {}); } catch (e) {}
    };
  }

  /* ---- lists ------------------------------------------------------------- */
  function statusBadge(st) {
    var map = { sent: "challengeStatusSent", opened: "challengeStatusOpened", done: "challengeStatusDone" };
    return '<span class="chg-badge ' + esc(st) + '">' + esc(T(map[st] || "challengeStatusSent")) + "</span>";
  }
  function openMine() {
    if (!sbc()) { toast(T("challengeNeedLogin")); return; }
    var ui = openDialog('<h2 class="chg-h">🎯 ' + esc(T("myChallengesTitle")) + '</h2><div class="chg-list" data-rc="list"><p class="chg-empty">…</p></div><div class="chg-actions"><button type="button" class="chg-btn" data-rc="received">📥 ' + esc(T("receivedTitle")) + '</button><button type="button" class="chg-btn pri" data-rc="close">' + esc(T("commonClose")) + "</button></div>");
    ui.card.querySelector('[data-rc="close"]').onclick = ui.close;
    ui.card.querySelector('[data-rc="received"]').onclick = function () { ui.close(); openReceived(); };
    var list = ui.card.querySelector('[data-rc="list"]');
    Promise.resolve(sbc().rpc("list_my_challenges")).then(function (res) {
      var rows = (res && res.data) || [];
      if (res && res.error) { list.innerHTML = '<p class="chg-empty">' + esc(T("challengeErr")) + "</p>"; return; }
      if (!rows.length) { list.innerHTML = '<p class="chg-empty">' + esc(T("myChallengesEmpty")) + "</p>"; return; }
      list.innerHTML = rows.map(function (r) {
        return '<div class="chg-row"><div class="chg-row-main"><div class="chg-row-t">' + esc(r.title || "—") + "</div>" +
          '<div class="chg-row-sub">' + (r.recipient_label ? esc(TF("challengeTo", { name: r.recipient_label })) : "🔗") + "</div></div>" +
          statusBadge(r.status) +
          '<button type="button" class="chg-btn" data-tk="' + esc(r.token) + '">' + esc(T("challengeRelink")) + "</button></div>";
      }).join("");
      [].forEach.call(list.querySelectorAll("[data-tk]"), function (b) {
        b.onclick = function () { ui.close(); renderShare(b.getAttribute("data-tk")); };
      });
    }, function () { list.innerHTML = '<p class="chg-empty">' + esc(T("challengeErr")) + "</p>"; });
  }
  function openReceived() {
    if (!sbc()) { toast(T("challengeNeedLogin")); return; }
    var ui = openDialog('<h2 class="chg-h">📥 ' + esc(T("receivedTitle")) + '</h2><div class="chg-list" data-rc="list"><p class="chg-empty">…</p></div><div class="chg-actions"><button type="button" class="chg-btn pri" data-rc="close">' + esc(T("commonClose")) + "</button></div>");
    ui.card.querySelector('[data-rc="close"]').onclick = ui.close;
    var list = ui.card.querySelector('[data-rc="list"]');
    Promise.resolve(sbc().rpc("list_received_challenges")).then(function (res) {
      var rows = (res && res.data) || [];
      if (res && res.error) { list.innerHTML = '<p class="chg-empty">' + esc(T("challengeErr")) + "</p>"; return; }
      if (!rows.length) { list.innerHTML = '<p class="chg-empty">' + esc(T("receivedEmpty")) + "</p>"; return; }
      list.innerHTML = rows.map(function (r) {
        // NO SPOILER: the épreuve stays a surprise until the in-video announce —
        // never show the challenge title to its recipient.
        return '<div class="chg-row"><div class="chg-row-main"><div class="chg-row-t">🎁 ' + esc(T("receivedMasked")) + "</div>" +
          '<div class="chg-row-sub">' + esc(TF("challengeFromName", { name: r.sender_name || "Acto" })) + "</div></div>" +
          statusBadge(r.status) +
          '<a class="chg-btn pri" href="' + esc(baseUrl() + "defi.html?token=" + encodeURIComponent(r.token)) + '">' + esc(T("challengeRelever")) + "</a></div>";
      }).join("");
    }, function () { list.innerHTML = '<p class="chg-empty">' + esc(T("challengeErr")) + "</p>"; });
  }

  window.ActoChallenge = { open: open, openMine: openMine, openReceived: openReceived, label: function () { return T("challengeSend"); } };
})();
