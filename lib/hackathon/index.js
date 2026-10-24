// Plataforma do 1º Hackathon LEPV, servida sob /hack.
//
// Composição: o server.js chama registerHackathonRoutes(app, deps) ANTES do
// express.static, para que as rotas limpas (/hack/acesso, /hack/portal...)
// vençam os arquivos e nenhuma página privada dependa só do HTML estático.
// Toda autorização acontece na API; o HTML é casca sem dado.
//
// Cada domínio registra suas rotas em lib/hackathon/routes/*.js recebendo o
// mesmo contexto (ctx): store, relógio, ator da requisição e adaptadores.
const fs = require("fs");
const path = require("path");
const { createStore } = require("./store");
const { syncParticipants, HackError } = require("./people");
const { resolveActor, ensureActorPerson, perms } = require("./access");
const { seedProgram } = require("./program");
const { pickHackathonEvent, signupRedirect } = require("./event");
const mail = require("./mail");

function registerHackathonRoutes(app, deps) {
  const { publicDir, readEventsStore } = deps;
  const hackDir = path.join(publicDir, "hack");
  const page = (file) => (req, res) => res.sendFile(path.join(hackDir, file));

  // O evento do hackathon: HACK_EVENT_ID fixa um específico; sem ele, o
  // próximo (data mais cedo a partir de hoje) e, se todos passaram, o último.
  // "Mais recente" sozinho pegaria uma edição futura cadastrada com antecedência.
  function hackathonEvent() {
    return pickHackathonEvent(readEventsStore().events, deps.todayBR(), process.env.HACK_EVENT_ID);
  }

  const store = createStore({
    filePath: path.join(deps.storageDir, "hackathon.json"),
    readStore: deps.readStore,
    writeStore: deps.writeStore,
    fs,
    seed: seedProgram,
  });

  // HACK_NOW fixa o relógio (só para teste e ensaio: nunca em produção).
  const now = () => (process.env.HACK_NOW ? new Date(process.env.HACK_NOW) : new Date());

  // Inscrições → pessoas. Barato (lista de algumas centenas), roda no boot, a
  // cada minuto e antes de pedidos de acesso; só grava se algo mudou.
  function sync() {
    const ev = hackathonEvent();
    if (!ev) return;
    const probe = JSON.parse(JSON.stringify(store.get().people));
    if (syncParticipants({ people: probe }, ev)) store.mutate((s) => syncParticipants(s, ev));
  }

  // Ator da requisição, já com papéis e permissões. A pessoa da diretoria é
  // materializada na primeira vez que alguém dela usa a plataforma.
  function actor(req) {
    let a = resolveActor(req, store.get(), deps);
    if (a && a.pending) a = store.mutate((s) => ensureActorPerson(s, a));
    if (!a) return null;
    return Object.assign(a, { perms: perms(a) });
  }

  function requireActor(req, check) {
    const a = actor(req);
    if (!a) throw new HackError(401, "unauthenticated", "Entre pelo seu link de acesso.");
    if (check && !check(a.perms, a)) throw new HackError(403, "forbidden", "Você não tem permissão para isso.");
    return a;
  }

  // Base pública dos links enviados por e-mail. Em produção, HACK_PUBLIC_URL
  // (https://lepv.org); sem ela, o host da própria requisição.
  function publicBase(req) {
    return process.env.HACK_PUBLIC_URL || req.protocol + "://" + req.get("host");
  }

  const ctx = { store, now, deps, hackathonEvent, sync, actor, requireActor, publicBase, mail };

  // API privada por sessão: nada de cache em navegador, proxy ou CDN.
  app.use("/hack/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  require("./routes/access")(app, ctx);
  require("./routes/admin")(app, ctx);

  // Sem barra, o escopo do service worker (/hack/) não cobre a página. O
  // roteador do Express não é estrito: "/hack" e "/hack/" caem na mesma rota,
  // então a distinção é pela URL original.
  app.get("/hack", (req, res) => {
    const q = req.originalUrl.indexOf("?");
    const pathname = q === -1 ? req.originalUrl : req.originalUrl.slice(0, q);
    if (pathname === "/hack") return res.redirect(301, "/hack/" + (q === -1 ? "" : req.originalUrl.slice(q)));
    res.sendFile(path.join(hackDir, "index.html"));
  });

  app.get("/hack/acesso", page("acesso.html"));
  app.get("/hack/portal", page("portal.html"));
  app.get("/hack/organizacao", page("organizacao.html"));
  // Páginas dos próximos módulos: até lá, uma casca "em breve" em vez de 404.
  app.get("/hack/parceiros", page("em-breve.html"));

  // A inscrição continua sendo a do evento (inscricao.html?t=...); a LP só
  // aponta para ela, e sabe dizer quando as inscrições fecharam.
  app.get("/hack/inscricao", (req, res) => {
    const r = signupRedirect(hackathonEvent());
    // "Encerradas" por configuração errada (sem evento, HACK_EVENT_ID velho,
    // sem token) não pode parecer igual a inscrições fechadas de verdade.
    if (r.reason !== "open" && r.reason !== "closed") console.warn("[hack] /hack/inscricao sem formulário: " + r.reason);
    res.redirect(302, r.location);
  });

  try {
    sync();
  } catch (err) {
    console.error("[hack] sync inicial falhou:", err.message);
  }
  const timer = setInterval(() => {
    try {
      sync();
    } catch (err) {
      console.error("[hack] sync falhou:", err.message);
    }
  }, 60 * 1000);
  timer.unref();

  return { hackathonEvent, store };
}

module.exports = { registerHackathonRoutes };
