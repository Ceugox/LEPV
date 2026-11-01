// Relatórios do superadmin: um texto por equipe (resumo, notas das fases e o
// que indicar para melhorar). Ficam fora da entrega de propósito: a entrega
// passa pelo submissionView, que jurados e equipes recebem; o relatório só
// sai por estas rotas, e só para o superadmin.
const { route, requireBody } = require("../util");
const T = require("../teams");

const MAX = 20000;
const superadmin = (p) => p.superadmin;

module.exports = function registerReports(app, ctx) {
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
          return { teamId: t.id, team: t.name, text: r ? r.text : "", updatedAt: r ? r.updatedAt : null };
        });
      res.json({ reports: list });
    })
  );

  app.put(
    "/hack/api/admin/reports/:teamId",
    route((req, res) => {
      const a = ctx.requireActor(req, superadmin);
      const text = String(requireBody(req).text || "").trim().slice(0, MAX);
      ctx.store.mutate((s) => {
        T.mustTeam(s, req.params.teamId);
        s.reports = s.reports.filter((r) => r.teamId !== req.params.teamId);
        if (text) s.reports.push({ teamId: req.params.teamId, text, updatedAt: ctx.now().toISOString(), by: a.person.id });
      });
      res.json({ ok: true });
    })
  );
};
