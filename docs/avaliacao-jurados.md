# Operação da avaliação dos jurados

## Acesso e rodadas

Na organização, aba Pessoas, localize o jurado cadastrado, clique em **Link** e
depois em **Gerar link da avaliação** (o botão só aparece para quem tem papel de
jurado). O link identifica aquela pessoa, vale uma vez, inicia a sessão do
navegador e abre direto a avaliação. Copie e envie manualmente: o link mandado
por e-mail é o do portal comum, sem o atalho para a avaliação.

A IA do resumo recebe o nome da equipe, os critérios e os comentários do próprio
jurado (nada de outros jurados, nem notas).

Em `/hack/avaliacao`, a diretoria vê o controle de rodadas. Antes de abrir a
primeira, configure e trave critérios e abra a avaliação no painel existente.
Na fase principal, abra a entrega de uma equipe. Encerre a rodada e abra a próxima;
as pendências continuam visíveis e podem ser concluídas na mesma fase.

Para os pitches, selecione os finalistas e ative a fase final no painel existente.
Finalize pendências da fase principal antes da transição, ou retorne à fase
principal para concluí-las. Abra e encerre cada apresentação pelo controle de
rodadas. Observações são privadas; notas precisam de revisão e confirmação.
As notas ficam abertas durante a rodada e depois dela: só fecham quando a
organização fecha a avaliação ou trava o resultado no painel.

## Configuração da assistência de IA

Somente no servidor:

- `HACK_JUDGE_AI_KEY`: chave da Anthropic exclusiva para a assistência, ou
  `ANTHROPIC_API_KEY` como alternativa.
- `HACK_JUDGE_AI_MODEL`: opcional; padrão `claude-sonnet-5-5`.

Nenhuma chave vai para o navegador. Não há carregamento automático de `.env`;
configure as variáveis no processo local ou no ambiente do serviço ao publicar.
O servidor envia somente os comentários do jurado e os critérios para o resumo.
Sem chave ou em caso de falha, os registros e o formulário continuam disponíveis.

O resumo é transitório; os comentários originais e as notas confirmadas são
persistidos no estado do hackathon. Só texto é aceito nesta versão.

## Validação e prévia local

`npm test` cobre domínio, rotas, links e resumo. `npm run verify` executa as
verificações gerais com um servidor e fixtures locais preparados. O teste
`npm run verify:judge-live` cria seu próprio volume temporário e servidor.

`node scripts/verify-judge-live.js --serve` mantém uma prévia com duas juradas e
equipes fictícias. A URL e os acessos exclusivos de teste ficam em
`.tmp/judge-preview.json`. Nunca apontar esse script para dados de produção.
