# Centro de gastos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membros lançam gastos para ressarcimento (ou registro do que a diretoria já pagou) com nota/comprovante anexados por foto ou PDF; a diretoria aprova, recusa e marca pagamento num extrato consolidado.

**Architecture:** Store novo `reimbursements.json` no volume + arquivos em `STORAGE_DIR/reimbursements/`; rotas `/api/reimbursements*` atrás de `requireAuthApi`/`requireDirectorApi`; uploads em corpo cru com sniffing (padrão avatar/materiais). No cliente, aba "Gastos" no grupo `liga`, módulo ES `public/js/features/expenses.js` acionado por `CustomEvent`, seguindo `board.js`.

**Tech Stack:** Node.js 24, Express 4, JS ES modules nativos no browser, Playwright para verificação, CSS puro com tokens do tema.

**Spec:** `docs/superpowers/specs/2026-09-29-centro-gastos-design.md`

## Global Constraints

- Sem framework, bundler, transpiler ou dependência de produção nova.
- Nenhuma rota, payload, ID, classe ou `data-*` existente muda.
- Toda escrita em store passa por `writeStore`; leitura por `readStore`.
- Membro só enxerga os próprios lançamentos — na API retornam 404 (não 403) para não confirmar existência.
- Papel relido a cada request por `liveRole` — nunca confiar na flag da sessão.
- Datas em `America/Sao_Paulo` (offset fixo `-03:00`).
- `amountCents` inteiro — nunca float em dinheiro.
- Mobile first: alvos de toque ≥ 44 px em 390 px; formulário é o caminho principal.
- Toda interpolação de dado da API passa por `escapeHtml`/`escapeAttr`/`safeUrl`.
- Testes rodam contra volume temporário (`RAILWAY_VOLUME_MOUNT_PATH`); nunca gravam em `data/`.
- `test`/`verify` no `package.json` são a cadeia oficial — scripts novos entram nela, não no lugar dela.

---

## File structure

| Arquivo | Responsabilidade |
| --- | --- |
| `server.js` | store `expenses`, validação, rotas CRUD, transições de status, anexos. |
| `tests/e2e.js` | casos novos de API (criação, isolamento, ciclo, anexos, validação). |
| `public/js/features/expenses.js` | módulo ES da aba: resumo, formulário mobile, extrato, ações da diretoria. |
| `public/app.html` | painel `panel-gastos`, botão da aba no nav, CSS `.gx-*`, `<script type="module">`. |
| `public/app.js` | `loaders.gastos` disparando `lepv:expenses:load`. |
| `public/sw.js` | bump de `CACHE` para v12. |
| `scripts/verify-expenses.js` | verificação Playwright da aba (membro e diretor, 390px, toque). |
| `package.json` | `verify:expenses` no fim da cadeia `verify`. |
| `.github/workflows/ci.yml` | passo "Centro de gastos" após `verify:board`. |

---

### Task 1: Store + criação e listagem de gastos

**Files:**
- Modify: `server.js` — após o bloco `EVENT_PHOTOS_DIR` (~linha 280) os helpers; rotas novas antes de `app.get("/api/badges"...)` (~linha 2939).
- Modify: `tests/e2e.js` — credencial de diretor e de segundo membro em `setupVolume`; testes novos antes de `async function main()`.

**Interfaces:**
- Produces: `readReimbursements() -> { expenses: Reimbursement[] }`, `writeReimbursements(data)`, `todayBR() -> "YYYY-MM-DD"`, `validSpentAt(v) -> bool`, `REIMBURSEMENT_KINDS`, `REIMBURSEMENT_MAX_ATTACHMENTS = 5`.
- `Reimbursement = { id, memberOrder, description, amountCents, spentAt, kind, status, attachments, decidedBy, decidedAt, note, createdAt, updatedAt }`.
- API: `GET /api/reimbursements` e `POST /api/reimbursements`. Tasks 2–4 consomem o mesmo objeto.

- [ ] **Step 1: Write the failing tests**

Em `tests/e2e.js`, dentro de `setupVolume()` (depois do segundo `credentials` do array), adicionar credenciais de diretor e de segundo membro:

```js
          { order: 1, passwordHash: bcrypt.hashSync(ADMIN_PASS, 10) },
          { order: MEMBER_ORDER, passwordHash: bcrypt.hashSync(MEMBER_PASS, 10) },
          // Centro de gastos: diretor que não é superadmin (order 4) e membro
          // comum B (order 6) para provar isolamento e o papel de diretoria.
          { order: 4, passwordHash: bcrypt.hashSync(DIRECTOR_PASS, 10) },
          { order: 6, passwordHash: bcrypt.hashSync(MEMBER2_PASS, 10) },
```

E as constantes junto das demais no topo:

```js
const DIRECTOR_PASS = "teste-diretor";
const MEMBER2_PASS = "teste-membro2";
```

Testes novos (antes de `async function main()`):

