/* Prévia e teste real da banca com volume descartável. Nunca usa dados de produção. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { emptyState } = require('../lib/hackathon/store');
const { newPerson } = require('../lib/hackathon/people');
const { issueLoginToken } = require('../lib/hackathon/access');
const L = require('../lib/hackathon/live-evaluation');
const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');
const SHOTS = path.join(TMP, 'judge-live-shots');
const MANIFEST = path.join(TMP, 'judge-preview.json');
const NOW = new Date('2026-10-31T17:00:00Z');
const PASS = 'preview-somente-local';
const serve = process.argv.includes('--serve');
let server, volume, browser;

function fixture() {
  volume = fs.mkdtempSync(path.join(os.tmpdir(), 'lepv-judge-preview-'));
  const members = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'members.json'), 'utf8'));
  fs.writeFileSync(path.join(volume, 'signups.json'), JSON.stringify({ nextOrder: Math.max(...members.map((x) => x.order)) + 1,
    pending: [], members: [], credentials: [{ order: 1, passwordHash: bcrypt.hashSync(PASS, 8) }] }));
  const state = emptyState();
  state.config.evaluation = { ...state.config.evaluation, open: true, criteriaLocked: true,
    criteria: [{ id: 'c1', name: 'Solução', description: 'Funcionamento do projeto', weight: 1, scaleMax: 5 },
      { id: 'c2', name: 'Construção', description: 'Qualidade da implementação', weight: 1, scaleMax: 5 }] };
  const judges = ['Ana Jurada', 'Bia Jurada'].map((name, i) => newPerson({ id: 'j' + (i + 1), name, email: `juiza${i + 1}@preview.invalid`, roles: ['judge'] }));
  state.people.push(...judges);
  state.teams.push({ id: 't1', name: 'Equipe Aurora', status: 'confirmed', members: [] },
    { id: 't2', name: 'Equipe Horizonte', status: 'confirmed', members: [] });
  state.submissions.push({ teamId: 't1', projectName: 'Aurora', repoUrl: 'https://example.org/aurora', slides: { name: 'aurora.pdf' } },
    { teamId: 't2', projectName: 'Horizonte', repoUrl: 'https://example.org/horizonte', slides: { name: 'horizonte.pdf' } });
  if (serve) L.openRound(state, 't1', 'delivery', NOW);
  const tokens = judges.map((judge) => issueLoginToken(state, judge.id, NOW));
  fs.writeFileSync(path.join(volume, 'hackathon.json'), JSON.stringify(state));
  return tokens;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function start(port) {
  const env = {};
  for (const k of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC']) if (process.env[k]) env[k] = process.env[k];
  Object.assign(env, { PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: volume, SESSION_SECRET: 'preview-isolado',
    TRAVEL_ESTIMATE: 'off', HACK_NOW: NOW.toISOString(), HACK_PUBLIC_URL: `http://127.0.0.1:${port}`,
    HACK_EMAIL_OUTBOX: path.join(volume, 'outbox'), HACK_PUSH_OUTBOX: path.join(volume, 'push-outbox'), RESEND_API_KEY: '' });
  if (serve && process.argv.includes('--with-ai')) {
    if (!process.env.HACK_JUDGE_AI_KEY) throw new Error('Defina HACK_JUDGE_AI_KEY para a prévia com IA.');
    env.HACK_JUDGE_AI_KEY = process.env.HACK_JUDGE_AI_KEY;
  }
  server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; server.stdout.on('data', (b) => { output += b; }); server.stderr.on('data', (b) => { output += b; });
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error('Servidor de prévia encerrou: ' + output.slice(-1000));
    try { if ((await fetch(`http://127.0.0.1:${port}/hack/acesso`)).ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Servidor de prévia não iniciou: ' + output.slice(-1000));
}
async function makeContext(viewport) {
  const context = await browser.newContext({ viewport });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  return context;
}
async function judgeLogin(context, base, token) {
  const page = await context.newPage();
  await page.goto(`${base}/hack/acesso#t=${token}&next=avaliacao`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Agora não' }).click();
  await page.waitForURL('**/hack/avaliacao');
  await page.locator('#status').waitFor();
  return page;
}
async function adminLogin(context, base) {
  const r = await context.request.post(base + '/api/login', { data: { order: 1, password: PASS } });
  assert(r.ok(), 'login admin local');
  const page = await context.newPage(); await page.goto(base + '/hack/avaliacao', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Abrir rodada' }).waitFor();
  return page;
}
async function run(base, tokens) {
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const desktop = await makeContext({ width: 1440, height: 900 });
  const mobile = await makeContext({ width: 390, height: 844 });
  const other = await makeContext({ width: 390, height: 844 });
  const admin = await adminLogin(desktop, base);
  await admin.getByLabel('Equipe', { exact: true }).selectOption('t1');
  await admin.getByRole('button', { name: 'Abrir rodada' }).click();
  await admin.getByRole('button', { name: 'Encerrar rodada' }).waitFor();
  const a = await judgeLogin(mobile, base, tokens[0]);
  const b = await judgeLogin(other, base, tokens[1]);
  await a.getByLabel('Nova observação').fill('Observação privada da Ana');
  await a.getByRole('button', { name: 'Salvar observação' }).click();
  await a.getByText('Observação privada da Ana').waitFor();
  assert(!(await b.locator('body').innerText()).includes('Observação privada da Ana'), 'observação não pode aparecer para outra jurada');
  const api = await b.request.get(base + '/hack/api/judge/live');
  assert(api.ok());
  const round = (await api.json()).currentRound.id;
  const details = await (await b.request.get(base + '/hack/api/judge/live/rounds/' + round)).json();
  assert(!JSON.stringify(details).includes('Observação privada da Ana'), 'API não pode revelar observação');
  // Todas as equipes abertas: a Bia escolhe Horizonte na lista e dá nota sem a organização abrir a rodada.
  await b.locator('#rounds').getByRole('button', { name: /Horizonte/ }).click();
  await b.locator('h2', { hasText: 'Horizonte' }).waitFor();
  await b.locator('input[name="criterion-c1"][value="3"]').check();
  await b.getByRole('button', { name: 'Próximo critério' }).click();
  await b.locator('input[name="criterion-c2"][value="4"]').check();
  await b.getByRole('button', { name: 'Revisar notas' }).click();
  await b.getByRole('button', { name: 'Confirmar avaliação' }).click();
  await b.getByText('Há uma avaliação confirmada.').waitFor();
  await a.locator('input[name="criterion-c1"][value="4"]').check();
  await a.getByRole('button', { name: 'Próximo critério' }).click();
  await a.locator('input[name="criterion-c2"][value="5"]').check();
  await a.getByRole('button', { name: 'Revisar notas' }).click();
  await a.getByRole('button', { name: 'Confirmar avaliação' }).click();
  await a.getByText('Há uma avaliação confirmada.').waitFor();
  await a.getByLabel('Nova observação').fill('Texto ainda em edição');
  await admin.getByRole('button', { name: 'Encerrar rodada' }).click();
  await admin.getByLabel('Equipe', { exact: true }).selectOption('t2');
  await admin.getByRole('button', { name: 'Abrir rodada' }).click();
  await a.getByText('Em avaliação agora: Horizonte').waitFor({ timeout: 18000 });
  assert.strictEqual(await a.getByLabel('Nova observação').inputValue(), 'Texto ainda em edição');
  // A rodada que a organização abriu para Horizonte é a mesma em que a Bia já tinha dado nota.
  const bia = await (await b.request.get(base + '/hack/api/judge/live')).json();
  const horizonte = bia.teams.find((t) => t.id === 't2');
  assert.strictEqual(bia.currentRound.id, horizonte.roundId, 'organização reabre a rodada criada pela jurada');
  assert.strictEqual((await (await b.request.get(base + '/hack/api/judge/live/rounds/' + horizonte.roundId)).json()).score.values.c1, 3, 'nota dada direto preservada');
  await a.screenshot({ path: path.join(SHOTS, 'judge-mobile.png'), fullPage: true });
  await a.setViewportSize({ width: 1440, height: 900 });
  await a.screenshot({ path: path.join(SHOTS, 'judge-desktop.png'), fullPage: true });
  await admin.screenshot({ path: path.join(SHOTS, 'admin-desktop.png'), fullPage: true });
  const current = (await (await desktop.request.get(base + '/hack/api/admin/live')).json()).currentRound;
  assert((await desktop.request.post(base + '/hack/api/admin/live/rounds/' + current.id + '/close', { data: {} })).ok());
  for (const data of [{ action: 'finalists', teamIds: ['t1', 't2'] }, { action: 'phase', phase: 'final' }]) {
    assert((await desktop.request.post(base + '/hack/api/admin/evaluation', { data })).ok());
  }
  const pitchResponse = await desktop.request.post(base + '/hack/api/admin/live/rounds', { data: { teamId: 't1', kind: 'pitch' } });
  assert(pitchResponse.ok());
  const pitch = (await pitchResponse.json()).round;
  await a.reload({ waitUntil: 'domcontentloaded' });
  // Nota do pitch aberta com a rodada em andamento: só fecha quando a organização fecha a avaliação.
  await a.locator('#score-write').waitFor();
  await a.waitForFunction(() => !document.getElementById('score-write').disabled, { timeout: 18000 });
  await a.getByLabel('Nova observação').fill('Pitch claro, sem evidência do custo operacional.');
  await a.getByRole('button', { name: 'Salvar observação' }).click();
  await a.getByText('Pitch claro, sem evidência do custo operacional.').waitFor();
  await a.getByRole('button', { name: 'Organizar minhas observações' }).click();
  await a.getByText('Resumo indisponível:', { exact: false }).waitFor();
  assert((await a.locator('#detail').innerText()).includes('Pitch claro, sem evidência do custo operacional.'), 'falha de IA preserva comentário');
  await a.locator('input[name="criterion-c1"][value="2"]').check();
  await a.getByRole('button', { name: 'Próximo critério' }).click();
  await a.locator('input[name="criterion-c2"][value="3"]').check();
  await a.getByRole('button', { name: 'Revisar notas' }).click();
  await a.getByRole('button', { name: 'Confirmar avaliação' }).click();
  await a.getByText('Há uma avaliação confirmada.').waitFor();
  // Encerrar o pitch depois da nota não a apaga nem a trava.
  assert((await desktop.request.post(base + '/hack/api/admin/live/rounds/' + pitch.id + '/close', { data: {} })).ok());
  const mainScore = await (await a.request.get(base + '/hack/api/judge/live/rounds/' + round)).json();
  assert.strictEqual(mainScore.score.values.c1, 4, 'nota da primeira fase preservada');
  const finalScore = await (await a.request.get(base + '/hack/api/judge/live/rounds/' + pitch.id)).json();
  assert.strictEqual(finalScore.score.values.c1, 2, 'nota do pitch registrada na fase final');
  await desktop.close(); await mobile.close(); await other.close();
  console.log('PASSOU: link, privacidade, confirmação, polling, fases separadas, pitch e alternativa sem IA.');
}
(async () => {
  const tokens = fixture(); const port = await freePort(); const base = `http://127.0.0.1:${port}`;
  try {
    await start(port);
    if (serve) {
      fs.mkdirSync(TMP, { recursive: true });
      const data = { base, admin: { order: 1, password: PASS }, judgeLinks: tokens.map((t) => `${base}/hack/acesso#t=${t}&next=avaliacao`), volume, pid: server.pid };
      fs.writeFileSync(MANIFEST, JSON.stringify(data, null, 2), { mode: 0o600 });
      console.log('Prévia local de teste pronta: ' + base + '/hack/avaliacao');
      console.log('Links pessoais de teste e login da diretoria: ' + MANIFEST);
      await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); server.once('exit', resolve); });
    } else await run(base, tokens);
  } finally {
    if (browser) await browser.close();
    // Espera o servidor sair antes de apagar o volume: no Linux do CI ele ainda gravava
    // na pasta durante o rmSync (ENOTEMPTY). Limpeza que falha não reprova a verificação.
    if (server && server.exitCode === null) {
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    if (volume) {
      try { fs.rmSync(volume, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (err) { console.warn('Aviso: volume temporário não removido (' + err.code + '): ' + volume); }
    }
    if (serve && fs.existsSync(MANIFEST)) fs.unlinkSync(MANIFEST);
  }
})().catch((err) => { console.error('FALHA:', err.message); process.exitCode = 1; });
