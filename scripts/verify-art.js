/* Mede a arte generativa de public/art.js.

   Cobre as três regressões que apareceram na prototipagem:
   - costelas VISÍVEIS (com gradiente em objectBoundingBox elas não pintam,
     porque um traço vertical tem caixa de largura zero)
   - viewBox igual ao box renderizado (meet deixa faixa vazia, slice corta
     os picos)
   - dashoffset reagindo a --p, para o desenho ser parcial no meio do scroll
*/
const { chromium } = require('playwright');
const path = require('path');

const FIXTURE = 'file://' + path.resolve(__dirname, 'fixtures/art-test.html').replace(/\\/g, '/');
const ART = path.resolve(__dirname, '../public/art.js');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto(FIXTURE);
  await page.addScriptTag({ path: ART });
  await page.evaluate(() => {
    window.__r = LEPVArt.fitContour(document.getElementById('box'), { waves: true });
  });
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => {
    const svg = document.getElementById('box');
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const paths = [...svg.querySelectorAll('path')];
    // uma costela é um traço de dois pontos com o mesmo x nas duas pontas
    const ribs = paths.filter(p => {
      const mm = (p.getAttribute('d') || '').match(/^M([\d.]+) [\d.]+ L([\d.]+) /);
      return mm && mm[1] === mm[2];
    });
    const grad = svg.querySelector('linearGradient');
    /* O Chromium NÃO resolve o calc() no computed style quando ele envolve
       var() num atributo de SVG: strokeDashoffset volta como "calc(13px)"
       para pendente e "0%" para pronto. parseFloat("calc(13px)") é NaN, o
       que faria toda comparação virar false e dar falso negativo. */
    const num = s => {
      const m = String(s || '').match(/-?[\d.]+/);
      return m ? parseFloat(m[0]) : NaN;
    };
    const off = () => paths.map(p => num(getComputedStyle(p).strokeDashoffset));
    document.documentElement.style.setProperty('--p', '0');
    const atZero = off();
    document.documentElement.style.setProperty('--p', '0.5');
    const atHalf = off();
    document.documentElement.style.setProperty('--p', '1');
    const atOne = off();
    return {
      box: [Math.round(r.width), Math.round(r.height)], vb,
      total: paths.length, ribs: ribs.length,
      gradientUnits: grad && grad.getAttribute('gradientUnits'),
      allHiddenAtZero: atZero.every(v => v > 1),
      someLeftAtHalf: atHalf.some(v => v > 1),
      someDoneAtHalf: atHalf.some(v => v <= 1),
      allDoneAtOne: atOne.every(v => v <= 1)
    };
  });

  const checks = [
    [m.vb[2] === m.box[0] && m.vb[3] === m.box[1],
      `viewBox ${m.vb[2]}x${m.vb[3]} == box ${m.box[0]}x${m.box[1]}`],
    [m.total > 30, `tracos gerados: ${m.total}`],
    [m.ribs > 10, `costelas presentes: ${m.ribs}`],
    [m.gradientUnits === 'userSpaceOnUse', `gradientUnits=${m.gradientUnits}`],
    [m.allHiddenAtZero, 'em --p=0 nada desenhado'],
    [m.someLeftAtHalf && m.someDoneAtHalf, 'em --p=0.5 desenho PARCIAL'],
    [m.allDoneAtOne, 'em --p=1 tudo desenhado'],
    [errors.length === 0, `sem erro de pagina: ${errors.slice(0, 2).join(' | ') || 'nenhum'}`]
  ];

  let bad = 0;
  for (const [ok, label] of checks) {
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}`);
    if (!ok) bad++;
  }

  // e a densidade tem de acompanhar a largura
  await page.setViewportSize({ width: 420, height: 700 });
  await page.evaluate(() => { document.getElementById('box').style.width = '340px'; });
  await page.waitForTimeout(320);
  const small = await page.evaluate(() => {
    window.__r.rebuild();
    const svg = document.getElementById('box');
    return { paths: svg.querySelectorAll('path').length,
             vb: svg.getAttribute('viewBox') };
  });
  const okDensity = small.paths > 10 && small.paths < m.total;
  console.log(`  ${okDensity ? 'ok   ' : 'FALHA'} densidade acompanha a largura: ${small.paths} tracos em ${small.vb} (era ${m.total})`);
  if (!okDensity) bad++;

  await browser.close();
  console.log(`\n${bad === 0 ? 'ARTE OK' : bad + ' CHECAGEM(NS) FALHOU(RAM)'}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
