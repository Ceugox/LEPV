/* Verificação visual do LEPV. Mede, não julga por aparência.
   Uso: node scripts/verify-ui.js [--base=http://127.0.0.1:3000]

   Sai 1 se qualquer checagem falhar. É este script, e não `npm test`,
   que protege a UI — a suíte e2e cobre API e não inspeciona markup. */
const { chromium } = require('playwright');

const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://127.0.0.1:3000').slice(7);
const PAGES = ['/', '/login.html', '/presenca.html'];
const WIDTHS = [390, 1440];

let failures = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    for (const path of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      console.log(`\n[${width}px] ${path}`);

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const heights = [...document.querySelectorAll('a[href],button,input,select,[role=tab]')]
          .map(el => el.getBoundingClientRect())
          .filter(r => r.height > 0 && r.width > 0)
          .map(r => Math.round(r.height));
        const inputs = [...document.querySelectorAll('input,select,textarea')]
          .filter(el => el.type !== 'hidden' && el.getBoundingClientRect().height > 0)
          .map(el => parseFloat(getComputedStyle(el).fontSize));
        const marks = [...document.querySelectorAll('img[src*="logo-mark"]')]
          .map(el => Math.round(el.getBoundingClientRect().height))
          .filter(h => h > 0);
        return {
          overflowX: de.scrollWidth - de.clientWidth,
          minTap: heights.length ? Math.min(...heights) : null,
          minInputFont: inputs.length ? Math.min(...inputs) : null,
          markHeights: marks,
          rvCount: document.querySelectorAll('.rv').length,
          hasArt: typeof window.LEPVArt !== 'undefined'
        };
      });

      check(m.overflowX === 0, 'sem overflow horizontal', `overflowX=${m.overflowX}`);
      if (m.minTap !== null) check(m.minTap >= 44, 'alvo de toque >= 44px', `menor=${m.minTap}`);
      if (m.minInputFont !== null) check(m.minInputFont >= 16, 'input >= 16px', `menor=${m.minInputFont}`);
      for (const h of m.markHeights) check(h >= 40, 'marca >= 40px', `altura=${h}`);

      // a revelação tem de ser progressiva: --p precisa assumir valor intermediário
      if (m.rvCount > 0) {
        const progressive = await page.evaluate(async () => {
          const el = document.querySelector('.rv');
          const seen = new Set();
          for (const y of [0, 120, 260, 480, 900, 1600]) {
            window.scrollTo(0, y);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            seen.add(el.style.getPropertyValue('--p') || '0');
          }
          const vals = [...seen].map(Number).filter(v => v > 0 && v < 1);
          return vals.length > 0 ? 'progressivo' : 'binario';
        });
        check(progressive === 'progressivo', 'revelação ligada ao scroll', progressive);
      }

      // o contorno tem de preencher exatamente o contêiner
      const contour = await page.evaluate(() => {
        const svg = document.querySelector('.contour');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        return { w: Math.round(r.width), h: Math.round(r.height), vb,
                 paths: svg.querySelectorAll('path').length };
      });
      if (contour) {
        check(Math.abs(contour.vb[2] - contour.w) <= 1 && Math.abs(contour.vb[3] - contour.h) <= 1,
              'viewBox == box renderizado',
              `vb=${contour.vb[2]}x${contour.vb[3]} box=${contour.w}x${contour.h}`);
        check(contour.paths > 10, 'contorno gerou traços', `${contour.paths} paths`);
      }

      check(errors.length === 0, 'sem erro de console', errors.slice(0, 2).join(' | ') || 'nenhum');
      await page.close();
    }
    await ctx.close();
  }

  // prefers-reduced-motion: conteúdo inteiro visível, nada em movimento
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  console.log('\n[reduced-motion] /');
  const rm = await page.evaluate(() => {
    const rv = [...document.querySelectorAll('.rv')];
    const hidden = rv.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length;
    const paths = [...document.querySelectorAll('.contour path')];
    const undrawn = paths.filter(p => parseFloat(getComputedStyle(p).strokeDashoffset) > 1).length;
    return { rv: rv.length, hidden, undrawn, total: paths.length };
  });
  if (rm.rv > 0) check(rm.hidden === 0, 'nada escondido sob reduced-motion', `${rm.hidden}/${rm.rv} com opacity<1`);
  if (rm.total > 0) check(rm.undrawn === 0, 'contorno inteiro desenhado', `${rm.undrawn}/${rm.total} pendentes`);
  await ctx.close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'TUDO PASSOU' : failures + ' CHECAGEM(NS) FALHOU(RAM)'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
