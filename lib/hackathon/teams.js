// Equipes do hackathon: 2 a 4 participantes, uma equipe por pessoa.
//
// As mudanças de composição usam as funções daqui (join, leave, settle,
// merge, prune) dentro de um único store.mutate — é isso que impede duas
// aceitações simultâneas de estourar o limite ou colocar alguém em duas
// equipes. Depois do resultado travado, nada muda (assertTeamsEditable).
//
// Descoberta: só participantes sem equipe, que NÃO declararam ter grupo na
// inscrição (hasGroup) e que publicaram o perfil. Quem tem grupo entra pela
// equipe criada por um colega (código) ou pela indicação: indica os colegas
// do grupo entre os inscritos que também têm grupo, e o indicado aceita
// (convite do tipo "group", sem equipe até o primeiro aceite).
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

const active = (p) => Boolean(p && !p.disabled && p.roles.includes("participant"));

function mustParticipant(state, personId) {
  const p = findPerson(state, personId);
  if (!active(p)) {
    throw new HackError(403, "not_participant", "Só participantes confirmados entram em equipes.");
  }
  return p;
}

function discoverable(state, p) {
  return Boolean(
    active(p) && !p.hasGroup && p.profile && p.profile.published && !teamOf(state, p.id)
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
  if (t.members.length >= MAX) {
    cancelInvites(state, (i) => i.teamId === t.id, now);
    // Indicações feitas por quem está na equipe cheia não têm mais vaga.
    for (const i of pendingGroup(state, (x) => t.members.includes(x.fromId))) {
      i.status = "cancelled";
      i.decidedAt = now.toISOString();
      i.reason = "team_full";
    }
    // Cortes feitos nesta mesma operação (ex.: junção da diretoria, uma
    // pessoa por vez) como "vaga reservada" viram "equipe cheia": lotou.
    for (const i of state.invites) {
      if (i.kind === "group" && i.status === "cancelled" && i.reason === "seats_reserved" && i.decidedAt === now.toISOString() && t.members.includes(i.fromId)) {
        i.reason = "team_full";
      }
    }
  }
}

const pendingGroup = (state, pred) => state.invites.filter((i) => i.status === "pending" && i.kind === "group" && pred(i));

// Pessoas indicadas por um lado (equipe ou pessoa sozinha), sem repetição.
const indicatedBy = (state, side) => new Set(pendingGroup(state, (i) => side.includes(i.fromId)).map((i) => i.personId));

// Depois que alguém entra, as indicações de todos da equipe contam juntas:
// uma por pessoa indicada (vale a mais antiga; a repetida, de outro colega,
// é cancelada) e, se integrantes + indicados passarem de 4, caem as mais
// novas. Quem perdeu a indicação não fica com um aceite que daria erro.
function trimIndications(state, t, now) {
  // O motivo fica gravado: o portal avisa quem indicou e quem foi indicado
  // ("duplicate" não avisa: a outra indicação para a mesma pessoa segue valendo).
  const drop = (i, reason) => { i.status = "cancelled"; i.decidedAt = now.toISOString(); i.reason = reason; };
  const pend = pendingGroup(state, (i) => t.members.includes(i.fromId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const seen = new Set();
  const keep = [];
  for (const i of pend) {
    if (seen.has(i.personId)) drop(i, "duplicate");
    else { seen.add(i.personId); keep.push(i); }
  }
  const extra = t.members.length + keep.length - MAX;
  const why = t.members.length >= MAX ? "team_full" : "seats_reserved";
  if (extra > 0) keep.slice(-extra).forEach((i) => drop(i, why));
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
  trimIndications(state, t, now);
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
  // Indicação é do grupo de quem indicou: quem sai leva as dele embora (a
  // equipe não fica com pendência que não vê nem cancela).
  cancelInvites(state, (i) => i.kind === "group" && i.fromId === personId, now);
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

// ---------- grupo declarado: indicação de colegas ----------

// Pode ser indicado: participante ativo que declarou ter grupo e está sem equipe.
function groupMate(state, p) {
  return active(p) && Boolean(p.hasGroup) && !teamOf(state, p.id);
}

// Lado de quem indica: a equipe dele, ou só ele enquanto não há equipe.
function groupSide(state, personId) {
  const t = teamOf(state, personId);
  return t ? t.members : [personId];
}

function indicate(state, fromId, personId, now) {
  assertTeamsEditable(state);
  const from = mustParticipant(state, fromId);
  if (!from.hasGroup) throw new HackError(403, "no_group", "Só quem declarou ter grupo na inscrição indica colegas.");
  if (fromId === personId) throw new HackError(400, "same_person", "Indique os colegas, não você.");
  const p = findPerson(state, personId);
  if (!groupMate(state, p)) {
    throw new HackError(409, "not_available", "Essa pessoa não pode ser indicada: ela precisa estar inscrita e confirmada, ter marcado que tem grupo e estar sem equipe.");
  }
  const side = groupSide(state, fromId);
  const dup = pendingGroup(state, (i) => side.includes(i.fromId) && i.personId === personId)[0];
  if (dup) return Object.assign({ duplicate: true }, dup);
  if (pendingGroup(state, (i) => i.fromId === personId && i.personId === fromId).length) {
    throw new HackError(409, "already_indicated_you", p.name + " já indicou você: aceite a indicação dele(a) aqui na página.");
  }
  if (side.length + indicatedBy(state, side).size >= MAX) {
    throw new HackError(409, "team_full", "O grupo passaria de 4 pessoas (contando as indicações ainda sem resposta).");
  }
  const inv = { id: id("i"), kind: "group", teamId: null, personId, fromId, status: "pending", createdAt: now.toISOString(), decidedAt: null };
  state.invites.push(inv);
  return inv;
}

// Nome provisório da equipe criada pelo primeiro aceite; o grupo troca depois.
// Cabe nos 40 caracteres do nome mesmo com sufixo de desempate.
function groupTeamName(state, owner) {
  const first = (String(owner.name || "").trim().split(/\s+/)[0] || "Equipe").slice(0, 24);
  const base = "Grupo de " + first;
  const taken = (n) => state.teams.some((t) => t.name.toLowerCase() === n.toLowerCase());
  if (!taken(base)) return base;
  for (let k = 2; ; k++) if (!taken(base + " " + k)) return base + " " + k;
}

function acceptGroup(state, inv, now) {
  const from = findPerson(state, inv.fromId);
  if (!active(from)) {
    throw new HackError(409, "sender_gone", "Quem indicou você não está mais inscrito(a).");
  }
  const t = teamOf(state, inv.fromId) || createTeam(state, inv.fromId, groupTeamName(state, from), now);
  join(state, t, inv.personId, now);
  return t;
}

// Quem indicou (ou alguém da equipe dele) desiste da indicação.
function cancelIndication(state, invId, actorId, now) {
  assertTeamsEditable(state);
  const inv = state.invites.find((i) => i.id === invId && i.kind === "group");
  if (!inv || inv.status !== "pending") throw new HackError(404, "invite_not_found", "Indicação não encontrada ou já decidida.");
  if (!groupSide(state, actorId).includes(inv.fromId)) throw new HackError(403, "forbidden", "Só o grupo que indicou cancela.");
  inv.status = "cancelled";
  inv.decidedAt = now.toISOString();
  return inv;
}

// Quem decide: o convidado decide o convite e a indicação; um membro da
// equipe decide o pedido.
function decide(state, invId, actorId, accept, now) {
  const inv = state.invites.find((i) => i.id === invId);
  if (!inv || inv.status !== "pending") throw new HackError(404, "invite_not_found", "Convite não encontrado ou já decidido.");
  if (inv.kind === "group") {
    if (actorId !== inv.personId) throw new HackError(403, "forbidden", "Você não pode decidir esta indicação.");
    if (accept) {
      assertTeamsEditable(state);
      acceptGroup(state, inv, now);
    }
    inv.status = accept ? "accepted" : "declined";
    inv.decidedAt = now.toISOString();
    return inv;
  }
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

// Diretoria desfaz a equipe: as indicações feitas por quem estava nela saem
// junto (senão um aceite depois criaria outra equipe com o nome de alguém).
function disband(state, t, now) {
  assertTeamsEditable(state);
  if (hasSubmission(state, t.id)) throw new HackError(409, "has_submission", "A equipe já entregou: remova a entrega antes (aba Entregas).");
  cancelInvites(state, (i) => i.kind === "group" && t.members.includes(i.fromId), now);
  t.members = [];
  settle(state, t, now);
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
  // Indicação cujo autor ou indicado deixou de poder participar não serve
  // mais: cancela (senão o aceite falharia para sempre e a pendência
  // esconderia da organização que ninguém foi indicado).
  for (const i of pendingGroup(state, () => true)) {
    const from = state.people.find((x) => x.id === i.fromId);
    const to = state.people.find((x) => x.id === i.personId);
    if (active(from) && active(to)) continue;
    i.status = "cancelled";
    i.decidedAt = now.toISOString();
    changed = true;
  }
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

// Indicações cortadas (equipe lotou ou vagas já reservadas por outras
// indicações) nas últimas 48 h, do ponto de vista de quem pergunta: as que
// recebeu (mine) e as que o lado dele fez.
const LOST_REASONS = ["team_full", "seats_reserved"];
const LOST_WINDOW_MS = 48 * 3600 * 1000;
function lostSeatsFor(state, personId, now) {
  const side = groupSide(state, personId);
  return state.invites
    .filter((i) => i.kind === "group" && i.status === "cancelled" && LOST_REASONS.includes(i.reason)
      && now.getTime() - Date.parse(i.decidedAt) < LOST_WINDOW_MS
      && (i.personId === personId || side.includes(i.fromId)))
    .map((i) => {
      const mine = i.personId === personId;
      const other = findPerson(state, mine ? i.fromId : i.personId);
      return { id: i.id, mine, reason: i.reason, name: other ? other.name : "?" };
    });
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
  groupMate,
  pendingGroup,
  groupSide,
  indicate,
  cancelIndication,
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
  disband,
  lostSeatsFor,
  prune,
  settle,
  assertTeamsEditable,
  hasSubmission,
  teamView,
  profileView,
  validateProfile,
};
