/* Aba Dúvidas do portal: o participante pergunta à organização e vê as
   respostas. Só as próprias dúvidas aparecem aqui.
   Exposto como window.HackQuestions.render(container). */
(function () {
  'use strict';
  const { api, h, clear, toast } = window.Hack;
  let box = null;

  const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function render(container) {
    box = container;
    let d;
    try { d = await api('/hack/api/questions'); } catch (e) {
      if (e.status === 401) return;
      clear(box).append(h('p.empty', 'Não deu para carregar suas dúvidas agora. Recarregue a página.'));
      return;
    }
    const text = h('textarea', { name: 'text', maxlength: 1000, rows: 4, required: true, placeholder: 'Ex.: posso usar uma API paga no projeto?' });
    const form = h('form.form', h('label.field', h('span', 'Sua dúvida'), text),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Enviar dúvida'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api('/hack/api/questions', { method: 'POST', body: { text: text.value } });
        toast('Dúvida enviada. A resposta aparece aqui (e por notificação, se você ativou).');
        await render(box);
      } catch (e) { toast(e.message, true); }
    });
    const ask = h('article.card.card--red', h('p.card__k', 'Dúvidas'), h('h3.card__title', 'Pergunte à organização'),
      h('p.muted', 'Só a organização vê o que você escreve aqui.'), form);
    const list = d.questions.length
      ? h('article.card', h('p.card__k', 'Suas dúvidas'), h('ul.list', d.questions.map((q) => h('li',
        h('div.list__main',
          h('b', q.text),
          h('span', 'Enviada em ' + when(q.createdAt)),
          q.answer
            ? h('p.answer', h('span.badge.badge--ok', 'Respondida'), ' ', q.answer.text)
            : h('span.badge.badge--warn', 'Aguardando resposta'))))))
      : null;
    clear(box).append(...[ask, list].filter(Boolean));
  }

  window.HackQuestions = { render };
})();
