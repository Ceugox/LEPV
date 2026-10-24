// Unidade da plataforma do hackathon (lib/hackathon). Sem servidor, sem rede:
// funções puras e o estado em memória, com relógio injetado.
//
//   node tests/hackathon.js
const assert = require("assert");
const { emptyState } = require("../lib/hackathon/store");
const { pickHackathonEvent, signupRedirect } = require("../lib/hackathon/event");
const { syncParticipants, newPerson } = require("../lib/hackathon/people");
const { issueLoginToken, consumeLoginToken, unconsumeLoginToken, revokeOtherTokens, revokeAllTokens, resolveActor, ensureActorPerson, perms } = require("../lib/hackathon/access");
const { sha256 } = require("../lib/hackathon/store");
const A = require("../lib/hackathon/announcements");
const eq1 = (a, b, m) => assert.strictEqual(a, b, m);

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

test("sync: inscrição pública não sequestra contato cadastrado pela diretoria", () => {
  const s = emptyState();
  const judge = newPerson({ name: "Júlia Jurada", email: "julia@ex.com", phone: "21911112222", roles: ["judge"], manual: ["name", "email", "phone"] });
  s.people.push(judge);
  syncParticipants(s, { signups: { list: [signup("s9", { email: "julia@ex.com", name: "Invasor Silva", phone: "21900000000" })] } });
  eq1(s.people.length, 1);
  eq1(judge.phone, "21911112222", "telefone da diretoria fica");
  eq1(judge.name, "Júlia Jurada", "nome da diretoria fica");
});
test("sync: correção de e-mail pela diretoria sobrevive à próxima sincronização", () => {
  const s = emptyState();
  const ev = { signups: { list: [signup("s1", { email: "errado@ex.com" })] } };
  syncParticipants(s, ev);
  const p = s.people[0];
  p.email = "certo@ex.com";
  p.manual = ["email"];
  syncParticipants(s, ev);
  eq1(p.email, "certo@ex.com");
});
test("sync: participante já inscrito não é ligado a outra inscrição pelo e-mail", () => {
  const s = emptyState();
  syncParticipants(s, { signups: { list: [signup("s1")] } });
  syncParticipants(s, { signups: { list: [signup("s1"), signup("s2", { email: "s1@ex.com" })] } });
  eq1(s.people.length, 2, "segunda inscrição com o mesmo e-mail vira outra pessoa");
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
test("link: ainda vale um pouco antes dos 7 dias", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  const raw = issueLoginToken(s, p.id, T0);
  eq1(consumeLoginToken(s, raw, later(7 * 864e5 - 1000)).id, p.id);
});
test("link: revokeOthers:false mantém o antigo até a entrega; unconsume devolve", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  const old = issueLoginToken(s, p.id, T0);
  const fresh = issueLoginToken(s, p.id, later(1000), { revokeOthers: false });
  eq1(consumeLoginToken(s, old, later(2000)).id, p.id, "antigo ainda vale");
  unconsumeLoginToken(s, old);
  revokeOtherTokens(s, p.id, sha256(fresh), later(3000));
  assert.throws(() => consumeLoginToken(s, old, later(4000)), /Link inválido/);
  eq1(consumeLoginToken(s, fresh, later(4000)).id, p.id);
});
test("link: lista de espera pode entrar; quem não tem papel nem inscrição não", () => {
  const s = emptyState();
  const w = newPerson({ signupStatus: "waitlist" });
  const nobody = newPerson({});
  s.people.push(w, nobody);
  eq1(consumeLoginToken(s, issueLoginToken(s, w.id, T0), later(1)).id, w.id);
  assert.throws(() => consumeLoginToken(s, issueLoginToken(s, nobody.id, T0), later(1)), /Link inválido/);
});
test("link: revokeAllTokens derruba os pendentes", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["judge"] });
  s.people.push(p);
  const raw = issueLoginToken(s, p.id, T0);
  revokeAllTokens(s, p.id, later(1));
  assert.throws(() => consumeLoginToken(s, raw, later(2)), /Link inválido/);
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
test("ator: diretoria logada vence link de participante aberto no mesmo navegador", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"] });
  s.people.push(p);
  const a = ensureActorPerson(s, resolveActor(req({ pid: p.id, epoch: 1 }, { order: 4, name: "Dir Etor", director: true }), s, deps));
  assert.notStrictEqual(a.person.id, p.id);
  assert.ok(a.roles.includes("director"));
});

