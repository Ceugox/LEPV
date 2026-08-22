# Redesign da UI do LEPV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a identidade visual de todas as superfícies do lepv.org — papel claro, serif editorial no display, relevo topográfico gerado em SVG e revelação ligada ao progresso do scroll — sem quebrar API, PWA, deploy manual nem os 37 casos de `npm test`.

**Architecture:** Os tokens vivem num lugar só (`public/styles.css`) e as cinco páginas já o linkam, então a troca de paleta e tipografia propaga por herança. A arte generativa e as engines de scroll entram como um único arquivo novo e autocontido (`public/art.js`, expõe `window.LEPVArt`). Cada página passa a consumir esses dois arquivos; nenhuma lógica de negócio é tocada.

**Tech Stack:** HTML/CSS/JS vanilla, sem build e sem CDN. Node/Express no servidor. Google Fonts (Instrument Serif + Archivo). Playwright (Node) só para o script de verificação. Python 3 + Pillow só para gerar os assets da marca, uma vez.

**Spec:** `docs/superpowers/specs/2026-08-22-lepv-ui-redesign-design.md`
**Protótipo aprovado:** `docs/superpowers/prototypes/v6-liga.html` (+ `art.js`, `shared.css` e `assets/logo-mark*.png` na mesma pasta)

## Global Constraints

- **Vanilla, sem build.** Nenhuma dependência de runtime nova, nenhum CDN, nenhum passo de bundling. `package.json` só pode ganhar `devDependencies`.
- **Cor sempre por token.** Nenhum hex novo fora de `:root`. Exceção legítima já existente: `color: #fff` sobre superfície escura (`var(--navy)`, `var(--red)`).
- **Em `app.html`, `--white` é superfície de card, não cor de texto.** Nunca usar como cor de texto.
- **O tema da imersão está fora de escopo.** `body.imersao` mantém navy + `#D31E24`. Nenhuma regra `body.imersao` deve ser alterada.
- **Posicionamento (restrição de redação, spec §1.1):** a liga **gera um ambiente de fomento ao empreendedorismo no IME**. Visitas, aulas e reuniões são meios, não o fim. Nenhum texto pode descrever a liga como intermediária de visitas.
- **Ordem dos indicadores (spec §9.1):** membros ativos · turmas representadas · especialidades do IME · **empresas na rede** · primeira missão. O rótulo é "empresas na rede", não "empresas visitadas".
- **Sem a linha do IME no selo da capa.** "Instituto Militar de Engenharia · Fundada em 2026" foi removida por decisão do Marcell.
- **Alvo de toque ≥ 44px** em tudo que é clicável.
- **Inputs em `font-size: 16px`** — é o mínimo que evita o zoom automático do Safari iOS.
- **Piso de 40px de altura para a marca.** Abaixo disso os dentes da engrenagem viram serrilha.
- **`prefers-reduced-motion: reduce` desliga todo movimento** e entrega o conteúdo inteiro visível.
- **`--p` só pode ser declarado em `:root`.** Declará-lo em `.rv` ou `.contour` sombreia o valor inline que o JS escreve.
- **Push e deploy exigem autorização explícita do Marcell a cada vez.** Nenhuma task deste plano faz `git push` ou `railway up`.
- **Testar sempre com volume isolado:** `RAILWAY_VOLUME_MOUNT_PATH` apontando para diretório temporário. Nunca contra os dados reais.

## Contexto medido (não presumir outra coisa)

Levantado antes de escrever este plano:

| Fato | Valor |
|---|---|
| Páginas que linkam `styles.css` | **todas as 5** (`home`, `app`, `login`, `inscricao`, `presenca`) |
| `app.html` — CSS inline | linhas 15–1138 (~1123 linhas) |
| `app.html` — `:root` próprio | só adiciona `--line-strong`; **não** duplica tokens |
| `app.html` — hex hardcoded | 71 total: 14 no tema da imersão (fora de escopo), 57 fora dele — e **destes, só ~8 são trabalho real**; o resto é `color:#fff` legítimo sobre superfície escura |
| `home.html` — CSS inline | linhas 38–187 |
| `login.html` / `inscricao.html` / `presenca.html` — CSS inline | 164 / 66 / 55 linhas |
| **`npm test` (37 casos)** | testa **API, não markup**. Única referência a HTML: a URL `/inscricao.html?t=` |

**Consequência crítica:** a suíte existente **não valida a UI**. Ela é rede de segurança contra regressão de backend e nada mais. É por isso que a Task 1 cria um verificador visual versionado — sem ele, este redesign não tem sinal executável nenhum.

## File Structure

```
public/
  styles.css              MODIFICAR  tokens (cor + tipografia), reveal, contorno, componentes base
  art.js                  CRIAR      arte generativa + engines de scroll. Expõe window.LEPVArt
  assets/
    logo-mark.png         CRIAR      marca colorida, fundo transparente
    logo-mark-white.png   CRIAR      monocromática branca (band preto)
    logo-mark-ink.png     CRIAR      monocromática escura
  home.html               MODIFICAR  landing: cabeçalho de documento, figura, índice, band
  login.html              MODIFICAR  aplicar tokens + reveal
  inscricao.html          MODIFICAR  aplicar tokens + reveal
  presenca.html           MODIFICAR  aplicar tokens + reveal
  app.html                MODIFICAR  tipografia display, ~8 hex, alvos de toque, reveal
  app.js                  MODIFICAR  só adicionar classes .rv na marcação gerada. Zero lógica
scripts/
  build-logo-assets.py    CRIAR      deriva os 3 PNGs de marketing/logo.jpeg
  check-contrast.py       CRIAR      razões WCAG dos pares de token
  verify-ui.js            CRIAR      medição por Playwright em 390px e 1440px
package.json              MODIFICAR  scripts verify:ui, check:contrast; devDependency playwright
```

`art.js` é a única peça nova de JS e é autocontida — não importa nada e não depende de ordem de carregamento além de vir antes do script inline da página.

---

### Task 1: Verificador visual versionado

Primeiro de todos, porque é o único sinal executável que valida UI. Escrever, rodar contra o site **atual** (deve reprovar), e só então seguir.

