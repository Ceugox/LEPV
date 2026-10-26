// E2E da plataforma do hackathon (/hack). Sobe o server de verdade num volume
// ISOLADO, com e-mail gravado em arquivo (HACK_EMAIL_OUTBOX) em vez de enviado.
//
//   node tests/e2e-hack.js
//
// Cada teste roda na ordem declarada e pode depender do estado deixado pelos
// anteriores (é uma jornada: inscrição → link → portal → organização ...).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");

const ROOT = path.join(__dirname, "..");
const PORT = 4900 + (process.pid % 90);
const BASE = "http://127.0.0.1:" + PORT;
const ADMIN_PASS = "teste-superadmin-hack";
const BASE_NOW = "2026-10-24T15:00:00Z";
const MEMBER_PASS = "teste-membro-hack";

let volumeDir;
let outbox;
let pushOutbox;
let server;

function setupVolume() {
  volumeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lepv-hack-e2e-"));
  outbox = path.join(volumeDir, "outbox");
  pushOutbox = path.join(volumeDir, "push-outbox");
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "members.json"), "utf8"));
  fs.writeFileSync(
    path.join(volumeDir, "signups.json"),
    JSON.stringify({
      nextOrder: seed.reduce((m, x) => Math.max(m, x.order), 0) + 1,
      pending: [],
      members: [],
      credentials: [
        { order: 1, passwordHash: bcrypt.hashSync(ADMIN_PASS, 8) },
        { order: 2, passwordHash: bcrypt.hashSync(MEMBER_PASS, 8) },
      ],
    })
  );
}

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        RAILWAY_VOLUME_MOUNT_PATH: volumeDir,
        SESSION_SECRET: "e2e-hack",
        TRAVEL_ESTIMATE: "off",
        PUBLIC_FORM_MAX: "500",
        HACK_EMAIL_OUTBOX: outbox,
        RESEND_API_KEY: "",
        HACK_PUBLIC_URL: "https://lepv.example",
        HACK_PUSH_OUTBOX: pushOutbox,
        // Relógio fixo antes do evento: a suíte não pode mudar de resultado
        // quando o calendário real passar pelos horários agendados (30/10).
        HACK_NOW: BASE_NOW,
        ...(extraEnv || {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let up = false;
    const onData = (c) => {
      out += c.toString();
      if (!up && out.includes("rodando em")) {
        up = true;
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (code) => {
      if (!up) reject(new Error("servidor morreu (code " + code + "): " + out));
    });
    setTimeout(() => !up && reject(new Error("servidor não subiu em 15s: " + out)), 15000);
  });
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGKILL");
}

async function restartServer(extraEnv) {
  const exited = new Promise((r) => server.once("exit", r));
  stopServer();
  await exited;
  await startServer(extraEnv);
}

function client() {
  let cookie = "";
  async function req(method, url, body, extraHeaders) {
    const opts = { method, headers: Object.assign({}, extraHeaders || {}), redirect: "manual" };
    if (cookie) opts.headers.Cookie = cookie;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) {
        opts.body = body;
        opts.headers["Content-Type"] = "application/pdf";
      } else {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(BASE + url, opts);
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) cookie = c.split(";")[0];
    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (u) => req("GET", u),
    post: (u, b) => req("POST", u, b),
    patch: (u, b) => req("PATCH", u, b),
    put: (u, b) => req("PUT", u, b),
    del: (u) => req("DELETE", u),
    raw: req,
  };
}

const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const eq = (a, b, m) => {
  if (a !== b) throw new Error((m || "valor inesperado") + ": esperado " + JSON.stringify(b) + ", veio " + JSON.stringify(a));
};

// E-mails gravados no outbox, mais recentes por último.
function mails() {
  if (!fs.existsSync(outbox)) return [];
  return fs
    .readdirSync(outbox)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), "utf8")));
}
function lastLinkFor(email) {
  const m = mails().filter((x) => x.to === email).pop();
  if (!m) return null;
  const hit = /#t=([A-Za-z0-9_-]+)/.exec(m.text);
  return hit ? hit[1] : null;
}
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 4000);
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
}

function pushes() {
  if (!fs.existsSync(pushOutbox)) return [];
  return fs.readdirSync(pushOutbox).sort().map((f) => JSON.parse(fs.readFileSync(path.join(pushOutbox, f), "utf8")));
}
const FAKE_SUB = (n) => ({
  endpoint: "https://push.example.com/send/" + n + "-aaaaaaaaaaaaaaaaaaaa",
  keys: { p256dh: "B" + "a".repeat(86), auth: "c".repeat(22) },
});

// ---------- estado compartilhado da jornada ----------
const S = { admin: null, signupToken: null, people: {} };
const PARTICIPANTS = [
  { name: "Ana Participante", email: "ana@ex.com", phone: "(21) 99999-0001", temGrupo: "Não", consent: true },
  { name: "Bruno Participante", email: "bruno@ex.com", phone: "21999990002", temGrupo: "Sim", consent: false },
  { name: "Carla Participante", email: "carla@ex.com", phone: "21999990003", temGrupo: "Não", consent: true },
  { name: "Davi Participante", email: "davi@ex.com", phone: "21999990004", temGrupo: "Não", consent: false },
  { name: "Elisa Participante", email: "elisa@ex.com", phone: "21999990005", temGrupo: "Não", consent: false },
];

// Entra no portal pelo link do e-mail, como a pessoa faria.
async function enterAs(email) {
  const c = client();
  const before = lastLinkFor(email);
  const r = await c.post("/hack/api/access/request", { email });
  eq(r.status, 200, "pedido de link");
  const tok = await waitFor(() => {
    const t = lastLinkFor(email);
    return t && t !== before ? t : null;
  });
  assert(tok, "link não chegou no outbox para " + email);
  const k = await c.post("/hack/api/access/consume", { token: tok });
  eq(k.status, 200, "consumo do link de " + email);
  return c;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ================= módulo 1/2: inscrição, acesso, portal =================

test("prepara: diretoria cria o hackathon e 5 pessoas se inscrevem", async () => {
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200, "login admin");
  const d = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  const ev = await S.admin.post("/api/events", { type: "hackathon", title: "1º Hackathon LEPV", date: d, time: "15:00", location: "FGV", text: "Hackathon." });
  eq(ev.status, 200, "criação do evento");
  const pub = await client().get("/api/public-events");
  const h = pub.data.events.find((e) => e.type === "hackathon");
  S.signupToken = h.signupUrl.split("t=")[1];
  for (const p of PARTICIPANTS) {
    const r = await client().post("/api/event-signup/" + S.signupToken, {
      name: p.name, email: p.email, phone: p.phone, vinculo: "FGV", curso: "Economia", anoFaculdade: "3", temGrupo: p.temGrupo,
      consentPatrocinadores: p.consent, awareLocation: true, awareTime: true,
    });
    eq(r.status, 200, "inscrição de " + p.name + ": " + JSON.stringify(r.data));
  }
});

test("rotas: /hack/inscricao leva ao formulário do evento", async () => {
  const r = await client().get("/hack/inscricao");
  eq(r.status, 302);
  eq(r.headers.get("location"), "/inscricao.html?t=" + S.signupToken);
});

test("acesso: sem sessão a API recusa e as páginas abrem (casca sem dado)", async () => {
  const c = client();
  eq((await c.get("/hack/api/me")).status, 401);
  eq((await c.get("/hack/api/admin/people")).status, 401);
  for (const p of ["/hack/acesso", "/hack/portal", "/hack/organizacao"]) {
    const r = await c.get(p);
    eq(r.status, 200, p);
    assert(!/ana@ex\.com/.test(r.data), "casca não traz dado de pessoa");
  }
});

test("acesso: e-mail desconhecido recebe a mesma resposta e nenhum e-mail sai", async () => {
  const before = mails().length;
  const a = await client().post("/hack/api/access/request", { email: "ninguem@ex.com" });
  const b = await client().post("/hack/api/access/request", { email: "ana@ex.com" });
  eq(a.status, 200);
  eq(a.data.message, b.data.message, "resposta idêntica");
  await waitFor(() => mails().length > before);
  eq(mails().filter((m) => m.to === "ninguem@ex.com").length, 0, "nada para e-mail desconhecido");
});

test("acesso: link do e-mail entra uma vez, aponta para a base pública e não se repete", async () => {
  const tok = await waitFor(() => lastLinkFor("ana@ex.com"));
  const m = mails().filter((x) => x.to === "ana@ex.com").pop();
  assert(m.text.includes("https://lepv.example/hack/acesso#t="), "link usa HACK_PUBLIC_URL e fragmento");
  const c = client();
  eq((await c.post("/hack/api/access/consume", { token: tok })).status, 200);
  const me = await c.get("/hack/api/me");
  eq(me.status, 200);
  eq(me.data.me.email, "ana@ex.com");
  assert(me.data.me.roles.includes("participant"), "é participante");
  eq(me.data.perms.manage, false);
  eq((await client().post("/hack/api/access/consume", { token: tok })).status, 401, "segunda vez");
  S.people.ana = c;
});

test("acesso: QR é SVG sem dado pessoal e não autentica nada", async () => {
  const r = await S.people.ana.get("/hack/api/me/qr.svg");
  eq(r.status, 200);
  assert(String(r.headers.get("content-type")).includes("image/svg+xml"), "svg");
  assert(!/ana@ex|Ana/.test(r.data), "sem nome/e-mail no QR");
  eq(r.headers.get("cache-control"), "private, no-store");
});

test("acesso: participante não entra na organização", async () => {
  eq((await S.people.ana.get("/hack/api/admin/people")).status, 403);
  eq((await S.people.ana.post("/hack/api/admin/people", { name: "X Y", email: "x@y.com", roles: ["judge"] })).status, 403);
});

test("organização: diretoria da liga vê as pessoas sincronizadas da inscrição", async () => {
  const r = await S.admin.get("/hack/api/admin/people");
  eq(r.status, 200);
  const emails = r.data.people.map((p) => p.email);
  for (const p of PARTICIPANTS) assert(emails.includes(p.email), "falta " + p.email);
  const bruno = r.data.people.find((p) => p.email === "bruno@ex.com");
  eq(bruno.hasGroup, true, "temGrupo=Sim vira hasGroup");
  eq(bruno.consent, false);
  assert(!JSON.stringify(r.data).includes("qrToken"), "sem QR na visão da diretoria");
  S.people.ids = Object.fromEntries(r.data.people.map((p) => [p.email, p.id]));
});

test("organização: membro comum da liga não é diretoria", async () => {
  const m = client();
  eq((await m.post("/api/login", { order: 2, password: MEMBER_PASS })).status, 200);
  eq((await m.get("/hack/api/admin/people")).status, 401, "membro comum sem inscrição não é ator");
});

test("organização: cria jurado, gera link manual com atalho de WhatsApp", async () => {
  const r = await S.admin.post("/hack/api/admin/people", { name: "Júlia Jurada", email: "julia@ex.com", phone: "21988887777", roles: ["judge"] });
  eq(r.status, 200);
  S.people.ids["julia@ex.com"] = r.data.person.id;
  const l = await S.admin.post("/hack/api/admin/people/" + r.data.person.id + "/link", { send: "none" });
  eq(l.status, 200);
  assert(l.data.url.startsWith("https://lepv.example/hack/acesso#t="), "url");
  assert(l.data.whatsappUrl.startsWith("https://wa.me/5521988887777?text="), "wa.me com 55");
  const tok = l.data.url.split("#t=")[1];
  const j = client();
  eq((await j.post("/hack/api/access/consume", { token: tok })).status, 200);
  const me = await j.get("/hack/api/me");
  eq(me.data.perms.judge, true);
  S.people.julia = j;
});

