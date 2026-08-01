const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

// Em produção (Railway), STORAGE_DIR aponta para um volume persistente —
// os demais arquivos em data/ são só leitura e podem ser reconstruídos a
// cada deploy, mas o checklist é editado em runtime e precisa sobreviver.
const STORAGE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || DATA_DIR;
const CHECKLIST_PATH = path.join(STORAGE_DIR, "checklist.json");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

// ---- Persistência do volume: escrita atômica + cópia de segurança ----
//
// fs.writeFileSync abre com O_TRUNC: zera o arquivo e só depois escreve. Se o
// processo morrer nessa janela (SIGTERM de redeploy, OOM), o JSON fica
// truncado — e o app não sobe mais, porque o re-seed só roda quando o arquivo
// NÃO existe. Então toda escrita do volume passa por aqui: grava .tmp, fsync,
// guarda a versão boa anterior em .bak e só então renomeia (rename é atômico
// no mesmo filesystem). Na leitura, JSON quebrado cai no .bak em vez de
// derrubar a liga inteira.
function writeStore(filePath, value) {
  const body = JSON.stringify(value, null, 2) + "\n";
  const tmp = filePath + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, body, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, filePath + ".bak");
    } catch (err) {
      console.error("Falha ao gravar backup de " + path.basename(filePath) + ":", err.message);
    }
  }
  fs.renameSync(tmp, filePath);
}

function readStore(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    const bak = filePath + ".bak";
    if (!fs.existsSync(bak)) throw err;
    console.error(
      "ATENÇÃO: " + path.basename(filePath) + " ilegível (" + err.message + "). Usando o .bak."
    );
    return JSON.parse(fs.readFileSync(bak, "utf8"));
  }
}

