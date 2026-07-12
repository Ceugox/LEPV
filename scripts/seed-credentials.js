const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const membersPath = path.join(__dirname, "..", "data", "members.json");
const credsPath = path.join(__dirname, "..", "data", "credentials.json");

const members = JSON.parse(fs.readFileSync(membersPath, "utf8"));

// Admins têm senha própria (definida fora do seed) — um re-seed não pode
// rebaixá-la de volta pro número de inscrição. Preserva o hash existente.
const existing = fs.existsSync(credsPath)
  ? new Map(JSON.parse(fs.readFileSync(credsPath, "utf8")).map((c) => [c.order, c.passwordHash]))
  : new Map();

const credentials = members.map((m) => ({
  order: m.order,
  passwordHash: m.admin && existing.has(m.order)
    ? existing.get(m.order)
    : bcrypt.hashSync(String(m.order), 10),
}));

fs.writeFileSync(credsPath, JSON.stringify(credentials, null, 2) + "\n", "utf8");
console.log(`Gerado ${credentials.length} hashes em ${credsPath}`);
