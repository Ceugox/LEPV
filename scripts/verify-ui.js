/* Verificação visual do LEPV. Mede, não julga por aparência.
   Uso: node scripts/verify-ui.js [--base=http://127.0.0.1:3000]

   Sai 1 se qualquer checagem falhar. É este script, e não `npm test`,
   que protege a UI — a suíte e2e cobre API e não inspeciona markup. */
const { chromium } = require('playwright');

/* Base: --base= vence, depois LEPV_BASE, depois PORT, depois 3000.
   Sem isso `npm run verify` so funciona se o server estiver na 3000. */
const BASE = (function () {
  const arg = process.argv.find(a => a.startsWith('--base='));
  if (arg) return arg.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();
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
        const visible = el => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.height > 0 && r.width > 0 && parseFloat(cs.opacity) > 0.05 &&
                 cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        /* Dois critérios, porque WCAG trata os casos de forma diferente:
           - CONTROLES (botão, aba, campo, CTA) → 44px, o alvo confortável
           - LINK de navegação ou de texto → 24px, o mínimo do 2.5.8 AA */
        const CONTROL = 'button,[role=tab],input,select,textarea,.btn,.btn-p,.btn-g,' +
                        '.btn-primary,.btn-ghost,.nav-cta,.burger';
        const controls = [...document.querySelectorAll(CONTROL)]
          .filter(el => el.type !== 'hidden' && visible(el))
          .map(el => ({ h: Math.round(el.getBoundingClientRect().height),
                        id: el.tagName + '.' + (el.className || '').toString().slice(0, 20) }));
        const links = [...document.querySelectorAll('a[href]')]
          .filter(el => visible(el) && !el.matches(CONTROL))
          .map(el => ({ h: Math.round(el.getBoundingClientRect().height),
                        id: (el.textContent || '').trim().slice(0, 20) }));
        /* font-size não depende de visibilidade, e formulário que só abre por
           interação nasce colapsado — medir só o visível deixaria passar um
           campo em 14px que causa zoom no Safari iOS assim que aparecesse. */
        /* Só campos de TEXTO: o zoom automático do Safari iOS dispara ao focar
           entrada editável, nao em checkbox/radio/botao — cobrar 16px deles
           reprovaria markup correto. */
        const NO_ZOOM = ['checkbox', 'radio', 'submit', 'button', 'reset',
                         'file', 'color', 'range', 'image', 'hidden'];
        const inputs = [...document.querySelectorAll('input,select,textarea')]
          .filter(el => NO_ZOOM.indexOf(el.type) === -1)
          .map(el => parseFloat(getComputedStyle(el).fontSize));
        // marca escondida (a do nav antes de rolar) não conta
        const marks = [...document.querySelectorAll('img[src*="logo-mark"]')]
          .filter(visible)
          .map(el => Math.round(parseFloat(getComputedStyle(el).height)));
        return {
          overflowX: de.scrollWidth - de.clientWidth,
          worstControl: controls.sort((a, b) => a.h - b.h)[0] || null,
          worstLink: links.sort((a, b) => a.h - b.h)[0] || null,
          minInputFont: inputs.length ? Math.min(...inputs) : null,
          markHeights: marks,
          rvCount: document.querySelectorAll('.rv').length
        };
      });

      check(m.overflowX === 0, 'sem overflow horizontal', `overflowX=${m.overflowX}`);
      if (m.worstControl)
        check(m.worstControl.h >= 44, 'controle >= 44px', `menor=${m.worstControl.h} (${m.worstControl.id})`);
      if (m.worstLink)
        check(m.worstLink.h >= 24, 'link >= 24px', `menor=${m.worstLink.h} ("${m.worstLink.id}")`);
      if (m.minInputFont !== null) check(m.minInputFont >= 16, 'input >= 16px', `menor=${m.minInputFont}`);
      for (const h of m.markHeights) check(h >= 40, 'marca visível >= 40px', `altura=${h}`);

      /* A revelação tem de ser progressiva. Precisa olhar TODOS os .rv: o
         primeiro costuma estar acima da dobra e nasce completo, então medir
         só ele daria falso negativo. */
      if (m.rvCount > 0) {
        const prog = await page.evaluate(async () => {
          const els = [...document.querySelectorAll('.rv')];
          const mid = new Set();
          for (const y of [0, 100, 250, 450, 700, 1100, 1600, 2200]) {
            window.scrollTo(0, y);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            els.forEach((el, i) => {
              const v = parseFloat(el.style.getPropertyValue('--p') || '0');
              if (v > 0.01 && v < 0.99) mid.add(i);
            });
          }
          const hidden = els.filter(el =>
            parseFloat(getComputedStyle(el).opacity) < 0.99).length;
          return {
            total: els.length, partial: mid.size, hidden,
            // rola de verdade? sem folga, nada atravessa a viewport
            rolla: document.documentElement.scrollHeight > innerHeight * 1.4
          };
        });
        if (prog.rolla) {
          check(prog.partial > 0, 'revelação ligada ao scroll',
                `${prog.partial}/${prog.total} passaram por estado parcial`);
        } else {
          /* Página que cabe numa tela não tem curso para o elemento
             atravessar: o correto ali é nascer revelado, e cobrar estado
             parcial reprovaria markup certo. O que importa é não sobrar
             nada invisível. */
          check(prog.hidden === 0, 'página curta: nada fica invisível',
                `${prog.hidden}/${prog.total} com opacity<1`);
        }
      }

      // o contorno tem de preencher exatamente o contêiner
      const contour = await page.evaluate(() => {
        const svg = document.querySelector('.contour');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        const paths = [...svg.querySelectorAll('path')];
        // todo traço precisa das variáveis que o CSS usa para o dashoffset
        const armed = paths.filter(p => p.style.getPropertyValue('--len') &&
                                        p.style.getPropertyValue('--s') !== '').length;
        return { w: Math.round(r.width), h: Math.round(r.height), vb,
                 paths: paths.length, armed };
      });
      if (contour) {
        check(Math.abs(contour.vb[2] - contour.w) <= 1 && Math.abs(contour.vb[3] - contour.h) <= 1,
              'viewBox == box renderizado',
              `vb=${contour.vb[2]}x${contour.vb[3]} box=${contour.w}x${contour.h}`);
        /* Sem limiar de quantidade: a página escolhe quanto desenhar (o topo
           usa levels:0, só as duas ondas, porque a montanha real já está na
           fotografia). O que importa aqui é que a arte renderizou e que todo
           traço saiu preparado para o desenho por scroll. A malha completa é
           coberta por verify-art.js, no fixture. */
        check(contour.paths > 0 && contour.armed === contour.paths,
              'traços prontos para desenhar', `${contour.armed}/${contour.paths}`);
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
    /* NÃO usar parseFloat aqui: o Chromium devolve "calc(13px)" para traço
       pendente quando o valor envolve var() em SVG, e parseFloat disso é
       NaN — NaN > 1 é false, então a checagem passaria sempre sem verificar
       nada. Extrair o número da string é o único jeito honesto. */
    const num = s => {
      const m = String(s || '').match(/-?[\d.]+/);
      return m ? parseFloat(m[0]) : NaN;
    };
    const rv = [...document.querySelectorAll('.rv')];
    const hidden = rv.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length;
    const paths = [...document.querySelectorAll('.contour path')];
    const offs = paths.map(p => num(getComputedStyle(p).strokeDashoffset));
    const undrawn = offs.filter(v => !(v <= 1)).length;   // NaN também reprova
    return { rv: rv.length, hidden, undrawn, total: paths.length };
  });
  if (rm.rv > 0) check(rm.hidden === 0, 'nada escondido sob reduced-motion', `${rm.hidden}/${rm.rv} com opacity<1`);
  if (rm.total > 0) check(rm.undrawn === 0, 'contorno inteiro desenhado', `${rm.undrawn}/${rm.total} pendentes`);
  await ctx.close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'TUDO PASSOU' : failures + ' CHECAGEM(NS) FALHOU(RAM)'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
