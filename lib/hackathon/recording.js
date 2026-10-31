// Sala de gravação do pitch: blocos de 15 min no sábado, das 9h30 às 13h.
// Cada equipe tem no máximo um horário; qualquer membro reserva, troca ou
// cancela. Bloco que já começou não aceita reserva, troca nem cancelamento.
// Sem horário livre, a equipe entra na fila: o horário que for liberado vai
// automaticamente para a primeira da fila (se ainda não começou).
const { HackError } = require("./people");
const { teamOf, findTeam } = require("./teams");

const DAY = "2026-10-31";
const FIRST = "09:30";
const END = "13:00";
const MINUTES = 15;
const OFFSET = "-03:00"; // Brasil sem horário de verão

const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

const SLOTS = [];
for (let m = toMin(FIRST); m + MINUTES <= toMin(END); m += MINUTES) SLOTS.push(toHm(m));

const startOf = (slot) => new Date(DAY + "T" + slot + ":00" + OFFSET);
const started = (slot, now) => startOf(slot).getTime() <= now.getTime();

// Reserva e fila de equipe que deixou de existir: se quem reservou está
// noutra equipe sem horário (junção de equipes), a reserva vai junto; senão
// sai, e o horário liberado segue para a fila. Roda numa mutação própria,
// antes da ação (routes/recording.js): dentro da ação, um erro desfaria a
// limpeza e o horário ficaria preso.
const bookingOf = (state, teamId) => state.recordings.find((b) => b.teamId === teamId) || null;
const orphan = (state, x) => !findTeam(state, x.teamId);
const needsPrune = (state) => state.recordings.some((b) => orphan(state, b)) || state.recordingQueue.some((q) => orphan(state, q));

function prune(state, now) {
  const freed = [];
  for (const b of state.recordings.filter((x) => orphan(state, x))) {
    const t = teamOf(state, b.byId);
    if (t && !bookingOf(state, t.id)) {
      b.teamId = t.id;
      state.recordingQueue = state.recordingQueue.filter((q) => q.teamId !== t.id);
    } else {
      state.recordings = state.recordings.filter((x) => x !== b);
      freed.push(b.slot);
    }
  }
  const queue = [];
  for (const q of state.recordingQueue) {
    const t = orphan(state, q) ? teamOf(state, q.byId) : findTeam(state, q.teamId);
    if (t && !bookingOf(state, t.id) && !queue.some((x) => x.teamId === t.id)) queue.push(Object.assign({}, q, { teamId: t.id }));
  }
  state.recordingQueue = queue;
  for (const slot of freed) promote(state, slot, now);
}

function promote(state, slot, now) {
  if (started(slot, now) || state.recordings.some((b) => b.slot === slot)) return null;
  const next = state.recordingQueue.shift();
  if (!next) return null;
  const b = { slot, teamId: next.teamId, byId: next.byId, at: now.toISOString(), fromQueue: true };
  state.recordings.push(b);
  return b;
}

function mustTeamOf(state, personId) {
  const t = teamOf(state, personId);
  if (!t) throw new HackError(409, "no_team", "Você precisa estar numa equipe para reservar a sala.");
  return t;
}

function book(state, personId, slot, now) {
  const t = mustTeamOf(state, personId);
  if (!SLOTS.includes(slot)) throw new HackError(400, "invalid_slot", "Horário inválido.");
  if (started(slot, now)) throw new HackError(409, "slot_past", "Esse horário já começou. Escolha outro.");
  const taken = state.recordings.find((b) => b.slot === slot);
  if (taken && taken.teamId === t.id) return taken;
  if (taken) throw new HackError(409, "slot_taken", "Outra equipe reservou esse horário agora. Escolha outro.");
  const mine = bookingOf(state, t.id);
  if (mine && started(mine.slot, now)) throw new HackError(409, "already_started", "O horário da sua equipe já começou: não dá para trocar.");
  if (mine) state.recordings = state.recordings.filter((b) => b !== mine);
  state.recordingQueue = state.recordingQueue.filter((q) => q.teamId !== t.id);
  const b = { slot, teamId: t.id, byId: personId, at: now.toISOString(), fromQueue: false };
  state.recordings.push(b);
  if (mine) promote(state, mine.slot, now);
  return b;
}

