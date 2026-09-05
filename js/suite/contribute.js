/**
 * js/suite/contribute.js — "Contribuer" hub (window.ActoContribute).
 *
 * Lets a logged-in user propose content from inside the Studio. Each type maps
 * to an existing Supabase SECURITY-DEFINER submit RPC; everything lands in the
 * pending queue the admin already moderates (user_submissions / warmup_exercises
 * / inspiration_videos). Reached at #/contribute. Uses window.actoSuiteSb.
 */
(function () {
  "use strict";

  var S = window.ActoSuite;
  var root = null, navigate = function () {};
  function t(k) { return S.t(k); }
  function loc() { return S.locale(); }
  function sb() { return window.actoSuiteSb || null; }
  function available() { return !!sb() && !!window.actoUser; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* type → fields + the RPC it calls. Option values are the server enums; the
     2nd tuple element is the i18n key for the label. */
  var TYPES = [
    { key: "theme", icon: "🎯", labelKey: "contribTheme", descKey: "contribThemeDesc",
      rpc: "submit_user_text",
      fields: [{ k: "text", lblKey: "contribFThemeText", type: "text", required: true, max: 120 }],
      args: function (v) { return { p_kind: "theme", p_mode: "", p_level: "", p_locale: loc(), p_text: v.text, p_description: null }; } },
    { key: "category", icon: "🏷️", labelKey: "contribCategory", descKey: "contribCategoryDesc",
      rpc: "submit_user_text",
      fields: [
        { k: "text", lblKey: "contribFCatName", type: "text", required: true, max: 80 },
        { k: "desc", lblKey: "contribFDesc", type: "textarea", max: 2000 }
      ],
      args: function (v) { return { p_kind: "category", p_mode: "", p_level: "", p_locale: loc(), p_text: v.text, p_description: v.desc || null }; } },
    { key: "exercise", icon: "🎭", labelKey: "contribExercise", descKey: "contribExerciseDesc",
      rpc: "submit_user_text",
      fields: [
        { k: "name", lblKey: "contribFName", type: "text", required: true, max: 120 },
        { k: "desc", lblKey: "contribFDesc", type: "textarea", required: true, max: 2000 },
        { k: "mode", lblKey: "contribFMode", type: "select", options: [["troupe", "contribOptTroupe"], ["match", "contribOptMatch"]] },
        { k: "level", lblKey: "contribFLevel", type: "select", options: [["debutant", "contribOptDebutant"], ["confirme", "contribOptConfirme"], ["expert", "contribOptExpert"]] }
      ],
      args: function (v) { return { p_kind: "exercise", p_mode: v.mode || "", p_level: v.level || "", p_locale: loc(), p_text: v.name, p_description: v.desc || null }; } },
    { key: "warmup", icon: "🔥", labelKey: "contribWarmup", descKey: "contribWarmupDesc",
      rpc: "submit_warmup_exercise",
      fields: [
        { k: "name", lblKey: "contribFName", type: "text", required: true, max: 160 },
        { k: "desc", lblKey: "contribFDesc", type: "textarea", required: true, max: 2000 },
        { k: "wtype", lblKey: "contribFType", type: "select", options: [["Échauffement", "contribOptWEch"], ["Mise en train", "contribOptWMet"], ["Atelier", "contribOptWAtl"], ["Situation de jeu", "contribOptWSit"]] },
        { k: "duration", lblKey: "contribFDuration", type: "number", placeholderKey: "contribFDurationPh" },
        { k: "participants", lblKey: "contribFParticipants", type: "text", max: 80 }
      ],
      args: function (v) {
        var sec = v.duration ? Math.max(0, Math.round(parseFloat(v.duration) * 60)) : null;
        return { p_type: v.wtype || "Échauffement", p_subtype: "", p_name: v.name, p_description: v.desc, p_duration_seconds: (sec === sec ? sec : null), p_participants: v.participants || "", p_source: "", p_locale: loc() };
      } },
    { key: "inspiration", icon: "🎬", labelKey: "contribInspiration", descKey: "contribInspirationDesc",
      rpc: "submit_inspiration_video",
      fields: [
        { k: "title", lblKey: "contribFTitle", type: "text", required: true, max: 200 },
        { k: "url", lblKey: "contribFUrl", type: "text", required: true, max: 400, placeholderKey: "contribFUrlPh" },
        { k: "channel", lblKey: "contribFChannel", type: "text", max: 120 },
        { k: "ctype", lblKey: "contribFContentType", type: "select", options: [["match_impro", "contribOptCMatch"], ["spectacle", "contribOptCShow"], ["tutoriel", "contribOptCTuto"], ["cabaret", "contribOptCCab"], ["format_court", "contribOptCShort"], ["documentaire", "contribOptCDoc"], ["chaine", "contribOptCChan"]] },
        { k: "notes", lblKey: "contribFNotes", type: "textarea", max: 2000 }
      ],
      args: function (v) { return { p_title: v.title, p_channel: v.channel || "", p_content_type: v.ctype || "match_impro", p_nature: "", p_category: "", p_theme: "", p_duration_text: "", p_notes: v.notes || "", p_video_url: v.url || "", p_locale: loc() }; } }
  ];
  function typeByKey(k) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === k) return TYPES[i]; return null; }

  function mount(container, sub, nav) {
    root = container; navigate = nav || navigate;
    renderHub();
  }

  function renderHub() {
    var cards = TYPES.map(function (ty) {
      return '<button class="suite-contrib-card" type="button" data-type="' + ty.key + '">' +
        '<span class="suite-contrib-icon" aria-hidden="true">' + ty.icon + '</span>' +
        '<span class="suite-contrib-name">' + esc(t(ty.labelKey)) + '</span>' +
        '<span class="suite-contrib-desc">' + esc(t(ty.descKey)) + '</span>' +
      '</button>';
    }).join("");
    root.innerHTML =
      '<div class="suite-section-head">' +
        '<button class="suite-back" data-act="home">' + esc(t("commonBack")) + '</button>' +
        '<h1 class="suite-section-title">💡 ' + esc(t("contribTitle")) + '</h1>' +
      '</div>' +
      '<p class="suite-section-sub">' + esc(t(available() ? "contribIntro" : "contribOffline")) + '</p>' +
      (available() ? '<div class="suite-contrib-grid">' + cards + '</div>' : '');
    root.querySelector('[data-act="home"]').onclick = function () { navigate("#/"); };
    root.querySelectorAll(".suite-contrib-card").forEach(function (b) {
      b.onclick = function () { openForm(typeByKey(b.getAttribute("data-type"))); };
    });
  }

  function fieldHtml(f) {
    var lbl = esc(t(f.lblKey)) + (f.required ? ' <span class="suite-req">*</span>' : "");
    var ph = f.placeholderKey ? esc(t(f.placeholderKey)) : "";
    var inner;
    if (f.type === "textarea") {
      inner = '<textarea class="suite-input" data-f="' + f.k + '" rows="3"' + (f.max ? ' maxlength="' + f.max + '"' : "") + ' placeholder="' + ph + '"></textarea>';
    } else if (f.type === "select") {
      inner = '<select class="suite-input suite-edit-select" data-f="' + f.k + '">' +
        f.options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(t(o[1])) + '</option>'; }).join("") +
      '</select>';
    } else {
      var typ = f.type === "number" ? "number" : "text";
      inner = '<input type="' + typ + '" class="suite-input" data-f="' + f.k + '"' + (f.max ? ' maxlength="' + f.max + '"' : "") + ' placeholder="' + ph + '" />';
    }
    return '<label class="suite-set-field"><span>' + lbl + '</span>' + inner + '</label>';
  }

  function openForm(ty) {
    if (!ty) return;
    var dlg = document.createElement("dialog");
    dlg.className = "suite-dialog suite-contrib-dialog";
    dlg.innerHTML =
      '<div class="suite-dialog-body">' +
        '<h2 class="suite-dialog-title">' + ty.icon + ' ' + esc(t(ty.labelKey)) + '</h2>' +
        '<div class="suite-contrib-fields">' + ty.fields.map(fieldHtml).join("") + '</div>' +
        '<p class="suite-contrib-msg" hidden></p>' +
        '<div class="suite-dialog-actions">' +
          '<button type="button" data-r="cancel" class="suite-btn suite-btn-ghost">' + esc(t("commonCancel")) + '</button>' +
          '<button type="button" data-r="send" class="suite-btn suite-btn-primary">' + esc(t("contribSend")) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    function close() { try { if (dlg.open) dlg.close(); } catch (e) {} dlg.remove(); }
    function msg(text, ok) { var el = dlg.querySelector(".suite-contrib-msg"); if (el) { el.textContent = text; el.hidden = !text; el.className = "suite-contrib-msg" + (ok ? " is-ok" : " is-err"); } }
    dlg.querySelector('[data-r="cancel"]').onclick = close;
    dlg.querySelector('[data-r="send"]').onclick = function () {
      var v = {};
      ty.fields.forEach(function (f) { var el = dlg.querySelector('[data-f="' + f.k + '"]'); v[f.k] = el ? String(el.value || "").trim() : ""; });
      var missing = ty.fields.filter(function (f) { return f.required && !v[f.k]; });
      if (missing.length) { msg(t("contribRequired"), false); return; }
      if (!available()) { msg(t("contribOffline"), false); return; }
      var btn = dlg.querySelector('[data-r="send"]'); btn.disabled = true;
      msg(t("commonLoading"), true);
      Promise.resolve(sb().rpc(ty.rpc, ty.args(v))).then(function (res) {
        if (res && res.error) { msg((res.error.message || t("contribError")), false); btn.disabled = false; return; }
        // success → confirmation, then close
        dlg.querySelector(".suite-contrib-fields").innerHTML = '<p class="suite-contrib-thanks">🎉 ' + esc(t("contribThanks")) + '</p>';
        msg("", true);
        btn.textContent = t("commonClose"); btn.disabled = false; btn.onclick = close;
        var cancel = dlg.querySelector('[data-r="cancel"]'); if (cancel) cancel.hidden = true;
      }).catch(function () { msg(t("contribError"), false); btn.disabled = false; });
    };
    dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
    if (typeof dlg.showModal === "function") { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
  }

  /* `open(typeKey)` : ouvrir directement le formulaire d'un type, depuis une
     autre page. Le formulaire est un <dialog> autonome posé sur document.body,
     donc la page appelante reste en place — c'est ce qui permet de proposer un
     échauffement ou un exercice EN PLEINE préparation d'un coaching, sans
     perdre le déroulé en cours. */
  window.ActoContribute = {
    mount: mount,
    open: function (typeKey) { var ty = typeByKey(typeKey); if (ty) openForm(ty); return !!ty; },
    available: available
  };
})();
