// Entrega (equipe), banca (jurados) e avaliação/resultado (diretoria).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { route, requireBody } = require("../util");
const { HackError, findPerson } = require("../people");
const T = require("../teams");
const E = require("../evaluation");
const { feedbackOf } = require("./reports");

const manage = (p) => p.manage;
const judge = (p) => p.judge;

module.exports = function registerEvaluation(app, ctx) {
  const filesDir = path.join(ctx.deps.storageDir, "hack-submissions");
  fs.mkdirSync(filesDir, { recursive: true });
  ctx.cleanOrphanFiles = () => {
    const list = ctx.store.get().orphanFiles || [];
    if (!list.length) return;
    ctx.store.mutate((s) => {
      s.orphanFiles = [];
    });
    list.forEach((f) => fs.promises.unlink(path.join(filesDir, f)).catch(() => {}));
  };

  const deadline = () => Date.parse(ctx.store.get().config.submissionDeadline);
  // Prazo geral (sem equipe) ou o da equipe, com eventual prorrogação.
  const beforeDeadline = (team) => ctx.now().getTime() <= (team ? E.deadlineFor(ctx.store.get(), team) : deadline());

  // Equipe da pessoa, confirmada, e dentro do prazo dela. A diretoria corrige
  // depois do prazo pelas rotas /admin (ou prorroga só a equipe).
  function myTeamForEdit(a, s, expectTeamId) {
    const t = T.teamOf(s, a.person.id);
    if (!t) throw new HackError(404, "no_team", "Você precisa estar numa equipe para entregar.");
    if (expectTeamId && t.id !== expectTeamId) throw new HackError(409, "team_changed", "Sua equipe mudou durante o envio. Envie de novo.");
    if (t.status !== "confirmed") throw new HackError(409, "team_not_confirmed", "Confirme a equipe (2 a 4 pessoas) antes de entregar.");
    if (ctx.now().getTime() > E.deadlineFor(s, t)) throw new HackError(409, "deadline_passed", "O prazo de entrega passou.");
    T.assertTeamsEditable(s);
    return t;
  }

  function submissionView(s, t, opts) {
    const sub = E.submissionOf(s, t.id);
    const v = {
      team: { id: t.id, name: t.name, status: t.status, size: t.members.length },
      projectName: sub ? sub.projectName : "",
      repoUrl: sub ? sub.repoUrl : "",
      videoUrl: sub ? sub.videoUrl : "",
      deployUrl: sub ? sub.deployUrl || "" : "",
      description: sub ? sub.description : "",
      slides: sub && sub.slides ? { name: sub.slides.name, size: sub.slides.size, url: "/hack/api/submissions/" + t.id + "/slides" } : null,
      complete: E.isComplete(sub),
      updatedAt: sub ? sub.updatedAt : null,
    };
    if (opts && opts.who && sub && sub.updatedBy) {
      const p = findPerson(s, sub.updatedBy);
      v.updatedBy = p ? p.name : "";
    }
    // Resumo de apoio à banca (escrito pela organização): banca e diretoria, nunca a equipe.
    if (opts && opts.summary) v.summary = sub ? sub.summary || "" : "";
    return v;
  }

  // ---------- entrega pela equipe ----------
  app.get(
    "/hack/api/team/submission",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const s = ctx.store.get();
      const t = T.teamOf(s, a.person.id);
      res.json({
        deadline: t && t.deadlineOverride && Date.parse(t.deadlineOverride) > deadline() ? t.deadlineOverride : s.config.submissionDeadline,
        open: beforeDeadline(t),
        maxSlidesMb: E.SLIDES_MAX / 1024 / 1024,
        submission: t ? submissionView(s, t, { who: true }) : null,
      });
    })
  );

  // Percentil da fase 1 para a equipe que não foi para a final (só depois que
  // a final abriu). Nota não sai: só a faixa.
  app.get(
    "/hack/api/team/result",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const s = ctx.store.get();
      const t = T.teamOf(s, a.person.id);
      // Retorno da organização para a equipe (o relatório interno não sai daqui).
      res.json(Object.assign(E.teamResult(s, t ? t.id : null), { feedback: feedbackOf(s, t ? t.id : null) }));
    })
  );

  app.put(
    "/hack/api/team/submission",
    route((req, res) => {
      const a = ctx.requireActor(req, (p) => p.participant);
      const fields = E.validateSubmissionFields(requireBody(req));
      const t = ctx.store.mutate((s) => {
        const team = myTeamForEdit(a, s);
        E.upsertSubmission(s, team.id, fields, a.person.id, ctx.now());
        return team;
      });
      res.json({ submission: submissionView(ctx.store.get(), t, { who: true }) });
    })
  );

  // Slides: corpo cru application/pdf (até 20 MB). Grava o arquivo primeiro
  // (assíncrono, fora do mutate) e só então registra; o anterior é apagado.
  // Autoriza ANTES de ler 20 MB do corpo.
  const slidesAuth = route((req, res, next) => {
    const a = ctx.requireActor(req, (p) => p.participant);
    myTeamForEdit(a, ctx.store.get());
    next();
  });

  app.post(
    "/hack/api/team/submission/slides",
    slidesAuth,
    express.raw({ type: "application/pdf", limit: E.SLIDES_MAX + 1024 }),
    route(async (req, res) => {
      const a = ctx.requireActor(req, (p) => p.participant);
      const t0 = myTeamForEdit(a, ctx.store.get());
      const buf = req.body;
      if (!E.isPdf(buf)) throw new HackError(400, "not_pdf", "Envie os slides em PDF.");
      if (buf.length > E.SLIDES_MAX) throw new HackError(413, "too_big", "O PDF passa de 20 MB.");
      // O navegador manda o nome com encodeURIComponent; aqui ele é decodificado
      // e limpo (vai para Content-Disposition, não para o disco).
      let rawName = String(req.get("x-file-name") || "slides.pdf");
      try {
        rawName = decodeURIComponent(rawName);
      } catch (e) {
        /* nome malformado: segue como veio */
      }
      const name = rawName.replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 100) || "slides.pdf";
      const file = t0.id + "-" + crypto.randomBytes(6).toString("hex") + ".pdf";
      await fs.promises.writeFile(path.join(filesDir, file), buf);
      let old = null;
      try {
        ctx.store.mutate((s) => {
          const team = myTeamForEdit(a, s, t0.id);
          const sub = E.submissionOf(s, team.id);
          old = sub && sub.slides ? sub.slides.file : null;
          E.upsertSubmission(s, team.id, { slides: { file, name, size: buf.length, uploadedAt: ctx.now().toISOString() } }, a.person.id, ctx.now());
        });
      } catch (err) {
        await fs.promises.unlink(path.join(filesDir, file)).catch(() => {});
        throw err;
      }
      if (old) fs.promises.unlink(path.join(filesDir, old)).catch(() => {});
      res.json({ submission: submissionView(ctx.store.get(), t0, { who: true }) });
    })
  );

  // Arquivo dos slides: a própria equipe e a diretoria sempre; jurados
  // depois do prazo (é o material da análise da banca).
  app.get(
    "/hack/api/submissions/:teamId/slides",
    route((req, res) => {
      const a = ctx.requireActor(req);
      const s = ctx.store.get();
      const t = T.findTeam(s, req.params.teamId);
      const sub = t ? E.submissionOf(s, t.id) : null;
      if (!sub || !sub.slides) throw new HackError(404, "not_found", "Slides não encontrados.");
      const allowed = a.perms.manage || t.members.includes(a.person.id) || (a.perms.judge && judgesMaySee(s));
      if (!allowed) throw new HackError(403, "forbidden", "Você não tem acesso a estes slides.");
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="' + sub.slides.name.replace(/"/g, "") + '"', "Cache-Control": "private, no-store" });
      res.sendFile(path.join(filesDir, sub.slides.file));
    })
  );

  // ---------- banca ----------
  // Banca só vê os projetos depois do prazo geral ou com a avaliação aberta:
  // um jurado que também compete não pode olhar o repositório rival no meio do evento.
  const judgesMaySee = (s) => s.config.evaluation.open || ctx.now().getTime() > Date.parse(s.config.submissionDeadline);
  app.get(
    "/hack/api/judge",
    route((req, res) => {
      const a = ctx.requireActor(req, judge);
      const s = ctx.store.get();
      const cfg = s.config.evaluation;
      const teams = (judgesMaySee(s) ? E.evaluableTeams(s) : []).map((t) => {
        const mine = s.scores.find((x) => x.judgeId === a.person.id && x.teamId === t.id && x.phase === cfg.phase);
        return Object.assign(submissionView(s, t, { summary: E.summaryVisibleTo(s, t.id, a.person.id) }), {
          conflict: E.hasConflict(s, a.person.id, t.id),
          // Só a própria nota volta: a de outro jurado nunca sai daqui.
          myScore: mine ? { values: mine.values, comment: mine.comment, updatedAt: mine.updatedAt, complete: E.scoreCovers(s, mine) } : null,
        });
      });
      res.json({
        visible: judgesMaySee(s),
        open: cfg.open,
        phase: cfg.phase,
        resultsLocked: cfg.resultsLocked,
        criteriaLocked: cfg.criteriaLocked,
        // Só os critérios desta fase e dos pilares deste jurado.
        criteria: cfg.criteriaLocked ? E.criteriaFor(s, a.person.id, cfg.phase) : [],
        pillars: E.PILLARS,
        teams,
        done: teams.filter((t) => (t.myScore && t.myScore.complete) || t.conflict).length,
      });
    })
  );

  app.put(
    "/hack/api/judge/scores/:teamId",
    route((req, res) => {
      const a = ctx.requireActor(req, judge);
      ctx.store.mutate((s) => E.submitScore(s, a.person.id, req.params.teamId, requireBody(req), ctx.now()));
      res.json({ ok: true });
    })
  );

  app.post(
    "/hack/api/judge/conflicts/:teamId",
    route((req, res) => {
      const a = ctx.requireActor(req, judge);
      ctx.store.mutate((s) => E.setConflict(s, a.person.id, req.params.teamId, requireBody(req).conflict === true, ctx.now()));
      res.json({ ok: true });
    })
  );

  // ---------- resultado público (depois da revelação) ----------
  app.get(
    "/hack/api/results",
    route((req, res) => {
      const s = ctx.store.get();
      res.json({ revealedAt: s.config.evaluation.revealedAt, podium: E.podium(s) });
    })
  );

  // ---------- diretoria ----------
  app.get(
    "/hack/api/admin/submissions",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const s = ctx.store.get();
      const list = s.teams
        .slice()
        .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
        .map((t) => submissionView(s, t, { who: true, summary: true }));
      res.json({ deadline: s.config.submissionDeadline, open: beforeDeadline(), submissions: list });
    })
  );

  // Correção pela diretoria (inclusive depois do prazo): campos da entrega.
  app.put(
    "/hack/api/admin/submissions/:teamId",
    route((req, res) => {
      const a = ctx.requireActor(req, manage);
      const body = requireBody(req);
      const fields = E.validateSubmissionFields(body);
      // Resumo de apoio à banca: só a diretoria grava, direto na entrega, sem
      // mexer em "atualizada por" (a equipe vê isso) nem criar entrega vazia.
      const summary = body.summary !== undefined ? String(body.summary || "").trim().slice(0, 4000) : undefined;
      ctx.store.mutate((s) => {
        T.mustTeam(s, req.params.teamId);
        if (summary !== undefined) {
          const sub = E.submissionOf(s, req.params.teamId);
          if (!sub) throw new HackError(404, "not_found", "A equipe ainda não entregou nada.");
          sub.summary = summary;
        }
        if (!Object.keys(fields).length) return;
        T.assertTeamsEditable(s);
        E.upsertSubmission(s, req.params.teamId, fields, a.person.id, ctx.now());
      });
      res.json({ ok: true });
    })
  );

  // Remove a entrega (ou só os slides, com ?only=slides). O arquivo é apagado.
  app.delete(
    "/hack/api/admin/submissions/:teamId",
    route(async (req, res) => {
      ctx.requireActor(req, manage);
      let file = null;
      ctx.store.mutate((s) => {
        T.assertTeamsEditable(s);
        const sub = E.submissionOf(s, req.params.teamId);
        if (!sub) throw new HackError(404, "not_found", "Entrega não encontrada.");
        file = sub.slides ? sub.slides.file : null;
        if (req.query.only === "slides") {
          sub.slides = null;
          sub.completedAt = null;
        } else {
          s.submissions = s.submissions.filter((x) => x.teamId !== req.params.teamId);
        }
      });
      if (file) await fs.promises.unlink(path.join(filesDir, file)).catch(() => {});
      res.json({ ok: true });
    })
  );

  app.put(
    "/hack/api/admin/config/deadline",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const t = Date.parse(requireBody(req).submissionDeadline);
      if (!Number.isFinite(t)) throw new HackError(400, "invalid_date", "Data inválida.");
      ctx.store.mutate((s) => {
        s.config.submissionDeadline = new Date(t).toISOString();
      });
      res.json({ submissionDeadline: ctx.store.get().config.submissionDeadline });
    })
  );

  function adminEvalView(s) {
    const cfg = s.config.evaluation;
    const judges = s.people.filter((p) => !p.disabled && p.roles.includes("judge"));
    const evaluable = E.evaluableTeams(s);
    return {
      config: {
        criteria: cfg.criteria,
        criteriaLocked: cfg.criteriaLocked,
        open: cfg.open,
        phase: cfg.phase,
        finalists: cfg.finalists,
        tiebreakCriterionId: cfg.tiebreakCriterionId,
        finalTiebreakCriterionId: cfg.finalTiebreakCriterionId,
        resultsLocked: cfg.resultsLocked,
        revealedAt: cfg.revealedAt,
        podiumSize: cfg.podiumSize,
        pillarMode: E.pillarMode(s),
        pillars: E.PILLARS,
        pillarFloor: E.PILLAR_FLOOR,
        finalistsTarget: E.FINALISTS_TARGET,
      },
      judges: judges.map((j) => {
        const pr = E.judgeProgress(s, j.id);
        return {
          id: j.id,
          name: j.name,
          pillars: E.judgePillars(j),
          has: pr.has,
          done: pr.done,
          total: pr.total,
          conflicts: s.conflicts.filter((c) => c.judgeId === j.id).map((c) => c.teamId),
        };
      }),
      ranking: E.ranking(s),
      evaluableCount: evaluable.length,
    };
  }

  app.get(
    "/hack/api/admin/evaluation",
    route((req, res) => {
      ctx.requireActor(req, manage);
      res.json(adminEvalView(ctx.store.get()));
    })
  );

  // Uma rota para as ações da avaliação: { action, ... }.
  app.post(
    "/hack/api/admin/evaluation",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      ctx.store.mutate((s) => {
        const cfg = s.config.evaluation;
        switch (b.action) {
          case "addCriterion":
            E.addCriterion(s, b);
            break;
          case "updateCriterion":
            E.updateCriterion(s, String(b.id || ""), b);
            break;
          case "removeCriterion":
            E.removeCriterion(s, String(b.id || ""));
            break;
          case "lockCriteria":
            E.lockCriteria(s, b.lock === true);
            break;
          case "tiebreak": {
            if (cfg.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
            if (b.phase !== undefined && !["main", "final"].includes(b.phase)) throw new HackError(400, "invalid_phase", "Fase inválida.");
            const ph = b.phase === "final" ? "final" : "main";
            if (!E.criteriaOf(s, ph).some((c) => c.id === b.id)) throw new HackError(400, "invalid", "Critério inválido para essa fase.");
            if (ph === "final") cfg.finalTiebreakCriterionId = b.id;
            else cfg.tiebreakCriterionId = b.id;
            break;
          }
          case "judgePillars":
            E.setJudgePillars(s, String(b.personId || ""), b.pillars);
            break;
          case "open":
            E.setOpen(s, b.open === true);
            break;
          case "finalists":
            E.setFinalists(s, b.teamIds);
            break;
          case "phase":
            E.setPhase(s, String(b.phase || ""));
            break;
          case "podium": {
            if (cfg.revealedAt) throw new HackError(409, "revealed", "O resultado já foi revelado.");
            const n = parseInt(b.podiumSize, 10);
            if (!(n >= 1 && n <= 10)) throw new HackError(400, "invalid", "Pódio de 1 a 10.");
            cfg.podiumSize = n;
            break;
          }
          case "lockResults":
            E.lockResults(s, b.lock === true, ctx.now());
            break;
          case "reveal":
            E.reveal(s, ctx.now());
            break;
          default:
            throw new HackError(400, "invalid_action", "Ação desconhecida.");
        }
      });
      res.json(adminEvalView(ctx.store.get()));
    })
  );
};