**Files:**
- Create: `scripts/verify-ui.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `node scripts/verify-ui.js [--base=http://127.0.0.1:PORT]` → sai com código 0 se tudo passa, 1 se qualquer checagem falha. Imprime uma linha por checagem.

- [ ] **Step 1: Instalar o Playwright como devDependency**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV
npm install --save-dev playwright
npx playwright install chromium
```

Esperado: `added N packages`, e o Chromium baixado.

- [ ] **Step 2: Escrever o verificador**

Create `scripts/verify-ui.js`:

```js
/* Verificação visual do LEPV. Mede, não julga por aparência.
   Uso: node scripts/verify-ui.js [--base=http://127.0.0.1:3000]

   Sai 1 se qualquer checagem falhar. É este script, e não `npm test`,
   que protege a UI — a suíte e2e só cobre API. */
const { chromium } = require('playwright');

const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://127.0.0.1:3000').slice(7);
const PAGES = ['/', '/login.html', '/presenca.html'];
const WIDTHS = [390, 1440];

let failures = 0;
function check(ok, label, detail) {
  const mark = ok ? 'ok  ' : 'FALHA';
  console.log(`  ${mark} ${label}${detail !== undefined ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    for (const path of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      console.log(`\n[${width}px] ${path}`);

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const tappable = [...document.querySelectorAll('a[href],button,input,select,[role=tab]')]
          .filter(el => el.getBoundingClientRect().height > 0);
        const heights = tappable.map(el => Math.round(el.getBoundingClientRect().height));
        const inputs = [...document.querySelectorAll('input,select,textarea')]
          .map(el => parseFloat(getComputedStyle(el).fontSize));
        const marks = [...document.querySelectorAll('img[src*="logo-mark"]')]
          .map(el => Math.round(el.getBoundingClientRect().height))
          .filter(h => h > 0);
        return {
          overflowX: de.scrollWidth - de.clientWidth,
          minTap: heights.length ? Math.min(...heights) : null,
          minInputFont: inputs.length ? Math.min(...inputs) : null,
          markHeights: marks,
          hasArt: typeof window.LEPVArt !== 'undefined'
        };
      });

      check(m.overflowX === 0, 'sem overflow horizontal', `overflowX=${m.overflowX}`);
      if (m.minTap !== null) check(m.minTap >= 44, 'alvo de toque >= 44px', `menor=${m.minTap}`);
      if (m.minInputFont !== null) check(m.minInputFont >= 16, 'input >= 16px', `menor=${m.minInputFont}`);
      for (const h of m.markHeights) check(h >= 40, 'marca >= 40px', `altura=${h}`);

      // a revelação tem de ser progressiva: --p precisa assumir valor intermediário
      const progressive = await page.evaluate(async () => {
        const el = document.querySelector('.rv');
        if (!el) return 'sem-rv';
        const seen = new Set();
        for (const y of [0, 150, 300, 600, 1200]) {
          window.scrollTo(0, y);
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          seen.add(el.style.getPropertyValue('--p') || '0');
        }
        const vals = [...seen].map(Number).filter(v => v > 0 && v < 1);
        return vals.length > 0 ? 'progressivo' : 'binario';
      });
      if (progressive !== 'sem-rv') {
        check(progressive === 'progressivo', 'revelação ligada ao scroll', progressive);
      }

      // o contorno tem de preencher exatamente o contêiner
      const contour = await page.evaluate(() => {
        const svg = document.querySelector('.contour');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        return { w: Math.round(r.width), h: Math.round(r.height), vb,
                 paths: svg.querySelectorAll('path').length };
      });
      if (contour) {
        check(Math.abs(contour.vb[2] - contour.w) <= 1 && Math.abs(contour.vb[3] - contour.h) <= 1,
              'viewBox == box renderizado', `vb=${contour.vb[2]}x${contour.vb[3]} box=${contour.w}x${contour.h}`);
        check(contour.paths > 10, 'contorno gerou traços', `${contour.paths} paths`);
      }

      check(errors.length === 0, 'sem erro de console', errors.slice(0, 2).join(' | ') || 'nenhum');
      await page.close();
    }
    await ctx.close();
  }

  // prefers-reduced-motion: conteúdo inteiro visível, nada em movimento
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  console.log('\n[reduced-motion] /');
  const rm = await page.evaluate(() => {
    const hidden = [...document.querySelectorAll('.rv')]
      .filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length;
    const paths = [...document.querySelectorAll('.contour path')];
    const undrawn = paths.filter(p => parseFloat(getComputedStyle(p).strokeDashoffset) > 1).length;
    return { hidden, undrawn, total: paths.length };
  });
  check(rm.hidden === 0, 'nada escondido sob reduced-motion', `${rm.hidden} elementos com opacity<1`);
  check(rm.undrawn === 0, 'contorno inteiro desenhado', `${rm.undrawn}/${rm.total} traços pendentes`);
  await ctx.close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'TUDO PASSOU' : failures + ' CHECAGEM(NS) FALHOU(RAM)'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Registrar o script no package.json**

Modify `package.json`, no bloco `"scripts"`, adicionando a linha:

```json
"verify:ui": "node scripts/verify-ui.js"
```

- [ ] **Step 4: Subir o servidor com volume isolado, em background**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV
mkdir -p /tmp/lepv-vol-verify
RAILWAY_VOLUME_MOUNT_PATH=/tmp/lepv-vol-verify TRAVEL_ESTIMATE=off PORT=3111 node server.js
```

Rodar em background. Esperado no log: `rodando em`.

- [ ] **Step 5: Rodar o verificador contra o site ATUAL — deve reprovar**

```bash
node scripts/verify-ui.js --base=http://127.0.0.1:3111
```

Esperado: **FALHA**. O site atual não tem `.rv`, não tem `.contour`, não tem `window.LEPVArt` e não tem `logo-mark`. As checagens dessas peças são puladas (não existem ainda), mas `alvo de toque >= 44px` deve reprovar em 390px, porque hoje o `nav-cta` e o hambúrguer estão abaixo disso.

Anotar a saída. É o baseline: cada task seguinte reduz o número de falhas.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-ui.js package.json package-lock.json
git commit -m "Adiciona verificador visual medido por Playwright

A suite e2e cobre API e nao valida UI nenhuma. Este script mede
overflow horizontal, alvo de toque, tamanho de input, altura da marca,
se a revelacao e progressiva, se o viewBox do contorno bate com o box
renderizado e o comportamento sob prefers-reduced-motion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Assets da marca

**Files:**
- Create: `scripts/build-logo-assets.py`
- Create: `public/assets/logo-mark.png`, `public/assets/logo-mark-white.png`, `public/assets/logo-mark-ink.png`
- Reference: `docs/superpowers/prototypes/assets/` (os três PNGs já gerados e aprovados)

**Interfaces:**
- Produces: os três arquivos em `public/assets/`, servidos estaticamente pelo Express (confirmar que `public/` já é servido como raiz estática).

- [ ] **Step 1: Escrever o gerador**

Create `scripts/build-logo-assets.py`:

```python
"""Deriva os assets web da marca a partir de marketing/logo.jpeg.

A arte foi achatada sobre fundo branco. Se observado = C*a + 255*(1-a),
então a = (255 - min(canal))/255 recupera bem tanto o preto da engrenagem
quanto o vinho saturado, e daí desfazemos a mistura para achar C.

Requer Pillow. Roda uma vez; o resultado é versionado.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "marketing", "logo.jpeg")
OUT = os.path.join(ROOT, "public", "assets")
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
w, h = im.size
src = im.load()

out = Image.new("RGBA", (w, h))
dst = out.load()
for y in range(h):
    for x in range(w):
        r, g, b = src[x, y]
        a = 255 - min(r, g, b)
        if a <= 6:
            dst[x, y] = (0, 0, 0, 0)
            continue
        af = a / 255.0
        dst[x, y] = (
            int(max(0, min(255, (r - 255 * (1 - af)) / af))),
            int(max(0, min(255, (g - 255 * (1 - af)) / af))),
            int(max(0, min(255, (b - 255 * (1 - af)) / af))),
            a,
        )

out = out.crop(out.getbbox())
full = out.resize((1024, round(1024 * out.size[1] / out.size[0])), Image.LANCZOS)
full.save(os.path.join(OUT, "logo-mark.png"))
print("logo-mark.png", full.size)

fp = full.load()
for name, rgb in (("logo-mark-white.png", (255, 255, 255)), ("logo-mark-ink.png", (18, 18, 20))):
    mono = Image.new("RGBA", full.size)
    mp = mono.load()
    for y in range(full.size[1]):
        for x in range(full.size[0]):
            mp[x, y] = rgb + (fp[x, y][3],)
    mono.save(os.path.join(OUT, name))
    print(name, mono.size)
```

- [ ] **Step 2: Rodar**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV
python scripts/build-logo-assets.py
```

Esperado:
```
logo-mark.png (1024, 970)
logo-mark-white.png (1024, 970)
logo-mark-ink.png (1024, 970)
```

- [ ] **Step 3: Verificar que o Express serve os assets**

Com o servidor da Task 1 no ar:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3111/assets/logo-mark.png
```

Esperado: `200 image/png`. Se der 404, conferir a configuração de `express.static` em `server.js` e servir `public/assets` explicitamente.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-logo-assets.py public/assets/
git commit -m "Gera os assets web da marca a partir do JPEG

Alfa por distancia do branco com a cor original recuperada da mistura,
recorte pelo bounding box, mais as versoes monocromatica branca e escura.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tokens e checagem de contraste

**Files:**
- Modify: `public/styles.css:4-38` (o bloco `:root`)
- Create: `scripts/check-contrast.py`
- Modify: `package.json`

**Interfaces:**
- Produces: tokens `--paper`, `--paper-2`, `--card`, `--ink`, `--ink-2`, `--ink-3`, `--band`, `--line`, `--line-2`, `--wine`, `--wine-2`, `--fd`, `--f`, e os históricos `--navy`/`--red` remapeados para os novos valores. Consumido por todas as páginas e por `art.js` (que lê `--wine` como cor padrão do traço).

- [ ] **Step 1: Escrever o checador de contraste**

Create `scripts/check-contrast.py`:

```python
"""Razoes WCAG dos pares de token em uso. Sai 1 se algum par falhar AA.

Rodar sempre que um token de cor mudar. A tabela do spec (secao 6.1) e a
saida deste script; nao conferir contraste de olho.
"""
import sys

def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def lum(hx):
    hx = hx.lstrip("#")
    r, g, b = (int(hx[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def over(fg, alpha, bg):
    fh, bh = fg.lstrip("#"), bg.lstrip("#")
    return "#%02X%02X%02X" % tuple(
        round(int(fh[i:i + 2], 16) * alpha + int(bh[i:i + 2], 16) * (1 - alpha))
        for i in (0, 2, 4)
    )

T = {
    "paper": "#FAF8F5", "paper-2": "#F3EFE9", "card": "#FFFFFF", "band": "#0A0A0B",
    "ink": "#121214", "ink-2": "#3D3940", "ink-3": "#736D77",
    "wine": "#7F0A1A", "wine-2": "#9E1F30", "white": "#FFFFFF",
}

PAIRS = [
    ("ink", "paper"), ("ink", "card"),
    ("ink-2", "paper"), ("ink-2", "card"),
    ("ink-3", "paper"), ("ink-3", "card"),
    ("wine", "paper"), ("wine", "paper-2"), ("wine-2", "paper"),
    ("white", "wine"), ("paper", "band"),
]

fails = 0
print(f"{'par':30s} {'razao':>6s}  AA-normal")
print("-" * 50)
for a, b in PAIRS:
    r = ratio(T[a], T[b])
    ok = r >= 4.5
    if not ok:
        fails += 1
    print(f"{a + ' / ' + b:30s} {r:6.2f}  {'passa' if ok else 'FALHA'}")

# rotulo do marquee: branco translucido sobre o band
lab = over("#FFFFFF", 0.55, T["band"])
r = ratio(lab, T["band"])
ok = r >= 4.5
if not ok:
    fails += 1
print(f"{'marquee (branco 55%) / band':30s} {r:6.2f}  {'passa' if ok else 'FALHA'}")

print(f"\n{fails} par(es) abaixo de AA")
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: Rodar — deve passar**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV
python scripts/check-contrast.py
```

Esperado: doze linhas com `passa`, `0 par(es) abaixo de AA`, código de saída 0.

- [ ] **Step 3: Registrar no package.json**

Adicionar em `"scripts"`:

```json
"check:contrast": "python scripts/check-contrast.py"
```

- [ ] **Step 4: Trocar o bloco `:root` de styles.css**

Modify `public/styles.css`, substituindo o `:root` atual (linhas 4–38) por:

```css
/* Identidade da LIGA. Cores amostradas de marketing/logo.jpeg:
   engrenagem #090909, vinho da seta e das ondas #7F0A1A.
   Os nomes --navy/--red são históricos e continuam apontando para os
   valores da liga, porque body.imersao os sobrescreve. */
:root {
  --paper:   #FAF8F5;
  --paper-2: #F3EFE9;
  --card:    #FFFFFF;
  --band:    #0A0A0B;
  --ink:     #121214;
  --ink-2:   #3D3940;
  /* #736D77 e não #7C7580: o tom anterior dava 4.20 sobre papel, abaixo
     de AA, e ele carrega data e vagas do índice em 13px. Agora 4.74. */
  --ink-3:   #736D77;
  --line:    #E2DCD4;
  --line-2:  #CDC4B9;
  --wine:    #7F0A1A;
  --wine-2:  #9E1F30;

  /* aliases históricos — o resto do CSS e o app referenciam estes nomes */
  --navy: var(--ink);
  --navy-2: #2A2A31;
  --navy-soft: #202025;
  --navy-line: rgba(255,255,255,0.14);
  --white: var(--card);
  --offwhite: var(--paper);
  --graphite: var(--ink-2);
  --graphite-soft: var(--ink-3);
  --red: var(--wine);
  --red-2: var(--wine-2);
  --red-hover: #6A0715;
  --red-glow: rgba(127,10,26,0.28);
  --navy-glow: rgba(18,18,20,0.26);

  --good: #15803D; --good-soft: #EAF6EE;
  --pending: #B45309; --pending-soft: #FDF3E3;
  --internal: #64748B; --internal-soft: #EEF1F5;
  --lunch: #B8752E; --lunch-soft: #FBF1E4; --lunch-dark: #8A5A21;

  --fd: "Instrument Serif", Georgia, serif;
  --f:  "Archivo", system-ui, -apple-system, sans-serif;
  /* aliases históricos de fonte */
  --font-display: var(--fd);
  --font-body: var(--f);

  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px;
  --r: 6px;
  --pad: 20px;
  --max: 1220px;
  /* progresso de scroll: mora na raiz para que o valor inline escrito pelo
     JS sempre vença. Declarar em .rv ou .contour sombreia o inline. */
  --p: 0;

  --gradient-primary: linear-gradient(135deg, var(--ink) 0%, var(--wine) 100%);
  --gradient-primary-15: linear-gradient(135deg, rgba(18,18,20,0.10) 0%, rgba(127,10,26,0.08) 100%);
  --shadow-soft: 0 1px 2px rgba(18,18,20,0.05), 0 10px 28px -10px rgba(18,18,20,0.14);
  --shadow-lift: 0 16px 36px -10px rgba(18,18,20,0.22);
  color-scheme: light;
}
@media (min-width: 720px)  { :root { --pad: 32px } }
@media (min-width: 1100px) { :root { --pad: 40px } }
```

**Atenção:** manter o bloco `body.imersao` que vem depois **exatamente como está**. Ele redefine `--navy`/`--red` para navy + `#D31E24` e é o que preserva a identidade do acervo.

- [ ] **Step 5: Trocar o link das fontes nas cinco páginas**

Em `home.html`, `app.html`, `login.html`, `inscricao.html` e `presenca.html`, substituir o `<link>` do Google Fonts por:

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 6: Rodar a suíte e o verificador**

```bash
npm test
node scripts/verify-ui.js --base=http://127.0.0.1:3111
```

Esperado: `npm test` com os **37 casos passando** (nada de API mudou). O verificador continua reprovando em alvo de toque — isso é esperado, resolve na Task 6.

- [ ] **Step 7: Commit**

```bash
git add public/styles.css public/*.html scripts/check-contrast.py package.json
git commit -m "Troca a paleta e a tipografia pelos tokens da marca

Cores amostradas da logo (vinho #7F0A1A, engrenagem #090909) e display em
Instrument Serif com Archivo na UI. Os nomes historicos --navy/--red
passam a apontar para os novos valores por alias, entao body.imersao
continua sobrescrevendo normalmente e o acervo nao muda.

--ink-3 e #736D77 e nao #7C7580 porque o tom anterior falhava AA.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `art.js` — arte generativa

**Files:**
- Create: `public/art.js`
- Reference: `docs/superpowers/prototypes/art.js` (implementação aprovada e verificada)

**Interfaces:**
- Produces: `window.LEPVArt` com:
  - `contour(svgOrGroup, opts)` → `{terrain, W, base, peakH, paths}`. Opções: `W`, `base`, `peakH`, `levels`, `ribStep`, `stagger`, `drawWindow`, `waves`, `waveAmp`, `waveGap`, `waveDrop`, `from`, `to`, `fadeLow`, `fadeMid`, `fadeHigh`, `ribs`, `sea`.
  - `fitContour(svg, opts)` → `{rebuild}`. Dimensiona ao contêiner e regenera em resize.
  - `makeTerrain(W, peakH)` → `(x) => altura`
  - `silhouettePath(terrain, W, base, step)` → string de path fechado
  - `maskedPhoto(svg, href, opts)` → `{terrain, W, base}`
  - `drawOnEnter(el, cls)`, `drawOnScroll(container)`, `reveal(sel)`, `countUp(sel)`, `parallax(el, strength)`

- [ ] **Step 1: Copiar a implementação aprovada**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV
cp docs/superpowers/prototypes/art.js public/art.js
```

Esse arquivo já contém as três correções que vieram da prototipagem, e **elas não podem ser desfeitas**:

1. O gradiente usa `gradientUnits="userSpaceOnUse"`. Com `objectBoundingBox` uma costela vertical tem caixa de largura zero, o gradiente degenera e a linha **não pinta**.
2. As ondas recebem cor sólida via o 4º argumento de `add()`, porque ficam abaixo da linha-base, fora da faixa do gradiente.
3. `fitContour` define o `viewBox` como o box em pixels. Com `viewBox` fixo, `meet` deixa faixa vazia nas laterais e `slice` corta os picos.

- [ ] **Step 2: Checar sintaxe**

```bash
node --check public/art.js
```

Esperado: sem saída (sucesso).

- [ ] **Step 3: Escrever a página de teste da arte**

Create `scripts/fixtures/art-test.html` (fixture, não vai para `public/`):

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>art.js — fixture</title>
<style>
  :root{--p:0}
  #box{width:900px;height:260px}
  .contour path{stroke-dasharray:var(--len,1200);
    stroke-dashoffset:calc(var(--len,1200) *
      (1 - clamp(0, (var(--p) - var(--s,0)) / var(--w,.42), 1)))}
</style></head>
<body>
<svg id="box" class="contour"></svg>
</body></html>
```

O fixture **não** carrega `art.js` sozinho: o verificador o injeta com `addScriptTag`,
porque a página abre por `file://` e um `<script src="/art.js">` daria 404.

- [ ] **Step 4: Verificar a arte por medição**

Create `scripts/verify-art.js`:

```js
/* Mede a arte generativa: viewBox igual ao box, traços gerados, costelas
   VISÍVEIS (a regressão do gradiente degenerado), e dashoffset reagindo a --p. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await page.goto('file://' + path.resolve(__dirname, 'fixtures/art-test.html').replace(/\\/g, '/'));
  // o fixture carrega /art.js por caminho absoluto; servir a pasta public
  await page.addScriptTag({ path: path.resolve(__dirname, '../public/art.js') });
  await page.evaluate(() => { window.__r = LEPVArt.fitContour(document.getElementById('box'), { waves: true }); });
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => {
    const svg = document.getElementById('box');
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const paths = [...svg.querySelectorAll('path')];
    // uma costela é um path com d de dois pontos e x igual nos dois
    const ribs = paths.filter(p => {
      const d = p.getAttribute('d');
      const mm = d.match(/^M([\d.]+) [\d.]+ L([\d.]+) /);
      return mm && mm[1] === mm[2];
    });
    const grad = svg.querySelector('linearGradient');
    document.documentElement.style.setProperty('--p', '0.5');
    const half = paths.map(p => parseFloat(getComputedStyle(p).strokeDashoffset));
    document.documentElement.style.setProperty('--p', '1');
    const full = paths.map(p => parseFloat(getComputedStyle(p).strokeDashoffset));
    return {
      box: [Math.round(r.width), Math.round(r.height)], vb,
      total: paths.length, ribs: ribs.length,
      gradientUnits: grad && grad.getAttribute('gradientUnits'),
      halfDrawnSome: half.some(v => v > 1), fullyDrawn: full.every(v => v <= 1)
    };
  });

  const checks = [
    [m.vb[2] === m.box[0] && m.vb[3] === m.box[1], `viewBox ${m.vb[2]}x${m.vb[3]} == box ${m.box[0]}x${m.box[1]}`],
    [m.total > 30, `traços gerados: ${m.total}`],
    [m.ribs > 10, `costelas presentes: ${m.ribs}`],
    [m.gradientUnits === 'userSpaceOnUse', `gradientUnits=${m.gradientUnits}`],
    [m.halfDrawnSome, 'em --p=0.5 há traço pendente (desenho parcial)'],
    [m.fullyDrawn, 'em --p=1 tudo desenhado']
  ];
  let bad = 0;
  for (const [ok, label] of checks) { console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}`); if (!ok) bad++; }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Rodar**

```bash
node scripts/verify-art.js
```

Esperado: seis linhas `ok`, código de saída 0. Em especial `costelas presentes` > 10 — se der 0, o gradiente voltou a degenerar.

- [ ] **Step 6: Commit**

```bash
git add public/art.js scripts/verify-art.js scripts/fixtures/art-test.html
git commit -m "Adiciona art.js: relevo generativo e engines de scroll

Silhueta do Pao de Acucar e do Morro da Urca a partir de tres gaussianas,
seguindo a logo. Contorno, costelas e as duas ondas cruzadas derivam dela.
viewBox dimensionado ao conteiner em pixels, gradiente em userSpaceOnUse
e revelacao/desenho ligados ao progresso do scroll.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Regras de reveal e contorno em `styles.css`

**Files:**
- Modify: `public/styles.css` (acrescentar depois do bloco `body.imersao`)

**Interfaces:**
- Consumes: `--p` de `:root` (Task 3), escrito inline por `LEPVArt.reveal` e `LEPVArt.drawOnScroll` (Task 4).
- Produces: as classes `.rv`, `.rv-l`, `.rv-r`, `.rv-s` e a regra `.contour path`, usadas por todas as páginas nas Tasks 6–9.

- [ ] **Step 1: Acrescentar as regras**

Modify `public/styles.css`, inserindo após o fechamento do bloco `body.imersao`:

```css
/* ---------- revelação ligada ao progresso do scroll ----------
   O JS publica --p (0→1) em cada .rv conforme o elemento sobe pela tela.
   Nada aqui tem duração própria: o estado é função direta de onde a
   página está. Rolar devagar revela devagar. --i escalona irmãos. */
.rv{
  --pi: clamp(0, (var(--p) - var(--i,0) * 0.09) / 0.72, 1);
  opacity: var(--pi);
  transform: translate3d(0, calc((1 - var(--pi)) * 26px), 0);
  will-change: opacity, transform;
}
.rv.in{ will-change: auto }
.rv-l{ transform: translate3d(calc((1 - var(--pi)) * -28px), 0, 0) }
.rv-r{ transform: translate3d(calc((1 - var(--pi)) * 28px), 0, 0) }
.rv-s{ transform: scale(calc(0.96 + var(--pi) * 0.04)) }

/* ---------- contorno: cada traço se desenha na sua fatia do scroll ----------
   --s = onde o traço começa no curso; --w = quanto do curso consome.
   Uma escrita de --p no contêiner move todas as linhas. */
.contour path{
  stroke-dasharray: var(--len, 1200);
  stroke-dashoffset: calc(var(--len, 1200) *
    (1 - clamp(0, (var(--p) - var(--s,0)) / var(--w,.42), 1)));
}

@media (prefers-reduced-motion: reduce){
  .rv{ opacity:1 !important; transform:none !important; will-change:auto }
  .contour path{ stroke-dashoffset:0 !important }
  .strip-track, .m-track, .strip-tr, .mq-tr{ animation:none !important }
}
```

- [ ] **Step 2: Garantir o alvo de toque nos componentes base**

Modify `public/styles.css`, no `.btn-primary` e `.btn-ghost`, acrescentando a cada um:

```css
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 46px;
```

- [ ] **Step 3: Rodar a suíte**

```bash
npm test
```

Esperado: 37 passando.

- [ ] **Step 4: Commit**

```bash
git add public/styles.css
git commit -m "Adiciona as regras de revelacao por scroll e do contorno

Opacidade e deslocamento derivam de --p em calc, sem duracao propria, e
prefers-reduced-motion entrega tudo visivel e parado. Botoes base ganham
min-height de 46px.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `home.html` — a landing

A maior mudança visual e a página que o executivo vê. O protótipo aprovado é a referência estrutural.

**Files:**
- Modify: `public/home.html` (CSS inline em 38–187; corpo a partir de 191)
- Reference: `docs/superpowers/prototypes/v6-liga.html`

**Interfaces:**
- Consumes: tokens (Task 3), `.rv`/`.contour` (Task 5), `window.LEPVArt` (Task 4), `/assets/logo-mark.png` (Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Trocar o `<head>`**

Modify `public/home.html`, garantindo no `<head>`:

```html
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#121214">
<link rel="stylesheet" href="/styles.css">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Substituir a estrutura pela do protótipo**

Portar de `docs/superpowers/prototypes/v6-liga.html` para `home.html`:

- o `<nav>` com `.brand` (wordmark serif + `img` da marca condicional), `.nav-links`, `.nav-cta`, `.burger`
- o `<header class="doc" id="hero">` com `.doc-ph` (foto lavada), `.doc-in`, `.stamp` (marca 58–72px + nome da liga, **sem** a linha do IME), `h1`, `.abstract` (capitular + `aside` com a lista de dados na ordem da §9.1), `.acts`
- o `.rule2` e a `<figure class="fig" id="fig">` com `<svg class="contour">` e `<figcaption class="fig-cap">`
- a `.ticker` com os cinco números (`data-count` nos quatro primeiros)
- as seções `I.` (verbete do próximo evento) e `II.` (índice do semestre)
- a seção `III.` com a `.strip` de fotos
- o `.mq-band` com o marquee de logos
- o `<div class="peek" id="peek">`

O CSS inline de `home.html` passa a ser o `<style>` de `v6-liga.html` **menos** o que já vive em `styles.css` (tokens, `.rv`, `.contour path`, nav, botões, strip, marquee, footer).

**Texto obrigatório** (Global Constraints): o parágrafo do `.abstract` é

> A LEPV constrói no IME o ambiente que o empreendedorismo precisa para existir: gente que se encontra toda semana, repertório que não está na grade curricular e uma rede de empresas e alumni ao alcance de quem está começando. Reuniões, aulas e visitas são os meios. O fim é um lugar onde fundar algo deixe de ser exceção dentro da engenharia.

- [ ] **Step 3: Preservar o JS de dados existente**

`home.html` já busca `/api/public-events` e monta o card de destaque e a grade (a partir da linha ~370 do arquivo atual, funções que usam `escHtml`). **Não reescrever essa lógica.** Adaptar apenas os templates de string para emitir a marcação nova:

- o evento em destaque emite o `.entry` (foto / `.mid` / `.side`)
- os demais emitem linhas `.irow` do índice
- cada item recebe `class="... rv"` e `style="--i:N"` com N crescente
- após inserir no DOM, chamar de novo `LEPVArt.reveal('.irow.rv')` para observar os elementos criados depois do boot

- [ ] **Step 4: Acrescentar o script de inicialização no fim do `<body>`**

```html
<script src="/art.js"></script>
<script>
  LEPVArt.fitContour(document.querySelector('.contour'),
    {waves:true, fill:.90, waveAmpRatio:.058, stagger:17, drawWindow:.40,
     fadeLow:.14, fadeMid:.52, fadeHigh:.92});
  LEPVArt.drawOnScroll(document.getElementById('fig'));
  LEPVArt.reveal();
  LEPVArt.countUp('[data-count]');
  LEPVArt.parallax(document.querySelector('.doc-ph img'), .10);

  /* a marca só entra no nav depois que o cabeçalho sai de cena */
  (function(){
    const nav = document.querySelector('nav'), head = document.getElementById('hero');
    if (!nav || !head) return;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { nav.classList.toggle('past', !e.isIntersecting); });
    }, {rootMargin: '-64px 0px 0px 0px', threshold: 0}).observe(head);
  })();
