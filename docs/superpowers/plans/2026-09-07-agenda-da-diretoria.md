# Agenda da diretoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à diretoria uma aba própria com os encontros externos da liga em quadro (ciclo de vida) e calendário mensal, assináveis no calendário pessoal por feed iCalendar com token privado.

**Architecture:** Store novo `board-meetings.json` no volume, rotas `/api/board/*` atrás de `requireDirectorApi`, gerador iCalendar puro em `lib/ical.js`. No cliente, a aba Diretoria é o primeiro módulo ES do app (`public/js/features/board.js`), injetada no nav pelo `app.js` só para diretor e acionada por `CustomEvent` quando a aba ativa.

**Tech Stack:** Node.js 24, Express 4, JavaScript ES modules nativos no browser, Playwright para verificação, CSS puro com os tokens do tema da liga.

**Spec:** `docs/superpowers/specs/2026-09-07-agenda-da-diretoria-design.md`

## Global Constraints

- Sem framework, bundler, transpiler ou dependência de produção nova.
- Nenhuma rota, payload, ID, classe ou `data-*` existente muda.
- Toda escrita em store passa por `writeStore`; leitura por `readStore`.
- Visibilidade só para `director`/`superadmin`; papel relido a cada request por `requireDirectorApi`.
- Feed `.ics` leva só título, contraparte, data, local, link e responsáveis. Pauta, resultado e pendência ficam fora.
- Fuso `America/Sao_Paulo`, offset fixo `-03:00` (sem horário de verão desde 2019).
- Cores só por token (`--ink`, `--wine`, `--line`, ...). Serif só em título de seção.
- Botões de cartão com ≥ 44 px de altura em 390 px. Nada de arrastar.
- Toda interpolação de dado da API passa por `escapeHtml`/`escapeAttr`/`safeUrl`.
- Testes rodam contra volume temporário; nunca gravam em `data/`.

---

## File structure

| Arquivo | Responsabilidade |
| --- | --- |
| `lib/ical.js` | gerador iCalendar puro: escape, dobra de linha, conversão de fuso, `calendar(meetings, opts)`. |
| `tests/ical.js` | teste de unidade do gerador (Node, sem browser). |
| `server.js` | store, validação, rotas CRUD, tokens e feed da agenda da diretoria. |
| `tests/e2e.js` | casos novos de API (CRUD, 403, validação, 409, feed, rotação de token). |
| `public/js/features/board.js` | módulo ES da aba: quadro, calendário, modal, assinatura. |
| `public/app.html` | painel `panel-diretoria`, CSS `.board-*`, `<script type="module">`. |
| `public/app.js` | ponte: injeta a aba para diretor e registra `loaders.diretoria`. |
| `public/sw.js` | bump de `CACHE` para v10. |
| `scripts/verify-board.js` | verificação Playwright da aba (diretor vê, membro não, alvos de toque, visões). |
| `package.json` | `test` roda o teste de unidade antes do e2e; `verify:board` entra na cadeia. |
| `.github/workflows/ci.yml` | passo "Agenda da diretoria". |

---

### Task 1: Gerador iCalendar

**Files:**
- Create: `lib/ical.js`
- Create: `tests/ical.js`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `icsEscape(text) -> string`, `foldLine(line) -> string`, `utcStamp(date) -> "YYYYMMDDTHHMMSSZ"`, `brToDate(dateISO, timeHHMM) -> Date`, `calendar(meetings, { now?, ownerNames?(meeting) -> string[] }) -> string`, `singleEvent(meeting, opts) -> string` (mesmo VCALENDAR com um VEVENT).

- [ ] **Step 1: Write the failing test**

```js
// tests/ical.js — gerador iCalendar da agenda da diretoria, sem servidor.
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
// dobra em 75 octetos, continuação começa com espaço
const longa = "SUMMARY:" + "á".repeat(60);
const dobrada = ical.foldLine(longa);
for (const l of dobrada.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75, "linha > 75 octetos");
assert.ok(dobrada.split("\r\n")[1].startsWith(" "), "continuação sem espaço");
assert.equal(dobrada.replace(/\r\n /g, ""), longa, "dobra perdeu conteúdo");
// 14:00 de Brasília é 17:00Z
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/ical.js`
Expected: `Cannot find module '../lib/ical.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/ical.js — gerador iCalendar (RFC 5545) da agenda da diretoria.
//
// Puro de propósito: sem dependência e sem tocar em store, para o teste de
// unidade rodar em Node sem servidor. O Brasil não tem horário de verão desde
// 2019, então o offset é fixo: um encontro às 14:00 de Brasília é 17:00Z.
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
```

Em `package.json`, troque `"test": "node tests/e2e.js"` por
`"test": "node tests/ical.js && node tests/e2e.js"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/ical.js && node --check lib/ical.js`
Expected: `ical OK`.

- [ ] **Step 5: Commit**

```bash
git add lib/ical.js tests/ical.js package.json
git commit -m "Gerador iCalendar puro para a agenda da diretoria"
```

---

### Task 2: Store, validação e CRUD dos encontros

**Files:**
- Modify: `server.js` (após o bloco de eventos, antes de `app.use(express.static(...))`)
- Modify: `tests/e2e.js` (antes de `async function main()`)

**Interfaces:**
- Consumes: `readStore`, `writeStore`, `requireDirectorApi`, `activeMembers`, `allMembers`, `todayBR`, `STORAGE_DIR`, `crypto`.
- Produces: rotas `GET/POST /api/board/meetings`, `PATCH/DELETE /api/board/meetings/:id`; helpers `readBoardMeetings()`, `writeBoardMeetings(v)`, `validateBoardMeeting(body, base) -> { value, errors }`, `boardMeetingView(m, roster)`, `boardDirectors()`.

- [ ] **Step 1: Write the failing tests**

