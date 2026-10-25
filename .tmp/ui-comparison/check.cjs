const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post('http://127.0.0.1:4200/api/login', { data: { order: 2, password: '2' } });
  assert.equal(login.status(), 200);
  await context.request.post('http://127.0.0.1:4200/api/pin-poll', { data: { want: false } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4200/novo', { waitUntil: 'load' });
  await page.locator('.portal-next h2').filter({ hasText: 'Da ideia ao primeiro cliente' }).waitFor();
  await page.waitForTimeout(1100);
  await page.evaluate(() => document.querySelector('.pin-backdrop')?.remove());
  await page.screenshot({ path: path.join(__dirname, 'inicio-desktop.png') });
  await page.locator('.portal-next .portal-action').click();
  await page.locator('#panel-eventos.active .event-card').first().waitFor();
  assert.equal(await page.locator('#panel-eventos.active .event-card').count() > 0, true);
  await page.screenshot({ path: path.join(__dirname, 'eventos-desktop.png') });
  await page.locator('#tab-membros').click();
  await page.locator('#member-grid [data-self]').waitFor();
  await page.locator('#portal-member-search').fill('zzzzzz');
  assert.equal(await page.locator('#member-grid .member-card:visible').count(), 0);
  assert.equal(await page.locator('.portal-member-empty').isVisible(), true);
  await page.locator('#portal-member-search').fill('placido');
  assert.equal(await page.locator('#member-grid .member-card:visible').count(), 1);
  await page.locator('.portal-own-link').click();
  const total = await page.locator('#member-grid .member-card:visible').count();
  assert.equal(total > 1, true);
  assert.equal(await page.locator('#member-grid [data-self]').evaluate(el => el === document.activeElement), true);
  const turmaOptions = await page.locator('#portal-member-turma option').allTextContents();
  if (turmaOptions.length > 1) {
    await page.locator('#portal-member-turma').selectOption({ index: 1 });
    const selected = await page.locator('#portal-member-turma').inputValue();
    assert.equal(await page.locator('#member-grid .member-card:visible').evaluateAll((cards, turma) => cards.every(card => card.dataset.turma === turma), selected), true);
    await page.locator('#portal-member-turma').selectOption('');
  }
  await page.screenshot({ path: path.join(__dirname, 'membros-desktop.png') });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tab of ['inicio', 'eventos', 'membros']) {
      await page.locator('#tab-' + tab).click();
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'overflow ' + width + ' ' + tab);
      if (width === 390) await page.screenshot({ path: path.join(__dirname, tab + '-mobile.png') });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.locator('.panel.active').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  console.log('PASSOU: evento, busca sem acento, vazio, filtro de turma, perfil próprio, desktop, 390px, 768px, movimento reduzido, zero erro de JS.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
