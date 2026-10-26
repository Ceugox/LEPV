// Entrega dos avisos pelos canais externos (e-mail e Web Push).
//
// Roda em segundo plano. Cada recibo passa por:
//   pending → sending (gravado ANTES de enviar) → sent | failed | unknown
// Gravar "sending" antes é o que impede reenvio em loop: se a gravação do
// resultado falhar, o recibo fica em "sending" e não é escolhido de novo; no
// próximo boot vira "unknown" (pode ter saído). Regras:
//   - "sent": o provedor aceitou. Não prova leitura.
//   - "failed": recusado ou sem conexão; tenta de novo com espera crescente
//     até MAX_ATTEMPTS.
//   - "unknown": timeout no meio do envio. Não reenvia sozinho (pode ter
//     chegado) nem conta como entregue; a organização reenvia ou descarta.
//   - "unavailable": canal não configurado neste servidor.
// WhatsApp não passa por aqui: é envio assistido, marcado à mão no painel.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 60 * 1000, 5 * 60 * 1000];

function createDelivery(ctx, push) {
  let running = false;
  let again = false;

  // Recibos que ficaram em "sending" por queda do processo.
  ctx.store.mutate((s) => {
    for (const d of s.deliveries) {
      if (d.status === "sending") {
        d.status = "unknown";
        d.error = "processo reiniciou durante o envio";
      }
    }
  });

  async function sendEmail(ann, person) {
    const url = ctx.baseUrl() + "/hack/portal#avisos";
    const r = await ctx.mail.sendEmail({
      to: person.email,
      subject: (ann.urgent ? "[Urgente] " : "") + ann.title + " · 1º Hackathon LEPV",
      text: ann.body + "\n\nVeja todos os avisos no portal: " + url + "\n",
      html: ctx.mail.layout({
        base: ctx.baseUrl(),
        preheader: ann.body.replace(/\s+/g, " ").slice(0, 120),
        eyebrow: ann.urgent ? "Urgente" : "Aviso da organização",
        urgent: ann.urgent,
        title: ann.title,
        paragraphs: ann.body.split(/\n{2,}/),
        cta: { label: "Abrir o portal", url },
      }),
    });
    if (r.status === "outbox") return { status: "sent" };
    if (r.status === "unconfigured") return { status: "unavailable" };
    return r;
  }

  async function sendPush(ann, person) {
    if (!push.enabled()) return { status: "unavailable" };
    const subs = ctx.store.get().pushSubs.filter((s) => s.personId === person.id);
    if (!subs.length) return { status: "failed", error: "sem aparelho inscrito" };
    const payload = JSON.stringify({ title: ann.title, body: ann.body.slice(0, 180), url: "/hack/portal#avisos", tag: ann.id });
    const outcomes = await Promise.all(subs.map((s) => push.send(s, payload, ann.urgent)));
    // Aparelho que o serviço de push diz não existir mais sai da lista.
    const gone = subs.filter((s, i) => outcomes[i].gone).map((s) => s.id);
    if (gone.length) ctx.store.mutate((st) => { st.pushSubs = st.pushSubs.filter((s) => !gone.includes(s.id)); });
    const errors = outcomes.map((o) => o.error).filter(Boolean).join("; ");
    if (outcomes.some((o) => o.status === "sent")) return { status: "sent" };
    if (outcomes.some((o) => o.status === "unknown")) return { status: "unknown", error: errors };
    return { status: "failed", error: errors };
  }

  function due(d, t) {
    if (d.channel !== "email" && d.channel !== "push") return false;
    if (d.status === "pending") return true;
    return d.status === "failed" && d.attempts < MAX_ATTEMPTS && (!d.nextAttemptAt || Date.parse(d.nextAttemptAt) <= t);
  }

  async function runOnce() {
    // Pedido durante uma volta não se perde: roda outra logo depois.
    if (running) {
      again = true;
      return 0;
    }
    running = true;
    again = false;
    let done = 0;
    try {
      const t = ctx.now().getTime();
      // Push primeiro: é o canal dos urgentes e não tem limite de taxa.
      const ids = ctx.store
        .get()
        .deliveries.filter((d) => due(d, t))
        .sort((a, b) => (a.channel === b.channel ? 0 : a.channel === "push" ? -1 : 1))
        .slice(0, 40)
        .map((d) => d.id);
      for (const did of ids) {
        const claimed = ctx.store.mutate((s) => {
          const d = s.deliveries.find((x) => x.id === did);
          if (!d || !due(d, ctx.now().getTime())) return null;
          d.status = "sending";
          d.attempts += 1;
          d.updatedAt = ctx.now().toISOString();
          return Object.assign({}, d);
        });
        if (!claimed) continue;
        const state = ctx.store.get();
        const ann = state.announcements.find((a) => a.id === claimed.announcementId);
        const person = state.people.find((p) => p.id === claimed.personId);
        let r;
        try {
          if (!ann || !person || person.disabled) r = { status: "skipped", error: "destinatário ou aviso indisponível" };
          else if (claimed.channel === "email") r = ctx.mail.emailEnabled() ? await sendEmail(ann, person) : { status: "unavailable" };
          else r = await sendPush(ann, person);
        } catch (err) {
          r = { status: "unknown", error: err.message };
        }
        ctx.store.mutate((s) => {
          const x = s.deliveries.find((y) => y.id === did);
          if (!x) return;
          x.status = r.status;
          x.error = String(r.error || "").slice(0, 300);
          x.updatedAt = ctx.now().toISOString();
          x.nextAttemptAt = r.status === "failed" && x.attempts < MAX_ATTEMPTS ? new Date(ctx.now().getTime() + BACKOFF_MS[x.attempts]).toISOString() : null;
        });
        done += 1;
        // Respeita o limite de envio do provedor de e-mail.
        if (claimed.channel === "email") await new Promise((res) => setTimeout(res, 550));
      }
    } finally {
      running = false;
    }
    if (again) setImmediate(() => runOnce().catch((err) => ctx.report("hack:delivery", err)));
    return done;
  }

  return { runOnce, MAX_ATTEMPTS };
}

module.exports = { createDelivery, MAX_ATTEMPTS, BACKOFF_MS };
