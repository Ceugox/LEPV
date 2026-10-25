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
const TM = require("../lib/hackathon/teams");
const EV = require("../lib/hackathon/evaluation");
const { createDelivery, MAX_ATTEMPTS } = require("../lib/hackathon/delivery");
const { publicBaseFor, rateLimiter, networkOutcome, route, setReporter, HackError } = require("../lib/hackathon/util");
const { createPush } = require("../lib/hackathon/push");
const { sendAccessLink } = require("../lib/hackathon/routes/access");
const PT = require("../lib/hackathon/partners");
const K = require("../lib/hackathon/admission");
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

// ---------- equipes ----------
function teamState(n, extra) {
  const s = emptyState();
  const ps = [];
  for (let i = 0; i < n; i++) {
    const p = newPerson(Object.assign({ name: "P" + i, roles: ["participant"], profile: { published: true, bio: "", skills: [], interests: [] } }, extra && extra(i)));
    s.people.push(p);
    ps.push(p);
  }
  return { s, ps };
}

test("equipes: confirmação só com 2 a 4 (1, 2, 4 e 5)", () => {
  const { s, ps } = teamState(6);
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  assert.throws(() => TM.confirm(s, t, T0), /2 a 4/);
  TM.joinByCode(s, ps[1].id, t.code, T0);
  eq1(TM.confirm(s, t, T0).status, "confirmed");
  TM.joinByCode(s, ps[2].id, t.code.toLowerCase(), T0);
  TM.joinByCode(s, ps[3].id, t.code, T0);
  eq1(TM.confirm(s, t, T0).members.length, 4);
  assert.throws(() => TM.joinByCode(s, ps[4].id, t.code, T0), /4 pessoas/);
});
test("equipes: uma equipe por pessoa", () => {
  const { s, ps } = teamState(3);
  TM.createTeam(s, ps[0].id, "Alfa", T0);
  const b = TM.createTeam(s, ps[1].id, "Beta", T0);
  assert.throws(() => TM.joinByCode(s, ps[0].id, b.code, T0), /outra equipe/);
  assert.throws(() => TM.createTeam(s, ps[0].id, "Gama", T0), /já está/);
  assert.throws(() => TM.createTeam(s, ps[2].id, "alfa", T0), /mesmo nome|nome/);
});
test("equipes: duas aceitações para a última vaga — só uma entra", () => {
  const { s, ps } = teamState(6);
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  TM.joinByCode(s, ps[1].id, t.code, T0);
  TM.joinByCode(s, ps[2].id, t.code, T0);
  const i1 = TM.invite(s, t, ps[0].id, ps[3].id, T0);
  const i2 = TM.invite(s, t, ps[0].id, ps[4].id, T0);
  TM.decide(s, i1.id, ps[3].id, true, T0);
  eq1(t.members.length, 4);
  eq1(s.invites.find((i) => i.id === i2.id).status, "cancelled", "equipe cheia cancela os outros convites");
  assert.throws(() => TM.decide(s, i2.id, ps[4].id, true, T0), /não encontrado/);
});
test("equipes: aceitar convite de duas equipes — a segunda é recusada pelo sistema", () => {
  const { s, ps } = teamState(3);
  const a = TM.createTeam(s, ps[0].id, "Alfa", T0);
  const b = TM.createTeam(s, ps[1].id, "Beta", T0);
  const ia = TM.invite(s, a, ps[0].id, ps[2].id, T0);
  const ib = TM.invite(s, b, ps[1].id, ps[2].id, T0);
  TM.decide(s, ia.id, ps[2].id, true, T0);
  eq1(s.invites.find((i) => i.id === ib.id).status, "cancelled");
  assert.throws(() => TM.decide(s, ib.id, ps[2].id, true, T0), /não encontrado/);
  eq1(TM.teamOf(s, ps[2].id).id, a.id);
});
test("equipes: quem declarou grupo não é descoberto nem convidado, mas entra por código", () => {
  const { s, ps } = teamState(2, (i) => (i === 1 ? { hasGroup: true } : {}));
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  eq1(TM.discoverable(s, ps[1]), false);
  assert.throws(() => TM.invite(s, t, ps[0].id, ps[1].id, T0), /disponível/);
  assert.throws(() => TM.request(s, t, ps[1].id, T0), /código/);
  TM.joinByCode(s, ps[1].id, t.code, T0);
  eq1(t.members.length, 2);
});
test("equipes: perfil escondido não é descoberto; pedido decidido por membro da equipe", () => {
  const { s, ps } = teamState(3, (i) => (i === 2 ? { profile: { published: false, skills: [] } } : {}));
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  eq1(TM.discoverable(s, ps[2]), false);
  const r = TM.request(s, t, ps[1].id, T0);
  assert.throws(() => TM.decide(s, r.id, ps[1].id, true, T0), /não pode/);
  TM.decide(s, r.id, ps[0].id, true, T0);
  eq1(t.members.length, 2);
});
test("equipes: saída abaixo de 2 desconfirma; vazia some; dono passa adiante", () => {
  const { s, ps } = teamState(2);
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  TM.joinByCode(s, ps[1].id, t.code, T0);
  TM.confirm(s, t, T0);
  TM.leave(s, t, ps[0].id, T0);
  eq1(t.status, "forming");
  eq1(t.ownerId, ps[1].id);
  TM.leave(s, t, ps[1].id, T0);
  eq1(s.teams.length, 0);
});
test("equipes: não participante não entra; diretoria junta equipes até 4", () => {
  const { s, ps } = teamState(5);
  const judge = newPerson({ roles: ["judge"] });
  s.people.push(judge);
  assert.throws(() => TM.createTeam(s, judge.id, "Banca", T0), /participantes/);
  const a = TM.createTeam(s, ps[0].id, "Alfa", T0);
  TM.joinByCode(s, ps[1].id, a.code, T0);
  const b = TM.createTeam(s, ps[2].id, "Beta", T0);
  TM.joinByCode(s, ps[3].id, b.code, T0);
  const c = TM.createTeam(s, ps[4].id, "Gama", T0);
  TM.merge(s, a.id, b.id, T0);
  eq1(a.members.length, 4);
  eq1(s.teams.some((t) => t.id === b.id), false);
  assert.throws(() => TM.merge(s, a.id, c.id, T0), /passariam/);
});

// ---------- entrega e avaliação ----------
function evalState(nTeams) {
  const { s, ps } = teamState(nTeams * 2);
  const teams = [];
  for (let i = 0; i < nTeams; i++) {
    const t = TM.createTeam(s, ps[i * 2].id, "Equipe " + i, T0);
    TM.joinByCode(s, ps[i * 2 + 1].id, t.code, T0);
    TM.confirm(s, t, T0);
    EV.upsertSubmission(s, t.id, { repoUrl: "https://github.com/x/" + i, slides: { file: "f.pdf", name: "s.pdf", size: 10 } }, ps[i * 2].id, T0);
    teams.push(t);
  }
  const judges = [0, 1, 2].map((i) => {
    const j = newPerson({ name: "J" + i, roles: ["judge"] });
    s.people.push(j);
    return j;
  });
  return { s, teams, judges };
}
const vals = (s, a, b) => {
  const [c1, c2] = s.config.evaluation.criteria;
  return { values: { [c1.id]: a, [c2.id]: b } };
};

