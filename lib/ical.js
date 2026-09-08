// Gerador iCalendar (RFC 5545) da agenda da diretoria.
//
// Puro de propósito: sem dependência e sem tocar em store, para o teste de
// unidade (tests/ical.js) rodar em Node sem servidor. O Brasil não tem horário
// de verão desde 2019, então o offset é fixo: um encontro às 14:00 de Brasília
// é 17:00Z. O feed leva só título, contraparte, data, local, link e
// responsáveis — pauta, resultado e pendência ficam fora, porque a URL do feed
// é a credencial e uma URL vazada deve expor o mínimo.
const OFFSET = "-03:00";

function icsEscape(text) {
  return String(text == null ? "" : text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Linhas de até 75 octetos; a continuação começa com um espaço (que conta).
function foldLine(line) {
  const out = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const l = Buffer.byteLength(ch, "utf8");
    if (len + l > 75) {
      out.push(cur);
      cur = " ";
      len = 1;
    }
    cur += ch;
    len += l;
  }
  out.push(cur);
  return out.join("\r\n");
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function brToDate(dateISO, timeHHMM) {
  return new Date(dateISO + "T" + timeHHMM + ":00" + OFFSET);
}

function veventLines(m, opts) {
  const start = brToDate(m.date, m.time);
  const end = new Date(start.getTime() + (m.durationMin || 60) * 60000);
  const org = (m.counterpart && m.counterpart.org) || "";
  const person = (m.counterpart && m.counterpart.person) || "";
  const owners = (opts.ownerNames && opts.ownerNames(m)) || [];
  const desc = [
    person ? "Com " + person + " (" + org + ")" : "Com " + org,
    owners.length ? "Responsáveis: " + owners.join(", ") : "",
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VEVENT",
    "UID:" + m.id + "@lepv.org",
    "DTSTAMP:" + utcStamp(opts.now || new Date()),
    "DTSTART:" + utcStamp(start),
    "DTEND:" + utcStamp(end),
    "SUMMARY:" + icsEscape(m.title + " · " + org),
    "DESCRIPTION:" + icsEscape(desc),
  ];
  if (m.location) lines.push("LOCATION:" + icsEscape(m.location));
  // URL é do tipo URI: não se escapa vírgula nem ponto e vírgula.
  if (m.link) lines.push("URL:" + m.link);
  lines.push("END:VEVENT");
  return lines;
}

function wrap(bodyLines) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LEPV//Agenda da diretoria//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:LEPV · Diretoria",
    "X-WR-TIMEZONE:America/Sao_Paulo",
  ].concat(bodyLines, ["END:VCALENDAR"]);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function calendar(meetings, opts) {
  const o = opts || {};
  const body = [];
  for (const m of meetings) body.push(...veventLines(m, o));
  return wrap(body);
}

function singleEvent(meeting, opts) {
  return wrap(veventLines(meeting, opts || {}));
}

module.exports = { icsEscape, foldLine, utcStamp, brToDate, calendar, singleEvent };
