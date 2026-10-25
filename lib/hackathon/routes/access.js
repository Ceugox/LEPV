// Acesso por link pessoal, sessão do evento, "eu" e programação pública.
const QRCode = require("qrcode");
const { route, rateLimiter, requireBody } = require("../util");
const { HackError, findByEmail, normEmail, validEmail, selfView, canAccess } = require("../people");
const { LINK_TTL_MS, issueLoginToken, consumeLoginToken, unconsumeLoginToken, revokeOtherTokens, linkUrl } = require("../access");
const { sha256 } = require("../store");
const { programView, venuesOf } = require("../program");

const START_AT = "2026-10-30T14:30:00-03:00";

// Texto do e-mail com o link pessoal. Também usado pela diretoria (admin.js).
function accessEmail(person, url) {
  const first = String(person.name || "").split(" ")[0] || "Olá";
  const paragraphs = [
    `Olá, ${first}!`,
    "Este é o seu link pessoal para a plataforma do 1º Hackathon LEPV: avisos, cronograma, locais, sua equipe, a entrega do projeto e o QR de credenciamento.",
    "O link vale por " + Math.round(LINK_TTL_MS / 864e5) + " dias e funciona uma vez. Depois de entrar, o aparelho fica conectado. Para entrar em outro aparelho, peça um novo link em lepv.org/hack/acesso.",
    "Não encaminhe este e-mail: o link dá acesso à sua conta.",
  ];
  return {
    subject: "Seu acesso ao 1º Hackathon LEPV",
    text: paragraphs.join("\n\n") + "\n\nEntrar: " + url + "\n",
    paragraphs,
  };
}

// Gera link novo e manda por e-mail. Os links antigos só são revogados
// depois que o provedor aceita o novo; falha fica registrada na pessoa (o
// painel mostra) e no log.
async function sendAccessLink(ctx, base, personId) {
  const raw = ctx.store.mutate((s) => issueLoginToken(s, personId, ctx.now(), { revokeOthers: false }));
  const person = ctx.store.get().people.find((p) => p.id === personId);
  const url = linkUrl(base, raw);
  const msg = accessEmail(person, url);
  let result;
  try {
    result = await ctx.mail.sendEmail({
      to: person.email,
      subject: msg.subject,
      text: msg.text,
      html: ctx.mail.layout({ title: "Seu acesso ao hackathon", paragraphs: msg.paragraphs, cta: { label: "Entrar na plataforma", url } }),
    });
  } catch (err) {
    result = { status: "failed", error: err.message };
  }
  const delivered = result.status === "sent" || result.status === "outbox";
  if (!delivered) console.warn("[hack] link de acesso não enviado para " + personId + ": " + result.status + (result.error ? " — " + result.error : ""));
  ctx.store.mutate((s) => {
    const p = s.people.find((x) => x.id === personId);
    if (p) p.lastLinkEmail = { status: result.status, at: ctx.now().toISOString(), error: String(result.error || "").slice(0, 200) };
    if (delivered) revokeOtherTokens(s, personId, sha256(raw), ctx.now());
  });
  return { url, result };
}

module.exports = function registerAccess(app, ctx) {
  // No evento todo mundo sai pelo mesmo IP (rede da FGV / do I12): o teto por
  // IP é folgado e quem segura abuso é o limite por e-mail.
  const requestByIp = rateLimiter(Number(process.env.HACK_LINK_IP_MAX) || 120, 15 * 60 * 1000);
  const requestByEmail = rateLimiter(3, 60 * 60 * 1000);
  const consumeByIp = rateLimiter(Number(process.env.HACK_LINK_IP_MAX) || 120, 15 * 60 * 1000);
  const GENERIC = "Se este e-mail estiver cadastrado no hackathon, enviamos um link de acesso. Confira a caixa de entrada e o spam.";

  // Recuperação: resposta idêntica e imediata, exista ou não a pessoa. Toda a
  // busca e a gravação do token acontecem DEPOIS da resposta, para o tempo
  // de resposta também não denunciar e-mails cadastrados.
  app.post(
    "/hack/api/access/request",
    route((req, res) => {
      const body = requireBody(req);
      const email = normEmail(body.email);
      if (!validEmail(email)) {
        throw new HackError(400, "invalid_email", "Informe um e-mail válido.");
      }
      if (requestByIp(req.ip) || requestByEmail(email)) {
        throw new HackError(429, "too_many_requests", "Muitos pedidos. Aguarde alguns minutos e tente de novo.");
      }
      const base = ctx.publicBase(req);
      res.json({ ok: true, message: GENERIC });
      setImmediate(() => {
        try {
          ctx.sync();
          const p = findByEmail(ctx.store.get(), email);
          if (canAccess(p)) {
            sendAccessLink(ctx, base, p.id).catch((err) => console.error("[hack] envio de link falhou:", err.message));
          }
        } catch (err) {
          console.error("[hack] pedido de link falhou:", err.message);
        }
      });
    })
  );

  app.post(
    "/hack/api/access/consume",
    route((req, res) => {
      if (consumeByIp(req.ip)) throw new HackError(429, "too_many_requests", "Muitas tentativas. Aguarde alguns minutos.");
      const body = requireBody(req);
      const p = ctx.store.mutate((s) => consumeLoginToken(s, body.token, ctx.now()));
      const fail = (err) => {
        console.error("[hack] sessão não gravada após consumir link:", err && err.message);
        ctx.store.mutate((s) => unconsumeLoginToken(s, body.token));
        res.status(500).json({ error: "session_failed", message: "Não foi possível iniciar a sessão. Tente o mesmo link de novo." });
      };
      // Troca de identidade no mesmo navegador: sessão nova, sem herdar nada.
      // Exceção dentro do callback não tem quem a pegue: derrubaria o processo.
      req.session.regenerate((err) => {
        try {
          if (err) return fail(err);
          req.session.hack = { pid: p.id, epoch: p.sessionEpoch };
          req.session.save((err2) => {
            try {
              if (err2) return fail(err2);
              res.json({ ok: true, redirect: "/hack/portal" });
            } catch (e) {
              fail(e);
            }
          });
        } catch (e) {
          fail(e);
        }
      });
    })
  );

  // Sair encerra a sessão inteira deste navegador (inclusive o login da
  // liga): num aparelho compartilhado, "Sair" não pode deixar ninguém dentro.
  app.post(
    "/hack/api/access/logout",
    route((req, res) => {
      // O aparelho diz qual inscrição de push é dele: ela sai no servidor
      // mesmo que a limpeza no navegador falhe.
      const endpoint = String((req.body && req.body.endpoint) || "");
      const a = ctx.actor(req);
      if (a && endpoint) {
        ctx.store.mutate((s) => {
          s.pushSubs = s.pushSubs.filter((x) => !(x.endpoint === endpoint && x.personId === a.person.id));
        });
      }
      if (!req.session) return res.json({ ok: true });
      req.session.destroy((err) => {
        try {
          if (err) return res.status(500).json({ error: "logout_failed", message: "Não foi possível sair agora. Tente de novo." });
          res.clearCookie("connect.sid");
          res.json({ ok: true });
        } catch (e) {
          console.error("[hack] logout:", e.message);
        }
      });
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
          venues: venuesOf(ctx.store.get()),
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
      res.json({ program: programView(ctx.store.get()), venues: venuesOf(ctx.store.get()) });
    })
  );
};

module.exports.sendAccessLink = sendAccessLink;
module.exports.accessEmail = accessEmail;
