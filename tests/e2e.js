// E2E do site da liga — sobe o server de verdade contra um volume ISOLADO num
// diretório temporário. Nunca aponta para os dados reais do Railway.
//
//   npm test
//
// Cada teste é uma função async que lança em caso de falha. O servidor é
// derrubado por PID no fim (kill de job em background não funciona no Git Bash).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");

const ROOT = path.join(__dirname, "..");
const PORT = 4700 + (process.pid % 200);
const BASE = "http://127.0.0.1:" + PORT;

// Senhas conhecidas no volume de teste: o override do volume vence o seed, e é
// assim que o teste entra sem depender da senha real de ninguém.
const ADMIN_PASS = "teste-superadmin";
const MEMBER_ORDER = 2; // fundador comum, usado no resto da suíte
const MEMBER_PASS = "teste-membro";
// O teste de reset queima a senha de quem ele usa, então usa um fundador só
// dele — e parte da senha do seed (o número de inscrição) de propósito.
const RESET_ORDER = 3;
const RESET_SEED_PASS = "3";

let volumeDir;
let server;
const results = { pass: 0, fail: 0 };

function setupVolume() {
  volumeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lepv-e2e-"));
  const seedMembers = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "members.json"), "utf8"));
  fs.writeFileSync(
    path.join(volumeDir, "signups.json"),
    JSON.stringify(
      {
        nextOrder: seedMembers.reduce((max, m) => Math.max(max, m.order), 0) + 1,
        pending: [],
        members: [],
        credentials: [
          { order: 1, passwordHash: bcrypt.hashSync(ADMIN_PASS, 10) },
          { order: MEMBER_ORDER, passwordHash: bcrypt.hashSync(MEMBER_PASS, 10) },
        ],
      },
      null,
      2
    )
  );
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), RAILWAY_VOLUME_MOUNT_PATH: volumeDir, SESSION_SECRET: "e2e" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let up = false;
    const onData = (chunk) => {
      out += chunk.toString();
      if (!up && out.includes("rodando em")) {
        up = true;
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    // Só é falha se morrer ANTES de subir — o teste de restart mata de propósito.
    server.on("exit", (code) => {
      if (!up) reject(new Error("servidor morreu (code " + code + "): " + out));
    });
    setTimeout(() => {
      if (!up) reject(new Error("servidor não subiu em 15s: " + out));
    }, 15000);
  });
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGKILL");
  if (volumeDir) fs.rmSync(volumeDir, { recursive: true, force: true });
}

// Cliente HTTP com cookie jar por sessão — é como o teste mantém logins
// paralelos (superadmin, membro, anônimo) sem interferência.
function client() {
  let cookie = "";
  async function req(method, url, body, headers) {
    const opts = { method, headers: { ...(headers || {}) }, redirect: "manual" };
    if (cookie) opts.headers.Cookie = cookie;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) {
        opts.body = body;
      } else {
        opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(BASE + url, opts);
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) cookie = c.split(";")[0];
    let data = null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("application/json")) data = await res.json();
    else data = await res.text();
    return { status: res.status, ok: res.ok, data, headers: res.headers };
  }
  return {
    get: (u) => req("GET", u),
    post: (u, b, h) => req("POST", u, b, h),
    del: (u) => req("DELETE", u),
    login: async (order, password) => req("POST", "/api/login", { order, password }),
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || "valor inesperado") + ": esperado " + expected + ", veio " + actual);
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// PNG 1x1 válido — o servidor faz sniff de magic bytes, não aceita lixo.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

// ---- Infra ----

test("healthcheck responde sem sessão", async () => {
  const r = await client().get("/health");
  eq(r.status, 200, "status do /health");
  assert(r.data.ok === true, "/health deveria devolver ok:true");
});

test("headers de segurança presentes", async () => {
  const r = await client().get("/health");
  eq(r.headers.get("x-content-type-options"), "nosniff", "nosniff");
  eq(r.headers.get("x-frame-options"), "DENY", "frame-options");
  assert(!r.headers.get("x-powered-by"), "x-powered-by deveria estar desligado");
});

// ---- Autenticação e senhas ----

