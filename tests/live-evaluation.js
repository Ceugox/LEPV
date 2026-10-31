const assert = require("assert");
const { emptyState, normalize } = require("../lib/hackathon/store");
const L = require("../lib/hackathon/live-evaluation");
const E = require("../lib/hackathon/evaluation");

const now = new Date("2026-10-31T17:00:00Z");
function setup() {
  const s = emptyState();
  s.config.evaluation = { ...s.config.evaluation, open: true, criteriaLocked: true,
    criteria: [{ id: "c1", name: "Tech", description: "", weight: 1, scaleMax: 5 }] };
  s.people.push({ id: "j1", name: "Ana", roles: ["judge"], disabled: false },
    { id: "j2", name: "Bia", roles: ["judge"], disabled: false });
  s.teams.push({ id: "t1", name: "Alfa", members: [], status: "confirmed" },
    { id: "t2", name: "Beta", members: [], status: "confirmed" });
  s.submissions.push({ teamId: "t1", repoUrl: "https://example.org/a", slides: { name: "a.pdf" } },
    { teamId: "t2", repoUrl: "https://example.org/b", slides: { name: "b.pdf" } });
  return s;
}
function error(fn, code) { assert.throws(fn, (e) => e.code === code); }

{
  const s = setup();
  const old = normalize({ config: {}, people: [] });
  assert.deepStrictEqual(old.liveRounds, []);
  const r1 = L.openRound(s, "t1", "delivery", now);
  error(() => L.openRound(s, "t2", "delivery", now), "round_open");
  error(() => L.openRound(s, "t2", "pitch", now), "phase_kind_mismatch");
  const n = L.addNote(s, "j1", r1.id, { opId: "operacao-1", text: "Ótima solução" }, now);
  assert.strictEqual(L.addNote(s, "j1", r1.id, { opId: "operacao-1", text: "Ótima solução" }, now).id, n.id);
  error(() => L.addNote(s, "j1", r1.id, { opId: "operacao-1", text: "Outro texto" }, now), "op_conflict");
  assert.strictEqual(L.getJudgeRound(s, "j1", r1.id).notesRevision, 1);
  assert.deepStrictEqual(L.getJudgeRound(s, "j2", r1.id).notes, []);
  L.saveDraft(s, "j1", r1.id, { revision: 0, values: { c1: 4 }, comment: "parecer" }, now);
  assert.deepStrictEqual(L.getJudgeRound(s, "j2", r1.id).draft.values, {});
  error(() => L.saveDraft(s, "j1", r1.id, { revision: 0, values: { c1: 2 }, comment: "" }, now), "stale_revision");
  error(() => L.confirm(s, "j1", r1.id, { confirm: true, revision: 0 }, now), "stale_revision");
  error(() => L.confirm(s, "j1", r1.id, { revision: 1 }, now), "stale_revision");
  L.confirm(s, "j1", r1.id, { confirm: true, revision: 1 }, now);
  const firstUpdate = s.scores[0].updatedAt;
  L.confirm(s, "j1", r1.id, { confirm: true, revision: 1 }, new Date(now.getTime() + 1000));
  assert.strictEqual(s.scores[0].updatedAt, firstUpdate);
  s.scores[0].values.c1 = 3;
  error(() => L.confirm(s, "j1", r1.id, { confirm: true, revision: 1 }, now), "score_changed");
  // Nota oficial mudou fora da rodada: é correção da banca, não pendência; a rodada passa a mostrá-la.
  assert(!L.adminView(s).judges.find((j) => j.id === "j1").pending.includes(r1.id));
  assert.strictEqual(L.getJudgeRound(s, "j1", r1.id).draft.values.c1, 3);
  assert.strictEqual(s.scores[0].values.c1, 3);
  s.scores[0].values.c1 = 4;
  assert.strictEqual(s.scores.length, 1);
  assert.strictEqual(s.scores[0].values.c1, 4);
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].pending, false);
  assert(!L.adminView(s).judges.find((j) => j.id === "j1").pending.includes(r1.id));
  L.saveDraft(s, "j1", r1.id, { revision: 1, values: { c1: 5 }, comment: "rascunho novo" }, now);
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].scored, true);
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].pending, true);
  assert(L.adminView(s).judges.find((j) => j.id === "j1").pending.includes(r1.id));
  L.closeRound(s, r1.id, now);
  // Abrir de novo a mesma equipe reabre a rodada existente (não cria outra).
  assert.strictEqual(L.openRound(s, "t1", "delivery", now).id, r1.id);
  L.closeRound(s, r1.id, now);
  s.config.evaluation.phase = "final";
  s.config.evaluation.finalists = ["t1", "t2"];
  error(() => L.openRound(s, "t2", "delivery", now), "phase_kind_mismatch");
  const r2 = L.openRound(s, "t2", "pitch", now);
  L.saveDraft(s, "j1", r2.id, { revision: 0, values: { c1: 3 }, comment: "" }, now);
  // Nota do pitch vale com a rodada aberta: só fecha quando a organização fecha a avaliação.
  assert.strictEqual(L.confirm(s, "j1", r2.id, { revision: 1, confirm: true }, now).values.c1, 3);
  L.saveDraft(s, "j1", r2.id, { revision: 1, values: { c1: 4 }, comment: "" }, now);
  assert.strictEqual(L.confirm(s, "j1", r2.id, { revision: 2, confirm: true }, now).values.c1, 4);
  L.closeRound(s, r2.id, now);
  // Rodada encerrada continua editável enquanto a avaliação estiver aberta.
  L.saveDraft(s, "j1", r2.id, { revision: 2, values: { c1: 3 }, comment: "" }, now);
  assert.strictEqual(L.confirm(s, "j1", r2.id, { revision: 3, confirm: true }, now).values.c1, 3);
  s.config.evaluation.open = false;
  error(() => L.saveDraft(s, "j1", r2.id, { revision: 3, values: { c1: 5 }, comment: "" }, now), "evaluation_closed");
  s.config.evaluation.open = true;
  L.addNote(s, "j1", r1.id, { opId: "operacao-2", text: "Complemento anterior" }, now);
  assert.strictEqual(L.getJudgeRound(s, "j1", r2.id).notes.length, 0);
  assert.strictEqual(L.getJudgeRound(s, "j1", r1.id).notes.length, 2);
  assert.strictEqual(L.judgeView(s, s.people[0]).currentRound, null);
  const admin = JSON.stringify(L.adminView(s));
  assert(!admin.includes("Ótima solução") && !admin.includes("parecer"));
}
{
  const s = setup();
  const r = L.openRound(s, "t1", "delivery", now);
  // De 0,5 em 0,5, como na banca (evaluation.submitScore).
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 4.2 }, comment: "" }, now), "invalid_score");
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 0.5 }, comment: "" }, now), "invalid_score");
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { outro: 4 }, comment: "" }, now), "invalid_score");
  assert.strictEqual(L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 4.5 }, comment: "" }, now).values.c1, 4.5);
  L.saveDraft(s, "j1", r.id, { revision: 1, values: {}, comment: "" }, now);
  error(() => L.confirm(s, "j1", r.id, { revision: 2, confirm: true }, now), "invalid_score");
  E.setConflict(s, "j1", "t1", true, now);
  error(() => L.addNote(s, "j1", r.id, { opId: "operacao-1", text: "x" }, now), "conflict");
  error(() => L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now), "conflict");
  s.people[1].disabled = true;
  error(() => L.getJudgeRound(s, "j2", r.id), "forbidden");
  s.config.evaluation.resultsLocked = true;
  error(() => L.addNote(s, "j1", r.id, { opId: "operacao-2", text: "x" }, now), "results_locked");
}
{
  const s = setup();
  const r = L.openRound(s, "t1", "delivery", now);
  L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 3 }, comment: "" }, now);
  s.config.evaluation.phase = "final";
  error(() => L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now), "phase_changed");
  assert.strictEqual(s.scores.length, 0);
}
{
  // Critérios por pilar e por fase: a rodada pede só os do jurado, como a banca grava (criteriaFor).
  const s = setup();
  s.config.evaluation.criteria = [
    { id: "tec", name: "Tech", description: "", weight: 1, scaleMax: 5, phase: "main", pillar: "tech", anchors: ["fraco", "", "ok", "", "ótimo"] },
    { id: "neg", name: "Negócio", description: "", weight: 1, scaleMax: 5, phase: "main", pillar: "business" },
    { id: "fin", name: "Pitch", description: "", weight: 1, scaleMax: 5, phase: "final" },
  ];
  s.people.find((p) => p.id === "j1").judgePillars = ["tech"];
  const r = L.openRound(s, "t1", "delivery", now);
  const view = L.getJudgeRound(s, "j1", r.id);
  assert.deepStrictEqual(view.criteria.map((c) => c.id), ["tec"]);
  assert.deepStrictEqual(view.criteria[0].anchors, ["fraco", "", "ok", "", "ótimo"]);
  assert.deepStrictEqual(L.judgeView(s, s.people[0]).criteria.map((c) => c.id), ["tec"]);
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { neg: 3 }, comment: "" }, now), "invalid_score");
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { fin: 3 }, comment: "" }, now), "invalid_score");
  L.saveDraft(s, "j1", r.id, { revision: 0, values: { tec: 3.5 }, comment: "ok" }, now);
  L.closeRound(s, r.id, now);
  L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now);
  // Confirmada, a rodada sai das pendências; repetir a confirmação devolve a mesma nota.
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].pending, false);
  assert.strictEqual(L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now).values.tec, 3.5);
  // Jurado sem critério nesta fase não fica pendente para sempre.
  s.people.find((p) => p.id === "j2").judgePillars = ["impact"];
  assert.strictEqual(L.judgeView(s, s.people[1]).rounds[0].pending, false);
}
{
  // Nota corrigida pelo formulário da banca: a rodada mostra a oficial e não a sobrescreve em silêncio.
  const s = setup();
  const r = L.openRound(s, "t1", "delivery", now);
  L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 4 }, comment: "" }, now);
  L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now);
  E.submitScore(s, "j1", "t1", { values: { c1: 5 }, comment: "corrigido" }, now);
  const v = L.getJudgeRound(s, "j1", r.id);
  assert.strictEqual(v.draft.values.c1, 5);
  assert.strictEqual(v.draft.comment, "corrigido");
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].pending, false);
}
{
  // Rascunho não confirmado mais velho que a nota dada pelo formulário da banca: vale a nota.
  const s = setup();
  const r = L.openRound(s, "t1", "delivery", now);
  L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 3 }, comment: "" }, now);
  E.submitScore(s, "j1", "t1", { values: { c1: 5 }, comment: "" }, new Date(now.getTime() + 60000));
  assert.strictEqual(L.getJudgeRound(s, "j1", r.id).draft.values.c1, 5);
  assert.strictEqual(L.getJudgeRound(s, "j1", r.id).draft.revision, 1);
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].pending, false);
  // Rascunho editado depois da nota volta a valer e a pender.
  L.saveDraft(s, "j1", r.id, { revision: 1, values: { c1: 4 }, comment: "" }, new Date(now.getTime() + 120000));
  assert.strictEqual(L.getJudgeRound(s, "j1", r.id).draft.values.c1, 4);
  assert.strictEqual(L.judgeView(s, s.people[0]).rounds[0].pending, true);
}
{
  // Troca de fase: a rodada da fase anterior deixa de ser a atual, não pende e não trava a próxima.
  const s = setup();
  s.config.evaluation.criteria.push({ id: "f1", name: "Pitch", description: "", weight: 1, scaleMax: 5, phase: "final" });
  s.config.evaluation.criteria[0].phase = "main";
  const r = L.openRound(s, "t1", "delivery", now);
  s.config.evaluation.finalists = ["t1", "t2"];
  E.setPhase(s, "final");
  const view = L.judgeView(s, s.people[0]);
  assert.strictEqual(view.currentRound, null);
  assert.strictEqual(view.rounds.find((x) => x.id === r.id).pending, false);
  assert.strictEqual(L.adminView(s).currentRound, null);
  const p = L.openRound(s, "t2", "pitch", now);
  assert.strictEqual(L.judgeView(s, s.people[0]).currentRound.id, p.id);
  assert.strictEqual(s.liveRounds.find((x) => x.id === r.id).status, "closed");
}
{
  // Todas as equipes abertas: o jurado escolhe qualquer equipe avaliável, sem esperar a organização.
  const s = setup();
  const view = L.judgeView(s, s.people[0]);
  assert.deepStrictEqual(view.teams.map((t) => [t.id, t.roundId]), [["t1", null], ["t2", null]]);
  const r = L.ensureTeamRound(s, "j1", "t2", now);
  assert.strictEqual(r.status, "closed");
  assert.strictEqual(r.kind, "delivery");
  assert.strictEqual(L.ensureTeamRound(s, "j2", "t2", now).id, r.id, "uma rodada por equipe e fase, compartilhada");
  assert.strictEqual(L.judgeView(s, s.people[0]).teams.find((t) => t.id === "t2").roundId, r.id);
  // Nota direto na rodada criada pelo jurado, sem a organização abrir nada.
  L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 4.5 }, comment: "" }, now);
  assert.strictEqual(L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now).values.c1, 4.5);
  error(() => L.ensureTeamRound(s, "j1", "fora", now), "not_evaluable");
  s.config.evaluation.open = false;
  error(() => L.ensureTeamRound(s, "j1", "t1", now), "evaluation_closed");
  s.config.evaluation.open = true;
  // A organização ainda conduz: abrir a equipe que já tem rodada reabre a mesma, sem perder nota.
  const opened = L.openRound(s, "t2", "delivery", now);
  assert.strictEqual(opened.id, r.id);
  assert.strictEqual(opened.status, "open");
  assert.strictEqual(s.scores.find((x) => x.teamId === "t2").values.c1, 4.5);
  error(() => L.openRound(s, "t1", "delivery", now), "round_open");
}
{
  // Equipe removida depois de abrir a rodada: a visão não quebra.
  const s = setup();
  const r = L.openRound(s, "t2", "delivery", now);
  s.teams = s.teams.filter((t) => t.id !== "t2");
  assert.strictEqual(L.getJudgeRound(s, "j1", r.id).round.team, null);
}
console.log("live-evaluation: testes passaram");

