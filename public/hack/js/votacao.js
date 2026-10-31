/* Aba Votação do portal: ao fim das apresentações, quem não está numa equipe
   finalista vota na melhor (Prêmio do público). Um voto, com confirmação; o
   resultado é anunciado no palco, não aparece aqui.
   Exposto como window.HackVote.render(container). */
(function () {
  'use strict';
  const { api, h, clear, toast } = window.Hack;
  let box = null;
  let timer = null;
  let picked = null; // finalista escolhida, esperando a confirmação

  const title = (t) => t.projectName || t.name;
  const sub = (t) => (t.projectName ? 'Equipe ' + t.name : '');

  async function cast(team) {
    try {
      const d = await api('/hack/api/vote', { method: 'PUT', body: { teamId: team.id } });
      picked = null;
      toast('Voto registrado. Obrigado!');
      draw(d);
    } catch (e) {
      picked = null;
      toast(e.message, true);
      render(box);
    }
  }

  function draw(d) {
    const head = h('article.card.card--red', h('p.card__k', 'Prêmio do público'));
    if (d.reason === 'finalist') {
      head.append(h('h3.card__title', 'Sua equipe está na final. Boa sorte!'),
        h('p.muted', 'Integrantes das equipes finalistas não votam. O resultado é anunciado no palco.'));
      clear(box).append(head);
      return;
    }
    if (d.reason) {
      head.append(h('h3.card__title', 'Votação das equipes'), h('p.muted', 'Só participantes de equipes votam.'));
      clear(box).append(head);
      return;
    }
    if (d.myVote) {
      head.append(h('h3.card__title', 'Você votou em ' + title(d.myVote)),
        h('p.muted', d.status === 'closed' ? 'Votação encerrada. O resultado é anunciado no palco.' : 'Seu voto está registrado. O resultado é anunciado no palco.'));
      clear(box).append(head);
      return;
    }
    if (d.status === 'idle') {
      head.append(h('h3.card__title', 'A votação abre no fim das apresentações'),
        h('p.muted', 'Depois das 5 apresentações finais, a organização abre a votação aqui. Você vai escolher a melhor equipe, com um voto só.'));
      clear(box).append(head);
      return;
    }
    if (d.status === 'closed') {
      head.append(h('h3.card__title', 'Votação encerrada'), h('p.muted', 'O resultado é anunciado no palco.'));
      clear(box).append(head);
      return;
    }
    if (picked) {
      head.append(h('h3.card__title', 'Confirmar voto em ' + title(picked) + '?'),
        h('p.muted', 'Depois de confirmar, não dá para trocar.'),
        h('div.row',
          h('button.btn.btn--red.btn--sm', { type: 'button', onclick: (ev) => { ev.target.disabled = true; cast(picked); } }, 'Confirmar voto'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { picked = null; draw(d); } }, 'Voltar')));
      clear(box).append(head);
      return;
    }
    head.append(h('h3.card__title', 'Qual foi a melhor apresentação?'), h('p.muted', 'Escolha uma equipe finalista. Um voto por pessoa, sem troca.'));
    const list = h('article.card', h('p.card__k', 'Finalistas'), h('ul.list', d.finalists.map((t) => h('li',
      h('div.list__main', h('b', title(t)), sub(t) ? h('span', sub(t)) : null),
      h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => { picked = t; draw(d); } }, 'Votar')))));
    clear(box).append(head, list);
  }

  async function render(container) {
    box = container;
    let d;
    try { d = await api('/hack/api/vote'); } catch (e) {
      if (e.status === 401) return;
      console.error('[hack] votação', e);
      clear(box).append(h('p.empty', e.status && e.status < 500 ? e.message : 'Não deu para carregar a votação agora. Recarregue a página.'));
      return;
    }
    draw(d);
    // A organização abre e encerra ao vivo: atualiza enquanto a aba está
    // aberta, menos no meio de uma confirmação.
    clearInterval(timer);
    timer = setInterval(() => {
      if (picked || document.hidden || !box || box.closest('[hidden]')) return;
      api('/hack/api/vote').then(draw).catch(() => {});
    }, 10000);
  }

  window.HackVote = { render };
})();
