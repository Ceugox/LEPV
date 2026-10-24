/* Verificação visual da plataforma do hackathon (/hack). Mede, não julga.
   Uso: node scripts/verify-hack.js [--base=http://127.0.0.1:3000] [--shots=<dir>]

   Para cada página pública em desktop, celular e movimento reduzido:
   rolagem horizontal, erro de console, imagem quebrada, h1 único, alvos de
   toque e texto mínimo. --shots grava screenshots para revisão a olho. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const BASE = arg('base') || process.env.LEPV_BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const SHOTS = arg('shots');

const PAGES = ['/hack/', '/hack/?inscricoes=encerradas', '/hack/acesso', '/hack/parceiros'];
const MODES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' },
  { name: 'mobile', viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' },
  { name: 'reduced', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
];

let failures = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  for (const mode of MODES) {
    const ctx = await browser.newContext({ viewport: mode.viewport, reducedMotion: mode.reducedMotion });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const res = await page.goto(BASE + p, { waitUntil: 'load' });
      // Rola até o fim para carregar as imagens lazy e disparar as revelações.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
      console.log(`\n[${mode.name}] ${p}`);
      check(res && res.status() === 200, 'HTTP 200', res && res.status());
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const imgs = [...document.images];
        return {
          overflowX: de.scrollWidth - de.clientWidth,
          broken: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
          h1: document.querySelectorAll('h1').length,
          minFont: Math.min(...[...document.querySelectorAll('p,li,dd,dt,a,button,summary,label,span')]
            .filter(el => el.getBoundingClientRect().height > 0 && el.textContent.trim())
            .map(el => parseFloat(getComputedStyle(el).fontSize))),
          notice: (() => { const n = document.getElementById('aviso-inscricao'); return n ? !n.hidden : null; })(),
        };
      });
      check(m.overflowX <= 0, 'sem rolagem horizontal', m.overflowX + 'px');
      check(errors.length === 0, 'console sem erro', errors.join(' | ') || undefined);
      check(m.broken.length === 0, 'imagens carregam', m.broken.join(', ') || undefined);
      check(m.h1 === 1, 'um h1', m.h1);
      check(m.minFont >= 11, 'texto ≥ 11px', m.minFont + 'px');
      if (p.includes('inscricoes=encerradas')) check(m.notice === true, 'aviso de inscrições encerradas aparece');
      else if (m.notice !== null) check(m.notice === false, 'aviso de inscrições encerradas escondido');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hack-${mode.name}-${p.replace(/\W+/g, '_')}.png`) });
      await page.close();
    }
    await ctx.close();
  }
  // Countdown depois do início: os números somem e a frase de início aparece.
  // Relógio simulado do Playwright, em UTC (15h de Brasília = 18h UTC).
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-10-30T18:00:05Z') });
    await page.goto(BASE + '/hack/', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => {
      const el = document.querySelector('.hero [data-count]');
      return { digits: el.querySelector('.count__d').offsetParent !== null, done: el.querySelector('.count__done').offsetParent !== null };
    });
    console.log('\n[relógio 30/10 15h00min05s BRT] countdown');
    check(!c.digits && c.done, 'countdown troca para "O hackathon começou"', JSON.stringify(c));
    await ctx.close();
  }

  // Rotas: /hack sem barra preserva a query; /hack/inscricao sempre redireciona.
  {
    console.log('\n[rotas]');
    const r1 = await fetch(BASE + '/hack?utm=a?b', { redirect: 'manual' });
    check(r1.status === 301 && r1.headers.get('location') === '/hack/?utm=a?b', '/hack → /hack/ com query', r1.status + ' ' + r1.headers.get('location'));
    const r2 = await fetch(BASE + '/hack/inscricao', { redirect: 'manual' });
    const loc = r2.headers.get('location') || '';
    check(r2.status === 302 && (loc.startsWith('/inscricao.html?t=') || loc === '/hack/?inscricoes=encerradas'), '/hack/inscricao redireciona', r2.status + ' ' + loc);
  }

  await browser.close();
  console.log(failures ? `\n${failures} falha(s)` : '\nHACK OK');
  // exitCode, não process.exit: no Windows, sair à força com o fetch ainda
  // fechando o socket derruba o Node numa assertion do libuv (exit 127).
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
