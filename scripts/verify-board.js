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
/* Aba Diretoria (agenda de encontros, módulo ES em /js/features/board.js):
   existe só para diretor, o módulo carrega sem erro de console, o quadro tem
   as quatro colunas na ordem do ciclo, todo botão de cartão e da barra tem
   >= 44px em 390px, a visão Calendário alterna e volta, e não há overflow
   horizontal. Cria um encontro de fixture antes, porque um quadro vazio não
   tem botão para medir. Depois, logado como membro comum, a aba não existe. */
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  const check = (ok, label, detail) => {
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
    if (!ok) bad++;
  };

  // O modal de PIN (bóton) nasce depois do load e intercepta cliques; limpa
  // antes de cada clique, como verify-app faz uma vez.
  const clearPin = (page) => page.evaluate(() => document.querySelectorAll(".pin-backdrop").forEach(m => m.remove()));
  // Clique disparado no DOM: a enquete do bóton reaparece a cada troca de aba
  // e o alvo aqui é o comportamento do módulo, não a camada de sobreposição.
  const click = async (page, sel) => { await clearPin(page); const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };

  // ---- diretor ----
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  // Fonte externa bloqueada na rede de quem roda não é erro da aplicação.
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)\.com/.test(m.text())) errs.push(m.text()); });

  await p.goto(BASE + '/login.html', { waitUntil: 'load' });
  const login = await p.evaluate(async (pass) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 1, password: pass }) });
    return r.status;
  }, ADMIN_PASS);
  if (login !== 200) { console.log('login do diretor falhou:', login); await b.close(); process.exit(2); }

  const fixture = await p.evaluate(async () => {
    const r = await fetch('/api/board/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Encontro de verificação', counterpart: { org: 'Fixture & Co.', person: 'Alguém' }, front: 'CI',
        status: 'marcado', date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), time: '14:00', owners: [1] }) });
    return { status: r.status, id: r.ok ? (await r.json()).meeting.id : null };
  });
  check(fixture.status === 200, 'encontro de fixture criado', fixture.status);

  await p.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p.waitForSelector('#tab-diretoria', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await clearPin(p);
  check(await p.$('#tab-diretoria') !== null, 'aba Diretoria existe para diretor');
  const navOrder = await p.evaluate(() => [...document.querySelectorAll('nav.tabs button[data-tab]')].map(b => b.dataset.tab).join(','));
  check(/membros,diretoria(,acessos)?/.test(navOrder), 'Diretoria vem logo depois de Membros', navOrder);

  await click(p, '#tab-diretoria');
  await p.waitForSelector('.board-col', { timeout: 5000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const cols = [...document.querySelectorAll('.board-col')].map(c => c.dataset.status);
    const btns = [...document.querySelectorAll('.board-actions button, .board-toolbar button')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .map(e => ({ t: (e.textContent || '').trim().slice(0, 14), h: Math.round(e.getBoundingClientRect().height) }));
    return { overflowX: de.scrollWidth - de.clientWidth, cols, cards: document.querySelectorAll('.board-card').length, btns };
  });
  check(r.cols.join(',') === 'a_marcar,marcado,realizado,pendencia', 'quatro colunas na ordem do ciclo', r.cols.join(','));
  check(r.cards >= 1, 'quadro mostra o encontro', r.cards);
  check(r.btns.length > 0 && r.btns.every(x => x.h >= 44), 'botões >= 44px', JSON.stringify(r.btns.filter(x => x.h < 44)));
  check(r.overflowX === 0, 'sem overflow horizontal', r.overflowX);

  // menu de mover abre no cartão, com as outras três colunas
  // Ancorado na coluna Marcado (onde vive o fixture): o primeiro cartão do
  // quadro pode ser de outra coluna quando o volume já tem encontros.
  await click(p, '.board-col[data-status="marcado"] .board-card [data-act="move"]');
  const moveTargets = await p.evaluate(() => [...document.querySelectorAll('.board-menu [data-move]')].map(b => b.dataset.move));
  check(moveTargets.length === 3 && !moveTargets.includes('marcado'), 'menu Mover oferece as outras três colunas', moveTargets.join(','));

  await click(p, '.board-view [data-view="calendario"]');
  await p.waitForSelector('.board-month', { timeout: 3000 }).catch(() => {});
  check(await p.$('.board-month') !== null, 'visão Calendário renderiza');
  const cal = await p.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    days: document.querySelectorAll('.board-day').length,
  }));
  check(cal.overflowX === 0, 'calendário sem overflow horizontal', cal.overflowX);
  check(cal.days >= 28, 'grade mensal com os dias', cal.days);
  await click(p, '.board-view [data-view="quadro"]');
  await p.waitForSelector('.board-col', { timeout: 3000 }).catch(() => {});
  check(await p.$('.board-col') !== null, 'volta para o Quadro');

  // editor abre e fecha
  await click(p, '.board-toolbar [data-act="new"]');
  await p.waitForSelector('#bm-form', { timeout: 3000 }).catch(() => {});
  check(await p.$('#bm-form') !== null, 'modal Novo encontro abre');
  await click(p, '#bm-cancel');
  check(await p.$('#bm-form') === null, 'modal fecha em Cancelar');

  check(errs.length === 0, 'sem erro de console/JS', errs.slice(0, 3).join(' | '));
  // apaga o fixture: rodar o verify não pode acumular encontro no volume
  if (fixture.id) {
    const del = await p.evaluate(async (id) => (await fetch('/api/board/meetings/' + id, { method: 'DELETE' })).status, fixture.id);
    check(del === 200, 'fixture apagado', del);
  }
  await ctx.close();

  // ---- membro comum ----
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/login.html', { waitUntil: 'load' });
  const l2 = await p2.evaluate(async () => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 2, password: '2' }) })).status);
  if (l2 === 200) {
    await p2.goto(BASE + '/app.html', { waitUntil: 'load' });
    await p2.waitForTimeout(1200);
    check(await p2.$('#tab-diretoria') === null, 'membro comum não vê a aba');
    const forbidden = await p2.evaluate(async () => (await fetch('/api/board/meetings')).status);
    check(forbidden === 403, 'membro comum recebe 403 na API', forbidden);
  } else {
    // Sem o membro comum não dá para provar o critério "membro não vê a aba".
    check(false, 'membro comum (order 2) loga no volume de fixture', l2);
  }
  await b.close();
  console.log(bad ? `\n${bad} falha(s)` : '\nverify-board OK');
  process.exit(bad ? 1 : 0);
})();
