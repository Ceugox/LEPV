# Avaliação assistida no portal — descrição aprovada

## Problema e usuários

Jurados precisam registrar comentários durante as apresentações, recuperar seus
registros ao atribuir notas e acompanhar a mesma equipe sem alternar aplicativos.
A organização precisa conduzir as rodadas e acompanhar pendências.

## Escopo confirmado

A solução fica no portal LEPV, com acesso individual dos jurados já cadastrados.
Materiais são os entregues no site. Apenas texto nesta versão, por decisão do
usuário após a discussão de áudio. Não existe integração com WhatsApp.

Na primeira fase, a organização abre uma rodada de entrega para uma equipe e
todos os jurados registram suas notas pelos critérios existentes, cada um só
nos critérios dos próprios pilares naquela fase (os mesmos que a banca grava;
pedir os outros deixaria a rodada pendente para sempre). Na segunda,
a organização abre a rodada de pitch: cada jurado anota comentários privados e,
quando a apresentação encerra, atribui as notas por critério com apoio de um
resumo de seus próprios registros.

A organização pode avançar com jurados pendentes. O formulário antigo permanece
vinculado explicitamente à equipe anterior, com botão para acessar a equipe atual.
Os jurados revisam e confirmam antes da gravação oficial. Correções exigem nova
confirmação, enquanto a fase e avaliação permitirem.

## Regras e limites

- Acesso pelo link pessoal existente, de uso único; o navegador mantém a sessão.
  Links são credenciais pessoais e podem ser revogados pela organização.
- Comentários e rascunhos são privados de cada jurado. Organização vê pendências,
  mantendo o acesso às notas oficiais já previsto no painel de avaliação.
- A primeira fase usa `main`; pitches usam `final`. A seleção de finalistas e a
  abertura da fase continuam no painel existente. Não se troca a fase por abrir
  uma rodada. Escolher todos os grupos como finalistas permite avaliar todos.
- Uma rodada por equipe/fase; correções se fazem na própria rodada.
- Encerrar uma rodada libera a próxima, sem impedir a conclusão de pendências da
  mesma fase. Para confirmar uma nota de fase anterior, a organização deve voltar
  àquela fase no painel existente; a gravação nunca migra uma nota de fase.
- A IA resume somente comentários fornecidos, com referências aos registros,
  sem gerar notas, criar fatos ou substituir os textos originais.
- Falhas da IA não impedem a avaliação manual e não apagam comentários.
- Não inclui áudio, automação WhatsApp, entrega de materiais por chat ou
  alteração do agente automático de avaliação técnica.

## Critérios de aceitação

1. Link de jurado abre a tela de avaliação sem autenticar como outra pessoa.
2. Dois jurados não leem comentários e rascunhos um do outro.
3. Polling de rodada não apaga texto em edição nem muda seu destino silenciosamente.
4. Comentário reenviado com o mesmo identificador não duplica.
5. Confirmação valida revisão do rascunho, critérios, fase e impedimento atuais.
6. Pendências incluem rascunhos não confirmados mais novos que a nota oficial. Nota
   corrigida pelo formulário da banca não é pendência: vira o ponto de partida da rodada.
7. Resumo assíncrono é rejeitado se identidade, critérios ou comentários mudarem.
8. Interface funciona em celular e desktop, com alternativa manual sem IA.
