// Dúvidas: participante pergunta; diretoria e equipe com comunicação respondem.
const { route, requireBody } = require("../util");
const { findPerson } = require("../people");
const Q = require("../questions");

module.exports = function registerQuestions(app, ctx) {
  const participant = (p) => p.participant;
  const comms = (p) => p.comms;

  app.get(
    "/hack/api/questions",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      const mine = ctx.store.get().questions.filter((q) => q.personId === a.person.id);
      res.json({ questions: mine.slice().reverse().map(Q.ownView) });
    })
  );

  app.post(
    "/hack/api/questions",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      const q = ctx.store.mutate((s) => Q.ask(s, a.person.id, requireBody(req).text, ctx.now()));
      res.json({ question: Q.ownView(q) });
    })
  );

  app.get(
    "/hack/api/admin/questions",
    route((req, res) => {
      ctx.requireActor(req, comms);
      const s = ctx.store.get();
      // Sem resposta primeiro (mais antigas no topo); depois as respondidas.
      const list = s.questions.slice().sort((x, y) => {
        if (!x.answer !== !y.answer) return x.answer ? 1 : -1;
        return x.answer ? y.answer.at.localeCompare(x.answer.at) : x.createdAt.localeCompare(y.createdAt);
      });
      res.json({ questions: list.map((q) => Q.adminView(s, q)) });
    })
  );

  app.post(
    "/hack/api/admin/questions/:id/answer",
    route(async (req, res) => {
      const a = ctx.requireActor(req, comms);
      const q = ctx.store.mutate((s) => Q.answer(s, req.params.id, a.person.id, requireBody(req).text, ctx.now()));
      // Push para quem perguntou, se ativou neste ou em outro aparelho. Falha
      // no push não desfaz a resposta: ela já está no portal.
      let push = "unavailable";
      try {
        const person = findPerson(ctx.store.get(), q.personId);
        const subs = ctx.store.get().pushSubs.filter((x) => person && x.personId === person.id);
        if (ctx.push.enabled() && subs.length) {
          const payload = JSON.stringify({ title: "Sua dúvida foi respondida", body: q.answer.text.slice(0, 180), url: "/hack/portal#duvidas", tag: q.id });
          const out = await Promise.all(subs.map((x) => ctx.push.send(x, payload, false)));
          push = out.some((o) => o.status === "sent") ? "sent" : "failed";
        } else if (ctx.push.enabled()) {
          push = "no_device";
        }
      } catch (err) {
        ctx.report("hack:questions-push", err);
        push = "failed";
      }
      res.json({ question: Q.adminView(ctx.store.get(), q), push });
    })
  );
};
