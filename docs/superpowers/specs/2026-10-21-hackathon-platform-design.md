# Portal do hackathon LEPV

Data: 21/10/2026. Versão: 1. Revisão 2 em 24/10/2026 (seção abaixo prevalece sobre o restante).

## Revisão 2 — decisões de 24/10/2026

Confirmadas com o usuário em rodada de grilling. Prevalecem sobre qualquer trecho anterior em conflito.

- **Escopo completo** da versão 1, mais **submissão de entregas** e **avaliação das equipes** (antes fora do escopo). Prazo: evento em 30–31/10/2026.
- **Locais:** sexta 30/10, 15h–22h, FGV (endereço a confirmar); sábado 31/10, 8h–19h, Instituto 12 (Av. Ataulfo de Paiva, 1120, Leblon) — a grande final. Nome: "1º Hackathon LEPV", sem FGV na marca.
- **Direção visual:** LP15 "Noite no Rio" aprovada (`propostas/hack/lp15-noite-rio`). Páginas públicas com foto, vidro, Barlow Condensed e vermelho LEPV; telas de uso (portal, avaliação, organização, credenciamento) com o mesmo design system sobre fundo escuro estável, foto só em cabeçalho e nada de efeito atrás de QR, formulários e notas. Substitui a "Direção visual proposta" abaixo.
- **Participantes** vêm das inscrições do evento `type: "hackathon"` já existentes (`events.json`), sem novo cadastro.
- **Equipes:** participantes criam equipe e chamam colegas por código/convite; quem não tem grupo usa a descoberta; a diretoria também cria, ajusta e mescla equipes no painel. Toda equipe que entrega precisa existir na plataforma.
- **Entrega por equipe:** link do repositório (obrigatório), slides em PDF até 20 MB (obrigatório), link de vídeo/demo (opcional), descrição até 500 caracteres. Editável até o prazo, depois trava. Prazo padrão **sábado 31/10 às 13h** (`2026-10-31T13:00:00-03:00`, horário oficial "Submissão dos projetos"), editável pela diretoria.
- **Avaliação:** critérios (nome, descrição, peso, escala) cadastrados pela diretoria no painel e definidos ao final; a avaliação só abre após a diretoria travar os critérios. Fase única por padrão, com opção "marcar finalistas" que abre uma fase final em que vale a nota da final. Jurado vê só as próprias notas e marca conflito com equipe. Ranking (média ponderada, desempate pelo critério escolhido) só para a diretoria, que trava e revela o resultado na grande final. Participantes não veem notas nem feedback nesta edição.
- **Jurados:** cadastrados pela diretoria (nome, e-mail, organização opcional) e recebem link de acesso pessoal.
- **E-mail:** Resend (`RESEND_API_KEY`, remetente @lepv.org) como principal; contingência pela diretoria gerando o link no painel e enviando manualmente pelo WhatsApp.
- **WhatsApp:** envio assistido — o painel monta a fila, abre a conversa com a mensagem pronta, o organizador envia e marca como enviado. Automação não oficial fica atrás de chave desligada; só com aprovação específica e número de teste.
- **Entrega incremental:** cada módulo que passar em `npm test`, `npm run verify` e revisão vai para a `main` com aviso prévio (push autorizado). Ordem: LP → acesso e portal → avisos → equipes → entrega e avaliação → parceiros → credenciamento offline.
- **Dependências do usuário:** conta Resend com domínio verificado e chave no Railway; Android e iPhone para a prova de push.

Status: escopo funcional aprovado na conversa; direção visual e arquitetura abaixo são propostas para revisão. Nenhum disparo real, publicação ou integração de mensagens foi ativado por este documento.

## Problema e resultado

Participantes precisam encontrar as informações do hackathon em um único lugar, receber comunicados, apresentar seu ingresso e encontrar equipe quando ainda não possuem grupo. Patrocinadores precisam conhecer seus momentos de participação e acessar os dados cujo compartilhamento foi autorizado. Diretoria e staff precisam administrar essas jornadas e credenciar participantes pelo celular.

A experiência terá endereço próprio em `https://lepv.org/hack`, com navegação própria. O evento existente permanece a referência para inscrições; o cadastro de pessoas externas não deve exigir associação à liga.

