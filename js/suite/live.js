/**
 * js/suite/live.js — Live match engine (Phase 2).
 *
 * Two roles, one codebase:
 *   PRESENTER  (#/match/live) — the referee control surface: current segment,
 *     chrono (impro / caucus / vote), transport, scores, score-visibility toggle.
 *   DISPLAY    (#/display)    — the public/projector board, rendered read-only
 *     from snapshots the presenter broadcasts over BroadcastChannel (with a
 *     localStorage fallback for browsers/contexts without it).
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

  /* ============================================================
     PRESENTER state + timer
     ============================================================ */
  var root = null, navigate = function () {};
  var sess = null, cursor = 0, phase = "announce";
  var tk = null, tTotal = 0, tRemaining = 0, tRunning = false, tEndAt = 0, tInterval = null;
  var CAUCUS_SEC = 30, VOTE_SEC = 20;

  function curSeg() { return (sess && sess.setlist && sess.setlist[cursor]) || null; }
  function persist() { if (sess) S.live.save(sess); }

  function clearTick() { if (tInterval) { clearInterval(tInterval); tInterval = null; } }
  function timerStart(sec, kind) {
    clearTick();
    tk = kind; tTotal = sec; tRemaining = sec; tRunning = true; tEndAt = Date.now() + sec * 1000;
    tInterval = setInterval(tick, 250);
    renderPresenter(); broadcast();
  }
  function tick() {
    if (!tRunning) return;
    var rem = Math.max(0, Math.round((tEndAt - Date.now()) / 1000));
    if (rem !== tRemaining) { tRemaining = rem; renderChrono(); broadcast(); }
    if (rem <= 0) { tRunning = false; clearTick(); onTimerEnd(); }
  }
  function timerPause() {
    if (!tRunning) return;
    tRunning = false; tRemaining = Math.max(0, Math.round((tEndAt - Date.now()) / 1000)); clearTick();
    renderPresenter(); broadcast();
  }
  function timerResume() {
    if (tRunning || tRemaining <= 0) return;
    tRunning = true; tEndAt = Date.now() + tRemaining * 1000; tInterval = setInterval(tick, 250);
    renderPresenter(); broadcast();
  }
  function timerReset(sec) {
    clearTick(); tRunning = false; tTotal = (sec != null ? sec : tTotal); tRemaining = tTotal;
    renderPresenter(); broadcast();
  }
  function timerAdd(d) {
    tRemaining = Math.max(0, tRemaining + d);
    if (tRemaining > tTotal) tTotal = tRemaining;
    if (tRunning) tEndAt = Date.now() + tRemaining * 1000;
    renderPresenter(); broadcast();
  }
  function onTimerEnd() {
    playEndSound();
    phase = (tk === "impro") ? "between" : "announce";
    renderPresenter(); broadcast();
  }

  function startImpro() { var seg = curSeg(); if (!seg) return; phase = "running"; timerStart(seg.durationSec || 90, "impro"); }
  function doCaucus() { phase = "caucus"; timerStart(CAUCUS_SEC, "caucus"); }
  function doVote() { phase = "vote"; timerStart(VOTE_SEC, "vote"); }
  function primaryAction() {
    if (tRunning) { timerPause(); return; }
    if (tk && tRemaining > 0 && tRemaining < tTotal) { timerResume(); return; }
    startImpro();
  }
  function resetChrono() { var seg = curSeg(); phase = "announce"; timerReset(seg ? seg.durationSec : 0); }

  function gotoSeg(i) {
    if (i < 0 || i >= sess.setlist.length) return;
    cursor = i; sess.cursor = i; phase = "announce"; clearTick(); tRunning = false; tk = null;
    var seg = curSeg(); timerReset(seg ? seg.durationSec : 0);
    persist();
  }
  function nextSeg() { if (cursor < sess.setlist.length - 1) gotoSeg(cursor + 1); }
  function prevSeg() { if (cursor > 0) gotoSeg(cursor - 1); }
  function newImpro() {
    var seg = S.gen.newSegmentFor(sess.kind, sess.level); S.gen.fillSegment(seg, sess.level);
    sess.setlist.push(seg); cursor = sess.setlist.length - 1; sess.cursor = cursor;
    phase = "announce"; tk = null; timerReset(seg.durationSec); persist();
  }

  function scoreDelta(team, d) {
    if (!sess.scoring) return;
    var tm = sess.teams[team]; tm.score = Math.max(0, (tm.score || 0) + d);
    persist(); renderPresenter(); broadcast();
  }
  function togglePenalty(team, i) {
    var tm = sess.teams[team]; tm.penalties = tm.penalties || [false, false, false];
    tm.penalties[i] = !tm.penalties[i];
    if (tm.penalties[0] && tm.penalties[1] && tm.penalties[2]) {
      tm.penalties = [false, false, false];
      var opp = sess.teams[team === 0 ? 1 : 0]; opp.score = (opp.score || 0) + 1;
    }
    persist(); renderPresenter(); broadcast();
  }
  function toggleScores() { sess.showScores = !sess.showScores; persist(); renderPresenter(); broadcast(); }
  function finish() {
    if (!window.confirm(t("liveConfirmFinish"))) return;
    phase = "done"; clearTick(); tRunning = false; persist(); renderPresenter(); broadcast();
  }

  function openPublicScreen() {
    try { window.open("suite.html#/display", "acto-display", "width=1280,height=720"); } catch (e) { /* ignore */ }
    setTimeout(broadcast, 400);
  }

  /* ---------- snapshot + broadcast ---------- */
  function snapshot() {
    var seg = curSeg();
    return {
      type: "snapshot", ts: Date.now(),
      title: sess.title || "",
      scoring: !!sess.scoring, showScores: !!sess.showScores,
      phase: phase,
      teams: sess.teams.map(function (tm) {
        return { name: tm.name || "", color: tm.color || "#888", logo: tm.logo || null,
          score: tm.score || 0, penalties: (tm.penalties || [false, false, false]).slice() };
      }),
      kind: sess.kind || "match",
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
  function broadcast() {
    if (!sess) return;
    var snap = snapshot();
    var c = chan(); if (c) { try { c.postMessage(snap); } catch (e) { /* ignore */ } }
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch (e) { /* ignore */ }
  }

  /* ============================================================
     PRESENTER render
     ============================================================ */
  function mountPresenter(container, nav) {
    root = container; navigate = nav || navigate;
    sess = S.live.load();
    if (!sess) { navigate("#/"); return; }
    cursor = Math.min(sess.cursor || 0, Math.max(0, sess.setlist.length - 1));
    phase = "announce"; tk = null; tRunning = false;
    var seg = curSeg(); tTotal = seg ? seg.durationSec : 0; tRemaining = tTotal;
    document.body.classList.add("suite-live-mode");
    var c = chan();
    if (c) c.onmessage = function (ev) { if (ev.data && ev.data.type === "hello") broadcast(); };
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
          '<button class="suite-btn suite-btn-ghost' + (phase === "vote" ? " is-on" : "") + '" data-act="vote">🗳 ' + esc(t("liveVote")) + '</button>' +
        '</div>' +
      '</div>';

    var scoreBlock = sess.scoring ? (
      '<div class="live-scores">' + teamScore(0) + teamScore(1) + '</div>'
    ) : '';

    var transport =
      '<div class="live-transport">' +
        '<button class="suite-btn suite-btn-ghost" data-act="prev"' + (cursor <= 0 ? ' disabled' : '') + '>‹ ' + esc(t("livePrev")) + '</button>' +
        (cursor >= sess.setlist.length - 1
          ? '<button class="suite-btn suite-btn-ghost" data-act="new">' + esc(t("liveNewImpro")) + '</button>'
          : '<button class="suite-btn suite-btn-primary" data-act="next">' + esc(t("liveNext")) + ' ›</button>') +
      '</div>';

    var footer =
      '<div class="live-foot">' +
        '<button class="suite-btn suite-btn-ghost" data-act="screen">🖥 ' + esc(t("liveOpenScreen")) + '</button>' +
        '<button class="suite-btn suite-btn-ghost live-scores-toggle' + (sess.showScores ? " is-on" : "") + '" data-act="togglescores">' +
          (sess.showScores ? "👁 " + esc(t("liveScoresOn")) : "🚫 " + esc(t("liveScoresOff"))) +
        '</button>' +
      '</div>';

    var doneBlock = phase === "done" ? doneScreen() : "";

    root.innerHTML =
      '<div class="live-bar-top">' +
        '<button class="suite-back" data-act="back">' + esc(t("liveBack")) + '</button>' +
        '<span class="live-title">' + esc(sess.title || t("matchTitle")) + '</span>' +
        '<button class="suite-btn suite-btn-mini suite-btn-danger" data-act="finish">' + esc(t("liveFinish")) + '</button>' +
      '</div>' +
      doneBlock +
      segBlock + chronoBlock + scoreBlock + transport + footer;

    wirePresenter();
  }

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
        switch (act) {
          case "back": cleanup(); navigate(editRoute()); break;
          case "finish": finish(); break;
          case "primary": primaryAction(); break;
          case "reset": resetChrono(); break;
          case "add30": timerAdd(30); break;
          case "caucus": doCaucus(); break;
          case "vote": doVote(); break;
          case "prev": prevSeg(); break;
          case "next": nextSeg(); break;
          case "new": newImpro(); break;
          case "inc": scoreDelta(+btn.getAttribute("data-team"), 1); break;
          case "dec": scoreDelta(+btn.getAttribute("data-team"), -1); break;
          case "pen": togglePenalty(+btn.getAttribute("data-team"), +btn.getAttribute("data-i")); break;
          case "togglescores": toggleScores(); break;
          case "screen": openPublicScreen(); break;
        }
      };
    });
  }

  /* ============================================================
     DISPLAY (public board)
     ============================================================ */
  var dRoot = null, dSnap = null, dTick = null;

  function mountDisplay(container) {
    dRoot = container;
    document.body.classList.add("suite-display-mode");
    try { var raw = localStorage.getItem(SNAP_KEY); if (raw) dSnap = JSON.parse(raw); } catch (e) { /* ignore */ }
    var c = chan();
    if (c) {
      c.onmessage = function (ev) { if (ev.data && ev.data.type === "snapshot") { dSnap = ev.data; renderDisplay(); } };
      try { c.postMessage({ type: "hello" }); } catch (e) { /* ignore */ }
    }
    window.addEventListener("storage", onStorage);
    dTick = setInterval(renderDisplayClock, 250);
    renderDisplay();
  }
  function onStorage(e) {
    if (e.key === SNAP_KEY && e.newValue) { try { dSnap = JSON.parse(e.newValue); renderDisplay(); } catch (err) { /* ignore */ } }
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
    return '<div class="disp-team disp-team-' + (i === 0 ? "a" : "b") + '" style="--team:' + esc(tm.color || "#888") + '">' +
      (tm.logo ? '<img class="disp-logo" src="' + esc(tm.logo) + '" alt="" />' : '<div class="disp-logo disp-logo-ph"></div>') +
      '<div class="disp-team-nm">' + esc(nm) + '</div>' +
      (showScore ? '<div class="disp-score">' + (tm.score || 0) + '</div>' : '') +
    '</div>';
  }

  function renderDisplay() {
    if (!dRoot) return;
    if (!dSnap) { dRoot.innerHTML = '<div class="disp-wait">' + esc(t("liveWaiting")) + '</div>'; return; }
    var snap = dSnap;
    var showScore = snap.scoring && snap.showScores;

    if (snap.phase === "caucus" || snap.phase === "vote") {
      var lbl = snap.phase === "caucus" ? t("liveCaucusScreen") : t("liveVoteScreen");
      dRoot.innerHTML =
        '<div class="disp-overlay">' +
          '<div class="disp-overlay-label">' + esc(lbl) + '</div>' +
          '<div id="dispClock" class="disp-clock disp-clock-big">' + esc(S.formatSec(displayRemaining())) + '</div>' +
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
     cleanup (called by the router before every navigation)
     ============================================================ */
  function cleanup() {
    document.body.classList.remove("suite-live-mode", "suite-display-mode");
    clearTick();
    if (dTick) { clearInterval(dTick); dTick = null; }
    var c = chan(); if (c) c.onmessage = null;
    window.removeEventListener("storage", onStorage);
  }

  window.ActoLive = {
    mountPresenter: mountPresenter,
    mountDisplay: mountDisplay,
    cleanup: cleanup
  };
})();
