const { id } = require("./store");
const { HackError } = require("./people");
const E = require("./evaluation");

function requireJudge(s, judgeId) {
  if (!E.activeJudge(s, judgeId)) throw new HackError(403, "forbidden", "Jurado sem acesso.");
}

function mustRound(s, roundId) {
  const r = s.liveRounds.find((item) => item.id === roundId);
  if (!r) throw new HackError(404, "round_not_found", "Rodada não encontrada.");
  return r;
}

function roundView(s, round) {
  if (!round) return null;
  const team = s.teams.find((t) => t.id === round.teamId);
  const sub = E.submissionOf(s, round.teamId);
  return {
    id: round.id, teamId: round.teamId, phase: round.phase, kind: round.kind,
    status: round.status, openedAt: round.openedAt, closedAt: round.closedAt,
    team: team ? { id: team.id, name: team.name, projectName: sub?.projectName || "",
      repoUrl: sub?.repoUrl || "", videoUrl: sub?.videoUrl || "",
      slides: sub?.slides ? { name: sub.slides.name, url: "/hack/api/submissions/" + team.id + "/slides" } : null } : null,
  };
}

// Só os critérios que a banca grava para este jurado nesta fase (pilares e fase), senão a
// confirmação nunca bate com a nota oficial e a rodada fica pendente para sempre.
function criteria(s, judgeId, phase) {
  return s.config.evaluation.criteriaLocked ? E.criteriaFor(s, judgeId, phase).map((c) => ({
    id: c.id, name: c.name, description: c.description, weight: c.weight, scaleMax: c.scaleMax,
    anchors: Array.isArray(c.anchors) ? c.anchors.slice() : [],
  })) : [];
}

function cfgView(s) {
  const c = s.config.evaluation;
  return { open: c.open, phase: c.phase, criteriaLocked: c.criteriaLocked, resultsLocked: c.resultsLocked };
}

// Rodada de outra fase, ou de equipe que saiu da avaliação: não é a atual, não pende e a nota
// congela (canWrite); comentários de complemento continuam aceitos.
function stale(s, r) {
  return r.phase !== s.config.evaluation.phase || !E.evaluableTeams(s).some((t) => t.id === r.teamId);
}

// Vale a nota oficial quando não há rascunho em edição, ou quando o rascunho em edição é mais
// velho que ela (nota dada depois pelo formulário da banca).
function officialWins(sc, d) {
  if (!sc) return false;
  if (!d || d.confirmedRevision === d.revision) return true;
  return Date.parse(sc.updatedAt) > Date.parse(d.updatedAt);
}

function getJudgeRound(s, judgeId, roundId) {
  requireJudge(s, judgeId);
  const r = mustRound(s, roundId);
  const notes = s.liveNotes.filter((n) => n.roundId === roundId && n.judgeId === judgeId)
    .map((n) => ({ id: n.id, text: n.text, opId: n.opId, createdAt: n.createdAt }));
  const d = s.liveDrafts.find((x) => x.roundId === roundId && x.judgeId === judgeId);
  const sc = s.scores.find((x) => x.teamId === r.teamId && x.judgeId === judgeId && x.phase === r.phase);
  // Sem rascunho em edição, a nota oficial é o ponto de partida: corrigida pelo formulário da
  // banca, não volta a valer o rascunho antigo na próxima confirmação.
  const draft = officialWins(sc, d)
    ? { values: { ...sc.values }, comment: sc.comment || "", revision: d ? d.revision : 0 }
    : d ? { values: { ...d.values }, comment: d.comment, revision: d.revision } : { values: {}, comment: "", revision: 0 };
  return { round: roundView(s, r), criteria: criteria(s, judgeId, r.phase), notes, notesRevision: notes.length,
    draft,
    score: sc ? { values: { ...sc.values }, comment: sc.comment, updatedAt: sc.updatedAt } : null,
    conflict: E.hasConflict(s, judgeId, r.teamId) };
}

