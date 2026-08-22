# Redesign da UI do LEPV — design validado

Data: 2026-08-22 · Escopo aprovado: **todas as superfícies de uma vez**
Protótipos de referência: `v6-liga.html` (aprovado com ajustes, já aplicados) e as
cinco variações exploratórias `v1`–`v5`.

---

## 1. Problema

O site funciona e está em produção em `lepv.org`, mas o Marcell classificou o visual
como "horrível, muito simples". Os quatro sintomas, todos confirmados na leitura do
código atual:

| Sintoma | Causa no código atual |
|---|---|
| Genérico, sem personalidade | Nenhuma peça de arte própria. A página é uma pilha de cards com `box-shadow` suave |
| Não parece premium | Sem escala tipográfica: o `h1` da home usa a mesma família das listas, em tamanho próximo |
| Inconsistente entre telas | Dois temas concorrentes (`:root` da liga e `body.imersao`), componentes divergidos entre `home.html` e `app.html` |
| Datado | Linguagem de card com sombra difusa, ausência de motion ligado ao scroll |

O público prioritário é **empresa / executivo** — quem abre a porta para visita, aula
ou missão. Isso empurra o resultado para peso institucional e credibilidade, não para
energia de recrutamento.

### 1.1 Posicionamento — restrição de texto para todas as superfícies

A proposta da liga **não** é levar alunos para conhecer empresas. É **gerar um ambiente
de fomento ao empreendedorismo dentro do IME**. Reuniões, aulas, visitas e missões são
os *meios*; o fim é um lugar onde fundar algo deixe de ser exceção na engenharia.

Isso é uma restrição de redação, não um detalhe de copy da home: qualquer texto que
descreva a liga como intermediária de visitas está errado, em qualquer tela. O texto
anterior ("a liga leva alunos do IME para dentro das empresas") tratava o meio como se
fosse o fim e foi reescrito.

Consequência já resolvida: os indicadores em destaque foram reordenados para medir
ambiente antes de rede. Ver §9.1.

## 2. Direção aprovada

Combinação escolhida entre as cinco variações exploradas:

- **Base clara** — papel off-white, não escuro.
- **Display em serif editorial** — Instrument Serif, com itálico para a ênfase.
- **Arte do hero: contorno + foto juntos** — relevo topográfico em SVG sobre foto lavada.
- **Estrutura**: a densidade da variação 3 (o semestre como índice) dentro da moldura
  institucional da variação 5 (capitular, filete duplo, `Fig.`, seções em romano,
  nota de rodapé).
- **Revelação ligada ao progresso do scroll**, não a gatilho binário.
- **Mobile-first**: toda media query é `min-width`.

A direção vem das quatro referências que o Marcell indicou — Canastra Ventures
(serif editorial + arte de contorno), Palantir (peso institucional por escala),
Gemini CLI (paleta de um accent), Avenia (superfície plana, dados densos). O padrão
comum às quatro, e ausente hoje no LEPV: **uma peça de arte estrutural no hero,
tipografia como evento principal, um único accent, superfície plana**.

## 3. Identidade visual

### 3.1 Cores, amostradas da marca

O arquivo `marketing/logo.jpeg` (3588×3812) é a fonte da verdade. As cores foram
extraídas por amostragem do próprio arquivo, não escolhidas por aproximação:

| Token | Valor | Origem |
|---|---|---|
| `--wine` | `#7F0A1A` | quartil mais saturado dos pixels vermelhos da logo (seta + ondas) |
| `--wine-2` | `#9E1F30` | variante clara para hover |
| `--band` | `#0A0A0B` | preto da engrenagem, medido em `#090909` |
| `--ink` | `#121214` | texto principal |
| `--ink-2` | `#3D3940` | corpo de texto |
| `--ink-3` | `#736D77` | texto terciário, legendas (ver §6) |
| `--paper` | `#FAF8F5` | fundo padrão |
| `--paper-2` | `#F3EFE9` | fundo alternado (a figura) |
| `--card` | `#FFFFFF` | superfície de card |
| `--line` | `#E2DCD4` | filete padrão |
| `--line-2` | `#CDC4B9` | filete de ênfase |