test("organização: desconectar derruba a sessão da pessoa", async () => {
  const c = await enterAs("elisa@ex.com");
  eq((await c.get("/hack/api/me")).status, 200);
  eq((await S.admin.post("/hack/api/admin/people/" + S.people.ids["elisa@ex.com"] + "/revoke")).status, 200);
  eq((await c.get("/hack/api/me")).status, 401);
});

test("programação: semente oficial e edição pela diretoria", async () => {
  const p = await client().get("/hack/api/program");
  eq(p.status, 200);
  assert(p.data.program.some((a) => a.day === "2026-10-31" && a.start === "13:00" && /Submiss/.test(a.title)), "submissão às 13h");
  eq(p.data.venues["2026-10-31"].name, "Instituto 12");
  const bad = await S.admin.post("/hack/api/admin/program", { day: "2026-10-30", start: "25:00", title: "x" });
  eq(bad.status, 400);
  const ok = await S.admin.post("/hack/api/admin/program", { day: "2026-10-30", start: "18:00", end: "18:30", title: "Mentoria" });
  eq(ok.status, 200);
  eq((await S.admin.del("/hack/api/admin/program/" + ok.data.activity.id)).status, 200);
  // Endereço da FGV confirmado depois: a diretoria edita e o portal mostra.
  eq((await S.admin.put("/hack/api/admin/venues/2026-10-30", { name: "FGV", address: "Praia de Botafogo, 190", mapUrl: "javascript:alert(1)" })).status, 400);
  eq((await S.admin.put("/hack/api/admin/venues/2026-10-30", { name: "FGV", address: "Praia de Botafogo, 190", mapUrl: "https://maps.example/fgv" })).status, 200);
  eq((await client().get("/hack/api/program")).data.venues["2026-10-30"].address, "Praia de Botafogo, 190");
  eq((await S.people.ana.put("/hack/api/admin/venues/2026-10-30", { name: "X" })).status, 403);
  eq((await S.people.ana.post("/hack/api/admin/program", { day: "2026-10-30", start: "18:00", title: "x" })).status, 403);
});

// ================= módulo 2: achados da revisão =================

test("permissões: participante e jurado não geram link, não editam, não revogam nem disparam lote", async () => {
  const target = S.people.ids["carla@ex.com"];
  for (const c of [S.people.ana, S.people.julia]) {
    eq((await c.post("/hack/api/admin/people/" + target + "/link", { send: "none" })).status, 403, "link");
    eq((await c.patch("/hack/api/admin/people/" + target, { name: "Hackeada da Silva" })).status, 403, "patch");
    eq((await c.post("/hack/api/admin/people/" + target + "/revoke")).status, 403, "revoke");
    eq((await c.post("/hack/api/admin/links/bulk", { role: "participant" })).status, 403, "lote");
  }
});

test("segurança: inscrição com e-mail de staff não troca o telefone do link de WhatsApp", async () => {
  const r = await S.admin.post("/hack/api/admin/people", { name: "Sofia Staff", email: "sofia@ex.com", phone: "21977776666", roles: ["staff"] });
  eq(r.status, 200);
  const sid = r.data.person.id;
  const atk = await client().post("/api/event-signup/" + S.signupToken, {
    name: "Invasor Silva", email: "sofia@ex.com", phone: "21900000000", vinculo: "FGV", temGrupo: "Não", awareLocation: true, awareTime: true,
  });
  eq(atk.status, 200);
  const list = await S.admin.get("/hack/api/admin/people");
  const sofia = list.data.people.find((p) => p.id === sid);
  eq(sofia.phone, "21977776666", "telefone cadastrado pela diretoria");
  eq(sofia.name, "Sofia Staff");
  const l = await S.admin.post("/hack/api/admin/people/" + sid + "/link", { send: "none" });
  assert(l.data.whatsappUrl.startsWith("https://wa.me/5521977776666"), "WhatsApp vai para a Sofia: " + l.data.whatsappUrl);
});

test("organização: bloqueado continua na lista e pode ser desbloqueado", async () => {
  const id = S.people.ids["davi@ex.com"];
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { disabled: true })).status, 200);
  let list = await S.admin.get("/hack/api/admin/people");
  eq(list.data.people.find((p) => p.id === id).disabled, true);
  eq((await S.admin.post("/hack/api/admin/people/" + id + "/link", { send: "none" })).status, 404, "bloqueado não recebe link");
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { disabled: false })).status, 200);
  list = await S.admin.get("/hack/api/admin/people");
  eq(list.data.people.find((p) => p.id === id).disabled, false);
  eq((await S.admin.post("/hack/api/admin/people/" + id + "/link", { send: "none" })).status, 200);
});

test("organização: trocar o e-mail revoga o link já mandado", async () => {
  const id = S.people.ids["carla@ex.com"];
  const l = await S.admin.post("/hack/api/admin/people/" + id + "/link", { send: "none" });
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { email: "carla.nova@ex.com" })).status, 200);
  eq((await client().post("/hack/api/access/consume", { token: l.data.url.split("#t=")[1] })).status, 401);
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { email: "carla@ex.com" })).status, 200);
});

test("acesso: lista de espera recebe link e vê a própria condição", async () => {
  const ev = (await S.admin.get("/api/events")).data.events.find((e) => e.type === "hackathon");
  // Confirmados até aqui: os 5 da jornada + a inscrição do teste de segurança.
  eq((await S.admin.patch("/api/events/" + ev.id, { capacity: 6 })).status, 200);
  const r = await client().post("/api/event-signup/" + S.signupToken, {
    name: "Wagner Espera", email: "wagner@ex.com", phone: "21999990009", vinculo: "FGV", temGrupo: "Não", awareLocation: true, awareTime: true,
  });
  eq(r.status, 200);
  assert(/fila de espera/i.test(r.data.message), "entrou na fila: " + r.data.message);
  const c = await enterAs("wagner@ex.com");
  const me = await c.get("/hack/api/me");
  eq(me.data.me.signupStatus, "waitlist");
  eq(me.data.me.roles.includes("participant"), false);
  eq((await S.admin.patch("/api/events/" + ev.id, { capacity: "" })).status, 200);
});

test("inscrição: aceita UFPE e Outra universidade, recusa vínculo fora da lista", async () => {
  const html = await (await fetch(BASE + "/inscricao.html")).text();
  for (const v of ["UFPE", "Outra universidade"]) assert(html.includes('<option value="' + v + '">'), "opção " + v + " no formulário");
  const base = { phone: "21988887777", curso: "Engenharia", temGrupo: "Não", awareLocation: true, awareTime: true };
  const r1 = await client().post("/api/event-signup/" + S.signupToken, { ...base, name: "Paula Recife", email: "paula.ufpe@ex.com", vinculo: "UFPE" });
  eq(r1.status, 200, "UFPE: " + JSON.stringify(r1.data));
  const r2 = await client().post("/api/event-signup/" + S.signupToken, { ...base, name: "Otto Outra", email: "otto.outra@ex.com", phone: "21988886666", vinculo: "Outra universidade" });
  eq(r2.status, 200, "Outra universidade: " + JSON.stringify(r2.data));
  const r3 = await client().post("/api/event-signup/" + S.signupToken, { ...base, name: "Xis Fora", email: "xis@ex.com", phone: "21988885555", vinculo: "Qualquer" });
  eq(r3.status, 400, "vínculo fora da lista");
  eq(r3.data.error, "invalid_vinculo");
});

test("dúvidas: participante pergunta, organização responde, resposta volta ao portal", async () => {
  const ana = await enterAs("ana@ex.com");
  const bruno = await enterAs("bruno@ex.com");
  const ask = await ana.post("/hack/api/questions", { text: "Posso usar uma API paga no projeto?" });
  eq(ask.status, 200, JSON.stringify(ask.data));
  eq((await bruno.get("/hack/api/questions")).data.questions.length, 0, "cada um vê só as suas");
  eq((await ana.get("/hack/api/admin/questions")).status, 403, "participante não lê as dos outros");
  const list = (await S.admin.get("/hack/api/admin/questions")).data.questions;
  const q = list.find((x) => x.text.startsWith("Posso usar"));
  eq(q.person.name, "Ana Participante");
  eq(q.answer, null);
  const ans = await S.admin.post("/hack/api/admin/questions/" + q.id + "/answer", { text: "Pode, desde que a equipe pague." });
  eq(ans.status, 200);
  const again = await S.admin.post("/hack/api/admin/questions/" + q.id + "/answer", { text: "Outra" });
  eq(again.status, 409, "segunda resposta recusada");
  const mine = (await ana.get("/hack/api/questions")).data.questions[0];
  eq(mine.answer.text, "Pode, desde que a equipe pague.");
});

test("superadmin: visão geral só para o superadmin; último acesso aparece", async () => {
  const ana = await enterAs("ana@ex.com");
  eq((await ana.get("/hack/api/admin/overview")).status, 403);
  const me = await S.admin.get("/hack/api/me");
  eq(me.data.perms.superadmin, true, "order 1 é superadmin");
  const o = await S.admin.get("/hack/api/admin/overview");
  eq(o.status, 200);
  for (const k of ["groups", "access", "submissions", "announcements", "questions", "checkin"]) assert(k in o.data, "falta " + k);
  eq(o.data.questions.answered >= 1, true);
  const people = (await S.admin.get("/hack/api/admin/people")).data.people;
  assert(people.find((p) => p.email === "ana@ex.com").lastSeenAt, "último acesso da Ana registrado");
});

test("acesso: sair encerra a sessão; /session diz isso sem 401", async () => {
  const c = await enterAs("elisa@ex.com");
  eq((await c.get("/hack/api/session")).data.authenticated, true);
  eq((await c.post("/hack/api/access/logout")).status, 200);
  eq((await c.get("/hack/api/me")).status, 401);
  const s2 = await c.get("/hack/api/session");
  eq(s2.status, 200);
  eq(s2.data.authenticated, false);
});

test("acesso: pedido de link responde igual e na hora para e-mail cadastrado ou não", async () => {
  const t0 = Date.now();
  const a = await client().post("/hack/api/access/request", { email: "fantasma@ex.com" });
  const t1 = Date.now();
  const b = await client().post("/hack/api/access/request", { email: "bruno@ex.com" });
  const t2 = Date.now();
  eq(a.status, 200);
  eq(JSON.stringify(a.data), JSON.stringify(b.data));
  assert(t1 - t0 < 1000 && t2 - t1 < 1000, "resposta imediata");
  assert(await waitFor(() => lastLinkFor("bruno@ex.com")), "e-mail do Bruno saiu depois da resposta");
  eq(mails().filter((m) => m.to === "fantasma@ex.com").length, 0);
});

test("segurança: diretoria cadastra jurado com e-mail já inscrito — o contato da diretoria vale", async () => {
  const atk = await client().post("/api/event-signup/" + S.signupToken, {
    name: "Falso Jurado", email: "jurado2@ex.com", phone: "21900000000", vinculo: "FGV", temGrupo: "Não", awareLocation: true, awareTime: true,
  });
  eq(atk.status, 200);
  const r = await S.admin.post("/hack/api/admin/people", { name: "Jorge Jurado", email: "jurado2@ex.com", phone: "21955554444", roles: ["judge"] });
  eq(r.status, 200);
  eq(r.data.person.phone, "21955554444");
  eq(r.data.person.name, "Jorge Jurado");
  const l = await S.admin.post("/hack/api/admin/people/" + r.data.person.id + "/link", { send: "none" });
  assert(l.data.whatsappUrl.startsWith("https://wa.me/5521955554444"), "WhatsApp do jurado: " + l.data.whatsappUrl);
  // a próxima sincronização não devolve o telefone da inscrição
  await S.admin.get("/hack/api/admin/people");
  const again = (await S.admin.get("/hack/api/admin/people")).data.people.find((p) => p.id === r.data.person.id);
  eq(again.phone, "21955554444");
});

