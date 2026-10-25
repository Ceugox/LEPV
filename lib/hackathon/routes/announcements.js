// Avisos: central do portal, inscrição de push e composição pela organização.
const { route, requireBody, waLink, rateLimiter } = require("../util");
const { HackError, findPerson } = require("../people");
const A = require("../announcements");
const { validSubscription } = require("../push");
const { id } = require("../store");

const comms = (p) => p.comms;

function publicView(ann, readIds) {
  return {
    id: ann.id,
    title: ann.title,
    body: ann.body,
    urgent: ann.urgent,
    publishedAt: ann.publishedAt,
    read: readIds.includes(ann.id),
  };
}

function adminView(state, ann) {
  const author = ann.authorId ? findPerson(state, ann.authorId) : null;
  return {
    id: ann.id,
    title: ann.title,
    body: ann.body,
    urgent: ann.urgent,
    audiences: ann.audiences,
    channels: ann.channels,
    status: ann.status,
    scheduledAt: ann.scheduledAt,
    publishedAt: ann.publishedAt,
    recipientCount: ann.recipientCount,
    author: author ? author.name : "",
    seeded: ann.seeded === true,
    stats: A.deliveryStats(state, ann.id),
  };
}

const MAX_DEVICES = 5;

module.exports = function registerAnnouncements(app, ctx) {
  const subscribeLimit = rateLimiter(10, 60 * 60 * 1000);
  // ---------- central (qualquer pessoa autenticada) ----------
  app.get(
    "/hack/api/announcements",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const s = ctx.store.get();
      const list = s.announcements
        .filter((x) => A.visibleTo(x, a))
        .sort((x, y) => (x.publishedAt < y.publishedAt ? 1 : -1))
        .map((x) => publicView(x, a.person.readIds || []));
      res.json({ announcements: list, unread: list.filter((x) => !x.read).length, push: { available: ctx.push.enabled(), publicKey: ctx.push.publicKey() } });
    })
  );

  app.post(
    "/hack/api/announcements/:id/read",
    route((req, res) => {
      const a = ctx.requireActor(req);
      ctx.store.mutate((s) => {
        const ann = s.announcements.find((x) => x.id === req.params.id);
        if (!ann || !A.visibleTo(ann, a)) {
          throw new HackError(404, "not_found", "Aviso não encontrado.");
        }
        const p = findPerson(s, a.person.id);
        if (!p.readIds.includes(ann.id)) p.readIds.push(ann.id);
      });
      res.json({ ok: true });
    })
  );

  app.post(
    "/hack/api/announcements/read-all",
    route((req, res) => {
      const a = ctx.requireActor(req);
      ctx.store.mutate((s) => {
        const p = findPerson(s, a.person.id);
        for (const ann of s.announcements) {
          if (A.visibleTo(ann, a) && !p.readIds.includes(ann.id)) p.readIds.push(ann.id);
        }
      });
      res.json({ ok: true });
    })
  );

  // ---------- push por aparelho ----------
  app.post(
    "/hack/api/push/subscribe",
    route((req, res) => {
      const a = ctx.requireActor(req);
      if (!ctx.push.enabled()) throw new HackError(409, "push_disabled", "Notificações ainda não estão disponíveis.");
      if (subscribeLimit(a.person.id)) throw new HackError(429, "too_many_requests", "Muitas tentativas. Aguarde um pouco.");
      // Em teste (outbox) aceita endpoint fictício; em produção, só serviços de push.
      const sub = validSubscription(requireBody(req).subscription, { anyHost: Boolean(process.env.HACK_PUSH_OUTBOX) });
      if (!sub) throw new HackError(400, "invalid_subscription", "Inscrição de notificação inválida.");
      ctx.store.mutate((s) => {
        // O mesmo aparelho (endpoint) com outra pessoa: passa a ser só dela.
        s.pushSubs = s.pushSubs.filter((x) => x.endpoint !== sub.endpoint);
        s.pushSubs.push(Object.assign({ id: id("s"), personId: a.person.id, createdAt: ctx.now().toISOString(), ua: String(req.get("user-agent") || "").slice(0, 160) }, sub));
        // No máximo MAX_DEVICES aparelhos por pessoa: o mais antigo sai.
        const mine = s.pushSubs.filter((x) => x.personId === a.person.id);
        if (mine.length > MAX_DEVICES) {
          const drop = new Set(mine.slice(0, mine.length - MAX_DEVICES).map((x) => x.id));
          s.pushSubs = s.pushSubs.filter((x) => !drop.has(x.id));
        }
      });
      res.json({ ok: true });
    })
  );

  app.post(
    "/hack/api/push/unsubscribe",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const endpoint = String((req.body && req.body.endpoint) || "");
      ctx.store.mutate((s) => {
        s.pushSubs = s.pushSubs.filter((x) => !(x.endpoint === endpoint && x.personId === a.person.id));
      });
      res.json({ ok: true });
    })
  );

  // ---------- organização (diretoria ou staff com permissão) ----------
  app.get(
    "/hack/api/admin/announcements",
    route((req, res) => {
      ctx.requireActor(req, comms);
      const s = ctx.store.get();
      // Primeiro o que ainda vai sair (do mais próximo ao mais distante), depois
      // o histórico (do mais recente ao mais antigo).
      const upcoming = ["scheduled", "overdue"];
      const list = s.announcements
        .slice()
        .sort((x, y) => {
          const ux = upcoming.includes(x.status);
          const uy = upcoming.includes(y.status);
          if (ux !== uy) return ux ? -1 : 1;
          if (ux) return x.scheduledAt < y.scheduledAt ? -1 : 1;
          return (x.publishedAt || x.createdAt) < (y.publishedAt || y.createdAt) ? 1 : -1;
        })
        .map((x) => adminView(s, x));
      res.json({ announcements: list, channels: { email: ctx.mail.emailEnabled(), push: ctx.push.enabled(), whatsapp: true } });
    })
  );

  // Alcance antes de publicar: quantas pessoas, por canal.
  app.post(
    "/hack/api/admin/announcements/preview",
    route((req, res) => {
      ctx.requireActor(req, comms);
      ctx.sync();
      const b = requireBody(req);
      const audiences = A.normalizeAudiences(b.audiences);
      const s = ctx.store.get();
      const people = A.resolveRecipients(s, audiences);
      res.json({
        people: people.length,
        email: people.filter((p) => p.email).length,
        push: people.filter((p) => s.pushSubs.some((x) => x.personId === p.id)).length,
        whatsapp: people.filter((p) => p.phone).length,
      });
    })
  );

  app.post(
    "/hack/api/admin/announcements",
    route((req, res) => {
      const a = ctx.requireActor(req, comms);
      ctx.sync();
      const draft = A.validateDraft(requireBody(req), ctx.now());
      const ann = ctx.store.mutate((s) => A.createAnnouncement(s, draft, a.person.id, ctx.now()));
      ctx.kickDelivery();
      res.json({ announcement: adminView(ctx.store.get(), ann) });
    })
  );

  // Edita aviso ainda não publicado (agendado, vencido).
  app.patch(
    "/hack/api/admin/announcements/:id",
    route((req, res) => {
      ctx.requireActor(req, comms);
      const draft = A.validateDraft(requireBody(req), ctx.now());
      const ann = ctx.store.mutate((s) => {
        const x = s.announcements.find((y) => y.id === req.params.id);
        if (!x) throw new HackError(404, "not_found", "Aviso não encontrado.");
        if (!["scheduled", "overdue", "draft"].includes(x.status)) throw new HackError(409, "locked", "Aviso já publicado ou cancelado não muda.");
        if (!draft.scheduledAt) throw new HackError(400, "need_date", "Para publicar agora, use “Publicar agora”.");
        Object.assign(x, draft, { status: "scheduled" });
        return x;
      });
      res.json({ announcement: adminView(ctx.store.get(), ann) });
    })
  );

  app.post(
    "/hack/api/admin/announcements/:id/publish",
    route((req, res) => {
      ctx.requireActor(req, comms);
      ctx.sync();
      const ann = ctx.store.mutate((s) => {
        const x = s.announcements.find((y) => y.id === req.params.id);
        if (!x) throw new HackError(404, "not_found", "Aviso não encontrado.");
        return A.publish(s, x, ctx.now());
      });
      ctx.kickDelivery();
      res.json({ announcement: adminView(ctx.store.get(), ann) });
    })
  );

  app.post(
    "/hack/api/admin/announcements/:id/cancel",
    route((req, res) => {
      ctx.requireActor(req, comms);
      ctx.store.mutate((s) => {
        const x = s.announcements.find((y) => y.id === req.params.id);
        if (!x) throw new HackError(404, "not_found", "Aviso não encontrado.");
        if (x.status === "published") throw new HackError(409, "published", "Aviso já publicado não pode ser cancelado.");
        x.status = "cancelled";
      });
      res.json({ ok: true });
    })
  );

  // Recibos de e-mail/push que não chegaram ao "enviado": com o erro, para a
  // organização reenviar ou descartar.
  app.get(
    "/hack/api/admin/announcements/:id/deliveries",
    route((req, res) => {
      ctx.requireActor(req, comms);
      const s = ctx.store.get();
      const items = s.deliveries
        .filter((d) => d.announcementId === req.params.id && d.channel !== "whatsapp" && d.status !== "sent")
        .map((d) => {
          const p = findPerson(s, d.personId);
          return { id: d.id, channel: d.channel, status: d.status, attempts: d.attempts, error: d.error, person: p ? p.name : "?", updatedAt: d.updatedAt };
        });
      res.json({ items });
    })
  );

  // ---------- WhatsApp assistido ----------
  // Fila de recibos de WhatsApp: cada um vira um atalho wa.me com a mensagem
  // pronta. Só a organização marca "enviado" — abrir a conversa não conta.
  app.get(
    "/hack/api/admin/whatsapp",
    route((req, res) => {
      ctx.requireActor(req, comms);
      const s = ctx.store.get();
      const items = s.deliveries
        .filter((d) => d.channel === "whatsapp")
        .map((d) => {
          const ann = s.announcements.find((x) => x.id === d.announcementId);
          const p = findPerson(s, d.personId);
          if (!ann || !p) return null;
          return {
            id: d.id,
            status: d.status,
            announcement: { id: ann.id, title: ann.title, publishedAt: ann.publishedAt },
            person: { id: p.id, name: p.name, phone: p.phone },
            waUrl: waLink(p.phone, "*" + ann.title + "*\n\n" + ann.body + "\n\n— 1º Hackathon LEPV · lepv.org/hack"),
            updatedAt: d.updatedAt,
          };
        })
        .filter(Boolean)
        .sort((x, y) => (x.status === "pending" ? -1 : 1) - (y.status === "pending" ? -1 : 1));
      res.json({ items, automation: s.config.whatsappAutomation === true });
    })
  );

  app.post(
    "/hack/api/admin/deliveries/:id",
    route((req, res) => {
      const a = ctx.requireActor(req, comms);
      const status = String((req.body && req.body.status) || "");
      let kick = false;
      ctx.store.mutate((s) => {
        const d = s.deliveries.find((x) => x.id === req.params.id);
        if (!d) throw new HackError(404, "not_found", "Envio não encontrado.");
        if (d.channel === "whatsapp") {
          // Assistido: a organização marca o que fez.
          if (!["sent", "skipped", "pending"].includes(status)) throw new HackError(400, "invalid_status", "Status inválido.");
        } else {
          // E-mail/push: só reenviar (volta para a fila) ou descartar.
          if (!["pending", "skipped"].includes(status)) throw new HackError(400, "invalid_status", "Para e-mail e push: reenviar ou descartar.");
          if (d.status === "sent" || d.status === "sending") throw new HackError(409, "locked", "Envio já concluído ou em andamento.");
          if (status === "pending") {
            d.attempts = 0;
            d.nextAttemptAt = null;
            kick = true;
          }
        }
        d.status = status;
        d.markedBy = a.person.id;
        d.updatedAt = ctx.now().toISOString();
      });
      if (kick) ctx.kickDelivery();
      res.json({ ok: true });
    })
  );
};
