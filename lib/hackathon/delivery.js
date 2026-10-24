// Entrega dos avisos pelos canais externos (e-mail e Web Push).
//
// Roda em segundo plano: pega recibos "pending", envia FORA do mutate (rede é
// assíncrona) e só então grava o resultado. Regras:
//   - "sent": o provedor aceitou. Não prova leitura.
//   - "failed": recusado; tenta de novo até MAX_ATTEMPTS.
//   - "unknown": timeout/queda no meio do envio. Não reenvia sozinho (pode ter
//     chegado) nem marca como entregue: fica para a organização decidir.
//   - "unavailable": canal não configurado neste servidor.
// WhatsApp não passa por aqui: é envio assistido, marcado à mão no painel.
const MAX_ATTEMPTS = 3;

function createDelivery(ctx, push) {
  let running = false;
  let again = false;

  async function sendEmail(d, ann, person) {
    const r = await ctx.mail.sendEmail({
      to: person.email,
      subject: (ann.urgent ? "[Urgente] " : "") + ann.title + " · 1º Hackathon LEPV",
      text: ann.body + "\n\nVeja todos os avisos no portal: " + (process.env.HACK_PUBLIC_URL || "https://lepv.org") + "/hack/portal#avisos\n",
      html: ctx.mail.layout({
        title: ann.title,
        paragraphs: ann.body.split(/\n{2,}/),
        cta: { label: "Abrir o portal", url: (process.env.HACK_PUBLIC_URL || "https://lepv.org") + "/hack/portal#avisos" },
      }),
    });
    if (r.status === "outbox") return { status: "sent" };
    return r;
  }

  async function sendPush(d, ann, person) {
    if (!push.enabled()) return { status: "unavailable" };
    const subs = ctx.store.get().pushSubs.filter((s) => s.personId === person.id);
    if (!subs.length) return { status: "failed", error: "sem aparelho inscrito" };
    const payload = JSON.stringify({ title: ann.title, body: ann.body.slice(0, 180), url: "/hack/portal#avisos", tag: ann.id });
    const outcomes = await Promise.all(subs.map((s) => push.send(s, payload, ann.urgent)));
    // Aparelho que o serviço de push diz não existir mais sai da lista.
    const gone = subs.filter((s, i) => outcomes[i].gone).map((s) => s.id);
    if (gone.length) ctx.store.mutate((st) => { st.pushSubs = st.pushSubs.filter((s) => !gone.includes(s.id)); });
    if (outcomes.some((o) => o.status === "sent")) return { status: "sent" };
    if (outcomes.some((o) => o.status === "unknown")) return { status: "unknown", error: outcomes.map((o) => o.error).filter(Boolean).join("; ") };
    return { status: "failed", error: outcomes.map((o) => o.error).filter(Boolean).join("; ") };
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
      const state = ctx.store.get();
      // Push primeiro: é o canal dos urgentes e não tem limite de taxa.
      const batch = state.deliveries
        .filter((d) => (d.channel === "email" || d.channel === "push") && (d.status === "pending" || (d.status === "failed" && d.attempts < MAX_ATTEMPTS)))
        .sort((a, b) => (a.channel === b.channel ? 0 : a.channel === "push" ? -1 : 1))
        .slice(0, 40);
      for (const d of batch) {
        const ann = state.announcements.find((a) => a.id === d.announcementId);
        const person = state.people.find((p) => p.id === d.personId);
        let r;
        if (!ann || !person || person.disabled) r = { status: "skipped", error: "destinatário ou aviso indisponível" };
        else if (d.channel === "email") r = ctx.mail.emailEnabled() ? await sendEmail(d, ann, person) : { status: "unavailable" };
        else r = await sendPush(d, ann, person);
        ctx.store.mutate((st) => {
          const x = st.deliveries.find((y) => y.id === d.id);
          if (!x) return;
          x.attempts += 1;
          x.status = r.status === "unconfigured" ? "unavailable" : r.status;
          x.error = String(r.error || "").slice(0, 300);
          x.updatedAt = ctx.now().toISOString();
        });
        done += 1;
        // Respeita o limite de envio do provedor de e-mail.
        if (d.channel === "email") await new Promise((res) => setTimeout(res, 550));
      }
    } finally {
      running = false;
    }
    if (again) setImmediate(() => runOnce().catch((err) => console.error("[hack] entrega falhou:", err.message)));
    return done;
  }

  return { runOnce, MAX_ATTEMPTS };
}

module.exports = { createDelivery, MAX_ATTEMPTS };
