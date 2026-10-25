(function () {
  'use strict';
  var motion = document.documentElement.classList.contains('motion');

  /* ---------- palette & sprites ---------- */
  var PAL = {
    k: '#12050A', w: '#7F0A1A', W: '#9E1F30', r: '#D31E24', c: '#FAF8F5', g: '#FFC94A', G: '#B8841D',
    n: '#081B33', N: '#1B3A63', b: '#5FD8E2', B: '#2B8F99', s: '#E8A27A', S: '#B9714F', h: '#3B1E14', y: '#BFB0AA', p: '#2A2440'
  };
  var SPR = {
    bell: ['.....gg.....', '....gggg....', '...gcggggg..', '...gcgggggG.', '..gcggggggG.', '..gcggggggG.', '..ggggggggG.', '.gggggggggGG', 'gGGGGGGGGGGG', '.....kk.....', '....kkkk....', '............'],
    qr: ['cccccccccccc', 'ckkkckckckkk', 'ckckcckcckck', 'ckkkckkcckkk', 'cccccckckccc', 'ckckkcckkckc', 'cckcckkcckkc', 'ckkkcckckckc', 'ckckckkcckcc', 'ckkkcckckkkc', 'cccccccccccc', '............'],
    cal: ['..k......k..', '.rkrrrrrrkr.', '.rrrrrrrrrr.', '.wwwwwwwwww.', '.cccccccccc.', '.ckkcckkcyc.', '.cccccccccc.', '.ckkcrrcckc.', '.cccrrccccc.', '.ckkcckkckc.', '.cccccccccc.', '............'],
    team: ['..hhh..hhh..', '.hssh..hssh.', '.ssss..ssss.', '.skks..skks.', '.ssss..ssss.', '..ss....ss..', '.rrrr..bbbb.', 'rrrrrrbbbbbb', 'rrrrrrbbbbbb', 'rrrrrrbbbbbb', 'pppppppppppp', '............'],
    disk: ['NNNNNNNNNNN.', 'NNyyyyyykNNN', 'NNyyyyyykNNN', 'NNyyyyyykNNN', 'NNNNNNNNNNNN', 'NNNNNNNNNNNN', 'NNccccccccNN', 'NNcwwwwwwcNN', 'NNccccccccNN', 'NNcwwwwwwcNN', 'NNccccccccNN', 'NNNNNNNNNNNN'],
    star: ['.....gg.....', '.....gg.....', '....gcgg....', 'gggggcggggg.', '.ggggggggGG.', '..gggggggG..', '...ggggGG...', '..gggGGggG..', '..ggG..GgG..', '.gG......GG.', '............', '............'],
    flag: ['.k..........', '.krrrrrrrr..', '.krrrrrrrrr.', '.krrccrrrrrr', '.krrccrrrrr.', '.krrrrrrrr..', '.kwwwwwww...', '.k..........', '.k..........', '.k..........', 'kkk.........', '............'],
    lock: ['....yyyy....', '...y....y...', '..y......y..', '..y......y..', '.gggggggggg.', '.gccgggggGg.', '.ggggkkggGg.', '.ggggkkggGg.', '.gggggkgggg.', '.gggggkgggg.', '.GGGGGGGGGG.', '............'],
    pin: ['...rrrrrr...', '..rrrrrrrr..', '.rrrccccrrr.', '.rrccccccrrr', '.rrccccccrr.', '.rrrccccrrr.', '..rrrrrrrr..', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '....kkkk....'],
    chest: ['.wwwwwwwwww.', 'wGgwwwwwwgGw', 'wwwwwwwwwwww', 'gggggggggggg', 'wwwwwggwwwww', 'wwwwwkkwwwww', 'wwwwwwwwwwww', 'wGgwwwwwwgGw', 'wwwwwwwwwwww'],
    coin: ['..gggg..', '.gcgggG.', 'gcggGggG', 'gcggGggG', 'ggggGggG', 'ggggGggG', '.gggggG.', '..GGGG..'],
    heart: ['.rr.rr.', 'rcrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    bulb: ['..ggg..', '.gcggg.', 'gcggggg', 'ggggggg', '.ggggg.', '..ggg..', '..yyy..', '..yyy..', '...k...'],
    bug: ['.k....k.', '..kkkk..', 'k.rrrr.k', '.rrkkrr.', 'krrrrrrk', '.rrkkrr.', 'k.rrrr.k', '........']
  };

  function makeChar(o) {
    var W = 12, H = 16, g = [];
    for (var y = 0; y < H; y++) { g.push([]); for (var x = 0; x < W; x++) g[y].push('.'); }
    function px(x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; }
    function rect(x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) px(x, y, c); }
    rect(3, 2, 8, 7, 's'); rect(8, 3, 8, 7, 'S');
    rect(3, 0, 8, 1, o.hair); px(3, 2, o.hair); px(8, 2, o.hair); px(3, 3, o.hair);
    if (o.long) { rect(2, 1, 2, 6, o.hair); rect(9, 1, 9, 6, o.hair); }
    px(4, 4, 'k'); px(7, 4, 'k'); px(5, 6, 'w'); px(6, 6, 'w');
    rect(5, 8, 6, 8, 'S');
    rect(2, 9, 9, 12, o.shirt); rect(1, 9, 1, 11, o.shirt); rect(10, 9, 10, 11, o.shirt);
    px(1, 12, 's'); px(10, 12, 's');
    rect(3, 13, 8, 14, o.pants); px(5, 14, '.'); px(6, 14, '.');
    rect(2, 15, 4, 15, 'k'); rect(7, 15, 9, 15, 'k');
    if (o.acc === 'headset') { rect(2, 3, 2, 5, 'k'); rect(9, 3, 9, 5, 'k'); rect(3, 0, 8, 0, 'k'); px(2, 2, 'k'); px(9, 2, 'k'); px(1, 5, 'r'); }
    if (o.acc === 'beret') { rect(2, 0, 9, 0, 'r'); rect(3, 1, 8, 1, 'r'); px(9, 1, 'r'); }
    if (o.acc === 'tie') { rect(5, 9, 6, 9, 'c'); rect(5, 10, 6, 12, 'r'); }
    if (o.acc === 'glasses') { rect(3, 4, 4, 4, 'b'); rect(6, 4, 8, 4, 'b'); px(5, 4, 'k'); px(4, 4, 'k'); px(7, 4, 'k'); }
    if (o.acc === 'star') { px(5, 10, 'g'); px(6, 10, 'g'); px(5, 11, 'g'); px(6, 11, 'g'); px(4, 10, 'G'); px(7, 10, 'G'); }
    if (o.acc === 'laptop') { rect(3, 11, 8, 11, 'y'); rect(4, 10, 7, 10, 'b'); }
    return g.map(function (r) { return r.join(''); });
  }
  var CHARS = {
    dev: makeChar({ hair: 'h', shirt: 'n', pants: 'p', acc: 'headset' }),
    design: makeChar({ hair: 'h', shirt: 'b', pants: 'p', acc: 'beret', long: true }),
    negocios: makeChar({ hair: 'k', shirt: 'p', pants: 'k', acc: 'tie' }),
    dados: makeChar({ hair: 'G', shirt: 'W', pants: 'p', acc: 'glasses', long: true }),
    coringa: makeChar({ hair: 'r', shirt: 'g', pants: 'n', acc: 'star' })
  };
  var CLS_NAME = { dev: 'Dev', design: 'Design', negocios: 'Negócios', dados: 'Dados', coringa: 'Coringa' };

  function withOutline(rows) {
    var h = rows.length, w = rows[0].length, out = [];
    for (var y = 0; y < h + 2; y++) {
      var line = '';
      for (var x = 0; x < w + 2; x++) {
        var c = (rows[y - 1] || '')[x - 1];
        if (c && c !== '.') { line += c; continue; }
        var near = false;
        for (var dy = -1; dy <= 1 && !near; dy++) for (var dx = -1; dx <= 1; dx++) {
          var n = (rows[y - 1 + dy] || '')[x - 1 + dx];
          if (n && n !== '.' && n !== 'k') { near = true; break; }
        }
        line += near ? 'k' : '.';
      }
      out.push(line);
    }
    return out;
  }
  function paint(ctx, rows, ox, oy) {
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
      var c = rows[y][x];
      if (c !== '.' && PAL[c]) { ctx.fillStyle = PAL[c]; ctx.fillRect(ox + x, oy + y, 1, 1); }
    }
  }
  function toCanvas(cv, rows, scale) {
    var o = withOutline(rows);
    cv.width = o[0].length; cv.height = o.length;
    var ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    paint(ctx, o, 0, 0);
    if (scale) { cv.style.width = cv.width * scale + 'px'; cv.style.height = cv.height * scale + 'px'; }
  }
  var OUT = {};
  function outlined(name, rows) { return OUT[name] || (OUT[name] = withOutline(rows)); }

  document.querySelectorAll('canvas[data-sprite]').forEach(function (cv) {
    var s = SPR[cv.dataset.sprite]; if (s) toCanvas(cv, s, +cv.dataset.scale || 4);
  });
  document.querySelectorAll('canvas[data-char]').forEach(function (cv) {
    var s = CHARS[cv.dataset.char]; if (s) toCanvas(cv, s, +cv.dataset.scale || 5);
  });

  /* ---------- emblem: pixel gear + Pão de Açúcar ---------- */
  (function emblem() {
    var cv = document.getElementById('emblem'); if (!cv) return;
    var ctx = cv.getContext('2d'), S = 48, cx = 23.5, cy = 23.5, grid = [];
    for (var y = 0; y < S; y++) {
      var row = '';
      for (var x = 0; x < S; x++) {
        var dx = x - cx, dy = y - cy, r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
        var tooth = ((a / (Math.PI * 2) * 12 + 12.25) % 1) < 0.5;
        var ch = '.';
        if (r >= 16.5 && r < 20.5) ch = 'c';
        else if (r >= 20.5 && r < 23.5 && tooth) ch = 'c';
        else if (r < 16.5) {
          ch = 'c';
          var dp = (x - 19) / 6.5, du = (x - 29.5) / 6.5;
          var topP = Math.abs(dp) < 1 ? 27 - 16 * Math.pow(1 - dp * dp, 0.55) : 99;
          var topU = Math.abs(du) < 1 ? 29.5 - 7 * Math.pow(1 - du * du, 0.5) : 99;
          if (y >= Math.min(topP, topU) && y < 33) ch = 'k';
          var wave = 33 + 1.6 * Math.sin(x / 5.2);
          if (y >= wave && y < wave + 2) ch = 'r';
          if (y >= wave + 3 && y < wave + 4.2) ch = 'w';
          var ay = 32 - (x - 10) * 0.72;
          if (x > 10 && x < 36 && y >= ay - 1 && y < ay + 0.6) ch = 'r';
        }
        row += ch;
      }
      grid.push(row);
    }
    // arrow head
    var head = [[36, 12], [35, 12], [34, 12], [36, 13], [36, 14], [35, 13], [37, 11], [33, 12], [36, 15]];
    head.forEach(function (p) { var r = grid[p[1]].split(''); r[p[0]] = 'r'; grid[p[1]] = r.join(''); });
    var o = withOutline(grid.map(function (r) { return r.slice(1, 47); }));
    cv.width = o[0].length; cv.height = o.length;
    paint(ctx, o, 0, 0);
  })();

  /* ---------- countdown ---------- */
  var target = Date.parse('2026-10-30T15:00:00-03:00');
  var cd = document.getElementById('cd');
  var P = { d: document.getElementById('cd-d'), h: document.getElementById('cd-h'), m: document.getElementById('cd-m'), s: document.getElementById('cd-s') };
  var timer = null;
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function tick() {
    var diff = Math.max(0, target - Date.now());
    if (diff <= 0) {
      cd.classList.add('started'); cd.textContent = 'O hackathon começou';
      var l = document.getElementById('cd-label'); if (l) l.textContent = 'Mundo 1 · em andamento';
      if (timer) clearInterval(timer); return;
    }
    var s = Math.floor(diff / 1000);
    P.d.textContent = pad(Math.floor(s / 86400)); P.h.textContent = pad(Math.floor(s % 86400 / 3600));
    P.m.textContent = pad(Math.floor(s % 3600 / 60)); P.s.textContent = pad(s % 60);
  }
  if (cd) { tick(); timer = setInterval(tick, 1000); }

  /* ---------- hero scene ---------- */
  (function scene() {
    var cv = document.getElementById('scene'); if (!cv || !cv.getContext) return;
    var hero = cv.parentElement, ctx = cv.getContext('2d');
    var W, H, hy, sky, stars, far, mx = 0, tmx = 0, running = false, visible = true, t0 = performance.now();
    var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    var SKY = ['#081B33', '#140C2C', '#2A0A26', '#4A0B22', '#7F0A1A', '#B3161F', '#D31E24', '#F0643A', '#FFC94A'];
    function rand(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
    function setup() {
      var r = hero.getBoundingClientRect();
      W = r.width < 600 ? 150 : 300;
      H = Math.max(120, Math.round(W * r.height / r.width));
      cv.width = W; cv.height = H;
      hy = Math.round(H * (r.width < 600 ? 0.74 : 0.7));
      sky = document.createElement('canvas'); sky.width = W; sky.height = hy;
      var sctx = sky.getContext('2d');
      var skyTop = Math.round(hy * 0.3);
      for (var y = 0; y < hy; y++) {
        var t = y < skyTop ? 0 : (y - skyTop) / (hy - skyTop) * (SKY.length - 1);
        var i = Math.floor(t), f = t - i;
        for (var x = 0; x < W; x++) {
          var c = (BAYER[y % 4][x % 4] / 16) < f ? SKY[Math.min(i + 1, SKY.length - 1)] : SKY[i];
          sctx.fillStyle = c; sctx.fillRect(x, y, 1, 1);
        }
      }
      var R = rand(42); stars = [];
      for (var k = 0; k < W * 0.35; k++) stars.push([R() * W, R() * hy * 0.6, R() * 6, R() < 0.2]);
      far = [];
      for (var x2 = 0; x2 < W + 40; x2++) {
        var v = Math.sin(x2 * 0.045) * 6 + Math.sin(x2 * 0.13 + 1) * 3 + Math.sin(x2 * 0.021 + 2) * 8;
        far.push(Math.round(hy - 10 - Math.max(0, v + 8)));
      }
    }
    function mountain(x, cx, hgt, wl, wr, pw) {
      var d = (x - cx) / (x < cx ? wl : wr);
      if (Math.abs(d) >= 1) return 0;
      return hgt * Math.pow(1 - d * d, pw);
    }
    function draw(now) {
      var t = (now - t0) / 1000;
      mx += (tmx - mx) * 0.06;
      var sc = Math.min(1, window.scrollY / (H * 4 || 1));
      ctx.drawImage(sky, 0, 0);
      // stars
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], on = motion ? Math.sin(t * 2 + s[2]) > -0.4 : true;
        if (!on) continue;
        ctx.fillStyle = s[3] ? '#FFC94A' : '#FAF8F5';
        ctx.fillRect(Math.round(s[0] - mx * 1), Math.round(s[1]), 1, 1);
      }
      // sun with retro stripes
      var sunX = Math.round(W * (W < 200 ? 0.3 : 0.24)), sunY = hy - 2, sr = Math.round(W * (W < 200 ? 0.13 : 0.085));
      for (var y = -sr; y <= 0; y++) {
        var half = Math.round(Math.sqrt(sr * sr - y * y));
        var band = (-y) % 6;
        if (-y < sr * 0.55 && band < (y > -sr * 0.25 ? 3 : 1)) continue;
        ctx.fillStyle = -y > sr * 0.5 ? '#FFC94A' : '#F0643A';
        ctx.fillRect(sunX - half - Math.round(mx * 0.5), sunY + y, half * 2, 1);
      }
      // far ridge
      var fo = Math.round(20 + mx * 2);
      ctx.fillStyle = '#2A0A26';
      for (var x = 0; x < W; x++) { var fy = far[x + fo]; ctx.fillRect(x, fy, 1, hy - fy); }
      // Pão de Açúcar + Morro da Urca
      var mo = mx * 4 + sc * 6;
      var small = W < 200;
      var pcx = W * (small ? 0.8 : 0.85), ucx = W * (small ? 0.55 : 0.71);
      var ph = hy * (small ? 0.3 : 0.3), uh = hy * (small ? 0.13 : 0.13);
      var pw = W * (small ? 0.12 : 0.07), uw = W * (small ? 0.2 : 0.12);
      var topP = null, topU = null;
      for (var x3 = 0; x3 < W; x3++) {
        var gx = x3 + mo;
        var hP = mountain(gx, pcx, ph, pw, pw * 1.25, 0.45);
        var hU = mountain(gx, ucx, uh, uw, uw * 0.8, 0.5);
        var hh = Math.round(Math.max(hP, hU));
        if (hh > 0) {
          var top = hy - hh;
          ctx.fillStyle = '#12050A'; ctx.fillRect(x3, top, 1, hh);
          ctx.fillStyle = gx < pcx && hP >= hU ? '#9E1F30' : '#4A0B22';
          ctx.fillRect(x3, top, 1, 1);
          if (hP >= hU && (!topP || top < topP[1])) topP = [x3, top];
          if (hU > hP && (!topU || top < topU[1])) topU = [x3, top];
        }
      }
      // cable car line + car
      if (topP && topU) {
        var ax = topU[0], ay = topU[1] + 1, bx = topP[0], by = topP[1] + 1;
        ctx.fillStyle = '#BFB0AA';
        for (var k = 0; k <= 1; k += 1 / Math.max(1, bx - ax)) {
          ctx.fillRect(Math.round(ax + (bx - ax) * k), Math.round(ay + (by - ay) * k + Math.sin(Math.PI * k) * 4), 1, 1);
        }
        var p = motion ? (Math.sin(t * 0.35) + 1) / 2 : 0.4;
        var cxp = Math.round(ax + (bx - ax) * p), cyp = Math.round(ay + (by - ay) * p + Math.sin(Math.PI * p) * 4);
        ctx.fillStyle = '#BFB0AA'; ctx.fillRect(cxp, cyp + 1, 1, 1);
        ctx.fillStyle = '#D31E24'; ctx.fillRect(cxp - 1, cyp + 2, 4, 3);
        ctx.fillStyle = '#FFC94A'; ctx.fillRect(cxp, cyp + 3, 2, 1);
      }
      // sea
      var beachY = Math.round(H * (small ? 0.9 : 0.88));
      ctx.fillStyle = '#081B33'; ctx.fillRect(0, hy, W, beachY - hy);
      for (var yy = hy + 1; yy < beachY; yy += 2) {
        ctx.fillStyle = (yy - hy) % 4 === 1 ? '#0F2747' : '#081B33';
        ctx.fillRect(0, yy, W, 1);
        var rw = Math.round(sr * (1 - (yy - hy) / (beachY - hy) * 0.5));
        var sh = motion ? Math.round(Math.sin(t * 3 + yy) * 2) : 0;
        ctx.fillStyle = (yy % 3) ? '#F0643A' : '#FFC94A';
        ctx.fillRect(sunX - Math.round(mx * 0.5) - rw + sh + ((yy * 7) % 5), yy, Math.max(2, rw * 2 - ((yy * 13) % 9)), 1);
      }
      // reflections of mountains
      ctx.fillStyle = 'rgba(18,5,10,.55)';
      // beach (Praia Vermelha)
      var bo = Math.round(mx * 7);
      for (var x4 = 0; x4 < W; x4++) {
        var wv = motion ? Math.round(Math.sin((x4 + bo) * 0.18 + t * 1.6)) : 0;
        var y0 = beachY + wv;
        ctx.fillStyle = '#FAF8F5'; ctx.fillRect(x4, y0 - 1, 1, 1);
        for (var y5 = y0; y5 < H; y5++) {
          ctx.fillStyle = (BAYER[y5 % 4][(x4 + bo + 400) % 4] / 16) < (y5 - y0) / (H - y0 + 1) ? '#7F0A1A' : '#9E1F30';
          ctx.fillRect(x4, y5, 1, 1);
        }
      }
    }
    function loop(now) {
      if (!running) return;
      draw(now);
      requestAnimationFrame(loop);
    }
    function start() { if (!running && motion && visible) { running = true; requestAnimationFrame(loop); } }
    setup(); draw(performance.now());
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { setup(); draw(performance.now()); }, 150); });
    if (!motion) return;
    window.addEventListener('pointermove', function (e) { tmx = (e.clientX / window.innerWidth - 0.5) * 2; }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); else running = false; }).observe(hero);
    }
    start();
  })();

  /* ---------- coin ---------- */
  var credits = 0, coinBtn = document.getElementById('coin'), creditEl = document.getElementById('credit');
  if (coinBtn) coinBtn.addEventListener('click', function () {
    credits = Math.min(99, credits + 1); creditEl.textContent = pad(credits);
    var r = coinBtn.getBoundingClientRect(), c = document.createElement('canvas');
    c.className = 'coin-pop'; toCanvas(c, SPR.coin, 3);
    c.style.left = (r.left + r.width / 2 - 15) + 'px'; c.style.top = (r.top - 10) + 'px';
    document.body.appendChild(c);
    setTimeout(function () { c.remove(); }, motion ? 750 : 400);
  });

  /* ---------- party select ---------- */
  var party = [null, null, null, null];
  var slots = document.querySelectorAll('.slot'), status = document.getElementById('party-status');
  function renderParty(justIdx, msg) {
    var n = 0;
    slots.forEach(function (sl, i) {
      var cv = sl.querySelector('canvas'), name = sl.querySelector('.slot-n'), k = party[i];
      sl.classList.toggle('filled', !!k);
      if (k) { n++; toCanvas(cv, CHARS[k]); name.textContent = CLS_NAME[k]; }
      else { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); name.textContent = i < 2 ? 'Obrigatório' : 'Opcional'; }
      sl.classList.remove('just');
      if (i === justIdx) { void sl.offsetWidth; sl.classList.add('just'); }
    });
    var txt;
    if (msg) txt = msg;
    else if (n === 0) txt = '0/4 jogadores · mínimo 2';
    else if (n === 1) txt = '1/4 · falta pelo menos mais 1 jogador';
    else if (n < 4) txt = n + '/4 · equipe válida! ▶ pronta para jogar';
    else txt = '4/4 · party cheia! Equipe válida';
    status.textContent = txt;
    status.classList.toggle('ok', n >= 2);
  }
  document.querySelectorAll('.cls').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = party.indexOf(null);
      if (i === -1) { renderParty(-1, 'Party cheia: o máximo é 4 jogadores'); return; }
      party[i] = b.dataset.cls; renderParty(i);
    });
  });
  slots.forEach(function (sl, i) { sl.addEventListener('click', function () { if (party[i]) { party[i] = null; renderParty(-1); } }); });
  var reset = document.getElementById('party-reset');
  if (reset) reset.addEventListener('click', function () { party = [null, null, null, null]; renderParty(-1); });

  /* ---------- continue? countdown ---------- */
  var cont = document.getElementById('cont');
  if (cont && motion && 'IntersectionObserver' in window) {
    var cn = 9, ci = null;
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !ci) ci = setInterval(function () { cn = cn <= 0 ? 9 : cn - 1; cont.textContent = cn; }, 1000);
      else if (!en[0].isIntersecting && ci) { clearInterval(ci); ci = null; }
    }).observe(cont);
  }

  /* ---------- mini-game ---------- */
  var dlg = document.getElementById('game'), gc = document.getElementById('game-c');
  var game = null;
  function openGame() {
    if (!dlg || !dlg.showModal || dlg.open) return;
    dlg.showModal();
    game = newGame(); drawGame();
  }
  function newGame() { return { x: 88, score: 0, lives: 3, items: [], t: 0, spawn: 0, state: 'ready', left: false, right: false, last: 0 }; }
  function drawGame() {
    if (!game) return;
    var g = gc.getContext('2d'), W = gc.width, H = gc.height;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#081B33'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2A0A26';
    for (var x = 0; x < W; x++) { var m = Math.max(0, 26 * Math.pow(Math.max(0, 1 - Math.pow((x - 150) / 14, 2)), 0.45), 12 * Math.pow(Math.max(0, 1 - Math.pow((x - 120) / 18, 2)), 0.5)); g.fillRect(x, 118 - m, 1, m); }
    g.fillStyle = '#9E1F30'; g.fillRect(0, 128, W, 16);
    g.fillStyle = '#FAF8F5'; g.fillRect(0, 127, W, 1);
    game.items.forEach(function (it) { paint(g, outlined(it.k, SPR[it.k]), Math.round(it.x), Math.round(it.y)); });
    paint(g, outlined('coringa', CHARS.coringa), Math.round(game.x), 110);
    for (var i = 0; i < game.lives; i++) paint(g, SPR.heart, 4 + i * 9, 4);
    g.fillStyle = '#FFC94A'; g.font = '8px "Press Start 2P", monospace'; g.textAlign = 'right';
    g.fillText('IDEIAS ' + game.score, W - 4, 12);
    g.textAlign = 'center';
    if (game.state !== 'play') {
      g.fillStyle = 'rgba(18,5,10,.78)'; g.fillRect(16, 44, W - 32, 46);
      g.fillStyle = '#FAF8F5';
      if (game.state === 'ready') { g.fillText('APERTE JOGAR', W / 2, 62); g.fillStyle = '#FFC94A'; g.fillText('IDEIA +1  BUG -1', W / 2, 78); }
      else { g.fillText('FIM DE JOGO', W / 2, 62); g.fillStyle = '#FFC94A'; g.fillText(game.score + ' IDEIAS', W / 2, 78); }
    }
  }
  function step(now) {
    if (!game || game.state !== 'play' || !dlg.open) return;
    var dt = Math.min(0.05, (now - (game.last || now)) / 1000); game.last = now;
    game.t += dt; game.spawn -= dt;
    var sp = 70;
    if (game.left) game.x -= sp * dt; if (game.right) game.x += sp * dt;
    game.x = Math.max(0, Math.min(gc.width - 14, game.x));
    if (game.spawn <= 0) {
      game.spawn = Math.max(0.35, 0.9 - game.t * 0.015);
      game.items.push({ k: Math.random() < 0.32 + Math.min(0.2, game.t * 0.006) ? 'bug' : 'bulb', x: 4 + Math.random() * (gc.width - 16), y: -10, v: 34 + Math.random() * 20 + game.t * 1.2 });
    }
    game.items = game.items.filter(function (it) {
      it.y += it.v * dt;
      var hit = it.y + 9 > 110 && it.y < 128 && it.x + 8 > game.x + 2 && it.x < game.x + 12;
      if (hit) { if (it.k === 'bulb') game.score++; else game.lives--; return false; }
      return it.y < gc.height;
    });
    if (game.lives <= 0) game.state = 'over';
    drawGame();
    if (game.state === 'play') requestAnimationFrame(step);
  }
  function play() {
    if (!game) return;
    if (game.state !== 'play') { var keepL = game.left, keepR = game.right; game = newGame(); game.left = keepL; game.right = keepR; game.state = 'play'; requestAnimationFrame(step); }
  }
  if (dlg) {
    document.getElementById('game-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { game = null; });
    document.getElementById('pad-go').addEventListener('click', play);
    [['pad-l', 'left'], ['pad-r', 'right']].forEach(function (p) {
      var b = document.getElementById(p[0]);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (game) game[p[1]] = true; });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { if (game) game[p[1]] = false; }); });
    });
    var eggBtn = document.getElementById('egg-btn'); if (eggBtn) eggBtn.addEventListener('click', openGame);
  }
  var KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'], kpos = 0;
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (dlg && dlg.open && game) {
      if (k === 'arrowleft' || k === 'a') { game.left = true; e.preventDefault(); }
      if (k === 'arrowright' || k === 'd') { game.right = true; e.preventDefault(); }
      if ((k === ' ' || k === 'enter') && game.state !== 'play' && document.activeElement && document.activeElement.id !== 'game-close') { e.preventDefault(); play(); }
      return;
    }
    kpos = k === KONAMI[kpos] ? kpos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) { kpos = 0; openGame(); }
  });
  document.addEventListener('keyup', function (e) {
    if (!game) return; var k = (e.key || '').toLowerCase();
    if (k === 'arrowleft' || k === 'a') game.left = false;
    if (k === 'arrowright' || k === 'd') game.right = false;
  });
})();
