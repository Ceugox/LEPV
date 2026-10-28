// Crédito de IA: o participante consulta o próprio estado (o código só vem
// depois do check-in); a diretoria cadastra código e link de resgate.
const { route, requireBody } = require("../util");
const C = require("../ai-credit");

module.exports = function registerAiCredit(app, ctx) {
  const participant = (p) => p.participant;
  const manage = (p) => p.manage;

  app.get(
    "/hack/api/ai-credit",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      res.json(C.creditFor(ctx.store.get(), a.person));
    })
  );

  app.get(
    "/hack/api/admin/config/ai-credit",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const s = ctx.store.get();
      const released = s.people.filter((p) => C.creditFor(s, p).released).length;
      res.json(Object.assign(C.creditConfig(s), { released }));
    })
  );

  app.put(
    "/hack/api/admin/config/ai-credit",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const v = C.validateCredit(requireBody(req));
      ctx.store.mutate((s) => {
        s.config.aiCredit = v;
      });
      res.json(C.creditConfig(ctx.store.get()));
    })
  );
};
