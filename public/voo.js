/* ============================================================
   LEPVVoo — abertura em mapa sobre o Rio de Janeiro, desenhada como uma
   carta topográfica do Serviço Geográfico: papel, curvas de nível em
   sépia, água em azul, vegetação em verde e a quadrícula UTM.

   Carregado de forma síncrona no <head> para decidir antes do primeiro
   paint (a página não pisca por baixo da abertura):
     <script src="/voo.js" data-voo="visao"></script>   landing
     <script src="/voo.js" data-voo="pouso"></script>   área de membros

   visao: a carta da cidade vista do alto, uma vez por sessão (?voo=1 força).
   pouso: a câmera desce até a Praia Vermelha; só roda quando login.html
          marca "lepv-pouso" no sessionStorage logo antes de redirecionar.

   MapLibre e maplibre-contour são baixados só quando a abertura vai rodar.
   Vetores do OpenFreeMap (OpenStreetMap); relevo e curvas de nível saem do
   Terrain Tiles (AWS), sem chave. Sem WebGL, com movimento reduzido ou em
   qualquer falha (script, tiles lentos), a abertura não existe ou encerra
   e entrega a página.
   ============================================================ */
(function () {
  var ML_JS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  var ML_JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
  var ML_CSS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  var ML_CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';
  var MC_JS = 'https://unpkg.com/maplibre-contour@0.1.1/dist/index.min.js';
  var MC_JS_SRI = 'sha384-f2gK0HoDkM64k6ZBnbv6ZuvMzDqPOwrfTaIU9iv2BN7CWHyyTQJkPC9AoRNuuV39';

  var OFM = 'https://tiles.openfreemap.org/planet';
  var GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
  var DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

  var TINTA = {
    papel: '#eedbae', sepia: '#a8512f', agua: '#b4cfc6', aguaLinha: '#3b7190',
    aguaTexto: '#2c6688', mata: '#c3d99a', urbano: '#e4b394', preto: '#1f1b16', estrada: '#c8412f',
    vinho: '#8c2f39'
  };

  var RIO = [-43.30, -22.93];
  var PRAIA = [-43.1650, -22.9562];
  /* Instituto Militar de Engenharia, Praça General Tibúrcio 80 (contorno do OSM, relação 4022872) */
  var IME = [-43.1662, -22.9559];
  /* fachada nordeste, voltada para a praça e para a praia */
  var ENTRADA = [-43.16598, -22.95576];
  var IME_AREA = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
    [[-43.16683, -22.95608], [-43.1667, -22.95623], [-43.16649, -22.95605], [-43.16666, -22.95589],
      [-43.16663, -22.95587], [-43.16638, -22.95609], [-43.16643, -22.95608], [-43.16659, -22.9562],
      [-43.16648, -22.95631], [-43.16632, -22.95618], [-43.16633, -22.95613], [-43.16601, -22.95641],
      [-43.16592, -22.95633], [-43.16598, -22.95628], [-43.16593, -22.95623], [-43.16587, -22.95628],
      [-43.1657, -22.95615], [-43.16567, -22.95618], [-43.1656, -22.95609], [-43.16636, -22.95543],
      [-43.16658, -22.95567], [-43.16652, -22.95572], [-43.16656, -22.95575], [-43.1666, -22.95571],
      [-43.16678, -22.95592], [-43.16675, -22.95595], [-43.16683, -22.95608]],
    [[-43.16651, -22.95578], [-43.16648, -22.95574], [-43.16642, -22.95579], [-43.16628, -22.95568],
      [-43.16617, -22.95578], [-43.16625, -22.95583], [-43.16631, -22.95597], [-43.16651, -22.95578]],
    [[-43.16622, -22.95605], [-43.166, -22.95592], [-43.16588, -22.95602], [-43.16603, -22.95615],
      [-43.16597, -22.9562], [-43.16601, -22.95624], [-43.16622, -22.95605]]
  ] } };
  /* fim da visão geral e começo do pouso: a mesma câmera nos dois lados do login */
  var ALTO = { center: [-43.19, -22.94], zoom: 11.6, pitch: 48, bearing: 12 };

  /* rótulos da carta em HTML, na serifa do site; aparecem entre zmin e zmax */
  var ROTULOS = [
    { t: 'Baía de Guanabara', c: [-43.155, -22.83], cls: 'agua', zmin: 9, zmax: 13 },
    { t: 'Oceano Atlântico', c: [-43.25, -23.06], cls: 'agua', zmin: 9, zmax: 12.5 },
    { t: 'Maciço da Tijuca', c: [-43.285, -22.955], cls: 'relevo', zmin: 10, zmax: 12.8 },
    { t: 'Pão de Açúcar', c: [-43.1566, -22.9486], cls: 'pico', alt: '396', zmin: 13.2, zmax: 22 },
    { t: 'Morro da Urca', c: [-43.1648, -22.9505], cls: 'pico', alt: '220', zmin: 13.6, zmax: 22 },
    { t: 'Morro da Babilônia', c: [-43.1720, -22.9585], cls: 'pico', alt: '249', zmin: 14, zmax: 22 },
    { t: 'Praia Vermelha', c: PRAIA, cls: 'destino', zmin: 10.5, zmax: 22 },
    { t: 'IME', sub: 'Instituto Militar de Engenharia', c: IME, cls: 'ime', zmin: 10.5, zmax: 16.8 },
    { t: 'Entrada do IME', sub: 'Praça General Tibúrcio, 80', c: ENTRADA, cls: 'ime', longo: true, zmin: 16.8, zmax: 22 }
  ];

  var ROTEIROS = {
    visao: {
      inicio: { center: RIO, zoom: 10.3, pitch: 0, bearing: 0 },
      cache: [{ c: ALTO.center, z: 12, dx: [-2, 2], dy: [-2, 1] }],
      kicker: 'Carta do Rio de Janeiro',
      titulo: 'Rio de <i>Janeiro</i>',
      dur: 9500,
      passos: function (map, cena) {
        cena.depois(600, function () {
          var estreita = window.innerWidth < 720;
          map.easeTo({ center: estreita ? [-43.170, -22.947] : ALTO.center, zoom: ALTO.zoom,
            pitch: ALTO.pitch, bearing: ALTO.bearing,
            duration: 7200, essential: true });
        });
        cena.depois(3600, function () { cena.chegou(); });
        cena.depois(5600, function () { cena.fixarKicker('Membros pousam na Praia Vermelha'); });
      }
    },
    pouso: {
      inicio: ALTO,
      /* o relevo do destino entra no cache HTTP enquanto a câmera ainda está no alto */
      cache: [
        { c: PRAIA, z: 15, dx: [-2, 2], dy: [-3, 1] },
        { c: PRAIA, z: 14, dx: [-1, 1], dy: [-2, 1] },
        { c: PRAIA, z: 13, dx: [-1, 1], dy: [-1, 1] }
      ],
      kicker: 'Carta do Rio de Janeiro',
      titulo: 'Praia <i>Vermelha</i>',
      dur: 15500,
      passos: function (map, cena) {
        cena.depois(700, function () {
          map.flyTo({ center: PRAIA, zoom: 15.2, pitch: 54, bearing: -18,
            duration: 6000, curve: 1.2, essential: true });
        });
        cena.depois(6400, function () {
          cena.chegou();
          cena.fixarKicker('Pouso · Urca, Rio de Janeiro');
        });
        /* desce até a praça e vira para a fachada do IME */
        var estreita = window.innerWidth < 720, perto = estreita ? 17.1 : 17.5;
        cena.depois(7200, function () {
          map.flyTo({ center: ENTRADA, zoom: perto, pitch: 68, bearing: -135,
            offset: estreita ? [70, -40] : [0, -110], duration: 4400, curve: 1, essential: true });
        });
        cena.depois(11700, function () {
          cena.fixarTitulo('Entrada do <i>IME</i>');
          cena.fixarKicker('Praça General Tibúrcio, 80 · Urca');
          map.easeTo({ bearing: -118, zoom: perto + 0.2, duration: 3600,
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
  function lon2x(lon, n) { return (lon + 180) / 360 * n; }
  function lat2y(lat, n) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  }
  function aquecerCache(lista) {
    if (!window.fetch) return;
    (lista || []).forEach(function (g) {
      var n = Math.pow(2, g.z);
      var x0 = Math.floor(lon2x(g.c[0], n)), y0 = Math.floor(lat2y(g.c[1], n));
      for (var dy = g.dy[0]; dy <= g.dy[1]; dy++) {
        for (var dx = g.dx[0]; dx <= g.dx[1]; dx++) {
          fetch(tile(DEM, g.z, x0 + dx, y0 + dy), { mode: 'cors', credentials: 'omit' })
            .catch(function () {});
        }
      }
    });
  }

  /* z10–11 do Terrain Tiles tem um pico falso de +4 km / −3,6 km em São Conrado.
     Nesses níveis, do Rio a Maricá, pixel que foge mais de 250 m da mediana
     5×5 vira a mediana; z12+ e o resto do mundo passam intactos. */
  var RIO_BBOX = [-43.80, -23.10, -42.70, -22.74], DESVIO = 250;
  function demCorrigido(z, x, y, blob) {
    var n = Math.pow(2, z) * 256;
    var x0 = lon2x(RIO_BBOX[0], n) - x * 256, x1 = lon2x(RIO_BBOX[2], n) - x * 256;
    var y0 = lat2y(RIO_BBOX[3], n) - y * 256, y1 = lat2y(RIO_BBOX[1], n) - y * 256;
    if (z >= 12 || x1 < 0 || x0 > 256 || y1 < 0 || y0 > 256 || !window.createImageBitmap) {
      return Promise.resolve(blob);
    }
    return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
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
      });
  }

  /* Uma só fonte de DEM para o relevo 3D, a sombra e as curvas de nível.
     Roda na thread principal (worker: false) para que cada tile passe por
     demCorrigido antes de virar relevo ou curva. */
  var demSource = null;
  function fonteDem() {
    if (demSource) return demSource;
    demSource = new mlcontour.DemSource({ url: DEM, encoding: 'terrarium', maxzoom: 15, worker: false });
    demSource.manager.getTile = function (url, abort) {
      var m = /(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
      return fetch(url, { mode: 'cors', credentials: 'omit', signal: abort.signal })
        .then(function (r) { if (!r.ok) throw new Error('dem ' + r.status); return r.blob(); })
        .then(function (blob) { return demCorrigido(+m[1], +m[2], +m[3], blob); })
        .then(function (blob) { return { data: blob }; });
    };
    demSource.setupMaplibre(maplibregl);
    return demSource;
  }

  /* quadrícula UTM (fuso 23S) de 2 km; as linhas de 10 km ficam no alto */
  function utm2ll(E, N) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    var x = E - 500000, M = (N - 10000000) / k0;
    var mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
      (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
    var s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
    var C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s);
    var R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), D = x / (N1 * k0);
    var lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c;
    return [-45 + lon * 180 / Math.PI, lat * 180 / Math.PI];
  }
  function quadricula() {
    var feats = [], E0 = 620000, E1 = 722000, N0 = 7442000, N1 = 7492000, passo = 2000, k, q;
    for (k = E0; k <= E1; k += passo) {
      var l = [];
      for (q = N0; q <= N1; q += passo) l.push(utm2ll(k, q));
      feats.push({ type: 'Feature', properties: { dez: k % 10000 === 0 }, geometry: { type: 'LineString', coordinates: l } });
    }
    for (q = N0; q <= N1; q += passo) {
      var m = [];
      for (k = E0; k <= E1; k += passo) m.push(utm2ll(k, q));
      feats.push({ type: 'Feature', properties: { dez: q % 10000 === 0 }, geometry: { type: 'LineString', coordinates: m } });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  /* hachura de brejo, como na carta */
  function hachura() {
    var cv = document.createElement('canvas');
    cv.width = 24; cv.height = 8;
    var ctx = cv.getContext('2d');
    ctx.strokeStyle = TINTA.aguaLinha; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(14, 4); ctx.stroke();
    return ctx.getImageData(0, 0, 24, 8);
  }

  function estiloCarta(dem) {
    var f = function (nome) { return ['Noto Sans ' + nome]; };
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: {
        omt: { type: 'vector', url: OFM },
        dem: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 15,
          tiles: [dem.sharedDemProtocolUrl], attribution: 'Relevo: Terrain Tiles (Mapzen/AWS)' },
        sombra: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 15,
          tiles: [dem.sharedDemProtocolUrl] },
        curvas: { type: 'vector', maxzoom: 15, tiles: [dem.contourProtocolUrl({
          thresholds: { 9: [200, 1000], 10: [100, 500], 11: [50, 250], 12: [20, 100], 13: [20, 100], 14: [20, 100], 15: [10, 50] },
          elevationKey: 'ele', levelKey: 'nivel', contourLayer: 'curvas', buffer: 1, overzoom: 1
        })] },
        grade: { type: 'geojson', data: quadricula() },
        ime: { type: 'geojson', data: IME_AREA }
      },
      layers: [
        { id: 'papel', type: 'background', paint: { 'background-color': TINTA.papel } },
        { id: 'mata', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest', 'grass', 'scrub']]],
          paint: { 'fill-color': TINTA.mata, 'fill-opacity': 0.8 } },
        { id: 'parque', type: 'fill', source: 'omt', 'source-layer': 'park',
          paint: { 'fill-color': TINTA.mata, 'fill-opacity': 0.55 } },
        { id: 'brejo', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['==', ['get', 'class'], 'wetland'], paint: { 'fill-pattern': 'lepv-brejo' } },
        { id: 'urbano', type: 'fill', source: 'omt', 'source-layer': 'landuse',
          filter: ['in', ['get', 'class'], ['literal', ['residential', 'commercial', 'industrial', 'retail']]],
          paint: { 'fill-color': TINTA.urbano, 'fill-opacity': 0.42 } },
        { id: 'sombra', type: 'hillshade', source: 'sombra',
          paint: { 'hillshade-exaggeration': 0.18, 'hillshade-shadow-color': '#6b4a2c',
            'hillshade-highlight-color': '#fbf1d6', 'hillshade-accent-color': '#8a6a45' } },
        { id: 'agua', type: 'fill', source: 'omt', 'source-layer': 'water',
          paint: { 'fill-color': TINTA.agua } },
        { id: 'agua-margem', type: 'line', source: 'omt', 'source-layer': 'water',
          paint: { 'line-color': TINTA.aguaLinha, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 15, 1.4] } },
        { id: 'agua-lamina', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 11,
          paint: { 'line-color': TINTA.aguaLinha, 'line-opacity': 0.35, 'line-width': 0.6,
            'line-offset': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 5] } },
        { id: 'rio', type: 'line', source: 'omt', 'source-layer': 'waterway',
          paint: { 'line-color': TINTA.aguaLinha, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 15, 1.4] } },
        { id: 'curva', type: 'line', source: 'curvas', 'source-layer': 'curvas',
          filter: ['>', ['get', 'ele'], 0],
          paint: { 'line-color': TINTA.sepia, 'line-opacity': 0.85,
            'line-width': ['match', ['get', 'nivel'], 1, 1.2, 0.5] } },
        { id: 'ferrovia', type: 'line', source: 'omt', 'source-layer': 'transportation',
          filter: ['==', ['get', 'class'], 'rail'],
          paint: { 'line-color': TINTA.preto, 'line-width': 1.4, 'line-dasharray': [3, 2] } },
        { id: 'rua', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
          filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
          paint: { 'line-color': TINTA.preto, 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 16, 1] } },
        { id: 'avenida', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
          filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary']]],
          paint: { 'line-color': TINTA.preto, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 15, 1.6] } },
        { id: 'rodovia-borda', type: 'line', source: 'omt', 'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          paint: { 'line-color': TINTA.preto, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 15, 4.5] } },
        { id: 'rodovia', type: 'line', source: 'omt', 'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          paint: { 'line-color': TINTA.estrada, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 15, 2.8] } },
        { id: 'edificio', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
          paint: { 'fill-color': TINTA.preto, 'fill-opacity': 0.5 } },
        { id: 'ime-halo', type: 'line', source: 'ime', minzoom: 12,
          paint: { 'line-color': TINTA.vinho, 'line-opacity': 0.5, 'line-blur': 6,
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 16, 30] } },
        { id: 'ime', type: 'fill-extrusion', source: 'ime', minzoom: 12,
          paint: { 'fill-extrusion-color': TINTA.vinho, 'fill-extrusion-opacity': 1,
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 30] } },
        { id: 'grade', type: 'line', source: 'grade',
          filter: ['any', ['get', 'dez'], ['>=', ['zoom'], 12]],
          paint: { 'line-color': TINTA.preto, 'line-opacity': 0.45, 'line-width': ['case', ['get', 'dez'], 0.9, 0.5] } },
        { id: 'curva-cota', type: 'symbol', source: 'curvas', 'source-layer': 'curvas', minzoom: 13,
          filter: ['all', ['>', ['get', 'nivel'], 0], ['>', ['get', 'ele'], 0]],
          layout: { 'symbol-placement': 'line', 'text-field': ['to-string', ['get', 'ele']],
            'text-font': f('Italic'), 'text-size': 10 },
          paint: { 'text-color': TINTA.sepia, 'text-halo-color': TINTA.papel, 'text-halo-width': 1.2 } },
        { id: 'agua-nome', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 12,
          layout: { 'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']], 'text-font': f('Italic'),
            'text-size': 11, 'text-letter-spacing': 0.15 },
          paint: { 'text-color': TINTA.aguaTexto, 'text-halo-color': TINTA.agua, 'text-halo-width': 1 } },
        { id: 'bairro', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11,
          filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]],
          layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': f('Regular'),
            'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 15, 11], 'text-letter-spacing': 0.18,
            'text-max-width': 8 },
          paint: { 'text-color': TINTA.preto, 'text-opacity': 0.8, 'text-halo-color': TINTA.papel, 'text-halo-width': 1.4 } },
        { id: 'cidade', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 12,
          filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
          layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': f('Bold'), 'text-size': 13,
            'text-letter-spacing': 0.25 },
          paint: { 'text-color': TINTA.preto, 'text-halo-color': TINTA.papel, 'text-halo-width': 1.6 } }
      ],
      terrain: { source: 'dem', exaggeration: 1.2 },
      sky: { 'sky-color': TINTA.papel, 'horizon-color': TINTA.papel, 'fog-color': TINTA.papel,
        'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8 }
    };
  }

  function injetarScript(src, sri) {
    return new Promise(function (ok, falha) {
      var js = document.createElement('script');
      js.src = src; js.integrity = sri; js.crossOrigin = 'anonymous';
      js.onload = ok; js.onerror = falha;
      document.head.appendChild(js);
    });
  }
  var libPromise = null;
  function carregarLib() {
    if (window.maplibregl && window.mlcontour) return Promise.resolve();
    if (libPromise) return libPromise;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = ML_CSS;
    css.integrity = ML_CSS_SRI; css.crossOrigin = 'anonymous';
    document.head.appendChild(css);
    libPromise = Promise.all([
      window.maplibregl ? null : injetarScript(ML_JS, ML_JS_SRI),
      window.mlcontour ? null : injetarScript(MC_JS, MC_JS_SRI)
    ]).then(function () { if (!window.maplibregl || !window.mlcontour) throw new Error('lib'); });
    libPromise.catch(function () { libPromise = null; });
    return libPromise;
  }

  function dms(v, pos, neg) {
    var a = Math.abs(v), g = Math.floor(a), m = Math.floor((a - g) * 60);
    var s = Math.floor(((a - g) * 60 - m) * 60);
    return g + '°' + (m < 10 ? '0' : '') + m + '′' + (s < 10 ? '0' : '') + s + '″' + (v < 0 ? neg : pos);
  }
  function lugar(z) {
    return z < 12 ? 'Carta do Rio de Janeiro' : z < 13.6 ? 'Baía de Guanabara · Urca' : 'Urca · Pão de Açúcar';
  }

  var el = null;
  function montar() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'voo';
    el.hidden = true;
    el.setAttribute('role', 'region');
    el.innerHTML =
      '<div class="voo-folha" aria-hidden="true"><div class="voo-map"></div></div>' +
      '<div class="voo-top">' +
        '<div class="voo-marca"><img src="/assets/logo-mark.png" alt=""><span>LEPV</span></div>' +
        '<p class="voo-folha-id" aria-hidden="true">Folha SF.23-Z-B-IV-4 · Baía de Guanabara</p>' +
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

  var map = null, timers = [], ativo = false, modoAtual = null, kickerFixo = false, marcas = [];

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
      marcas = [];
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

  function conteudoRotulo(r) {
    if (r.cls === 'ime') return '<span><strong>' + r.t + '</strong><small>' + r.sub + '</small></span><b></b>';
    return (r.cls === 'pico' ? '<b>△</b>' : r.cls === 'destino' ? '<b></b>' : '') +
      '<span>' + r.t + (r.alt ? ' <em>' + r.alt + '</em>' : '') + '</span>';
  }
  function ancora(r) {
    if (r.cls === 'agua' || r.cls === 'relevo') return 'center';
    return r.cls === 'ime' ? 'right' : 'left';
  }

  function rotular(map) {
    marcas = ROTULOS.map(function (r) {
      /* o Marker controla a opacidade do elemento externo (oclusão pelo relevo);
         a visibilidade por zoom fica no filho */
      var box = document.createElement('div'), d = document.createElement('div');
      d.className = 'voo-lbl voo-lbl-' + r.cls + (r.longo ? ' voo-lbl-longo' : '');
      d.innerHTML = conteudoRotulo(r);
      box.appendChild(d);
      new maplibregl.Marker({ element: box, anchor: ancora(r),
        opacityWhenCovered: r.cls === 'destino' || r.cls === 'ime' ? '1' : '0.25' })
        .setLngLat(r.c).addTo(map);
      return { r: r, d: d };
    });
  }
  function mostrarRotulos(z) {
    marcas.forEach(function (m) {
      m.d.classList.toggle('on', z >= m.r.zmin && z < m.r.zmax);
      m.d.classList.toggle('perto', z >= 13);
    });
  }

  function voar(r) {
    var k = el.querySelector('.voo-k'), c = el.querySelector('.voo-c');
    var i = r.inicio;
    c.textContent = dms(i.center[1], 'N', 'S') + ' · ' + dms(i.center[0], 'L', 'O');
    if (map) { map.remove(); map = null; }
    map = new maplibregl.Map({
      container: el.querySelector('.voo-map'),
      center: i.center, zoom: i.zoom, pitch: i.pitch, bearing: i.bearing,
      interactive: false,
      fadeDuration: 0,
      antialias: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      maxPitch: 80,
      attributionControl: { compact: true },
      style: estiloCarta(fonteDem())
    });
    map.on('styleimagemissing', function (e) {
      if (e.id === 'lepv-brejo' && !map.hasImage(e.id)) map.addImage(e.id, hachura());
    });
    rotular(map);
    mostrarRotulos(i.zoom);
    map.on('move', function () {
      var p = map.getCenter(), z = map.getZoom();
      c.textContent = dms(p.lat, 'N', 'S') + ' · ' + dms(p.lng, 'L', 'O');
      if (!kickerFixo) k.textContent = lugar(z);
      mostrarRotulos(z);
    });
    var cena = {
      depois: function (ms, fn) { timers.push(setTimeout(function () { if (ativo) fn(); }, ms)); },
      chegou: function () { el.classList.add('chegou'); },
      fixarKicker: function (t) { kickerFixo = true; k.textContent = t; },
      fixarTitulo: function (h) { el.querySelector('.voo-t').innerHTML = h; }
    };
    var semCarga = setTimeout(encerrar, 8000);
    timers.push(semCarga);
    map.once('load', function () {
      clearTimeout(semCarga);
      var attrib = el.querySelector('.maplibregl-ctrl-attrib');
      if (attrib && window.innerWidth < 720) attrib.classList.remove('maplibregl-compact-show');
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
      : 'Abertura: a carta do Rio de Janeiro');
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
