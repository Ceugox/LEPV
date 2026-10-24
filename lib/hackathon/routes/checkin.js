// Credenciamento: leitura online, busca manual, preparo offline e sincronização.
const { route, requireBody } = require("../util");
const { HackError } = require("../people");
const K = require("../admission");

const checkin = (p) => p.checkin;
const manage = (p) => p.manage;

module.exports = function registerCheckin(app, ctx) {
  app.get(
    "/hack/api/checkin/status",
    route((req, res) => {
      ctx.requireActor(req, checkin);
      const s = ctx.store.get();
      const today = K.dayOf(ctx.now());
      // Num dia do evento o dia é fixo (o de hoje); fora, escolhe-se para ensaio.
      const eventDay = K.EVENT_DAYS.includes(today);
      res.json({ days: K.EVENT_DAYS, today, defaultDay: eventDay ? today : K.EVENT_DAYS[0], dayLocked: eventDay, stats: K.stats(s), now: ctx.now().toISOString() });
    })
  );

  app.post(
    "/hack/api/checkin/scan",
    route((req, res) => {
      const a = ctx.requireActor(req, checkin);
      const b = requireBody(req);
      const day = K.resolveDay(b.day, ctx.now());
      const r = ctx.store.mutate((s) => K.admitByCode(s, b.code, day, { by: a.person.id, source: "online" }, ctx.now()));
      res.json(r);
    })
  );

  app.get(
    "/hack/api/checkin/search",
    route((req, res) => {
      ctx.requireActor(req, checkin);
      const day = K.resolveDay(String(req.query.day || ""), ctx.now());
      res.json({ people: K.search(ctx.store.get(), req.query.q, day) });
    })
  );

  app.post(
    "/hack/api/checkin/person/:id",
    route((req, res) => {
      const a = ctx.requireActor(req, checkin);
      const day = K.resolveDay((req.body && req.body.day) || "", ctx.now());
      const r = ctx.store.mutate((s) => {
        const p = s.people.find((x) => x.id === req.params.id) || null;
        return K.admit(s, p, day, { by: a.person.id, source: "manual" }, ctx.now());
      });
      res.json(r);
    })
  );

  // Desfazer leitura errada: só a diretoria.
  app.delete(
    "/hack/api/checkin/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.store.mutate((s) => K.undo(s, req.params.id));
      res.json({ ok: true });
    })
  );

  // ---------- offline ----------
  app.post(
    "/hack/api/checkin/prepare",
    route((req, res) => {
      const a = ctx.requireActor(req, checkin);
      const label = String((req.body && req.body.label) || req.get("user-agent") || "").slice(0, 60);
      const out = ctx.store.mutate((s) => K.prepareDevice(s, a.person.id, label, ctx.now()));
      res.json({
        deviceId: out.device.id,
        deviceToken: out.token,
        expiresAt: out.device.expiresAt,
        operatorId: a.person.id,
        snapshot: K.snapshot(ctx.store.get()),
      });
    })
  );

  // Cópia atualizada para um aparelho já preparado (ao voltar a rede).
  app.post(
    "/hack/api/checkin/snapshot",
    route((req, res) => {
      const a = ctx.requireActor(req, checkin);
      const b = requireBody(req);
      K.checkDevice(ctx.store.get(), String(b.deviceId || ""), b.deviceToken, a.person.id, ctx.now());
      res.json({ snapshot: K.snapshot(ctx.store.get()) });
    })
  );

  app.post(
    "/hack/api/checkin/sync",
    route((req, res) => {
      const a = ctx.requireActor(req, checkin);
      const b = requireBody(req);
      const results = ctx.store.mutate((s) => {
        const dev = K.checkDevice(s, String(b.deviceId || ""), b.deviceToken, a.person.id, ctx.now());
        return K.syncOps(s, dev, a.person.id, b.ops, ctx.now());
      });
      res.json({ results });
    })
  );

  // ---------- diretoria: aparelhos ----------
  app.get(
    "/hack/api/admin/devices",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const s = ctx.store.get();
      res.json({
        devices: s.devices.map((d) => {
          const p = s.people.find((x) => x.id === d.personId);
          return { id: d.id, operator: p ? p.name : "?", label: d.label, createdAt: d.createdAt, expiresAt: d.expiresAt, revokedAt: d.revokedAt, lastSyncAt: d.lastSyncAt };
        }),
      });
    })
  );

  app.post(
    "/hack/api/admin/devices/:id/revoke",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.store.mutate((s) => {
        const d = s.devices.find((x) => x.id === req.params.id);
        if (!d) throw new HackError(404, "not_found", "Aparelho não encontrado.");
        d.revokedAt = ctx.now().toISOString();
      });
      res.json({ ok: true });
    })
  );
};