function readChecklist() {
  return readStore(CHECKLIST_PATH);
}
function writeChecklist(value) {
  writeStore(CHECKLIST_PATH, value);
}
if (!fs.existsSync(CHECKLIST_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeChecklist(readJson("checklist.json"));
}

// Presença por empresa (quem já visitou) — editada em runtime pelo admin,
// então segue o mesmo padrão do checklist: persiste no volume, não em data/.
const ATTENDANCE_PATH = path.join(STORAGE_DIR, "attendance.json");
function readAttendance() {
  return readStore(ATTENDANCE_PATH);
}
function writeAttendance(value) {
  writeStore(ATTENDANCE_PATH, value);
}
if (!fs.existsSync(ATTENDANCE_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeAttendance(readJson("attendance.json"));
}

// Perguntas do grupo por empresa (roteiro coletivo do Q&A de cada visita) —
// criadas em runtime pelos membros, mesmo padrão de persistência do checklist.
const QUESTIONS_PATH = path.join(STORAGE_DIR, "questions.json");
function readQuestions() {
  return readStore(QUESTIONS_PATH);
}
function writeQuestions(value) {
  writeStore(QUESTIONS_PATH, value);
}
if (!fs.existsSync(QUESTIONS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeQuestions({});
}

// Aprendizados pós-visita (memória coletiva da imersão) — mesmo padrão.
const LEARNINGS_PATH = path.join(STORAGE_DIR, "learnings.json");
function readLearnings() {
  return readStore(LEARNINGS_PATH);
}
function writeLearnings(value) {
  writeStore(LEARNINGS_PATH, value);
}
if (!fs.existsSync(LEARNINGS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeLearnings({});
}

// Enquete do bóton limitado (1ª imersão) — resposta por membro, no volume.
const PIN_POLL_PATH = path.join(STORAGE_DIR, "pin-poll.json");
function readPinPoll() {
  return readStore(PIN_POLL_PATH);
}
function writePinPoll(value) {
  writeStore(PIN_POLL_PATH, value);
}
if (!fs.existsSync(PIN_POLL_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writePinPoll({});
}

// Materiais de preparação por empresa — PDFs vivem no volume (fora do repo
// e do front), metadados em materials.json. Upload pelo painel admin.
const MATERIALS_PATH = path.join(STORAGE_DIR, "materials.json");
const MATERIALS_DIR = path.join(STORAGE_DIR, "materials");
function readMaterials() {
  return readStore(MATERIALS_PATH);
}
function writeMaterials(value) {
  writeStore(MATERIALS_PATH, value);
}
if (!fs.existsSync(MATERIALS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeMaterials({});
}
fs.mkdirSync(MATERIALS_DIR, { recursive: true });

// Formatos antigos, só para a migração ler uma vez: reuniões e aulas viraram
// eventos em 01/08/2026. Nada mais escreve nestes arquivos.
const MEETINGS_PATH = path.join(STORAGE_DIR, "meetings.json");

// Fotos de perfil enviadas pelos membros — vivem no volume e vencem a foto
// do repo (fundador troca a sua; membro novo adiciona a primeira).
const AVATARS_DIR = path.join(STORAGE_DIR, "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const AVATAR_EXTS = ["jpg", "png", "webp"];
function avatarFile(order) {
  for (const ext of AVATAR_EXTS) {
    const p = path.join(AVATARS_DIR, order + "." + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function memberPhoto(m) {
  const f = avatarFile(m.order);
  // mtime na query estoura o cache do browser quando a foto troca
  if (f) return "/avatars/" + m.order + "?v=" + Math.floor(fs.statSync(f).mtimeMs);
  return m.photo || null;
}
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

const LESSONS_PATH = path.join(STORAGE_DIR, "lessons.json");
// Os PDFs das aulas antigas continuam neste diretório — os eventos gravam no
// mesmo lugar para que nenhum material precise ser movido na migração.
const EVENT_FILES_DIR = path.join(STORAGE_DIR, "lesson-materials");
fs.mkdirSync(EVENT_FILES_DIR, { recursive: true });

// Mural de eventos da liga — qualquer diretor publica um aviso (título, texto
// e fotos) que roda no carrossel da aba Início. Fotos no volume, como avatars.
const EVENTS_PATH = path.join(STORAGE_DIR, "events.json");
const EVENT_PHOTOS_DIR = path.join(STORAGE_DIR, "event-photos");
function readEvents() {
  return readStore(EVENTS_PATH);
}
function writeEvents(value) {
  writeStore(EVENTS_PATH, value);
}
if (!fs.existsSync(EVENTS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeEvents({ events: [] });
}
fs.mkdirSync(EVENT_PHOTOS_DIR, { recursive: true });

// Códigos de presença sem caracteres ambíguos (sem 0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCode(len) {
  let out = "";
  for (let i = 0; i < (len || 6); i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

if (!fs.existsSync(path.join(DATA_DIR, "credentials.json"))) {
  console.error("credentials.json não encontrado. Rode: npm run seed");
  process.exit(1);
}

// Membros fundadores (da imersão) vivem no repo; membros aprovados depois
// vivem no volume (signups.json) — o repo é read-only em produção e um
// deploy não pode apagar gente da liga. Toda leitura de membro/credencial
// passa pelas funções abaixo, que enxergam as duas fontes.
const seedMembers = readJson("members.json");
const seedCredentials = readJson("credentials.json");

const SIGNUPS_PATH = path.join(STORAGE_DIR, "signups.json");
function readSignups() {
  return readStore(SIGNUPS_PATH);
}
function writeSignups(value) {
  writeStore(SIGNUPS_PATH, value);
}
if (!fs.existsSync(SIGNUPS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeSignups({
    nextOrder: seedMembers.reduce((max, m) => Math.max(max, m.order), 0) + 1,
    pending: [],
    members: [],
    credentials: [],
  });
}

// allMembers inclui inativos (Carol e Ana ficam no histórico da imersão, mas
// não são membros da liga); activeMembers é o roster que loga e aparece.
function allMembers() {
  return seedMembers.concat(readSignups().members);
}
function activeMembers() {
  return allMembers().filter((m) => m.active !== false);
}
function findMember(order) {
  return activeMembers().find((m) => m.order === order);
}
function findMemberAny(order) {
  return allMembers().find((m) => m.order === order);
}
// O volume vence o seed: trocar a senha grava um override em signups.json,
// que sobrevive a deploys — a credencial do repo vira só o estado inicial.
function findCredential(order) {
  return (
    readSignups().credentials.find((c) => c.order === order) ||
    seedCredentials.find((c) => c.order === order)
  );
}

// Flags de sessão derivam sempre do cadastro atual — recalculadas no login e
// em /api/me, para promoção/remoção de papéis valer sem esperar novo login.
function sessionUser(member, cred) {
  return {
    order: member.order,
    name: member.name,
    admin: member.admin === true,
    superadmin: member.superadmin === true,
    director: member.director === true || member.superadmin === true,
    immersion: seedMembers.some((s) => s.order === member.order),
    mustChangePassword: Boolean(cred && cred.mustChangePassword === true),
  };
}

// Sessões no volume, não na memória do processo. Com o MemoryStore padrão do
// express-session, todo deploy (que aqui é manual e frequente) derrubava a
// sessão da liga inteira — SESSION_SECRET fixo não resolve isso, ele só evita
// que o cookie fique inválido. As sessões vivem em memória para leitura rápida
// e são persistidas em lote: uma gravação por segundo no máximo, e sempre uma
// no SIGTERM, que é exatamente o sinal que o Railway manda antes de trocar a
// versão.
const SESSIONS_PATH = path.join(STORAGE_DIR, "sessions.json");
class VolumeSessionStore extends session.Store {
  constructor() {
    super();
    this.sessions = new Map();
    this.dirty = false;
    try {
      if (fs.existsSync(SESSIONS_PATH)) {
        const saved = readStore(SESSIONS_PATH);
        const now = Date.now();
        for (const [sid, rec] of Object.entries(saved)) {
          if (!rec.expiresAt || rec.expiresAt > now) this.sessions.set(sid, rec);
        }
      }
    } catch (err) {
      console.error("Sessões do volume ilegíveis, começando vazio:", err.message);
    }
    this.timer = setInterval(() => this.flush(), 1000);
    this.timer.unref();
  }
  expiryOf(sess) {
    const ms = (sess.cookie && sess.cookie.originalMaxAge) || 1000 * 60 * 60 * 24 * 7;
    return Date.now() + ms;
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const out = {};
    const now = Date.now();
    for (const [sid, rec] of this.sessions) {
      if (rec.expiresAt && rec.expiresAt <= now) this.sessions.delete(sid);
      else out[sid] = rec;
    }
    try {
      writeStore(SESSIONS_PATH, out);
    } catch (err) {
      console.error("Falha ao persistir sessões:", err.message);
    }
  }
  get(sid, cb) {
    const rec = this.sessions.get(sid);
    if (!rec) return cb(null, null);
    if (rec.expiresAt && rec.expiresAt <= Date.now()) {
      this.sessions.delete(sid);
      this.dirty = true;
      return cb(null, null);
    }
    return cb(null, JSON.parse(JSON.stringify(rec.data)));
  }
  set(sid, sess, cb) {
    this.sessions.set(sid, { data: sess, expiresAt: this.expiryOf(sess) });
    this.dirty = true;
    if (cb) cb(null);
  }
  destroy(sid, cb) {
    this.sessions.delete(sid);
    this.dirty = true;
    if (cb) cb(null);
  }
  touch(sid, sess, cb) {
    const rec = this.sessions.get(sid);
    if (rec) {
      rec.expiresAt = this.expiryOf(sess);
      this.dirty = true;
    }
    if (cb) cb(null);
  }
  length(cb) {
    cb(null, this.sessions.size);
  }
}
const sessionStore = new VolumeSessionStore();
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    sessionStore.flush();
    process.exit(0);
  });
}

const app = express();
// Atrás do proxy do Railway: sem isso req.ip é o IP do proxy e o rate limit
// do cadastro valeria para todo mundo junto.
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json());
// Headers de segurança básicos. Sem CSP com nonce (o front tem script inline
// em toda página), mas o resto é barato e fecha classes inteiras de ataque.
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  });
  next();
});
// Secret fixo via env em produção: sem ele, cada deploy/restart invalida a
// sessão de todo mundo no meio da viagem. O fallback aleatório fica só pra dev.
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // "auto" liga o secure quando a conexão é HTTPS (via trust proxy, é o
      // caso no Railway) e mantém o cookie funcionando no http de dev. Melhor
      // que depender de NODE_ENV, que não está setado em produção.
      secure: "auto",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

const loginAttempts = new Map();
function isLockedOut(key) {
  const rec = loginAttempts.get(key);
  return rec && rec.lockUntil && rec.lockUntil > Date.now();
}
function registerFailure(key, limit) {
  const rec = loginAttempts.get(key) || { count: 0, lockUntil: 0 };
  rec.count += 1;
  if (rec.count >= (limit || 5)) {
    rec.lockUntil = Date.now() + 30_000;
    rec.count = 0;
  }
  rec.seenAt = Date.now();
  loginAttempts.set(key, rec);
}
function clearFailures(key) {
  loginAttempts.delete(key);
}

// Os mapas de rate limit vivem em memória e cresceriam para sempre com IPs de
// passagem. Uma poda por hora basta: janelas curtas, entradas descartáveis.
const RATE_LIMIT_TTL = 60 * 60 * 1000;
function pruneRateLimits() {
  const cutoff = Date.now() - RATE_LIMIT_TTL;
  for (const [key, rec] of loginAttempts) {
    if ((rec.seenAt || 0) < cutoff && !isLockedOut(key)) loginAttempts.delete(key);
  }
  for (const map of [registerAttempts, presenceAttempts, lessonSignupAttempts]) {
    for (const [key, rec] of map) {
      if (rec.resetAt < Date.now()) map.delete(key);
    }
  }
}
setInterval(pruneRateLimits, RATE_LIMIT_TTL).unref();

function requireAuthPage(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/login.html");
}
// Papel é dado do cadastro, não da sessão: quem foi desativado ou perdeu a
// diretoria não fica com o privilégio na mão até o cookie expirar (a sessão
// dura 7 dias e uma aba aberta pode nunca passar por /api/me de novo).
function liveRole(req) {
  if (!req.session.user) return null;
  const member = findMember(req.session.user.order);
  if (!member) return null;
  return sessionUser(member, findCredential(member.order));
}
// Sessão válida, sem exigir senha própria: é o que /api/me e /api/set-password
// precisam para o primeiro acesso funcionar.
function requireSessionApi(req, res, next) {
  const role = liveRole(req);
  if (!role) return res.status(401).json({ error: "not_authenticated" });
  req.session.user = role;
  return next();
}
function requireAuthApi(req, res, next) {
  const role = liveRole(req);
  if (!role) return res.status(401).json({ error: "not_authenticated" });
  // Quem entrou com código inicial só usa /api/me, /api/logout e set-password
  // (liberados antes deste gate) — o resto da API espera a senha própria.
  if (role.mustChangePassword) {
    return res.status(403).json({ error: "must_change_password", message: "Defina sua senha antes de usar o app." });
  }
  req.session.user = role;
  return next();
}
function requireAdminApi(req, res, next) {
  const role = liveRole(req);
  if (!role) return res.status(401).json({ error: "not_authenticated" });
  if (!role.admin) return res.status(403).json({ error: "not_admin" });
  req.session.user = role;
  return next();
}
// Só o super admin (hoje o Marcell) aprova quem entra na liga — admins
// futuros de diretoria não herdam esse poder automaticamente.
function requireSuperAdminApi(req, res, next) {
  const role = liveRole(req);
  if (!role) return res.status(401).json({ error: "not_authenticated" });
  if (!role.superadmin) return res.status(403).json({ error: "not_superadmin" });
  req.session.user = role;
  return next();
}
// Diretores: gestão do dia a dia da liga — materiais e presença em reuniões.
// O super admin também é diretor; o inverso não vale.
function requireDirectorApi(req, res, next) {
  const role = liveRole(req);
  if (!role) return res.status(401).json({ error: "not_authenticated" });
  if (!role.director && !role.superadmin) return res.status(403).json({ error: "not_director" });
  req.session.user = role;
  return next();
}
// O acervo da imersão é só de quem esteve lá. Checa direto no seed (e não na
// flag de sessão) para valer também para sessões abertas antes do deploy.
function requireImmersionApi(req, res, next) {
  const role = liveRole(req);
  if (!role) return res.status(401).json({ error: "not_authenticated" });
  if (role.mustChangePassword) {
    return res.status(403).json({ error: "must_change_password", message: "Defina sua senha antes de usar o app." });
  }
  if (!seedMembers.some((s) => s.order === role.order)) {
    return res.status(403).json({ error: "not_immersion_member" });
  }
  req.session.user = role;
  return next();
}

app.get("/", (req, res) => {
  if (req.session.user) return res.sendFile(path.join(PUBLIC_DIR, "app.html"));
  return res.sendFile(path.join(PUBLIC_DIR, "home.html"));
});
app.get("/app.html", requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.html"));
});

// Guia do membro (PDF) — material da imersão, só para quem esteve lá.
app.get("/guia.pdf", requireAuthPage, (req, res, next) => {
  if (!seedMembers.some((s) => s.order === req.session.user.order)) return res.redirect("/");
  next();
}, (req, res) => {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent("Guia da Imersão — Missão SP") + ".pdf",
    "Cache-Control": "private, max-age=3600",
  });
  res.sendFile(path.join(__dirname, "docs", "Guia-Imersao-SP.pdf"));
});

app.get("/api/members-public", (req, res) => {
  res.json(
    activeMembers().map((m) => ({
      order: m.order,
      name: m.name,
      photo: memberPhoto(m),
      course: m.course || "",
      year: m.year || "",
      cargo: m.cargo || "",
      turma: m.turma || "",
      interests: m.interests || [],
    }))
  );
});

// Avatares enviados pelos membros. Público como as fotos do repo em
// /members/ — o seletor de login precisa deles antes da autenticação.
app.get("/avatars/:order", (req, res) => {
  const f = avatarFile(parseInt(req.params.order, 10));
  if (!f) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=86400");
  res.sendFile(f);
});

// Cada membro só mexe na própria foto; corpo cru como no upload de PDF.
app.post(
  "/api/me/photo",
  requireAuthApi,
  express.raw({ type: ["image/*", "application/octet-stream"], limit: "6mb" }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: "empty_file" });
    }
    const ext = sniffImage(req.body);
    if (!ext) {
      return res.status(400).json({ error: "invalid_image", message: "Envie uma imagem JPG, PNG ou WebP." });
    }
    const order = req.session.user.order;
    // Grava a nova primeiro e só então limpa as outras extensões: se a escrita
    // falhar, o membro continua com a foto antiga em vez de ficar sem nenhuma.
    fs.writeFileSync(path.join(AVATARS_DIR, order + "." + ext), req.body);
    for (const e of AVATAR_EXTS) {
      if (e !== ext) fs.rmSync(path.join(AVATARS_DIR, order + "." + e), { force: true });
    }
    res.json({ ok: true, photo: memberPhoto(findMember(order)) });
  }
);