function canWrite(s, judgeId, r, scores) {
  requireJudge(s, judgeId);
  const cfg = s.config.evaluation;
  if (!cfg.open) throw new HackError(409, "evaluation_closed", "A avaliação não está aberta.");
  if (cfg.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
  if (E.hasConflict(s, judgeId, r.teamId)) throw new HackError(409, "conflict", "Você está impedido nesta equipe.");
  if (scores && cfg.phase !== r.phase) throw new HackError(409, "phase_changed", "Esta rodada pertence a outra fase.");
}

function openRound(s, teamId, kind, now) {
  const cfg = s.config.evaluation;
  if (!cfg.open || !cfg.criteriaLocked || cfg.resultsLocked) throw new HackError(409, "evaluation_closed", "Abra a avaliação com critérios travados.");
  if (!["delivery", "pitch"].includes(kind)) throw new HackError(400, "invalid_kind", "Tipo de rodada inválido.");
  if ((cfg.phase === "main" && kind !== "delivery") || (cfg.phase === "final" && kind !== "pitch")) throw new HackError(409, "phase_kind_mismatch", "Use entrega na fase principal e pitch na fase final.");
  if (!E.evaluableTeams(s).some((t) => t.id === teamId)) throw new HackError(409, "not_evaluable", "Equipe fora desta fase.");
  // Rodada esquecida aberta na fase anterior não trava a primeira da fase nova.
  for (const old of s.liveRounds) if (old.status === "open" && stale(s, old)) { old.status = "closed"; old.closedAt = now.toISOString(); }
  const existing = s.liveRounds.find((r) => r.teamId === teamId && r.phase === cfg.phase);
  if (existing && existing.status === "open") return existing;
  if (s.liveRounds.some((r) => r.status === "open")) throw new HackError(409, "round_open", "Encerre a rodada atual antes de abrir outra.");
  // Equipe que já tem rodada (aberta antes, ou criada por jurado que avaliou direto): reabre a mesma,
  // com as observações e notas que já estão nela.
  if (existing) { existing.status = "open"; existing.openedAt = now.toISOString(); existing.closedAt = null; return existing; }
  const r = { id: id("lr"), teamId, kind, phase: cfg.phase, status: "open", openedAt: now.toISOString(), closedAt: null };
  s.liveRounds.push(r);
  return r;
}

// Todas as equipes abertas: o jurado avalia qualquer equipe da fase sem esperar a organização.
// A rodada nasce encerrada (não é "a atual" nem trava a próxima) e aceita nota enquanto a
// avaliação estiver aberta; uma por equipe e fase, compartilhada por todos os jurados.
function ensureTeamRound(s, judgeId, teamId, now) {
  requireJudge(s, judgeId);
  const cfg = s.config.evaluation;
  if (!cfg.open || !cfg.criteriaLocked || cfg.resultsLocked) throw new HackError(409, "evaluation_closed", "A avaliação não está aberta.");
  if (!E.evaluableTeams(s).some((t) => t.id === teamId)) throw new HackError(409, "not_evaluable", "Equipe fora desta fase.");
  const existing = s.liveRounds.find((r) => r.teamId === teamId && r.phase === cfg.phase);
  if (existing) return existing;
  const at = now.toISOString();
  const r = { id: id("lr"), teamId, kind: cfg.phase === "final" ? "pitch" : "delivery", phase: cfg.phase,
    status: "closed", openedAt: at, closedAt: at, byJudge: judgeId };
  s.liveRounds.push(r);
  return r;
}

function closeRound(s, roundId, now) {
  const r = mustRound(s, roundId);
  if (r.status !== "open") throw new HackError(409, "round_closed", "Rodada já encerrada.");
  r.status = "closed";
  r.closedAt = now.toISOString();
  return r;
}

function addNote(s, judgeId, roundId, body, now) {
  const r = mustRound(s, roundId);
  // Comentário continua aceito em rodada de fase anterior (complemento do jurado); só a nota congela.
  canWrite(s, judgeId, r, false);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const opId = typeof body.opId === "string" ? body.opId : "";
  if (!text || text.length > 3000 || !/^[a-zA-Z0-9_-]{8,128}$/.test(opId)) throw new HackError(400, "invalid_note", "Comentário ou identificador inválido.");
  const old = s.liveNotes.find((n) => n.roundId === roundId && n.judgeId === judgeId && n.opId === opId);
  if (old) {
    if (old.text !== text) throw new HackError(409, "op_conflict", "Este identificador já foi usado para outro comentário.");
    return old;
  }
  const note = { id: id("ln"), roundId, judgeId, opId, text, createdAt: now.toISOString() };
  s.liveNotes.push(note);
  return note;
}

function saveDraft(s, judgeId, roundId, body, now) {
  const r = mustRound(s, roundId);
  canWrite(s, judgeId, r, true);
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !body.values || Array.isArray(body.values) || typeof body.values !== "object" || typeof body.comment !== "string" || body.comment.length > 1000) throw new HackError(400, "invalid_draft", "Rascunho inválido.");
  const allowed = new Map(criteria(s, judgeId, r.phase).map((c) => [c.id, c]));
  for (const [key, value] of Object.entries(body.values)) {
    const c = allowed.get(key);
    // De 0,5 em 0,5, igual à banca (evaluation.submitScore).
    if (!c || typeof value !== "number" || !Number.isInteger(value * 2) || value < 1 || value > c.scaleMax) throw new HackError(400, "invalid_score", "Nota inválida.");
  }
  let d = s.liveDrafts.find((x) => x.roundId === roundId && x.judgeId === judgeId);
  if ((d ? d.revision : 0) !== body.revision) throw new HackError(409, "stale_revision", "O rascunho mudou; recarregue antes de salvar.");
  if (!d) { d = { roundId, judgeId, revision: 0 }; s.liveDrafts.push(d); }
  d.values = { ...body.values }; d.comment = body.comment; d.revision++; d.updatedAt = now.toISOString();
  return { values: { ...d.values }, comment: d.comment, revision: d.revision };
}

