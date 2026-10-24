// Parceiros: organizações, pedidos de vínculo e exportação autorizada.
//
// O formulário público só PEDE vínculo: escolher "Patrocinador · Empresa X"
// não dá acesso a nada. Só a aprovação da diretoria cria o representante
// (papel sponsor/supporter + orgId) — e só aí ele vê a agenda da própria
// organização e, se patrocinador, exporta os contatos de quem autorizou.
const { id } = require("./store");
const { HackError, cleanText, normEmail, validEmail, findByEmail, newPerson, addRole, dropRole, CONTACT_FIELDS } = require("./people");

const KINDS = ["sponsor", "supporter"];
const KIND_LABEL = { sponsor: "Patrocinador", supporter: "Apoiador" };

function validateOrg(body) {
  const name = cleanText(body.name, 80);
  if (name.length < 2) throw new HackError(400, "invalid_name", "Informe o nome da organização.");
  if (!KINDS.includes(body.kind)) throw new HackError(400, "invalid_kind", "Escolha patrocinador ou apoiador.");
  return { name, kind: body.kind, active: body.active !== false };
}

function addOrg(state, body) {
  const o = Object.assign({ id: id("o") }, validateOrg(body));
  if (state.orgs.some((x) => x.name.toLowerCase() === o.name.toLowerCase())) throw new HackError(409, "org_exists", "Já existe uma organização com esse nome.");
  state.orgs.push(o);
  return o;
}

function updateOrg(state, orgId, body) {
  const o = state.orgs.find((x) => x.id === orgId);
  if (!o) throw new HackError(404, "not_found", "Organização não encontrada.");
  const next = validateOrg(Object.assign({}, o, body));
  // Mudar a modalidade muda o papel de quem já representa a organização.
  if (next.kind !== o.kind) {
    for (const p of state.people) {
      if (p.orgId === o.id && p.roles.includes(o.kind)) {
        dropRole(p, o.kind);
        addRole(p, next.kind);
      }
    }
  }
  Object.assign(o, next);
  return o;
}

// Lista pública do formulário: só ativas, só nome, separadas por modalidade.
function publicOrgs(state) {
  const out = { sponsor: [], supporter: [] };
  for (const o of state.orgs) if (o.active) out[o.kind].push({ id: o.id, name: o.name });
  for (const k of KINDS) out[k].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return out;
}

function createRequest(state, body, now) {
  const kind = body.kind;
  if (!KINDS.includes(kind)) throw new HackError(400, "invalid_kind", "Escolha patrocinador ou apoiador.");
  const org = state.orgs.find((o) => o.id === body.orgId && o.active);
  // Organização de outra modalidade (formulário adulterado) é recusada igual.
  if (!org || org.kind !== kind) throw new HackError(400, "invalid_org", "Escolha uma organização da lista.");
  const name = cleanText(body.name, 80);
  const email = normEmail(body.email);
  if (name.length < 3 || !name.includes(" ")) throw new HackError(400, "invalid_name", "Informe nome e sobrenome.");
  if (!validEmail(email)) throw new HackError(400, "invalid_email", "Informe um e-mail válido.");
  const dup = state.partnerRequests.find((r) => r.status === "pending" && r.email === email && r.orgId === org.id);
  if (dup) return dup;
  const r = {
    id: id("r"),
    kind,
    orgId: org.id,
    name,
    email,
    phone: cleanText(body.phone, 30),
    role: cleanText(body.role, 60),
    status: "pending",
    createdAt: now.toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  state.partnerRequests.push(r);
  if (state.partnerRequests.length > 500) state.partnerRequests = state.partnerRequests.slice(-500);
  return r;
}

// Aprovação: o representante passa a existir (ou ganha o papel, se já era
// pessoa da plataforma). O contato vem do pedido, que a diretoria conferiu.
function decideRequest(state, reqId, approve, byId, now) {
  const r = state.partnerRequests.find((x) => x.id === reqId);
  if (!r || r.status !== "pending") throw new HackError(404, "not_found", "Pedido não encontrado ou já decidido.");
  r.status = approve ? "approved" : "rejected";
  r.decidedAt = now.toISOString();
  r.decidedBy = byId;
  if (!approve) return { request: r, person: null };
  const org = state.orgs.find((o) => o.id === r.orgId);
  if (!org) throw new HackError(409, "org_gone", "A organização do pedido não existe mais.");
  let p = findByEmail(state, r.email);
  if (p && p.disabled) throw new HackError(409, "disabled", "Essa pessoa está bloqueada.");
  if (p && p.orgId && p.orgId !== org.id) throw new HackError(409, "other_org", "Essa pessoa já representa outra organização.");
  if (!p) {
    p = newPerson({ name: r.name, email: r.email, phone: r.phone, manual: CONTACT_FIELDS.slice() });
    state.people.push(p);
  }
  p.orgId = org.id;
  addRole(p, org.kind);
  return { request: r, person: p };
}

function removeRepresentative(state, personId) {
  const p = state.people.find((x) => x.id === personId);
  if (!p || !p.orgId) throw new HackError(404, "not_found", "Representante não encontrado.");
  KINDS.forEach((k) => dropRole(p, k));
  p.orgId = null;
  p.sessionEpoch += 1;
  return p;
}

// Agenda da organização: atividades ligadas a ela.
function orgAgenda(state, orgId) {
  return state.program
    .filter((a) => (a.orgIds || []).includes(orgId))
    .sort((a, b) => (a.day + a.start < b.day + b.start ? -1 : 1))
    .map((a) => ({ id: a.id, day: a.day, start: a.start, end: a.end, title: a.title, place: a.place }));
}

// CSV de quem autorizou compartilhar com patrocinadores — consentimento lido
// no instante do download. Campos: nome, curso/instituição, e-mail, telefone.
// Célula que começa com = + - @ (ou tab/CR) vira texto: senão o Excel a
// executaria como fórmula.
function csvCell(v) {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportConsenting(state) {
  const rows = state.people
    .filter((p) => !p.disabled && p.roles.includes("participant") && p.consent === true)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((p) => [p.name, [p.curso, p.vinculo].filter(Boolean).join(" · "), p.email, p.phone]);
  const header = ["Nome", "Curso / instituição", "E-mail", "Telefone"];
  return { count: rows.length, csv: "﻿" + [header].concat(rows).map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n" };
}

module.exports = {
  KINDS,
  KIND_LABEL,
  addOrg,
  updateOrg,
  publicOrgs,
  createRequest,
  decideRequest,
  removeRepresentative,
  orgAgenda,
  csvCell,
  exportConsenting,
};