app.post("/api/login", (req, res) => {
  const order = parseInt(req.body.order, 10);
  const password = String(req.body.password || "");
  const key = String(order);

  // Dois limites: por conta (protege a senha de uma pessoa) e por IP (senão
  // um atacante varre a lista pública de membros trocando de order a cada
  // tentativa e nunca esbarra no lockout).
  if (isLockedOut(key) || isLockedOut("ip:" + req.ip)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Muitas tentativas. Aguarde 30s e tente de novo." });
  }

  const member = findMember(order);
  const cred = findCredential(order);
  if (!member || !cred || !bcrypt.compareSync(password, cred.passwordHash)) {
    registerFailure(key);
    registerFailure("ip:" + req.ip, 15);
    return res.status(401).json({ error: "invalid_credentials", message: "Membro ou senha incorretos." });
  }

  clearFailures(key);
  clearFailures("ip:" + req.ip);
  // Sessão nova a cada login: um id de sessão vazado antes da autenticação
  // (link com querystring, dispositivo compartilhado) não vira sessão logada.
  return req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "session_failed" });
    req.session.user = sessionUser(member, cred);
    res.json({ ok: true, ...req.session.user });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireSessionApi, (req, res) => {
  // Recarrega flags do cadastro: quem virou diretor ganha o painel sem
  // relogar, e quem foi desativado (ex.: Carol/Ana) perde a sessão.
  const member = findMember(req.session.user.order);
  if (!member) {
    return req.session.destroy(() => res.status(401).json({ error: "not_authenticated" }));
  }
  req.session.user = sessionUser(member, findCredential(member.order));
  res.json({ authenticated: true, ...req.session.user });
});

// Troca de senha do próprio usuário. Membros importados entram com um código
// pré-setado (mustChangePassword) e são obrigados a passar por aqui antes de
// usar o app; qualquer membro pode usar para trocar a senha depois.
app.post("/api/set-password", requireSessionApi, (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 4 || password.length > 72) {
    return res.status(400).json({ error: "invalid_password", message: "A senha precisa ter pelo menos 4 caracteres." });
  }
  const order = req.session.user.order;
  // Troca voluntária exige a senha atual — uma sessão esquecida aberta não
  // pode virar dono da conta. No 1º acesso (mustChangePassword) o código
  // inicial acabou de ser digitado no login, então não pede de novo.
  const current = findCredential(order);
  if (!(current && current.mustChangePassword === true)) {
    const currentPassword = String(req.body.currentPassword || "");
    if (!current || !bcrypt.compareSync(currentPassword, current.passwordHash)) {
      return res.status(403).json({ error: "wrong_current_password", message: "Senha atual incorreta." });
    }
  }
  const signups = readSignups();
  const hash = bcrypt.hashSync(password, 10);
  const cred = signups.credentials.find((c) => c.order === order);
  if (cred) {
    cred.passwordHash = hash;
    delete cred.mustChangePassword;
  } else {
    signups.credentials.push({ order, passwordHash: hash });
  }
  // Primeiro acesso também coleta o WhatsApp (a planilha da liga não tem os
  // números) — só funciona para membros do volume; fundador é dado do repo.
  const phone = String(req.body.phone || "").trim().slice(0, 30);
  if (phone) {
    const member = signups.members.find((m) => m.order === order);
    if (member) member.phone = phone;
  }
  writeSignups(signups);
  req.session.user.mustChangePassword = false;
  res.json({ ok: true });
});

// Reset de senha pelo super admin: gera um código novo (devolvido em claro UMA
// vez, para entregar à pessoa) e marca troca obrigatória no 1º login. É o
// caminho para aposentar as senhas iniciais dos fundadores — que eram o próprio
// número de inscrição, um dado público via /api/members-public — e para
// socorrer quem esqueceu a senha, já que não há e-mail de recuperação.
app.post("/api/admin/reset-password", requireSuperAdminApi, (req, res) => {
  const order = parseInt(req.body.order, 10);
  const member = findMemberAny(order);
  if (!member) return res.status(400).json({ error: "invalid_member" });
  const code = generateCode(8);
  const signups = readSignups();
  const cred = signups.credentials.find((c) => c.order === order);
  const passwordHash = bcrypt.hashSync(code, 10);
  if (cred) {
    cred.passwordHash = passwordHash;
    cred.mustChangePassword = true;
  } else {
    signups.credentials.push({ order, passwordHash, mustChangePassword: true });
  }
  writeSignups(signups);
  res.json({ ok: true, order, name: member.name, code });
});

// Import em lote (super admin): a planilha de membros vira rows aqui. Cada um
// entra com um código inicial (devolvido em claro UMA vez, para distribuir) e
// é obrigado a trocar a senha no primeiro login. Idempotente por nome.
app.post("/api/admin/import-members", requireSuperAdminApi, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "empty_rows" });
  const signups = readSignups();
  const knownNames = new Set(
    allMembers().map((m) => m.name.trim().toLowerCase())
  );
  const created = [], skipped = [];
  for (const raw of rows) {
    const name = String(raw.name || "").trim().replace(/\s+/g, " ");
    if (name.length < 3 || name.length > 80) {
      skipped.push({ name, reason: "invalid_name" });
      continue;
    }
    if (knownNames.has(name.toLowerCase())) {
      skipped.push({ name, reason: "already_member" });
      continue;
    }
    knownNames.add(name.toLowerCase());
    const code = String(raw.code || "").trim() || generateCode();
    const order = signups.nextOrder;
    signups.nextOrder += 1;
    const cargo = String(raw.cargo || "").trim().slice(0, 60);
    signups.members.push({
      order,
      name,
      photo: null,
      course: String(raw.course || "").trim().slice(0, 80),
      year: String(raw.year || "").trim().slice(0, 40),
      cargo,
      turma: String(raw.turma || "").trim().slice(0, 20),
      status: String(raw.status || "").trim().toLowerCase().slice(0, 20),
      phone: String(raw.phone || "").trim().slice(0, 30),
      interests: Array.isArray(raw.interests)
        ? raw.interests.map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 8)
        : [],
      // Qualquer cargo de diretoria (Presidente, Tesoureiro...) vira diretor.
      director: raw.director === true || (cargo !== "" && cargo.toLowerCase() !== "membro"),
      joinedAt: new Date().toISOString(),
      importedBy: req.session.user.order,
    });
    signups.credentials.push({
      order,
      passwordHash: bcrypt.hashSync(code, 10),
      mustChangePassword: true,
    });
    created.push({ order, name, code });
  }
  writeSignups(signups);
  res.json({ created, skipped });
});

// ---- Cadastro de novos membros (com aprovação do super admin) ----

// O pedido nasce pendente e invisível: só vira membro (e só aparece no
// roster/login) depois que o super admin aprovar. A senha já entra hasheada —
// nunca guardamos senha em claro, nem na fila.
const REGISTER_MAX_PENDING = 50;
const registerAttempts = new Map();
function registerRateLimited(ip) {
  const now = Date.now();
  const rec = registerAttempts.get(ip);
  if (!rec || rec.resetAt < now) {
    registerAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 5;
}

function stripHash(p) {
  const { passwordHash, ...rest } = p;
  return rest;
}

app.post("/api/register", (req, res) => {
  if (registerRateLimited(req.ip)) {
    return res.status(429).json({ error: "too_many_requests", message: "Muitos pedidos deste dispositivo. Tente de novo em uma hora." });
  }
  const name = String(req.body.name || "").trim().replace(/\s+/g, " ");
  const password = String(req.body.password || "");
  const course = String(req.body.course || "").trim().slice(0, 80);
  const year = String(req.body.year || "").trim().slice(0, 40);
  const phone = String(req.body.phone || "").trim().slice(0, 30);
  const interests = Array.isArray(req.body.interests)
    ? req.body.interests.map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 8)
    : [];

  if (name.length < 3 || name.length > 80 || !name.includes(" ")) {
    return res.status(400).json({ error: "invalid_name", message: "Informe nome e sobrenome." });
  }
  if (phone.replace(/\D/g, "").length < 10) {
    return res.status(400).json({ error: "invalid_phone", message: "Informe um WhatsApp com DDD." });
  }
  if (password.length < 4 || password.length > 72) {
    return res.status(400).json({ error: "invalid_password", message: "A senha precisa ter pelo menos 4 caracteres." });
  }

  const signups = readSignups();
  if (signups.pending.length >= REGISTER_MAX_PENDING) {
    return res.status(429).json({ error: "queue_full", message: "A fila de aprovação está cheia. Fale com o admin da liga." });
  }
  const sameName = (n) => n.trim().toLowerCase() === name.toLowerCase();
  if (allMembers().some((m) => sameName(m.name))) {
    return res.status(409).json({ error: "name_taken", message: "Já existe um membro com esse nome. Se é você, fale com o admin." });
  }
  if (signups.pending.some((p) => sameName(p.name))) {
    return res.status(409).json({ error: "already_pending", message: "Já existe um pedido com esse nome aguardando aprovação." });
  }

  signups.pending.push({
    id: "s" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    name,
    course,
    year,
    phone,
    interests,
    passwordHash: bcrypt.hashSync(password, 10),
    requestedAt: new Date().toISOString(),
  });
  writeSignups(signups);
  res.json({ ok: true, message: "Pedido enviado! Seu acesso será liberado quando o admin aprovar." });
});

