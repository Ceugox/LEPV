# Modularização do front-end Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o cliente autenticado em módulos ES testáveis e corrigir os problemas de front-end encontrados na auditoria, sem alterar os contratos públicos existentes.

**Architecture:** `public/js/main.js` criará um contexto imutável com API, serialização e estado de sessão, e chamará inicializadores de UI e features. Cada feature terá dependências explícitas e só tocará os nós HTML de sua própria superfície. `public/app.js` permanecerá como loader de transição para preservar caches e URLs antigas.

**Tech Stack:** Node.js 24, Express 4, JavaScript ES modules no navegador, Playwright, testes Node existentes, CSS puro.

## Global Constraints

- Não adicionar bundler, framework, transpiler ou dependência de produção.
- Não mudar URLs, rotas de API, payloads, IDs, classes e atributos `data-*` existentes.
- Todo texto ou atributo interpolado a partir de API deve passar por serialização apropriada.
- A suíte não pode gravar em `data/` versionado; testes de browser usam volume temporário.
- Desktop, 390 px e `prefers-reduced-motion: reduce` continuam sendo alvos obrigatórios.
- Cada mudança de produção nasce depois de um teste que falha pelo comportamento ausente.

---

## File structure

| Arquivo | Responsabilidade |
| --- | --- |
| `public/js/core/api.js` | `createApi`, redirecionamento de sessão expirada e parse seguro de respostas JSON. |
| `public/js/core/escape.js` | `escapeHtml`, `escapeAttr`, `safeUrl`, `numberValue` e `paletteColor`. |
| `public/js/core/state.js` | `createSessionState` e a promessa única de `/api/me`. |
| `public/js/ui/tabs.js` | roving tabindex, ativação e troca de painéis. |
| `public/js/ui/modal.js` | criação, foco inicial, Escape e restauração de foco. |
| `public/js/ui/gallery.js` | lightbox, próxima/anterior e fechamento. |
| `public/js/features/home.js` | mural, início e missão. |
| `public/js/features/members.js` | membros, avatar, senha, tags, convites e visitantes. |
| `public/js/features/events.js` | cards de evento, inscrição, presença e painel de diretoria. |
| `public/js/features/immersion.js` | agenda, empresas, materiais, rotas, badges, acervo e checklist. |
| `public/js/features/access.js` | ping de sessão e painel de acessos. |
| `public/js/main.js` | composição e inicialização, sem renderização de domínio. |
| `public/app.js` | ponte `import('/js/main.js')` com captura explícita de erro. |
| `tests/frontend-modules.js` | testes de fronteira de módulo e serialização em Node. |
| `scripts/verify-hero-mobile.js` | verificação visual de isolamento da arte e CTAs no hero mobile. |
| `scripts/verify-app-modules.js` | smoke test Playwright da página autenticada com módulos. |

## Task 1: Cobrir contratos de serialização e carregar o entrypoint

**Files:**
- Create: `tests/frontend-modules.js`
- Create: `public/js/core/escape.js`
- Create: `public/js/core/api.js`
- Create: `public/js/main.js`