test("avaliação: critérios travados antes de abrir; com nota, não destravam", () => {
  const { s, teams, judges } = evalState(1);
  assert.throws(() => EV.setOpen(s, true), /Trave/);
  assert.throws(() => EV.lockCriteria(s, true), /pelo menos um/);
  EV.addCriterion(s, { name: "Aderência", weight: 2 });
  EV.addCriterion(s, { name: "Execução", weight: 1, scaleMax: 10 });
  EV.lockCriteria(s, true);
  assert.throws(() => EV.addCriterion(s, { name: "Outro" }), /travados/);
  eq1(s.config.evaluation.tiebreakCriterionId, s.config.evaluation.criteria[0].id, "desempate padrão é o primeiro");
  assert.throws(() => EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 3, 3), T0), /não está aberta/);
  EV.setOpen(s, true);
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 5, 10), T0);
  assert.throws(() => EV.lockCriteria(s, false), /notas/);
});
test("avaliação: nota fora da escala ou faltando critério é recusada", () => {
  const { s, teams, judges } = evalState(1);
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta", scaleMax: 10 });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  assert.throws(() => EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 6, 3), T0), /1 a 5/);
  assert.throws(() => EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 2.5, 3), T0), /inteira/);
  const [c1] = s.config.evaluation.criteria;
  assert.throws(() => EV.submitScore(s, judges[0].id, teams[0].id, { values: { [c1.id]: 3 } }, T0), /Beta/);
});
test("avaliação: só equipe confirmada com entrega completa é avaliada", () => {
  const { s, teams, judges } = evalState(2);
  s.submissions.find((x) => x.teamId === teams[1].id).slides = null;
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta" });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  eq1(EV.evaluableTeams(s).length, 1);
  assert.throws(() => EV.submitScore(s, judges[0].id, teams[1].id, vals(s, 3, 3), T0), /não está em avaliação/);
});
test("avaliação: ranking por média ponderada, desempate pelo critério escolhido", () => {
  const { s, teams, judges } = evalState(3);
  EV.addCriterion(s, { name: "Aderência", weight: 1 });
  EV.addCriterion(s, { name: "Pitch", weight: 1 });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  // T0: (5,1) e T1: (1,5) empatam na média; desempate = Aderência → T0 na frente.
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 5, 1), T0);
  EV.submitScore(s, judges[0].id, teams[1].id, vals(s, 1, 5), T0);
  EV.submitScore(s, judges[0].id, teams[2].id, vals(s, 5, 5), T0);
  const r = EV.ranking(s);
  eq1(r[0].teamId, teams[2].id);
  eq1(r[0].score, 100);
  eq1(r[1].teamId, teams[0].id);
  eq1(r[2].teamId, teams[1].id);
  eq1(r[1].position, 2);
  eq1(r[2].position, 3);
});
test("avaliação: impedimento tira a nota e não conta no total de jurados", () => {
  const { s, teams, judges } = evalState(1);
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta" });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 1, 1), T0);
  EV.submitScore(s, judges[1].id, teams[0].id, vals(s, 5, 5), T0);
  eq1(EV.ranking(s)[0].score, 50);
  EV.setConflict(s, judges[0].id, teams[0].id, true, T0);
  const row = EV.ranking(s)[0];
  eq1(row.score, 100);
  eq1(row.eligibleJudges, 2);
  assert.throws(() => EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 3, 3), T0), /impedido/);
});
test("avaliação: fase final usa a nota da final para finalistas; travar fecha a banca", () => {
  const { s, teams, judges } = evalState(3);
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta" });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 5, 5), T0);
  EV.submitScore(s, judges[0].id, teams[1].id, vals(s, 4, 4), T0);
  EV.submitScore(s, judges[0].id, teams[2].id, vals(s, 1, 1), T0);
  assert.throws(() => EV.setPhase(s, "final"), /2 finalistas/);
  EV.setFinalists(s, [teams[0].id, teams[1].id]);
  EV.setPhase(s, "final");
  eq1(EV.evaluableTeams(s).length, 2);
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 2, 2), T0);
  EV.submitScore(s, judges[0].id, teams[1].id, vals(s, 5, 5), T0);
  const r = EV.ranking(s);
  eq1(r[0].teamId, teams[1].id, "vence a final, não a fase única");
  eq1(r[2].teamId, teams[2].id, "não finalista depois");
  EV.lockResults(s, true, T0);
  eq1(s.config.evaluation.open, false);
  assert.throws(() => EV.setOpen(s, true), /travado/);
  eq1(EV.podium(s), null, "nada público antes de revelar");
  EV.reveal(s, T0);
  const pod = EV.podium(s);
  eq1(pod.length, 3);
  eq1(pod[0].name, teams[1].name);
  eq1(pod[0].score, undefined, "pódio não mostra nota");
  assert.throws(() => EV.lockResults(s, false, T0), /revelado/);
});
test("avaliação: jurado que é integrante não avalia a própria equipe", () => {
  const { s, teams } = evalState(1);
  const member = s.people.find((p) => p.id === teams[0].members[0]);
  member.roles.push("judge");
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta" });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  eq1(EV.hasConflict(s, member.id, teams[0].id), true);
  assert.throws(() => EV.submitScore(s, member.id, teams[0].id, vals(s, 5, 5), T0), /impedido/);
});
test("entrega: PDF de verdade e links http(s)", () => {
  eq1(EV.isPdf(Buffer.from("%PDF-1.7 ...")), true);
  eq1(EV.isPdf(Buffer.from("<html>")), false);
  assert.throws(() => EV.validateSubmissionFields({ repoUrl: "javascript:alert(1)" }), /inválido/);
  eq1(EV.validateSubmissionFields({ repoUrl: "https://github.com/a/b" }).repoUrl, "https://github.com/a/b");
});

// ---------- revisão 2: entrega, base, limites, revogação ----------
// Store em memória com o mesmo contrato do real (get/mutate com rollback).
function memStore(state, opts) {
  let st = state;
  return {
    get: () => st,
    mutate(fn) {
      const snap = JSON.stringify(st);
      try {
        const r = fn(st);
        if (opts && opts.failWrite && opts.failWrite()) throw new Error("disco cheio");
        return r;
      } catch (e) {
        st = JSON.parse(snap);
        throw e;
      }
    },
  };
}
function deliveryCtx(state, mailResult, opts) {
  const sent = [];
  const ctx = {
    store: memStore(state, opts),
    now: () => (opts && opts.now ? opts.now() : T0),
    baseUrl: () => "https://lepv.example",
    report: () => {},
    mail: {
      emailEnabled: () => true,
      layout: () => "<html>",
      sendEmail: async (m) => {
        sent.push(m);
        return typeof mailResult === "function" ? mailResult() : mailResult;
      },
    },
  };
  const push = { enabled: () => false, publicKey: () => "", send: async () => ({ status: "sent" }) };
  return { ctx, sent, push };
}
function stateWithEmailDelivery() {
  const { s } = annState();
  A.createAnnouncement(s, draft({ audiences: ["sponsor"], channels: { email: true } }), null, T0);
  return s;
}

