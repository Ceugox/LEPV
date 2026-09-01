const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const membersPath = path.join(__dirname, "..", "data", "members.json");
const credsPath = path.join(__dirname, "..", "data", "credentials.json");

const members = JSON.parse(fs.readFileSync(membersPath, "utf8"));

const superadmins = members.filter((m) => m.superadmin === true);
const password = String(process.env.SEED_SUPERADMIN_PASSWORD || "");
if (!superadmins.length) throw new Error("Nenhum superadmin encontrado em members.json.");
if (password.length < 8) {
  throw new Error("Defina SEED_SUPERADMIN_PASSWORD com ao menos 8 caracteres antes de gerar credenciais.");
}

// Somente a conta de bootstrap recebe hash no repositório. Os demais membros
// recebem códigos temporários emitidos pelo superadmin, no volume persistente.
const credentials = superadmins.map((m) => ({
  order: m.order,
  passwordHash: bcrypt.hashSync(password, 10),
}));

fs.writeFileSync(credsPath, JSON.stringify(credentials, null, 2) + "\n", "utf8");
console.log(`Gerado ${credentials.length} hashes em ${credsPath}`);