test("login do superadmin usa a credencial do volume, não a do seed", async () => {
  const c = client();
  const bad = await c.login(1, "1");
  eq(bad.status, 401, "senha do seed não deveria valer com override no volume");
  const ok = await c.login(1, ADMIN_PASS);
  eq(ok.status, 200, "login do superadmin");
  assert(ok.data.superadmin === true, "flag superadmin");
  assert(ok.data.director === true, "superadmin também é diretor");
});

test("troca voluntária de senha exige a senha atual", async () => {
  const c = client();
  await c.login(1, ADMIN_PASS);
  const wrong = await c.post("/api/set-password", { currentPassword: "errada", password: "nova-senha-1" });
  eq(wrong.status, 403, "senha atual errada deveria ser recusada");
  const ok = await c.post("/api/set-password", { currentPassword: ADMIN_PASS, password: "nova-senha-1" });
  eq(ok.status, 200, "troca com senha atual correta");

  const c2 = client();
  eq((await c2.login(1, ADMIN_PASS)).status, 401, "senha antiga deveria morrer");
  eq((await c2.login(1, "nova-senha-1")).status, 200, "senha nova deveria valer");
  // devolve ao estado inicial para os testes seguintes
  await c2.post("/api/set-password", { currentPassword: "nova-senha-1", password: ADMIN_PASS });
});

test("senha do seed é o número de inscrição (estado que o reset existe para corrigir)", async () => {
  const c = client();
  const r = await c.login(RESET_ORDER, RESET_SEED_PASS);
  eq(r.status, 200, "fundador sem override entra com o número de inscrição");
});

test("reset pelo superadmin invalida a senha antiga e força troca no 1º login", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const r = await admin.post("/api/admin/reset-password", { order: RESET_ORDER });
  eq(r.status, 200, "reset de senha");
  assert(typeof r.data.code === "string" && r.data.code.length >= 6, "deveria devolver o código novo");

  const m = client();
  eq((await m.login(RESET_ORDER, RESET_SEED_PASS)).status, 401, "senha antiga deveria morrer no reset");
  const login = await m.login(RESET_ORDER, r.data.code);
  eq(login.status, 200, "login com o código novo");
  assert(login.data.mustChangePassword === true, "deveria exigir troca de senha");

  // Gate de verdade no servidor: com senha pendente, a API está fechada.
  eq((await m.get("/api/members")).status, 403, "API deveria estar bloqueada até trocar a senha");
  eq((await m.get("/api/me")).status, 200, "/api/me precisa responder para o front redirecionar");

  const set = await m.post("/api/set-password", { password: "senha-pos-reset" });
  eq(set.status, 200, "1º acesso não pede senha atual");
  eq((await m.get("/api/members")).status, 200, "API liberada depois da troca");
});

test("rate limit por IP entra antes de varrer a lista de membros", async () => {
  const c = client();
  let sawLimit = false;
  for (let i = 0; i < 18 && !sawLimit; i++) {
    // order diferente a cada tentativa: o lockout por conta nunca dispararia
    const r = await c.login(3 + (i % 8), "senha-errada-" + i);
    if (r.status === 429) sawLimit = true;
  }
  assert(sawLimit, "deveria bloquear por IP depois de várias contas erradas");
  // libera o lock para os testes seguintes
  await new Promise((r) => setTimeout(r, 30500));
});

// ---- Privacidade do roster ----

test("/api/members não expõe Pix, telefone nem flags de admin", async () => {
  const c = client();
  await c.login(MEMBER_ORDER, MEMBER_PASS);
  const r = await c.get("/api/members");
  eq(r.status, 200, "roster");
  for (const m of r.data) {
    assert(!("pix" in m), "não deveria vazar pix (membro " + m.order + ")");
    assert(!("phone" in m), "não deveria vazar phone (membro " + m.order + ")");
    assert(!("admin" in m), "não deveria vazar flag admin (membro " + m.order + ")");
    assert(!("superadmin" in m), "não deveria vazar flag superadmin (membro " + m.order + ")");
  }
});