test("permissões: toda rota da organização recusa anônimo (401) e participante (403)", async () => {
  const id = S.people.ids["carla@ex.com"];
  const routes = [
    ["GET", "/hack/api/admin/people"], ["POST", "/hack/api/admin/people"], ["PATCH", "/hack/api/admin/people/" + id],
    ["POST", "/hack/api/admin/people/" + id + "/link"], ["POST", "/hack/api/admin/people/" + id + "/revoke"],
    ["POST", "/hack/api/admin/links/bulk"], ["GET", "/hack/api/admin/program"], ["POST", "/hack/api/admin/program"],
    ["GET", "/hack/api/admin/announcements"], ["POST", "/hack/api/admin/announcements"], ["POST", "/hack/api/admin/announcements/preview"],
    ["GET", "/hack/api/admin/whatsapp"], ["POST", "/hack/api/admin/deliveries/x"],
    ["GET", "/hack/api/admin/teams"], ["POST", "/hack/api/admin/teams"], ["GET", "/hack/api/admin/submissions"],
    ["PUT", "/hack/api/admin/config/deadline"], ["GET", "/hack/api/admin/evaluation"], ["POST", "/hack/api/admin/evaluation"],
    ["GET", "/hack/api/admin/partners"], ["POST", "/hack/api/admin/partners/orgs"], ["PATCH", "/hack/api/admin/partners/orgs/x"],
    ["POST", "/hack/api/admin/partners/requests/x"], ["DELETE", "/hack/api/admin/partners/representatives/x"],
    ["GET", "/hack/api/admin/devices"], ["POST", "/hack/api/admin/devices/x/revoke"], ["DELETE", "/hack/api/checkin/x"],
    ["GET", "/hack/api/checkin/status"], ["POST", "/hack/api/checkin/scan"], ["GET", "/hack/api/checkin/search?q=ana"],
    ["POST", "/hack/api/checkin/person/x"], ["POST", "/hack/api/checkin/prepare"], ["POST", "/hack/api/checkin/snapshot"],
    ["POST", "/hack/api/checkin/sync"], ["PUT", "/hack/api/admin/venues/2026-10-30"],
    ["PUT", "/hack/api/admin/submissions/x"], ["DELETE", "/hack/api/admin/submissions/x"],
  ];
  const anon = client();
  const sofia = (await S.admin.get("/hack/api/admin/people")).data.people.find((p) => p.email === "sofia@ex.com");
  const sl = await S.admin.post("/hack/api/admin/people/" + sofia.id + "/link", { send: "none" });
  const staff = client();
  eq((await staff.post("/hack/api/access/consume", { token: sl.data.url.split("#t=")[1] })).status, 200);
  for (const [m, u] of routes) {
    const body = m === "GET" ? undefined : {};
    eq((await anon.raw(m, u, body)).status, 401, "anônimo " + m + " " + u);
    eq((await S.people.ana.raw(m, u, body)).status, 403, "participante " + m + " " + u);
    eq((await S.people.julia.raw(m, u, body)).status, 403, "jurada " + m + " " + u);
    eq((await staff.raw(m, u, body)).status, 403, "staff sem permissão " + m + " " + u);
  }
});

test("acesso: pedido de link tem limite por e-mail (429)", async () => {
  const c = client();
  for (let i = 0; i < 3; i++) eq((await c.post("/hack/api/access/request", { email: "limite@ex.com" })).status, 200);
  eq((await c.post("/hack/api/access/request", { email: "limite@ex.com" })).status, 429);
});

// ================= módulo 3: avisos =================

test("avisos: participante não acessa a composição", async () => {
  eq((await S.people.ana.get("/hack/api/admin/announcements")).status, 403);
  eq((await S.people.ana.post("/hack/api/admin/announcements", { title: "Falso aviso", body: "x x x", audiences: ["all"] })).status, 403);
  eq((await S.people.ana.get("/hack/api/admin/whatsapp")).status, 403);
});

test("avisos: alcance conta pessoas uma vez mesmo com dois papéis", async () => {
  eq((await S.admin.patch("/hack/api/admin/people/" + S.people.ids["carla@ex.com"], { roles: { judge: true } })).status, 200);
  const r = await S.admin.post("/hack/api/admin/announcements/preview", { audiences: ["participant", "judge"] });
  eq(r.status, 200);
  const people = (await S.admin.get("/hack/api/admin/people")).data.people
    .filter((p) => !p.disabled && (p.roles.includes("participant") || p.roles.includes("judge")));
  eq(r.data.people, people.length);
});

test("avisos: publicar agora chega só ao público, com um e-mail por pessoa", async () => {
  const r = await S.admin.post("/hack/api/admin/announcements", {
    title: "Wi-Fi da FGV", body: "Rede LEPV-HACK, senha no crachá.", audiences: ["participant", "judge"],
    channels: { email: true, whatsapp: true },
  });
  eq(r.status, 200);
  eq(r.data.announcement.status, "published");
  const ana = await S.people.ana.get("/hack/api/announcements");
  const item = ana.data.announcements.find((a) => a.title === "Wi-Fi da FGV");
  assert(item && !item.read, "Ana vê como não lido");
  assert(ana.data.unread >= 1);
  eq((await S.people.ana.post("/hack/api/announcements/read-all")).status, 200);
  eq((await S.people.ana.get("/hack/api/announcements")).data.unread, 0);
  await waitFor(() => mails().some((m) => m.to === "carla@ex.com" && /Wi-Fi/.test(m.subject)), 5000);
  eq(mails().filter((m) => m.to === "carla@ex.com" && /Wi-Fi/.test(m.subject)).length, 1, "Carla (participante e jurada) recebe um e-mail");
  S.wifiId = r.data.announcement.id;
});

test("avisos: patrocinador não vê aviso de participantes, nem pela API direta", async () => {
  const r = await S.admin.post("/hack/api/admin/people", { name: "Paula Patrocínio", email: "paula@ex.com", roles: ["staff"] });
  const pid = r.data.person.id;
  eq((await S.admin.patch("/hack/api/admin/people/" + pid, { roles: { staff: false } })).status, 200);
  // sem papel nenhum: não entra
  const l = await S.admin.post("/hack/api/admin/people/" + pid + "/link", { send: "none" });
  eq(l.status, 404);
  const julia = await S.people.julia.get("/hack/api/announcements");
  assert(julia.data.announcements.some((a) => a.id === S.wifiId), "jurada vê aviso para jurados");
  eq((await S.people.julia.post("/hack/api/announcements/" + "n000000000000" + "/read")).status, 404);
});

test("avisos: fila de WhatsApp assistido, marcada à mão", async () => {
  const r = await S.admin.get("/hack/api/admin/whatsapp");
  eq(r.status, 200);
  const mine = r.data.items.filter((x) => x.announcement.id === S.wifiId);
  assert(mine.length >= 3, "um por pessoa com telefone");
  assert(mine.every((x) => x.status === "pending"), "nada marcado sozinho");
  assert(mine[0].waUrl.startsWith("https://wa.me/55"), "atalho wa.me");
  eq((await S.admin.post("/hack/api/admin/deliveries/" + mine[0].id, { status: "sent" })).status, 200);
  const again = await S.admin.get("/hack/api/admin/whatsapp");
  eq(again.data.items.find((x) => x.id === mine[0].id).status, "sent");
});

test("avisos: no máximo 5 aparelhos por pessoa recebem push", async () => {
  for (let i = 0; i < 6; i++) eq((await S.people.julia.post("/hack/api/push/subscribe", { subscription: FAKE_SUB("julia" + i) })).status, 200);
  const r = await S.admin.post("/hack/api/admin/announcements", { title: "Banca às 14h", body: "Sala 3.", audiences: ["judge"], urgent: true });
  eq(r.status, 200);
  await waitFor(() => pushes().filter((x) => x.payload.title === "Banca às 14h").length >= 5, 5000);
  await new Promise((res) => setTimeout(res, 300));
  const juliaPushes = pushes().filter((x) => x.payload.title === "Banca às 14h" && /julia/.test(x.endpoint));
  eq(juliaPushes.length, 5);
  assert(!juliaPushes.some((x) => x.endpoint === FAKE_SUB("julia0").endpoint), "o mais antigo saiu");
});

test("avisos: bloquear tira as notificações do aparelho", async () => {
  const jid = S.people.ids["julia@ex.com"];
  eq((await S.admin.patch("/hack/api/admin/people/" + jid, { disabled: true })).status, 200);
  eq((await S.people.julia.get("/hack/api/me")).status, 401);
  const r = await S.admin.post("/hack/api/admin/announcements", { title: "Pós-bloqueio", body: "Teste.", audiences: ["judge"], urgent: true });
  eq(r.status, 200);
  await new Promise((res) => setTimeout(res, 800));
  eq(pushes().filter((x) => x.payload.title === "Pós-bloqueio").length, 0);
  eq((await S.admin.patch("/hack/api/admin/people/" + jid, { disabled: false })).status, 200);
  const l = await S.admin.post("/hack/api/admin/people/" + jid + "/link", { send: "none" });
  S.people.julia = client();
  eq((await S.people.julia.post("/hack/api/access/consume", { token: l.data.url.split("#t=")[1] })).status, 200);
});

test("avisos: sair apaga a inscrição de push do aparelho no servidor", async () => {
  const c = await enterAs("carla@ex.com");
  const other = await enterAs("carla@ex.com");
  eq((await c.post("/hack/api/push/subscribe", { subscription: FAKE_SUB("carla-celular") })).status, 200);
  // Aparelho de controle, que continua inscrito: prova que o envio aconteceu.
  eq((await other.post("/hack/api/push/subscribe", { subscription: FAKE_SUB("carla-notebook") })).status, 200);
  eq((await c.post("/hack/api/access/logout", { endpoint: FAKE_SUB("carla-celular").endpoint })).status, 200);
  const r = await S.admin.post("/hack/api/admin/announcements", { title: "Depois do logout", body: "Teste.", audiences: ["participant"], urgent: true });
  eq(r.status, 200);
  const ctrl = await waitFor(() => pushes().find((x) => x.payload.title === "Depois do logout" && x.endpoint === FAKE_SUB("carla-notebook").endpoint), 5000);
  assert(ctrl, "o aparelho de controle recebeu (o envio aconteceu)");
  eq(pushes().filter((x) => x.payload.title === "Depois do logout" && x.endpoint === FAKE_SUB("carla-celular").endpoint).length, 0, "o aparelho que saiu não recebeu");
});

test("avisos: push urgente chega ao aparelho inscrito", async () => {
  eq((await S.people.ana.post("/hack/api/push/subscribe", { subscription: { endpoint: "javascript:alert(1)", keys: {} } })).status, 400);
  eq((await S.people.ana.post("/hack/api/push/subscribe", { subscription: FAKE_SUB("ana") })).status, 200);
  const r = await S.admin.post("/hack/api/admin/announcements", { title: "Mudança de sala", body: "Auditório 2.", audiences: ["participant"], urgent: true });
  eq(r.status, 200);
  eq(r.data.announcement.channels.push, true, "urgente marca push");
  const hit = await waitFor(() => pushes().find((x) => x.payload.title === "Mudança de sala"), 5000);
  assert(hit, "push gravado no outbox");
  eq(hit.endpoint, FAKE_SUB("ana").endpoint);
  eq(hit.urgent, true);
});

