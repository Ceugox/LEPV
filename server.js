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

app.get("/", (req, res) => {
  if (req.session.user) return res.sendFile(path.join(PUBLIC_DIR, "app.html"));
  return res.sendFile(path.join(PUBLIC_DIR, "home.html"));
});
app.get("/app.html", requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.html"));
});

// Guia do membro (PDF) — só para quem está logado
app.get("/guia.pdf", requireAuthPage, (req, res) => {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent("Guia da Imersão — Missão SP") + ".pdf",
    "Cache-Control": "private, max-age=3600",
  });
  res.sendFile(path.join(__dirname, "docs", "Guia-Imersao-SP.pdf"));
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

// ---- Materiais de preparação por empresa ----

function findMaterial(id) {
  const materials = readMaterials();
  for (const [companyKey, list] of Object.entries(materials)) {
    const item = list.find((m) => m.id === id);
    if (item) return { companyKey, item };
  }
  return null;
}

app.get("/api/materials", requireAuthApi, (req, res) => {
  res.json(readMaterials());
});

// Visualizar (inline, viewer nativo do celular) ou baixar (?dl=1).
app.get("/api/materials/:id/file", requireAuthApi, (req, res) => {
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

// Upload de PDF (admin): corpo cru da requisição, sem multipart/multer.
app.post(
  "/api/materials/upload",
  requireAdminApi,
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
app.post("/api/materials/link", requireAdminApi, (req, res) => {
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

app.delete("/api/materials/:id", requireAdminApi, (req, res) => {
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
  members.forEach((m) => { bal[m.order] = 0; });
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

app.get("/api/expenses", requireAuthApi, (req, res) => {
  const data = readExpenses();
  const expenses = [...data.expenses].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const balances = computeBalances(data.expenses);
  res.json({ expenses, balances, settle: settleUp(balances) });
});

app.post("/api/expenses", requireAuthApi, (req, res) => {
  const description = String(req.body.description || "").trim();
  const amountCents = parseInt(req.body.amountCents, 10);
  const paidBy = parseInt(req.body.paidBy, 10);
  const participants = Array.isArray(req.body.participants)
    ? [...new Set(req.body.participants.map((p) => parseInt(p, 10)))]
    : [];
  if (!description) return res.status(400).json({ error: "empty_description" });
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 10_000_000) {
    return res.status(400).json({ error: "invalid_amount" });
  }
  if (!membersByOrder.has(paidBy)) return res.status(400).json({ error: "invalid_payer" });
  if (!participants.length || participants.some((p) => !membersByOrder.has(p))) {
    return res.status(400).json({ error: "invalid_participants" });
  }
  const data = readExpenses();

  // Duas pessoas registrando o mesmo Uber/almoço é o erro mais provável do
  // grupo: mesmo valor + mesmos participantes em menos de 15 min vira aviso.
  // O cliente pode insistir com force=true (falso positivo é possível).
  const sortedParticipants = participants.sort((a, b) => a - b);
  if (req.body.force !== true) {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const duplicate = data.expenses.find(
      (e) =>
        e.type !== "settlement" &&
        e.amountCents === amountCents &&
        new Date(e.createdAt).getTime() >= cutoff &&
        e.participants.length === sortedParticipants.length &&
        e.participants.every((p, i) => p === sortedParticipants[i])
    );
    if (duplicate) {
      return res.status(409).json({
        error: "possible_duplicate",
        duplicate: {
          description: duplicate.description,
          amountCents: duplicate.amountCents,
          paidBy: duplicate.paidBy,
          createdAt: duplicate.createdAt,
          createdBy: duplicate.createdBy,
        },
      });
    }
  }

  data.expenses.push({
    id: "e" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    description,
    amountCents,
    paidBy,
    participants: sortedParticipants,
    createdAt: new Date().toISOString(),
    createdBy: req.session.user.order,
  });
  writeExpenses(data);
  const balances = computeBalances(data.expenses);
  res.json({ expenses: data.expenses, balances, settle: settleUp(balances) });
});

// Registrar um Pix feito: quem paga é sempre o usuário logado.
app.post("/api/expenses/settle", requireAuthApi, (req, res) => {
  const to = parseInt(req.body.to, 10);
  const amountCents = parseInt(req.body.amountCents, 10);
  const from = req.session.user.order;
  if (!membersByOrder.has(to) || to === from) return res.status(400).json({ error: "invalid_recipient" });
  if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: "invalid_amount" });
  const data = readExpenses();
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
  res.json({ expenses: data.expenses, balances, settle: settleUp(balances) });
});

app.delete("/api/expenses/:id", requireAuthApi, (req, res) => {
  const data = readExpenses();
  const item = data.expenses.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ error: "not_found" });
  if (item.createdBy !== req.session.user.order && !req.session.user.admin) {
    return res.status(403).json({ error: "not_owner" });
  }
  data.expenses = data.expenses.filter((e) => e.id !== req.params.id);
  writeExpenses(data);
  const balances = computeBalances(data.expenses);
  res.json({ expenses: data.expenses, balances, settle: settleUp(balances) });
});

// ---- Enquete do bóton limitado ----

app.get("/api/pin-poll", requireAuthApi, (req, res) => {
  const entry = readPinPoll()[String(req.session.user.order)];
  res.json({ answered: entry !== undefined, want: entry ? entry.want : null });
});

// Bóton custa R$ 11,00, bancado pelo Marcell (order 1) — quem aceita já entra
// devendo na aba Despesas. O próprio Marcell não deve a si mesmo, e o id
// determinístico ("pin-N") garante que reenvio de resposta não duplica dívida.
const PIN_PRICE_CENTS = 1100;
const PIN_PAYER_ORDER = 1;

app.post("/api/pin-poll", requireAuthApi, (req, res) => {
  const order = req.session.user.order;
  const want = Boolean(req.body.want);
  const poll = readPinPoll();
  poll[String(order)] = { want, name: req.session.user.name };
  writePinPoll(poll);

  if (want && order !== PIN_PAYER_ORDER) {
    const data = readExpenses();
    if (!data.expenses.some((e) => e.id === "pin-" + order)) {
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
  const created = [], skipped = [];
  for (const m of members) {
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
  res.json({ created, skipped, expenses: data.expenses, balances, settle: settleUp(balances) });
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
