const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const membersPath = path.join(__dirname, "..", "data", "members.json");
const credsPath = path.join(__dirname, "..", "data", "credentials.json");

const members = JSON.parse(fs.readFileSync(membersPath, "utf8"));

const credentials = members.map((m) => ({
  order: m.order,
  passwordHash: bcrypt.hashSync(String(m.order), 10),
}));

fs.writeFileSync(credsPath, JSON.stringify(credentials, null, 2) + "\n", "utf8");
console.log(`Gerado ${credentials.length} hashes em ${credsPath}`);