function scoreMatchesDraft(s, score, draft, judgeId, phase) {
  if (!score || !draft || !score.values || !draft.values || typeof draft.comment !== "string") return false;
  const ids = E.criteriaFor(s, judgeId, phase).map((c) => c.id);
  return ids.every((key) => score.values[key] === draft.values[key]) &&
    Object.keys(score.values).length === ids.length && score.comment === draft.comment.trim().slice(0, 1000);
}

function confirm(s, judgeId, roundId, body, now) {
  const r = mustRound(s, roundId);
  canWrite(s, judgeId, r, true);
  // Nota vale com a rodada aberta ou encerrada: só fecha quando a organização fecha a avaliação (canWrite).
  const d = s.liveDrafts.find((x) => x.roundId === roundId && x.judgeId === judgeId);
  if (body.confirm !== true || !d || !Number.isSafeInteger(body.revision) || d.revision !== body.revision) throw new HackError(409, "stale_revision", "Confirme a revisão atual do rascunho.");
  if (d.confirmedRevision === d.revision) {
    const existing = s.scores.find((x) => x.teamId === r.teamId && x.judgeId === judgeId && x.phase === r.phase);
    if (!scoreMatchesDraft(s, existing, d, judgeId, r.phase)) throw new HackError(409, "score_changed", "A nota oficial mudou; revise e salve novamente antes de confirmar.");
    return { values: { ...existing.values }, comment: existing.comment, updatedAt: existing.updatedAt };
  }
  const score = E.submitScore(s, judgeId, r.teamId, { values: d.values, comment: d.comment }, now);
  d.confirmedRevision = d.revision;
  return { values: { ...score.values }, comment: score.comment, updatedAt: score.updatedAt };
}

function judgeRoundStatus(s, judgeId, round) {
  const conflict = E.hasConflict(s, judgeId, round.teamId);
  const score = s.scores.find((item) => item.judgeId === judgeId && item.teamId === round.teamId && item.phase === round.phase);
  const scored = Boolean(score);
  const draft = s.liveDrafts.find((item) => item.roundId === round.id && item.judgeId === judgeId);
  // Pendente é o que o jurado ainda pode resolver: sem critério dele (pilares), rodada de outra
  // fase ou equipe fora da avaliação não pendem. Nota oficial diferente do rascunho já confirmado
  // é correção pelo formulário da banca, não pendência.
  const owes = E.criteriaFor(s, judgeId, round.phase).length > 0 && !stale(s, round);
  return { conflict, scored, pending: owes && !conflict && (!scored || !officialWins(score, draft)) };
}

function judgeView(s, person) {
  requireJudge(s, person.id);
  const rounds = s.liveRounds.map((r) => ({ ...roundView(s, r), ...judgeRoundStatus(s, person.id, r) }));
  return { me: { id: person.id, name: person.name }, config: cfgView(s),
    currentRound: rounds.find((r) => r.status === "open" && !stale(s, r)) || null, rounds, criteria: criteria(s, person.id, s.config.evaluation.phase),
    // Todas as equipes avaliáveis da fase, com a rodada delas quando já existe.
    teams: E.evaluableTeams(s).map((t) => {
      const r = s.liveRounds.find((x) => x.teamId === t.id && x.phase === s.config.evaluation.phase);
      const sub = E.submissionOf(s, t.id);
      return { id: t.id, name: t.name, projectName: (sub && sub.projectName) || "", roundId: r ? r.id : null,
        ...(r ? judgeRoundStatus(s, person.id, r) : { conflict: E.hasConflict(s, person.id, t.id), scored: false, pending: false }) };
    }) };
}

function adminView(s) {
  const rounds = s.liveRounds.map((r) => roundView(s, r));
  return { config: cfgView(s), currentRound: rounds.find((r) => r.status === "open" && !stale(s, r)) || null, rounds,
    teams: E.evaluableTeams(s).map((t) => ({ id: t.id, name: t.name })),
    judges: s.people.filter((p) => E.activeJudge(s, p.id)).map((p) => ({ id: p.id, name: p.name,
      pending: s.liveRounds.filter((r) => judgeRoundStatus(s, p.id, r).pending).map((r) => r.id) })) };
}

module.exports = { getJudgeRound, roundView, judgeView, adminView, openRound, ensureTeamRound, closeRound, addNote, saveDraft, confirm };
