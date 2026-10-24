# Hackathon Platform Delivery Plan

> **For agentic workers:** Use `executing-plans` for inline execution after the architectural and visual review. Each module requires its own executable plan, implementation and evidence before its acceptance criteria can be marked complete. Do not dispatch agents without authorization or an applicable instruction.

**Goal:** Entregar o portal do hackathon em `/hack`, com informações, avisos segmentados, acesso individual, parceiros, equipes e credenciamento móvel.

**Architecture:** Área própria no servidor Express da LEPV, com frontend e PWA sob `/hack/`. Regras do evento em módulos independentes, adapters para armazenamento e canais de envio, rotas HTTP finas e integração com inscrições existentes.

**Tech Stack:** Node.js, Express, HTML, CSS, JavaScript, `express-session`, `qrcode`, volume persistente; Web Push, IndexedDB e scanner de QR mediante validação em aparelhos. Nenhum novo framework foi escolhido.

## Revisão 2 (24/10/2026) — layout real e ordem vigente

Prevalece sobre os nomes de arquivo e a ordem das entregas abaixo, que eram propostas de 21/10.

- Composição: `lib/hackathon/index.js` (`registerHackathonRoutes`, store, relógio `HACK_NOW`, ator da requisição). Rotas por domínio em `lib/hackathon/routes/<domínio>.js`, todas recebendo o mesmo `ctx`. Não criar `routes.js`.
- Regras puras: `store.js`, `people.js`, `access.js`, `event.js`, `program.js`, `mail.js`, `util.js` (e, a seguir, `announcements.js`, `teams.js`, `submissions.js`, `evaluation.js`, `partners.js`, `admission.js`).
- Front: `public/hack/{index,acesso,portal,organizacao,em-breve}.html`, `hack.css` (LP e tokens), `app.css` (telas de uso), `js/hack-app.js` (base comum), `js/{landing,acesso,portal,org}.js`, `sw.js`, `manifest.webmanifest`.
- Testes: `tests/hackathon.js` (unidade) e `tests/e2e-hack.js` (jornada com servidor e outbox de e-mail), ambos no `npm test`; `scripts/verify-hack.js` no `npm run verify` e no CI.
- Ordem: LP (no ar, PR #6) → acesso e portal → avisos → equipes → entrega e avaliação → parceiros → credenciamento offline.

## Global Constraints

- Especificação: `docs/superpowers/specs/2026-10-21-hackathon-platform-design.md`.
- Datas no fuso `America/Sao_Paulo`.
- Countdown: `2026-10-30T15:00:00-03:00`.
- Avisos para participantes: `2026-10-30T15:00:00-03:00` e `2026-10-31T08:00:00-03:00`.
- Equipes de 2 a 4; pessoas que já declararam grupo não entram na descoberta.
- Todo dado e teste de desenvolvimento usa volume isolado e identidades sintéticas.
- Não publicar eventos pelo conteúdo de `data/`; não fazer `railway up`.
- Segredos por ambiente; novos armazenamentos persistentes de credenciais no PC exigem aprovação específica antes da configuração.
- UI em português, foco visível, contraste e movimento reduzido.
- `npm test` e `npm run verify`, um comando por chamada, na raiz do projeto.
- Abertura visual e funcionalidades são verificações distintas: imagem conceitual não comprova scanner, envio ou countdown funcional.

## Estado desta entrega

- [x] Escopo funcional refinado com o usuário.
- [x] Rota `/hack` escolhida.
- [x] Datas do countdown e dos dois avisos confirmadas.
- [x] Três referências prioritárias do Pinterest inspecionadas.
- [x] Primeira prévia visual gerada para revisão.
- [x] Especificação local registrada.
- [ ] Direção visual aprovada a partir da prévia.
- [ ] Arquitetura proposta revisada antes da implementação dos novos contratos.
- [ ] Módulos implementados e validados.
- [ ] Ensaio operacional e publicação.

## Limites e contratos entre módulos

O servidor existente continua sendo a composição principal. O registro de rotas fica antes de `express.static(PUBLIC_DIR)`; as novas rotas não reutilizam `requireAuthApi` como se todo externo fosse membro da liga.

| Módulo | Arquivos planejados | Contrato de saída |
| --- | --- | --- |
| HTTP e composição | `lib/hackathon/routes.js`, `server.js` | `registerHackathonRoutes(app, dependencies)` registra `/hack` e `/hack/api/*` |
| Regras e armazenamento | `lib/hackathon/event.js`, `lib/hackathon/store.js` | Estado versionado por evento e atualização consistente, com adapter do volume |
| Acesso | `lib/hackathon/access.js` | `requireEventActor(eventId, session)` resolve identidade e papéis atuais ou recusa acesso |
| Informações | `lib/hackathon/program.js` | Programação e local, com atividades vinculadas a organizações |
| Avisos | `lib/hackathon/announcements.js`, `lib/hackathon/delivery.js` | Publicação única, seleção de públicos, recibos e tentativas de canal |
| Parceiros | `lib/hackathon/partners.js` | Organizações, solicitações, representantes aprovados e exportação autorizada |
| Equipes | `lib/hackathon/teams.js` | Descoberta, vagas e aceitação consistente de convite |
| Credenciamento | `lib/hackathon/admission.js` | Validação de ingresso e presença única por evento, participante e dia |
| Frontend | `public/hack/index.html`, `public/hack/portal.html`, `public/hack/organization.html`, `public/hack/hack.css`, `public/hack/js/*.js` | Rotas e interfaces mapeadas pelo servidor; nenhum arquivo HTML privado contorna autorização |
| PWA | `public/hack/sw.js`, `public/hack/manifest.webmanifest`, `public/hack/js/offline.js` | Escopo `/hack/`, fila por identidade e limpeza na troca de usuário |

Os nomes acima são contratos propostos para os planos de cada módulo. A API de negócio não recebe permissões declaradas pelo cliente como prova de autorização.

## Entrega 1: abertura e countdown

Dependência: aprovação da direção visual.

- [ ] Criar plano executável `docs/superpowers/plans/2026-10-21-hackathon-public.md` com a tela aprovada, dados públicos e integração no servidor.
- [ ] Implementar `/hack`, o relógio configurado pelo evento, informações publicadas e entrada para acesso pessoal.
- [ ] Provar antes de 30/10 às 15h, no instante exato e depois, com relógio controlado. Testar fuso diferente no aparelho, relógio do aparelho divergente do servidor, retorno de aba suspensa e ausência de valores negativos.
- [ ] Verificar larguras 390, 768 e 1440, teclado e movimento reduzido.

Arquivos: `server.js`, `lib/hackathon/routes.js`, `lib/hackathon/event.js`, `public/hack/index.html`, `public/hack/hack.css`, `public/hack/js/countdown.js`, `tests/hackathon-public.js`, `scripts/verify-hackathon.js`.

Aceite: contagem funcional para o instante aprovado, informações vindas da publicação do evento, nenhuma data fictícia e navegação do site atual preservada.

## Entrega 2: identidade e portal

Dependência: entrega 1 e revisão do contrato de autenticação.

- [ ] Criar plano executável `docs/superpowers/plans/2026-10-21-hackathon-access.md`.
- [ ] Integrar inscritos externos e membros a identidades do evento sem conceder associação ou diretoria por e-mail coincidente.
- [ ] Implementar link de uso limitado, consumo explícito, sessão, expiração, recuperação e revogação individual.
- [ ] Implementar portal por papéis, acesso a programação/local e estado distinto de confirmação e espera.
- [ ] Testar link expirado, reaproveitado, de outro evento e revogado; provar que QR não autentica e que acesso de membro da liga não concede papéis do evento automaticamente.

Arquivos: `lib/hackathon/access.js`, `lib/hackathon/store.js`, `lib/hackathon/routes.js`, `server.js`, `public/hack/access.html`, `public/hack/portal.html`, `public/hack/js/access.js`, `public/hack/js/portal.js`, `tests/hackathon-access.js`.

Aceite: link pessoal abre somente a identidade correta; recuperação é neutra; nenhum segredo vai para log, cache público ou exportação.

## Entrega 3: avisos e canais

Dependência: identidade e permissões da entrega 2.

- [ ] Criar plano executável `docs/superpowers/plans/2026-10-21-hackathon-announcements.md`.
- [ ] Implementar central, não lidos, composição de públicos, permissão de staff, agendamento persistente e recibos por canal.
- [ ] Criar e testar os dois horários aprovados com relógio injetado; reiniciar e repetir a execução não republica avisos nem duplica destinatário com vários papéis.
- [ ] Integrar e-mail e Web Push por adapters; validar permissão, inscrição/remoção por aparelho e abertura do aviso correto.
- [ ] Validar o mecanismo de WhatsApp local, com teste autorizado e registros de retomada, PC desligado e resultado de envio desconhecido. Escolher o mecanismo somente após evidência; não marcar uma conversa aberta como mensagem entregue.
- [ ] Provar isolamento entre públicos, revogação de permissão, desativação de canal e falha de um canal sem bloquear a central ou os demais.

Arquivos: `lib/hackathon/announcements.js`, `lib/hackathon/delivery.js`, `lib/hackathon/adapters/email.js`, `lib/hackathon/adapters/web-push.js`, `lib/hackathon/routes.js`, `public/hack/js/announcements.js`, `public/hack/sw.js`, `tests/hackathon-announcements.js`, `tests/hackathon-delivery.js`.

Aceite: central e agendador demonstrados por testes, push em aparelhos reais e envio real controlado de e-mail/WhatsApp. Enquanto um adapter não estiver configurado, o painel o mostra indisponível, não entregue.

## Entrega 4: parceiros e cronograma

Dependência: entregas 2 e 3.

- [ ] Criar plano executável `docs/superpowers/plans/2026-10-21-hackathon-partners.md`.
- [ ] Implementar organizações editáveis, formulário com listas dependentes, solicitações e decisão da diretoria.
- [ ] Vincular representantes e atividades com horário/local à própria organização.
- [ ] Implementar exportação restrita ao evento e aos consentimentos atuais; incluir somente os campos aprovados e proteger abertura de CSV contra fórmulas.
- [ ] Testar alteração forjada de modalidade/organização, solicitação pendente, representante revogado, acesso a organização alheia, consentimento retirado e bloqueio de apoiadores/jurados na exportação.

Arquivos: `lib/hackathon/partners.js`, `lib/hackathon/program.js`, `lib/hackathon/routes.js`, `public/hack/partners.html`, `public/hack/js/partners.js`, `public/hack/js/program.js`, `tests/hackathon-partners.js`.

Aceite: seleção pública nunca concede acesso, listas refletem o cadastro da diretoria e a exportação reflete o consentimento no instante do download.

## Entrega 5: equipes

Dependência: identidade da entrega 2.

- [ ] Criar plano executável `docs/superpowers/plans/2026-10-21-hackathon-teams.md`.
- [ ] Implementar perfis, busca, vagas, criação de equipe e convites aceitos/recusados.
- [ ] Excluir quem declarou grupo das consultas e convites de descoberta, inclusive por chamada direta à API.
- [ ] Testar confirmação com 1, 2, 4 e 5 integrantes; duas aceitações para a última vaga; uma pessoa aceitando duas equipes; duplicação de clique; intervenção autorizada da diretoria.

Arquivos: `lib/hackathon/teams.js`, `lib/hackathon/routes.js`, `public/hack/js/teams.js`, `tests/hackathon-teams.js`.

Aceite: equipe confirmada tem 2 a 4 integrantes e pessoa participa de uma só equipe por evento; possuir grupo não remove nenhuma outra função do portal.

## Entrega 6: QR, scanner e offline

Dependência: identidade da entrega 2 e validação da persistência.

- [ ] Criar plano executável `docs/superpowers/plans/2026-10-21-hackathon-admission.md`.
- [ ] Implementar ingresso individual e scanner restrito à diretoria, com busca manual e presença por dia em Brasília.
- [ ] Adicionar escopo PWA próprio e revisar o worker raiz em `public/sw.js`; a limpeza de caches não apaga arbitrariamente caches de outro escopo.
- [ ] Implementar preparação para offline, autorização temporária por aparelho, fila persistente, sincronização idempotente e reconciliação.
- [ ] Testar QR de evento diferente, ingresso cancelado, leitura repetida, dia errado, permissão perdida, câmera negada e decodificação indisponível.
- [ ] Provar dois aparelhos offline lendo a mesma pessoa; reinício com pendências; reconnect; logout; troca de identidade; revogação após preparação e expiração da autorização offline.

Arquivos: `lib/hackathon/admission.js`, `lib/hackathon/routes.js`, `public/hack/admission.html`, `public/hack/js/admission.js`, `public/hack/js/offline.js`, `public/hack/sw.js`, `public/hack/manifest.webmanifest`, `public/sw.js`, `tests/hackathon-admission.js`, `scripts/verify-hackathon-offline.js`.

Aceite: uma presença definitiva por evento/pessoa/dia, pendências visíveis, nenhum sucesso definitivo enquanto só existe registro local e nenhuma informação privada residual entre identidades.

## Verificação integrada e publicação

- [ ] Usar `scripts/ci-fixtures.js` para preparar volume temporário e eventos de teste; não usar a base local como prova da produção.
- [ ] Executar testes específicos dos módulos, `npm test` e `npm run verify`. O último precisa de Chromium compatível, servidor de verificação e fixtures.
- [ ] Documentar acessibilidade, aparência mobile/desktop e ensaio dos canais e do credenciamento em aparelhos reais.
- [ ] Revisar arquivos rastreados e assets em checkout limpo antes da publicação.
- [ ] Publicar pelo fluxo GitHub/main somente após validação e autorização aplicável; conferir CI, Railway e `/hack` público antes de declarar entrega em produção.

## Evidência da preparação documental

Em 21/10/2026, `npm test` concluiu com 66 casos aprovados e zero falhas, além de `ical OK`. `npm run verify` chegou a `verify:art` e parou porque falta o Chromium headless exigido pelo Playwright instalado. Nenhuma tela funcional, countdown ou disparo novo é comprovado por esses testes da base existente. O frontend de produção não foi alterado nesta preparação.
