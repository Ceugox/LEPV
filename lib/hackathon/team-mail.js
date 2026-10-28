// E-mail "sua equipe" para cada participante: quem são os colegas (com
// contato, decisão do Marcell em 28/10: só para quem está na mesma equipe),
// e a programação dos dois dias. Quem está sem equipe recebe a versão com a
// programação e o caminho para entrar numa. Funções puras: tests/hackathon.js.
const { teamOf, MIN } = require("./teams");
const { sortedProgram, venuesOf } = require("./program");
const { findPerson } = require("./people");
const { waPhone } = require("./util");

const DAY_LABEL = { "2026-10-30": "Sexta, 30/10", "2026-10-31": "Sábado, 31/10" };
const hm = (t) => String(t || "").replace(/^(\d{2}):00$/, "$1h").replace(/^(\d{2}):(\d{2})$/, "$1h$2");

// Quem recebe: participante confirmado, não bloqueado, com e-mail.
function teamEmailTargets(state) {
  return state.people.filter((p) => !p.disabled && p.email && p.roles.includes("participant"));
}

// Celular brasileiro sai como (21) 99999-9999; número de fora fica +DDI cru.
function phoneText(raw) {
  // "+" explícito com DDI que não é 55: número de fora, mesmo com 10–11 dígitos
  // (waPhone poria 55 na frente de um +1 202 555 0123).
  const plus = /^\s*\+/.test(String(raw || "")) ? String(raw).replace(/\D/g, "") : "";
  if (plus && !plus.startsWith("55")) return plus.length >= 8 ? "+" + plus : "";
  const d = waPhone(raw);
  if (!d) return "";
  if (!d.startsWith("55")) return "+" + d;
  const n = d.slice(2);
  return "(" + n.slice(0, 2) + ") " + n.slice(2, -4) + "-" + n.slice(-4);
}

function memberFact(p, isMe) {
  const academic = [p.vinculo, p.curso, p.anoFaculdade ? String(p.anoFaculdade).replace(/^(\d+)$/, "$1º ano") : ""].filter(Boolean).join(" · ");
  const skills = p.profile && p.profile.skills && p.profile.skills.length ? "Habilidades: " + p.profile.skills.join(", ") : "";
  const phone = phoneText(p.phone);
  const contact = isMe ? "" : [p.email, phone ? "WhatsApp " + phone : ""].filter(Boolean).join(" · ");
  const value = [academic, skills, contact].filter(Boolean).join("\n") || "Sem dados no cadastro";
  return [p.name + (isMe ? " (você)" : ""), value];
}

// Programação agrupada por dia, com o local de cada dia.
function scheduleParagraphs(state) {
  const venues = venuesOf(state);
  const byDay = {};
  for (const a of sortedProgram(state)) (byDay[a.day] = byDay[a.day] || []).push(a);
  return Object.keys(byDay).sort().map((day) => {
    const v = venues[day] || {};
    // "a confirmar" é o texto padrão do local: não vai para o e-mail (igual ao eventFacts).
    const addr = v.address && !/confirmar/i.test(v.address) ? v.address : "";
    const head = (DAY_LABEL[day] || day) + " · " + [v.name, addr].filter(Boolean).join(", ");
    const lines = byDay[day].map((a) => hm(a.start) + (a.end ? "–" + hm(a.end) : "") + "  " + a.title);
    return head + "\n" + lines.join("\n");
  });
}

function teamEmail(state, person, base) {
  const first = String(person.name || "").trim().split(" ")[0];
  const team = teamOf(state, person.id);
  const schedule = scheduleParagraphs(state);
  let subject, title, titleEm, paragraphs, facts;
  if (team) {
    const mates = team.members.map((id) => findPerson(state, id)).filter(Boolean);
    subject = "Sua equipe no 1º Hackathon LEPV: " + team.name;
    title = "Sua equipe:";
    titleEm = team.name + ".";
    paragraphs = [
      (first ? "Olá, " + first + "!" : "Olá!") + " Faltam poucos dias para o 1º Hackathon LEPV. Abaixo estão as pessoas da sua equipe, com os contatos para vocês já se falarem antes de sexta.",
    ];
    if (team.status !== "confirmed") {
      paragraphs.push(team.members.length < MIN
        ? "Sua equipe ainda está em formação, com " + team.members.length + " integrante. Convide alguém pela aba Equipe do portal ou fale com a organização."
        : "Sua equipe ainda não está confirmada. Confirme pela aba Equipe do portal.");
    }
    facts = mates.map((p) => memberFact(p, p.id === person.id));
  } else {
    subject = "1º Hackathon LEPV: programação e sua equipe";
    title = "Você ainda está";
    titleEm = "sem equipe.";
    paragraphs = [
      (first ? "Olá, " + first + "!" : "Olá!") + " Faltam poucos dias para o 1º Hackathon LEPV e você ainda não está numa equipe.",
      "Entre numa pela aba Equipe do portal (por código ou pela lista de quem procura gente). Quem continuar sem equipe é encaixado pela organização na sexta.",
    ];
    facts = [];
  }
  const after = [
    "Programação",
    ...schedule,
    "Na entrada, apresente o QR da aba Início do portal. Depois do check-in, a aba IA libera US$ 25 em créditos de IA da Featherless para cada participante.",
  ];
  const note = team ? "Os contatos acima são só para a sua equipe: não repasse." : "";
  const text = [
    paragraphs.join("\n\n"),
    facts.length ? "Sua equipe: " + team.name + "\n\n" + facts.map(([k, v]) => k + "\n" + v).join("\n\n") : "",
    after.join("\n\n"),
    "Abrir meu portal: " + String(base || "https://lepv.org").replace(/\/$/, "") + "/hack/portal",
    note,
  ].filter(Boolean).join("\n\n") + "\n";
  return { subject, title, titleEm, paragraphs, facts, after, note, text, hasTeam: Boolean(team) };
}

module.exports = { teamEmailTargets, teamEmail, scheduleParagraphs, phoneText };
