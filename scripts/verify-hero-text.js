/* Legibilidade do texto sobre a fotografia do topo.

   Nao confia em aparencia: esconde o texto, fotografa o fundo REAL e amostra
   o pixel MAIS ESCURO atras de cada bloco, em varias posicoes de scroll —
   o enquadramento desce conforme se rola, entao o fundo muda embaixo do
   texto e o pior caso pode nao estar no topo da pagina.

   Uso: node scripts/verify-hero-text.js [--base=http://127.0.0.1:3000]
*/
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = (function () {
  const a = process.argv.find(x => x.startsWith('--base='));
  if (a) return a.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// texto grande (>=24px ou >=19px bold) exige 3.0; o resto, 4.5
const TARGETS = [
  ['frase de impacto', '.impact', 3.0],
  ['nome no selo', '.stamp b', 3.0],
  ['botao secundario', '.hero-in .btn-g', 4.5]
];

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const [W, H, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    console.log(`\n[${label}]`);
    for (const scrollY of [0, 260, 520]) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page.waitForTimeout(700);
      await page.evaluate(y => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(320);

      const boxes = await page.evaluate(sels => {
        const out = [];
        for (const [name, sel] of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
          out.push({ name, x: Math.round(r.x), y: Math.round(r.y),
                     w: Math.round(r.width), h: Math.round(r.height),
                     color: getComputedStyle(el).color });
        }
        /* opacity e NAO visibility: os blocos usam .rv, que declara
           will-change:opacity,transform. Com a camada composta promovida, o
           visibility:hidden do pai nao chegava ao botao e a amostragem lia o
           texto do PROPRIO botao como se fosse fundo — 2.15 de contraste
           falso. opacity no ancestral zera a subarvore inteira e nao muda o
           layout, entao as coordenadas medidas antes seguem valendo. */
        document.querySelectorAll('.hero-in').forEach(e => e.style.opacity = '0');
        return out;
      }, TARGETS.map(t => [t[0], t[1]]));

      if (!boxes.length) { await page.close(); continue; }
      await page.waitForTimeout(120);
      const tmp = path.join(os.tmpdir(), `lepv-hero-${label}-${scrollY}.png`);
      await page.screenshot({ path: tmp });
      await page.close();

      const b64 = fs.readFileSync(tmp).toString('base64');
      const reader = await browser.newPage();
      const samples = await reader.evaluate(async ({ b64, boxes }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return boxes.map(bx => {
          let worst = null, worstL = 2;
          for (let i = 1; i <= 6; i++) for (let j = 1; j <= 4; j++) {
            const x = Math.round(bx.x + (bx.w * i) / 7);
            const y = Math.round(bx.y + (bx.h * j) / 5);
            if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
            const d = ctx.getImageData(x, y, 1, 1).data;
            const L = (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
            if (L < worstL) { worstL = L; worst = [d[0], d[1], d[2]]; }
          }
          return { name: bx.name, color: bx.color, bg: worst };
        });
      }, { b64, boxes });
      await reader.close();
      fs.unlinkSync(tmp);

      for (const s of samples) {
        if (!s.bg) continue;
        const fg = s.color.match(/\d+/g).slice(0, 3).map(Number);
        const need = (TARGETS.find(t => t[0] === s.name) || [, , 4.5])[2];
        const r = ratio(fg, s.bg);
        const ok = r >= need;
        if (!ok) bad++;
        console.log(`  ${ok ? 'ok   ' : 'FALHA'} y=${scrollY} ${s.name}: ${r.toFixed(2)} (min ${need}) sobre rgb(${s.bg})`);
      }
    }
  }
  await browser.close();
  console.log(`\n${bad === 0 ? 'TEXTO DO TOPO OK' : bad + ' MEDICAO(OES) ABAIXO DO MINIMO'}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