test("entrega: sucesso marca enviado; e-mail usa a base pública", async () => {
  const s = stateWithEmailDelivery();
  const { ctx, sent, push } = deliveryCtx(s, { status: "outbox" });
  await createDelivery(ctx, push).runOnce();
  eq1(ctx.store.get().deliveries[0].status, "sent");
  assert.ok(sent[0].text.includes("https://lepv.example/hack/portal#avisos"));
});
test("entrega: falha reenvia com espera; incerto não reenvia sozinho", async () => {
  const s = stateWithEmailDelivery();
  let t = T0.getTime();
  const { ctx, sent, push } = deliveryCtx(s, { status: "failed", error: "HTTP 500" }, { now: () => new Date(t) });
  const d = createDelivery(ctx, push);
  await d.runOnce();
  eq1(ctx.store.get().deliveries[0].status, "failed");
  await d.runOnce();
  eq1(sent.length, 1, "espera antes da segunda tentativa");
  t += 61 * 1000;
  await d.runOnce();
  eq1(sent.length, 2);
  t += 6 * 60 * 1000;
  await d.runOnce();
  await d.runOnce();
  eq1(sent.length, MAX_ATTEMPTS, "para no máximo de tentativas");

  const s2 = stateWithEmailDelivery();
  const u = deliveryCtx(s2, { status: "unknown", error: "timeout" });
  const d2 = createDelivery(u.ctx, u.push);
  await d2.runOnce();
  await d2.runOnce();
  eq1(u.sent.length, 1);
  eq1(u.ctx.store.get().deliveries[0].status, "unknown");
});
test("entrega: se gravar o resultado falha, o recibo fica 'enviando' e não sai de novo", async () => {
  const s = stateWithEmailDelivery();
  let writes = 0;
  // Gravações: 1ª no boot da entrega, 2ª "enviando", 3ª o resultado (falha).
  const { ctx, sent, push } = deliveryCtx(s, { status: "sent" }, { failWrite: () => ++writes === 3 });
  const d = createDelivery(ctx, push);
  await d.runOnce().catch(() => {});
  await d.runOnce().catch(() => {});
  eq1(sent.length, 1, "não reenviou");
  eq1(ctx.store.get().deliveries[0].status, "sending");
  // Reinício: "enviando" vira "incerto".
  createDelivery(Object.assign({}, ctx, { store: memStore(ctx.store.get()) }), push);
  eq1(ctx.store.get().deliveries[0].status, "unknown");
});
test("rede: sem conexão tenta de novo; timeout é incerto", () => {
  eq1(networkOutcome({ code: "ECONNREFUSED", message: "x" }).status, "failed");
  eq1(networkOutcome({ cause: { code: "ENOTFOUND" }, message: "fetch failed" }).status, "failed");
  eq1(networkOutcome({ name: "TimeoutError", message: "aborted" }).status, "unknown");
});
test("base dos links: variável vence; Railway usa o domínio; Host só em dev", () => {
  const req = { protocol: "http", get: () => "evil.example" };
  eq1(publicBaseFor({ HACK_PUBLIC_URL: "https://lepv.org/" }, req), "https://lepv.org");
  eq1(publicBaseFor({ RAILWAY_ENVIRONMENT_NAME: "production" }, req), "https://lepv.org");
  eq1(publicBaseFor({}, req), "http://evil.example");
  eq1(publicBaseFor({}, null), "https://lepv.org");
});
test("limite: estoura depois do teto na janela", () => {
  const lim = rateLimiter(3, 60000);
  eq1([lim("a"), lim("a"), lim("a"), lim("a")].join(), "false,false,false,true");
  eq1(lim("b"), false, "chave separada");
});
test("link por e-mail: falha mantém o link antigo; sucesso o revoga", async () => {
  const s = emptyState();
  const p = newPerson({ email: "x@ex.com", roles: ["participant"] });
  s.people.push(p);
  const old = issueLoginToken(s, p.id, T0);
  const bad = deliveryCtx(s, { status: "failed", error: "HTTP 422" });
  const r = await sendAccessLink(bad.ctx, "https://lepv.example", p.id);
  eq1(r.result.status, "failed");
  eq1(bad.ctx.store.get().people[0].lastLinkEmail.status, "failed");
  eq1(consumeLoginToken(bad.ctx.store.get(), old, later(1)).id, p.id, "antigo ainda vale");
  const s2 = emptyState();
  const p2 = newPerson({ email: "y@ex.com", roles: ["participant"] });
  s2.people.push(p2);
  const old2 = issueLoginToken(s2, p2.id, T0);
  const ok = deliveryCtx(s2, { status: "sent" });
  await sendAccessLink(ok.ctx, "https://lepv.example", p2.id);
  assert.throws(() => consumeLoginToken(ok.ctx.store.get(), old2, later(1)), /Link inválido/);
});
test("ator: inscrição retirada derruba a sessão; membro bloqueado não entra", () => {
  const s = emptyState();
  const p = newPerson({ roles: ["participant"], signupStatus: "confirmed" });
  s.people.push(p);
  assert.ok(resolveActor(req({ pid: p.id, epoch: 1 }), s, deps));
  p.roles = [];
  p.signupStatus = "removed";
  eq1(resolveActor(req({ pid: p.id, epoch: 1 }), s, deps), null);
  const m = newPerson({ roles: ["participant"], memberOrder: 7 });
  s.people.push(m);
  assert.ok(resolveActor(req(null, { order: 7, name: "M", director: false }), s, deps));
  m.disabled = true;
  eq1(resolveActor(req(null, { order: 7, name: "M", director: false }), s, deps), null);
  const d = newPerson({ memberOrder: 8, disabled: true });
  s.people.push(d);
  eq1(resolveActor(req(null, { order: 8, name: "D", director: true }), s, deps), null, "diretor bloqueado aqui também");
});

// ---------- parceiros ----------
function partnerState() {
  const s = emptyState();
  const teachy = PT.addOrg(s, { name: "Teachy", kind: "sponsor" });
  const apoio = PT.addOrg(s, { name: "Apoio X", kind: "supporter" });
  return { s, teachy, apoio };
}
const reqBody = (extra) => Object.assign({ kind: "sponsor", name: "Rita Representante", email: "rita@teachy.com" }, extra);