## Decisões aprovadas

- Plataforma digital, incluindo informações do evento, cronograma, local e materiais.
- Acesso pessoal por link, com envio por e-mail e aviso pelo WhatsApp; recuperação pelo e-mail cadastrado.
- QR individual do participante, distinto do link de autenticação.
- Credenciamento por dia pela diretoria no celular, busca manual, alerta de repetição e operação offline com sincronização posterior.
- Equipes de 2 a 4 participantes, com perfis, habilidades, interesses, vagas e convites aceitos ou recusados pelo destinatário.
- Quem respondeu que já tem grupo fica fora da descoberta de participantes sem equipe. Mantém acesso ao portal, aos avisos e ao próprio QR. Essa resposta não identifica automaticamente os demais integrantes do grupo.
- Canal de avisos para um ou vários públicos: participantes, patrocinadores, apoiadores e jurados; opção Todos. Pessoas com vários papéis não recebem duplicatas da mesma publicação por canal.
- Diretoria publica para todos os públicos e concede a integrantes do staff a permissão de comunicação.
- Central de avisos com não lidos, e-mail opcional e push no PWA. O autor escolhe os canais; urgência marca push por padrão, respeitando a autorização no aparelho.
- Convite de parceiros com escolha de modalidade Patrocinador ou Apoiador e lista de organizações dependente da modalidade. Teachy, Norte e NXTP são exemplos fornecidos para Patrocinador, não confirmação de parceria comercial.
- Diretoria administra organizações e representantes. A seleção no formulário solicita vínculo; somente a aprovação concede acesso pessoal ao papel e à organização.
- Cada representante aprovado visualiza a agenda de participação ativa da própria organização.
- Patrocinadores aprovados podem exportar nome, curso/instituição e contatos de participantes que autorizaram o compartilhamento. Apoiadores e jurados não recebem exportação de contatos.
- WhatsApp pode utilizar automação no PC do organizador. O mecanismo de envio precisa ser validado antes de ser considerado operacional; não há provedor contratado ou integração funcionando por consequência desta decisão.

## Countdown e avisos com horário aprovado

Fuso: `America/Sao_Paulo`.

| Função | Data e hora em Brasília | Instante com offset | Público |
| --- | --- | --- | --- |
| Countdown / início do hackathon | 30/10/2026 às 15h | `2026-10-30T15:00:00-03:00` | Visitantes e usuários do portal |
| Primeiro aviso programado | 30/10/2026 às 15h | `2026-10-30T15:00:00-03:00` | Participantes |
| Segundo aviso programado | 31/10/2026 às 08h | `2026-10-31T08:00:00-03:00` | Participantes |

O countdown apresenta dias, horas, minutos e segundos; não fica negativo. Ao alcançar o início, troca para “O hackathon começou”. Não anuncia o fim do evento sem horário de encerramento definido.

Textos propostos para edição pela organização antes da ativação:

1. “O hackathon começou! Confira a programação, o local e seu QR no portal.”
2. “Bom dia! Confira a programação de hoje e acompanhe os avisos do hackathon.”

O backend agenda as publicações; o timer da página não dispara mensagens. Uma publicação lógica por horário, com recibos independentes por destinatário e canal. Reiniciar o servidor não recria publicações já processadas. Se o processo voltar depois do horário, a publicação vencida aparece como pendente para revisão da organização, evitando envio tardio sem contexto. Durante operação normal, uma tentativa de envio com resultado desconhecido não é marcada como entregue.

O público é resolvido no momento de publicação para incluir os participantes que se inscreverem após o agendamento. Novos usuários podem consultar os avisos publicados que lhes forem visíveis; não recebem uma rajada de notificações antigas. Links pessoais de acesso só vão ao próprio destinatário, nunca em aviso coletivo.

## Principais jornadas

