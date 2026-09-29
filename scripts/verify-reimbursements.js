const { chromium } = require('playwright');
/* Base: --base= vence, depois LEPV_BASE, depois PORT, depois 3000. */
const BASE = (function () {
  const arg = process.argv.find(a => a.startsWith('--base='));
  if (arg) return arg.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();
// Mesmo admin que ci-fixtures.js semeia no volume descartável.
const ADMIN_PASS = process.env.LEPV_CI_ADMIN_PASS || 'ci-admin';
/* Aba Gastos (centro de gastos, módulo ES /js/features/reimbursements.js):
   todo membro vê a aba, o formulário abre em 390px com a caixa "a diretoria
   já pagou" e as duas vias de anexo (câmera e arquivo), alvos de toque >=
   44px, lançamento de fixture entra e sai, e o diretor enxerga o consolidado
   com filtros e ações de decisão — incluindo a recusa com motivo inline. */
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  const check = (ok, label, detail) => {
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
    if (!ok) bad++;
  };

  // O modal de PIN (bóton) nasce depois do load e intercepta cliques; limpa
  // antes de cada clique, como verify-board faz.
  const clearPin = (page) => page.evaluate(() => document.querySelectorAll(".pin-backdrop").forEach(m => m.remove()));
  const click = async (page, sel) => { await clearPin(page); const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };

  // ---- membro comum: aba existe, formulário mobile ----
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  // Fonte externa bloqueada na rede de quem roda não é erro da aplicação.
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)\.com/.test(m.text())) errs.push(m.text()); });

  await p.goto(BASE + '/login.html', { waitUntil: 'load' });
  const login = await p.evaluate(async () => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 2, password: '2' }) })).status);
  if (login !== 200) { console.log('login do membro falhou:', login); await b.close(); process.exit(2); }
  // Responde a enquete do bóton antes de abrir o app (mesmo motivo do board).
  await p.evaluate(async () => { try { await fetch('/api/pin-poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ want: false }) }); } catch (e) {} });
  await p.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  check(await p.$('#tab-gastos') !== null, 'membro vê a aba Gastos');
  await click(p, '#tab-gastos');
  await p.waitForSelector('#expenses-root .gx-summary', { timeout: 5000 }).catch(() => {});
  check(await p.$('#expenses-root .gx-summary') !== null, 'resumo de totais renderiza');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow === 0, 'sem overflow horizontal', overflow);
  await click(p, '.gx-toolbar [data-act="toggle-form"]');
  check(await p.$('#gx-form') !== null, 'formulário abre');
  check(await p.$('#gx-paid') !== null, 'checkbox "a diretoria já pagou" existe');
  check(await p.$('#gx-camera[capture]') !== null, 'input de câmera (capture) existe');
  check(await p.$('#gx-files[accept*="application/pdf"]') !== null, 'input de arquivo com PDF existe');
  const formBtns = await p.evaluate(() =>
    [...document.querySelectorAll('.gx-form button, .gx-toolbar button')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .map(e => Math.round(e.getBoundingClientRect().height)));
  check(formBtns.length > 0 && formBtns.every(h => h >= 44), 'alvos de toque >= 44px', JSON.stringify(formBtns));

  // fixture via API: lançamento do membro aparece no extrato dele
  const fixture = await p.evaluate(async () => {
    const r = await fetch('/api/reimbursements', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Gasto de verificação', amountCents: 1234, spentAt: new Date().toISOString().slice(0, 10) }) });
    return { status: r.status, id: r.ok ? (await r.json()).expense.id : null };
  });
  check(fixture.status === 200, 'gasto de fixture criado', fixture.status);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('lepv:reimbursements:load')));
  await p.waitForTimeout(700);
  const card = await p.evaluate(async (id) => {
    const el = document.querySelector('.gx-card[data-id="' + id + '"]');
    if (!el) return null;
    const h = el.getBoundingClientRect();
    const btns = [...el.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height));
    return { inView: h.width > 0, minBtn: btns.length ? Math.min(...btns) : 999 };
  }, fixture.id);
  check(card !== null, 'lançamento aparece no extrato');
  if (card) check(card.minBtn >= 44, 'botões do cartão >= 44px', card.minBtn);

  check(errs.length === 0, 'sem erro de console/JS (membro)', errs.slice(0, 3).join(' | '));
  await ctx.close();

  // ---- diretor: consolidado, filtros e decisão ----
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e.message)));
  p2.on('console', m => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)\.com/.test(m.text())) errs2.push(m.text()); });
  await p2.goto(BASE + '/login.html', { waitUntil: 'load' });
  const l2 = await p2.evaluate(async (pass) => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 1, password: pass }) })).status, ADMIN_PASS);
  if (l2 !== 200) { console.log('login do diretor falhou:', l2); await b.close(); process.exit(2); }
  await p2.evaluate(async () => { try { await fetch('/api/pin-poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ want: false }) }); } catch (e) {} });
  await p2.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p2.waitForTimeout(1200);
  await click(p2, '#tab-gastos');
  await p2.waitForSelector('#expenses-root .gx-filters', { timeout: 5000 }).catch(() => {});
  check(await p2.$('#expenses-root .gx-filters') !== null, 'diretor vê filtros do consolidado');
  check(await p2.$('#gx-member') !== null, 'diretor vê filtro por membro');

  // Recusa sem motivo não sai: o campo inline aparece e o gasto fica pendente.
  const dCard = '.gx-card[data-id="' + fixture.id + '"]';
  await click(p2, dCard + ' [data-act="recusado"]');
  check(await p2.$(dCard + ' .gx-reject input') !== null, 'recusa abre campo de motivo');
  await click(p2, dCard + ' [data-act="confirm-recusado"]');
  await p2.waitForTimeout(400);
  check(await p2.$(dCard + ' .gx-badge.pendente') !== null, 'recusa vazia não decide — continua pendente');
  await p2.fill(dCard + ' .gx-reject input', 'falta a nota fiscal');
  await click(p2, dCard + ' [data-act="confirm-recusado"]');
  await p2.waitForSelector(dCard + ' .gx-badge.recusado', { timeout: 4000 }).catch(() => {});
  check(await p2.$(dCard + ' .gx-badge.recusado') !== null, 'recusa com motivo vira "Recusado"');

  // limpeza do fixture: decidido é território da diretoria — quem apaga é ela.
  if (fixture.id) {
    const del = await p2.evaluate(async (id) => (await fetch('/api/reimbursements/' + id, { method: 'DELETE' })).status, fixture.id);
    check(del === 200, 'fixture apagado pela diretoria', del);
  }
  check(errs2.length === 0, 'sem erro de console/JS (diretor)', errs2.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\n${bad} falha(s)` : '\nverify-reimbursements OK');
  process.exit(bad ? 1 : 0);
})();