test("parceiros: organização de outra modalidade (formulário adulterado) é recusada", () => {
  const { s, apoio, teachy } = partnerState();
  assert.throws(() => PT.createRequest(s, reqBody({ orgId: apoio.id }), T0), /lista/);
  PT.updateOrg(s, teachy.id, { active: false });
  assert.throws(() => PT.createRequest(s, reqBody({ orgId: teachy.id }), T0), /lista/, "inativa também");
});
test("parceiros: pedido não dá papel; aprovação dá papel e organização", () => {
  const { s, teachy } = partnerState();
  const r = PT.createRequest(s, reqBody({ orgId: teachy.id }), T0);
  eq1(s.people.length, 0, "pedir não cria acesso");
  eq1(PT.createRequest(s, reqBody({ orgId: teachy.id }), T0).id, r.id, "pedido repetido não duplica");
  const out = PT.decideRequest(s, r.id, true, "dir", T0);
  assert.deepStrictEqual(out.person.roles, ["sponsor"]);
  eq1(out.person.orgId, teachy.id);
  assert.throws(() => PT.decideRequest(s, r.id, true, "dir", T0), /já decidido/);
});
test("parceiros: recusado não vira pessoa; representante de outra org não é sobrescrito", () => {
  const { s, teachy, apoio } = partnerState();
  const r1 = PT.createRequest(s, reqBody({ orgId: teachy.id }), T0);
  PT.decideRequest(s, r1.id, false, "dir", T0);
  eq1(s.people.length, 0);
  const r2 = PT.createRequest(s, reqBody({ orgId: teachy.id }), T0);
  PT.decideRequest(s, r2.id, true, "dir", T0);
  const r3 = PT.createRequest(s, reqBody({ kind: "supporter", orgId: apoio.id }), T0);
  assert.throws(() => PT.decideRequest(s, r3.id, true, "dir", T0), /outra organização/);
});
test("parceiros: agenda só com atividades da própria organização", () => {
  const { s, teachy, apoio } = partnerState();
  s.program.push({ id: "a1", day: "2026-10-30", start: "16:30", end: "17:00", title: "Problemática", place: "FGV", orgIds: [teachy.id] });
  s.program.push({ id: "a2", day: "2026-10-30", start: "16:00", end: "16:30", title: "Apoio", place: "FGV", orgIds: [apoio.id] });
  eq1(PT.orgAgenda(s, teachy.id).map((a) => a.id).join(), "a1");
});
test("parceiros: exportação só de quem autorizou, sem fórmula executável", () => {
  const s = emptyState();
  s.people.push(newPerson({ name: "=HYPERLINK(1)", email: "a@ex.com", phone: "+5521", roles: ["participant"], consent: true, curso: "Eco" }));
  s.people.push(newPerson({ name: "Sem Consentimento", email: "b@ex.com", roles: ["participant"], consent: false }));
  s.people.push(newPerson({ name: "Jurado Consentido", email: "c@ex.com", roles: ["judge"], consent: true }));
  const out = PT.exportConsenting(s);
  eq1(out.count, 1);
  assert.ok(out.csv.includes(`"'=HYPERLINK(1)"`), "fórmula neutralizada");
  assert.ok(out.csv.includes(`"'+5521"`), "telefone com + também");
  assert.ok(!out.csv.includes("b@ex.com") && !out.csv.includes("c@ex.com"));
});

// ---------- revisão 3: integridade ----------
test("avaliação: nota ponderada tem valor exato (peso 2 escala 5, peso 1 escala 10)", () => {
  const crit = [{ id: "a", weight: 2, scaleMax: 5 }, { id: "b", weight: 1, scaleMax: 10 }];
  // (2*(4-1)/4 + 1*(7-1)/9) / 3 * 100
  eq1(Math.round(EV.judgeTotal(crit, { a: 4, b: 7 }) * 100) / 100, 72.22);
  eq1(EV.judgeTotal(crit, { a: 5, b: 10 }), 100);
  eq1(EV.judgeTotal(crit, { a: 1, b: 1 }), 0);
});
test("avaliação: peso que arredonda para zero é recusado", () => {
  const { s } = evalState(1);
  assert.throws(() => EV.addCriterion(s, { name: "Quase nada", weight: 0.04 }), /Peso/);
});
test("avaliação: nota de jurado bloqueado ou que perdeu o papel não conta", () => {
  const { s, teams, judges } = evalState(1);
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta" });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 1, 1), T0);
  EV.submitScore(s, judges[1].id, teams[0].id, vals(s, 5, 5), T0);
  judges[0].disabled = true;
  eq1(EV.ranking(s)[0].score, 100);
  judges[0].disabled = false;
  judges[0].roles = [];
  eq1(EV.ranking(s)[0].score, 100);
});
test("avaliação: depois de revelado o pódio não muda (nem re-trava, nem equipe muda)", () => {
  const { s, teams, judges } = evalState(2);
  EV.addCriterion(s, { name: "Alfa" });
  EV.addCriterion(s, { name: "Beta" });
  EV.lockCriteria(s, true);
  EV.setOpen(s, true);
  EV.submitScore(s, judges[0].id, teams[0].id, vals(s, 5, 5), T0);
  EV.submitScore(s, judges[0].id, teams[1].id, vals(s, 1, 1), T0);
  EV.lockResults(s, true, T0);
  assert.throws(() => TM.leave(s, teams[0], teams[0].members[0], T0), /travado/);
  assert.throws(() => TM.merge(s, teams[0].id, teams[1].id, T0), /travado/);
  EV.reveal(s, T0);
  assert.throws(() => EV.lockResults(s, true, T0), /revelado/);
  assert.throws(() => EV.lockResults(s, false, T0), /revelado/);
});
test("equipes: quem deixa de ser participante sai da equipe; travado, nada muda", () => {
  const { s, ps } = teamState(3);
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  TM.joinByCode(s, ps[1].id, t.code, T0);
  TM.joinByCode(s, ps[2].id, t.code, T0);
  ps[2].roles = [];
  eq1(TM.prune(s, T0), true);
  eq1(t.members.length, 2);
  ps[1].disabled = true;
  s.config.evaluation.resultsLocked = true;
  eq1(TM.prune(s, T0), false);
  eq1(t.members.length, 2);
});
test("equipes: entrega não fica órfã (juntar e esvaziar)", () => {
  const { s, ps } = teamState(3);
  const a = TM.createTeam(s, ps[0].id, "Alfa", T0);
  const b = TM.createTeam(s, ps[1].id, "Beta", T0);
  EV.upsertSubmission(s, b.id, { repoUrl: "https://x.y/z" }, ps[1].id, T0);
  assert.throws(() => TM.merge(s, a.id, b.id, T0), /entregou/);
  assert.throws(() => TM.leave(s, b, ps[1].id, T0), /entrega/);
  // Inscrição retirada do último integrante: a limpeza automática não apaga
  // equipe que entregou — fica para a diretoria decidir.
  ps[1].roles = [];
  TM.prune(s, T0);
  eq1(s.submissions.length, 1);
  eq1(TM.findTeam(s, b.id).members.length, 1);
});
test("entrega: prorrogação vale só para a equipe", () => {
  const s = emptyState();
  const t = { id: "e1", deadlineOverride: "2026-10-31T16:30:00.000Z" };
  eq1(EV.deadlineFor(s, t), Date.parse("2026-10-31T16:30:00.000Z"));
  eq1(EV.deadlineFor(s, { id: "e2" }), Date.parse("2026-10-31T13:00:00-03:00"));
  eq1(EV.deadlineFor(s, { id: "e3", deadlineOverride: "2026-10-31T10:00:00Z" }), Date.parse("2026-10-31T13:00:00-03:00"), "prorrogar nunca encurta");
});
test("rede: chave inválida é falha, não 'incerto'", () => {
  eq1(networkOutcome(new Error("Vapid private key should be 32 bytes")).status, "failed");
  eq1(networkOutcome({ code: "ECONNRESET", message: "socket hang up" }).status, "unknown");
});