1. Participante confirma inscrição, recebe acesso pessoal, abre o portal e encontra avisos, programação, local e QR. A lista de espera mantém informação de sua condição sem transformar interesse em ingresso confirmado.
2. Participante sem grupo publica perfil, encontra uma equipe com vagas e aceita um convite. Confirmar uma equipe exige entre 2 e 4 pessoas; aceitar convites simultâneos não pode ultrapassar 4 nem colocar a pessoa em duas equipes do mesmo evento.
3. Representante acessa convite de parceiros, seleciona modalidade/organização e informa nome e e-mail. Diretoria aprova ou rejeita. Aprovado recebe acesso individual, agenda da organização e os avisos do seu público.
4. Diretoria/staff com permissão redige aviso, seleciona públicos e canais, confere o alcance e publica ou agenda. Cada pessoa visualiza um único aviso mesmo quando pertence a dois públicos selecionados.
5. Diretoria abre scanner pelo celular, prepara o evento para offline e lê o QR do participante. A interface mostra sucesso, repetição, ingresso inválido ou pendência de sincronização de forma distinta.

## Arquitetura proposta

Manter Node/Express, HTML/CSS/JavaScript e o volume persistente atuais. Um módulo de hackathon isolado por evento e registrado no servidor existente, com frontend próprio sob `/hack`. Não criar um segundo serviço nem trocar framework na primeira entrega.

Alternativas consideradas:

- Aplicação separada: permite ciclos independentes, mas exige integração e operação adicionais para compartilhar inscrições, pessoas e permissões.
- Adicionar tudo ao painel atual: reaproveita telas, mas mistura a navegação da liga com as jornadas externas do evento.
- Área própria `/hack` no mesmo servidor: recomendada; mantém o endereço escolhido e reduz duplicação de dados e infraestrutura.

Rotas propostas:

| Caminho | Responsabilidade |
| --- | --- |
| `/hack` | Abertura pública, countdown e informações publicadas |
| `/hack/acesso` | Entrada e recuperação por link pessoal |
| `/hack/portal` | Portal conforme papéis do usuário autenticado |
| `/hack/parceiros` | Solicitação de vínculo de apoiador/patrocinador |
| `/hack/organizacao` | Gestão restrita ao evento e às permissões concedidas |
| `/hack/credenciamento` | Scanner e busca manual autorizados |
| `/hack/api/*` | API de eventos, pessoas, avisos, equipes e check-in |
| `/hack/sw.js` | Service worker com escopo `/hack/` |
| `/hack/manifest.webmanifest` | Instalação do PWA com abertura no portal |

O manifesto usa caminhos coerentes com `/hack/`; a rota `/hack` pode normalizar para `/hack/`. O service worker existente, com escopo raiz, requer revisão para não guardar ou servir páginas de autenticação e conteúdo privado dessa área. Não basta adicionar outro worker sem verificar ambos os escopos.

O login por link cria sessão de evento; não transforma externo em membro da liga. Papel e organização são conferidos no servidor em cada operação. Diretoria é vinculada ao cadastro já autorizado, sem conceder poderes por semelhança de nome ou e-mail. Links de convite, autenticação e QR têm finalidades e credenciais distintas.

Os módulos mantêm separação entre regras, persistência, HTTP e envio. Toda alteração de equipe e registro de presença precisa concluir em uma operação consistente. Com armazenamento em arquivo, a primeira versão exige um único processo escritor e testes de concorrência; múltiplas réplicas exigem decisão de persistência diferente antes de escalar.

## Mensagens e dependências externas

- E-mail: adapter de envio e configuração de remetente são necessários. O repositório não possui serviço de e-mail conectado.
- Push: assinatura por aparelho, autorização acionada pelo usuário e envio Web Push pelo servidor. Receber a mensagem no serviço push não prova que a pessoa a leu. No iPhone, incluir orientação de instalação na tela inicial conforme a documentação da Apple.
- WhatsApp: fila persistente e status visível à organização; processo local pode parar se o PC estiver desligado ou sem conexão. Provar autenticação, envio, confirmação e retomada com conta e destinatários de teste autorizados antes de ativar envios reais. Avaliar mecanismo autorizado pelo serviço e alternativa oficial; automação genérica do aplicativo comum não deve ser tratada como garantia de entrega.
- Falha de um canal não remove o aviso da central nem bloqueia os demais. Não registrar envio externo como concluído apenas por gerar uma mensagem ou abrir uma conversa.

