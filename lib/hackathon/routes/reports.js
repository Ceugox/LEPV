// Relatórios do superadmin: por equipe, um texto interno (resumo, notas das
// fases, alertas) e um retorno para a equipe. Ficam fora da entrega de
// propósito: a entrega passa pelo submissionView, que jurados e equipes
// recebem. O texto interno só sai por estas rotas, e só para o superadmin; o
// retorno sai também para a própria equipe, em /hack/api/team/result.
const { route, requireBody } = require("../util");
const T = require("../teams");

const MAX = 20000;
const superadmin = (p) => p.superadmin;
const clean = (v) => (v === undefined ? undefined : String(v || "").trim().slice(0, MAX));

function feedbackOf(state, teamId) {
  const r = teamId ? state.reports.find((x) => x.teamId === teamId) : null;
  return r && r.feedback ? r.feedback : null;
}

function register(app, ctx) {
  app.get(
    "/hack/api/admin/reports",
    route((req, res) => {
      ctx.requireActor(req, superadmin);
      const s = ctx.store.get();
      const byTeam = new Map(s.reports.map((r) => [r.teamId, r]));
      const list = s.teams
        .filter((t) => t.status === "confirmed" || byTeam.has(t.id))
        .slice()
        .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
        .map((t) => {
          const r = byTeam.get(t.id);
          return { teamId: t.id, team: t.name, text: r ? r.text || "" : "", feedback: r ? r.feedback || "" : "", updatedAt: r ? r.updatedAt : null };
        });
      res.json({ reports: list });
    })
  );

  // { text?, feedback? }: o campo ausente fica como está; vazio apaga.
  app.put(
    "/hack/api/admin/reports/:teamId",
    route((req, res) => {
      const a = ctx.requireActor(req, superadmin);
      const body = requireBody(req);
      const text = clean(body.text);
      const feedback = clean(body.feedback);
      ctx.store.mutate((s) => {
        T.mustTeam(s, req.params.teamId);
        const old = s.reports.find((r) => r.teamId === req.params.teamId) || {};
        const next = {
          teamId: req.params.teamId,
          text: text === undefined ? old.text || "" : text,
          feedback: feedback === undefined ? old.feedback || "" : feedback,
          updatedAt: ctx.now().toISOString(),
          by: a.person.id,
        };
        s.reports = s.reports.filter((r) => r.teamId !== req.params.teamId);
        if (next.text || next.feedback) s.reports.push(next);
      });
      res.json({ ok: true });
    })
  );
}

module.exports = register;
module.exports.feedbackOf = feedbackOf;
