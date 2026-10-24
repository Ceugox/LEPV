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
const MEMBER_PASS = "teste-membro-hack";

let volumeDir;
let outbox;
let server;

function setupVolume() {
  volumeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lepv-hack-e2e-"));
  outbox = path.join(volumeDir, "outbox");
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
  stopServer();
  await new Promise((r) => server.once("exit", r));
  await startServer(extraEnv);
}

function client() {
  let cookie = "";
  async function req(method, url, body) {
    const opts = { method, headers: {}, redirect: "manual" };
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
      name: p.name, email: p.email, phone: p.phone, vinculo: "FGV", curso: "Economia", temGrupo: p.temGrupo,
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
  eq((await S.people.ana.post("/hack/api/admin/program", { day: "2026-10-30", start: "18:00", title: "x" })).status, 403);
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
