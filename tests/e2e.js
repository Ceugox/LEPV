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

// Todo evento agora exige local e horário no cadastro.
const EV_LOCAL = { time: "19:00", location: "Auditório do IME" };
// E o formulário público exige os campos do IME de todo inscrito externo.
const FORM_IME = { turma: "XXIX", especialidade: "Computação", idade: 21, awareLocation: true, awareTime: true };

let volumeDir;
let server;
const results = { pass: 0, fail: 0 };

// Função e não constante: volumeDir só recebe valor no setup.
const signupsFile = () => path.join(volumeDir, "signups.json");
const readSignupsStore = () => JSON.parse(fs.readFileSync(signupsFile(), "utf8"));

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

  // Formatos antigos (reunião e aula) plantados de propósito: o boot precisa
  // migrá-los para eventos sem perder presença, materiais nem inscrições.
  fs.writeFileSync(
    path.join(volumeDir, "meetings.json"),
    JSON.stringify(
      {
        meetings: [
          {
            id: "r-legado-1",
            title: "Reunião antiga da liga",
            date: "2026-07-15",
            open: true,
            codes: ["ABC123"],
            qrToken: "tokenlegado1",
            memberAttendance: [1, MEMBER_ORDER],
            visitorAttendance: ["v-legado-1"],
            createdBy: 1,
            createdAt: "2026-07-15T12:00:00.000Z",
          },
        ],
        visitors: [{ id: "v-legado-1", name: "Visitante Antigo", email: "antigo@x.com", phone: "21911112222" }],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(volumeDir, "lessons.json"),
    JSON.stringify(
      {
        lessons: [
          {
            id: "a-legado-1",
            title: "Aula antiga da liga",
            date: "2026-07-18",
            description: "Conteúdo que não pode sumir na migração.",
            materials: [{ id: "m-legado-1", type: "link", title: "Slides antigos", url: "https://exemplo.com/antigo" }],
            signupsOpen: false,
            signupToken: "tokeninscricaolegado",
            signups: [{ type: "member", order: MEMBER_ORDER, name: "Membro Antigo", at: "2026-07-18T12:00:00.000Z" }],
            createdBy: 1,
            createdAt: "2026-07-18T12:00:00.000Z",
          },
        ],
      },
      null,
      2
    )
  );
}

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: ROOT,
      // TRAVEL_ESTIMATE=off: o e2e não pode depender de Nominatim/OSRM na rede.
      // (o teste de trajeto longo sobrepõe com fixed:N, ainda sem rede)
      // PUBLIC_FORM_MAX alto: a suíte inteira dispara do mesmo IP.
      env: {
        ...process.env,
        PORT: String(PORT),
        RAILWAY_VOLUME_MOUNT_PATH: volumeDir,
        SESSION_SECRET: "e2e",
        TRAVEL_ESTIMATE: "off",
        PUBLIC_FORM_MAX: "500",
        ...(extraEnv || {}),
      },
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
    patch: (u, b) => req("PATCH", u, b),
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

test("/api/members não expõe telefone nem flags de admin", async () => {
  const c = client();
  await c.login(MEMBER_ORDER, MEMBER_PASS);
  const r = await c.get("/api/members");
  eq(r.status, 200, "roster");
  for (const m of r.data) {
    assert(!("pix" in m), "não deveria existir pix (membro " + m.order + ")");
    assert(!("phone" in m), "não deveria vazar phone (membro " + m.order + ")");
    assert(!("admin" in m), "não deveria vazar flag admin (membro " + m.order + ")");
    assert(!("superadmin" in m), "não deveria vazar flag superadmin (membro " + m.order + ")");
  }
});

test("nenhuma chave Pix sobrou no cadastro", async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "members.json"), "utf8"));
  const comPix = seed.filter((m) => m.pix).map((m) => m.order);
  eq(comPix.length, 0, "members.json não deveria ter pix (sobrou em: " + comPix.join(",") + ")");
});

test("as rotas de custo da viagem não existem mais", async () => {
  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  for (const route of ["/api/expenses", "/api/expenses/pix"]) {
    eq((await member.get(route)).status, 404, route + " deveria ter sido removida");
  }
  eq((await member.post("/api/expenses/settle", { to: 3, amountCents: 100 })).status, 404, "acerto via Pix removido");
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  eq((await admin.post("/api/pin-poll/register-all")).status, 404, "registro em lote do bóton removido");
});

test("contatos dos membros só para a diretoria", async () => {
  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await member.get("/api/members/contacts")).status, 403, "membro comum não vê contatos");

  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const contacts = await admin.get("/api/members/contacts");
  eq(contacts.status, 200, "diretoria vê contatos");
  assert(contacts.data.every((m) => "phone" in m), "contatos deveriam trazer phone");
});