</script>
```

- [ ] **Step 5: Armadilha de layout a respeitar no `.entry`**

No verbete de evento, a foto **não pode** entrar no cálculo de altura da linha. A foto da Mottu é retrato e com `height:100%` levou o bloco de 190px para 620px. A regra correta, do protótipo:

```css
.entry .ph{ position:relative; aspect-ratio:16/10; overflow:hidden }
@media(min-width:900px){
  .entry .ph{ aspect-ratio:auto; align-self:stretch; min-height:210px }
  .entry .ph img{ position:absolute; inset:0 }
}
.entry .ph img{ width:100%; height:100%; object-fit:cover; display:block }
```

- [ ] **Step 6: Verificar**

```bash
npm test
node scripts/verify-ui.js --base=http://127.0.0.1:3111
```

Esperado: 37 passando, e no verificador **todas as checagens de `/` passando** — incluindo `alvo de toque >= 44px`, `revelação ligada ao scroll` = progressivo, `viewBox == box renderizado` e `marca >= 40px`.

- [ ] **Step 7: Confirmar as três colunas do verbete**

```bash
node -e "
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://127.0.0.1:3111/');await p.waitForTimeout(600);
const m=await p.evaluate(()=>{const e=document.querySelector('.entry');if(!e)return null;
e.scrollIntoView({block:'center'});
const g=s=>Math.round(e.querySelector(s).getBoundingClientRect().height);
return {ph:g('.ph'),mid:g('.mid'),side:g('.side')};});
console.log(m);await b.close();})();
"
```

Esperado: as três alturas iguais e **abaixo de 300px**. Se vier ~620, a foto voltou a ditar a altura.

- [ ] **Step 8: Commit**

```bash
git add public/home.html
git commit -m "Redesenha a landing publica

