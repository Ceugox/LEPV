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
function writeJson(name, value) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readChecklist() {
  return JSON.parse(fs.readFileSync(CHECKLIST_PATH, "utf8"));
}
function writeChecklist(value) {
  fs.writeFileSync(CHECKLIST_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(CHECKLIST_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeChecklist(readJson("checklist.json"));
}

// Presença por empresa (quem já visitou) — editada em runtime pelo admin,
// então segue o mesmo padrão do checklist: persiste no volume, não em data/.
const ATTENDANCE_PATH = path.join(STORAGE_DIR, "attendance.json");
function readAttendance() {
  return JSON.parse(fs.readFileSync(ATTENDANCE_PATH, "utf8"));
}
function writeAttendance(value) {
  fs.writeFileSync(ATTENDANCE_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(ATTENDANCE_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeAttendance(readJson("attendance.json"));
}

// Perguntas do grupo por empresa (roteiro coletivo do Q&A de cada visita) —
// criadas em runtime pelos membros, mesmo padrão de persistência do checklist.
const QUESTIONS_PATH = path.join(STORAGE_DIR, "questions.json");
function readQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
}
function writeQuestions(value) {
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(QUESTIONS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeQuestions({});
}

// Aprendizados pós-visita (memória coletiva da imersão) — mesmo padrão.
const LEARNINGS_PATH = path.join(STORAGE_DIR, "learnings.json");
function readLearnings() {
  return JSON.parse(fs.readFileSync(LEARNINGS_PATH, "utf8"));
}
function writeLearnings(value) {
  fs.writeFileSync(LEARNINGS_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(LEARNINGS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeLearnings({});
}

// Enquete do bóton limitado (1ª imersão) — resposta por membro, no volume.
const PIN_POLL_PATH = path.join(STORAGE_DIR, "pin-poll.json");
function readPinPoll() {
  return JSON.parse(fs.readFileSync(PIN_POLL_PATH, "utf8"));
}
function writePinPoll(value) {
  fs.writeFileSync(PIN_POLL_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
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
  return JSON.parse(fs.readFileSync(MATERIALS_PATH, "utf8"));
}
function writeMaterials(value) {
  fs.writeFileSync(MATERIALS_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(MATERIALS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeMaterials({});
}
fs.mkdirSync(MATERIALS_DIR, { recursive: true });

// Despesas da viagem (divisão estilo Splitwise) — tudo em centavos inteiros,
// saldos sempre derivados da lista (nunca persistidos).
const EXPENSES_PATH = path.join(STORAGE_DIR, "expenses.json");
function readExpenses() {
  return JSON.parse(fs.readFileSync(EXPENSES_PATH, "utf8"));
}
function writeExpenses(value) {
  fs.writeFileSync(EXPENSES_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(EXPENSES_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeExpenses({ expenses: [] });
}

// Reuniões da liga — presença de membros (por código) e de visitantes
// (por QR/pré-cadastro). Tudo em runtime, então mora no volume.
const MEETINGS_PATH = path.join(STORAGE_DIR, "meetings.json");
function readMeetings() {
  return JSON.parse(fs.readFileSync(MEETINGS_PATH, "utf8"));
}
function writeMeetings(value) {
  fs.writeFileSync(MEETINGS_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
}
if (!fs.existsSync(MEETINGS_PATH)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  writeMeetings({ meetings: [], visitors: [] });
}

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
  return JSON.parse(fs.readFileSync(SIGNUPS_PATH, "utf8"));
}
function writeSignups(value) {
  fs.writeFileSync(SIGNUPS_PATH, JSON.stringify(value, null, 2) + "\n", "utf8");
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

const app = express();
// Atrás do proxy do Railway: sem isso req.ip é o IP do proxy e o rate limit
// do cadastro valeria para todo mundo junto.
app.set("trust proxy", 1);
app.use(express.json());
// Secret fixo via env em produção: sem ele, cada deploy/restart invalida a
// sessão de todo mundo no meio da viagem. O fallback aleatório fica só pra dev.
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

const loginAttempts = new Map();
function isLockedOut(key) {
  const rec = loginAttempts.get(key);
  return rec && rec.lockUntil && rec.lockUntil > Date.now();
}
function registerFailure(key) {
  const rec = loginAttempts.get(key) || { count: 0, lockUntil: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.lockUntil = Date.now() + 30_000;
    rec.count = 0;
  }
  loginAttempts.set(key, rec);
}
function clearFailures(key) {
  loginAttempts.delete(key);
}

function requireAuthPage(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/login.html");
}
function requireAuthApi(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).json({ error: "not_authenticated" });
}
function requireAdminApi(req, res, next) {
  if (req.session.user && req.session.user.admin) return next();
  return res.status(403).json({ error: "not_admin" });
}
// Só o super admin (hoje o Marcell) aprova quem entra na liga — admins
// futuros de diretoria não herdam esse poder automaticamente.
function requireSuperAdminApi(req, res, next) {
  if (req.session.user && req.session.user.superadmin) return next();
  return res.status(403).json({ error: "not_superadmin" });
}
// Diretores: gestão do dia a dia da liga — materiais e presença em reuniões.
// O super admin também é diretor; o inverso não vale.
function requireDirectorApi(req, res, next) {
  if (req.session.user && (req.session.user.director || req.session.user.superadmin)) return next();
  return res.status(403).json({ error: "not_director" });
}
// O acervo da imersão é só de quem esteve lá. Checa direto no seed (e não na
// flag de sessão) para valer também para sessões abertas antes do deploy.
function requireImmersionApi(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "not_authenticated" });
  if (!seedMembers.some((s) => s.order === req.session.user.order)) {
    return res.status(403).json({ error: "not_immersion_member" });
  }
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
    for (const e of AVATAR_EXTS) {
      fs.rmSync(path.join(AVATARS_DIR, order + "." + e), { force: true });
    }
    fs.writeFileSync(path.join(AVATARS_DIR, order + "." + ext), req.body);
    res.json({ ok: true, photo: memberPhoto(findMember(order)) });
  }
);

app.post("/api/login", (req, res) => {
  const order = parseInt(req.body.order, 10);
  const password = String(req.body.password || "");
  const key = String(order);

  if (isLockedOut(key)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Muitas tentativas. Aguarde 30s e tente de novo." });
  }

  const member = findMember(order);
  const cred = findCredential(order);
  if (!member || !cred || !bcrypt.compareSync(password, cred.passwordHash)) {
    registerFailure(key);
    return res.status(401).json({ error: "invalid_credentials", message: "Membro ou senha incorretos." });
  }

  clearFailures(key);
  req.session.user = sessionUser(member, cred);
  res.json({ ok: true, ...req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireAuthApi, (req, res) => {
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
app.post("/api/set-password", requireAuthApi, (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 4 || password.length > 72) {
    return res.status(400).json({ error: "invalid_password", message: "A senha precisa ter pelo menos 4 caracteres." });
  }
  const order = req.session.user.order;
  const signups = readSignups();
  const hash = bcrypt.hashSync(password, 10);
  const cred = signups.credentials.find((c) => c.order === order);
  if (cred) {
    cred.passwordHash = hash;
    delete cred.mustChangePassword;
  } else {
    signups.credentials.push({ order, passwordHash: hash });
  }
  writeSignups(signups);
  req.session.user.mustChangePassword = false;
  res.json({ ok: true });
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
    signups.members.push({
      order,
      name,
      photo: null,
      course: String(raw.course || "").trim().slice(0, 80),
      year: String(raw.year || "").trim().slice(0, 40),
      interests: Array.isArray(raw.interests)
        ? raw.interests.map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 8)
        : [],
      director: raw.director === true,
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
  const interests = Array.isArray(req.body.interests)
    ? req.body.interests.map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 8)
    : [];

  if (name.length < 3 || name.length > 80 || !name.includes(" ")) {
    return res.status(400).json({ error: "invalid_name", message: "Informe nome e sobrenome." });
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

app.get("/api/members", requireAuthApi, (req, res) => {
  res.json(activeMembers().map((m) => ({ ...m, photo: memberPhoto(m) })));
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

// ---- Despesas da viagem (divisão estilo Splitwise) ----

// Divisão igual em centavos: base + resto distribuído deterministicamente
// (ordem de inscrição crescente), então a soma bate SEMPRE com o total.
function splitEqual(amountCents, participants) {
  const sorted = [...participants].sort((a, b) => a - b);
  const base = Math.floor(amountCents / sorted.length);
  const remainder = amountCents % sorted.length;
  const shares = {};
  sorted.forEach((order, i) => {
    shares[order] = base + (i < remainder ? 1 : 0);
  });
  return shares;
}

// Saldo por membro derivado das despesas: positivo = tem a receber.
function computeBalances(expenses) {
  const bal = {};
  allMembers().forEach((m) => { bal[m.order] = 0; });
  for (const e of expenses) {
    if (e.type === "settlement") {
      bal[e.from] += e.amountCents;
      bal[e.to] -= e.amountCents;
      continue;
    }
    const shares = splitEqual(e.amountCents, e.participants);
    bal[e.paidBy] += e.amountCents;
    for (const [order, cents] of Object.entries(shares)) bal[order] -= cents;
  }
  return bal;
}

// Acerto final: greedy maior devedor × maior credor — máx. n-1 transações.
function settleUp(balances) {
  const debtors = [], creditors = [];
  for (const [order, cents] of Object.entries(balances)) {
    if (cents < 0) debtors.push({ order: parseInt(order, 10), amount: -cents });
    else if (cents > 0) creditors.push({ order: parseInt(order, 10), amount: cents });
  }
  const byAmount = (a, b) => b.amount - a.amount || a.order - b.order;
  debtors.sort(byAmount);
  creditors.sort(byAmount);
  const payments = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    payments.push({ from: debtors[i].order, to: creditors[j].order, amountCents: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return payments;
}

app.get("/api/expenses", requireImmersionApi, (req, res) => {
  const data = readExpenses();
  const expenses = [...data.expenses].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const balances = computeBalances(data.expenses);
  res.json({ expenses, balances, settle: settleUp(balances), closed: data.closed === true });
});

// Fecha (trava) ou reabre as contas. Contas fechadas congelam os números:
// nenhuma despesa/acerto novo entra e nada é removido até o admin reabrir.
app.post("/api/expenses/close", requireAdminApi, (req, res) => {
  const data = readExpenses();
  data.closed = Boolean(req.body.closed);
  writeExpenses(data);
  const balances = computeBalances(data.expenses);
  res.json({ closed: data.closed, expenses: data.expenses, balances, settle: settleUp(balances) });
});

// Cadastro de despesas encerrado: a viagem acabou, o histórico está fechado.
// O saldo continua sendo acertado via Pix (POST /api/expenses/settle). Rota
// mantida só para responder de forma clara a clientes antigos em cache.
app.post("/api/expenses", requireImmersionApi, (req, res) => {
  return res.status(403).json({ error: "expense_creation_disabled" });
});

// Registrar um Pix feito: quem paga é sempre o usuário logado.
app.post("/api/expenses/settle", requireImmersionApi, (req, res) => {
  const to = parseInt(req.body.to, 10);
  const amountCents = parseInt(req.body.amountCents, 10);
  const from = req.session.user.order;
  if (!findMemberAny(to) || to === from) return res.status(400).json({ error: "invalid_recipient" });
  if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: "invalid_amount" });
  const data = readExpenses();
  if (data.closed) return res.status(423).json({ error: "expenses_closed" });
  data.expenses.push({
    id: "e" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    type: "settlement",
    from,
    to,
    amountCents,
    createdAt: new Date().toISOString(),
    createdBy: from,
  });
  writeExpenses(data);
  const balances = computeBalances(data.expenses);
  res.json({ expenses: data.expenses, balances, settle: settleUp(balances), closed: data.closed === true });
});

app.delete("/api/expenses/:id", requireImmersionApi, (req, res) => {
  const data = readExpenses();
  if (data.closed) return res.status(423).json({ error: "expenses_closed" });
  const item = data.expenses.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ error: "not_found" });
  if (item.createdBy !== req.session.user.order && !req.session.user.admin) {
    return res.status(403).json({ error: "not_owner" });
  }
  data.expenses = data.expenses.filter((e) => e.id !== req.params.id);
  writeExpenses(data);
  const balances = computeBalances(data.expenses);
  res.json({ expenses: data.expenses, balances, settle: settleUp(balances), closed: data.closed === true });
});

// ---- Enquete do bóton limitado ----

app.get("/api/pin-poll", requireImmersionApi, (req, res) => {
  const entry = readPinPoll()[String(req.session.user.order)];
  res.json({ answered: entry !== undefined, want: entry ? entry.want : null });
});

// Bóton custa R$ 11,00, bancado pelo Marcell (order 1) — quem aceita já entra
// devendo na aba Despesas. O próprio Marcell não deve a si mesmo, e o id
// determinístico ("pin-N") garante que reenvio de resposta não duplica dívida.
const PIN_PRICE_CENTS = 1100;
const PIN_PAYER_ORDER = 1;

app.post("/api/pin-poll", requireImmersionApi, (req, res) => {
  const order = req.session.user.order;
  const want = Boolean(req.body.want);
  const poll = readPinPoll();
  poll[String(order)] = { want, name: req.session.user.name };
  writePinPoll(poll);

  if (want && order !== PIN_PAYER_ORDER) {
    const data = readExpenses();
    // Contas fechadas congelam os números — a resposta fica registrada na
    // enquete, mas a dívida do bóton não entra até o admin reabrir.
    if (!data.closed && !data.expenses.some((e) => e.id === "pin-" + order)) {
      data.expenses.push({
        id: "pin-" + order,
        description: "Bóton LEPV " + String(order).padStart(2, "0") + "/11",
        amountCents: PIN_PRICE_CENTS,
        paidBy: PIN_PAYER_ORDER,
        participants: [order],
        createdAt: new Date().toISOString(),
        createdBy: PIN_PAYER_ORDER, // só o admin remove (a dívida espelha a enquete)
      });
      writeExpenses(data);
    }
  }
  res.json({ ok: true });
});

app.get("/api/pin-poll/all", requireAdminApi, (req, res) => {
  res.json(readPinPoll());
});

// Todos receberam o bóton fisicamente: registra a dívida de R$ 11 pra cada
// membro (menos o pagador) que ainda não tem. Idempotente pelo id "pin-N" —
// pode rodar quantas vezes quiser sem duplicar, e a enquete continua batendo
// no mesmo id (quem responder depois não gera dívida em dobro).
app.post("/api/pin-poll/register-all", requireAdminApi, (req, res) => {
  const data = readExpenses();
  if (data.closed) return res.status(423).json({ error: "expenses_closed" });
  const created = [], skipped = [];
  // O bóton é artefato da 1ª imersão: só os 11 fundadores entram na conta,
  // mesmo que a liga já tenha membros novos aprovados.
  for (const m of seedMembers) {
    if (m.order === PIN_PAYER_ORDER) continue;
    const id = "pin-" + m.order;
    if (data.expenses.some((e) => e.id === id)) { skipped.push(m.order); continue; }
    data.expenses.push({
      id,
      description: "Bóton LEPV " + String(m.order).padStart(2, "0") + "/11",
      amountCents: PIN_PRICE_CENTS,
      paidBy: PIN_PAYER_ORDER,
      participants: [m.order],
      createdAt: new Date().toISOString(),
      createdBy: PIN_PAYER_ORDER,
    });
    created.push(m.order);
  }
  if (created.length) writeExpenses(data);
  const balances = computeBalances(data.expenses);
  res.json({ created, skipped, expenses: data.expenses, balances, settle: settleUp(balances), closed: data.closed === true });
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

// ---- Reuniões da liga (presença por código e QR) ----

// Quantas reuniões um visitante já compareceu — com 2+ ele deve ser
// convidado a virar membro (o painel dos diretores destaca isso).
const VISITOR_INVITE_THRESHOLD = 2;
function visitorVisits(data, visitorId) {
  return data.meetings.filter((m) => (m.visitorAttendance || []).includes(visitorId)).length;
}

function meetingBaseView(m, user) {
  return {
    id: m.id,
    title: m.title,
    date: m.date,
    open: m.open !== false,
    present: m.memberAttendance.includes(user.order),
    membersPresent: m.memberAttendance.length,
    visitorsPresent: (m.visitorAttendance || []).length,
  };
}

app.get("/api/meetings", requireAuthApi, (req, res) => {
  const data = readMeetings();
  const isDirector = req.session.user.director || req.session.user.superadmin;
  const meetings = [...data.meetings]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((m) => {
      const view = meetingBaseView(m, req.session.user);
      if (isDirector) {
        view.codes = m.codes;
        view.qrToken = m.qrToken;
        view.memberAttendance = m.memberAttendance
          .map((order) => {
            const member = findMemberAny(order);
            return { order, name: member ? member.name : "nº " + order };
          })
          .sort((a, b) => a.order - b.order);
        view.visitors = (m.visitorAttendance || []).map((id) => {
          const v = data.visitors.find((x) => x.id === id);
          const visits = visitorVisits(data, id);
          return v
            ? { id, name: v.name, email: v.email || "", phone: v.phone || "", visits, inviteReady: visits >= VISITOR_INVITE_THRESHOLD }
            : { id, name: "?", visits };
        });
      }
      return view;
    });

  const payload = { meetings };
  if (isDirector) {
    // Visão geral dos visitantes recorrentes, independente da reunião.
    payload.inviteReady = data.visitors
      .map((v) => ({ id: v.id, name: v.name, email: v.email || "", phone: v.phone || "", visits: visitorVisits(data, v.id) }))
      .filter((v) => v.visits >= VISITOR_INVITE_THRESHOLD);
  }
  res.json(payload);
});

app.post("/api/meetings", requireDirectorApi, (req, res) => {
  const title = String(req.body.title || "").trim().slice(0, 80) || "Reunião da liga";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date || ""))
    ? String(req.body.date)
    : new Date().toISOString().slice(0, 10);
  const data = readMeetings();
  const meeting = {
    id: "r" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    title,
    date,
    open: true,
    codes: [generateCode()],
    qrToken: crypto.randomBytes(8).toString("hex"),
    memberAttendance: [],
    visitorAttendance: [],
    createdBy: req.session.user.order,
    createdAt: new Date().toISOString(),
  };
  data.meetings.push(meeting);
  writeMeetings(data);
  res.json({ ok: true, meeting: { ...meetingBaseView(meeting, req.session.user), codes: meeting.codes, qrToken: meeting.qrToken } });
});

// Mais de um código pode estar ativo ao mesmo tempo — todos valem.
app.post("/api/meetings/:id/codes", requireDirectorApi, (req, res) => {
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  meeting.codes.push(generateCode());
  writeMeetings(data);
  res.json({ ok: true, codes: meeting.codes });
});

app.post("/api/meetings/:id/open", requireDirectorApi, (req, res) => {
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  meeting.open = Boolean(req.body.open);
  writeMeetings(data);
  res.json({ ok: true, open: meeting.open });
});

// Ajuste manual de presença de membro (esqueceu o código, chegou depois...).
app.post("/api/meetings/:id/member-attendance", requireDirectorApi, (req, res) => {
  const order = parseInt(req.body.order, 10);
  if (!findMemberAny(order)) return res.status(400).json({ error: "invalid_member" });
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  const set = new Set(meeting.memberAttendance);
  req.body.present ? set.add(order) : set.delete(order);
  meeting.memberAttendance = Array.from(set).sort((a, b) => a - b);
  writeMeetings(data);
  res.json({ ok: true, memberAttendance: meeting.memberAttendance });
});

// Membro registra a própria presença com o código falado na reunião.
app.post("/api/meetings/checkin", requireAuthApi, (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "empty_code" });
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.open !== false && m.codes.includes(code));
  if (!meeting) {
    return res.status(404).json({ error: "invalid_code", message: "Código inválido ou reunião encerrada." });
  }
  if (!meeting.memberAttendance.includes(req.session.user.order)) {
    meeting.memberAttendance.push(req.session.user.order);
    meeting.memberAttendance.sort((a, b) => a - b);
    writeMeetings(data);
  }
  res.json({ ok: true, meeting: meetingBaseView(meeting, req.session.user) });
});

// QR da reunião: aponta para a página pública de presença de visitantes.
app.get("/api/meetings/:id/qr", requireDirectorApi, (req, res) => {
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  const url = req.protocol + "://" + req.get("host") + "/presenca.html?t=" + meeting.qrToken;
  QRCode.toString(url, { type: "svg", margin: 1, width: 480 }, (err, svg) => {
    if (err) return res.status(500).json({ error: "qr_failed" });
    res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" });
    res.send(svg);
  });
});

// ---- Presença pública de visitantes (via QR, sem login) ----

const presenceAttempts = new Map();
function presenceRateLimited(ip) {
  const now = Date.now();
  const rec = presenceAttempts.get(ip);
  if (!rec || rec.resetAt < now) {
    presenceAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 20;
}

app.get("/api/presence/:token", (req, res) => {
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.qrToken === req.params.token);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  res.json({ title: meeting.title, date: meeting.date, open: meeting.open !== false });
});

app.post("/api/presence/:token", (req, res) => {
  if (presenceRateLimited(req.ip)) {
    return res.status(429).json({ error: "too_many_requests", message: "Muitas tentativas. Aguarde um pouco." });
  }
  const data = readMeetings();
  const meeting = data.meetings.find((m) => m.qrToken === req.params.token);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  if (meeting.open === false) {
    return res.status(423).json({ error: "meeting_closed", message: "Esta reunião já foi encerrada." });
  }
  const name = String(req.body.name || "").trim().replace(/\s+/g, " ");
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 120);
  const phone = String(req.body.phone || "").trim().slice(0, 30);
  if (name.length < 3 || name.length > 80 || !name.includes(" ")) {
    return res.status(400).json({ error: "invalid_name", message: "Informe nome e sobrenome." });
  }

  // Pré-cadastro: reconhece o visitante pelo e-mail (preferência) ou nome —
  // é o que permite somar presenças entre reuniões diferentes.
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

  if (!meeting.visitorAttendance) meeting.visitorAttendance = [];
  if (!meeting.visitorAttendance.includes(visitor.id)) {
    meeting.visitorAttendance.push(visitor.id);
  }
  writeMeetings(data);
  const visits = visitorVisits(data, visitor.id);
  res.json({
    ok: true,
    visits,
    inviteReady: visits >= VISITOR_INVITE_THRESHOLD,
    message:
      visits >= VISITOR_INVITE_THRESHOLD
        ? "Presença registrada! Você já participou de " + visits + " reuniões — que tal virar membro? Peça acesso na página inicial ou fale com a diretoria."
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

app.use(express.static(PUBLIC_DIR, { index: false }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LEPV Imersão SP rodando em http://localhost:${PORT}`);
});