// ---------- credenciamento ----------
function admState() {
  const s = emptyState();
  const ana = newPerson({ name: "Ana", roles: ["participant"], email: "ana@ex.com", phone: "21999990001" });
  const wait = newPerson({ name: "Wal", signupStatus: "waitlist" });
  const off = newPerson({ name: "Off", roles: ["participant"], disabled: true });
  const staff = newPerson({ name: "Sid", roles: ["staff"], staffPerms: { comms: false, checkin: true } });
  s.people.push(ana, wait, off, staff);
  return { s, ana, wait, off, staff };
}
const DAY1 = "2026-10-30";

test("credenciamento: uma presença por pessoa e dia; repetição e QR alheio tratados", () => {
  const { s, ana, wait, off, staff } = admState();
  const op = { by: staff.id };
  eq1(K.admitByCode(s, "LEPVHACK1:" + ana.qrToken, DAY1, op, T0).status, "ok");
  const dup = K.admitByCode(s, "LEPVHACK1:" + ana.qrToken, DAY1, op, T0);
  eq1(dup.status, "duplicate");
  eq1(dup.checkin.by, "Sid");
  eq1(K.admitByCode(s, "LEPVHACK1:" + ana.qrToken, "2026-10-31", op, T0).status, "ok", "outro dia");
  eq1(K.admitByCode(s, "https://evil.example", DAY1, op, T0).status, "invalid");
  eq1(K.admitByCode(s, "LEPVHACK1:" + "x".repeat(24), DAY1, op, T0).status, "invalid");
  eq1(K.admitByCode(s, "LEPVHACK1:" + wait.qrToken, DAY1, op, T0).status, "waitlist");
  eq1(K.admitByCode(s, "LEPVHACK1:" + off.qrToken, DAY1, op, T0).status, "blocked");
  eq1(s.checkins.length, 2);
  assert.throws(() => K.resolveDay("2026-11-01", T0), /dias do evento/);
});
test("credenciamento: cópia offline só com hash, sem token nem contato", () => {
  const { s, ana } = admState();
  const snap = JSON.stringify(K.snapshot(s));
  assert.ok(!snap.includes(ana.qrToken));
  assert.ok(!snap.includes("ana@ex.com") && !snap.includes("21999990001"));
  assert.ok(snap.includes(sha256(ana.qrToken)));
});
test("credenciamento: sincronização idempotente; dois aparelhos não dobram a presença", () => {
  const { s, ana, staff } = admState();
  const d1 = K.prepareDevice(s, staff.id, "cel 1", T0).device;
  const d2 = K.prepareDevice(s, staff.id, "cel 2", T0).device;
  const h = sha256(ana.qrToken);
  const r1 = K.syncOps(s, d1, staff.id, [{ opId: "op-aaaaaaaa1", h, day: DAY1, at: T0.toISOString() }], T0);
  eq1(r1[0].status, "ok");
  const again = K.syncOps(s, d1, staff.id, [{ opId: "op-aaaaaaaa1", h, day: DAY1, at: T0.toISOString() }], later(1000));
  eq1(again[0].status, "ok", "mesma operação, mesmo resultado");
  const r2 = K.syncOps(s, d2, staff.id, [{ opId: "op-bbbbbbbb2", h, day: DAY1, at: T0.toISOString() }], later(2000));
  eq1(r2[0].status, "duplicate");
  eq1(s.checkins.length, 1);
  eq1(K.syncOps(s, d1, staff.id, [{ opId: "x", h, day: DAY1 }], T0)[0].status, "rejected");
});
test("credenciamento: aparelho revogado, vencido ou de outra pessoa não sincroniza", () => {
  const { s, staff, ana } = admState();
  const { device, token } = K.prepareDevice(s, staff.id, "cel", T0);
  eq1(K.checkDevice(s, device.id, token, staff.id, T0).id, device.id);
  assert.throws(() => K.checkDevice(s, device.id, "errado", staff.id, T0), /não autorizado/);
  assert.throws(() => K.checkDevice(s, device.id, token, ana.id, T0), /outra pessoa/);
  assert.throws(() => K.checkDevice(s, device.id, token, staff.id, new Date("2026-11-02T12:00:00Z")), /expirou/);
  device.revokedAt = T0.toISOString();
  assert.throws(() => K.checkDevice(s, device.id, token, staff.id, T0), /revogada/);
});
test("credenciamento: horário da leitura offline nunca fica no futuro", () => {
  const { s, ana, staff } = admState();
  const { device } = K.prepareDevice(s, staff.id, "cel", T0);
  K.syncOps(s, device, staff.id, [{ opId: "op-cccccccc3", personId: ana.id, day: DAY1, at: "2030-01-01T00:00:00Z" }], T0);
  eq1(s.checkins[0].at, T0.toISOString());
});

// ---------- revisão 4 ----------
test("credenciamento: no dia do evento só vale o dia de hoje", () => {
  const sat = new Date("2026-10-31T12:00:00Z"); // 9h de Brasília, sábado
  eq1(K.resolveDay("", sat), "2026-10-31");
  eq1(K.resolveDay("2026-10-31", sat), "2026-10-31");
  assert.throws(() => K.resolveDay("2026-10-30", sat), /Hoje é 31\/10/);
  eq1(K.resolveDay("2026-10-31", T0), "2026-10-31", "fora do evento (ensaio) escolhe");
});
test("credenciamento: leitura offline usa o dia em que foi feita, não o do seletor", () => {
  const { s, ana, staff } = admState();
  const sat = new Date("2026-10-31T15:00:00Z");
  const { device } = K.prepareDevice(s, staff.id, "cel", sat);
  const r = K.syncOps(s, device, staff.id, [{ opId: "op-dddddddd4", personId: ana.id, day: "2026-10-30", at: "2026-10-31T12:30:00Z" }], sat);
  eq1(r[0].status, "ok");
  eq1(s.checkins[0].day, "2026-10-31");
});
test("credenciamento: desfeita, a presença não volta pela mesma operação", () => {
  const { s, ana, staff } = admState();
  const { device } = K.prepareDevice(s, staff.id, "cel", T0);
  const op = { opId: "op-eeeeeeee5", personId: ana.id, day: DAY1, at: T0.toISOString() };
  const r = K.syncOps(s, device, staff.id, [op], T0);
  K.undo(s, r[0].checkin.id);
  eq1(s.checkins.length, 0);
  // Resposta perdida + reenvio depois do desfazer: não recria a presença.
  const again = K.syncOps(s, device, staff.id, [op], later(10));
  eq1(again[0].status, "undone");
  eq1(s.checkins.length, 0);
});
test("parceiros: nome único também ao editar; pendentes nunca somem no teto", () => {
  const { s, teachy, apoio } = partnerState();
  assert.throws(() => PT.updateOrg(s, apoio.id, { name: "teachy" }), /Já existe/);
  for (let i = 0; i < 520; i++) {
    const r = PT.createRequest(s, { kind: "sponsor", orgId: teachy.id, name: "Pessoa Teste" + i, email: "p" + i + "@ex.com" }, T0);
    if (i < 30) PT.decideRequest(s, r.id, false, "dir", T0);
  }
  eq1(s.partnerRequests.filter((x) => x.status === "pending").length, 490, "todo pendente fica");
});

