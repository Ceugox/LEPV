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

const SEED = [
  ["2026-10-30", "15:00", "15:40", "Recepção e cadastro", false],
  ["2026-10-30", "16:00", "16:30", "Apresentação dos patrocinadores e regras", false],
  ["2026-10-30", "16:30", "17:00", "Problemática, pela Teachy", true],
  ["2026-10-30", "17:30", "22:00", "Hacking", true],
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

function seedProgram(state) {
  if (state.program.length) return;
  state.program = SEED.map(([day, start, end, title, highlight]) => ({
    id: id("a"),
    day,
    start,
    end,
    title,
    place: VENUES[day].name,
    highlight,
    orgIds: [],
  }));
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

module.exports = { VENUES, venuesOf, updateVenue, seedProgram, validateActivity, programView, sortedProgram };
