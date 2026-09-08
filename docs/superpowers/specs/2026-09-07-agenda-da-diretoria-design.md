# Agenda da diretoria: encontros, quadro e feed de calendário

**Data:** 2026-09-07
**Status:** aprovado para planejamento

## Objetivo

Dar à diretoria da LEPV um lugar único para registrar e acompanhar os
**encontros externos** que ela conduz (parceiros comerciais, conselheiros,
patrocinadores, instituições), para que todo diretor saiba o que está marcado,
o que já aconteceu e o que ficou pendente. Cada diretor pode assinar esses
encontros no próprio calendário (Google, Apple, Outlook) sem login de terceiro
no servidor.

Não é um evento da liga: não tem inscrição, presença, QR nem página pública.
É um objeto novo, visível só para quem tem papel `director` ou `superadmin`.

## Decisões

- **Objeto próprio**, não um tipo novo de `events.json`. Reaproveitar eventos
  faria cada rota pública (`/api/public-events`, `inscricao.html`,
  `evento.html`) virar um ponto onde um encontro confidencial poderia vazar.
- **Visibilidade só para diretoria.** Membro comum não vê a aba e recebe 403 na
  API. O papel é relido a cada request por `requireDirectorApi` (já existe).
- **Kanban é o ciclo de vida do encontro**, não tarefas soltas nem frentes de
  trabalho. Quatro colunas fixas.
- **Sincronização em uma direção** (site → calendário pessoal) por feed
  iCalendar assinável, com token privado por diretor. Sem OAuth, sem chave de
  API, sem webhook.
- **Primeiro módulo ES do app.** A feature nasce em `public/js/features/board.js`
  carregado por `<script type="module">`, no formato que a spec de
  modularização (`2026-09-01-modularizacao-frontend-design.md`) definiu. O
  `app.js` monolítico recebe só a ponte mínima para injetar a aba e avisar o
  módulo quando ela ativa.
- Sem framework, bundler, dependência nova de produção ou mudança nas rotas
  existentes.

## Modelo de dados

Store novo no volume: `board-meetings.json`, lido e escrito por `readStore` e
`writeStore` como os demais. Formato:

```json
{
  "meetings": [
    {
      "id": "bm<base36><hex>",
      "title": "Acordo comercial do Hackathon",
      "counterpart": { "org": "OpenAI", "person": "Nome da pessoa" },
      "front": "Hackathon",
      "status": "marcado",
      "date": "2026-09-15",
      "time": "14:00",
      "durationMin": 60,
      "location": "Online (Google Meet)",
      "link": "https://meet.google.com/xxx-xxxx-xxx",
      "owners": [1, 4],
      "agenda": "texto livre",
      "outcome": "texto livre",
      "followUp": { "text": "Enviar proposta revisada", "dueDate": "2026-09-22" },
      "createdBy": 1,
      "createdAt": "2026-09-07T18:00:00.000Z",
      "updatedAt": "2026-09-07T18:00:00.000Z"
    }
  ]
}
```

Regras de campo, aplicadas no servidor:

| Campo | Regra |
| --- | --- |
| `title` | obrigatório, 3 a 120 caracteres |
| `counterpart.org` | obrigatório, até 80 caracteres; `person` opcional, até 80 |
| `front` | opcional, até 30 caracteres |
| `status` | um de `a_marcar`, `marcado`, `realizado`, `pendencia`; padrão `a_marcar` |
| `date` | `YYYY-MM-DD`; obrigatório quando status ≠ `a_marcar` |
| `time` | `HH:MM`; obrigatório quando status ≠ `a_marcar` |
| `durationMin` | inteiro 15 a 480; padrão 60 |
| `location` | opcional, até 160 caracteres |
| `link` | opcional; precisa começar com `http://` ou `https://` |
| `owners` | lista de `order` de membros ativos com papel de diretor ou superadmin; pode ser vazia |
| `agenda`, `outcome` | opcionais, até 2000 caracteres |
| `followUp.text` | obrigatório quando status é `pendencia`, até 300 caracteres; `dueDate` opcional `YYYY-MM-DD` |

Transições de status: qualquer status pode ir para qualquer outro, desde que os
campos exigidos pelo destino estejam presentes. Entrar em `realizado` ou
`pendencia` com `date` no futuro (fuso `America/Sao_Paulo`, mesmo `todayBR()`
que os eventos usam) devolve 409 `future_meeting`; o cliente reenvia com
`confirm: true` e o servidor aceita. Espelha o `travel_confirm` dos eventos.

