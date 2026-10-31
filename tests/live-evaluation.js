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
  assert(L.adminView(s).judges.find((j) => j.id === "j1").pending.includes(r1.id));
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
  error(() => L.openRound(s, "t1", "delivery", now), "round_exists");
  s.config.evaluation.phase = "final";
  s.config.evaluation.finalists = ["t1", "t2"];
  error(() => L.openRound(s, "t2", "delivery", now), "phase_kind_mismatch");
  const r2 = L.openRound(s, "t2", "pitch", now);
  L.saveDraft(s, "j1", r2.id, { revision: 0, values: { c1: 3 }, comment: "" }, now);
  error(() => L.confirm(s, "j1", r2.id, { revision: 1, confirm: true }, now), "pitch_ongoing");
  L.closeRound(s, r2.id, now);
  assert.strictEqual(L.confirm(s, "j1", r2.id, { revision: 1, confirm: true }, now).values.c1, 3);
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
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { c1: 4.5 }, comment: "" }, now), "invalid_score");
  error(() => L.saveDraft(s, "j1", r.id, { revision: 0, values: { outro: 4 }, comment: "" }, now), "invalid_score");
  L.saveDraft(s, "j1", r.id, { revision: 0, values: {}, comment: "" }, now);
  error(() => L.confirm(s, "j1", r.id, { revision: 1, confirm: true }, now), "invalid_score");
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