```js
// ---- Agenda da diretoria ----
test("membro comum não acessa a agenda da diretoria", async () => {
  const c = client();
  await c.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await c.get("/api/board/meetings")).status, 403, "GET lista");
  eq((await c.post("/api/board/meetings", { title: "X" })).status, 403, "POST");
  eq((await c.patch("/api/board/meetings/nada", {})).status, 403, "PATCH");
  eq((await c.del("/api/board/meetings/nada")).status, 403, "DELETE");
  eq((await client().get("/api/board/meetings")).status, 401, "anônimo");
});

test("diretor cria, lista, edita, move e apaga um encontro", async () => {
  const c = client();
  await c.login(1, ADMIN_PASS);
  const r = await c.post("/api/board/meetings", {
    title: "Acordo comercial do Hackathon",
    counterpart: { org: "OpenAI", person: "Ana" },
    front: "Hackathon",
    owners: [1, 3],
    agenda: "Discutir patrocínio",
  });
  eq(r.status, 200, "criar: " + JSON.stringify(r.data));
  eq(r.data.meeting.status, "a_marcar", "nasce a marcar");
  eq(r.data.meeting.durationMin, 60, "duração padrão");
  eq(r.data.meeting.ownersView.length, 2, "responsáveis resolvidos");
  eq(r.data.meeting.createdBy, 1, "autor");
  const id = r.data.meeting.id;

  const lista = await c.get("/api/board/meetings");
  eq(lista.status, 200);
  eq(lista.data.meetings.filter((m) => m.id === id).length, 1, "aparece na lista");
  assert(Array.isArray(lista.data.directors) && lista.data.directors.some((d) => d.order === 3), "lista de diretores");

  const mv = await c.patch("/api/board/meetings/" + id, { status: "marcado", date: "2030-01-15", time: "14:00" });
  eq(mv.status, 200, "marcar: " + JSON.stringify(mv.data));
  eq(mv.data.meeting.status, "marcado");
  eq(mv.data.meeting.title, "Acordo comercial do Hackathon", "PATCH parcial preserva título");

  const ed = await c.patch("/api/board/meetings/" + id, { link: "https://meet.google.com/abc", location: "Online (Google Meet)" });
  eq(ed.status, 200);
  eq(ed.data.meeting.link, "https://meet.google.com/abc");

  eq((await c.del("/api/board/meetings/" + id)).status, 200, "apagar");
  eq((await c.del("/api/board/meetings/" + id)).status, 404, "apagar de novo");
});

test("validação do encontro: campos exigidos por status, link e responsáveis", async () => {
  const c = client();
  await c.login(1, ADMIN_PASS);
  const semTitulo = await c.post("/api/board/meetings", { counterpart: { org: "X" } });
  eq(semTitulo.status, 400);
  eq(semTitulo.data.error, "invalid_meeting");
  assert(semTitulo.data.fields.includes("title"), "aponta title");

  const marcadoSemData = await c.post("/api/board/meetings", { title: "Reunião", counterpart: { org: "X" }, status: "marcado" });
  eq(marcadoSemData.status, 400);
  assert(marcadoSemData.data.fields.includes("date") && marcadoSemData.data.fields.includes("time"), "aponta date e time");

  const linkRuim = await c.post("/api/board/meetings", { title: "Reunião", counterpart: { org: "X" }, link: "meet.google.com/x" });
  eq(linkRuim.status, 400);
  assert(linkRuim.data.fields.includes("link"), "aponta link");

  const naoDiretor = await c.post("/api/board/meetings", { title: "Reunião", counterpart: { org: "X" }, owners: [MEMBER_ORDER] });
  eq(naoDiretor.status, 400);
  assert(naoDiretor.data.fields.includes("owners"), "aponta owners");

  const pendSemTexto = await c.post("/api/board/meetings", { title: "Reunião", counterpart: { org: "X" }, status: "pendencia", date: "2020-01-01", time: "10:00" });
  eq(pendSemTexto.status, 400);
  assert(pendSemTexto.data.fields.includes("followUp.text"), "aponta followUp.text");
});

test("realizado com data futura pede confirmação", async () => {
  const c = client();
  await c.login(1, ADMIN_PASS);
  const r = await c.post("/api/board/meetings", { title: "Conselho", counterpart: { org: "Lameiras" }, status: "realizado", date: "2030-05-05", time: "09:00" });
  eq(r.status, 409, "sem confirm");
  eq(r.data.error, "future_meeting");
  const ok = await c.post("/api/board/meetings", { title: "Conselho", counterpart: { org: "Lameiras" }, status: "realizado", date: "2030-05-05", time: "09:00", confirm: true });
  eq(ok.status, 200, "com confirm");
  await c.del("/api/board/meetings/" + ok.data.meeting.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/e2e.js 2>&1 | grep -E "FAIL|passaram"`
Expected: os 4 casos novos falham com 404 no lugar de 403/200.

- [ ] **Step 3: Write minimal implementation**

Inserir em `server.js` logo antes de `app.use(express.static(PUBLIC_DIR, { index: false }));`:

```js
// ---- Agenda da diretoria: encontros externos (spec 2026-09-07) ----
//
// Não é evento da liga: sem inscrição, presença nem página pública. Objeto
// próprio, store próprio, tudo atrás de requireDirectorApi. O kanban é o
// ciclo de vida do encontro (as quatro colunas abaixo).
const BOARD_MEETINGS_PATH = path.join(STORAGE_DIR, "board-meetings.json");
const BOARD_TOKENS_PATH = path.join(STORAGE_DIR, "board-calendar-tokens.json");
function readBoardMeetings() { return readStore(BOARD_MEETINGS_PATH); }
function writeBoardMeetings(value) { writeStore(BOARD_MEETINGS_PATH, value); }
function readBoardTokens() { return readStore(BOARD_TOKENS_PATH); }
function writeBoardTokens(value) { writeStore(BOARD_TOKENS_PATH, value); }
if (!fs.existsSync(BOARD_MEETINGS_PATH)) writeBoardMeetings({ meetings: [] });
if (!fs.existsSync(BOARD_TOKENS_PATH)) writeBoardTokens({ tokens: [] });

const BOARD_STATUSES = ["a_marcar", "marcado", "realizado", "pendencia"];
const BOARD_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BOARD_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDirectorMember(m) {
  return m.director === true || m.superadmin === true;
}
function boardDirectors() {
  return activeMembers().filter(isDirectorMember).map((m) => ({ order: m.order, name: m.name }));
}

// Valida e normaliza. `base` é o encontro atual (PATCH) ou null (POST): campo
// ausente no corpo herda do base, e as exigências por status valem sobre o
// resultado final, não só sobre o que veio no corpo.
function validateBoardMeeting(body, base) {
  const cur = base || {};
  const errors = [];
  const has = (k) => body[k] !== undefined;
  const str = (k, max) => (has(k) ? String(body[k] == null ? "" : body[k]).trim().slice(0, max) : String(cur[k] || ""));
  const out = {};

  out.title = str("title", 120);
  if (out.title.length < 3) errors.push("title");

  const cp = has("counterpart")
    ? (body.counterpart && typeof body.counterpart === "object" ? body.counterpart : {})
    : (cur.counterpart || {});
  out.counterpart = {
    org: String(cp.org == null ? "" : cp.org).trim().slice(0, 80),
    person: String(cp.person == null ? "" : cp.person).trim().slice(0, 80),
  };
  if (!out.counterpart.org) errors.push("counterpart.org");

  out.front = str("front", 30);

  out.status = has("status") ? String(body.status) : (cur.status || "a_marcar");
  if (BOARD_STATUSES.indexOf(out.status) === -1) errors.push("status");

  out.date = has("date") ? String(body.date || "") : (cur.date || "");
  if (out.date && !BOARD_DATE_RE.test(out.date)) errors.push("date");
  out.time = has("time") ? String(body.time || "") : (cur.time || "");
  if (out.time && !BOARD_TIME_RE.test(out.time)) errors.push("time");
  if (out.status !== "a_marcar") {
    if (!out.date) errors.push("date");
    if (!out.time) errors.push("time");
  }

  const dur = has("durationMin") ? Number(body.durationMin) : (cur.durationMin == null ? 60 : cur.durationMin);
  if (Number.isInteger(dur) && dur >= 15 && dur <= 480) out.durationMin = dur;
  else { out.durationMin = 60; errors.push("durationMin"); }

  out.location = str("location", 160);
  out.link = str("link", 500);
  if (out.link && !/^https?:\/\//i.test(out.link)) errors.push("link");

  if (has("owners")) {
    const allowed = new Set(boardDirectors().map((d) => d.order));
    const raw = Array.isArray(body.owners) ? body.owners : null;
    if (!raw) { out.owners = []; errors.push("owners"); }
    else {
      const uniq = Array.from(new Set(raw.map(Number)));
      if (uniq.some((o) => !allowed.has(o))) errors.push("owners");
      out.owners = uniq.filter((o) => allowed.has(o));
    }
  } else {
    out.owners = Array.isArray(cur.owners) ? cur.owners.slice() : [];
  }

  out.agenda = str("agenda", 2000);
  out.outcome = str("outcome", 2000);

  const fu = has("followUp")
    ? (body.followUp && typeof body.followUp === "object" ? body.followUp : {})
    : (cur.followUp || {});
  out.followUp = {
    text: String(fu.text == null ? "" : fu.text).trim().slice(0, 300),
    dueDate: String(fu.dueDate == null ? "" : fu.dueDate),
  };
  if (out.followUp.dueDate && !BOARD_DATE_RE.test(out.followUp.dueDate)) errors.push("followUp.dueDate");
  if (out.status === "pendencia" && !out.followUp.text) errors.push("followUp.text");

  return { value: out, errors: Array.from(new Set(errors)) };
}

// Fechar um encontro que ainda não aconteceu é quase sempre engano de data.
// Espelha o travel_confirm dos eventos: 409 e o cliente reenvia com confirm.
function boardNeedsFutureConfirm(value, body) {
  return (value.status === "realizado" || value.status === "pendencia") &&
    value.date > todayBR() && body.confirm !== true;
}

function boardRoster() {
  return new Map(allMembers().map((m) => [m.order, m.name]));
}
function boardMeetingView(m, roster) {
  const r = roster || boardRoster();
  return Object.assign({}, m, {
    ownersView: (m.owners || []).map((o) => ({ order: o, name: r.get(o) || "nº " + o })),
  });
}
// Com data primeiro, em ordem cronológica; sem data por último, na ordem de criação.
function boardMeetingCompare(a, b) {
  if (a.date && b.date) return (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""));
  if (a.date) return -1;
  if (b.date) return 1;
  return String(a.createdAt).localeCompare(String(b.createdAt));
}

app.get("/api/board/meetings", requireDirectorApi, (req, res) => {
  const data = readBoardMeetings();
  const roster = boardRoster();
  res.json({
    meetings: data.meetings.slice().sort(boardMeetingCompare).map((m) => boardMeetingView(m, roster)),
    directors: boardDirectors(),
  });
});

app.post("/api/board/meetings", requireDirectorApi, (req, res) => {
  const { value, errors } = validateBoardMeeting(req.body || {}, null);
  if (errors.length) return res.status(400).json({ error: "invalid_meeting", fields: errors, message: "Confira os campos: " + errors.join(", ") });
  if (boardNeedsFutureConfirm(value, req.body)) {
    return res.status(409).json({ error: "future_meeting", message: "A data desse encontro ainda não chegou. Confirma que ele já aconteceu?" });
  }
  const now = new Date().toISOString();
  const meeting = Object.assign(
    { id: "bm" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex") },
    value,
    { createdBy: req.session.user.order, createdAt: now, updatedAt: now }
  );
  const data = readBoardMeetings();
  data.meetings.push(meeting);
  writeBoardMeetings(data);
  res.json({ ok: true, meeting: boardMeetingView(meeting) });
});

app.patch("/api/board/meetings/:id", requireDirectorApi, (req, res) => {
  const data = readBoardMeetings();
  const meeting = data.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  const { value, errors } = validateBoardMeeting(req.body || {}, meeting);
  if (errors.length) return res.status(400).json({ error: "invalid_meeting", fields: errors, message: "Confira os campos: " + errors.join(", ") });
  if (boardNeedsFutureConfirm(value, req.body)) {
    return res.status(409).json({ error: "future_meeting", message: "A data desse encontro ainda não chegou. Confirma que ele já aconteceu?" });
  }
  Object.assign(meeting, value, { updatedAt: new Date().toISOString() });
  writeBoardMeetings(data);
  res.json({ ok: true, meeting: boardMeetingView(meeting) });
});

app.delete("/api/board/meetings/:id", requireDirectorApi, (req, res) => {
  const data = readBoardMeetings();
  const before = data.meetings.length;
  data.meetings = data.meetings.filter((m) => m.id !== req.params.id);
  if (data.meetings.length === before) return res.status(404).json({ error: "not_found" });
  writeBoardMeetings(data);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check server.js && node tests/e2e.js 2>&1 | grep -E "FAIL|passaram"`
