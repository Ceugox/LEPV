# Tags editáveis pelo membro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada membro gerencia as próprias tags de interesse pelo cartão dele na aba Membros, e o logout passa a voltar para a página principal.

**Architecture:** As tags já existem como `interests` (array de strings) e já são servidas. Falta o caminho de escrita, e ele esbarra num detalhe: `allMembers()` **concatena** seed e volume em vez de fazer merge, então gravar tag de fundador não sobreviveria ao deploy. A solução é um array `profiles` no volume aplicado como override sobre o registro base — o mesmo padrão que as credenciais já usam.

**Tech Stack:** Node/Express, front vanilla, sem build. Testes em `tests/e2e.js` (node puro, sem framework).

**Spec:** `docs/superpowers/specs/2026-08-23-tags-do-membro-design.md`

## Global Constraints

- **Vanilla, sem build.** Nenhuma dependência de runtime nova.
- **Limites da tag:** máximo **8 tags**, **30 caracteres** cada. Valores já em uso; não alterar.
- **Dedupe ignorando caixa:** `["IA","ia"]` grava `["IA"]`. Comportamento novo.
- **O membro só edita o próprio cadastro.** O `order` vem sempre de `req.session.user.order`, nunca do corpo da requisição.
- **Toda escrita no volume passa por `writeSignups`** (que faz tmp + fsync + `.bak` + rename atômico). Nunca `fs.writeFileSync` direto num store.
- **As tags seguem públicas** — aparecem no roster que abre sem login. Decisão consciente do Marcell.
- **Só o logout muda de destino.** `app.js:17` (sessão inválida) e `app.js:31` (troca de senha obrigatória) continuam indo a `/login.html`.
- **Não tocar `body.imersao`** nem o tema do acervo.
- **Alvo de toque ≥ 44px** em qualquer controle novo.
- **Push e deploy exigem autorização explícita do Marcell a cada vez.** Nenhuma task aqui faz `git push` nem `railway up`.
- **Testar com volume isolado:** `RAILWAY_VOLUME_MOUNT_PATH` em diretório temporário.

## Contexto medido

| Fato | Onde |
|---|---|
| `allMembers()` concatena seed + volume | `server.js:318-320` |
| Normalização de `interests` **duplicada** | `server.js:981-983` e `server.js:1032-1034` |
| `interests` servido | `server.js:734` e `server.js:1120` |
| `isMe` já existe no cartão | `app.js:830` |
| Chips renderizados | `app.js:841-842` |
| Botão só do próprio membro (foto) | `app.js:844` |
| Logout redireciona | `app.js:43` |
| `MEMBER_ORDER = 2` no e2e | **é fundador do seed** — o caso que o concat quebra |
| Suíte hoje | 37 casos |

## File Structure

```
server.js          MODIFICAR  normalizeInterests(), allMembers() com override,
                              POST /api/me/interests
public/app.js      MODIFICAR  edição de tags no cartão próprio; logout para "/"
public/app.html    MODIFICAR  estilos dos controles de tag
tests/e2e.js       MODIFICAR  7 casos novos
```

---

### Task 1: `normalizeInterests()` — uma regra só

**Files:**
- Modify: `server.js:981-983`, `server.js:1032-1034`, e inserir a função perto de `allMembers()` (~linha 315)
- Test: `tests/e2e.js`

**Interfaces:**
- Produces: `normalizeInterests(raw: unknown) => string[]` — array com no máximo 8 strings de até 30 caracteres, sem vazias e sem repetição ignorando caixa. Consumida pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `tests/e2e.js`, antes do bloco que imprime o resultado:

```js
test("cadastro normaliza as tags: limite, tamanho e repetição", async () => {
  const c = client();
  const r = await c.post("/api/register", {
    name: "Fulano de Tal",
    course: "Computação",
    year: "2º ano",
    phone: "21999999999",
    password: "senha-boa",
    interests: ["IA", "ia", "  Tech  ", "", "a".repeat(40),
                "t1", "t2", "t3", "t4", "t5", "t6", "t7"],
  });
  eq(r.status, 200, "cadastro aceito");

  const pend = JSON.parse(fs.readFileSync(signupsFile(), "utf8")).pending;
  const novo = pend[pend.length - 1];
  const tags = novo.interests;
  eq(tags.length, 8, "no máximo 8 tags");
  eq(tags[0], "IA", "primeira tag preservada");
  assert(!tags.includes("ia"), "repetição ignorando caixa deveria sumir");
  eq(tags[1], "Tech", "espaços nas pontas deveriam sumir");
  eq(tags[2].length, 30, "tag longa deveria ser truncada em 30");
});
```

`signupsFile()` é o helper criado na Task 2, Step 1. Se esta task rodar antes,
criá-lo agora — perto de `volumeDir` (`tests/e2e.js:34`):

```js
// Funcao e nao constante: volumeDir so recebe valor no setup.
const signupsFile = () => path.join(volumeDir, "signups.json");
```

O e2e não tem helper de leitura de store; ler direto é o padrão do arquivo
(ver o caso da linha 769).

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **FALHA** em `repetição ignorando caixa deveria sumir` — hoje `["IA","ia"]` grava as duas.

- [ ] **Step 3: Criar a função**

Inserir em `server.js` logo depois de `activeMembers()` (~linha 323):

```js
// Tag é rótulo curto, não texto livre: 30 caracteres, no máximo 8, sem
// repetição (ignorando caixa) e sem vazias. A regra vivia copiada em dois
// pontos; ficar num lugar só evita que divirjam.
function normalizeInterests(raw) {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set();
  const out = [];
  for (const item of raw) {
    const t = String(item).trim().slice(0, 30);
    if (!t) continue;
    const chave = t.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(t);
    if (out.length === 8) break;
  }
  return out;
}
```

- [ ] **Step 4: Trocar os dois pontos duplicados**

Em `server.js:981-983`, trocar:

```js
      interests: Array.isArray(raw.interests)
        ? raw.interests.map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 8)
        : [],
```

por:

```js
      interests: normalizeInterests(raw.interests),
```

Em `server.js:1032-1034`, trocar:

```js
  const interests = Array.isArray(req.body.interests)
    ? req.body.interests.map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 8)
    : [];
```

por:

```js
  const interests = normalizeInterests(req.body.interests);
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **38 passaram, 0 falharam**.

- [ ] **Step 6: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "Extrai normalizeInterests e acrescenta dedupe

A regra de normalizacao das tags estava copiada em dois pontos do server.
Vira uma funcao so, e ganha dedupe ignorando caixa: [IA, ia] passa a gravar
uma tag em vez de duas."
```

---

### Task 2: Override de perfil no volume

O coração da mudança: sem isto, tag de fundador não sobrevive ao deploy.

**Files:**
- Modify: `server.js:318-320` (`allMembers`)
- Test: `tests/e2e.js`