test("enquete do bóton continua registrando sem gerar dívida", async () => {
  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await member.post("/api/pin-poll", { want: true })).status, 200, "resposta da enquete");
  const poll = await member.get("/api/pin-poll");
  assert(poll.data.answered === true && poll.data.want === true, "resposta deveria ficar registrada");
  assert(!fs.existsSync(path.join(volumeDir, "expenses.json")), "não deveria criar store de despesas");
});

test("anônimo não passa dos endpoints públicos", async () => {
  const c = client();
  eq((await c.get("/api/members")).status, 401, "roster exige login");
  eq((await c.get("/api/events")).status, 401, "eventos exigem login");
  eq((await c.get("/api/events")).status, 401, "eventos exigem login");
  eq((await c.get("/api/badges")).status, 401, "selos exigem login");
  eq((await c.get("/api/members-public")).status, 200, "seletor de login é público");
});

// ---- Mural de eventos ----

// ---- Inscrições por aula ----

// ---- Eventos: aviso → inscrição → presença ----

test("evento nasce como aviso e todo membro enxerga", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const criado = await admin.post("/api/events", {
    type: "aula",
    title: "Aula 01 — Modelagem de negócio",
    text: "Traga o caso da sua empresa favorita.",
    date: hoje,
    ...EV_LOCAL,
  });
  eq(criado.status, 200, "criação do evento");
  const ev = criado.data.event;
  assert(ev.codes && ev.codes.length === 1, "evento já nasce com um código de presença");
  assert(ev.qrToken, "evento já nasce com token de QR");
  assert(ev.signupsOpen === true && ev.signupToken, "o formulário de inscrição nasce publicado junto com o aviso");
  eq(ev.location, "Auditório do IME", "local gravado");
  eq(ev.time, "19:00", "horário gravado");

  // Local e horário são obrigatórios no cadastro.
  eq((await admin.post("/api/events", { title: "Sem local", date: hoje, time: "19:00" })).status, 400, "sem local é recusado");
  eq((await admin.post("/api/events", { title: "Sem horário", date: hoje, location: "IME" })).status, 400, "sem horário é recusado");

  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  const lista = await member.get("/api/events");
  const visto = lista.data.events.find((e) => e.id === ev.id);
  assert(visto, "membro deveria ver o evento");
  eq(visto.title, "Aula 01 — Modelagem de negócio", "título");
  assert(!("codes" in visto), "membro não deveria ver os códigos");
  assert(!("signups" in visto), "membro não deveria ver a lista de inscritos");

  eq((await member.post("/api/events", { title: "Pirata" })).status, 403, "membro não cria evento");
  await admin.del("/api/events/" + ev.id);
});

test("filtro por tipo devolve só o tipo pedido", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const a = await admin.post("/api/events", { type: "aula", title: "Aula de filtro", date: "2026-09-10", ...EV_LOCAL });
  const v = await admin.post("/api/events", { type: "visita", title: "Visita de filtro", date: "2026-09-11", ...EV_LOCAL });

  const aulas = await admin.get("/api/events?type=aula");
  assert(aulas.data.events.every((e) => e.type === "aula"), "só aulas");
  assert(aulas.data.events.some((e) => e.id === a.data.event.id), "a aula criada aparece");
  assert(!aulas.data.events.some((e) => e.id === v.data.event.id), "a visita não aparece no filtro de aulas");

  await admin.del("/api/events/" + a.data.event.id);
  await admin.del("/api/events/" + v.data.event.id);
});

test("inscrição com vagas: confirma, lota, faz fila e promove quem esperava", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const ev = (await admin.post("/api/events", { type: "visita", title: "Visita com 1 vaga", date: "2026-09-20", ...EV_LOCAL })).data.event;

  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);

  const aberto = await admin.post("/api/events/" + ev.id + "/signups-open", { open: true, capacity: 1 });
  eq(aberto.status, 200, "diretor limita as inscrições a 1 vaga");
  const token = aberto.data.event.signupToken;
  assert(token, "o token público existe desde a criação");

  const inscrito = await member.post("/api/events/" + ev.id + "/signup");
  eq(inscrito.data.event.myStatus, "confirmed", "membro pega a única vaga");
  eq(inscrito.data.event.seatsLeft, 0, "sem vagas restantes");

  // Visitante externo chega com a sala cheia: vai para a fila.
  const visitante = client();
  const info = await visitante.get("/api/event-signup/" + token);
  eq(info.data.seatsLeft, 0, "página pública mostra lotado");
  const fila = await visitante.post("/api/event-signup/" + token, {
    name: "Joana Silva",
    email: "joana@exemplo.com",
    phone: "21999998888",
    ...FORM_IME,
  });
  eq(fila.data.status, "waitlist", "visitante entra na fila de espera");

  // O membro cancela e a vaga puxa quem estava esperando.
  await member.del("/api/events/" + ev.id + "/signup");
  const depois = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  const joana = depois.signups.find((s) => s.name === "Joana Silva");
  eq(joana.status, "confirmed", "quem estava na fila deveria ser promovido");
  eq(depois.signupCount, 1, "uma vaga ocupada");
  eq(depois.waitlistCount, 0, "fila vazia");

  // Encerrar as inscrições fecha o formulário para todo mundo.
  await admin.post("/api/events/" + ev.id + "/signups-open", { open: false });
  eq((await member.post("/api/events/" + ev.id + "/signup")).status, 423, "inscrição encerrada recusa membro");
  eq((await visitante.post("/api/event-signup/" + token, { name: "Tarde Demais", email: "t@x.com", phone: "21900000000", ...FORM_IME })).status, 423, "e recusa visitante");

  await admin.del("/api/events/" + ev.id);
});