## Offline e QR

QR não contém telefone, e-mail, CPF nem o link que autentica o portal. O leitor reconhece evento, ingresso e validade da credencial. Autorizar câmera apenas após ação explícita. Busca manual permanece disponível caso câmera ou decodificador falhem.

O aparelho autorizado prepara uma cópia mínima do evento e uma autorização de duração limitada para credenciamento. A fila local registra chave de operação, aparelho, data do evento e leitura. O servidor mantém a unicidade por evento, participante e dia. Reenviar a mesma operação não gera uma nova presença.

Dois aparelhos totalmente offline não conseguem excluir uma leitura feita no outro em tempo real. Exibir “Registrado neste aparelho; sincronização pendente” e reconciliar conflitos sem contagem duplicada. Revogações ocorridas depois da preparação também só serão conhecidas ao reconectar. Logout, troca de identidade e fim da autorização precisam bloquear e limpar os dados locais correspondentes; confirmar envio das pendências ou alertar antes de descartá-las.

## Direção visual proposta

Referências prioritárias indicadas pelo usuário:

- https://pin.it/aVqqeVpRo — landing com escala, imagem atmosférica e título central.
- https://pin.it/7ItTbHEox — painel espacial com camadas translúcidas e agenda.
- https://pin.it/3nDX0BMLt — ambiente de hackathon com iluminação ciano e magenta; referência de imagem.

Referências secundárias: https://xathon.beyondx.co/ e https://www.aicollective.com/.

Proposta: abertura cinematográfica com imagem de colaboração e profundidade; contraste entre carvão, branco e ciano, com magenta restrito à luz da cena. Translucidez pontual na navegação e nos painéis; superfícies de leitura estáveis para QR, horários e avisos. A imagem do Pinterest é referência, não acervo de fotos do evento. Uma imagem conceitual não deve ser apresentada como registro de participantes reais.

No portal móvel, hierarquia: QR pessoal, próximo horário, avisos e equipe. Na organização, priorizar operação e legibilidade. Contraste de texto normal de pelo menos 4,5:1, foco visível, alvos adequados ao toque, suporte a teclado e preferência por movimento reduzido. Nada essencial depende de animação de entrada.

## Fora do escopo aprovado

Infraestrutura física, pagamentos, venda de ingressos, gestão de contratos de patrocínio, avaliação de projetos, pontuação de jurados, submissão de entregas, certificados e chat em tempo real. O papel de jurado existe para acesso à informação e segmentação de avisos; não implica motor de avaliação.

## Critérios de aceite

- `/hack` possui navegação própria e funciona em desktop e celular sem alterar as jornadas existentes da liga.
- Relógio simulado prova countdown antes, durante e depois de `2026-10-30T18:00:00Z`, incluindo acesso de outro fuso.
- Relógio simulado prova os dois avisos nos instantes aprovados, respectivamente `2026-10-30T18:00:00Z` e `2026-10-31T11:00:00Z`; público apenas participantes, com deduplicação e persistência após reinício.
- Link inválido, expirado, consumido ou revogado não autentica; recuperação não revela existência de conta; QR não autentica o portal.
- Selecionar Patrocinador e uma empresa não permite consultar agenda privada, exportar ou publicar sem aprovação.
- Representantes veem a agenda correta da organização. Exportação respeita consentimento atual e o papel do solicitante; campos não autorizados não aparecem no arquivo.
- Públicos não selecionados não recebem o aviso nem conseguem consultá-lo pela API. Staff sem permissão não publica.
- Push é demonstrado em aparelho Android e iPhone compatíveis com aplicativo fechado, autorização concedida e abertura do aviso correto; testes simulados não substituem essa prova.
- Equipes confirmadas têm 2 a 4 pessoas. Pessoas com grupo pré-declarado não aparecem na busca nem recebem convites dessa descoberta.
- QR pessoal gera presença diária; repetição, QR de outro evento, revogação e aparelho não autorizado têm tratamento explícito.
- Dois aparelhos offline sincronizam a mesma presença sem duplicação. Reiniciar o app preserva operações pendentes; trocar conta não revela os dados anteriores.
- E-mail e WhatsApp têm envio real de teste e estados observáveis antes de serem declarados funcionais.
- `npm test` e `npm run verify` passam com volume descartável; evidência visual usa dados sintéticos e revisão local antecede publicação.

