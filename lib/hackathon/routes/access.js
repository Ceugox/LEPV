// Acesso por link pessoal, sessão do evento, "eu" e programação pública.
const QRCode = require("qrcode");
const { route, rateLimiter, requireBody } = require("../util");
const { HackError, findByEmail, normEmail, selfView } = require("../people");
const { issueLoginToken, consumeLoginToken, linkUrl } = require("../access");
const { programView, VENUES } = require("../program");

const START_AT = "2026-10-30T15:00:00-03:00";

// Texto do e-mail com o link pessoal. Também usado pela diretoria (admin.js).
function accessEmail(person, url) {
  const first = String(person.name || "").split(" ")[0] || "Olá";
  const paragraphs = [
    `Olá, ${first}!`,
    "Este é o seu link pessoal para a plataforma do 1º Hackathon LEPV: avisos, cronograma, locais, sua equipe, a entrega do projeto e o QR de credenciamento.",
    "O link vale por 7 dias e funciona uma vez. Depois de entrar, o aparelho fica conectado. Para entrar em outro aparelho, peça um novo link em lepv.org/hack/acesso.",
    "Não encaminhe este e-mail: o link dá acesso à sua conta.",
  ];
  return {
    subject: "Seu acesso ao 1º Hackathon LEPV",
    text: paragraphs.join("\n\n") + "\n\nEntrar: " + url + "\n",
    paragraphs,
  };
}

async function sendAccessLink(ctx, req, personId) {
  const raw = ctx.store.mutate((s) => issueLoginToken(s, personId, ctx.now()));
  const person = ctx.store.get().people.find((p) => p.id === personId);
  const url = linkUrl(ctx.publicBase(req), raw);
  const msg = accessEmail(person, url);
  const result = await ctx.mail.sendEmail({
    to: person.email,
    subject: msg.subject,
    text: msg.text,
    html: ctx.mail.layout({ title: "Seu acesso ao hackathon", paragraphs: msg.paragraphs, cta: { label: "Entrar na plataforma", url } }),
  });
  ctx.store.mutate((s) => {
    const p = s.people.find((x) => x.id === personId);
    if (p) p.lastLinkEmail = { status: result.status, at: ctx.now().toISOString(), error: result.error || "" };
  });
  return { url, result };
}

module.exports = function registerAccess(app, ctx) {
  const requestByIp = rateLimiter(8, 15 * 60 * 1000);
  const requestByEmail = rateLimiter(3, 60 * 60 * 1000);
  const consumeByIp = rateLimiter(30, 15 * 60 * 1000);
  const GENERIC = "Se este e-mail estiver cadastrado no hackathon, enviamos um link de acesso. Confira a caixa de entrada e o spam.";

  // Recuperação: resposta idêntica exista ou não a pessoa.
  app.post(
    "/hack/api/access/request",
    route(async (req, res) => {
      const body = requireBody(req);
      const email = normEmail(body.email);
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) {
        throw new HackError(400, "invalid_email", "Informe um e-mail válido.");
      }
      if (requestByIp(req.ip) || requestByEmail(email)) {
        throw new HackError(429, "too_many_requests", "Muitos pedidos. Aguarde alguns minutos e tente de novo.");
      }
      ctx.sync();
      const p = findByEmail(ctx.store.get(), email);
      if (p && !p.disabled && p.roles.length) {
        // Não espera o envio para responder: o tempo de resposta também não
        // pode denunciar se o e-mail existe.
        sendAccessLink(ctx, req, p.id).catch((err) => console.error("[hack] envio de link falhou:", err.message));
      }
      res.json({ ok: true, message: GENERIC });
    })
  );

  app.post(
    "/hack/api/access/consume",
    route((req, res) => {
      if (consumeByIp(req.ip)) throw new HackError(429, "too_many_requests", "Muitas tentativas. Aguarde alguns minutos.");
      const body = requireBody(req);
      const p = ctx.store.mutate((s) => consumeLoginToken(s, body.token, ctx.now()));
      // Troca de identidade no mesmo navegador: sessão nova, sem herdar nada.
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: "internal", message: "Erro ao iniciar a sessão." });
        req.session.hack = { pid: p.id, epoch: p.sessionEpoch };
        req.session.save(() => res.json({ ok: true, redirect: "/hack/portal" }));
      });
    })
  );

  app.post(
    "/hack/api/access/logout",
    route((req, res) => {
      if (req.session) delete req.session.hack;
      res.json({ ok: true });
    })
  );

  app.get(
    "/hack/api/session",
    route((req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ authenticated: Boolean(ctx.actor(req)) });
    })
  );

  app.get(
    "/hack/api/me",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const extra = a.roles.filter((r) => !a.person.roles.includes(r));
      res.json({
        me: selfView(a.person, extra),
        perms: a.perms,
        event: {
          startsAt: START_AT,
          venues: VENUES,
          submissionDeadline: ctx.store.get().config.submissionDeadline,
        },
        now: ctx.now().toISOString(),
      });
    })
  );

  // QR do credenciamento. Conteúdo: só o token do ingresso, que não autentica
  // nada além da leitura pelo staff. Sem nome, e-mail, telefone ou CPF.
  app.get(
    "/hack/api/me/qr.svg",
    route(async (req, res) => {
      const a = ctx.requireActor(req);
      const svg = await QRCode.toString("LEPVHACK1:" + a.person.qrToken, {
        type: "svg",
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#0b0b0dff", light: "#ffffffff" },
      });
      res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" });
      res.send(svg);
    })
  );

  app.get(
    "/hack/api/program",
    route((req, res) => {
      res.json({ program: programView(ctx.store.get()), venues: VENUES });
    })
  );
};

module.exports.sendAccessLink = sendAccessLink;
module.exports.accessEmail = accessEmail;