Cabecalho de documento com a marca, capitular e lista de dados; a figura
do relevo em palco proprio com legenda; o semestre como indice denso em
vez de tres cards. Texto reescrito: a liga gera ambiente de fomento, nao
intermedia visitas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `login.html`, `inscricao.html`, `presenca.html`

**Files:**
- Modify: `public/login.html` (CSS inline 16–180)
- Modify: `public/inscricao.html` (CSS inline 14–80)
- Modify: `public/presenca.html` (CSS inline 14–69)

**Interfaces:**
- Consumes: tokens, `.rv`, `art.js`, `/assets/logo-mark.png`.

- [ ] **Step 1: Auditar os hex de cada arquivo**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV/public
for f in login.html inscricao.html presenca.html; do echo "== $f =="; grep -nE '#[0-9A-Fa-f]{3,8}\b' $f; done
```

São 8, 6 e 6 ocorrências. Cada uma vira token, exceto `color:#fff` sobre superfície escura.

- [ ] **Step 2: Trocar por tokens e aplicar o display serifado**

Em cada arquivo: substituir os hex por `var(--…)`, e todo `h1`/`h2`/`h3` passa a `font-family: var(--fd); font-weight: 400`. A marca no topo usa `/assets/logo-mark.png` com `height: 40px` no mínimo.

