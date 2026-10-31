const assert = require("node:assert/strict");
const express = require("express");
const { emptyState } = require("../lib/hackathon/store");
const { HackError } = require("../lib/hackathon/people");
const L = require("../lib/hackathon/live-evaluation");
const register = require("../lib/hackathon/routes/judge-summary");

const now = new Date("2026-10-31T17:00:00Z");
function fixture() {
  const state = emptyState();
  state.config.evaluation = { ...state.config.evaluation, open: true, criteriaLocked: true,
    criteria: [{ id: "c1", name: "Tech", description: "Construcao", scaleMax: 5, weight: 1 }] };
  state.people.push({ id: "j1", name: "Ana", roles: ["judge"], disabled: false },
    { id: "j2", name: "Bia", roles: ["judge"], disabled: false });
  state.teams.push({ id: "t1", name: "Alfa", members: [], status: "confirmed" });
  state.submissions.push({ teamId: "t1", repoUrl: "https://example.org", slides: { name: "slides.pdf" } });
  const round = L.openRound(state, "t1", "delivery", now);
  L.addNote(state, "j1", round.id, { opId: "ana-op-01", text: "observação de Ana" }, now);
  L.addNote(state, "j2", round.id, { opId: "bia-op-01", text: "comentário privado de Bia" }, now);
  return { state, round };
}

async function harness(test) {
  const { state, round } = fixture();
  let currentId = "j1", enteredResolve, releaseResolve, captured, calls = 0;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  let failure = false;
  const summarizer = async (input) => {
    calls++;
    captured = input;
    enteredResolve();
    await release;
    if (failure) throw new HackError(503, "summary_failed", "Serviço indisponível.");
    return "Resumo de Ana";
  };
  const app = express();
  const ctx = {
    store: { get: () => state },
    requireActor(req, check) {
      const person = state.people.find((p) => p.id === currentId && !p.disabled);
      if (!person) throw new HackError(401, "unauthenticated", "Entre.");
      if (!check({ judge: person.roles.includes("judge") })) throw new HackError(403, "forbidden", "Sem permissão.");
      return { person };
    },
  };
  register(app, ctx, summarizer);
  const server = await new Promise((resolve) => { const inst = app.listen(0, "127.0.0.1", () => resolve(inst)); });
  const url = "http://127.0.0.1:" + server.address().port + "/hack/api/judge/live/rounds/" + round.id + "/summary";
  const h = { state, round, entered, release: () => releaseResolve(), input: () => captured,
    calls: () => calls, setActor: (id) => { currentId = id; }, fail: () => { failure = true; }, recover: () => { failure = false; },
    request: async () => { const response = await fetch(url, { method: "POST" }); return { status: response.status, body: await response.json() }; } };
  try { await test(h); }
  finally { releaseResolve(); await new Promise((resolve) => server.close(resolve)); }
}

async function main() {
  await harness(async (h) => {
    const result = h.request(); await h.entered;
    assert.deepEqual(h.input().notes.map((n) => n.text), ["observação de Ana"]);
    assert(!JSON.stringify(h.input()).includes("comentário privado de Bia"));
    h.release(); const response = await result;
    assert.equal(response.status, 200); assert.equal(response.body.notesRevision, 1);
  });
  await harness(async (h) => {
    h.state.conflicts.push({ judgeId: "j1", teamId: "t1" });
    const response = await h.request();
    assert.equal(response.status, 409); assert.equal(response.body.error, "conflict"); assert.equal(h.calls(), 0);
  });
  await harness(async (h) => {
    const result = h.request(); await h.entered;
    L.addNote(h.state, "j1", h.round.id, { opId: "ana-op-02", text: "observação posterior" }, now);
    h.release(); const response = await result;
    assert.equal(response.status, 409); assert.equal(response.body.error, "summary_stale");
  });
  await harness(async (h) => {
    const result = h.request(); await h.entered;
    h.state.config.evaluation.criteria[0].description = "Novo critério";
    h.release(); const response = await result;
    assert.equal(response.status, 409); assert.equal(response.body.error, "summary_stale");
  });
  await harness(async (h) => {
    const result = h.request(); await h.entered; h.setActor("j2"); h.release();
    const response = await result;
    assert.equal(response.status, 409); assert.equal(response.body.error, "actor_changed");
  });
  await harness(async (h) => {
    const result = h.request(); await h.entered;
    h.fail(); h.release(); const response = await result;
    assert.equal(response.status, 503); assert.equal(response.body.error, "summary_failed");
    assert.deepEqual(L.getJudgeRound(h.state, "j1", h.round.id).notes.map((n) => n.text), ["observação de Ana"]);
    assert.deepEqual(L.getJudgeRound(h.state, "j2", h.round.id).notes.map((n) => n.text), ["comentário privado de Bia"]);
  });
  await harness(async (h) => {
    const result = h.request(); await h.entered;
    h.state.conflicts.push({ judgeId: "j1", teamId: "t1" });
    h.release(); const response = await result;
    assert.equal(response.status, 409); assert.equal(response.body.error, "summary_stale");
  });
  await harness(async (h) => {
    // Um resumo por vez por jurado: o segundo pedido não dispara outra chamada paga.
    const first = h.request(); await h.entered;
    const second = await h.request();
    assert.equal(second.status, 409); assert.equal(second.body.error, "summary_pending"); assert.equal(h.calls(), 1);
    h.release(); assert.equal((await first).status, 200);
  });
  await harness(async (h) => {
    // Limite de 4 por minuto por jurado.
    h.release();
    for (let i = 0; i < 4; i++) assert.equal((await h.request()).status, 200);
    const fifth = await h.request();
    assert.equal(fifth.status, 429); assert.equal(fifth.body.error, "summary_rate"); assert.equal(h.calls(), 4);
  });
  await harness(async (h) => {
    // Falha do provedor não trava o jurado: a próxima tentativa funciona.
    h.fail(); h.release();
    assert.equal((await h.request()).status, 503);
    h.recover();
    const retry = await h.request();
    assert.equal(retry.status, 200); assert.equal(retry.body.summary, "Resumo de Ana");
  });
  await harness(async (h) => {
    // Equipe removida depois de abrir a rodada: recusa clara, sem chamar a IA.
    h.state.teams = [];
    const response = await h.request();
    assert.equal(response.status, 409); assert.equal(response.body.error, "team_removed"); assert.equal(h.calls(), 0);
  });
  console.log("judge-summary-route: privacidade e corridas passaram");
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