```js
// ---- Centro de gastos ----

test("membro cria gasto de ressarcimento e lista só os seus", async () => {
  const a = client();
  eq((await a.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login membro A");
  const c = await a.post("/api/reimbursements", {
    description: "Uber até a gráfica — banner",
    amountCents: 3450,
    spentAt: "2026-09-27",
    kind: "reimbursement",
  });
  eq(c.status, 200, "criar gasto");
  eq(c.data.expense.status, "pendente", "ressarcimento nasce pendente");
  eq(c.data.expense.memberOrder, MEMBER_ORDER, "dono é quem lançou");

  const b = client();
  eq((await b.login(6, MEMBER2_PASS)).status, 200, "login membro B");
  await b.post("/api/reimbursements", { description: "Café da reunião", amountCents: 1200, spentAt: "2026-09-27" });

  const la = await a.get("/api/reimbursements");
  eq(la.data.expenses.length, 1, "membro A vê só o próprio");
  eq(la.data.expenses[0].description, "Uber até a gráfica — banner");
  const lb = await b.get("/api/reimbursements");
  eq(lb.data.expenses.length, 1, "membro B vê só o próprio");
  assert(lb.data.expenses[0].id !== c.data.expense.id, "B não recebe gasto de A");
});

test("checkbox 'a diretoria já pagou' nasce pago", async () => {
  const c = client();
  eq((await c.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login");
  const r = await c.post("/api/reimbursements", {
    description: "Passagem comprada pela diretoria",
    amountCents: 80000,
    spentAt: "2026-09-27",
    kind: "paid_by_board",
  });
  eq(r.data.expense.status, "pago", "paid_by_board nasce pago");
  eq(r.data.expense.kind, "paid_by_board");
});

test("diretor vê o extrato consolidado com filtros", async () => {
  const d = client();
  eq((await d.login(4, DIRECTOR_PASS)).status, 200, "login diretor");
  const all = await d.get("/api/reimbursements");
  assert(all.data.expenses.length >= 3, "diretor vê lançamentos de todos");
  const pend = await d.get("/api/reimbursements?status=pendente");
  assert(pend.data.expenses.every((e) => e.status === "pendente"), "filtro por status");
  const byMember = await d.get("/api/reimbursements?member=" + MEMBER_ORDER);
  assert(byMember.data.expenses.every((e) => e.memberOrder === MEMBER_ORDER), "filtro por membro");
});

test("validação: valor, data e descrição ruins são recusados", async () => {
  const c = client();
  eq((await c.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login");
  const base = { description: "Gasto válido", amountCents: 100, spentAt: "2026-09-27" };
  for (const [field, bad] of [
    ["amountCents", 12.34], ["amountCents", 0], ["amountCents", -50],
    ["spentAt", "2999-01-01"], ["spentAt", "27/09/2026"],
    ["description", "ab"], ["description", "x".repeat(161)],
  ]) {
    const r = await c.post("/api/reimbursements", { ...base, [field]: bad });
    eq(r.status, 400, field + "=" + JSON.stringify(bad) + " devia dar 400, veio " + r.status);
  }
});

test("gastos exigem sessão", async () => {
  const r = await client().get("/api/reimbursements");
  eq(r.status, 401, "anônimo recebe 401");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/e2e.js`
Expected: FAIL nos 5 testes novos — `/api/reimbursements` ainda não existe (404/401 conforme o caso).

- [ ] **Step 3: Implement**

Em `server.js`, depois do bloco `EVENT_PHOTOS_DIR` (~linha 280), antes das constantes de sessão:

```js
// Centro de gastos — lançamentos de ressarcimento dos membros e registro do
// que a diretoria já pagou. Metadado no volume, anexos (nota e comprovante)
// em diretório próprio, como materials/ e event-photos/.
const EXPENSES_PATH = path.join(STORAGE_DIR, "reimbursements.json");
const REIMBURSEMENT_FILES_DIR = path.join(STORAGE_DIR, "expenses");
fs.mkdirSync(REIMBURSEMENT_FILES_DIR, { recursive: true });
const REIMBURSEMENT_MAX_ATTACHMENTS = 5;
const REIMBURSEMENT_KINDS = ["reimbursement", "paid_by_board"];
if (!fs.existsSync(EXPENSES_PATH)) writeStore(EXPENSES_PATH, { expenses: [] });
function readReimbursements() {
  return readStore(EXPENSES_PATH);
}
function writeReimbursements(data) {
  writeStore(EXPENSES_PATH, data);
}
// "Hoje" no fuso do Brasil — um gasto de amanhã não é válido nem quando o
// servidor roda em UTC.
function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function validSpentAt(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T12:00:00Z");
  if (isNaN(d) || d.toISOString().slice(0, 10) !== v) return false; // 2026-02-31
  return v <= todayBR();
}
function isDirectorRole(user) {
  return user.director === true || user.superadmin === true;
}
```

Rotas novas, antes de `app.get("/api/badges", ...)`:

```js
// ---- Centro de gastos ----
// Membro vê e mexe só nos próprios lançamentos; a diretoria vê e age em todos.
// Para quem não é dono nem diretor a resposta é 404 — nem a existência do
// lançamento vaza.
function findReimbursement(data, id) {
  return data.expenses.find((e) => e.id === id);
}
function canSeeReimbursement(exp, user) {
  return exp.memberOrder === user.order || isDirectorRole(user);
}

app.get("/api/reimbursements", requireAuthApi, (req, res) => {
  const all = readReimbursements().expenses;
  let list = isDirectorRole(req.session.user)
    ? all
    : all.filter((e) => e.memberOrder === req.session.user.order);
  if (isDirectorRole(req.session.user)) {
    if (req.query.status) list = list.filter((e) => e.status === String(req.query.status));
    if (req.query.member) list = list.filter((e) => e.memberOrder === parseInt(req.query.member, 10));
  }
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ expenses: list });
});

app.post("/api/reimbursements", requireAuthApi, (req, res) => {
  const b = req.body || {};
  const description = String(b.description || "").trim();
  const amountCents = Number(b.amountCents);
  const spentAt = String(b.spentAt || "");
  const kind = b.kind === "paid_by_board" ? "paid_by_board" : "reimbursement";
  if (description.length < 3 || description.length > 160) {
    return res.status(400).json({ error: "invalid_description", message: "Descreva o gasto em 3 a 160 caracteres." });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 9999999) {
    return res.status(400).json({ error: "invalid_amount", message: "Valor inválido." });
  }
  if (!validSpentAt(spentAt)) {
    return res.status(400).json({ error: "invalid_date", message: "Data inválida ou futura." });
  }
  const data = readReimbursements();
  const now = new Date().toISOString();
  const expense = {
    id: "gx" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    memberOrder: req.session.user.order,
    description,
    amountCents,
    spentAt,
    kind,
    // Registro do que a diretoria já pagou nasce pago — é fato, não pedido.
    status: kind === "paid_by_board" ? "pago" : "pendente",
    attachments: [],
    decidedBy: null,
    decidedAt: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  };
  data.expenses.push(expense);
  writeReimbursements(data);
  res.json({ expense });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/e2e.js`