**Consequência a aceitar:** o `--red` do tema da liga sai de `#8A1E2D` para
`#7F0A1A`. Toda superfície da liga muda de tom. O tema da imersão (`body.imersao`,
`--red: #D31E24`) tem valores próprios e **não** é afetado — a regra histórica de
nunca hardcodar cor continua valendo, e é justamente ela que torna essa troca viável
em um lugar só.

### 3.2 Tipografia

| Papel | Família | Uso |
|---|---|---|
| Display | `Instrument Serif` (400, itálico) | `h1`–`h4`, números grandes, legendas de figura em itálico |
| UI | `Archivo` (400/500/600/700) | corpo, formulários, tabelas, rótulos, botões, todo o app |

A serif é **só display**. Formulário, tabela, presença e painel ficam em Archivo — é
isso que mantém o app operável e resolve a queixa de inconsistência, porque as duas
famílias e os mesmos tokens passam a valer em todas as telas.

Escalas: `h1` `clamp(38px, 8vw, 86px)`, corpo 16px, `line-height` 1.6–1.72 no texto
corrido. Números com `font-variant-numeric: tabular-nums` em toda superfície.

### 3.3 A marca

Três assets derivados do JPEG por script (alfa por distância do branco, com a cor
original recuperada da mistura sobre fundo branco; recorte pelo bounding box):

- `logo-mark.png` — colorida, fundo transparente, 1024px de largura
- `logo-mark-white.png` — monocromática branca, para o band preto
- `logo-mark-ink.png` — monocromática escura

**Piso de 40px de altura.** Medido renderizando a marca em 24/28/32/40/48/56/72px:
abaixo de 40px os dentes da engrenagem viram serrilha e a marca lê como mancha. Por
isso o nav passa de 58px para **64px** de altura.

**Regra de não-repetição:** a marca grande (58–72px) vive no selo do cabeçalho de
documento. O nav mostra **só o wordmark serif** enquanto o cabeçalho está visível, e
recebe a marca em 40px quando o cabeçalho sai de cena. Nunca as duas ao mesmo tempo.

### 3.4 A arte generativa

O relevo do Morro da Urca e do Pão de Açúcar, gerado em SVG no cliente. Não é imagem:
são três gaussianas somadas que descrevem a silhueta, e delas derivam os níveis de
contorno, as costelas verticais e as duas ondas.

A silhueta **segue a logo**: pico alto e agudo à esquerda (Pão de Açúcar), morro médio
ao centro, esporão à direita, e as duas ondas de vinho que se cruzam na base — na
marca elas são o gesto principal, então aqui recebem traço mais grosso e cor sólida.

Três decisões técnicas que vieram de defeitos encontrados na prototipagem:

1. **Gradiente em `userSpaceOnUse`, não `objectBoundingBox`.** Uma costela
   perfeitamente vertical tem caixa de largura zero; com `objectBoundingBox` o
   gradiente degenera e a linha simplesmente não pinta. Foi por isso que a malha do
   relevo ficou invisível na primeira versão.
2. **As ondas usam cor sólida.** Elas ficam abaixo da linha-base, fora da faixa do
   gradiente do relevo, onde ele já saturou no tom mais transparente.
3. **O `viewBox` é o box em pixels, definido em tempo de execução.** Com `viewBox`
   fixo e altura fixa, `preserveAspectRatio="meet"` deixa faixa vazia nas laterais e
   `slice` corta os picos. Medindo o contêiner e usando 1 unidade = 1 pixel, a arte
   preenche exatamente em qualquer tela, sem distorcer. Regenera em `resize` com
   debounce de 180ms, porque a largura muda a silhueta.

