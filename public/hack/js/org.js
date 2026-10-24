/* Painel da organização do hackathon. Cada aba só aparece para quem tem a
   permissão dela (data-perm); o servidor confere de novo em cada chamada. */
(function () {
  'use strict';
  const { api, h, clear, toast, dayLabel, hm, copy } = window.Hack;
  const $ = (id) => document.getElementById(id);
  const state = { me: null, perms: {}, people: [], orgs: [], emailEnabled: false, program: [] };
  const ROLE = { participant: 'Participante', judge: 'Jurado', staff: 'Staff', sponsor: 'Patrocinador', supporter: 'Apoiador' };

  $('sair').addEventListener('click', () => window.Hack.logout());

  // ---------- diálogo genérico ----------
  const dlg = $('dlg');
  function openDialog(title, ...content) {
    const box = clear($('dlg-in'));
    box.append(h('h2', title), ...content.filter(Boolean),
      h('div.row.row--end', { style: 'margin-top:18px' }, h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => dlg.close() }, 'Fechar')));
    dlg.showModal();
  }

  // ---------- pessoas ----------
  async function loadPeople() {
    const r = await api('/hack/api/admin/people');
    Object.assign(state, { people: r.people, orgs: r.orgs, emailEnabled: r.emailEnabled });
    const b = r.bulk || {};
    $('email-status').textContent = !r.emailEnabled
      ? 'Envio de e-mail ainda não configurado (RESEND_API_KEY). Use “Link” e mande pelo WhatsApp.'
      : b.total
        ? (b.running ? 'Envio em lote: ' : 'Último envio em lote: ') + b.done + ' de ' + b.total + (b.failed ? ' · ' + b.failed + ' falha(s), veja “Falha no e-mail” na lista' : '')
        : '';
    renderPeople();
    if (b.running) setTimeout(() => loadPeople().catch(() => {}), 3000);
  }

  function linkBadge(p) {
    const s = p.lastLinkEmail && p.lastLinkEmail.status;
    if (s === 'sent' || s === 'outbox') return h('span.badge.badge--ok', 'Link enviado');
    if (s === 'unknown') return h('span.badge.badge--warn', 'Envio incerto');
    if (s === 'failed') return h('span.badge.badge--err', 'Falha no e-mail');
    if (p.lastLinkAt) return h('span.badge', 'Link gerado');
    return h('span.badge.badge--warn', 'Sem link');
  }

  const canAccess = (p) => !p.disabled && (p.roles.length > 0 || p.signupStatus === 'waitlist');

  function matches(p, q, f) {
    if (f === 'waitlist' && p.signupStatus !== 'waitlist') return false;
    if (f === 'nolink' && (p.lastLinkAt || !p.roles.length)) return false;
    if (f && f !== 'waitlist' && f !== 'nolink' && !p.roles.includes(f)) return false;
    if (!q) return true;
    return [p.name, p.email, p.phone].join(' ').toLowerCase().includes(q);
  }

  function renderPeople() {
    const q = $('busca').value.trim().toLowerCase();
    const f = $('filtro').value;
    const list = clear($('lista-pessoas'));
    const shown = state.people
      .filter((p) => p.roles.length || p.signupStatus)
      .filter((p) => matches(p, q, f))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    $('contagem').textContent = shown.length + ' pessoa(s)';
    if (!shown.length) list.appendChild(h('li', h('p.muted', 'Ninguém com esse filtro.')));
    shown.forEach((p) => {
      const org = p.orgId ? state.orgs.find((o) => o.id === p.orgId) : null;
      list.appendChild(h('li',
        h('div.list__main',
          h('b', p.name),
          h('span', [p.email, p.phone].filter(Boolean).join(' · ') + (org ? ' · ' + org.name : ''))),
        h('div.row',
          p.roles.map((r) => h('span.badge', ROLE[r] || r)),
          p.signupStatus === 'waitlist' ? h('span.badge.badge--warn', 'Lista de espera') : null,
          p.signupStatus === 'removed' ? h('span.badge.badge--err', 'Inscrição cancelada') : null,
          p.disabled ? h('span.badge.badge--err', 'Bloqueado') : null,
          canAccess(p) ? linkBadge(p) : null),
        h('div.row',
          canAccess(p) ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => linkDialog(p) }, 'Link') : null,
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => editDialog(p) }, 'Editar'))
      ));
    });
  }
  $('busca').addEventListener('input', renderPeople);
  $('filtro').addEventListener('change', renderPeople);

  function linkDialog(p) {
    const out = h('div.stack');
    const gen = async (send) => {
      try {
        const r = await api('/hack/api/admin/people/' + p.id + '/link', { method: 'POST', body: { send } });
        clear(out).append(
          h('label.field', h('span', 'Link pessoal (vale 7 dias, uso único)'),
            h('div.copy', h('input', { value: r.url, readonly: true, 'aria-label': 'Link de acesso' }),
              h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => copy(r.url) }, 'Copiar'))),
          r.whatsappUrl
            ? h('a.btn.btn--red.btn--sm', { href: r.whatsappUrl, target: '_blank', rel: 'noopener' }, 'Abrir no WhatsApp')
            : h('p.muted.small', 'Sem WhatsApp válido no cadastro.'),
          r.email ? h('p.small', 'E-mail: ' + ({ sent: 'enviado', outbox: 'gravado (teste)', unconfigured: 'não configurado', failed: 'falhou', unknown: 'incerto' }[r.email.status] || r.email.status)) : null,
          h('p.muted.small', 'Gerar outro link invalida este.')
        );
        await loadPeople();
      } catch (e) { toast(e.message, true); }
    };
    openDialog('Link de ' + p.name.split(' ')[0],
      h('p.muted', 'Gere um link para mandar pelo WhatsApp ou envie direto por e-mail.'),
      h('div.row',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => gen('none') }, 'Gerar link'),
        state.emailEnabled && p.email ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => gen('email') }, 'Enviar por e-mail') : null,
        h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: async () => {
          try { await api('/hack/api/admin/people/' + p.id + '/revoke', { method: 'POST' }); toast('Desconectado de todos os aparelhos.'); }
          catch (e) { toast(e.message, true); }
        } }, 'Desconectar')),
      out);
  }

  function editDialog(p) {
    const form = h('form.form',
      h('div.form-grid',
        h('label.field', h('span', 'Nome'), h('input', { name: 'name', value: p.name, required: true })),
        h('label.field', h('span', 'E-mail'), h('input', { name: 'email', type: 'email', value: p.email })),
        h('label.field', h('span', 'WhatsApp'), h('input', { name: 'phone', value: p.phone, inputmode: 'tel' }))),
      h('fieldset.stack', { style: 'border:0;padding:0;margin:0' },
        h('legend.card__k', 'Papéis atribuídos pela organização'),
        h('label.check', h('input', { type: 'checkbox', name: 'judge', checked: p.roles.includes('judge') }), h('span', 'Jurado')),
        h('label.check', h('input', { type: 'checkbox', name: 'staff', checked: p.roles.includes('staff') }), h('span', 'Staff')),
        h('label.check', h('input', { type: 'checkbox', name: 'comms', checked: p.staffPerms && p.staffPerms.comms }), h('span', 'Staff pode publicar avisos')),
        h('label.check', h('input', { type: 'checkbox', name: 'checkin', checked: p.staffPerms && p.staffPerms.checkin }), h('span', 'Staff pode credenciar'))),
      h('label.check', h('input', { type: 'checkbox', name: 'disabled', checked: p.disabled }), h('span', 'Bloquear acesso desta pessoa')),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        // Só manda o contato que mudou: o que a diretoria toca fica protegido
        // contra a inscrição, então não marcar à toa.
        const changed = (k) => (f[k].value.trim() !== (p[k] || '') ? f[k].value.trim() : undefined);
        await api('/hack/api/admin/people/' + p.id, { method: 'PATCH', body: {
          name: changed('name'), email: changed('email') || undefined, phone: changed('phone'),
          roles: { judge: f.judge.checked, staff: f.staff.checked },
          staffPerms: { comms: f.comms.checked, checkin: f.checkin.checked },
          disabled: f.disabled.checked,
        } });
        dlg.close();
        toast('Salvo.');
        await loadPeople();
      } catch (e) { toast(e.message, true); }
    });
    openDialog('Editar ' + p.name.split(' ')[0], form);
  }

  $('add-pessoa').addEventListener('click', () => {
    const form = h('form.form',
      h('div.form-grid',
        h('label.field', h('span', 'Nome'), h('input', { name: 'name', required: true })),
        h('label.field', h('span', 'E-mail'), h('input', { name: 'email', type: 'email', required: true })),
        h('label.field', h('span', 'WhatsApp'), h('input', { name: 'phone', inputmode: 'tel' })),
        h('label.field', h('span', 'Organização (opcional)'), h('input', { name: 'affiliation' }))),
      h('label.check', h('input', { type: 'checkbox', name: 'judge' }), h('span', 'Jurado')),
      h('label.check', h('input', { type: 'checkbox', name: 'staff' }), h('span', 'Staff')),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Adicionar'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const roles = ['judge', 'staff'].filter((r) => f[r].checked);
      try {
        await api('/hack/api/admin/people', { method: 'POST', body: { name: f.name.value, email: f.email.value, phone: f.phone.value, affiliation: f.affiliation.value, roles } });
        dlg.close();
        toast('Adicionado. Agora gere ou envie o link.');
        await loadPeople();
      } catch (e) { toast(e.message, true); }
    });
    openDialog('Adicionar jurado ou staff', form);
  });

  $('lote').addEventListener('click', () => {
    const sel = h('select', { name: 'role' }, Object.keys(ROLE).map((r) => h('option', { value: r }, ROLE[r] + 's')));
    const force = h('input', { type: 'checkbox', name: 'force' });
    const form = h('form.form',
      h('label.field', h('span', 'Para quem'), sel),
      h('label.check', force, h('span', 'Reenviar também para quem já recebeu (gera link novo e invalida o anterior)')),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Enviar'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const r = await api('/hack/api/admin/links/bulk', { method: 'POST', body: { role: sel.value, force: force.checked } });
        dlg.close();
        toast(r.queued + ' e-mail(s) na fila. A lista atualiza o status conforme saem.');
        await loadPeople();
      } catch (e) { toast(e.message, true); }
    });
    openDialog('Enviar links por e-mail', h('p.muted', 'Por padrão, só para quem ainda não recebeu nenhum link.'), form);
  });

  // ---------- programação ----------
  async function loadProgram() {
    const r = await api('/hack/api/admin/program');
    state.program = r.program;
    state.orgs = r.orgs;
    renderProgram();
  }

  function renderProgram() {
    const g = clear($('prog-grid'));
    const days = Array.from(new Set(state.program.map((a) => a.day))).sort();
    days.forEach((day) => {
      g.appendChild(h('article.card',
        h('p.card__k', dayLabel(day)),
        h('ul.list', state.program.filter((a) => a.day === day).map((a) => h('li',
          h('div.list__main', h('b', hm(a.start) + (a.end ? '–' + hm(a.end) : '') + ' · ' + a.title),
            h('span', [a.place, a.orgs.map((o) => o.name).join(', ')].filter(Boolean).join(' · '))),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => activityDialog(a) }, 'Editar'))))));
    });
  }

  function activityDialog(a) {
    a = a || { day: '2026-10-30', start: '', end: '', title: '', place: '', highlight: false, orgIds: [] };
    const orgChecks = state.orgs.map((o) => h('label.check',
      h('input', { type: 'checkbox', name: 'org', value: o.id, checked: (a.orgIds || []).includes(o.id) }), h('span', o.name)));
    const form = h('form.form',
      h('div.form-grid',
        h('label.field', h('span', 'Dia'), h('select', { name: 'day' },
          ['2026-10-30', '2026-10-31'].map((d) => h('option', { value: d, selected: a.day === d }, dayLabel(d))))),
        h('label.field', h('span', 'Início'), h('input', { name: 'start', type: 'time', value: a.start, required: true })),
        h('label.field', h('span', 'Fim (opcional)'), h('input', { name: 'end', type: 'time', value: a.end }))),
      h('label.field', h('span', 'Título'), h('input', { name: 'title', value: a.title, required: true })),
      h('label.field', h('span', 'Local'), h('input', { name: 'place', value: a.place })),
      h('label.check', h('input', { type: 'checkbox', name: 'highlight', checked: a.highlight }), h('span', 'Destacar')),
      orgChecks.length ? h('fieldset.stack', { style: 'border:0;padding:0;margin:0' }, h('legend.card__k', 'Organizações envolvidas'), orgChecks) : null,
      h('div.row',
        h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar'),
        a.id ? h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: async () => {
          try { await api('/hack/api/admin/program/' + a.id, { method: 'DELETE' }); dlg.close(); await loadProgram(); }
          catch (e) { toast(e.message, true); }
        } }, 'Excluir') : null));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const body = {
        day: f.day.value, start: f.start.value, end: f.end.value, title: f.title.value, place: f.place.value,
        highlight: f.highlight.checked,
        orgIds: Array.from(f.querySelectorAll('input[name=org]:checked')).map((i) => i.value),
      };
      try {
        await api('/hack/api/admin/program' + (a.id ? '/' + a.id : ''), { method: a.id ? 'PATCH' : 'POST', body });
        dlg.close();
        await loadProgram();
      } catch (e) { toast(e.message, true); }
    });
    openDialog(a.id ? 'Editar atividade' : 'Nova atividade', form);
  }
  $('add-atividade').addEventListener('click', () => activityDialog(null));

  // ---------- avisos ----------
  const STATUS = { published: ['Publicado', 'ok'], scheduled: ['Agendado', ''], overdue: ['Vencido: decidir', 'warn'], cancelled: ['Cancelado', 'err'], draft: ['Rascunho', ''] };
  const AUD = { participant: 'Participantes', judge: 'Jurados', sponsor: 'Patrocinadores', supporter: 'Apoiadores' };
  const CH = { email: 'E-mail', push: 'Push', whatsapp: 'WhatsApp' };
  const DST = { sent: 'enviado', pending: 'pendente', failed: 'falhou', unknown: 'incerto', unavailable: 'indisponível', skipped: 'pulado' };
  const formAviso = $('form-aviso');
  // datetime-local é "parede": interpretado sempre como horário de Brasília.
  const brt = (v) => (v ? v + ':00-03:00' : null);
  const toLocalInput = (iso) => (iso ? new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 16) : '');

  const audiencesOf = (form) => Array.from(form.querySelectorAll('input[name=aud]:checked')).map((i) => i.value).filter((v) => v !== 'all');
  function channelsOf(form) {
    const c = {};
    form.querySelectorAll('input[name=ch]').forEach((i) => { c[i.value] = i.checked; });
    return c;
  }

  let previewTimer;
  function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const aud = audiencesOf(formAviso);
      if (!aud.length) { $('alcance').textContent = 'Escolha pelo menos um público.'; return; }
      try {
        const r = await api('/hack/api/admin/announcements/preview', { method: 'POST', body: { audiences: aud } });
        $('alcance').textContent = 'Alcance: ' + r.people + ' pessoa(s) na central · ' + r.push + ' com push ativo · ' +
          r.email + ' com e-mail · ' + r.whatsapp + ' com WhatsApp. Quem tem dois papéis recebe uma vez.';
      } catch (e) { $('alcance').textContent = e.message; }
    }, 250);
  }
  formAviso.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.name === 'aud' && t.value === 'all') {
      formAviso.querySelectorAll('input[name=aud]').forEach((i) => { i.checked = t.checked; });
    } else if (t.name === 'aud' && !t.checked) {
      formAviso.querySelector('input[name=aud][value=all]').checked = false;
    }
    if (t.name === 'urgent' && t.checked) formAviso.querySelector('input[name=ch][value=push]').checked = true;
    if (t.name === 'aud') preview();
  });

  // Confirmação sem window.confirm (trava automação e é ruim no celular): o
  // primeiro clique arma, o segundo em até 5s confirma.
  let armed = null;
  function confirmTwice(msg) {
    if (armed && armed.msg === msg && Date.now() - armed.at < 5000) { armed = null; return true; }
    armed = { msg, at: Date.now() };
    toast(msg + ' Clique de novo para confirmar.');
    return false;
  }

  formAviso.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('button[type=submit]');
    const body = {
      title: f.title.value, body: f.body.value, audiences: audiencesOf(f), channels: channelsOf(f),
      urgent: f.urgent.checked, scheduledAt: brt(f.when.value),
    };
    if (!body.scheduledAt && !confirmTwice('Publicar agora para ' + body.audiences.map((a) => AUD[a] || a).join(', ') + '?')) return;
    btn.disabled = true;
    try {
      await api('/hack/api/admin/announcements', { method: 'POST', body });
      toast(body.scheduledAt ? 'Aviso agendado.' : 'Aviso publicado.');
      f.reset();
      formAviso.querySelector('input[name=aud][value=participant]').checked = true;
      preview();
      await loadAvisos();
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; }
  });

  function statsLine(stats) {
    return Object.keys(stats).map((ch) => CH[ch] + ': ' +
      Object.keys(stats[ch]).map((k) => stats[ch][k] + ' ' + (DST[k] || k)).join(', ')).join(' · ');
  }

  async function avisoAction(url, okMsg) {
    try { await api(url, { method: 'POST' }); if (okMsg) toast(okMsg); await loadAvisos(); }
    catch (e) { toast(e.message, true); }
  }

  async function loadAvisos() {
    const r = await api('/hack/api/admin/announcements');
    $('ch-push').textContent = r.channels.push ? '' : '(indisponível: chaves VAPID não configuradas)';
    $('ch-email').textContent = r.channels.email ? '' : '(indisponível: RESEND_API_KEY não configurada)';
    const box = clear($('avisos-admin'));
    if (!r.announcements.length) box.appendChild(h('p.empty', 'Nenhum aviso ainda.'));
    r.announcements.forEach((a) => {
      const st = STATUS[a.status] || [a.status, ''];
      const when = a.publishedAt ? 'Publicado ' + window.Hack.dayTime(a.publishedAt) : a.scheduledAt ? 'Agendado para ' + window.Hack.dayTime(a.scheduledAt) : '';
      const actions = h('div.row');
      if (['scheduled', 'overdue'].includes(a.status)) {
        actions.append(
          h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => {
            if (confirmTwice('Publicar agora “' + a.title + '”?')) avisoAction('/hack/api/admin/announcements/' + a.id + '/publish', 'Publicado.');
          } }, 'Publicar agora'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => editAviso(a) }, 'Editar'),
          h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: () => {
            if (confirmTwice('Cancelar “' + a.title + '”?')) avisoAction('/hack/api/admin/announcements/' + a.id + '/cancel', 'Cancelado.');
          } }, 'Cancelar'));
      }
      box.appendChild(h('article.card' + (a.urgent ? '.card--red' : ''),
        h('div.row', { style: 'margin-bottom:8px' },
          h('span.badge' + (st[1] ? '.badge--' + st[1] : ''), st[0]),
          a.urgent ? h('span.badge.badge--red', 'Urgente') : null,
          h('span.muted.small', when)),
        h('h3.card__title', { style: 'font-size:24px' }, a.title),
        h('p', { style: 'white-space:pre-line' }, a.body),
        h('p.muted.small', 'Para: ' + a.audiences.map((x) => AUD[x] || x).join(', ') + ' · Canais: central' +
          Object.keys(a.channels).filter((c) => a.channels[c]).map((c) => ', ' + CH[c]).join('') +
          (a.author ? ' · por ' + a.author : a.seeded ? ' · pré-agendado na especificação' : '')),
        a.status === 'published' ? h('p.small', a.recipientCount + ' destinatário(s). ' + statsLine(a.stats)) : null,
        a.status === 'overdue' ? h('p.small', 'O servidor estava fora do ar no horário. Publique agora, mude o horário ou cancele.') : null,
        actions));
    });
  }

  function editAviso(a) {
    const form = h('form.form',
      h('label.field', h('span', 'Título'), h('input', { name: 'title', value: a.title, required: true })),
      h('label.field', h('span', 'Texto'), h('textarea', { name: 'body', required: true }, a.body)),
      h('label.field', h('span', 'Agendar para (Brasília)'), h('input', { name: 'when', type: 'datetime-local', value: toLocalInput(a.scheduledAt), required: true })),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await api('/hack/api/admin/announcements/' + a.id, { method: 'PATCH', body: {
          title: f.title.value, body: f.body.value, audiences: a.audiences, channels: a.channels, urgent: a.urgent, scheduledAt: brt(f.when.value),
        } });
        dlg.close();
        await loadAvisos();
      } catch (e) { toast(e.message, true); }
    });
    openDialog('Editar aviso', form);
  }

  // ---------- WhatsApp assistido ----------
  async function loadWhats() {
    const r = await api('/hack/api/admin/whatsapp');
    const onlyPending = $('wa-pend').checked;
    const list = clear($('wa-list'));
    const items = r.items.filter((x) => !onlyPending || x.status === 'pending');
    if (!items.length) list.appendChild(h('li', h('p.muted', onlyPending ? 'Nada pendente.' : 'Nenhum envio por WhatsApp ainda.')));
    items.forEach((x) => {
      list.appendChild(h('li',
        h('div.list__main', h('b', x.person.name), h('span', x.announcement.title + ' · ' + (x.person.phone || 'sem telefone'))),
        h('span.badge' + (x.status === 'sent' ? '.badge--ok' : x.status === 'pending' ? '.badge--warn' : ''), DST[x.status] || x.status),
        h('div.row',
          x.waUrl ? h('a.btn.btn--ghost.btn--sm', { href: x.waUrl, target: '_blank', rel: 'noopener' }, 'Abrir conversa') : h('span.muted.small', 'Telefone inválido'),
          x.status !== 'sent' ? h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => markDelivery(x.id, 'sent') }, 'Marcar enviado') : null,
          x.status === 'pending' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => markDelivery(x.id, 'skipped') }, 'Pular') : null,
          x.status !== 'pending' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => markDelivery(x.id, 'pending') }, 'Voltar a pendente') : null)));
    });
  }
  async function markDelivery(id, status) {
    try { await api('/hack/api/admin/deliveries/' + id, { method: 'POST', body: { status } }); await loadWhats(); }
    catch (e) { toast(e.message, true); }
  }
  $('wa-pend').addEventListener('change', () => loadWhats().catch((e) => toast(e.message, true)));

  // ---------- carga ----------
  const loaders = { pessoas: loadPeople, programacao: loadProgram, avisos: () => { preview(); return loadAvisos(); }, whatsapp: loadWhats };
  const tabs = window.Hack.tabs((name) => {
    if (loaders[name]) loaders[name]().catch((e) => toast(e.message, true));
  });

  api('/hack/api/me').then((r) => {
    state.me = r.me;
    state.perms = r.perms;
    $('who').textContent = r.me.name;
    document.querySelectorAll('.tab[data-perm]').forEach((b) => { b.hidden = !r.perms[b.dataset.perm]; });
    if (!document.querySelector('.tab[data-perm]:not([hidden])')) {
      location.replace('/hack/portal');
      return;
    }
    tabs.show();
  }).catch((e) => { if (e.status !== 401) toast(e.message, true); });
})();
