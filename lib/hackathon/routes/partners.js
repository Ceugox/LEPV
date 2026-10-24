// Parceiros: formulário público de vínculo, área do representante e gestão.
const { route, requireBody, rateLimiter, waLink } = require("../util");
const { HackError, findPerson, adminView } = require("../people");
const P = require("../partners");
const { issueLoginToken, linkUrl } = require("../access");
const { sendAccessLink } = require("./access");
const { id } = require("../store");

const manage = (p) => p.manage;

module.exports = function registerPartners(app, ctx) {
  const requestLimit = rateLimiter(10, 60 * 60 * 1000);

  // ---------- público ----------
  app.get(
    "/hack/api/partners/orgs",
    route((req, res) => {
      res.json(P.publicOrgs(ctx.store.get()));
    })
  );

  app.post(
    "/hack/api/partners/request",
    route((req, res) => {
      if (requestLimit(req.ip)) throw new HackError(429, "too_many_requests", "Muitos pedidos. Tente mais tarde.");
      const b = requireBody(req);
      // Campo isca: robô preenche, gente não vê.
      if (b.website) return res.json({ ok: true, message: "Pedido recebido." });
      ctx.store.mutate((s) => P.createRequest(s, b, ctx.now()));
      res.json({ ok: true, message: "Pedido recebido. A organização confere e, aprovado, você recebe o link de acesso por e-mail." });
    })
  );

  // ---------- representante ----------
  app.get(
    "/hack/api/partner",
    route((req, res) => {
      const a = ctx.requireActor(req, (p) => p.partner);
      const s = ctx.store.get();
      const org = s.orgs.find((o) => o.id === a.person.orgId);
      if (!org) throw new HackError(404, "no_org", "Organização não encontrada.");
      res.json({
        org: { id: org.id, name: org.name, kind: org.kind, kindLabel: P.KIND_LABEL[org.kind] },
        agenda: P.orgAgenda(s, org.id),
        canExport: a.perms.sponsor === true && org.kind === "sponsor",
        consentCount: s.people.filter((p) => !p.disabled && p.roles.includes("participant") && p.consent === true).length,
      });
    })
  );

  // Exportação: só patrocinador aprovado, de organização patrocinadora, e só
  // de quem autorizou (lido agora). Cada exportação fica registrada.
  app.get(
    "/hack/api/partner/export.csv",
    route((req, res) => {
      const a = ctx.requireActor(req, (p) => p.sponsor);
      const s = ctx.store.get();
      const org = s.orgs.find((o) => o.id === a.person.orgId);
      if (!org || org.kind !== "sponsor") throw new HackError(403, "forbidden", "Exportação só para patrocinadores.");
      const out = P.exportConsenting(s);
      ctx.store.mutate((st) => {
        st.exportLog = (st.exportLog || []).concat({ id: id("x"), personId: a.person.id, orgId: org.id, count: out.count, at: ctx.now().toISOString() }).slice(-200);
      });
      const safe = org.name.replace(/[^\w-]+/g, "-").toLowerCase();
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hackathon-lepv-' + safe + '.csv"', "Cache-Control": "private, no-store" });
      res.send(out.csv);
    })
  );

  // ---------- diretoria ----------
  app.get(
    "/hack/api/admin/partners",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const s = ctx.store.get();
      res.json({
        orgs: s.orgs,
        requests: s.partnerRequests
          .slice()
          .sort((x, y) => (x.status === "pending" ? -1 : 1) - (y.status === "pending" ? -1 : 1) || (x.createdAt < y.createdAt ? 1 : -1))
          .slice(0, 200)
          .map((r) => Object.assign({}, r, { orgName: (s.orgs.find((o) => o.id === r.orgId) || {}).name || "?" })),
        representatives: s.people.filter((p) => p.orgId).map(adminView),
        exports: (s.exportLog || []).slice(-50).map((x) => Object.assign({}, x, { person: (findPerson(s, x.personId) || {}).name || "?" })),
      });
    })
  );

  app.post(
    "/hack/api/admin/partners/orgs",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const o = ctx.store.mutate((s) => P.addOrg(s, requireBody(req)));
      res.json({ org: o });
    })
  );

  app.patch(
    "/hack/api/admin/partners/orgs/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const o = ctx.store.mutate((s) => P.updateOrg(s, req.params.id, requireBody(req)));
      res.json({ org: o });
    })
  );

  // Aprovar já gera o acesso: por e-mail se configurado; sempre devolve o
  // link e o atalho de WhatsApp para a contingência manual.
  app.post(
    "/hack/api/admin/partners/requests/:id",
    route(async (req, res) => {
      const a = ctx.requireActor(req, manage);
      const approve = requireBody(req).approve === true;
      const out = ctx.store.mutate((s) => P.decideRequest(s, req.params.id, approve, a.person.id, ctx.now()));
      if (!approve) return res.json({ ok: true });
      const p = out.person;
      let url;
      let email = null;
      if (ctx.mail.emailEnabled() && p.email) {
        const r = await sendAccessLink(ctx, ctx.publicBase(req), p.id);
        url = r.url;
        email = r.result;
      } else {
        url = linkUrl(ctx.publicBase(req), ctx.store.mutate((s) => issueLoginToken(s, p.id, ctx.now())));
      }
      const whatsappUrl = waLink(p.phone, "Oi, " + String(p.name).split(" ")[0] + "! Seu acesso de parceiro do 1º Hackathon LEPV (vale 7 dias, uso único): " + url);
      res.json({ ok: true, person: adminView(p), url, whatsappUrl, email });
    })
  );

  app.delete(
    "/hack/api/admin/partners/representatives/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.store.mutate((s) => P.removeRepresentative(s, req.params.id));
      res.json({ ok: true });
    })
  );
};
