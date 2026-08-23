/* Consistência entre as superfícies do LEPV.

   A queixa que originou este script: "as páginas internas não conversam com a
   landing". Cor e fonte estavam certas; a GRAMÁTICA não. Aqui as regras que
   valem para todas as páginas são medidas no browser, não conferidas no CSS —
   herança faz uma regra sem `font-family` receber a serif e escapar de
   qualquer grep.

   Uso: node scripts/verify-consistency.js [--base=http://127.0.0.1:3000]
        LEPV_INSCRICAO_TOKEN=<token> inclui a página de inscrição
*/
const { chromium } = require('playwright');

const BASE = (function () {
  const a = process.argv.find(x => x.startsWith('--base='));
  if (a) return a.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();

const LOGIN_ORDER = process.env.LEPV_TEST_ORDER || '2';
const LOGIN_PASS = process.env.LEPV_TEST_PASS || '2';

let bad = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
  if (!ok) bad++;
}

/* Roda dentro da página. Devolve os achados, não um veredito. */
function audit() {
  const out = { serifUpper: [], fonts: new Set(), tokens: {}, grammar: {} };

  const isSerif = cs => /Instrument Serif/i.test(cs.fontFamily);
  const label = el => {
    const cls = (el.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
           ' "' + (el.textContent || '').trim().slice(0, 22) + '"';
  };

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    // serif em caixa alta fica torta — vale para qualquer página
    if (isSerif(cs) && cs.textTransform === 'uppercase' && (el.textContent || '').trim()) {
      out.serifUpper.push(label(el));
    }
    /* Família só conta onde há glifo. Um <input type=checkbox> herda a
       família do sistema (Arial no Windows) e não pinta letra nenhuma —
       cobrar dele acusaria inconsistência inexistente. */
    const proprio = [...el.childNodes]
      .some(n => n.nodeType === 3 && n.textContent.trim());
    if (proprio) {
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (fam) out.fonts.add(fam);
    }
  }

  const root = getComputedStyle(document.documentElement);
  for (const t of ['--wine', '--ink', '--paper', '--band', '--fd', '--f']) {
    out.tokens[t] = root.getPropertyValue(t).trim();
  }

  out.grammar = {
    // a marca aparece em algum lugar da página?
    marca: document.querySelectorAll('img[src*="logo-mark"]').length,
    // o fundo é papel? (o preto era a quebra que o Marcell apontou)
    bodyBg: getComputedStyle(document.body).backgroundColor,
    filete: document.querySelectorAll('.rule2').length,
    selo: document.querySelectorAll('.stamp').length
  };

  out.fonts = [...out.fonts];
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  const pages = [['/', 'landing'], ['/login.html', 'login'], ['/presenca.html', 'presenca']];
  if (process.env.LEPV_INSCRICAO_TOKEN) {
    pages.push(['/inscricao.html?t=' + process.env.LEPV_INSCRICAO_TOKEN, 'inscricao']);
  }
  // Mesmo opt-in por token da inscrição: a página de detalhes do evento também
  // só existe com um evento publicado. Ela nasceu no tema navy antigo e foi
  // trazida para a gramática de documento — sem passar por aqui, a única
  // verificação dela seria olhar.
  if (process.env.LEPV_EVENTO_TOKEN) {
    pages.push(['/evento.html?t=' + process.env.LEPV_EVENTO_TOKEN, 'evento']);
  }

  const seen = {};
  for (const [path, name] of pages) {
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    seen[name] = await page.evaluate(audit);
    await page.close();
  }

  // o app exige sessão
  const app = await ctx.newPage();
  await app.goto(BASE + '/login.html');
  const logged = await app.evaluate(async ({ o, p }) => {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: Number(o), password: p })
    });
    return r.status;
  }, { o: LOGIN_ORDER, p: LOGIN_PASS });
  if (logged === 200) {
    await app.goto(BASE + '/app.html', { waitUntil: 'load' });
    await app.waitForTimeout(1300);
    await app.evaluate(() => { const m = document.querySelector('.pin-backdrop'); if (m) m.remove(); });
    seen.app = await app.evaluate(audit);
  } else {
    console.log(`  aviso: login devolveu ${logged}; app nao auditado`);
  }
  await app.close();

  // ---------- 1. serif nunca em caixa alta ----------
  console.log('\n[serif em caixa alta]');
  for (const [name, d] of Object.entries(seen)) {
    check(d.serifUpper.length === 0, name,
          d.serifUpper.length ? d.serifUpper.slice(0, 3).join(' | ') : 'nenhum');
  }

  // ---------- 2. mesma dupla de famílias em todas ----------
  console.log('\n[famílias tipográficas]');
  for (const [name, d] of Object.entries(seen)) {
    const extras = d.fonts.filter(f =>
      !/Instrument Serif|Archivo|system-ui|-apple-system|monospace|Georgia|sans-serif|serif/i.test(f));
    check(extras.length === 0, name, extras.length ? 'fora do sistema: ' + extras.join(', ') : d.fonts.length + ' famílias, todas do sistema');
  }

  // ---------- 3. mesmos tokens resolvidos ----------
  console.log('\n[tokens da marca]');
  const ref = seen.landing.tokens;
  for (const [name, d] of Object.entries(seen)) {
    const diff = Object.keys(ref).filter(k => d.tokens[k] !== ref[k]);
    check(diff.length === 0, name,
          diff.length ? diff.map(k => `${k}=${d.tokens[k]}`).join(' ') : 'idênticos à landing');
  }

  // ---------- 4. gramática presente ----------
  console.log('\n[gramática de documento]');
  for (const [name, d] of Object.entries(seen)) {
    check(d.grammar.marca > 0, name + ': marca presente', String(d.grammar.marca));
  }
  // fundo papel nas superfícies públicas (era preto e quebrava a continuidade)
  for (const name of ['landing', 'login', 'presenca', 'inscricao', 'evento']) {
    if (!seen[name]) continue;
    const bg = seen[name].grammar.bodyBg;
    const claro = /^rgb\((2[0-9]{2}|1[89][0-9])/.test(bg);
    check(claro, name + ': fundo em papel claro', bg);
  }

  await browser.close();
  console.log(`\n${bad === 0 ? 'CONSISTENCIA OK' : bad + ' INCONSISTENCIA(S)'}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