- [ ] **Step 3: Envolver os blocos em `.rv`**

Nos três arquivos, adicionar `class="rv"` (com `style="--i:N"` crescente) nos blocos de topo: título, subtítulo, formulário, botão.

- [ ] **Step 4: Carregar `art.js` e chamar reveal**

Antes de `</body>` em cada arquivo:

```html
<script src="/art.js"></script>
<script>LEPVArt.reveal();</script>
```

- [ ] **Step 5: Verificar os inputs em 16px**

```bash
node scripts/verify-ui.js --base=http://127.0.0.1:3111
```

Esperado: `input >= 16px` passando em `/login.html` e `/presenca.html`. Acrescentar `/inscricao.html?t=teste` ao array `PAGES` do verificador se quiser cobri-la (ela exige token na URL).

- [ ] **Step 6: Rodar a suíte**

```bash
npm test
```

Esperado: 37 passando. Atenção especial ao caso que checa `/inscricao.html?t=` — a URL não pode mudar.

- [ ] **Step 7: Commit**

```bash
git add public/login.html public/inscricao.html public/presenca.html
git commit -m "Aplica a identidade nova nos fluxos publicos

Login, inscricao e presenca passam a beber dos tokens, ganham display
serifado, a marca em 40px e revelacao por scroll. Inputs seguem em 16px.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `app.html` — o app logado

**Files:**
- Modify: `public/app.html` — `:root` (linha 19), `theme-color` (linha 9), e os pontos de cor listados abaixo
- **Não tocar:** o bloco `body.imersao` (linhas ~26–66) nem qualquer regra prefixada por `body.imersao`

**Interfaces:**
- Consumes: tokens, `.rv`, `art.js`.

- [ ] **Step 1: Corrigir os pontos de cor que são trabalho real**

Dos 71 hex, 14 estão no tema da imersão (fora de escopo) e a maioria dos outros é `color:#fff` sobre superfície escura, que é correto. Os que mudam são estes:

| Linha | Hoje | Passa a ser |
|---|---|---|
| 9 | `<meta name="theme-color" content="#17171B">` | `content="#121214"` |
| 19 | `--line-strong: #D8D3CE;` | `--line-strong: var(--line-2);` |
| 299 | `var(--good, #1B7A3D)` e `var(--good-soft, #…)` | remover os fallbacks: `var(--good)`, `var(--good-soft)` |
| 323 | `var(--pending-soft, #FEF4E5)` | `var(--pending-soft)` |
| 503 | `.company-hero.logoBg-light { background: #F5F7FA; }` | `background: var(--paper-2);` |
| 860 | `background: #000;` | `background: var(--band);` |
| 1090 | `color: #991B1B; background: #FEEBEB;` | `color: var(--danger); background: var(--danger-soft);` |
| 1091 | `border: 1px solid #F5C6C6;` | `border: 1px solid var(--danger-line);` |

Os tokens de erro não existem ainda. Acrescentar ao `:root` de `public/styles.css`:

```css
  --danger: #991B1B; --danger-soft: #FEEBEB; --danger-line: #F5C6C6;
```

- [ ] **Step 2: Aplicar o display serifado**

Em `app.html`, os títulos usam `var(--font-display)`, que a Task 3 já apontou para Instrument Serif. Conferir que nenhum deles força `font-weight: 700/800` — a Instrument Serif só tem 400, e peso falso a deforma:

