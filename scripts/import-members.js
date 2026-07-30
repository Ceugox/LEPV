// Importa membros da liga a partir do CSV exportado da planilha do Marcell.
//
// Uso:
//   node scripts/import-members.js caminho/membros.csv
//
// Variáveis de ambiente:
//   BASE_URL        destino (default http://localhost:4000; produção:
//                   https://lepv-imersao-sp-production.up.railway.app)
//   ADMIN_ORDER     ordem do super admin (default 1)
//   ADMIN_PASSWORD  senha do super admin (obrigatória)
//   DRY_RUN=1       só mostra o que seria importado, sem enviar
//
// O servidor gera um código inicial por membro (ou usa a coluna "codigo" se
// existir) e devolve os códigos em claro UMA vez — o script salva tudo em
// codigos-membros.csv ao lado do CSV de entrada, para distribuir no grupo.

const fs = require("fs");
const path = require("path");

const BASE_URL = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const ADMIN_ORDER = parseInt(process.env.ADMIN_ORDER || "1", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN === "1";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Uso: node scripts/import-members.js <arquivo.csv>");
  process.exit(1);
}
if (!ADMIN_PASSWORD && !DRY_RUN) {
  console.error("Defina ADMIN_PASSWORD (senha do super admin) ou rode com DRY_RUN=1.");
  process.exit(1);
}

// Parser de CSV mínimo com suporte a aspas (campos com vírgula/quebra).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// Cabeçalho tolerante: acha a coluna pelo que o nome dela contém.
function columnIndex(header, keywords) {
  return header.findIndex((h) => {
    const n = h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return keywords.some((k) => n.includes(k));
  });
}

function rowsToMembers(rows) {
  const header = rows[0];
  const iName = columnIndex(header, ["nome", "name", "membro"]);
  const iCargo = columnIndex(header, ["cargo", "funcao"]);
  const iTurma = columnIndex(header, ["turma"]);
  const iPhone = columnIndex(header, ["numero", "telefone", "whatsapp", "celular"]);
  const iStatus = columnIndex(header, ["a/r", "status", "ativa"]);
  const iCourse = columnIndex(header, ["curso", "course"]);
  const iYear = columnIndex(header, ["ano", "periodo", "year"]);
  const iInterests = columnIndex(header, ["interesse", "interest", "area"]);
  const iCode = columnIndex(header, ["codigo", "code", "senha inicial"]);
  if (iName === -1) {
    console.error("Não achei a coluna de nome no cabeçalho:", header.join(" | "));
    process.exit(1);
  }
  // CPF fica deliberadamente de fora: o app não precisa e /api/members é
  // visível a todos os membros.
  return rows.slice(1).map((r) => {
    const get = (i) => (i >= 0 && r[i] !== undefined ? String(r[i]).trim() : "");
    const cargo = get(iCargo);
    return {
      name: get(iName),
      cargo,
      turma: get(iTurma),
      phone: get(iPhone),
      status: get(iStatus).toLowerCase(),
      course: get(iCourse),
      year: get(iYear),
      interests: get(iInterests) ? get(iInterests).split(/[,;/]/).map((s) => s.trim()).filter(Boolean) : [],
      code: get(iCode) || undefined,
      director: cargo !== "" && cargo.toLowerCase() !== "membro",
    };
  }).filter((m) => m.name.length >= 3);
}

async function main() {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const members = rowsToMembers(parseCsv(text));
  console.log("Membros lidos do CSV: " + members.length);
  members.forEach((m) => {
    console.log(
      "  " + m.name + (m.director ? "  [DIRETOR]" : "") +
      (m.course ? "  (" + m.course + (m.year ? " · " + m.year : "") + ")" : "")
    );
  });
  if (DRY_RUN) {
    console.log("\nDRY_RUN=1 — nada foi enviado.");
    return;
  }

  const loginRes = await fetch(BASE_URL + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: ADMIN_ORDER, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error("Login do admin falhou:", loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];

  const importRes = await fetch(BASE_URL + "/api/admin/import-members", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ rows: members }),
  });
  const result = await importRes.json();
  if (!importRes.ok) {
    console.error("Import falhou:", importRes.status, JSON.stringify(result));
    process.exit(1);
  }

  console.log("\nCriados: " + result.created.length);
  result.created.forEach((c) => console.log("  nº " + c.order + "  " + c.name + "  código: " + c.code));
  if (result.skipped.length) {
    console.log("Pulados: " + result.skipped.length);
    result.skipped.forEach((s) => console.log("  " + s.name + " (" + s.reason + ")"));
  }

  if (result.created.length) {
    const outPath = path.join(path.dirname(path.resolve(csvPath)), "codigos-membros.csv");
    const lines = ["ordem,nome,codigo_inicial"].concat(
      result.created.map((c) => c.order + ',"' + c.name.replace(/"/g, '""') + '",' + c.code)
    );
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
    console.log("\nCódigos salvos em: " + outPath + " (distribua individualmente e apague depois)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