test("aumentar o número de vagas promove a fila inteira", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const ev = (await admin.post("/api/events", { type: "social", title: "Happy hour", date: "2026-09-25", ...EV_LOCAL })).data.event;
  const aberto = await admin.post("/api/events/" + ev.id + "/signups-open", { open: true, capacity: 1 });
  const token = aberto.data.event.signupToken;

  const v1 = client(), v2 = client();
  await v1.post("/api/event-signup/" + token, { name: "Ana Prima", email: "ana@x.com", phone: "21988887777", ...FORM_IME });
  await v2.post("/api/event-signup/" + token, { name: "Bruno Segundo", email: "bruno@x.com", phone: "21977776666", ...FORM_IME });
  let atual = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  eq(atual.waitlistCount, 1, "o segundo deveria estar na fila");

  await admin.post("/api/events/" + ev.id + "/signups-open", { open: true, capacity: 5 });
  atual = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  eq(atual.waitlistCount, 0, "ampliar as vagas esvazia a fila");
  eq(atual.signupCount, 2, "os dois ficam confirmados");

  await admin.del("/api/events/" + ev.id);
});

test("formulário público exige os campos do IME e o evento aberto aparece na home", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const ev = (await admin.post("/api/events", {
    type: "visita",
    title: "Visita com formulário",
    date: "2027-01-15",
    time: "09:30",
    location: "Av. Faria Lima, 4440 — São Paulo",
  })).data.event;

  const visitante = client();
  const info = await visitante.get("/api/event-signup/" + ev.signupToken);
  assert(Array.isArray(info.data.turmas) && info.data.turmas.includes("XXVIII"), "o formulário recebe a lista fechada de turmas");
  assert(info.data.especialidades.includes("Cartografia"), "e a de especialidades");
  eq(info.data.time, "09:30", "horário exposto no formulário");
  eq(info.data.location, "Av. Faria Lima, 4440 — São Paulo", "local exposto no formulário");

  const base = { name: "Cadete Completo", email: "cadete@ime.eb.br", phone: "21999990000", ...FORM_IME };
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, turma: "" })).status, 400, "sem turma é recusado");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, turma: "XXXI" })).status, 400, "turma fora da lista fechada é recusada");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, especialidade: "Astrologia" })).status, 400, "especialidade fora da lista é recusada");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, email: "sem-arroba" })).status, 400, "e-mail inválido é recusado");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, idade: "vinte" })).status, 400, "idade inválida é recusada");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, awareLocation: false })).status, 400, "sem ciência do local é recusado");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, { ...base, awareTime: false })).status, 400, "sem ciência do horário é recusado");
  eq((await visitante.post("/api/event-signup/" + ev.signupToken, base)).status, 200, "com tudo preenchido a inscrição entra");

  const visto = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  const s = visto.signups.find((x) => x.name === "Cadete Completo");
  eq(s.turma, "XXIX", "turma gravada na inscrição");
  eq(s.especialidade, "Computação", "especialidade gravada");
  eq(s.idade, 21, "idade gravada");

  // Vitrine pública: o evento com inscrições abertas vai à página principal.
  const pub = await client().get("/api/public-events");
  eq(pub.status, 200, "a vitrine é pública, sem login");
  const naHome = pub.data.events.find((e) => e.title === "Visita com formulário");
  assert(naHome, "evento aberto aparece na home");
  assert(naHome.signupUrl.indexOf("/inscricao.html?t=") === 0, "com o link do formulário");
  assert(!("qrToken" in naHome) && !("codes" in naHome) && !("signups" in naHome), "sem vazar presença nem lista nominal");

  // Encerrou as inscrições, sai da home.
  await admin.post("/api/events/" + ev.id + "/signups-open", { open: false });
  const depois = await client().get("/api/public-events");
  assert(!depois.data.events.some((e) => e.title === "Visita com formulário"), "evento fechado some da home");

  await admin.del("/api/events/" + ev.id);
});

