// Acesso (link pessoal ou e-mail + senha), sessão do evento, "eu" e
// programação pública.
const QRCode = require("qrcode");
const { route, rateLimiter, requireBody } = require("../util");
const { HackError, findByEmail, normEmail, validEmail, selfView, canAccess } = require("../people");
const { LINK_TTL_MS, SELF_LINK_TTL_MS, issueLoginToken, consumeLoginToken, unconsumeLoginToken, revokeOtherTokens, linkUrl } = require("../access");
const { authenticate, checkPassword, hashPassword, applyPassword } = require("../password");
const { sha256 } = require("../store");
const { programView, venuesOf } = require("../program");

const START_AT = "2026-10-30T14:30:00-03:00";

// Depois de entrar pelo link, a pessoa cria ou troca a senha sem digitar a
// atual durante esta janela: o link já provou a posse do e-mail.
const FRESH_LINK_MS = 30 * 60 * 1000;

function validityText(ttlMs) {
  const hours = Math.round(ttlMs / 36e5);
  return hours < 48 ? hours + " horas" : Math.round(hours / 24) + " dias";
}

// Data e local do evento para o e-mail, um dia por linha. Endereço "a
// confirmar" fica de fora.
function eventFacts(state) {
  const v = venuesOf(state);
  const place = (day, extra) => {
    const x = v[day] || {};
    const addr = x.address && !/confirmar/i.test(x.address) ? " · " + x.address : "";
    return (x.name || "Local a confirmar") + addr + extra;
  };
  return [
    ["Sexta, 30/10", place("2026-10-30", " · a partir das 14h30")],
    ["Sábado, 31/10", place("2026-10-31", "")],
  ];
}

// Texto do e-mail com o link pessoal. Também usado pela diretoria (admin.js).
// opts: { ttlMs, state } — validade do link e estado (locais do evento).
function accessEmail(person, url, opts) {
  const ttlMs = (opts && opts.ttlMs) || LINK_TTL_MS;
  const first = String(person.name || "").trim().split(" ")[0];
  const paragraphs = [
    first ? `Olá, ${first}!` : "Olá!",
    "Este é o seu acesso à plataforma do 1º Hackathon LEPV: avisos da organização, programação, locais, sua equipe, entrega do projeto e o QR de entrada.",
  ];
  const after = [
    person.passwordHash
      ? "Esqueceu a senha? Entre por este link e troque-a em Início → Você."
      : "Ao entrar, você pode criar uma senha. Com ela, entra em qualquer aparelho com e-mail e senha em lepv.org/hack/acesso, sem esperar outro link.",
    "O link vale por " + validityText(ttlMs) + " e funciona uma vez. Se ele vencer, peça outro em lepv.org/hack/acesso.",
  ];
  const note = "Este link entra na sua conta: não encaminhe este e-mail. Se não foi você quem pediu, pode ignorar.";
  const facts = eventFacts((opts && opts.state) || { config: {} });
  return {
    subject: (first ? first + ", seu" : "Seu") + " acesso ao 1º Hackathon LEPV",
    text:
      paragraphs.join("\n\n") +
      "\n\nEntrar: " + url + "\n\n" +
      after.join("\n\n") +
      "\n\n" + facts.map(([k, v]) => k + ": " + v).join("\n") +
      "\n\n" + note + "\n",
    paragraphs,
    after,
    facts,
    note,
  };
}

