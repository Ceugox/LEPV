// Visão geral do superadmin: grupos, acessos, entregas, avisos, dúvidas e
// credenciamento numa chamada. Só leitura; as ações continuam nas abas de
// sempre (e nas mesmas rotas).
const { route } = require("../util");
const T = require("../teams");
const A = require("../announcements");
const { VENUES } = require("../program");

const DAY_MS = 24 * 3600 * 1000;

function overview(s, now) {
  const t = now.getTime();
  const active = (p) => !p.disabled && p.roles.includes("participant");
  const parts = s.people.filter(active);

  // Grupos
  const teams = s.teams.map((x) => ({ id: x.id, name: x.name, size: x.members.length, status: x.status }));
  const solo = parts.filter((p) => !T.teamOf(s, p.id));
  const pendingGroup = T.pendingGroup(s, () => true);
  const indicated = (p) => pendingGroup.some((i) => i.fromId === p.id || i.personId === p.id);
  const groups = {
    teams: teams.length,
    confirmed: teams.filter((x) => x.status === "confirmed").length,
    forming: teams.filter((x) => x.status !== "confirmed").length,
    small: teams.filter((x) => x.size < T.MIN).length,
    solo: solo.length,
    soloWithGroup: solo.filter((p) => p.hasGroup).length,
    pendingIndications: pendingGroup.length,
    // Disse que tem grupo, está sem equipe e ninguém indicou ninguém.
    stuck: solo.filter((p) => p.hasGroup && !indicated(p)).map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone })),
  };

  // Acessos
  const seen = (p) => (p.lastSeenAt ? Date.parse(p.lastSeenAt) : 0);
  const access = {
    participants: parts.length,
    linkSent: parts.filter((p) => p.lastLinkAt).length,
    loggedIn: parts.filter((p) => p.lastLoginAt).length,
    active24h: parts.filter((p) => t - seen(p) < DAY_MS).length,
    linkFailed: parts.filter((p) => p.lastLinkEmail && p.lastLinkEmail.status === "failed").length,
    neverIn: parts
      .filter((p) => !p.lastLoginAt)
      .map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone, lastLinkAt: p.lastLinkAt || null, linkStatus: p.lastLinkEmail ? p.lastLinkEmail.status : null }))
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR")),
  };

  // Entregas
  const subOf = (teamId) => s.submissions.find((x) => x.teamId === teamId) || null;
  const submissions = {
    deadline: s.config.submissionDeadline,
    teams: teams.length,
    complete: s.teams.filter((x) => { const sub = subOf(x.id); return sub && sub.completedAt; }).length,
    draft: s.teams.filter((x) => { const sub = subOf(x.id); return sub && !sub.completedAt; }).length,
    missing: s.teams.filter((x) => !subOf(x.id)).map((x) => ({ id: x.id, name: x.name, size: x.members.length })),
  };

  // Avisos
  const announcements = s.announcements
    .filter((a) => a.status !== "cancelled")
    .slice()
    .sort((x, y) => String(y.publishedAt || y.scheduledAt || "").localeCompare(String(x.publishedAt || x.scheduledAt || "")))
    .map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      scheduledAt: a.scheduledAt || null,
      publishedAt: a.publishedAt || null,
      recipients: a.recipientCount || 0,
      read: s.people.filter((p) => (p.readIds || []).includes(a.id)).length,
      stats: A.deliveryStats(s, a.id),
    }));

  // Dúvidas
  const open = s.questions.filter((q) => !q.answer);
  const questions = {
    open: open.length,
    answered: s.questions.length - open.length,
    oldestOpenAt: open.length ? open.map((q) => q.createdAt).sort()[0] : null,
  };

  // Credenciamento
  const checkin = Object.keys(VENUES).map((day) => ({
    day,
    place: VENUES[day].name,
    in: s.checkins.filter((c) => c.day === day).length,
    expected: parts.length,
  }));

  return { now: now.toISOString(), groups, access, submissions, announcements, questions, checkin };
}

module.exports = function registerOverview(app, ctx) {
  app.get(
    "/hack/api/admin/overview",
    route((req, res) => {
      ctx.requireActor(req, (p) => p.superadmin);
      ctx.sync();
      res.json(overview(ctx.store.get(), ctx.now()));
    })
  );
};

module.exports.overview = overview;