// ---------- revisão 5 ----------
test("equipes: depois do prazo a limpeza automática não mexe", () => {
  const { s, ps } = teamState(3);
  const t = TM.createTeam(s, ps[0].id, "Alfa", T0);
  TM.joinByCode(s, ps[1].id, t.code, T0);
  ps[1].roles = [];
  eq1(TM.prune(s, new Date("2026-10-31T16:30:00Z")), false);
  eq1(t.members.length, 2);
});
test("credenciamento: operação malformada não derruba o lote", () => {
  const { s, ana, staff } = admState();
  const { device } = K.prepareDevice(s, staff.id, "cel", T0);
  const r = K.syncOps(s, device, staff.id, [null, 42, { opId: "op-ffffffff6", personId: ana.id, day: DAY1, at: T0.toISOString() }], T0);
  eq1(r[0].status, "rejected");
  eq1(r[1].status, "rejected");
  eq1(r[2].status, "ok");
});
test("credenciamento: aparelho vencido ainda entrega o que leu antes de vencer", () => {
  const { s, ana, staff } = admState();
  const { device, token } = K.prepareDevice(s, staff.id, "cel", T0);
  const after = new Date(Date.parse(device.expiresAt) + 3600 * 1000);
  assert.throws(() => K.checkDevice(s, device.id, token, staff.id, after), /expirou/);
  const dev = K.checkDevice(s, device.id, token, staff.id, after, { forSync: true });
  const r = K.syncOps(s, dev, staff.id, [
    { opId: "op-gggggggg7", personId: ana.id, day: DAY1, at: T0.toISOString() },
    { opId: "op-hhhhhhhh8", personId: ana.id, day: DAY1, at: after.toISOString() },
  ], after);
  eq1(r[0].status, "ok");
  eq1(r[1].status, "rejected");
  assert.throws(() => K.checkDevice(s, device.id, token, staff.id, new Date(Date.parse(device.expiresAt) + 8 * 864e5), { forSync: true }), /expirou/);
});
test("parceiros: bloqueado que autorizou fica fora do CSV", () => {
  const s = emptyState();
  s.people.push(newPerson({ name: "Ativa", email: "a@ex.com", roles: ["participant"], consent: true }));
  s.people.push(newPerson({ name: "Bloqueada", email: "b@ex.com", roles: ["participant"], consent: true, disabled: true }));
  const out = PT.exportConsenting(s);
  eq1(out.count, 1);
  assert.ok(!out.csv.includes("b@ex.com"));
});
test("parceiros: trocar a modalidade da organização troca o papel dos representantes", () => {
  const { s, teachy } = partnerState();
  const r = PT.createRequest(s, reqBody({ orgId: teachy.id }), T0);
  const { person } = PT.decideRequest(s, r.id, true, "dir", T0);
  PT.updateOrg(s, teachy.id, { kind: "supporter" });
  assert.deepStrictEqual(person.roles, ["supporter"]);
});

