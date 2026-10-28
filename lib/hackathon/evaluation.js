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
// de jurados. Fase final opcional: quando a diretoria abre a fase final
// (phase "final"), vale a nota da final para os finalistas, que ficam à frente.
// Só contam notas de jurados ativos (não bloqueados, ainda com o papel).
//
// Critério por fase e pilar (hackathon de 31/10): cada critério vale nas duas
// fases ("both", o padrão antigo), só na fase 1 ("main") ou só na final
// ("final"). Na fase 1, critério pode ter pilar (Tech, Inovação, Negócio,
// Educação): cada jurado dá nota só nos critérios dos pilares dele (padrão:
// Inovação), e a nota da equipe é a média dos pilares — cada pilar vale 2,5
// de 10. Pilar abaixo de 1,0 ou sem nenhum jurado tira a equipe da seleção do
// top 5. Critério "trava" (gate): nota 1 nele limita o pilar a 1,0.
const { id } = require("./store");
const { HackError, cleanText } = require("./people");
const { isHttpUrl } = require("./util");

const SLIDES_MAX = 20 * 1024 * 1024;

const PILLARS = [
  { id: "tech", label: "Tech" },
  { id: "innovation", label: "Inovação" },
  { id: "business", label: "Negócio" },
  { id: "education", label: "Educação" },
];
const PILLAR_IDS = PILLARS.map((p) => p.id);
const PILLAR_MAX = 2.5;
const PILLAR_FLOOR = 1.0;
const GATE_CAP = 1.0;
const FINALISTS_TARGET = 5;
const DEFAULT_JUDGE_PILLARS = ["innovation"];
const CRITERION_PHASES = ["both", "main", "final"];
const EPS = 1e-9;

// ---------- entrega ----------
// Prazo da equipe: o geral, ou a prorrogação dada a ela pela diretoria.
function deadlineFor(state, team) {
  const base = Date.parse(state.config.submissionDeadline);
  const extra = team && team.deadlineOverride ? Date.parse(team.deadlineOverride) : NaN;
  return Number.isFinite(extra) ? Math.max(base, extra) : base;
}

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
  if (body.deployUrl !== undefined) {
    const u = String(body.deployUrl || "").trim().slice(0, 300);
    if (u && !isHttpUrl(u)) throw new HackError(400, "invalid_deploy", "Link da solução no ar inválido (use https://...).");
    out.deployUrl = u;
  }
  if (body.description !== undefined) out.description = String(body.description || "").trim().slice(0, 500);
  if (body.projectName !== undefined) out.projectName = cleanText(body.projectName, 80);
  return out;
}

