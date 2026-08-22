/* A revelacao por scroll tem tres obrigacoes, e cada uma ja falhou:

   1. TODO .rv chega a opacidade 1. A formula do --pi tinha teto abaixo de 1
      para --i >= 4, e linhas do indice ficavam translucidas para sempre.
   2. Nenhum elemento fica sem curso. Quem esta no fim da pagina nao tinha
      scroll restante para completar.
   3. O efeito tem de ser percebido: o elemento nao pode terminar de aparecer
      na borda inferior da tela, onde ninguem olha. Medimos onde ele completa.

   Uso: node scripts/verify-reveal.js [--base=http://127.0.0.1:3000]
*/
const { chromium } = require('playwright');

const BASE = (function () {
  const a = process.argv.find(x => x.startsWith('--base='));
  if (a) return a.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();

let bad = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
  if (!ok) bad++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(900);

  // ---- 1 e 2: percorre a pagina inteira e cobra opacidade cheia ----
  const fim = await page.evaluate(async () => {
    const alt = document.documentElement.scrollHeight;
    for (let y = 0; y <= alt; y += 240) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 45));
    }
    window.scrollTo(0, alt);
    await new Promise(r => setTimeout(r, 350));
    const els = [...document.querySelectorAll('.rv')];
    const presos = els
      .map(e => ({
        i: e.style.getPropertyValue('--i') || '0',
        p: parseFloat(e.style.getPropertyValue('--p') || '0'),
        op: parseFloat(getComputedStyle(e).opacity),
        cls: (e.className || '').toString().replace(/\brv\b|\bin\b/g, '').trim().slice(0, 18)
      }))
      .filter(x => x.op < 0.995);
    return { total: els.length, presos };
  });

  check(fim.presos.length === 0, 'todo .rv chega a opacidade cheia',
        fim.presos.length
          ? fim.presos.map(x => `${x.cls}[--i:${x.i}] op=${x.op.toFixed(2)} p=${x.p.toFixed(2)}`).join(' | ')
          : `${fim.total}/${fim.total}`);

  const semCurso = fim.presos.filter(x => x.p < 0.995);
  check(semCurso.length === 0, 'nenhum elemento fica sem curso de scroll',
        semCurso.length ? semCurso.map(x => `${x.cls} p=${x.p.toFixed(2)}`).join(' | ') : 'nenhum');

  // ---- 3: onde o elemento termina de aparecer? ----
  // Percorre em passos finos e registra, para cada .rv, a posicao na tela no
  // instante em que a opacidade passa de 0.98. Terminar abaixo de 70% da
  // altura da tela significa completar na borda inferior — invisivel.
  /* RECARREGA antes de medir: a revelacao e monotonica de proposito, e o
     teste 1 acabou de percorrer a pagina inteira. Sem recarregar, tudo ja
     esta em opacidade 1 no primeiro passo e a medicao vira lixo — foi o que
     me deu "mediana em 100%" mesmo depois de corrigir o curso. */
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const ondeCompleta = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
    const els = [...document.querySelectorAll('.rv')];
    const feito = new Map();
    const alt = document.documentElement.scrollHeight;
    for (let y = 0; y <= alt; y += 60) {
      window.scrollTo(0, y);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      els.forEach((el, idx) => {
        if (feito.has(idx)) return;
        if (parseFloat(getComputedStyle(el).opacity) >= 0.98) {
          const r = el.getBoundingClientRect();
          // fracao da altura da tela onde o topo do elemento estava
          feito.set(idx, r.top / innerHeight);
        }
      });
    }
    const vals = [...feito.values()].filter(v => v > -0.5 && v < 1.5);
    vals.sort((a, b) => a - b);
    return {
      medidos: vals.length,
      mediana: vals.length ? vals[Math.floor(vals.length / 2)] : null,
      naBorda: vals.filter(v => v > 0.7).length
    };
  });

  if (ondeCompleta.mediana !== null) {
    const pct = (ondeCompleta.mediana * 100).toFixed(0);
    check(ondeCompleta.mediana <= 0.68,
          'completa dentro do campo de atencao',
          `mediana em ${pct}% da altura da tela (${ondeCompleta.naBorda} na borda inferior)`);
  }

  await browser.close();
  console.log(`\n${bad === 0 ? 'REVELACAO OK' : bad + ' PROBLEMA(S) NA REVELACAO'}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
