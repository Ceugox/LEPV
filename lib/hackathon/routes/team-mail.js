// E-mail das equipes: a diretoria vê a prévia e dispara um e-mail por
// participante, em segundo plano, um por vez (limite do provedor). O
// resultado fica em lastTeamEmail de cada pessoa; por padrão só vai para
// quem ainda não recebeu, então clicar de novo não duplica.
const { route, HackError } = require("../util");
const TM = require("../team-mail");

module.exports = function registerTeamMail(app, ctx) {
  const manage = (p) => p.manage;
  const job = { running: false, total: 0, done: 0, failed: 0, startedAt: null };
  const delivered = (p) => p.lastTeamEmail && ["sent", "outbox"].includes(p.lastTeamEmail.status);

  app.get(
    "/hack/api/admin/team-emails",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.sync();
      const s = ctx.store.get();
      const targets = TM.teamEmailTargets(s);
      const withTeam = targets.filter((p) => TM.teamEmail(s, p).hasTeam);
      const sample = withTeam[0] || targets[0];
      const m = sample ? TM.teamEmail(s, sample) : null;
      res.json({
        emailEnabled: ctx.mail.emailEnabled(),
        total: targets.length,
        withTeam: withTeam.length,
        withoutTeam: targets.length - withTeam.length,
        pending: targets.filter((p) => !delivered(p)).length,
        failed: targets.filter((p) => p.lastTeamEmail && p.lastTeamEmail.status === "failed").length,
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
      const force = Boolean(req.body && req.body.force === true);
      const ids = TM.teamEmailTargets(ctx.store.get()).filter((p) => force || !delivered(p)).map((p) => p.id);
      const base = ctx.publicBase(req);
      Object.assign(job, { running: true, total: ids.length, done: 0, failed: 0, startedAt: ctx.now().toISOString() });
      (async () => {
        for (const pid of ids) {
          let result;
          try {
            // Estado lido na hora do envio: equipe mudada no meio do lote sai certa.
            const s = ctx.store.get();
            const p = s.people.find((x) => x.id === pid);
            if (!p || p.disabled || !p.email) { job.done += 1; continue; }
            const m = TM.teamEmail(s, p);
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
            result = { status: "failed", error: err.message };
          }
          if (!["sent", "outbox"].includes(result.status)) {
            job.failed += 1;
            console.warn("[hack] e-mail de equipe não enviado para " + pid + ": " + result.status + (result.error ? " — " + result.error : ""));
          }
          ctx.store.mutate((s) => {
            const p = s.people.find((x) => x.id === pid);
            if (p) p.lastTeamEmail = { status: result.status, at: ctx.now().toISOString(), error: String(result.error || "").slice(0, 200) };
          });
          job.done += 1;
          await new Promise((r) => setTimeout(r, 600));
        }
      })().finally(() => {
        job.running = false;
      });
      res.status(202).json({ queued: ids.length });
    })
  );
};