test("presença só vale no dia: código e QR recusam fora da data", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const futuro = await admin.post("/api/events", { type: "reuniao", title: "Reunião de outubro", date: "2026-10-30", ...EV_LOCAL });
  const ev = futuro.data.event;
  eq(ev.attendanceState, "agendada", "evento futuro nasce agendado");

  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  const cedo = await member.post("/api/events/checkin", { code: ev.codes[0] });
  eq(cedo.status, 423, "check-in antes do dia deveria ser recusado");

  const visitante = client();
  const info = await visitante.get("/api/presence/" + ev.qrToken);
  eq(info.data.open, false, "QR fechado antes do dia");
  eq(info.data.state, "agendada", "estado agendada");
  const tentativa = await visitante.post("/api/presence/" + ev.qrToken, {
    name: "Carlos Cedo",
    phone: "21966665555",
  });
  eq(tentativa.status, 423, "visitante não registra presença antes do dia");

  await admin.del("/api/events/" + ev.id);
});

test("no dia do evento a presença abre sozinha, sem ninguém apertar nada", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const ev = (await admin.post("/api/events", { type: "reuniao", title: "Reunião de hoje", date: hoje, ...EV_LOCAL })).data.event;
  eq(ev.attendanceState, "aberta", "evento de hoje já está com presença aberta");

  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  const check = await member.post("/api/events/checkin", { code: ev.codes[0] });
  eq(check.status, 200, "check-in do membro no dia");
  assert(check.data.event.present === true, "membro consta como presente");

  const repetido = await member.post("/api/events/checkin", { code: ev.codes[0] });
  eq(repetido.data.event.membersPresent, 1, "check-in repetido não duplica");

  const visitante = client();
  const presenca = await visitante.post("/api/presence/" + ev.qrToken, {
    name: "Daniela Visita",
    email: "dani@exemplo.com",
    phone: "21955554444",
  });
  eq(presenca.status, 200, "visitante registra presença pelo QR no dia");
  eq(presenca.data.visits, 1, "primeira presença do visitante");

  const visao = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  eq(visao.membersPresent, 1, "1 membro presente");
  eq(visao.visitorsPresent, 1, "1 visitante presente");
  assert(visao.visitors[0].name === "Daniela Visita", "diretoria vê o visitante pelo nome");

  await admin.del("/api/events/" + ev.id);
});

test("diretoria pode encerrar a presença antes e reabrir depois", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const ev = (await admin.post("/api/events", { type: "reuniao", title: "Reunião com override", date: hoje, ...EV_LOCAL })).data.event;

  const fechar = await admin.post("/api/events/" + ev.id + "/attendance-open", { open: false });
  eq(fechar.data.attendanceState, "encerrada", "override fecha no próprio dia");
  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await member.post("/api/events/checkin", { code: ev.codes[0] })).status, 423, "código recusado com presença encerrada");

  const voltar = await admin.post("/api/events/" + ev.id + "/attendance-open", { open: null });
  eq(voltar.data.attendanceState, "aberta", "devolver ao automático reabre no dia do evento");
  eq((await member.post("/api/events/checkin", { code: ev.codes[0] })).status, 200, "check-in volta a funcionar");

  await admin.del("/api/events/" + ev.id);
});

test("quem se inscreveu e apareceu fica marcado como presente", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const ev = (await admin.post("/api/events", { type: "aula", title: "Aula com lista", date: hoje, ...EV_LOCAL })).data.event;
  const token = ev.signupToken;

  const visitante = client();
  await visitante.post("/api/event-signup/" + token, { name: "Elisa Presente", email: "elisa@x.com", phone: "21944443333", ...FORM_IME });
  await visitante.post("/api/event-signup/" + token, { name: "Faltoso Silva", email: "faltoso@x.com", phone: "21933332222", ...FORM_IME });
  await visitante.post("/api/presence/" + ev.qrToken, { name: "Elisa Presente", email: "elisa@x.com", phone: "21944443333" });

  const visao = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  const elisa = visao.signups.find((s) => s.name === "Elisa Presente");
  const faltoso = visao.signups.find((s) => s.name === "Faltoso Silva");
  assert(elisa.attended === true, "quem compareceu deveria estar marcado");
  assert(!faltoso.attended, "quem não veio não deveria estar marcado");

  await admin.del("/api/events/" + ev.id);
});

test("materiais e fotos do evento: diretoria publica, membro consome", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const ev = (await admin.post("/api/events", { type: "aula", title: "Aula com material", date: "2026-09-30", ...EV_LOCAL })).data.event;

  const foto = await admin.post("/api/events/" + ev.id + "/photos", PNG_1PX, { "Content-Type": "image/png" });
  eq(foto.status, 200, "upload de foto");
  const link = await admin.post("/api/events/" + ev.id + "/materials/link", { title: "Slides", url: "https://exemplo.com/slides" });
  eq(link.status, 200, "material do tipo link");

  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  const visto = (await member.get("/api/events")).data.events.find((e) => e.id === ev.id);
  eq(visto.materials.length, 1, "membro vê o material");
  eq(visto.photos.length, 1, "membro vê a foto");
  eq((await member.get(visto.photos[0].url)).status, 200, "membro carrega a foto");
  eq((await client().get(visto.photos[0].url)).status, 401, "foto não é pública");
  eq((await member.post("/api/events/" + ev.id + "/materials/link", { title: "x", url: "https://x.com" })).status, 403, "membro não anexa material");

  await admin.del("/api/events/" + ev.id);
});