test("Pix vive em rota da imersão e contatos só para diretoria", async () => {
  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  const pix = await member.get("/api/expenses/pix");
  eq(pix.status, 200, "fundador da imersão acessa as chaves Pix");
  assert(Array.isArray(pix.data), "payload de pix deveria ser lista");
  eq((await member.get("/api/members/contacts")).status, 403, "membro comum não vê contatos");

  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const contacts = await admin.get("/api/members/contacts");
  eq(contacts.status, 200, "diretoria vê contatos");
  assert(contacts.data.every((m) => "phone" in m), "contatos deveriam trazer phone");
});

test("anônimo não passa dos endpoints públicos", async () => {
  const c = client();
  eq((await c.get("/api/members")).status, 401, "roster exige login");
  eq((await c.get("/api/events")).status, 401, "eventos exigem login");
  eq((await c.get("/api/lessons")).status, 401, "aulas exigem login");
  eq((await c.get("/api/expenses/pix")).status, 401, "pix exige login");
  eq((await c.get("/api/members-public")).status, 200, "seletor de login é público");
});

// ---- Mural de eventos ----

test("mural: diretor publica com foto, membro lê, membro não escreve", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const created = await admin.post("/api/events", {
    title: "Reunião de abertura do semestre",
    text: "Traga um case para discutir.",
    date: "2026-08-15",
  });
  eq(created.status, 200, "criação de evento");
  const id = created.data.event.id;
  assert(id, "evento deveria ter id");

  const photo = await admin.post("/api/events/" + id + "/photos", PNG_1PX, { "Content-Type": "image/png" });
  eq(photo.status, 200, "upload de foto");
  eq(photo.data.event.photos.length, 1, "foto registrada no evento");
  const photoUrl = photo.data.event.photos[0].url;

  const member = client();
  eq((await member.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login do membro");
  const list = await member.get("/api/events");
  eq(list.status, 200, "membro lê o mural");
  const found = list.data.events.find((e) => e.id === id);
  assert(found, "evento deveria aparecer para o membro");
  eq(found.title, "Reunião de abertura do semestre", "título do evento");
  eq((await member.get(photoUrl)).status, 200, "membro carrega a foto");

  eq((await member.post("/api/events", { title: "Aviso pirata" })).status, 403, "membro não publica");
  eq((await member.del("/api/events/" + id)).status, 403, "membro não apaga");
  eq((await client().get(photoUrl)).status, 401, "foto do mural não é pública");

  const del = await admin.del("/api/events/" + id);
  eq(del.status, 200, "diretor apaga o evento");
  const after = await admin.get("/api/events");
  assert(!after.data.events.some((e) => e.id === id), "evento deveria sair da lista");
});

test("mural rejeita arquivo que não é imagem", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const ev = await admin.post("/api/events", { title: "Aviso com anexo ruim", date: "2026-08-16" });
  const bad = await admin.post("/api/events/" + ev.data.event.id + "/photos", Buffer.from("<?php echo 1; ?>"), {
    "Content-Type": "image/png",
  });
  eq(bad.status, 400, "conteúdo não-imagem deveria ser recusado apesar do content-type");
  await admin.del("/api/events/" + ev.data.event.id);
});

// ---- Inscrições por aula ----

