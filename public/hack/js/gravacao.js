/* Aba Gravação do portal: a equipe reserva um bloco de 15 min na sala de
   gravação do pitch, troca, cancela ou entra na fila quando não há livre.
   Exposto como window.HackRecording.render(container). */
(function () {
  'use strict';
  const { api, h, clear, toast } = window.Hack;
  let box = null;
  let timer = null;

  const end = (slot, min) => {
    const m = Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5)) + min;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const label = (slot) => slot.replace(':', 'h');

  async function act(path, opts, ok) {
    try {
      const d = await api(path, opts);
      if (ok) toast(ok);
      draw(d);
    } catch (e) {
      toast(e.message, true);
      render(box);
    }
  }

  function draw(d) {
    const head = h('article.card.card--red', h('p.card__k', 'Sala de gravação do pitch'));
    if (!d.team) {
      head.append(h('h3.card__title', 'Entre numa equipe primeiro'), h('p.muted', 'A reserva é por equipe. Monte ou entre numa equipe na aba Equipe.'));
      clear(box).append(head);
      return;
    }
    if (d.mine) {
      const started = ['live', 'past'].includes(d.slots.find((s) => s.slot === d.mine).status);
      head.append(h('h3.card__title', label(d.mine) + ' – ' + label(end(d.mine, d.minutes))),
        h('p', 'Horário da ' + d.team.name + '. Chegue na sala uns minutos antes.'));
      if (!started) head.append(h('div.row', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act('/hack/api/recording/cancel', { method: 'POST' }, 'Horário cancelado.') }, 'Cancelar horário')),
        h('p.muted.small', 'Para trocar, escolha outro horário livre abaixo.'));
    } else if (d.queue.position) {
      head.append(h('h3.card__title', 'Na fila: ' + d.queue.position + 'º lugar'),
        h('p', 'Se algum horário for liberado, ele vai automaticamente para a primeira equipe da fila. Volte aqui para conferir.'),
        h('div.row', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act('/hack/api/recording/queue', { method: 'DELETE' }, 'Equipe saiu da fila.') }, 'Sair da fila')));
    } else {
      const free = d.slots.filter((s) => s.status === 'free').length;
      const open = d.slots.some((s) => s.status === 'free' || s.status === 'taken');
      head.append(h('h3.card__title', free ? 'Escolha um horário' : open ? 'Todos os horários estão reservados' : 'Gravações encerradas'),
        h('p.muted', 'Blocos de ' + d.minutes + ' min, das 9h30 às 13h. Um horário por equipe; qualquer membro pode reservar, trocar ou cancelar.'));
      if (!free && open) head.append(h('p', d.queue.size ? d.queue.size + ' equipe(s) na fila.' : 'Ninguém na fila ainda.'),
        h('div.row', h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => act('/hack/api/recording/queue', { method: 'POST' }, 'Equipe na fila.') }, 'Entrar na fila')));
    }

    const st = { free: ['badge--ok', 'Livre'], taken: ['badge--warn', 'Reservado'], live: ['badge--red', 'Gravando agora'], past: ['', 'Encerrado'] };
    const grid = h('article.card', h('p.card__k', 'Horários'), h('ul.list', d.slots.map((s) => {
      const [cls, txt] = s.mine ? ['badge--red', 'Sua equipe'] : st[s.status];
      const btn = s.status === 'free'
        ? h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => act('/hack/api/recording/book', { method: 'POST', body: { slot: s.slot } }, 'Horário ' + label(s.slot) + ' reservado.') }, d.mine ? 'Trocar para este' : 'Reservar')
        : null;
      return h('li', h('div.list__main', h('b', label(s.slot) + ' – ' + label(end(s.slot, d.minutes))),
        h('span', h('span' + (cls ? '.badge.' + cls : '.badge'), txt))), btn);
    })));
    clear(box).append(head, grid);
  }

  async function render(container) {
    box = container;
    let d;
    try { d = await api('/hack/api/recording'); } catch (e) {
      if (e.status === 401) return;
      console.error('[hack] gravação', e);
      clear(box).append(h('p.empty', e.status && e.status < 500 ? e.message : 'Não deu para carregar os horários agora. Recarregue a página.'));
      return;
    }
    draw(d);
    // A grade muda com as outras equipes: atualiza enquanto a aba está aberta.
    clearInterval(timer);
    timer = setInterval(() => {
      if (document.hidden || !box || box.closest('[hidden]')) return;
      api('/hack/api/recording').then(draw).catch(() => {});
    }, 30000);
  }

  window.HackRecording = { render };
})();