test("migração trouxe reuniões e aulas antigas como eventos", async () => {
  // O volume de teste é semeado com os formatos antigos antes do servidor subir
  // (ver setupVolume): o boot precisa convertê-los sem perder presença.
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const eventos = (await admin.get("/api/events")).data.events;

  const reuniaoAntiga = eventos.find((e) => e.id === "r-legado-1");
  assert(reuniaoAntiga, "a reunião antiga deveria ter virado evento");
  eq(reuniaoAntiga.type, "reuniao", "tipo reunião");
  eq(reuniaoAntiga.membersPresent, 2, "presença dos membros preservada");
  eq(reuniaoAntiga.visitorsPresent, 1, "presença do visitante preservada");
  assert(reuniaoAntiga.codes.includes("ABC123"), "código antigo preservado");

  const aulaAntiga = eventos.find((e) => e.id === "a-legado-1");
  assert(aulaAntiga, "a aula antiga deveria ter virado evento");
  eq(aulaAntiga.type, "aula", "tipo aula");
  eq(aulaAntiga.materials.length, 1, "material da aula preservado");
  eq(aulaAntiga.signupCount, 1, "inscrição da aula preservada");

  // Os arquivos de origem saem de circulação, mas ficam no volume como cópia.
  assert(!fs.existsSync(path.join(volumeDir, "meetings.json")), "meetings.json deveria ter sido renomeado");
  assert(fs.existsSync(path.join(volumeDir, "meetings.json.migrated")), "o original deveria virar .migrated");
  assert(!fs.existsSync(path.join(volumeDir, "lessons.json")), "lessons.json deveria ter sido renomeado");
});