test("inscrições: membro em 1 clique, visitante por link, dedupe e fechamento", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const lesson = await admin.post("/api/lessons", { title: "Aula 01 — Modelo de negócio", date: "2026-09-01" });
  eq(lesson.status, 200, "criação de aula");
  const lessonId = lesson.data.lesson.id;

  const member = client();
  eq((await member.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login do membro");
  const closed = await member.post("/api/lessons/" + lessonId + "/signup");
  eq(closed.status, 423, "não dá para se inscrever antes de abrir");

  eq((await member.post("/api/lessons/" + lessonId + "/signups-open", { open: true })).status, 403, "membro não abre inscrições");
  const open = await admin.post("/api/lessons/" + lessonId + "/signups-open", { open: true });
  eq(open.status, 200, "diretor abre inscrições");
  const token = open.data.signupToken;
  assert(token, "abrir inscrições deveria gerar token público");

  const first = await member.post("/api/lessons/" + lessonId + "/signup");
  eq(first.status, 200, "inscrição do membro");
  eq(first.data.signupCount, 1, "1 inscrito");
  assert(first.data.signedUp === true, "membro deveria constar como inscrito");
  const again = await member.post("/api/lessons/" + lessonId + "/signup");
  eq(again.data.signupCount, 1, "reinscrição não deveria duplicar");

  // Visitante externo pelo link público, sem login
  const visitor = client();
  const info = await visitor.get("/api/lesson-signup/" + token);
  eq(info.status, 200, "página pública lê os dados da aula");
  eq(info.data.title, "Aula 01 — Modelo de negócio", "título na página pública");
  eq((await visitor.post("/api/lesson-signup/" + token, { name: "Semsobrenome", phone: "21999998888" })).status, 400, "nome sem sobrenome recusado");
  eq((await visitor.post("/api/lesson-signup/" + token, { name: "Joana Silva", phone: "123" })).status, 400, "telefone curto recusado");
  const ext = await visitor.post("/api/lesson-signup/" + token, {
    name: "Joana Silva",
    email: "joana@exemplo.com",
    phone: "(21) 99999-8888",
  });
  eq(ext.status, 200, "inscrição do visitante");
  const dup = await visitor.post("/api/lesson-signup/" + token, {
    name: "Joana Silva Sobrenome",
    email: "joana@exemplo.com",
    phone: "(21) 99999-8888",
  });
  eq(dup.status, 200, "reenvio aceito");

  const adminView = await admin.get("/api/lessons");
  const l = adminView.data.lessons.find((x) => x.id === lessonId);
  eq(l.signups.length, 2, "diretoria vê 1 membro + 1 visitante (sem duplicata por e-mail)");
  assert(l.signups.some((s) => s.type === "member"), "inscrição de membro registrada");
  assert(l.signups.some((s) => s.type === "external" && s.phone), "visitante registrado com contato");

  const memberView = await member.get("/api/lessons");
  const lm = memberView.data.lessons.find((x) => x.id === lessonId);
  assert(!("signups" in lm), "membro não deveria ver a lista nominal");
  assert(!("signupToken" in lm), "membro não deveria ver o token público");
  eq(lm.signupCount, 2, "membro vê só a contagem");

  eq((await admin.post("/api/lessons/" + lessonId + "/signups-open", { open: false })).status, 200, "diretor fecha inscrições");
  eq((await visitor.post("/api/lesson-signup/" + token, { name: "Outra Pessoa", phone: "21988887777" })).status, 423, "link fechado não aceita mais");

  const qr = await admin.get("/api/lessons/" + lessonId + "/signup-qr");
  eq(qr.status, 200, "QR de inscrição");
  assert(String(qr.data).includes("<svg"), "QR deveria ser SVG");

  await admin.del("/api/lessons/" + lessonId);
});

// ---- Papéis vivos e persistência ----

test("papel vem do cadastro, não da sessão: membro desativado perde acesso na hora", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const created = await admin.post("/api/admin/import-members", {
    rows: [{ name: "Temporario Teste", code: "TESTE123", cargo: "Membro" }],
  });
  eq(created.status, 200, "import de membro de teste");
  const order = created.data.created[0].order;

  const tmp = client();
  await tmp.login(order, "TESTE123");
  await tmp.post("/api/set-password", { password: "senha-temp" });
  eq((await tmp.get("/api/members")).status, 200, "membro novo acessa a API");

  // Desativa direto no volume, como faria uma edição administrativa
  const signupsPath = path.join(volumeDir, "signups.json");
  const signups = JSON.parse(fs.readFileSync(signupsPath, "utf8"));
  signups.members.find((m) => m.order === order).active = false;
  fs.writeFileSync(signupsPath, JSON.stringify(signups, null, 2));

  eq((await tmp.get("/api/members")).status, 401, "sessão aberta deveria cair ao desativar o membro");
  eq((await tmp.get("/api/meetings")).status, 401, "nenhuma rota deveria aceitar membro desativado");
});