A densidade acompanha a largura: `ribStep = W/74` e 16 níveis abaixo de 640px contra
24 acima. Em 390px isso dá 40 traços; em 1440px, 72. Sem isso a arte vira mancha em
tela grande e sujeira em tela pequena.

## 4. Motion — ligado ao scroll, não a gatilho

Este é o requisito explícito: *"a página surge à medida que rolamos, não com tudo já
previamente carregado"*. A implementação anterior era binária (IntersectionObserver
adiciona uma classe, a animação roda sozinha com duração própria). A aprovada é
**função direta da posição da página**.

### 4.1 Revelação

O JS publica `--p` (0→1) em cada elemento `.rv` conforme ele sobe pela viewport. O CSS
deriva opacidade e deslocamento desse número:

```css
.rv{
  --pi: clamp(0, (var(--p) - var(--i,0) * 0.09) / 0.72, 1);
  opacity: var(--pi);
  transform: translate3d(0, calc((1 - var(--pi)) * 26px), 0);
}
```

Rolar devagar revela devagar. Parar no meio deixa o elemento no meio. `--i` escalona
irmãos, exigindo um pouco mais de progresso de cada um. É **monotônico**: nada se
desfaz ao rolar de volta, para não piscar.

`--p` é declarado com valor 0 **em `:root`**, nunca em `.rv` nem em `.contour` — uma
declaração intermediária sombrearia o valor inline que o JS escreve.

### 4.2 Desenho do contorno

Cada traço recebe `--s` (onde começa no curso) e `--w` (quanto do curso consome), e
resolve o próprio `stroke-dashoffset` em CSS:

```css
.contour path{
  stroke-dasharray: var(--len);
  stroke-dashoffset: calc(var(--len) *
    (1 - clamp(0, (var(--p) - var(--s,0)) / var(--w,.42), 1)));
}
```

Uma escrita de variável por quadro no contêiner move as 72 linhas. O efeito verificado:
com o scroll parado no meio, o Pão de Açúcar aparece formado, o Morro da Urca ainda só
com as costelas nuas, e a onda desenhada até ~40% da largura.

### 4.3 Demais peças

- **Números que contam** ao entrar (`data-count`), com easing cúbico em 850ms.
- **Parallax leve** na foto do hero, 0.10 de força, também por scroll.
- **Marca do nav** entra por opacidade e escala quando o cabeçalho sai de cena.
- **Marquee e faixa de fotos** em CSS puro, trilha duplicada, pausa no hover.
- **Thumb que segue o cursor** no índice de eventos, só onde há `hover: hover` e
  largura ≥860px.

### 4.4 Orçamento de desempenho

Um único listener de `scroll` por engine, `{passive: true}`, todo trabalho dentro de um
`requestAnimationFrame` com flag de reentrada. Retângulos medidos **fora** do loop —
só em `resize`, `load` e `document.fonts.ready` — para não forçar layout por quadro.

### 4.5 Acessibilidade do motion

`prefers-reduced-motion: reduce` desliga tudo: `--p` vai a 1 de saída, `dashoffset` a
0, marquee e faixa param. Nenhuma informação existe só no movimento.

## 5. Componentes

| Componente | Regra |
|---|---|
| Nav | 64px, sticky, `backdrop-filter`, wordmark serif + marca condicional, hambúrguer <760px |
| Cabeçalho de documento | selo da marca + nome completo da liga; `h1`; capitular no primeiro parágrafo; lista de dados em `aside` com filete pontilhado. **Sem** a linha "Instituto Militar de Engenharia · Fundada em 2026" — removida por decisão do Marcell |
| Figura | palco próprio abaixo do filete duplo, com legenda `Fig. N` em itálico. **Nunca atrás de texto corrido** |
| Tira de dados | rolável horizontalmente no mobile, sem barra visível |
| Verbete de evento | 3 colunas (foto / texto / dados). A foto é `position: absolute` dentro do contêiner, para **não** entrar no cálculo de altura da linha |
| Índice de eventos | uma linha por evento, `border-bottom` de 1px, tipo em serif, dados em tabular. Alvo de toque ≥100px no mobile |
| Band preto | `--band`, logos monocromáticos brancos, marquee contra-rotante |
| Botões | pílula ou quadrado 4px, `min-height: 46px` |