app.get("/api/signups", requireSuperAdminApi, (req, res) => {
  res.json({ pending: readSignups().pending.map(stripHash) });
});

app.post("/api/signups/:id/approve", requireSuperAdminApi, (req, res) => {
  const signups = readSignups();
  const idx = signups.pending.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  const p = signups.pending.splice(idx, 1)[0];
  const order = signups.nextOrder;
  signups.nextOrder += 1;
  signups.members.push({
    order,
    name: p.name,
    photo: null,
    course: p.course,
    year: p.year,
    phone: p.phone || "",
    interests: p.interests,
    joinedAt: new Date().toISOString(),
    approvedBy: req.session.user.order,
  });
  signups.credentials.push({ order, passwordHash: p.passwordHash });
  writeSignups(signups);
  res.json({ ok: true, member: { order, name: p.name }, pending: signups.pending.map(stripHash) });
});

app.post("/api/signups/:id/reject", requireSuperAdminApi, (req, res) => {
  const signups = readSignups();
  const before = signups.pending.length;
  signups.pending = signups.pending.filter((p) => p.id !== req.params.id);
  if (signups.pending.length === before) return res.status(404).json({ error: "not_found" });
  writeSignups(signups);
  res.json({ ok: true, pending: signups.pending.map(stripHash) });
});

// Roster para membros logados. Campos escolhidos um a um: espalhar o membro
// inteiro vazava o WhatsApp de todos e as flags de admin/diretoria para
// qualquer um que abrisse o DevTools.
function memberCardView(m) {
  return {
    order: m.order,
    name: m.name,
    photo: memberPhoto(m),
    course: m.course || "",
    year: m.year || "",
    cargo: m.cargo || "",
    turma: m.turma || "",
    interests: m.interests || [],
    director: m.director === true || m.superadmin === true,
  };
}

app.get("/api/members", requireAuthApi, (req, res) => {
  res.json(activeMembers().map(memberCardView));
});

// Contatos completos (WhatsApp) — gestão da liga, só para a diretoria.
app.get("/api/members/contacts", requireDirectorApi, (req, res) => {
  res.json(
    activeMembers().map((m) => ({
      order: m.order,
      name: m.name,
      phone: m.phone || "",
      cargo: m.cargo || "",
      turma: m.turma || "",
    }))
  );
});

app.get("/api/mission", requireImmersionApi, (req, res) => {
  res.json(readJson("mission.json"));
});

app.get("/api/itinerary", requireImmersionApi, (req, res) => {
  res.json(readJson("itinerary.json"));
});

// Galeria: seleção curada das fotos/vídeos da viagem. Só os IDs — as mídias
// ficam no Drive da liga e são servidas pelas miniaturas do Google (o endpoint
// transcodifica HEIC e gera pôster de vídeo). As capas moram em /gallery.
app.get("/api/gallery", requireImmersionApi, (req, res) => {
  res.json(readJson("gallery.json"));
});

app.get("/api/companies", requireImmersionApi, (req, res) => {
  res.json(readJson("companies.json"));
});

app.get("/api/checklist", requireImmersionApi, (req, res) => {
  res.json(readChecklist());
});

app.post("/api/checklist", requireImmersionApi, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty_text" });
  const items = readChecklist();
  const nextId = items.reduce((max, i) => Math.max(max, i.id), 0) + 1;
  items.push({ id: nextId, text, done: false, addedBy: req.session.user.name });
  writeChecklist(items);
  res.json(items);
});

app.patch("/api/checklist/:id", requireImmersionApi, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const items = readChecklist();
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: "not_found" });
  item.done = Boolean(req.body.done);
  writeChecklist(items);
  res.json(items);
});

app.delete("/api/checklist/:id", requireImmersionApi, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const items = readChecklist().filter((i) => i.id !== id);
  writeChecklist(items);
  res.json(items);
});

// ---- Materiais de preparação por empresa ----

function findMaterial(id) {
  const materials = readMaterials();
  for (const [companyKey, list] of Object.entries(materials)) {
    const item = list.find((m) => m.id === id);
    if (item) return { companyKey, item };
  }
  return null;
}

app.get("/api/materials", requireImmersionApi, (req, res) => {
  res.json(readMaterials());
});

// Visualizar (inline, viewer nativo do celular) ou baixar (?dl=1).
app.get("/api/materials/:id/file", requireImmersionApi, (req, res) => {
  const found = findMaterial(req.params.id);
  if (!found || found.item.type !== "pdf") return res.status(404).json({ error: "not_found" });
  const disposition = req.query.dl === "1" ? "attachment" : "inline";
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": disposition + "; filename*=UTF-8''" + encodeURIComponent(found.item.title) + ".pdf",
    "Cache-Control": "private, max-age=3600",
  });
  res.sendFile(path.join(MATERIALS_DIR, found.item.file));
});

// Upload de PDF (diretores): corpo cru da requisição, sem multipart/multer.
app.post(
  "/api/materials/upload",
  requireDirectorApi,
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "25mb" }),
  (req, res) => {
    const companyKey = String(req.query.companyKey || "");
    const title = String(req.query.title || "").trim();
    if (!title) return res.status(400).json({ error: "empty_title" });
    if (!readJson("companies.json").some((c) => c.key === companyKey)) {
      return res.status(400).json({ error: "invalid_company" });
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: "empty_file" });
    }
    if (req.body.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return res.status(400).json({ error: "not_a_pdf" });
    }
    const id = "m" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const file = companyKey + "-" + id + ".pdf";
    fs.writeFileSync(path.join(MATERIALS_DIR, file), req.body);
    const materials = readMaterials();
    if (!(companyKey in materials)) materials[companyKey] = [];
    materials[companyKey].push({
      id,
      type: "pdf",
      title,
      file,
      size: req.body.length,
      addedAt: new Date().toISOString(),
    });
    writeMaterials(materials);
    res.json(materials);
  }
);

// Material do tipo link (vídeo, página externa) — só a URL.
app.post("/api/materials/link", requireDirectorApi, (req, res) => {
  const companyKey = String(req.body.companyKey || "");
  const title = String(req.body.title || "").trim();
  const url = String(req.body.url || "").trim();
  if (!title) return res.status(400).json({ error: "empty_title" });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "invalid_url" });
  if (!readJson("companies.json").some((c) => c.key === companyKey)) {
    return res.status(400).json({ error: "invalid_company" });
  }
  const materials = readMaterials();
  if (!(companyKey in materials)) materials[companyKey] = [];
  const id = "m" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  materials[companyKey].push({ id, type: "link", title, url, addedAt: new Date().toISOString() });
  writeMaterials(materials);
  res.json(materials);
});

app.delete("/api/materials/:id", requireDirectorApi, (req, res) => {
  const found = findMaterial(req.params.id);
  if (!found) return res.status(404).json({ error: "not_found" });
  const materials = readMaterials();
  materials[found.companyKey] = materials[found.companyKey].filter((m) => m.id !== req.params.id);
  writeMaterials(materials);
  if (found.item.file) {
    fs.unlink(path.join(MATERIALS_DIR, found.item.file), () => {});
  }
  res.json(materials);
});

// ---- Enquete do bóton limitado ----

app.get("/api/pin-poll", requireImmersionApi, (req, res) => {
  const entry = readPinPoll()[String(req.session.user.order)];
  res.json({ answered: entry !== undefined, want: entry ? entry.want : null });
});

// A enquete continua registrando quem quer o bóton; o pagamento dos R$ 11 é
// combinado direto com o Marcell (a divisão de contas da viagem foi encerrada).
app.post("/api/pin-poll", requireImmersionApi, (req, res) => {
  const order = req.session.user.order;
  const poll = readPinPoll();
  poll[String(order)] = { want: Boolean(req.body.want), name: req.session.user.name };
  writePinPoll(poll);
  res.json({ ok: true });
});

app.get("/api/pin-poll/all", requireAdminApi, (req, res) => {
  res.json(readPinPoll());
});

// ---- Perguntas do grupo (Q&A colaborativo por empresa) ----