// Gera link novo e manda por e-mail. Os links antigos só são revogados
// depois que o provedor aceita o novo; falha fica registrada na pessoa (o
// painel mostra) e no log. opts.ttlMs troca a validade (padrão 7 dias).
async function sendAccessLink(ctx, base, personId, opts) {
  const ttlMs = (opts && opts.ttlMs) || LINK_TTL_MS;
  const raw = ctx.store.mutate((s) => issueLoginToken(s, personId, ctx.now(), { revokeOthers: false, ttlMs }));
  const state = ctx.store.get();
  const person = state.people.find((p) => p.id === personId);
  const url = linkUrl(base, raw);
  const msg = accessEmail(person, url, { ttlMs, state });
  let result;
  try {
    result = await ctx.mail.sendEmail({
      to: person.email,
      subject: msg.subject,
      text: msg.text,
      html: ctx.mail.layout({
        base,
        preheader: "Seu link pessoal para a plataforma do hackathon. Vale por " + validityText(ttlMs) + ".",
        eyebrow: "Acesso à plataforma",
        title: "Seu acesso",
        titleEm: "está pronto.",
        paragraphs: msg.paragraphs,
        after: msg.after,
        facts: msg.facts,
        cta: { label: "Entrar na plataforma", url },
        fallbackUrl: url,
        note: msg.note,
      }),
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

// Troca a sessão deste navegador pela da pessoa (sessão nova, sem herdar
// nada) e responde payload. onFail desfaz o que o chamador já gravou; onOk
// grava o que só vale com a sessão de pé (último acesso). Exceção dentro do
// callback não tem quem a pegue: derrubaria o processo — daí os try.
function startSession(req, res, data, payload, onFail, onOk) {
  const fail = (err) => {
    reportSession("hack:sessao", err);
    try {
      if (onFail) onFail();
    } catch (e) {
      reportSession("hack:sessao-desfazer", e);
    }
    if (!res.headersSent) res.status(500).json({ error: "session_failed", message: "Não foi possível iniciar a sessão. Tente de novo." });
  };
  req.session.regenerate((err) => {
    try {
      if (err) return fail(err);
      req.session.hack = data;
      req.session.save((err2) => {
        try {
          if (err2) return fail(err2);
          if (onOk) {
            try {
              onOk();
            } catch (e) {
              reportSession("hack:sessao-registro", e);
            }
          }
          res.json(payload);
        } catch (e) {
          fail(e);
        }
      });
    } catch (e) {
      fail(e);
    }
  });
}

// Falha de sessão vai para o mesmo registro do resto (failures.json via
// ctx.report), não só para o console.
let reportSession = (scope, err) => console.error("[" + scope + "]", err && err.message);

// A sessão do evento deste navegador é da pessoa e ainda vale (epoch atual)?
// Uma sessão revogada (Desconectar) que sobrou no navegador não conta.
function liveEventSession(hs, person) {
  return Boolean(hs && person && hs.pid === person.id && hs.epoch === person.sessionEpoch);
}

// Entrou pelo link há pouco, nesta sessão ainda válida? Então cria ou troca a
// senha sem digitar a atual.
function freshLink(now, hs, person) {
  return liveEventSession(hs, person) && Boolean(hs.linkAt) && now.getTime() - Date.parse(hs.linkAt) < FRESH_LINK_MS;
}

module.exports = function registerAccess(app, ctx) {
  reportSession = ctx.report || reportSession;
  // No evento todo mundo sai pelo mesmo IP (rede da FGV / do I12): o teto por
  // IP é folgado e quem segura abuso é o limite por e-mail.
  const ipMax = Number(process.env.HACK_LINK_IP_MAX) || 120;
  const requestByIp = rateLimiter(ipMax, 15 * 60 * 1000);
  const requestByEmail = rateLimiter(3, 60 * 60 * 1000);
  const consumeByIp = rateLimiter(ipMax, 15 * 60 * 1000);
  const loginByIp = rateLimiter(ipMax, 15 * 60 * 1000);
  const loginByEmail = rateLimiter(Number(process.env.HACK_LOGIN_EMAIL_MAX) || 10, 15 * 60 * 1000);
  const passwordByPerson = rateLimiter(10, 15 * 60 * 1000);
  const GENERIC = "Se este e-mail estiver cadastrado no hackathon, enviamos um link de acesso. Confira a caixa de entrada e o spam.";

  // Recuperação: resposta idêntica e imediata, exista ou não a pessoa. Toda a
  // busca e a gravação do token acontecem DEPOIS da resposta, para o tempo
  // de resposta também não denunciar e-mails cadastrados. Link pedido pela
  // própria pessoa vale 24 horas (o da organização, 7 dias).
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
            sendAccessLink(ctx, base, p.id, { ttlMs: SELF_LINK_TTL_MS }).catch((err) => console.error("[hack] envio de link falhou:", err.message));
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
      // Sem senha ainda: a tela de acesso oferece criar (com "agora não").
      const needsPassword = !p.passwordHash && Boolean(p.email);
      startSession(
        req,
        res,
        { pid: p.id, epoch: p.sessionEpoch, linkAt: ctx.now().toISOString() },
        { ok: true, redirect: "/hack/portal", needsPassword },
        () => ctx.store.mutate((s) => unconsumeLoginToken(s, body.token))
      );
    })
  );

  // E-mail + senha. Inexistente, sem senha, bloqueado e senha errada recebem
  // a mesma resposta, no mesmo tempo. Limite por IP folgado (rede do evento)
  // e por e-mail apertado: é ele que segura quem tenta adivinhar.
  app.post(
    "/hack/api/access/login",
    route(async (req, res) => {
      const body = requireBody(req);
      const email = normEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      if (!validEmail(email) || !password) throw new HackError(400, "invalid_login", "Informe e-mail e senha.");
      if (loginByIp(req.ip) || loginByEmail(email)) {
        throw new HackError(429, "too_many_requests", "Muitas tentativas. Aguarde alguns minutos ou entre pelo link do e-mail.");
      }
      const p = await authenticate(ctx.store, email, password);
      if (!p) throw new HackError(401, "invalid_login", "E-mail ou senha incorretos.");
      // Último acesso só depois que a sessão existe de fato.
      startSession(req, res, { pid: p.id, epoch: p.sessionEpoch }, { ok: true, redirect: "/hack/portal" }, null, () =>
        ctx.store.mutate((s) => {
          const x = s.people.find((y) => y.id === p.id);
          if (x) x.lastLoginAt = ctx.now().toISOString();
        })
      );
    })
  );

  // Criar ou trocar a senha. Pede a atual, salvo logo depois de entrar pelo
  // link (que já provou a posse do e-mail). Os outros aparelhos saem; este
  // continua conectado.
  app.post(
    "/hack/api/me/password",
    route(async (req, res) => {
      const a = ctx.requireActor(req);
      const body = requireBody(req);
      const p = a.person;
      if (!p.email) throw new HackError(409, "no_email", "Seu cadastro no hackathon não tem e-mail. Fale com a organização.");
      if (passwordByPerson(p.id)) throw new HackError(429, "too_many_requests", "Muitas tentativas. Aguarde alguns minutos.");
      const hs = req.session.hack;
      if (p.passwordHash && !freshLink(ctx.now(), hs, p) && !(await checkPassword(p, body.current))) {
        throw new HackError(403, "wrong_password", "Senha atual incorreta. Se esqueceu, entre pelo link do e-mail e troque em seguida.");
      }
      const hash = await hashPassword(body.password, p);
      // Depois dos awaits, tudo é relido dentro do mutate: a pessoa pode ter
      // sido bloqueada ou desconectada nesse meio-tempo. Só a sessão do evento
      // que ainda vale é regravada com o epoch novo; quem entrou pelo login da
      // liga pode ter aqui uma sessão já revogada, que não volta a valer.
      const r = ctx.store.mutate((s) => {
        const x = s.people.find((y) => y.id === p.id);
        if (!x || !canAccess(x)) throw new HackError(401, "unauthenticated", "Sua sessão terminou. Entre de novo.");
        const live = liveEventSession(hs, x);
        return { epoch: applyPassword(x, hash, ctx.now()), live };
      });
      if (!r.live) return res.json({ ok: true, hasPassword: true });
      req.session.hack = Object.assign({}, hs, { epoch: r.epoch });
      req.session.save((err) => {
        try {
          if (err) {
            reportSession("hack:senha-sessao", err);
            return res.status(500).json({ error: "session_failed", message: "Senha criada, mas este aparelho saiu. Entre de novo com a senha nova." });
          }
          res.json({ ok: true, hasPassword: true });
        } catch (e) {
          reportSession("hack:senha-sessao", e);
          if (!res.headersSent) res.status(500).json({ error: "internal", message: "Erro interno. Tente de novo." });
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
        account: {
          hasPassword: Boolean(a.person.passwordHash),
          canSetPassword: Boolean(a.person.email),
          needsCurrent: Boolean(a.person.passwordHash) && !freshLink(ctx.now(), req.session && req.session.hack, a.person),
        },
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
module.exports.freshLink = freshLink;
module.exports.liveEventSession = liveEventSession;
module.exports.FRESH_LINK_MS = FRESH_LINK_MS;
