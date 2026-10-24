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
const { createPush } = require("./push");
const { createDelivery } = require("./delivery");
const announcements = require("./announcements");

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
  // Nunca lança: events.json ilegível não pode derrubar pedido de link,
  // painel ou agendador — eles seguem com as pessoas já sincronizadas.
  function sync() {
    try {
      const ev = hackathonEvent();
      if (!ev) return;
      const probe = JSON.parse(JSON.stringify(store.get().people));
      if (syncParticipants({ people: probe }, ev)) store.mutate((s) => syncParticipants(s, ev));
    } catch (err) {
      console.error("[hack] sincronização das inscrições falhou:", err.message);
    }
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
  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  // Sem a variável, em produção (Railway) vale o domínio oficial: o cabeçalho
  // Host vem do cliente e não pode decidir para onde aponta um link de acesso.
  function publicBase(req) {
    if (process.env.HACK_PUBLIC_URL) return process.env.HACK_PUBLIC_URL;
    if (onRailway) return "https://lepv.org";
    return req.protocol + "://" + req.get("host");
  }
  if (process.env.HACK_EMAIL_OUTBOX && onRailway) {
    console.warn("[hack] ATENÇÃO: HACK_EMAIL_OUTBOX ligado em produção — e-mails vão para arquivo, não para as pessoas.");
  }

  const push = createPush();
  const ctx = { store, now, deps, hackathonEvent, sync, actor, requireActor, publicBase, mail, push };
  const delivery = createDelivery(ctx, push);
  // Depois de publicar, não espera a próxima volta do agendador.
  ctx.kickDelivery = () => {
    setImmediate(() => delivery.runOnce().catch((err) => console.error("[hack] entrega falhou:", err.message)));
  };

  // Os dois avisos aprovados entram uma vez só (a flag sobrevive a cancelamentos).
  if (!store.get().config.announcementsSeeded) {
    store.mutate((s) => {
      announcements.seedAnnouncements(s);
      s.config.announcementsSeeded = true;
    });
  }

  // API privada por sessão: nada de cache em navegador, proxy ou CDN.
  app.use("/hack/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  require("./routes/access")(app, ctx);
  require("./routes/admin")(app, ctx);
  require("./routes/announcements")(app, ctx);

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

  sync();
  const timer = setInterval(sync, 60 * 1000);
  timer.unref();

  // Agendador de avisos: confere a cada 15s e no boot (o que venceu com o
  // servidor fora do ar vira "overdue", nunca sai atrasado sozinho).
  function schedule() {
    try {
      const due = store.get().announcements.some((a) => a.status === "scheduled" && Date.parse(a.scheduledAt) <= now().getTime());
      if (due) {
        sync();
        const published = store.mutate((s) => announcements.tick(s, now()));
        published.forEach((a) => console.log("[hack] aviso publicado: " + a.title));
      }
    } catch (err) {
      console.error("[hack] agendador falhou:", err.message);
    }
    delivery.runOnce().catch((err) => console.error("[hack] entrega falhou:", err.message));
  }
  schedule();
  const scheduler = setInterval(schedule, 15 * 1000);
  scheduler.unref();

  return { hackathonEvent, store };
}

module.exports = { registerHackathonRoutes };