test("avisos: agendador com relógio simulado publica na hora e não republica após reinício", async () => {
  await restartServer({ HACK_NOW: "2026-10-30T17:30:20Z" });
  await new Promise((r) => setTimeout(r, 300));
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
  let list = (await S.admin.get("/hack/api/admin/announcements")).data.announcements;
  const first = list.filter((a) => a.title === "O hackathon começou!");
  eq(first.length, 1);
  eq(first[0].status, "published");
  eq(first[0].publishedAt, "2026-10-30T17:30:20.000Z");
  const second = list.find((a) => a.title === "Bom dia, Instituto 12!");
  eq(second.status, "scheduled");
  const ana = await enterAs("ana@ex.com");
  assert((await ana.get("/hack/api/announcements")).data.announcements.some((a) => a.title === "O hackathon começou!"), "Ana vê o aviso");
  const pushedBefore = pushes().filter((x) => x.payload.title === "O hackathon começou!").length;
  await restartServer({ HACK_NOW: "2026-10-30T17:32:00Z" });
  await new Promise((r) => setTimeout(r, 500));
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
  list = (await S.admin.get("/hack/api/admin/announcements")).data.announcements;
  eq(list.filter((a) => a.title === "O hackathon começou!" && a.status === "published").length, 1, "uma publicação só");
  eq(pushes().filter((x) => x.payload.title === "O hackathon começou!").length, pushedBefore, "sem push repetido");
});

test("avisos: servidor fora do ar no horário deixa o aviso vencido para a organização decidir", async () => {
  await restartServer({ HACK_NOW: "2026-10-31T11:30:00Z" });
  await new Promise((r) => setTimeout(r, 300));
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
  const list = (await S.admin.get("/hack/api/admin/announcements")).data.announcements;
  const second = list.find((a) => a.title === "Bom dia, Instituto 12!");
  eq(second.status, "overdue");
  const ana = await enterAs("ana@ex.com");
  eq((await ana.get("/hack/api/announcements")).data.announcements.some((a) => a.title === "Bom dia, Instituto 12!"), false);
  eq((await S.admin.post("/hack/api/admin/announcements/" + second.id + "/publish")).status, 200);
  assert((await ana.get("/hack/api/announcements")).data.announcements.some((a) => a.title === "Bom dia, Instituto 12!"), "publicado pela organização");
  await restartServer();
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
});

// ================= módulo 4: equipes =================

test("equipes: só participantes; jurada e quem está na fila não formam equipe", async () => {
  S.c = {};
  for (const e of ["ana", "bruno", "carla", "davi", "elisa", "wagner"]) S.c[e] = await enterAs(e + "@ex.com");
  S.c.julia = await enterAs("julia@ex.com");
  // (o Wagner saiu da fila quando a capacidade voltou a ser livre)
  eq((await S.c.julia.post("/hack/api/team", { name: "Banca" })).status, 403, "jurada");
  eq((await S.c.julia.get("/hack/api/team/discover")).status, 403, "jurada não usa a descoberta");
  eq((await S.c.ana.get("/hack/api/admin/teams")).status, 403, "participante não vê o painel");
});

test("equipes: cria, entra por código; quem declarou grupo não usa a descoberta", async () => {
  const r = await S.c.ana.post("/hack/api/team", { name: "Alfa" });
  eq(r.status, 200, JSON.stringify(r.data));
  S.alfa = r.data.team;
  assert(/^[A-Z2-9]{6}$/.test(S.alfa.code), "código de 6");
  eq((await S.c.bruno.get("/hack/api/team/discover")).status, 403, "bruno tem grupo");
  const j = await S.c.bruno.post("/hack/api/team/join", { code: S.alfa.code.toLowerCase() });
  eq(j.status, 200);
  eq(j.data.team.size, 2);
});

test("equipes: convite só para perfil visível e sem grupo; aceito vira integrante", async () => {
  const elisaId = (await S.c.elisa.get("/hack/api/me")).data.me.id;
  eq((await S.c.ana.post("/hack/api/team/invite", { personId: elisaId })).status, 409, "perfil escondido");
  const brunoId = (await S.c.bruno.get("/hack/api/me")).data.me.id;
  eq((await S.c.ana.post("/hack/api/team/invite", { personId: brunoId })).status, 409, "quem tem grupo não recebe convite");
  eq((await S.c.elisa.put("/hack/api/team/profile", { published: true, bio: "Dados", skills: "python, sql" })).status, 200);
  const disc = await S.c.ana.get("/hack/api/team/discover");
  assert(disc.data.people.some((p) => p.id === elisaId), "Elisa aparece na descoberta");
  assert(!disc.data.people.some((p) => p.id === brunoId), "Bruno não aparece");
  eq((await S.c.ana.post("/hack/api/team/invite", { personId: elisaId })).status, 200);
  const inv = (await S.c.elisa.get("/hack/api/team")).data.invites[0];
  eq(inv.kind, "invite");
  eq((await S.c.elisa.post("/hack/api/team/invites/" + inv.id, { accept: true })).status, 200);
  eq((await S.c.ana.get("/hack/api/team")).data.team.size, 3);
});

test("equipes: pedido aceito por integrante lota a equipe; código não passa de 4", async () => {
  eq((await S.c.carla.put("/hack/api/team/profile", { published: true, skills: ["design"] })).status, 200);
  eq((await S.c.carla.post("/hack/api/team/request", { teamId: S.alfa.id })).status, 200);
  const req = (await S.c.bruno.get("/hack/api/team")).data.requests.find((r) => r.kind === "request");
  assert(req, "Bruno (integrante) vê o pedido");
  eq((await S.c.carla.post("/hack/api/team/invites/" + req.id, { accept: true })).status, 403, "quem pediu não aprova o próprio pedido");
  eq((await S.c.bruno.post("/hack/api/team/invites/" + req.id, { accept: true })).status, 200);
  eq((await S.c.davi.post("/hack/api/team/join", { code: S.alfa.code })).status, 409, "equipe cheia");
  const conf = await S.c.ana.patch("/hack/api/team", { confirm: true });
  eq(conf.status, 200);
  eq(conf.data.team.status, "confirmed");
  const elisaId = (await S.c.elisa.get("/hack/api/me")).data.me.id;
  const anaId = (await S.c.ana.get("/hack/api/me")).data.me.id;
  eq((await S.c.bruno.patch("/hack/api/team", { removeMember: elisaId })).status, 403, "só quem criou remove");
  eq((await S.c.ana.patch("/hack/api/team", { removeMember: anaId })).status, 400, "dono usa Sair");
  eq((await S.c.ana.patch("/hack/api/team", { confirm: false })).data.team.status, "forming");
  eq((await S.c.ana.patch("/hack/api/team", { confirm: true })).data.team.status, "confirmed");
});

test("equipes: diretoria vê equipes e quem está sem equipe, e monta equipe", async () => {
  const r = await S.admin.get("/hack/api/admin/teams");
  eq(r.status, 200);
  const alfa = r.data.teams.find((t) => t.id === S.alfa.id);
  eq(alfa.size, 4);
  assert(alfa.members.every((m) => m.email), "contatos para a organização");
  const davi = r.data.solo.find((p) => p.email === "davi@ex.com");
  assert(davi, "Davi sem equipe");
  eq(davi.vinculo, "FGV", "faculdade para montar equipe");
  eq(davi.curso, "Economia");
  eq(davi.anoFaculdade, "3", "ano da faculdade vem da inscrição");
  assert(alfa.members.every((m) => m.vinculo === "FGV" && m.anoFaculdade === "3" && m.curso === "Economia"), "dados acadêmicos dos integrantes: " + JSON.stringify(alfa.members));
  const seen = (await S.c.ana.get("/hack/api/team")).data.team.members;
  assert(seen.every((m) => !("email" in m) && !("phone" in m) && !("anoFaculdade" in m) && !("vinculo" in m)), "participante não vê contato nem dados acadêmicos dos colegas");
  const c = await S.admin.post("/hack/api/admin/teams", { name: "Beta", memberIds: [davi.id] });
  eq(c.status, 200);
  S.beta = c.data.team;
  eq((await S.admin.post("/hack/api/admin/teams/" + S.beta.id + "/merge", { otherId: S.alfa.id })).status, 409, "passaria de 4");
});

test("equipes: montagem por afinidade é só da diretoria; a prévia não grava nada", async () => {
  eq((await client().get("/hack/api/admin/teams/affinity")).status, 401);
  eq((await S.c.ana.get("/hack/api/admin/teams/affinity")).status, 403);
  eq((await S.c.ana.post("/hack/api/admin/teams/affinity", { teams: [] })).status, 403);
  const before = (await S.admin.get("/hack/api/admin/teams")).data;
  const p = await S.admin.get("/hack/api/admin/teams/affinity");
  eq(p.status, 200);
  assert(Array.isArray(p.data.teams) && Array.isArray(p.data.unassigned) && Array.isArray(p.data.withGroup), "formato da prévia");
  const inPreview = p.data.teams.flatMap((t) => t.members).concat(p.data.unassigned);
  const soloNoGroup = before.solo.filter((x) => !x.hasGroup).map((x) => x.id).sort();
  eq(JSON.stringify(inPreview.map((x) => x.id).sort()), JSON.stringify(soloNoGroup), "prévia cobre exatamente quem está sem equipe e sem grupo");
  assert(p.data.withGroup.every((x) => before.solo.some((y) => y.id === x.id && y.hasGroup)), "quem tem grupo fica à parte");
  const after = (await S.admin.get("/hack/api/admin/teams")).data;
  eq(after.teams.length, before.teams.length, "prévia não cria equipe");
  eq((await S.admin.post("/hack/api/admin/teams/affinity", { teams: [{ name: "Solo", memberIds: [soloNoGroup[0] || "x"] }] })).status, 400, "equipe de 1 é recusada");
  eq((await S.admin.post("/hack/api/admin/teams/affinity", {})).status, 400, "sem equipes");
  // Criação de verdade pela rota (e desfeita no fim: a jornada segue com
  // essas pessoas sem equipe).
  const pair = soloNoGroup.slice(0, 2);
  assert(pair.length === 2, "precisa de duas pessoas sem equipe e sem grupo na jornada");
  const made = await S.admin.post("/hack/api/admin/teams/affinity", { teams: [{ name: "Afinidade Teste", memberIds: pair }] });
  eq(made.status, 200);
  eq(made.data.created.length, 1);
  eq(made.data.created[0].name, "Afinidade Teste");
  eq(made.data.created[0].status, "forming");
  const mid = (await S.admin.get("/hack/api/admin/teams")).data;
  eq(mid.teams.length, before.teams.length + 1, "uma equipe a mais");
  assert(!mid.solo.some((x) => pair.includes(x.id)), "as duas saíram da lista sem equipe");
  eq((await S.admin.post("/hack/api/admin/teams/affinity", { teams: [{ name: "De Novo", memberIds: pair }] })).status, 409, "prévia velha: já estão numa equipe");
  eq((await S.admin.del("/hack/api/admin/teams/" + made.data.created[0].id)).status, 200);
  eq((await S.admin.get("/hack/api/admin/teams")).data.solo.length, before.solo.length, "estado da jornada restaurado");
});