async function routeTests() {
  const express = require("express");
  const { HackError } = require("../lib/hackathon/people");
  const app = express();
  const s = setup();
  const round = L.openRound(s, "t1", "delivery", now);
  const ctx = {
    store: { get: () => s, mutate: (fn) => fn(s) }, now: () => now,
    requireActor(req, check) {
      const id = req.get("x-test-actor");
      const person = s.people.find((p) => p.id === id);
      const actor = id === "admin" ? { person: { id, name: "Admin" }, perms: { manage: true } }
        : person ? { person, perms: { judge: !person.disabled } } : null;
      if (!actor) throw new HackError(401, "unauthenticated", "Entre.");
      if (!check(actor.perms, actor)) throw new HackError(403, "forbidden", "Sem permissão.");
      return actor;
    },
  };
  app.use(express.json());
  require("../lib/hackathon/routes/live-evaluation")(app, ctx);
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = "http://127.0.0.1:" + server.address().port + "/hack/api";
  const request = async (actor, path, method = "GET", body) => {
    const res = await fetch(base + path, { method, headers: { "x-test-actor": actor, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.strictEqual((await request("anonimo", "/judge/live")).status, 401);
    assert.strictEqual((await request("j1", "/admin/live")).status, 403);
    // Jurado não abre nem encerra rodada (encerrar o pitch liberaria a própria nota).
    assert.strictEqual((await request("j1", "/admin/live/rounds", "POST", { teamId: "t2", kind: "delivery" })).status, 403);
    assert.strictEqual((await request("j1", "/admin/live/rounds/" + round.id + "/close", "POST", {})).status, 403);
    // Jurado abre qualquer equipe da fase direto, sem a organização; anônimo não.
    const direct = await request("j1", "/judge/live/teams/t2/round", "POST", {});
    assert.strictEqual(direct.status, 200);
    assert.strictEqual(direct.body.round.teamId, "t2");
    assert.strictEqual(direct.body.round.status, "closed");
    assert.strictEqual((await request("anonimo", "/judge/live/teams/t2/round", "POST", {})).status, 401);
    assert.strictEqual((await request("j1", "/judge/live/teams/nao-existe/round", "POST", {})).status, 409);
    const path = "/judge/live/rounds/" + round.id;
    assert.strictEqual((await request("j1", path + "/notes", "POST", { text: "segredo de Ana", opId: "teste-123" })).status, 200);
    assert.deepStrictEqual((await request("j2", path)).body.notes, []);
    assert(!JSON.stringify((await request("admin", "/admin/live")).body).includes("segredo de Ana"));
    const save = await request("j1", path + "/draft", "PUT", { values: { c1: 5 }, comment: "opinião privada", revision: 0 });
    assert.strictEqual(save.body.draft.revision, 1);
    assert.strictEqual((await request("j1", path + "/draft", "PUT", { values: { c1: 1 }, comment: "", revision: 0 })).status, 409);
    assert.strictEqual((await request("j1", path + "/confirm", "POST", { revision: 0, confirm: true })).status, 409);
    assert.strictEqual((await request("j1", path + "/confirm", "POST", { revision: 1, confirm: true })).status, 200);
    assert.strictEqual((await request("j2", path)).body.score, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("live-evaluation: rotas e privacidade passaram");
}
routeTests().catch((err) => { console.error(err); process.exitCode = 1; });
