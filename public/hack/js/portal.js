/* Portal pessoal do hackathon. Ordem de leitura no celular: QR, próximo
   horário, avisos, equipe. Cada aba busca seus dados da API. */
(function () {
  'use strict';
  const { api, h, clear, toast, dayLabel, at, hm } = window.Hack;
  const $ = (id) => document.getElementById(id);
  const state = { me: null, perms: {}, event: null, program: [], venues: {}, now: null };

  $('sair').addEventListener('click', () => window.Hack.logout());

  // Relógio do servidor corrigido pelo tempo decorrido: o aparelho pode estar
  // com a hora errada, o portal não.
  let clockSkew = 0;
  const now = () => new Date(Date.now() + clockSkew);

  function statusBadge(me) {
    if (me.roles.includes('participant')) return h('span.badge.badge--ok', 'Inscrição confirmada');
    if (me.signupStatus === 'waitlist') return h('span.badge.badge--warn', 'Lista de espera');
    if (me.signupStatus === 'removed') return h('span.badge.badge--err', 'Inscrição cancelada');
    return null;
  }

  function nextActivity() {
    const t = now().getTime();
    const items = state.program.map((a) => ({
      a,
      start: at(a.day, a.start).getTime(),
      end: a.end ? at(a.day, a.end).getTime() : at(a.day, a.start).getTime() + 30 * 60000,
    }));
    const current = items.find((x) => x.start <= t && t < x.end);
    const next = items.find((x) => x.start > t);
    return { current: current && current.a, next: next && next.a };
  }

  function activityLine(a) {
    return [hm(a.start), a.end ? '–' + hm(a.end) : '', ' · ', a.title, a.place ? ' · ' + a.place : ''].join('');
  }

  let qrCard = null;
  function renderInicio() {
    const g = clear($('inicio-grid'));
    const me = state.me;
    const roles = me.roleLabels.filter((r) => r !== 'Participante');

    // QR primeiro: é o que se abre na fila da entrada. Criado uma vez só: o
    // re-render do próximo horário não pode recarregar a imagem.
    if (!qrCard) qrCard = h('article.card', { 'aria-labelledby': 'h-qr' },
      h('p.card__k', 'Credenciamento'),
      h('h2.card__title#h-qr', 'Seu QR de entrada'),
      h('div.qr', h('img', { src: '/hack/api/me/qr.svg', alt: 'QR code pessoal de credenciamento de ' + me.name, width: 300, height: 300 })),
      h('p.muted.small', { style: 'margin-top:14px;text-align:center' }, 'Mostre na entrada, na sexta e no sábado. Ele não dá acesso à sua conta.')
    );
    g.appendChild(qrCard);

    const { current, next } = nextActivity();
    const nowCard = h('article.card.card--red', { 'aria-labelledby': 'h-agora' },
      h('p.card__k', current ? 'Agora' : 'Próximo'),
      h('h2.card__title#h-agora', current ? current.title : next ? next.title : 'Hackathon encerrado'),
    );
    const a = current || next;
    if (a) {
      const v = state.venues[a.day] || {};
      nowCard.appendChild(h('p', dayLabel(a.day) + ' · ' + hm(a.start) + (a.end ? '–' + hm(a.end) : '')));
      nowCard.appendChild(h('p.muted', (v.name || a.place) + (v.address ? ' · ' + v.address : '')));
      if (v.mapUrl) nowCard.appendChild(h('p', h('a', { href: v.mapUrl, target: '_blank', rel: 'noopener' }, 'Abrir no mapa ↗')));
      if (current && next) nowCard.appendChild(h('p.muted.small', 'Depois: ' + activityLine(next)));
    }
    g.appendChild(nowCard);

    const who = h('article.card', { 'aria-labelledby': 'h-eu' },
      h('p.card__k', 'Você'),
      h('h2.card__title#h-eu', me.name),
      h('div.row', statusBadge(me), roles.map((r) => h('span.badge', r))),
      me.signupStatus === 'waitlist'
        ? h('p.muted', { style: 'margin-top:12px' }, 'Você está na lista de espera. Se abrir uma vaga, sua inscrição é confirmada e este portal mostra a mudança.')
        : null,
      h('p.muted.small', { style: 'margin-top:12px' }, me.email)
    );
    g.appendChild(who);
  }

  function renderAgenda() {
    const g = clear($('agenda-grid'));
    const days = Array.from(new Set(state.program.map((a) => a.day))).sort();
    const { current } = nextActivity();
    days.forEach((day) => {
      const v = state.venues[day] || {};
      g.appendChild(h('article.card', { 'aria-label': dayLabel(day) },
        h('p.card__k', dayLabel(day)),
        h('h2.card__title', v.name || ''),
        v.address ? h('p.muted', v.address) : null,
        v.mapUrl ? h('p', h('a', { href: v.mapUrl, target: '_blank', rel: 'noopener' }, 'Abrir no mapa ↗')) : null,
        h('ol.agenda', state.program.filter((a) => a.day === day).map((a) =>
          h('li', { class: [a.highlight ? 'hot' : '', current && current.id === a.id ? 'now' : ''].join(' ').trim() || null },
            h('time', hm(a.start) + (a.end ? '–' + hm(a.end) : '')),
            h('span', a.title, a.orgs && a.orgs.length ? h('span.agenda__orgs', a.orgs.map((o) => o.name).join(', ')) : null)
          )
        ))
      ));
    });
  }

  async function load() {
    try {
      const [me, prog] = await Promise.all([api('/hack/api/me'), api('/hack/api/program')]);
      clockSkew = Date.parse(me.now) - Date.now();
      Object.assign(state, { me: me.me, perms: me.perms, event: me.event, program: prog.program, venues: prog.venues });
      $('who').textContent = me.me.name;
      $('ola').textContent = '';
      $('ola').append('Olá, ', h('em', (me.me.name.split(' ')[0] || '') + '.'));
      $('link-org').hidden = !(me.perms.manage || me.perms.comms || me.perms.checkin);
      renderInicio();
      renderAgenda();
      tabs.show();
    } catch (e) {
      if (e.status !== 401) toast(e.message, true);
    }
  }

  const tabs = window.Hack.tabs();
  load();
  // Próximo horário anda sozinho com o relógio.
  setInterval(() => { if (state.me) { renderInicio(); } }, 60 * 1000);
})();
