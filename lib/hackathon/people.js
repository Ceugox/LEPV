// Pessoas do hackathon e seus papéis.
//
// Participantes não se cadastram aqui: vêm das inscrições do evento
// type "hackathon" (events.json) e são sincronizados por syncParticipants.
// Jurados, staff e representantes de parceiros são criados pela diretoria (ou
// pela aprovação de um pedido de parceiro).
//
// "director" nunca é gravado: vem, a cada requisição, da sessão de membro da
// liga com papel de diretoria (ver access.js). Semelhança de nome ou e-mail
// não concede poder nenhum.
const { id, secret } = require("./store");

const STORED_ROLES = ["participant", "judge", "staff", "sponsor", "supporter"];
const AUDIENCES = ["participant", "sponsor", "supporter", "judge"];
const ROLE_LABEL = {
  participant: "Participante",
  judge: "Jurado",
  staff: "Staff",
  sponsor: "Patrocinador",
  supporter: "Apoiador",
  director: "Diretoria",
};

class HackError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normEmail = (e) => String(e || "").trim().toLowerCase();
const cleanText = (s, max) => String(s == null ? "" : s).trim().replace(/\s+/g, " ").slice(0, max);

function newPerson(fields) {
  return Object.assign(
    {
      id: id("p"),
      name: "",
      email: "",
      phone: "",
      roles: [],
      orgId: null,
      signupId: null,
      memberOrder: null,
      signupStatus: null, // "confirmed" | "waitlist" | "removed" | null
      hasGroup: false,
      consent: false,
      curso: "",
      vinculo: "",
      linkedin: "",
      staffPerms: { comms: false, checkin: false },
      profile: { published: false, bio: "", skills: [], interests: [] },
      qrToken: secret(18),
      sessionEpoch: 1,
      readIds: [],
      createdAt: new Date().toISOString(),
    },
    fields
  );
}

function findPerson(state, personId) {
  return state.people.find((p) => p.id === personId) || null;
}

function findByEmail(state, email) {
  const e = normEmail(email);
  if (!e) return null;
  return state.people.find((p) => p.email === e) || null;
}

function addRole(p, role) {
  if (!p.roles.includes(role)) p.roles.push(role);
}
function dropRole(p, role) {
  p.roles = p.roles.filter((r) => r !== role);
}

// Espelha as inscrições do evento. Idempotente: rodar duas vezes não muda nada.
// Devolve true se algo mudou (para o chamador decidir se grava).
function syncParticipants(state, ev) {
  if (!ev || !ev.signups || !Array.isArray(ev.signups.list)) return false;
  let changed = false;
  const seen = new Set();
  for (const s of ev.signups.list) {
    const email = normEmail(s.email);
    if (s.type === "external" && !email) continue;
    let p =
      state.people.find((x) => x.signupId === s.id) ||
      (s.type === "member" ? state.people.find((x) => x.memberOrder === s.order) : findByEmail(state, email));
    if (!p) {
      p = newPerson({});
      state.people.push(p);
      changed = true;
    }
    seen.add(p.id);
    const next = {
      signupId: s.id,
      name: cleanText(s.name, 80) || p.name,
      email: s.type === "external" ? email : p.email,
      phone: s.type === "external" ? cleanText(s.phone, 30) : p.phone,
      memberOrder: s.type === "member" ? s.order : p.memberOrder,
      signupStatus: s.status === "waitlist" ? "waitlist" : "confirmed",
      hasGroup: s.temGrupo === "Sim",
      consent: s.consentPatrocinadores === true,
      curso: cleanText(s.curso, 80),
      vinculo: cleanText(s.vinculo, 40),
      linkedin: cleanText(s.linkedin, 200),
    };
    for (const k of Object.keys(next)) {
      if (p[k] !== next[k]) {
        p[k] = next[k];
        changed = true;
      }
    }
    const shouldParticipate = next.signupStatus === "confirmed";
    if (shouldParticipate && !p.roles.includes("participant")) {
      addRole(p, "participant");
      changed = true;
    } else if (!shouldParticipate && p.roles.includes("participant")) {
      dropRole(p, "participant");
      changed = true;
    }
  }
  // Inscrição retirada pela diretoria: perde o papel de participante, mantém
  // os outros (pode ser jurado também, por exemplo).
  for (const p of state.people) {
    if (p.signupId && !seen.has(p.id) && p.signupStatus !== "removed") {
      p.signupStatus = "removed";
      dropRole(p, "participant");
      changed = true;
    }
  }
  return changed;
}

// Visão que a própria pessoa recebe.
function selfView(p, extraRoles) {
  const roles = p.roles.concat(extraRoles || []);
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    roles,
    roleLabels: roles.map((r) => ROLE_LABEL[r] || r),
    orgId: p.orgId,
    signupStatus: p.signupStatus,
    hasGroup: p.hasGroup,
    consent: p.consent,
    curso: p.curso,
    vinculo: p.vinculo,
    profile: p.profile,
  };
}

// Visão da diretoria: sem tokens, sem QR.
function adminView(p) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    roles: p.roles,
    orgId: p.orgId,
    signupStatus: p.signupStatus,
    memberOrder: p.memberOrder,
    hasGroup: p.hasGroup,
    consent: p.consent,
    curso: p.curso,
    vinculo: p.vinculo,
    staffPerms: p.staffPerms,
    lastLinkAt: p.lastLinkAt || null,
    lastLoginAt: p.lastLoginAt || null,
    createdAt: p.createdAt,
  };
}

module.exports = {
  STORED_ROLES,
  AUDIENCES,
  ROLE_LABEL,
  HackError,
  normEmail,
  cleanText,
  newPerson,
  findPerson,
  findByEmail,
  addRole,
  dropRole,
  syncParticipants,
  selfView,
  adminView,
};