Expected: os 5 testes novos PASS; suíte inteira sem regressão.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "feat(gastos): store e rotas de criacao e listagem do centro de gastos"
```

---

### Task 2: Ciclo de vida — edição, exclusão e decisão da diretoria

**Files:**
- Modify: `server.js` — rotas `PATCH`/`DELETE /api/reimbursements/:id` e `POST /api/reimbursements/:id/status`, logo depois do `POST /api/reimbursements`.
- Modify: `tests/e2e.js` — testes novos.

**Interfaces:**
- Consumes: `readReimbursements`, `writeReimbursements`, `findReimbursement`, `canSeeReimbursement`, `isDirectorRole`, validações da Task 1.
- Produces: `REIMBURSEMENT_TRANSITIONS` (mapa status→permitidos) usado pelo front para esconder ações impossíveis.

- [ ] **Step 1: Write the failing tests**

```js
test("ciclo: pendente → aprovado → pago; dono não edita depois da decisão", async () => {
  const m = client();
  eq((await m.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login membro");
  const c = await m.post("/api/reimbursements", { description: "Impressão de crachás", amountCents: 22000, spentAt: "2026-09-27" });
  const id = c.data.expense.id;

  // enquanto pendente, o dono edita
  const ed = await m.patch("/api/reimbursements/" + id, { description: "Impressão de crachás e cordões" });
  eq(ed.status, 200, "dono edita pendente");
  eq(ed.data.expense.description, "Impressão de crachás e cordões");

  const d = client();
  eq((await d.login(4, DIRECTOR_PASS)).status, 200, "login diretor");
  eq((await d.post("/api/reimbursements/" + id + "/status", { status: "aprovado" })).status, 200, "aprova");

  // decidido: o dono não edita nem exclui mais
  eq((await m.patch("/api/reimbursements/" + id, { description: "tenta mudar" })).status, 409, "edição travada");
  eq((await m.del("/api/reimbursements/" + id)).status, 409, "exclusão travada");

  eq((await d.post("/api/reimbursements/" + id + "/status", { status: "pago" })).status, 200, "marca pago");
  const fim = await d.get("/api/reimbursements?status=pago");
  assert(fim.data.expenses.some((e) => e.id === id && e.decidedBy === 4), "pago com decidedBy do diretor");
});

test("recusa exige motivo e pendente pode ser excluído pelo dono", async () => {
  const m = client();
  eq((await m.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login membro");
  const c = await m.post("/api/reimbursements", { description: "Táxi ao aeroporto", amountCents: 9000, spentAt: "2026-09-27" });
  const id = c.data.expense.id;

  const d = client();
  eq((await d.login(4, DIRECTOR_PASS)).status, 200, "login diretor");
  eq((await d.post("/api/reimbursements/" + id + "/status", { status: "recusado" })).status, 400, "recusa sem motivo");
  eq((await d.post("/api/reimbursements/" + id + "/status", { status: "recusado", note: "Sem nota fiscal" })).status, 200, "recusa com motivo");
  eq((await d.post("/api/reimbursements/" + id + "/status", { status: "pago" })).status, 409, "recusado não vira pago direto");

  const c2 = await m.post("/api/reimbursements", { description: "Lanche da visita", amountCents: 1500, spentAt: "2026-09-27" });
  eq((await m.del("/api/reimbursements/" + c2.data.expense.id)).status, 200, "dono exclui pendente");
});

test("membro não decide nem enxerga gasto de outro", async () => {
  const a = client(); const b = client();
  eq((await a.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login A");
  eq((await b.login(6, MEMBER2_PASS)).status, 200, "login B");
  const c = await a.post("/api/reimbursements", { description: "Gasto do A", amountCents: 500, spentAt: "2026-09-27" });
  const id = c.data.expense.id;
  eq((await b.patch("/api/reimbursements/" + id, { description: "invasão" })).status, 404, "editar alheio → 404");
  eq((await b.del("/api/reimbursements/" + id)).status, 404, "excluir alheio → 404");
  eq((await b.post("/api/reimbursements/" + id + "/status", { status: "aprovado" })).status, 403, "decidir não é de membro");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/e2e.js`
Expected: FAIL — rotas `PATCH`/`DELETE`/`status` ainda não existem.

- [ ] **Step 3: Implement**

Depois do `POST /api/reimbursements`, em `server.js`:

```js
// Transições do ciclo de vida; o cliente usa o mesmo mapa para esconder ações.
const REIMBURSEMENT_TRANSITIONS = {
  pendente: ["aprovado", "recusado"],
  aprovado: ["pago", "pendente"],
};

function reimbursementEditableBy(exp, user) {
  // Dono mexe só enquanto pendente; depois da decisão, só a diretoria.
  return isDirectorRole(user) || (exp.memberOrder === user.order && exp.status === "pendente");
}

app.patch("/api/reimbursements/:id", requireAuthApi, (req, res) => {
  const data = readReimbursements();
  const exp = findReimbursement(data, req.params.id);
  if (!exp || !canSeeReimbursement(exp, req.session.user)) return res.status(404).json({ error: "not_found" });
  if (!reimbursementEditableBy(exp, req.session.user)) {
    return res.status(409).json({ error: "locked", message: "Esse lançamento já foi decidido pela diretoria." });
  }
  const b = req.body || {};
  if (b.description !== undefined) {
    const v = String(b.description).trim();
    if (v.length < 3 || v.length > 160) return res.status(400).json({ error: "invalid_description" });
    exp.description = v;
  }
  if (b.amountCents !== undefined) {
    const v = Number(b.amountCents);
    if (!Number.isInteger(v) || v <= 0 || v > 9999999) return res.status(400).json({ error: "invalid_amount" });
    exp.amountCents = v;
  }
  if (b.spentAt !== undefined) {
    if (!validSpentAt(b.spentAt)) return res.status(400).json({ error: "invalid_date" });
    exp.spentAt = String(b.spentAt);
  }
  exp.updatedAt = new Date().toISOString();
  writeReimbursements(data);
  res.json({ expense: exp });
});

app.delete("/api/reimbursements/:id", requireAuthApi, (req, res) => {
  const data = readReimbursements();
  const i = data.expenses.findIndex((e) => e.id === req.params.id);
  if (i < 0 || !canSeeReimbursement(data.expenses[i], req.session.user)) return res.status(404).json({ error: "not_found" });
  const exp = data.expenses[i];
  if (!reimbursementEditableBy(exp, req.session.user)) {
    return res.status(409).json({ error: "locked", message: "Esse lançamento já foi decidido pela diretoria." });
  }
  for (const att of exp.attachments) {
    fs.rmSync(path.join(REIMBURSEMENT_FILES_DIR, att.file), { force: true });
  }
  data.expenses.splice(i, 1);
  writeReimbursements(data);
  res.json({ ok: true });
});

// Decisão da diretoria: aprova, recusa (motivo obrigatório) ou marca pago.
// decidedBy/decidedAt registram quem e quando, a cada decisão.
app.post("/api/reimbursements/:id/status", requireDirectorApi, (req, res) => {
  const data = readReimbursements();
  const exp = findReimbursement(data, req.params.id);
  if (!exp) return res.status(404).json({ error: "not_found" });
  const next = String(req.body?.status || "");
  if (!(REIMBURSEMENT_TRANSITIONS[exp.status] || []).includes(next)) {
    return res.status(409).json({ error: "invalid_transition", message: "Transição não permitida." });
  }
  const note = String(req.body?.note || "").trim().slice(0, 280) || null;
  if (next === "recusado" && !note) {
    return res.status(400).json({ error: "note_required", message: "Recusa precisa de motivo." });
  }
  exp.status = next;
  exp.note = note;
  exp.decidedBy = req.session.user.order;
  exp.decidedAt = new Date().toISOString();
  exp.updatedAt = exp.decidedAt;
  writeReimbursements(data);
  res.json({ expense: exp });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/e2e.js`
Expected: os 3 testes novos PASS; suíte sem regressão.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "feat(gastos): ciclo de vida com aprovacao, recusa motivada e trava do dono"
```

---

### Task 3: Anexos — nota fiscal e comprovante (imagem ou PDF)

**Files:**
- Modify: `server.js` — `POST`/`GET`/`DELETE /api/reimbursements/:id/attachments*`.
- Modify: `tests/e2e.js` — testes novos.

**Interfaces:**
- Consumes: `REIMBURSEMENT_FILES_DIR`, `REIMBURSEMENT_MAX_ATTACHMENTS`, `findReimbursement`, `canSeeReimbursement`, `reimbursementEditableBy`, `sniffImage` (já existe, ~linha 253).
- Produces: `attachments[] = { id, type: "image"|"pdf", file, name, size }` — o front monta links `/api/reimbursements/:id/attachments/:att`.

- [ ] **Step 1: Write the failing tests**

`PDF_1PG` (fixture mínimo junto de `PNG_1PX`):

```js
const PDF_1PG = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);
```

```js
test("anexos: imagem e PDF entram, download só para dono e diretor", async () => {
  const m = client();
  eq((await m.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login membro");
  const c = await m.post("/api/reimbursements", { description: "Fotocópias do edital", amountCents: 4000, spentAt: "2026-09-27" });
  const id = c.data.expense.id;

  const up = await m.post("/api/reimbursements/" + id + "/attachments?name=nota.png", PNG_1PX, { "Content-Type": "image/png" });
  eq(up.status, 200, "upload imagem");
  eq(up.data.expense.attachments[0].type, "image");
  const upPdf = await m.post("/api/reimbursements/" + id + "/attachments?name=nfe.pdf", PDF_1PG, { "Content-Type": "application/pdf" });
  eq(upPdf.status, 200, "upload pdf");
  eq(upPdf.data.expense.attachments.length, 2);

  const att = up.data.expense.attachments[0];
  const img = await m.get("/api/reimbursements/" + id + "/attachments/" + att.id);
  eq(img.status, 200, "dono baixa o próprio anexo");
  assert((img.headers.get("content-type") || "").startsWith("image/"), "content-type de imagem");

  const b = client();
  eq((await b.login(6, MEMBER2_PASS)).status, 200, "login membro B");
  eq((await b.get("/api/reimbursements/" + id + "/attachments/" + att.id)).status, 404, "membro B não baixa anexo alheio");

  const d = client();
  eq((await d.login(4, DIRECTOR_PASS)).status, 200, "login diretor");
  eq((await d.get("/api/reimbursements/" + id + "/attachments/" + att.id)).status, 200, "diretor baixa");
});

test("anexos: limite de 5, lixo recusado e trava após decisão", async () => {
  const m = client();
  eq((await m.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login membro");
  const c = await m.post("/api/reimbursements", { description: "Material do estande", amountCents: 900, spentAt: "2026-09-27" });
  const id = c.data.expense.id;

  const lixo = await m.post("/api/reimbursements/" + id + "/attachments", Buffer.from("isso não é imagem"), { "Content-Type": "image/png" });
  eq(lixo.status, 400, "magic bytes errados → 400");

  for (let i = 0; i < 5; i++) {
    eq((await m.post("/api/reimbursements/" + id + "/attachments", PNG_1PX, { "Content-Type": "image/png" })).status, 200, "anexo " + (i + 1));
  }
  eq((await m.post("/api/reimbursements/" + id + "/attachments", PNG_1PX, { "Content-Type": "image/png" })).status, 400, "6º anexo → 400");

  const d = client();
  eq((await d.login(4, DIRECTOR_PASS)).status, 200, "login diretor");
  await d.post("/api/reimbursements/" + id + "/status", { status: "aprovado" });
  eq((await m.post("/api/reimbursements/" + id + "/attachments", PNG_1PX, { "Content-Type": "image/png" })).status, 409, "dono travado após decisão");
  eq((await d.post("/api/reimbursements/" + id + "/attachments", PNG_1PX, { "Content-Type": "image/png" })).status, 200, "diretor ainda anexa");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/e2e.js`
Expected: FAIL — rotas de anexo ainda não existem.

- [ ] **Step 3: Implement**

Depois do `POST /api/reimbursements/:id/status`:

```js
// Anexos do lançamento: nota fiscal ou comprovante, foto (JPG/PNG/WebP) ou
// PDF (NF-e). Corpo cru com sniffing — o Content-Type do cliente não prova
// nada, como no upload de avatar e de materiais.
app.post(
  "/api/reimbursements/:id/attachments",
  requireAuthApi,
  express.raw({ type: ["image/*", "application/pdf", "application/octet-stream"], limit: "25mb" }),
  (req, res) => {
    const data = readReimbursements();
    const exp = findReimbursement(data, req.params.id);
    if (!exp || !canSeeReimbursement(exp, req.session.user)) return res.status(404).json({ error: "not_found" });
    if (!reimbursementEditableBy(exp, req.session.user)) {
      return res.status(409).json({ error: "locked", message: "Esse lançamento já foi decidido pela diretoria." });
    }
    if (exp.attachments.length >= REIMBURSEMENT_MAX_ATTACHMENTS) {
      return res.status(400).json({ error: "too_many_attachments", message: "Máximo de " + REIMBURSEMENT_MAX_ATTACHMENTS + " anexos por gasto." });
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: "empty_file" });
    }
    const isPdf = req.body.subarray(0, 5).toString("latin1") === "%PDF-";
    const imgExt = isPdf ? null : sniffImage(req.body);
    if (!isPdf && !imgExt) {
      return res.status(400).json({ error: "invalid_file", message: "Envie uma foto (JPG, PNG, WebP) ou um PDF." });
    }
    // O raw aceita até 25 MB porque NF-e vem em PDF; foto segue o teto de 6 MB
    // dos demais uploads de imagem do app.
    if (!isPdf && req.body.length > 6 * 1024 * 1024) {
      return res.status(413).json({ error: "image_too_large", message: "Foto acima de 6 MB — tire outra ou comprima." });
    }
    const attId = "ga" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const ext = isPdf ? "pdf" : imgExt;
    const file = exp.id + "-" + attId + "." + ext;
    fs.writeFileSync(path.join(REIMBURSEMENT_FILES_DIR, file), req.body);
    exp.attachments.push({
      id: attId,
      type: isPdf ? "pdf" : "image",
      file,
      name: String(req.query.name || "anexo").replace(/[^\w.\- ]/g, "").trim().slice(0, 80) || "anexo",
      size: req.body.length,
    });
    exp.updatedAt = new Date().toISOString();
    writeReimbursements(data);
    res.json({ expense: exp });
  }
);

// Anexo não é público: só o dono e a diretoria abrem.
app.get("/api/reimbursements/:id/attachments/:att", requireAuthApi, (req, res) => {
  const exp = findReimbursement(readReimbursements(), req.params.id);
  const att = exp && exp.attachments.find((a) => a.id === req.params.att);
  if (!exp || !att || !canSeeReimbursement(exp, req.session.user)) return res.status(404).end();
  const file = path.join(REIMBURSEMENT_FILES_DIR, att.file);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set("Cache-Control", "private, no-store");
  // res.type resolve a extensão para o MIME correto (jpg → image/jpeg).
  res.type(att.type === "pdf" ? "application/pdf" : path.extname(att.file).slice(1));
  res.sendFile(file);
});

app.delete("/api/reimbursements/:id/attachments/:att", requireAuthApi, (req, res) => {
  const data = readReimbursements();
  const exp = findReimbursement(data, req.params.id);
  if (!exp || !canSeeReimbursement(exp, req.session.user)) return res.status(404).json({ error: "not_found" });
  if (!reimbursementEditableBy(exp, req.session.user)) {
    return res.status(409).json({ error: "locked" });
  }
  const i = exp.attachments.findIndex((a) => a.id === req.params.att);
  if (i < 0) return res.status(404).json({ error: "not_found" });
  fs.rmSync(path.join(REIMBURSEMENT_FILES_DIR, exp.attachments[i].file), { force: true });
  exp.attachments.splice(i, 1);
  exp.updatedAt = new Date().toISOString();
  writeReimbursements(data);
  res.json({ expense: exp });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/e2e.js`
Expected: os 2 testes novos PASS; suíte sem regressão.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "feat(gastos): anexos de nota e comprovante — imagem ou PDF, ate 5, privados"
```

---

### Task 4: Aba "Gastos" no app (mobile first)

**Files:**
- Create: `public/js/features/expenses.js`
- Modify: `public/app.html` — botão da aba no nav, painel `panel-gastos`, CSS `.gx-*`, `<script type="module">`.
- Modify: `public/app.js` — `loaders.gastos`.
- Modify: `public/sw.js` — bump de CACHE.

**Interfaces:**
- Consumes: API das Tasks 1–3; `/api/me` (`{ order, director, superadmin, ... }`); padrão do `board.js` (`api()`, `escapeHtml`, `todayISO` por `America/Sao_Paulo`).
- Produces: `#expenses-root` renderizado dentro de `#panel-gastos`; listener de `lepv:expenses:load`.

- [ ] **Step 1: Aba e painel em `app.html`**

No `nav.tabs`, depois do botão `tab-membros`, botão visível para todo membro (grupo `liga`):

```html
  <button data-tab="gastos" data-group="liga" role="tab" id="tab-gastos" aria-controls="panel-gastos" aria-selected="false" tabindex="-1">Gastos</button>
```

E o painel, depois de `panel-membros`:

```html
    <!-- Centro de gastos: lançamentos de ressarcimento e registro do que a
         diretoria já pagou. Módulo ES /js/features/expenses.js. -->
    <section class="panel" id="panel-gastos" role="tabpanel" aria-labelledby="tab-gastos" tabindex="0">
      <div id="expenses-root">
        <div class="card rv"><p class="empty-state">Carregando...</p></div>
      </div>
    </section>
```

`<script type="module" src="/js/features/expenses.js"></script>` ao lado do de `board.js`.

- [ ] **Step 2: Loader em `app.js`**

No objeto `loaders` (~linha 3520):

```js
    gastos: function () { document.dispatchEvent(new CustomEvent("lepv:expenses:load")); },
```

- [ ] **Step 3: CSS `.gx-*` em `app.html`**

Junto do bloco `.board-*` (~linha 1233), só tokens do tema; alvos ≥ 44 px:

```css
  .gx-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 14px; }
  .gx-sum { border: 1px solid var(--line-2); border-radius: 6px; padding: 10px; text-align: center; }
  .gx-sum b { display: block; font-size: 17px; }
  .gx-sum span { font-size: 11.5px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .04em; }
  .gx-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px; }
  .gx-toolbar .spacer { flex: 1; }
  .gx-toolbar button, .gx-card button, .gx-form button, .gx-filters button {
    min-height: 44px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 6px;
    background: var(--card); color: var(--ink); font: inherit; font-size: 14px; cursor: pointer; }
  .gx-toolbar button.primary, .gx-form button.primary { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .gx-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .gx-filters button[aria-pressed="true"] { background: var(--ink); color: var(--card); }
  .gx-card { border: 1px solid var(--line-2); border-radius: 8px; padding: 12px; margin: 0 0 10px; background: var(--card); }
  .gx-head { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; }
  .gx-head b { font-size: 15px; }
  .gx-money { font-weight: 700; white-space: nowrap; }
  .gx-meta { font-size: 12.5px; color: var(--ink-3); margin: 4px 0 0; }
  .gx-badge { display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
              border: 1px solid var(--line-2); border-radius: 99px; padding: 2px 8px; }
  .gx-badge.pendente { color: var(--pending); border-color: var(--pending); }
  .gx-badge.aprovado { color: var(--good); border-color: var(--good); }
  .gx-badge.pago { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .gx-badge.recusado { color: var(--danger); border-color: var(--danger-line); }
  .gx-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .gx-atts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .gx-atts a { font-size: 13px; min-height: 44px; display: inline-flex; align-items: center; }
  .gx-form { border: 1px solid var(--line-2); border-radius: 8px; padding: 14px; margin: 0 0 14px; background: var(--card); }
  .gx-form label { display: block; font-size: 13px; font-weight: 600; margin: 0 0 4px; }
  .gx-form input[type="text"], .gx-form input[type="date"], .gx-form select {
    width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--line-2); border-radius: 6px;
    font: inherit; font-size: 16px; background: var(--card); color: var(--ink); box-sizing: border-box; margin: 0 0 12px; }
  .gx-form .gx-check { display: flex; gap: 10px; align-items: center; min-height: 44px; margin: 0 0 12px; }
  .gx-form .gx-check input { width: 22px; height: 22px; }
  .gx-form .gx-check label { margin: 0; font-weight: 500; }
  .gx-note { font-size: 12.5px; color: var(--ink-3); margin: 6px 0 0; }
  .gx-note.warn { color: var(--danger); }
```

- [ ] **Step 4: Módulo `public/js/features/expenses.js`**

```js
// Centro de gastos — lançamentos de ressarcimento dos membros e registro do
// que a diretoria já pagou. Segundo módulo ES do app (depois de board.js):
// o app.js põe a aba no nav e dispara "lepv:expenses:load" quando ela ativa.
// Visibilidade é privada: a API devolve só os lançamentos do membro, e o
// extrato consolidado só existe para quem tem papel de diretoria.

import { escapeHtml, escapeAttr } from "./board.js";

const STATUS_LABEL = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  pago: "Pago",
};
const TRANSITIONS = { pendente: ["aprovado", "recusado"], aprovado: ["pago", "pendente"] };
const ACT_LABEL = { aprovado: "Aprovar", recusado: "Recusar", pago: "Marcar pago", pendente: "Reabrir" };

let me = null;
let expenses = [];
let members = [];
let loaded = false;
let filterStatus = "";
let filterMember = "";
let formOpen = false;
let editingId = null;
let busy = false;

async function api(path, options) {
  const r = await fetch(path, Object.assign({ headers: {} }, options));
  if (r.status === 401) { window.location.href = "/login.html"; throw new Error("not authenticated"); }
  let body = {};
  try { body = await r.json(); } catch (e) { body = {}; }
  if (!r.ok) {
    const err = new Error(body.message || body.error || "request failed");
    err.status = r.status; err.body = body;
    throw err;
  }
  return body;
}

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function fmtMoney(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
}
// Aceita "1.234,56" (BR) e "1234.56" (colado com ponto). Com vírgula, ponto é
// milhar; sem vírgula, um ponto é decimal e dois pontos são ambiguidade → null.
function parseAmount(text) {
  const t = String(text || "").trim();
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(parseFloat(norm) * 100);
}
function memberName(order) {
  const m = members.find((x) => x.order === order);
  return m ? m.name : "Membro " + order;
}
const isDirector = () => me && (me.director || me.superadmin);

// ---- fetch ----
async function refresh() {
  const q = new URLSearchParams();
  if (filterStatus) q.set("status", filterStatus);
  if (filterMember) q.set("member", filterMember);
  const qs = q.toString();
  const data = await api("/api/reimbursements" + (qs ? "?" + qs : ""));
  expenses = data.expenses || [];
}

// ---- render ----
function render() {
  const root = document.getElementById("expenses-root");
  if (!root) return;
  const sums = { pendente: 0, aprovado: 0, pago: 0 };
  for (const e of expenses) if (e.status in sums) sums[e.status] += e.amountCents;
  let h = "";
  h += '<div class="gx-summary">';
  for (const k of ["pendente", "aprovado", "pago"]) {
    h += '<div class="gx-sum"><b>' + fmtMoney(sums[k]) + "</b><span>" + STATUS_LABEL[k] + "</span></div>";
  }
  h += "</div>";
  h += '<div class="gx-toolbar"><button class="primary" id="gx-new">' +
    (formOpen ? "Fechar" : "Novo gasto") + "</button>";
  if (isDirector()) {
    h += '<span class="spacer"></span><select id="gx-member" aria-label="Filtrar por membro" style="min-height:44px;font:inherit;font-size:14px;">' +
      '<option value="">Todos os membros</option>' +
      members.map((m) => '<option value="' + m.order + '"' + (String(m.order) === filterMember ? " selected" : "") + ">" + escapeHtml(m.name) + "</option>").join("") +
      "</select>";
  }
  h += "</div>";
  if (isDirector()) {
    h += '<div class="gx-filters">';
    for (const s of ["", "pendente", "aprovado", "pago", "recusado"]) {
      h += '<button data-f="' + s + '" aria-pressed="' + (filterStatus === s) + '">' + (s ? STATUS_LABEL[s] : "Todos") + "</button>";
    }
    h += "</div>";
  }
  if (formOpen) h += renderForm();
  if (!expenses.length) {
    h += '<div class="card"><p class="empty-state">Nenhum gasto lançado ainda. Toque em "Novo gasto" para registrar o primeiro.</p></div>';
  }
  for (const e of expenses) h += renderCard(e);
  root.innerHTML = h;
  bind(root);
}

function renderForm() {
  const edit = editingId ? expenses.find((e) => e.id === editingId) : null;
  let h = '<div class="gx-form" id="gx-form">';
  h += '<label for="gx-desc">Descrição</label>' +
    '<input type="text" id="gx-desc" maxlength="160" placeholder="Ex.: Uber até a gráfica — banner" value="' +
    escapeAttr(edit ? edit.description : "") + '">';
  h += '<label for="gx-amount">Valor (R$)</label>' +
    '<input type="text" id="gx-amount" inputmode="decimal" placeholder="0,00" value="' +
    (edit ? escapeAttr((edit.amountCents / 100).toFixed(2).replace(".", ",")) : "") + '">';
  h += '<label for="gx-spent">Data do gasto</label>' +
    '<input type="date" id="gx-spent" max="' + todayISO() + '" value="' + (edit ? edit.spentAt : todayISO()) + '">';
  if (!edit) {
    h += '<div class="gx-check"><input type="checkbox" id="gx-paid">' +
      '<label for="gx-paid">A diretoria já pagou este gasto</label></div>';
    h += '<label for="gx-files">Nota fiscal / comprovantes (foto ou PDF, até 5)</label>' +
      '<input type="file" id="gx-files" accept="image/*,application/pdf" capture="environment" multiple ' +
      'style="min-height:44px;font:inherit;font-size:14px;margin:0 0 12px;">';
  }
  h += '<button class="primary" id="gx-save">' + (edit ? "Salvar" : "Lançar gasto") + "</button>";
  h += '<p class="gx-note" id="gx-msg"></p>';
  h += "</div>";
  return h;
}

function renderCard(e) {
  const own = e.memberOrder === me.order;
  const canEdit = isDirector() || (own && e.status === "pendente");
  let h = '<div class="gx-card" data-id="' + e.id + '">';
  h += '<div class="gx-head"><b>' + escapeHtml(e.description) + '</b><span class="gx-money">' + fmtMoney(e.amountCents) + "</span></div>";
  h += '<p class="gx-meta">' + fmtDate(e.spentAt) +
    (e.kind === "paid_by_board" ? " · pago pela diretoria" : " · ressarcimento") +
    (isDirector() ? " · " + escapeHtml(memberName(e.memberOrder)) : "") + "</p>";
  h += '<p class="gx-meta"><span class="gx-badge ' + e.status + '">' + STATUS_LABEL[e.status] + "</span>";
  if (e.note) h += ' — ' + escapeHtml(e.note);
  h += "</p>";
  if (e.attachments && e.attachments.length) {
    h += '<div class="gx-atts">';
    for (const a of e.attachments) {
      h += '<a href="/api/reimbursements/' + e.id + "/attachments/" + a.id + '" target="_blank" rel="noopener">' +
        (a.type === "pdf" ? "PDF · " : "Foto · ") + escapeHtml(a.name) + "</a>";
    }
    h += "</div>";
  }
  h += '<div class="gx-actions">';
  if (canEdit) h += '<button data-act="edit">Editar</button><button data-act="del">Excluir</button>';
  if (isDirector()) {
    for (const t of TRANSITIONS[e.status] || []) {
      h += '<button data-act="' + t + '"' + (t === "pago" ? ' class="primary"' : "") + ">" + ACT_LABEL[t] + "</button>";
    }
  }
  h += "</div></div>";
  return h;
}

// ---- eventos ----
function bind(root) {
  const q = (s) => root.querySelector(s);
  const newBtn = q("#gx-new");
  if (newBtn) newBtn.addEventListener("click", () => { formOpen = !formOpen; editingId = null; render(); });
  const memberSel = q("#gx-member");
  if (memberSel) memberSel.addEventListener("change", () => { filterMember = memberSel.value; refresh().then(render); });
  root.querySelectorAll(".gx-filters button").forEach((b) =>
    b.addEventListener("click", () => { filterStatus = b.dataset.f; refresh().then(render); }));

  const save = q("#gx-save");
  if (save) save.addEventListener("click", async () => {
    if (busy) return;
    const msg = q("#gx-msg");
    const description = q("#gx-desc").value;
    const amountCents = parseAmount(q("#gx-amount").value);
    const spentAt = q("#gx-spent").value;
    if (String(description).trim().length < 3) { msg.textContent = "Descreva o gasto."; return; }
    if (amountCents === null || amountCents <= 0) { msg.textContent = "Valor inválido — use vírgula: 12,50."; return; }
    if (!spentAt) { msg.textContent = "Informe a data do gasto."; return; }
    busy = true; save.disabled = true;
    try {
      let id = editingId;
      if (editingId) {
        await api("/api/reimbursements/" + editingId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, amountCents, spentAt }),
        });
      } else {
        const paid = q("#gx-paid").checked;
        const created = await api("/api/reimbursements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, amountCents, spentAt, kind: paid ? "paid_by_board" : "reimbursement" }),
        });
        id = created.expense.id;
        // Anexos sobem depois do lançamento existir — um POST por arquivo,
        // corpo cru, como o upload de avatar.
        const files = q("#gx-files").files;
        for (const f of files) {
          const up = await fetch("/api/reimbursements/" + id + "/attachments?name=" + encodeURIComponent(f.name), {
            method: "POST",
            headers: { "Content-Type": f.type || "application/octet-stream" },
            body: f,
          });
          if (!up.ok) { msg.textContent = "Lançado, mas um anexo não subiu (" + f.name + ")."; }
        }
      }
      formOpen = false; editingId = null;
      await refresh(); render();
    } catch (err) {
      msg.textContent = err.message || "Não foi possível salvar.";
      msg.className = "gx-note warn";
    } finally {
      busy = false; save.disabled = false;
    }
  });

  root.querySelectorAll(".gx-card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelectorAll("button[data-act]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (act === "edit") { editingId = id; formOpen = true; render(); window.scrollTo(0, 0); return; }
        if (act === "del") {
          if (!confirm("Excluir este lançamento?")) return;
          try { await api("/api/reimbursements/" + id, { method: "DELETE" }); } catch (e) { alert(e.message); }
          await refresh(); render(); return;
        }
        // decisões da diretoria
        let note;
        if (act === "recusado") {
          note = prompt("Motivo da recusa:");
          if (note === null) return;
          if (!note.trim()) { alert("Recusa precisa de motivo."); return; }
        }
        try {
          await api("/api/reimbursements/" + id + "/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: act, note: note || undefined }),
          });
        } catch (e) { alert(e.message); }
        await refresh(); render();
      }));
  });
}

// ---- carga sob demanda, uma vez por abertura de aba ----
async function load() {
  const root = document.getElementById("expenses-root");
  if (!root) return;
  try {
    if (!me) {
      me = await api("/api/me");
      if (isDirector()) {
        const m = await api("/api/members");
        members = m.members || [];
      }
    }
    await refresh();
    loaded = true;
    render();
  } catch (err) {
    root.innerHTML = '<div class="card"><p class="empty-state">Não foi possível carregar os gastos.</p></div>';
  }
}

document.addEventListener("lepv:expenses:load", load);
```

`/api/me` já devolve `{ authenticated, order, name, director, superadmin, ... }` (espalha `sessionUser`) — os campos lidos pelo módulo existem.

- [ ] **Step 5: Bump do service worker**

Em `public/sw.js`: `CACHE` de `lepv-sp-v11` para `lepv-sp-v12`, com comentário `// v12: centro de gastos (/js/features/expenses.js)`.

- [ ] **Step 6: Rodar e conferir a aba no navegador**

```bash
npm install
npm run seed
npm start
```

Login como membro → aba "Gastos" aparece entre Membros e Diretoria → Novo gasto com foto → lançamento aparece. Login como diretor → extrato consolidado com filtros e ações.

- [ ] **Step 7: Commit**

```bash
git add public/js/features/expenses.js public/app.html public/app.js public/sw.js
git commit -m "feat(gastos): aba Gastos no app — formulario mobile, extrato privado e acoes da diretoria"
```

---

### Task 5: verify-expenses.js + cadeia de verificação

**Files:**
- Create: `scripts/verify-expenses.js`
- Modify: `package.json` — `verify:expenses` no fim de `verify`.
- Modify: `.github/workflows/ci.yml` — passo após `verify:board`.

**Interfaces:**
- Consumes: mesma base dos demais verify (`--base`, `LEPV_CI_ADMIN_PASS`=`ci-admin`, membro order 2 senha `2`), helpers de `verify-board.js` (`clearPin`, `click`).

- [ ] **Step 1: Escrever `scripts/verify-expenses.js`**

```js
const { chromium } = require('playwright');
const BASE = (function () {
  const arg = process.argv.find(a => a.startsWith('--base='));
  if (arg) return arg.slice(7);
  if (process.env.LEPV_BASE) return process.env.LEPV_BASE;
  return 'http://127.0.0.1:' + (process.env.PORT || 3000);
})();
const ADMIN_PASS = process.env.LEPV_CI_ADMIN_PASS || 'ci-admin';
/* Aba Gastos (centro de gastos): todo membro vê a aba, o formulário abre no
   mobile (390px), alvos de toque >= 44px, lançamento de fixture entra e sai,
   e o diretor enxerga o consolidado com as ações de decisão. */
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  const check = (ok, label, detail) => {
    console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
    if (!ok) bad++;
  };
  const clearPin = (page) => page.evaluate(() => document.querySelectorAll(".pin-backdrop").forEach(m => m.remove()));
  const click = async (page, sel) => { await clearPin(page); const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };

  // ---- membro comum: aba existe, formulário mobile ----
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)\.com/.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE + '/login.html', { waitUntil: 'load' });
  const login = await p.evaluate(async () => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 2, password: '2' }) })).status);
  if (login !== 200) { console.log('login do membro falhou:', login); await b.close(); process.exit(2); }
  await p.evaluate(async () => { try { await fetch('/api/pin-poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ want: false }) }); } catch (e) {} });
  await p.goto(BASE + '/app.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  check(await p.$('#tab-gastos') !== null, 'membro vê a aba Gastos');
  await click(p, '#tab-gastos');
  await p.waitForSelector('#expenses-root .gx-summary', { timeout: 5000 }).catch(() => {});
  check(await p.$('#expenses-root .gx-summary') !== null, 'resumo renderiza');
  await click(p, '#gx-new');
  check(await p.$('#gx-form') !== null, 'formulário abre');
  check(await p.$('#gx-paid') !== null, 'checkbox "a diretoria já pagou" existe');
  check(await p.$('#gx-files[accept*="image"]') !== null, 'input de foto/PDF existe');

  // fixture via API: lançamento do membro no extrato dele
  const fixture = await p.evaluate(async () => {
    const r = await fetch('/api/reimbursements', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Gasto de verificação', amountCents: 1234, spentAt: new Date().toISOString().slice(0, 10) }) });
    return { status: r.status, id: r.ok ? (await r.json()).expense.id : null };
  });
  check(fixture.status === 200, 'gasto de fixture criado', fixture.status);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('lepv:expenses:load')));
  await p.waitForTimeout(600);
  const card = await p.evaluate(async (id) => {
    const el = document.querySelector('.gx-card[data-id="' + id + '"]');
    if (!el) return null;
    const h = el.getBoundingClientRect();
    const btns = [...el.querySelectorAll('button')].map(b => b.getBoundingClientRect().height);
    return { inView: h.width > 0, minBtn: Math.min(...btns, 999) };
  }, fixture.id);
  check(card !== null, 'lançamento aparece no extrato');
  if (card) check(card.minBtn >= 44, 'botões do cartão >= 44px', card.minBtn);

  // limpeza do fixture
  if (fixture.id) {
    const del = await p.evaluate(async (id) => (await fetch('/api/reimbursements/' + id, { method: 'DELETE' })).status, fixture.id);
    check(del === 200, 'fixture apagado', del);
  }
  check(errs.length === 0, 'sem erro de console/JS', errs.slice(0, 3).join(' | '));
  await ctx.close();

  // ---- diretor: consolidado + ações ----
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/login.html', { waitUntil: 'load' });
  const l2 = await p2.evaluate(async (pass) => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: 1, password: pass }) })).status, ADMIN_PASS);
  if (l2 === 200) {
    await p2.evaluate(async () => { try { await fetch('/api/pin-poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ want: false }) }); } catch (e) {} });
    await p2.goto(BASE + '/app.html', { waitUntil: 'load' });
    await p2.waitForTimeout(1200);
    await click(p2, '#tab-gastos');
    await p2.waitForSelector('#expenses-root .gx-filters', { timeout: 5000 }).catch(() => {});
    check(await p2.$('#expenses-root .gx-filters') !== null, 'diretor vê filtros do consolidado');
    check(await p2.$('#gx-member') !== null, 'diretor vê filtro por membro');
  } else {
    check(false, 'diretor (order 1) loga no volume de fixture', l2);
  }
  await b.close();
  console.log(bad ? `\n${bad} falha(s)` : '\nverify-expenses OK');
  process.exit(bad ? 1 : 0);
})();
```

- [ ] **Step 2: `package.json`**

```json
    "verify:expenses": "node scripts/verify-expenses.js",
```

e no fim da cadeia `verify`: `... && npm run verify:board && npm run verify:expenses`.

- [ ] **Step 3: `.github/workflows/ci.yml`**

Depois do passo `npm run verify:board`:

```yaml
        run: npm run verify:expenses
```

- [ ] **Step 4: Rodar tudo**

```bash
npm test
npm run verify
```

Expected: e2e 100%, 14 verificações verdes.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-expenses.js package.json .github/workflows/ci.yml
git commit -m "test(gastos): verificacao Playwright da aba na cadeia verify e no CI"
```

---

### Task 6: Smoke manual + documentação

**Files:**
- Modify: `docs/` — nenhum arquivo novo obrigatório; se houver nota de produto sobre abas, registrar a nova.

- [ ] **Step 1:** `npm test` e `npm run verify` finais, zero falhas.
- [ ] **Step 2:** Screenshot da aba em 390px (Playwright já cobre; se quiser, `scripts/ci-shots.js` pattern).
- [ ] **Step 3:** Revisar a spec vs. entrega: todos os critérios cobertos.
- [ ] **Step 4:** Push só após autorização do usuário (`git push origin main` é o deploy).
