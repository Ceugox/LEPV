// Unidade da plataforma do hackathon (lib/hackathon). Sem servidor, sem rede:
// funções puras e o estado em memória, com relógio injetado.
//
//   node tests/hackathon.js
const assert = require("assert");
const { emptyState } = require("../lib/hackathon/store");
const { pickHackathonEvent, signupRedirect } = require("../lib/hackathon/event");
const { syncParticipants, newPerson } = require("../lib/hackathon/people");
const { issueLoginToken, consumeLoginToken, resolveActor, ensureActorPerson, perms } = require("../lib/hackathon/access");

const results = { pass: 0, fail: 0 };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- escolha do evento ----------
const H = (id, date, extra) => Object.assign({ id, type: "hackathon", date, signups: { open: true, token: "tok" + id, list: [] } }, extra);

test("evento: HACK_EVENT_ID vence a data", () => {
  const evs = [H("a", "2026-10-30"), H("b", "2027-10-30")];
  assert.strictEqual(pickHackathonEvent(evs, "2026-10-24", "b").id, "b");
  assert.strictEqual(pickHackathonEvent(evs, "2026-10-24", "zz"), null);
});
test("evento: o próximo, não o mais distante", () => {
  const evs = [H("b", "2027-10-30"), H("a", "2026-10-30"), { id: "r", type: "reuniao", date: "2026-10-25" }];
  assert.strictEqual(pickHackathonEvent(evs, "2026-10-24").id, "a");
});
test("evento: no segundo dia (31/10) ainda é a edição atual", () => {
  const evs = [H("a", "2026-10-30"), H("b", "2027-10-30")];
  assert.strictEqual(pickHackathonEvent(evs, "2026-10-31").id, "a");
  assert.strictEqual(pickHackathonEvent(evs, "2026-11-01").id, "b");
});
test("evento: todos passados → o último; nenhum → null", () => {
  assert.strictEqual(pickHackathonEvent([H("a", "2025-10-30"), H("b", "2026-01-01")], "2026-12-01").id, "b");
  assert.strictEqual(pickHackathonEvent([], "2026-12-01"), null);
});
test("inscrição: aberto vai ao formulário; o resto diz o motivo", () => {
  assert.deepStrictEqual(signupRedirect(H("a", "2026-10-30")), { location: "/inscricao.html?t=toka", reason: "open" });
  assert.strictEqual(signupRedirect(null).reason, "no_event");
  assert.strictEqual(signupRedirect(H("a", "x", { signups: { open: true, token: "" } })).reason, "no_token");
  assert.strictEqual(signupRedirect(H("a", "x", { signups: { open: false, token: "t" } })).reason, "closed");
  assert.strictEqual(signupRedirect(H("a", "x", { signups: { open: true, token: "a&b" } })).location, "/inscricao.html?t=a%26b");
});

// ---------- sincronização das inscrições ----------
const signup = (id, extra) =>
  Object.assign({ id, type: "external", name: "Ana Souza " + id, email: id + "@ex.com", phone: "21999990000", status: "confirmed", temGrupo: "Não" }, extra);

test("sync: confirmado vira participante; fila de espera não", () => {
  const s = emptyState();
  const ev = { signups: { list: [signup("s1"), signup("s2", { status: "waitlist", temGrupo: "Sim", consentPatrocinadores: true })] } };
  assert.strictEqual(syncParticipants(s, ev), true);
  const [a, b] = s.people;
  assert.deepStrictEqual(a.roles, ["participant"]);
  assert.deepStrictEqual(b.roles, []);
  assert.strictEqual(b.signupStatus, "waitlist");
  assert.strictEqual(b.hasGroup, true);
  assert.strictEqual(b.consent, true);
  assert.strictEqual(syncParticipants(s, ev), false, "segunda rodada não muda nada");
});
test("sync: promoção da fila e retirada da inscrição", () => {
  const s = emptyState();
  const ev = { signups: { list: [signup("s1"), signup("s2", { status: "waitlist" })] } };
  syncParticipants(s, ev);
  ev.signups.list[1].status = "confirmed";
  ev.signups.list.shift();
  syncParticipants(s, ev);
  const a = s.people.find((p) => p.signupId === "s1");
  const b = s.people.find((p) => p.signupId === "s2");
  assert.strictEqual(a.signupStatus, "removed");
  assert.deepStrictEqual(a.roles, []);
  assert.deepStrictEqual(b.roles, ["participant"]);
});
test("sync: jurado que também se inscreveu vira uma pessoa só, com os dois papéis", () => {
  const s = emptyState();
  s.people.push(newPerson({ name: "Juíza", email: "s1@ex.com", roles: ["judge"] }));
  syncParticipants(s, { signups: { list: [signup("s1")] } });
  assert.strictEqual(s.people.length, 1);
  assert.deepStrictEqual(s.people[0].roles.sort(), ["judge", "participant"]);
});

