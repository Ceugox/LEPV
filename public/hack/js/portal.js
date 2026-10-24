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

    if (state.avisos && state.avisos.length) {
      g.appendChild(h('article.card', { 'aria-labelledby': 'h-ult' },
        h('p.card__k', 'Avisos'),
        h('h2.card__title#h-ult', state.avisos[0].title),
        h('p', { style: 'white-space:pre-line' }, state.avisos[0].body.length > 220 ? state.avisos[0].body.slice(0, 220) + '…' : state.avisos[0].body),
        h('p', h('a', { href: '#avisos' }, state.avisos.length > 1 ? 'Ver todos os ' + state.avisos.length + ' avisos →' : 'Abrir avisos →'))));
    }

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

  // ---------- avisos ----------
  state.avisos = [];
  state.push = { available: false, publicKey: '' };
  const seenThisVisit = new Set();

  function avisoCard(a, compact) {
    const isNew = !a.read || seenThisVisit.has(a.id);
    return h('article.card' + (a.urgent ? '.card--red' : ''), { 'aria-label': a.title },
      h('div.row', { style: 'margin-bottom:8px' },
        a.urgent ? h('span.badge.badge--red', 'Urgente') : null,
        isNew ? h('span.badge.badge--ok', 'Novo') : null,
        h('span.muted.small', window.Hack.dayTime(a.publishedAt))),
      h('h3.card__title', { style: 'font-size:24px' }, a.title),
      h('p', { style: 'white-space:pre-line' }, compact && a.body.length > 220 ? a.body.slice(0, 220) + '…' : a.body));
  }

  function renderAvisos() {
    const list = clear($('avisos-list'));
    if (!state.avisos.length) list.appendChild(h('p.empty', 'Nenhum aviso por enquanto. Quando a organização publicar, ele aparece aqui.'));
    state.avisos.forEach((a) => list.appendChild(avisoCard(a)));
    const unread = state.avisos.filter((a) => !a.read).length;
    $('n-avisos').hidden = !unread;
    $('n-avisos').textContent = unread;
  }

  async function loadAvisos() {
    try {
      const r = await api('/hack/api/announcements');
      state.avisos = r.announcements;
      state.push = r.push;
      renderAvisos();
      renderInicio();
      renderPush();
    } catch (e) { if (e.status !== 401) toast(e.message, true); }
  }

  // Abrir a aba conta como leitura; o selo "Novo" fica até sair da página.
  async function markAllRead() {
    const unread = state.avisos.filter((a) => !a.read);
    if (!unread.length) return;
    unread.forEach((a) => { seenThisVisit.add(a.id); a.read = true; });
    renderAvisos();
    try { await api('/hack/api/announcements/read-all', { method: 'POST' }); } catch (e) { /* tenta na próxima */ }
  }

  // ---------- push ----------
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function currentSub() {
    if (!pushSupported) return null;
    const reg = await navigator.serviceWorker.getRegistration('/hack/');
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function renderPush() {
    const card = $('push-card');
    if (!state.push.available) { card.hidden = true; return; }
    card.hidden = false;
    const msg = $('push-msg');
    $('push-on').hidden = true;
    $('push-off').hidden = true;
    if (isIOS && !standalone) {
      msg.textContent = 'No iPhone, as notificações só funcionam com o portal instalado: toque em Compartilhar → “Adicionar à Tela de Início” e abra o portal pelo ícone.';
      return;
    }
    if (!pushSupported) { msg.textContent = 'Este navegador não recebe notificações. Os avisos continuam aqui no portal.'; return; }
    if (Notification.permission === 'denied') { msg.textContent = 'As notificações estão bloqueadas nas configurações do navegador para este site.'; return; }
    const sub = await currentSub().catch(() => null);
    if (sub && Notification.permission === 'granted') {
      msg.textContent = 'Ativadas. Avisos urgentes chegam mesmo com o portal fechado.';
      $('push-off').hidden = false;
    } else {
      msg.textContent = 'Receba os avisos urgentes mesmo com o portal fechado.';
      $('push-on').hidden = false;
    }
  }

  $('push-on').addEventListener('click', async () => {
    try {
      // Pedido de permissão só por ação explícita da pessoa.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { renderPush(); return; }
      const reg = await navigator.serviceWorker.register('/hack/sw.js', { scope: '/hack/' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.push.publicKey) });
      await api('/hack/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      toast('Notificações ativadas neste aparelho.');
    } catch (e) {
      toast(e.message || 'Não foi possível ativar as notificações.', true);
    }
    renderPush();
  });

  $('push-off').addEventListener('click', async () => {
    try {
      const sub = await currentSub();
      if (sub) {
        await api('/hack/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      toast('Notificações desativadas neste aparelho.');
    } catch (e) { toast(e.message, true); }
    renderPush();
  });

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
      loadAvisos();
    } catch (e) {
      if (e.status !== 401) toast(e.message, true);
    }
  }

  const tabs = window.Hack.tabs((name) => { if (name === 'avisos') markAllRead(); });
  load();
  // Próximo horário anda com o relógio; avisos novos chegam sem recarregar.
  setInterval(() => { if (state.me) { renderInicio(); loadAvisos(); } }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.me) loadAvisos(); });
})();
