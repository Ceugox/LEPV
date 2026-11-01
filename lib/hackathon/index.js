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
const { seedProgram, fridayOutdated } = require("./program");
const { migrateSchedule } = require("./migrations");
const { pickHackathonEvent, signupRedirect } = require("./event");
const mail = require("./mail");
const { publicBaseFor, isRailway } = require("./util");
const { createPush } = require("./push");
const { createDelivery } = require("./delivery");
const announcements = require("./announcements");
const teams = require("./teams");
const util = require("./util");

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
    migrate: (s) => migrateSchedule(s, { now: process.env.HACK_NOW ? new Date(process.env.HACK_NOW) : new Date() }),
  });

  // Falha de job de fundo (e 500 de rota) vai para o mesmo registro do resto
  // do site (failures.json, contado em /health como failures/lastFailureAt).
  const report = (scope, err) => {
    console.error("[" + scope + "]", err && err.stack ? err.stack : err);
    if (deps.recordFailure) deps.recordFailure(scope, err);
  };
  util.setReporter(report);

  // Sexta ainda nos horários antigos (a migração recuou porque a diretoria
  // editou): fica no /health a cada boot até alguém ajustar pelo painel.
  if (fridayOutdated(store.get())) {
    report("hack:programacao", new Error("Programação da sexta ainda em 15h–22h; o site mostra 14h30–21h. Ajuste na aba Programação."));
  }

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
      if (syncParticipants({ people: probe }, ev)) {
        // Quem saiu da inscrição (ou foi para a fila) sai também da equipe.
        store.mutate((s) => {
          syncParticipants(s, ev);
          teams.prune(s, now());
        });
      }
      if (ctx.cleanOrphanFiles) ctx.cleanOrphanFiles();
    } catch (err) {
      report("hack:sync", err);
    }
  }

  // Limpeza também no boot: indicação de quem foi desligado antes deste
  // deploy não espera o próximo sync que mude alguém.
  try {
    const probe = JSON.parse(JSON.stringify(store.get()));
    if (teams.prune(probe, now())) store.mutate((s) => teams.prune(s, now()));
  } catch (err) {
    report("hack:prune-boot", err);
  }

  // Ator da requisição, já com papéis e permissões. A pessoa da diretoria é
  // materializada na primeira vez que alguém dela usa a plataforma.
  function actor(req) {
    let a = resolveActor(req, store.get(), deps);
    if (a && a.pending) {
      const pending = a;
      a = store.mutate((s) => ensureActorPerson(s, pending));
    }
    if (!a) return null;
    touchSeen(a.person);
    return Object.assign(a, { perms: perms(a) });
  }

  // Último acesso: um horário por pessoa, sem histórico. Grava no máximo a
  // cada 5 min por pessoa para não escrever o arquivo a cada requisição.
  const SEEN_EVERY_MS = 5 * 60 * 1000;
  function touchSeen(person) {
    if (!person) return;
    const t = now().getTime();
    if (person.lastSeenAt && t - Date.parse(person.lastSeenAt) < SEEN_EVERY_MS) return;
    try {
      store.mutate((s) => {
        const p = s.people.find((x) => x.id === person.id);
        if (p) p.lastSeenAt = new Date(t).toISOString();
      });
    } catch (err) {
      report("hack:last-seen", err);
    }
  }

  function requireActor(req, check) {
    const a = actor(req);
    if (!a) throw new HackError(401, "unauthenticated", "Entre pelo seu link de acesso.");
    if (check && !check(a.perms, a)) throw new HackError(403, "forbidden", "Você não tem permissão para isso.");
    return a;
  }

  // Base pública dos links enviados por e-mail. Em produção, HACK_PUBLIC_URL
  // (https://lepv.org); sem ela, o host da própria requisição.
  const onRailway = isRailway(process.env);
  // Sem a variável, em produção (Railway) vale o domínio oficial: o cabeçalho
  // Host vem do cliente e não pode decidir para onde aponta um link de acesso.
  function publicBase(req) {
    return publicBaseFor(process.env, req);
  }
  if (process.env.HACK_EMAIL_OUTBOX && onRailway) {
    console.warn("[hack] ATENÇÃO: HACK_EMAIL_OUTBOX ligado em produção — e-mails vão para arquivo, não para as pessoas.");
  }

  const push = createPush();
  // Base dos links fora de uma requisição (e-mail de aviso, enviado pelo job).
  const baseUrl = () => publicBaseFor(process.env, null);
  const ctx = { store, now, deps, hackathonEvent, sync, actor, requireActor, publicBase, baseUrl, mail, push, report };
  const delivery = createDelivery(ctx, push);
  // Depois de publicar, não espera a próxima volta do agendador.
  ctx.kickDelivery = () => {
    setImmediate(() => delivery.runOnce().catch((err) => report("hack:delivery", err)));
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
  require("./routes/teams")(app, ctx);
  require("./routes/evaluation")(app, ctx);
  require("./routes/live-evaluation")(app, ctx);
  require("./routes/judge-summary")(app, ctx);
  require("./routes/partners")(app, ctx);
  require("./routes/checkin")(app, ctx);
  require("./routes/questions")(app, ctx);
  require("./routes/overview")(app, ctx);
  require("./routes/reports")(app, ctx);
  require("./routes/ai-credit")(app, ctx);
  require("./routes/team-mail")(app, ctx);
  require("./routes/recording")(app, ctx);
  require("./routes/vote")(app, ctx);

  // Erros de parser (PDF acima do limite, JSON malformado) também saem em
  // JSON na API do hackathon, não na página de erro padrão do Express.
  // eslint-disable-next-line no-unused-vars
  app.use("/hack/api", (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error("[hack] erro:", err.message);
    const message = status === 413 ? "Arquivo grande demais (máximo 20 MB)." : status === 400 ? "Requisição inválida." : "Erro interno. Tente de novo.";
    res.status(status).json({ error: status === 413 ? "too_big" : "request_error", message });
  });

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
  app.get("/hack/avaliacao", page("avaliacao.html"));
  app.get("/hack/organizacao", page("organizacao.html"));
  app.get("/hack/credenciamento", page("credenciamento.html"));
  app.get("/hack/parceiros", page("parceiros.html"));

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

  // Agendador de avisos: confere a cada 15s e no boot. Vencido há até
  // GRACE_MS (5 min) ainda sai; mais atrasado que isso (servidor fora do ar no
  // horário) vira "overdue" e espera a organização decidir.
  function schedule() {
    try {
      const due = store.get().announcements.some((a) => a.status === "scheduled" && Date.parse(a.scheduledAt) <= now().getTime());
      if (due) {
        sync();
        const published = store.mutate((s) => announcements.tick(s, now()));
        published.forEach((a) => console.log("[hack] aviso publicado: " + a.title));
      }
    } catch (err) {
      report("hack:scheduler", err);
    }
    delivery.runOnce().catch((err) => report("hack:delivery", err));
  }
  schedule();
  const scheduler = setInterval(schedule, 15 * 1000);
  scheduler.unref();

  return { hackathonEvent, store };
}

module.exports = { registerHackathonRoutes };