test("equipes: quem tem grupo indica colegas; o aceite forma a equipe", async () => {
  const base = { phone: "21988880000", curso: "Engenharia", vinculo: "FGV", temGrupo: "Sim", awareLocation: true, awareTime: true };
  for (const [name, email, phone] of [["Gil Grupo", "gil@ex.com", "21988880001"], ["Hugo Grupo", "hugo@ex.com", "21988880002"], ["Ivo Grupo", "ivo@ex.com", "21988880003"]]) {
    eq((await client().post("/api/event-signup/" + S.signupToken, { ...base, name, email, phone })).status, 200, "inscrição " + name);
  }
  const gil = await enterAs("gil@ex.com");
  const hugo = await enterAs("hugo@ex.com");
  const hugoId = (await hugo.get("/hack/api/me")).data.me.id;
  const gilId = (await gil.get("/hack/api/me")).data.me.id;
  eq((await S.c.davi.get("/hack/api/team/group-candidates")).status, 403, "sem grupo não vê a lista");
  eq((await S.c.davi.post("/hack/api/team/indicate", { personId: hugoId })).status, 403, "sem grupo não indica");
  const cand = (await gil.get("/hack/api/team/group-candidates")).data.people;
  assert(cand.some((p) => p.id === hugoId), "Hugo aparece para o Gil");
  assert(!cand.some((p) => p.name === "Bruno Participante"), "quem já tem equipe não aparece");
  assert(cand.every((p) => !("email" in p) && !("phone" in p)), "sem contato na lista");
  eq((await gil.post("/hack/api/team/indicate", { personId: hugoId })).status, 200);
  eq((await gil.get("/hack/api/team")).data.sent.length, 1, "Gil vê a indicação pendente");
  const inv = (await hugo.get("/hack/api/team")).data.invites.find((i) => i.kind === "group");
  eq(inv.from.name, "Gil Grupo");
  const solo = (await S.admin.get("/hack/api/admin/teams")).data.solo;
  eq(solo.find((x) => x.email === "hugo@ex.com").groupReceived, 1, "organização vê a pendência");
  eq((await hugo.post("/hack/api/team/invites/" + inv.id, { accept: true })).status, 200);
  const t = (await gil.get("/hack/api/team")).data.team;
  eq(t.size, 2);
  eq(t.name, "Grupo de Gil");
  // Hugo, já na equipe, indica o Ivo: o Gil vê a pendência, o Ivo vê a equipe.
  const ivo = await enterAs("ivo@ex.com");
  const ivoId = (await ivo.get("/hack/api/me")).data.me.id;
  eq((await hugo.post("/hack/api/team/indicate", { personId: ivoId })).status, 200);
  const sentByTeam = (await gil.get("/hack/api/team")).data.sent;
  eq(sentByTeam.length, 1, "colega de equipe vê a indicação");
  eq(sentByTeam[0].person.name, "Ivo Grupo");
  const ivoInv = (await ivo.get("/hack/api/team")).data.invites.find((i) => i.kind === "group");
  eq(ivoInv.team.name, "Grupo de Gil");
  const soloNow = (await S.admin.get("/hack/api/admin/teams")).data.solo;
  eq(soloNow.find((x) => x.email === "ivo@ex.com").groupReceived, 1);
  eq(soloNow.find((x) => x.email === "ivo@ex.com").anoFaculdade, "", "ano não informado vem vazio");
  const solo0 = (await S.admin.get("/hack/api/admin/teams")).data.solo;
  eq(solo0.find((x) => x.email === "ivo@ex.com").groupSent, 0);
  eq((await S.c.davi.post("/hack/api/team/indications/" + ivoInv.id + "/cancel")).status, 403, "fora do grupo não cancela");
  eq((await gil.post("/hack/api/team/indications/" + ivoInv.id + "/cancel")).status, 200, "colega de equipe cancela");
  eq((await gil.post("/hack/api/team/indicate", { personId: ivoId })).status, 200);
  const again = await gil.post("/hack/api/team/indicate", { personId: ivoId });
  eq(again.data.duplicate, true, "repetida avisa");
  // Limpa para não mexer nas contagens dos módulos seguintes.
  eq((await S.admin.del("/hack/api/admin/teams/" + t.id)).status, 200);
  // Simulação (dryRun) mostra a indicação que a junção cancelaria e não grava.
  eq((await gil.post("/hack/api/team/indicate", { personId: hugoId })).status, 200, "Gil indica Hugo de novo");
  const sim = await S.admin.post("/hack/api/admin/teams", { memberIds: [hugoId, ivoId], dryRun: true });
  eq(sim.status, 200);
  assert(sim.data.cancelled.some((c) => c.from === "Gil Grupo" && c.to === "Hugo Grupo"), "simulação lista Gil → Hugo: " + JSON.stringify(sim.data));
  assert(!(await S.admin.get("/hack/api/admin/teams")).data.teams.some((x) => x.members.some((m) => m.id === hugoId)), "simulação não grava");
  // Também em incluir (PATCH), juntar (merge) e desfazer (DELETE).
  const g2 = (await S.admin.post("/hack/api/admin/teams", { name: "Gama Teste", memberIds: [ivoId] })).data.team;
  const simAdd = await S.admin.patch("/hack/api/admin/teams/" + g2.id, { addMember: hugoId, dryRun: true });
  assert(simAdd.data.cancelled.some((c) => c.to === "Hugo Grupo"), "PATCH simula: " + JSON.stringify(simAdd.data));
  const g3 = (await S.admin.post("/hack/api/admin/teams", { name: "Delta Teste", memberIds: [gilId] })).data.team;
  const simMerge = await S.admin.post("/hack/api/admin/teams/" + g2.id + "/merge", { otherId: g3.id, dryRun: true });
  eq(simMerge.status, 200);
  assert(Array.isArray(simMerge.data.cancelled), "merge simula");
  const simDel = await S.admin.raw("DELETE", "/hack/api/admin/teams/" + g3.id, { dryRun: true });
  assert(simDel.data.cancelled.some((c) => c.from === "Gil Grupo"), "DELETE simula: " + JSON.stringify(simDel.data));
  eq((await S.admin.get("/hack/api/admin/teams")).data.teams.filter((x) => x.id === g2.id || x.id === g3.id).length, 2, "nada gravado");
  for (const id of [g2.id, g3.id]) eq((await S.admin.del("/hack/api/admin/teams/" + id)).status, 200);
  // Gil e Hugo indicam o Ivo; juntar Gil e Hugo corta a repetida (do Hugo),
  // mas a do Gil segue valendo: a prévia não lista nada.
  eq((await gil.post("/hack/api/team/indicate", { personId: ivoId })).status, 200);
  eq((await hugo.post("/hack/api/team/indicate", { personId: ivoId })).status, 200);
  const simDup = await S.admin.post("/hack/api/admin/teams", { memberIds: [gilId, hugoId], dryRun: true });
  eq(simDup.data.cancelled.length, 0, "repetida fora da prévia: " + JSON.stringify(simDup.data));
  eq((await ivo.get("/hack/api/team")).data.invites.filter((i) => i.kind === "group").length, 2, "simulação não mexe nas indicações");
  // Arrastar na organização: duas pessoas sem equipe, sem nome → nome provisório.
  const dragged = await S.admin.post("/hack/api/admin/teams", { memberIds: [hugoId, ivoId] });
  eq(dragged.status, 200, JSON.stringify(dragged.data));
  eq(dragged.data.team.name, "Equipe de Hugo");
  eq(dragged.data.team.size, 2);
  eq((await S.admin.del("/hack/api/admin/teams/" + dragged.data.team.id)).status, 200);
  eq((await S.admin.post("/hack/api/admin/teams", { name: "  ", memberIds: [hugoId] })).status, 400, "nome em branco continua recusado");
  for (const email of ["gil@ex.com", "hugo@ex.com", "ivo@ex.com"]) {
    const ev = (await S.admin.get("/api/events")).data.events.find((e) => e.type === "hackathon");
    const sg = ev.signups.find((x) => x.email === email);
    eq((await S.admin.del("/api/events/" + ev.id + "/signups/" + sg.id)).status, 200);
  }
});

test("equipes: depois do prazo de entrega a composição congela (só a diretoria mexe)", async () => {
  // Prazo: 31/10 13h de Brasília = 16h UTC.
  await restartServer({ HACK_NOW: "2026-10-31T16:05:00Z" });
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
  const ana = await enterAs("ana@ex.com");
  eq((await ana.post("/hack/api/team/leave")).status, 409);
  const brunoLate = await enterAs("bruno@ex.com");
  const late = await brunoLate.post("/hack/api/team/indicate", { personId: "qualquer" });
  eq(late.status, 409, "indicar depois do prazo");
  eq(late.data.error, "teams_locked");
  eq((await ana.get("/hack/api/team")).data.locked, true);
  // Prorrogação só da Alfa: ela volta a editar a entrega; as outras não.
  eq((await S.admin.patch("/hack/api/admin/teams/" + S.alfa.id, { deadlineOverride: "2026-10-31T16:30:00Z" })).status, 200);
  eq((await ana.get("/hack/api/team")).data.locked, false);
  const sub = await ana.get("/hack/api/team/submission");
  eq(sub.data.open, true);
  eq(sub.data.deadline, "2026-10-31T16:30:00.000Z");
  eq((await ana.put("/hack/api/team/submission", { description: "dentro da prorrogação" })).status, 200);
  eq((await S.admin.patch("/hack/api/admin/teams/" + S.alfa.id, { deadlineOverride: null })).status, 200);
  eq((await ana.get("/hack/api/team")).data.locked, true);
  const beta = (await S.admin.get("/hack/api/admin/teams")).data.teams.find((t) => t.id === S.beta.id);
  const add = await S.admin.patch("/hack/api/admin/teams/" + S.beta.id, { removeMember: beta.members[0].id });
  eq(add.status, 200, "diretoria ainda ajusta");
  await restartServer();
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
});

// ================= módulo 5: entrega e avaliação =================
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function uploadSlides(c, buf, name) {
  return c.raw("POST", "/hack/api/team/submission/slides", buf, { "X-File-Name": name || "pitch.pdf" });
}

test("entrega: equipe confirmada entrega repositório e PDF; links e arquivo são validados", async () => {
  // Sessões não sobrevivem aos reinícios dos testes anteriores (SIGKILL).
  S.c.ana = await enterAs("ana@ex.com");
  S.c.julia = await enterAs("julia@ex.com");
  let r = await S.c.ana.get("/hack/api/team/submission");
  eq(r.status, 200);
  eq(r.data.submission.complete, false);
  eq((await S.c.ana.put("/hack/api/team/submission", { repoUrl: "javascript:alert(1)" })).status, 400);
  eq((await S.c.ana.put("/hack/api/team/submission", { projectName: "Teachy+", repoUrl: "https://github.com/lepv/alfa", description: "Tutor de IA" })).status, 200);
  eq((await uploadSlides(S.c.ana, Buffer.from("<html>nope</html>"))).status, 400, "não é PDF");
  const up = await uploadSlides(S.c.ana, PDF);
  eq(up.status, 200, JSON.stringify(up.data));
  eq(up.data.submission.complete, true);
  const big = Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]);
  eq((await uploadSlides(S.c.ana, big)).status, 413, "acima de 20 MB");
  S.c.davi = await enterAs("davi@ex.com");
  eq((await S.c.davi.put("/hack/api/team/submission", { repoUrl: "https://github.com/x/y" })).status, 404, "sem equipe");
});

