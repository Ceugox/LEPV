# Tags de interesse editáveis pelo membro — design validado

Data: 2026-08-23 · Aprovado pelo Marcell

## 1. O pedido

Cada membro deve poder gerenciar as próprias tags de interesse (IA, Tech, …),
digitando livremente. Junto: ao sair do app, voltar para a página principal em vez
da tela de login.

## 2. O que já existe

Levantado antes de desenhar — quase toda a estrutura de dados já está pronta:

| Peça | Estado |
|---|---|
| Campo `interests` | Array de strings no cadastro do membro |
| Normalização | `map(String().trim().slice(0,30)).filter(Boolean).slice(0,8)` — **duplicada** em `server.js:981` e `server.js:1032` |
| Entrada de dados | Só no cadastro (`/api/register`); ninguém edita depois |
| Exposição | `/api/members-public` (linha 734) e o roster do app (linha 1120) |
| Dados reais | `IA`, `Tech`, `Mercado Financeiro`, `Fitness`, `Consultoria` |
| UI | Chips em `app.js:841` e no roster do login; `isMe` já existe em `app.js:830` |

Ou seja: não é preciso criar modelo de dados nem componente visual do zero. Falta o
caminho de escrita e a edição.

## 3. O problema que define a solução

`allMembers()` concatena, não faz merge:

```js
function allMembers() {
  return seedMembers.concat(readSignups().members);
}
```

Os 11 fundadores vivem em `data/members.json`, que é **seed do repositório**. Escrever
ali não sobrevive a `railway up`. Um fundador editaria suas tags, gostaria do
resultado, e perderia tudo no deploy seguinte.

**A limitação já morde outra funcionalidade hoje.** Em `set-password`:

```js
// Primeiro acesso também coleta o WhatsApp — só funciona para membros do
// volume; fundador é dado do repo.
const member = signups.members.find((m) => m.order === order);
if (member) member.phone = phone;
```

O `if (member)` descarta silenciosamente o telefone de todo fundador. Não há erro, não
há log: o dado simplesmente não é gravado.

O próprio código já resolve esse tipo de caso para credenciais, e documenta a regra:

> O volume vence o seed: trocar a senha grava um override em `signups.json`, que
> sobrevive a deploys — a credencial do repo vira só o estado inicial.

As tags precisam do mesmo tratamento.

## 4. Decisões tomadas

| Questão | Decisão |
|---|---|
| Visibilidade | **Públicas, como hoje** — seguem no roster que abre sem login |
| Quem edita | **Cada um as suas.** Sem edição por diretoria nesta entrega |
| Onde | **No cartão do próprio membro**, na aba Membros, onde já há o botão de foto |
| Limites | Mantidos: **8 tags**, **30 caracteres** cada |

## 5. Arquitetura

### 5.1 Override de perfil no volume

Novo array `profiles` em `signups.json`, cada entrada `{ order, interests }`.
`allMembers()` passa a aplicar o override sobre o registro base:

```js
function allMembers() {
  const s = readSignups();
  const over = new Map((s.profiles || []).map((p) => [p.order, p]));
  return seedMembers.concat(s.members).map((m) => {
    const o = over.get(m.order);
    return o ? Object.assign({}, m, o) : m;
  });
}
```

Uniforme para fundador e para membro novo: os dois passam pelo mesmo caminho. O
array ausente (`|| []`) mantém compatibilidade com volumes que ainda não têm o campo.

**Ordem do merge:** o override vence o registro base, mas `order` nunca muda — é a
chave. Campos não presentes no override permanecem do base.

### 5.2 Normalização única

A regra hoje está copiada em dois pontos do `server.js`. Vira uma função:

```js
// Tag é rótulo curto, não texto livre: 30 caracteres, no máximo 8, sem
// repetição (ignorando caixa) e sem vazias.
function normalizeInterests(raw) {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set();
  const out = [];
  for (const item of raw) {
    const t = String(item).trim().slice(0, 30);
    if (!t) continue;
    const chave = t.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(t);
    if (out.length === 8) break;
  }
  return out;
}
```

Os dois pontos existentes passam a chamá-la. O dedupe é comportamento novo — hoje
`["IA","ia"]` gravaria as duas.

### 5.3 Endpoint

`POST /api/me/interests`, atrás de `requireSessionApi`.

- Entrada: `{ interests: string[] }`
- Saída: `{ ok: true, interests: string[] }` — devolve o que ficou gravado, já
  normalizado, para o front não precisar adivinhar o resultado do truncamento
- Escreve o override via `writeSignups` (que já faz tmp + fsync + `.bak` + rename)
- Só mexe no próprio `order`, tirado da sessão — nunca de parâmetro

### 5.4 UI

No cartão onde `isMe` é verdadeiro:

- cada chip ganha um `×` para remover, com alvo de toque de 44px
- um campo curto adiciona: **Enter** ou **vírgula** confirmam
- ao chegar em 8, o campo é desabilitado e explica por quê
- salva no `blur` e a cada mudança confirmada; o estado da resposta do servidor
  substitui o local, então truncamento e dedupe aparecem na hora
- em erro, o chip volta ao que era e a mensagem aparece no cartão

Nos cartões dos outros membros nada muda.

### 5.5 Roteamento do logout

`public/app.js:43` passa de `/login.html` para `/`.

Os outros dois redirecionamentos **continuam** indo ao login, e isso é deliberado:
`app.js:17` (sessão inválida) e `app.js:31` (troca de senha obrigatória) precisam
justamente da tela de autenticação.

## 6. Verificação

Caso e2e novo, cobrindo o que o `concat` quebrava:

1. **Fundador grava e persiste** — membro do seed salva tags, e uma releitura do
   store devolve as tags novas. É o coração da mudança.
2. Membro do volume grava e persiste.
3. Limite de 8 respeitado ao enviar 12.
4. Tag de 40 caracteres é truncada em 30.
5. `["IA","ia","IA "]` vira `["IA"]`.
6. As tags aparecem em `/api/members-public`.
7. Sem sessão, o endpoint responde 401.

Mais: `npm run verify` inteiro (10 verificações) precisa seguir verde, incluindo a
auditoria de consistência visual.

## 7. Fora de escopo

- **Telefone do fundador.** O override criado aqui resolveria, mas mexer no
  `set-password` é outra mudança. Fica registrado como oportunidade.
- Edição de tags por diretoria ou superadmin.
- Sugestão/autocompletar a partir das tags que já existem.
- Busca ou filtro de membros por tag.
- Moderação de conteúdo das tags.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| `allMembers()` é usado em todo o server; mudar quebra muita coisa | A mudança preserva a assinatura e o formato; os 37 casos e2e cobrem os caminhos que a usam |
| Tag pública com texto indevido | Decisão consciente do Marcell (§4). Limite de 30 caracteres reduz a superfície |
| Volume antigo sem `profiles` | `(s.profiles || [])` — ausência é o caso normal no primeiro deploy |
