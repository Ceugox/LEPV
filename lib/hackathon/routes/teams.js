// Equipes: perfil, descoberta, criação, código, convites e gestão pela diretoria.
const { route, requireBody } = require("../util");
const { HackError, findPerson } = require("../people");
const T = require("../teams");
const AF = require("../affinity");
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

  // Diretoria: a mesma operação roda numa cópia do estado e devolve as
  // indicações de grupo que ela cancelaria, sem gravar nada (dryRun). O painel
  // pede confirmação só quando a lista não vem vazia.
  function impactOf(op) {
    const before = ctx.store.get();
    const pending = new Set(T.pendingGroup(before, () => true).map((i) => i.id));
    const copy = JSON.parse(JSON.stringify(before));
    op(copy);
    return copy.invites
      // "duplicate" não conta: a outra indicação para a mesma pessoa segue.
      .filter((i) => pending.has(i.id) && i.status === "cancelled" && i.reason !== "duplicate")
      .map((i) => {
        const f = findPerson(copy, i.fromId);
        const t = findPerson(copy, i.personId);
        return { from: f ? f.name : "?", to: t ? t.name : "?" };
      });
  }

  // Tudo o que a aba Equipe do portal precisa numa chamada.
  app.get(
    "/hack/api/team",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const s = ctx.store.get();
      const me = a.person;
      const t = T.teamOf(s, me.id);
      const side = T.groupSide(s, me.id);
      const out = {
        min: T.MIN,
        max: T.MAX,
        hasGroup: me.hasGroup === true,
        canDiscover: a.perms.participant && !me.hasGroup,
        profile: me.profile,
        team: t ? T.teamView(s, t, { code: true }) : null,
        invites: [],
        requests: [],
        // Indicações do grupo ainda sem resposta (feitas por mim ou pela minha equipe).
        sent: T.pendingGroup(s, (i) => side.includes(i.fromId))
          .map((i) => {
            const p = findPerson(s, i.personId);
            return { id: i.id, person: p ? { id: p.id, name: p.name } : null };
          }),
        // Indicações cortadas por falta de vaga: os dois lados sabem por quê.
        lostSeats: T.lostSeatsFor(s, me.id, ctx.now()),
        locked: ctx.now().getTime() > E.deadlineFor(s, t),
      };
      if (t) {
        out.requests = s.invites
          .filter((i) => i.status === "pending" && i.kind !== "group" && i.teamId === t.id)
          .map((i) => {
            const p = findPerson(s, i.personId);
            return { id: i.id, kind: i.kind, person: p ? T.profileView(p) : null };
          });
      } else {
        out.invites = s.invites
          .filter((i) => i.status === "pending" && i.personId === me.id)
          .map((i) => {
            const team = i.teamId ? T.findTeam(s, i.teamId) : T.teamOf(s, i.fromId);
            const from = findPerson(s, i.fromId);
            return { id: i.id, kind: i.kind, team: team ? T.teamView(s, team) : null, from: from ? { id: from.id, name: from.name } : null };
          });
      }
      res.json(out);
    })
  );

  // Indicação de colegas do grupo: quem pode ser indicado (tem grupo, sem
  // equipe, confirmado). Só nome, curso e vínculo; a lista só sai para quem
  // também declarou grupo.
  app.get(
    "/hack/api/team/group-candidates",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      if (!a.person.hasGroup) throw new HackError(403, "no_group", "Só quem declarou ter grupo indica colegas.");
      const s = ctx.store.get();
      const people = s.people
        .filter((p) => p.id !== a.person.id && T.groupMate(s, p))
        .map((p) => ({ id: p.id, name: p.name, curso: p.curso, vinculo: p.vinculo }))
        .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
      res.json({ people });
    })
  );

  app.post(
    "/hack/api/team/indicate",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      const inv = ctx.store.mutate((s) => T.indicate(s, a.person.id, String(requireBody(req).personId || ""), ctx.now()));
      res.json({ ok: true, duplicate: inv.duplicate === true });
    })
  );

  app.post(
    "/hack/api/team/indications/:id/cancel",
    route((req, res) => {
      const a = ctx.requireActor(req, participant);
      assertOpen(a);
      ctx.store.mutate((s) => T.cancelIndication(s, req.params.id, a.person.id, ctx.now()));
      res.json({ ok: true });
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
        .map((p) => {
          const pending = (pred) => T.pendingGroup(s, pred).length;
          return {
            id: p.id, name: p.name, email: p.email, phone: p.phone, hasGroup: p.hasGroup,
            vinculo: p.vinculo || "", anoFaculdade: p.anoFaculdade || "", curso: p.curso || "",
            published: Boolean(p.profile && p.profile.published),
            // Indicações pendentes enviadas e recebidas: com grupo e as duas
            // zeradas, a organização cobra (ninguém indicado agora).
            groupSent: pending((i) => i.fromId === p.id),
            groupReceived: pending((i) => i.personId === p.id),
          };
        })
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
      const op = (s) => {
        const first = ids[0];
        const p = findPerson(s, first);
        if (!p || !p.roles.includes("participant")) throw new HackError(400, "not_participant", "Só participantes entram em equipes.");
        // Sem o campo nome (montada arrastando): "Equipe de <primeiro nome>".
        // Nome enviado em branco continua recusado (formulário "Montar equipe").
        const name = b.name === undefined ? T.groupTeamName(s, p, "Equipe de") : b.name;
        const team = T.createTeam(s, first, name, ctx.now());
        ids.slice(1).forEach((m) => {
          const q = findPerson(s, m);
          if (!q || !q.roles.includes("participant")) throw new HackError(400, "not_participant", "Só participantes entram em equipes.");
          T.join(s, team, m, ctx.now());
        });
        return team;
      };
      if (b.dryRun === true) return res.json({ cancelled: impactOf(op) });
      const t = ctx.store.mutate(op);
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  // Montagem por afinidade (instituição): prévia sem gravar nada; a
  // diretoria ajusta e confirma, e o lote é criado tudo ou nada.
  app.get(
    "/hack/api/admin/teams/affinity",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.sync();
      res.json(AF.preview(ctx.store.get()));
    })
  );

  app.post(
    "/hack/api/admin/teams/affinity",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const created = ctx.store.mutate((s) => AF.apply(s, b.teams, ctx.now()));
      res.json({ created: created.map((t) => T.teamView(ctx.store.get(), t, { code: true })) });
    })
  );

  app.patch(
    "/hack/api/admin/teams/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const op = (s) => {
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
      };
      if (b.dryRun === true) return res.json({ cancelled: impactOf(op) });
      const t = ctx.store.mutate(op);
      res.json({ team: t ? T.teamView(ctx.store.get(), t, { code: true }) : null });
    })
  );

  app.post(
    "/hack/api/admin/teams/:id/merge",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const op = (s) => T.merge(s, req.params.id, String(b.otherId || ""), ctx.now());
      if (b.dryRun === true) return res.json({ cancelled: impactOf(op) });
      const t = ctx.store.mutate(op);
      res.json({ team: T.teamView(ctx.store.get(), t, { code: true }) });
    })
  );

  app.delete(
    "/hack/api/admin/teams/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const op = (s) => T.disband(s, T.mustTeam(s, req.params.id), ctx.now());
      if (req.body && req.body.dryRun === true) return res.json({ cancelled: impactOf(op) });
      ctx.store.mutate(op);
      res.json({ ok: true });
    })
  );
};
