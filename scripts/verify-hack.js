/* Verificação visual da plataforma do hackathon (/hack). Mede, não julga.
   Uso: node scripts/verify-hack.js [--base=http://127.0.0.1:3000] [--shots=<dir>]

   Para cada página em desktop, celular e movimento reduzido: rolagem
   horizontal, erro de console, imagem quebrada, h1 único, alvos de toque
   (controles ≥ 44px), campos com 16px e texto mínimo. As telas logadas
   (portal, organização...) entram como a diretoria da liga: order 1 com
   LEPV_CI_ADMIN_PASS, o mesmo admin que o ci-fixtures semeia.
   --shots grava screenshots para revisão a olho. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const BASE = arg('base') || process.env.LEPV_BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const SHOTS = arg('shots');
const ADMIN_PASS = process.env.LEPV_CI_ADMIN_PASS || 'ci-admin';

const PAGES = ['/hack/', '/hack/?inscricoes=encerradas', '/hack/acesso', '/hack/parceiros'];
// Telas logadas; a aba entra pelo hash.
const APP_PAGES = [
  '/hack/portal#inicio', '/hack/portal#avisos', '/hack/portal#agenda',
  '/hack/organizacao#pessoas', '/hack/organizacao#equipes', '/hack/organizacao#entregas', '/hack/organizacao#avaliacao',
  '/hack/organizacao#parceiros', '/hack/credenciamento#leitura',
  '/hack/organizacao#avisos', '/hack/organizacao#whatsapp', '/hack/organizacao#programacao',
  '/hack/organizacao#visao', '/hack/organizacao#duvidas',
];
// Telas que só aparecem para participante ou jurado: entram com pessoas de
// verificação criadas pela própria diretoria (link pessoal consumido aqui).
const PARTICIPANT_PAGES = ['/hack/portal#equipe', '/hack/portal#entrega', '/hack/portal#duvidas'];
const JUDGE_PAGES = ['/hack/portal#banca'];
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

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const shown = el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('dialog:not([open])') && !el.closest('[aria-hidden="true"]');
    };
    const CONTROLS = 'button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea, .btn, .tab';
    const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea';
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
      h1: document.querySelectorAll('h1').length,
      minFont: Math.min(...[...document.querySelectorAll('p,li,dd,dt,a,button,summary,label,span,b,time')]
        .filter(el => el.getBoundingClientRect().height > 0 && el.textContent.trim())
        .map(el => parseFloat(getComputedStyle(el).fontSize))),
      smallControls: [...document.querySelectorAll(CONTROLS)].filter(shown)
        .filter(el => el.getBoundingClientRect().height < 43.5)
        .map(el => (el.textContent || el.name || el.tagName).trim().slice(0, 24) + ' ' + Math.round(el.getBoundingClientRect().height) + 'px'),
      fieldFont: Math.min(16, ...[...document.querySelectorAll(FIELDS)].filter(el => !el.closest('[aria-hidden="true"]')).map(el => parseFloat(getComputedStyle(el).fontSize))),
      // Só o painel visível: os escondidos guardam o "Carregando…" inicial.
      loading: /Carregando…/.test((document.querySelector('.panel:not([hidden])') || document.querySelector('main') || document.body).textContent),
      // Valor de programação vazando na tela ("null", "undefined", "NaN").
      leaked: ((document.querySelector('.panel:not([hidden])') || document.querySelector('main') || document.body).innerText.match(/\b(null|undefined|NaN)\b/) || [null])[0],
      notice: (() => { const n = document.getElementById('aviso-inscricao'); return n ? !n.hidden : null; })(),
    };
  });
}

// Cria (uma vez) a participante e a jurada de verificação e devolve, a cada
// chamada, um link pessoal novo (uso único) para cada uma.
async function verificationPeople(adminReq) {
  const people = await (await adminReq.get(BASE + '/hack/api/admin/people')).json();
  const find = (email) => (people.people || []).find((p) => p.email === email);
  let judge = find('jurada.verificacao@lepv.example');
  if (!judge) {
    const r = await adminReq.post(BASE + '/hack/api/admin/people', { data: { name: 'Jurada Verificação', email: 'jurada.verificacao@lepv.example', roles: ['judge'] } });
    judge = (await r.json()).person;
  }
  let part = find('participante.verificacao@lepv.example');
  const tok = process.env.LEPV_INSCRICAO_TOKEN;
  if (!part && tok) {
    await fetch(BASE + '/api/event-signup/' + tok, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Participante Verificação', email: 'participante.verificacao@lepv.example', phone: '21999999999',
        vinculo: 'FGV', temGrupo: 'Não', awareLocation: true, awareTime: true }),
    });
    const again = await (await adminReq.get(BASE + '/hack/api/admin/people')).json();
    part = again.people.find((p) => p.email === 'participante.verificacao@lepv.example');
  }
  const link = async (p) => {
    if (!p) return null;
    const r = await adminReq.post(BASE + '/hack/api/admin/people/' + p.id + '/link', { data: { send: 'none' } });
    return r.ok() ? (await r.json()).url.split('#t=')[1] : null;
  };
  return { judge: await link(judge), participant: await link(part) };
}

async function contextWithLink(browser, mode, token) {
  const c = await browser.newContext({ viewport: mode.viewport, reducedMotion: mode.reducedMotion });
  const r = await c.request.post(BASE + '/hack/api/access/consume', { data: { token } });
  return r.ok() ? c : null;
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  // Google Fonts às vezes leva segundos e segura o evento load: a verificação
  // ficava intermitente por causa da rede, não da página. Aqui as fontes
  // chegam vazias (cai no fallback); nada medido depende da fonte carregada.
  const offlineFonts = (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: r.request().url().includes('googleapis') ? 'text/css' : 'font/woff2', body: '' }));
  const _newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts) => { const c = await _newContext(opts); await offlineFonts(c); return c; };
  for (const mode of MODES) {
    // Páginas públicas sem sessão (logado, /hack/acesso já pula para o portal);
    // telas de uso num contexto com a diretoria logada.
    const anon = await browser.newContext({ viewport: mode.viewport, reducedMotion: mode.reducedMotion });
    const ctx = await browser.newContext({ viewport: mode.viewport, reducedMotion: mode.reducedMotion });
    const login = await ctx.request.post(BASE + '/api/login', { data: { order: 1, password: ADMIN_PASS } });
    check(login.ok(), `[${mode.name}] login da diretoria para as telas logadas`, login.status());
    const links = await verificationPeople(ctx.request);
    const partCtx = links.participant ? await contextWithLink(browser, mode, links.participant) : null;
    const judgeCtx = links.judge ? await contextWithLink(browser, mode, links.judge) : null;
    check(Boolean(judgeCtx), `[${mode.name}] jurada de verificação entrou pelo link`);
    if (process.env.LEPV_INSCRICAO_TOKEN) check(Boolean(partCtx), `[${mode.name}] participante de verificação entrou pelo link`);
    const pages = PAGES.concat(APP_PAGES, partCtx ? PARTICIPANT_PAGES : [], judgeCtx ? JUDGE_PAGES : []);
    for (const p of pages) {
      const owner = APP_PAGES.includes(p) ? ctx : PARTICIPANT_PAGES.includes(p) ? partCtx : JUDGE_PAGES.includes(p) ? judgeCtx : anon;
      const page = await owner.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const res = await page.goto(BASE + p, { waitUntil: 'load', timeout: 20000 });
      if (p.includes('#')) {
        // Telas logadas carregam pela API depois do load.
        await page.waitForFunction(() => {
          const el = document.querySelector('.panel:not([hidden])') || document.querySelector('main');
          return el && !/Carregando…/.test(el.textContent);
        }, null, { timeout: 8000 }).catch(() => {});
      }
      // Rola até o fim para carregar as imagens lazy e disparar as revelações.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
      console.log(`\n[${mode.name}] ${p}`);
      check(res && res.status() === 200, 'HTTP 200', res && res.status());
      const m = await measure(page);
      check(m.overflowX <= 0, 'sem rolagem horizontal', m.overflowX + 'px');
      check(errors.length === 0, 'console sem erro', errors.join(' | ') || undefined);
      check(m.broken.length === 0, 'imagens carregam', m.broken.join(', ') || undefined);
      check(m.h1 === 1, 'um h1', m.h1);
      check(m.minFont >= 11, 'texto ≥ 11px', m.minFont + 'px');
      check(m.smallControls.length === 0, 'controles com 44px de altura', m.smallControls.join(', ') || undefined);
      check(m.fieldFont >= 16, 'campos com 16px (sem zoom no iPhone)', m.fieldFont + 'px');
      if (p.includes('#')) check(!m.loading, 'dados carregaram');
      check(!m.leaked, 'nenhum null/undefined/NaN na tela', m.leaked || undefined);
      if (p.includes('inscricoes=encerradas')) check(m.notice === true, 'aviso de inscrições encerradas aparece');
      else if (m.notice !== null) check(m.notice === false, 'aviso de inscrições encerradas escondido');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hack-${mode.name}-${p.replace(/\W+/g, '_')}.png`), fullPage: p.includes('#') });
      await page.close();
    }
    await anon.close();
    await ctx.close();
    if (partCtx) await partCtx.close();
    if (judgeCtx) await judgeCtx.close();
  }

  // Fonte reserva larga (o Linux do CI não tem Arial Narrow; um visitante cuja
  // fonte não carregou também cai nela): nenhum título pode ser cortado nem
  // empurrar a página. Mede o texto contra a própria caixa e contra a tela.
  for (const vp of [{ width: 1440, height: 900 }, { width: 360, height: 780 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    for (const p of ['/hack/', '/hack/parceiros', '/hack/acesso']) {
      const page = await ctx.newPage();
      await page.goto(BASE + p, { waitUntil: 'load' });
      await page.addStyleTag({ content: '*{font-family: Verdana, "DejaVu Sans", sans-serif !important}' });
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const cut = [...document.querySelectorAll('h1, h2, h3, .sec-title, .hero__title, .origin__word')]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > W + 1)
          .map((el) => (el.className || el.tagName).toString().slice(0, 30));
        return { overflow: document.documentElement.scrollWidth - W, cut };
      });
      console.log(`\n[fonte reserva ${vp.width}px] ${p}`);
      check(r.overflow <= 0, 'sem rolagem horizontal', r.overflow + 'px');
      check(r.cut.length === 0, 'nenhum título cortado', r.cut.join(', ') || undefined);
      await page.close();
    }
    await ctx.close();
  }

  // Credenciamento offline num navegador de verdade: prepara o aparelho, corta
  // a rede, registra pela busca manual (cópia local), volta a rede e sincroniza.
  if (process.env.LEPV_INSCRICAO_TOKEN) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.request.post(BASE + '/api/login', { data: { order: 1, password: ADMIN_PASS } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    console.log('\n[credenciamento offline]');
    await page.goto(BASE + '/hack/credenciamento', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('dia').options.length > 0, null, { timeout: 8000 });
    // Dia de trabalho: o que o servidor diz (num dia do evento é o de hoje e
    // o seletor fica travado — a verificação não pode tentar trocá-lo).
    const st = await (await ctx.request.get(BASE + '/hack/api/checkin/status')).json();
    const workDay = st.dayLocked ? st.defaultDay : '2026-10-31';
    // Ponto de partida conhecido: a participante de verificação sem entrada no
    // dia (rodadas anteriores podem ter registrado; a diretoria desfaz).
    const found = await (await ctx.request.get(BASE + '/hack/api/checkin/search?q=Participante%20Verifica&day=' + workDay)).json();
    for (const p of found.people || []) {
      if (p.checkin) await ctx.request.delete(BASE + '/hack/api/checkin/' + p.checkin.id);
    }
    if (!st.dayLocked) await page.selectOption('#dia', workDay);
    await page.click('#prep');
    const prepared = await page.waitForFunction(() => /ingressos/.test(document.getElementById('off-msg').textContent), null, { timeout: 8000 }).then(() => true, () => false);
    check(prepared, 'aparelho preparado para offline');
    await ctx.setOffline(true);
    await page.fill('#busca', 'Participante Verifica');
    await page.waitForFunction(() => document.querySelectorAll('#busca-res li button').length > 0, null, { timeout: 8000 }).catch(() => null);
    const btn = await page.$('#busca-res li button');
    check(Boolean(btn), 'busca manual funciona offline (cópia local)');
    if (btn) {
      await btn.click();
      await page.waitForFunction(() => document.getElementById('result').className.includes('result--'), null, { timeout: 5000 }).catch(() => null);
      const res = await page.evaluate(() => ({ cls: document.getElementById('result').className, pend: document.getElementById('pend').textContent }));
      check(/result--pending/.test(res.cls), 'registro offline fica "sincronização pendente"', res.cls);
      check(/1 leitura/.test(res.pend), 'uma leitura na fila', res.pend.slice(0, 60));
      await ctx.setOffline(false);
      await page.click('#sync');
      await page.waitForFunction(() => /Nada pendente/.test(document.getElementById('pend').textContent), null, { timeout: 15000 }).catch(() => null);
      const after = await page.evaluate(() => document.getElementById('pend').textContent);
      check(/Nada pendente/.test(after), 'fila sincronizou ao voltar a rede', after.slice(0, 80));
      const server = await (await ctx.request.get(BASE + '/hack/api/checkin/search?q=Participante%20Verifica&day=' + workDay)).json();
      check((server.people || []).some((p) => p.checkin && p.checkin.source !== 'online'), 'servidor registrou a entrada vinda do offline');
    }
    check(errors.length === 0, 'sem erro de JS no credenciamento', errors.join(' | ') || undefined);
    await ctx.close();
  }

  // Countdown com relógio simulado (14h30 de Brasília = 17h30 UTC): antes do
  // início mostra a conta certa; depois, só a frase de início.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-10-29T16:28:30Z') });
    await page.goto(BASE + '/hack/', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => [...document.querySelectorAll('.hero [data-u]')].map(b => b.textContent).join(':'));
    console.log('\n[relógio 29/10 13h28min30s BRT] countdown');
    // O relógio instalado anda: entre o goto e a leitura passa até 1-2s.
    check(/^01:01:01:(30|29|28)$/.test(before), 'faltam 1d 1h 1min ~30s', before);
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await ctx2.newPage();
    await page2.clock.install({ time: new Date('2026-10-30T17:30:05Z') });
    await page2.goto(BASE + '/hack/', { waitUntil: 'load' });
    await page2.waitForTimeout(300);
    const c = await page2.evaluate(() => {
      const el = document.querySelector('.hero [data-count]');
      return { digits: el.querySelector('.count__d').offsetParent !== null, done: el.querySelector('.count__done').offsetParent !== null };
    });
    console.log('\n[relógio 30/10 14h30min05s BRT] countdown');
    check(!c.digits && c.done, 'countdown troca para "O hackathon começou"', JSON.stringify(c));
    await ctx2.close();
  }

  // Rotas: /hack sem barra preserva a query; /hack/inscricao vai ao formulário
  // do hackathon do fixture (LEPV_INSCRICAO_TOKEN no CI).
  {
    console.log('\n[rotas]');
    const r1 = await fetch(BASE + '/hack?utm=a?b', { redirect: 'manual' });
    check(r1.status === 301 && r1.headers.get('location') === '/hack/?utm=a?b', '/hack → /hack/ com query', r1.status + ' ' + r1.headers.get('location'));
    const r2 = await fetch(BASE + '/hack/inscricao', { redirect: 'manual' });
    const loc = r2.headers.get('location') || '';
    const tok = process.env.LEPV_INSCRICAO_TOKEN;
    if (tok) check(r2.status === 302 && loc === '/inscricao.html?t=' + tok, '/hack/inscricao vai ao formulário do hackathon', r2.status + ' ' + loc);
    else check(r2.status === 302 && (loc.startsWith('/inscricao.html?t=') || loc === '/hack/?inscricoes=encerradas'), '/hack/inscricao redireciona (sem fixture)', r2.status + ' ' + loc);
  }

  await browser.close();
  console.log(failures ? `\n${failures} falha(s)` : '\nHACK OK');
  // exitCode, não process.exit: no Windows, sair à força com o fetch ainda
  // fechando o socket derruba o Node numa assertion do libuv (exit 127).
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
