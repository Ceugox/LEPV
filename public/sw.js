// Service worker mínimo: network-first com fallback pro cache.
// Objetivo único: a agenda/trajetos continuarem legíveis com sinal ruim
// (metrô, Marginal) usando a última resposta vista. Nada de cache-first —
// deploy novo sempre vence quando há rede.
var CACHE = "lepv-sp-v4";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fontes do Google etc. ficam de fora
  if (/^\/api\/materials\/[^/]+\/file$/.test(url.pathname)) return; // PDFs grandes não entram no cache

  e.respondWith(
    fetch(req)
      .then(function (res) {
        // Só guarda resposta boa — 401/redirect de login não pode "grudar" no cache
        if (res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || Response.error();
        });
      })
  );
});