test("CRUD completo: editar o evento, remover inscrição, presença, código e o próprio evento", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let ev = (await admin.post("/api/events", { type: "reuniao", title: "Reunião de teste", date: hoje, ...EV_LOCAL })).data.event;

  // Update: tipo, título, data, texto, local e horário
  const editado = await admin.patch("/api/events/" + ev.id, {
    type: "visita",
    title: "Visita à Mirow",
    date: "2026-10-05",
    text: "Encontro no escritório às 14h.",
    time: "14:00",
    location: "Escritório da Mirow — Botafogo",
  });
  eq(editado.status, 200, "edição do evento");
  eq(editado.data.event.type, "visita", "tipo atualizado");
  eq(editado.data.event.title, "Visita à Mirow", "título atualizado");
  eq(editado.data.event.date, "2026-10-05", "data atualizada");
  eq(editado.data.event.text, "Encontro no escritório às 14h.", "texto atualizado");
  eq(editado.data.event.time, "14:00", "horário atualizado");
  eq(editado.data.event.location, "Escritório da Mirow — Botafogo", "local atualizado");
  eq((await admin.patch("/api/events/" + ev.id, { title: "  " })).status, 400, "título vazio recusado");
  eq((await admin.patch("/api/events/" + ev.id, { location: "  " })).status, 400, "local vazio recusado");
  eq((await admin.patch("/api/events/" + ev.id, { time: "19h" })).status, 400, "horário fora do formato recusado");

  // Vagas fazem parte da edição do evento, sem passar pelo toggle de inscrições
  const comVagas = await admin.patch("/api/events/" + ev.id, { capacity: 2 });
  eq(comVagas.status, 200, "edição de vagas");
  eq(comVagas.data.event.capacity, 2, "vagas atualizadas pela edição do evento");
  eq((await admin.patch("/api/events/" + ev.id, { capacity: null })).data.event.capacity, null, "vagas voltam a ilimitado");
  eq((await admin.patch("/api/events/" + ev.id, { capacity: 0 })).data.event.capacity, null, "zero vira ilimitado");

  const member = client();
  await member.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await member.patch("/api/events/" + ev.id, { title: "Pirata" })).status, 403, "membro não edita evento");

  // Delete de inscrição, com promoção da fila
  const token = (await admin.post("/api/events/" + ev.id + "/signups-open", { open: true, capacity: 1 })).data.event.signupToken;
  const visitante = client();
  await visitante.post("/api/event-signup/" + token, { name: "Primeiro Inscrito", email: "um@x.com", phone: "21911112222", ...FORM_IME });
  await visitante.post("/api/event-signup/" + token, { name: "Segundo Espera", email: "dois@x.com", phone: "21933334444", ...FORM_IME });
  let atual = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  const primeiro = atual.signups.find((s) => s.name === "Primeiro Inscrito");
  assert(primeiro.id, "inscrição deveria ter id próprio");

  const removida = await admin.del("/api/events/" + ev.id + "/signups/" + primeiro.id);
  eq(removida.status, 200, "remoção da inscrição");
  const segundo = removida.data.event.signups.find((s) => s.name === "Segundo Espera");
  eq(segundo.status, "confirmed", "quem estava na fila assume a vaga liberada");
  eq((await member.del("/api/events/" + ev.id + "/signups/" + segundo.id)).status, 403, "membro não remove inscrição alheia");

  // Aumentar as vagas pela edição promove quem estava na fila
  await visitante.post("/api/event-signup/" + token, { name: "Terceiro Fila", email: "tres@x.com", phone: "21977778888", ...FORM_IME });
  atual = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  eq(atual.signups.find((s) => s.name === "Terceiro Fila").status, "waitlist", "com 1 vaga ocupada, o terceiro espera");
  const maisVagas = await admin.patch("/api/events/" + ev.id, { capacity: 3 });
  eq(maisVagas.data.event.signups.find((s) => s.name === "Terceiro Fila").status, "confirmed", "aumentar vagas pela edição promove a fila");

  // Delete de código, com o último protegido
  eq((await admin.del("/api/events/" + ev.id + "/codes/" + atual.codes[0])).status, 400, "não dá para remover o único código");
  const comDois = await admin.post("/api/events/" + ev.id + "/codes");
  const removidoCodigo = await admin.del("/api/events/" + ev.id + "/codes/" + comDois.data.codes[0]);
  eq(removidoCodigo.status, 200, "remoção de código extra");
  eq(removidoCodigo.data.codes.length, 1, "sobrou um código");

  // Delete de presença de visitante
  await admin.patch("/api/events/" + ev.id, { date: hoje });
  await visitante.post("/api/presence/" + ev.qrToken, { name: "Visita Errada", email: "errada@x.com", phone: "21955556666" });
  atual = (await admin.get("/api/events")).data.events.find((e) => e.id === ev.id);
  eq(atual.visitorsPresent, 1, "presença registrada");
  const semVisitante = await admin.del("/api/events/" + ev.id + "/visitors/" + atual.visitors[0].id);
  eq(semVisitante.status, 200, "remoção da presença do visitante");
  eq(semVisitante.data.event.visitorsPresent, 0, "presença desfeita");

  // Delete do evento
  eq((await member.del("/api/events/" + ev.id)).status, 403, "membro não apaga evento");
  eq((await admin.del("/api/events/" + ev.id)).status, 200, "diretoria apaga o evento");
  const depois = (await admin.get("/api/events")).data.events;
  assert(!depois.some((e) => e.id === ev.id), "evento removido some da lista");
  eq((await admin.del("/api/events/" + ev.id)).status, 404, "apagar de novo devolve 404");
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
  eq((await tmp.get("/api/events")).status, 401, "nenhuma rota deveria aceitar membro desativado");
});

