/**
 * js/suite/defis.js — Section « Défis » du Studio (#/defis).
 *
 * Le défi existait déjà (js/challenge.js + defi.html), mais on ne pouvait en
 * envoyer un que depuis le Match rapide, après avoir tiré une impro. Cette
 * section en fait une entrée à part entière : on tire une épreuve, on l'ajuste,
 * on l'envoie — et on retrouve au même endroit ses défis envoyés et reçus.
 *
 * L'envoi lui-même reste celui de challenge.js : même modale, même RPC, même
 * page de réalisation côté destinataire. On ne fait que l'alimenter.
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  var root = null, navigate = function () {};
  var epreuve = null;            // le tirage courant, gardé le temps de la visite

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(k) { return S.t(k); }
  function tf(k, v) { return S.tf(k, v); }

  /* Un défi porte sur UNE impro : catégorie, thème, nombre de joueurs, durée —
     exactement ce que produit le générateur de match pour un segment. */
  function tirer(level) {
    var seg = S.gen.newSegmentFor("match", level || "debutant");
    S.gen.fillSegment(seg, level || "debutant");
    return seg;
  }
  function snapshot(seg, level) {
    var cat = seg.category || null;
    return {
      kind: "impro",
      title: (cat && cat.name) || seg.theme || "",
      subtitle: (cat && cat.desc) || "",
      theme: seg.theme || "",
      category: (cat && cat.name) || "",
      nature: "",
      players: seg.players != null ? String(seg.players) : "",
      durationSec: seg.durationSec || 0,
      level: level || "",
      constraint: ""
    };
  }

  function mount(container, sub, nav) {
    root = container; navigate = nav || navigate;
    if (!epreuve) epreuve = { level: "debutant", seg: tirer("debutant") };
    render();
  }

  function render() {
    var seg = epreuve.seg;
    var cat = seg.category;
    var lignes = [
      { l: t("fieldCategory"), v: seg.freeCategory ? t("freeCategory") : ((cat && cat.name) || t("valueNone")) },
      { l: t("fieldTheme"), v: seg.theme || t("valueNone") },
      { l: t("fieldPlayers"), v: seg.players || t("valueNone") },
      { l: t("fieldDuration"), v: S.formatSec(seg.durationSec) }
    ];

    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="home">← ' + esc(t("suiteHomeTitle")) + '</button>' +
        '<h1 class="suite-h1">🎯 ' + esc(t("sectionDefiTitle")) + '</h1>' +
        '<p class="suite-sub">' + esc(t("sectionDefiDesc")) + '</p>' +
      '</div>' +
      '<div class="suite-field">' +
        '<label class="suite-label">' + esc(t("prepLevel")) + '</label>' +
        '<div class="suite-seg" data-seg="level">' +
          S.levels.map(function (lv) {
            return '<button type="button" class="suite-seg-opt' + (epreuve.level === lv ? " is-on" : "") +
              '" data-level="' + lv + '">' + esc(S.t(lv === "debutant" ? "levelDebutant" : lv === "confirme" ? "levelConfirme" : "levelExpert")) + '</button>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="suite-defi-card">' +
        '<div class="suite-defi-h">' + esc(t("defiDrawTitle")) + '</div>' +
        '<div class="suite-defi-rows">' +
          lignes.map(function (r) {
            return '<div class="suite-defi-row"><span class="suite-defi-l">' + esc(r.l) + '</span>' +
              '<span class="suite-defi-v">' + esc(r.v) + '</span></div>';
          }).join("") +
        '</div>' +
        '<div class="suite-defi-actions">' +
          '<button class="suite-btn suite-btn-ghost" data-act="redraw">🎲 ' + esc(t("defiRedraw")) + '</button>' +
          '<button class="suite-btn suite-btn-primary" data-act="send">🎯 ' + esc(t("defiSendBtn")) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="suite-defi-links">' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="mine">📤 ' + esc(t("defiMine")) + '</button>' +
        '<button class="suite-btn suite-btn-mini suite-btn-ghost" data-act="received">📥 ' + esc(t("defiReceived")) + '</button>' +
      '</div>';

    root.querySelector('[data-act="home"]').onclick = function () { navigate("#/"); };
    root.querySelectorAll('[data-seg="level"] .suite-seg-opt').forEach(function (b) {
      b.onclick = function () {
        epreuve.level = b.getAttribute("data-level");
        epreuve.seg = tirer(epreuve.level);      // le niveau change le tirage : on retire
        render();
      };
    });
    root.querySelector('[data-act="redraw"]').onclick = function () { epreuve.seg = tirer(epreuve.level); render(); };
    root.querySelector('[data-act="send"]').onclick = function () {
      if (!window.ActoChallenge) return;
      window.ActoChallenge.open(snapshot(epreuve.seg, epreuve.level));
    };
    root.querySelector('[data-act="mine"]').onclick = function () { if (window.ActoChallenge) window.ActoChallenge.openMine(); };
    root.querySelector('[data-act="received"]').onclick = function () { if (window.ActoChallenge) window.ActoChallenge.openReceived(); };
  }

  window.ActoDefis = { mount: mount };
})();