test("entrega: slides só para a equipe e a organização antes do prazo/abertura", async () => {
  const url = "/hack/api/submissions/" + S.alfa.id + "/slides";
  const own = await S.c.ana.get(url);
  eq(own.status, 200);
  eq(own.headers.get("content-type"), "application/pdf");
  eq((await S.c.davi.get(url)).status, 403, "outro participante");
  eq((await S.c.julia.get(url)).status, 403, "jurada antes da abertura");
  eq((await S.admin.get(url)).status, 200);
});

test("avaliação: segunda equipe, critérios travados antes de abrir", async () => {
  const solo = (await S.admin.get("/hack/api/admin/teams")).data.solo;
  const davi = solo.find((p) => p.email === "davi@ex.com");
  const wagner = solo.find((p) => p.email === "wagner@ex.com");
  const g = await S.admin.post("/hack/api/admin/teams", { name: "Gama", memberIds: [davi.id, wagner.id] });
  eq(g.status, 200);
  S.gama = g.data.team;
  eq((await S.admin.patch("/hack/api/admin/teams/" + S.gama.id, { confirm: true })).status, 200);
  eq((await S.c.davi.put("/hack/api/team/submission", { repoUrl: "https://github.com/lepv/gama" })).status, 200);
  eq((await uploadSlides(S.c.davi, PDF)).status, 200);
  // Diretoria corrige a entrega e remove só os slides: deixa de estar completa.
  eq((await S.admin.put("/hack/api/admin/submissions/" + S.gama.id, { description: "corrigido pela organização" })).status, 200);
  eq((await S.admin.del("/hack/api/admin/submissions/" + S.gama.id + "?only=slides")).status, 200);
  let gs = (await S.admin.get("/hack/api/admin/submissions")).data.submissions.find((x) => x.team.id === S.gama.id);
  eq(gs.complete, false);
  eq(gs.description, "corrigido pela organização");
  eq((await uploadSlides(S.c.davi, PDF)).status, 200);
  gs = (await S.admin.get("/hack/api/admin/submissions")).data.submissions.find((x) => x.team.id === S.gama.id);
  eq(gs.complete, true);

  const ev = (body) => S.admin.post("/hack/api/admin/evaluation", body);
  eq((await ev({ action: "open", open: true })).status, 409, "sem critérios travados");
  eq((await ev({ action: "addCriterion", name: "Aderência ao desafio", weight: 2 })).status, 200);
  const r = await ev({ action: "addCriterion", name: "Execução técnica", weight: 1, scaleMax: 10 });
  eq(r.status, 200);
  S.crit = r.data.config.criteria;
  eq((await ev({ action: "lockCriteria", lock: true })).status, 200);
  eq((await ev({ action: "addCriterion", name: "Pitch" })).status, 409, "travados");
  const j = await S.c.julia.get("/hack/api/judge");
  eq(j.data.open, false);
  eq(j.data.visible, false, "antes do prazo a banca não vê projetos");
  eq(j.data.teams.length, 0);
  eq((await S.c.julia.put("/hack/api/judge/scores/" + S.alfa.id, { values: {} })).status, 409, "fechada");
  eq((await ev({ action: "open", open: true })).status, 200);
});

const score = (a, b) => ({ values: { [S.crit[0].id]: a, [S.crit[1].id]: b } });

test("avaliação: jurados dão nota, cada um vê só a sua; impedido não pontua", async () => {
  const j = await S.c.julia.get("/hack/api/judge");
  eq(j.status, 200);
  eq(j.data.teams.length, 2);
  eq(j.data.criteria.length, 2);
  eq((await S.c.julia.get("/hack/api/submissions/" + S.alfa.id + "/slides")).status, 200, "com a avaliação aberta a banca vê os slides");
  eq((await S.c.julia.put("/hack/api/judge/scores/" + S.alfa.id, score(6, 5))).status, 400, "fora da escala");
  eq((await S.c.julia.put("/hack/api/judge/scores/" + S.alfa.id, Object.assign(score(5, 10), { comment: "ótimo pitch" }))).status, 200);
  eq((await S.c.julia.put("/hack/api/judge/scores/" + S.gama.id, score(3, 6))).status, 200);
  const jorge = await enterAs("jurado2@ex.com");
  eq((await jorge.post("/hack/api/judge/conflicts/" + S.alfa.id, { conflict: true })).status, 200);
  eq((await jorge.put("/hack/api/judge/scores/" + S.alfa.id, score(1, 1))).status, 409, "impedido");
  eq((await jorge.put("/hack/api/judge/scores/" + S.gama.id, Object.assign(score(4, 8), { comment: "segredo-do-jorge" }))).status, 200);
  const view = await S.c.julia.get("/hack/api/judge");
  assert(!JSON.stringify(view.data).includes("segredo-do-jorge"), "nota de outro jurado não vaza");
  eq((await S.c.ana.get("/hack/api/judge")).status, 403);
  const rk = (await S.admin.get("/hack/api/admin/evaluation")).data.ranking;
  eq(rk[0].teamId, S.alfa.id);
  eq(rk[0].score, 100);
  eq(rk[0].judges, 1);
  eq(rk[0].eligibleJudges, 1, "impedido não conta");
  eq(rk[1].teamId, S.gama.id);
  eq(rk[1].judges, 2);
});

test("resultado: travado fecha a banca; só depois de revelar o pódio fica público, sem notas", async () => {
  eq((await client().get("/hack/api/results")).data.podium, null);
  const ev = (body) => S.admin.post("/hack/api/admin/evaluation", body);
  eq((await ev({ action: "reveal" })).status, 409, "trave antes");
  eq((await ev({ action: "lockResults", lock: true })).status, 200);
  eq((await S.c.julia.put("/hack/api/judge/scores/" + S.gama.id, score(5, 10))).status, 409);
  eq((await ev({ action: "reveal" })).status, 200);
  const pub = await client().get("/hack/api/results");
  eq(pub.data.podium[0].name, "Alfa");
  eq(pub.data.podium[0].position, 1);
  assert(!JSON.stringify(pub.data).includes("score"), "sem nota no público");
  eq((await ev({ action: "lockResults", lock: false })).status, 409, "revelado não destrava");
  eq((await ev({ action: "lockResults", lock: true })).status, 409, "nem re-trava");
  eq((await ev({ action: "podium", podiumSize: 1 })).status, 409, "pódio revelado não muda de tamanho");
  eq((await ev({ action: "tiebreak", id: S.crit[1].id })).status, 409, "desempate travado");
  eq((await S.admin.post("/hack/api/admin/teams/" + S.alfa.id + "/merge", { otherId: S.gama.id })).status, 409, "equipes congeladas");
});

test("entrega: depois do prazo a equipe não edita mais", async () => {
  await restartServer({ HACK_NOW: "2026-10-31T16:01:00Z" });
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
  const ana = await enterAs("ana@ex.com");
  const r = await ana.get("/hack/api/team/submission");
  eq(r.data.open, false);
  eq((await ana.put("/hack/api/team/submission", { description: "tarde demais" })).status, 409);
  eq((await uploadSlides(ana, PDF)).status, 409);
  // Resultado já revelado: nem a diretoria mexe mais na Alfa.
  eq((await S.admin.patch("/hack/api/admin/teams/" + S.alfa.id, { deadlineOverride: "2026-10-31T16:30:00Z" })).status, 200, "prorrogação só registra");
  eq((await ana.put("/hack/api/team/submission", { description: "com prorrogação" })).status, 409, "resultado travado congela");
  eq((await S.admin.del("/hack/api/admin/submissions/" + S.alfa.id + "?only=slides")).status, 409, "travado");
  await restartServer();
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
});

// ================= módulo 6: parceiros =================

test("parceiros: formulário pede, não concede; diretoria aprova e o representante vê só a própria agenda", async () => {
  const ad = (u, b, m) => (m === "PATCH" ? S.admin.patch(u, b) : S.admin.post(u, b));
  const t = await ad("/hack/api/admin/partners/orgs", { name: "Teachy", kind: "sponsor" });
  eq(t.status, 200);
  const n = await ad("/hack/api/admin/partners/orgs", { name: "Norte", kind: "sponsor" });
  const ap = await ad("/hack/api/admin/partners/orgs", { name: "Café Apoio", kind: "supporter" });
  S.orgs = { teachy: t.data.org, norte: n.data.org, apoio: ap.data.org };
  const pub = await client().get("/hack/api/partners/orgs");
  eq(pub.data.sponsor.length, 2);
  eq(pub.data.supporter[0].name, "Café Apoio");
  const anon = client();
  eq((await anon.post("/hack/api/partners/request", { kind: "sponsor", orgId: S.orgs.apoio.id, name: "Rita Rep", email: "rita@teachy.com" })).status, 400, "org de outra modalidade");
  eq((await anon.post("/hack/api/partners/request", { kind: "sponsor", orgId: S.orgs.teachy.id, name: "Rita Rep", email: "rita@teachy.com", phone: "21933332222" })).status, 200);
  eq((await anon.post("/hack/api/partners/request", { kind: "supporter", orgId: S.orgs.apoio.id, name: "Caio Café", email: "caio@cafe.com" })).status, 200);
  // pedido pendente: pedir o link não entra
  eq((await client().post("/hack/api/access/request", { email: "rita@teachy.com" })).status, 200);
  await new Promise((r) => setTimeout(r, 400));
  eq(mails().filter((m) => m.to === "rita@teachy.com").length, 0, "pendente não recebe link");
  // atividade da Teachy na programação
  const prog = (await S.admin.get("/hack/api/admin/program")).data.program;
  const probl = prog.find((a) => /^Teachy: o mercado de educação/.test(a.title));
  eq((await S.admin.patch("/hack/api/admin/program/" + probl.id, { orgIds: [S.orgs.teachy.id] })).status, 200);
  const reqs = (await S.admin.get("/hack/api/admin/partners")).data.requests;
  const rita = reqs.find((x) => x.email === "rita@teachy.com");
  const caio = reqs.find((x) => x.email === "caio@cafe.com");
  const ok = await S.admin.post("/hack/api/admin/partners/requests/" + rita.id, { approve: true });
  eq(ok.status, 200);
  assert(ok.data.whatsappUrl.startsWith("https://wa.me/5521933332222"), "atalho de WhatsApp");
  eq((await S.admin.post("/hack/api/admin/partners/requests/" + caio.id, { approve: true })).status, 200);
  S.c.rita = await enterAs("rita@teachy.com");
  S.c.caio = await enterAs("caio@cafe.com");
  const pr = await S.c.rita.get("/hack/api/partner");
  eq(pr.status, 200);
  eq(pr.data.org.name, "Teachy");
  eq(pr.data.agenda.length, 1);
  eq(pr.data.canExport, true);
  const pc = await S.c.caio.get("/hack/api/partner");
  eq(pc.data.agenda.length, 0, "agenda de outra organização não aparece");
  eq(pc.data.canExport, false);
});