test("escrita do volume é atômica e deixa .bak recuperável", async () => {
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  // Parte de um mural vazio: o .bak é sempre "o estado anterior à última
  // escrita", então a contagem só faz sentido com o ponto de partida conhecido.
  for (const e of (await admin.get("/api/events")).data.events) await admin.del("/api/events/" + e.id);

  const eventsPath = path.join(volumeDir, "events.json");
  await admin.post("/api/events", { title: "Primeiro aviso", date: "2026-08-20", ...EV_LOCAL });
  const second = await admin.post("/api/events", { title: "Segundo aviso", date: "2026-08-21", ...EV_LOCAL });

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
  await admin.post("/api/events", { title: "Aviso antes da corrupção", date: "2026-08-22", ...EV_LOCAL });
  await admin.post("/api/events", { title: "Aviso depois", date: "2026-08-23", ...EV_LOCAL });

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

test("trajeto acima de 30 min pede confirmação antes de gravar", async () => {
  // Sobe o servidor com estimativa fixa de 45 min — acima do limite, sem rede.
  server.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  await startServer({ TRAVEL_ESTIMATE: "fixed:45" });

  const admin = client();
  eq((await admin.login(1, ADMIN_PASS)).status, 200, "login do superadmin");

  const barrado = await admin.post("/api/events", { title: "Evento longe", date: "2030-01-10", ...EV_LOCAL });
  eq(barrado.status, 409, "criação sem confirmTravel deveria parar no aviso");
  eq(barrado.data.error, "travel_confirm", "erro esperado");
  eq(barrado.data.travelMinutes, 45, "aviso informa a estimativa");

  const criado = await admin.post("/api/events", { title: "Evento longe", date: "2030-01-10", confirmTravel: true, ...EV_LOCAL });
  eq(criado.status, 200, "com confirmTravel:true grava");
  eq(criado.data.event.travelMinutes, 45, "estimativa gravada no evento");
  const id = criado.data.event.id;

  const editBarrado = await admin.patch("/api/events/" + id, { location: "Outro lugar distante" });
  eq(editBarrado.status, 409, "edição de local sem confirmTravel também para");
  eq(editBarrado.data.error, "travel_confirm", "erro esperado na edição");
  const editOk = await admin.patch("/api/events/" + id, { location: "Outro lugar distante", confirmTravel: true });
  eq(editOk.status, 200, "edição confirmada grava");

  await admin.del("/api/events/" + id);

  // Devolve o servidor ao estado padrão da suíte.
  server.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  await startServer();
});

// ---- Base de visitantes (aba Membros) ----

test("base de visitantes consolida formulário e presença numa ficha só (diretoria)", async () => {
  eq((await client().get("/api/visitors")).status, 401, "anônimo não vê a base");
  const m = client();
  await m.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await m.get("/api/visitors")).status, 403, "membro comum não vê a base");

  const admin = client();
  await admin.login(1, ADMIN_PASS);
  // Evento hoje: a presença pelo QR abre sozinha no dia.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const criado = await admin.post("/api/events", { title: "Evento da base de visitantes", date: hoje, ...EV_LOCAL });
  const ev = criado.data.event;

  const anon = client();
  const insc = await anon.post("/api/event-signup/" + ev.signupToken, {
    name: "Visita Consolidada", email: "visita.consolidada@x.com", phone: "21988887777", ...FORM_IME,
  });
  eq(insc.status, 200, "inscrição pelo formulário público");
  const pres = await anon.post("/api/presence/" + ev.qrToken, {
    name: "Visita Consolidada", email: "visita.consolidada@x.com", phone: "21988887777",
  });
  eq(pres.status, 200, "presença pelo QR");

  const r = await admin.get("/api/visitors");
  eq(r.status, 200, "diretoria lê a base");
  const p = r.data.people.find((x) => x.email === "visita.consolidada@x.com");
  assert(p, "o visitante deveria estar na base");
  eq(p.signups.length, 1, "inscrição e presença viram UMA ficha, não duas");
  assert(p.signups[0].attended === true, "a inscrição ficou marcada como compareceu");
  eq(p.visits, 1, "presença contada");
  assert(p.turma === FORM_IME.turma, "dados do formulário na ficha");
  assert(typeof p.visitorId === "string", "ficha aponta o cadastro de visitante");

  // Apagar a ficha remove cadastro e presenças; a inscrição é registro do
  // evento e fica (some pela rota própria de inscrições).
  eq((await admin.del("/api/visitors/" + p.visitorId)).status, 200, "apagar ficha");
  eq((await admin.del("/api/visitors/" + p.visitorId)).status, 404, "apagar de novo é 404");
  const depois = (await admin.get("/api/visitors")).data.people.find((x) => x.email === "visita.consolidada@x.com");
  assert(depois && !depois.visitorId && depois.visits === 0, "presenças zeradas, inscrição preservada");

  await admin.del("/api/events/" + ev.id);
});

// ---- Monitoramento de acessos ----

test("painel de acessos é só do superadmin", async () => {
  eq((await client().get("/api/admin/access-log")).status, 401, "anônimo não lê o log");
  const m = client();
  await m.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await m.get("/api/admin/access-log")).status, 403, "membro comum não lê o log");
});

test("acessos registram visita, ping de aba e contadores do dia", async () => {
  // Página pública sem sessão entra no contador anônimo do dia.
  await client().get("/");

  const m = client();
  await m.login(MEMBER_ORDER, MEMBER_PASS);
  await m.get("/api/members");
  eq((await m.post("/api/ping", { tab: "eventos" })).status, 200, "ping do membro");

  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const r = await admin.get("/api/admin/access-log");
  eq(r.status, 200, "superadmin lê o log");

  const visit = r.data.visits.find((v) => v.order === MEMBER_ORDER && v.tabs.eventos);
  assert(visit, "a visita do membro deveria estar no log com a aba do ping");
  assert(visit.hits >= 2, "a visita deveria acumular as requisições");
  assert(typeof visit.device === "string" && visit.device.length > 0, "dispositivo registrado");
  assert(visit.start <= visit.last, "início e última atividade coerentes");

  const summary = r.data.members.find((x) => x.order === MEMBER_ORDER);
  assert(summary && summary.visits >= 1, "resumo por membro inclui o membro");
  assert(summary.minutes >= 1, "tempo somado nunca é zero");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const day = r.data.days[today];
  assert(day && day.logins >= 2, "logins do dia contados (membro + superadmin)");
  assert(day.public >= 1, "página pública anônima contada no dia");

  // O superadmin aparece online — acabou de fazer requisições.
  assert(r.data.online.some((v) => v.order === 1), "superadmin ativo deveria constar em online");
});

