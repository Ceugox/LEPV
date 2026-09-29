# Centro de gastos: lançamento, anexos e ressarcimento

**Data:** 2026-09-29
**Status:** aprovado para planejamento

## Objetivo

Dar aos membros da LEPV um lugar para lançar **gastos da liga** — os que o
membro pagou do próprio bolso e precisa ser ressarcido pela diretoria, e os que
a diretoria já pagou diretamente — com **nota fiscal e comprovante anexados**
(foto da câmera, galeria ou PDF). A diretoria acompanha tudo num extrato só,
aprova ou recusa cada pedido e marca o pagamento.

Resolve hoje o que acontece por WhatsApp: comprovante se perde no histórico,
ninguém sabe o que já foi pago e a prestação de contas depende de memória.

## Decisões

- **Objeto próprio** em `reimbursements.json` + arquivos em `STORAGE_DIR/reimbursements/`,
  nos mesmos moldes de `materials`/`event-photos`: metadado em JSON, binário no
  volume. Nada de tabela nem dependência nova.
- **A rota é `/api/reimbursements`, não `/api/expenses`.** Esse nome foi da
  feature removida de rateio da viagem (acerto via Pix) — e há teste guardando
  que `/api/expenses` continua 404 e que `expenses.json` nunca renasce. O
  nome novo não enfraquece o contrato e não confunde os dois domínios.
- **Visibilidade privada.** O membro vê e mexe só nos próprios lançamentos;
  diretor (`director` ou `superadmin`) vê e age em todos. O extrato de gastos
  **não** é prestação de contas pública entre membros nesta versão.
- **Ciclo de vida com aprovação.** `pendente → aprovado | recusado → pago`.
  Quem decide é a diretoria; `note` registra o motivo de recusa ou observação
  do pagamento.
- **Checkbox muda o destino, não o formulário.** "A diretoria já pagou este
  gasto" (`kind: paid_by_board`) faz o lançamento nascer `pago` — é registro
  de fato, não pedido. `kind: reimbursement` (padrão) nasce `pendente` e segue
  o ciclo de aprovação.
- **Edição trava depois da decisão.** O dono edita e exclui enquanto
  `pendente`; a partir de `aprovado`/`recusado`/`pago` só a diretoria mexe.
- **Anexos: imagem ou PDF, até 5 por lançamento.** Upload em corpo cru
  (`express.raw`) com sniffing real do conteúdo — `sniffImage` para
  JPG/PNG/WebP e assinatura `%PDF-` — exatamente o padrão dos endpoints de
  avatar e de materiais. Imagem até 6 MB, PDF até 25 MB.
- **Aba própria "Gastos"** no grupo `liga` da nav, para todo membro autenticado
  — não dentro da aba Diretoria (que não existe para membro comum). Módulo ES
  novo `public/js/features/reimbursements.js`, no formato que a spec de
  modularização e a implementação de `board.js` já definiram: `app.js` só
  injeta a aba e dispara o evento de carga.
- **Mobile first.** O formulário é o caminho principal: abrir no celular,
  fotografar a nota, lançar. Dois inputs de arquivo separados — um com
  `capture="environment"` abre a câmera direto ("Tirar foto"), o outro sem
  `capture` abre galeria/arquivos para PDF ("Escolher arquivo"). Motivo:
  `capture` num input único trava o Android na câmera e não deixa escolher
  arquivo.

## Modelo de dados

`data/reimbursements.json`, lido/escrito por `readJson`/`writeJson`:

```json
{
  "expenses": [
    {
      "id": "gx<base36><hex>",
      "memberOrder": 5,
      "description": "Uber até a gráfica — banner do Hackathon",
      "amountCents": 3450,
      "spentAt": "2026-09-27",
      "kind": "reimbursement",
      "status": "pendente",
      "attachments": [
        { "id": "ga<...>", "type": "image", "file": "gx-...-a1.jpg",
          "name": "nota.jpg", "size": 182340 }
      ],
      "decidedBy": 1,
      "decidedAt": "2026-09-28T14:00:00.000Z",
      "note": null,
      "createdAt": "2026-09-28T12:00:00.000Z",
      "updatedAt": "2026-09-28T12:00:00.000Z"
    }
  ]
}
```

Regras de campo, aplicadas no servidor:

| Campo | Regra |
| --- | --- |
| `description` | obrigatório, 3 a 160 caracteres |
| `amountCents` | inteiro > 0, ≤ 9.999.999 (R$ 99.999,99) |
| `spentAt` | `YYYY-MM-DD`, obrigatório, não futuro |
| `kind` | `reimbursement` (padrão) ou `paid_by_board` |
| `status` | derivado: nasce `pago` se `paid_by_board`, senão `pendente` |
| `attachments` | 0 a 5 itens; `type` ∈ `image`, `pdf` |
| `decidedBy`/`decidedAt` | `order` do diretor + ISO; preenchidos a cada decisão |
| `note` | opcional, até 280 caracteres; obrigatória na recusa |

Status são derivados, nunca escritos pelo cliente: `PATCH` do dono não toca
`status`, `kind` nem `memberOrder`.

## API

Autenticação por `requireAuthApi`/`requireDirectorApi` (papel relido a cada
request, como no resto do `server.js`).

| Rota | Papel | Efeito |
| --- | --- | --- |
| `GET /api/reimbursements` | autenticado | membro recebe os próprios; diretor recebe todos, com filtros `?status=` e `?member=` |
| `POST /api/reimbursements` | autenticado | cria lançamento em nome do próprio membro |
| `PATCH /api/reimbursements/:id` | autenticado | dono edita só se `pendente`; diretor edita sempre |
| `DELETE /api/reimbursements/:id` | autenticado | dono exclui só se `pendente`; diretor exclui sempre |
| `POST /api/reimbursements/:id/status` | diretor | `{status, note?}`; transições válidas abaixo |
| `POST /api/reimbursements/:id/attachments` | autenticado | corpo cru imagem/PDF; dono só se `pendente`, diretor sempre; máx. 5 |
| `GET /api/reimbursements/:id/attachments/:att` | autenticado | dono ou diretor; anexos não são públicos |
| `DELETE /api/reimbursements/:id/attachments/:att` | autenticado | dono só se `pendente`; diretor sempre |

Transições válidas em `status` (diretor): `pendente → aprovado`,
`pendente → recusado`, `aprovado → pago`, `aprovado → pendente` (reabrir).
Recusar exige `note`. Marcar `pago` preenche `decidedBy`/`decidedAt` novamente.

## Tela

Nova aba **Gastos** no grupo `liga` (depois de Membros), módulo
`public/js/features/reimbursements.js`. O `app.js` só registra o botão e dispara
`lepv:expenses:load`.

**Membro — mobile first:**

- Resumo no topo: meus totais por status (pendente / aprovado / pago).
- Botão primário "Novo gasto" → formulário: descrição, valor (input
  `inputmode="decimal"` formatado R$), data (hoje, `type="date"`), checkbox
  **"A diretoria já pagou este gasto"** e seletor de anexos
  (`accept="image/*,application/pdf" capture="environment"`, múltiplo).
- Lista própria em cartões: descrição, valor, data, selo de status,
  miniaturas/contagem de anexos. Tocar abre detalhe: anexos abrem em nova aba
  (imagem) ou baixam (PDF), editar/excluir visíveis só em `pendente`.

**Diretor — mesma aba, mais:**

- Extrato consolidado de todos os membros, filtro por status e por membro.
- Ações por lançamento: Aprovar, Recusar (pede motivo), Marcar pago.
- Editar/anexar em qualquer status.

**Erros e estados vazios:** mensagens de negócio (`error` codes do servidor
viram texto em português no módulo), lista vazia com convite a lançar, estado
de carregamento enquanto o fetch não volta.

## Verificação

- `tests/e2e.js` ganha cenário novo: membro cria gasto com foto → diretor vê no
  extrato consolidado → aprova → marca pago → membro não edita mais; e o
  inverso: membro B não vê gasto do membro A (403/404), anexo exige dono ou
  diretor.
- `npm test` e `npm run verify` verdes — os 13 checks existentes (inline JS,
  CSS, contraste, UI, abas, tags, diretoria) continuam guardando o design
  system.
- Data em `America/Sao_Paulo` como no resto do app (regra 3 do AGENTS.md).

## Fora de escopo

- Prestação de contas pública entre membros (visibilidade total).
- Exportação (CSV/PDF), relatórios por período ou por categoria.
- Categorias fixas de gasto — a descrição livre cobre esta onda.
- Notificação por e-mail em mudança de status.
- Orçamento/teto da liga e saldo.
