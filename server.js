const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

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

if (!fs.existsSync(path.join(DATA_DIR, "credentials.json"))) {
  console.error("credentials.json não encontrado. Rode: npm run seed");
  process.exit(1);
}

const members = readJson("members.json");
const credentials = readJson("credentials.json");
const membersByOrder = new Map(members.map((m) => [m.order, m]));
const credsByOrder = new Map(credentials.map((c) => [c.order, c]));

const app = express();
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

app.get("/", requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.html"));
});
app.get("/app.html", requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.html"));
});

app.get("/api/members-public", (req, res) => {
  res.json(
    members.map((m) => ({
      order: m.order,
      name: m.name,
      photo: m.photo || null,
      course: m.course || "",
      year: m.year || "",
      interests: m.interests || [],
    }))
  );
});

app.post("/api/login", (req, res) => {
  const order = parseInt(req.body.order, 10);
  const password = String(req.body.password || "");
  const key = String(order);

  if (isLockedOut(key)) {
    return res.status(429).json({ error: "too_many_attempts", message: "Muitas tentativas. Aguarde 30s e tente de novo." });
  }

  const member = membersByOrder.get(order);
  const cred = credsByOrder.get(order);
  if (!member || !cred || !bcrypt.compareSync(password, cred.passwordHash)) {
    registerFailure(key);
    return res.status(401).json({ error: "invalid_credentials", message: "Membro ou senha incorretos." });
  }

  clearFailures(key);
  req.session.user = { order: member.order, name: member.name, admin: member.admin === true };
  res.json({ ok: true, name: member.name, order: member.order, admin: member.admin === true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireAuthApi, (req, res) => {
  res.json({ authenticated: true, ...req.session.user });
});

app.get("/api/members", requireAuthApi, (req, res) => {
  res.json(members);
});

app.get("/api/mission", requireAuthApi, (req, res) => {
  res.json(readJson("mission.json"));
});

app.get("/api/itinerary", requireAuthApi, (req, res) => {
  res.json(readJson("itinerary.json"));
});

app.get("/api/companies", requireAuthApi, (req, res) => {
  res.json(readJson("companies.json"));
});

app.get("/api/checklist", requireAuthApi, (req, res) => {
  res.json(readChecklist());
});

app.post("/api/checklist", requireAuthApi, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty_text" });
  const items = readChecklist();
  const nextId = items.reduce((max, i) => Math.max(max, i.id), 0) + 1;
  items.push({ id: nextId, text, done: false, addedBy: req.session.user.name });
  writeChecklist(items);
  res.json(items);
});

app.patch("/api/checklist/:id", requireAuthApi, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const items = readChecklist();
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: "not_found" });
  item.done = Boolean(req.body.done);
  writeChecklist(items);
  res.json(items);
});

app.delete("/api/checklist/:id", requireAuthApi, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const items = readChecklist().filter((i) => i.id !== id);
  writeChecklist(items);
  res.json(items);
});

// ---- Enquete do bóton limitado ----

app.get("/api/pin-poll", requireAuthApi, (req, res) => {
  const entry = readPinPoll()[String(req.session.user.order)];
  res.json({ answered: entry !== undefined, want: entry ? entry.want : null });
});

app.post("/api/pin-poll", requireAuthApi, (req, res) => {
  const poll = readPinPoll();
  poll[String(req.session.user.order)] = { want: Boolean(req.body.want), name: req.session.user.name };
  writePinPoll(poll);
  res.json({ ok: true });
});

app.get("/api/pin-poll/all", requireAdminApi, (req, res) => {
  res.json(readPinPoll());
});

// ---- Perguntas do grupo (Q&A colaborativo por empresa) ----

app.get("/api/questions", requireAuthApi, (req, res) => {
  res.json(readQuestions());
});

app.post("/api/questions", requireAuthApi, (req, res) => {
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

app.delete("/api/questions/:companyKey/:id", requireAuthApi, (req, res) => {
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

// ---- Aprendizados pós-visita (memória coletiva por empresa) ----

app.get("/api/learnings", requireAuthApi, (req, res) => {
  res.json(readLearnings());
});

app.post("/api/learnings", requireAuthApi, (req, res) => {
  const companyKey = String(req.body.companyKey || "");
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty_text" });
  if (!readJson("companies.json").some((c) => c.key === companyKey)) {
    return res.status(400).json({ error: "invalid_company" });
  }
  // Só registra aprendizado quem já tem o selo da visita (presença marcada);
  // o admin pode sempre, pra anotar em nome do grupo.
  const attended = (readAttendance()[companyKey] || []).includes(req.session.user.order);
  if (!attended && !req.session.user.admin) {
    return res.status(403).json({ error: "not_attended" });
  }
  const learnings = readLearnings();
  if (!(companyKey in learnings)) learnings[companyKey] = [];
  const nextId = Object.values(learnings).flat().reduce((max, l) => Math.max(max, l.id), 0) + 1;
  learnings[companyKey].push({ id: nextId, text, addedBy: req.session.user.name, order: req.session.user.order });
  writeLearnings(learnings);
  res.json(learnings);
});

app.delete("/api/learnings/:companyKey/:id", requireAuthApi, (req, res) => {
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

// ---- Selos (presença por empresa → gamificação individualizada) ----

// Visão de cada membro: quais empresas ele já tem selo, mais o progresso
// coletivo do grupo (sem expor quem exatamente compareceu a cada uma —
// isso só o admin vê no painel de presença).
app.get("/api/badges", requireAuthApi, (req, res) => {
  const attendance = readAttendance();
  const companies = readJson("companies.json");
  const order = req.session.user.order;
  const earned = companies.map((c) => c.key).filter((key) => (attendance[key] || []).includes(order));
  const totalConfirmed = companies.reduce((sum, c) => sum + (attendance[c.key] || []).length, 0);
  res.json({
    earned,
    totalCompanies: companies.length,
    group: { confirmed: totalConfirmed, possible: companies.length * members.length },
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
  if (!validCompany || !membersByOrder.has(order)) {
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
