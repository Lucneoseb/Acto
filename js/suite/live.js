/**
 * js/suite/live.js — Live match engine (Phase 2).
 *
 * Two roles, one codebase:
 *   PRESENTER  (#/match/live) — the referee control surface: current segment,
 *     chrono (impro / caucus / vote), transport, scores, score-visibility toggle.
 *   DISPLAY    (join.html?mode=display) — the public/projector board, read-only
 *     from snapshots the presenter broadcasts over BroadcastChannel (same-device,
 *     localStorage fallback) + Supabase Realtime keyed by join code (cross-device).
 *
 * The active match lives in localStorage (acto-suite:live:v1) so it survives a
 * reload and so the presenter can be reopened. Scores/penalties are ephemeral
 * to the live run and are NOT written back into the saved match template.
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(k) { return S.t(k); }
  function tf(k, v) { return S.tf(k, v); }

  var CHANNEL = "acto-live";
  var SNAP_KEY = "acto-live:snap:v1";
  var _bc = null;
  function chan() {
    if (_bc !== null) return _bc;
    try { _bc = new BroadcastChannel(CHANNEL); } catch (e) { _bc = false; }
    return _bc;
  }

  /* ---------- Supabase Realtime (cross-device, by join code) ----------
     The presenter publishes snapshots on a public channel keyed by the match's
     join CODE; the public display + record device subscribe by entering that
     code (no account needed). BroadcastChannel/localStorage above still cover
     same-device windows, so Realtime is purely additive and degrades to
     same-device if there's no network.

     TRUST MODEL (known limitation): this is a *public* broadcast channel, so any
     subscriber holding the code can also publish — a technical prankster in the
     audience could inject a forged scoreboard onto other viewers' screens (it is
     overwritten by the presenter's next legit update). The content is a public
     projector board, so impact is limited. To fully lock this down, switch to a
     Supabase Realtime *private* channel with an RLS policy on realtime.messages
     that only lets the authenticated match owner broadcast (viewers read-only). */
  var _rt = null, _rtRole = null;   // null | 'pub' | 'sub'
  function rtClient() { return window.actoSuiteSb || null; }
  // Channel keyed by the match's JOIN CODE so ANY device (logged in or not) can
  // view by entering the code. Presenter → its own sess.joinCode; a viewer / the
  // public join page → window.actoJoinCode. Falls back to the account id (legacy).
  function rtChannelName() {
    // Keyed solely on the join CODE. No code → no Realtime (a stray viewer fails
    // fast instead of silently subscribing to a channel nobody publishes to).
    var code = (sess && sess.joinCode) || window.actoJoinCode;
    return code ? ("acto-live:" + String(code).toUpperCase()) : null;
  }
  // Short, human-typeable code (no ambiguous 0/O/1/I).
  function genJoinCode() {
    var A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < 6; i++) s += A.charAt(Math.floor(Math.random() * A.length));
    return s;
  }
  /* ---- Registre serveur du match en direct ----------------------------------
     Le code de partage ne vivait QUE dans le localStorage de l'arbitre : le
     serveur ne savait pas qu'un match existait, et acceptait donc des votes pour
     n'importe quel code inventé. On déclare le code à l'entrée en direct, puis on
     rafraîchit périodiquement (battement de cœur) tant que le match dure.
     Silencieux par conception : hors ligne, le direct doit continuer de tourner. */
  var _runReg = { code: null, at: 0 };
  function registerRun() {
    var sb = rtClient();
    var code = sess && sess.joinCode;
    if (!sb || !code) return;
    // au plus une fois toutes les 5 min pour le même code
    if (_runReg.code === code && (Date.now() - _runReg.at) < 300000) return;
    _runReg = { code: code, at: Date.now() };
    try {
      Promise.resolve(sb.rpc("register_live_run", { p_code: code })).then(function (r) {
        if (r && r.error) { _runReg.at = 0; console.warn("[live] register_live_run", r.error.message || r.error); }
      }, function () { _runReg.at = 0; });   // réessaiera au prochain battement
    } catch (e) { _runReg.at = 0; }
  }

  function rtEnsurePublisher() {
    if (_rt) return _rt;
    var sb = rtClient(), name = rtChannelName(); if (!sb || !name) return null;
    try {
      _rt = sb.channel(name, { config: { broadcast: { self: false } } });
      // A late-joining subscriber pings 'hello' → resend the current snapshot.
      _rt.on("broadcast", { event: "hello" }, function () { broadcast(); });
      _rt.subscribe();
      _rtRole = "pub";
    } catch (e) { _rt = null; }
    return _rt;
  }
  // Strip heavy logo data-URLs when the snapshot would exceed Realtime's
  // broadcast size cap (~256KB). Better to sync a logo-less board (the display
  // falls back to a colour dot) cross-device than to silently drop everything.
  function slimSnap(snap) {
    var s;
    try { s = JSON.parse(JSON.stringify(snap)); } catch (e) { return snap; }
    if (s.teams) s.teams.forEach(function (t) { t.logo = null; });
    if (s.stars) ["or", "argent", "bronze"].forEach(function (k) { if (s.stars[k]) s.stars[k].logo = null; });
    return s;
  }
  function rtSend(snap) {
    var ch = (_rtRole === "pub") ? _rt : rtEnsurePublisher();
    if (!ch) return;
    var payload = snap;
    try { if (JSON.stringify(snap).length > 180000) payload = slimSnap(snap); } catch (e) { /* ignore */ }
    try { ch.send({ type: "broadcast", event: "snap", payload: payload }); } catch (e) { /* ignore */ }
  }
  function rtSubscribe(onSnap) {
    var sb = rtClient(), name = rtChannelName(); if (!sb || !name) return null;
    try {
      _rt = sb.channel(name, { config: { broadcast: { self: false } } });
      _rt.on("broadcast", { event: "snap" }, function (msg) { if (msg && msg.payload) onSnap(msg.payload); });
      _rt.subscribe(function (status) {
        if (status === "SUBSCRIBED") { try { _rt.send({ type: "broadcast", event: "hello", payload: {} }); } catch (e) { /* ignore */ } }
      });
      _rtRole = "sub";
    } catch (e) { _rt = null; }
    return _rt;
  }
  function rtTeardown() {
    if (!_rt) { _rtRole = null; return; }
    try { var sb = rtClient(); if (sb && sb.removeChannel) sb.removeChannel(_rt); else if (_rt.unsubscribe) _rt.unsubscribe(); } catch (e) { /* ignore */ }
    _rt = null; _rtRole = null;
  }

  /* ---------- end-of-chrono sound (Web Audio, no asset) ---------- */
  var _ac = null;
  function audioCtx() {
    try {
      if (!_ac) { var AC = window.AudioContext || window.webkitAudioContext; _ac = AC ? new AC() : null; }
      if (_ac && _ac.state === "suspended") _ac.resume();
    } catch (e) { _ac = null; }
    return _ac;
  }
  function beep(freq, start, dur) {
    var ac = audioCtx(); if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = freq;
    o.connect(g); g.connect(ac.destination);
    var t0 = ac.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function playEndSound() {
    beep(660, 0, 0.25); beep(880, 0.28, 0.25); beep(1180, 0.56, 0.45);
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* ignore */ }
  }
  // iOS/Safari n'autorisent la création et la reprise d'un AudioContext QUE
  // pendant un geste utilisateur. Le son de fin partant d'un timer, il ne
  // sortait jamais sur iPhone. On débloque donc le contexte au premier tap de
  // l'arbitre (silencieusement), pour que la sonnerie fonctionne ensuite.
  var _audioPrimed = false;
  function unlockAudio() {
    // audioCtx() fait déjà resume() s'il est suspendu : c'est le point clé, car
    // iOS RE-suspend le contexte à chaque passage en arrière-plan ou appel
    // entrant. Se verrouiller sur un drapeau une bonne fois tuerait la sonnerie
    // pour tout le reste du match — on repasse donc à chaque tap (coût nul).
    var ac = audioCtx(); if (!ac) return;
    if (_audioPrimed && ac.state === "running") return;
    try {
      var b = ac.createBuffer(1, 1, 22050);
      var src = ac.createBufferSource();
      src.buffer = b; src.connect(ac.destination); src.start(0);
      _audioPrimed = true;
    } catch (e) { /* on réessaiera au prochain tap */ }
  }

  /* ---------- Wake Lock : l'écran de l'arbitre ne doit pas s'éteindre ----------
     Sans ça le téléphone se verrouille en pleine impro et l'arbitre perd le
     chrono, les scores et la main. Réacquis au retour d'onglet (le verrou est
     perdu quand la page passe en arrière-plan). */
  var _wakeLock = null, _wakeLockPending = false, _wakeLockWanted = false;
  function requestWakeLock() {
    try {
      // _wakeLock n'est assigné qu'en asynchrone : sans le drapeau "pending",
      // chaque tap relancerait une demande concurrente et les sentinelles
      // précédentes fuiteraient (mesuré : 9 demandes pour 1 seul verrou utile).
      if (!navigator.wakeLock || _wakeLock || _wakeLockPending) return;
      _wakeLockPending = true; _wakeLockWanted = true;
      navigator.wakeLock.request("screen").then(function (wl) {
        _wakeLockPending = false;
        if (!_wakeLockWanted) { try { wl.release(); } catch (e) {} return; }  // on a quitté entre-temps
        _wakeLock = wl;
        wl.addEventListener("release", function () { _wakeLock = null; });
      }).catch(function () {
        _wakeLockPending = false;   // refusé (batterie faible, onglet caché) : sans gravité
      });
    } catch (e) { _wakeLockPending = false; }
  }
  function releaseWakeLock() {
    _wakeLockWanted = false;        // annule aussi une demande encore en vol
    try { if (_wakeLock) { _wakeLock.release(); _wakeLock = null; } } catch (e) { /* ignore */ }
  }
  function onVisibilityForWakeLock() {
    if (document.visibilityState === "visible" && document.body.classList.contains("suite-live-mode")) requestWakeLock();
  }

  /* ============================================================
     PRESENTER state + timer
     ============================================================ */
  var root = null, navigate = function () {};
  var sess = null, cursor = 0, phase = "announce";
  var tk = null, tTotal = 0, tRemaining = 0, tRunning = false, tEndAt = 0, tInterval = null;
  var CAUCUS_SEC = 30, VOTE_SEC = 20;
  var voteResult = null;            // {round, a, b} once the referee reveals the public tally

  function curSeg() { return (sess && sess.setlist && sess.setlist[cursor]) || null; }
  // L'état du chrono vivait uniquement en mémoire : un rafraîchissement en plein
  // match (ou un onglet tué par iOS) repartait à zéro sur l'impro en cours.
  // tEndAt étant une date absolue, un chrono en marche se reconstitue exactement.
  function snapshotLiveState() {
    if (!sess) return;
    sess.liveState = {
      phase: phase, cursor: cursor, tk: tk, tTotal: tTotal,
      tRemaining: tRemaining, tRunning: tRunning,
      tEndAt: tRunning ? tEndAt : 0, finished: finished,
      at: Date.now()          // horodatage : une partie oubliée n'est plus « en cours »
    };
  }
  function persist() { if (sess) { snapshotLiveState(); S.live.save(sess); } }

  function clearTick() { if (tInterval) { clearInterval(tInterval); tInterval = null; } }
  function timerStart(sec, kind) {
    clearTick();
    tk = kind; tTotal = sec; tRemaining = sec; tRunning = true; tEndAt = Date.now() + sec * 1000;
    tInterval = setInterval(tick, 250);
    persist(); renderPresenter(); broadcast();
  }
  function tick() {
    if (!tRunning) return;
    var rem = Math.max(0, Math.round((tEndAt - Date.now()) / 1000));
    if (rem !== tRemaining) { tRemaining = rem; renderChrono(); broadcastLocal(); }
    if (rem <= 0) { tRunning = false; clearTick(); onTimerEnd(); }
  }
  function timerPause() {
    if (!tRunning) return;
    tRunning = false; tRemaining = Math.max(0, Math.round((tEndAt - Date.now()) / 1000)); clearTick();
    persist(); renderPresenter(); broadcast();
  }
  function timerResume() {
    if (tRunning || tRemaining <= 0) return;
    tRunning = true; tEndAt = Date.now() + tRemaining * 1000; tInterval = setInterval(tick, 250);
    persist(); renderPresenter(); broadcast();
  }
  function timerReset(sec) {
    clearTick(); tRunning = false; tTotal = (sec != null ? sec : tTotal); tRemaining = tTotal;
    persist(); renderPresenter(); broadcast();
  }
  function timerAdd(d) {
    tRemaining = Math.max(0, tRemaining + d);
    if (tRemaining > tTotal) tTotal = tRemaining;
    if (tRunning) tEndAt = Date.now() + tRemaining * 1000;
    persist(); renderPresenter(); broadcast();
  }
  function onTimerEnd() {
    playEndSound();
    // Vote timer ending must NOT drop the phase — the referee still needs to reveal
    // the tally (the Reveal button is gated on phase==="vote").
    phase = (tk === "impro") ? "between" : (tk === "vote") ? "vote" : "announce";
    persist(); renderPresenter(); broadcast();
  }

  function startImpro() { var seg = curSeg(); if (!seg) return; phase = "running"; timerStart(seg.durationSec || 90, "impro"); }
  function doCaucus() { phase = "caucus"; timerStart((sess && sess.caucusSec) || CAUCUS_SEC, "caucus"); }
  function doVote() { voteResult = null; phase = "vote"; timerStart((sess && sess.voteSec) || VOTE_SEC, "vote"); }
  // Pull the public tally (anon RPC) for the current impro and reveal it on the board.
  function revealVote() {
    var sb = window.actoSuiteSb, code = sess && sess.joinCode, round = cursor;
    if (!sb || !code) { voteResult = { round: round, a: 0, b: 0 }; renderPresenter(); broadcast(); return; }
    Promise.resolve(sb.rpc("get_live_vote_tally", { p_code: code, p_round: round })).then(function (res) {
      var row = (res && res.data && res.data[0]) || { a: 0, b: 0 };
      voteResult = { round: round, a: +row.a || 0, b: +row.b || 0 };
      renderPresenter(); broadcast();
    }, function () { voteResult = { round: round, a: 0, b: 0 }; renderPresenter(); broadcast(); });
  }
  function primaryAction() {
    if (tRunning) { timerPause(); return; }
    if (tk && tRemaining > 0 && tRemaining < tTotal) { timerResume(); return; }
    startImpro();
  }
  function resetChrono() {
    // « Réinitialiser » est collé sous « Pause » : un faux clic en pleine impro
    // remettait le chrono à zéro sans recours. On confirme dès que le chrono
    // tourne OU qu'il a déjà été entamé. Le test « tRemaining < tTotal » seul
    // ratait le cas d'un « +30 s » (qui remonte tTotal au niveau de tRemaining).
    if ((tRunning || (tRemaining > 0 && tRemaining < tTotal)) &&
        !window.confirm(t("liveConfirmReset"))) return;
    var seg = curSeg(); phase = "announce"; timerReset(seg ? seg.durationSec : 0);
  }

  function gotoSeg(i) {
    if (i < 0 || i >= sess.setlist.length) return;
    cursor = i; sess.cursor = i; phase = "announce"; voteResult = null; clearTick(); tRunning = false; tk = null;
    var seg = curSeg(); timerReset(seg ? seg.durationSec : 0);
    persist();
  }
  // Changer d'impro tue le chrono en cours. « Réinitialiser » demande
  // confirmation, il serait incohérent que « Suivant »/« Précédent » — juste à
  // côté — abandonnent une impro en train d'être jouée sans rien demander.
  function confirmLeaveRunning() {
    return !tRunning || window.confirm(t("liveConfirmSwitchSeg"));
  }
  function nextSeg() { if (cursor < sess.setlist.length - 1 && confirmLeaveRunning()) gotoSeg(cursor + 1); }
  function prevSeg() { if (cursor > 0 && confirmLeaveRunning()) gotoSeg(cursor - 1); }
  function newImpro() {
    var seg = S.gen.newSegmentFor(sess.kind, sess.level); S.gen.fillSegment(seg, sess.level);
    sess.setlist.push(seg); cursor = sess.setlist.length - 1; sess.cursor = cursor;
    phase = "announce"; tk = null; timerReset(seg.durationSec); persist();
  }

  function scoreDelta(team, d) {
    if (!sess.scoring) return;
    var tm = sess.teams[team]; tm.score = Math.max(0, (tm.score || 0) + d);
    persist(); renderPresenter(); broadcast();
    if (finished) recordResults();   // a post-finish score correction flips outcomes
  }
  function togglePenalty(team, i) {
    var tm = sess.teams[team]; tm.penalties = tm.penalties || [false, false, false];
    // La 3e faute donne un point à l'adversaire : conséquence lourde, déclenchée
    // depuis une pastille minuscule. On confirme avant de valider.
    var wouldComplete = !tm.penalties[i] &&
      [0, 1, 2].every(function (k) { return k === i ? true : tm.penalties[k]; });
    if (wouldComplete) {
      var opp0 = sess.teams[team === 0 ? 1 : 0];
      var msg = tf("liveConfirmThirdPenalty", {
        team: tm.name || (team === 0 ? t("teamA") : t("teamB")),
        opponent: opp0.name || (team === 0 ? t("teamB") : t("teamA"))
      });
      if (!window.confirm(msg)) return;
    }
    tm.penalties[i] = !tm.penalties[i];
    if (tm.penalties[0] && tm.penalties[1] && tm.penalties[2]) {
      tm.penalties = [false, false, false];
      var opp = sess.teams[team === 0 ? 1 : 0]; opp.score = (opp.score || 0) + 1;
    }
    persist(); renderPresenter(); broadcast();
    if (finished) recordResults();   // the 3rd penalty bumps the opponent score → outcome can change
  }
  function toggleScores() { sess.showScores = !sess.showScores; persist(); renderPresenter(); broadcast(); }
  function finish() {
    if (!window.confirm(t("liveConfirmFinish"))) return;
    phase = "done"; finished = true; clearTick(); tRunning = false; persist(); renderPresenter(); broadcast();
    recordResults();
  }

  function joinUrl(mode) {
    var code = (sess && sess.joinCode) || "";
    return "join.html?code=" + encodeURIComponent(code) + (mode ? "&mode=" + mode : "");
  }
  function openPublicScreen() {
    try { window.open(joinUrl("display"), "acto-display", "width=1280,height=720"); } catch (e) { /* ignore */ }
    setTimeout(broadcast, 400);
  }
  function openRecordScreen() {
    try { window.open(joinUrl("record"), "acto-record", "width=960,height=720"); } catch (e) { /* ignore */ }
    setTimeout(broadcast, 400);
  }
  // Show the join code + QR so any device (no account needed) can open the
  // public screen or filming by entering the code or scanning the QR.
  // QR built locally (qrcode-generator) → no third-party request, no access-code
  // leak, fits the existing CSP (inline SVG). Returns "" if the lib is absent.
  function buildQrSvg(text) {
    try {
      if (!window.qrcode) return "";
      var qr = window.qrcode(0, "M");
      qr.addData(text); qr.make();
      return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    } catch (e) { return ""; }
  }
  function openCodeDialog() {
    var code = sess && sess.joinCode; if (!code) return;
    var base = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
    var url = base + "join.html?code=" + encodeURIComponent(code);
    var voteUrl = base + "vote.html?code=" + encodeURIComponent(code);
    var qrSvg = buildQrSvg(url);
    var voteQr = (sess && sess.scoring) ? buildQrSvg(voteUrl) : null;   // public vote is match-only
    function qrCol(icon, label, qr, u) {
      return '<div class="suite-code-qrcol">' +
        '<div class="suite-code-qrlabel">' + icon + ' ' + esc(label) + '</div>' +
        (qr ? '<div class="suite-code-qr" aria-label="QR">' + qr + '</div>' : '') +
        '<p class="suite-code-url">' + esc(u) + '</p>' +
      '</div>';
    }
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-code-dialog";
    dlg.innerHTML =
      '<div class="suite-dialog-body suite-code-body">' +
        '<h2 class="suite-dialog-title">📱 ' + esc(t("liveJoinTitle")) + '</h2>' +
        '<p class="suite-dialog-text">' + esc(t("liveJoinHelp")) + '</p>' +
        '<div class="suite-code-big">' + esc(code) + '</div>' +
        '<div class="suite-code-qrs">' +
          qrCol("🖥", t("liveJoinQrLabel"), qrSvg, url) +
          (voteQr ? qrCol("🗳", t("liveVoteQrLabel"), voteQr, voteUrl) : "") +
        '</div>' +
        '<div class="suite-dialog-actions">' +
          '<button type="button" data-r="copy" class="suite-btn suite-btn-ghost">' + esc(t("liveJoinCopy")) + '</button>' +
          (voteQr ? '<button type="button" data-r="copyvote" class="suite-btn suite-btn-ghost">🗳 ' + esc(t("liveCopyVote")) + '</button>' : '') +
          '<button type="button" data-r="close" class="suite-btn suite-btn-primary">' + esc(t("commonClose")) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) {} dlg.remove(); }
    dlg.querySelector('[data-r="close"]').onclick = close;
    function wireCopy(sel, copyUrl) {
      var btn = dlg.querySelector(sel); if (!btn) return;
      var label = btn.textContent;
      btn.onclick = function () {
        function ok() { btn.textContent = "✓"; setTimeout(function () { btn.textContent = label; }, 1500); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(copyUrl).then(ok, function () { window.prompt(label, copyUrl); });
        else window.prompt(label, copyUrl);
      };
    }
    wireCopy('[data-r="copy"]', url);
    wireCopy('[data-r="copyvote"]', voteUrl);
    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
    try { dlg.querySelector('[data-r="close"]').focus(); } catch (e) { /* keeps Escape working in the non-modal fallback */ }
  }

  /* ---------- étoiles (gold/silver/bronze) ---------- */
  function rosterPlayers() {
    var P = S.players, out = [];
    (sess.teams || []).forEach(function (tm, ti) {
      (tm.players || []).forEach(function (p) {
        if (!P.present(p)) return;                       // absent players don't play
        out.push({ team: ti, name: P.name(p), user_id: P.userId(p) });
      });
    });
    return out;
  }
  // Stable per-player key so same-named players on different teams never collide
  // in the public star vote (keyed on team+name, not the bare display name).
  function starKey(team, name) { return String(team) + "\x1f" + String(name); }
  // Light present-player list for the public star vote (names + team colour + key).
  function rosterForVote() {
    var P = S.players, out = [];
    (sess.teams || []).forEach(function (tm, ti) {
      (tm.players || []).forEach(function (p) {
        if (!P.present(p)) return;
        var nm = P.name(p); if (nm) out.push({ name: nm, team: ti, color: tm.color || "#888", key: starKey(ti, nm) });
      });
    });
    return out;
  }

  function resolveStars() {
    if (!sess) return null;
    var st = sess.stars || {};
    function r(s) {
      if (!s) return null;
      var tm = (sess.teams && sess.teams[s.team]) || {};
      return { name: s.name, team: s.team, color: tm.color || "#888", teamName: tm.name || "", logo: tm.logo || null };
    }
    return { or: r(st.or), argent: r(st.argent), bronze: r(st.bronze) };
  }
  function setStar(medal, val) {
    if (!sess.stars) sess.stars = { or: null, argent: null, bronze: null };
    sess.stars[medal] = val;   // {team,name,user_id} | null
    persist(); broadcast();
    if (finished) recordResults();   // re-submit so stars assigned post-match count
  }
  var finished = false;
  var starsReturn = "announce";
  function showStarsCeremony() { if (phase !== "stars") starsReturn = phase; phase = "stars"; renderPresenter(); broadcast(); }
  function hideStarsCeremony() { phase = (starsReturn === "done" ? "done" : "announce"); renderPresenter(); broadcast(); }

  function openStarsDialog() {
    var medals = [
      { key: "or", icon: "🥇", label: t("starGold") },
      { key: "argent", icon: "🥈", label: t("starSilver") },
      { key: "bronze", icon: "🥉", label: t("starBronze") }
    ];
    var roster = rosterPlayers();
    function optsFor(medalKey) {
      var cur = (sess.stars && sess.stars[medalKey]) || null;
      var o = '<option value="">' + esc(t("starNone")) + '</option>';
      roster.forEach(function (p, idx) {
        var sel = (cur && cur.team === p.team && cur.name === p.name) ? " selected" : "";
        var tmName = (sess.teams[p.team] && sess.teams[p.team].name) || (p.team === 0 ? t("teamA") : t("teamB"));
        o += '<option value="' + idx + '"' + sel + '>' + esc(p.name + " · " + tmName) + '</option>';
      });
      return o;
    }
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-stars-dialog";
    dlg.innerHTML = '<div class="suite-dialog-body">' +
      '<h2 class="suite-dialog-title">⭐ ' + esc(t("starsTitle")) + '</h2>' +
      (roster.length === 0 ? '<p class="suite-dialog-text">' + esc(t("starsNoPlayers")) + '</p>' : "") +
      medals.map(function (m) {
        return '<label class="suite-set-field"><span>' + m.icon + " " + esc(m.label) + '</span>' +
          '<select class="suite-edit-select" data-medal="' + m.key + '">' + optsFor(m.key) + '</select></label>';
      }).join("") +
      '<div class="suite-star-ranking"><div class="suite-star-rank-h">📊 ' + esc(t("starsPublicRanking")) + '</div>' +
        '<div class="suite-star-rank-body">' + esc(t("commonLoading")) + '</div></div>' +
      '<div class="suite-dialog-actions">' +
        '<button type="button" data-r="cancel" class="suite-btn suite-btn-ghost">' + esc(t("commonClose")) + '</button>' +
        (phase === "stars"
          ? '<button type="button" data-r="hide" class="suite-btn suite-btn-ghost">' + esc(t("starsHide")) + '</button>'
          : '') +
        '<button type="button" data-r="show" class="suite-btn suite-btn-primary">' + esc(t("starsShow")) + '</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); }
    dlg.querySelectorAll("select[data-medal]").forEach(function (sel) {
      sel.onchange = function () {
        var v = sel.value === "" ? null : roster[parseInt(sel.value, 10)];
        setStar(sel.getAttribute("data-medal"), v ? { team: v.team, name: v.name, user_id: v.user_id || null } : null);
      };
    });
    dlg.querySelector('[data-r="cancel"]').onclick = close;
    var hideBtn = dlg.querySelector('[data-r="hide"]');
    if (hideBtn) hideBtn.onclick = function () { close(); hideStarsCeremony(); };
    dlg.querySelector('[data-r="show"]').onclick = function () { close(); showStarsCeremony(); };

    // Public ranking — informational; the referee still assigns the medals.
    // Clicking a ranked jouteur fills the next empty medal (or → argent → bronze).
    (function () {
      var box = dlg.querySelector(".suite-star-rank-body");
      var sb = window.actoSuiteSb, code = sess && sess.joinCode;
      if (!box) return;
      if (!sb || !code) { box.textContent = t("starsPublicNone"); return; }
      Promise.resolve(sb.rpc("get_star_tally", { p_code: code })).then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) { box.textContent = t("starsPublicNone"); return; }
        var max = rows[0].votes || 1;
        box.innerHTML = rows.slice(0, 8).map(function (r, i) {
          // r.player is the team-qualified key (starKey); match it exactly so same-named
          // players on different teams stay distinct, and display only the name part.
          var idx = -1; roster.forEach(function (p, k) { if (starKey(p.team, p.name) === r.player) idx = k; });
          var dispName = (idx >= 0) ? roster[idx].name : String(r.player || "").split("\x1f").pop();
          return '<button type="button" class="suite-star-rank-row" data-idx="' + idx + '"' + (idx < 0 ? " disabled" : "") + '>' +
            '<span class="suite-star-rank-pos">' + (i + 1) + '</span>' +
            '<span class="suite-star-rank-nm">' + esc(dispName) + '</span>' +
            '<span class="suite-star-rank-bar"><span style="width:' + Math.round(100 * (r.votes / max)) + '%"></span></span>' +
            '<span class="suite-star-rank-n">' + r.votes + '</span>' +
          '</button>';
        }).join("");
        box.querySelectorAll(".suite-star-rank-row").forEach(function (b) {
          b.onclick = function () {
            var idx = parseInt(b.getAttribute("data-idx"), 10);
            if (isNaN(idx) || idx < 0 || !roster[idx]) return;
            var order = ["or", "argent", "bronze"];
            var slot = order.filter(function (k) { return !(sess.stars && sess.stars[k]); })[0] || "bronze";
            var v = roster[idx];
            setStar(slot, { team: v.team, name: v.name, user_id: v.user_id || null });
            var sel = dlg.querySelector('select[data-medal="' + slot + '"]');
            if (sel) sel.value = String(idx);
          };
        });
      }, function () { box.textContent = t("starsPublicNone"); });
    })();

    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
    else dlg.setAttribute("open", "");
  }

  /* ---------- per-player stats (record on match end) ---------- */
  function teamOutcome(i) {
    if (!sess.scoring) return "draw";
    var a = sess.teams[0].score || 0, b = sess.teams[1].score || 0;
    if (a === b) return "draw";
    var team0Wins = a > b;
    return ((i === 0) === team0Wins) ? "win" : "loss";
  }
  function starForPlayer(teamIdx, name, userId) {
    var st = sess.stars || {}, keys = ["or", "argent", "bronze"];
    for (var k = 0; k < keys.length; k++) {
      var s = st[keys[k]]; if (!s) continue;
      if (s.user_id) { if (s.user_id === userId) return keys[k]; continue; }   // linked star → match account only
      // Unlinked star → match by name+team only for an unlinked player (avoids
      // crediting a linked namesake on the same team).
      if (!userId && s.team === teamIdx && s.name === name) return keys[k];
    }
    return null;
  }
  // Submit results for linked players to Supabase. Idempotent server-side
  // (replaces this referee's rows for this match), so it's safe to call again
  // whenever scores/stars change after the match ends.
  function recordResults() {
    if (!sess || sess.kind !== "match" || !sess.scoring) return;
    var sb = window.actoSuiteSb;
    if (!sb || !window.actoUser) return;
    var P = S.players, results = [];
    (sess.teams || []).forEach(function (tm, ti) {
      var outcome = teamOutcome(ti);
      (tm.players || []).forEach(function (p) {
        if (!P.present(p)) return;
        var uid = P.userId(p); if (!uid) return;   // only linked accounts accrue stats
        var nm = P.name(p);
        results.push({ user_id: uid, name: nm, team: tm.name || "", outcome: outcome, star: starForPlayer(ti, nm, uid) });
      });
    });
    if (!results.length) return;
    try {
      Promise.resolve(sb.rpc("record_match_results", { p_match_uid: sess.runId || sess.id, p_results: results }))
        .then(function (res) { if (res && res.error) console.warn("[live] record stats failed", res.error); })
        .catch(function (e) { console.warn("[live] record stats error", e); });
    } catch (e) { /* ignore */ }
  }

  /* ---------- snapshot + broadcast ---------- */
  function snapshot() {
    var seg = curSeg();
    return {
      type: "snapshot", ts: Date.now(),
      code: sess.joinCode || "",          // so a viewer can reject a leftover snap from another match
      title: sess.title || "",
      scoring: !!sess.scoring, showScores: !!sess.showScores,
      phase: phase,
      teams: sess.teams.map(function (tm) {
        return { name: tm.name || "", color: tm.color || "#888", logo: tm.logo || null,
          score: tm.score || 0, penalties: (tm.penalties || [false, false, false]).slice() };
      }),
      kind: sess.kind || "match",
      stars: resolveStars(),
      voteResult: voteResult,                                  // public tally once revealed (else null)
      roster: (phase === "stars") ? rosterForVote() : null,    // present players, for the public star vote
      segIndex: cursor, segTotal: sess.setlist.length,
      seg: seg ? {
        type: seg.type || "impro",
        title: S.gen.segTitle(seg),         // generic headline (category / warmup / exercise)
        subtitle: S.gen.segSubtitle(seg),   // generic sub (theme / description)
        category: seg.freeCategory ? null : (seg.category || null),
        freeCategory: !!seg.freeCategory,
        theme: seg.theme || null,
        nature: (sess.kind === "match" && seg.nature) ? seg.nature : null,
        players: seg.players || null, durationSec: seg.durationSec || 0, starter: seg.starter || null
      } : null,
      timer: { kind: tk, total: tTotal, remaining: tRemaining, running: tRunning, endAt: tRunning ? tEndAt : 0 }
    };
  }
  // Same-device fan-out (cheap; fine on every timer tick).
  function broadcastLocal(snap) {
    snap = snap || snapshot();
    var c = chan(); if (c) { try { c.postMessage(snap); } catch (e) { /* ignore */ } }
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch (e) { /* ignore */ }
    return snap;
  }
  // Full fan-out incl. cross-device Realtime. Remote clients reconstruct the
  // running clock from timer.endAt, so we deliberately do NOT push Realtime on
  // every per-second tick — only on real state changes (start/pause/score/
  // phase/segment/stars/finish), which all route through here.
  function broadcast() {
    registerRun();   // battement de cœur du registre (auto-limité à 1×/5 min)
    if (!sess) return;
    var snap = broadcastLocal();
    rtSend(snap);
  }

  /* ============================================================
     PRESENTER render
     ============================================================ */
  function mountPresenter(container, nav) {
    root = container; navigate = nav || navigate;
    sess = S.live.load();
    if (!sess) { navigate("#/"); return; }
    if (!sess.joinCode) { sess.joinCode = genJoinCode(); S.live.save(sess); }   // viewing code for this run
    cursor = Math.min(sess.cursor || 0, Math.max(0, sess.setlist.length - 1));
    phase = "announce"; tk = null; tRunning = false; finished = false; voteResult = null;
    var seg = curSeg(); tTotal = seg ? seg.durationSec : 0; tRemaining = tTotal;
    // Reprise après rafraîchissement / onglet tué : on restaure l'impro en cours
    // et son chrono. tEndAt est absolu, donc un chrono qui tournait reprend à la
    // bonne seconde (et se termine tout seul s'il a expiré entre-temps).
    var ls = sess.liveState;
    if (ls && typeof ls.cursor === "number") {
      cursor = Math.min(ls.cursor, Math.max(0, sess.setlist.length - 1));
      seg = curSeg();
      phase = ls.phase || "announce"; tk = ls.tk || null; finished = !!ls.finished;
      tTotal = ls.tTotal || (seg ? seg.durationSec : 0);
      if (ls.tRunning && ls.tEndAt) {
        tRemaining = Math.max(0, Math.round((ls.tEndAt - Date.now()) / 1000));
        if (tRemaining > 0) { tRunning = true; tEndAt = ls.tEndAt; tInterval = setInterval(tick, 250); }
        else { tRunning = false; phase = (tk === "impro") ? "between" : (tk === "vote") ? "vote" : "announce"; }
      } else {
        tRemaining = (typeof ls.tRemaining === "number") ? ls.tRemaining : tTotal;
      }
    }
    document.body.classList.add("suite-live-mode");
    // L'écran ne doit pas s'éteindre pendant le match (réacquis au retour d'onglet).
    requestWakeLock();
    document.addEventListener("visibilitychange", onVisibilityForWakeLock);
    var c = chan();
    if (c) c.onmessage = function (ev) { if (ev.data && ev.data.type === "hello") broadcast(); };
    rtEnsurePublisher();   // start the cross-device channel (answers remote 'hello')
    registerRun();         // déclare le code côté serveur : sans ça les votes sont refusés
    // Persister tout de suite : (a) l'état restauré/corrigé devient la référence,
    // (b) liveState existe dès l'ouverture du direct, ce qui permet à l'éditeur
    // de savoir qu'une partie est en cours avant même la 1re action de l'arbitre.
    persist();
    renderPresenter(); broadcast();
  }

  function chronoClass() { if (tRemaining <= 10) return "is-danger"; if (tRemaining <= 30) return "is-warn"; return ""; }
  function renderChrono() {
    var d = root && root.querySelector("#liveChrono");
    if (d) { d.textContent = S.formatSec(tRemaining); d.className = "live-chrono " + chronoClass(); }
    var bar = root && root.querySelector("#liveBar");
    if (bar) bar.style.width = (tTotal > 0 ? (100 * (tTotal - tRemaining) / tTotal) : 0) + "%";
  }

  function segHeadline(seg) {
    if (!seg) return t("liveEmpty");
    return S.gen.segTitle(seg) || t("valueNone");
  }
  function editRoute() {
    var k = sess && sess.kind;
    var base = (k === "training") ? "train" : (k || "match");
    return "#/" + base + "/edit";
  }

  function renderPresenter() {
    if (!root) return;
    var seg = curSeg();
    var nat = S.natureLabels();
    var primaryLabel = tRunning ? t("livePause")
      : (tk && tRemaining > 0 && tRemaining < tTotal) ? t("liveResume") : t("liveStart");

    var showNature = sess.kind === "match" && seg && seg.nature;
    var sub = seg ? S.gen.segSubtitle(seg) : "";
    var segBlock = seg ? (
      '<div class="live-seg">' +
        '<div class="live-seg-top">' +
          (showNature
            ? '<span class="suite-nature-pill' + (seg.nature === "comparee" ? " is-comparee" : "") + '">' + esc(seg.nature === "comparee" ? nat.comparee : nat.mixte) + '</span>'
            : '<span class="suite-nature-pill" style="visibility:hidden">·</span>') +
          '<span class="live-seg-n">' + esc(tf("liveSeg", { n: cursor + 1, total: sess.setlist.length })) + '</span>' +
        '</div>' +
        '<div class="live-cat">' + esc(segHeadline(seg)) + '</div>' +
        (sub ? '<div class="live-theme">' + esc(sub) + '</div>' : '') +
        '<div class="live-meta">' +
          (seg.players ? '<span>👥 ' + esc(seg.players) + '</span>' : '') +
          '<span>⏱ ' + esc(S.formatSec(seg.durationSec)) + '</span>' +
        '</div>' +
      '</div>'
    ) : '<div class="live-seg live-seg-empty">' + esc(t("liveEmpty")) + '</div>';

    var chronoBlock =
      '<div class="live-chrono-wrap">' +
        '<div id="liveChrono" class="live-chrono ' + chronoClass() + '">' + esc(S.formatSec(tRemaining)) + '</div>' +
        '<div class="live-bar"><span id="liveBar" style="width:' + (tTotal > 0 ? (100 * (tTotal - tRemaining) / tTotal) : 0) + '%"></span></div>' +
        '<div class="live-timer-btns">' +
          '<button class="suite-btn suite-btn-primary live-prim" data-act="primary"' + (seg ? '' : ' disabled') + '>' + esc(primaryLabel) + '</button>' +
          '<button class="suite-btn suite-btn-ghost" data-act="reset">' + esc(t("liveReset")) + '</button>' +
          '<button class="suite-btn suite-btn-ghost" data-act="add30">+30s</button>' +
        '</div>' +
        '<div class="live-phase-btns">' +
          '<button class="suite-btn suite-btn-ghost' + (phase === "caucus" ? " is-on" : "") + '" data-act="caucus">⏸ ' + esc(t("liveCaucus")) + '</button>' +
          (sess.scoring ? '<button class="suite-btn suite-btn-ghost' + (phase === "vote" ? " is-on" : "") + '" data-act="vote">🗳 ' + esc(t("liveVote")) + '</button>' : '') +
          (sess.scoring && phase === "vote" ? '<button class="suite-btn suite-btn-primary" data-act="reveal">📊 ' + esc(t("liveReveal")) + '</button>' : '') +
        '</div>' +
        (sess.scoring && phase === "vote" && voteResult && voteResult.round === cursor
          ? '<div class="live-vote-result">📊 ' + esc(t("voteResultTitle")) + ' — ' +
              '<b>' + voteResult.a + '</b> ' + esc(teamLabel(0)) + ' · <b>' + voteResult.b + '</b> ' + esc(teamLabel(1)) + '</div>'
          : '') +
      '</div>';

    var scoreBlock = sess.scoring ? (
      '<div class="live-scores">' + teamScore(0) + teamScore(1) + '</div>'
    ) : '';

    // End-of-match row: Étoiles (scoring only) + the single "Fin de match"
    // (finish) action. This is now the ONLY way to end — no transport/top-bar
    // "Terminer" duplicate.
    var endRow =
      '<div class="live-stars-row">' +
        (sess.scoring ? '<button class="suite-btn suite-btn-ghost' + (phase === "stars" ? " is-on" : "") + '" data-act="stars">⭐ ' + esc(t("starsBtn")) + '</button>' : '') +
        '<button class="suite-btn suite-btn-primary" data-act="finish">🏁 ' + esc(t(sess.scoring ? "liveFinishMatch" : "liveFinish")) + '</button>' +
      '</div>';

    var atLast = cursor >= sess.setlist.length - 1;
    var transport =
      '<div class="live-transport">' +
        '<button class="suite-btn suite-btn-ghost" data-act="prev"' + (cursor <= 0 ? ' disabled' : '') + '>‹ ' + esc(t("livePrev")) + '</button>' +
        '<button class="suite-btn suite-btn-primary" data-act="next"' + (atLast ? ' disabled' : '') + '>' + esc(t("liveNext")) + ' ›</button>' +
      '</div>';

    var footer =
      '<div class="live-foot">' +
        '<button class="suite-btn suite-btn-ghost" data-act="screen">🖥 ' + esc(t("liveOpenScreen")) + '</button>' +
        '<button class="suite-btn suite-btn-ghost" data-act="record">🎥 ' + esc(t("liveOpenRecord")) + '</button>' +
        '<button class="suite-btn suite-btn-ghost" data-act="joincode">📱 ' + esc(t("liveJoinCode")) + '</button>' +
        // Scores visibility toggle is meaningless without scoring (Spectacle).
        (sess.scoring ? '<button class="suite-btn suite-btn-ghost live-scores-toggle' + (sess.showScores ? " is-on" : "") + '" data-act="togglescores">' +
          (sess.showScores ? "👁 " + esc(t("liveScoresOn")) : "🚫 " + esc(t("liveScoresOff"))) +
        '</button>' : '') +
      '</div>';

    var doneBlock = phase === "done" ? doneScreen() : "";

    root.innerHTML =
      '<div class="live-bar-top">' +
        '<button class="suite-back" data-act="back">' + esc(t("liveBack")) + '</button>' +
        '<span class="live-title">' + esc(sess.title || t(sess.kind === "show" ? "showTitle" : sess.kind === "training" ? "trainTitle" : "matchTitle")) + '</span>' +
      '</div>' +
      doneBlock +
      segBlock + chronoBlock + scoreBlock + endRow + transport + footer;

    wirePresenter();
  }

  function teamLabel(i) { var tm = sess.teams[i]; return (tm && tm.name) || (i === 0 ? t("teamA") : t("teamB")); }
  function teamScore(i) {
    var tm = sess.teams[i];
    var nm = tm.name || (i === 0 ? t("teamA") : t("teamB"));
    var dots = "";
    var pen = tm.penalties || [false, false, false];
    for (var p = 0; p < 3; p++) dots += '<button class="live-pen-dot' + (pen[p] ? " is-on" : "") + '" data-act="pen" data-team="' + i + '" data-i="' + p + '" aria-label="' + esc(t("livePenalty")) + '"></button>';
    return '<div class="live-team" style="--team:' + esc(tm.color || "#888") + '">' +
      '<div class="live-team-h">' +
        (tm.logo ? '<img class="live-team-logo" src="' + esc(tm.logo) + '" alt="" />' : '<span class="suite-tc-dot" style="background:' + esc(tm.color || "#888") + '"></span>') +
        '<span class="live-team-nm">' + esc(nm) + '</span>' +
      '</div>' +
      '<div class="live-score-row">' +
        '<button class="live-score-btn" data-act="dec" data-team="' + i + '">−</button>' +
        '<span class="live-score-val">' + (tm.score || 0) + '</span>' +
        '<button class="live-score-btn" data-act="inc" data-team="' + i + '">+</button>' +
      '</div>' +
      '<div class="live-pens">' + dots + '</div>' +
    '</div>';
  }

  function doneScreen() {
    var a = sess.teams[0], b = sess.teams[1];
    var msg;
    if (!sess.scoring) msg = t("liveDoneTitle");
    else if ((a.score || 0) === (b.score || 0)) msg = t("liveDraw");
    else {
      var w = (a.score || 0) > (b.score || 0) ? a : b;
      msg = tf("liveWinner", { team: w.name || (w === a ? t("teamA") : t("teamB")) });
    }
    return '<div class="live-done">' +
      '<div class="live-done-title">' + esc(t("liveDoneTitle")) + '</div>' +
      (sess.scoring ? '<div class="live-done-score">' + (a.score || 0) + ' – ' + (b.score || 0) + '</div>' : '') +
      '<div class="live-done-msg">' + esc(msg) + '</div>' +
    '</div>';
  }

  function wirePresenter() {
    root.querySelectorAll("[data-act]").forEach(function (btn) {
      var act = btn.getAttribute("data-act");
      btn.onclick = function () {
        // Tout tap de l'arbitre est un geste utilisateur valide : on en profite
        // pour débloquer l'audio (iOS) et (re)prendre le verrou d'écran.
        unlockAudio(); requestWakeLock();
        switch (act) {
          case "back": cleanup(); navigate(editRoute()); break;
          case "finish": finish(); break;
          case "primary": primaryAction(); break;
          case "reset": resetChrono(); break;
          case "add30": timerAdd(30); break;
          case "caucus": doCaucus(); break;
          case "vote": doVote(); break;
          case "reveal": revealVote(); break;
          case "prev": prevSeg(); break;
          case "next": nextSeg(); break;
          case "inc": scoreDelta(+btn.getAttribute("data-team"), 1); break;
          case "dec": scoreDelta(+btn.getAttribute("data-team"), -1); break;
          case "pen": togglePenalty(+btn.getAttribute("data-team"), +btn.getAttribute("data-i")); break;
          case "togglescores": toggleScores(); break;
          case "stars": openStarsDialog(); break;
          case "screen": openPublicScreen(); break;
          case "record": openRecordScreen(); break;
          case "joincode": openCodeDialog(); break;
        }
      };
    });
  }

  /* ============================================================
     DISPLAY (public board)
     ============================================================ */
  var dRoot = null, dSnap = null, dTick = null, redraw = function () {};

  // Shared snapshot inflow for any read-only role (display + record): same-device
  // (BroadcastChannel + storage) AND cross-device (Realtime). Calls redraw() on
  // each incoming snapshot. redraw is set by whichever role mounted.
  function applyIncoming(snap) { if (snap && snap.type === "snapshot") { dSnap = snap; redraw(); } }
  function onStorage(e) {
    if (e.key === SNAP_KEY && e.newValue) { try { applyIncoming(JSON.parse(e.newValue)); } catch (err) { /* ignore */ } }
  }
  function startSubscriptions() {
    // Seed from the local snapshot only if it's recent — otherwise a device
    // that once ran a presenter would flash an old match before the first
    // cross-device snapshot arrives.
    try {
      var raw = localStorage.getItem(SNAP_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        // Recent AND (for a code viewer) belonging to the code being joined — a
        // device that hosted a different match must not flash its leftover board.
        var fresh = s && s.ts && (Date.now() - s.ts) < 300000;
        var codeOk = !window.actoJoinCode || (s && String(s.code || "").toUpperCase() === String(window.actoJoinCode).toUpperCase());
        if (fresh && codeOk) dSnap = s;
      }
    } catch (e) { /* ignore */ }
    var c = chan();
    if (c) {
      c.onmessage = function (ev) { applyIncoming(ev.data); };
      try { c.postMessage({ type: "hello" }); } catch (e) { /* ignore */ }
    }
    window.addEventListener("storage", onStorage);
    rtSubscribe(function (snap) { applyIncoming(snap); });
  }

  function mountDisplay(container) {
    dRoot = container;
    document.body.classList.add("suite-display-mode");
    redraw = renderDisplay;
    startSubscriptions();
    dTick = setInterval(renderDisplayClock, 250);
    renderDisplay();
  }
  function displayRemaining() {
    if (!dSnap || !dSnap.timer) return 0;
    var tm = dSnap.timer;
    if (tm.running && tm.endAt) return Math.max(0, Math.round((tm.endAt - Date.now()) / 1000));
    return tm.remaining || 0;
  }
  function renderDisplayClock() {
    var el = dRoot && dRoot.querySelector("#dispClock");
    if (el && dSnap) el.textContent = S.formatSec(displayRemaining());
  }

  function dispTeam(snap, i, showScore) {
    var tm = snap.teams[i];
    var nm = tm.name || (i === 0 ? t("teamA") : t("teamB"));
    // Penalties (fautes) shown on the public board for matches.
    var pens = "";
    if (snap.scoring) {
      var p = tm.penalties || [false, false, false];
      pens = '<div class="disp-pens">' +
        p.map(function (on) { return '<span class="disp-pen-dot' + (on ? " is-on" : "") + '"></span>'; }).join("") +
      '</div>';
    }
    return '<div class="disp-team disp-team-' + (i === 0 ? "a" : "b") + '" style="--team:' + esc(tm.color || "#888") + '">' +
      (tm.logo ? '<img class="disp-logo" src="' + esc(tm.logo) + '" alt="" />' : '<div class="disp-logo disp-logo-ph"></div>') +
      '<div class="disp-team-nm">' + esc(nm) + '</div>' +
      (showScore ? '<div class="disp-score">' + (tm.score || 0) + '</div>' : '') +
      pens +
    '</div>';
  }

  function renderDisplay() {
    if (!dRoot) return;
    if (!dSnap) { dRoot.innerHTML = '<div class="disp-wait">' + esc(t("liveWaiting")) + '</div>'; return; }
    var snap = dSnap;
    var showScore = snap.scoring && snap.showScores;

    // Revealed public vote takes priority over the plain "vote in progress" overlay.
    // Phase-gated so a revealed tally never shadows the done / stars / next-impro screens.
    if (snap.phase === "vote" && snap.voteResult && snap.voteResult.round === snap.segIndex) {
      var vr = snap.voteResult;
      var win = vr.a > vr.b ? 0 : (vr.b > vr.a ? 1 : -1);
      var teams = snap.teams || [];
      var nm = function (i) { return (teams[i] && teams[i].name) || (i === 0 ? t("teamA") : t("teamB")); };
      var col = function (i) { return (teams[i] && teams[i].color) || "#888"; };
      var main = (win < 0)
        ? tf("voteTie", { a: vr.a, b: vr.b })
        : tf("voteWinsBy", { team: nm(win), a: Math.max(vr.a, vr.b), b: Math.min(vr.a, vr.b) });
      dRoot.innerHTML =
        '<div class="disp-overlay disp-vote-result">' +
          '<div class="disp-overlay-label">🗳 ' + esc(t("voteResultTitle")) + '</div>' +
          '<div class="disp-vote-main"' + (win >= 0 ? ' style="color:' + esc(col(win)) + '"' : '') + '>' + esc(main) + '</div>' +
          '<div class="disp-final">' + vr.a + ' – ' + vr.b + '</div>' +
        '</div>';
      return;
    }
    if (snap.phase === "caucus" || snap.phase === "vote") {
      var lbl = snap.phase === "caucus" ? t("liveCaucusScreen") : t("liveVoteScreen");
      dRoot.innerHTML =
        '<div class="disp-overlay">' +
          '<div class="disp-overlay-label">' + esc(lbl) + '</div>' +
          '<div id="dispClock" class="disp-clock disp-clock-big">' + esc(S.formatSec(displayRemaining())) + '</div>' +
          (snap.phase === "vote" ? '<div class="disp-vote-hint">🗳 ' + esc(t("liveVoteScanHint")) + '</div>' : '') +
        '</div>';
      return;
    }
    if (snap.phase === "stars") {
      var st = snap.stars || {};
      var starRow = function (medal, label, s) {
        var who = s
          ? '<span class="disp-star-name">' + esc(s.name) + '</span>' +
            (s.teamName ? '<span class="disp-star-team" style="--team:' + esc(s.color || "#888") + '">' + esc(s.teamName) + '</span>' : '')
          : '<span class="disp-star-empty">—</span>';
        return '<div class="disp-star-row">' +
          '<span class="disp-star-medal">' + medal + '</span>' +
          '<span class="disp-star-label">' + esc(label) + '</span>' +
          who +
        '</div>';
      };
      dRoot.innerHTML =
        '<div class="disp-overlay disp-stars">' +
          '<div class="disp-overlay-label">⭐ ' + esc(t("starsTitle")) + '</div>' +
          '<div class="disp-stars-list">' +
            starRow("🥇", t("starGold"), st.or) +
            starRow("🥈", t("starSilver"), st.argent) +
            starRow("🥉", t("starBronze"), st.bronze) +
          '</div>' +
        '</div>';
      return;
    }
    if (snap.phase === "done") {
      var a = snap.teams[0], b = snap.teams[1], msg;
      if (!snap.scoring) msg = "";
      else if ((a.score || 0) === (b.score || 0)) msg = t("liveDraw");
      else { var w = (a.score || 0) > (b.score || 0) ? a : b; msg = tf("liveWinner", { team: w.name || "" }); }
      dRoot.innerHTML =
        '<div class="disp-overlay">' +
          '<div class="disp-overlay-label">' + esc(t("liveDoneTitle")) + '</div>' +
          (snap.scoring ? '<div class="disp-final">' + (a.score || 0) + ' – ' + (b.score || 0) + '</div>' : '') +
          (msg ? '<div class="disp-winner">' + esc(msg) + '</div>' : '') +
        '</div>';
      return;
    }

    var seg = snap.seg;
    var nat = S.natureLabels();
    // snapshot carries a generic title/subtitle so the board renders any kind
    // (impro category, warm-up name, exercise name).
    var headline = seg ? (seg.title || "") : t("liveGetReady");
    var subline = seg ? (seg.subtitle || "") : "";

    var natePill = (seg && seg.nature)
      ? '<div class="disp-nature' + (seg.nature === "comparee" ? " is-comparee" : "") + '">' + esc(seg.nature === "comparee" ? nat.comparee : nat.mixte) + '</div>' : '';
    var clock = '<div id="dispClock" class="disp-clock">' + esc(S.formatSec(displayRemaining())) + '</div>';
    var info =
      '<div class="disp-info">' +
        '<div class="disp-cat">' + esc(headline) + '</div>' +
        (subline ? '<div class="disp-theme">' + esc(subline) + '</div>' : '') +
        (seg && seg.players ? '<div class="disp-players">👥 ' + esc(seg.players) + '</div>' : '') +
      '</div>';
    var hasTeams = snap.teams && snap.teams.length >= 2;

    dRoot.innerHTML = hasTeams
      ? '<div class="disp-board">' +
          '<div class="disp-teams">' +
            dispTeam(snap, 0, showScore) +
            '<div class="disp-center">' + clock + natePill + '</div>' +
            dispTeam(snap, 1, showScore) +
          '</div>' + info +
        '</div>'
      // Show / Training: no teams — centered clock board.
      : '<div class="disp-board disp-board-solo">' +
          '<div class="disp-solo-top">' + clock + natePill + '</div>' + info +
        '</div>'
      ;
    dRoot.innerHTML +=
      '<button class="disp-fs" data-act="fs" aria-label="' + esc(t("liveFullscreen")) + '">⛶</button>';

    var fs = dRoot.querySelector('[data-act="fs"]');
    if (fs) fs.onclick = function () {
      try {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      } catch (e) { /* ignore */ }
    };
  }

  /* ============================================================
     RECORD device (join.html?mode=record) — a 3rd role: camera + match overlay,
     synced from the same snapshots as the public display (Realtime +
     same-device). Lets a phone/PC film the match while staying in sync.
     ============================================================ */
  var recStream = null, recRecorder = null, recChunks = [], recState = "idle", recStartAt = 0, recMounted = false;

  function mountRecord(container, nav) {
    dRoot = container; navigate = nav || navigate;
    document.body.classList.add("suite-record-mode");
    // Static shell rendered ONCE (re-rendering would kill the <video> stream).
    dRoot.innerHTML =
      '<div class="rec-stage">' +
        '<div class="rec-videowrap">' +
          '<video id="recVideo" class="rec-video" autoplay muted playsinline></video>' +
          '<div class="rec-dot" id="recDot" hidden></div>' +
          '<div class="rec-overlay"><div class="rec-info" id="recInfo"></div></div>' +
        '</div>' +
        '<div class="rec-controls">' +
          '<button class="suite-btn suite-btn-primary rec-toggle" id="recToggle" data-act="rec-toggle">⏺ ' + esc(t("recStart")) + '</button>' +
          '<span class="rec-status" id="recStatus"></span>' +
          '<button class="suite-btn suite-btn-ghost" data-act="rec-fs">⛶</button>' +
          '<button class="suite-back" data-act="rec-back">' + esc(t("liveBack")) + '</button>' +
        '</div>' +
        '<div class="rec-msg" id="recMsg" hidden></div>' +
      '</div>';
    redraw = updateRecordInfo;
    recMounted = true;
    startSubscriptions();
    dTick = setInterval(function () {
      var el = dRoot && dRoot.querySelector("#recClock"); if (el && dSnap) el.textContent = S.formatSec(displayRemaining());
      if (recState === "recording") updateRecStatus();   // keep the elapsed-time readout live
    }, 250);
    updateRecordInfo();
    wireRecord();
    startCamera();
  }

  function recTeam(snap, i, showScore) {
    var tm = snap.teams[i], nm = tm.name || (i === 0 ? t("teamA") : t("teamB"));
    return '<div class="rec-team" style="--team:' + esc(tm.color || "#888") + '">' +
      (tm.logo ? '<img class="rec-team-logo" src="' + esc(tm.logo) + '" alt="" />' : '<span class="rec-team-dot" style="background:' + esc(tm.color || "#888") + '"></span>') +
      '<span class="rec-team-nm">' + esc(nm) + '</span>' +
      (showScore ? '<span class="rec-team-sc">' + (tm.score || 0) + '</span>' : '') +
    '</div>';
  }
  function updateRecordInfo() {
    var box = dRoot && dRoot.querySelector("#recInfo"); if (!box) return;
    var snap = dSnap;
    if (!snap) { box.innerHTML = '<div class="rec-cat">' + esc(t("liveWaiting")) + '</div>'; return; }
    var showScore = snap.scoring && snap.showScores;
    var clock = '<div id="recClock" class="rec-clock">' + esc(S.formatSec(displayRemaining())) + '</div>';
    var seg = snap.seg;
    var headline = (snap.phase === "done") ? t("liveDoneTitle") : (seg ? (seg.title || "") : t("liveGetReady"));
    var subline = (snap.phase === "done") ? "" : (seg ? (seg.subtitle || "") : "");
    // Solo layout (Spectacle / no teams): the show title identifies the recording.
    var teamsRow = (snap.teams && snap.teams.length >= 2)
      ? '<div class="rec-teams">' + recTeam(snap, 0, showScore) + clock + recTeam(snap, 1, showScore) + '</div>'
      : '<div class="rec-teams rec-teams-solo">' +
          (snap.title ? '<div class="rec-showtitle">' + esc(snap.title) + '</div>' : '') +
          clock +
        '</div>';
    box.innerHTML = teamsRow +
      '<div class="rec-cat">' + esc(headline) + '</div>' +
      (subline ? '<div class="rec-theme">' + esc(subline) + '</div>' : '');
  }

  function showRecMsg(m) { var el = dRoot && dRoot.querySelector("#recMsg"); if (el) { el.textContent = m; el.hidden = !m; } }
  function updateRecStatus() {
    var btn = dRoot && dRoot.querySelector("#recToggle"), st = dRoot && dRoot.querySelector("#recStatus"), dot = dRoot && dRoot.querySelector("#recDot");
    var rec = recState === "recording";
    if (btn) { btn.classList.toggle("is-recording", rec); btn.innerHTML = rec ? ("⏹ " + esc(t("recStop"))) : ("⏺ " + esc(t("recStart"))); }
    if (dot) dot.hidden = !rec;
    if (st) st.textContent = rec ? ("● " + S.formatSec(Math.round((Date.now() - recStartAt) / 1000))) : (recStream ? t("recReady") : "");
  }

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showRecMsg(t("recNoCamera")); return; }
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (stream) {
      // If the user navigated away before the prompt resolved, don't keep the
      // camera/mic alive on an unmounted view — release it immediately.
      if (!recMounted) { stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e) { /* ignore */ } }); return; }
      recStream = stream;
      var v = dRoot && dRoot.querySelector("#recVideo"); if (v) v.srcObject = stream;
      showRecMsg(""); updateRecStatus();
    }).catch(function () { if (recMounted) showRecMsg(t("recCameraDenied")); });
  }
  function stopCamera() {
    // If a take is in progress, let recRecorder.stop() flush + onstop save it
    // BEFORE we clear chunks (otherwise the whole recording is silently lost).
    var wasRecording = recRecorder && recState === "recording";
    try { if (wasRecording) recRecorder.stop(); } catch (e) { /* ignore */ }
    if (recStream) { recStream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e) { /* ignore */ } }); recStream = null; }
    if (!wasRecording) { recRecorder = null; recChunks = []; }
    recState = "idle";
  }
  function toggleRecord() {
    if (!recStream) { startCamera(); return; }
    if (recState === "recording") { try { recRecorder.stop(); } catch (e) { /* ignore */ } return; }
    try {
      recChunks = [];
      recRecorder = new MediaRecorder(recStream);
      recRecorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
      recRecorder.onstop = function () { saveRecording(); recState = "idle"; updateRecStatus(); };
      recRecorder.start();
      recState = "recording"; recStartAt = Date.now(); updateRecStatus();
    } catch (e) { showRecMsg(t("recError")); }
  }
  function saveRecording() {
    if (!recChunks.length) return;
    try {
      var blob = new Blob(recChunks, { type: recChunks[0].type || "video/webm" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var cat = (dSnap && dSnap.seg && dSnap.seg.title) ? String(dSnap.seg.title).replace(/[^a-z0-9]+/gi, "-").slice(0, 40) : "impro";
      a.href = url; a.download = "acto-" + cat + ".webm";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 1500);
    } catch (e) { /* ignore */ }
    recChunks = [];
  }
  function wireRecord() {
    dRoot.querySelectorAll("[data-act]").forEach(function (b) {
      var act = b.getAttribute("data-act");
      b.onclick = function () {
        if (act === "rec-toggle") toggleRecord();
        else if (act === "rec-back") { cleanup(); navigate("#/match"); }
        else if (act === "rec-fs") { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) { /* ignore */ } }
      };
    });
  }

  /* ============================================================
     cleanup (called by the router before every navigation)
     ============================================================ */
  function cleanup() {
    document.body.classList.remove("suite-live-mode", "suite-display-mode", "suite-record-mode");
    clearTick();
    if (dTick) { clearInterval(dTick); dTick = null; }
    recMounted = false;          // any late getUserMedia resolve now self-releases
    stopCamera();
    var c = chan(); if (c) c.onmessage = null;
    releaseWakeLock();
    document.removeEventListener("visibilitychange", onVisibilityForWakeLock);
    window.removeEventListener("storage", onStorage);
    rtTeardown();
    redraw = function () {};
    dSnap = null;                // don't carry one role's snapshot into the next
    voteResult = null;           // never leak a revealed tally into the next mount/run
  }

  window.ActoLive = {
    mountPresenter: mountPresenter,
    mountDisplay: mountDisplay,
    mountRecord: mountRecord,
    cleanup: cleanup
  };
})();