### 5.1 Armadilha de layout registrada

`align-items: stretch` num grid resolve o vazio embaixo da coluna curta, **mas** uma
foto retrato com `height: 100%` passa a ditar a altura da linha inteira (a foto da
Mottu levou o verbete de 190px para 620px). A correção é tirar a imagem do fluxo com
`position: absolute` + `object-fit: cover`: a altura vem do texto, a foto cobre o
resto. Verificado: 223px nas três colunas.

## 6. Acessibilidade

- Alvo de toque mínimo **44px**. Dois defeitos reais corrigidos na prototipagem: o
  `nav-cta` tinha 40px e o hambúrguer 29px. Ambos medidos, não estimados.
- Nenhum `overflow-x` na página em 390px (o carrossel rola dentro do próprio
  contêiner, não no body).
- Inputs em 16px, que é o mínimo que evita o zoom automático do Safari iOS.
### 6.1 Contraste — calculado, não estimado

Razões WCAG de todos os pares em uso:

| Par | Razão | AA texto normal |
|---|---|---|
| `--ink` / `--paper` | 17.65 | passa |
| `--ink` / `--card` | 18.71 | passa |
| `--ink-2` / `--paper` | 10.66 | passa |
| `--ink-2` / `--card` | 11.30 | passa |
| `--ink-3` / `--paper` | 4.74 | passa |
| `--ink-3` / `--card` | 5.02 | passa |
| `--wine` / `--paper` | 10.10 | passa |
| `--wine` / `--paper-2` | 9.35 | passa |
| `--wine-2` / `--paper` | 7.36 | passa |
| branco / `--wine` | 10.71 | passa |
| `--paper` / `--band` | 18.67 | passa |
| rótulo do marquee (branco 55%) / `--band` | 6.28 | passa |

Dois valores mudaram por causa desse cálculo, e a mudança é a razão de existirem:

- **`--ink-3` era `#7C7580`** e dava 4.20 sobre papel e 4.46 sobre card — falha AA para
  texto normal. Ele não é decorativo: carrega data e número de vagas no índice de
  eventos, em 13px. Passou para `#736D77` (4.74 / 5.02).
- **O rótulo do marquee era branco a 44%**, o que dá 4.36 sobre o band. Subiu para 55%
  (6.28).

Mesmo com `--ink-3` em AA, ele segue sendo texto terciário: **não** usar como único
portador de informação crítica.
- Foco visível em toda superfície interativa, incluindo as linhas do índice.

## 7. Arquitetura dos arquivos

Hoje `public/app.html` (78KB) e `public/app.js` (151KB) concentram quase tudo, e
`styles.css` tem 9KB. O redesign toca todas as superfícies, então a divisão passa a ser:

```
public/
  styles.css          tokens, reset, tipografia, componentes compartilhados
  art.js              arte generativa + engines de scroll (contour, fitContour,
                      reveal, drawOnScroll, countUp, parallax)
  home.html           landing pública
  login.html  inscricao.html  presenca.html
  app.html + app.js   área logada
  assets/ (logo-mark.png, logo-mark-white.png, logo-mark-ink.png)
```

`art.js` é a única peça nova de JS e é autocontida: expõe `window.LEPVArt` e não
depende de nada. Vanilla puro, sem build, sem CDN — preserva o deploy manual, o PWA e
o service worker.

**Regra que continua valendo:** cor sempre por token. Em `app.html`, `--white` é
superfície de card, **não** cor de texto.

## 8. Verificação — o que precisa passar

Nada é considerado pronto por inspeção visual. Os sinais executáveis:

1. `npm test` — os 37 casos de `tests/e2e.js` passando, com volume isolado em
   diretório temporário. O redesign não deve tocar contrato de API, mas mexe em HTML
   que o e2e inspeciona.
2. `node --check public/art.js`.
3. Medição por Playwright em **390px e 1440px**, por página: `overflowX === 0`;
   menor alvo de toque `>= 44`; `--p` variando entre 0 e 1 durante o scroll (prova de
   que a revelação é progressiva e não binária); `viewBox` do contorno igual ao box
   renderizado; zero erro de console.
4. Contraste AA recalculado se qualquer token de cor mudar. A tabela de §6.1 é o
   estado válido hoje; o script que a gerou deve ser rodado de novo a cada ajuste de
   paleta, não conferido de olho.
5. Uma passada com `prefers-reduced-motion: reduce` ativo confirmando que o conteúdo
   aparece inteiro e nada se move.
6. Verificação da presença: com o redesign no ar, um evento na data do dia precisa
   continuar abrindo a presença sozinho (regra de fuso de Brasília).

## 9. Fora de escopo

- Reescrita do backend, do modelo de eventos ou de qualquer contrato de API.
- O tema da imersão (`body.imersao`): mantém navy + `#D31E24`. O acervo é memória de
  uma viagem, tem identidade própria e continua assim.
- Nova sessão de fotos. As fotos atuais são de grupo posado; a variação que dependia
  de foto de textura (o recorte pela silhueta) ficou de fora por isso.
- Favicon e ícones do PWA: `public/icons/` ainda tem a arte antiga. Precisa ser
  regerado a partir de `logo-mark.png`, mas em tarefa separada — e num tamanho tão
  pequeno a marca completa não lê, então exige um monograma simplificado.
- As pendências abertas do projeto que não são de UI, em especial o reset de senha dos
  fundadores.

### 9.1 Resolvido: a ordem dos indicadores

Com o posicionamento corrigido em §1.1, a lista de números ficou incoerente com o
texto ao lado dela — o segundo item em destaque media visita a empresa, que passou a
ser meio e não fim.

**Decisão do Marcell: manter o indicador, só despriorizar.** Nenhum dado novo entra,
então nada muda na API. A ordem passa a ser, no cabeçalho e na tira:

> membros ativos · turmas representadas · especialidades do IME · **empresas na
> rede** · primeira missão

Os três primeiros descrevem o ambiente — gente diversa se encontrando, que é a
proposta. A rede vem depois, como prova.

O rótulo foi de "empresas visitadas" para **"empresas na rede"**: mede a mesma coisa
com o enquadramento de §1.1, já que rede é resultado permanente e visita é o evento.
Reverter é trocar uma string em dois lugares.

Indicadores de fomento que exigiriam dado novo ficaram **fora de escopo** por ora:
encontros realizados e horas de formação (o `events.json` não guarda duração), e
projetos ou empresas fundadas por membros (não há campo, teria de ser mantido à mão).
Se um dia entrarem, "projetos fundados" é o mais forte para o público executivo,
porque é o único que mede o fim e não o meio.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| `app.js` tem 151KB e concentra muita marcação em string; o redesign toca quase tudo | Trocar por tokens e classes compartilhadas antes de mexer em estrutura; rodar `npm test` a cada bloco |
| A troca de `--red` altera toda superfície da liga de uma vez | É um valor num lugar só; conferir visualmente as telas de presença e painel, onde o vinho é sinal de estado |
| Motion por scroll em lista longa de eventos | Um listener por engine, rects em cache, rAF com flag. Medir em lista com 30+ eventos |
| Deploy é manual e sem CI | `npm test` verde localmente antes de qualquer `railway up -c`, e o deploy só com autorização explícita |
| A serif em tabela densa pode prejudicar leitura | A serif é só display; qualquer dado tabular fica em Archivo com tabular-nums |
