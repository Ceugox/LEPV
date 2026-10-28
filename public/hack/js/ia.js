/* Aba IA do portal: guia da Featherless e o código promocional, que só chega
   do servidor depois do check-in validado no credenciamento.
   Exposto como window.HackAI.render(container). */
(function () {
  'use strict';
  const { api, h, fill, copy } = window.Hack;

  const BASE_URL = 'https://api.featherless.ai/v1';
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  const code = (text) => h('div.stack', { style: 'gap:8px' },
    h('pre.codeblock', text),
    h('div.row', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => copy(text) }, 'Copiar código')));

  const PY = [
    'import os, time',
    'from openai import OpenAI, APIStatusError',
    '',
    'client = OpenAI(base_url="' + BASE_URL + '",',
    '                api_key=os.environ["FEATHERLESS_API_KEY"])',
    '# US$ por milhão de tokens (entrada, saída): confira em featherless.ai/models',
    'PRICE = {',
    '    "openai/gpt-oss-120b": (0.15, 0.60),',
    '    "deepseek-ai/DeepSeek-V3.2": (0.264, 0.41),',
    '    "MiniMaxAI/MiniMax-M3": (0.55, 2.20),',
    '    "moonshotai/Kimi-K2.6": (0.80, 3.40),',
    '}',
    'TETO = 20.0  # para antes de zerar os US$ 25',
    'gasto = 0.0',
    '',
    'def chat(model, messages, **kw):',
    '    global gasto',
    '    if model not in PRICE:  # antes da chamada: sem preço, o gasto não seria contado',
    '        raise KeyError(f"cadastre o preço de {model} em PRICE")',
    '    if gasto >= TETO:',
    '        raise RuntimeError(f"teto de US$ {TETO} atingido")',
    '    for tentativa in range(4):',
    '        try:',
    '            r = client.chat.completions.create(model=model, messages=messages, **kw)',
    '            break',
    '        except APIStatusError as e:',
    '            if e.status_code not in (429, 503) or tentativa == 3:',
    '                raise',
    '            time.sleep(2 ** tentativa)',
    '    pin, pout = PRICE[model]',
    '    gasto += (r.usage.prompt_tokens * pin + r.usage.completion_tokens * pout) / 1e6',
    '    return r.choices[0].message.content',
  ].join('\n');

  const JS = [
    '// US$ por milhão de tokens [entrada, saída]: confira em featherless.ai/models',
    'const PRICE = {',
    '  "openai/gpt-oss-120b": [0.15, 0.60],',
    '  "deepseek-ai/DeepSeek-V3.2": [0.264, 0.41],',
    '  "MiniMaxAI/MiniMax-M3": [0.55, 2.20],',
    '  "moonshotai/Kimi-K2.6": [0.80, 3.40],',
    '};',
    'const TETO = 20; // para antes de zerar os US$ 25',
    'let gasto = 0;',
    '',
    'async function chat(model, messages, extra = {}) {',
    '  // antes da chamada: sem preço, o gasto não seria contado',
    '  if (!PRICE[model]) throw new Error(`cadastre o preço de ${model} em PRICE`);',
    '  if (gasto >= TETO) throw new Error(`teto de US$ ${TETO} atingido`);',
    '  for (let t = 0; ; t++) {',
    '    const r = await fetch("' + BASE_URL + '/chat/completions", {',
    '      method: "POST",',
    '      headers: { Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`, "Content-Type": "application/json" },',
    '      body: JSON.stringify({ model, messages, ...extra }),',
    '    });',
    '    if ((r.status === 429 || r.status === 503) && t < 3) {',
    '      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** t));',
    '      continue;',
    '    }',
    '    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);',
    '    const d = await r.json();',
    '    const [pin, pout] = PRICE[model];',
    '    gasto += (d.usage.prompt_tokens * pin + d.usage.completion_tokens * pout) / 1e6;',
    '    return d.choices[0].message.content;',
    '  }',
    '}',
  ].join('\n');

  // Medido pela organização em 28/10/2026: chamada com ~7 mil tokens de
  // entrada e até 700 de saída, custo pelo preço da tabela da Featherless.
  const MODELS = [
    ['openai/gpt-oss-120b', 'Desenvolvimento do app: o mais barato e o mais rápido', 'US$ 0,0013', '~18.700'],
    ['deepseek-ai/DeepSeek-V3.2', 'Desenvolvimento do app: barato, mais lento', 'US$ 0,0022', '~11.200'],
    ['MiniMaxAI/MiniMax-M3', 'Rápido, boa qualidade', 'US$ 0,0048', '~5.200'],
    ['moonshotai/Kimi-K2.6', 'Demo, quando a qualidade pesa', 'US$ 0,0090', '~2.800'],
  ];

  function creditCard(c) {
    const k = h('p.card__k', 'Crédito de IA · Featherless');
    const title = h('h3.card__title', 'US$ 25 em créditos');
    if (c.released) {
      return h('article.card.card--red', k, title,
        h('span.badge.badge--ok', 'Liberado no seu check-in'),
        h('div.promo', h('span.promo__code#promo-code', c.code),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => copy(c.code) }, 'Copiar')),
        c.redeemUrl ? h('div.row', h('a.btn.btn--red', { href: c.redeemUrl, target: '_blank', rel: 'noopener' }, 'Resgatar ' + c.code)) : null,
        h('p.muted.small', 'Cada pessoa resgata na própria conta. O código é do evento: não divulgue fora do hackathon.'),
        h('p.muted.small', h('b', 'Importante: '), 'se não for continuar usando a Featherless depois do evento, cancele o plano.'));
    }
    const msg = c.checkedIn
      ? 'Seu check-in está validado, mas a organização ainda não cadastrou o código. Volte em alguns minutos.'
      : 'O código aparece aqui assim que a organização validar o seu check-in na entrada. Apresente o QR da aba Início.';
    return h('article.card.card--red', k, title,
      h('span.badge.badge--warn', c.checkedIn ? 'Aguardando a organização' : 'Liberado no seu check-in'),
      h('p.muted', { style: 'margin-top:12px' }, msg));
  }

  function stepsCard() {
    return h('article.card', h('p.card__k', 'Passo a passo'), h('h3.card__title', 'Do código à primeira chamada'),
      h('ol.steps',
        h('li', h('b', 'Crie a conta no plano Feather Per-Request'), ' pelo botão de resgate. O código entra sozinho no checkout. Se a página der erro ou o código não entrar, recarregue uma vez. Depois do checkout o plano aparece como ', h('i', 'Active'), ' com US$ 25,00 de saldo.'),
        h('li', h('b', 'Crie sua chave de API:'), ' clique no seu perfil, no canto superior direito, e abra ', h('i', 'API Keys'), '. Trate a chave como senha: guarde em variável de ambiente e nunca suba para o repositório.'),
        h('li', h('b', 'Aponte seu código ou seu agente para a Featherless.'), ' A API é compatível com a da OpenAI: basta a URL base e a chave. No Claude Code, use a Featherless como ', link('https://code.claude.com/docs/en/llm-gateway', 'gateway de LLM'), '; no opencode, rode /connect, escolha Other e cole a URL e a chave (', link('https://opencode.ai/docs/providers/', 'documentação'), ').'),
        h('li', h('b', 'Acompanhe o saldo'), ' na página Subscription da Featherless: ela lista cada requisição com modelo, tokens e custo exato. A API não informa o saldo, então seu código não vê o crédito acabando.')),
      code('export FEATHERLESS_API_KEY=...\n# URL base\n' + BASE_URL),
      h('p.muted.small', { style: 'margin-top:12px' }, 'O plano inclui um ambiente de agente pronto (Agents → Marketplace: Open WebUI, agentes de código), já ligado à Featherless. Vídeos: ', link('https://www.youtube.com/@Isaac-featherless', 'youtube.com/@Isaac-featherless'), '. Catálogo: ', link('https://featherless.ai/models', 'featherless.ai/models'), ' · Docs: ', link('https://featherless.ai/docs', 'featherless.ai/docs'), '.'));
  }

  function modelsCard() {
    return h('article.card.card--wide', h('p.card__k', 'Qual modelo usar'), h('h3.card__title', 'Quanto rendem os US$ 25'),
      h('div.ia-scroll', h('table.ia-table',
        h('thead', h('tr', h('th', 'Modelo'), h('th', 'Para quê'), h('th', 'Por chamada'), h('th', 'Com US$ 25'))),
        h('tbody', MODELS.map((m) => h('tr', h('td.mono', m[0]), h('td', m[1]), h('td', m[2]), h('td', m[3])))))),
      h('p.muted.small', { style: 'margin-top:10px' }, 'Medido pela organização em 28/10: chamada com ~7 mil tokens de entrada e até 700 de saída. Pergunta curta custa bem menos (~US$ 0,0001 no DeepSeek).'),
      h('p', { style: 'margin-top:14px' }, h('b', 'Cuidado com agente de código. '),
        'O guia da Featherless sugere o zai-org/GLM-5.2, que é o modelo grande mais caro (US$ 1,40 por milhão de tokens de entrada, US$ 4,40 de saída). Um agente reenvia o contexto inteiro a cada passo, uns 40 mil tokens: cerca de US$ 0,06 por passo, ou umas 2 horas de agente contínuo com os US$ 25 (estimativa). Use o agente no que importa e um modelo barato no app.'));
  }

  function errorsCard() {
    const rows = [
      ['401', 'Chave não reconhecida. Confira se copiou certo ou crie outra em API Keys.'],
      ['403', 'Modelo com licença: abra a página do modelo, clique em Unlock Model e aceite os termos.'],
      ['429', 'Limite de chamadas simultâneas. A chamada volta na hora, sem fila: espere um pouco e tente de novo (o código abaixo já faz isso).'],
      ['500', 'Requisição não processada. Procure parâmetro não suportado na documentação.'],
      ['503', 'Modelo frio ou sem capacidade. Tente de novo; se continuar depois de três tentativas, avise no Discord da Featherless.'],
    ];
    return h('article.card.card--wide', h('p.card__k', 'Quando dá erro'), h('h3.card__title', 'Diagnóstico em 10 segundos'),
      h('table.ia-table', h('tbody', rows.map((r) => h('tr', h('td.mono', h('b', r[0])), h('td', r[1]))))));
  }

  function codeCard() {
    return h('article.card.card--wide', h('p.card__k', 'Código pronto'), h('h3.card__title', 'Contador de gasto e nova tentativa'),
      h('p.muted', 'Some o custo de cada resposta e pare antes de zerar o crédito. Tente de novo, com espera crescente, quando vier 429 ou 503.'),
      h('p.card__k', { style: 'margin-top:14px' }, 'Python (pip install openai)'), code(PY),
      h('p.card__k', { style: 'margin-top:18px' }, 'JavaScript (Node 18+)'), code(JS));
  }

  async function render(container) {
    let c;
    try { c = await api('/hack/api/ai-credit'); } catch (e) {
      if (e.status === 401) return;
      fill(container, h('p.empty', e.status && e.status < 500 ? e.message : 'Não deu para carregar agora. Recarregue a página.'));
      return;
    }
    fill(container, creditCard(c), stepsCard(), modelsCard(), errorsCard(), codeCard());
  }

  window.HackAI = { render };
})();