Tokens do feed em `board-calendar-tokens.json` no volume:

```json
{ "tokens": [ { "order": 1, "token": "<32 hex>", "createdAt": "..." } ] }
```

Um token por diretor. Gerar de novo substitui o anterior.

## API

Todas as rotas abaixo, exceto o feed, passam por `requireDirectorApi`.

| Rota | Efeito |
| --- | --- |
| `GET /api/board/meetings` | lista completa, ordenada por data (sem data por último), com `ownersView` (nome + order) resolvido pelo roster |
| `POST /api/board/meetings` | cria; devolve o encontro normalizado |
| `PATCH /api/board/meetings/:id` | edita campos e/ou status; aceita `confirm: true` |
| `DELETE /api/board/meetings/:id` | apaga; qualquer diretor |
| `GET /api/board/meetings/:id.ics` | um `VEVENT` para download (usa sessão) |
| `GET /api/board/calendar-token` | devolve o token do diretor logado, criando se não houver, com a URL `webcal://` e `https://` prontas |
| `POST /api/board/calendar-token/rotate` | gera token novo; o antigo passa a responder 404 |
| `GET /api/board/calendar/:token.ics` | **sem sessão.** Feed com todos os encontros com data e status `marcado`, `realizado` ou `pendencia`. Token inválido: 404 sem corpo. Limite de taxa por IP no mesmo padrão de `registerRateLimited` |

Erros seguem o formato atual `{ error, message }`. Validação inválida devolve
400 `invalid_meeting` com a lista de campos.

### Formato do feed

`text/calendar; charset=utf-8`, `VCALENDAR` versão 2.0, `PRODID` da LEPV,
`X-WR-CALNAME: LEPV · Diretoria`. Cada `VEVENT` tem `UID` estável
(`<id>@lepv.org`), `DTSTAMP`, `DTSTART` e `DTEND` em UTC convertidos de
`America/Sao_Paulo`, `SUMMARY` no formato `<título> · <org>`, `LOCATION`, `URL`
(o link) e `DESCRIPTION` só com contraparte e responsáveis. Pauta, resultado e
pendência **não** entram: uma URL de feed que vaze expõe o mínimo.

Quebra de linha e caracteres especiais escapados conforme RFC 5545; linhas
dobradas em 75 octetos. Sem dependência nova: o gerador é uma função pura em
`server.js` (ou módulo próprio em `lib/`), testável em Node.

## Interface

### Aba Diretoria

Botão `tab-diretoria` injetado no `nav.tabs` pelo `app.js` para quem tem
`me.director || me.superadmin`, no mesmo padrão que a aba Acessos já usa. A
ordem final da nav é Membros → Diretoria → Acessos; como a injeção de Acessos
hoje insere logo depois de Membros, ela passa a inserir depois de Diretoria
quando esta existir. Painel
`panel-diretoria` fica no `app.html` desde o carregamento, vazio, com o
`<script type="module" src="/js/features/board.js">` no fim da página.

Ponte no `app.js` (única mudança no monólito): registrar
`loaders.diretoria`, que dispara
`document.dispatchEvent(new CustomEvent("lepv:board:load"))`. O módulo escuta
esse evento e só então busca os dados. Nenhum global novo em `window`.

### Duas visões

Um seletor no topo do painel alterna **Quadro** e **Calendário**. A escolha
fica em `localStorage` (`lepv.board.view`), com `quadro` como padrão.

**Quadro**: quatro colunas na ordem A marcar → Marcado → Realizado → Com
pendência. No desktop, lado a lado; até 719 px, empilhadas com o contador de
cartões no cabeçalho de cada coluna. Cada cartão mostra título, contraparte,
frente, data e hora (ou "sem data"), iniciais dos responsáveis e, em
pendência, o texto e o prazo. Botões de ação no cartão: **mover** (abre menu
com as outras três colunas), **editar**, **calendário** (Google Calendar em
nova aba e download do `.ics` avulso). Nada de arrastar: botões funcionam no
celular e respeitam os alvos de 44 px que `verify-app.js` cobra.

**Calendário**: grade mensal de 7 colunas, semana começando na segunda,
navegação mês anterior/próximo e "hoje". Cada dia lista os encontros com hora
e título truncado; toque no dia abre a lista completa do dia embaixo da
grade (não um modal). Dias sem encontro ficam vazios; hoje tem marcação.
Encontros "A marcar" não aparecem aqui, só no quadro.

### Criar e editar

