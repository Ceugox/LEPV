// Gera o PDF de primeiro acesso a partir do CSV de códigos que o import
// devolve. O template mora aqui (sem nenhum dado de ninguém); os códigos vêm
// do CSV informado na linha de comando e o PDF sai fora do repo.
//
//   node scripts/gerar-pdf-codigos.js <codigos.csv> <saida.pdf> [membros.csv]
//
// O terceiro argumento é opcional: o CSV da planilha (Nome,Cargo,Turma,...)
// usado só para mostrar cargo e turma na tabela.
//
// A conversão usa o Edge em modo headless — o `--virtual-time-budget` é
// obrigatório, senão as fontes do Google não chegam a carregar e o PDF sai
// com a fonte de fallback.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const SITE = "lepv.org";

const [, , csvCodigos, saidaPdf, csvMembros] = process.argv;
if (!csvCodigos || !saidaPdf) {
  console.error("uso: node scripts/gerar-pdf-codigos.js <codigos.csv> <saida.pdf> [membros.csv]");
  process.exit(1);
}

// CSV pequeno e de formato conhecido: campos entre aspas podem conter vírgula.
function parseCsv(texto) {
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((linha) => {
      const campos = [];
      let atual = "";
      let dentroDeAspas = false;
      for (const ch of linha) {
        if (ch === '"') dentroDeAspas = !dentroDeAspas;
        else if (ch === "," && !dentroDeAspas) { campos.push(atual); atual = ""; }
        else atual += ch;
      }
      campos.push(atual);
      return campos.map((c) => c.trim());
    });
}

const linhasCodigos = parseCsv(fs.readFileSync(csvCodigos, "utf8")).slice(1);
const porNome = new Map();
if (csvMembros && fs.existsSync(csvMembros)) {
  for (const [nome, cargo, turma] of parseCsv(fs.readFileSync(csvMembros, "utf8")).slice(1)) {
    porNome.set(nome.toLowerCase(), { cargo, turma });
  }
}

