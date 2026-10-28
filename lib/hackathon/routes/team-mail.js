// E-mail das equipes: a diretoria vê a prévia e dispara um e-mail por
// participante, em segundo plano, um por vez (limite do provedor). O
// resultado fica em lastTeamEmail de cada pessoa; só vai para quem ainda não
// recebeu, então clicar de novo não duplica e quem falhou vai de novo.
const { route, HackError } = require("../util");
const TM = require("../team-mail");
const T = require("../teams");

const OK = ["sent", "outbox"];

module.exports = function registerTeamMail(app, ctx) {
  const manage = (p) => p.manage;
  const job = { running: false, total: 0, done: 0, sent: 0, failed: 0, skipped: 0, startedAt: null, finishedAt: null };
  const delivered = (p) => Boolean(p.lastTeamEmail && OK.includes(p.lastTeamEmail.status));
  // Qualquer resultado que não seja entrega (failed, unknown, unconfigured) é falha.
  const failedLast = (p) => Boolean(p.lastTeamEmail && !OK.includes(p.lastTeamEmail.status));

  app.get(
    "/hack/api/admin/team-emails",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.sync();
      const s = ctx.store.get();
      const targets = TM.teamEmailTargets(s);
      const withTeam = targets.filter((p) => T.teamOf(s, p.id));
      const sample = withTeam[0] || targets[0];
      const m = sample ? TM.teamEmail(s, sample, ctx.publicBase(req)) : null;
      res.json({
        emailEnabled: ctx.mail.emailEnabled(),
        total: targets.length,
        withTeam: withTeam.length,
        withoutTeam: targets.length - withTeam.length,
        pending: targets.filter((p) => !delivered(p)).length,
        failed: targets.filter(failedLast).length,
        job: Object.assign({}, job),
        sample: m ? { to: sample.name, subject: m.subject, text: m.text } : null,
      });
    })
  );

  app.post(
    "/hack/api/admin/team-emails",
    route((req, res) => {
      ctx.requireActor(req, manage);
      if (!ctx.mail.emailEnabled()) throw new HackError(409, "email_disabled", "Envio de e-mail não configurado.");
      if (job.running) throw new HackError(409, "job_running", "Já existe um envio em andamento.");
      ctx.sync();
      const ids = TM.teamEmailTargets(ctx.store.get()).filter((p) => !delivered(p)).map((p) => p.id);
      const base = ctx.publicBase(req);
      Object.assign(job, { running: true, total: ids.length, done: 0, sent: 0, failed: 0, skipped: 0, startedAt: ctx.now().toISOString(), finishedAt: null, crashed: null });
      (async () => {
        for (const pid of ids) {
          // Estado lido na hora do envio: equipe mudada no meio do lote sai certa.
          const s = ctx.store.get();
          const p = s.people.find((x) => x.id === pid);
          if (!p || p.disabled || !p.email) {
            job.skipped += 1;
            job.done += 1;
            continue;
          }
          let result;
          try {
            const m = TM.teamEmail(s, p, base);
            result = await ctx.mail.sendEmail({
              to: p.email,
              subject: m.subject,
              text: m.text,
              html: ctx.mail.layout({
                base,
                preheader: m.hasTeam ? "Quem está na sua equipe e a programação de sexta e sábado." : "A programação de sexta e sábado, e como entrar numa equipe.",
                eyebrow: "1º Hackathon LEPV",
                title: m.title,
                titleEm: m.titleEm,
                paragraphs: m.paragraphs,
                facts: m.facts,
                after: m.after,
                cta: { label: "Abrir meu portal", url: base + "/hack/portal" },
                note: m.note,
              }),
            });
          } catch (err) {
            result = { status: "failed", error: (err && err.message) || String(err) || "erro sem mensagem" };
          }
          if (OK.includes(result.status)) job.sent += 1;
          else {
            job.failed += 1;
            ctx.report("hack:team-email", new Error(pid + ": " + result.status + (result.error ? " — " + result.error : "")));
          }
          ctx.store.mutate((st) => {
            const x = st.people.find((y) => y.id === pid);
            if (x) x.lastTeamEmail = { status: result.status, at: ctx.now().toISOString(), error: result.error ? String(result.error).slice(0, 200) : null };
          });
          job.done += 1;
          await new Promise((r) => setTimeout(r, 600));
        }
      })()
        .catch((err) => {
          // Lote interrompido no meio: o painel mostra, e quem ficou de fora segue pendente.
          job.crashed = String((err && err.message) || err);
          ctx.report("hack:team-email-batch", err instanceof Error ? err : new Error(job.crashed));
        })
        .finally(() => {
          job.running = false;
          job.finishedAt = ctx.now().toISOString();
        });
      res.status(202).json({ queued: ids.length });
    })
  );
};