Botão "Novo encontro" no topo do painel. Formulário no mesmo modal que o app
já usa (`.pin-backdrop` + `.pin-modal.form-modal`): título, organização,
pessoa, frente, status, data, hora, duração, local, link, responsáveis
(checkboxes com os diretores ativos), pauta, resultado e, quando status é
pendência, texto e prazo da pendência. Campos condicionais aparecem conforme o
status escolhido. Erro 400 marca os campos citados; 409 `future_meeting` pede
confirmação inline e reenvia com `confirm: true`.

### Assinar no calendário

Botão "Assinar no meu calendário" abre um bloco com a URL `webcal://`, botão
copiar, instruções de uma linha para Google / Apple / Outlook e o botão
"Gerar novo link" com aviso de que o antigo para de funcionar.

### Visual

Tokens do tema da liga (`--navy`, `--red` e derivados), sem cor solta.
Densidade em listas e filetes, sem card com sombra difusa. Serif só em
título de seção, nunca em formulário ou tabela. `prefers-reduced-motion`
desliga qualquer transição do menu de mover.

Toda interpolação de dado da API no HTML passa pelas funções de escape do
módulo (`escapeHtml`, `escapeAttr`, `safeUrl`), coerentes com a spec de
modularização. Link externo só entra em `href` depois de `safeUrl`.

## Segurança

- Papel relido a cada request (`liveRole`); promoção ou rebaixamento vale na
  hora, como no resto do app.
- Token do feed: 32 bytes aleatórios em hex, comparado com
  `crypto.timingSafeEqual`. Rotação invalida o anterior. Limite de taxa por IP
  na rota pública. Resposta 404 idêntica para token inexistente e para
  formato inválido.
- Feed exclui pauta, resultado e pendência.
- Nada de `innerHTML` com dado cru; `link` validado no servidor e sanitizado
  de novo no cliente.
- O service worker não cacheia `/api/*`, então feed e listas não sobrevivem ao
  logout. `/js/features/board.js` é estático e pode ser cacheado como
  `app.js`; bumpar `CACHE` em `sw.js` para v10.

## Testes e critérios de aceite

Na suíte e2e (`tests/e2e.js`, volume temporário):

- Diretor cria, lista, edita, move de status e apaga um encontro.
- Membro comum recebe 403 em todas as rotas de `/api/board/*` protegidas e
  não recebe a aba (`/api/me` sem `director`).
- `marcado` sem data/hora → 400; `realizado` com data futura → 409, com
  `confirm: true` → 200.
- Validação de `link` sem `http(s)://` → 400.
- Feed: token gerado responde `text/calendar` com `BEGIN:VCALENDAR`, um
  `VEVENT` por encontro com data, `DTSTART` em UTC certo para um horário
  conhecido de Brasília, `UID` estável entre duas chamadas, sem o texto da
  pauta. Token rotacionado: o antigo devolve 404, o novo 200. Token
  inexistente 404.
- `.ics` avulso exige sessão (401 anônimo).

Em Node, sem browser: teste de unidade do gerador iCalendar (escape de `,;\n`,
dobra de linha em 75 octetos, conversão de fuso em dia de horário de verão
inexistente no Brasil desde 2019, ou seja, offset fixo -03:00).

No browser (novo `scripts/verify-board.js`, encadeado em `npm run verify` e no
CI): logado como diretor no volume de fixture, a aba Diretoria existe, o módulo
carrega sem erro de console, o quadro renderiza as quatro colunas, todos os
botões de cartão têm ≥ 44 px em 390 px, a visão Calendário alterna e volta, e
não há overflow horizontal. Logado como membro comum (order 2 do seed), a aba
não existe.

`npm run verify` atual continua verde. `check-inline-js.js` não precisa
mudar: o módulo é arquivo `.js`, coberto por `node --check` no CI.

## Migração e compatibilidade

- Nenhuma rota, payload, ID ou classe existente muda.
- Store novo nasce vazio no primeiro acesso; sem migração.
- A ponte no `app.js` (loader + injeção do botão) será absorvida por
  `public/js/main.js` quando a modularização for executada; `board.js` já
  exporta `initBoard(context)` além de se auto-inicializar quando importado
  direto pelo `app.html`, para servir aos dois mundos sem reescrita.

## Fora de escopo

- Sincronização de volta (Google → site), OAuth ou webhooks.
- Notificações por e-mail ou WhatsApp.
- Tarefas fora de um encontro, atas formais, anexos de arquivo.
- Visão resumida para membros comuns.
- Histórico de alterações por encontro.
