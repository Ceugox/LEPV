const { route, rateLimiter } = require("../util");
const { HackError } = require("../people");
const { getJudgeRound } = require("../live-evaluation");
const { summarize } = require("../judge-summary");

module.exports = function registerJudgeSummary(app, ctx, summarizeImpl = summarize) {
  const limited = rateLimiter(4, 60000);
  const pending = new Set();
  app.post("/hack/api/judge/live/rounds/:id/summary", route(async (req, res) => {
    const actor = ctx.requireActor(req, (p) => p.judge);
    const pid = actor.person.id;
    const before = getJudgeRound(ctx.store.get(), pid, req.params.id);
    if (before.conflict) throw new HackError(409, "conflict", "Você está impedido de avaliar esta equipe.");
    if (limited(pid)) throw new HackError(429, "summary_rate", "Aguarde um minuto antes de pedir outro resumo.");
    if (pending.has(pid)) throw new HackError(409, "summary_pending", "Um resumo já está sendo preparado.");
    // Snapshot: nenhuma referência ao estado vivo cruza a chamada externa.
    const snapshot = JSON.parse(JSON.stringify(before));
    pending.add(pid);
    try {
      const summary = await summarizeImpl({ notes: snapshot.notes, criteria: snapshot.criteria, teamName: snapshot.round.team.name });
      const currentActor = ctx.requireActor(req, (p) => p.judge);
      if (currentActor.person.id !== pid) throw new HackError(409, "actor_changed", "Sua sessão mudou. Entre novamente antes de pedir o resumo.");
      const after = getJudgeRound(ctx.store.get(), pid, req.params.id);
      if (after.conflict || after.notesRevision !== snapshot.notesRevision || JSON.stringify(after.criteria) !== JSON.stringify(snapshot.criteria)) {
        throw new HackError(409, "summary_stale", "Os comentários mudaram durante o resumo. Gere um novo resumo para incluir os registros atuais.");
      }
      res.json({ summary, notesRevision: snapshot.notesRevision });
    } finally {
      pending.delete(pid);
    }
  }));
};