app.get("/api/questions", requireImmersionApi, (req, res) => {
  res.json(readQuestions());
});

app.post("/api/questions", requireImmersionApi, (req, res) => {
  const companyKey = String(req.body.companyKey || "");
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty_text" });
  if (!readJson("companies.json").some((c) => c.key === companyKey)) {
    return res.status(400).json({ error: "invalid_company" });
  }
  const questions = readQuestions();
  if (!(companyKey in questions)) questions[companyKey] = [];
  const nextId = Object.values(questions).flat().reduce((max, q) => Math.max(max, q.id), 0) + 1;
  questions[companyKey].push({ id: nextId, text, addedBy: req.session.user.name, order: req.session.user.order });
  writeQuestions(questions);
  res.json(questions);
});

app.delete("/api/questions/:companyKey/:id", requireImmersionApi, (req, res) => {
  const companyKey = String(req.params.companyKey);
  const id = parseInt(req.params.id, 10);
  const questions = readQuestions();
  const list = questions[companyKey] || [];
  const q = list.find((x) => x.id === id);
  if (!q) return res.status(404).json({ error: "not_found" });
  // Cada um apaga só a própria pergunta; o admin pode moderar qualquer uma.
  if (q.order !== req.session.user.order && !req.session.user.admin) {
    return res.status(403).json({ error: "not_owner" });
  }
  questions[companyKey] = list.filter((x) => x.id !== id);
  writeQuestions(questions);
  res.json(questions);
});

// ---- Aprendizados (o acervo da imersão: memória coletiva por empresa) ----

const LEARNING_MAX = 600; // um "ponto" é um parágrafo, não um ensaio

app.get("/api/learnings", requireImmersionApi, (req, res) => {
  res.json(readLearnings());
});

app.post("/api/learnings", requireImmersionApi, (req, res) => {
  const companyKey = String(req.body.companyKey || "");
  const text = String(req.body.text || "").trim().slice(0, LEARNING_MAX);
  if (!text) return res.status(400).json({ error: "empty_text" });
  if (!readJson("companies.json").some((c) => c.key === companyKey)) {
    return res.status(400).json({ error: "invalid_company" });
  }
  // A imersão acabou: o acervo é aberto a todos os membros. O selo continua
  // sendo o registro de quem esteve lá, mas não é mais portão de contribuição —
  // quem não foi também aprendeu com o relato dos outros.
  const learnings = readLearnings();
  if (!(companyKey in learnings)) learnings[companyKey] = [];
  const nextId = Object.values(learnings).flat().reduce((max, l) => Math.max(max, l.id), 0) + 1;
  learnings[companyKey].push({
    id: nextId,
    text,
    addedBy: req.session.user.name,
    order: req.session.user.order,
    createdAt: new Date().toISOString(),
  });
  writeLearnings(learnings);
  res.json(learnings);
});

// Editar o próprio ponto — acervo é texto que amadurece; ninguém precisa
// apagar e reescrever pra corrigir uma frase.
app.put("/api/learnings/:companyKey/:id", requireImmersionApi, (req, res) => {
  const companyKey = String(req.params.companyKey);
  const id = parseInt(req.params.id, 10);
  const text = String(req.body.text || "").trim().slice(0, LEARNING_MAX);
  if (!text) return res.status(400).json({ error: "empty_text" });
  const learnings = readLearnings();
  const item = (learnings[companyKey] || []).find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "not_found" });
  if (item.order !== req.session.user.order && !req.session.user.admin) {
    return res.status(403).json({ error: "not_owner" });
  }
  item.text = text;
  item.editedAt = new Date().toISOString();
  writeLearnings(learnings);
  res.json(learnings);
});

app.delete("/api/learnings/:companyKey/:id", requireImmersionApi, (req, res) => {
  const companyKey = String(req.params.companyKey);
  const id = parseInt(req.params.id, 10);
  const learnings = readLearnings();
  const list = learnings[companyKey] || [];
  const item = list.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "not_found" });
  if (item.order !== req.session.user.order && !req.session.user.admin) {
    return res.status(403).json({ error: "not_owner" });
  }
  learnings[companyKey] = list.filter((x) => x.id !== id);
  writeLearnings(learnings);
  res.json(learnings);
});

// ---- Acervo da imersão (visão consolidada do legado) ----

// Um único payload com tudo que a aba Legado precisa: empresas com contagem de
// aprendizados e de selos, números do grupo e ranking de quem mais registrou.
// Contagem de presença é agregada (quantos), nunca nominal — quem esteve em
// cada visita continua sendo coisa do painel de presença do admin.
app.get("/api/legacy", requireImmersionApi, (req, res) => {
  const companies = readJson("companies.json");
  const itinerary = readJson("itinerary.json");
  const attendance = readAttendance();
  const learnings = readLearnings();
  const all = Object.values(learnings).flat();

  const byOrder = new Map();
  all.forEach((l) => {
    const cur = byOrder.get(l.order) || { order: l.order, name: l.addedBy, count: 0 };
    cur.count += 1;
    byOrder.set(l.order, cur);
  });

  const days = itinerary.days || [];
  res.json({
    edition: {
      title: "1ª Imersão LEPV",
      city: "São Paulo",
      start: days.length ? days[0].date : null,
      end: days.length ? days[days.length - 1].date : null,
      year: 2026,
    },
    companies: companies.map((c) => ({
      key: c.key,
      name: c.name,
      color: c.color,
      logo: c.logo,
      logoBg: c.logoBg,
      blurb: c.blurb,
      learnings: (learnings[c.key] || []).length,
      attendees: (attendance[c.key] || []).length,
      // O usuário logado esteve nessa visita? (o selo dele, não o dos outros)
      mine: (attendance[c.key] || []).includes(req.session.user.order),
    })),
    totals: {
      companies: companies.length,
      // Estatística da edição: quem viajou (fundadores), não a liga inteira.
      members: seedMembers.length,
      learnings: all.length,
      contributors: byOrder.size,
    },
    contributors: Array.from(byOrder.values()).sort((a, b) => b.count - a.count),
  });
});

// ---- Eventos da liga: aviso → inscrição → presença ----
//
// Um evento é o objeto único da vida da liga: reunião, aula, visita ou social.
// Ele nasce como aviso no mural, pode abrir formulário de inscrição (com vagas
// e fila de espera) e tem presença própria — o código e o QR só valem NO DIA do
// evento, sem ninguém precisar lembrar de abrir nada. Antes de 01/08/2026 isso
// eram três coisas separadas (meetings.json, lessons.json e o mural); a
// migração abaixo junta tudo preservando presença, visitantes e materiais.

const EVENT_TYPES = ["reuniao", "aula", "visita", "social"];
const EVENT_TEXT_MAX = 600;
const EVENT_PHOTOS_MAX = 6;
// Com 2+ presenças o visitante deve ser convidado a virar membro.
const VISITOR_INVITE_THRESHOLD = 2;

// A data do evento é a data no Brasil, não em UTC: o servidor roda em UTC e um
// evento das 19h às 22h viraria "amanhã" às 21h, fechando o QR no meio.
function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Presença aberta = é o dia do evento. `attendanceOpen` só existe para o
// override manual da diretoria (encerrar antes ou reabrir depois).
function attendanceIsOpen(ev) {
  if (ev.attendanceOpen === true || ev.attendanceOpen === false) return ev.attendanceOpen;
  return ev.date === todayBR();
}
function attendanceState(ev) {
  if (ev.attendanceOpen === true) return "aberta";
  if (ev.attendanceOpen === false) return "encerrada";
  if (ev.date === todayBR()) return "aberta";
  return ev.date > todayBR() ? "agendada" : "encerrada";
}

function normalizeEvent(ev) {
  if (!Array.isArray(ev.photos)) ev.photos = [];
  if (!Array.isArray(ev.materials)) ev.materials = [];
  if (!Array.isArray(ev.codes)) ev.codes = [];
  if (!Array.isArray(ev.memberAttendance)) ev.memberAttendance = [];
  if (!Array.isArray(ev.visitorAttendance)) ev.visitorAttendance = [];
  if (!ev.signups || typeof ev.signups !== "object") ev.signups = {};
  if (!Array.isArray(ev.signups.list)) ev.signups.list = [];
  // Inscrição precisa de identidade própria para a diretoria remover uma linha
  // específica; as que vieram da migração não tinham.
  ev.signups.list.forEach((s) => {
    if (!s.id) s.id = "s" + crypto.randomBytes(5).toString("hex");
  });
  if (typeof ev.signups.open !== "boolean") ev.signups.open = false;
  if (!("capacity" in ev.signups)) ev.signups.capacity = null;
  if (!ev.qrToken) ev.qrToken = crypto.randomBytes(8).toString("hex");
  if (EVENT_TYPES.indexOf(ev.type) === -1) ev.type = "reuniao";
  return ev;
}

function readEventsStore() {
  const data = readEvents();
  if (!Array.isArray(data.events)) data.events = [];
  if (!Array.isArray(data.visitors)) data.visitors = [];
  data.events.forEach(normalizeEvent);
  return data;
}

function findEvent(data, id) {
  return data.events.find((e) => e.id === id);
}

