// Service worker da plataforma do hackathon (escopo /hack/).
//
// Cache: só a casca (HTML, CSS, JS, imagens) para o app abrir sem sinal, em
// network-first — deploy novo sempre vence quando há rede. /hack/api/* nunca
// entra no cache: é privado por sessão e sobreviveria à troca de pessoa no
// aparelho. Os dados offline do credenciamento ficam no IndexedDB da página,
// não aqui.
var CACHE = 'lepv-hack-v3';
var SHELL = [
  '/hack/portal', '/hack/acesso', '/hack/credenciamento',
  '/hack/js/offline.js', '/hack/js/credenciamento.js', '/hack/vendor/jsQR.js',
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

// ---------- notificações ----------
// O servidor manda { title, body, url, tag }. Sem payload legível, ainda
// assim mostra algo: o navegador exige notificação visível a cada push.
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || '1º Hackathon LEPV', {
    body: data.body || 'Novo aviso no portal.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'hack-aviso',
    data: { url: data.url || '/hack/portal#avisos' },
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/hack/portal#avisos';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/hack/') !== -1 && 'focus' in list[i]) {
          list[i].navigate(url);
          return list[i].focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
