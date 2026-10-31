// Votação do público: participante vota; diretoria inicia, encerra e vê a contagem.
const { route, requireBody } = require("../util");
const { HackError } = require("../people");
const V = require("../vote");

module.exports = function registerVote(app, ctx) {
  const participant = (p) => p.participant;
  const manage = (p) => p.manage;

  app.get(
    "/hack/api/vote",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      res.json(V.ownView(ctx.store.get(), a.person.id));
    })
  );

  app.put(
    "/hack/api/vote",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      const teamId = String(requireBody(req).teamId || "");
      ctx.store.mutate((s) => V.cast(s, a.person.id, teamId, ctx.now()));
      res.json(V.ownView(ctx.store.get(), a.person.id));
    })
  );

  app.get(
    "/hack/api/admin/vote",
    route((req, res) => {
      ctx.requireActor(req, manage);
      res.json(V.adminView(ctx.store.get()));
    })
  );

  // Uma rota para as ações: { action: "open" | "close" | "reopen" | "reset" }.
  app.post(
    "/hack/api/admin/vote",
    route((req, res) => {
      const a = ctx.requireActor(req, manage);
      const b = requireBody(req);
      ctx.store.mutate((s) => {
        switch (b.action) {
          case "open":
            V.open(s, a.person.id, ctx.now());
            break;
          case "close":
            V.close(s, a.person.id, ctx.now());
            break;
          case "reopen":
            V.reopen(s);
            break;
          case "reset":
            V.reset(s);
            break;
          default:
            throw new HackError(400, "invalid_action", "Ação desconhecida.");
        }
      });
      res.json(V.adminView(ctx.store.get()));
    })
  );
};
