// Equipes do hackathon: 2 a 4 participantes, uma equipe por pessoa.
//
// As mudanças de composição usam as funções daqui (join, leave, settle,
// merge, prune) dentro de um único store.mutate — é isso que impede duas
// aceitações simultâneas de estourar o limite ou colocar alguém em duas
// equipes. Depois do resultado travado, nada muda (assertTeamsEditable).
//
// Descoberta: só participantes sem equipe, que NÃO declararam ter grupo na
// inscrição (hasGroup) e que publicaram o perfil. Quem tem grupo entra pela
// equipe criada por um colega (código) — não aparece nem recebe convite.
const { id } = require("./store");
const { HackError, cleanText, findPerson } = require("./people");

const MIN = 2;
const MAX = 4;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode(state) {
  for (;;) {
    let c = "";
    const bytes = require("crypto").randomBytes(6);
    for (let i = 0; i < 6; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!state.teams.some((t) => t.code === c)) return c;
  }
}

const teamOf = (state, personId) => state.teams.find((t) => t.members.includes(personId)) || null;
const findTeam = (state, teamId) => state.teams.find((t) => t.id === teamId) || null;

function mustTeam(state, teamId) {
  const t = findTeam(state, teamId);
  if (!t) throw new HackError(404, "team_not_found", "Equipe não encontrada.");
  return t;
}

