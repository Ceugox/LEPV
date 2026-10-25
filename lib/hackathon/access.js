// Acesso por link pessoal e resolução de quem está fazendo a requisição.
//
// Três credenciais com finalidades distintas, nunca intercambiáveis:
//   - link de acesso: token de uso único, guardado só como hash, expira;
//   - sessão do evento: req.session.hack = { pid, epoch };
//   - QR do credenciamento: person.qrToken, que NÃO autentica o portal.
// Revogar sessões de alguém é subir person.sessionEpoch.
const { secret, sha256, id } = require("./store");
const { HackError, findPerson, newPerson, canAccess } = require("./people");

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Revoga os links ainda não usados da pessoa, menos o de hash keepHash.
function revokeOtherTokens(state, personId, keepHash, now) {
  for (const tok of state.tokens) {
    if (tok.personId === personId && tok.hash !== keepHash && !tok.usedAt && !tok.revokedAt) tok.revokedAt = now.toISOString();
  }
}

// Um link novo invalida os anteriores ainda não usados: só o último vale.
// Com { revokeOthers: false } os antigos continuam valendo até o chamador
// confirmar a entrega do novo (e-mail aceito pelo provedor) — senão uma queda
// do provedor no meio de um reenvio em lote deixaria todo mundo sem link.
function issueLoginToken(state, personId, now, opts) {
  const raw = secret(24);
  const t = now.getTime();
  if (!opts || opts.revokeOthers !== false) revokeOtherTokens(state, personId, sha256(raw), now);
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
  if (!canAccess(p)) throw invalid;
  tok.usedAt = now.toISOString();
  p.lastLoginAt = now.toISOString();
  return p;
}

// Devolve o link ao estado "não usado" quando a sessão não pôde ser gravada
// depois do consumo: senão a pessoa perde o link sem ter entrado.
function unconsumeLoginToken(state, raw) {
  const tok = state.tokens.find((x) => x.hash === sha256(raw) && x.purpose === "login");
  if (tok) tok.usedAt = null;
}

// Revoga links pendentes de uma pessoa (troca de e-mail, desconexão).
function revokeAllTokens(state, personId, now) {
  revokeOtherTokens(state, personId, null, now);
}

function linkUrl(base, raw) {
  // Fragmento, não query: não vai para log de servidor nem para Referer.
  return base.replace(/\/$/, "") + "/hack/acesso#t=" + raw;
}

// Quem é o ator desta requisição. Ordem:
//   1. sessão do evento (link pessoal), válida só com o epoch atual e se a
//      pessoa ainda pode entrar (ativa, com papel ou na lista de espera);
//   2. membro da liga logado no site: diretoria vira ator "director"; membro
//      inscrito no hackathon vira o participante correspondente.
// Pessoa bloqueada (disabled) não entra por caminho nenhum — é assim que se
// tira o acesso de quem entra pelo login da liga, que não tem epoch próprio.
// Devolve { person, roles } ou { pending, roles } (diretoria sem registro) ou null.
function resolveActor(req, state, deps) {
  const member = deps.liveMember(req); // { order, name, director, superadmin } | null
  const memberPerson = member ? state.people.find((p) => p.memberOrder === member.order) || null : null;
  if (memberPerson && memberPerson.disabled) return null;

  // Diretoria logada no site vence um link de evento aberto no mesmo
  // navegador: os poderes são dela, não de quem o link identificava.
  if (member && member.director) {
    // Superadmin da liga (hoje, o Marcell) também é diretoria aqui.
    const derived = ["director"].concat(member.superadmin ? ["superadmin"] : []);
    if (!memberPerson) return { pending: { memberOrder: member.order, name: member.name }, roles: derived };
    return { person: memberPerson, roles: memberPerson.roles.concat(derived.filter((r) => !memberPerson.roles.includes(r))) };
  }

  const hs = req.session && req.session.hack;
  if (hs && hs.pid) {
    const p = findPerson(state, hs.pid);
    if (p && p.sessionEpoch === hs.epoch && canAccess(p)) return { person: p, roles: p.roles.slice() };
  }
  if (memberPerson && canAccess(memberPerson)) return { person: memberPerson, roles: memberPerson.roles.slice() };
  return null;
}

// Materializa a pessoa da diretoria, se resolveActor pediu.
function ensureActorPerson(state, actor) {
  if (!actor || !actor.pending) return actor;
  let p = state.people.find((x) => x.memberOrder === actor.pending.memberOrder);
  if (p && p.disabled) return null;
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
    superadmin: actor.roles.includes("superadmin"),
  };
}

module.exports = { LINK_TTL_MS, issueLoginToken, consumeLoginToken, unconsumeLoginToken, revokeOtherTokens, revokeAllTokens, linkUrl, resolveActor, ensureActorPerson, perms };
