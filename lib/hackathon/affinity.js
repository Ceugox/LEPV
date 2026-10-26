// Montagem de equipes por afinidade (Revisão 5 da spec, 26/10/2026).
//
// A diretoria pede uma PRÉVIA: os participantes sem equipe que responderam
// "não tenho grupo" são separados por instituição (IME = Ativa + Reserva;
// FGV; UFPE; "Outra universidade" entre si) e divididos em equipes de até 4,
// equilibrando a sobra para ninguém ficar sozinho (5 → 3+2, 6 → 3+3, 7 → 4+3,
// 10 → 4+3+3). Dentro da instituição, cada equipe aproxima o ano e mistura os
// cursos. Quem sobra sozinho na instituição vai para a menor equipe proposta
// com vaga, marcado "fora da afinidade". Nada é gravado aqui: a diretoria
// ajusta a prévia e confirma (apply), que cria tudo ou nada.
//
// Quem marcou "tenho grupo" e está sem equipe não entra: espera os colegas
// indicarem, e a prévia lista essas pessoas à parte.
const { HackError, findPerson } = require("./people");
const T = require("./teams");

const GROUPS = [
  { key: "IME", label: "IME", match: (v) => /\bIME\b/i.test(v) },
  { key: "FGV", label: "FGV", match: (v) => /^FGV$/i.test(v) },
  { key: "UFPE", label: "UFPE", match: (v) => /^UFPE$/i.test(v) },
];
const OTHER = { key: "OUTRAS", label: "Outras" };

function affinityOf(vinculo) {
  const v = String(vinculo || "").trim();
  return GROUPS.find((g) => g.match(v)) || OTHER;
}