Expected: `46 passaram, 0 falharam`.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "API da agenda da diretoria: encontros com ciclo de vida"
```

---

### Task 3: Token por diretor, feed e .ics avulso

**Files:**
- Modify: `server.js` (logo após as rotas da Task 2; e `pruneRateLimits`)
- Modify: `tests/e2e.js`

**Interfaces:**
- Consumes: `lib/ical.js` (`calendar`, `singleEvent`), `readBoardTokens`, `writeBoardTokens`, `findMember`, `isDirectorMember`, `boardRoster`.
- Produces: `GET /api/board/calendar-token` → `{ token, https, webcal }`; `POST /api/board/calendar-token/rotate` → mesmo formato; `GET /api/board/calendar/:token.ics` (sem sessão); `GET /api/board/meetings/:id.ics` (sessão de diretor).

- [ ] **Step 1: Write the failing tests**

```js
test("feed .ics por token: conteúdo, fuso, sigilo e rotação", async () => {
  const c = client();
  await c.login(1, ADMIN_PASS);
  const criado = await c.post("/api/board/meetings", {
    title: "Meet de aconselhamento",
    counterpart: { org: "Lameiras", person: "Prof. Lameiras" },
    status: "marcado", date: "2030-03-10", time: "14:00", durationMin: 45,
    location: "Online (Google Meet)", link: "https://meet.google.com/xyz",
    agenda: "PAUTA CONFIDENCIAL", owners: [1],
  });
  eq(criado.status, 200);
  const semData = await c.post("/api/board/meetings", { title: "Ainda sem data", counterpart: { org: "Alguém" } });
  eq(semData.status, 200);

  const tk = await c.get("/api/board/calendar-token");
  eq(tk.status, 200, "token");
  assert(/^[0-9a-f]{64}$/.test(tk.data.token), "token hex de 64");
  assert(tk.data.webcal.startsWith("webcal://") && tk.data.webcal.endsWith("/api/board/calendar/" + tk.data.token + ".ics"), "url webcal");
  const denovo = await c.get("/api/board/calendar-token");
  eq(denovo.data.token, tk.data.token, "GET repetido devolve o mesmo token");

  const feed = await client().get("/api/board/calendar/" + tk.data.token + ".ics");
  eq(feed.status, 200, "feed sem sessão");
  assert((feed.headers.get("content-type") || "").startsWith("text/calendar"), "content-type");
  assert(feed.data.startsWith("BEGIN:VCALENDAR"), "vcalendar");
  assert(feed.data.includes("DTSTART:20300310T170000Z"), "14:00 BRT = 17:00Z");
  assert(feed.data.includes("DTEND:20300310T174500Z"), "45 min");
  assert(feed.data.includes("SUMMARY:Meet de aconselhamento · Lameiras"), "summary");
  assert(!feed.data.includes("PAUTA CONFIDENCIAL"), "pauta vazou");
  assert(!feed.data.includes("Ainda sem data"), "encontro sem data não entra no feed");
  eq((feed.data.match(/BEGIN:VEVENT/g) || []).length, 1, "um VEVENT");

  const avulso = await c.get("/api/board/meetings/" + criado.data.meeting.id + ".ics");
  eq(avulso.status, 200, "ics avulso");
  assert(avulso.data.includes("UID:" + criado.data.meeting.id + "@lepv.org"), "uid do avulso");
  eq((await client().get("/api/board/meetings/" + criado.data.meeting.id + ".ics")).status, 401, "avulso exige sessão");

  const rot = await c.post("/api/board/calendar-token/rotate");
  eq(rot.status, 200);
  assert(rot.data.token !== tk.data.token, "token novo");
  eq((await client().get("/api/board/calendar/" + tk.data.token + ".ics")).status, 404, "token antigo morreu");
  eq((await client().get("/api/board/calendar/" + rot.data.token + ".ics")).status, 200, "token novo vive");
  eq((await client().get("/api/board/calendar/" + "f".repeat(64) + ".ics")).status, 404, "token inexistente");
  eq((await client().get("/api/board/calendar/abc.ics")).status, 404, "token malformado");

  const m = client();
  await m.login(MEMBER_ORDER, MEMBER_PASS);
  eq((await m.get("/api/board/calendar-token")).status, 403, "membro não tem token");

  await c.del("/api/board/meetings/" + criado.data.meeting.id);
  await c.del("/api/board/meetings/" + semData.data.meeting.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/e2e.js 2>&1 | grep -E "FAIL|passaram"`
Expected: o caso novo falha em `token` com 404.

- [ ] **Step 3: Write minimal implementation**

No topo de `server.js`, junto aos outros `require`: `const ical = require("./lib/ical.js");`

Em `pruneRateLimits`, troque `for (const map of [registerAttempts, publicFormAttempts])` por
`for (const map of [registerAttempts, publicFormAttempts, boardFeedAttempts])`.

Após as rotas da Task 2:

```js
// Token do feed: capacidade privada por diretor. Calendário assina a URL sem
// cookie, então a URL É a credencial: 32 bytes aleatórios, comparação em
// tempo constante, rotação mata a anterior, e um diretor rebaixado perde o
// feed na próxima busca porque o dono é conferido de novo a cada request.
function boardTokenFor(order) {
  const data = readBoardTokens();
  let rec = data.tokens.find((t) => t.order === order);
  if (!rec) {
    rec = { order, token: crypto.randomBytes(32).toString("hex"), createdAt: new Date().toISOString() };
    data.tokens.push(rec);
    writeBoardTokens(data);
  }
  return rec;
}
function boardTokenPayload(req, rec) {
  const pathPart = "/api/board/calendar/" + rec.token + ".ics";
  const host = req.get("host");
  return { token: rec.token, https: req.protocol + "://" + host + pathPart, webcal: "webcal://" + host + pathPart };
}
function findBoardToken(token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const given = Buffer.from(token, "hex");
  const rec = readBoardTokens().tokens.find((t) => {
    const b = Buffer.from(t.token, "hex");
    return b.length === given.length && crypto.timingSafeEqual(b, given);
  });
  if (!rec) return null;
  const owner = findMember(rec.order);
  return owner && isDirectorMember(owner) ? rec : null;
}
const boardFeedAttempts = new Map();
function boardFeedRateLimited(ip) {
  const now = Date.now();
  const rec = boardFeedAttempts.get(ip);
  if (!rec || rec.resetAt < now) {
    boardFeedAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 120;
}
function boardFeedMeetings(data) {
  return data.meetings.filter((m) => m.status !== "a_marcar" && m.date && m.time).sort(boardMeetingCompare);
}
function boardOwnerNames(roster) {
  return (m) => (m.owners || []).map((o) => roster.get(o)).filter(Boolean);
}
function sendIcs(res, filename, body) {
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Content-Disposition", 'inline; filename="' + filename + '"');
  res.set("Cache-Control", "no-store");
  res.send(body);
}

app.get("/api/board/calendar-token", requireDirectorApi, (req, res) => {
  res.json(boardTokenPayload(req, boardTokenFor(req.session.user.order)));
});
app.post("/api/board/calendar-token/rotate", requireDirectorApi, (req, res) => {
  const data = readBoardTokens();
  data.tokens = data.tokens.filter((t) => t.order !== req.session.user.order);
  const rec = { order: req.session.user.order, token: crypto.randomBytes(32).toString("hex"), createdAt: new Date().toISOString() };
  data.tokens.push(rec);
  writeBoardTokens(data);
  res.json(boardTokenPayload(req, rec));
});
app.get("/api/board/calendar/:token.ics", (req, res) => {
  if (boardFeedRateLimited(req.ip)) return res.status(429).end();
  const rec = findBoardToken(String(req.params.token || ""));
  if (!rec) return res.status(404).end();
  const data = readBoardMeetings();
  sendIcs(res, "lepv-diretoria.ics", ical.calendar(boardFeedMeetings(data), { ownerNames: boardOwnerNames(boardRoster()) }));
});
app.get("/api/board/meetings/:id.ics", requireDirectorApi, (req, res) => {
  const meeting = readBoardMeetings().meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "not_found" });
  if (!meeting.date || !meeting.time) return res.status(400).json({ error: "no_date", message: "Encontro sem data não vira arquivo de calendário." });
  sendIcs(res, "lepv-" + meeting.id + ".ics", ical.singleEvent(meeting, { ownerNames: boardOwnerNames(boardRoster()) }));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check server.js && npm test 2>&1 | grep -E "FAIL|passaram|ical OK"`
Expected: `ical OK` e `47 passaram, 0 falharam`.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "Feed iCalendar por diretor e .ics avulso dos encontros"
```

---

### Task 4: Aba Diretoria com o quadro

**Files:**
- Create: `public/js/features/board.js`
- Modify: `public/app.html` (painel após `panel-acessos`, CSS `.board-*`, script module)
- Modify: `public/app.js:140-158` (injeção de abas) e `loaders` no fim
- Modify: `public/sw.js:5`

**Interfaces:**
- Consumes: `GET /api/board/meetings` → `{ meetings, directors }`, `POST/PATCH/DELETE /api/board/meetings[/:id]`, erro 400 `{ fields }`, 409 `future_meeting`.
- Produces: `export function initBoard(context)`; evento `lepv:board:load` recarrega; painel `#panel-diretoria`, raiz `#board-root`, colunas `.board-col[data-status]`, cartões `.board-card[data-id]`, botões `.board-actions button[data-act]`, seletor `.board-view [data-view]`.

- [ ] **Step 1: Verificação que falha antes**

Criar `scripts/verify-board.js` (versão inicial, ampliada na Task 6):

```js
const { chromium } = require('playwright');
const BASE = (function () {
  const arg = process.argv.find(a => a.startsWith('--base='));
  if (arg) return arg.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();
const ADMIN_PASS = process.env.LEPV_CI_ADMIN_PASS || 'ci-admin';
/* Aba Diretoria: existe só para diretor, o módulo ES carrega sem erro, o
   quadro tem as quatro colunas, botões de cartão >= 44px em 390px, e a visão
   Calendário alterna e volta. Cria um encontro de fixture porque um quadro
   vazio não tem botão para medir. */
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  const check = (ok, label, detail) => {
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
    if (!ok) bad++;
  };
  // ---- diretor ----
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)\.com/.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE + '/login.html', { waitUntil: 'load' });
  const login = await p.evaluate(async (pass) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 1, password: pass }) });
    return r.status;
  }, ADMIN_PASS);
  if (login !== 200) { console.log('login do diretor falhou:', login); await b.close(); process.exit(2); }
  const fixture = await p.evaluate(async () => {
    const r = await fetch('/api/board/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Encontro de verificação', counterpart: { org: 'Fixture & Co.', person: 'Alguém' }, front: 'CI',
        status: 'marcado', date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), time: '14:00', owners: [1] }) });
    return r.status;
  });
  check(fixture === 200, 'encontro de fixture criado', fixture);
  await p.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p.waitForSelector('#tab-diretoria', { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => { const m = document.querySelector('.pin-backdrop'); if (m) m.remove(); });
  check(await p.$('#tab-diretoria') !== null, 'aba Diretoria existe para diretor');
  await p.click('#tab-diretoria');
  await p.waitForSelector('.board-col', { timeout: 5000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const cols = [...document.querySelectorAll('.board-col')].map(c => c.dataset.status);
    const btns = [...document.querySelectorAll('.board-actions button, .board-toolbar button')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .map(e => ({ t: (e.textContent || '').trim().slice(0, 14), h: Math.round(e.getBoundingClientRect().height) }));
    return { overflowX: de.scrollWidth - de.clientWidth, cols, cards: document.querySelectorAll('.board-card').length, btns };
  });
  check(r.cols.join(',') === 'a_marcar,marcado,realizado,pendencia', 'quatro colunas na ordem', r.cols.join(','));
  check(r.cards >= 1, 'quadro mostra o encontro', r.cards);
  check(r.btns.length > 0 && r.btns.every(x => x.h >= 44), 'botões >= 44px', JSON.stringify(r.btns.filter(x => x.h < 44)));
  check(r.overflowX === 0, 'sem overflow horizontal', r.overflowX);
  await p.click('.board-view [data-view="calendario"]');
  await p.waitForSelector('.board-month', { timeout: 3000 }).catch(() => {});
  check(await p.$('.board-month') !== null, 'visão Calendário renderiza');
  await p.click('.board-view [data-view="quadro"]');
  await p.waitForSelector('.board-col', { timeout: 3000 }).catch(() => {});
  check(await p.$('.board-col') !== null, 'volta para o Quadro');
  check(errs.length === 0, 'sem erro de console/JS', errs.slice(0, 3).join(' | '));
  await ctx.close();
  // ---- membro comum ----
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/login.html', { waitUntil: 'load' });
  const l2 = await p2.evaluate(async () => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 2, password: '2' }) })).status);
  if (l2 === 200) {
    await p2.goto(BASE + '/app.html', { waitUntil: 'load' });
    await p2.waitForTimeout(1200);
    check(await p2.$('#tab-diretoria') === null, 'membro comum não vê a aba');
  } else {
    console.log('  (membro order 2 não logou: ' + l2 + ', pulando checagem)');
  }
  await b.close();
  console.log(bad ? `\n${bad} falha(s)` : '\nverify-board OK');
  process.exit(bad ? 1 : 0);
})();
```

Run (server de fixture no ar): `node scripts/verify-board.js`
Expected: FALHA em "aba Diretoria existe para diretor" e nas seguintes.

- [ ] **Step 2: app.html — painel, CSS e script**

Depois do `</section>` de `panel-acessos`, inserir:

```html
    <!-- Diretoria: agenda de encontros externos. A aba só é injetada no nav
         para diretor; o conteúdo é o módulo ES /js/features/board.js. -->
    <section class="panel" id="panel-diretoria" role="tabpanel" aria-labelledby="tab-diretoria" tabindex="0">
      <div id="board-root">
        <div class="card rv"><p class="empty-state">Carregando...</p></div>
      </div>
    </section>
```

Após `<script src="/app.js"></script>`: `<script type="module" src="/js/features/board.js"></script>`.

No `<style>` de `app.html`, antes de `</style>`:

```css
  /* ---- Diretoria: agenda de encontros (quadro + calendário) ---- */
  .board-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px; }
  .board-toolbar .spacer { flex: 1; }
  .board-toolbar button, .board-actions button, .board-menu button, .board-subscribe button, .board-month-nav button {
    min-height: 44px; padding: 0 14px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    border: 1px solid var(--line-2); border-radius: 3px; background: var(--card); color: var(--ink);
  }
  .board-toolbar button.primary { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .board-view { display: inline-flex; border: 1px solid var(--line-2); border-radius: 3px; overflow: hidden; }
  .board-view button { border: 0; border-radius: 0; }
  .board-view button[aria-pressed="true"] { background: var(--ink); color: var(--card); }
  .board-columns { display: grid; gap: 12px; grid-template-columns: 1fr; }
  @media (min-width: 900px) { .board-columns { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .board-col { border-top: 2px solid var(--ink); padding-top: 10px; min-width: 0; }
  .board-col header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  .board-col h3 { font: 600 12px/1.2 var(--fb, inherit); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-2); margin: 0; }
  .board-count { font-size: 12px; color: var(--ink-3); }
  .board-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .board-card { background: var(--card); border: 1px solid var(--line); border-radius: 3px; padding: 12px; min-width: 0; }
  .board-card .title { font-size: 14.5px; font-weight: 600; color: var(--ink); margin: 0 0 4px; overflow-wrap: anywhere; }
  .board-card .front { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--wine); margin-left: 6px; }
  .board-card p { margin: 0 0 3px; font-size: 13px; color: var(--ink-2); overflow-wrap: anywhere; }
  .board-card .meta { font-size: 12px; color: var(--ink-3); }
  .board-card .followup { border-left: 2px solid var(--pending); padding-left: 8px; color: var(--ink-2); margin-top: 6px; }
  .board-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .board-actions button { flex: 1 1 auto; padding: 0 10px; font-size: 12.5px; }
  .board-menu { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .board-menu[hidden] { display: none; }
  .board-menu .warn { flex: 1 1 100%; font-size: 12.5px; color: var(--pending); margin: 0; }
  .board-menu a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; font-size: 13px; font-weight: 600; color: var(--ink); text-decoration: underline; }
  .board-empty { font-size: 13px; color: var(--ink-3); padding: 10px 0; }
  .board-month-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .board-month-nav h3 { flex: 1; font-family: var(--fd); font-weight: 400; font-size: 22px; margin: 0; color: var(--ink); text-transform: capitalize; }
  .board-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-left: 1px solid var(--line); border-top: 1px solid var(--line); }
  .board-month .dow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); padding: 6px 4px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: center; }
  .board-day { min-height: 64px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 4px; background: var(--card); text-align: left; font: inherit; color: inherit; cursor: pointer; min-width: 0; }
  .board-day.other { background: var(--paper-2); color: var(--ink-3); }
  .board-day.today .num { background: var(--ink); color: var(--card); }
  .board-day.selected { outline: 2px solid var(--wine); outline-offset: -2px; }
  .board-day .num { display: inline-block; font-size: 12px; font-weight: 600; min-width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 10px; }
  .board-day .ev { display: block; font-size: 10.5px; line-height: 1.3; color: var(--wine); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  @media (min-width: 700px) { .board-day { min-height: 92px; } .board-day .ev { font-size: 12px; } }
  .board-daylist { margin-top: 14px; }
  .board-subscribe { margin-top: 14px; }
  .board-subscribe .url { display: flex; gap: 8px; flex-wrap: wrap; }
  .board-subscribe input { flex: 1 1 200px; min-height: 44px; font: inherit; font-size: 12.5px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink); background: var(--paper); }
  .board-subscribe ol { margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: var(--ink-2); }
  .board-subscribe ol li { margin-bottom: 4px; }
  .form-modal .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .form-modal .owners { display: flex; flex-wrap: wrap; gap: 6px 14px; }
  .form-modal .owners label { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; min-height: 32px; }
  .form-modal .field.invalid input, .form-modal .field.invalid textarea, .form-modal .field.invalid select { border-color: var(--danger); }
  .form-modal textarea { font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--line-2); border-radius: 3px; min-height: 72px; resize: vertical; }
  .form-modal .danger-zone { margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .form-modal .danger-zone button { min-height: 44px; font: inherit; font-size: 13px; padding: 0 12px; border: 1px solid var(--danger-line); background: var(--danger-soft); color: var(--danger); border-radius: 3px; cursor: pointer; }
  @media (prefers-reduced-motion: reduce) { .board-menu, .board-day { transition: none; } }
```

- [ ] **Step 3: app.js — ponte**

Antes do bloco `meReady.then(function (me) { if (!me.superadmin || ...` inserir:

```js
  // A aba Diretoria (agenda de encontros externos) só existe para diretor. O
  // painel é um módulo ES (/js/features/board.js): o monólito só põe o botão
  // no nav e avisa o módulo quando a aba ativa — nada de global em window.
  meReady.then(function (me) {
    if (!(me.director || me.superadmin) || document.getElementById("tab-diretoria")) return;
    var btn = document.createElement("button");
    btn.dataset.tab = "diretoria";
    btn.dataset.group = "liga";
    btn.id = "tab-diretoria";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", "panel-diretoria");
    btn.setAttribute("aria-selected", "false");
    btn.setAttribute("tabindex", "-1");
    btn.textContent = "Diretoria";
    var membros = document.getElementById("tab-membros");
    membros.parentNode.insertBefore(btn, membros.nextSibling);
    btn.addEventListener("click", function () { activateTab("diretoria"); });
  });
```

No bloco de Acessos, trocar `var membros = document.getElementById("tab-membros"); membros.parentNode.insertBefore(btn, membros.nextSibling);` por
`var anchor = document.getElementById("tab-diretoria") || document.getElementById("tab-membros"); anchor.parentNode.insertBefore(btn, anchor.nextSibling);`

Em `loaders`, adicionar `diretoria: function () { document.dispatchEvent(new CustomEvent("lepv:board:load")); },`.

Em `sw.js`: `var CACHE = "lepv-sp-v10"; // v10: aba Diretoria como módulo ES`.

- [ ] **Step 4: O módulo board.js**

```js
// Agenda da diretoria — quadro (ciclo de vida) e calendário mensal dos
// encontros externos. Primeiro módulo ES do app (spec 2026-09-07): o app.js
// só injeta a aba e dispara "lepv:board:load"; tudo o mais vive aqui.
//
// Só diretor chega a esta aba (o nav não tem o botão para os demais), e o
// servidor exige o papel de novo em cada rota — o módulo é só a superfície.

const STATUSES = [
  { key: "a_marcar", label: "A marcar" },
  { key: "marcado", label: "Marcado" },
  { key: "realizado", label: "Realizado" },
  { key: "pendencia", label: "Com pendência" },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
const VIEW_KEY = "lepv.board.view";
const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

// ---- serialização (mesmos contratos da spec de modularização) ----
export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export const escapeAttr = escapeHtml;
export function safeUrl(value) {
  const url = String(value == null ? "" : value);
  return /^(?:\/|https?:\/\/)/i.test(url) ? url : "";
}

// ---- API ----
async function api(path, options) {
  const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options));
  if (r.status === 401) { window.location.href = "/login.html"; throw new Error("not authenticated"); }
  let body = null;
  try { body = await r.json(); } catch (e) { body = {}; }
  if (!r.ok) { const err = new Error(body.message || body.error || "request failed"); err.status = r.status; err.body = body; throw err; }
  return body;
}

// ---- datas ----
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function fmtDateBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DOW[(dt.getUTCDay() + 6) % 7] + " " + String(d).padStart(2, "0") + "/" + String(m).padStart(2, "0") + "/" + y;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
function utcStamp(iso, time, plusMin) {
  const d = new Date(iso + "T" + time + ":00-03:00");
  if (plusMin) d.setTime(d.getTime() + plusMin * 60000);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function googleCalendarUrl(m) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title + " · " + m.counterpart.org,
    dates: utcStamp(m.date, m.time) + "/" + utcStamp(m.date, m.time, m.durationMin || 60),
    details: (m.counterpart.person ? "Com " + m.counterpart.person + " (" + m.counterpart.org + ")" : "Com " + m.counterpart.org) + (m.link ? "\n" + m.link : ""),
    location: m.location || "",
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
function initials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

// ---- estado ----
const state = {
  root: null,
  meetings: [],
  directors: [],
  view: "quadro",
  month: todayISO().slice(0, 7),
  selectedDay: null,
  openMenu: null, // { id, kind: "move" | "cal" }
  subscribe: null, // payload do token quando o bloco está aberto
  loaded: false,
};
try { const v = localStorage.getItem(VIEW_KEY); if (v === "calendario" || v === "quadro") state.view = v; } catch (e) {}

// ---- render ----
function cardHtml(m) {
  const owners = (m.ownersView || []).map((o) => '<span title="' + escapeAttr(o.name) + '">' + escapeHtml(initials(o.name)) + "</span>").join(" ");
  const when = m.date
    ? fmtDateBR(m.date) + (m.time ? " · " + escapeHtml(m.time) : "") + (m.durationMin ? " · " + m.durationMin + " min" : "")
    : "sem data";
  const menu = state.openMenu && state.openMenu.id === m.id ? menuHtml(m, state.openMenu) : "";
  return (
    '<li class="board-card" data-id="' + escapeAttr(m.id) + '">' +
      '<p class="title">' + escapeHtml(m.title) + (m.front ? '<span class="front">' + escapeHtml(m.front) + "</span>" : "") + "</p>" +
      "<p>" + escapeHtml(m.counterpart.org) + (m.counterpart.person ? " · " + escapeHtml(m.counterpart.person) : "") + "</p>" +
      '<p class="meta">' + when + (m.location ? " · " + escapeHtml(m.location) : "") + "</p>" +
      (owners ? '<p class="meta">Responsáveis: ' + owners + "</p>" : "") +
      (m.status === "pendencia" && m.followUp && m.followUp.text
        ? '<p class="followup">' + escapeHtml(m.followUp.text) + (m.followUp.dueDate ? ' <span class="meta">até ' + fmtDateBR(m.followUp.dueDate) + "</span>" : "") + "</p>"
        : "") +
      '<div class="board-actions">' +
        '<button type="button" data-act="move" aria-expanded="' + (menu && state.openMenu.kind === "move" ? "true" : "false") + '">Mover</button>' +
        '<button type="button" data-act="edit">Editar</button>' +
        (m.date && m.time ? '<button type="button" data-act="cal" aria-expanded="' + (menu && state.openMenu.kind === "cal" ? "true" : "false") + '">Calendário</button>' : "") +
      "</div>" +
      menu +
    "</li>"
  );
}
function menuHtml(m, menu) {
  if (menu.kind === "move") {
    const warn = menu.confirm ? '<p class="warn">A data desse encontro ainda não chegou. Confirma que ele já aconteceu?</p>' : "";
    const targets = menu.confirm
      ? '<button type="button" data-move="' + escapeAttr(menu.confirm) + '" data-confirm="1">Sim, mover para ' + escapeHtml(STATUS_LABEL[menu.confirm]) + "</button>"
      : STATUSES.filter((s) => s.key !== m.status).map((s) => '<button type="button" data-move="' + s.key + '">' + escapeHtml(s.label) + "</button>").join("");
    return '<div class="board-menu" role="group" aria-label="Mover para">' + warn + targets + (menu.error ? '<p class="warn">' + escapeHtml(menu.error) + "</p>" : "") + "</div>";
  }
  return (
    '<div class="board-menu" role="group" aria-label="Adicionar ao calendário">' +
      '<a href="' + escapeAttr(googleCalendarUrl(m)) + '" target="_blank" rel="noopener">Google Calendar</a>' +
      '<a href="/api/board/meetings/' + escapeAttr(m.id) + '.ics" download>Baixar .ics</a>' +
    "</div>"
  );
}
function boardHtml() {
  return (
    '<div class="board-columns">' +
    STATUSES.map((s) => {
      const list = state.meetings.filter((m) => m.status === s.key);
      return (
        '<section class="board-col" data-status="' + s.key + '">' +
          "<header><h3>" + escapeHtml(s.label) + '</h3><span class="board-count">' + list.length + "</span></header>" +
          (list.length ? '<ul class="board-list">' + list.map(cardHtml).join("") + "</ul>" : '<p class="board-empty">Nada aqui.</p>') +
        "</section>"
      );
    }).join("") +
    "</div>"
  );
}
function calendarHtml() {
  const [y, mo] = state.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // segunda = 0
  const today = todayISO();
  const byDay = new Map();
  for (const m of state.meetings) {
    if (!m.date || m.status === "a_marcar") continue;
    if (!byDay.has(m.date)) byDay.set(m.date, []);
    byDay.get(m.date).push(m);
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(y, mo - 1, 1 - startOffset + i));
    const iso = d.toISOString().slice(0, 10);
    const other = d.getUTCMonth() !== mo - 1;
    if (i >= 35 && other) break;
    const list = (byDay.get(iso) || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    cells.push(
      '<button type="button" class="board-day' + (other ? " other" : "") + (iso === today ? " today" : "") + (iso === state.selectedDay ? " selected" : "") + '" data-day="' + iso + '" aria-label="' + escapeAttr(fmtDateBR(iso) + (list.length ? ", " + list.length + " encontro(s)" : "")) + '">' +
        '<span class="num">' + d.getUTCDate() + "</span>" +
        list.map((m) => '<span class="ev">' + escapeHtml((m.time ? m.time + " " : "") + m.title) + "</span>").join("") +
      "</button>"
    );
  }
  const dayList = state.selectedDay ? (byDay.get(state.selectedDay) || []) : [];
  return (
    '<div class="board-month-nav">' +
      '<button type="button" data-month="-1" aria-label="Mês anterior">‹</button>' +
      "<h3>" + escapeHtml(monthLabel(state.month)) + "</h3>" +
      '<button type="button" data-month="0">Hoje</button>' +
      '<button type="button" data-month="1" aria-label="Próximo mês">›</button>' +
    "</div>" +
    '<div class="board-month" role="grid">' + DOW.map((d) => '<div class="dow">' + d + "</div>").join("") + cells.join("") + "</div>" +
    (state.selectedDay
      ? '<div class="board-daylist"><p class="section-label">' + escapeHtml(fmtDateBR(state.selectedDay)) + "</p>" +
        (dayList.length ? '<ul class="board-list">' + dayList.map(cardHtml).join("") + "</ul>" : '<p class="board-empty">Nenhum encontro neste dia.</p>') + "</div>"
      : "")
  );
}
function subscribeHtml() {
  const s = state.subscribe;
  if (!s) return "";
  return (
    '<div class="board-subscribe card rv">' +
      '<p class="section-label">Assinar no meu calendário</p>' +
      '<p class="meta" style="font-size:13px; color: var(--ink-2); margin: 0 0 10px;">Este link é seu e dá acesso só aos encontros com data. Quem tiver o link vê a agenda; se vazar, gere um novo.</p>' +
      '<div class="url"><input type="text" readonly value="' + escapeAttr(s.webcal) + '" aria-label="Endereço do feed">' +
        '<button type="button" data-sub="copy">Copiar</button>' +
        '<button type="button" data-sub="rotate">' + (s.confirmRotate ? "Confirmar novo link" : "Gerar novo link") + "</button></div>" +
      (s.copied ? '<p class="meta" style="margin:6px 0 0;">Copiado.</p>' : "") +
      (s.confirmRotate ? '<p class="meta" style="margin:6px 0 0; color: var(--pending);">O link atual para de funcionar em todos os seus calendários.</p>' : "") +
      "<ol>" +
        "<li><strong>Google Calendar</strong>: Outras agendas → + → Por URL → cole o endereço.</li>" +
        "<li><strong>Apple Calendário</strong>: Arquivo → Nova assinatura de calendário → cole o endereço.</li>" +
        "<li><strong>Outlook</strong>: Adicionar calendário → Assinar da Web → cole o endereço.</li>" +
      "</ol>" +
    "</div>"
  );
}
function render() {
  const root = state.root;
  if (!root) return;
  root.innerHTML =
    '<div class="card rv">' +
      '<p class="section-label">Agenda da diretoria</p>' +
      '<div class="board-toolbar">' +
        '<button type="button" class="primary" data-act="new">Novo encontro</button>' +
        '<button type="button" data-act="subscribe" aria-expanded="' + (state.subscribe ? "true" : "false") + '">Assinar no meu calendário</button>' +
        '<span class="spacer"></span>' +
        '<div class="board-view" role="group" aria-label="Visão">' +
          '<button type="button" data-view="quadro" aria-pressed="' + (state.view === "quadro") + '">Quadro</button>' +
          '<button type="button" data-view="calendario" aria-pressed="' + (state.view === "calendario") + '">Calendário</button>' +
        "</div>" +
      "</div>" +
      (state.loaded
        ? (state.meetings.length || state.view === "calendario" ? (state.view === "quadro" ? boardHtml() : calendarHtml()) : '<p class="board-empty">Nenhum encontro registrado. Comece pelo botão "Novo encontro".</p>')
        : '<p class="empty-state">Carregando...</p>') +
    "</div>" +
    subscribeHtml();
}

// ---- ações ----
async function load() {
  try {
    const data = await api("/api/board/meetings");
    state.meetings = data.meetings || [];
    state.directors = data.directors || [];
    state.loaded = true;
  } catch (e) {
    state.loaded = true;
    state.meetings = [];
    state.root.innerHTML = '<div class="card rv"><p class="empty-state">Não foi possível carregar a agenda. ' + escapeHtml(e.message || "") + "</p></div>";
    return;
  }
  render();
}
async function moveTo(id, status, confirm) {
  try {
    await api("/api/board/meetings/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(confirm ? { status, confirm: true } : { status }) });
    state.openMenu = null;
    await load();
  } catch (e) {
    if (e.status === 409 && e.body && e.body.error === "future_meeting") {
      state.openMenu = { id, kind: "move", confirm: status };
    } else if (e.status === 400 && e.body && e.body.fields) {
      // Faltam campos para esse status (data/hora ou texto da pendência): abre o editor já no status escolhido.
      const m = state.meetings.find((x) => x.id === id);
      state.openMenu = null;
      render();
      openEditor(Object.assign({}, m, { status }), e.body.fields);
      return;
    } else {
      state.openMenu = { id, kind: "move", error: e.message };
    }
    render();
  }
}
async function toggleSubscribe() {
  if (state.subscribe) { state.subscribe = null; render(); return; }
  try {
    state.subscribe = await api("/api/board/calendar-token");
  } catch (e) {
    state.subscribe = null;
  }
  render();
}
async function copyFeed() {
  const url = state.subscribe.webcal;
  try { await navigator.clipboard.writeText(url); state.subscribe.copied = true; }
  catch (e) { const inp = state.root.querySelector(".board-subscribe input"); if (inp) { inp.select(); document.execCommand && document.execCommand("copy"); state.subscribe.copied = true; } }
  render();
}
async function rotateFeed() {
  if (!state.subscribe.confirmRotate) { state.subscribe.confirmRotate = true; render(); return; }
  try {
    state.subscribe = await api("/api/board/calendar-token/rotate", { method: "POST" });
  } catch (e) { state.subscribe.confirmRotate = false; }
  render();
}

// ---- editor (modal) ----
function fieldHtml(id, label, inner) {
  return '<div class="field" data-field="' + id + '"><label for="bm-' + id + '">' + label + "</label>" + inner + "</div>";
}
function editorHtml(m) {
  const val = (v) => escapeAttr(v == null ? "" : v);
  const owners = new Set(m.owners || []);
  return (
    '<h3 id="bm-modal-title">' + (m.id ? "Editar encontro" : "Novo encontro") + "</h3>" +
    '<form id="bm-form" novalidate>' +
      '<p class="form-error" id="bm-error"></p>' +
      fieldHtml("title", "Título", '<input type="text" id="bm-title" maxlength="120" required value="' + val(m.title) + '">') +
      '<div class="row2">' +
        fieldHtml("counterpart.org", "Organização", '<input type="text" id="bm-counterpart.org" maxlength="80" required value="' + val(m.counterpart && m.counterpart.org) + '">') +
        fieldHtml("counterpart.person", "Pessoa", '<input type="text" id="bm-counterpart.person" maxlength="80" value="' + val(m.counterpart && m.counterpart.person) + '">') +
      "</div>" +
      '<div class="row2">' +
        fieldHtml("front", "Frente", '<input type="text" id="bm-front" maxlength="30" placeholder="Hackathon, Conselho..." value="' + val(m.front) + '">') +
        fieldHtml("status", "Status", '<select id="bm-status">' + STATUSES.map((s) => '<option value="' + s.key + '"' + (s.key === (m.status || "a_marcar") ? " selected" : "") + ">" + escapeHtml(s.label) + "</option>").join("") + "</select>") +
      "</div>" +
      '<div class="row2">' +
        fieldHtml("date", "Data", '<input type="date" id="bm-date" value="' + val(m.date) + '">') +
        fieldHtml("time", "Hora", '<input type="time" id="bm-time" value="' + val(m.time) + '">') +
      "</div>" +
      '<div class="row2">' +
        fieldHtml("durationMin", "Duração (min)", '<input type="number" id="bm-durationMin" min="15" max="480" step="15" value="' + val(m.durationMin || 60) + '">') +
        fieldHtml("location", "Local", '<input type="text" id="bm-location" maxlength="160" placeholder="Online (Google Meet), sala..." value="' + val(m.location) + '">') +
      "</div>" +
      fieldHtml("link", "Link da chamada", '<input type="url" id="bm-link" maxlength="500" placeholder="https://" value="' + val(m.link) + '">') +
      '<div class="field" data-field="owners"><span class="label">Responsáveis</span><div class="owners">' +
        state.directors.map((d) => '<label><input type="checkbox" name="owners" value="' + d.order + '"' + (owners.has(d.order) ? " checked" : "") + "> " + escapeHtml(d.name) + "</label>").join("") +
      "</div></div>" +
      fieldHtml("agenda", "Pauta", '<textarea id="bm-agenda" maxlength="2000">' + escapeHtml(m.agenda) + "</textarea>") +
      fieldHtml("outcome", "Resultado", '<textarea id="bm-outcome" maxlength="2000">' + escapeHtml(m.outcome) + "</textarea>") +
      '<div id="bm-followup-wrap">' +
        fieldHtml("followUp.text", "Pendência", '<input type="text" id="bm-followUp.text" maxlength="300" placeholder="O que ficou para cobrar" value="' + val(m.followUp && m.followUp.text) + '">') +
        fieldHtml("followUp.dueDate", "Prazo da pendência", '<input type="date" id="bm-followUp.dueDate" value="' + val(m.followUp && m.followUp.dueDate) + '">') +
      "</div>" +
      '<label class="field" id="bm-confirm-wrap" hidden><span><input type="checkbox" id="bm-confirm"> A data ainda não chegou; confirmo que o encontro já aconteceu.</span></label>' +
      '<div class="pin-actions"><button type="button" class="btn-ghost" id="bm-cancel">Cancelar</button><button type="submit" class="btn-primary">Salvar</button></div>' +
      (m.id ? '<div class="danger-zone"><button type="button" id="bm-delete">Apagar encontro</button><span class="meta" id="bm-delete-hint"></span></div>' : "") +
    "</form>"
  );
}
function openEditor(meeting, invalidFields) {
  const m = Object.assign({ counterpart: {}, followUp: {}, owners: [], status: "a_marcar" }, meeting || {});
  const backdrop = document.createElement("div");
  backdrop.className = "pin-backdrop";
  const modal = document.createElement("div");
  modal.className = "pin-modal form-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "bm-modal-title");
  modal.innerHTML = editorHtml(m);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("open"));
  const prevFocus = document.activeElement;
  const form = modal.querySelector("#bm-form");
  const errorEl = modal.querySelector("#bm-error");
  const statusEl = modal.querySelector("#bm-status");
  const followWrap = modal.querySelector("#bm-followup-wrap");
  const confirmWrap = modal.querySelector("#bm-confirm-wrap");
  function syncStatus() {
    followWrap.hidden = statusEl.value !== "pendencia";
  }
  syncStatus();
  statusEl.addEventListener("change", syncStatus);
  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  modal.querySelector("#bm-cancel").addEventListener("click", close);
  function markInvalid(fields, message) {
    modal.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    (fields || []).forEach((f) => { const el = modal.querySelector('[data-field="' + f + '"]'); if (el) el.classList.add("invalid"); });
    errorEl.textContent = message || "";
    errorEl.classList.toggle("show", Boolean(message));
  }
  if (invalidFields && invalidFields.length) markInvalid(invalidFields, "Complete os campos destacados para esse status.");
  const v = (id) => modal.querySelector("#bm-" + id.replace(/\./g, "\\.")).value.trim();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: v("title"),
      counterpart: { org: v("counterpart.org"), person: v("counterpart.person") },
      front: v("front"),
      status: statusEl.value,
      date: v("date"),
      time: v("time"),
      durationMin: Number(v("durationMin")) || 60,
      location: v("location"),
      link: v("link"),
      owners: Array.from(modal.querySelectorAll('input[name="owners"]:checked')).map((c) => Number(c.value)),
      agenda: v("agenda"),
      outcome: v("outcome"),
      followUp: { text: v("followUp.text"), dueDate: v("followUp.dueDate") },
    };
    if (!confirmWrap.hidden && modal.querySelector("#bm-confirm").checked) payload.confirm = true;
    try {
      await api(m.id ? "/api/board/meetings/" + encodeURIComponent(m.id) : "/api/board/meetings", { method: m.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      close();
      await load();
    } catch (err) {
      if (err.status === 409 && err.body && err.body.error === "future_meeting") {
        confirmWrap.hidden = false;
        markInvalid(["date"], err.message);
      } else {
        markInvalid((err.body && err.body.fields) || [], err.message || "Não foi possível salvar.");
      }
    }
  });
  const del = modal.querySelector("#bm-delete");
  if (del) {
    let armed = false;
    del.addEventListener("click", async () => {
      if (!armed) { armed = true; del.textContent = "Confirmar exclusão"; modal.querySelector("#bm-delete-hint").textContent = "Não dá para desfazer."; return; }
      try {
        await api("/api/board/meetings/" + encodeURIComponent(m.id), { method: "DELETE" });
        close();
        await load();
      } catch (err) { markInvalid([], err.message); }
    });
  }
  const first = modal.querySelector("#bm-title");
  if (first) first.focus();
}

// ---- eventos de UI (delegação na raiz) ----
function onClick(e) {
  const t = e.target.closest("button, a");
  if (!t || !state.root.contains(t)) return;
  if (t.dataset.view) {
    state.view = t.dataset.view;
    try { localStorage.setItem(VIEW_KEY, state.view); } catch (err) {}
    state.openMenu = null;
    render();
    return;
  }
  if (t.dataset.act === "new") { openEditor(null); return; }
  if (t.dataset.act === "subscribe") { toggleSubscribe(); return; }
  if (t.dataset.sub === "copy") { copyFeed(); return; }
  if (t.dataset.sub === "rotate") { rotateFeed(); return; }
  if (t.dataset.month !== undefined) {
    state.month = t.dataset.month === "0" ? todayISO().slice(0, 7) : shiftMonth(state.month, Number(t.dataset.month));
    if (t.dataset.month === "0") state.selectedDay = todayISO();
    render();
    return;
  }
  if (t.dataset.day) {
    state.selectedDay = state.selectedDay === t.dataset.day ? null : t.dataset.day;
    state.openMenu = null;
    render();
    return;
  }
  const card = t.closest(".board-card");
  if (!card) return;
  const id = card.dataset.id;
  const m = state.meetings.find((x) => x.id === id);
  if (!m) return;
  if (t.dataset.move) { moveTo(id, t.dataset.move, t.dataset.confirm === "1"); return; }
  if (t.dataset.act === "edit") { openEditor(m); return; }
  if (t.dataset.act === "move" || t.dataset.act === "cal") {
    const kind = t.dataset.act;
    state.openMenu = state.openMenu && state.openMenu.id === id && state.openMenu.kind === kind ? null : { id, kind };
    render();
  }
}

export function initBoard(context) {
  const root = document.getElementById("board-root");
  if (!root || root.dataset.boardInit === "1") return;
  root.dataset.boardInit = "1";
  state.root = root;
  root.addEventListener("click", onClick);
  document.addEventListener("lepv:board:load", () => { load(); });
  // Se a aba já estiver ativa quando o módulo carregar (hash/reload), carrega.
  const panel = document.getElementById("panel-diretoria");
  if (panel && panel.classList.contains("active")) load();
}

// Auto-inicialização quando carregado direto pelo app.html; quando o main.js
// da modularização importar este módulo, initBoard é idempotente.
initBoard({});
```

- [ ] **Step 5: Verify**

Run: `node --check public/js/features/board.js && node scripts/check-inline-js.js && python scripts/check-css.py && node scripts/verify-board.js && node scripts/verify-app.js && node scripts/verify-tabs.js`
Expected: tudo `OK`/exit 0, `verify-board OK` com todas as linhas `ok`.

- [ ] **Step 6: Commit**

```bash
git add public/js/features/board.js public/app.html public/app.js public/sw.js scripts/verify-board.js
git commit -m "Aba Diretoria: quadro e calendário dos encontros como módulo ES"
```

---

### Task 5: Encadear a verificação e o CI

**Files:**
- Modify: `package.json` (`verify:board`, cadeia `verify`)
- Modify: `.github/workflows/ci.yml` (passo após "Tags do membro e logout")

- [ ] **Step 1: package.json**

Adicionar `"verify:board": "node scripts/verify-board.js"` e, na cadeia `verify`, `&& npm run verify:board` no fim.

- [ ] **Step 2: ci.yml**

Depois do passo `Tags do membro e logout`:

```yaml
      - name: Agenda da diretoria
        run: npm run verify:board
```

Atualizar o comentário de cabeçalho: "as sete verificações" → "as oito verificações", e "suíte e2e de 42 casos" → "47 casos".

- [ ] **Step 3: Verify**

Run: `npm run verify 2>&1 | tail -30`
Expected: exit 0, com `verify-board OK` no fim.

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "CI: verificação da aba Diretoria"
```

---

### Task 6: Regressão completa, revisão e entrega

- [ ] **Step 1:** `npm run verify` do zero (server de fixture no ar) e `git status --short` sem arquivo em `data/`.
- [ ] **Step 2:** `code-reviewer` sobre `git diff origin/main..HEAD`; corrigir o que for real.
- [ ] **Step 3:** `git push origin main` (autorizado pelo Marcell em 07/09/2026; publica em produção via Railway). Acompanhar `gh run watch` e `curl -sf https://lepv.org/health`.
- [ ] **Step 4:** Smoke em produção: logado como superadmin, `GET https://lepv.org/api/board/meetings` devolve `{ meetings: [], directors: [...] }`.
- [ ] **Step 5:** Nota de sessão no Obsidian e memória atualizada.
