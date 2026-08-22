/* ============================================================
   LEPV · arte generativa + revelação no scroll
   Sem dependências. Duas gaussianas descrevem o Morro da Urca
   (baixo, largo, à esquerda) e o Pão de Açúcar (alto, agudo, à
   direita); tudo o mais deriva dessa silhueta.
   ============================================================ */
(function (global) {

  const NS = 'http://www.w3.org/2000/svg';
  const gauss = (x, c, w, a) => a * Math.exp(-Math.pow((x - c) / w, 2));

  /* Silhueta em coordenadas do viewBox informado.
     Segue a LOGO da liga: Pão de Açúcar alto e agudo à esquerda,
     Morro da Urca mais baixo e largo ao centro, esporão à direita. */
  function makeTerrain(W, peakH) {
    return x => gauss(x, W * 0.32, W * 0.085, peakH)
              + gauss(x, W * 0.53, W * 0.112, peakH * 0.56)
              + gauss(x, W * 0.69, W * 0.055, peakH * 0.28);
  }

  /* Caminho fechado da silhueta — serve para clip-path/máscara. */
  function silhouettePath(terrain, W, base, step) {
    let d = 'M0 ' + base;
    for (let x = 0; x <= W; x += (step || 6)) d += ' L' + x + ' ' + (base - terrain(x)).toFixed(1);
    return d + ' L' + W + ' ' + base + ' Z';
  }

  /* ---------- contorno em linhas ---------- */
  function contour(svg, o) {
    o = o || {};
    const W = o.W || 1000, base = o.base != null ? o.base : (o.H || 460) - 18;
    const peakH = o.peakH || base * 0.77;
    const terrain = makeTerrain(W, peakH);
    const levels = o.levels || 22, ribStep = o.ribStep || 16;
    const from = o.from || '#8A1E2D', to = o.to || '#A93245';
    const id = 'cg-' + Math.abs(W * levels + base);

    const defs = document.createElementNS(NS, 'defs');
    /* userSpaceOnUse: com objectBoundingBox uma costela vertical tem caixa de
       largura zero e o gradiente degenera — a linha simplesmente não pinta.
       Em coordenadas de usuário todos os traços partilham o mesmo gradiente. */
    defs.innerHTML =
      '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse"' +
        ' x1="0" y1="' + base + '" x2="0" y2="' + (base - peakH) + '">' +
        '<stop offset="0" stop-color="' + from + '" stop-opacity="' + (o.fadeLow || 0.10) + '"/>' +
        '<stop offset="0.5" stop-color="' + from + '" stop-opacity="' + (o.fadeMid || 0.42) + '"/>' +
        '<stop offset="1" stop-color="' + to + '" stop-opacity="' + (o.fadeHigh || 0.82) + '"/>' +
      '</linearGradient>';
    svg.appendChild(defs);

    let delay = 0;
    const made = [];
    /* stroke: undefined usa o gradiente do relevo; uma cor explícita serve
       para traços FORA da faixa do gradiente (as ondas, abaixo da base). */
    const add = (d, sw, op, stroke) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', stroke || ('url(#' + id + ')'));
      p.setAttribute('stroke-width', sw);
      p.setAttribute('stroke-opacity', op);
      p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
      let len = 1200;
      try { len = p.getTotalLength() || 1200; } catch (e) {}
      p.style.setProperty('--len', len);
      p.style.setProperty('--d', delay);   // usado pelo modo por transição
      delay += o.stagger || 26;
      made.push(p);
    };

    if (o.ribs !== false) {
      for (let x = W * 0.06; x <= W * 0.96; x += ribStep) {
        const h = terrain(x);
        if (h < 8) continue;
        add('M' + x.toFixed(0) + ' ' + base + ' L' + x.toFixed(0) + ' ' + (base - h).toFixed(1), 1, 0.40);
      }
    }
    for (let i = 1; i <= levels; i++) {
      const lvl = i / levels;
      let d = '', open = false;
      for (let x = 0; x <= W; x += 7) {
        const cut = terrain(x) * lvl;
        if (cut > 5) { d += (open ? ' L' : 'M') + x + ' ' + (base - cut).toFixed(1); open = true; }
        else open = false;
      }
      if (d) add(d, 1.1, 0.26 + 0.48 * lvl);
    }
    if (o.sea !== false) add('M0 ' + base + ' L' + W + ' ' + base, 1, 0.30);

    /* As duas ondas da logo: traços largos e varridos na base, o mar da
       Praia Vermelha. Espessura maior porque na marca elas são o gesto. */
    if (o.waves) {
      const wy = base + (o.waveDrop || 0);
      const a = o.waveAmp || 16, gap = o.waveGap || 13;
      /* Duas varreduras que se CRUZAM, como na marca — o mar é gesto, não régua.
         Cor sólida: aqui o gradiente do relevo já não alcança. */
      const wc = o.from || '#7F0A1A';
      // waveOpacity permite discrição quando a arte fica ATRÁS de texto
      const wo = o.waveOpacity != null ? o.waveOpacity : 1;
      add('M' + (-W * 0.02) + ' ' + (wy + a * 0.6) +
          ' C' + (W * 0.22) + ' ' + (wy + a * 1.8) +
          ', ' + (W * 0.58) + ' ' + (wy - a * 2.2) +
          ', ' + (W * 1.02) + ' ' + (wy - a * 1.6), 4, 0.88 * wo, wc);
      add('M' + (-W * 0.02) + ' ' + (wy - gap - a * 1.4) +
          ' C' + (W * 0.30) + ' ' + (wy - gap + a * 1.5) +
          ', ' + (W * 0.72) + ' ' + (wy - gap + a * 0.2) +
          ', ' + (W * 1.02) + ' ' + (wy - gap + a * 1.1), 2.6, 0.60 * wo, wc);
    }

    /* Cada traço recebe sua fatia do progresso: --s é onde ele começa
       (0→1 na ordem em que foi criado) e --w o quanto do curso ele leva
       para completar. O CSS resolve o dashoffset a partir de --p. */
    const n = made.length, w = o.drawWindow || 0.42;
    made.forEach(function (p, i) {
      p.style.setProperty('--s', ((i / Math.max(1, n - 1)) * (1 - w)).toFixed(4));
      p.style.setProperty('--w', w);
    });

    return { terrain, W, base, peakH, paths: made };
  }

  /* ---------- silhueta CHEIA, para marca d'água de fundo ----------
     Uso distinto do contorno em linhas: aqui o morro é uma massa quase
     imperceptível de papel mais escuro. Serve de fundo sem competir com a
     figura em linhas, que fica logo abaixo. Dimensiona ao contêiner, como
     fitContour, porque com viewBox fixo sobra faixa vazia ou corta o pico. */
  function silhouetteFill(svg, o) {
    o = o || {};
    let w = 0, h = 0, t;

    function build() {
      const r = svg.getBoundingClientRect();
      const W = Math.max(320, Math.round(r.width));
      const H = Math.max(120, Math.round(r.height));
      if (W === w && H === h) return;
      w = W; h = H;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('preserveAspectRatio', 'none');

      const base = H + 1;                       // encosta na base, sem folga
      const peakH = Math.round(H * (o.fill || 0.82));
      const terrain = makeTerrain(W, peakH);
      const id = 'sf-' + Math.abs(W * 7 + H);

      const defs = document.createElementNS(NS, 'defs');
      defs.innerHTML =
        '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse"' +
          ' x1="0" y1="' + base + '" x2="0" y2="' + (base - peakH) + '">' +
          '<stop offset="0" stop-color="' + (o.color || '#7F0A1A') +
            '" stop-opacity="' + (o.lowOpacity != null ? o.lowOpacity : 0.030) + '"/>' +
          '<stop offset="1" stop-color="' + (o.color || '#7F0A1A') +
            '" stop-opacity="' + (o.highOpacity != null ? o.highOpacity : 0.085) + '"/>' +
        '</linearGradient>';
      svg.appendChild(defs);

      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', silhouettePath(terrain, W, base, 4));
      p.setAttribute('fill', 'url(#' + id + ')');
      svg.appendChild(p);

      // um fio na crista dá borda ao volume sem virar desenho de linhas
      const edge = document.createElementNS(NS, 'path');
      let d = 'M0 ' + base;
      for (let x = 0; x <= W; x += 4) d += ' L' + x + ' ' + (base - terrain(x)).toFixed(1);
      edge.setAttribute('d', d);
      edge.setAttribute('fill', 'none');
      edge.setAttribute('stroke', o.color || '#7F0A1A');
      edge.setAttribute('stroke-opacity', o.edgeOpacity != null ? o.edgeOpacity : 0.16);
      edge.setAttribute('stroke-width', 1);
      svg.appendChild(edge);
    }

    build();
    addEventListener('resize', function () { clearTimeout(t); t = setTimeout(build, 180); }, {passive: true});
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    return { rebuild: build };
  }

  /* ---------- foto recortada pela silhueta do morro ---------- */
  function maskedPhoto(svg, href, o) {
    o = o || {};
    const W = o.W || 1000, H = o.H || 520, base = o.base != null ? o.base : H - 10;
    const peakH = o.peakH || base * 0.86;
    const terrain = makeTerrain(W, peakH);
    const cid = 'clip-' + Math.abs(W * H + base);

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const defs = document.createElementNS(NS, 'defs');
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', cid);
    const sp = document.createElementNS(NS, 'path');
    sp.setAttribute('d', silhouettePath(terrain, W, base, 5));
    clip.appendChild(sp);
    defs.appendChild(clip);

    /* desaturação e clareamento vivem num filtro SVG para acompanhar o recorte */
    defs.innerHTML += '<filter id="f-' + cid + '">' +
      '<feColorMatrix type="saturate" values="0.12"/>' +
      '<feComponentTransfer><feFuncR type="linear" slope="0.86" intercept="0.10"/>' +
      '<feFuncG type="linear" slope="0.86" intercept="0.10"/>' +
      '<feFuncB type="linear" slope="0.86" intercept="0.12"/></feComponentTransfer>' +
      '</filter>';
    svg.appendChild(defs);

    const img = document.createElementNS(NS, 'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    img.setAttribute('href', href);
    img.setAttribute('x', 0); img.setAttribute('y', 0);
    img.setAttribute('width', W); img.setAttribute('height', base);
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    img.setAttribute('clip-path', 'url(#' + cid + ')');
    img.setAttribute('filter', 'url(#f-' + cid + ')');
    img.setAttribute('opacity', o.opacity != null ? o.opacity : 0.62);
    svg.appendChild(img);

    /* contorno por cima do recorte, para a foto virar relevo */
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'contour');
    svg.appendChild(g);
    contour(g, {W: W, base: base, peakH: peakH, levels: o.levels || 16,
               ribStep: o.ribStep || 22, stagger: o.stagger || 22, sea: false});
    return { terrain, W, base };
  }

  /* ---------- gera o contorno no tamanho REAL do contêiner ----------
     Com viewBox fixo e altura fixa, `meet` deixa faixa vazia nas laterais
     e `slice` corta os picos. Aqui o viewBox passa a ser o próprio box em
     pixels, então a arte sempre preenche sem distorcer, em qualquer tela.
     Regenera em resize com debounce (a largura muda a silhueta). */
  function fitContour(svg, opts) {
    opts = opts || {};
    let w = 0, h = 0, t;

    function build() {
      const r = svg.getBoundingClientRect();
      const W = Math.max(320, Math.round(r.width));
      const H = Math.max(120, Math.round(r.height));
      if (W === w && H === h) return;
      w = W; h = H;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('preserveAspectRatio', 'none');
      const waveRoom = opts.waves ? Math.round(H * 0.16) : 6;
      contour(svg, Object.assign({}, opts, {
        W: W,
        base: H - waveRoom,
        peakH: Math.round((H - waveRoom) * (opts.fill || 0.9)),
        // a densidade acompanha a largura para não virar mancha em telas grandes
        ribStep: Math.max(9, Math.round(W / 74)),
        levels: opts.levels || (W < 640 ? 16 : 24),
        waveAmp: Math.round(H * (opts.waveAmpRatio || 0.055)),
        waveGap: Math.round(H * 0.045),
        waveDrop: Math.round(waveRoom * 0.55)
      }));
    }

    build();
    addEventListener('resize', function () { clearTimeout(t); t = setTimeout(build, 180); }, {passive: true});
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    return { rebuild: build };
  }

  /* ---------- dispara o desenho quando o alvo entra em cena ---------- */
  function drawOnEnter(el, cls) {
    if (!('IntersectionObserver' in window)) { el.classList.add(cls || 'drawn'); return; }
    new IntersectionObserver((es, o) => {
      es.forEach(e => { if (e.isIntersecting) { el.classList.add(cls || 'drawn'); o.disconnect(); } });
    }, {threshold: 0.1}).observe(el);
  }

  /* ---------- revelação LIGADA AO PROGRESSO DO SCROLL ----------------------
     Não é "cruzou a linha, anima sozinho": cada elemento recebe --p (0→1)
     conforme sobe pela viewport, e o CSS deriva opacidade e deslocamento
     desse número. Rolar devagar revela devagar; parar no meio deixa o
     elemento no meio. Monotônico — nada se desfaz ao rolar de volta.

     Um listener de scroll, tudo dentro de um rAF, retângulos medidos fora
     do loop (só em resize/load) para não forçar layout a cada quadro. */
  /* Estado de módulo, e não por chamada: o app monta listas em dezenas de
     pontos e chama reveal a cada render. Uma implementação por chamada
     registraria um listener de scroll por chamada — vazamento garantido.
     Aqui há UM listener, UMA lista, e elemento já registrado é ignorado. */
  const revealed = new WeakSet();
  let revItems = null;      // null enquanto não inicializado
  let revVh = 0, revQueued = false;

  function revMeasure() {
    revVh = innerHeight;
    const sy = scrollY;
    for (const it of revItems) {
      const r = it.el.getBoundingClientRect();
      it.top = r.top + sy;
      it.h = r.height;
    }
  }

  function revFrame() {
    revQueued = false;
    const sy = scrollY;
    for (const it of revItems) {
      // começa quando o topo entra pela base da tela; completa depois de
      // subir ~38% da altura da viewport
      const start = it.top - revVh;
      const span = revVh * 0.38 + Math.min(it.h, revVh * 0.30);
      let p = (sy - start) / span;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (p > it.p) {
        it.p = p;
        it.el.style.setProperty('--p', p.toFixed(4));
        if (p >= 1) it.el.classList.add('in');
      }
    }
  }

  function revSchedule() {
    if (!revQueued) { revQueued = true; requestAnimationFrame(revFrame); }
  }

  function reveal(sel) {
    const found = [...document.querySelectorAll(sel || '.rv')].filter(el => !revealed.has(el));
    if (!found.length) return;
    found.forEach(el => revealed.add(el));

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      found.forEach(el => { el.style.setProperty('--p', 1); el.classList.add('in'); });
      return;
    }

    const first = revItems === null;
    if (first) revItems = [];
    for (const el of found) revItems.push({ el: el, top: 0, h: 0, p: 0 });

    revMeasure();
    revFrame();

    if (first) {
      addEventListener('scroll', revSchedule, { passive: true });
      addEventListener('resize', function () {
        revMeasure();
        revItems.forEach(function (i) { i.p = 0; });
        revFrame();
      });
      // fontes e imagens mudam a altura: remede quando assentarem
      if (document.fonts && document.fonts.ready)
        document.fonts.ready.then(function () { revMeasure(); revFrame(); });
      addEventListener('load', function () { revMeasure(); revFrame(); });
    }
  }

  /* Liga a revelação a conteúdo que nasce depois do boot, sem precisar
     chamar reveal em cada um dos pontos de render. Um observer, coalescido
     num rAF para não rodar a cada nó inserido. */
  function autoReveal(root) {
    if (!('MutationObserver' in window)) return;
    let pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; reveal('.rv'); });
    }).observe(root || document.body, { childList: true, subtree: true });
  }

  /* ---------- desenho do contorno ligado ao scroll ----------
     Publica --p no contêiner; cada traço deriva o próprio dashoffset em CSS
     a partir de --p, do seu atraso (--s) e da sua janela (--w). Uma escrita
     de variável por quadro, não uma por traço. */
  function drawOnScroll(container) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.style.setProperty('--p', 1);
      container.classList.add('drawn');
      return;
    }
    let top = 0, h = 0, vh = innerHeight, queued = false, last = -1;
    function measure() {
      vh = innerHeight;
      const r = container.getBoundingClientRect();
      top = r.top + scrollY; h = r.height;
    }
    function frame() {
      queued = false;
      const start = top - vh * 0.92;
      const span = h * 0.60 + vh * 0.34;
      let p = (scrollY - start) / span;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (p > last) {
        last = p;
        container.style.setProperty('--p', p.toFixed(4));
        if (p >= 1) container.classList.add('drawn');
      }
    }
    measure(); frame();
    addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(frame); } }, {passive: true});
    addEventListener('resize', function () { measure(); last = -1; frame(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); last = -1; frame(); });
  }

  /* ---------- números que contam ao entrar ---------- */
  function countUp(sel) {
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.forEach(function (el) {
      const target = parseInt(el.dataset.count, 10);
      if (isNaN(target)) return;
      if (reduce) { el.textContent = target; return; }
      el.textContent = '0';
      new IntersectionObserver(function (es, o) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          o.disconnect();
          const t0 = performance.now(), dur = 850;
          (function step(t) {
            const k = Math.min(1, (t - t0) / dur);
            el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(step);
          })(t0);
        });
      }, {threshold: 0.6}).observe(el);
    });
  }

  /* ---------- parallax leve, também por scroll ---------- */
  function parallax(el, strength) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const s = strength || 0.14;
    let queued = false;
    function frame() {
      queued = false;
      const r = el.parentElement.getBoundingClientRect();
      el.style.transform = 'translate3d(0,' + (-r.top * s).toFixed(1) + 'px,0) scale(1.06)';
    }
    frame();
    addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(frame); } }, {passive: true});
  }

  global.LEPVArt = {contour, fitContour, maskedPhoto, silhouettePath, makeTerrain,
                    drawOnEnter, drawOnScroll, reveal, autoReveal, countUp, parallax};
})(window);
