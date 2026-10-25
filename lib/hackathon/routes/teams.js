// Equipes: perfil, descoberta, criação, código, convites e gestão pela diretoria.
const { route, requireBody } = require("../util");
const { HackError, findPerson } = require("../people");
const T = require("../teams");
const E = require("../evaluation");

const manage = (p) => p.manage;

module.exports = function registerTeams(app, ctx) {
  // Depois do prazo de entrega a composição congela para participantes (a
  // diretoria ainda ajusta): a equipe avaliada é a que entregou.
  function assertOpen(a) {
    if (a.perms.manage) return;
    const s = ctx.store.get();
    const t = T.teamOf(s, a.person.id);
    if (ctx.now().getTime() > E.deadlineFor(s, t)) throw new HackError(409, "teams_locked", "Equipes congeladas: o prazo de entrega passou. Fale com a organização.");
  }
  const participant = (p) => p.participant;

  // Tudo o que a aba Equipe do portal precisa numa chamada.
  app.get(
    "/hack/api/team",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const s = ctx.store.get();
      const me = a.person;
      const t = T.teamOf(s, me.id);
      const out = {
        min: T.MIN,
        max: T.MAX,
        hasGroup: me.hasGroup === true,
        canDiscover: a.perms.participant && !me.hasGroup,
        profile: me.profile,
        team: t ? T.teamView(s, t, { code: true }) : null,
        invites: [],
        requests: [],
        locked: ctx.now().getTime() > E.deadlineFor(s, t),
      };
      if (t) {
        out.requests = s.invites
          .filter((i) => i.status === "pending" && i.teamId === t.id)
          .map((i) => {
            const p = findPerson(s, i.personId);
            return { id: i.id, kind: i.kind, person: p ? T.profileView(p) : null };
          });
      } else {
        out.invites = s.invites
          .filter((i) => i.status === "pending" && i.personId === me.id)
          .map((i) => {
            const team = T.findTeam(s, i.teamId);
            return { id: i.id, kind: i.kind, team: team ? T.teamView(s, team) : null };
          });
      }
      res.json(out);
    })
  );

  app.put(
    "/hack/api/team/profile",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      const profile = T.validateProfile(requireBody(req));
      ctx.store.mutate((s) => {
        findPerson(s, a.person.id).profile = profile;
      });
      res.json({ profile });
    })
  );

  // Descoberta: só para quem pode ser descoberto (sem grupo declarado).
  app.get(
    "/hack/api/team/discover",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      if (a.person.hasGroup) throw new HackError(403, "has_group", "Você declarou que já tem grupo: entre pela equipe do seu grupo, com o código.");
      const s = ctx.store.get();
      const people = s.people.filter((p) => p.id !== a.person.id && T.discoverable(s, p)).map(T.profileView);
      const teams = s.teams.filter((t) => t.members.length < T.MAX).map((t) => T.teamView(s, t));
      res.json({ people, teams });
    })
  );

  app.post(
    "/hack/api/team",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      const t = ctx.store.mutate((s) => T.createTeam(s, a.person.id, requireBody(req).name, ctx.now()));
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  app.post(
    "/hack/api/team/join",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      const t = ctx.store.mutate((s) => T.joinByCode(s, a.person.id, requireBody(req).code, ctx.now()));
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  app.post(
    "/hack/api/team/leave",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      ctx.store.mutate((s) => {
        const t = T.teamOf(s, a.person.id);
        if (!t) throw new HackError(404, "no_team", "Você não está numa equipe.");
        T.leave(s, t, a.person.id, ctx.now());
      });
      res.json({ ok: true });
    })
  );

  // Edição pela própria equipe: nome, vagas, confirmação, remoção (dono).
  app.patch(
    "/hack/api/team",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      const b = requireBody(req);
      const t = ctx.store.mutate((s) => {
        const team = T.teamOf(s, a.person.id);
        if (!team) throw new HackError(404, "no_team", "Você não está numa equipe.");
        if (b.name !== undefined) team.name = T.validName(s, b.name, team.id);
        if (b.lookingFor !== undefined) team.lookingFor = String(b.lookingFor || "").trim().slice(0, 200);
        if (b.removeMember) {
          if (team.ownerId !== a.person.id) throw new HackError(403, "not_owner", "Só quem criou a equipe remove integrantes.");
          if (b.removeMember === a.person.id) throw new HackError(400, "use_leave", "Para sair, use “Sair da equipe”.");
          T.leave(s, team, String(b.removeMember), ctx.now());
        }
        if (b.confirm === true) T.confirm(s, team, ctx.now());
        if (b.confirm === false) {
          team.status = "forming";
          team.confirmedAt = null;
        }
        return team;
      });
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  app.post(
    "/hack/api/team/invite",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      ctx.store.mutate((s) => {
        const t = T.teamOf(s, a.person.id);
        if (!t) throw new HackError(404, "no_team", "Crie ou entre numa equipe para convidar.");
        T.invite(s, t, a.person.id, String(requireBody(req).personId || ""), ctx.now());
      });
      res.json({ ok: true });
    })
  );

  app.post(
    "/hack/api/team/request",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      ctx.store.mutate((s) => {
        if (T.teamOf(s, a.person.id)) throw new HackError(409, "already_in_team", "Você já está numa equipe.");
        T.request(s, T.mustTeam(s, String(requireBody(req).teamId || "")), a.person.id, ctx.now());
      });
      res.json({ ok: true });
    })
  );

  app.post(
    "/hack/api/team/invites/:id",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      const accept = requireBody(req).accept === true;
      ctx.store.mutate((s) => T.decide(s, req.params.id, a.person.id, accept, ctx.now()));
      res.json({ ok: true });
    })
  );

  // ---------- diretoria ----------
  app.get(
    "/hack/api/admin/teams",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.sync();
      const s = ctx.store.get();
      const teams = s.teams
        .slice()
        .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
        .map((t) => T.teamView(s, t, { code: true, contacts: true }));
      const solo = s.people
        .filter((p) => !p.disabled && p.roles.includes("participant") && !T.teamOf(s, p.id))
        .map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone, hasGroup: p.hasGroup, published: Boolean(p.profile && p.profile.published) }))
        .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
      res.json({ teams, solo });
    })
  );

  app.post(
    "/hack/api/admin/teams",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const ids = Array.isArray(b.memberIds) ? b.memberIds.map(String) : [];
      if (!ids.length) throw new HackError(400, "no_members", "Escolha pelo menos uma pessoa.");
      const t = ctx.store.mutate((s) => {
        const first = ids[0];
        const p = findPerson(s, first);
        if (!p || !p.roles.includes("participant")) throw new HackError(400, "not_participant", "Só participantes entram em equipes.");
        const team = T.createTeam(s, first, b.name, ctx.now());
        ids.slice(1).forEach((m) => {
          const q = findPerson(s, m);
          if (!q || !q.roles.includes("participant")) throw new HackError(400, "not_participant", "Só participantes entram em equipes.");
          T.join(s, team, m, ctx.now());
        });
        return team;
      });
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  app.patch(
    "/hack/api/admin/teams/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const t = ctx.store.mutate((s) => {
        const team = T.mustTeam(s, req.params.id);
        if (b.name !== undefined) team.name = T.validName(s, b.name, team.id);
        // Prorrogação só desta equipe (ex.: PDF errado às 13h01). null tira.
        if (b.deadlineOverride !== undefined) {
          if (b.deadlineOverride === null) team.deadlineOverride = null;
          else {
            const t2 = Date.parse(b.deadlineOverride);
            if (!Number.isFinite(t2)) throw new HackError(400, "invalid_date", "Data inválida.");
            team.deadlineOverride = new Date(t2).toISOString();
          }
        }
        if (b.addMember) {
          const q = findPerson(s, String(b.addMember));
          if (!q || !q.roles.includes("participant")) throw new HackError(400, "not_participant", "Só participantes entram em equipes.");
          T.join(s, team, q.id, ctx.now());
        }
        if (b.removeMember) T.leave(s, team, String(b.removeMember), ctx.now());
        if (b.confirm !== undefined) T.assertTeamsEditable(s);
        if (b.confirm === true) T.confirm(s, team, ctx.now());
        if (b.confirm === false) {
          team.status = "forming";
          team.confirmedAt = null;
        }
        return T.findTeam(s, req.params.id);
      });
      res.json({ team: t ? T.teamView(ctx.store.get(), t, { code: true }) : null });
    })
  );

  app.post(
    "/hack/api/admin/teams/:id/merge",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const t = ctx.store.mutate((s) => T.merge(s, req.params.id, String(requireBody(req).otherId || ""), ctx.now()));
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  app.delete(
    "/hack/api/admin/teams/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.store.mutate((s) => {
        T.assertTeamsEditable(s);
        const t = T.mustTeam(s, req.params.id);
        if (T.hasSubmission(s, t.id)) throw new HackError(409, "has_submission", "A equipe já entregou: remova a entrega antes (aba Entregas).");
        t.members = [];
        T.settle(s, t, ctx.now());
      });
      res.json({ ok: true });
    })
  );
};