function cancel(state, personId, now) {
  const t = mustTeamOf(state, personId);
  const mine = bookingOf(state, t.id);
  if (!mine) throw new HackError(404, "no_booking", "Sua equipe não tem horário reservado.");
  if (started(mine.slot, now)) throw new HackError(409, "already_started", "O horário da sua equipe já começou: não dá para cancelar.");
  state.recordings = state.recordings.filter((b) => b !== mine);
  promote(state, mine.slot, now);
}

const freeSlots = (state, now) => SLOTS.filter((s) => !started(s, now) && !state.recordings.some((b) => b.slot === s));

function joinQueue(state, personId, now) {
  const t = mustTeamOf(state, personId);
  if (bookingOf(state, t.id)) throw new HackError(409, "has_booking", "Sua equipe já tem horário.");
  if (freeSlots(state, now).length) throw new HackError(409, "slots_free", "Ainda há horário livre: reserve direto.");
  if (!SLOTS.some((s) => !started(s, now))) throw new HackError(409, "closed", "Os horários de gravação acabaram.");
  if (!state.recordingQueue.some((q) => q.teamId === t.id)) state.recordingQueue.push({ teamId: t.id, byId: personId, at: now.toISOString() });
}

function leaveQueue(state, personId, now) {
  const t = mustTeamOf(state, personId);
  state.recordingQueue = state.recordingQueue.filter((q) => q.teamId !== t.id);
}

// Organização libera qualquer horário (inclusive já começado, para corrigir a
// grade); a fila só herda se o horário ainda não começou.
function release(state, slot, now) {
  if (!SLOTS.includes(slot)) throw new HackError(400, "invalid_slot", "Horário inválido.");
  const b = state.recordings.find((x) => x.slot === slot);
  if (!b) throw new HackError(404, "slot_free", "Esse horário já está livre.");
  state.recordings = state.recordings.filter((x) => x !== b);
  return promote(state, slot, now);
}

function slotStatus(state, slot, now) {
  const t = now.getTime();
  const s = startOf(slot).getTime();
  if (t >= s + MINUTES * 60000) return "past";
  if (t >= s) return "live";
  return state.recordings.some((b) => b.slot === slot) ? "taken" : "free";
}

const teamName = (state, teamId) => {
  const t = findTeam(state, teamId);
  return t ? t.name : "?";
};

// Participante vê a grade (ocupado ou livre, sem nomes) e a própria equipe.
function ownView(state, personId, now) {
  const t = teamOf(state, personId);
  const live = state.recordings.filter((b) => findTeam(state, b.teamId));
  const mine = t ? live.find((b) => b.teamId === t.id) : null;
  const queue = state.recordingQueue.filter((q) => findTeam(state, q.teamId));
  const pos = t ? queue.findIndex((q) => q.teamId === t.id) : -1;
  return {
    day: DAY,
    minutes: MINUTES,
    team: t ? { id: t.id, name: t.name } : null,
    mine: mine ? mine.slot : null,
    slots: SLOTS.map((slot) => {
      const st = slotStatus({ recordings: live }, slot, now);
      const b = live.find((x) => x.slot === slot);
      return { slot, status: st, mine: !!(mine && b === mine), booked: !!b };
    }),
    queue: { size: queue.length, position: pos === -1 ? null : pos + 1 },
  };
}

function adminView(state, now) {
  const live = state.recordings.filter((b) => findTeam(state, b.teamId));
  const person = (pid) => state.people.find((p) => p.id === pid);
  return {
    day: DAY,
    minutes: MINUTES,
    slots: SLOTS.map((slot) => {
      const b = live.find((x) => x.slot === slot);
      const by = b && person(b.byId);
      return {
        slot,
        status: slotStatus({ recordings: live }, slot, now),
        booking: b ? { teamId: b.teamId, team: teamName(state, b.teamId), by: by ? by.name : "?", at: b.at, fromQueue: b.fromQueue } : null,
      };
    }),
    queue: state.recordingQueue.filter((q) => findTeam(state, q.teamId)).map((q) => {
      const by = person(q.byId);
      return { teamId: q.teamId, team: teamName(state, q.teamId), by: by ? by.name : "?", at: q.at };
    }),
  };
}

module.exports = { DAY, MINUTES, SLOTS, startOf, needsPrune, book, cancel, joinQueue, leaveQueue, release, prune, ownView, adminView };