// Tamanhos das equipes para n pessoas: o menor número de equipes de até 4,
// com a diferença entre elas de no máximo 1. n = 1 não forma equipe.
function teamSizes(n) {
  if (n < 2) return [];
  const k = Math.ceil(n / T.MAX);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// "3º ano", "2025", "3" → número para comparar proximidade; sem ano → null.
function yearOf(p) {
  const m = /\d+/.exec(String(p.anoFaculdade || ""));
  return m ? Number(m[0]) : null;
}

const norm = (s) => String(s || "").trim().toLowerCase();

// Divide uma instituição em equipes. Cada equipe começa pela pessoa de menor
// ano ainda livre e escolhe, a cada vaga, quem tem o ano mais próximo,
// preferindo curso que a equipe ainda não tem. Determinístico (empate pela
// ordem alfabética), para a prévia não mudar entre duas consultas.
function splitInstitution(people) {
  const pool = people.slice().sort((a, b) => {
    const ya = yearOf(a);
    const yb = yearOf(b);
    if (ya !== yb) return ya === null ? 1 : yb === null ? -1 : ya - yb;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  const teams = [];
  for (const size of teamSizes(pool.length)) {
    const team = [pool.shift()];
    while (team.length < size) {
      const anchor = yearOf(team[0]);
      const courses = new Set(team.map((p) => norm(p.curso)).filter(Boolean));
      let best = 0;
      let bestScore = Infinity;
      pool.forEach((p, i) => {
        const y = yearOf(p);
        const yearGap = anchor === null || y === null ? 2 : Math.abs(y - anchor);
        const score = yearGap * 2 + (p.curso && courses.has(norm(p.curso)) ? 3 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      team.push(pool.splice(best, 1)[0]);
    }
    teams.push(team);
  }
  return { teams, leftover: pool };
}

// Nome livre: "IME 1", "IME 2"… pulando os que já existem (equipes reais ou
// já usados nesta prévia).
function freeName(state, label, used) {
  for (let i = 1; ; i++) {
    const name = label + " " + i;
    const lower = name.toLowerCase();
    if (!used.has(lower) && !state.teams.some((t) => t.name.toLowerCase() === lower)) {
      used.add(lower);
      return name;
    }
  }
}

const personView = (p, extra) =>
  Object.assign(
    { id: p.id, name: p.name, vinculo: p.vinculo || "", anoFaculdade: p.anoFaculdade || "", curso: p.curso || "", affinity: affinityOf(p.vinculo).label },
    extra || {}
  );

// Quem entra na junção: participante ativo, sem equipe, que NÃO declarou ter
// grupo. Quem declarou fica à parte.
function candidates(state) {
  const free = state.people.filter((p) => !p.disabled && p.roles.includes("participant") && !T.teamOf(state, p.id));
  return { solo: free.filter((p) => !p.hasGroup), withGroup: free.filter((p) => p.hasGroup) };
}

function preview(state) {
  T.assertTeamsEditable(state);
  const { solo, withGroup } = candidates(state);
  const used = new Set();
  const proposed = [];
  const lonely = [];
  for (const g of GROUPS.concat([OTHER])) {
    const members = solo.filter((p) => affinityOf(p.vinculo).key === g.key);
    const { teams, leftover } = splitInstitution(members);
    teams.forEach((ms) => proposed.push({ name: freeName(state, g.label, used), affinity: g.label, members: ms.map((p) => personView(p)) }));
    lonely.push(...leftover);
  }
  // Sozinho na instituição: menor equipe proposta com vaga; sem vaga, os
  // sozinhos formam uma equipe mista entre si; um só, sem vaga, fica de fora
  // para a diretoria decidir.
  const unassigned = [];
  const mixed = [];
  for (const p of lonely) {
    const open = proposed.filter((t) => t.members.length < T.MAX).sort((a, b) => a.members.length - b.members.length)[0];
    if (open) open.members.push(personView(p, { outOfAffinity: true }));
    else mixed.push(p);
  }
  if (mixed.length >= 2) {
    for (const ms of splitInstitution(mixed).teams) {
      proposed.push({ name: freeName(state, "Mista", used), affinity: "Mista", members: ms.map((p) => personView(p, { outOfAffinity: true })) });
    }
  } else {
    unassigned.push(...mixed.map((p) => personView(p)));
  }
  return {
    teams: proposed,
    unassigned,
    withGroup: withGroup.map((p) => personView(p)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

// Cria as equipes que a diretoria confirmou (prévia ajustada). Tudo ou nada:
// roda dentro de um store.mutate, e qualquer erro desfaz o lote inteiro.
function apply(state, teams, now) {
  T.assertTeamsEditable(state);
  if (!Array.isArray(teams) || !teams.length) throw new HackError(400, "no_teams", "Nenhuma equipe para criar.");
  if (teams.length > 200) throw new HackError(400, "too_many", "Lote grande demais.");
  const seen = new Set();
  for (const t of teams) {
    const ids = Array.isArray(t && t.memberIds) ? t.memberIds.map(String) : [];
    if (ids.length < T.MIN || ids.length > T.MAX) {
      throw new HackError(400, "invalid_size", "Cada equipe precisa ter de 2 a 4 pessoas (" + String((t && t.name) || "sem nome") + ").");
    }
    for (const pid of ids) {
      if (seen.has(pid)) throw new HackError(400, "duplicate_member", "A mesma pessoa está em duas equipes da prévia.");
      seen.add(pid);
      const p = findPerson(state, pid);
      if (!p || p.disabled || !p.roles.includes("participant")) throw new HackError(400, "not_participant", "Só participantes confirmados entram em equipes.");
      // A prévia pode ter ficado velha: alguém entrou numa equipe no meio-tempo.
      if (T.teamOf(state, pid)) throw new HackError(409, "already_in_team", p.name + " já entrou numa equipe. Gere a prévia de novo.");
    }
  }
  const created = [];
  for (const t of teams) {
    const ids = t.memberIds.map(String);
    const team = T.createTeam(state, ids[0], t.name, now);
    ids.slice(1).forEach((pid) => T.join(state, team, pid, now));
    created.push(team);
  }
  return created;
}

module.exports = { affinityOf, teamSizes, splitInstitution, preview, apply };
