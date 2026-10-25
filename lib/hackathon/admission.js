// Credenciamento: presença diária pelo QR pessoal, busca manual e operação
// offline com sincronização idempotente.
//
// Unicidade: uma presença por (pessoa, dia do evento em Brasília). Cada
// leitura OFFLINE carrega um opId gerado no aparelho: reenviar a mesma
// operação (rede caiu no meio, sincronização repetida) devolve o mesmo
// resultado e não cria nova presença. Online, a unicidade (pessoa, dia) basta. Dois aparelhos offline lendo a mesma pessoa: o primeiro
// a sincronizar registra, o segundo vira "duplicate" — contagem não dobra.
//
// O aparelho preparado para offline recebe só HASHES dos QRs (sha256), nome e
// equipe — nunca o token em si, telefone ou e-mail — e uma credencial de
// aparelho com validade, revogável pela diretoria.
const { id, secret, sha256 } = require("./store");
const { HackError, findPerson } = require("./people");
const { teamOf } = require("./teams");
const { VENUES } = require("./program");

const EVENT_DAYS = Object.keys(VENUES).sort();
const QR_PREFIX = "LEPVHACK1:";

function dayOf(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

// Dia de trabalho. Num dia do evento, é sempre o de hoje (Brasília): o
// aparelho não consegue registrar a presença de sábado como sexta por um
// seletor esquecido. Fora dos dias (ensaio antes do evento), vale o informado,
// que precisa ser um dos dias.
function resolveDay(requested, now) {
  const today = dayOf(now);
  if (EVENT_DAYS.includes(today)) {
    if (requested && requested !== today) throw new HackError(400, "wrong_day", "Hoje é " + today.split("-").reverse().slice(0, 2).join("/") + ": a presença é registrada no dia de hoje.");
    return today;
  }
  const d = requested || EVENT_DAYS[0];
  if (!EVENT_DAYS.includes(d)) throw new HackError(400, "invalid_day", "Escolha um dos dias do evento.");
  return d;
}

function parseCode(code) {
  const s = String(code || "").trim();
  if (!s.startsWith(QR_PREFIX)) return null;
  const tok = s.slice(QR_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,64}$/.test(tok) ? tok : null;
}

// Situação da pessoa para entrar.
function ticketStatus(p) {
  if (!p) return "invalid";
  if (p.disabled) return "blocked";
  if (p.roles.length) return "valid";
  if (p.signupStatus === "waitlist") return "waitlist";
  return "invalid";
}

function personCard(state, p) {
  const t = teamOf(state, p.id);
  return { id: p.id, name: p.name, roles: p.roles, team: t ? t.name : null, signupStatus: p.signupStatus };
}

function existing(state, personId, day) {
  return state.checkins.find((c) => c.personId === personId && c.day === day) || null;
}

function checkinView(state, c) {
  const by = c.by ? findPerson(state, c.by) : null;
  return { id: c.id, day: c.day, at: c.at, by: by ? by.name : "", source: c.source };
}

// Núcleo: registra (ou acusa repetição) para a pessoa no dia.
function admit(state, p, day, op, now) {
  const status = ticketStatus(p);
  if (status !== "valid") return { status, person: p ? personCard(state, p) : null };
  const prev = existing(state, p.id, day);
  if (prev) return { status: "duplicate", person: personCard(state, p), checkin: checkinView(state, prev) };
  const c = {
    id: id("k"),
    personId: p.id,
    day,
    at: op.at || now.toISOString(),
    by: op.by,
    deviceId: op.deviceId || null,
    opId: op.opId || null,
    source: op.source || "online",
    recordedAt: now.toISOString(),
  };
  state.checkins.push(c);
  return { status: "ok", person: personCard(state, p), checkin: checkinView(state, c) };
}

function admitByCode(state, code, day, op, now) {
  const tok = parseCode(code);
  if (!tok) return { status: "invalid", reason: "not_ours" };
  const p = state.people.find((x) => x.qrToken === tok) || null;
  return admit(state, p, day, op, now);
}

function undo(state, checkinId) {
  const before = state.checkins.length;
  state.checkins = state.checkins.filter((c) => c.id !== checkinId);
  if (state.checkins.length === before) throw new HackError(404, "not_found", "Presença não encontrada.");
  // A operação offline que gerou essa presença continua registrada, agora como
  // "desfeita": um reenvio (resposta perdida no caminho) não recria a presença.
  for (const o of state.checkinOps || []) {
    if (o.result && o.result.checkin && o.result.checkin.id === checkinId) {
      o.result = { status: "undone", personId: o.result.personId, name: o.result.name, checkin: null };
    }
  }
}

function search(state, q, day) {
  const s = String(q || "").trim().toLowerCase();
  if (s.length < 2) return [];
  return state.people
    .filter((p) => (p.roles.length || p.signupStatus === "waitlist") && [p.name, p.email, p.phone].join(" ").toLowerCase().includes(s))
    .slice(0, 20)
    .map((p) => {
      const c = existing(state, p.id, day);
      return Object.assign(personCard(state, p), { status: ticketStatus(p), checkin: c ? checkinView(state, c) : null });
    });
}

function stats(state) {
  const people = state.people.filter((p) => !p.disabled && p.roles.includes("participant")).length;
  return EVENT_DAYS.map((d) => ({
    day: d,
    total: state.checkins.filter((c) => c.day === d).length,
    participants: state.checkins.filter((c) => c.day === d && (findPerson(state, c.personId) || { roles: [] }).roles.includes("participant")).length,
    expected: people,
  }));
}

// ---------- offline ----------
function deviceExpiry(now) {
  // Até o fim do último dia do evento (23h59 em Brasília), no mínimo 12h.
  const end = Date.parse(EVENT_DAYS[EVENT_DAYS.length - 1] + "T23:59:59-03:00");
  return new Date(Math.max(end, now.getTime() + 12 * 3600 * 1000));
}

function prepareDevice(state, operatorId, label, now) {
  const raw = secret(24);
  const dev = {
    id: id("v"),
    personId: operatorId,
    tokenHash: sha256(raw),
    label: String(label || "").slice(0, 60),
    createdAt: now.toISOString(),
    expiresAt: deviceExpiry(now).toISOString(),
    revokedAt: null,
    lastSyncAt: null,
  };
  state.devices.push(dev);
  return { device: dev, token: raw };
}

function snapshot(state) {
  return {
    tickets: state.people
      .filter((p) => p.roles.length || p.signupStatus === "waitlist" || p.disabled)
      .map((p) => Object.assign({ h: sha256(p.qrToken), status: ticketStatus(p) }, personCard(state, p))),
    checkins: state.checkins.map((c) => ({ personId: c.personId, day: c.day, at: c.at })),
    generatedAt: new Date().toISOString(),
  };
}

// forSync: aparelho vencido ainda entrega, por 7 dias, as leituras feitas
// ANTES do vencimento (syncOps recusa as feitas depois). Sem isso, a fila de
// quem ficou sem rede até o fim do evento se perderia.
const SYNC_GRACE_MS = 7 * 24 * 3600 * 1000;
function checkDevice(state, deviceId, token, operatorId, now, opts) {
  const dev = state.devices.find((d) => d.id === deviceId);
  if (!dev || dev.tokenHash !== sha256(String(token || ""))) throw new HackError(401, "device_invalid", "Aparelho não autorizado. Prepare de novo com internet.");
  if (dev.revokedAt) throw new HackError(401, "device_revoked", "A autorização deste aparelho foi revogada.");
  const exp = Date.parse(dev.expiresAt);
  const limit = opts && opts.forSync ? exp + SYNC_GRACE_MS : exp;
  if (limit <= now.getTime()) throw new HackError(401, "device_expired", "A autorização deste aparelho expirou.");
  if (dev.personId !== operatorId) throw new HackError(403, "device_other", "Este aparelho foi preparado por outra pessoa.");
  return dev;
}

// Sincroniza a fila do aparelho. Cada op: { opId, h (hash do QR) | personId, day, at }.
function syncOps(state, dev, operatorId, ops, now) {
  state.checkinOps = state.checkinOps || [];
  const results = [];
  // Índice hash → pessoa calculado uma vez por sincronização (não por op).
  let byHash = null;
  const findByHash = (h) => {
    if (!byHash) byHash = new Map(state.people.map((x) => [sha256(x.qrToken), x]));
    return byHash.get(h) || null;
  };
  for (const op of (Array.isArray(ops) ? ops : []).slice(0, 500)) {
    if (!op || typeof op !== "object") {
      results.push({ opId: "", status: "rejected", reason: "operação inválida" });
      continue;
    }
    const opId = String(op.opId || "");
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(opId)) {
      results.push({ opId, status: "rejected", reason: "opId inválido" });
      continue;
    }
    const seen = state.checkinOps.find((x) => x.opId === opId && x.deviceId === dev.id);
    if (seen) {
      results.push(Object.assign({ opId }, seen.result));
      continue;
    }
    // Horário da leitura: o do aparelho, limitado ao agora do servidor. O dia
    // sai do horário da leitura (não do seletor), se ele cair num dia do evento.
    const t = Date.parse(op.at);
    const at = Number.isFinite(t) ? new Date(Math.min(t, now.getTime())).toISOString() : now.toISOString();
    if (Date.parse(at) > Date.parse(dev.expiresAt)) {
      results.push({ opId, status: "rejected", reason: "lida depois do vencimento da autorização" });
      continue;
    }
    const readDay = dayOf(new Date(at));
    let day;
    if (EVENT_DAYS.includes(readDay)) day = readDay;
    else if (EVENT_DAYS.includes(String(op.day || ""))) day = String(op.day);
    else {
      results.push({ opId, status: "rejected", reason: "dia inválido" });
      continue;
    }
    const p = op.h ? findByHash(String(op.h)) : findPerson(state, String(op.personId || ""));
    const r = admit(state, p || null, day, { opId, at, by: operatorId, deviceId: dev.id, source: "offline" }, now);
    const result = { status: r.status, personId: p ? p.id : null, name: r.person ? r.person.name : null, checkin: r.checkin || null };
    state.checkinOps.push({ opId, deviceId: dev.id, result, at: now.toISOString() });
    results.push(Object.assign({ opId }, result));
  }
  if (state.checkinOps.length > 5000) state.checkinOps = state.checkinOps.slice(-5000);
  dev.lastSyncAt = now.toISOString();
  return results;
}

module.exports = {
  EVENT_DAYS,
  QR_PREFIX,
  dayOf,
  resolveDay,
  parseCode,
  ticketStatus,
  admit,
  admitByCode,
  undo,
  search,
  stats,
  prepareDevice,
  snapshot,
  checkDevice,
  syncOps,
};