function upsertSubmission(state, teamId, fields, byId, now) {
  let sub = submissionOf(state, teamId);
  if (!sub) {
    sub = { teamId, projectName: "", repoUrl: "", videoUrl: "", deployUrl: "", description: "", summary: "", slides: null, createdAt: now.toISOString() };
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
  const weight = Math.round(Number(body.weight === undefined ? 1 : body.weight) * 10) / 10;
  if (!Number.isFinite(weight) || weight < 0.1 || weight > 10) throw new HackError(400, "invalid_weight", "Peso entre 0,1 e 10.");
  const scaleMax = parseInt(body.scaleMax === undefined ? 5 : body.scaleMax, 10);
  if (![5, 10].includes(scaleMax)) throw new HackError(400, "invalid_scale", "Escala de 1 a 5 ou de 1 a 10.");
  const phase = body.phase === undefined || body.phase === null ? "both" : String(body.phase);
  if (!CRITERION_PHASES.includes(phase)) throw new HackError(400, "invalid_phase", "Fase do critério inválida.");
  const pillar = body.pillar ? String(body.pillar) : null;
  if (pillar && !PILLAR_IDS.includes(pillar)) throw new HackError(400, "invalid_pillar", "Pilar inválido.");
  if (pillar && phase !== "main") throw new HackError(400, "pillar_phase", "Pilar só vale em critério da fase 1.");
  const gate = body.gate === true;
  if (gate && !pillar) throw new HackError(400, "gate_pillar", "Critério trava precisa de pilar.");
  let anchors = Array.isArray(body.anchors) ? body.anchors.map((x) => String(x || "").trim().slice(0, 160)) : [];
  if (!anchors.some(Boolean)) anchors = [];
  if (anchors.length > scaleMax) throw new HackError(400, "invalid_anchors", "No máximo uma âncora por nota da escala.");
  return { name, description: String(body.description || "").trim().slice(0, 300), weight, scaleMax, phase, pillar, gate, anchors };
}

function evalCfg(state) {
  return state.config.evaluation;
}

// Critérios que valem numa fase ("main" ou "final").
function criteriaOf(state, phase) {
  return evalCfg(state).criteria.filter((c) => !c.phase || c.phase === "both" || c.phase === phase);
}

// Fase 1 por pilares: liga quando algum critério da fase 1 tem pilar.
function pillarMode(state) {
  return criteriaOf(state, "main").some((c) => c.pillar);
}

function judgePillars(person) {
  return person && Array.isArray(person.judgePillars) ? person.judgePillars : DEFAULT_JUDGE_PILLARS;
}

// Critérios que este jurado avalia na fase: sem pilar, todos; com pilar, só os dele.
function criteriaFor(state, judgeId, phase) {
  const pil = judgePillars(state.people.find((p) => p.id === judgeId));
  return criteriaOf(state, phase).filter((c) => !c.pillar || pil.includes(c.pillar));
}

function setJudgePillars(state, personId, pillars) {
  if (evalCfg(state).resultsLocked) throw new HackError(409, "results_locked", "Resultado travado.");
  const p = state.people.find((x) => x.id === personId);
  if (!p || !p.roles.includes("judge")) throw new HackError(404, "not_found", "Jurado não encontrado.");
  const list = Array.from(new Set((Array.isArray(pillars) ? pillars : []).map(String)));
  if (list.some((x) => !PILLAR_IDS.includes(x))) throw new HackError(400, "invalid_pillar", "Pilar inválido.");
  p.judgePillars = PILLAR_IDS.filter((x) => list.includes(x));
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
  const next = Object.assign({}, c, body);
  if (body.anchors === undefined && Array.isArray(c.anchors)) next.anchors = c.anchors.slice(0, parseInt(next.scaleMax, 10) || 5);
  Object.assign(c, validateCriterion(next));
  return c;
}

function removeCriterion(state, critId) {
  assertCriteriaEditable(state);
  const cfg = evalCfg(state);
  cfg.criteria = cfg.criteria.filter((x) => x.id !== critId);
  if (cfg.tiebreakCriterionId === critId) cfg.tiebreakCriterionId = null;
  if (cfg.finalTiebreakCriterionId === critId) cfg.finalTiebreakCriterionId = null;
}

function lockCriteria(state, lock) {
  const cfg = evalCfg(state);
  if (lock) {
    const main = criteriaOf(state, "main");
    if (!main.length) throw new HackError(409, "no_criteria", "Cadastre pelo menos um critério.");
    if (pillarMode(state)) {
      const loose = main.find((c) => !c.pillar);
      if (loose) throw new HackError(409, "criterion_without_pillar", "Na fase 1 com pilares, todo critério precisa de pilar: “" + loose.name + "”.");
    }
    // Depois da primeira nota não se destrava: sem critério que valha na final, ela nunca abriria.
    if (!criteriaOf(state, "final").length) throw new HackError(409, "no_final_criteria", "Cadastre os critérios da final (ou marque algum para as duas fases) antes de travar.");
    cfg.criteriaLocked = true;
    if (!main.some((c) => c.id === cfg.tiebreakCriterionId)) cfg.tiebreakCriterionId = main[0].id;
    const fin = criteriaOf(state, "final");
    if (!fin.some((c) => c.id === cfg.finalTiebreakCriterionId)) cfg.finalTiebreakCriterionId = fin.length ? fin[0].id : null;
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
  if (cfg.phase === "final") throw new HackError(409, "final_running", "A fase final já começou: volte para a fase única para mudar as finalistas.");
  const valid = (teamIds || []).map(String).filter((t) => state.teams.some((x) => x.id === t));
  cfg.finalists = Array.from(new Set(valid));
}

function setPhase(state, phase) {
  const cfg = evalCfg(state);
  if (!["main", "final"].includes(phase)) throw new HackError(400, "invalid_phase", "Fase inválida.");
  if (phase === "final" && cfg.finalists.length < 2) throw new HackError(409, "no_finalists", "Marque pelo menos 2 finalistas.");
  if (phase === "final" && !criteriaOf(state, "final").length) throw new HackError(409, "no_final_criteria", "Cadastre os critérios da final antes de abri-la.");
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
  const criteria = criteriaFor(state, judgeId, cfg.phase);
  if (!criteria.length) throw new HackError(409, "no_criteria_for_judge", "Você não avalia nenhum critério nesta fase.");
  const raw = (body && body.values) || {};
  const values = {};
  for (const c of criteria) {
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

const activeJudge = (state, judgeId) => {
  const p = state.people.find((x) => x.id === judgeId);
  return Boolean(p && !p.disabled && p.roles.includes("judge"));
};

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const coversPillar = (state, judgeId, pillar) => judgePillars(state.people.find((q) => q.id === judgeId)).includes(pillar);

// Nota do jurado está "feita" quando cobre os critérios atuais dele (pilar
// trocado depois da nota reabre a pendência). Painel e tela do jurado usam isto.
function scoreCovers(state, sc) {
  return criteriaFor(state, sc.judgeId, sc.phase).every((c) => sc.values[c.id] !== undefined);
}

function judgeProgress(state, judgeId) {
  const cfg = evalCfg(state);
  if (!criteriaFor(state, judgeId, cfg.phase).length) return { has: false, done: 0, total: 0 };
  const teams = evaluableTeams(state);
  const done = teams.filter(
    (t) => hasConflict(state, judgeId, t.id) || state.scores.some((x) => x.judgeId === judgeId && x.teamId === t.id && x.phase === cfg.phase && scoreCovers(state, x))
  ).length;
  return { has: true, done, total: teams.length };
}

// Resumo da organização: nunca para integrante da equipe (jurado que também compete).
function summaryVisibleTo(state, teamId, personId) {
  const t = state.teams.find((x) => x.id === teamId);
  return Boolean(t && !t.members.includes(personId));
}

// O que a equipe vê do próprio resultado: finalista, ou o percentil da fase 1.
function teamResult(state, teamId) {
  const cfg = evalCfg(state);
  return {
    phase: cfg.phase,
    finalist: Boolean(teamId && cfg.phase === "final" && cfg.finalists.includes(teamId)),
    percentile: teamId ? percentileOf(state, teamId) : null,
  };
}

// Notas que contam para a equipe na fase (sem impedimento, jurado ativo).
function countedScores(state, teamId, phase) {
  return state.scores.filter(
    (x) => x.teamId === teamId && x.phase === phase && !hasConflict(state, x.judgeId, teamId) && activeJudge(state, x.judgeId)
  );
}

// Desempate: média normalizada (0–100) do critério, só entre quem deu nota nele.
function tiebreakOf(state, list, phase) {
  const cfg = evalCfg(state);
  const crit = criteriaOf(state, phase);
  // Estado travado antes do desempate por fase: a final cai no da fase 1, se ele vale na final.
  const tbId = phase === "final" ? cfg.finalTiebreakCriterionId || cfg.tiebreakCriterionId : cfg.tiebreakCriterionId;
  const tb = crit.find((c) => c.id === tbId);
  if (!tb) return null;
  const tbs = list
    .filter((x) => x.values[tb.id] !== undefined && (!tb.pillar || coversPillar(state, x.judgeId, tb.pillar))).map((x) => (x.values[tb.id] - 1) / (tb.scaleMax - 1));
  return tbs.length ? avg(tbs) * 100 : null;
}

// Fase 1 por pilares. Cada pilar: média entre os jurados que o avaliaram da
// média ponderada normalizada dos critérios dele (com o teto da trava), em
// 0–2,5. Nota (0–100) = média dos pilares com nota; pilar sem jurado deixa a
// equipe "incompleta" e a nota é provisória (reescalada sobre os existentes).
function pillarScore(state, list) {
  const crit = criteriaOf(state, "main");
  const pillars = {};
  const fractions = [];
  let incomplete = false;
  let belowFloor = false;
  for (const p of PILLARS) {
    const pc = crit.filter((c) => c.pillar === p.id);
    if (!pc.length) continue;
    const fr = [];
    for (const x of list) {
      // Conta só se o jurado ainda avalia este pilar (pilares trocados depois da nota).
      if (!coversPillar(state, x.judgeId, p.id)) continue;
      const t = judgeTotal(pc, x.values);
      if (t === null) continue;
      let f = t / 100;
      if (pc.some((c) => c.gate && x.values[c.id] === 1)) f = Math.min(f, GATE_CAP / PILLAR_MAX);
      fr.push(f);
    }
    if (!fr.length) {
      pillars[p.id] = { score: null, judges: 0 };
      incomplete = true;
      continue;
    }
    const f = avg(fr);
    pillars[p.id] = { score: f * PILLAR_MAX, judges: fr.length };
    if (f * PILLAR_MAX < PILLAR_FLOOR - EPS) belowFloor = true;
    fractions.push(f);
  }
  return { score: fractions.length ? avg(fractions) * 100 : null, pillars, incomplete, belowFloor };
}

function teamScore(state, teamId, phase) {
  const list = countedScores(state, teamId, phase);
  if (phase === "main" && pillarMode(state)) {
    const ps = pillarScore(state, list);
    return Object.assign(ps, { tiebreak: tiebreakOf(state, list, phase), judges: list.length });
  }
  if (!list.length) return { score: null, tiebreak: null, judges: 0 };
  const crit = criteriaOf(state, phase);
  const totals = list.map((x) => judgeTotal(crit, x.values)).filter((v) => v !== null);
  return { score: totals.length ? avg(totals) : null, tiebreak: tiebreakOf(state, list, phase), judges: list.length };
}

// Ranking completo, só para a diretoria. opts.phase força a fase (percentil
// da fase 1 depois que a final abriu).
function ranking(state, opts) {
  const cfg = evalCfg(state);
  const phase = (opts && opts.phase) || cfg.phase;
  const pillars = pillarMode(state);
  const judges = state.people.filter((p) => !p.disabled && p.roles.includes("judge"));
  const rows = state.teams
    .filter((t) => t.status === "confirmed" || cfg.finalists.includes(t.id))
    .map((t) => {
      const main = teamScore(state, t.id, "main");
      const fin = teamScore(state, t.id, "final");
      const finalist = cfg.finalists.includes(t.id);
      const useFinal = phase === "final" && finalist;
      const eligibleJudges = judges.filter((j) => !hasConflict(state, j.id, t.id)).length;
      // Fase 1 por pilares: quem tem pilar sem jurado ou abaixo do piso fica
      // atrás de todas as que passam, qualquer que seja a nota.
      const passes = main.score !== null && !main.incomplete && !main.belowFloor;
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
        pillars: useFinal ? null : main.pillars || null,
        incomplete: !useFinal && Boolean(main.incomplete),
        belowFloor: !useFinal && Boolean(main.belowFloor),
        suggested: false,
        group: useFinal ? 0 : pillars && phase === "main" && !passes ? 2 : 1,
      };
    });
  rows.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
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
  // Sugestão de finalistas: as 5 primeiras que passam no piso (a diretoria marca).
  if (pillars && phase === "main") rows.filter((r) => r.group === 1 && r.score !== null).slice(0, FINALISTS_TARGET).forEach((r) => (r.suggested = true));
  return rows;
}

// Percentil da fase 1 para equipe que não foi para a final, depois que a final
// abriu. top = "entre as X% primeiras" (posição / equipes com nota).
function percentileOf(state, teamId) {
  const cfg = evalCfg(state);
  if (cfg.phase !== "final" || cfg.finalists.includes(teamId)) return null;
  const rows = ranking(state, { phase: "main" }).filter((r) => r.position !== null);
  const me = rows.find((r) => r.teamId === teamId);
  if (!me) return null;
  return { top: Math.ceil((me.position / rows.length) * 100), teams: rows.length };
}

function lockResults(state, lock, now) {
  const cfg = evalCfg(state);
  // Depois de revelado, nem destrava nem re-trava: o pódio público não muda.
  if (cfg.revealedAt) throw new HackError(409, "revealed", "O resultado já foi revelado.");
  if (!lock) {
    if (cfg.revealedAt) throw new HackError(409, "revealed", "O resultado já foi revelado.");
    cfg.resultsLocked = false;
    return;
  }
  cfg.resultsLocked = true;
  cfg.open = false;
  cfg.lockedAt = now.toISOString();
  cfg.lockedRanking = ranking(state).map((r) => ({ teamId: r.teamId, name: r.name, position: r.position, score: r.score, finalist: r.finalist }));
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
    // Com fase final, só finalista sobe ao pódio (não finalista também tem posição no ranking).
    .filter((r) => r.position !== null && r.position <= cfg.podiumSize && (cfg.phase !== "final" || (r.finalist !== undefined ? r.finalist : cfg.finalists.includes(r.teamId))))
    .map((r) => {
      const t = state.teams.find((x) => x.id === r.teamId);
      return { position: r.position, name: r.name, members: t ? t.members.length : 0 };
    });
}

module.exports = {
  SLIDES_MAX,
  deadlineFor,
  activeJudge,
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
  percentileOf,
  teamResult,
  judgeProgress,
  scoreCovers,
  summaryVisibleTo,
  criteriaOf,
  criteriaFor,
  pillarMode,
  judgePillars,
  setJudgePillars,
  PILLARS,
  PILLAR_FLOOR,
  FINALISTS_TARGET,
};
