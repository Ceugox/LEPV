const { chromium } = require('playwright');
const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://127.0.0.1:3000').slice(7);
/* O app exige sessao, entao a medicao dele nao cabe em verify-ui.js.
   Loga via fetch no contexto da pagina e remove .pin-backdrop antes de
   medir — o modal de PIN intercepta cliques. A senha inicial dos
   fundadores e o numero de inscricao (vale so no volume de teste). */
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(BASE + '/login.html', { waitUntil: 'load' });
  // a senha inicial dos fundadores e o numero de inscricao (volume de teste)
  const login = await p.evaluate(async () => {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: 2, password: '2' })
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('login:', login.status, login.body.slice(0, 120));
  if (login.status !== 200) { await b.close(); process.exit(2); }

  await p.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  // o modal de PIN intercepta cliques
  await p.evaluate(() => { const m = document.querySelector('.pin-backdrop'); if (m) m.remove(); });

  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const tabs = [...document.querySelectorAll('nav.tabs button')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .map(e => Math.round(e.getBoundingClientRect().height));
    const chips = [...document.querySelectorAll('.type-chip,.lfilter,.company-chip,.daypicker button')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .map(e => ({ c: e.className.slice(0, 18), h: Math.round(e.getBoundingClientRect().height) }));
    const cs = getComputedStyle(de);
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      minTab: tabs.length ? Math.min(...tabs) : null,
      chipsBelow44: chips.filter(c => c.h < 44),
      rv: document.querySelectorAll('.rv').length,
      hasArt: typeof window.LEPVArt !== 'undefined',
      wine: cs.getPropertyValue('--wine').trim(),
      displayFont: getComputedStyle(document.querySelector('h1,h2,h3') || de).fontFamily
    };
  });
  let bad = 0;
  const check = (ok, label, detail) => {
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
    if (!ok) bad++;
  };
  check(r.overflowX === 0, 'sem overflow horizontal', `overflowX=${r.overflowX}`);
  check(r.minTab >= 44, 'aba >= 44px', `menor=${r.minTab}`);
  check(r.chipsBelow44.length === 0, 'chips >= 44px',
        r.chipsBelow44.map(c => c.c + '=' + c.h).join(', ') || 'todos ok');
  check(r.hasArt, 'art.js carregado');
  check(r.rv > 0, 'listas revelam por scroll', `${r.rv} elementos .rv`);
  check(r.wine === '#7F0A1A', 'token da marca', r.wine);
  check(/Instrument Serif/.test(r.displayFont), 'display serifado', r.displayFont);
  check(errs.length === 0, 'sem erro de console', errs.slice(0, 2).join(' | ') || 'nenhum');
  await b.close();
  console.log(`
${bad === 0 ? 'APP OK' : bad + ' CHECAGEM(NS) FALHOU(RAM)'}`);
  process.exit(bad ? 1 : 0);
})();
