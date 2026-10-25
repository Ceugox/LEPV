// Programação e locais do hackathon.
//
// Semente: o arquivo oficial "Horários Hackathon LEPV&FGV - 2026". A
// diretoria edita pelo painel; atividades podem ser ligadas a organizações
// parceiras (é o que forma a agenda de cada patrocinador/apoiador).
const { id } = require("./store");
const { HackError, cleanText } = require("./people");

const VENUES = {
  "2026-10-30": {
    name: "FGV",
    address: "Endereço exato a confirmar",
    mapUrl: "",
  },
  "2026-10-31": {
    name: "Instituto 12",
    address: "Av. Ataulfo de Paiva, 1120 · Leblon, Rio de Janeiro",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Av.+Ataulfo+de+Paiva+1120+Leblon+Rio+de+Janeiro",
  },
};

// Sexta, 30/10: horários revistos em 25/10 (revisão 2 da programação).
const FRIDAY = [
  ["2026-10-30", "14:30", "15:10", "Recepção e credenciamento dos participantes", false],
  ["2026-10-30", "15:20", "15:30", "Boas-vindas da LEPV e apresentação do cronograma", false],
  ["2026-10-30", "15:30", "15:45", "Apresentação institucional da Teachy", false],
  ["2026-10-30", "15:45", "16:00", "Apresentação institucional da NXTP", false],
  ["2026-10-30", "16:00", "16:30", "Teachy: o mercado de educação e seus desafios atuais", true],
  ["2026-10-30", "17:00", "21:00", "Hacking", true],
];

// Sexta como foi semeada na revisão 1: só ela é substituída pela migração.
const FRIDAY_REV1 = [
  ["15:00", "15:40", "Recepção e cadastro", false],
  ["16:00", "16:30", "Apresentação dos patrocinadores e regras", false],
  ["16:30", "17:00", "Problemática, pela Teachy", true],
  ["17:30", "22:00", "Hacking", true],
];
const PROGRAM_REV = 2;

const SEED = [
  ...FRIDAY,
  ["2026-10-31", "08:00", "13:00", "Hacking", true],
  ["2026-10-31", "13:00", "", "Submissão dos projetos", true],
  ["2026-10-31", "13:00", "14:00", "Almoço", false],
  ["2026-10-31", "14:00", "15:00", "Análise da banca", false],
  ["2026-10-31", "15:10", "16:00", "Apresentações", false],
  ["2026-10-31", "16:30", "", "Anúncio dos vencedores", true],
  ["2026-10-31", "17:00", "19:00", "Happy hour", false],
];

// Locais com o que a diretoria editou por cima (ex.: endereço da FGV quando
// for confirmado). Só os dias do evento existem.
function venuesOf(state) {
  const over = (state.config && state.config.venues) || {};
  const out = {};
  for (const day of Object.keys(VENUES)) out[day] = Object.assign({}, VENUES[day], over[day] || {});
  return out;
}

