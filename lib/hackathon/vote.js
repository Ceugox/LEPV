// Votação do público (Prêmio do público): separada da banca, não mexe no
// ranking dos jurados.
//
// As finalistas são as mesmas marcadas na aba Avaliação (config.evaluation
// .finalists); ao iniciar, a lista é copiada para a votação, e enquanto ela
// está aberta ninguém muda as finalistas. Votam os participantes das equipes
// que NÃO estão na final: um voto por pessoa, sem troca. Resultado só para a
// organização (a divulgação é no microfone). Empate não é desfeito aqui: a
// organização decide.
const { HackError, findPerson } = require("./people");
const { teamOf, findTeam } = require("./teams");
const { submissionOf } = require("./evaluation");

const voteCfg = (state) => state.config.popularVote;

// Motivo de não poder votar (null = pode). Vale no voto e de novo na
// contagem: quem passou para uma equipe finalista depois de votar não conta.
function blockReason(state, personId) {
  const p = findPerson(state, personId);
  if (!p || p.disabled || !p.roles.includes("participant")) return "not_participant";
  const t = teamOf(state, personId);
  if (!t) return "no_team";
  if (voteCfg(state).finalists.includes(t.id)) return "finalist";
  return null;
}

const canVote = (state, personId) => blockReason(state, personId) === null;

function finalistView(state, teamId) {
  const t = findTeam(state, teamId);
  const sub = submissionOf(state, teamId);
  return { id: teamId, name: t ? t.name : "(equipe removida)", projectName: sub ? sub.projectName : "" };
}

function open(state, byId, now) {
  const cfg = voteCfg(state);
  if (cfg.status === "open") throw new HackError(409, "vote_open", "A votação já está aberta.");
  if (cfg.status === "closed") throw new HackError(409, "vote_closed", "A votação foi encerrada. Use “Reabrir” ou “Zerar”.");
  const finalists = state.config.evaluation.finalists.filter((id) => findTeam(state, id));
  if (finalists.length < 2) throw new HackError(409, "no_finalists", "Marque pelo menos 2 finalistas na aba Avaliação.");
  Object.assign(cfg, { status: "open", finalists, openedAt: now.toISOString(), openedBy: byId, closedAt: null, closedBy: null, result: null });
}

function close(state, byId, now) {
  const cfg = voteCfg(state);
  if (cfg.status !== "open") throw new HackError(409, "vote_not_open", "A votação não está aberta.");
  Object.assign(cfg, { status: "closed", closedAt: now.toISOString(), closedBy: byId });
  cfg.result = tally(state);
}

// Encerrada por engano: volta a aceitar votos, com as mesmas finalistas e os
// votos já dados.
function reopen(state) {
  const cfg = voteCfg(state);
  if (cfg.status !== "closed") throw new HackError(409, "vote_not_closed", "Só dá para reabrir uma votação encerrada.");
  Object.assign(cfg, { status: "open", closedAt: null, closedBy: null, result: null });
}

// Ensaio antes do evento: apaga os votos e volta ao início.
function reset(state) {
  const cfg = voteCfg(state);
  if (cfg.status === "open") throw new HackError(409, "vote_open", "Encerre a votação antes de zerar.");
  Object.assign(cfg, { status: "idle", finalists: [], openedAt: null, openedBy: null, closedAt: null, closedBy: null, result: null });
  state.votes = [];
}

function cast(state, personId, teamId, now) {
  const cfg = voteCfg(state);
  if (cfg.status !== "open") throw new HackError(409, "vote_not_open", "A votação não está aberta.");
  const reason = blockReason(state, personId);
  if (reason === "finalist") throw new HackError(403, "finalist", "Integrantes de equipes finalistas não votam.");
  if (reason) throw new HackError(403, "cannot_vote", "Só participantes de equipes votam.");
  if (state.votes.some((v) => v.voterId === personId)) throw new HackError(409, "already_voted", "Você já votou.");
  if (!cfg.finalists.includes(teamId)) throw new HackError(400, "invalid_team", "Escolha uma das equipes finalistas.");
  const v = { voterId: personId, teamId, at: now.toISOString() };
  state.votes.push(v);
  return v;
}

// Contagem: só votos de quem ainda pode votar. Empatadas dividem a posição
// (tied: true) e a organização decide.
function tally(state) {
  const cfg = voteCfg(state);
  const valid = state.votes.filter((v) => cfg.finalists.includes(v.teamId) && canVote(state, v.voterId));
  const rows = cfg.finalists.map((id) => Object.assign(finalistView(state, id), { votes: valid.filter((v) => v.teamId === id).length }));
  rows.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "pt-BR"));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.position = prev && prev.votes === r.votes ? prev.position : i + 1;
  });
  rows.forEach((r) => {
    r.tied = rows.some((x) => x !== r && x.position === r.position);
  });
  const eligible = state.people.filter((p) => canVote(state, p.id)).length;
  return { rows, votes: valid.length, eligible };
}

// O que o participante vê: as finalistas só com a votação aberta (antes
// disso a lista ainda não foi anunciada) e nunca a contagem.
function ownView(state, personId) {
  const cfg = voteCfg(state);
  const mine = state.votes.find((v) => v.voterId === personId);
  return {
    status: cfg.status,
    reason: blockReason(state, personId),
    finalists: cfg.status === "open" ? cfg.finalists.map((id) => finalistView(state, id)) : [],
    myVote: mine ? finalistView(state, mine.teamId) : null,
  };
}

function adminView(state) {
  const cfg = voteCfg(state);
  const name = (id) => {
    const p = id ? findPerson(state, id) : null;
    return p ? p.name : null;
  };
  return {
    status: cfg.status,
    openedAt: cfg.openedAt,
    openedBy: name(cfg.openedBy),
    closedAt: cfg.closedAt,
    closedBy: name(cfg.closedBy),
    // Finalistas marcadas agora na Avaliação (antes de iniciar, é o que vai valer).
    markedFinalists: state.config.evaluation.finalists.map((id) => finalistView(state, id)),
    result: cfg.status === "closed" ? cfg.result : cfg.status === "open" ? tally(state) : null,
  };
}

module.exports = { blockReason, canVote, open, close, reopen, reset, cast, tally, ownView, adminView };
