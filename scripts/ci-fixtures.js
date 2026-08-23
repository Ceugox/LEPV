/* Fixtures do CI.

   As verificações visuais não medem HTML estático: elas abrem o site num
   browser. Três delas (inscricao, evento e o cartaz do hackathon na landing)
   só existem quando há evento PUBLICADO — sem fixture, passariam por fora e o
   CI diria "verde" sem ter olhado para as páginas que mais quebram.

   Este script tem dois modos:

     node scripts/ci-fixtures.js prepare <dir>
       Semeia um volume isolado (o mesmo formato que o server espera em
       RAILWAY_VOLUME_MOUNT_PATH) com a credencial do admin. Nunca aponte para
       o volume real: tudo aqui é descartável.

     node scripts/ci-fixtures.js events [base]
       Loga como admin, publica um hackathon e uma reunião e imprime as linhas
       LEPV_EVENTO_TOKEN=... e LEPV_INSCRICAO_TOKEN=... prontas para o
       $GITHUB_ENV. As datas são calculadas a partir de hoje: data fixa no
       fixture vira CI vermelho no dia em que o evento "passa".

   A senha do admin vem de LEPV_CI_ADMIN_PASS. Os demais logins do verify
   (order 2) continuam caindo na credencial do seed, como em produção.
*/
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const ROOT = path.join(__dirname, "..");
const ADMIN_ORDER = 1;
const ADMIN_PASS = process.env.LEPV_CI_ADMIN_PASS || "ci-admin";

function prepare(dir) {
  if (!dir) throw new Error("uso: ci-fixtures.js prepare <dir>");
  fs.mkdirSync(dir, { recursive: true });
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "members.json"), "utf8"));
  fs.writeFileSync(
    path.join(dir, "signups.json"),
    JSON.stringify(
      {
        nextOrder: seed.reduce((max, m) => Math.max(max, m.order), 0) + 1,
        pending: [],
        members: [],
        profiles: [],
        credentials: [{ order: ADMIN_ORDER, passwordHash: bcrypt.hashSync(ADMIN_PASS, 10) }],
      },
      null,
      2
    )
  );
  console.log("volume de CI preparado em " + dir);
}

// Data futura no fuso do Brasil — é o mesmo relógio que o server usa para
// decidir se um evento ainda aparece na home.
function emDias(dias) {
  const hoje = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  hoje.setUTCDate(hoje.getUTCDate() + dias);
  return hoje.toISOString().slice(0, 10);
}

async function events(base) {
  const B = base || "http://127.0.0.1:" + (process.env.PORT || 3000);
  let cookie = "";
  async function req(method, rota, body) {
    const r = await fetch(B + rota, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    let data = null;
    try { data = await r.json(); } catch { /* resposta sem corpo */ }
    return { status: r.status, data };
  }

  const login = await req("POST", "/api/login", { order: ADMIN_ORDER, password: ADMIN_PASS });
  if (login.status !== 200) throw new Error("login do admin falhou: " + login.status);

  const criados = [];
  criados.push(await req("POST", "/api/events", {
    type: "hackathon",
    title: "Hackathon de fixture",
    date: emDias(45),
    time: "14:00",
    location: "FGV, Praia de Botafogo",
    text: "Evento de fixture do CI: dois dias para resolver um problema real.",
    description: "Descrição completa do evento de fixture.\n\nSegundo parágrafo, para a página de detalhes ter texto de verdade.",
  }));
  criados.push(await req("POST", "/api/events", {
    type: "reuniao",
    title: "Reunião de fixture",
    date: emDias(7),
    time: "19:00",
    location: "Auditório do IME",
    text: "Evento de fixture do CI: pauta aberta.",
  }));
  for (const c of criados) {
    if (c.status !== 200) throw new Error("criação de evento falhou: " + c.status + " " + JSON.stringify(c.data));
  }

  const pub = await req("GET", "/api/public-events");
  const lista = (pub.data && pub.data.events) || [];
  const hackathon = lista.find((e) => e.type === "hackathon");
  const reuniao = lista.find((e) => e.type !== "hackathon");
  if (!hackathon || !reuniao) {
    throw new Error("os eventos não apareceram em /api/public-events: " + JSON.stringify(lista));
  }
  const token = (url) => String(url).split("t=")[1];
  console.log("LEPV_EVENTO_TOKEN=" + token(hackathon.detailsUrl));
  console.log("LEPV_INSCRICAO_TOKEN=" + token(hackathon.signupUrl));
  console.log("LEPV_REUNIAO_TOKEN=" + token(reuniao.signupUrl));
}

const [modo, arg] = process.argv.slice(2);
(async () => {
  if (modo === "prepare") return prepare(arg);
  if (modo === "events") return events(arg);
  throw new Error("modo desconhecido: " + modo + " (use prepare|events)");
})().catch((e) => {
  console.error(String((e && e.message) || e));
  process.exit(1);
});
