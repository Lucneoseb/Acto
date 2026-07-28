/**
 * js/suite/match.js — Program section UI, shared by THREE kinds:
 *   match    (#/match/*)  — referee tool, teams + scoring + nature
 *   show     (#/show/*)   — spectacle, no points, no teams
 *   training (#/train/*)  — coach tool, warm-ups + exercises
 *
 * All three share the same flow — landing → prepare → setlist editor → saved
 * list → live — driven by a per-kind KINDS config. Exposed as window.ActoProgram
 * (alias window.ActoMatch). The live engine (live.js) handles the live run.
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  var root = null;
  var navigate = function () {};
  var kind = "match";       // "match" | "show" | "training"
  var K = null;             // current kind config
  var current = null;       // working session being edited (in memory)
  var editing = null;       // { segId, field } currently inline-editing

  /* ---------- per-kind config ---------- */
  var KINDS = {
    match: {
      icon: "🏆", hasTeams: true, hasNature: true, scoring: true, prepVariant: "match",
      titleKey: "matchTitle", newBtnKey: "matchNewBtn", newDescKey: "matchNewDesc",
      blankBtnKey: "matchBlankBtn", blankDescKey: "matchBlankDesc",
      listBtnKey: "matchListBtn", listDescKey: "matchListDesc",
      prepTitleKey: "prepTitle", setlistTitleKey: "setlistTitle", launchKey: "setlistLaunch", generateKey: "prepGenerate",
      nameKey: "prepMatchName", namePhKey: "prepMatchNamePh", dateKey: "prepMatchDate", hasCatLibre: true,
      totalTimeKey: "prepTotalTime", totalTimeHelpKey: "prepTotalTimeHelp",
      listTitleKey: "matchListTitle", listEmptyKey: "matchListEmpty",
      confirmDeleteKey: "confirmDeleteMatch",
      improFields: ["category", "theme", "players", "duration"],
      newSession: function (o) { return S.sessions.newMatch(o); }
    },
    show: {
      icon: "🎪", hasTeams: false, hasNature: false, scoring: false, prepVariant: "time",
      titleKey: "showTitle", newBtnKey: "showNewBtn", newDescKey: "showNewDesc",
      blankBtnKey: "showBlankBtn", blankDescKey: "showBlankDesc",
      listBtnKey: "showListBtn", listDescKey: "showListDesc",
      prepTitleKey: "showPrepTitle", setlistTitleKey: "showSetlistTitle", launchKey: "showLaunch", generateKey: "showGenerate",
      nameKey: "prepShowName", namePhKey: "prepShowNamePh", dateKey: "prepShowDate", hasCatLibre: true,
      totalTimeKey: "prepShowTime", totalTimeHelpKey: "prepShowTimeHelp",
      listTitleKey: "showListTitle", listEmptyKey: "showListEmpty",
      confirmDeleteKey: "confirmDeleteShow",
      improFields: ["category", "theme", "duration"],
      newSession: function (o) { return S.sessions.newShow(o); }
    },
    training: {
      icon: "🏋️", hasTeams: false, hasNature: false, scoring: false, prepVariant: "training",
      titleKey: "trainTitle", newBtnKey: "trainNewBtn", newDescKey: "trainNewDesc",
      blankBtnKey: "trainBlankBtn", blankDescKey: "trainBlankDesc",
      listBtnKey: "trainListBtn", listDescKey: "trainListDesc",
      prepTitleKey: "trainPrepTitle", setlistTitleKey: "trainSetlistTitle", launchKey: "trainLaunch", generateKey: "trainGenerate",
      listTitleKey: "trainListTitle", listEmptyKey: "trainListEmpty",
      confirmDeleteKey: "confirmDeleteTrain",
      improFields: null,    // training fields depend on segment type
      newSession: function (o) { return S.sessions.newTraining(o); }
    }
  };
  function routeBase(k) { return k === "training" ? "train" : k; }
  function homeRoute() { return "#/" + routeBase(kind); }

  /* ---------- tiny helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(k) { return S.t(k); }
  function tf(k, v) { return S.tf(k, v); }
  function levelLabel(lv) {
    return S.t(lv === "debutant" ? "levelDebutant" : lv === "confirme" ? "levelConfirme" : "levelExpert");
  }

  var PRESETS = [
    { sec: 2700 }, { sec: 3600 }, { sec: 5400 }, { sec: 7200 }
  ];
  function presetLabel(sec) { return S.formatLong(sec); }

  /* ============================================================
     ROUTER ENTRY
     ============================================================ */
  function mount(container, sub, nav, theKind) {
    collabTeardown();   // leaving any collab session when entering a normal match route
    root = container;
    navigate = nav || navigate;
    kind = (theKind && KINDS[theKind]) ? theKind : "match";
    K = KINDS[kind];
    editing = null;
    // Warm-ups are needed by the Training editor/generator — preload.
    if (kind === "training") { try { S.gen.ensureWarmups(); } catch (e) { /* ignore */ } }
    // Fresh entry into the prep flow → clear the per-match name/date so they don't
    // leak from a previously prepared match (the `prep` state is a module singleton).
    if (sub === "prepare") { prep.title = ""; prep.matchDate = ""; renderPrep(); }
    else if (sub === "list") renderList();
    else if (sub === "edit") {
      // `current` ne vit qu'en mémoire : après un rechargement en plein match,
      // le « Retour » du présentateur éjectait l'arbitre vers le formulaire de
      // préparation, sans aucun chemin de retour vers sa partie. On récupère
      // donc le déroulé depuis la partie en cours (copie enregistrée si elle
      // existe, sinon la copie live).
      if (!current || current.kind !== kind) {
        var running = S.live.load();
        if (running && running.kind === kind) current = S.sessions.get(running.id) || running;
      }
      if (!current || current.kind !== kind) { navigate(homeRoute() + "/prepare"); return; }
      // Re-subscribe if this is a shared resource (e.g. after a locale-change re-render
      // tore the channel down) so the owner doesn't silently leave the collab session.
      if (current.collabId && !collab) collabStart(current.collabId, "owner");
      renderEditor();
    } else renderLanding();
  }

  /* ============================================================
     LANDING
     ============================================================ */
  function renderLanding() {
    var savedCount = S.sessions.list(kind).length;
    root.innerHTML =
      '<div class="suite-section-head">' +
        '<h1 class="suite-h1">' + K.icon + ' ' + esc(t(K.titleKey)) + '</h1>' +
      '</div>' +
      '<div class="suite-choice-grid">' +
        choiceCard("prep", "🎬", t(K.newBtnKey), t(K.newDescKey)) +
        choiceCard("blank", "⚡", t(K.blankBtnKey), t(K.blankDescKey)) +
        choiceCard("list", "📁", t(K.listBtnKey),
          t(K.listDescKey) + (savedCount ? " · " + savedCount : "")) +
        // "Mes équipes" lives on the Match page (teams are match rosters).
        (K.hasTeams ? choiceCard("teams", "👥", t("teamsLibTitle"), t("teamsSub")) : "") +
        // Entraînement → quick warm-up draw (the standalone warmups page).
        (kind === "training" ? choiceCard("warmup-quick", "🔥", t("quickWarmup"), t("quickWarmupSub")) : "") +
      '</div>';
    var wqBtn = root.querySelector('[data-go="warmup-quick"]');
    if (wqBtn) wqBtn.onclick = function () { window.location.href = "warmups.html?draw=1"; };
    root.querySelector('[data-go="prep"]').onclick = function () { navigate(homeRoute() + "/prepare"); };
    root.querySelector('[data-go="list"]').onclick = function () { navigate(homeRoute() + "/list"); };
    root.querySelector('[data-go="blank"]').onclick = function () {
      current = K.newSession({ level: "debutant" });
      navigate(homeRoute() + "/edit");
    };
    var teamsBtn = root.querySelector('[data-go="teams"]');
    if (teamsBtn) teamsBtn.onclick = function () { navigate("#/teams"); };
  }
  function fmtMatchDate(d) {
    if (!d) return "";
    try { return new Date(d + "T00:00:00").toLocaleDateString(S.locale(), { day: "2-digit", month: "short", year: "numeric" }); }
    catch (e) { return d; }
  }
  function choiceCard(go, icon, title, desc) {
    return '<button class="suite-choice" data-go="' + go + '">' +
      '<span class="suite-choice-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="suite-choice-title">' + esc(title) + '</span>' +
      '<span class="suite-choice-desc">' + esc(desc) + '</span>' +
    '</button>';
  }

  /* ============================================================
     PREP FORM (variant by kind)
     ============================================================ */
  var prep = {
    title: "", matchDate: "",
    level: "debutant", totalSec: 3600, nbCompare: 2, nbCatLibre: 1, nbImprosManual: null,
    nbWarmups: 4, nbExercises: 4
  };

  function renderPrep() {
    if (K.hasTeams && !prep.teams) prep.teams = S.sessions.loadDefaultTeams();
    var nbImpros = (prep.nbImprosManual != null)
      ? prep.nbImprosManual
      : S.gen.deriveNbImpros(prep.totalSec, prep.level);
    prep.nbImpros = nbImpros;

    var levelField =
      '<div class="suite-field">' +
        '<label class="suite-label">' + esc(t("prepLevel")) + '</label>' +
        '<div class="suite-seg" data-seg="level">' +
          S.levels.map(function (lv) {
            return '<button type="button" class="suite-seg-opt' + (prep.level === lv ? " is-on" : "") +
              '" data-level="' + lv + '">' + esc(levelLabel(lv)) + '</button>';
          }).join("") +
        '</div>' +
      '</div>';

    // Name + date of the match (match + show only — a training is a quick rehearsal).
    var metaField = (kind !== "training")
      ? '<div class="suite-field suite-meta-row">' +
          '<label class="suite-meta-col"><span class="suite-label">' + esc(t(K.nameKey)) + '</span>' +
            '<input type="text" class="suite-input" id="prepTitle" value="' + esc(prep.title || "") + '" placeholder="' + esc(t(K.namePhKey)) + '" maxlength="120" /></label>' +
          '<label class="suite-meta-col suite-meta-date"><span class="suite-label">' + esc(t(K.dateKey)) + '</span>' +
            '<input type="date" class="suite-input" id="prepDate" value="' + esc(prep.matchDate || "") + '" /></label>' +
        '</div>'
      : "";
    var body = metaField + levelField;
    if (K.prepVariant === "training") {
      body +=
        '<div class="suite-field">' +
          '<label class="suite-label">' + esc(t("trainNbWarmups")) + '</label>' +
          stepperHTML("nbWarmups", prep.nbWarmups, 0, 30) +
        '</div>' +
        '<div class="suite-field">' +
          '<label class="suite-label">' + esc(t("trainNbExercises")) + '</label>' +
          stepperHTML("nbExercises", prep.nbExercises, 0, 30) +
        '</div>';
    } else {
      // match + show share the time → derived-count form
      body +=
        '<div class="suite-field">' +
          '<label class="suite-label">' + esc(t(K.totalTimeKey)) + '</label>' +
          '<div class="suite-seg" data-seg="total">' +
            PRESETS.map(function (p) {
              return '<button type="button" class="suite-seg-opt' + (prep.totalSec === p.sec ? " is-on" : "") +
                '" data-sec="' + p.sec + '">' + esc(presetLabel(p.sec)) + '</button>';
            }).join("") +
          '</div>' +
          '<p class="suite-help">' + esc(t(K.totalTimeHelpKey)) + '</p>' +
        '</div>' +
        '<div class="suite-field">' +
          '<label class="suite-label">' + esc(t("prepNbImpros")) +
            ' <span class="suite-auto">(' + esc(t("prepNbImprosAuto")) + ')</span></label>' +
          stepperHTML("nbImpros", nbImpros, 1, 40) +
        '</div>';
      // Comparée is a match-only concept (it needs nature/teams).
      if (K.prepVariant === "match") {
        body +=
          '<div class="suite-field">' +
            '<label class="suite-label">' + esc(t("prepNbCompare")) + '</label>' +
            stepperHTML("nbCompare", prep.nbCompare, 0, nbImpros) +
            '<p class="suite-help">' + esc(t("prepNbCompareHelp")) + '</p>' +
          '</div>';
      }
      // Free-category count applies to match AND show.
      if (K.hasCatLibre) {
        body +=
          '<div class="suite-field">' +
            '<label class="suite-label">' + esc(t("prepNbCatLibre")) + '</label>' +
            stepperHTML("nbCatLibre", prep.nbCatLibre, 0, nbImpros) +
            '<p class="suite-help">' + esc(t("prepNbCatLibreHelp")) + '</p>' +
          '</div>';
      }
    }

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="back">← ' + esc(t(K.titleKey)) + '</button>' +
        '<h1 class="suite-h1">' + esc(t(K.prepTitleKey)) + '</h1>' +
      '</div>' +
      (K.hasTeams ? teamsCard(prep.teams) : "") +
      '<form class="suite-form" id="prepForm">' + body +
        '<div class="suite-form-actions">' +
          '<button type="button" class="suite-btn suite-btn-ghost" data-act="back">' + esc(t("prepCancel")) + '</button>' +
          '<button type="submit" class="suite-btn suite-btn-primary">' + esc(t(K.generateKey)) + '</button>' +
        '</div>' +
      '</form>';

    var form = root.querySelector("#prepForm");
    root.querySelectorAll('[data-act="back"]').forEach(function (b) {
      b.onclick = function () { navigate(homeRoute()); };
    });
    form.querySelectorAll('[data-seg="level"] .suite-seg-opt').forEach(function (b) {
      b.onclick = function () { prep.level = b.getAttribute("data-level"); prep.nbImprosManual = null; renderPrep(); };
    });
    form.querySelectorAll('[data-seg="total"] .suite-seg-opt').forEach(function (b) {
      b.onclick = function () { prep.totalSec = parseInt(b.getAttribute("data-sec"), 10); prep.nbImprosManual = null; renderPrep(); };
    });
    wireSteppers(form, function (name, val) {
      if (name === "nbImpros") prep.nbImprosManual = val;
      else prep[name] = val;
      var n = prep.nbImpros;
      if (prep.nbCompare > n) prep.nbCompare = n;
      if (prep.nbCatLibre > n) prep.nbCatLibre = n;
      renderPrep();
    });
    var titleIn = form.querySelector("#prepTitle");
    if (titleIn) titleIn.oninput = function () { prep.title = titleIn.value; };
    var dateIn = form.querySelector("#prepDate");
    if (dateIn) dateIn.oninput = function () { prep.matchDate = dateIn.value; };
    form.onsubmit = function (e) { e.preventDefault(); doGenerate(); };
    var teamsBtn = root.querySelector('[data-act="edit-teams"]');
    if (teamsBtn) teamsBtn.onclick = function () {
      openTeamsEditor(prep.teams, function (teams) {
        prep.teams = teams; S.sessions.saveDefaultTeams(teams); renderPrep();
      });
    };
  }

  function doGenerate() {
    if (kind === "training") {
      var btn = root.querySelector('#prepForm button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = t("trainLoading"); }
      S.gen.ensureWarmups().then(function () {
        var res = S.gen.buildTrainingSetlist({ level: prep.level, nbWarmups: prep.nbWarmups, nbExercises: prep.nbExercises });
        var session = K.newSession({ level: prep.level, nbWarmups: prep.nbWarmups, nbExercises: prep.nbExercises });
        session.setlist = res.setlist;
        current = session;
        navigate(homeRoute() + "/edit");
      });
      return;
    }
    var res, session;
    if (kind === "show") {
      res = S.gen.buildShowSetlist({ level: prep.level, nbImpros: prep.nbImpros, nbCatLibre: prep.nbCatLibre });
      session = K.newSession({ level: prep.level, totalSec: prep.totalSec, nbCatLibre: prep.nbCatLibre });
    } else {
      res = S.gen.buildMatchSetlist({
        level: prep.level, nbImpros: prep.nbImpros,
        nbCompare: prep.nbCompare, nbCatLibre: prep.nbCatLibre
      });
      session = K.newSession({
        level: prep.level, totalSec: prep.totalSec,
        nbCompare: prep.nbCompare, nbCatLibre: prep.nbCatLibre, teams: prep.teams
      });
    }
    session.setlist = res.setlist;
    session.title = (prep.title || "").trim();
    session.matchDate = prep.matchDate || "";
    current = session;
    if (res.warnings && res.warnings.length) {
      toast(res.warnings.map(function (w) { return tf(w.key, w.vars); }).join(" "));
    }
    navigate(homeRoute() + "/edit");
  }

  /* ---------- stepper control ---------- */
  function stepperHTML(name, value, min, max) {
    return '<div class="suite-stepper" data-name="' + name + '" data-min="' + min + '" data-max="' + max + '">' +
      '<button type="button" class="suite-step-btn" data-step="-1" aria-label="-">−</button>' +
      '<span class="suite-step-val">' + value + '</span>' +
      '<button type="button" class="suite-step-btn" data-step="1" aria-label="+">+</button>' +
    '</div>';
  }
  function wireSteppers(scope, onChange) {
    scope.querySelectorAll(".suite-stepper").forEach(function (st) {
      var name = st.getAttribute("data-name");
      var min = parseInt(st.getAttribute("data-min"), 10);
      var max = parseInt(st.getAttribute("data-max"), 10);
      st.querySelectorAll(".suite-step-btn").forEach(function (b) {
        b.onclick = function () {
          var cur = parseInt(st.querySelector(".suite-step-val").textContent, 10) || 0;
          var next = Math.max(min, Math.min(max, cur + parseInt(b.getAttribute("data-step"), 10)));
          onChange(name, next);
        };
      });
    });
  }

  /* ============================================================
     SETLIST EDITOR
     ============================================================ */
  function renderEditor() {
    var setlist = current.setlist || [];
    var est = S.formatLong(S.gen.estimateTotalSec(setlist));
    var nat = S.natureLabels();
    var summary = (kind === "training")
      ? tf("listMetaCount", { n: setlist.length }) + " · ~" + est
      : tf("setlistSummary", { n: setlist.length, time: est });

    var cards = setlist.length
      ? setlist.map(function (seg, i) { return segCard(seg, i, setlist.length, nat); }).join("")
      : '<p class="suite-empty">' + esc(t("setlistEmpty")) + '</p>';

    var addBtns = (kind === "training")
      ? '<div class="suite-addseg-row">' +
          '<button class="suite-addseg" data-act="add-warmup">' + esc(t("trainAddWarmup")) + '</button>' +
          '<button class="suite-addseg" data-act="add-exercise">' + esc(t("trainAddExercise")) + '</button>' +
        '</div>'
      : '<button class="suite-addseg" data-act="add-seg">' + esc(t("segAdd")) + '</button>';

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="back">← ' + esc(t(K.titleKey)) + '</button>' +
        '<h1 class="suite-h1">' + esc(current.title || t(K.setlistTitleKey)) + '</h1>' +
        '<p class="suite-sub">' + esc(summary) + (current.matchDate ? ' · 📅 ' + esc(fmtMatchDate(current.matchDate)) : '') + '</p>' +
        (collab ? '<div class="suite-collab-badge' + (collabPeerCount() > 1 ? '' : ' is-solo') + '">👥 ' + esc(tf("collabActive", { n: collabPeerCount() })) + '</div>' + (collab.role === "viewer" ? '<div class="suite-collab-viewer">👁 ' + esc(t("collabViewerNote")) + '</div>' : '') : '') +
      '</div>' +
      (K.hasTeams ? teamsCard(current.teams) : "") +
      (kind !== "training" ? settingsCard() : "") +
      '<div class="suite-setlist">' + cards + addBtns + '</div>' +
      '<div class="suite-sticky-actions">' +
        '<button class="suite-btn suite-btn-ghost" data-act="regen">' + esc(t("setlistRegenerate")) + '</button>' +
        ((!collab || collab.role === "owner") ? '<button class="suite-btn suite-btn-ghost" data-act="collab">👥 ' + esc(t("collabBtn")) + '</button>' : '') +
        '<button class="suite-btn suite-btn-save" data-act="save">💾 ' + esc(t("setlistSave")) + '</button>' +
        '<button class="suite-btn suite-btn-primary" data-act="launch">' + esc(t(K.launchKey)) + '</button>' +
      '</div>';

    wireEditor();
    if (collab) collabPush();   // any editor re-render = a possible mutation → sync (debounced, no-op while applying remote)
  }

  // The editable field rows for a segment, depending on its type + kind.
  function segFieldsFor(seg) {
    if (seg.type === "warmup") {
      return [
        { field: "warmup", label: t("fieldWarmup"), value: S.gen.segTitle(seg) || t("valueNone") },
        { field: "duration", label: t("fieldDuration"), value: S.formatSec(seg.durationSec) }
      ];
    }
    if (seg.type === "exercise") {
      return [
        { field: "exercise", label: t("fieldExercise"), value: S.gen.segTitle(seg) || t("valueNone") },
        { field: "duration", label: t("fieldDuration"), value: S.formatSec(seg.durationSec) }
      ];
    }
    // impro (match/show)
    var fields = K.improFields || ["category", "theme", "players", "duration"];
    return fields.map(function (f) {
      var value;
      if (f === "category") value = seg.freeCategory ? t("freeCategory") : (seg.category ? seg.category.name : t("valueNone"));
      else if (f === "theme") value = seg.theme || t("valueNone");
      else if (f === "players") value = seg.players || t("valueNone");
      else if (f === "duration") value = S.formatSec(seg.durationSec);
      var labelKey = { category: "fieldCategory", theme: "fieldTheme", players: "fieldPlayers", duration: "fieldDuration" }[f];
      return { field: f, label: t(labelKey), value: value };
    });
  }

  // Match/Spectacle settings: caucus + vote timer durations, and (Match only)
  // whether scores are shown on the public display board.
  function durSelect(act, cur, secs) {
    return '<select class="suite-edit-select" data-act="' + act + '">' +
      secs.map(function (s) {
        var label = s === 0 ? t("valueNone") : S.formatSec(s);
        return '<option value="' + s + '"' + ((cur || 0) === s ? " selected" : "") + '>' + esc(label) + '</option>';
      }).join("") + '</select>';
  }
  function settingsCard() {
    var scoresToggle = K.scoring
      ? '<label class="suite-set-toggle"><input type="checkbox" data-act="set-scores"' + (current.showScores ? " checked" : "") + ' />' +
          '<span>' + esc(t("showScoresPublicLabel")) + '</span></label>'
      : "";
    // The audience vote is a match-only mechanic — a Spectacle has no vote.
    var voteField = K.scoring
      ? '<label class="suite-set-field"><span>' + esc(t("liveVoteSet")) + '</span>' +
          durSelect("set-vote", current.voteSec == null ? 20 : current.voteSec, [0, 10, 15, 20, 30, 45]) + '</label>'
      : "";
    return '<div class="suite-settings-card">' +
      '<div class="suite-settings-title">⚙️ ' + esc(t("matchSettingsTitle")) + '</div>' +
      '<div class="suite-settings-grid">' +
        '<label class="suite-set-field"><span>' + esc(t("liveCaucusSet")) + '</span>' +
          durSelect("set-caucus", current.caucusSec == null ? 30 : current.caucusSec, [0, 15, 20, 30, 45, 60, 90]) + '</label>' +
        voteField +
      '</div>' + scoresToggle +
    '</div>';
  }

  function segIndexLabel(seg, i) {
    if (seg.type === "warmup") return tf("segWarmup", { n: i + 1 });
    if (seg.type === "exercise") return tf("segExercise", { n: i + 1 });
    return tf("segImpro", { n: i + 1 });
  }

  function segCard(seg, i, total, nat) {
    var natOn = seg.nature === "comparee";
    var rows = segFieldsFor(seg).map(function (f) { return fieldRow(seg, f.field, f.label, f.value); }).join("");
    var descLine = "";
    if (seg.type === "warmup" || seg.type === "exercise") {
      var d = S.gen.segSubtitle(seg);
      if (d) descLine = '<div class="suite-seg-desc">' + esc(d) + '</div>';
    }
    var naturePill = (K.hasNature && seg.nature)
      ? '<button class="suite-nature-pill' + (natOn ? " is-comparee" : "") + '" data-act="nature-toggle" data-seg="' + esc(seg.id) + '">' +
          esc(natOn ? nat.comparee : nat.mixte) + '</button>'
      : '';

    return '<div class="suite-seg-card" data-seg="' + esc(seg.id) + '">' +
      '<div class="suite-seg-top">' +
        '<span class="suite-seg-n">' + esc(segIndexLabel(seg, i)) + '</span>' +
        naturePill +
        '<span class="suite-seg-move">' +
          '<button class="suite-icon-btn" data-act="move-up" data-seg="' + esc(seg.id) + '"' + (i === 0 ? " disabled" : "") + ' aria-label="' + esc(t("segMoveUp")) + '">▲</button>' +
          '<button class="suite-icon-btn" data-act="move-down" data-seg="' + esc(seg.id) + '"' + (i === total - 1 ? " disabled" : "") + ' aria-label="' + esc(t("segMoveDown")) + '">▼</button>' +
          '<button class="suite-icon-btn suite-icon-danger" data-act="del-seg" data-seg="' + esc(seg.id) + '" aria-label="' + esc(t("segDelete")) + '">✕</button>' +
        '</span>' +
      '</div>' +
      '<div class="suite-seg-fields">' + rows + '</div>' + descLine +
    '</div>';
  }

  function fieldRow(seg, field, label, value) {
    var locked = !!seg.locks[field];
    var isEditing = editing && editing.segId === seg.id && editing.field === field;
    var valueCell = isEditing
      ? editControl(seg, field)
      : '<span class="suite-fval">' + esc(value) + '</span>';
    return '<div class="suite-frow' + (locked ? " is-locked" : "") + '" data-field="' + field + '">' +
      '<span class="suite-flabel">' + esc(label) + '</span>' +
      valueCell +
      '<span class="suite-fbtns">' +
        '<button class="suite-icon-btn" data-act="edit" data-seg="' + esc(seg.id) + '" data-field="' + field + '" aria-label="' + esc(t("editField")) + '">✎</button>' +
        '<button class="suite-icon-btn" data-act="reroll" data-seg="' + esc(seg.id) + '" data-field="' + field + '"' + (locked ? " disabled" : "") + ' aria-label="' + esc(t("rerollField")) + '">🎲</button>' +
        '<button class="suite-icon-btn' + (locked ? " is-on" : "") + '" data-act="lock" data-seg="' + esc(seg.id) + '" data-field="' + field + '" aria-label="' + esc(locked ? t("unlockField") : t("lockField")) + '">' + (locked ? "🔒" : "🔓") + '</button>' +
      '</span>' +
    '</div>';
  }

  // Inline <select> for editing a field value.
  function editControl(seg, field) {
    var d = S.data();
    var opts = "";
    if (field === "category") {
      opts += '<option value="__free__"' + (seg.freeCategory ? " selected" : "") + '>' + esc(t("freeCategory")) + '</option>';
      (d.categories || []).forEach(function (c) {
        var sel = (!seg.freeCategory && seg.category && seg.category.name === c.name) ? " selected" : "";
        opts += '<option value="' + esc(c.name) + '"' + sel + '>' + esc(c.name) + '</option>';
      });
    } else if (field === "theme") {
      ((d.themes && d.themes[current.level]) || []).forEach(function (th) {
        opts += '<option' + (seg.theme === th ? " selected" : "") + '>' + esc(th) + '</option>';
      });
    } else if (field === "players") {
      ((d.players && d.players[current.level]) || []).forEach(function (p) {
        opts += '<option' + (seg.players === p ? " selected" : "") + '>' + esc(p) + '</option>';
      });
    } else if (field === "duration") {
      S.gen.durationSteps(current.level).forEach(function (sec) {
        opts += '<option value="' + sec + '"' + (seg.durationSec === sec ? " selected" : "") + '>' + esc(S.formatSec(sec)) + '</option>';
      });
    } else if (field === "warmup") {
      var cur = seg.warmup && seg.warmup.name;
      S.gen.warmupOptions().forEach(function (w) {
        opts += '<option' + (cur === w.name ? " selected" : "") + '>' + esc(w.name) + '</option>';
      });
    } else if (field === "exercise") {
      var curE = seg.exercise && seg.exercise.name;
      S.gen.trainingExerciseOptions(current.level).forEach(function (e) {
        opts += '<option' + (curE === e.name ? " selected" : "") + '>' + esc(e.name) + '</option>';
      });
    }
    return '<select class="suite-edit-select" data-act="set" data-seg="' + esc(seg.id) + '" data-field="' + field + '">' + opts + '</select>';
  }

  function findSeg(id) {
    var sl = current.setlist;
    for (var i = 0; i < sl.length; i++) if (sl[i].id === id) return { seg: sl[i], i: i };
    return null;
  }

  function wireEditor() {
    root.querySelector('[data-act="back"]').onclick = function () { collabTeardown(); current = null; navigate(homeRoute()); };
    root.querySelectorAll("[data-act]").forEach(function (btn) {
      var act = btn.getAttribute("data-act");
      if (act === "back") return;
      if (act === "set") {
        btn.onchange = function () { applyEdit(btn.getAttribute("data-seg"), btn.getAttribute("data-field"), btn.value); };
        return;
      }
      if (act === "set-caucus") { btn.onchange = function () { current.caucusSec = parseInt(btn.value, 10) || 0; collabPush(); }; return; }
      if (act === "set-vote")   { btn.onchange = function () { current.voteSec = parseInt(btn.value, 10) || 0; collabPush(); }; return; }
      if (act === "set-scores") { btn.onchange = function () { current.showScores = !!btn.checked; collabPush(); }; return; }
      btn.onclick = function () { onEditorAction(act, btn); };
    });
    var openSel = root.querySelector(".suite-edit-select");
    if (openSel) openSel.focus();
  }

  function onEditorAction(act, btn) {
    var id = btn.getAttribute("data-seg");
    var field = btn.getAttribute("data-field");
    var hit = id ? findSeg(id) : null;

    switch (act) {
      case "reroll":
        if (hit && !hit.seg.locks[field]) { S.gen.rerollField(hit.seg, field, current.level); renderEditor(); }
        break;
      case "lock":
        if (hit) { hit.seg.locks[field] = !hit.seg.locks[field]; renderEditor(); }
        break;
      case "edit":
        editing = (editing && editing.segId === id && editing.field === field) ? null : { segId: id, field: field };
        renderEditor();
        break;
      case "nature-toggle":
        if (hit) { hit.seg.nature = (hit.seg.nature === "comparee") ? "mixte" : "comparee"; renderEditor(); }
        break;
      case "move-up":
        if (hit && hit.i > 0) { swap(hit.i, hit.i - 1); renderEditor(); }
        break;
      case "move-down":
        if (hit && hit.i < current.setlist.length - 1) { swap(hit.i, hit.i + 1); renderEditor(); }
        break;
      case "del-seg":
        if (hit) { current.setlist.splice(hit.i, 1); renderEditor(); }
        break;
      case "add-seg":
        appendSegment(S.gen.newSegmentFor(kind, current.level));
        break;
      case "add-warmup":
        appendSegment(S.gen.newWarmupSegment(current.level));
        break;
      case "add-exercise":
        appendSegment(S.gen.newExerciseSegment(current.level));
        break;
      case "regen":
        if (window.confirm(t("confirmRegenerate"))) regenKeepingLocks();
        break;
      case "save":
        openSaveDialog();
        break;
      case "collab":
        openCollabDialog();
        break;
      case "launch":
        launchOrResume();
        break;
      case "edit-teams":
        openTeamsEditor(current.teams, function (teams) {
          current.teams = teams; S.sessions.saveDefaultTeams(teams); renderEditor();
        });
        break;
    }
  }

  function appendSegment(ns) {
    S.gen.fillSegment(ns, current.level);
    current.setlist.push(ns);
    renderEditor();
  }

  function applyEdit(id, field, value) {
    var hit = findSeg(id);
    if (!hit) return;
    var seg = hit.seg;
    if (field === "category") {
      if (value === "__free__") { seg.freeCategory = true; seg.category = null; }
      else {
        seg.freeCategory = false;
        var found = (S.data().categories || []).filter(function (c) { return c.name === value; })[0];
        seg.category = found ? { name: found.name, desc: found.desc || "" } : { name: value, desc: "" };
      }
    } else if (field === "theme") {
      seg.theme = value;
    } else if (field === "players") {
      seg.players = value;
    } else if (field === "duration") {
      seg.durationSec = parseInt(value, 10) || seg.durationSec;
    } else if (field === "warmup") {
      var w = S.gen.warmupOptions().filter(function (o) { return o.name === value; })[0];
      seg.warmup = w ? { name: w.name, desc: w.desc, duration_seconds: w.duration_seconds } : { name: value, desc: "" };
    } else if (field === "exercise") {
      var e = S.gen.trainingExerciseOptions(current.level).filter(function (o) { return o.name === value; })[0];
      seg.exercise = e ? { name: e.name, desc: e.desc } : { name: value, desc: "" };
    }
    editing = null;
    renderEditor();
  }

  function swap(a, b) {
    var sl = current.setlist;
    var tmp = sl[a]; sl[a] = sl[b]; sl[b] = tmp;
  }

  function regenKeepingLocks() {
    current.setlist.forEach(function (seg) { S.gen.fillSegment(seg, current.level); });
    renderEditor();
  }

  /* ============================================================
     SAVE + LIST
     ============================================================ */
  /* ---- Lancer / reprendre une partie ------------------------------------
     Un arbitre revient souvent sur le déroulé EN PLEIN MATCH. Relancer
     écrasait la partie : scores à zéro et NOUVEAU code de partage — or le
     canal temps réel dérive du joinCode, donc l'écran public et tous les
     téléphones des votants se retrouvaient orphelins, sans message.
     Un simple confirm() ne suffisait pas : Annuler, Échap ET la case
     « empêcher cette page de créer des dialogues » de Chrome renvoient tous
     false, ce qui déclenchait justement la destruction. Les trois issues sont
     donc explicites, et Échap = Annuler (jamais destructeur). */
  function launchOrResume() {
    var running = S.live.load();
    var live = (running && running.id === current.id) ? running : null;
    // Une partie d'une AUTRE session est en cours : la lancer ici la remplace
    // définitivement (un seul run live à la fois). On prévient au lieu de
    // l'effacer en silence.
    if (running && !live && (running.joinCode || running.liveState)) {
      if (!window.confirm(tf("liveOtherRunning", { title: running.title || t(K.titleKey) }))) return;
    }
    // « Partie en cours » = tout signe de vie, pas seulement des points marqués.
    // joinCode est le critère décisif : dès qu'il existe, du public peut être
    // branché dessus. Indispensable pour Spectacle/Entraînement où il n'y a
    // jamais de score, et pour la 1re impro d'un match encore à 0-0.
    var hasProgress = !!live && (
      !!live.joinCode || !!live.liveState || (live.cursor || 0) > 0 ||
      (live.teams || []).some(function (tm) {
        return tm && ((tm.score || 0) > 0 || (tm.penalties || []).some(Boolean));
      }) ||
      !!(live.stars && (live.stars.or || live.stars.argent || live.stars.bronze))
    );
    // Une partie oubliée depuis des heures n'est plus « en cours ». En cas de
    // doute (pas d'horodatage), on demande plutôt que de détruire.
    var at = live && live.liveState && live.liveState.at;
    var fresh = !at || (Date.now() - at) < 12 * 3600 * 1000;
    if (!hasProgress || !fresh) { startFreshRun(); return; }
    askResume().then(function (r) {
      if (r === "resume") navigate(homeRoute() + "/live");
      else if (r === "restart") startFreshRun();
      // null → Annuler / Échap : on ne touche à RIEN
    });
  }
  function startFreshRun() {
    current.cursor = 0;
    // Fresh per-run id so replaying a saved match counts as a distinct
    // match in stats (the dedup key is per match_uid + referee).
    current.runId = S.gen.uid();
    delete current.liveState;      // nouvelle partie : aucun chrono hérité
    delete current.joinCode;       // nouveau code de partage, assumé
    (current.teams || []).forEach(function (tm) {
      if (tm) { tm.score = 0; tm.penalties = [false, false, false]; }
    });
    if (current.stars) current.stars = { or: null, argent: null, bronze: null };
    S.live.save(current);
    navigate(homeRoute() + "/live");
  }
  function askResume() {
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "suite-dialog";
      dlg.innerHTML =
        '<div class="suite-dialog-body">' +
          '<h2 class="suite-dialog-title">' + esc(t("liveResumeTitle")) + '</h2>' +
          '<p class="suite-info-text">' + esc(t("liveResumeRun")) + '</p>' +
          '<div class="suite-dialog-actions">' +
            '<button type="button" data-r="cancel" class="suite-btn suite-btn-ghost">' + esc(t("saveCancel")) + '</button>' +
            '<button type="button" data-r="restart" class="suite-btn suite-btn-ghost">' + esc(t("liveRestartBtn")) + '</button>' +
            '<button type="button" data-r="resume" class="suite-btn suite-btn-primary">' + esc(t("liveResumeBtn")) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(dlg);
      var settled = false;
      function done(v) {
        if (settled) return; settled = true;
        try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ }
        dlg.remove(); resolve(v);
      }
      dlg.querySelector('[data-r="resume"]').onclick = function () { done("resume"); };
      dlg.querySelector('[data-r="restart"]').onclick = function () { done("restart"); };
      dlg.querySelector('[data-r="cancel"]').onclick = function () { done(null); };
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); done(null); });   // Échap
      if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
      else dlg.setAttribute("open", "");
    });
  }

  function openSaveDialog() {
    // Already named (in the prep form)? Save straight away. Otherwise ask.
    if (current.title && current.title.trim()) {
      S.sessions.save(current);
      toast(t("savedToast"));
      return;
    }
    var def = tf("saveTitlePlaceholder", { date: new Date().toLocaleDateString(S.locale()) });
    askText(t("saveTitleLabel"), def).then(function (name) {
      if (name == null) return;
      current.title = (name || def).trim();
      S.sessions.save(current);
      toast(t("savedToast"));
    });
  }

  function renderList() {
    var items = S.sessions.list(kind);
    var rows = items.length
      ? items.map(listRow).join("")
      : '<p class="suite-empty">' + esc(t(K.listEmptyKey)) + '</p>';
    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="back">← ' + esc(t(K.titleKey)) + '</button>' +
        '<h1 class="suite-h1">' + esc(t(K.listTitleKey)) + '</h1>' +
      '</div>' +
      '<div class="suite-list">' + rows + '</div>' +
      '<div id="sharedWrap"></div>';
    root.querySelector('[data-act="back"]').onclick = function () { navigate(homeRoute()); };
    var localList = root.querySelector(".suite-list");
    localList.querySelectorAll(".suite-list-item").forEach(function (row) {
      var id = row.getAttribute("data-id");
      row.querySelector('[data-act="open"]').onclick = function () {
        var s = S.sessions.get(id);
        if (s) { current = s; navigate(homeRoute() + "/edit"); }
      };
      row.querySelector('[data-act="dup"]').onclick = function () { S.sessions.duplicate(id); renderList(); };
      row.querySelector('[data-act="del"]').onclick = function () {
        if (window.confirm(t(K.confirmDeleteKey))) { S.sessions.remove(id); renderList(); }
      };
    });
    renderSharedWithMe();
  }

  // "Partagés avec moi" — resources I collaborate on (owned by others), same kind.
  function renderSharedWithMe() {
    var wrap = root.querySelector("#sharedWrap"); if (!wrap || !sbClient()) return;
    var wantKind = kind;   // match / show / training — the fine-grained kind, not the coarse resource_type
    Promise.resolve(sbClient().rpc("list_shared_with_me")).then(function (r) {
      if (!wrap.isConnected || !r || r.error) return;
      var rows = (r.data || []).filter(function (x) { return (x.kind || x.resource_type) === wantKind; });
      if (!rows.length) return;
      wrap.innerHTML = '<h2 class="suite-shared-h">🤝 ' + esc(t("sharedWithMe")) + '</h2>' +
        '<div class="suite-list">' + rows.map(function (x) {
          var roleLbl = x.role === "viewer" ? t("collabRoleViewer") : t("collabRoleEditor");
          return '<div class="suite-list-item suite-shared-item" data-sid="' + esc(x.id) + '">' +
            '<div class="suite-list-main"><span class="suite-list-title">' + esc(x.title || "—") + '</span>' +
            '<span class="suite-list-meta">' + esc(tf("sharedBy", { name: x.owner_name || "Acto" })) + ' · ' + esc(roleLbl) + '</span></div>' +
            '<div class="suite-list-actions"><button class="suite-btn suite-btn-mini" data-act="open">' + esc(t("listOpen")) + '</button></div></div>';
        }).join("") + '</div>';
      [].forEach.call(wrap.querySelectorAll(".suite-shared-item"), function (row) {
        row.querySelector('[data-act="open"]').onclick = function () { navigate("#/collab/" + row.getAttribute("data-sid")); };
      });
    }, function () { /* ignore */ });
  }

  function listRow(e) {
    var updated = e.updatedAt ? new Date(e.updatedAt).toLocaleDateString(S.locale()) : "";
    var n = e.nbImpros || 0;
    var countLabel = tf("listMetaCount", { n: n });
    return '<div class="suite-list-item" data-id="' + esc(e.id) + '">' +
      '<div class="suite-list-main">' +
        '<span class="suite-list-title">' + esc(e.title || "—") + (e.matchDate ? ' <span class="suite-list-date">📅 ' + esc(fmtMatchDate(e.matchDate)) + '</span>' : '') + '</span>' +
        '<span class="suite-list-meta">' + esc(tf("listUpdated", { date: updated })) + ' · ' + esc(countLabel) + '</span>' +
      '</div>' +
      '<div class="suite-list-actions">' +
        '<button class="suite-btn suite-btn-mini" data-act="open">' + esc(t("listOpen")) + '</button>' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="dup">' + esc(t("listDuplicate")) + '</button>' +
        '<button class="suite-btn suite-btn-mini suite-btn-danger" data-act="del">' + esc(t("listDelete")) + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     SHARED MICRO-UI: askText dialog + toast
     ============================================================ */
  function askText(label, def) {
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "suite-dialog";
      dlg.innerHTML =
        '<div class="suite-dialog-body">' +
          '<label class="suite-label">' + esc(label) + '</label>' +
          '<input class="suite-input" type="text" value="' + esc(def) + '" />' +
          '<div class="suite-dialog-actions">' +
            '<button type="button" data-r="cancel" class="suite-btn suite-btn-ghost">' + esc(t("saveCancel")) + '</button>' +
            '<button type="button" data-r="ok" class="suite-btn suite-btn-primary">' + esc(t("saveConfirm")) + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(dlg);
      var input = dlg.querySelector("input");
      var settled = false;
      function done(val) {
        if (settled) return; settled = true;
        try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ }
        dlg.remove();
        resolve(val);
      }
      dlg.querySelector('[data-r="ok"]').onclick = function () { done(input.value); };
      dlg.querySelector('[data-r="cancel"]').onclick = function () { done(null); };
      dlg.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); done(input.value); }
        else if (e.key === "Escape") { e.preventDefault(); done(null); }
      });
      if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
      else dlg.setAttribute("open", "");
      setTimeout(function () { input.focus(); input.select(); }, 30);
    });
  }

  function toast(msg) {
    var el = document.createElement("div");
    el.className = "suite-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("is-in"); }, 10);
    setTimeout(function () { el.classList.remove("is-in"); }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }

  /* ============================================================
     TEAMS (name / color / logo / players) — Match only
     ============================================================ */
  function teamsCard(teams) {
    teams = teams || [];
    return '<div class="suite-teams-card">' +
      '<div class="suite-teams-vs">' +
        teamChip(teams[0] || {}, t("teamA")) +
        '<span class="suite-vs">' + esc(t("vsLabel")) + '</span>' +
        teamChip(teams[1] || {}, t("teamB")) +
      '</div>' +
      '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="edit-teams">' + esc(t("teamsEditBtn")) + '</button>' +
    '</div>';
  }
  function teamChip(team, fallback) {
    var nm = team.name || fallback;
    var badge = team.logo
      ? '<img class="suite-tc-logo" src="' + esc(team.logo) + '" alt="" />'
      : '<span class="suite-tc-dot" style="background:' + esc(team.color || "#888") + '"></span>';
    var present = (team.players || []).filter(function (p) { return S.players.present(p); }).length;
    var pc = present ? '<span class="suite-tc-pc">' + present + '</span>' : '';
    return '<span class="suite-tc">' + badge + '<span class="suite-tc-nm">' + esc(nm) + '</span>' + pc + '</span>';
  }

  function fileToLogo(file, cb) {
    if (!file) { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 256;
        var w = img.width || max, h = img.height || max;
        var scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        try {
          var canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          cb(canvas.toDataURL("image/png"));
          // NB: do NOT fall back to reader.result on error — that's the raw
          // (possibly multi-MB) file, which would blow the Realtime payload cap.
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  function openTeamsEditor(teams, onSave) {
    var P = S.players;
    var work = JSON.parse(JSON.stringify(teams || []));
    while (work.length < 2) work.push({ name: "", color: "#cccccc", logo: null, players: [] });
    work.forEach(function (tm) {
      if (tm.logo === undefined) tm.logo = null;
      if (!tm.color) tm.color = "#cccccc";
      tm.players = P.normAll(tm.players);     // strings or objects → {name,photo,user_id,present}
    });
    function libAvailable() { return !!(window.ActoTeamsDB && window.ActoTeamsDB.available()); }

    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-teams-dialog";
    document.body.appendChild(dlg);

    var settled = false;
    function done(save) {
      if (settled) return; settled = true;
      try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ }
      dlg.remove();
      if (save && onSave) onSave(work);
    }
    // Pull live field values into `work` without re-rendering (preserves focus).
    function readInputs() {
      dlg.querySelectorAll(".suite-team-name").forEach(function (inp) { work[+inp.getAttribute("data-ti")].name = inp.value; });
      dlg.querySelectorAll(".suite-color-in").forEach(function (inp) { work[+inp.getAttribute("data-ti")].color = inp.value; });
      dlg.querySelectorAll(".suite-pl-name").forEach(function (inp) {
        var p = work[+inp.getAttribute("data-ti")].players[+inp.getAttribute("data-pi")];
        if (p) p.name = inp.value;
      });
      dlg.querySelectorAll(".suite-pl-present").forEach(function (cb) {
        var p = work[+cb.getAttribute("data-ti")].players[+cb.getAttribute("data-pi")];
        if (p) p.present = cb.checked;
      });
    }
    function logoPrev(logo) {
      return '<div class="suite-logo-prev' + (logo ? " has" : "") + '">' + (logo ? '<img src="' + esc(logo) + '" alt="" />' : "") + '</div>';
    }
    function playerRows(idx) {
      var tm = work[idx];
      if (!tm.players.length) return '<div class="suite-pl-none">' + esc(t("teamPlayersPlaceholder")) + '</div>';
      return tm.players.map(function (p, pi) {
        var mini = p.photo ? '<img class="suite-pl-mini" src="' + esc(p.photo) + '" alt="" />' : '';
        // Link the player to a registered account (so their stats accrue), or unlink.
        var linkBtn = p.user_id
          ? '<button type="button" class="suite-pl-linkbtn is-linked" data-act="pl-unlink" data-ti="' + idx + '" data-pi="' + pi + '" title="' + esc(t("teamsUnlink")) + '">🔗</button>'
          : (libAvailable() ? '<button type="button" class="suite-pl-linkbtn" data-act="pl-link" data-ti="' + idx + '" data-pi="' + pi + '" title="' + esc(t("teamsLinkAccount")) + '">🔗+</button>' : '');
        return '<div class="suite-pl-row' + (p.present === false ? " is-absent" : "") + '">' +
          '<label class="suite-pl-present-l" title="' + esc(t("teamPresentLabel")) + '"><input type="checkbox" class="suite-pl-present" data-ti="' + idx + '" data-pi="' + pi + '"' + (p.present !== false ? " checked" : "") + ' /></label>' +
          '<input type="text" class="suite-input suite-pl-name" data-ti="' + idx + '" data-pi="' + pi + '" value="' + esc(p.name || "") + '" placeholder="' + esc(t("teamsPlayerName")) + '" />' +
          mini + linkBtn +
          '<button type="button" class="suite-pl-del2" data-act="pl-del" data-ti="' + idx + '" data-pi="' + pi + '" aria-label="' + esc(t("commonDelete")) + '">✕</button>' +
        '</div>';
      }).join("");
    }
    function panel(idx) {
      var tm = work[idx];
      var label = idx === 0 ? t("teamA") : t("teamB");
      var present = tm.players.filter(function (p) { return p.present !== false; }).length;
      return '<div class="suite-team-panel">' +
        '<div class="suite-team-h"><span class="suite-tc-dot" style="background:' + esc(tm.color || "#888") + '"></span>' + esc(label) + '</div>' +
        '<input class="suite-input suite-team-name" data-ti="' + idx + '" type="text" placeholder="' + esc(t("teamNamePlaceholder")) + '" value="' + esc(tm.name || "") + '" />' +
        '<div class="suite-team-logo-row">' +
          logoPrev(tm.logo) +
          '<div class="suite-team-logo-btns">' +
            '<button type="button" class="suite-btn suite-btn-mini suite-btn-ghost" data-act="logo-pick" data-ti="' + idx + '">' + esc(t("teamLogoAdd")) + '</button>' +
            (tm.logo ? '<button type="button" class="suite-btn suite-btn-mini suite-btn-danger" data-act="logo-clear" data-ti="' + idx + '">' + esc(t("teamLogoRemove")) + '</button>' : "") +
            '<label class="suite-color-pick"><span>' + esc(t("teamColorLabel")) + '</span><input type="color" class="suite-color-in" data-ti="' + idx + '" value="' + esc(tm.color || "#cccccc") + '" /></label>' +
          '</div>' +
          '<input type="file" accept="image/*" class="suite-logo-file" data-ti="' + idx + '" hidden />' +
        '</div>' +
        '<div class="suite-pl-headrow"><span class="suite-label">' + esc(t("teamPlayersLabel")) + '</span>' +
          '<span class="suite-pl-present-n">' + tf("teamPresentCount", { present: present, total: tm.players.length }) + '</span></div>' +
        '<div class="suite-pl-list">' + playerRows(idx) + '</div>' +
        '<div class="suite-pl-tools">' +
          '<button type="button" class="suite-btn suite-btn-mini suite-btn-ghost" data-act="pl-add" data-ti="' + idx + '">+ ' + esc(t("teamsAddPlayer")) + '</button>' +
          (libAvailable() ? '<button type="button" class="suite-btn suite-btn-mini suite-btn-ghost" data-act="pl-load" data-ti="' + idx + '">📋 ' + esc(t("teamsLoadSaved")) + '</button>' : '') +
          (libAvailable() ? '<button type="button" class="suite-btn suite-btn-mini suite-btn-save" data-act="pl-savelib" data-ti="' + idx + '">💾 ' + esc(t("teamsSaveToLib")) + '</button>' : '') +
        '</div>' +
      '</div>';
    }
    function render() {
      dlg.innerHTML = '<div class="suite-dialog-body">' +
        '<h2 class="suite-dialog-title">' + esc(t("teamsTitle")) + '</h2>' +
        '<div class="suite-teams-grid">' + panel(0) + panel(1) + '</div>' +
        '<div class="suite-dialog-actions">' +
          '<button type="button" data-r="cancel" class="suite-btn suite-btn-ghost">' + esc(t("teamsCancel")) + '</button>' +
          '<button type="button" data-r="ok" class="suite-btn suite-btn-primary">' + esc(t("teamsSave")) + '</button>' +
        '</div>' +
      '</div>';
      wire();
    }
    function wire() {
      // Text/color/checkbox updates mutate `work` directly (no re-render → focus kept).
      dlg.querySelectorAll(".suite-team-name").forEach(function (inp) { inp.oninput = function () { work[+inp.getAttribute("data-ti")].name = inp.value; }; });
      dlg.querySelectorAll(".suite-color-in").forEach(function (inp) { inp.oninput = function () { work[+inp.getAttribute("data-ti")].color = inp.value; }; });
      dlg.querySelectorAll(".suite-pl-name").forEach(function (inp) {
        inp.oninput = function () { var p = work[+inp.getAttribute("data-ti")].players[+inp.getAttribute("data-pi")]; if (p) p.name = inp.value; };
      });
      dlg.querySelectorAll(".suite-pl-present").forEach(function (cb) {
        cb.onchange = function () {
          var p = work[+cb.getAttribute("data-ti")].players[+cb.getAttribute("data-pi")];
          if (p) { p.present = cb.checked; readInputs(); render(); }
        };
      });
      dlg.querySelectorAll('[data-act="logo-pick"]').forEach(function (b) {
        b.onclick = function () { dlg.querySelector('.suite-logo-file[data-ti="' + b.getAttribute("data-ti") + '"]').click(); };
      });
      dlg.querySelectorAll(".suite-logo-file").forEach(function (f) {
        f.onchange = function () {
          var i = +f.getAttribute("data-ti"), file = f.files && f.files[0];
          readInputs();
          fileToLogo(file, function (dataUrl) { if (dataUrl) work[i].logo = dataUrl; render(); });
        };
      });
      dlg.querySelectorAll('[data-act="logo-clear"]').forEach(function (b) {
        b.onclick = function () { var i = +b.getAttribute("data-ti"); readInputs(); work[i].logo = null; render(); };
      });
      dlg.querySelectorAll('[data-act="pl-add"]').forEach(function (b) {
        b.onclick = function () { readInputs(); work[+b.getAttribute("data-ti")].players.push({ name: "", photo: null, user_id: null, present: true }); render(); };
      });
      dlg.querySelectorAll('[data-act="pl-del"]').forEach(function (b) {
        b.onclick = function () { readInputs(); work[+b.getAttribute("data-ti")].players.splice(+b.getAttribute("data-pi"), 1); render(); };
      });
      dlg.querySelectorAll('[data-act="pl-load"]').forEach(function (b) {
        b.onclick = function () { readInputs(); openLoadPicker(+b.getAttribute("data-ti")); };
      });
      dlg.querySelectorAll('[data-act="pl-link"]').forEach(function (b) {
        b.onclick = function () { readInputs(); openPlayerLink(+b.getAttribute("data-ti"), +b.getAttribute("data-pi")); };
      });
      dlg.querySelectorAll('[data-act="pl-unlink"]').forEach(function (b) {
        b.onclick = function () { readInputs(); var p = work[+b.getAttribute("data-ti")].players[+b.getAttribute("data-pi")]; if (p) p.user_id = null; render(); };
      });
      dlg.querySelectorAll('[data-act="pl-savelib"]').forEach(function (b) {
        b.onclick = function () { readInputs(); saveTeamToLib(+b.getAttribute("data-ti"), b); };
      });
      var ok = dlg.querySelector('[data-r="ok"]'); if (ok) ok.onclick = function () { readInputs(); done(true); };
      var cancel = dlg.querySelector('[data-r="cancel"]'); if (cancel) cancel.onclick = function () { done(false); };
    }

    // Load a saved team from the library into match side `idx`.
    function openLoadPicker(idx) {
      var pop = document.createElement("dialog");
      pop.className = "suite-dialog suite-load-dialog";
      pop.innerHTML = '<div class="suite-dialog-body">' +
        '<h2 class="suite-dialog-title">' + esc(t("teamsLoadTitle")) + '</h2>' +
        '<div class="suite-load-list">' + esc(t("commonLoading")) + '</div>' +
        '<div class="suite-dialog-actions"><button type="button" data-r="close" class="suite-btn suite-btn-ghost">' + esc(t("commonClose")) + '</button></div>' +
      '</div>';
      document.body.appendChild(pop);
      function closePop() { try { if (pop.open) pop.close(); } catch (e) {} pop.remove(); }
      pop.querySelector('[data-r="close"]').onclick = closePop;
      var list = pop.querySelector(".suite-load-list");
      window.ActoTeamsDB.list().then(function (res) {
        var rows = (res && res.data) || [];
        if (res && res.error) { list.innerHTML = '<div class="suite-pl-none">' + esc(t("teamsLoadError")) + '</div>'; return; }
        if (!rows.length) { list.innerHTML = '<div class="suite-pl-none">' + esc(t("teamsEmpty")) + '</div>'; return; }
        list.innerHTML = rows.map(function (tm, i) {
          var logo = tm.logo ? '<img class="suite-load-logo" src="' + esc(tm.logo) + '" alt="" />'
            : '<span class="suite-load-logo suite-load-logo-ph" style="background:' + esc(tm.color || "#888") + '"></span>';
          return '<button type="button" class="suite-load-item" data-i="' + i + '">' + logo +
            '<span class="suite-load-nm">' + esc(tm.name || t("teamsUnnamed")) + '</span>' +
            '<span class="suite-load-c">' + tf("teamsPlayerCount", { n: (tm.players || []).length }) + '</span>' +
          '</button>';
        }).join("");
        list.querySelectorAll(".suite-load-item").forEach(function (b) {
          b.onclick = function () {
            var src = rows[+b.getAttribute("data-i")];
            work[idx].name = src.name || "";
            work[idx].color = src.color || work[idx].color;
            work[idx].logo = src.logo || null;
            work[idx].players = P.normAll(src.players).map(function (p) { p.present = true; return p; });
            work[idx].libId = src.id;   // remember the library team so "💾 Enregistrer" updates it
            closePop(); render();
          };
        });
      });
      if (typeof pop.showModal === "function") { try { pop.showModal(); } catch (e) { pop.setAttribute("open", ""); } } else pop.setAttribute("open", "");
    }

    // Link a match player to a registered Acto account (so their stats accrue).
    function openPlayerLink(ti, pi) {
      if (!libAvailable()) return;
      var pop = document.createElement("dialog");
      pop.className = "suite-dialog suite-link-dialog";
      pop.innerHTML = '<div class="suite-dialog-body">' +
          '<h2 class="suite-dialog-title">' + esc(t("teamsLinkAccount")) + '</h2>' +
          '<input type="search" class="suite-input link-q" placeholder="' + esc(t("teamsSearchPlaceholder")) + '" autocomplete="off" />' +
          '<div class="link-results"></div>' +
          '<div class="suite-dialog-actions"><button type="button" class="suite-btn suite-btn-ghost" data-r="close">' + esc(t("commonClose")) + '</button></div>' +
        '</div>';
      document.body.appendChild(pop);
      function closePop() { try { if (pop.open) pop.close(); } catch (e) { /* ignore */ } pop.remove(); }
      pop.querySelector('[data-r="close"]').onclick = closePop;
      var q = pop.querySelector(".link-q"), out = pop.querySelector(".link-results"), tmr = null;
      function search() {
        var val = q.value.trim();
        if (val.length < 2) { out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchHint")) + '</div>'; return; }
        out.innerHTML = '<div class="link-hint">' + esc(t("commonLoading")) + '</div>';
        window.ActoTeamsDB.searchUsers(val).then(function (res) {
          if (res.error) { out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchError")) + '</div>'; return; }
          var rows = res.data || [];
          if (!rows.length) { out.innerHTML = '<div class="link-hint">' + esc(t("teamsSearchNone")) + '</div>'; return; }
          out.innerHTML = rows.map(function (r) {
            return '<button type="button" class="link-res" data-id="' + esc(r.id) + '" data-nm="' + esc(r.nom_scene || r.prenom || "") + '">' +
              '<span class="link-res-nm">' + esc(r.nom_scene || "—") + '</span>' +
              (r.prenom ? '<span class="link-res-pn">' + esc(r.prenom) + '</span>' : '') +
            '</button>';
          }).join("");
          out.querySelectorAll(".link-res").forEach(function (b) {
            b.onclick = function () {
              var p = work[ti].players[pi]; if (!p) { closePop(); return; }
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
      setTimeout(function () { try { q.focus(); } catch (e) { /* ignore */ } }, 30);
    }

    // Save this match team into the "Mes équipes" library (create, or update if
    // it was loaded from there). Lets the user reuse the roster + keep linked players.
    function saveTeamToLib(idx, btn) {
      if (!libAvailable()) return;
      var tm = work[idx];
      var name = (tm.name || "").trim();
      if (!name) { toast(t("teamsNeedName")); return; }
      var players = (tm.players || []).map(function (p) {
        return { name: (p.name || "").trim(), photo: p.photo || null, user_id: p.user_id || null };
      }).filter(function (p) { return p.name || p.photo || p.user_id; });
      var payload = { name: name, color: tm.color, logo: tm.logo || null, players: players };
      if (btn) btn.disabled = true;
      var op = tm.libId ? window.ActoTeamsDB.update(tm.libId, payload) : window.ActoTeamsDB.create(payload);
      Promise.resolve(op).then(function (res) {
        if (btn) btn.disabled = false;
        if (!res || res.error) { toast(t("teamsSaveError")); return; }
        if (!tm.libId && res.data && res.data.id) tm.libId = res.data.id;   // future saves update this team
        toast(t("teamsSavedToLib"));
      });
    }

    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); done(false); } });
    render();
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
    else dlg.setAttribute("open", "");
  }

  /* ============================================================
     COLLABORATIVE EDITING (F2 — account-based, shared_resources + RLS)
     A match/entraînement is pushed to public.shared_resources; the owner adds
     named COLLABORATORS (by nom de scène → direct access, or by email → pending
     invite claimed on signup) with roles (owner/editor/viewer). Durable store =
     save_shared_resource RPC (RLS + role gated); the Realtime broadcast on
     acto-resource:<id> carries edits for low latency + presence ("N en édition").
     Last-write-wins. Replaces the #80 token-link model (shared_matches, dormant).
     ============================================================ */
  var collab = null;   // { id, token, channel, applyingRemote, pushTimer, peers }
  var collabReq = null;   // identity token → ignore stale async resolutions after navigation
  function sbClient() { return window.actoSuiteSb || null; }
  // The session minus the capability secrets — the token must NEVER be synced
  // (it would leak over the broadcast / into the durable row to any id-holder).
  function collabClean(s) {
    var out = {};
    for (var k in s) { if (s.hasOwnProperty(k) && k !== "collabId" && k !== "collabToken") out[k] = s[k]; }
    return out;
  }
  function collabMe() {
    var u = window.actoUser || {};
    return u.nom_scene || u.prenom || u.email || t("collabSomeone");
  }
  function collabPeerCount() { return collab ? Math.max(1, Object.keys(collab.peers || {}).length) : 0; }
  function collabLink(id) {
    return window.location.origin + window.location.pathname + "#/collab/" + id;
  }
  function collabCanEdit() { return collab && collab.role !== "viewer"; }
  function resourceType() { return kind === "training" ? "entrainement" : "match"; }
  function debounceC(fn, ms) { var h; return function () { var a = arguments, self = this; clearTimeout(h); h = setTimeout(function () { fn.apply(self, a); }, ms); }; }

  function collabTeardown() {
    collabReq = {};   // invalidate any in-flight mount/create resolution (even before collab exists)
    if (!collab) return;
    if (collab.pushTimer) { clearTimeout(collab.pushTimer); collab.pushTimer = null; collabPushNow(); }  // flush the last queued edit on exit
    try { var c = sbClient(); if (c && collab.channel) c.removeChannel(collab.channel); } catch (e) { /* ignore */ }
    collab = null;
  }
  function collabPushNow() {
    if (!collab || !current) return;
    var data = collabClean(current), id = collab.id, c = sbClient();
    // Durable save is RLS + role gated server-side; viewers never write.
    if (c && collabCanEdit()) { try { Promise.resolve(c.rpc("save_shared_resource", { p_id: id, p_title: data.title || "", p_data: data })).then(function (r) { if (r && r.error) console.warn("[collab] save", r.error); }); } catch (e) { /* ignore */ } }
    try { if (collab.channel && collabCanEdit()) collab.channel.send({ type: "broadcast", event: "edit", payload: { data: data } }); } catch (e) { /* ignore */ }
  }
  function collabPush() {
    if (!collab || collab.applyingRemote || !collabCanEdit()) return;
    if (collab.pushTimer) clearTimeout(collab.pushTimer);
    collab.pushTimer = setTimeout(function () { collab.pushTimer = null; collabPushNow(); }, 700);
  }
  function collabApplyRemote(data) {
    if (!collab || !data || !root) return;
    if (collab.pushTimer) { clearTimeout(collab.pushTimer); collab.pushTimer = null; }  // remote edit supersedes a not-yet-sent local push
    collab.applyingRemote = true;
    current = data;
    current.collabId = collab.id;
    if (current.kind && KINDS[current.kind]) { kind = current.kind; K = KINDS[kind]; }
    renderEditor();
    collab.applyingRemote = false;
  }
  function updateCollabBadge() {
    var el = root && root.querySelector(".suite-collab-badge");
    if (el && collab) { var n = collabPeerCount(); el.textContent = "👥 " + tf("collabActive", { n: n }); el.classList.toggle("is-solo", n <= 1); }
  }
  function collabStart(id, role) {
    collabTeardown();
    var c = sbClient(); if (!c) return;
    collab = { id: id, role: role || "editor", channel: null, applyingRemote: false, pushTimer: null, peers: {} };
    // Public broadcast channel keyed by the resource id (low-latency live edits +
    // presence). The DURABLE store is RLS + role gated server-side (save_shared_resource),
    // so an id-only snooper can at most inject transient edits, never persist them.
    var ch = c.channel("acto-resource:" + id, { config: { broadcast: { self: false }, presence: { key: id } } });
    ch.on("broadcast", { event: "edit" }, function (msg) { if (msg && msg.payload && msg.payload.data) collabApplyRemote(msg.payload.data); });
    ch.on("broadcast", { event: "hello" }, function () { if (collab && !collab.applyingRemote) collabPushNow(); });
    ch.on("presence", { event: "sync" }, function () { if (collab) { collab.peers = ch.presenceState(); updateCollabBadge(); } });
    ch.subscribe(function (status) {
      if (status === "SUBSCRIBED") {
        try { ch.track({ name: collabMe() }); } catch (e) { /* ignore */ }
        try { ch.send({ type: "broadcast", event: "hello", payload: {} }); } catch (e) { /* ignore */ }
      }
    });
    collab.channel = ch;
  }

  // Ensure the current session exists server-side (share_resource_create once), then onReady(id).
  function collabEnsureShared(onReady) {
    if (!sbClient()) { toast(t("collabNeedAuth")); return; }
    if (current.collabId) {
      if (!collab) collabStart(current.collabId, "owner");
      onReady(current.collabId);
      return;
    }
    toast(t("collabCreating"));
    var myReq = (collabReq = {});
    Promise.resolve(sbClient().rpc("share_resource_create", { p_type: resourceType(), p_title: current.title || "", p_data: collabClean(current) }))
      .then(function (r) {
        if (collabReq !== myReq) return;                  // navigated away mid-create
        if (r.error || !r.data) { toast(t("collabError")); return; }
        var id = r.data;                                  // scalar uuid
        current.collabId = id; S.sessions.save(current);  // remember it's shared
        collabStart(id, "owner");
        collab.applyingRemote = true; renderEditor(); collab.applyingRemote = false;
        onReady(id);
      })
      .catch(function () { if (collabReq === myReq) toast(t("collabError")); });
  }
  function openCollabDialog() { collabEnsureShared(function (id) { showCollaborators(id); }); }

  // The Collaborators modal (owner-facing): who's on it + add by nom de scène
  // (direct access) or by email (pending invite) + role + remove.
  function showCollaborators(id) {
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-collab-dialog";
    dlg.innerHTML =
      '<div class="suite-dialog-body">' +
        '<h2 class="suite-dialog-title">👥 ' + esc(t("collabTitle")) + '</h2>' +
        '<p class="suite-dialog-text">' + esc(t("collabHelp2")) + '</p>' +
        '<div class="suite-collab-list" data-r="list"><p class="suite-sub">…</p></div>' +
        '<div class="suite-field"><span class="suite-label">' + esc(t("collabAddByName")) + '</span>' +
          '<input class="suite-input" data-r="search" type="text" placeholder="' + esc(t("collabSearchPh")) + '" autocomplete="off" />' +
          '<div class="suite-collab-results" data-r="results"></div></div>' +
        '<div class="suite-field"><span class="suite-label">' + esc(t("collabAddByEmail")) + '</span>' +
          '<div class="suite-collab-emailrow"><input class="suite-input" data-r="email" type="email" placeholder="' + esc(t("collabEmailPh")) + '" />' +
          '<button type="button" class="suite-btn suite-btn-ghost" data-r="addemail">' + esc(t("collabInvite")) + '</button></div></div>' +
        '<div class="suite-dialog-actions">' +
          '<button type="button" data-r="close" class="suite-btn suite-btn-primary">' + esc(t("commonClose")) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); }
    var listEl = dlg.querySelector('[data-r="list"]'), search = dlg.querySelector('[data-r="search"]'), results = dlg.querySelector('[data-r="results"]');
    dlg.querySelector('[data-r="close"]').onclick = close;

    function refresh() {
      Promise.resolve(sbClient().rpc("list_collaborators", { p_res: id })).then(function (r) {
        if (r && r.error) { listEl.innerHTML = '<p class="suite-sub">' + esc(t("collabError")) + '</p>'; return; }
        var rows = (r && r.data) || [];
        var html = '<div class="suite-collab-row is-owner"><span class="suite-collab-nm">' + esc(collabMe()) + '</span><span class="suite-collab-owner">' + esc(t("collabRoleOwner")) + '</span></div>';
        if (!rows.length) html += '<p class="suite-sub suite-collab-empty">' + esc(t("collabNone")) + '</p>';
        html += rows.map(function (c) {
          var pend = c.status === "pending" ? ' <span class="suite-collab-pending">' + esc(t("collabPending")) + '</span>' : '';
          return '<div class="suite-collab-row"><span class="suite-collab-nm">' + esc(c.name) + pend + '</span>' +
            '<select class="suite-edit-select suite-collab-rolesel" data-cid="' + esc(c.id) + '">' +
              '<option value="editor"' + (c.role !== "viewer" ? " selected" : "") + '>' + esc(t("collabRoleEditor")) + '</option>' +
              '<option value="viewer"' + (c.role === "viewer" ? " selected" : "") + '>' + esc(t("collabRoleViewer")) + '</option></select>' +
            '<button type="button" class="suite-btn suite-btn-mini" data-rm="' + esc(c.id) + '" aria-label="' + esc(t("commonDelete")) + '">✕</button></div>';
        }).join("");
        listEl.innerHTML = html;
        [].forEach.call(listEl.querySelectorAll("[data-rm]"), function (b) { b.onclick = function () { Promise.resolve(sbClient().rpc("remove_collaborator", { p_res: id, p_collab: b.getAttribute("data-rm") })).then(refresh); }; });
        [].forEach.call(listEl.querySelectorAll(".suite-collab-rolesel"), function (sel) { sel.onchange = function () { Promise.resolve(sbClient().rpc("set_collaborator_role", { p_res: id, p_collab: sel.getAttribute("data-cid"), p_role: sel.value })); }; });
      }, function () { listEl.innerHTML = '<p class="suite-sub">' + esc(t("collabError")) + '</p>'; });
    }
    refresh();

    search.addEventListener("input", debounceC(function () {
      var q = search.value.trim();
      if (q.length < 2) { results.innerHTML = ""; return; }
      Promise.resolve(sbClient().rpc("search_users_by_stage_name", { p_query: q })).then(function (r) {
        var rows = (r && r.data) || [];
        if (!rows.length) { results.innerHTML = '<div class="suite-sub">' + esc(t("collabSearchNone")) + '</div>'; return; }
        results.innerHTML = rows.slice(0, 6).map(function (u) {
          return '<button type="button" class="suite-collab-res" data-id="' + esc(u.id) + '" data-nm="' + esc(u.nom_scene || "") + '">🎭 ' + esc(u.nom_scene || "") + (u.prenom ? ' <span class="suite-collab-res-sub">· ' + esc(u.prenom) + '</span>' : '') + '</button>';
        }).join("");
        [].forEach.call(results.querySelectorAll(".suite-collab-res"), function (b) {
          b.onclick = function () {
            Promise.resolve(sbClient().rpc("add_collaborator", { p_res: id, p_user_id: b.getAttribute("data-id"), p_email: null, p_label: b.getAttribute("data-nm"), p_role: "editor" }))
              .then(function () { search.value = ""; results.innerHTML = ""; refresh(); });
          };
        });
      }, function () { results.innerHTML = ""; });
    }, 260));

    dlg.querySelector('[data-r="addemail"]').onclick = function () {
      var em = dlg.querySelector('[data-r="email"]').value.trim();
      if (!em || em.indexOf("@") < 1) return;
      Promise.resolve(sbClient().rpc("add_collaborator", { p_res: id, p_user_id: null, p_email: em, p_label: null, p_role: "editor" }))
        .then(function () { dlg.querySelector('[data-r="email"]').value = ""; refresh(); });
    };

    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
  }

  function renderCollabError() {
    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="home">← ' + esc(t(KINDS.match.titleKey)) + '</button>' +
        '<h1 class="suite-h1">' + esc(t("collabError")) + '</h1>' +
        '<p class="suite-sub">' + esc(t("collabErrorHelp")) + '</p>' +
      '</div>';
    var b = root.querySelector('[data-act="home"]');
    if (b) b.onclick = function () { navigate("#/match"); };
  }
  function mountCollab(container, nav, sub) {
    root = container; navigate = nav || navigate;
    editing = null; current = null;
    collabTeardown();
    var id = String(sub || "").split("/")[0];
    if (!id) { navigate("#/match"); return; }
    kind = "match"; K = KINDS.match;
    root.innerHTML = '<div class="suite-section-head"><h1 class="suite-h1">' + esc(t("collabLoading")) + '</h1></div>';
    var c = sbClient();
    if (!c) { renderCollabError(); return; }
    var myReq = (collabReq = {});
    // Await session restore first — a cold deep-link load races the async getSession(),
    // and the RLS-gated RPC needs the user JWT (else auth.uid() is null → "not allowed").
    Promise.resolve(c.auth.getSession())
      .then(function () {
        if (collabReq !== myReq) return null;     // navigated away while restoring
        return c.rpc("get_shared_resource", { p_id: id });
      })
      .then(function (r) {
        if (collabReq !== myReq || !r) return;    // stale resolution → ignore
        if (r.error || !r.data || !r.data[0] || !r.data[0].data) { renderCollabError(); return; }
        var row = r.data[0];
        current = row.data;
        current.collabId = id;
        kind = (current.kind && KINDS[current.kind]) ? current.kind : (row.resource_type === "entrainement" ? "training" : "match"); K = KINDS[kind];
        collabStart(id, row.my_role || "editor");
        collab.applyingRemote = true; renderEditor(); collab.applyingRemote = false;
      })
      .catch(function () { if (collabReq === myReq) renderCollabError(); });
  }

  window.ActoProgram = { mount: mount, mountCollab: mountCollab, cleanup: collabTeardown };
  window.ActoMatch = window.ActoProgram;   // back-compat alias
})();
