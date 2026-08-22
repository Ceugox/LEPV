/* Troca de abas nao pode deixar conteudo invisivel.

   O modo de falha e especifico: um .rv dentro de painel oculto tem rect
   zerado quando reveal() mede, e se o calculo de progresso resultasse em 0
   ele ficaria com opacity 0 para sempre — o painel abriria vazio. Este
   teste percorre as abas e reprova se algum .rv tiver altura no layout mas
   opacidade zerada.

   Uso: node scripts/verify-tabs.js [--base=http://127.0.0.1:3000]
*/
const { chromium } = require('playwright');
const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://127.0.0.1:3000').slice(7);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  await p.goto(BASE + '/login.html');
  await p.evaluate(() => fetch('/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: 2, password: '2' }) }));
  await p.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const m = document.querySelector('.pin-backdrop'); if (m) m.remove(); });

  let bad = 0;
  for (const tab of ['inicio', 'eventos', 'membros', 'inicio']) {
    await p.evaluate(t => {
      const btn = document.querySelector('[data-tab="' + t + '"]');
      if (btn) btn.click();
    }, tab);
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const panel = document.querySelector('.panel.active');
      if (!panel) return { panel: null };
      const rv = [...panel.querySelectorAll('.rv')];
      const invisible = rv.filter(el => {
        const cs = getComputedStyle(el);
        const rc = el.getBoundingClientRect();
        // visível no layout mas com opacidade zerada = conteúdo perdido
        return rc.height > 0 && parseFloat(cs.opacity) < 0.02;
      });
      return { panel: panel.id, rv: rv.length, invisible: invisible.length,
               sample: invisible.slice(0, 2).map(e => e.className.slice(0, 30)) };
    });
    const ok = r.invisible === 0;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} aba ${tab} → ${r.panel}: ${r.rv} .rv, ${r.invisible} invisível(is) ${r.sample && r.sample.length ? JSON.stringify(r.sample) : ''}`);
  }
  console.log('  erros de página:', errs.length === 0 ? 'nenhum' : errs.slice(0, 2));
  await b.close();
  console.log(bad === 0 ? '\nTROCA DE ABAS OK' : `\n${bad} aba(s) com conteudo invisivel`);
  process.exit(bad ? 1 : 0);
})();
