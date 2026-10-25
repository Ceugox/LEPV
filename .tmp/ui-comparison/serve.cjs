const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const volume = fs.mkdtempSync(path.join(os.tmpdir(), 'lepv-ui-comparison-'));
const env = { ...process.env, PORT: '4201', RAILWAY_VOLUME_MOUNT_PATH: volume, TRAVEL_ESTIMATE: 'off' };
const reuse = process.argv.includes('--reuse');
if (!reuse) {
  const prepare = cp.spawnSync('node', ['scripts/ci-fixtures.js', 'prepare', volume], { cwd: root, env, windowsHide: true });
  if (prepare.status) throw Error('Não foi possível preparar o volume de desenvolvimento.');
}
const backend = reuse ? null : cp.spawn('node', ['server.js'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
const BASE = 'http://127.0.0.1:4201';
let fixtureCookie = '';
async function api(method, endpoint, body) {
  const response = await fetch(BASE + endpoint, { method, headers: { 'Content-Type': 'application/json', Cookie: fixtureCookie }, body: body ? JSON.stringify(body) : undefined });
  const cookie = response.headers.get('set-cookie');
  if (cookie) fixtureCookie = cookie.split(';')[0];
  if (!response.ok) throw Error('Fixture ' + endpoint + ': ' + response.status);
  return response.json();
}
function emDias(days) {
  const date = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const comparison = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LEPV · Comparação da UI</title><style>*{box-sizing:border-box}body{margin:0;background:#faf8f5;color:#121214;font:14px system-ui}header{height:72px;display:flex;align-items:center;gap:20px;padding:12px 24px;border-bottom:1px solid #cdc4b9}b{font-size:15px}small{display:block;color:#6e6672;margin-top:3px}nav{display:flex;gap:4px;margin-left:auto}button{font:600 14px system-ui;border:1px solid #cdc4b9;background:transparent;padding:10px 16px;min-height:44px;border-radius:4px;cursor:pointer}button[aria-pressed=true]{color:#faf8f5;background:#7f0a1a;border-color:#7f0a1a}a{color:#7f0a1a;font-size:12px}iframe{width:100%;height:calc(100dvh - 72px);border:0;display:block}@media(max-width:560px){header{height:112px;flex-wrap:wrap;gap:8px;padding:10px 16px}header>div{flex:1}nav{margin-left:0}header>a{margin-left:auto}iframe{height:calc(100dvh - 112px)}}</style></head><body><header><div><b>LEPV · Comparar a UI</b><small>Início, Eventos e Membros · dados locais</small></div><nav aria-label="Versão"><button aria-pressed="false" data-version="atual">Atual</button><button aria-pressed="true" data-version="novo">Nova UI</button></nav><a href="/novo" target="_blank" rel="noopener">Abrir sem moldura ↗</a></header><iframe title="Portal da LEPV" id="preview"></iframe><script>(async function(){var response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:2,password:'2'})});if(!response.ok){document.body.append('Não foi possível preparar o acesso local.');return;}var frame=document.getElementById('preview');frame.src='/novo#inicio';document.querySelectorAll('button[data-version]').forEach(function(button){button.onclick=function(){var hash='#inicio';try{hash=frame.contentWindow.location.hash||hash;}catch(e){}frame.src='/'+button.dataset.version+hash;document.querySelectorAll('button[data-version]').forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});document.querySelector('header>a').href='/'+button.dataset.version+hash;};});})();</script></body></html>`;
(async () => {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { ready = (await fetch(BASE + '/health')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw Error('Servidor local indisponível');
  if (!reuse) await api('POST', '/api/login', { order: 1, password: 'ci-admin' });
  for (const event of reuse ? [] : [
    { type: 'reuniao', title: 'Da ideia ao primeiro cliente', date: emDias(7), time: '19:00', location: 'Auditório do IME', text: 'Uma conversa sobre as primeiras decisões de quem começa a empreender. Traga sua ideia e suas perguntas.' },
    { type: 'visita', title: 'Por dentro de uma operação que cresce', date: emDias(14), time: '14:00', location: 'Botafogo, Rio de Janeiro', text: 'Uma tarde para entender produto, pessoas e decisões de negócio na prática.' },
    { type: 'aula', title: 'Finanças para tirar o projeto do papel', date: emDias(21), time: '19:00', location: 'Sala de aula do IME', text: 'Custos, preço e caixa: o que precisamos entender antes de começar.' }
  ]) await api('POST', '/api/events', event);
  await api('POST', '/api/login', { order: 2, password: '2' });
  await api('POST', '/api/pin-poll', { want: false });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(comparison); return; }
      if (req.url === '/atual' || req.url === '/novo') {
        const file = req.url === '/atual' ? path.join(__dirname, 'app-original.html') : path.join(root, 'public/app.html');
        const html = fs.readFileSync(file, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return;
      }
      const headers = { ...req.headers }; delete headers.host;
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const response = await fetch(BASE + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual' });
      const outgoing = Object.fromEntries(response.headers); delete outgoing['content-encoding']; delete outgoing['content-length'];
      res.writeHead(response.status, outgoing); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(502); res.end('Servidor de desenvolvimento indisponível'); }
  });
  server.listen(4200, '127.0.0.1', () => console.log('Comparador pronto em http://127.0.0.1:4200'));
  process.on('exit', () => backend?.kill());
})().catch(error => { console.error(error.message); backend?.kill(); process.exitCode = 1; });