test("parceiros: exportação só para patrocinador, só de quem autorizou, registrada", async () => {
  const csv = await S.c.rita.get("/hack/api/partner/export.csv");
  eq(csv.status, 200);
  assert(String(csv.headers.get("content-type")).startsWith("text/csv"), "csv");
  assert(csv.data.includes("ana@ex.com"), "Ana autorizou");
  assert(!csv.data.includes("bruno@ex.com"), "Bruno não autorizou");
  assert(!csv.data.includes("julia@ex.com"), "jurada não é participante");
  eq((await S.c.caio.get("/hack/api/partner/export.csv")).status, 403, "apoiador");
  // Sessões anteriores caíram no reinício do teste de prazo: entra de novo.
  S.c.julia = await enterAs("julia@ex.com");
  S.c.ana = await enterAs("ana@ex.com");
  eq((await S.c.julia.get("/hack/api/partner/export.csv")).status, 403, "jurada");
  eq((await S.c.ana.get("/hack/api/partner/export.csv")).status, 403, "participante");
  // Aviso só para participantes: patrocinadora não vê; para patrocinadores, vê.
  const a1 = await S.admin.post("/hack/api/admin/announcements", { title: "Só participantes", body: "x x x", audiences: ["participant"] });
  const a2 = await S.admin.post("/hack/api/admin/announcements", { title: "Só patrocinadores", body: "y y y", audiences: ["sponsor"] });
  const seen = (await S.c.rita.get("/hack/api/announcements")).data.announcements.map((x) => x.id);
  eq(seen.includes(a1.data.announcement.id), false, "patrocinadora não vê aviso de participantes");
  eq(seen.includes(a2.data.announcement.id), true);
  eq((await S.c.rita.post("/hack/api/announcements/" + a1.data.announcement.id + "/read")).status, 404, "nem pela API direta");
  eq((await S.c.ana.get("/hack/api/announcements")).data.announcements.some((x) => x.id === a2.data.announcement.id), false);
  eq((await S.admin.patch("/hack/api/admin/partners/orgs/" + S.orgs.teachy.id, { active: false })).status, 200);
  eq((await S.c.rita.get("/hack/api/partner/export.csv")).status, 403, "organização desativada");
  eq((await S.c.rita.get("/hack/api/partner")).data.canExport, false);
  eq((await S.admin.patch("/hack/api/admin/partners/orgs/" + S.orgs.teachy.id, { active: true })).status, 200);
  const log = (await S.admin.get("/hack/api/admin/partners")).data.exports;
  eq(log.length, 1);
  eq(log[0].person, "Rita Rep");
});

test("parceiros: removido perde o acesso da organização na hora", async () => {
  const reps = (await S.admin.get("/hack/api/admin/partners")).data.representatives;
  const rita = reps.find((p) => p.email === "rita@teachy.com");
  eq((await S.admin.del("/hack/api/admin/partners/representatives/" + rita.id)).status, 200);
  eq((await S.c.rita.get("/hack/api/partner")).status, 401, "sessão derrubada");
  eq((await S.c.rita.get("/hack/api/partner/export.csv")).status, 401);
});

// ================= módulo 7: credenciamento =================
function storeState() {
  return JSON.parse(fs.readFileSync(path.join(volumeDir, "hackathon.json"), "utf8"));
}
const qrOf = (email) => "LEPVHACK1:" + storeState().people.find((p) => p.email === email).qrToken;

test("credenciamento: só quem tem permissão lê; QR vale uma vez por dia", async () => {
  eq((await S.c.ana.post("/hack/api/checkin/scan", { code: "x", day: "2026-10-30" })).status, 403, "participante");
  const r = await S.admin.post("/hack/api/checkin/scan", { code: qrOf("ana@ex.com"), day: "2026-10-30" });
  eq(r.status, 200);
  eq(r.data.status, "ok");
  eq(r.data.person.team, "Alfa");
  const d = await S.admin.post("/hack/api/checkin/scan", { code: qrOf("ana@ex.com"), day: "2026-10-30" });
  eq(d.data.status, "duplicate");
  eq((await S.admin.post("/hack/api/checkin/scan", { code: "LEPVHACK1:naoexiste0000000000", day: "2026-10-30" })).data.status, "invalid");
  eq((await S.admin.post("/hack/api/checkin/scan", { code: qrOf("ana@ex.com"), day: "2026-11-02" })).status, 400, "dia fora do evento");
  // QR não autentica o portal
  eq((await client().post("/hack/api/access/consume", { token: qrOf("ana@ex.com").split(":")[1] })).status, 401);
});

test("credenciamento: busca manual e registro sem QR", async () => {
  const r = await S.admin.get("/hack/api/checkin/search?q=carla&day=2026-10-30");
  eq(r.status, 200);
  const carla = r.data.people.find((p) => p.name === "Carla Participante");
  assert(carla && !carla.checkin, "Carla sem entrada");
  const m = await S.admin.post("/hack/api/checkin/person/" + carla.id, { day: "2026-10-30" });
  eq(m.data.status, "ok");
  const again = await S.admin.get("/hack/api/checkin/search?q=carla&day=2026-10-30");
  assert(again.data.people.find((p) => p.id === carla.id).checkin, "agora com entrada");
});

test("credenciamento: offline sincroniza sem duplicar, com aparelho revogável", async () => {
  const p1 = await S.admin.post("/hack/api/checkin/prepare", { label: "celular 1" });
  eq(p1.status, 200);
  const snap = JSON.stringify(p1.data.snapshot);
  assert(!snap.includes("bruno@ex.com") && !snap.includes(qrOf("bruno@ex.com").split(":")[1]), "cópia sem contato e sem token");
  const p2 = await S.admin.post("/hack/api/checkin/prepare", { label: "celular 2" });
  const crypto = require("crypto");
  const h = crypto.createHash("sha256").update(qrOf("bruno@ex.com").split(":")[1]).digest("hex");
  const op = { opId: "op1-bruno-offline", h, day: "2026-10-31", at: new Date().toISOString() };
  const s1 = await S.admin.post("/hack/api/checkin/sync", { deviceId: p1.data.deviceId, deviceToken: p1.data.deviceToken, ops: [op] });
  eq(s1.data.results[0].status, "ok");
  const s1b = await S.admin.post("/hack/api/checkin/sync", { deviceId: p1.data.deviceId, deviceToken: p1.data.deviceToken, ops: [op] });
  eq(s1b.data.results[0].status, "ok", "reenvio idempotente");
  const s2 = await S.admin.post("/hack/api/checkin/sync", { deviceId: p2.data.deviceId, deviceToken: p2.data.deviceToken, ops: [Object.assign({}, op, { opId: "op2-bruno-offline" })] });
  eq(s2.data.results[0].status, "duplicate", "segundo aparelho não dobra");
  const count = storeState().checkins.filter((c) => c.day === "2026-10-31" && c.personId === s1.data.results[0].personId).length;
  eq(count, 1);
  eq((await S.admin.post("/hack/api/checkin/sync", { deviceId: p1.data.deviceId, deviceToken: "errado", ops: [] })).status, 401);
  eq((await S.admin.post("/hack/api/admin/devices/" + p2.data.deviceId + "/revoke")).status, 200);
  eq((await S.admin.post("/hack/api/checkin/sync", { deviceId: p2.data.deviceId, deviceToken: p2.data.deviceToken, ops: [] })).status, 401, "revogado");
  const devs = (await S.admin.get("/hack/api/admin/devices")).data.devices;
  assert(devs.find((d) => d.id === p1.data.deviceId).lastSyncAt, "última sincronização registrada");
});

test("credenciamento: no dia do evento o servidor impõe o dia de hoje; snapshot exige o aparelho", async () => {
  await restartServer({ HACK_NOW: "2026-10-31T12:00:00Z" });
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
  const st = await S.admin.get("/hack/api/checkin/status");
  eq(st.data.dayLocked, true);
  eq(st.data.defaultDay, "2026-10-31");
  eq((await S.admin.post("/hack/api/checkin/scan", { code: qrOf("elisa@ex.com"), day: "2026-10-30" })).status, 400, "sexta no sábado");
  const r = await S.admin.post("/hack/api/checkin/scan", { code: qrOf("elisa@ex.com") });
  eq(r.data.checkin.day, "2026-10-31");
  const p = await S.admin.post("/hack/api/checkin/prepare", {});
  eq((await S.admin.post("/hack/api/checkin/snapshot", { deviceId: p.data.deviceId, deviceToken: "errado" })).status, 401);
  eq((await S.admin.post("/hack/api/checkin/snapshot", { deviceId: p.data.deviceId, deviceToken: p.data.deviceToken })).status, 200);
  await restartServer();
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200);
});

test("credenciamento: staff só com a permissão marcada", async () => {
  const sofia = (await S.admin.get("/hack/api/admin/people")).data.people.find((p) => p.email === "sofia@ex.com");
  const link = async () => (await S.admin.post("/hack/api/admin/people/" + sofia.id + "/link", { send: "none" })).data.url.split("#t=")[1];
  const c = client();
  eq((await c.post("/hack/api/access/consume", { token: await link() })).status, 200);
  eq((await c.post("/hack/api/checkin/scan", { code: qrOf("davi@ex.com"), day: "2026-10-30" })).status, 403);
  eq((await S.admin.patch("/hack/api/admin/people/" + sofia.id, { staffPerms: { checkin: true } })).status, 200);
  const r = await c.post("/hack/api/checkin/scan", { code: qrOf("davi@ex.com"), day: "2026-10-30" });
  eq(r.status, 200);
  eq(r.data.status, "ok");
  eq((await c.del("/hack/api/checkin/" + r.data.checkin.id)).status, 403, "desfazer é da diretoria");
  eq((await S.admin.del("/hack/api/checkin/" + r.data.checkin.id)).status, 200);
});

// ================= senha (revisão 4) =================

// Pede link e consome, devolvendo também a resposta do consumo.
async function linkLogin(email) {
  const c = client();
  const before = lastLinkFor(email);
  eq((await c.post("/hack/api/access/request", { email })).status, 200, "pedido de link");
  const tok = await waitFor(() => {
    const t = lastLinkFor(email);
    return t && t !== before ? t : null;
  });
  assert(tok, "link não chegou para " + email);
  const k = await c.post("/hack/api/access/consume", { token: tok });
  eq(k.status, 200, "consumo do link");
  return { c, consume: k.data, token: tok };
}

const hackState = () => JSON.parse(fs.readFileSync(path.join(volumeDir, "hackathon.json"), "utf8"));

// Reinicia (zera os limites por e-mail e IP) e loga a diretoria de novo.
async function freshServer(extraEnv) {
  await restartServer(extraEnv);
  S.admin = client();
  eq((await S.admin.post("/api/login", { order: 1, password: ADMIN_PASS })).status, 200, "login admin");
}

test("senha: e-mail do link traz nome, data, local, endereço por extenso e validade de 24h", async () => {
  // Relógio de volta ao padrão e limites zerados: a jornada acima mexeu nos dois.
  await freshServer();
  const { consume } = await linkLogin("davi@ex.com");
  eq(consume.needsPassword, true, "sem senha, o consumo pede criação");
  const m = mails().filter((x) => x.to === "davi@ex.com").pop();
  assert(/^Davi, seu acesso ao 1º Hackathon LEPV$/.test(m.subject), "assunto: " + m.subject);
  assert(m.text.includes("vale por 24 horas"), "validade do link pedido pela pessoa");
  assert(m.text.includes("criar uma senha"), "menciona a senha");
  // O endereço da FGV foi editado pela diretoria no teste de programação.
  assert(/Sexta, 30\/10: FGV · Praia de Botafogo, 190 · a partir das 14h30/.test(m.text) && /Sábado, 31\/10: Instituto 12 · Av\. Ataulfo/.test(m.text), "data e local no texto");
  assert(!/confirmar/i.test(m.text), "endereço a confirmar não aparece");
  const url = /Entrar: (\S+)/.exec(m.text)[1];
  assert(url.startsWith("https://lepv.example/hack/acesso#t="), "base pública");
  assert(m.html.includes("Se o botão não abrir") && m.html.includes(url), "endereço por extenso no HTML");
  const tok = hackState().tokens.filter((t) => t.personId === S.people.ids["davi@ex.com"]).pop();
  eq(Date.parse(tok.expiresAt) - Date.parse(tok.createdAt), 24 * 3600 * 1000, "link pedido pela pessoa: 24h");
});