test("ator: staff só publica/credencia com a permissão marcada", () => {
  const p = newPerson({ roles: ["staff"] });
  assert.strictEqual(perms({ person: p, roles: p.roles }).comms, false);
  p.staffPerms.comms = true;
  assert.strictEqual(perms({ person: p, roles: p.roles }).comms, true);
  assert.strictEqual(perms({ person: p, roles: p.roles }).checkin, false);
});

// ---------- avisos ----------
function annState() {
  const s = emptyState();
  const ana = newPerson({ name: "Ana", email: "ana@ex.com", phone: "21999990001", roles: ["participant"] });
  const juju = newPerson({ name: "Juju", email: "juju@ex.com", phone: "", roles: ["participant", "judge"] });
  const pat = newPerson({ name: "Pat", email: "pat@ex.com", roles: ["sponsor"] });
  const off = newPerson({ name: "Off", email: "off@ex.com", roles: ["participant"], disabled: true });
  s.people.push(ana, juju, pat, off);
  return { s, ana, juju, pat, off };
}
const draft = (extra) => A.validateDraft(Object.assign({ title: "Aviso teste", body: "Corpo do aviso", audiences: ["participant", "judge"], channels: { email: true, whatsapp: true } }, extra), T0);

test("avisos: dois papéis selecionados recebem uma vez por canal; bloqueado fora", () => {
  const { s, juju, off, pat } = annState();
  const ann = A.createAnnouncement(s, draft(), null, T0);
  eq1(ann.status, "published");
  eq1(ann.recipientCount, 2);
  eq1(s.deliveries.filter((d) => d.personId === juju.id && d.channel === "email").length, 1);
  eq1(s.deliveries.filter((d) => d.personId === juju.id && d.channel === "whatsapp").length, 0, "sem telefone, sem WhatsApp");
  eq1(s.deliveries.some((d) => d.personId === off.id || d.personId === pat.id), false);
  A.publish(s, ann, later(10));
  eq1(s.deliveries.length, 3, "publicar de novo não duplica");
});
test("avisos: público não selecionado não vê", () => {
  const { s } = annState();
  const ann = A.createAnnouncement(s, draft({ audiences: ["sponsor"] }), null, T0);
  eq1(A.canSee(ann, ["participant", "judge"]), false);
  eq1(A.canSee(ann, ["sponsor"]), true);
  eq1(A.canSee(Object.assign({}, ann, { status: "scheduled" }), ["sponsor"]), false);
});
test("avisos: Todos vira os quatro públicos; público vazio ou inválido é recusado", () => {
  eq1(A.normalizeAudiences(["all"]).length, 4);
  assert.throws(() => A.normalizeAudiences([]), /público/);
  assert.throws(() => A.normalizeAudiences(["director"]), /público/);
});
test("avisos: urgente marca push; agendamento no passado é recusado", () => {
  eq1(draft({ urgent: true }).channels.push, true);
  assert.throws(() => draft({ scheduledAt: "2026-10-01T10:00:00-03:00" }), /futuro/);
});
test("avisos: agendador publica na hora, nunca antes, e vencido vira overdue", () => {
  const { s } = annState();
  A.seedAnnouncements(s);
  const [first, second] = s.announcements;
  eq1(first.scheduledAt, "2026-10-30T18:00:00.000Z");
  eq1(second.scheduledAt, "2026-10-31T11:00:00.000Z");
  eq1(A.tick(s, new Date("2026-10-30T17:59:59Z")).length, 0);
  eq1(A.tick(s, new Date("2026-10-30T18:00:00Z")).length, 1);
  eq1(first.status, "published");
  eq1(first.recipientCount, 2, "só participantes ativos");
  eq1(A.tick(s, new Date("2026-10-30T18:00:30Z")).length, 0, "não republica");
  eq1(A.tick(s, new Date("2026-10-31T11:06:00Z")).length, 0, "passou da folga de 5 min");
  eq1(second.status, "overdue");
});
test("avisos: semente só para participantes, sem e-mail, sem duplicar", () => {
  const { s } = annState();
  A.seedAnnouncements(s);
  s.announcements.forEach((a) => {
    assert.deepStrictEqual(a.audiences, ["participant"]);
    eq1(a.channels.email, false);
  });
  A.seedAnnouncements(s);
  eq1(s.announcements.length, 2);
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
