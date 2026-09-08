/* sw.js — Service worker « réseau d'abord, cache en secours ».

   Pourquoi : une salle de répétition sans wifi, un métro, un théâtre en
   sous-sol. Les coachings et matchs préparés vivent dans localStorage ; seul
   le chargement des pages exigeait le réseau. Avec ce worker, une page déjà
   visitée s'ouvre hors ligne.

   Règles, volontairement prudentes :
   - Réseau D'ABORD, toujours. En ligne, on sert exactement ce que le serveur
     envoie (les en-têtes no-cache de _headers continuent de s'appliquer) ; le
     cache n'est qu'un repli quand le réseau échoue. Aucun contenu périmé
     n'est servi à un utilisateur connecté.
   - Même origine et GET uniquement : Supabase, polices Google, YouTube ne
     passent jamais par ici.
   - Seuls les types légers sont retenus (html, css, js, json, images,
     polices) ; jamais les vidéos ni les requêtes partielles (Range).

   Pour DÉSACTIVER le worker chez tous les utilisateurs : remplacer ce fichier
   par les trois lignes ci-dessous, déployer, attendre une visite.
     self.addEventListener("install", function () { self.skipWaiting(); });
     self.addEventListener("activate", function (e) { e.waitUntil(self.registration.unregister().then(function () { return self.clients.matchAll(); }).then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); })); });
*/
var VERSION = "acto-cache-v1";
var ROUTES_STUDIO = /^\/(studio|match|spectacle|coaching|decouverte|contribuer|equipes|defis|collab)(\/|$)/;
var TYPES_OK = /^(text\/|application\/(javascript|x-javascript|json|manifest\+json)|image\/|font\/)/;

self.addEventListener("install", function () { self.skipWaiting(); });

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;     // Supabase, polices, YouTube : jamais touchés
  if (url.pathname === "/sw.js") return;
  if (req.headers.has("range")) return;                 // vidéo lue par morceaux : au navigateur
  e.respondWith(reseauDabord(req, url));
});

/* Une seule copie par chemin. VERSION ne changeant jamais d'un déploiement à
   l'autre, l'ancien cache n'était jamais supprimé : chaque bump de ?v= y
   ajoutait un exemplaire complet du site, définitivement. Mesuré en test :
   539 entrées pour un site qui compte ~140 fichiers. On efface donc les autres
   copies du même chemin après chaque mise en cache — le cache est borné par le
   nombre de fichiers, plus par le nombre de déploiements.
   Le repli de navigation hors ligne reste couvert : il retente welcome.html
   avec { ignoreSearch: true }. */
function purgerAnciennes(cache, url) {
  return cache.keys().then(function (cles) {
    return Promise.all(cles.map(function (c) {
      var u;
      try { u = new URL(c.url); } catch (e) { return null; }
      if (u.pathname !== url.pathname) return null;
      if (u.search === url.search) return null;        // la copie qu'on vient d'écrire
      return cache.delete(c);
    }));
  }).catch(function () { /* le ménage n'est jamais critique */ });
}

function reseauDabord(req, url) {
  return caches.open(VERSION).then(function (cache) {
    return fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic" && TYPES_OK.test(res.headers.get("content-type") || "")) {
        cache.put(req, res.clone())
             .then(function () { return purgerAnciennes(cache, url); })
             .catch(function () { /* quota plein : on vit sans */ });
      }
      return res;
    }).catch(function (err) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        // Navigation hors ligne : une adresse du Studio (/coaching/preparer…)
        // est servie par welcome.html, comme le fait _redirects en ligne.
        var chain = Promise.resolve(null);
        if (req.mode === "navigate" && ROUTES_STUDIO.test(url.pathname)) {
          chain = chain.then(function () { return cache.match("/studio"); })
                       .then(function (h) { return h || cache.match("/welcome.html"); })
                       .then(function (h) { return h || cache.match("/welcome.html", { ignoreSearch: true }); });
        }
        // Dernier repli : même chemin, autre chaîne de requête (?v=, ?cb=).
        return chain.then(function (h) { return h || cache.match(req, { ignoreSearch: true }); })
                    .then(function (h) { if (h) return h; throw err; });
      });
    });
  });
}
