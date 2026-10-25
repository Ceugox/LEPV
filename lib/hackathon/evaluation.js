// Entrega dos projetos e avaliação pela banca.
//
// Entrega: uma por equipe confirmada — repositório (obrigatório), slides em
// PDF até 20 MB (obrigatório), vídeo/demo (opcional) e descrição. Participante
// edita até o prazo; depois só a diretoria.
//
// Avaliação: critérios cadastrados pela diretoria e TRAVADOS antes de abrir
// (ninguém dá nota com régua diferente). Cada jurado vê só as próprias notas
// e se declara impedido (conflito) com equipes. Ranking: para cada jurado, a
// média ponderada normalizada (0–100); a nota da equipe é a média entre os
// jurados que avaliaram. Desempate pelo critério escolhido, depois pelo número
// de jurados. Fase final opcional: com finalistas marcados, vale a nota da
// final para eles.
const { id } = require("./store");
const { HackError, cleanText } = require("./people");
const { isHttpUrl } = require("./util");

const SLIDES_MAX = 20 * 1024 * 1024;

// ---------- entrega ----------
function submissionOf(state, teamId) {
  return state.submissions.find((x) => x.teamId === teamId) || null;
}

function isComplete(sub) {
  return Boolean(sub && sub.repoUrl && sub.slides);
}

function validateSubmissionFields(body) {
  const out = {};
  if (body.repoUrl !== undefined) {
    const u = String(body.repoUrl || "").trim().slice(0, 300);
    if (u && !isHttpUrl(u)) throw new HackError(400, "invalid_repo", "Link do repositório inválido (use https://...).");
    out.repoUrl = u;
  }
  if (body.videoUrl !== undefined) {
    const u = String(body.videoUrl || "").trim().slice(0, 300);
    if (u && !isHttpUrl(u)) throw new HackError(400, "invalid_video", "Link do vídeo inválido (use https://...).");
    out.videoUrl = u;
  }
  if (body.description !== undefined) out.description = String(body.description || "").trim().slice(0, 500);
  if (body.projectName !== undefined) out.projectName = cleanText(body.projectName, 80);
  return out;
}

function upsertSubmission(state, teamId, fields, byId, now) {
  let sub = submissionOf(state, teamId);
  if (!sub) {
    sub = { teamId, projectName: "", repoUrl: "", videoUrl: "", description: "", slides: null, createdAt: now.toISOString() };
    state.submissions.push(sub);
  }
  Object.assign(sub, fields, { updatedAt: now.toISOString(), updatedBy: byId });
  if (isComplete(sub) && !sub.completedAt) sub.completedAt = now.toISOString();
  if (!isComplete(sub)) sub.completedAt = null;
  return sub;
}

function isPdf(buf) {
  return Buffer.isBuffer(buf) && buf.length > 5 && buf.slice(0, 5).toString("latin1") === "%PDF-";
}

// ---------- critérios ----------
function validateCriterion(body) {
  const name = cleanText(body.name, 60);
  if (name.length < 2) throw new HackError(400, "invalid_name", "Dê um nome ao critério.");
  const weight = Number(body.weight === undefined ? 1 : body.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 10) throw new HackError(400, "invalid_weight", "Peso entre 0,1 e 10.");
  const scaleMax = parseInt(body.scaleMax === undefined ? 5 : body.scaleMax, 10);
  if (![5, 10].includes(scaleMax)) throw new HackError(400, "invalid_scale", "Escala de 1 a 5 ou de 1 a 10.");
  return { name, description: String(body.description || "").trim().slice(0, 300), weight: Math.round(weight * 10) / 10, scaleMax };
}

function evalCfg(state) {
  return state.config.evaluation;
}

function assertCriteriaEditable(state) {
  if (evalCfg(state).criteriaLocked) throw new HackError(409, "criteria_locked", "Critérios travados: destrave antes de mudar (só se nenhuma nota foi dada).");
}

function addCriterion(state, body) {
  assertCriteriaEditable(state);
  const c = Object.assign({ id: id("c") }, validateCriterion(body));
  evalCfg(state).criteria.push(c);
  return c;
}

function updateCriterion(state, critId, body) {
  assertCriteriaEditable(state);
  const c = evalCfg(state).criteria.find((x) => x.id === critId);
  if (!c) throw new HackError(404, "not_found", "Critério não encontrado.");
  Object.assign(c, validateCriterion(Object.assign({}, c, body)));
  return c;
}

