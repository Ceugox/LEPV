// Avisos do hackathon: composição, públicos, agendamento e recibos.
//
// Uma publicação lógica por aviso. Os destinatários são resolvidos no momento
// da publicação (quem se inscreveu depois do agendamento entra) e deduplicados
// por pessoa: quem é participante E jurado recebe uma vez por canal.
// Cada (aviso, pessoa, canal) vira um recibo em state.deliveries, com status
// próprio; a central do portal não depende de nenhum canal externo.
const { id } = require("./store");
const { HackError, cleanText, AUDIENCES } = require("./people");

const CHANNELS = ["email", "push", "whatsapp"];
// Publicação vencida há mais que isto (servidor fora do ar no horário) não
// sai sozinha: vira "overdue" e espera a organização decidir.
const GRACE_MS = 5 * 60 * 1000;

const AUDIENCE_LABEL = { participant: "Participantes", sponsor: "Patrocinadores", supporter: "Apoiadores", judge: "Jurados" };

function normalizeAudiences(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.includes("all")) return AUDIENCES.slice();
  const out = AUDIENCES.filter((a) => list.includes(a));
  if (!out.length) throw new HackError(400, "invalid_audience", "Escolha pelo menos um público.");
  return out;
}

function normalizeChannels(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  return { email: c.email === true, push: c.push === true, whatsapp: c.whatsapp === true };
}

function validateDraft(body, now) {
  const title = cleanText(body.title, 120);
  const text = String(body.body == null ? "" : body.body).trim().slice(0, 2000);
  if (title.length < 3) throw new HackError(400, "invalid_title", "Escreva um título.");
  if (text.length < 3) throw new HackError(400, "invalid_body", "Escreva o texto do aviso.");
  const urgent = body.urgent === true;
  const channels = normalizeChannels(body.channels);
  // Urgente marca push por padrão (a pessoa ainda precisa ter autorizado).
  if (urgent && !(body.channels && body.channels.push === false)) channels.push = true;
  let scheduledAt = null;
  if (body.scheduledAt) {
    const t = Date.parse(body.scheduledAt);
    if (!Number.isFinite(t)) throw new HackError(400, "invalid_date", "Data de agendamento inválida.");
    if (t <= now.getTime()) throw new HackError(400, "past_date", "O agendamento precisa ser no futuro.");
    scheduledAt = new Date(t).toISOString();
  }
  return { title, body: text, urgent, channels, audiences: normalizeAudiences(body.audiences), scheduledAt };
}

// Quem recebe: pessoas ativas com algum papel nos públicos. Diretoria e staff
// não entram como público: veem tudo pela organização.
function resolveRecipients(state, audiences) {
  return state.people.filter((p) => !p.disabled && p.roles.some((r) => audiences.includes(r)));
}

function canSee(ann, roles) {
  if (ann.status !== "published") return false;
  return roles.some((r) => ann.audiences.includes(r));
}

function createAnnouncement(state, draft, authorId, now) {
  const ann = Object.assign(
    { id: id("n"), authorId, createdAt: now.toISOString(), status: draft.scheduledAt ? "scheduled" : "draft", publishedAt: null, recipientCount: 0 },
    draft
  );
  state.announcements.push(ann);
  if (!draft.scheduledAt) publish(state, ann, now);
  return ann;
}

// Idempotente: publicar duas vezes não duplica recibos nem destinatários.
function publish(state, ann, now) {
  if (ann.status === "published") return ann;
  if (ann.status === "cancelled") throw new HackError(409, "cancelled", "Aviso cancelado.");
  const recipients = resolveRecipients(state, ann.audiences);
  ann.status = "published";
  ann.publishedAt = now.toISOString();
  ann.recipientCount = recipients.length;
  for (const p of recipients) {
    for (const ch of CHANNELS) {
      if (!ann.channels[ch]) continue;
      if (ch === "email" && !p.email) continue;
      if (ch === "whatsapp" && !p.phone) continue;
      if (ch === "push" && !state.pushSubs.some((s) => s.personId === p.id)) continue;
      if (state.deliveries.some((d) => d.announcementId === ann.id && d.personId === p.id && d.channel === ch)) continue;
      state.deliveries.push({
        id: id("d"),
        announcementId: ann.id,
        personId: p.id,
        channel: ch,
        status: "pending",
        attempts: 0,
        error: "",
        updatedAt: now.toISOString(),
      });
    }
  }
  return ann;
}

// Uma volta do agendador. Devolve os avisos publicados nesta volta.
function tick(state, now) {
  const published = [];
  const t = now.getTime();
  for (const ann of state.announcements) {
    if (ann.status !== "scheduled") continue;
    const at = Date.parse(ann.scheduledAt);
    if (at > t) continue;
    if (t - at <= GRACE_MS) {
      publish(state, ann, now);
      published.push(ann);
    } else {
      ann.status = "overdue";
    }
  }
  return published;
}

// Os dois avisos aprovados na especificação (21/10/2026), para participantes.
// Entram agendados; a organização pode editar o texto ou cancelar antes.
function seedAnnouncements(state) {
  if (state.announcements.length) return;
  const base = { audiences: ["participant"], channels: { email: false, push: true, whatsapp: false }, urgent: false, authorId: null, publishedAt: null, recipientCount: 0, seeded: true };
  state.announcements.push(
    Object.assign({ id: id("n"), createdAt: new Date().toISOString(), status: "scheduled", scheduledAt: "2026-10-30T18:00:00.000Z",
      title: "O hackathon começou!", body: "O hackathon começou! Confira a programação, o local e seu QR no portal." }, base),
    Object.assign({ id: id("n"), createdAt: new Date().toISOString(), status: "scheduled", scheduledAt: "2026-10-31T11:00:00.000Z",
      title: "Bom dia, Instituto 12!", body: "Bom dia! Confira a programação de hoje e acompanhe os avisos do hackathon." }, base)
  );
}

function deliveryStats(state, annId) {
  const out = {};
  for (const d of state.deliveries) {
    if (d.announcementId !== annId) continue;
    out[d.channel] = out[d.channel] || {};
    out[d.channel][d.status] = (out[d.channel][d.status] || 0) + 1;
  }
  return out;
}

module.exports = {
  CHANNELS,
  GRACE_MS,
  AUDIENCE_LABEL,
  validateDraft,
  normalizeAudiences,
  resolveRecipients,
  canSee,
  createAnnouncement,
  publish,
  tick,
  seedAnnouncements,
  deliveryStats,
};
