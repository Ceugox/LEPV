// Service worker da plataforma do hackathon (escopo /hack/).
//
// Cache: só a casca (HTML, CSS, JS, imagens) para o app abrir sem sinal, em
// network-first — deploy novo sempre vence quando há rede. /hack/api/* nunca
// entra no cache: é privado por sessão e sobreviveria à troca de pessoa no
// aparelho. Os dados offline do credenciamento ficam no IndexedDB da página,
// não aqui.
var CACHE = 'lepv-hack-v1';
var SHELL = [
  '/hack/portal', '/hack/acesso', '/hack/credenciamento',
  '/hack/hack.css', '/hack/app.css',
  '/hack/js/hack-app.js', '/hack/js/portal.js',
  '/hack/img/logo-mark-white.png', '/hack/img/pao-acucar-noite.jpg',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('lepv-hack-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isPrivate(url) {
  return url.pathname.indexOf('/hack/api/') === 0 || url.pathname === '/hack/sw.js';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/hack/') !== 0 || isPrivate(url)) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res.ok && res.type === 'basic' && !res.redirected) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || Response.error(); });
    })
  );
});
