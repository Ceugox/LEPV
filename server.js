const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}
function writeJson(name, value) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2) + "\n", "utf8");
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
app.use(
  session({
    secret: crypto.randomBytes(32).toString("hex"),
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

app.get("/", requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.html"));
});
app.get("/app.html", requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.html"));
});

app.get("/api/members-public", (req, res) => {
  res.json(members.map((m) => ({ order: m.order, name: m.name, photo: m.photo || null })));
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
  req.session.user = { order: member.order, name: member.name };
  res.json({ ok: true, name: member.name, order: member.order });
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
  res.json(readJson("checklist.json"));
});

app.post("/api/checklist", requireAuthApi, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "empty_text" });
  const items = readJson("checklist.json");
  const nextId = items.reduce((max, i) => Math.max(max, i.id), 0) + 1;
  items.push({ id: nextId, text, done: false, addedBy: req.session.user.name });
  writeJson("checklist.json", items);
  res.json(items);
});

app.patch("/api/checklist/:id", requireAuthApi, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const items = readJson("checklist.json");
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: "not_found" });
  item.done = Boolean(req.body.done);
  writeJson("checklist.json", items);
  res.json(items);
});

app.delete("/api/checklist/:id", requireAuthApi, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const items = readJson("checklist.json").filter((i) => i.id !== id);
  writeJson("checklist.json", items);
  res.json(items);
});

app.use(express.static(PUBLIC_DIR, { index: false }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LEPV Imersão SP rodando em http://localhost:${PORT}`);
});
