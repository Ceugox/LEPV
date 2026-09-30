/* ============================================================
   LEPVVoo — abertura em mapa 3D sobre o Rio de Janeiro.

   Carregado de forma síncrona no <head> para decidir antes do primeiro
   paint (a página não pisca por baixo da abertura):
     <script src="/voo.js" data-voo="visao"></script>   landing
     <script src="/voo.js" data-voo="pouso"></script>   área de membros

   visao: a cidade vista do alto, uma vez por sessão (?voo=1 força).
   pouso: a câmera desce até a Praia Vermelha; só roda quando login.html
          marca "lepv-pouso" no sessionStorage logo antes de redirecionar.

   MapLibre é baixado só quando a abertura vai rodar. Satélite da Esri com
   relevo (Terrain Tiles/AWS), para a Urca e o Pão de Açúcar saírem do chão.
   Sem WebGL, com movimento reduzido ou em qualquer falha (script, tiles
   lentos), a abertura não existe ou encerra e entrega a página.
   ============================================================ */
(function () {
  var ML_JS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  var ML_JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
  var ML_CSS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  var ML_CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';

  /* longe: Sentinel-2 sem nuvem, um mosaico só (o oceano da Esri é uma colcha de retalhos);
     perto: Esri em alta resolução */
  var S2 = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
  var SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

  var RIO = [-43.30, -22.915];
  var PRAIA = [-43.1650, -22.9562];
  /* fim da visão geral e começo do pouso: a mesma câmera nos dois lados do login */
  var ALTO = { center: [-43.19, -22.935], zoom: 11.3, pitch: 58, bearing: 24 };

  var ROTEIROS = {
    visao: {
      inicio: { center: RIO, zoom: 9.3, pitch: 0, bearing: -20 },
      cache: [
        { url: S2, c: ALTO.center, z: 12, dx: [-2, 2], dy: [-2, 1] },
        { url: DEM, c: ALTO.center, z: 12, dx: [-2, 2], dy: [-2, 1] }
      ],
      kicker: 'Rio de Janeiro',
      titulo: 'Rio de <i>Janeiro</i>',
      dur: 9000,
      passos: function (map, cena) {
        cena.depois(700, function () {
          map.easeTo({ center: ALTO.center, zoom: ALTO.zoom, pitch: ALTO.pitch, bearing: ALTO.bearing,
            duration: 7000, essential: true });
        });
        cena.depois(3800, function () { cena.chegou(); });
        cena.depois(5600, function () { cena.fixarKicker('Membros pousam na Praia Vermelha'); });
      }
    },
    pouso: {
      inicio: ALTO,
      /* o destino entra no cache HTTP enquanto a câmera ainda está no alto:
         o pouso chega com o satélite em alta, sem borrão */
      cache: [
        { url: SAT, c: PRAIA, z: 17, dx: [-2, 2], dy: [-3, 1] },
        { url: SAT, c: PRAIA, z: 16, dx: [-2, 2], dy: [-3, 1] },
        { url: SAT, c: PRAIA, z: 15, dx: [-2, 2], dy: [-3, 1] },
        { url: SAT, c: PRAIA, z: 14, dx: [-1, 1], dy: [-2, 1] },
        { url: DEM, c: PRAIA, z: 15, dx: [-2, 2], dy: [-3, 1] },
        { url: DEM, c: PRAIA, z: 14, dx: [-1, 1], dy: [-2, 1] },
        { url: DEM, c: PRAIA, z: 13, dx: [-1, 1], dy: [-1, 1] }
      ],
      kicker: 'Rio de Janeiro',
      titulo: 'Praia <i>Vermelha</i>',
      dur: 10500,
      passos: function (map, cena) {
        cena.depois(700, function () {
          map.flyTo({ center: PRAIA, zoom: 14.8, pitch: 58, bearing: -22,
            duration: 6000, curve: 1.2, essential: true });
        });
        cena.depois(6400, function () {
          cena.chegou();
          cena.fixarKicker('Pouso · Urca, Rio de Janeiro');
          map.easeTo({ bearing: 6, pitch: 62, zoom: 15.05, duration: 3600,
            easing: function (t) { return t; }, essential: true });
        });
      }
    }
  };

  var html = document.documentElement;
  var script = document.currentScript;
  var modoPagina = script && script.getAttribute('data-voo');

  function movimentoReduzido() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function temWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  function lerSessao(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function gravarSessao(k, v) {
    try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {}
  }

  var disponivel = !movimentoReduzido() && temWebGL();
  if (disponivel) html.classList.add('voo-ok');

  var autoplay = false;
  if (disponivel && modoPagina === 'visao') {
    autoplay = /[?&]voo=1\b/.test(location.search) || !lerSessao('lepv-voo');
  } else if (disponivel && modoPagina === 'pouso') {
    autoplay = !!lerSessao('lepv-pouso');
  }
  if (modoPagina === 'pouso') gravarSessao('lepv-pouso', null);
  if (autoplay) html.classList.add('voo-on', 'voo-lock');

  function tile(url, z, x, y) {
    return url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }
  function aquecerCache(lista) {
    if (!window.fetch) return;
    (lista || []).forEach(function (g) {
      var n = Math.pow(2, g.z), lat = g.c[1] * Math.PI / 180;
      var x0 = Math.floor((g.c[0] + 180) / 360 * n);
      var y0 = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n);
      for (var dy = g.dy[0]; dy <= g.dy[1]; dy++) {
        for (var dx = g.dx[0]; dx <= g.dx[1]; dx++) {
          fetch(tile(g.url, g.z, x0 + dx, y0 + dy), { mode: 'cors', credentials: 'omit' })
            .catch(function () {});
        }
      }
    });
  }

  /* z10–11 do Terrain Tiles tem um pico falso de +4 km / −3,6 km em São Conrado.
     Nesses níveis, do Rio a Maricá, pixel que foge mais de 250 m da mediana
     5×5 vira a mediana; z12+ e o resto do mundo passam intactos. */
  var RIO_BBOX = [-43.80, -23.10, -42.70, -22.74], DESVIO = 250;
  function lon2x(lon, n) { return (lon + 180) / 360 * n; }
  function lat2y(lat, n) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  }
  function demCorrigido(z, x, y, buf) {
    var n = Math.pow(2, z) * 256;
    var x0 = lon2x(RIO_BBOX[0], n) - x * 256, x1 = lon2x(RIO_BBOX[2], n) - x * 256;
    var y0 = lat2y(RIO_BBOX[3], n) - y * 256, y1 = lat2y(RIO_BBOX[1], n) - y * 256;
    if (z >= 12 || x1 < 0 || x0 > 256 || y1 < 0 || y0 > 256 || !window.createImageBitmap) {
      return Promise.resolve(buf);
    }
    return createImageBitmap(new Blob([buf]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      .then(function (img) {
        var cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        var w = cv.width, h = cv.height;
        var d = ctx.getImageData(0, 0, w, h), px = d.data;
        var alt = new Float32Array(w * h);
        for (var k = 0; k < w * h; k++) alt[k] = px[k * 4] * 256 + px[k * 4 + 1] + px[k * 4 + 2] / 256;
        var ia = Math.max(0, Math.floor(x0)), ib = Math.min(w, Math.ceil(x1));
        var ja = Math.max(0, Math.floor(y0)), jb = Math.min(h, Math.ceil(y1));
        var viz = [];
        for (var j = ja; j < jb; j++) {
          for (var i = ia; i < ib; i++) {
            viz.length = 0;
            for (var b = Math.max(0, j - 2); b <= Math.min(h - 1, j + 2); b++) {
              for (var a = Math.max(0, i - 2); a <= Math.min(w - 1, i + 2); a++) viz.push(alt[b * w + a]);
            }
            viz.sort(function (p, q) { return p - q; });
            var med = viz[viz.length >> 1], o = (j * w + i) * 4;
            if (Math.abs(alt[j * w + i] - med) > DESVIO) {
              var v = Math.round(med * 256);
              px[o] = v >> 16; px[o + 1] = (v >> 8) & 255; px[o + 2] = v & 255;
            }
          }
        }
        ctx.putImageData(d, 0, 0);
        return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
      })
      .then(function (b) { return b.arrayBuffer(); });
  }
  var protocoloOk = false;
  function registrarDem() {
    if (protocoloOk) return;
    protocoloOk = true;
    maplibregl.addProtocol('lepvdem', function (req, abort) {
      var m = /(\d+)\/(\d+)\/(\d+)$/.exec(req.url);
      var z = +m[1], x = +m[2], y = +m[3];
      return fetch(tile(DEM, z, x, y), { mode: 'cors', credentials: 'omit', signal: abort.signal })
        .then(function (r) { if (!r.ok) throw new Error('dem ' + r.status); return r.arrayBuffer(); })
        .then(function (buf) { return demCorrigido(z, x, y, buf); })
        .then(function (data) { return { data: data }; });
    });
  }

  var libPromise = null;
  function carregarLib() {
    if (window.maplibregl) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise(function (ok, falha) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = ML_CSS;
      css.integrity = ML_CSS_SRI; css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = ML_JS; js.integrity = ML_JS_SRI; js.crossOrigin = 'anonymous';
      js.onload = function () { window.maplibregl ? ok() : falha(); };
      js.onerror = falha;
      document.head.appendChild(js);
    });
    libPromise.catch(function () { libPromise = null; });
    return libPromise;
  }

  function dms(v, pos, neg) {
    var a = Math.abs(v), g = Math.floor(a), m = Math.floor((a - g) * 60);
    var s = Math.floor(((a - g) * 60 - m) * 60);
    return g + '°' + (m < 10 ? '0' : '') + m + '′' + (s < 10 ? '0' : '') + s + '″' + (v < 0 ? neg : pos);
  }
  function lugar(z) {
    return z < 11.8 ? 'Rio de Janeiro' : z < 13.4 ? 'Baía de Guanabara · Urca' : 'Urca · Pão de Açúcar';
  }

  var el = null;
  function montar() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'voo';
    el.hidden = true;
    el.setAttribute('role', 'region');
    el.innerHTML =
      '<div class="voo-map" aria-hidden="true"></div>' +
      '<div class="voo-top">' +
        '<div class="voo-marca"><img src="/assets/logo-mark.png" alt=""><span>LEPV</span></div>' +
        '<button class="voo-skip" type="button">Pular abertura <span aria-hidden="true">→</span></button>' +
      '</div>' +
      '<div class="voo-hud">' +
        '<p class="voo-k"></p><h2 class="voo-t"></h2><p class="voo-c" aria-hidden="true"></p>' +
      '</div>' +
      '<div class="voo-bar" aria-hidden="true"><i></i></div>';
    document.body.insertBefore(el, document.body.firstChild);
    el.querySelector('.voo-skip').addEventListener('click', encerrar);
    return el;
  }

  var map = null, timers = [], ativo = false, modoAtual = null, kickerFixo = false;

  function encerrar() {
    if (!ativo) return;
    ativo = false;
    timers.forEach(clearTimeout); timers = [];
    if (modoAtual === 'visao') gravarSessao('lepv-voo', '1');
    document.removeEventListener('keydown', teclas, true);
    var focoDentro = el.contains(document.activeElement);
    el.classList.add('out');
    html.classList.remove('voo-on', 'voo-lock');
    setTimeout(function () {
      if (ativo) return;
      el.hidden = true;
      el.classList.remove('out', 'live', 'chegou');
      if (map) { map.remove(); map = null; }
    }, 950);
    if (focoDentro) {
      var alvo = document.getElementById('main-content');
      if (alvo) alvo.focus({ preventScroll: true });
    }
  }

  function teclas(e) {
    if (e.key === 'Escape') { e.preventDefault(); encerrar(); }
    else if (e.key === 'Tab') { e.preventDefault(); el.querySelector('.voo-skip').focus(); }
  }

  function voar(r) {
    var k = el.querySelector('.voo-k'), c = el.querySelector('.voo-c');
    var i = r.inicio;
    c.textContent = dms(i.center[1], 'N', 'S') + ' · ' + dms(i.center[0], 'L', 'O');
    if (map) { map.remove(); map = null; }
    registrarDem();
    map = new maplibregl.Map({
      container: el.querySelector('.voo-map'),
      center: i.center, zoom: i.zoom, pitch: i.pitch, bearing: i.bearing,
      interactive: false,
      fadeDuration: 0,
      antialias: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      maxPitch: 80,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          s2: {
            type: 'raster', tileSize: 256, maxzoom: 14,
            tiles: [S2],
            attribution: 'Sentinel-2 cloudless 2020 © EOX IT Services (dados Copernicus modificados)'
          },
          sat: {
            type: 'raster', tileSize: 256, maxzoom: 19,
            tiles: [SAT],
            attribution: 'Imagem © Esri, Maxar, Earthstar Geographics'
          },
          dem: {
            type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 15,
            tiles: ['lepvdem://{z}/{x}/{y}'],
            attribution: 'Relevo: Terrain Tiles (Mapzen/AWS)'
          }
        },
        layers: [
          { id: 's2', type: 'raster', source: 's2',
            paint: { 'raster-saturation': -0.05, 'raster-contrast': 0.1, 'raster-fade-duration': 150 } },
          { id: 'sat', type: 'raster', source: 'sat', minzoom: 12,
            paint: { 'raster-saturation': -0.05, 'raster-contrast': 0.1, 'raster-fade-duration': 150,
              'raster-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.2, 1] } }
        ],
        terrain: { source: 'dem', exaggeration: 1.1 },
        sky: { 'sky-color': '#0d0f12', 'horizon-color': '#6f5a55', 'fog-color': '#1a1c20',
          'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85 }
      }
    });
    map.on('move', function () {
      var p = map.getCenter();
      c.textContent = dms(p.lat, 'N', 'S') + ' · ' + dms(p.lng, 'L', 'O');
      if (!kickerFixo) k.textContent = lugar(map.getZoom());
    });
    var cena = {
      depois: function (ms, fn) { timers.push(setTimeout(function () { if (ativo) fn(); }, ms)); },
      chegou: function () { el.classList.add('chegou'); },
      fixarKicker: function (t) { kickerFixo = true; k.textContent = t; }
    };
    var semCarga = setTimeout(encerrar, 8000);
    timers.push(semCarga);
    map.once('load', function () {
      clearTimeout(semCarga);
      if (!ativo) return;
      var partiu = false;
      var partir = function () {
        if (partiu || !ativo) return;
        partiu = true;
        el.classList.add('live');
        r.passos(map, cena);
        cena.depois(r.dur, encerrar);
      };
      map.once('idle', partir);
      cena.depois(2500, partir);
    });
  }

  function start(modo) {
    var r = ROTEIROS[modo];
    if (!r || !disponivel || ativo) return false;
    montar();
    ativo = true; modoAtual = modo; kickerFixo = false;
    el.setAttribute('aria-label', modo === 'pouso'
      ? 'Abertura: pouso na Praia Vermelha'
      : 'Abertura: o Rio de Janeiro visto do alto');
    el.querySelector('.voo-k').textContent = r.kicker;
    el.querySelector('.voo-t').innerHTML = r.titulo;
    el.style.setProperty('--dur', r.dur + 'ms');
    el.classList.remove('out', 'live', 'chegou');
    el.hidden = false;
    html.classList.add('voo-on', 'voo-lock');
    document.addEventListener('keydown', teclas, true);
    el.querySelector('.voo-skip').focus({ preventScroll: true });
    aquecerCache(r.cache);
    carregarLib().then(function () {
      if (!ativo) return;
      try { voar(r); } catch (e) { encerrar(); }
    }, encerrar);
    return true;
  }

  window.LEPVVoo = { start: start, disponivel: disponivel };

  if (autoplay) {
    var go = function () { if (!start(modoPagina)) html.classList.remove('voo-on', 'voo-lock'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }
})();