function visitorVisits(data, visitorId) {
  return data.events.filter((e) => (e.visitorAttendance || []).includes(visitorId)).length;
}

// ---- Migração dos três formatos antigos ----
//
// Roda uma vez: converte meetings.json (reuniões, presença e visitantes) e
// lessons.json (aulas, materiais e inscrições) em eventos. Os arquivos de
// origem são renomeados para .migrated — ficam no volume como cópia de
// segurança e não entram de novo na próxima subida.
function migrateLegacyStores() {
  const data = readEventsStore();
  let changed = false;

  if (fs.existsSync(MEETINGS_PATH)) {
    try {
      const old = readStore(MEETINGS_PATH);
      for (const m of old.meetings || []) {
        if (findEvent(data, m.id)) continue;
        data.events.push(
          normalizeEvent({
            id: m.id,
            type: "reuniao",
            title: m.title,
            text: "",
            date: m.date,
            photos: [],
            materials: [],
            signups: { open: false, capacity: null, list: [] },
            codes: m.codes || [],
            qrToken: m.qrToken,
            memberAttendance: m.memberAttendance || [],
            visitorAttendance: m.visitorAttendance || [],
            // Reunião encerrada à mão continua encerrada; o resto passa a
            // seguir a data automaticamente.
            attendanceOpen: m.open === false ? false : undefined,
            createdBy: m.createdBy,
            createdByName: m.createdByName || "",
            createdAt: m.createdAt,
          })
        );
        changed = true;
      }
      for (const v of old.visitors || []) {
        if (!data.visitors.some((x) => x.id === v.id)) {
          data.visitors.push(v);
          changed = true;
        }
      }
      fs.renameSync(MEETINGS_PATH, MEETINGS_PATH + ".migrated");
      console.log("Migração: " + (old.meetings || []).length + " reuniões viraram eventos.");
    } catch (err) {
      console.error("Migração de meetings.json falhou:", err.message);
    }
  }

  if (fs.existsSync(LESSONS_PATH)) {
    try {
      const old = readStore(LESSONS_PATH);
      for (const l of old.lessons || []) {
        if (findEvent(data, l.id)) continue;
        data.events.push(
          normalizeEvent({
            id: l.id,
            type: "aula",
            title: l.title,
            text: l.description || "",
            date: l.date,
            photos: [],
            materials: l.materials || [],
            signups: {
              open: l.signupsOpen === true,
              token: l.signupToken,
              capacity: null,
              list: (l.signups || []).map((s) => ({ ...s, status: "confirmed" })),
            },
            codes: [],
            memberAttendance: [],
            visitorAttendance: [],
            createdBy: l.createdBy,
            createdByName: l.createdByName || "",
            createdAt: l.createdAt,
          })
        );
        changed = true;
      }
      fs.renameSync(LESSONS_PATH, LESSONS_PATH + ".migrated");
      console.log("Migração: " + (old.lessons || []).length + " aulas viraram eventos.");
    } catch (err) {
      console.error("Migração de lessons.json falhou:", err.message);
    }
  }

  if (changed) writeEvents(data);
}
migrateLegacyStores();

// ---- Views ----

// O que todo membro vê. A lista nominal de inscritos, os códigos de presença e
// os contatos dos visitantes são da diretoria — ver directorView.
function eventView(ev, user) {
  const confirmed = ev.signups.list.filter((s) => s.status !== "waitlist");
  const waitlist = ev.signups.list.filter((s) => s.status === "waitlist");
  const mine = ev.signups.list.find((s) => s.type === "member" && s.order === user.order);
  return {
    id: ev.id,
    type: ev.type,
    title: ev.title,
    text: ev.text || "",
    date: ev.date,
    photos: ev.photos.map((p) => ({ id: p.id, url: "/api/events/" + ev.id + "/photos/" + p.id })),
    materials: ev.materials.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      url: m.type === "link" ? m.url : "/api/events/materials/" + m.id + "/file",
      size: m.size || 0,
      addedBy: m.addedBy || "",
    })),
    signupsOpen: ev.signups.open,
    capacity: ev.signups.capacity,
    signupCount: confirmed.length,
    waitlistCount: waitlist.length,
    seatsLeft: ev.signups.capacity ? Math.max(0, ev.signups.capacity - confirmed.length) : null,
    myStatus: mine ? mine.status : null,
    attendanceState: attendanceState(ev),
    present: ev.memberAttendance.includes(user.order),
    membersPresent: ev.memberAttendance.length,
    visitorsPresent: ev.visitorAttendance.length,
    createdByName: ev.createdByName || "",
  };
}

function directorView(ev, data) {
  return {
    codes: ev.codes,
    qrToken: ev.qrToken,
    signupToken: ev.signups.token || null,
    signups: ev.signups.list,
    memberAttendance: ev.memberAttendance
      .map((order) => {
        const member = findMemberAny(order);
        return { order, name: member ? member.name : "nº " + order };
      })
      .sort((a, b) => a.order - b.order),
    visitors: ev.visitorAttendance.map((id) => {
      const v = data.visitors.find((x) => x.id === id);
      const visits = visitorVisits(data, id);
      return v
        ? { id, name: v.name, email: v.email || "", phone: v.phone || "", visits, inviteReady: visits >= VISITOR_INVITE_THRESHOLD }
        : { id, name: "?", visits };
    }),
  };
}

// Vaga que abre é vaga que anda: ao sair um confirmado, o primeiro da fila sobe.
function promoteFromWaitlist(ev) {
  if (!ev.signups.capacity) {
    ev.signups.list.forEach((s) => { s.status = "confirmed"; });
    return;
  }
  let confirmed = ev.signups.list.filter((s) => s.status !== "waitlist").length;
  for (const s of ev.signups.list) {
    if (s.status === "waitlist" && confirmed < ev.signups.capacity) {
      s.status = "confirmed";
      s.promotedAt = new Date().toISOString();
      confirmed += 1;
    }
  }
}

function addSignup(ev, entry) {
  const confirmed = ev.signups.list.filter((s) => s.status !== "waitlist").length;
  const lotado = ev.signups.capacity !== null && confirmed >= ev.signups.capacity;
  entry.id = "s" + crypto.randomBytes(5).toString("hex");
  entry.status = lotado ? "waitlist" : "confirmed";
  ev.signups.list.push(entry);
  return entry.status;
}

// ---- Leitura ----

app.get("/api/events", requireAuthApi, (req, res) => {
  const data = readEventsStore();
  const isDirector = req.session.user.director || req.session.user.superadmin;
  const type = String(req.query.type || "");
  const events = data.events
    .filter((e) => !type || e.type === type)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((e) => {
      const view = eventView(e, req.session.user);
      if (isDirector) Object.assign(view, directorView(e, data));
      return view;
    });

  const payload = { events };
  if (isDirector) {
    payload.inviteReady = data.visitors
      .map((v) => ({ id: v.id, name: v.name, email: v.email || "", phone: v.phone || "", visits: visitorVisits(data, v.id) }))
      .filter((v) => v.visits >= VISITOR_INVITE_THRESHOLD);
  }
  res.json(payload);
});

// ---- Criação e edição (diretoria) ----

app.post("/api/events", requireDirectorApi, (req, res) => {
  const title = String(req.body.title || "").trim().slice(0, 100);
  if (!title) return res.status(400).json({ error: "empty_title", message: "Dê um título ao evento." });
  const type = EVENT_TYPES.indexOf(String(req.body.type)) !== -1 ? String(req.body.type) : "reuniao";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date || "")) ? String(req.body.date) : todayBR();
  const data = readEventsStore();
  const ev = normalizeEvent({
    id: "ev" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    type,
    title,
    text: String(req.body.text || "").trim().slice(0, EVENT_TEXT_MAX),
    date,
    codes: [generateCode()],
    createdBy: req.session.user.order,
    createdByName: req.session.user.name,
    createdAt: new Date().toISOString(),
  });
  data.events.push(ev);
  writeEvents(data);
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

app.patch("/api/events/:id", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim().slice(0, 100);
    if (!title) return res.status(400).json({ error: "empty_title" });
    ev.title = title;
  }
  if (req.body.text !== undefined) ev.text = String(req.body.text).trim().slice(0, EVENT_TEXT_MAX);
  if (req.body.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date))) ev.date = String(req.body.date);
  if (req.body.type !== undefined && EVENT_TYPES.indexOf(String(req.body.type)) !== -1) ev.type = String(req.body.type);
  writeEvents(data);
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

app.delete("/api/events/:id", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  for (const p of ev.photos) fs.unlink(path.join(EVENT_PHOTOS_DIR, p.file), () => {});
  for (const m of ev.materials) {
    if (m.file) fs.unlink(path.join(EVENT_FILES_DIR, m.file), () => {});
  }
  data.events = data.events.filter((e) => e.id !== req.params.id);
  writeEvents(data);
  res.json({ ok: true });
});

// ---- Fotos do aviso ----

