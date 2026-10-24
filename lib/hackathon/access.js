// Acesso por link pessoal e resolução de quem está fazendo a requisição.
//
// Três credenciais com finalidades distintas, nunca intercambiáveis:
//   - link de acesso: token de uso único, guardado só como hash, expira;
//   - sessão do evento: req.session.hack = { pid, epoch };
//   - QR do credenciamento: person.qrToken, que NÃO autentica o portal.
// Revogar sessões de alguém é subir person.sessionEpoch.
const { secret, sha256, id } = require("./store");
const { HackError, findPerson, newPerson } = require("./people");

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function issueLoginToken(state, personId, now) {
  const raw = secret(24);
  const t = now.getTime();
  // Um link novo invalida os anteriores ainda não usados da mesma pessoa: só
  // o último que ela recebeu vale.
  for (const tok of state.tokens) {
    if (tok.personId === personId && !tok.usedAt && !tok.revokedAt) tok.revokedAt = new Date(t).toISOString();
  }
  state.tokens.push({
    id: id("t"),
    hash: sha256(raw),
    personId,
    purpose: "login",
    createdAt: new Date(t).toISOString(),
    expiresAt: new Date(t + LINK_TTL_MS).toISOString(),
    usedAt: null,
    revokedAt: null,
  });
  // Tokens velhos não precisam ficar para sempre.
  const cutoff = t - 30 * 24 * 60 * 60 * 1000;
  state.tokens = state.tokens.filter((tok) => Date.parse(tok.createdAt) > cutoff);
  const p = findPerson(state, personId);
  if (p) p.lastLinkAt = new Date(t).toISOString();
  return raw;
}

// Mesma resposta para inexistente, expirado, usado ou revogado: quem testa
// links não aprende nada com a diferença.
function consumeLoginToken(state, raw, now) {
  const invalid = new HackError(401, "invalid_link", "Link inválido ou expirado. Peça um novo na página de acesso.");
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 100) throw invalid;
  const tok = state.tokens.find((x) => x.hash === sha256(raw) && x.purpose === "login");
  if (!tok || tok.usedAt || tok.revokedAt || Date.parse(tok.expiresAt) <= now.getTime()) throw invalid;
  const p = findPerson(state, tok.personId);
  if (!p || p.disabled) throw invalid;
  tok.usedAt = now.toISOString();
  p.lastLoginAt = now.toISOString();
  return p;
}

function linkUrl(base, raw) {
  // Fragmento, não query: não vai para log de servidor nem para Referer.
  return base.replace(/\/$/, "") + "/hack/acesso#t=" + raw;
}

// Quem é o ator desta requisição. Ordem:
//   1. sessão do evento (link pessoal);
//   2. membro da liga logado no site: diretoria vira ator "director"; membro
//      inscrito no hackathon vira o participante correspondente.
// Devolve { person, roles, perms } ou null.
function resolveActor(req, state, deps) {
  const roles = [];
  let person = null;
  const member = deps.liveMember(req); // { order, name, director } | null
  const hs = req.session && req.session.hack;
  // Diretoria logada no site vence um link de evento aberto no mesmo
  // navegador: os poderes são dela, não de quem o link identificava.
  if (hs && hs.pid && !(member && member.director)) {
    const p = findPerson(state, hs.pid);
    if (p && !p.disabled && p.sessionEpoch === hs.epoch) person = p;
  }
  if (!person && member) {
    person = state.people.find((p) => p.memberOrder === member.order && !p.disabled) || null;
  }
  if (member && member.director) {
    roles.push("director");
    if (!person) {
      // A diretoria ganha um registro de pessoa (para ler avisos, aparecer como
      // autora), criado sob demanda e ligado ao número de membro.
      person = { __create: { memberOrder: member.order, name: member.name } };
    }
  }
  if (!person) return null;
  if (person.__create) return { pending: person.__create, roles };
  return {
    person,
    roles: person.roles.concat(roles.filter((r) => !person.roles.includes(r))),
  };
}

// Materializa a pessoa da diretoria, se resolveActor pediu.
function ensureActorPerson(state, actor) {
  if (!actor || !actor.pending) return actor;
  let p = state.people.find((x) => x.memberOrder === actor.pending.memberOrder);
  if (!p) {
    p = newPerson({ memberOrder: actor.pending.memberOrder, name: actor.pending.name });
    state.people.push(p);
  }
  return { person: p, roles: p.roles.concat(actor.roles.filter((r) => !p.roles.includes(r))) };
}

function perms(actor) {
  if (!actor) return {};
  const director = actor.roles.includes("director");
  const staff = actor.roles.includes("staff");
  const sp = (actor.person && actor.person.staffPerms) || {};
  return {
    manage: director,
    comms: director || (staff && sp.comms === true),
    checkin: director || (staff && sp.checkin === true),
    judge: actor.roles.includes("judge"),
    participant: actor.roles.includes("participant"),
    partner: actor.roles.includes("sponsor") || actor.roles.includes("supporter"),
    sponsor: actor.roles.includes("sponsor"),
  };
}

module.exports = { LINK_TTL_MS, issueLoginToken, consumeLoginToken, linkUrl, resolveActor, ensureActorPerson, perms };