// Resultado travado congela a composição: mudar uma equipe do pódio depois
// disso mudaria o que foi (ou vai ser) anunciado.
function assertTeamsEditable(state) {
  if (state.config.evaluation.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado: as equipes não mudam mais.");
}

const hasSubmission = (state, teamId) => state.submissions.some((x) => x.teamId === teamId);

function mustParticipant(state, personId) {
  const p = findPerson(state, personId);
  if (!p || p.disabled || !p.roles.includes("participant")) {
    throw new HackError(403, "not_participant", "Só participantes confirmados entram em equipes.");
  }
  return p;
}

function discoverable(state, p) {
  return Boolean(
    p && !p.disabled && p.roles.includes("participant") && !p.hasGroup && p.profile && p.profile.published && !teamOf(state, p.id)
  );
}

function validName(state, raw, exceptId) {
  const name = cleanText(raw, 40);
  if (name.length < 2) throw new HackError(400, "invalid_name", "Dê um nome para a equipe (2 a 40 caracteres).");
  const clash = state.teams.find((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new HackError(409, "name_taken", "Já existe uma equipe com esse nome.");
  return name;
}

// Abaixo de 2 a equipe deixa de estar confirmada; vazia, deixa de existir.
// Vazia, a equipe some e a entrega dela sai junto (não fica órfã). Quem chega
// aqui com entrega: só "desfazer" da diretoria, que exige remover a entrega
// antes — leave() e prune() nunca esvaziam equipe que entregou.
function settle(state, t, now) {
  if (t.status === "confirmed" && t.members.length < MIN) {
    t.status = "forming";
    t.confirmedAt = null;
  }
  if (!t.members.includes(t.ownerId)) t.ownerId = t.members[0] || null;
  if (!t.members.length) {
    state.teams = state.teams.filter((x) => x.id !== t.id);
    cancelInvites(state, (i) => i.teamId === t.id, now);
    const sub = state.submissions.find((x) => x.teamId === t.id);
    if (sub) {
      state.submissions = state.submissions.filter((x) => x.teamId !== t.id);
      if (sub.slides) (state.orphanFiles = state.orphanFiles || []).push(sub.slides.file);
    }
  }
  if (t.members.length >= MAX) cancelInvites(state, (i) => i.teamId === t.id, now);
}

function cancelInvites(state, pred, now) {
  for (const i of state.invites) {
    if (i.status === "pending" && pred(i)) {
      i.status = "cancelled";
      i.decidedAt = now.toISOString();
    }
  }
}

// Entrada efetiva na equipe, com todas as checagens. Usada por código,
// convite aceito, pedido aceito e pela diretoria.
function join(state, t, personId, now) {
  assertTeamsEditable(state);
  // Inclusive pela diretoria: só participante ativo entra em equipe.
  mustParticipant(state, personId);
  const current = teamOf(state, personId);
  if (current && current.id === t.id) return t;
  if (current) throw new HackError(409, "already_in_team", "Essa pessoa já está em outra equipe.");
  if (t.members.length >= MAX) throw new HackError(409, "team_full", "A equipe já tem 4 pessoas.");
  t.members.push(personId);
  // Quem entrou numa equipe não fica com convites/pedidos soltos por aí.
  cancelInvites(state, (i) => i.personId === personId, now);
  settle(state, t, now);
  return t;
}

function leave(state, t, personId, now, opts) {
  if (!(opts && opts.prune)) assertTeamsEditable(state);
  if (!t.members.includes(personId)) throw new HackError(404, "not_member", "Essa pessoa não está na equipe.");
  // Último integrante saindo apagaria a equipe junto com a entrega dela.
  if (t.members.length === 1 && hasSubmission(state, t.id) && !(opts && opts.prune)) {
    throw new HackError(409, "has_submission", "A equipe já tem entrega: fale com a organização antes de desfazê-la.");
  }
  t.members = t.members.filter((m) => m !== personId);
  settle(state, t, now);
}

function createTeam(state, ownerId, name, now) {
  mustParticipant(state, ownerId);
  if (teamOf(state, ownerId)) throw new HackError(409, "already_in_team", "Você já está numa equipe.");
  const t = {
    id: id("e"),
    name: validName(state, name),
    code: newCode(state),
    members: [],
    ownerId,
    lookingFor: "",
    status: "forming",
    confirmedAt: null,
    createdAt: now.toISOString(),
  };
  state.teams.push(t);
  join(state, t, ownerId, now);
  return t;
}

function joinByCode(state, personId, code, now) {
  const c = String(code || "").trim().toUpperCase();
  const t = state.teams.find((x) => x.code === c);
  if (!t) throw new HackError(404, "invalid_code", "Código de equipe não encontrado.");
  return join(state, t, personId, now);
}

function confirm(state, t, now) {
  if (t.members.length < MIN || t.members.length > MAX) {
    throw new HackError(409, "team_size", "A equipe precisa ter de 2 a 4 pessoas para ser confirmada.");
  }
  t.status = "confirmed";
  t.confirmedAt = now.toISOString();
  return t;
}

// Convite (equipe → pessoa) ou pedido (pessoa → equipe), ambos pela descoberta.
function invite(state, t, fromId, personId, now) {
  if (!t.members.includes(fromId)) throw new HackError(403, "not_member", "Só quem está na equipe convida.");
  const p = findPerson(state, personId);
  if (!discoverable(state, p)) throw new HackError(409, "not_available", "Essa pessoa não está disponível para convites.");
  if (t.members.length >= MAX) throw new HackError(409, "team_full", "A equipe já tem 4 pessoas.");
  const dup = state.invites.find((i) => i.status === "pending" && i.teamId === t.id && i.personId === personId);
  if (dup) return dup;
  const inv = { id: id("i"), kind: "invite", teamId: t.id, personId, fromId, status: "pending", createdAt: now.toISOString(), decidedAt: null };
  state.invites.push(inv);
  return inv;
}

function request(state, t, personId, now) {
  const p = findPerson(state, personId);
  if (!discoverable(state, p)) {
    throw new HackError(409, "not_available", "Publique seu perfil (e esteja sem equipe) para pedir entrada. Se você já tem grupo, entre pelo código.");
  }
  if (t.members.length >= MAX) throw new HackError(409, "team_full", "A equipe já tem 4 pessoas.");
  const dup = state.invites.find((i) => i.status === "pending" && i.teamId === t.id && i.personId === personId);
  if (dup) return dup;
  const inv = { id: id("i"), kind: "request", teamId: t.id, personId, fromId: personId, status: "pending", createdAt: now.toISOString(), decidedAt: null };
  state.invites.push(inv);
  return inv;
}

// Quem decide: o convidado decide o convite; um membro da equipe decide o pedido.
function decide(state, invId, actorId, accept, now) {
  const inv = state.invites.find((i) => i.id === invId);
  if (!inv || inv.status !== "pending") throw new HackError(404, "invite_not_found", "Convite não encontrado ou já decidido.");
  const t = mustTeam(state, inv.teamId);
  const allowed = inv.kind === "invite" ? actorId === inv.personId : t.members.includes(actorId);
  if (!allowed) throw new HackError(403, "forbidden", "Você não pode decidir este convite.");
  if (!accept) {
    inv.status = "declined";
    inv.decidedAt = now.toISOString();
    return inv;
  }
  join(state, t, inv.personId, now);
  inv.status = "accepted";
  inv.decidedAt = now.toISOString();
  return inv;
}

// Diretoria: junta B em A (até 4), apaga B.
function merge(state, aId, bId, now) {
  assertTeamsEditable(state);
  const a = mustTeam(state, aId);
  const b = mustTeam(state, bId);
  if (a.id === b.id) throw new HackError(400, "same_team", "Escolha duas equipes diferentes.");
  if (hasSubmission(state, b.id)) throw new HackError(409, "has_submission", "A equipe “" + b.name + "” já entregou: remova a entrega dela antes de juntar.");
  if (a.members.length + b.members.length > MAX) throw new HackError(409, "team_full", "Juntas passariam de 4 pessoas.");
  const moving = b.members.slice();
  b.members = [];
  settle(state, b, now);
  moving.forEach((m) => join(state, a, m, now));
  return a;
}

// Quem deixou de ser participante (inscrição retirada, fila, bloqueio) sai da
// equipe — só ANTES do prazo de entrega. Depois do prazo a equipe avaliada é
// a que entregou: a limpeza automática não mexe (a diretoria decide à mão).
// E nunca apaga, sozinha, uma equipe que já entregou: o último integrante
// fica e a diretoria resolve. Devolve true se algo mudou.
function prune(state, now) {
  if (state.config.evaluation.resultsLocked) return false;
  if (now.getTime() > Date.parse(state.config.submissionDeadline)) return false;
  let changed = false;
  for (const t of state.teams.slice()) {
    for (const m of t.members.slice()) {
      const p = state.people.find((x) => x.id === m);
      if (p && !p.disabled && p.roles.includes("participant")) continue;
      if (t.members.length === 1 && hasSubmission(state, t.id)) continue;
      leave(state, t, m, now, { prune: true });
      changed = true;
    }
  }
  return changed;
}

function teamView(state, t, opts) {
  const o = opts || {};
  const members = t.members.map((m) => {
    const p = findPerson(state, m);
    const v = { id: m, name: p ? p.name : "?", owner: m === t.ownerId };
    if (p && p.profile) v.skills = p.profile.skills || [];
    if (o.contacts && p) Object.assign(v, { email: p.email, phone: p.phone });
    return v;
  });
  const v = { id: t.id, name: t.name, members, size: t.members.length, status: t.status, lookingFor: t.lookingFor, open: t.members.length < MAX };
  if (o.code) v.code = t.code;
  return v;
}

function profileView(p) {
  return { id: p.id, name: p.name, curso: p.curso, vinculo: p.vinculo, bio: p.profile.bio, skills: p.profile.skills, interests: p.profile.interests };
}

function validateProfile(body) {
  const list = (v) =>
    (Array.isArray(v) ? v : String(v || "").split(","))
      .map((x) => cleanText(x, 30))
      .filter(Boolean)
      .slice(0, 8);
  return {
    published: body.published === true,
    bio: String(body.bio || "").trim().slice(0, 300),
    skills: list(body.skills),
    interests: list(body.interests),
  };
}

module.exports = {
  MIN,
  MAX,
  teamOf,
  findTeam,
  mustTeam,
  discoverable,
  validName,
  createTeam,
  joinByCode,
  join,
  leave,
  confirm,
  invite,
  request,
  decide,
  merge,
  prune,
  settle,
  assertTeamsEditable,
  hasSubmission,
  teamView,
  profileView,
  validateProfile,
};
