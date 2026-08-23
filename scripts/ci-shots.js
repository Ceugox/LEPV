/* Screenshots de diagnóstico para quando o CI fica vermelho.

   As verificações visuais falham com uma linha de texto ("contraste 3.9 em
   .idx .st"), e quem lê o log no GitHub não tem o site na frente para
   entender. Este script tira uma foto de cada superfície e guarda o console
   de cada página, para virar artefato do run.

   Não verifica nada e nunca falha o build de propósito: é ferramenta de
   autópsia, não de julgamento — se ele mesmo quebrar, o motivo real da falha
   continua no log de quem falhou antes.

   Uso: node scripts/ci-shots.js [dir-de-saida]
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = process.argv[2] || "ci-artifacts";
const BASE = process.env.LEPV_BASE || "http://127.0.0.1:" + (process.env.PORT || 3000);
const ORDER = process.env.LEPV_TEST_ORDER || "2";
const PASS = process.env.LEPV_TEST_PASS || "2";
const EVENTO = process.env.LEPV_EVENTO_TOKEN || "";
const INSCRICAO = process.env.LEPV_INSCRICAO_TOKEN || "";

const paginas = [
  ["/", "landing"],
  ["/login.html", "login"],
  ["/presenca.html", "presenca"],
];
if (INSCRICAO) paginas.push(["/inscricao.html?t=" + INSCRICAO, "inscricao"]);
if (EVENTO) paginas.push(["/evento.html?t=" + EVENTO, "evento"]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const consoles = {};

  async function tirar(ctx, rota, nome, sufixo) {
    const page = await ctx.newPage();
    const linhas = [];
    page.on("console", (m) => linhas.push("[" + m.type() + "] " + m.text()));
    page.on("pageerror", (e) => linhas.push("[pageerror] " + e.message));
    try {
      await page.goto(BASE + rota, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1800);
      // O modal de PIN do app intercepta a foto do que está atrás dele.
      await page.evaluate(() => { const m = document.querySelector(".pin-backdrop"); if (m) m.remove(); });
      await page.screenshot({ path: path.join(OUT, nome + "-" + sufixo + ".png"), fullPage: true });
    } catch (e) {
      linhas.push("[falha ao capturar] " + String((e && e.message) || e));
    }
    consoles[nome + "-" + sufixo] = linhas;
    await page.close();
  }

  for (const [largura, sufixo] of [[1280, "desktop"], [390, "mobile"]]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    for (const [rota, nome] of paginas) await tirar(ctx, rota, nome, sufixo);

    // O app exige sessão: sem login não há o que fotografar.
    const login = await ctx.newPage();
    await login.goto(BASE + "/login.html", { waitUntil: "load" }).catch(() => {});
    const status = await login.evaluate(async ({ o, p }) => {
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: Number(o), password: p }),
      });
      return r.status;
    }, { o: ORDER, p: PASS }).catch(() => 0);
    await login.close();
    if (status === 200) await tirar(ctx, "/app.html", "app", sufixo);
    else consoles["app-" + sufixo] = ["login devolveu " + status + "; app não capturado"];
    await ctx.close();
  }

  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify(consoles, null, 2));
  await browser.close();
  console.log("artefatos em " + OUT + ": " + fs.readdirSync(OUT).join(", "));
})().catch((e) => {
  // Nunca derruba o job: quem falhou de verdade foi outro passo.
  console.error("ci-shots falhou: " + String((e && e.message) || e));
});
