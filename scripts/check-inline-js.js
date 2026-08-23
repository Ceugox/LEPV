/* Sintaxe dos <script> embutidos no HTML.

   Metade do JavaScript do site não é arquivo .js: vive dentro das páginas
   (a landing sozinha tem ~200 linhas inline). Um erro de sintaxe ali não
   aparece em `node --check`, o server sobe igual e a página só quebra no
   browser de quem abrir. Este verificador extrai cada bloco inline e roda o
   parser do Node nele.

   Uso: node scripts/check-inline-js.js [arquivo.html ...]
   Sem argumentos, varre public/*.html.
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const alvos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(path.join(ROOT, "public"))
      .filter((f) => f.endsWith(".html"))
      .map((f) => path.join("public", f));

// Só os <script> SEM src: os com src são arquivos e o node --check já cobre.
const BLOCO = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

let blocos = 0;
let ruins = 0;
for (const rel of alvos) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const html = fs.readFileSync(abs, "utf8");
  let m;
  let i = 0;
  while ((m = BLOCO.exec(html)) !== null) {
    const codigo = m[1];
    if (!codigo.trim()) continue;
    i += 1;
    blocos += 1;
    // Linha onde o bloco começa, para o erro apontar para o arquivo real.
    const linha = html.slice(0, m.index).split("\n").length;
    try {
      // new vm.Script só compila; nada é executado.
      new vm.Script(codigo, { filename: rel + " (bloco " + i + ", linha " + linha + ")" });
      console.log("  ok    " + rel + " — bloco " + i + " (linha " + linha + ")");
    } catch (e) {
      ruins += 1;
      console.log("  FALHA " + rel + " — bloco " + i + " (linha " + linha + "): " + e.message);
    }
  }
}

console.log("\n" + blocos + " bloco(s) inline verificado(s)");
if (ruins) {
  console.log(ruins + " COM ERRO DE SINTAXE");
  process.exit(1);
}
console.log("SINTAXE INLINE OK");