**Interfaces:**
- Produces: `escapeHtml(value)`, `escapeAttr(value)`, `safeUrl(value)`, `numberValue(value, fallback)`, `paletteColor(value, allowed, fallback)`.
- Produces: `createApi({ fetchImpl, onUnauthorized })`, que retorna `request(path, options)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/frontend-modules.js
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadEscape() {
  const source = fs.readFileSync('public/js/core/escape.js', 'utf8')
    .replace(/export\s+/g, '');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source + '\nthis.out={escapeHtml,escapeAttr,safeUrl,numberValue,paletteColor};', ctx);
  return ctx.out;
}

const e = loadEscape();
assert.equal(e.escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
assert.equal(e.escapeAttr('" onclick="x'), '&quot; onclick=&quot;x');
assert.equal(e.safeUrl('javascript:alert(1)'), '');
assert.equal(e.safeUrl('/gallery/a.jpg'), '/gallery/a.jpg');
assert.equal(e.numberValue('12x', 0), 0);
assert.equal(e.paletteColor('#8f1020', new Set(['#8f1020']), '#111'), '#8f1020');
assert.equal(e.paletteColor('url(javascript:x)', new Set(['#8f1020']), '#111'), '#111');
console.log('frontend core contract OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: `ENOENT` for `public/js/core/escape.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// public/js/core/escape.js
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export const escapeAttr = escapeHtml;
export function safeUrl(value) {
  const url = String(value ?? '');
  return /^(?:\/|https?:\/\/)/i.test(url) ? url : '';
}
export function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
export function paletteColor(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}
```

```js
// public/js/core/api.js
export function createApi({ fetchImpl = fetch, onUnauthorized = () => { location.href = '/login.html'; } } = {}) {
  return function request(path, options) {
    return fetchImpl(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options))
      .then(async response => {
        if (response.status === 401) { onUnauthorized(); throw new Error('not authenticated'); }
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || body.error || 'request failed');
        return body;
      });
  };
}
```

```js
// public/js/main.js — scaffold sem efeitos; a composição entra na Task 6.
export async function boot() {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/frontend-modules.js && node --check public/js/core/api.js`  
Expected: `frontend core contract OK` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tests/frontend-modules.js public/js/core/escape.js public/js/core/api.js public/js/main.js
git commit -m "test: cover frontend module contracts"
```

## Task 2: Extrair estado e controles de interface compartilhados

**Files:**
- Create: `public/js/core/state.js`
- Create: `public/js/ui/tabs.js`
- Create: `public/js/ui/modal.js`
- Modify: `tests/frontend-modules.js`

**Interfaces:**
- Consumes: `createApi` de `core/api.js`.
- Produces: `createSessionState(api) -> { ready, getUser }`, `initTabs(root, onActivate)`, `createModal(host)`.

- [ ] **Step 1: Write failing tests**

```js
assert.match(fs.readFileSync('public/js/core/state.js', 'utf8'), /export function createSessionState/);
assert.match(fs.readFileSync('public/js/ui/tabs.js', 'utf8'), /export function initTabs/);
assert.match(fs.readFileSync('public/js/ui/modal.js', 'utf8'), /export function createModal/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: assertion failure because the modules do not exist.

- [ ] **Step 3: Implement minimal modules**

```js
// public/js/core/state.js
export function createSessionState(api) {
  let user = null;
  const ready = api('/api/me').then(me => (user = me));
  return { ready, getUser: () => user };
}
```

Move `syncTabState`, `wireTablist` and `activateTab` from `public/app.js:72-127`
into `initTabs`, keeping arrow-key behavior and `aria-selected` values unchanged. Move
`openPasswordModal`'s generic focus/close mechanics to `createModal`; feature code supplies
the modal body and save callback.

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && node scripts/verify-tabs.js --base=http://127.0.0.1:3000`  
Expected: contract test and existing tab verification pass with the CI fixture server running.

- [ ] **Step 5: Commit**

```bash
git add public/js/core/state.js public/js/ui/tabs.js public/js/ui/modal.js tests/frontend-modules.js
git commit -m "refactor: extract frontend core and tab controls"
```

## Task 3: Migrar a superfície de membros e administração

**Files:**
- Create: `public/js/features/members.js`
- Modify: `public/js/main.js`
- Modify: `tests/frontend-modules.js`

**Interfaces:**
- Consumes: `{ api, state, escapeHtml, escapeAttr, safeUrl, createModal }`.
- Produces: `initMembers(context)`; inicializa somente se `#member-grid` existir.

- [ ] **Step 1: Write failing tests**

```js
const membersSource = fs.readFileSync('public/js/features/members.js', 'utf8');
assert.match(membersSource, /export function initMembers/);
assert.match(membersSource, /escapeHtml\(m\.name\)/);
assert.match(membersSource, /escapeAttr\(t\)/);
assert.match(membersSource, /if \(!document\.getElementById\('member-grid'\)\) return;/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: `ENOENT` for `features/members.js`.

- [ ] **Step 3: Implement minimal migration**

Move `renderSignupPanel`, `renderVisitorsPanel`, `renderImmersionEntry`,
`openPasswordModal`, `normalizePhoto`, `uploadPhoto`, `loadMembers` and their nested
handlers from `public/app.js:567-1085`. Keep all current API paths and DOM IDs. Escape
member name, photo URL, course, cargo, tag, visitor name/email/phone and invitation
text before HTML interpolation; use `safeUrl` for image sources.

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && npm test && node scripts/verify-app.js --base=http://127.0.0.1:3000 && node scripts/verify-tags.js --base=http://127.0.0.1:3000`  
Expected: all commands exit 0 against the fixture server.

- [ ] **Step 5: Commit**

```bash
git add public/js/features/members.js public/js/main.js tests/frontend-modules.js public/app.js
git commit -m "refactor: isolate member and administration frontend"
```

## Task 4: Migrar eventos e início

**Files:**
- Create: `public/js/features/events.js`
- Create: `public/js/features/home.js`
- Modify: `public/js/main.js`
- Modify: `tests/frontend-modules.js`

**Interfaces:**
- Consumes: `{ api, state, escapeHtml, escapeAttr, safeUrl, numberValue }`.
- Produces: `initEvents(context)` and `initHome(context)`.

- [ ] **Step 1: Write failing tests**

```js
for (const file of ['public/js/features/events.js', 'public/js/features/home.js']) {
  assert.ok(fs.existsSync(file), file + ' must exist');
}
assert.match(fs.readFileSync('public/js/features/events.js', 'utf8'), /export function initEvents/);
assert.match(fs.readFileSync('public/js/features/home.js', 'utf8'), /export function initHome/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: missing-module assertion.

- [ ] **Step 3: Implement minimal migration**

Move `attendanceBadge` through `loadEvents` from `public/app.js:1103-1778` to
`events.js`, retaining card event delegation and the current `data-event-*` attributes.
Move `marqueeItemHtml` through `loadMission` from `public/app.js:208-560` to `home.js`.
For mission, company and event fields, apply `escapeHtml`; for image, material and map
links, apply `safeUrl`; for capacity and attendee counters, apply `numberValue`.

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && npm test && node scripts/verify-app.js --base=http://127.0.0.1:3000`  
Expected: all API/event/app assertions pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/features/events.js public/js/features/home.js public/js/main.js tests/frontend-modules.js public/app.js
git commit -m "refactor: isolate home and event frontend"
```

## Task 5: Migrar imersão, acervo e acessos

**Files:**
- Create: `public/js/features/immersion.js`
- Create: `public/js/features/access.js`
- Create: `public/js/ui/gallery.js`
- Modify: `public/js/main.js`
- Modify: `tests/frontend-modules.js`

**Interfaces:**
- Consumes: `{ api, state, escapeHtml, escapeAttr, safeUrl, numberValue, paletteColor }`.
- Produces: `initImmersion(context)`, `initAccess(context)` and `createGallery(host, options)`.

- [ ] **Step 1: Write failing tests**

```js
for (const file of ['public/js/features/immersion.js', 'public/js/features/access.js', 'public/js/ui/gallery.js']) {
  assert.ok(fs.existsSync(file), file + ' must exist');
}
assert.match(fs.readFileSync('public/js/features/immersion.js', 'utf8'), /export function initImmersion/);
assert.match(fs.readFileSync('public/js/features/access.js', 'utf8'), /export function initAccess/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: missing-module assertion.

- [ ] **Step 3: Implement minimal migration**

Move `renderDay` through `loadLegacy`, `renderChecklist`, `loadChecklist`,
`addChecklistItem`, `maybeShowPinPoll` and `showPinPoll` from
`public/app.js:1779-3262` to `immersion.js`; move all lightbox functions to
`ui/gallery.js`. Move `sendPing`, `fmtDur`, `fmtWhen`, `tabsSummary` and
`loadAccess` to `access.js`. Restrict company color to the company color set
returned by `/api/companies`; escape every caption, title, URL and checklist
value before writing HTML.

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && npm test && node scripts/verify-app.js --base=http://127.0.0.1:3000 && node scripts/verify-consistency.js --base=http://127.0.0.1:3000`  
Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/js/features/immersion.js public/js/features/access.js public/js/ui/gallery.js public/js/main.js tests/frontend-modules.js public/app.js
git commit -m "refactor: isolate immersion, gallery and access frontend"
```

## Task 6: Trocar o monólito pelo entrypoint e preservar compatibilidade

**Files:**
- Create: `public/js/main.js`
- Modify: `public/app.js`
- Modify: `public/app.html:1352`
- Modify: `scripts/check-inline-js.js`
- Modify: `tests/frontend-modules.js`

**Interfaces:**
- Consumes: todos os `initXxx(context)` criados nas tasks 2-5.
- Produces: `boot()` em `main.js`; `app.js` somente carrega `main.js`.

- [ ] **Step 1: Write failing test**

```js
const html = fs.readFileSync('public/app.html', 'utf8');
assert.match(html, /<script type="module" src="\/js\/main\.js"><\/script>/);
assert.equal(fs.readFileSync('public/app.js', 'utf8').includes('function loadMembers'), false);
assert.match(fs.readFileSync('public/js/main.js', 'utf8'), /export async function boot/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: assertion failure because `app.html` still references the monolith.

- [ ] **Step 3: Implement minimal composition**

```js
// public/js/main.js
import { createApi } from './core/api.js';
import { createSessionState } from './core/state.js';
import * as escape from './core/escape.js';
import { initTabs } from './ui/tabs.js';
import { initMembers } from './features/members.js';
import { initEvents } from './features/events.js';
import { initHome } from './features/home.js';
import { initImmersion } from './features/immersion.js';
import { initAccess } from './features/access.js';

export async function boot() {
  const api = createApi();
  const state = createSessionState(api);
  const context = Object.freeze({ api, state, ...escape });
  initTabs(document, name => document.querySelector('[data-tab="' + name + '"]')?.click());
  await state.ready;
  [initHome, initMembers, initEvents, initImmersion, initAccess].forEach(init => init(context));
}
boot().catch(error => console.error('LEPV application boot failed', error));
```

Set `app.html` to load `/js/main.js` with `type="module"`. Replace `app.js` with
`import('/js/main.js').catch(error => console.error('LEPV legacy loader failed', error));`
only if another HTML file still references it; otherwise remove that reference but retain
the bridge file for service-worker cache compatibility.

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && node scripts/check-inline-js.js && node scripts/verify-app.js --base=http://127.0.0.1:3000 && node scripts/verify-tabs.js --base=http://127.0.0.1:3000`  
Expected: all commands exit 0 and browser console has no `LEPV application boot failed` entry.

- [ ] **Step 5: Commit**

```bash
git add public/js public/app.js public/app.html scripts/check-inline-js.js tests/frontend-modules.js
git commit -m "refactor: boot LEPV frontend from native modules"
```

## Task 7: Corrigir hero mobile e semântica de inscrição

**Files:**
- Modify: `public/home.html:84-92`
- Modify: `public/inscricao.html:236-252`
- Create: `scripts/verify-hero-mobile.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run verify:hero-mobile`, que requer uma base em `LEPV_BASE` ou `PORT`.

- [ ] **Step 1: Write failing visual/structural checks**

```js
// scripts/verify-hero-mobile.js
const { chromium } = require('playwright');
const BASE = process.env.LEPV_BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const overlap = await page.evaluate(() => {
    const art = document.querySelector('.hero-art').getBoundingClientRect();
    return [...document.querySelectorAll('.hero-in .btn')].some(btn => {
      const r = btn.getBoundingClientRect();
      return art.bottom > r.top && art.top < r.bottom;
    });
  });
  await browser.close();
  if (overlap) throw new Error('hero art intersects a mobile CTA');
})();
```

Add to `tests/frontend-modules.js`:

```js
const signup = fs.readFileSync('public/inscricao.html', 'utf8');
assert.match(signup, /<fieldset class="ack-group">/);
assert.match(signup, /<legend>Datas alternativas que também funcionariam<\/legend>/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/frontend-modules.js && node scripts/verify-hero-mobile.js`  
Expected: structural assertion and CTA-overlap check fail before the markup/CSS changes.

- [ ] **Step 3: Implement minimal fixes**

```css
@media (max-width:719px) {
  .hero-art { display:none; }
}
```

Replace the dates container with this semantic equivalent, retaining child inputs and IDs:

```html
<fieldset class="ack-group">
  <legend>Datas alternativas que também funcionariam</legend>
  <!-- existing three labels and conditional text input remain here -->
</fieldset>
```

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && node scripts/verify-hero-mobile.js && node scripts/verify-hero-text.js --base=http://127.0.0.1:3000 && node scripts/verify-ui.js --base=http://127.0.0.1:3000`  
Expected: all commands exit 0 at 390 px and 1440 px.

- [ ] **Step 5: Commit**

```bash
git add public/home.html public/inscricao.html scripts/verify-hero-mobile.js package.json tests/frontend-modules.js
git commit -m "fix: protect mobile hero actions and group signup dates"
```

## Task 8: Tornar fontes e comando completo resilientes localmente

**Files:**
- Modify: `public/home.html:18-20`
- Modify: `public/app.html:11-13`
- Modify: `public/evento.html:10-12`
- Modify: `public/inscricao.html:10-12`
- Modify: `public/login.html:12-14`
- Modify: `public/presenca.html:10-12`
- Create: `scripts/verify-local.js`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run verify:local`; inicia `node server.js` em uma porta livre, espera `/health`, roda verificações dependentes de browser e encerra o filho em `finally`.

- [ ] **Step 1: Write failing command test**

```js
// add to tests/frontend-modules.js
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(pkg.scripts.verify, 'node scripts/verify-local.js');
assert.match(fs.readFileSync('scripts/verify-local.js', 'utf8'), /finally/);
assert.match(fs.readFileSync('scripts/verify-local.js', 'utf8'), /RAILWAY_VOLUME_MOUNT_PATH/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/frontend-modules.js`  
Expected: assertion failure because `verify` is currently a shell chain that assumes a pre-started server.

- [ ] **Step 3: Implement the local runner**

`verify-local.js` must use `fs.mkdtempSync(path.join(os.tmpdir(), 'lepv-verify-'))`,
`spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: port, RAILWAY_VOLUME_MOUNT_PATH: volume } })`, poll `/health`,
run `npm test`, static checks and all browser scripts with `LEPV_BASE`, then kill the server and remove only
the exact temporary directory in a `finally` block. Replace remote font stylesheet links with local font
assets only when licensed files are added to `public/fonts/`; otherwise retain the fallback CSS and update
`verify-ui.js` to report blocked Google font requests as `external-font-warning`, not application-console error.

- [ ] **Step 4: Verify**

Run: `node tests/frontend-modules.js && npm run verify`  
Expected: exit code 0 from a fresh terminal, no manually started server, and `data/` has no changed files.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verify-local.js scripts/verify-ui.js public README.md tests/frontend-modules.js
git commit -m "test: make LEPV verification self-contained"
```

## Task 9: Run full regression, inspect scope, and hand off

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-modularizacao-frontend-design.md` only if implementation revealed a contract contradiction.

- [ ] **Step 1: Run complete verification**

Run: `npm run verify`  
Expected: all e2e, static, contrast, mobile hero, UI, hero, reveal, consistency, app, tabs and tags checks exit 0.

- [ ] **Step 2: Inspect the final change set**

Run: `git diff --check HEAD~8..HEAD && git status --short`  
Expected: no whitespace errors; only intended source/test/doc changes; preserve unrelated `marketing/` files.

- [ ] **Step 3: Verify required outcomes manually in Playwright**

Run: `node scripts/verify-ui.js --base=http://127.0.0.1:3000 && node scripts/verify-hero-mobile.js`  
Expected: no horizontal overflow, all required hit areas pass, reduced-motion content remains visible, hero art does not cross mobile CTAs.

- [ ] **Step 4: Commit the final verification-only documentation change when needed**

```bash
git add docs/superpowers/specs/2026-09-01-modularizacao-frontend-design.md
git commit -m "docs: record frontend migration verification"
```

Do not create this commit when the specification did not change.