function updateVenue(state, day, body) {
  if (!VENUES[day]) throw new HackError(404, "invalid_day", "Dia fora do evento.");
  const name = cleanText(body.name, 60);
  const address = cleanText(body.address, 160);
  const mapUrl = String(body.mapUrl || "").trim().slice(0, 400);
  if (name.length < 2) throw new HackError(400, "invalid_name", "Informe o nome do local.");
  if (mapUrl && !/^https:\/\//.test(mapUrl)) throw new HackError(400, "invalid_map", "Link do mapa precisa começar com https://.");
  state.config.venues = Object.assign({}, state.config.venues || {}, { [day]: { name, address, mapUrl } });
  return venuesOf(state)[day];
}

function activityOf([day, start, end, title, highlight], place) {
  return { id: id("a"), day, start, end, title, place: place || VENUES[day].name, highlight, orgIds: [] };
}

function seedProgram(state) {
  if (state.program.length) return;
  state.program = SEED.map((row) => activityOf(row));
  state.config.programRev = PROGRAM_REV;
}

// Base já gravada com a sexta da revisão 1: troca pelos horários novos, uma
// vez só. Só troca se a sexta estiver exatamente como foi semeada (horários,
// títulos, destaque, local e nenhuma organização ligada, exceto a Teachy na
// antiga problemática, que passa para a fala dela sobre o mercado de
// educação). Qualquer edição da diretoria vale e fica registrada no log.
// Devolve true se o estado mudou.
function migrateProgram(state, log = console) {
  if ((state.config.programRev || 1) >= PROGRAM_REV) return false;
  state.config.programRev = PROGRAM_REV;
  const day = "2026-10-30";
  const place = venuesOf(state)[day].name;
  const friday = state.program.filter((a) => a.day === day);
  const rowKey = (start, end, title, highlight) => [start, end || "", title, highlight === true].join("|");
  const found = friday.map((a) => rowKey(a.start, a.end, a.title, a.highlight)).sort();
  const seeded = FRIDAY_REV1.map(([s, e, t, h]) => rowKey(s, e, t, h)).sort();
  const old = friday.find((a) => a.title === "Problemática, pela Teachy");
  const sameRows = found.length === seeded.length && found.every((k, i) => k === seeded[i]);
  const samePlace = friday.every((a) => a.place === VENUES[day].name);
  const noOtherLinks = friday.every((a) => a === old || !(a.orgIds || []).length);
  if (!sameRows || !samePlace || !noOtherLinks) {
    log.warn("[hack] programação: a sexta foi editada pela diretoria; horários novos (14h30–21h) NÃO aplicados. Ajuste pelo painel.");
    return true;
  }
  const fresh = FRIDAY.map((row) => activityOf(row, place));
  fresh.find((a) => a.title.startsWith("Teachy:")).orgIds = (old && old.orgIds) || [];
  state.program = state.program.filter((a) => a.day !== day).concat(fresh);
  log.log("[hack] programação: sexta atualizada para os horários de 25/10.");
  return true;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateActivity(body, state) {
  const day = String(body.day || "");
  const start = String(body.start || "");
  const end = String(body.end || "");
  const title = cleanText(body.title, 120);
  if (!DAY_RE.test(day)) throw new HackError(400, "invalid_day", "Dia inválido.");
  if (!TIME_RE.test(start)) throw new HackError(400, "invalid_start", "Horário de início inválido.");
  if (end && (!TIME_RE.test(end) || end <= start)) throw new HackError(400, "invalid_end", "Horário de fim inválido.");
  if (title.length < 2) throw new HackError(400, "invalid_title", "Informe o título da atividade.");
  const orgIds = Array.isArray(body.orgIds) ? body.orgIds.map(String) : [];
  if (orgIds.some((o) => !state.orgs.find((x) => x.id === o))) {
    throw new HackError(400, "invalid_org", "Organização inexistente.");
  }
  return {
    day,
    start,
    end,
    title,
    place: cleanText(body.place, 80) || (VENUES[day] ? VENUES[day].name : ""),
    highlight: body.highlight === true,
    orgIds,
  };
}

function sortedProgram(state) {
  return state.program
    .slice()
    .sort((a, b) => (a.day + a.start < b.day + b.start ? -1 : a.day + a.start > b.day + b.start ? 1 : 0));
}

function programView(state, { withOrgs } = {}) {
  return sortedProgram(state).map((a) => {
    const v = { id: a.id, day: a.day, start: a.start, end: a.end, title: a.title, place: a.place, highlight: a.highlight };
    v.orgs = a.orgIds
      .map((o) => state.orgs.find((x) => x.id === o))
      .filter(Boolean)
      .map((o) => ({ id: o.id, name: o.name }));
    if (withOrgs) v.orgIds = a.orgIds;
    return v;
  });
}

module.exports = { VENUES, venuesOf, updateVenue, seedProgram, migrateProgram, validateActivity, programView, sortedProgram };