app.post(
  "/api/events/:id/photos",
  requireDirectorApi,
  express.raw({ type: ["image/*", "application/octet-stream"], limit: "6mb" }),
  (req, res) => {
    const data = readEventsStore();
    const ev = findEvent(data, req.params.id);
    if (!ev) return res.status(404).json({ error: "not_found" });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "empty_file" });
    const ext = sniffImage(req.body);
    if (!ext) return res.status(400).json({ error: "invalid_image", message: "Envie uma imagem JPG, PNG ou WebP." });
    if (ev.photos.length >= EVENT_PHOTOS_MAX) {
      return res.status(400).json({ error: "too_many_photos", message: "Máximo de " + EVENT_PHOTOS_MAX + " fotos por evento." });
    }
    const id = "p" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const file = ev.id + "-" + id + "." + ext;
    fs.writeFileSync(path.join(EVENT_PHOTOS_DIR, file), req.body);
    ev.photos.push({ id, file, addedAt: new Date().toISOString() });
    writeEvents(data);
    res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
  }
);

app.get("/api/events/:id/photos/:photoId", requireAuthApi, (req, res) => {
  const ev = findEvent(readEventsStore(), req.params.id);
  const photo = ev && ev.photos.find((p) => p.id === req.params.photoId);
  if (!photo) return res.status(404).end();
  res.set("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(EVENT_PHOTOS_DIR, photo.file));
});

app.delete("/api/events/:id/photos/:photoId", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const photo = ev.photos.find((p) => p.id === req.params.photoId);
  if (!photo) return res.status(404).json({ error: "not_found" });
  ev.photos = ev.photos.filter((p) => p.id !== req.params.photoId);
  writeEvents(data);
  fs.unlink(path.join(EVENT_PHOTOS_DIR, photo.file), () => {});
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

// ---- Materiais (slides, PDFs, links) ----

app.post(
  "/api/events/:id/materials/upload",
  requireDirectorApi,
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "25mb" }),
  (req, res) => {
    const title = String(req.query.title || "").trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: "empty_title" });
    const data = readEventsStore();
    const ev = findEvent(data, req.params.id);
    if (!ev) return res.status(404).json({ error: "not_found" });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "empty_file" });
    if (req.body.subarray(0, 5).toString("latin1") !== "%PDF-") return res.status(400).json({ error: "not_a_pdf" });
    const id = "m" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const file = ev.id + "-" + id + ".pdf";
    fs.writeFileSync(path.join(EVENT_FILES_DIR, file), req.body);
    ev.materials.push({
      id,
      type: "pdf",
      title,
      file,
      size: req.body.length,
      addedBy: req.session.user.name,
      addedAt: new Date().toISOString(),
    });
    writeEvents(data);
    res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
  }
);

app.post("/api/events/:id/materials/link", requireDirectorApi, (req, res) => {
  const title = String(req.body.title || "").trim().slice(0, 120);
  const url = String(req.body.url || "").trim();
  if (!title) return res.status(400).json({ error: "empty_title" });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "invalid_url" });
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  ev.materials.push({
    id: "m" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    type: "link",
    title,
    url,
    addedBy: req.session.user.name,
    addedAt: new Date().toISOString(),
  });
  writeEvents(data);
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

app.get("/api/events/materials/:id/file", requireAuthApi, (req, res) => {
  const data = readEventsStore();
  let found = null;
  for (const ev of data.events) {
    const item = ev.materials.find((m) => m.id === req.params.id);
    if (item) { found = item; break; }
  }
  if (!found || found.type !== "pdf") return res.status(404).json({ error: "not_found" });
  const filePath = path.join(EVENT_FILES_DIR, found.file);
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: "file_missing", message: "O arquivo não está mais no servidor." });
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": (req.query.dl === "1" ? "attachment" : "inline") + "; filename*=UTF-8''" + encodeURIComponent(found.title) + ".pdf",
    "Cache-Control": "private, max-age=3600",
  });
  res.sendFile(filePath);
});

app.delete("/api/events/:id/materials/:materialId", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const item = ev.materials.find((m) => m.id === req.params.materialId);
  if (!item) return res.status(404).json({ error: "not_found" });
  ev.materials = ev.materials.filter((m) => m.id !== req.params.materialId);
  writeEvents(data);
  if (item.file) fs.unlink(path.join(EVENT_FILES_DIR, item.file), () => {});
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

// ---- Inscrições ----

app.post("/api/events/:id/signups-open", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  ev.signups.open = Boolean(req.body.open);
  if ("capacity" in req.body) {
    const cap = parseInt(req.body.capacity, 10);
    ev.signups.capacity = Number.isInteger(cap) && cap > 0 ? cap : null;
    // Aumentar o limite promove quem estava esperando; diminuir não expulsa
    // ninguém que já tinha vaga confirmada.
    promoteFromWaitlist(ev);
  }
  if (ev.signups.open && !ev.signups.token) ev.signups.token = crypto.randomBytes(8).toString("hex");
  writeEvents(data);
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

app.post("/api/events/:id/signup", requireAuthApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  if (!ev.signups.open) {
    return res.status(423).json({ error: "signups_closed", message: "As inscrições deste evento estão fechadas." });
  }
  const order = req.session.user.order;
  if (!ev.signups.list.some((s) => s.type === "member" && s.order === order)) {
    const member = findMember(order);
    addSignup(ev, {
      type: "member",
      order,
      name: req.session.user.name,
      phone: (member && member.phone) || "",
      at: new Date().toISOString(),
    });
    writeEvents(data);
  }
  res.json({ ok: true, event: eventView(ev, req.session.user) });
});

// Cancelar a própria inscrição — e a vaga liberada puxa o primeiro da fila.
app.delete("/api/events/:id/signup", requireAuthApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const before = ev.signups.list.length;
  ev.signups.list = ev.signups.list.filter((s) => !(s.type === "member" && s.order === req.session.user.order));
  if (ev.signups.list.length !== before) {
    promoteFromWaitlist(ev);
    writeEvents(data);
  }
  res.json({ ok: true, event: eventView(ev, req.session.user) });
});

// A diretoria tira uma inscrição da lista (desistência avisada no grupo,
// duplicata, inscrição de teste) — e a vaga liberada puxa a fila.
app.delete("/api/events/:id/signups/:signupId", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const antes = ev.signups.list.length;
  ev.signups.list = ev.signups.list.filter((s) => s.id !== req.params.signupId);
  if (ev.signups.list.length === antes) return res.status(404).json({ error: "not_found" });
  promoteFromWaitlist(ev);
  writeEvents(data);
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

// Presença de visitante marcada por engano (nome errado, teste do QR).
app.delete("/api/events/:id/visitors/:visitorId", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const antes = ev.visitorAttendance.length;
  ev.visitorAttendance = ev.visitorAttendance.filter((v) => v !== req.params.visitorId);
  if (ev.visitorAttendance.length === antes) return res.status(404).json({ error: "not_found" });
  writeEvents(data);
  res.json({ ok: true, event: Object.assign(eventView(ev, req.session.user), directorView(ev, data)) });
});

// Código queimado (vazou no grupo errado, gerado por engano). Some sempre um:
// sem código nenhum ninguém faz check-in.
app.delete("/api/events/:id/codes/:code", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  if (ev.codes.length <= 1) {
    return res.status(400).json({ error: "last_code", message: "Gere outro código antes de remover este." });
  }
  const antes = ev.codes.length;
  ev.codes = ev.codes.filter((c) => c !== String(req.params.code).toUpperCase());
  if (ev.codes.length === antes) return res.status(404).json({ error: "not_found" });
  writeEvents(data);
  res.json({ ok: true, codes: ev.codes });
});

app.get("/api/events/:id/signup-qr", requireDirectorApi, (req, res) => {
  const ev = findEvent(readEventsStore(), req.params.id);
  if (!ev || !ev.signups.token) return res.status(404).json({ error: "not_found" });
  const url = req.protocol + "://" + req.get("host") + "/inscricao.html?t=" + ev.signups.token;
  QRCode.toString(url, { type: "svg", margin: 1, width: 480 }, (err, svg) => {
    if (err) return res.status(500).json({ error: "qr_failed" });
    res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" });
    res.send(svg);
  });
});

// ---- Presença ----

app.post("/api/events/:id/codes", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  ev.codes.push(generateCode());
  writeEvents(data);
  res.json({ ok: true, codes: ev.codes });
});

// Override manual da janela automática: true reabre fora da data, false encerra
// antes da hora, null devolve o controle para o calendário.
app.post("/api/events/:id/attendance-open", requireDirectorApi, (req, res) => {
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  if (req.body.open === null) delete ev.attendanceOpen;
  else ev.attendanceOpen = Boolean(req.body.open);
  writeEvents(data);
  res.json({ ok: true, attendanceState: attendanceState(ev) });
});

