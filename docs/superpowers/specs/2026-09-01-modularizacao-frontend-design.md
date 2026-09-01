# Modularização do front-end e correções de auditoria

**Data:** 2026-09-01  
**Status:** aprovado para planejamento

## Objetivo

Substituir o cliente monolítico `public/app.js` por módulos ES nativos, sem
bundler e sem mudar contratos de API, rotas, URLs públicas ou comportamento
visível do produto. No mesmo conjunto, eliminar os problemas confirmados pela
auditoria de front-end.

## Decisões

- Usar módulos ES nativos do navegador em `public/js/`; o Express continuará
  servindo os arquivos estáticos como hoje.
- Trocar a referência de `app.js` em `app.html` por um entrypoint com
  `type="module"`.
- Manter `public/app.js` como ponte pequena que importa o entrypoint, para não
  quebrar links ou caches que ainda o requisitem durante a transição.
- Não introduzir framework, bundler, transpiler nem alterar endpoints.
- Preservar o HTML e os atributos `data-*` já consumidos pelos testes.

## Estrutura proposta

```
public/js/
  main.js                  inicialização e composição das features
  core/
    api.js                 fetch autenticado e erros de sessão
    escape.js              serialização segura para HTML e atributos
    state.js               usuário atual e dependências compartilhadas
  ui/
    tabs.js                roving tabindex e troca de painéis
    modal.js               abertura, fechamento e foco de modais
    gallery.js             lightbox e mídia
  features/
    members.js             perfil, membros, tags e senhas
    events.js              eventos, inscrições e presença
    immersion.js           roteiro, materiais, empresas e acervo
    administration.js      acessos, convites e controles administrativos
```

Cada feature exporta uma função `initXxx(context)`. `main.js` cria o contexto
uma vez, inicializa somente elementos presentes na página e não expõe globais.
Funções de renderização recebem dados e usam as rotinas de escape para qualquer
campo interpolado em HTML ou atributos.

## Correções incluídas

### Hero em mobile

Em telas até 719 px, a arte SVG decorativa será limitada à faixa fotográfica ou
ocultada; ela não poderá ocupar a área de texto e dos CTAs. O contraste do
texto no scroll continuará sendo coberto por `verify-hero-text.js`.

### Formulário de inscrição

O conjunto de datas alternativas será um `fieldset` com `legend`, preservando
as labels e IDs atuais para compatibilidade com o script de inscrição.

### Conteúdo dinâmico

Toda interpolação de texto, URL, atributo ou CSS derivada de API passará por
funções específicas de serialização. Campos numéricos serão convertidos para
número antes da interpolação e valores de estilo serão restringidos à paleta
controlada da aplicação.

### Fontes e console

As fontes usadas no front-end serão hospedadas localmente quando os arquivos
de licença e fonte estiverem disponíveis; até lá, a verificação visual
classificará falhas de carregamento de fonte externa separadamente de erros de
JavaScript da aplicação. A aplicação continuará legível com as fontes de
fallback definidas no CSS.

### Verificação local

Os comandos de verificação serão separados entre estáticos e dependentes de
servidor. O comando completo iniciará uma instância descartável em uma porta
compatível com os verificadores e a encerrará ao final.

## Migração e compatibilidade

1. Cobrir cada fronteira extraída com teste de comportamento antes da extração.
2. Migrar uma feature por vez, mantendo o entrypoint antigo como referência
   temporária apenas até a feature correspondente estar verde.
3. Depois de todas as migrações, converter `app.js` na ponte de importação e
   executar a suíte de browser contra desktop, mobile e reduced motion.
4. Não remover IDs, classes, rotas ou payloads sem teste de regressão explícito.

## Testes e critérios de aceite

- Testes existentes de API, renderização, tabs, tags, app logado e browser
  continuam verdes.
- Novos testes verificam que o entrypoint é módulo, que os módulos carregam sem
  erros de console e que cada feature inicializa somente quando sua superfície
  existe.
- Novo teste visual confirma que as linhas do hero não entram na região dos
  CTAs em 390 px e que o contraste medido do hero respeita o limite aplicável.
- Novo teste estrutural confirma `fieldset` e `legend` das datas alternativas.
- Novo teste de serialização cobre caracteres HTML em dados de missão e membro.
- `npm run verify` roda de uma cópia local sem exigir um servidor iniciado à
  mão e sem escrever nos dados versionados.

## Fora de escopo

- Mudança de design além da correção do hero mobile.
- Alterações de API, autorização, banco/armazenamento ou conteúdo editorial.
- Migração para React, TypeScript ou uma ferramenta de build.