// ---------- link de acesso ----------
const T0 = new Date("2026-10-24T12:00:00Z");
const later = (ms) => new Date(T0.getTime() + ms);

test("link: uso único", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  const raw = issueLoginToken(s, p.id, T0);
  assert.strictEqual(consumeLoginToken(s, raw, later(1000)).id, p.id);
  assert.throws(() => consumeLoginToken(s, raw, later(2000)), /Link inválido/);
});
test("link: expira em 7 dias", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  const raw = issueLoginToken(s, p.id, T0);
  assert.throws(() => consumeLoginToken(s, raw, later(7 * 864e5 + 1)), /Link inválido/);
});
test("link: um novo invalida o anterior; lixo e pessoa bloqueada não entram", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  const old = issueLoginToken(s, p.id, T0);
  const fresh = issueLoginToken(s, p.id, later(1000));
  assert.throws(() => consumeLoginToken(s, old, later(2000)), /Link inválido/);
  assert.throws(() => consumeLoginToken(s, "x".repeat(32), later(2000)), /Link inválido/);
  assert.throws(() => consumeLoginToken(s, undefined, later(2000)), /Link inválido/);
  p.disabled = true;
  assert.throws(() => consumeLoginToken(s, fresh, later(2000)), /Link inválido/);
});
test("link: guardado só como hash", () => {
  const s = emptyState();
  const p = newPerson({});
  s.people.push(p);
  const raw = issueLoginToken(s, p.id, T0);
  assert.ok(!JSON.stringify(s).includes(raw));
});

// ---------- ator ----------
const req = (hack, member) => ({ session: { hack } , _member: member });
const deps = { liveMember: (r) => r._member || null };

test("ator: sessão do evento identifica; epoch velho não", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  assert.strictEqual(resolveActor(req({ pid: p.id, epoch: 1 }), s, deps).person.id, p.id);
  p.sessionEpoch = 2;
  assert.strictEqual(resolveActor(req({ pid: p.id, epoch: 1 }), s, deps), null);
});
test("ator: diretoria vem só do login da liga, nunca de papel gravado", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"], email: "dir@lepv.org" });
  s.people.push(p);
  let a = resolveActor(req({ pid: p.id, epoch: 1 }), s, deps);
  assert.ok(!a.roles.includes("director"));
  a = ensureActorPerson(s, resolveActor(req(null, { order: 4, name: "Dir Etor", director: true }), s, deps));
  assert.ok(a.roles.includes("director"));
  assert.strictEqual(perms(a).manage, true);
  assert.ok(!a.person.roles.includes("director"), "papel de diretoria não é gravado");
  // Membro comum logado não ganha nada.
  assert.strictEqual(resolveActor(req(null, { order: 9, name: "X", director: false }), s, deps), null);
});
test("ator: staff só publica/credencia com a permissão marcada", () => {
  const p = newPerson({ roles: ["staff"] });
  assert.strictEqual(perms({ person: p, roles: p.roles }).comms, false);
  p.staffPerms.comms = true;
  assert.strictEqual(perms({ person: p, roles: p.roles }).comms, true);
  assert.strictEqual(perms({ person: p, roles: p.roles }).checkin, false);
});

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      results.pass++;
      console.log("  ok   " + t.name);
    } catch (err) {
      results.fail++;
      console.log("  FALHA " + t.name + "\n        " + err.message);
    }
  }
  console.log("\nhackathon: " + results.pass + " passaram, " + results.fail + " falharam");
  process.exitCode = results.fail ? 1 : 0;
})();