test("escrita do volume é atômica e deixa .bak recuperável", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  // Parte de um mural vazio: o .bak é sempre "o estado anterior à última
  // escrita", então a contagem só faz sentido com o ponto de partida conhecido.
  for (const e of (await admin.get("/api/events")).data.events) await admin.del("/api/events/" + e.id);

  const eventsPath = path.join(volumeDir, "events.json");
  await admin.post("/api/events", { title: "Primeiro aviso", date: "2026-08-20" });
  const second = await admin.post("/api/events", { title: "Segundo aviso", date: "2026-08-21" });

  assert(fs.existsSync(eventsPath + ".bak"), "deveria existir .bak depois da segunda escrita");
  assert(!fs.existsSync(eventsPath + ".tmp"), "o .tmp não deveria sobrar");
  const bak = JSON.parse(fs.readFileSync(eventsPath + ".bak", "utf8"));
  eq(bak.events.length, 1, ".bak deveria conter a versão anterior");
  const live = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
  eq(live.events.length, 2, "arquivo vivo com as duas versões");

  await admin.del("/api/events/" + second.data.event.id);
  for (const e of (await admin.get("/api/events")).data.events) await admin.del("/api/events/" + e.id);
});

test("JSON corrompido no volume cai no .bak em vez de derrubar o app", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  await admin.post("/api/events", { title: "Aviso antes da corrupção", date: "2026-08-22" });
  await admin.post("/api/events", { title: "Aviso depois", date: "2026-08-23" });

  const eventsPath = path.join(volumeDir, "events.json");
  fs.writeFileSync(eventsPath, '{"events": [{"title": "trunca'); // simula kill no meio da escrita
  const r = await admin.get("/api/events");
  eq(r.status, 200, "leitura deveria sobreviver ao arquivo truncado");
  assert(r.data.events.length >= 1, "deveria recuperar os eventos do .bak");

  for (const e of r.data.events) await admin.del("/api/events/" + e.id);
});

test("sessão sobrevive a restart do processo (store no volume)", async () => {
  const c = client();
  eq((await c.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login do membro");
  eq((await c.get("/api/members")).status, 200, "sessão vale antes do restart");

  // Espera o flush periódico (1s) e mata sem cerimônia — no Windows o
  // SIGTERM do handler não chega, então isto exercita o pior caso: queda seca,
  // recuperando só o que já estava no volume.
  await new Promise((r) => setTimeout(r, 1400));
  server.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  await startServer();

  const after = await c.get("/api/members");
  eq(after.status, 200, "a mesma sessão deveria continuar valendo depois do restart");
});

// ---- Gate da imersão ----

test("acervo da imersão segue restrito a quem participou", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const created = await admin.post("/api/admin/import-members", {
    rows: [{ name: "Novato Semimersao", code: "NOVATO12", cargo: "Membro" }],
  });
  const order = created.data.created[0].order;
  const novato = client();
  await novato.login(order, "NOVATO12");
  await novato.post("/api/set-password", { password: "senha-novato" });

  for (const route of ["/api/legacy", "/api/companies", "/api/badges", "/api/expenses", "/api/gallery", "/api/expenses/pix"]) {
    eq((await novato.get(route)).status, 403, "membro novo não deveria acessar " + route);
  }
  eq((await novato.get("/api/lessons")).status, 200, "aulas da liga são de todo membro");
  eq((await novato.get("/api/events")).status, 200, "mural é de todo membro");
});

async function main() {
  setupVolume();
  await startServer();
  console.log("E2E rodando em " + BASE + " (volume: " + volumeDir + ")\n");

  for (const t of tests) {
    try {
      await t.fn();
      results.pass += 1;
      console.log("  ok   " + t.name);
    } catch (err) {
      results.fail += 1;
      console.log("  FAIL " + t.name + "\n         " + err.message);
    }
  }

  console.log("\n" + results.pass + " passaram, " + results.fail + " falharam");
  stopServer();
  process.exit(results.fail ? 1 : 0);
}

process.on("unhandledRejection", (err) => {
  console.error("Erro não tratado:", err);
  stopServer();
  process.exit(1);
});

main().catch((err) => {
  console.error(err);
  stopServer();
  process.exit(1);
});