```bash
grep -n 'font-display' public/app.html | grep -E 'font-weight: *(600|700|800|900)'
```

Cada ocorrência encontrada passa a `font-weight: 400`.

- [ ] **Step 3: Garantir o alvo de toque nas abas e chips**

```css
nav.tabs button{ min-height: 44px }
.type-chip, .lfilter, .company-chip, .daypicker button{ min-height: 44px }
```

- [ ] **Step 4: Carregar `art.js` e revelar os painéis**

Antes de `</body>`, **depois** de `app.js`:

```html
<script src="/art.js"></script>
<script>LEPVArt.reveal();</script>
```

- [ ] **Step 5: Verificar que o acervo da imersão não mudou**

```bash
git diff public/app.html | grep -E '^[-+].*imersao' | head
```

Esperado: **nenhuma linha**. Se aparecer alguma, foi alteração indevida no tema fora de escopo.

- [ ] **Step 6: Rodar a suíte e o contraste**

```bash
npm test
python scripts/check-contrast.py
```

Esperado: 37 passando, contraste sem falha.

- [ ] **Step 7: Commit**

```bash
git add public/app.html public/styles.css
git commit -m "Aplica a identidade nova no app logado

Oito pontos de cor viram token (theme-color, line-strong, fallbacks de
good/pending, logo claro, fundo do QR e o estado de erro, que ganha
tokens proprios). Display serifado em peso 400 e alvo de toque de 44px
nas abas e chips. O tema da imersao nao foi tocado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `app.js` — revelação nas listas geradas

O arquivo tem 151KB e monta marcação em string. **Nenhuma lógica de negócio muda.** A única alteração é decorar a marcação gerada e reobservar.

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `LEPVArt.reveal(sel)`.

- [ ] **Step 1: Localizar os pontos que injetam listas**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV/public
grep -n 'innerHTML *=' app.js | wc -l
grep -n 'innerHTML *=' app.js | head -30
```

