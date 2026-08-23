/* Tags do membro e roteamento do logout, medidos no browser.

   O caso que importa: adicionar tag PRESERVA as anteriores. A primeira versao
   usava me.interests como base, mas /api/me devolve sessionUser(), que nao
   carrega interests — cada gravacao apagava as tags existentes. A base tem de
   vir do roster.

   Uso: node scripts/verify-tags.js [--base=http://127.0.0.1:3000]
*/
const { chromium } = require('playwright');
const B = (function () {
  const a = process.argv.find(x => x.startsWith('--base='));
  if (a) return a.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();
const tagsDoDom = () => [...document.querySelectorAll('.interests.editable .interest-chip')]
  .map(e => e.textContent.replace('\u00d7','').trim());
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let bad = 0;
  const ok = (c, l, d) => { console.log(`  ${c?'ok   ':'FALHA'} ${l}${d!==undefined?' — '+d:''}`); if(!c) bad++; };

  await p.goto(B + '/login.html');
  await p.evaluate(() => fetch('/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: 2, password: '2' }) }));
  // estado conhecido
  await p.evaluate(() => fetch('/api/me/interests', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interests: ['Tech', 'IA'] }) }));

  await p.goto(B + '/app.html', { waitUntil: 'load' });
  await p.waitForTimeout(1400);
  await p.evaluate(() => { const m = document.querySelector('.pin-backdrop'); if (m) m.remove(); });
  await p.evaluate(() => document.querySelector('[data-tab=membros]').click());
  await p.waitForTimeout(1100);

  const g = await p.evaluate(() => ({
    campos: document.querySelectorAll('[data-tag-input]').length,
    cartoes: document.querySelectorAll('.member-card').length,
    alvoX: (() => { const b = document.querySelector('[data-tag-del]');
      const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); })()
  }));
  ok(g.campos === 1, 'campo de tag só no cartão próprio', `${g.campos} campo, ${g.cartoes} cartões`);
  ok(g.alvoX >= 24, 'alvo do × >= 24px', `${g.alvoX}px`);

  const antes = await p.evaluate(tagsDoDom);
  ok(JSON.stringify(antes) === '["Tech","IA"]', 'estado inicial', JSON.stringify(antes));

  await p.fill('[data-tag-input]', 'Náutica');
  await p.press('[data-tag-input]', 'Enter');
  await p.waitForTimeout(1400);
  const dep = await p.evaluate(tagsDoDom);
  ok(dep.length === 3 && dep.includes('Náutica') && dep.includes('Tech') && dep.includes('IA'),
     'adicionar PRESERVA as anteriores', JSON.stringify(dep));

  await p.click('[data-tag-del]');
  await p.waitForTimeout(1400);
  const rem = await p.evaluate(tagsDoDom);
  ok(rem.length === 2, 'remover tira só uma', JSON.stringify(rem));

  await p.click('#logout-btn');
  await p.waitForTimeout(1900);
  const dest = new URL(p.url()).pathname;
  ok(dest === '/', 'sair vai para a página principal', dest);
  ok(errs.length === 0, 'sem erro de console', errs.slice(0,2).join(' | ') || 'nenhum');

  await b.close();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nTAGS E ROTEAMENTO OK');
  process.exit(bad ? 1 : 0);
})();