test("log de acessos sobrevive a restart (flush no volume)", async () => {
  const m = client();
  await m.login(MEMBER_ORDER, MEMBER_PASS);
  await m.get("/api/members");
  // Espera o flush periódico (5s) antes da queda seca.
  await new Promise((r) => setTimeout(r, 5600));
  server.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  await startServer();

  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const r = await admin.get("/api/admin/access-log");
  eq(r.status, 200, "log responde depois do restart");
  assert(r.data.members.some((x) => x.order === MEMBER_ORDER), "as visitas persistidas voltaram do volume");
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

  for (const route of ["/api/legacy", "/api/companies", "/api/badges", "/api/gallery", "/api/checklist", "/api/questions"]) {
    eq((await novato.get(route)).status, 403, "membro novo não deveria acessar " + route);
  }
  eq((await novato.get("/api/events")).status, 200, "eventos da liga são de todo membro");
  eq((await novato.get("/api/events")).status, 200, "mural é de todo membro");
});

// ---- Motor de resiliência ----

test("job de background que explode não derruba o server e fica registrado", async () => {
  server.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  // O gancho reproduz o incidente do 502: um job agendado que lança logo após
  // o boot, mais uma promise rejeitada sem catch.
  await startServer({ RESILIENCE_TEST: "on" });
  await new Promise((r) => setTimeout(r, 800));

  const h = await client().get("/health");
  eq(h.status, 200, "server deveria continuar de pé depois das falhas");
  assert(h.data.failures >= 2, "contador de falhas no /health");
  assert(h.data.lastFailureAt, "/health deveria apontar a última falha");

  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const r = await admin.get("/api/admin/failures");
  eq(r.status, 200, "painel de falhas do superadmin");
  assert(r.data.failures.some((f) => f.scope === "job:teste-resiliencia"), "falha do job registrada");
  assert(r.data.failures.some((f) => f.scope === "unhandledRejection"), "rejeição solta registrada");

  const m = client();
  await m.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await m.get("/api/admin/failures")).status, 403, "painel de falhas não é de membro comum");
});

test("histórico de falhas sobrevive a restart (failures.json no volume)", async () => {
  server.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  await startServer();
  const admin = client();
  await admin.login(1, ADMIN_PASS);
  const r = await admin.get("/api/admin/failures");
  eq(r.status, 200, "painel responde depois do restart");
  assert(r.data.failures.some((f) => f.scope === "job:teste-resiliencia"), "falhas persistidas voltaram do volume");
});

// ---------------------------------------------------------------------------
// Tags de interesse do membro
// ---------------------------------------------------------------------------

test("cadastro normaliza as tags: limite, tamanho e repetição", async () => {
  const c = client();
  const r = await c.post("/api/register", {
    name: "Fulano de Tal",
    course: "Computação",
    year: "2º ano",
    phone: "21999999999",
    password: "senha-boa",
    interests: ["IA", "ia", "  Tech  ", "", "a".repeat(40),
                "t1", "t2", "t3", "t4", "t5", "t6", "t7"],
  });
  eq(r.status, 200, "cadastro aceito");

  const pend = readSignupsStore().pending;
  const tags = pend[pend.length - 1].interests;
  eq(tags.length, 8, "no máximo 8 tags");
  eq(tags[0], "IA", "primeira tag preservada");
  assert(!tags.includes("ia"), "repetição ignorando caixa deveria sumir");
  eq(tags[1], "Tech", "espaços nas pontas deveriam sumir");
  eq(tags[2].length, 30, "tag longa deveria ser truncada em 30");
});

test("override de perfil no volume vence o seed", async () => {
  // MEMBER_ORDER é fundador: mora em data/members.json, do repositório, não no
  // volume. Sem o override, gravar nele seria perdido no próximo deploy.
  const store = readSignupsStore();
  store.profiles = [{ order: MEMBER_ORDER, interests: ["Robótica"] }];
  fs.writeFileSync(signupsFile(), JSON.stringify(store, null, 2));

  const c = client();
  eq((await c.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login do fundador");
  const r = await c.get("/api/members");
  eq(r.status, 200, "roster acessível");

  // /api/members devolve um array direto, não um envelope { members: [] }
  const eu = r.data.find((m) => m.order === MEMBER_ORDER);
  assert(eu, "fundador deveria estar no roster");
  eq(JSON.stringify(eu.interests), JSON.stringify(["Robótica"]),
     "o override do volume deveria vencer os interesses do seed");

  // limpa para não contaminar os casos seguintes
  const limpo = readSignupsStore();
  delete limpo.profiles;
  fs.writeFileSync(signupsFile(), JSON.stringify(limpo, null, 2));
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