function removeCriterion(state, critId) {
  assertCriteriaEditable(state);
  const cfg = evalCfg(state);
  cfg.criteria = cfg.criteria.filter((x) => x.id !== critId);
  if (cfg.tiebreakCriterionId === critId) cfg.tiebreakCriterionId = null;
}

function lockCriteria(state, lock) {
  const cfg = evalCfg(state);
  if (lock) {
    if (!cfg.criteria.length) throw new HackError(409, "no_criteria", "Cadastre pelo menos um critério.");
    cfg.criteriaLocked = true;
    if (!cfg.tiebreakCriterionId) cfg.tiebreakCriterionId = cfg.criteria[0].id;
    return;
  }
  if (state.scores.length) throw new HackError(409, "has_scores", "Já existem notas: os critérios não podem mais mudar.");
  cfg.criteriaLocked = false;
  cfg.open = false;
}

function setOpen(state, open) {
  const cfg = evalCfg(state);
  if (open && !cfg.criteriaLocked) throw new HackError(409, "criteria_unlocked", "Trave os critérios antes de abrir a avaliação.");
  if (open && cfg.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado: destrave para reabrir.");
  cfg.open = open === true;
}

function setFinalists(state, teamIds) {
  const cfg = evalCfg(state);
  if (cfg.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
  const valid = (teamIds || []).map(String).filter((t) => state.teams.some((x) => x.id === t));
  cfg.finalists = Array.from(new Set(valid));
}

function setPhase(state, phase) {
  const cfg = evalCfg(state);
  if (!["main", "final"].includes(phase)) throw new HackError(400, "invalid_phase", "Fase inválida.");
  if (phase === "final" && cfg.finalists.length < 2) throw new HackError(409, "no_finalists", "Marque pelo menos 2 finalistas.");
  if (cfg.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
  cfg.phase = phase;
}

// ---------- quem é avaliado ----------
function evaluableTeams(state) {
  const cfg = evalCfg(state);
  if (cfg.phase === "final") return state.teams.filter((t) => cfg.finalists.includes(t.id));
  return state.teams.filter((t) => t.status === "confirmed" && isComplete(submissionOf(state, t.id)));
}

// Impedido: declarou conflito, ou é integrante da equipe (jurado que também
// compete nunca avalia a própria equipe, nem que esqueça de declarar).
function hasConflict(state, judgeId, teamId) {
  if (state.conflicts.some((c) => c.judgeId === judgeId && c.teamId === teamId)) return true;
  const t = state.teams.find((x) => x.id === teamId);
  return Boolean(t && t.members.includes(judgeId));
}

function setConflict(state, judgeId, teamId, on, now) {
  if (!state.teams.some((t) => t.id === teamId)) throw new HackError(404, "team_not_found", "Equipe não encontrada.");
  if (evalCfg(state).resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
  state.conflicts = state.conflicts.filter((c) => !(c.judgeId === judgeId && c.teamId === teamId));
  if (on) {
    state.conflicts.push({ judgeId, teamId, at: now.toISOString() });
    // Impedido não pontua: nota já dada a essa equipe sai.
    state.scores = state.scores.filter((x) => !(x.judgeId === judgeId && x.teamId === teamId));
  }
}

function submitScore(state, judgeId, teamId, body, now) {
  const cfg = evalCfg(state);
  if (!cfg.open) throw new HackError(409, "evaluation_closed", "A avaliação não está aberta.");
  if (cfg.resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
  if (!evaluableTeams(state).some((t) => t.id === teamId)) throw new HackError(409, "not_evaluable", "Essa equipe não está em avaliação nesta fase.");
  if (hasConflict(state, judgeId, teamId)) throw new HackError(409, "conflict", "Você se declarou impedido com essa equipe.");
  const raw = (body && body.values) || {};
  const values = {};
  for (const c of cfg.criteria) {
    const v = Number(raw[c.id]);
    if (!Number.isInteger(v) || v < 1 || v > c.scaleMax) {
      throw new HackError(400, "invalid_score", "Nota de “" + c.name + "” precisa ser inteira de 1 a " + c.scaleMax + ".");
    }
    values[c.id] = v;
  }
  const comment = String((body && body.comment) || "").trim().slice(0, 1000);
  let sc = state.scores.find((x) => x.judgeId === judgeId && x.teamId === teamId && x.phase === cfg.phase);
  if (!sc) {
    sc = { id: id("s"), judgeId, teamId, phase: cfg.phase, createdAt: now.toISOString() };
    state.scores.push(sc);
  }
  Object.assign(sc, { values, comment, updatedAt: now.toISOString() });
  return sc;
}

// Nota de um jurado (0–100) e o valor normalizado de um critério.
function judgeTotal(criteria, values) {
  let w = 0;
  let acc = 0;
  for (const c of criteria) {
    if (values[c.id] === undefined) continue;
    w += c.weight;
    acc += c.weight * ((values[c.id] - 1) / (c.scaleMax - 1));
  }
  return w ? (acc / w) * 100 : null;
}

function teamScore(state, teamId, phase) {
  const cfg = evalCfg(state);
  const list = state.scores.filter((x) => x.teamId === teamId && x.phase === phase && !hasConflict(state, x.judgeId, teamId));
  if (!list.length) return { score: null, tiebreak: null, judges: 0 };
  const totals = list.map((x) => judgeTotal(cfg.criteria, x.values));
  const tb = cfg.criteria.find((c) => c.id === cfg.tiebreakCriterionId);
  const tbs = tb ? list.map((x) => (x.values[tb.id] - 1) / (tb.scaleMax - 1)) : [];
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return { score: avg(totals), tiebreak: tbs.length ? avg(tbs) * 100 : null, judges: list.length };
}

// Ranking completo, só para a diretoria.
function ranking(state) {
  const cfg = evalCfg(state);
  const judges = state.people.filter((p) => !p.disabled && p.roles.includes("judge"));
  const rows = state.teams
    .filter((t) => t.status === "confirmed" || cfg.finalists.includes(t.id))
    .map((t) => {
      const main = teamScore(state, t.id, "main");
      const fin = teamScore(state, t.id, "final");
      const finalist = cfg.finalists.includes(t.id);
      const useFinal = cfg.phase === "final" && finalist;
      const eligibleJudges = judges.filter((j) => !hasConflict(state, j.id, t.id)).length;
      return {
        teamId: t.id,
        name: t.name,
        finalist,
        complete: isComplete(submissionOf(state, t.id)),
        main,
        final: fin,
        score: useFinal ? fin.score : main.score,
        tiebreak: useFinal ? fin.tiebreak : main.tiebreak,
        judges: useFinal ? fin.judges : main.judges,
        eligibleJudges,
        group: useFinal ? 0 : 1, // finalistas primeiro na fase final
      };
    });
  rows.sort((a, b) => {
    if (cfg.phase === "final" && a.group !== b.group) return a.group - b.group;
    if ((a.score === null) !== (b.score === null)) return a.score === null ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    if ((a.tiebreak || 0) !== (b.tiebreak || 0)) return (b.tiebreak || 0) - (a.tiebreak || 0);
    return b.judges - a.judges;
  });
  let pos = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.group === r.group && prev.score === r.score && (prev.tiebreak || 0) === (r.tiebreak || 0) && prev.judges === r.judges;
    if (!tied) pos = i + 1;
    r.position = r.score === null ? null : pos;
  });
  return rows;
}

function lockResults(state, lock, now) {
  const cfg = evalCfg(state);
  if (!lock) {
    if (cfg.revealedAt) throw new HackError(409, "revealed", "O resultado já foi revelado.");
    cfg.resultsLocked = false;
    return;
  }
  cfg.resultsLocked = true;
  cfg.open = false;
  cfg.lockedAt = now.toISOString();
  cfg.lockedRanking = ranking(state).map((r) => ({ teamId: r.teamId, name: r.name, position: r.position, score: r.score }));
}

function reveal(state, now) {
  const cfg = evalCfg(state);
  if (!cfg.resultsLocked) throw new HackError(409, "not_locked", "Trave o resultado antes de revelar.");
  cfg.revealedAt = now.toISOString();
}

// O que participantes e público veem depois da revelação: só o pódio, sem nota.
function podium(state) {
  const cfg = evalCfg(state);
  if (!cfg.revealedAt || !cfg.lockedRanking) return null;
  return cfg.lockedRanking
    .filter((r) => r.position !== null && r.position <= cfg.podiumSize)
    .map((r) => {
      const t = state.teams.find((x) => x.id === r.teamId);
      return { position: r.position, name: r.name, members: t ? t.members.length : 0 };
    });
}

module.exports = {
  SLIDES_MAX,
  submissionOf,
  isComplete,
  validateSubmissionFields,
  upsertSubmission,
  isPdf,
  addCriterion,
  updateCriterion,
  removeCriterion,
  lockCriteria,
  setOpen,
  setFinalists,
  setPhase,
  evaluableTeams,
  hasConflict,
  setConflict,
  submitScore,
  judgeTotal,
  teamScore,
  ranking,
  lockResults,
  reveal,
  podium,
};
