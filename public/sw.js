// Service worker mínimo: network-first com fallback pro cache.
// Nasceu pra agenda/trajetos sobreviverem ao sinal ruim do metrô; hoje serve
// pro acervo continuar legível offline usando a última resposta vista.
// Nada de cache-first — deploy novo sempre vence quando há rede.
var CACHE = "lepv-sp-v9"; // v9: eventos unificados (aviso → inscrição → presença no dia)

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

// O que NUNCA entra no cache:
// - /api/*: respostas privadas por sessão. Guardadas, sobreviveriam ao logout e
//   ficariam legíveis pelo próximo dono do dispositivo — e o próximo membro a
//   logar no mesmo navegador veria dados do anterior.
// - "/": o corpo varia por sessão (app.html se logado, home.html se não), então
//   uma cópia cacheada mostra a página errada para o próximo visitante.
// - PDFs: arquivos de até 25 MB, tanto os da imersão quanto os das aulas.
function isPrivate(url) {
  return (
    url.pathname === "/" ||
    url.pathname.indexOf("/api/") === 0 ||
    /\/file$/.test(url.pathname)
  );
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fontes do Google etc. ficam de fora
  if (isPrivate(url)) return;

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

// Logout limpa o cache: mesmo com /api/* fora, restam HTML/JS e fotos de perfil
// que não devem sobrar para o próximo usuário do navegador.
self.addEventListener("message", function (e) {
  if (e.data === "clear-cache") {
    e.waitUntil(caches.delete(CACHE));
  }
});
