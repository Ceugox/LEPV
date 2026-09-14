# Site da LEPV — guia para agentes

Leia este arquivo antes de alterar qualquer coisa. `Visual.md` traz a direção de
design; aqui ficam como rodar, como verificar e as regras que não podem ser
quebradas.

## O que é

Site da **LEPV — Liga de Empreendedorismo da Praia Vermelha**. Node/Express com
front em HTML e JS puro, sem framework nem build step. Nasceu como app da 1ª
Imersão em São Paulo (julho/2026) e virou o site da liga, reorganizado em torno
de **eventos** em agosto.

Produção: `https://lepv.org`. Deploy pelo gatilho do GitHub na `main`, com
"Wait for CI" ligado — push na `main` só publica com CI verde.

## Estrutura

```
server.js        aplicação inteira: rotas, API, sessão, eventos, presença
lib/             módulos de apoio (client-ip.js, iCalendar, etc.)
public/          HTML, CSS e JS servidos ao browser; img/ e gallery/
data/            estado local de desenvolvimento (em produção é volume Railway)
tests/           ical.js (unidade) e e2e.js
scripts/         verificações de UI, arte, contraste, consistência e fixtures
docs/            notas de produto
```

**Eventos são o objeto central.** Reunião, aula, visita e social são `type` do
mesmo objeto em `events.json`, com aviso no mural, materiais, inscrição e
presença. O acervo da imersão é seção restrita, aberta pela aba Membros.

## Rodar

```bash
npm install
npm run seed
npm start
```

Sobe em `http://localhost:3000`. `npm run seed` gera credenciais de
desenvolvimento; não use as de produção local.

## Verificação

Obrigatória após qualquer alteração. **Um comando por vez**, da raiz do repo:
sem `cd`, sem `&&`, sem pipe na chamada. O portão de evidência do harness só
aceita comando único.

```bash
npm test
npm run verify
```

`npm test` é iCalendar mais e2e, contra volume isolado num diretório temporário.
`npm run verify` encadeia internamente as 13 verificações (e2e, inline, CSS,
arte, contraste, UI, texto do topo, revelação, consistência, app, abas, tags,
diretoria) — encadeamento **dentro** do script é permitido; o que o portão
recusa é encadeamento na linha que você digita.

**A e2e sozinha não cobre UI nenhuma.** Mudou qualquer coisa visual, rode
`npm run verify`, não só `npm test`.

## Regras que não podem ser quebradas

1. **`railway up` de uma branch sobrescreve produção em silêncio.** Já apagou
   um commit de outra pessoa. Deploy é `git push origin main` e mais nada;
   antes de qualquer coisa manual, confira se a `main` remota andou.
2. **Dado local não é dado de produção.** `data/` e `events.json` moram num
   volume do Railway. Não dá para publicar evento pelo repo: é pela API, com
   sessão. Nunca conclua o que está no ar olhando o clone.
3. **Datas no fuso do Brasil.** A presença abre sozinha no dia via `Intl` com
   `America/Sao_Paulo`; em UTC um evento das 19h fecharia às 21h.
4. **Segredos só por variável de ambiente.** Credenciais, `TURNSTILE_*` e
   `SECURITY_CONTACT`. Nunca em código, commit ou log.
5. **Capa de evento não aceita arte com texto.** `cover` é recortado com
   `object-fit: contain` sobre papel; o título dentro da arte some no mobile.
6. **Turnstile mantém rede ativa.** Playwright com `networkidle` trava; use
   `load` e espere `LEPVTurnstile.token()` não vazio. O widget vive em shadow
   DOM fechado, então seletor de iframe não acha nada.

## CI

`.github/workflows/ci.yml`, dois jobs. `estatico` (~8s): `node --check` no JS
versionado, JSON do repo e sintaxe dos `<script>` embutidos. `verificacoes`
(~2min30): e2e, CSS, contraste e as verificações de browser, com Chromium em
cache. Em falha, sobe 12 screenshots mais `console.json` e `server.log` como
artefato.