- [ ] **Step 2: Acrescentar `rv` nas linhas de lista e reobservar**

Para cada função que renderiza uma lista (eventos, membros, materiais, presenças), adicionar `rv` à classe do item e `style="--i:N"` com o índice, e ao final da função, depois de escrever no DOM:

```js
if (window.LEPVArt) LEPVArt.reveal('.rv:not(.in)');
```

`reveal` é idempotente para o que já completou: elementos com `--p` em 1 já recebem a classe `in`, e o seletor `:not(.in)` evita reobservar o que terminou.

- [ ] **Step 3: Checar sintaxe**

```bash
node --check public/app.js
```

Esperado: sem saída.

- [ ] **Step 4: Rodar a suíte**

```bash
npm test
```

Esperado: 37 passando.

- [ ] **Step 5: Verificar o app logado por medição**

O app exige sessão. Logar via `fetch` no contexto da página e remover `.pin-backdrop` antes de clicar (o modal de PIN intercepta cliques):

```bash
node -e "
const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});
await p.goto('http://127.0.0.1:3111/login.html');
await p.evaluate(()=>fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({order:2,password:'2'})}));
await p.goto('http://127.0.0.1:3111/app.html');await p.waitForTimeout(900);
await p.evaluate(()=>{const m=document.querySelector('.pin-backdrop');if(m)m.remove();});
const r=await p.evaluate(()=>({
  overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  minTap:Math.min(...[...document.querySelectorAll('nav.tabs button')].map(e=>Math.round(e.getBoundingClientRect().height))),
  rv:document.querySelectorAll('.rv').length}));
console.log(r);await b.close();})();
"
```

Esperado: `overflowX: 0`, `minTap >= 44`, `rv` maior que zero. A senha inicial dos fundadores é o número de inscrição — no volume de teste, injetar a credencial em `signups.json`.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "Revela as listas do app conforme o scroll

Os itens gerados recebem a classe rv com indice escalonado e a funcao
reobserva os novos elementos. Nenhuma logica de negocio alterada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verificação final

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-08-22-lepv-ui-redesign-design.md` (só se algum valor divergir)

- [ ] **Step 1: Registrar o alvo de verificação completo**

Adicionar em `"scripts"` do `package.json`:

```json
"verify": "npm test && node scripts/verify-art.js && python scripts/check-contrast.py && node scripts/verify-ui.js"
```

- [ ] **Step 2: Rodar tudo, do zero**

```bash
cd C:/Users/marce/Documents/GitHub/LEPV
rm -rf /tmp/lepv-vol-verify && mkdir -p /tmp/lepv-vol-verify
RAILWAY_VOLUME_MOUNT_PATH=/tmp/lepv-vol-verify TRAVEL_ESTIMATE=off PORT=3111 node server.js
# em outro terminal:
npm test
node scripts/verify-art.js
python scripts/check-contrast.py
node scripts/verify-ui.js --base=http://127.0.0.1:3111
```

Esperado, e nada menos: 37 casos passando, seis checagens da arte em `ok`, zero par abaixo de AA, e `TUDO PASSOU` no verificador de UI.

- [ ] **Step 3: Conferir o `/health` e o motor de resiliência**

```bash
curl -s http://127.0.0.1:3111/health
```

Esperado: JSON com contador de falhas em zero. A poda do boot roda sem proteção de propósito — se uma referência quebrada tivesse entrado, o healthcheck reprovaria aqui.

- [ ] **Step 4: Confirmar que a presença ainda abre sozinha na data**

Esse comportamento deriva da data do Brasil e não da UI, mas é o caminho crítico do dia do evento. O caso correspondente já está entre os 37 — confirmar pelo nome na saída de `npm test`.

- [ ] **Step 5: Commit e parar**

```bash
git add package.json
git commit -m "Adiciona o alvo npm run verify

Encadeia a suite e2e, a verificacao da arte, o contraste e a medicao de
UI num comando so.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Não fazer `git push` nem `railway up`.** Ambos exigem autorização explícita do Marcell, a cada vez. Ao terminar, reportar o resultado das quatro verificações e perguntar.

---

## Fora de escopo (não fazer neste plano)

- Tema da imersão (`body.imersao`): mantém navy + `#D31E24`.
- Favicon e ícones do PWA em `public/icons/`: ainda com a arte antiga. Num tamanho de favicon a marca completa não lê, então exige um monograma simplificado — tarefa própria.
- Indicadores que exigiriam campo novo (encontros realizados, horas de formação, projetos fundados). Ver spec §9.1.
- Nova sessão de fotos.
- As pendências não-visuais do projeto, em especial o reset de senha dos fundadores (orders 2–11), cuja senha inicial é o número de inscrição, que é público.

## Riscos e como o plano os cobre

| Risco | Cobertura |
|---|---|
| A suíte não valida UI | Task 1 cria o verificador **antes** de qualquer mudança visual, e roda contra o site atual para provar que detecta problema |
| `app.js` tem 151KB | Task 9 não toca lógica: só adiciona classe e reobserva. `node --check` + suíte a cada passo |
| A troca de `--red` afeta tudo de uma vez | É alias num lugar só (Task 3). Task 8 Step 5 prova por diff que o acervo não mudou |
| Regressão do gradiente degenerado | Task 4 Step 5 mede `costelas presentes > 10` — é exatamente essa falha |
| Foto retrato estourando altura | Task 6 Step 5 traz a regra e o Step 7 mede as três colunas |
| Deploy manual sem CI | `npm run verify` verde antes de qualquer deploy, e deploy só com autorização |