// ---------- revisão 6 ----------
test("parceiros: representante removido perde o link ainda não usado; org inativa não ganha representante", () => {
  const { s, teachy } = partnerState();
  const r = PT.createRequest(s, reqBody({ orgId: teachy.id }), T0);
  const { person } = PT.decideRequest(s, r.id, true, "dir", T0);
  const raw = issueLoginToken(s, person.id, T0);
  PT.removeRepresentative(s, person.id, later(1));
  assert.throws(() => consumeLoginToken(s, raw, later(2)), /Link inválido/);
  const r2 = PT.createRequest(s, reqBody({ orgId: teachy.id, email: "outra@teachy.com" }), T0);
  PT.updateOrg(s, teachy.id, { active: false });
  assert.throws(() => PT.decideRequest(s, r2.id, true, "dir", T0), /desativada/);
});
test("push: chave VAPID inválida desliga o push sem derrubar o boot", () => {
  const save = [process.env.HACK_VAPID_PUBLIC_KEY, process.env.HACK_VAPID_PRIVATE_KEY, process.env.HACK_PUSH_OUTBOX];
  process.env.HACK_VAPID_PUBLIC_KEY = "nao-e-chave";
  process.env.HACK_VAPID_PRIVATE_KEY = "tambem-nao";
  delete process.env.HACK_PUSH_OUTBOX;
  const orig = console.error;
  console.error = () => {};
  try {
    const p = createPush();
    eq1(p.enabled(), false);
    eq1(p.publicKey(), "");
  } finally {
    console.error = orig;
    [process.env.HACK_VAPID_PUBLIC_KEY, process.env.HACK_VAPID_PRIVATE_KEY, process.env.HACK_PUSH_OUTBOX] = save;
    for (const k of ["HACK_VAPID_PUBLIC_KEY", "HACK_VAPID_PRIVATE_KEY", "HACK_PUSH_OUTBOX"]) if (process.env[k] === "undefined") delete process.env[k];
  }
});
test("rotas: 500 vai para o registro de falhas; erro esperado não", async () => {
  const seen = [];
  setReporter((scope, err) => seen.push([scope, err.message]));
  const fake = () => {
    const res = { code: 0, body: null, headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
    return res;
  };
  const r1 = fake();
  await new Promise((done) => { route(() => { throw new Error("disco cheio"); })({ method: "GET", path: "/x" }, Object.assign(r1, { json(b) { this.body = b; done(); } })); });
  eq1(r1.code, 500);
  eq1(seen.length, 1);
  eq1(seen[0][1], "disco cheio");
  const r2 = fake();
  await new Promise((done) => { route(() => { throw new HackError(409, "x", "conflito"); })({ method: "GET", path: "/y" }, Object.assign(r2, { json(b) { this.body = b; done(); } })); });
  eq1(r2.code, 409);
  eq1(seen.length, 1, "HackError não é falha do sistema");
  setReporter(() => {});
});

test("credenciamento: leitura offline às 23h30 de sexta (Brasília) é da sexta", () => {
  const { s, ana, staff } = admState();
  const now = new Date("2026-10-31T12:00:00Z");
  const { device } = K.prepareDevice(s, staff.id, "cel", now);
  // 02h30 UTC de sábado = 23h30 de sexta em Brasília.
  K.syncOps(s, device, staff.id, [{ opId: "op-iiiiiiii9", personId: ana.id, day: "2026-10-31", at: "2026-10-31T02:30:00Z" }], now);
  eq1(s.checkins[0].day, "2026-10-30");
});

test("credenciamento: desfeita não volta nem por aparelho preparado de novo", () => {
  const { s, ana, staff } = admState();
  const d1 = K.prepareDevice(s, staff.id, "cel", T0).device;
  const op = { opId: "op-jjjjjjjj10", personId: ana.id, day: DAY1, at: T0.toISOString() };
  const r = K.syncOps(s, d1, staff.id, [op], T0);
  K.undo(s, r[0].checkin.id);
  const d2 = K.prepareDevice(s, staff.id, "cel", later(5)).device;
  eq1(K.syncOps(s, d2, staff.id, [op], later(10))[0].status, "undone");
  eq1(s.checkins.length, 0);
});

// ---------- grupo declarado: indicação de colegas ----------
const groupState = (n) => teamState(n, () => ({ hasGroup: true, profile: { published: false, bio: "", skills: [], interests: [] } }));

test("grupo: indicação aceita forma a equipe com quem indicou como dono", () => {
  const { s, ps } = groupState(3);
  const inv = TM.indicate(s, ps[0].id, ps[1].id, T0);
  eq1(TM.teamOf(s, ps[0].id), null, "nada de equipe antes do aceite");
  TM.decide(s, inv.id, ps[1].id, true, T0);
  const t = TM.teamOf(s, ps[0].id);
  assert.deepStrictEqual(t.members, [ps[0].id, ps[1].id]);
  eq1(t.ownerId, ps[0].id);
  eq1(t.name, "Grupo de P0");
  eq1(inv.status, "accepted");
});
test("grupo: segunda indicação aceita entra na mesma equipe; quem já entrou também indica", () => {
  const { s, ps } = groupState(4);
  const a = TM.indicate(s, ps[0].id, ps[1].id, T0);
  const b = TM.indicate(s, ps[0].id, ps[2].id, T0);
  TM.decide(s, a.id, ps[1].id, true, T0);
  const c = TM.indicate(s, ps[1].id, ps[3].id, T0);
  TM.decide(s, b.id, ps[2].id, true, T0);
  TM.decide(s, c.id, ps[3].id, true, T0);
  eq1(TM.teamOf(s, ps[3].id).members.length, 4);
  eq1(s.teams.length, 1);
});
test("grupo: só indica e é indicado quem tem grupo, sem equipe e confirmado", () => {
  const { s, ps } = groupState(5);
  ps[1].hasGroup = false;
  ps[2].roles = ["judge"];
  assert.throws(() => TM.indicate(s, ps[0].id, ps[1].id, T0), /não pode ser indicada/);
  assert.throws(() => TM.indicate(s, ps[0].id, ps[2].id, T0), /não pode ser indicada/);
  assert.throws(() => TM.indicate(s, ps[0].id, ps[0].id, T0), /não você/);
  assert.throws(() => TM.indicate(s, ps[1].id, ps[0].id, T0), /declarou ter grupo/);
  TM.createTeam(s, ps[3].id, "Já Tem", T0);
  assert.throws(() => TM.indicate(s, ps[0].id, ps[3].id, T0), /não pode ser indicada/);
});
test("grupo: limite de 4 conta as indicações pendentes; repetida não duplica", () => {
  const { s, ps } = groupState(6);
  const first = TM.indicate(s, ps[0].id, ps[1].id, T0);
  eq1(TM.indicate(s, ps[0].id, ps[1].id, T0).id, first.id);
  TM.indicate(s, ps[0].id, ps[2].id, T0);
  TM.indicate(s, ps[0].id, ps[3].id, T0);
  assert.throws(() => TM.indicate(s, ps[0].id, ps[4].id, T0), /passaria de 4/);
});
test("grupo: quem já foi indicado por alguém não indica de volta, aceita", () => {
  const { s, ps } = groupState(2);
  TM.indicate(s, ps[0].id, ps[1].id, T0);
  assert.throws(() => TM.indicate(s, ps[1].id, ps[0].id, T0), /já indicou você/);
});
test("grupo: recusa, cancelamento e só o indicado decide", () => {
  const { s, ps } = groupState(3);
  const a = TM.indicate(s, ps[0].id, ps[1].id, T0);
  assert.throws(() => TM.decide(s, a.id, ps[2].id, true, T0), /não pode decidir/);
  TM.decide(s, a.id, ps[1].id, false, T0);
  eq1(a.status, "declined");
  eq1(s.teams.length, 0);
  const b = TM.indicate(s, ps[0].id, ps[2].id, T0);
  assert.throws(() => TM.cancelIndication(s, b.id, ps[2].id, T0), /Só o grupo/);
  TM.cancelIndication(s, b.id, ps[0].id, T0);
  eq1(b.status, "cancelled");
});
test("grupo: indicado que entra em outra equipe perde as indicações pendentes", () => {
  const { s, ps } = groupState(3);
  const a = TM.indicate(s, ps[0].id, ps[1].id, T0);
  const t = TM.createTeam(s, ps[2].id, "Outra", T0);
  TM.join(s, t, ps[1].id, T0);
  eq1(a.status, "cancelled");
});
test("grupo: equipe que lota cancela as indicações que sobraram", () => {
  const { s, ps } = groupState(5);
  const inv = [1, 2, 3].map((i) => TM.indicate(s, ps[0].id, ps[i].id, T0));
  TM.decide(s, inv[0].id, ps[1].id, true, T0);
  TM.decide(s, inv[1].id, ps[2].id, true, T0);
  const t = TM.teamOf(s, ps[0].id);
  TM.join(s, t, ps[4].id, T0);
  eq1(t.members.length, 4);
  eq1(inv[2].status, "cancelled");
});
test("grupo: nome provisório não colide", () => {
  const { s, ps } = groupState(4);
  ps[2].name = "P0 Outro";
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  TM.decide(s, TM.indicate(s, ps[2].id, ps[3].id, T0).id, ps[3].id, true, T0);
  eq1(TM.teamOf(s, ps[2].id).name, "Grupo de P0 2");
});
test("grupo: quem sai da equipe leva embora as indicações que fez", () => {
  const { s, ps } = groupState(4);
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  const pend = TM.indicate(s, ps[1].id, ps[2].id, T0);
  TM.leave(s, TM.teamOf(s, ps[1].id), ps[1].id, T0);
  eq1(pend.status, "cancelled");
});
test("grupo: autor ou indicado que deixa de participar tem a indicação cancelada na limpeza", () => {
  const { s, ps } = groupState(4);
  const a = TM.indicate(s, ps[0].id, ps[1].id, T0);
  const b = TM.indicate(s, ps[2].id, ps[3].id, T0);
  ps[0].disabled = true;
  ps[3].roles = [];
  eq1(TM.prune(s, T0), true);
  eq1(a.status, "cancelled");
  eq1(b.status, "cancelled");
});
test("grupo: quando dois lados se juntam, o que passa de 4 é cancelado (mais novas primeiro)", () => {
  const { s, ps } = groupState(7);
  const toB = TM.indicate(s, ps[0].id, ps[1].id, T0);
  TM.indicate(s, ps[0].id, ps[2].id, T0);
  const later = new Date(T0.getTime() + 60000);
  const b1 = TM.indicate(s, ps[1].id, ps[3].id, T0);
  const b2 = TM.indicate(s, ps[1].id, ps[4].id, later);
  TM.decide(s, toB.id, ps[1].id, true, later);
  // equipe {0,1} + pendentes de 0 (→2) e de 1 (→3, →4) = 5 > 4: cai a mais nova de 1
  eq1(b2.status, "cancelled");
  eq1(b1.status, "pending");
});
test("grupo: recusa e cancelamento liberam a vaga para outra indicação", () => {
  const { s, ps } = groupState(6);
  const inv = [1, 2, 3].map((i) => TM.indicate(s, ps[0].id, ps[i].id, T0));
  assert.throws(() => TM.indicate(s, ps[0].id, ps[4].id, T0), /passaria de 4/);
  TM.decide(s, inv[0].id, ps[1].id, false, T0);
  TM.indicate(s, ps[0].id, ps[4].id, T0);
  TM.cancelIndication(s, inv[1].id, ps[0].id, T0);
  TM.indicate(s, ps[0].id, ps[5].id, T0);
});
test("grupo: indicação repetida volta marcada como repetida", () => {
  const { s, ps } = groupState(2);
  TM.indicate(s, ps[0].id, ps[1].id, T0);
  eq1(TM.indicate(s, ps[0].id, ps[1].id, T0).duplicate, true);
  eq1(s.invites.length, 1);
});
test("grupo: nome provisório cabe em 40 caracteres mesmo com primeiro nome enorme", () => {
  const { s, ps } = groupState(4);
  ps[0].name = "Maximiliano".repeat(5) + " Silva";
  ps[2].name = ps[0].name;
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  TM.decide(s, TM.indicate(s, ps[2].id, ps[3].id, T0).id, ps[3].id, true, T0);
  assert(s.teams.every((t) => t.name.length <= 40), s.teams.map((t) => t.name).join(", "));
  eq1(s.teams.length, 2);
});
test("grupo: cancelar com resultado travado é recusado", () => {
  const { s, ps } = groupState(2);
  const a = TM.indicate(s, ps[0].id, ps[1].id, T0);
  s.config.evaluation.resultsLocked = true;
  assert.throws(() => TM.cancelIndication(s, a.id, ps[0].id, T0), /travado/);
});
test("grupo: pessoa indicada por dois do mesmo grupo conta uma vez só", () => {
  const { s, ps } = groupState(5);
  // B indica A e C; A (ainda sem equipe) indica C e D. A aceita B.
  const bToA = TM.indicate(s, ps[1].id, ps[0].id, T0);
  TM.indicate(s, ps[1].id, ps[2].id, T0);
  const later = new Date(T0.getTime() + 60000);
  const aToC = TM.indicate(s, ps[0].id, ps[2].id, later);
  const aToD = TM.indicate(s, ps[0].id, ps[3].id, later);
  TM.decide(s, bToA.id, ps[0].id, true, later);
  eq1(aToC.status, "cancelled", "repetida sai");
  eq1(aToC.reason, "duplicate");
  eq1(TM.lostSeatsFor(s, ps[2].id, later).length, 0, "C não recebe aviso: a indicação do B segue valendo");
  eq1(aToD.status, "pending", "D mantém a vaga: só 2 pessoas pendentes");
});
test("grupo: entrada por código que lota a equipe corta as indicações excedentes", () => {
  const { s, ps } = groupState(6);
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  const c = TM.indicate(s, ps[0].id, ps[2].id, T0);
  const d = TM.indicate(s, ps[0].id, ps[3].id, new Date(T0.getTime() + 1000));
  const t = TM.teamOf(s, ps[0].id);
  TM.join(s, t, ps[4].id, T0);
  eq1(t.members.length, 3);
  eq1(c.status, "pending");
  eq1(d.status, "cancelled", "3 integrantes + 2 pendentes passaria de 4");
  eq1(d.reason, "seats_reserved", "vaga reservada, não equipe cheia");
});
test("grupo: equipe desfeita pela diretoria leva as indicações junto", () => {
  const { s, ps } = groupState(3);
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  const pend = TM.indicate(s, ps[1].id, ps[2].id, T0);
  TM.disband(s, TM.teamOf(s, ps[0].id), T0);
  eq1(pend.status, "cancelled");
  eq1(s.teams.length, 0);
});
test("grupo: equipe que chega a 4 pela diretoria corta as indicações com motivo de equipe cheia", () => {
  const { s, ps } = groupState(6);
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  const pend = TM.indicate(s, ps[1].id, ps[5].id, T0);
  const t = TM.teamOf(s, ps[0].id);
  const other = TM.createTeam(s, ps[2].id, "Outra", T0);
  TM.join(s, other, ps[3].id, T0);
  TM.merge(s, t.id, other.id, T0);
  eq1(t.members.length, 4);
  eq1(pend.status, "cancelled");
  eq1(pend.reason, "team_full");
});
test("grupo: aviso de vaga perdida aparece para os dois lados, só por 48 h", () => {
  const { s, ps } = groupState(6);
  TM.decide(s, TM.indicate(s, ps[0].id, ps[1].id, T0).id, ps[1].id, true, T0);
  const pend = TM.indicate(s, ps[0].id, ps[5].id, T0);
  const t = TM.teamOf(s, ps[0].id);
  TM.join(s, t, ps[2].id, T0);
  TM.join(s, t, ps[3].id, T0);
  eq1(pend.reason, "team_full");
  const toIndicated = TM.lostSeatsFor(s, ps[5].id, T0);
  eq1(toIndicated.length, 1);
  eq1(toIndicated[0].mine, true);
  eq1(toIndicated[0].name, "P0");
  const toTeammate = TM.lostSeatsFor(s, ps[3].id, T0);
  eq1(toTeammate[0].mine, false, "colega de equipe vê o corte do lado dele");
  eq1(toTeammate[0].name, "P5");
  eq1(TM.lostSeatsFor(s, ps[4].id, T0).length, 0, "quem não tem nada a ver não vê");
  eq1(TM.lostSeatsFor(s, ps[5].id, new Date(T0.getTime() + 49 * 3600 * 1000)).length, 0, "some depois de 48 h");
});
test("grupo: resultado travado bloqueia indicar e aceitar", () => {
  const { s, ps } = groupState(3);
  const a = TM.indicate(s, ps[0].id, ps[1].id, T0);
  s.config.evaluation.resultsLocked = true;
  assert.throws(() => TM.indicate(s, ps[0].id, ps[2].id, T0), /travado/);
  assert.throws(() => TM.decide(s, a.id, ps[1].id, true, T0), /travado/);
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
