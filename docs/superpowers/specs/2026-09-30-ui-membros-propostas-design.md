# Propostas de UI — Área de membros

Data: 2026-09-30 · Status: aprovado pelo usuário (direções confirmadas em conversa)

## Problema

A landing evoluiu para uma gramática de documento (papel `#FAF8F5`, Instrument
Serif, filetes, `datalist`/`idx`), mas `public/app.html` ficou no tema antigo:
topbar `--navy` quase preta, abas com filete vermelho, cards quadrados (raio
4px). Sintomas relatados: componentes quadrados, logo sumindo no preto da barra
(`logo-mark.png` é engrenagem preta sobre transparente), layout genérico.

## Entregável

`propostas/` na raiz do repo (fora de `public/` — artefato de design, não vai
para produção):

- `index.html` — galeria comparando as 5 direções
- `p1-memorando/`, `p2-conclave/`, `p3-fluxo/`, `p4-planta/`, `p5-diario/` —
  cada uma com `index.html` + `style.css` próprios
- `_dados.js` — dados realistas compartilhados (11 membros, 12 empresas,
  eventos, gastos, roteiro, checklist, selos, acessos, diretoria)
- `_assets/` — cópias de `public/members/*.png`, `public/logos/*`, variantes
  de `logo-mark` e `praia-vermelha` (mockups self-contained, abrem em file://)

## Escopo por proposta

Concha (nav + identidade + usuário) + **todas as abas** do app atual:
Início, Eventos, Membros, Gastos, Diretoria, Acessos, e o grupo Acervo da
imersão (Legado, Empresas, Selos, Roteiro, A missão, Arquivo). Abas trocam
painel via JS; cada painel tem conteúdo realista + pelo menos um estado vazio
por proposta. Responsivo 1440 e 390.

## Regras que valem para as 5

- Logo com variante correta por fundo (`logo-mark` claro/`ink`/`white`).
- Sem requisição externa: fonte de sistema ou as já usadas (Instrument Serif +
  Archivo via Google Fonts só se a proposta mantiver a marca).
- Contraste AA no texto de apoio (≥4.5:1). Alvo de toque ≥44px.
- Uma cor de acento por direção; estado em uma escala só, não arco-íris.
- Zero `style=""` inline fora valores de dado; um CSS por proposta.

## As 5 direções

| # | Nome | Família | Concha | Acento | Superfícies |
|---|------|---------|--------|--------|-------------|
| P1 | Memorando | marca — evolução | faixa clara + filete | vinho `#7F0A1A` | papel, folhas sem card |
| P2 | Conclave | livre — claude.ai | sidebar creme + grupos | terracota `#B4532A` | creme `#F4EFE7`, raio 14 |
| P3 | Fluxo | livre — avenia.ai | topbar slim + pills | petróleo `#0E5E63` | gelo `#F6F8FB`, raio 18, washes |
| P4 | Planta baixa | livre — console | sidebar fina + breadcrumb | vinho funcional | `#FAFAFA`, raio 4, mono em id |
| P5 | Diário de bordo | marca — ousada | sidebar índice romano | vinho + tinta | papel, filete duplo, serif gigante |

## Verificação

Screenshot 1440×900 e 390×844 de cada proposta (servidor local na raiz),
leitura das imagens e correção de defeitos visíveis (overflow, contraste,
quebra de grid). Não roda `npm run verify` — mockups fora de `public/` não
entram nas verificações; conferir mesmo assim `style="` e contraste.