const membros = linhasCodigos.map(([ordem, nome, codigo]) => {
  const extra = porNome.get(String(nome).toLowerCase()) || {};
  return { ordem, nome, codigo, cargo: extra.cargo || "", turma: extra.turma || "" };
});

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const logoBase64 = fs.readFileSync(path.join(__dirname, "..", "public", "logo-liga.png")).toString("base64");

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>LEPV — Primeiro acesso</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Archivo", sans-serif; color: #37343A; background: #F7F5F2; }
  .folha { width: 210mm; min-height: 297mm; padding: 18mm 16mm; }
  header { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #E6E2DE; }
  header img { width: 42px; height: 42px; border-radius: 50%; border: 1px solid #E6E2DE; background: #fff; object-fit: cover; }
  header .marca { font-family: "Barlow Condensed", sans-serif; font-weight: 800; font-size: 21px; text-transform: uppercase; letter-spacing: 0.03em; color: #17171B; }
  header .sub { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B6570; }
  .band { background: #17171B; color: #fff; padding: 22px 20px; margin: 20px 0 22px; border-radius: 12px; }
  .band .tag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: #A93245; margin: 0 0 8px; }
  .band h1 { font-family: "Barlow Condensed", sans-serif; font-size: 34px; font-weight: 800; text-transform: uppercase; margin: 0 0 8px; line-height: 1; }
  .band p { font-size: 12.5px; line-height: 1.6; margin: 0; color: rgba(255,255,255,0.78); }
  .band .site { color: #fff; font-weight: 700; }
  .passos { display: flex; gap: 12px; margin-bottom: 22px; }
  .passo { flex: 1; background: #fff; border: 1px solid #E6E2DE; border-radius: 10px; padding: 14px; }
  .passo .n { font-family: "Barlow Condensed", sans-serif; font-weight: 800; font-size: 13px; color: #8A1E2D; letter-spacing: 0.06em; }
  .passo h3 { font-family: "Barlow Condensed", sans-serif; font-size: 15px; font-weight: 800; text-transform: uppercase; color: #17171B; margin: 5px 0 5px; }
  .passo p { font-size: 11px; line-height: 1.5; color: #6B6570; margin: 0; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #E6E2DE; border-radius: 10px; overflow: hidden; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B6570; padding: 10px 12px; border-bottom: 1px solid #E6E2DE; font-weight: 700; }
  td { padding: 11px 12px; border-bottom: 1px solid #F0EDEA; font-size: 12.5px; }
  tr:last-child td { border-bottom: none; }
  .num { font-variant-numeric: tabular-nums; color: #6B6570; width: 34px; }
  .nome { font-weight: 600; color: #17171B; }
  .chip { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 8px; border-radius: 3px; background: #F0EDEA; color: #6B6570; }
  .chip.dir { background: rgba(138,30,45,0.10); color: #8A1E2D; }
  .codigo { font-family: "Barlow Condensed", sans-serif; font-size: 19px; font-weight: 800; letter-spacing: 0.14em; color: #17171B; text-align: right; }
  footer { margin-top: 20px; font-size: 10.5px; color: #6B6570; line-height: 1.6; }
  footer strong { color: #17171B; }
</style></head>
<body><div class="folha">
  <header>
    <img src="data:image/png;base64,${logoBase64}" alt="LEPV">
    <div>
      <div class="marca">LEPV</div>
      <div class="sub">Liga de Empreendedorismo da Praia Vermelha</div>
    </div>
  </header>

  <div class="band">
    <p class="tag">Novidade</p>
    <h1>O site da liga é seu</h1>
    <p>Agenda de eventos, inscrição nas atividades, materiais das aulas e presença nas reuniões — tudo em <span class="site">${SITE}</span>. Abaixo está o código do seu primeiro acesso.</p>
  </div>

  <div class="passos">
    <div class="passo"><div class="n">/01</div><h3>Abra o site</h3><p>Entre em <strong>${SITE}</strong> pelo celular e toque em Entrar.</p></div>
    <div class="passo"><div class="n">/02</div><h3>Ache seu nome</h3><p>Selecione seu nome na lista e digite o código da tabela ao lado.</p></div>
    <div class="passo"><div class="n">/03</div><h3>Crie sua senha</h3><p>No primeiro acesso você escolhe uma senha própria e informa seu WhatsApp.</p></div>
  </div>

  <table>
    <tr><th class="num">Nº</th><th>Nome</th><th>Cargo</th><th style="text-align:right;">Código</th></tr>
    ${membros
      .map((m) => {
        const ehDiretor = m.cargo && m.cargo.toLowerCase() !== "membro";
        const cargoHtml = m.cargo
          ? `<span class="chip${ehDiretor ? " dir" : ""}">${esc(m.cargo)}</span>` + (m.turma ? ` <span style="color:#6B6570; font-size:11px;">${esc(m.turma)}</span>` : "")
          : "";
        return `<tr><td class="num">${esc(m.ordem)}</td><td class="nome">${esc(m.nome)}</td><td>${cargoHtml}</td><td class="codigo">${esc(m.codigo)}</td></tr>`;
      })
      .join("\n    ")}
  </table>

  <footer>
    O código vale <strong>uma vez</strong>: assim que você criar sua senha, ele deixa de funcionar.<br>
    Perdeu o acesso? Fale com o Marcell — ele gera um código novo pelo painel da diretoria.
  </footer>
</div></body></html>`;

// Saída .html: útil para conferir o layout no navegador antes de imprimir —
// o Edge headless gera o PDF mas não sabe rasterizar o resultado de volta.
if (saidaPdf.toLowerCase().endsWith(".html")) {
  fs.writeFileSync(path.resolve(saidaPdf), html, "utf8");
  console.log("HTML gerado: " + path.resolve(saidaPdf) + " (" + membros.length + " membros)");
  process.exit(0);
}

const htmlTmp = path.join(os.tmpdir(), "lepv-codigos-" + process.pid + ".html");
fs.writeFileSync(htmlTmp, html, "utf8");

const edge = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => fs.existsSync(p));
if (!edge) {
  console.error("Edge não encontrado — abra " + htmlTmp + " e imprima em PDF manualmente.");
  process.exit(1);
}

execFileSync(edge, [
  "--headless",
  "--disable-gpu",
  "--no-pdf-header-footer",
  "--virtual-time-budget=15000",
  "--print-to-pdf=" + path.resolve(saidaPdf),
  "file:///" + htmlTmp.replace(/\\/g, "/"),
], { stdio: "ignore" });

fs.rmSync(htmlTmp, { force: true });
console.log("PDF gerado: " + path.resolve(saidaPdf) + " (" + membros.length + " membros, link " + SITE + ")");