## Fontes técnicas consultadas

- Apple: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- WebKit: https://webkit.org/blog/13878/
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN BarcodeDetector: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- WhatsApp: https://faq.whatsapp.com/361005896189245/

## Ordem de entrega

1. Aprovar a direção visual pela prévia; fechar contratos técnicos do primeiro módulo.
2. Área `/hack`, countdown e programação/local públicos.
3. Acessos individuais, papéis, convites e portal pessoal.
4. Avisos segmentados, persistência de agendamento, central e adapters de canais; provar os dois avisos com relógio simulado.
5. Organizações, agenda de participação ativa e exportação autorizada.
6. Descoberta de participantes sem time e equipes de 2 a 4.
7. QR pessoal, credenciamento online e offline com reconciliação.
8. Provas em aparelhos, envio real autorizado dos canais, ensaio operacional, revisão e publicação pelo fluxo do repositório.

Cada módulo recebe plano executável e ciclo de testes próprios. A ordem de desenvolvimento não significa que uma entrega parcial atende ao escopo completo.

## Revisão 3 (25/10/2026): grupos e acompanhamento

Aprovada pelo Marcell em 25/10, depois de grilling. Três entregas, nesta ordem, um PR cada.

1. **Indicar colegas do grupo.** Quem marcou "tenho grupo" busca, no portal, os colegas entre os inscritos confirmados que também marcaram grupo e estão sem equipe (só nome, vínculo e curso). O indicado aceita ou recusa no portal dele; o primeiro aceite de uma indicação cria a equipe de quem indicou ("Grupo de <nome>", renomeável, com quem indicou como dono), e os aceites seguintes do mesmo lado entram nela. Duas pessoas que indicam em paralelo formam equipes separadas, que a organização junta se for o caso. Limite de 4 conta as indicações pendentes; quando dois lados se juntam, o excedente é cancelado. Indicação é de quem indicou: sai da equipe, é desligado ou o indicado deixa de participar, a indicação é cancelada. Quem indicou cancela; quem foi indicado não indica de volta (aceita). O código de equipe continua valendo. A organização vê, na lista sem equipe, quem tem grupo e ninguém indicou. Colega não inscrito não pode ser indicado; pedido sem resposta não expira.
2. **Arrastar para juntar (organização).** Pessoa sem grupo solta sobre outra cria equipe; sobre uma equipe, entra nela; equipe cheia recusa. No celular, botão "Juntar com…". Tirar alguém continua pelo botão atual.
3. **Painel do superadmin.** Aba em /hack/organizacao só para quem tem a marca de superadmin no login da liga. Mostra grupos, acessos (link enviado/usado, último acesso), entregas, avisos, dúvidas e credenciamento, com as ações que a organização já tem. Dúvidas: canal novo e privado (participante pergunta no portal; diretoria e equipe com comunicação respondem; resposta no portal e por push). Último acesso: só o horário mais recente por pessoa.

Fora do escopo: dúvidas públicas ou votadas, histórico de navegação, mover pessoa entre equipes arrastando, indicar no formulário de inscrição.

## Revisão 4 (26/10/2026): senha e e-mails

Aprovada pelo Marcell em 26/10, depois de grilling.

