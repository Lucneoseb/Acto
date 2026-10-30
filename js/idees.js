/**
 * idees.js — générateur d'idées (page idees.html).
 *
 * Une catégorie = un bouton ; un clic = un tirage au hasard dans les contenus
 * de cette catégorie. Recliquer le même bouton retire : c'est l'usage normal,
 * pas un cas limite — on évite donc de ressortir deux fois de suite le même
 * contenu tant que la catégorie en compte au moins deux.
 *
 * DONNÉES. Deux tables Supabase lues directement en anonyme (voir
 * migrate-2026-10-idees.sql) : idea_categories et idea_items. Pas de RPC —
 * il n'y a rien de confidentiel ici et la page doit s'ouvrir sans compte.
 *
 * HORS LIGNE. Le dernier chargement réussi est gardé dans localStorage. Une
 * salle de répétition sans wifi reste donc jouable, avec un bandeau qui dit
 * d'où vient la liste. Sans cache et sans réseau, on affiche une erreur et un
 * bouton « Réessayer » plutôt qu'une page vide.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return window.actoUtils ? window.actoUtils.escapeHtml(s)
                            : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
                                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
                              });
  };

  var SUPPORTED = ["fr", "en", "de", "es", "pt", "nl", "it"];
  var CACHE_PREFIX = "acto:idees:v1:";

  /* ─── i18n — mêmes chaînes que les autres pages classiques (data/ui.json) ── */
  function localeStockee() {
    try { return (localStorage.getItem("impro-studio:locale:v1") || "").trim().toLowerCase(); }
    catch (e) { return ""; }          // Safari « bloquer tous les cookies »
  }
  function currentLocale() {
    var loc = localeStockee();
    if (SUPPORTED.indexOf(loc) >= 0) return loc;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "fr";
    loc = String(nav).toLowerCase().split(/[-_]/)[0];
    return SUPPORTED.indexOf(loc) >= 0 ? loc : "fr";
  }
  function ui() {
    var all = (window.IMPRO_BUNDLE && window.IMPRO_BUNDLE.ui) || {};
    return all[currentLocale()] || all.fr || {};
  }
  function t(cle, repli) {
    var v = ui()[cle];
    return (typeof v === "string" && v.length) ? v : (repli || "");
  }

  /* ─── client Supabase (créé à la demande) ─────────────────────────────── */
  var sb = null;
  function getSb() {
    if (sb) return sb;
    try {
      var cfg = window.actoConfig && window.actoConfig.supabase;
      if (!cfg || !window.supabase) return null;
      sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      return sb;
    } catch (e) { return null; }
  }

  /* ─── état ─────────────────────────────────────────────────────────────── */
  var CATS = [];            // [{ id, slug, label, emoji, items: [texte, …] }]
  var langueChargee = "";   // langue des données actuellement en mémoire
  var actif = "";           // slug de la catégorie sélectionnée
  var dernier = {};         // slug -> dernier contenu tiré (pour ne pas répéter)
  var horsLigne = false;
  // Le français est chargé en synchrone, la langue de l'utilisateur arrive
  // après : on retient quel écran est affiché pour le retraduire à ce
  // moment-là, sinon un anglophone garde un message d'erreur en français.
  var ecran = "loading";    // "loading" | "error" | "liste"
  var derniereErreur = null;

  /* ─── cache local ──────────────────────────────────────────────────────── */
  function lireCache(loc) {
    try {
      var brut = localStorage.getItem(CACHE_PREFIX + loc);
      if (!brut) return null;
      var o = JSON.parse(brut);
      return (o && o.cats && o.cats.length) ? o.cats : null;
    } catch (e) { return null; }
  }
  function ecrireCache(loc, cats) {
    try { localStorage.setItem(CACHE_PREFIX + loc, JSON.stringify({ ts: Date.now(), cats: cats })); }
    catch (e) { /* stockage plein ou privé : on vit sans */ }
  }

  /* ─── chargement ───────────────────────────────────────────────────────── */
  function lireLangue(client, loc) {
    return client.from("idea_categories")
      .select("id,slug,label,emoji,position")
      .eq("locale", loc).eq("is_active", true)
      .order("position", { ascending: true }).order("label", { ascending: true });
  }

  /* Supabase plafonne chaque réponse (max_rows, 1000 par défaut) et un
     .limit() plus grand n'y change rien : au-delà, la liste serait tronquée
     en silence — et sur des lignes non triées, ce sont des contenus pris au
     hasard qui disparaîtraient. On lit donc par pages, sur un ordre stable. */
  var PAGE = 1000;
  function toutesLesLignes(fabrique) {
    var lignes = [];
    function suite(depuis) {
      return fabrique().range(depuis, depuis + PAGE - 1).then(function (r) {
        if (r.error) throw r.error;
        var d = r.data || [];
        lignes = lignes.concat(d);
        return d.length < PAGE ? lignes : suite(depuis + PAGE);
      });
    }
    return suite(0);
  }

  // Deux chargements peuvent se croiser (langue changée dans un autre onglet
  // pendant le premier) : seul le plus récent a le droit d'afficher.
  var jeton = 0;

  function charger() {
    var loc = currentLocale();
    var client = getSb();
    var moi = ++jeton;
    etat("loading");
    if (!client) { secours(loc, null); return Promise.resolve(); }

    return lireLangue(client, loc)
      .then(function (r) {
        if (r.error) throw r.error;
        // Pas encore de catégories dans cette langue : on sert le français,
        // qui est la langue de référence du catalogue.
        if ((!r.data || !r.data.length) && loc !== "fr") return lireLangue(client, "fr");
        return r;
      })
      .then(function (r) {
        if (r.error) throw r.error;
        var cats = r.data || [];
        if (!cats.length) return { cats: [], items: [] };
        var ids = cats.map(function (c) { return c.id; });
        return toutesLesLignes(function () {
          return client.from("idea_items")
            .select("id,category_id,content")
            .in("category_id", ids).eq("is_active", true)
            .order("id", { ascending: true });
        }).then(function (items) { return { cats: cats, items: items }; });
      })
      .then(function (res) {
        if (moi !== jeton) return;               // un chargement plus récent a pris la main
        var parCat = {};
        res.items.forEach(function (it) {
          (parCat[it.category_id] = parCat[it.category_id] || []).push(it.content);
        });
        // Une catégorie sans contenu est un bouton qui ne donne rien :
        // on ne l'affiche pas tant qu'elle est vide.
        CATS = res.cats.map(function (c) {
          return { id: c.id, slug: c.slug, label: c.label, emoji: c.emoji || "", items: parCat[c.id] || [] };
        }).filter(function (c) { return c.items.length > 0; });
        langueChargee = loc;
        horsLigne = false;
        if (CATS.length) ecrireCache(loc, CATS);
        rendre();
      })
      .catch(function (e) {
        if (moi !== jeton) return;
        console.warn("[idees] chargement", e && e.message);
        secours(loc, e);
      });
  }

  /** Réseau indisponible : on ressort la dernière liste connue, sinon erreur. */
  function secours(loc, err) {
    var cache = lireCache(loc) || (loc !== "fr" ? lireCache("fr") : null);
    if (cache) { CATS = cache; langueChargee = loc; horsLigne = true; rendre(); return; }
    etat("error", err);
  }

  /* ─── rendu ────────────────────────────────────────────────────────────── */
  function etat(quoi, err) {
    var root = $("ideaRoot"); if (!root) return;
    ecran = quoi;
    derniereErreur = (quoi === "error") ? (err || null) : null;
    if (quoi === "loading") {
      root.innerHTML = '<div class="idea-state">' + esc(t("ideasLoading", "Chargement…")) + '</div>';
      return;
    }
    var detail = err && err.message ? '<br><span style="font-size:0.82rem;opacity:0.7">' + esc(err.message) + '</span>' : "";
    root.innerHTML = '<div class="idea-state">' + esc(t("ideasError", "Impossible de charger les idées.")) + detail +
      '<br><button type="button" class="idea-btn idea-btn-primary" id="ideaRetry">' + esc(t("ideasRetry", "Réessayer")) + '</button></div>';
    var b = $("ideaRetry"); if (b) b.addEventListener("click", charger);
  }

  function rendre() {
    var root = $("ideaRoot"); if (!root) return;
    ecran = "liste";
    if (!CATS.length) {
      root.innerHTML = '<div class="idea-state">' + esc(t("ideasEmpty", "Aucune idée pour l’instant.")) + '</div>';
      return;
    }
    root.innerHTML =
      '<section class="card idea-card" id="ideaCard" aria-labelledby="ideaCardLabel">' +
        '<div class="card-head">' +
          '<span class="card-icon" id="ideaCardIcon" aria-hidden="true"></span>' +
          '<span class="card-label" id="ideaCardLabel"></span>' +
        '</div>' +
        '<p class="idea-text is-placeholder" id="ideaText" aria-live="polite">' +
          esc(t("ideasPlaceholder", "Appuie sur une catégorie")) +
        '</p>' +
        '<div class="idea-actions" id="ideaActions" hidden>' +
          '<button type="button" class="idea-btn idea-btn-primary" id="ideaAgain">🎲 <span>' + esc(t("ideasAgain", "Encore")) + '</span></button>' +
          '<button type="button" class="idea-btn" id="ideaCopy"><span aria-hidden="true">⧉</span> <span id="ideaCopyLabel">' + esc(t("ideasCopy", "Copier")) + '</span></button>' +
        '</div>' +
      '</section>' +
      '<p class="idea-hint" id="ideaHint">' + esc(t("ideasHint", "Choisis une catégorie — appuie à nouveau pour une autre idée.")) + '</p>' +
      '<div class="idea-cats" id="ideaCats" role="group" aria-label="' + esc(t("ideasPageTitle", "Générateur d’idées")) + '">' +
        CATS.map(function (c) {
          return '<button type="button" class="idea-cat" data-slug="' + esc(c.slug) + '" aria-pressed="false">' +
            (c.emoji ? '<span class="idea-cat-emoji" aria-hidden="true">' + esc(c.emoji) + '</span>' : "") +
            '<span>' + esc(c.label) + '</span>' +
          '</button>';
        }).join("") +
      '</div>' +
      (horsLigne ? '<p class="idea-note">' + esc(t("ideasOffline", "Hors ligne : liste de la dernière visite.")) + '</p>' : "");

    $("ideaCats").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-slug]");
      if (b) choisir(b.dataset.slug);
    });
    $("ideaAgain").addEventListener("click", function () { if (actif) choisir(actif); });
    $("ideaCopy").addEventListener("click", copier);

    // Après un re-rendu (changement de langue), on remet la catégorie en
    // cours ; au premier rendu, le lien direct /idees.html?cat=metier.
    var voulue = actif || (new URLSearchParams(window.location.search).get("cat") || "").toLowerCase();
    if (voulue && CATS.some(function (c) { return c.slug === voulue; })) choisir(voulue);
  }

  function categorie(slug) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].slug === slug) return CATS[i];
    return null;
  }

  /** Tire un contenu au hasard, différent du précédent quand c'est possible. */
  function tirer(cat) {
    var liste = cat.items;
    if (!liste.length) return "";
    if (liste.length === 1) return liste[0];
    var v, garde = 0;
    do { v = liste[Math.floor(Math.random() * liste.length)]; }
    while (v === dernier[cat.slug] && ++garde < 12);
    dernier[cat.slug] = v;
    return v;
  }

  function choisir(slug) {
    var cat = categorie(slug); if (!cat) return;
    actif = slug;
    Array.prototype.forEach.call(document.querySelectorAll(".idea-cat"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.slug === slug));
    });
    var icone = $("ideaCardIcon"), label = $("ideaCardLabel"), texte = $("ideaText"), carte = $("ideaCard");
    if (icone) icone.textContent = cat.emoji || "🎲";
    if (label) label.textContent = cat.label;
    var v = tirer(cat);
    if (texte) {
      texte.textContent = v || t("ideasEmpty", "Aucune idée pour l’instant.");
      texte.classList.toggle("is-placeholder", !v);
    }
    var actions = $("ideaActions"); if (actions) actions.hidden = !v;
    // On relance l'animation en retirant puis remettant la classe.
    if (carte) { carte.classList.remove("is-drawing"); void carte.offsetWidth; carte.classList.add("is-drawing"); }
    majEtiquetteCopie(t("ideasCopy", "Copier"));
  }

  function majEtiquetteCopie(texte) {
    var l = $("ideaCopyLabel"); if (l) l.textContent = texte;
  }
  function copier() {
    var texte = $("ideaText");
    var v = texte ? texte.textContent : "";
    if (!v) return;
    var fini = function () {
      majEtiquetteCopie(t("ideasCopied", "Copié"));
      setTimeout(function () { majEtiquetteCopie(t("ideasCopy", "Copier")); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(fini, replieCopie.bind(null, v, fini));
    } else replieCopie(v, fini);
  }
  // Presse-papiers refusé (http, permission) : on passe par une sélection.
  function replieCopie(v, fini) {
    try {
      var ta = document.createElement("textarea");
      ta.value = v; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      ta.remove();
      fini();
    } catch (e) { /* tant pis : le texte reste sélectionnable à l'écran */ }
  }

  /* ─── traduction des éléments statiques ───────────────────────────────── */
  function traduire() {
    var titre = $("ideaTitle"), blurb = $("ideaBlurb");
    var tTitre = t("ideasPageTitle", ""), tBlurb = t("ideasBlurb", "");
    if (titre && tTitre) { titre.textContent = tTitre; document.title = "Acto — " + tTitre; }
    if (blurb && tBlurb) blurb.textContent = tBlurb;
    document.documentElement.lang = currentLocale();
  }

  /* ─── démarrage ────────────────────────────────────────────────────────── */
  function demarrer() {
    traduire();
    charger();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  // La langue arrive après coup (locale-loader.js) : on retraduit, et on
  // recharge le catalogue si la langue affichée n'est plus celle des données.
  window.addEventListener("acto:locale-ready", function () {
    traduire();
    if (ecran === "loading") return;              // charger() rendra la suite
    if (ecran === "error") { etat("error", derniereErreur); return; }
    if (langueChargee !== currentLocale()) charger(); else rendre();
  });
  // Langue changée dans un autre onglet.
  window.addEventListener("storage", function (e) {
    if (e && e.key === "impro-studio:locale:v1") { traduire(); charger(); }
  });
})();
