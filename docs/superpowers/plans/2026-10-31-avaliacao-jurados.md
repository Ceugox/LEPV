# Avaliação assistida dos jurados — plano v1

> Implementação em worktree isolada, com frentes de domínio/API e interface;
> integração e revisão final pelo agente principal.

**Objetivo:** jurados cadastrados acessam uma tela móvel pelo link pessoal,
registram comentários privados e confirmam notas por critério nas rodadas
sincronizadas abertas pela organização. Materiais continuam no site.

**Arquitetura:** domínio síncrono no estado JSON existente; rotas por sessão;
interface dedicada em `/hack/avaliacao` com polling; LLM apenas para organizar
comentários do próprio jurado. A confirmação usa `evaluation.submitScore`.

**Stack:** Node/Express, JavaScript e CSS do portal; Anthropic via HTTP no servidor.

## Restrições globais

- Não publicar nem enviar mensagens ou links reais. Mostrar prévia local.
- Nunca colocar chave em bundle, log, fixture ou commit.
- Respeitar fase, impedimentos, jurados bloqueados, escalas de 0,5 em 0,5 (como a banca), pilares do jurado e travas.
- Não perder rascunho ao atualizar rodada; confirmação explícita e por revisão.
- Nenhuma IA atribui nota ou altera comentários originais.
- Apenas texto nesta versão, conforme decisão posterior do usuário.

## 1. Domínio e rotas

Arquivos: `lib/hackathon/live-evaluation.js`, `routes/live-evaluation.js`,
`store.js`, `index.js`; testes `tests/live-evaluation.js`.

- [ ] Criar rodadas com equipe/fase/tipo e encerramento controlado por `manage`.
- [ ] Criar notas privadas por rodada/jurado, idempotentes por `opId`.
- [ ] Salvar rascunho com revisão otimista e confirmar com revisão exata.
- [ ] Reutilizar `submitScore`; avanço preserva pendências, nunca troca destino
      de um comentário enviado com rodada explícita.
- [ ] Testar privacidade, reenvio, bloqueios, conflito, transição e revisão antiga.

Contrato: `GET /hack/api/judge/live`, `GET /judge/live/rounds/:id`,
`POST /judge/live/rounds/:id/notes`, `PUT /judge/live/rounds/:id/draft`,
`POST /judge/live/rounds/:id/confirm`; todos sob `/hack/api`.
Organização: `GET /admin/live`, `POST /admin/live/rounds` e
`POST /admin/live/rounds/:id/close`.

## 2. Interface móvel

Arquivos: `public/hack/avaliacao.html`, `avaliacao.css`, `js/avaliacao.js`.

- [ ] Exibir identidade do jurado, equipe atual, materiais e rodadas pendentes.
- [ ] Comentários com estados de envio e recuperação após falha.
- [ ] Sequência de critérios, resumo e botão de confirmação explícita.
- [ ] Painel da organização mostra pendências e abre/encerra rodada.
- [ ] Polling não destrói texto em edição nem mistura equipe anterior e atual.
- [ ] Prévia móvel e desktop com dados de teste isolados.

## 3. Acesso e resumo assistido

Arquivos: `routes/access.js`, `public/hack/js/acesso.js`,
`lib/hackathon/judge-summary.js`, `routes/judge-summary.js`, testes próprios.

- [ ] Aproveitar token pessoal com destino permitido para `/hack/avaliacao`.
- [ ] Resumo recebe somente notas do jurado autenticado; entrada limitada,
      timeout e erro visível; sem persistir resultado antigo como atual.
- [ ] Sem chave ou falha da IA, comentários e notas continuam utilizáveis.
- [ ] Configuração de modelo e credencial apenas no servidor.

## 4. Integração e aceitação

- [ ] `npm test` e testes novos passam.
- [ ] `npm run verify` passa; executar testes de navegador específicos.
- [ ] Jurado A não lê comentários nem rascunhos de B.
- [ ] Duplo clique não duplica nota; revisão antiga não confirma dados novos.
- [ ] Nova rodada não apaga texto nem associa comentário à equipe errada.
- [ ] Mostrar URL e evidências da prévia; alterações permanecem locais.
