// Sala de gravação do pitch: participante reserva pela equipe; diretoria e
// credenciamento veem a grade com nomes e liberam horário.
const { route, requireBody } = require("../util");
const R = require("../recording");

module.exports = function registerRecording(app, ctx) {
  const participant = (p) => p.participant;
  const door = (p) => p.checkin;

  // Equipe desfeita ou unida a outra: acerta reservas e fila antes de tudo.
  const reconcile = () => {
    if (R.needsPrune(ctx.store.get())) ctx.store.mutate((s) => R.prune(s, ctx.now()));
  };
  const own = (req, res, a) => res.json(R.ownView(ctx.store.get(), a.person.id, ctx.now()));

  app.get(
    "/hack/api/recording",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      reconcile();
      own(req, res, a);
    })
  );

  app.post(
    "/hack/api/recording/book",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      reconcile();
      ctx.store.mutate((s) => R.book(s, a.person.id, String(requireBody(req).slot || ""), ctx.now()));
      own(req, res, a);
    })
  );

  app.post(
    "/hack/api/recording/cancel",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      reconcile();
      ctx.store.mutate((s) => R.cancel(s, a.person.id, ctx.now()));
      own(req, res, a);
    })
  );

  app.post(
    "/hack/api/recording/queue",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      reconcile();
      ctx.store.mutate((s) => R.joinQueue(s, a.person.id, ctx.now()));
      own(req, res, a);
    })
  );

  app.delete(
    "/hack/api/recording/queue",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      reconcile();
      ctx.store.mutate((s) => R.leaveQueue(s, a.person.id, ctx.now()));
      own(req, res, a);
    })
  );

  app.get(
    "/hack/api/admin/recording",
    route((req, res) => {
      ctx.requireActor(req, door);
      reconcile();
      res.json(R.adminView(ctx.store.get(), ctx.now()));
    })
  );

  app.post(
    "/hack/api/admin/recording/release",
    route((req, res) => {
      ctx.requireActor(req, door);
      reconcile();
      ctx.store.mutate((s) => R.release(s, String(requireBody(req).slot || ""), ctx.now()));
      res.json(R.adminView(ctx.store.get(), ctx.now()));
    })
  );
};