**Interfaces:**
- Consumes: `normalizeInterests()` da Task 1.
- Produces: `signups.profiles: Array<{order: number, interests: string[]}>` — override aplicado sobre o registro base em `allMembers()`. Consumido pela Task 3.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("override de perfil no volume vence o seed", async () => {
  // MEMBER_ORDER é fundador: mora em data/members.json, não no volume.
  // Sem override, gravar nele seria perdido no deploy.
  const store = JSON.parse(fs.readFileSync(signupsFile(), "utf8"));
  store.profiles = [{ order: MEMBER_ORDER, interests: ["Robótica"] }];
  fs.writeFileSync(signupsFile(), JSON.stringify(store, null, 2));

  const c = client();
  eq((await c.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login do fundador");
  const r = await c.get("/api/members");
  eq(r.status, 200, "roster acessível");

  const eu = r.data.members.find((m) => m.order === MEMBER_ORDER);
  assert(eu, "fundador deveria estar no roster");
  eq(JSON.stringify(eu.interests), JSON.stringify(["Robótica"]),
     "o override do volume deveria vencer o interesses do seed");
});
```

`signupsFile()` é o helper definido na Task 1, Step 1. Se ainda não existir,
criá-lo perto de `volumeDir` (`tests/e2e.js:34`):

```js
// Funcao e nao constante: volumeDir so recebe valor no setup.
const signupsFile = () => path.join(volumeDir, "signups.json");
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **FALHA** — o roster devolve os interesses do seed (`["Tech","Fitness","IA"]`), porque `allMembers()` só concatena.

- [ ] **Step 3: Aplicar o override**

Em `server.js:318-320`, trocar:

```js
function allMembers() {
  return seedMembers.concat(readSignups().members);
}
```

por:

```js
// O volume vence o seed, mesma regra das credenciais: o membro edita o
// próprio perfil e a mudança sobrevive a deploy. Sem isto, quem está em
// data/members.json (os fundadores) perderia a edição no próximo railway up,
// porque o registro dele vem do repositório e não do volume.
function allMembers() {
  const s = readSignups();
  const over = new Map((s.profiles || []).map((p) => [p.order, p]));
  return seedMembers.concat(s.members).map((m) => {
    const o = over.get(m.order);
    // order é a chave e nunca muda; o resto do override vence o base.
    return o ? Object.assign({}, m, o, { order: m.order }) : m;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **39 passaram, 0 falharam**. Atenção especial: nenhum dos 37 casos
antigos pode quebrar — `allMembers()` é usada em todo o server.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "allMembers passa a aplicar override do volume sobre o seed

Antes concatenava, entao gravar dado de fundador (que mora em
data/members.json, do repositorio) nao sobreviveria ao deploy. Agora o
array profiles do volume vence o registro base, mesmo padrao que as
credenciais ja usam. order permanece a chave e nunca e sobrescrito."
```

---

### Task 3: `POST /api/me/interests`

**Files:**
- Modify: `server.js` — inserir logo depois de `app.post("/api/set-password", ...)` (~linha 919)
- Test: `tests/e2e.js`

**Interfaces:**
- Consumes: `normalizeInterests()` (Task 1), `profiles` (Task 2).
- Produces: `POST /api/me/interests` com corpo `{interests: string[]}` → `200 {ok: true, interests: string[]}` ou `401 {error: "not_authenticated"}`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test("membro grava as próprias tags e elas persistem", async () => {
  const c = client();
  eq((await c.login(MEMBER_ORDER, MEMBER_PASS)).status, 200, "login");

  const r = await c.post("/api/me/interests", {
    interests: ["IA", "ia", "  Tech  ", "", "b".repeat(40),
                "x1", "x2", "x3", "x4", "x5", "x6"],
  });
  eq(r.status, 200, "gravação aceita");
  eq(r.data.interests.length, 8, "o servidor devolve no máximo 8");
  eq(r.data.interests[0], "IA", "primeira tag preservada");
  assert(!r.data.interests.includes("ia"), "repetição removida");
  eq(r.data.interests[1], "Tech", "espaços aparados");
  eq(r.data.interests[2].length, 30, "tag longa truncada");

  // persistiu no volume, e não só na resposta
  const store = JSON.parse(fs.readFileSync(signupsFile(), "utf8"));
  const perfil = (store.profiles || []).find((p) => p.order === MEMBER_ORDER);
  assert(perfil, "deveria existir override para o fundador");
  eq(perfil.interests[0], "IA", "gravado no volume");

  // e aparece no roster
  const roster = await c.get("/api/members");
  const eu = roster.data.members.find((m) => m.order === MEMBER_ORDER);
  eq(eu.interests[0], "IA", "roster reflete a tag nova");
});

test("tags do membro aparecem na lista pública", async () => {
  const c = client();
  await c.login(MEMBER_ORDER, MEMBER_PASS);
  await c.post("/api/me/interests", { interests: ["Náutica"] });

  const anon = client();
  const r = await anon.get("/api/members-public");
  eq(r.status, 200, "lista pública acessível sem sessão");
  const eu = (r.data.members || r.data).find((m) => m.order === MEMBER_ORDER);
  assert(eu, "membro na lista pública");
  assert(eu.interests.includes("Náutica"), "tag nova visível sem login");
});

test("gravar tags exige sessão", async () => {
  const anon = client();
  const r = await anon.post("/api/me/interests", { interests: ["X"] });
  eq(r.status, 401, "sem sessão deveria dar 401");
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **FALHA com 404** — a rota não existe.

- [ ] **Step 3: Criar o endpoint**

Inserir em `server.js` logo após o fechamento de `app.post("/api/set-password", ...)`:

```js
// Cada membro edita as próprias tags. O order vem SEMPRE da sessão: aceitar
// order do corpo deixaria um membro reescrever o perfil de outro.
// A gravação vai para profiles no volume (ver allMembers), então funciona
// igual para fundador do seed e para membro aprovado.
app.post("/api/me/interests", requireSessionApi, (req, res) => {
  const order = req.session.user.order;
  const interests = normalizeInterests(req.body.interests);

  const signups = readSignups();
  if (!Array.isArray(signups.profiles)) signups.profiles = [];
  const perfil = signups.profiles.find((p) => p.order === order);
  if (perfil) {
    perfil.interests = interests;
  } else {
    signups.profiles.push({ order, interests });
  }
  writeSignups(signups);

  // Devolve o que ficou gravado: o front mostra o resultado do truncamento e
  // do dedupe sem precisar repetir a regra no cliente.
  res.json({ ok: true, interests });
});
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **42 passaram, 0 falharam**.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/e2e.js
git commit -m "Adiciona POST /api/me/interests

Cada membro grava as proprias tags; o order vem da sessao e nunca do corpo.
A gravacao vai para profiles no volume, entao vale igual para fundador do
seed e para membro aprovado. A resposta devolve o array normalizado para o
front exibir o resultado do truncamento e do dedupe."
```

---

### Task 4: Edição no cartão do próprio membro

**Files:**
- Modify: `public/app.js:830-860` (renderização do cartão)
- Modify: `public/app.html` (estilos dos controles)

**Interfaces:**
- Consumes: `POST /api/me/interests` (Task 3).

- [ ] **Step 1: Estilos dos controles**

Acrescentar ao `<style>` de `public/app.html`, perto das regras de `.member-card`:

```css
  /* Edição de tags: só aparece no cartão do próprio membro. */
  .interests.editable .interest-chip { padding-right: 4px; display: inline-flex;
    align-items: center; gap: 6px; }
  .tag-x {
    border: 0; background: none; cursor: pointer; color: var(--ink-3);
    font: inherit; font-size: 14px; line-height: 1; padding: 0;
    min-width: 24px; min-height: 24px; border-radius: 2px;
  }
  .tag-x:hover { color: var(--wine); }
  .tag-add {
    display: flex; gap: 8px; align-items: center; margin-top: 8px;
  }
  .tag-add input {
    font: inherit; font-size: 16px; color: var(--ink); background: var(--card);
    border: 1px solid var(--line-2); border-radius: 3px; padding: 8px 10px;
    min-height: 44px; flex: 1; min-width: 0;
  }
  .tag-add input:focus {
    outline: none; border-color: var(--wine);
    box-shadow: 0 0 0 3px rgba(127,10,26,0.12);
  }
  .tag-add input:disabled { background: var(--paper-2); color: var(--ink-3); }
  .tag-msg { font-size: 12px; color: var(--ink-3); margin-top: 6px; }
  .tag-msg.err { color: var(--danger); }
```

- [ ] **Step 2: Renderizar os controles no cartão próprio**

Em `public/app.js`, na função que monta o cartão (~linha 841), trocar:

```js
          var interestsHtml = (m.interests && m.interests.length)
            ? '<div class="interests">' + m.interests.map(function (i) { return '<span class="interest-chip">' + esc(i) + "</span>"; }).join("") + "</div>"
```

por:

```js
          // No cartão do próprio membro as tags viram editáveis: cada chip
          // ganha um × e um campo adiciona novas. Nos outros, nada muda.
          var tags = m.interests || [];
          var chips = tags.map(function (i) {
            return '<span class="interest-chip">' + esc(i) +
              (isMe ? '<button type="button" class="tag-x" data-tag-del="' + esc(i) +
                      '" aria-label="Remover ' + esc(i) + '">×</button>' : "") +
              "</span>";
          }).join("");
          var interestsHtml = (tags.length || isMe)
            ? '<div class="interests' + (isMe ? " editable" : "") + '">' + chips + "</div>" +
              (isMe
                ? '<div class="tag-add">' +
                    '<input type="text" maxlength="30" data-tag-input ' +
                      'placeholder="' + (tags.length >= 8 ? "Limite de 8 tags" : "Adicionar tag e teclar Enter") + '"' +
                      (tags.length >= 8 ? " disabled" : "") + ">" +
                  "</div>" +
                  '<p class="tag-msg" data-tag-msg></p>'
                : "")
```

manter o `: ""` que já fecha o ternário na linha seguinte.

- [ ] **Step 3: Ligar os eventos**

Acrescentar em `public/app.js`, dentro da mesma função que renderiza o roster,
depois de escrever o HTML no DOM:

```js
  // Edição de tags do próprio membro. O servidor devolve o array já
  // normalizado, então o estado local vira exatamente o que ficou gravado —
  // truncamento e dedupe aparecem na hora, sem repetir a regra aqui.
  function ligarEdicaoDeTags(raiz, me) {
    var msg = raiz.querySelector("[data-tag-msg]");
    var input = raiz.querySelector("[data-tag-input]");
    function aviso(texto, erro) {
      if (!msg) return;
      msg.textContent = texto || "";
      msg.className = "tag-msg" + (erro ? " err" : "");
    }
    function salvar(lista) {
      return api("/api/me/interests", { method: "POST", body: { interests: lista } })
        .then(function (r) {
          me.interests = r.interests;
          aviso(r.interests.length >= 8 ? "Limite de 8 tags atingido." : "");
          loadMembers();   // redesenha a aba Membros
          return r.interests;
        })
        .catch(function () {
          aviso("Não deu para salvar. Tente de novo.", true);
        });
    }
    raiz.querySelectorAll("[data-tag-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var alvo = b.getAttribute("data-tag-del");
        salvar((me.interests || []).filter(function (t) { return t !== alvo; }));
      });
    });
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== ",") return;
        e.preventDefault();
        var v = input.value.trim();
        if (!v) return;
        input.value = "";
        salvar((me.interests || []).concat([v]));
      });
      input.addEventListener("blur", function () {
        var v = input.value.trim();
        if (!v) return;
        input.value = "";
        salvar((me.interests || []).concat([v]));
      });
    }
  }
```

Chamá-la ao final de `loadMembers()` (a função que monta o roster, em
`public/app.js`, dentro do `.then` que escreve os cartões no DOM), passando o
contêiner do roster e o objeto do próprio membro:

```js
    ligarEdicaoDeTags(alvo, me);
```

onde `alvo` é o elemento cujo `innerHTML` acabou de receber os cartões e `me` é
o objeto do usuário logado que `loadMembers` já tem em mão via `meReady`.

- [ ] **Step 4: Verificar ao vivo**

Subir o servidor com volume isolado e medir:

```bash
node scripts/verify-app.js --base=http://127.0.0.1:3000
```

Esperado: `APP OK`. Depois, conferir manualmente com Playwright que o cartão
próprio tem `[data-tag-input]` e os outros não:

```bash
node -e "
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('http://127.0.0.1:3000/login.html');
await p.evaluate(()=>fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:2,password:'2'})}));
await p.goto('http://127.0.0.1:3000/app.html');await p.waitForTimeout(1400);
await p.evaluate(()=>{const m=document.querySelector('.pin-backdrop');if(m)m.remove();});
await p.evaluate(()=>document.querySelector('[data-tab=membros]').click());
await p.waitForTimeout(900);
console.log(await p.evaluate(()=>({
  campos: document.querySelectorAll('[data-tag-input]').length,
  remover: document.querySelectorAll('[data-tag-del]').length,
  cartoes: document.querySelectorAll('.member-card').length })));
await b.close();})();
"
```

Esperado: `campos: 1` (só o próprio), `cartoes` maior que 1.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/app.html
git commit -m "Edicao de tags no cartao do proprio membro

Cada chip ganha um x e um campo adiciona por Enter ou virgula. So aparece
onde isMe e verdadeiro. O estado local passa a ser o array que o servidor
devolve, entao truncamento e dedupe aparecem na hora sem repetir a regra
no cliente."
```

---

### Task 5: Logout volta para a página principal

**Files:**
- Modify: `public/app.js:43`

- [ ] **Step 1: Trocar o destino**

Em `public/app.js:43`, trocar:

```js
      window.location.href = "/login.html";
```

por:

```js
      // Sair do app leva à página pública, não à tela de login: quem saiu
      // não está tentando entrar de novo. Os outros dois redirecionamentos
      // deste arquivo (sessão inválida e troca de senha obrigatória) seguem
      // indo ao login, porque ali a tela de autenticação é o destino certo.
      window.location.href = "/";
```

- [ ] **Step 2: Conferir que só o logout mudou**

```bash
grep -n 'location.href' public/app.js
```

Esperado: três linhas — duas com `/login.html` (linhas ~17 e ~31) e uma com `"/"`.

- [ ] **Step 3: Verificar ao vivo**

```bash
node -e "
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('http://127.0.0.1:3000/login.html');
await p.evaluate(()=>fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:2,password:'2'})}));
await p.goto('http://127.0.0.1:3000/app.html');await p.waitForTimeout(1200);
await p.evaluate(()=>{const m=document.querySelector('.pin-backdrop');if(m)m.remove();});
await p.click('#logout-btn');
await p.waitForTimeout(1500);
console.log('destino apos sair:', new URL(p.url()).pathname);
await b.close();})();
"
```

Esperado: `destino apos sair: /`

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "Sair do app leva a pagina principal, nao ao login

Quem sai nao esta tentando entrar de novo. Os outros dois redirects do
arquivo seguem indo ao login: sessao invalida e troca de senha obrigatoria
precisam da tela de autenticacao."
```

---

### Task 6: Verificação final

- [ ] **Step 1: Suíte e cadeia completa**

```bash
npm test --prefix "C:/Users/marce/Documents/GitHub/LEPV"
LEPV_BASE=http://127.0.0.1:3000 npm run verify --prefix "C:/Users/marce/Documents/GitHub/LEPV"
```

Esperado: **42 passaram, 0 falharam** no e2e, e as 10 verificações verdes.

- [ ] **Step 2: Conferir que o acervo não foi tocado**

```bash
git diff main..HEAD -- public/app.html | grep -E '^[-+].*imersao' | head
```

Esperado: nenhuma linha.

- [ ] **Step 3: Parar**

Não fazer `git push` nem `railway up`. Reportar o resultado e perguntar.

## Fora de escopo

- Telefone do fundador, hoje descartado em silêncio no `set-password`. O
  override criado na Task 2 resolveria, mas é outra mudança.
- Edição de tags por diretoria ou superadmin.
- Autocompletar a partir das tags existentes; busca ou filtro por tag.
