// Teste de unidade do gerador iCalendar da agenda da diretoria (lib/ical.js).
// Sem servidor e sem browser: roda em Node puro antes do e2e (`npm test`).
const assert = require("assert");
const ical = require("../lib/ical.js");

const meeting = {
  id: "bm1",
  title: "Acordo comercial, Hackathon; fase 2",
  counterpart: { org: "OpenAI", person: "Ana" },
  status: "marcado",
  date: "2026-09-15",
  time: "14:00",
  durationMin: 90,
  location: "Online (Google Meet)",
  link: "https://meet.google.com/abc-defg-hij",
  agenda: "PAUTA SECRETA",
  outcome: "RESULTADO SECRETO",
  followUp: { text: "PENDENCIA SECRETA", dueDate: "2026-09-22" },
};

// escape RFC 5545
assert.equal(ical.icsEscape("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");

// dobra em 75 octetos, continuação começa com espaço e nada se perde
const longa = "SUMMARY:" + "á".repeat(60);
const dobrada = ical.foldLine(longa);
for (const l of dobrada.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75, "linha > 75 octetos");
assert.ok(dobrada.split("\r\n")[1].startsWith(" "), "continuação sem espaço");
assert.equal(dobrada.replace(/\r\n /g, ""), longa, "dobra perdeu conteúdo");

// 14:00 de Brasília é 17:00Z (offset fixo -03:00)
assert.equal(ical.utcStamp(ical.brToDate("2026-09-15", "14:00")), "20260915T170000Z");

const now = new Date("2026-09-07T12:00:00Z");
const out = ical.calendar([meeting], { now, ownerNames: () => ["Marcell", "Clara"] });
assert.ok(out.startsWith("BEGIN:VCALENDAR\r\n"), "cabeçalho");
assert.ok(out.endsWith("END:VCALENDAR\r\n"), "rodapé");
assert.ok(out.includes("X-WR-CALNAME:LEPV · Diretoria"), "nome do calendário");
assert.ok(out.includes("UID:bm1@lepv.org"), "uid");
assert.ok(out.includes("DTSTART:20260915T170000Z"), "dtstart");
assert.ok(out.includes("DTEND:20260915T183000Z"), "dtend com 90 min");
assert.ok(out.includes("SUMMARY:Acordo comercial\\, Hackathon\\; fase 2 · OpenAI"), "summary escapado");
assert.ok(out.includes("LOCATION:Online (Google Meet)"), "location");
assert.ok(out.includes("URL:https://meet.google.com/abc-defg-hij"), "url sem escape");
assert.ok(out.includes("Responsáveis: Marcell\\, Clara"), "responsáveis");
for (const secreto of ["PAUTA SECRETA", "RESULTADO SECRETO", "PENDENCIA SECRETA"]) {
  assert.ok(!out.includes(secreto), secreto + " vazou no feed");
}

// UID estável entre duas gerações
assert.equal(ical.calendar([meeting], { now }).match(/UID:[^\r]+/)[0], out.match(/UID:[^\r]+/)[0]);

// evento avulso tem exatamente um VEVENT
assert.equal((ical.singleEvent(meeting, { now }).match(/BEGIN:VEVENT/g) || []).length, 1);

console.log("ical OK");
