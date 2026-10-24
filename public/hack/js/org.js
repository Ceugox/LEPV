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
    $('email-status').textContent = r.emailEnabled
      ? ''
      : 'Envio de e-mail ainda não configurado (RESEND_API_KEY). Use “Link” e mande pelo WhatsApp.';
    renderPeople();
  }

  function linkBadge(p) {
    const s = p.lastLinkEmail && p.lastLinkEmail.status;
    if (s === 'sent' || s === 'outbox') return h('span.badge.badge--ok', 'Link enviado');
    if (s === 'unknown') return h('span.badge.badge--warn', 'Envio incerto');
    if (s === 'failed') return h('span.badge.badge--err', 'Falha no e-mail');
    if (p.lastLinkAt) return h('span.badge', 'Link gerado');
    return h('span.badge.badge--warn', 'Sem link');
  }

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
          p.roles.length ? linkBadge(p) : null),
        h('div.row',
          p.roles.length ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => linkDialog(p) }, 'Link') : null,
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
        loadPeople();
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
        await api('/hack/api/admin/people/' + p.id, { method: 'PATCH', body: {
          name: f.name.value, email: f.email.value || undefined, phone: f.phone.value,
          roles: { judge: f.judge.checked, staff: f.staff.checked },
          staffPerms: { comms: f.comms.checked, checkin: f.checkin.checked },
          disabled: f.disabled.checked,
        } });
        dlg.close();
        toast('Salvo.');
        loadPeople();
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
        loadPeople();
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
        setTimeout(loadPeople, 4000);
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
          try { await api('/hack/api/admin/program/' + a.id, { method: 'DELETE' }); dlg.close(); loadProgram(); }
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
        loadProgram();
      } catch (e) { toast(e.message, true); }
    });
    openDialog(a.id ? 'Editar atividade' : 'Nova atividade', form);
  }
  $('add-atividade').addEventListener('click', () => activityDialog(null));

  // ---------- carga ----------
  const loaders = { pessoas: loadPeople, programacao: loadProgram };
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