test("senha: fraca é recusada; criar mantém este aparelho e derruba os outros", async () => {
  const a = await linkLogin("davi@ex.com");
  const b = await linkLogin("davi@ex.com");
  const me = await a.c.get("/hack/api/me");
  eq(me.data.account.hasPassword, false);
  eq(me.data.account.canSetPassword, true);
  for (const weak of ["curta", "12345678", "aaaaaaaaaa", "davi@ex.com"]) {
    eq((await a.c.post("/hack/api/me/password", { password: weak })).status, 400, "fraca: " + weak);
  }
  eq((await client().post("/hack/api/me/password", { password: "senha-forte-davi" })).status, 401, "sem sessão");
  eq((await a.c.post("/hack/api/me/password", { password: "senha-forte-davi" })).status, 200);
  eq((await a.c.get("/hack/api/me")).status, 200, "este aparelho continua");
  eq((await b.c.get("/hack/api/me")).status, 401, "o outro aparelho saiu");
  const people = (await S.admin.get("/hack/api/admin/people")).data.people;
  const davi = people.find((p) => p.email === "davi@ex.com");
  eq(davi.hasPassword, true, "painel sabe que tem senha");
  assert(!("passwordHash" in davi), "hash nunca sai na API");
});

test("senha: entra com e-mail e senha; erro igual para senha errada, sem senha e inexistente", async () => {
  const c = client();
  const ok = await c.post("/hack/api/access/login", { email: "DAVI@ex.com", password: "senha-forte-davi" });
  eq(ok.status, 200, "login com e-mail em maiúsculas");
  eq(ok.data.redirect, "/hack/portal");
  const me = await c.get("/hack/api/me");
  eq(me.status, 200);
  eq(me.data.me.email, "davi@ex.com");
  eq(me.data.account.needsCurrent, true, "sessão por senha pede a atual para trocar");
  const wrong = await client().post("/hack/api/access/login", { email: "davi@ex.com", password: "outra-senha-qualquer" });
  const noPass = await client().post("/hack/api/access/login", { email: "ana@ex.com", password: "outra-senha-qualquer" });
  const ghost = await client().post("/hack/api/access/login", { email: "fantasma@ex.com", password: "outra-senha-qualquer" });
  for (const r of [wrong, noPass, ghost]) {
    eq(r.status, 401);
    eq(r.data.message, "E-mail ou senha incorretos.");
  }
  eq((await client().post("/hack/api/access/login", { email: "davi@ex.com" })).status, 400, "sem senha no pedido");
});

test("senha: trocar pede a atual; logo depois do link não pede", async () => {
  // Reinício zera o limite de 3 links por hora do Davi; a sessão por senha
  // é refeita depois dele.
  await freshServer();
  const c = client();
  eq((await c.post("/hack/api/access/login", { email: "davi@ex.com", password: "senha-forte-davi" })).status, 200);
  eq((await c.post("/hack/api/me/password", { password: "nova-senha-davi" })).status, 403, "sem a atual");
  eq((await c.post("/hack/api/me/password", { current: "errada-errada", password: "nova-senha-davi" })).status, 403, "atual errada");
  eq((await c.post("/hack/api/me/password", { current: "senha-forte-davi", password: "nova-senha-davi" })).status, 200);
  eq((await c.get("/hack/api/me")).status, 200, "quem trocou continua");
  eq((await client().post("/hack/api/access/login", { email: "davi@ex.com", password: "senha-forte-davi" })).status, 401, "senha antiga");
  eq((await client().post("/hack/api/access/login", { email: "davi@ex.com", password: "nova-senha-davi" })).status, 200, "senha nova");
  // Esqueceu a senha: entra pelo link e troca sem a atual.
  const { c: viaLink, consume } = await linkLogin("davi@ex.com");
  eq(consume.needsPassword, false, "já tem senha: não oferece criar");
  eq((await viaLink.get("/hack/api/me")).data.account.needsCurrent, false);
  eq((await viaLink.post("/hack/api/me/password", { password: "terceira-senha-davi" })).status, 200);
  eq((await client().post("/hack/api/access/login", { email: "davi@ex.com", password: "terceira-senha-davi" })).status, 200);
});

test("senha: bloqueado não entra por senha; limite de tentativas por e-mail (429)", async () => {
  await freshServer();
  const id = S.people.ids["davi@ex.com"];
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { disabled: true })).status, 200);
  const r = await client().post("/hack/api/access/login", { email: "davi@ex.com", password: "terceira-senha-davi" });
  eq(r.status, 401, "bloqueado");
  eq(r.data.message, "E-mail ou senha incorretos.");
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { disabled: false })).status, 200);
  const c = client();
  for (let i = 0; i < 10; i++) eq((await c.post("/hack/api/access/login", { email: "chute@ex.com", password: "tentativa-" + i })).status, 401);
  eq((await c.post("/hack/api/access/login", { email: "chute@ex.com", password: "tentativa-x" })).status, 429);
});

test("senha: link pedido pela pessoa vence em 24h; o da organização vale 7 dias", async () => {
  const before = lastLinkFor("davi@ex.com");
  eq((await client().post("/hack/api/access/request", { email: "davi@ex.com" })).status, 200);
  const tok = await waitFor(() => {
    const t = lastLinkFor("davi@ex.com");
    return t && t !== before ? t : null;
  });
  assert(tok, "link chegou");
  const manual = await S.admin.post("/hack/api/admin/people/" + S.people.ids["ana@ex.com"] + "/link");
  eq(manual.status, 200);
  const anaTok = hackState().tokens.filter((t) => t.personId === S.people.ids["ana@ex.com"]).pop();
  eq(Date.parse(anaTok.expiresAt) - Date.parse(anaTok.createdAt), 7 * 24 * 3600 * 1000, "link da organização: 7 dias");
  await freshServer({ HACK_NOW: new Date(Date.parse(BASE_NOW) + 25 * 3600 * 1000).toISOString() });
  eq((await client().post("/hack/api/access/consume", { token: tok })).status, 401, "vencido depois de 24h");
  eq((await client().post("/hack/api/access/consume", { token: manual.data.url.split("#t=")[1] })).status, 200, "o de 7 dias ainda vale");
  await freshServer();
});

test("senha: desconectar, trocar o e-mail e promover a jurado apagam a senha", async () => {
  const id = S.people.ids["davi@ex.com"];
  const login = (email, password) => client().post("/hack/api/access/login", { email, password });
  // Cria (de novo) a senha do Davi entrando pelo link.
  const withPassword = async (pw) => {
    const { c } = await linkLogin("davi@ex.com");
    eq((await c.post("/hack/api/me/password", { password: pw })).status, 200);
    return c;
  };

  const c1 = await withPassword("senha-um-davi-x");
  eq((await S.admin.post("/hack/api/admin/people/" + id + "/revoke")).status, 200);
  eq((await c1.get("/hack/api/me")).status, 401, "desconectado");
  eq((await login("davi@ex.com", "senha-um-davi-x")).status, 401, "a senha não entra de novo depois de Desconectar");

  const c2 = await withPassword("senha-dois-davi-x");
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { email: "davi.novo@ex.com" })).status, 200);
  eq((await c2.get("/hack/api/me")).status, 401, "quem entrou pelo e-mail antigo sai");
  eq((await login("davi.novo@ex.com", "senha-dois-davi-x")).status, 401, "a senha criada pelo e-mail antigo não vale no novo");
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { email: "davi@ex.com" })).status, 200);

  await withPassword("senha-bloq-davi-x");
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { disabled: true })).status, 200);
  eq((await S.admin.patch("/hack/api/admin/people/" + id, { disabled: false })).status, 200);
  eq((await login("davi@ex.com", "senha-bloq-davi-x")).status, 401, "desbloquear não devolve a senha antiga");

  // O limite de 3 links por hora do Davi acabou acima.
  await freshServer();
  await withPassword("senha-tres-davi-x");
  eq((await S.admin.post("/hack/api/admin/people", { name: "Davi Jurado", email: "davi@ex.com", roles: ["judge"] })).status, 200);
  eq((await login("davi@ex.com", "senha-tres-davi-x")).status, 401, "promoção apaga a senha");
  const p = (await S.admin.get("/hack/api/admin/people")).data.people.find((x) => x.id === id);
  eq(p.hasPassword, false);
});

test("exclusão: só o superadmin, com o nome digitado; inscrição sai e não volta", async () => {
  const signup = await client().post("/api/event-signup/" + S.signupToken, {
    name: "Zeca Exclusão", email: "zeca@ex.com", phone: "21999990077", vinculo: "UFPE", temGrupo: "Não", awareLocation: true, awareTime: true,
  });
  eq(signup.status, 200);
  const findZeca = async () => (await S.admin.get("/hack/api/admin/people")).data.people.find((p) => p.email === "zeca@ex.com");
  const z = await findZeca();
  assert(z, "inscrição virou pessoa no /hack");
  const url = "/hack/api/admin/people/" + z.id;
  eq((await client().raw("DELETE", url, { confirmName: "Zeca Exclusão" })).status, 401);
  eq((await S.people.ana.raw("DELETE", url, { confirmName: "Zeca Exclusão" })).status, 403, "participante não exclui");
  eq((await S.admin.raw("DELETE", url, { confirmName: "Zeca" })).status, 400, "nome incompleto");
  eq((await S.admin.raw("DELETE", url, {})).status, 400, "sem confirmação");
  // Jurado ou staff não se exclui: Bloquear.
  const sofia = (await S.admin.get("/hack/api/admin/people")).data.people.find((p) => p.email === "sofia@ex.com");
  eq((await S.admin.raw("DELETE", "/hack/api/admin/people/" + sofia.id, { confirmName: sofia.name })).status, 409);
  const r = await S.admin.raw("DELETE", url, { confirmName: "  zeca   EXCLUSÃO " });
  eq(r.status, 200, "nome confere ignorando caixa e espaços: " + JSON.stringify(r.data));
  eq(await findZeca(), undefined, "some da lista (e a sincronização não traz de volta)");
  const ev = (await S.admin.get("/api/events")).data.events.find((e) => e.type === "hackathon");
  assert(!ev.signups.some((x) => x.email === "zeca@ex.com"), "inscrição apagada do evento");
  const o = (await S.admin.get("/hack/api/admin/overview")).data;
  assert(o.removals.some((x) => x.name === "Zeca Exclusão" && x.by), "registro na visão geral");
  eq((await S.admin.raw("DELETE", url, { confirmName: "Zeca Exclusão" })).status, 404, "já não existe");
});

// ================= execução =================
(async () => {
  setupVolume();
  const results = { pass: 0, fail: 0 };
  try {
    await startServer();
    for (const t of tests) {
      try {
        await t.fn();
        results.pass++;
        console.log("  ok   " + t.name);
      } catch (err) {
        results.fail++;
        console.log("  FALHA " + t.name + "\n        " + err.message);
      }
    }
  } finally {
    stopServer();
    fs.rmSync(volumeDir, { recursive: true, force: true });
  }
  console.log("\nhack e2e: " + results.pass + " passaram, " + results.fail + " falharam");
  process.exitCode = results.fail ? 1 : 0;
})().catch((e) => {
  console.error(e);
  stopServer();
  process.exitCode = 1;
});

module.exports = { restartServer };
