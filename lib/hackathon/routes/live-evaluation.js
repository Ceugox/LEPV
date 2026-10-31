const { route, requireBody } = require("../util");
const L = require("../live-evaluation");

module.exports = function registerLiveEvaluation(app, ctx) {
  const judge = (p) => p.judge;
  const manage = (p) => p.manage;
  const getJudge = (req) => ctx.requireActor(req, judge);

  app.get("/hack/api/judge/live", route((req, res) => {
    const a = getJudge(req);
    res.json(L.judgeView(ctx.store.get(), a.person));
  }));
  app.get("/hack/api/judge/live/rounds/:id", route((req, res) => {
    const a = getJudge(req);
    res.json(L.getJudgeRound(ctx.store.get(), a.person.id, req.params.id));
  }));
  app.post("/hack/api/judge/live/rounds/:id/notes", route((req, res) => {
    const a = getJudge(req);
    const body = requireBody(req);
    ctx.store.mutate((s) => L.addNote(s, a.person.id, req.params.id, body, ctx.now()));
    res.json(L.getJudgeRound(ctx.store.get(), a.person.id, req.params.id));
  }));
  app.put("/hack/api/judge/live/rounds/:id/draft", route((req, res) => {
    const a = getJudge(req);
    const body = requireBody(req);
    const draft = ctx.store.mutate((s) => L.saveDraft(s, a.person.id, req.params.id, body, ctx.now()));
    res.json({ draft });
  }));
  app.post("/hack/api/judge/live/rounds/:id/confirm", route((req, res) => {
    const a = getJudge(req);
    const body = requireBody(req);
    const score = ctx.store.mutate((s) => L.confirm(s, a.person.id, req.params.id, body, ctx.now()));
    res.json({ score });
  }));
  app.get("/hack/api/admin/live", route((req, res) => {
    ctx.requireActor(req, manage);
    res.json(L.adminView(ctx.store.get()));
  }));
  app.post("/hack/api/admin/live/rounds", route((req, res) => {
    ctx.requireActor(req, manage);
    const body = requireBody(req);
    const r = ctx.store.mutate((s) => L.openRound(s, body.teamId, body.kind, ctx.now()));
    res.json({ round: L.roundView(ctx.store.get(), r) });
  }));
  app.post("/hack/api/admin/live/rounds/:id/close", route((req, res) => {
    ctx.requireActor(req, manage);
    const r = ctx.store.mutate((s) => L.closeRound(s, req.params.id, ctx.now()));
    res.json({ round: L.roundView(ctx.store.get(), r) });
  }));
};