- **Senha opcional para todos os papéis.** Cada pessoa entra com e-mail e senha **ou** pelo link do e-mail; os dois caminhos convivem. A diretoria que entra pelo login da liga continua entrando assim.
- **Primeiro acesso pelo link:** sem senha, a tela "Crie sua senha" aparece depois do link, com "Agora não". Volta a cada entrada pelo link enquanto a senha não existir.
- **`/hack/acesso`:** e-mail e senha como entrada principal; "Receber link de acesso por e-mail" logo abaixo é também o "esqueci minha senha".
- **Portal:** criar ou trocar a senha no cartão "Você" (Início). Trocar pede a atual, salvo nos 30 min depois de entrar pelo link; desconecta os outros aparelhos e mantém este. Quem já está conectado sem senha vê um aviso depois do QR, que se fecha e não volta na mesma sessão.
- **Regras:** mínimo de 8 caracteres, recusa senhas óbvias e igual ao e-mail; hash bcrypt; limite por e-mail (`HACK_LOGIN_EMAIL_MAX`, padrão 10 em 15 min) e por IP (`HACK_LINK_IP_MAX`); resposta idêntica para e-mail inexistente, sem senha, bloqueado e senha errada.
- **Validade do link:** 7 dias quando a organização envia; 24 horas quando a própria pessoa pede.
- **E-mails:** link de acesso e avisos usam um molde novo (foto do Pão de Açúcar, título em serifa, botão em tabela, endereço por extenso, data e local por dia, prévia de caixa de entrada). O do link traz o primeiro nome no assunto.

Fora do escopo: avisar os inscritos da novidade (decisão do Marcell, pela central de avisos), login social, verificação em duas etapas, mudança no login da liga.

## Revisão 5 (26/10/2026): equipes por afinidade

Aprovada pelo Marcell em 26/10, depois de grilling.

- **"Montar por afinidade"** na aba Equipes da organização (diretoria, inclusive o superadmin) gera uma **prévia**; nada é criado antes de "Criar". Na prévia a diretoria renomeia, move pessoas entre equipes ou deixa alguém de fora.
- **Quem entra:** participante confirmado, sem equipe, que não marcou "tenho grupo" (inclui quem deixou em branco ou foi cadastrado à mão). Quem marcou "tenho grupo" e está sem equipe fica à parte, listado na prévia, esperando a indicação dos colegas.
- **Afinidade:** IME (Ativa + Reserva) com IME, FGV com FGV, UFPE com UFPE, "Outra universidade" entre si.
- **Tamanho:** o menor número de equipes de até 4, equilibradas (5 → 3+2, 6 → 3+3, 7 → 4+3, 9 → 3+3+3, 10 → 4+3+3).
- **Dentro da instituição:** ano próximo e cursos misturados.
- **Sozinho na instituição:** vai para a menor equipe proposta com vaga, marcado "fora da afinidade"; sem vaga, os sozinhos formam uma equipe "Mista"; um só, sem vaga, fica de fora para a diretoria decidir.
- **Nomes:** "IME 1", "FGV 2"…, pulando os que já existem; os integrantes renomeiam.
- **Criação:** tudo ou nada; cada equipe com 2 a 4; nasce em formação, como a montada à mão. Nenhum aviso sai sozinho: se quiser, a diretoria publica pela central.

## Revisão 6 (26/10/2026): exclusão de participante

Aprovada pelo Marcell em 26/10, depois de grilling.

- **Só o superadmin** exclui, pelo botão "Excluir participante…" na ficha da pessoa (Pessoas → Editar), confirmando com o nome completo digitado (sem diferença de caixa ou espaços).
- **Definitivo:** apaga a pessoa e os dados dela no /hack (links, sessões, aparelhos de notificação, recibos de aviso, presenças, dúvidas, convites e indicações) e a inscrição no evento, senão a sincronização a recriaria. A versão reversível continua sendo "Bloquear".
- **Fila de espera:** a vaga aberta promove o primeiro da fila, como o "remover inscrição" da liga.
- **Quem pode ser excluído:** participante confirmado ou na fila, sem outro papel. Jurado, staff e representante de parceiro: Bloquear.
- **Equipe:** a pessoa sai da equipe; se for a última integrante de uma equipe com entrega, a exclusão é recusada até a entrega ser desfeita.
- **Registro:** nome, data e quem excluiu, na Visão geral do superadmin. Nada além do nome do excluído.

## Revisão 7 (28/10/2026): renomear a equipe

- **Qualquer integrante** renomeia a equipe pelo campo "Nome da equipe" no card da aba Equipe, esteja ela em formação ou **confirmada**. Renomear não desconfirma.
- Mesmas regras do nome na criação: 2 a 40 caracteres, sem repetir o de outra equipe. Some quando o prazo de entrega congela a composição; depois disso, só a diretoria (Ajustar).