app.post("/api/events/:id/member-attendance", requireDirectorApi, (req, res) => {
  const order = parseInt(req.body.order, 10);
  if (!findMemberAny(order)) return res.status(400).json({ error: "invalid_member" });
  const data = readEventsStore();
  const ev = findEvent(data, req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const set = new Set(ev.memberAttendance);
  req.body.present ? set.add(order) : set.delete(order);
  ev.memberAttendance = Array.from(set).sort((a, b) => a - b);
  writeEvents(data);
  res.json({ ok: true, memberAttendance: ev.memberAttendance });
});

app.post("/api/events/checkin", requireAuthApi, (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "empty_code" });
  const data = readEventsStore();
  const ev = data.events.find((e) => e.codes.includes(code) && attendanceIsOpen(e));
  if (!ev) {
    const existe = data.events.some((e) => e.codes.includes(code));
    return res.status(existe ? 423 : 404).json({
      error: existe ? "attendance_closed" : "invalid_code",
      message: existe
        ? "Este código é de um evento que não está acontecendo hoje."
        : "Código inválido.",
    });
  }
  if (!ev.memberAttendance.includes(req.session.user.order)) {
    ev.memberAttendance.push(req.session.user.order);
    ev.memberAttendance.sort((a, b) => a - b);
    writeEvents(data);
  }
  res.json({ ok: true, event: eventView(ev, req.session.user) });
});

app.get("/api/events/:id/qr", requireDirectorApi, (req, res) => {
  const ev = findEvent(readEventsStore(), req.params.id);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const url = req.protocol + "://" + req.get("host") + "/presenca.html?t=" + ev.qrToken;
  QRCode.toString(url, { type: "svg", margin: 1, width: 480 }, (err, svg) => {
    if (err) return res.status(500).json({ error: "qr_failed" });
    res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" });
    res.send(svg);
  });
});

// ---- Páginas públicas: inscrição pelo link e presença pelo QR ----

const publicFormAttempts = new Map();
function publicFormRateLimited(ip) {
  const now = Date.now();
  const rec = publicFormAttempts.get(ip);
  if (!rec || rec.resetAt < now) {
    publicFormAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 20;
}

const TYPE_LABEL = { reuniao: "Reunião", aula: "Aula", visita: "Visita", social: "Encontro" };

app.get("/api/event-signup/:token", (req, res) => {
  const ev = readEventsStore().events.find((e) => e.signups.token === req.params.token);
  if (!ev) return res.status(404).json({ error: "not_found" });
  const confirmed = ev.signups.list.filter((s) => s.status !== "waitlist").length;
  res.json({
    title: ev.title,
    date: ev.date,
    text: ev.text || "",
    kind: TYPE_LABEL[ev.type] || "Evento",
    open: ev.signups.open,
    capacity: ev.signups.capacity,
    seatsLeft: ev.signups.capacity ? Math.max(0, ev.signups.capacity - confirmed) : null,
  });
});

app.post("/api/event-signup/:token", (req, res) => {
  if (publicFormRateLimited(req.ip)) {
    return res.status(429).json({ error: "too_many_requests", message: "Muitas tentativas. Aguarde um pouco." });
  }
  const data = readEventsStore();
  const ev = data.events.find((e) => e.signups.token === req.params.token);
  if (!ev) return res.status(404).json({ error: "not_found" });
  if (!ev.signups.open) {
    return res.status(423).json({ error: "signups_closed", message: "As inscrições deste evento já foram encerradas." });
  }
  const name = String(req.body.name || "").trim().replace(/\s+/g, " ");
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 120);
  const phone = String(req.body.phone || "").trim().slice(0, 30);
  if (name.length < 3 || name.length > 80 || !name.includes(" ")) {
    return res.status(400).json({ error: "invalid_name", message: "Informe nome e sobrenome." });
  }
  if (phone.replace(/\D/g, "").length < 10) {
    return res.status(400).json({ error: "invalid_phone", message: "Informe um WhatsApp com DDD." });
  }
  const sameName = (n) => n.trim().toLowerCase() === name.toLowerCase();
  const existing = ev.signups.list.find(
    (s) => s.type === "external" && ((email && s.email && s.email === email) || sameName(s.name))
  );
  let status;
  if (existing) {
    status = existing.status;
  } else {
    status = addSignup(ev, { type: "external", name, email, phone, at: new Date().toISOString() });
    writeEvents(data);
  }
  res.json({
    ok: true,
    status,
    message:
      status === "waitlist"
        ? "As vagas acabaram, mas você entrou na fila de espera — avisamos se abrir uma vaga."
        : "Inscrição confirmada! Te esperamos lá.",
  });
});

app.get("/api/presence/:token", (req, res) => {
  const ev = readEventsStore().events.find((e) => e.qrToken === req.params.token);
  if (!ev) return res.status(404).json({ error: "not_found" });
  res.json({
    title: ev.title,
    date: ev.date,
    kind: TYPE_LABEL[ev.type] || "Evento",
    open: attendanceIsOpen(ev),
    state: attendanceState(ev),
  });
});

app.post("/api/presence/:token", (req, res) => {
  if (publicFormRateLimited(req.ip)) {
    return res.status(429).json({ error: "too_many_requests", message: "Muitas tentativas. Aguarde um pouco." });
  }
  const data = readEventsStore();
  const ev = data.events.find((e) => e.qrToken === req.params.token);
  if (!ev) return res.status(404).json({ error: "not_found" });
  if (!attendanceIsOpen(ev)) {
    const agendada = attendanceState(ev) === "agendada";
    return res.status(423).json({
      error: agendada ? "not_started" : "attendance_closed",
      message: agendada
        ? "A presença deste evento abre no dia " + ev.date.split("-").reverse().join("/") + "."
        : "A presença deste evento já foi encerrada.",
    });
  }
  const name = String(req.body.name || "").trim().replace(/\s+/g, " ");
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 120);
  const phone = String(req.body.phone || "").trim().slice(0, 30);
  if (name.length < 3 || name.length > 80 || !name.includes(" ")) {
    return res.status(400).json({ error: "invalid_name", message: "Informe nome e sobrenome." });
  }

  let visitor = data.visitors.find((v) =>
    (email && v.email && v.email === email) || v.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (!visitor) {
    visitor = {
      id: "v" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
      name,
      email,
      phone,
      createdAt: new Date().toISOString(),
    };
    data.visitors.push(visitor);
  } else {
    if (email && !visitor.email) visitor.email = email;
    if (phone && !visitor.phone) visitor.phone = phone;
  }
  if (!ev.visitorAttendance.includes(visitor.id)) ev.visitorAttendance.push(visitor.id);
  // Quem se inscreveu e apareceu fica marcado: é o que separa presença de
  // no-show na lista da diretoria.
  const inscricao = ev.signups.list.find(
    (s) => s.type === "external" && ((email && s.email === email) || s.name.trim().toLowerCase() === name.toLowerCase())
  );
  if (inscricao) inscricao.attended = true;
  writeEvents(data);

  const visits = visitorVisits(data, visitor.id);
  res.json({
    ok: true,
    visits,
    inviteReady: visits >= VISITOR_INVITE_THRESHOLD,
    message:
      visits >= VISITOR_INVITE_THRESHOLD
        ? "Presença registrada! Você já participou de " + visits + " atividades — que tal virar membro? Peça acesso na página inicial ou fale com a diretoria."
        : "Presença registrada! Bem-vindo(a) à LEPV.",
  });
});

// ---- Selos (presença por empresa → gamificação individualizada) ----

// Visão de cada membro: quais empresas ele já tem selo, mais o progresso
// coletivo do grupo (sem expor quem exatamente compareceu a cada uma —
// isso só o admin vê no painel de presença).
app.get("/api/badges", requireImmersionApi, (req, res) => {
  const attendance = readAttendance();
  const companies = readJson("companies.json");
  const order = req.session.user.order;
  const earned = companies.map((c) => c.key).filter((key) => (attendance[key] || []).includes(order));
  const totalConfirmed = companies.reduce((sum, c) => sum + (attendance[c.key] || []).length, 0);
  res.json({
    earned,
    totalCompanies: companies.length,
    group: { confirmed: totalConfirmed, possible: companies.length * seedMembers.length },
  });
});

// Matriz completa (empresa → membros presentes) — só o admin, pra marcar presença.
app.get("/api/attendance", requireAdminApi, (req, res) => {
  res.json(readAttendance());
});

app.post("/api/attendance", requireAdminApi, (req, res) => {
  const companyKey = String(req.body.companyKey || "");
  const order = parseInt(req.body.order, 10);
  const attended = Boolean(req.body.attended);
  const attendance = readAttendance();
  const validCompany = readJson("companies.json").some((c) => c.key === companyKey);
  if (!validCompany || !findMemberAny(order)) {
    return res.status(400).json({ error: "invalid_company_or_member" });
  }
  // Empresa nova adicionada depois do primeiro deploy pode não existir ainda
  // no attendance.json do volume — inicializa em vez de rejeitar.
  if (!(companyKey in attendance)) attendance[companyKey] = [];
  const set = new Set(attendance[companyKey]);
  attended ? set.add(order) : set.delete(order);
  attendance[companyKey] = Array.from(set).sort((a, b) => a - b);
  writeAttendance(attendance);
  res.json({ companyKey, members: attendance[companyKey] });
});

// Healthcheck (Railway e monitoramento): responde sem tocar sessão nem stores.
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()) });
});

app.use(express.static(PUBLIC_DIR, { index: false }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LEPV Imersão SP rodando em http://localhost:${PORT}`);
});
