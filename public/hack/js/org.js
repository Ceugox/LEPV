/* Painel da organização do hackathon. Cada aba só aparece para quem tem a
   permissão dela (data-perm); o servidor confere de novo em cada chamada. */
(function () {
  'use strict';
  const { api, h, clear, fill, toast, dayLabel, hm, copy } = window.Hack;
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
    if (b.running) {
      setTimeout(() => loadPeople().catch(() => {
        $('email-status').textContent += ' · Não foi possível atualizar o progresso (sem rede?). Recarregue a página antes de reenviar.';
      }), 3000);
    }
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

  // onDone: quem abriu o diálogo recarrega a própria tela (Pessoas, Visão geral).
  function linkDialog(p, onDone) {
    const out = h('div.stack');
    const gen = async (send) => {
      try {
        const r = await api('/hack/api/admin/people/' + p.id + '/link', { method: 'POST', body: { send } });
        fill(out,
          h('label.field', h('span', 'Link pessoal (vale 7 dias, uso único)'),
            h('div.copy', h('input', { value: r.url, readonly: true, 'aria-label': 'Link de acesso' }),
              h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => copy(r.url) }, 'Copiar'))),
          r.whatsappUrl
            ? h('a.btn.btn--red.btn--sm', { href: r.whatsappUrl, target: '_blank', rel: 'noopener' }, 'Abrir no WhatsApp')
            : h('p.muted.small', 'Sem WhatsApp válido no cadastro.'),
          r.email ? h('p.small', 'E-mail: ' + ({ sent: 'enviado', outbox: 'gravado (teste)', unconfigured: 'não configurado', failed: 'falhou', unknown: 'incerto' }[r.email.status] || r.email.status)) : null,
          h('p.muted.small', 'Gerar outro link invalida este.')
        );
        await (onDone || loadPeople)();
      } catch (e) { toast(e.message, true); }
    };
    openDialog('Link de ' + p.name.split(' ')[0],
      h('p.muted', 'Gere um link para mandar pelo WhatsApp ou envie direto por e-mail.'),
      h('div.row',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => gen('none') }, 'Gerar link'),
        state.emailEnabled && p.email ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => gen('email') }, 'Enviar por e-mail') : null,
        h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: async () => {
          try {
            const r = await api('/hack/api/admin/people/' + p.id + '/revoke', { method: 'POST' });
            toast(r.warning || 'Desconectado de todos os aparelhos.', Boolean(r.warning));
          }
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
    openDialog('Editar ' + p.name.split(' ')[0], form, removeBlock(p));
  }

  // Exclusão definitiva (só superadmin). Quem pode ser excluído o servidor
  // diz (removable), inclusive quem ficou retirado. Confirma digitando o
  // nome completo; a inscrição no evento sai junto.
  function removeBlock(p) {
    if (!(state.perms && state.perms.superadmin) || !p.removable) return null;
    const box = h('div', { style: 'margin-top:22px;padding-top:16px;border-top:1px solid var(--line)' },
      h('p.card__k', 'Excluir participante'),
      h('p.muted.small', 'Apaga a pessoa, a inscrição no evento e os dados dela na plataforma (links, presenças, dúvidas). Não tem volta. Para só tirar o acesso, use “Bloquear”.'));
    const start = h('button.btn.btn--danger.btn--sm', { type: 'button' }, 'Excluir participante…');
    start.addEventListener('click', () => {
      const err = h('p.muted.small', { role: 'alert', hidden: true });
      const input = h('input', { name: 'confirm', autocomplete: 'off' });
      const go = h('button.btn.btn--danger.btn--sm', { type: 'submit' }, 'Excluir definitivamente');
      const confirmForm = h('form.form', { style: 'margin-top:10px' },
        h('label.field', h('span', 'Digite o nome completo: ' + p.name), input), err, go);
      confirmForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        go.disabled = true;
        try {
          await api('/hack/api/admin/people/' + p.id, { method: 'DELETE', body: { confirmName: input.value } });
          dlg.close();
          toast(p.name + ' foi excluído(a).');
          loadPeople().catch(() => toast('Excluído, mas a lista não recarregou. Atualize a página.', true));
        } catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = false; }
      });
      start.replaceWith(confirmForm);
      input.focus();
    });
    box.appendChild(start);
    return box;
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
    state.venues = r.venues;
    renderProgram();
  }

  function venueDialog(day) {
    const v = state.venues[day] || {};
    const form = h('form.form',
      h('label.field', h('span', 'Nome do local'), h('input', { name: 'name', value: v.name || '', required: true, maxlength: 60 })),
      h('label.field', h('span', 'Endereço'), h('input', { name: 'address', value: v.address || '', maxlength: 160 })),
      h('label.field', h('span', 'Link do mapa (https://…)'), h('input', { name: 'mapUrl', type: 'url', value: v.mapUrl || '' })),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar local'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await api('/hack/api/admin/venues/' + day, { method: 'PUT', body: { name: f.name.value, address: f.address.value, mapUrl: f.mapUrl.value } });
        dlg.close();
        toast('Local atualizado: o portal já mostra.');
        await loadProgram();
      } catch (e) { toast(e.message, true); }
    });
    openDialog('Local de ' + dayLabel(day), form);
  }

  function renderProgram() {
    const g = clear($('prog-grid'));
    const days = Array.from(new Set(state.program.map((a) => a.day))).sort();
    days.forEach((day) => {
      const v = (state.venues || {})[day] || {};
      g.appendChild(h('article.card',
        h('p.card__k', dayLabel(day)),
        h('div.row', { style: 'margin-bottom:6px' },
          h('div.list__main', h('b', v.name || 'Local'), h('span', v.address || 'Sem endereço')),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => venueDialog(day) }, 'Editar local')),
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
        a.status === 'published' && hasProblems(a.stats)
          ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => failuresDialog(a) }, 'Ver falhas de envio') : null,
        a.status === 'overdue' ? h('p.small', 'O servidor estava fora do ar no horário. Publique agora, mude o horário ou cancele.') : null,
        actions));
    });
  }

  const hasProblems = (stats) => ['email', 'push'].some((ch) => stats[ch] && Object.keys(stats[ch]).some((k) => k !== 'sent'));

  async function failuresDialog(a) {
    let r;
    try { r = await api('/hack/api/admin/announcements/' + a.id + '/deliveries'); } catch (e) { toast(e.message, true); return; }
    const list = h('ul.list', r.items.length ? r.items.map((d) => h('li',
      h('div.list__main', h('b', d.person + ' · ' + CH[d.channel]), h('span', (DST[d.status] || d.status) + (d.attempts ? ' · ' + d.attempts + ' tentativa(s)' : '') + (d.error ? ' · ' + d.error : ''))),
      ['failed', 'unknown', 'unavailable', 'skipped'].includes(d.status) ? h('div.row',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => markDelivery2(d.id, 'pending', a) }, 'Reenviar'),
        d.status !== 'skipped' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => markDelivery2(d.id, 'skipped', a) }, 'Descartar') : null) : null))
      : h('li', h('p.muted', 'Nada pendente.')));
    openDialog('Envios de “' + a.title + '”', h('p.muted.small', '“Incerto” = o provedor não respondeu a tempo; pode ter chegado. Reenviar pode duplicar.'), list);
  }
  async function markDelivery2(id, status, a) {
    try {
      await api('/hack/api/admin/deliveries/' + id, { method: 'POST', body: { status } });
      toast(status === 'pending' ? 'Na fila de novo.' : 'Descartado.');
      dlg.close();
      await loadAvisos();
      failuresDialog(a);
    } catch (e) { toast(e.message, true); }
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

  // ---------- equipes ----------
  // Faculdade (vínculo) · ano · curso da inscrição; campo vazio some da linha
  // e, sem nenhum dos três, aparece "não informados".
  function academic(p) {
    const parts = [p.vinculo, p.anoFaculdade ? p.anoFaculdade + 'º ano' : '', p.curso].filter(Boolean);
    return h('span.academic', parts.length ? parts.join(' · ') : 'Faculdade, ano e curso não informados');
  }

  state.teams = [];
  state.solo = [];
  async function loadTeams() {
    const r = await api('/hack/api/admin/teams');
    state.teams = r.teams;
    state.solo = r.solo;
    const confirmed = r.teams.filter((t) => t.status === 'confirmed').length;
    $('teams-sum').textContent = r.teams.length + ' equipe(s), ' + confirmed + ' confirmada(s) · ' + r.solo.length + ' participante(s) sem equipe';
    const g = clear($('teams-grid'));
    if (!r.teams.length) g.appendChild(h('p.empty', 'Nenhuma equipe ainda.'));
    r.teams.forEach((t) => {
      const card = g.appendChild(h('article.card' + (t.status === 'confirmed' ? '' : '.card--red'), { 'data-team': t.id },
        h('div.row', { style: 'margin-bottom:8px' },
          t.status === 'confirmed' ? h('span.badge.badge--ok', 'Confirmada') : h('span.badge.badge--warn', 'Em formação'),
          h('span.muted.small', t.size + '/4 · código ' + t.code)),
        h('h3.card__title', t.name),
        h('ul.list', t.members.map((m) => h('li',
          h('div.list__main', h('b', m.name + (m.owner ? ' · criou' : '')), academic(m), h('span', [m.email, m.phone].filter(Boolean).join(' · '))),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => teamPatch(t.id, { removeMember: m.id }, 'Removido.') }, 'Tirar')))),
        h('div.row', { style: 'margin-top:12px' },
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => teamDialog(t) }, 'Ajustar'),
          t.status === 'confirmed'
            ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => teamPatch(t.id, { confirm: false }, 'Voltou para formação.') }, 'Desconfirmar')
            : h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => teamPatch(t.id, { confirm: true }, 'Confirmada.') }, 'Confirmar'))));
      if (t.size < 4) dropTarget(card, (pid) => teamPatch(t.id, { addMember: pid }, 'Incluído na ' + t.name + '.'));
    });
    const solo = clear($('solo-list'));
    if (!r.solo.length) solo.appendChild(h('li', h('p.muted', 'Todo participante está numa equipe.')));
    r.solo.forEach((p) => {
      const li = solo.appendChild(h('li.solo-item', { draggable: 'true', 'data-person': p.id },
      h('div.list__main', h('b', p.name), academic(p), h('span', [p.email, p.phone].filter(Boolean).join(' · '))),
      h('div.row',
        p.hasGroup ? h('span.badge', 'Disse que tem grupo') : null,
        p.hasGroup && !p.groupSent && !p.groupReceived ? h('span.badge.badge--warn', 'Ninguém indicado') : null,
        p.hasGroup && (p.groupSent || p.groupReceived) ? h('span.badge', 'Indicações pendentes: ' + (p.groupSent + p.groupReceived)) : null,
        p.published ? h('span.badge.badge--ok', 'Perfil visível') : null,
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => joinDialog(p) }, 'Juntar com…'))));
      li.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', p.id);
        ev.dataTransfer.effectAllowed = 'move';
        li.classList.add('is-dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('is-dragging'));
      dropTarget(li, (pid) => pid !== p.id && soloPair(pid, p.id));
    });
  }

  // Alvo de soltura: realça enquanto a pessoa arrastada está em cima.
  function dropTarget(el, onDrop) {
    let depth = 0;
    el.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
    el.addEventListener('dragenter', (ev) => { ev.preventDefault(); depth++; el.classList.add('drop-on'); });
    el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('drop-on'); } });
    el.addEventListener('drop', (ev) => {
      ev.preventDefault();
      depth = 0;
      el.classList.remove('drop-on');
      // Só pessoas da lista "Sem equipe" (texto arrastado de fora é ignorado).
      const pid = ev.dataTransfer.getData('text/plain');
      if (state.solo.some((x) => x.id === pid)) onDrop(pid);
    });
  }

  // Toda mudança de composição pela diretoria passa por aqui: o servidor
  // simula (dryRun) e diz quais indicações de grupo cairiam; havendo alguma,
  // a organização confirma vendo quem perde. Depois executa de verdade.
  async function teamOp(url, method, body, onDone) {
    let sim;
    try { sim = await api(url, { method, body: Object.assign({}, body, { dryRun: true }) }); }
    catch (e) { toast(e.message, true); return; }
    const run = async () => {
      try { const r = await api(url, { method, body }); await onDone(r); await loadTeams(); }
      catch (e) { toast(e.message, true); }
    };
    if (!Array.isArray(sim.cancelled)) { toast('Não deu para conferir o efeito da mudança. Recarregue a página.', true); return; }
    if (!sim.cancelled.length) { if (dlg.open) dlg.close(); return run(); }
    openDialog('Indicações pendentes',
      h('p', 'Isto cancela indicação de grupo ainda sem resposta:'),
      h('ul.list', sim.cancelled.map((c) => h('li', h('div.list__main', h('b', c.from + ' → ' + c.to))))),
      h('div.row', { style: 'margin-top:12px' },
        h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => { dlg.close(); run(); } }, 'Continuar mesmo assim'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => dlg.close() }, 'Cancelar')));
  }

  // Duas pessoas sem equipe viram uma equipe nova (nome provisório, renomeável).
  function soloPair(draggedId, targetId) {
    return teamOp('/hack/api/admin/teams', 'POST', { memberIds: [targetId, draggedId] },
      (r) => toast('Equipe “' + r.team.name + '” criada. Renomeie em Ajustar.'));
  }

  // Mesma coisa sem arrastar (celular e teclado).
  function joinDialog(p) {
    const others = state.solo.filter((x) => x.id !== p.id);
    const open = state.teams.filter((t) => t.size < 4);
    const sel = h('select', { name: 'to' },
      open.length ? h('optgroup', { label: 'Equipes com vaga' }, open.map((t) => h('option', { value: 't:' + t.id }, t.name + ' (' + t.size + '/4)'))) : null,
      others.length ? h('optgroup', { label: 'Pessoas sem equipe (forma equipe nova)' }, others.map((x) => h('option', { value: 'p:' + x.id }, x.name + (x.hasGroup ? ' (tem grupo)' : '')))) : null);
    const form = h('form.form', h('label.field', h('span', 'Juntar ' + p.name + ' com'), sel),
      h('button.btn.btn--red.btn--sm', { type: 'submit', disabled: !open.length && !others.length }, 'Juntar'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = sel.value;
      if (v.startsWith('t:')) teamPatch(v.slice(2), { addMember: p.id }, 'Incluído.');
      else soloPair(p.id, v.slice(2));
    });
    openDialog('Juntar com…', form);
  }

  function teamPatch(id, body, ok) {
    return teamOp('/hack/api/admin/teams/' + id, 'PATCH', body, () => { if (ok) toast(ok); });
  }

  const soloOptions = () => state.solo.map((p) => h('option', { value: p.id }, p.name + (p.vinculo ? ' · ' + p.vinculo : '') + (p.anoFaculdade ? ' · ' + p.anoFaculdade + 'º' : '') + (p.hasGroup ? ' (tem grupo)' : '')));

  function teamDialog(t) {
    const rename = h('form.form', h('label.field', h('span', 'Nome'), h('input', { name: 'name', value: t.name, required: true })),
      h('button.btn.btn--ghost.btn--sm', { type: 'submit' }, 'Renomear'));
    rename.addEventListener('submit', (ev) => { ev.preventDefault(); teamPatch(t.id, { name: ev.target.name.value }, 'Renomeada.'); });
    const add = h('form.form', h('label.field', h('span', 'Adicionar participante sem equipe'), h('select', { name: 'who' }, soloOptions())),
      h('button.btn.btn--ghost.btn--sm', { type: 'submit', disabled: !state.solo.length || t.size >= 4 }, 'Adicionar'));
    add.addEventListener('submit', (ev) => { ev.preventDefault(); teamPatch(t.id, { addMember: ev.target.who.value }, 'Adicionado.'); });
    const others = state.teams.filter((x) => x.id !== t.id && x.size + t.size <= 4);
    const merge = h('form.form', h('label.field', h('span', 'Juntar outra equipe nesta (até 4 pessoas)'),
      h('select', { name: 'other' }, others.map((x) => h('option', { value: x.id }, x.name + ' (' + x.size + ')')))),
      h('button.btn.btn--ghost.btn--sm', { type: 'submit', disabled: !others.length }, 'Juntar'));
    merge.addEventListener('submit', (ev) => {
      ev.preventDefault();
      teamOp('/hack/api/admin/teams/' + t.id + '/merge', 'POST', { otherId: ev.target.other.value }, () => toast('Equipes juntadas.'));
    });
    const del = h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: () => {
      teamOp('/hack/api/admin/teams/' + t.id, 'DELETE', {}, () => toast('Equipe desfeita.'));
    } }, 'Desfazer equipe');
    openDialog('Ajustar ' + t.name, rename, add, merge, h('div.row', { style: 'margin-top:12px' }, del));
  }

  $('add-team').addEventListener('click', () => {
    const sel = h('select', { name: 'who', multiple: true, size: Math.min(8, Math.max(3, state.solo.length)), style: 'min-height:140px' }, soloOptions());
    const form = h('form.form',
      h('label.field', h('span', 'Nome da equipe'), h('input', { name: 'name', required: true })),
      h('label.field', h('span', 'Integrantes (segure Ctrl/⌘ para escolher vários; até 4)'), sel),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Criar equipe'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const ids = Array.from(sel.selectedOptions).map((o) => o.value);
      teamOp('/hack/api/admin/teams', 'POST', { name: ev.target.name.value, memberIds: ids }, () => toast('Equipe criada.'));
    });
    openDialog('Nova equipe', form);
  });

  // Montagem por afinidade: o servidor propõe (instituição, ano próximo,
  // cursos misturados); aqui a diretoria renomeia, move gente entre equipes
  // ou deixa alguém de fora, e confirma. Nada é criado antes do "Criar".
  $('affinity-teams').addEventListener('click', async () => {
    let r;
    try { r = await api('/hack/api/admin/teams/affinity'); }
    catch (e) { toast(e.message, true); return; }
    const plan = r.teams.map((t) => ({ name: t.name, members: t.members.slice() }));
    const out = r.unassigned.slice();
    const box = h('div');
    const render = () => {
      clear(box);
      if (!plan.length && !out.length) {
        box.append(h('p.muted', 'Ninguém para juntar: todo participante sem equipe marcou “tenho grupo”, ou já está numa equipe.'));
      }
      const targets = () => plan.map((t, i) => h('option', { value: String(i) }, t.name)).concat([h('option', { value: 'out' }, 'Deixar sem equipe')]);
      const move = (p, from, to) => {
        if (from === 'out') out.splice(out.indexOf(p), 1); else plan[from].members.splice(plan[from].members.indexOf(p), 1);
        if (to === 'out') out.push(p); else plan[Number(to)].members.push(p);
        render();
      };
      const row = (p, from) => h('li',
        h('div.list__main', h('b', p.name), academic(p),
          p.outOfAffinity ? h('span.badge.badge--warn', 'Fora da afinidade (' + p.affinity + ')') : null),
        h('label.field', { style: 'min-width:150px' },
          h('select', { 'aria-label': 'Mover ' + p.name, onchange: (ev) => move(p, from, ev.target.value) },
            h('option', { value: '', selected: true }, 'Mover para…'), targets())));
      plan.forEach((t, i) => {
        const bad = t.members.length && (t.members.length < 2 || t.members.length > 4);
        box.append(h('article.card' + (bad ? '.card--red' : ''), { style: 'margin-bottom:12px' },
          h('label.field', h('span', 'Nome · ' + t.members.length + '/4' + (bad ? ' · precisa de 2 a 4' : '')),
            h('input', { value: t.name, maxlength: '40', oninput: (ev) => { t.name = ev.target.value; } })),
          t.members.length ? h('ul.list', t.members.map((p) => row(p, i))) : h('p.muted.small', 'Vazia: não será criada.')));
      });
      if (out.length) {
        box.append(h('h3', { style: 'margin-top:18px' }, 'Sem equipe nesta montagem'),
          h('p.muted.small', 'Sobrou sozinho e não coube em nenhuma equipe, ou você tirou.'),
          h('ul.list', out.map((p) => row(p, 'out'))));
      }
      if (r.withGroup.length) {
        box.append(h('h3', { style: 'margin-top:18px' }, 'Disseram que têm grupo (' + r.withGroup.length + ')'),
          h('p.muted.small', 'Ficam de fora: esperam os colegas indicarem. Junte à mão na lista “sem equipe”, se for o caso.'),
          h('ul.list', r.withGroup.map((p) => h('li', h('div.list__main', h('b', p.name), academic(p))))));
      }
      const ready = plan.filter((t) => t.members.length);
      const err = h('p.muted.small', { role: 'alert', hidden: true });
      const go = h('button.btn.btn--red.btn--sm', { type: 'button', disabled: !ready.length }, 'Criar ' + ready.length + ' equipe(s)');
      go.addEventListener('click', async () => {
        if (ready.some((t) => t.members.length < 2 || t.members.length > 4)) { err.textContent = 'Cada equipe precisa ter de 2 a 4 pessoas. Mova alguém ou deixe a equipe vazia.'; err.hidden = false; return; }
        go.disabled = true;
        let res;
        try {
          res = await api('/hack/api/admin/teams/affinity', { method: 'POST', body: { teams: ready.map((t) => ({ name: t.name, memberIds: t.members.map((p) => p.id) })) } });
        } catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = false; return; }
        dlg.close();
        toast(res.created.length + ' equipe(s) criada(s), em formação. Os integrantes já veem a equipe no portal.');
        // As equipes já existem: falha ao recarregar a grade não pode parecer
        // falha ao criar (e o diálogo já fechou).
        loadTeams().catch(() => toast('Equipes criadas, mas a lista não recarregou. Atualize a página.', true));
      });
      box.append(err, h('div.row', { style: 'margin-top:14px' }, go));
    };
    render();
    openDialog('Montar por afinidade',
      h('p.muted', 'Proposta para quem está sem equipe e não marcou “tenho grupo” (inclui quem deixou em branco): IME com IME, FGV com FGV, UFPE com UFPE, outras universidades entre si. Ajuste antes de criar.'),
      box);
  });

  // ---------- entregas ----------
  async function loadSubs() {
    const r = await api('/hack/api/admin/submissions');
    $('deadline-in').value = toLocalInput(r.deadline);
    const done = r.submissions.filter((x) => x.complete).length;
    $('subs-sum').textContent = done + ' de ' + r.submissions.length + ' equipe(s) com entrega completa · prazo ' + window.Hack.dayTime(r.deadline) + (r.open ? ' (aberto)' : ' (travado)');
    const list = clear($('subs-list'));
    if (!r.submissions.length) list.appendChild(h('li', h('p.muted', 'Nenhuma equipe ainda.')));
    r.submissions.forEach((x) => list.appendChild(h('li',
      h('div.list__main', h('b', x.team.name + (x.projectName ? ' · ' + x.projectName : '')),
        h('span', x.updatedAt ? 'Atualizada ' + window.Hack.dayTime(x.updatedAt) + (x.updatedBy ? ' por ' + x.updatedBy : '') : 'Nada entregue')),
      h('div.row',
        x.team.status === 'confirmed' ? null : h('span.badge.badge--warn', 'Equipe não confirmada'),
        x.complete ? h('span.badge.badge--ok', 'Completa') : h('span.badge.badge--warn', 'Incompleta'),
        x.repoUrl ? h('a.btn.btn--ghost.btn--sm', { href: x.repoUrl, target: '_blank', rel: 'noopener' }, 'Repo') : null,
        x.slides ? h('a.btn.btn--ghost.btn--sm', { href: x.slides.url, target: '_blank', rel: 'noopener' }, 'Slides') : null,
        x.videoUrl ? h('a.btn.btn--ghost.btn--sm', { href: x.videoUrl, target: '_blank', rel: 'noopener' }, 'Vídeo') : null,
        x.deployUrl ? h('a.btn.btn--ghost.btn--sm', { href: x.deployUrl, target: '_blank', rel: 'noopener' }, 'No ar') : null,
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => summaryDialog(x) }, x.summary ? 'Resumo ✓' : 'Resumo')))));
  }
  // Resumo de apoio à banca: aparece para os jurados ao lado da entrega, sem nota. A equipe não vê.
  function summaryDialog(x) {
    const form = h('form.form',
      h('p.muted', 'Aparece para a banca ao lado da entrega. A equipe não vê.'),
      h('label.field', h('span', 'Resumo (até 4000 caracteres)'), h('textarea', { name: 'summary', maxlength: 4000, rows: 12 }, x.summary || '')),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar resumo'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api('/hack/api/admin/submissions/' + x.team.id, { method: 'PUT', body: { summary: ev.target.summary.value } });
        dlg.close();
        toast('Resumo salvo.');
        await loadSubs();
      } catch (e) { toast(e.message, true); }
    });
    openDialog('Resumo · ' + x.team.name, form);
  }
  $('form-deadline').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api('/hack/api/admin/config/deadline', { method: 'PUT', body: { submissionDeadline: brt($('deadline-in').value) } });
      toast('Prazo atualizado.');
      await loadSubs();
    } catch (e) { toast(e.message, true); }
  });

  // ---------- e-mail das equipes ----------
  // Ajuda de tela, não trava de segurança: o botão de enviar só destrava
  // depois de "Ver prévia" nesta página. O servidor nunca reenvia para quem
  // já recebeu, então um clique a mais não duplica e-mail.
  let teamMailTimer = null;
  let teamMailPreviewed = false;
  function renderTeamMail(r) {
    const j = r.job;
    const last = j.crashed && !j.running
      ? ' · último envio PAROU no meio (' + j.crashed + '): quem ficou de fora segue em "faltam"'
      : j.finishedAt && !j.running
      ? ' · último envio: ' + j.sent + ' enviado(s)' + (j.failed ? ', ' + j.failed + ' com falha' : '') + (j.skipped ? ', ' + j.skipped + ' pulado(s)' : '')
      : '';
    $('team-mail-sum').textContent = !r.emailEnabled
      ? 'Envio de e-mail não configurado no servidor.'
      : j.running
        ? 'Enviando: ' + j.done + ' de ' + j.total + (j.failed ? ' · ' + j.failed + ' falha(s)' : '') + '…'
        : r.total + ' participante(s): ' + r.withTeam + ' com equipe, ' + r.withoutTeam + ' sem equipe · faltam ' + r.pending + (r.failed ? ' (' + r.failed + ' com falha, vão de novo)' : '') + last;
    const btn = $('team-mail-send');
    btn.disabled = !r.emailEnabled || j.running || !r.pending || !teamMailPreviewed;
    btn.textContent = r.pending ? 'Enviar para ' + r.pending + ' pessoa(s)' : 'Todos já receberam';
    clearTimeout(teamMailTimer);
    if (j.running) teamMailTimer = setTimeout(() => loadTeamMail().catch(() => {}), 3000);
  }
  async function loadTeamMail() {
    const r = await api('/hack/api/admin/team-emails');
    renderTeamMail(r);
    return r;
  }
  $('team-mail-preview').addEventListener('click', async () => {
    try {
      const r = await api('/hack/api/admin/team-emails');
      const sm = r.sample;
      const pre = $('team-mail-sample');
      pre.textContent = sm ? 'Para: ' + sm.to + '\nAssunto: ' + sm.subject + '\n\n' + sm.text : 'Ninguém para receber.';
      pre.hidden = false;
      teamMailPreviewed = Boolean(sm);
      renderTeamMail(r);
    } catch (e) { toast(e.message, true); }
  });
  $('team-mail-send').addEventListener('click', async () => {
    try {
      const r = await api('/hack/api/admin/team-emails', { method: 'POST', body: {} });
      toast('Envio iniciado para ' + r.queued + ' pessoa(s).');
      await loadTeamMail();
    } catch (e) { toast(e.message, true); }
  });

  // ---------- crédito de IA ----------
  // Salvar só depois de carregar o valor atual: com a carga falhando, os
  // campos vazios seriam gravados como "desligar" e o código sumiria do portal.
  let aiLoaded = false;
  async function loadAiCredit() {
    aiLoaded = false;
    $('form-ai-credit').querySelector('button[type=submit]').disabled = true;
    let r;
    try { r = await api('/hack/api/admin/config/ai-credit'); } catch (e) {
      $('ai-sum').textContent = 'Não deu para carregar o crédito atual (' + e.message + '). Recarregue antes de salvar.';
      throw e;
    }
    $('ai-code').value = r.code;
    $('ai-url').value = r.redeemUrl;
    $('ai-sum').textContent = r.code
      ? 'Liberado para ' + r.released + ' participante(s) com check-in.'
      : 'Nenhum código cadastrado: a aba IA mostra só o guia.';
    aiLoaded = true;
    $('form-ai-credit').querySelector('button[type=submit]').disabled = false;
  }
  $('form-ai-credit').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!aiLoaded) { toast('Recarregue a página antes de salvar o crédito.', true); return; }
    try {
      await api('/hack/api/admin/config/ai-credit', { method: 'PUT', body: { code: $('ai-code').value, redeemUrl: $('ai-url').value } });
    } catch (e) { toast(e.message, true); return; }
    toast($('ai-code').value.trim() ? 'Crédito de IA salvo.' : 'Crédito de IA desligado: o código saiu do portal.');
    loadAiCredit().catch(() => {});
  });

  // ---------- avaliação ----------
  let evalState = null;
  async function evalAction(body, ok) {
    try {
      evalState = await api('/hack/api/admin/evaluation', { method: 'POST', body });
      if (ok) toast(ok);
      renderEval();
      return true;
    } catch (e) {
      toast(e.message, true);
      if (evalState) renderEval();
      return false;
    }
  }
  async function loadEval() {
    evalState = await api('/hack/api/admin/evaluation');
    renderEval();
  }
  const fmt = (n) => (n === null || n === undefined ? '—' : n.toFixed(1));
  // Fase 1 por pilares: nota interna 0–100 mostrada em 0–10; pilar em 0–2,5.
  const fmt10 = (n) => (n === null || n === undefined ? '—' : (n / 10).toFixed(2).replace('.', ','));
  const fmt2 = (n) => (n === null || n === undefined ? '—' : n.toFixed(2).replace('.', ','));

  function renderEval() {
    const d = evalState;
    const c = d.config;
    const crit = clear($('crit-list'));
    if (!c.criteria.length) crit.appendChild(h('li', h('p.muted', 'Nenhum critério ainda. Eles são definidos pela organização ao final.')));
    const pillarName = (id) => (c.pillars.find((p) => p.id === id) || {}).label || id;
    const phaseName = { both: 'Fase 1 e final', main: 'Fase 1', final: 'Final' };
    const inPhase = (x, ph) => !x.phase || x.phase === 'both' || x.phase === ph;
    c.criteria.forEach((x) => {
      const tbMain = c.tiebreakCriterionId === x.id;
      const tbFinal = c.finalTiebreakCriterionId === x.id;
      const tags = [phaseName[x.phase || 'both'], x.pillar ? pillarName(x.pillar) : null, x.gate ? 'trava' : null, 'peso ' + x.weight, '1 a ' + x.scaleMax,
        tbMain ? 'desempate da fase 1' : null, tbFinal ? 'desempate da final' : null].filter(Boolean).join(' · ');
      const tbBtn = (ph, label) => h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => evalAction({ action: 'tiebreak', id: x.id, phase: ph }, 'Critério de desempate definido.') }, label);
      crit.appendChild(h('li',
      h('div.list__main', h('b', x.name), h('span', tags), x.description ? h('span', x.description) : null,
        x.anchors && x.anchors.length ? h('div.small.muted', 'Âncoras · ' + x.anchors.map((a, i) => a ? (i + 1) + ': ' + a : null).filter(Boolean).join(' · ')) : null),
      c.criteriaLocked
        ? (c.resultsLocked ? null : h('div.row',
          inPhase(x, 'main') && !tbMain ? tbBtn('main', 'Desempate da fase 1') : null,
          inPhase(x, 'final') && !tbFinal ? tbBtn('final', 'Desempate da final') : null))
        : h('div.row',
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => critDialog(x) }, 'Editar'),
          h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: () => evalAction({ action: 'removeCriterion', id: x.id }) }, 'Excluir'))));
    });
    $('add-crit').hidden = c.criteriaLocked;
    $('lock-crit').textContent = c.criteriaLocked ? 'Destravar critérios' : 'Travar critérios';
    $('lock-crit').disabled = c.resultsLocked;

    const st = $('eval-status');
    fill(st,
      h('span.badge' + (c.open ? '.badge--ok' : ''), c.open ? 'Avaliação aberta' : 'Avaliação fechada'),
      h('span.badge', c.phase === 'final' ? 'Final (pitch)' : c.pillarMode ? 'Fase 1 (seleção por pilares)' : 'Fase única'),
      c.resultsLocked ? h('span.badge.badge--red', 'Resultado travado') : null,
      c.revealedAt ? h('span.badge.badge--ok', 'Revelado ' + window.Hack.dayTime(c.revealedAt)) : null,
      h('span.muted.small', d.evaluableCount + ' equipe(s) em avaliação'));
    $('toggle-open').textContent = c.open ? 'Fechar avaliação' : 'Abrir avaliação';
    $('toggle-open').disabled = !c.criteriaLocked || c.resultsLocked;
    $('phase-btn').textContent = c.phase === 'final' ? 'Voltar para fase única' : 'Abrir fase final (finalistas)';
    $('phase-btn').disabled = c.resultsLocked;
    $('lock-results').textContent = c.resultsLocked ? 'Destravar resultado' : 'Travar resultado';
    $('lock-results').disabled = Boolean(c.revealedAt);
    $('reveal').disabled = !c.resultsLocked || Boolean(c.revealedAt);
    $('podium-in').value = c.podiumSize;

    const jl = clear($('judges-list'));
    if (!d.judges.length) jl.appendChild(h('li', h('p.muted', 'Nenhum jurado cadastrado (aba Pessoas).')));
    d.judges.forEach((j) => jl.appendChild(h('li',
      h('div.list__main', h('b', j.name), h('span', j.conflicts.length ? j.conflicts.length + ' impedimento(s)' : 'Sem impedimentos'),
        h('div.row', { 'aria-label': 'Pilares que ' + j.name + ' avalia na fase 1' }, c.pillars.map((p) => h('label.check',
          h('input', { type: 'checkbox', checked: j.pillars.includes(p.id), disabled: c.resultsLocked, onchange: (ev) => {
            const next = j.pillars.filter((x) => x !== p.id).concat(ev.target.checked ? [p.id] : []);
            evalAction({ action: 'judgePillars', personId: j.id, pillars: next }, 'Pilares de ' + j.name + ' atualizados.');
          } }), h('span', p.label))))),
      h('span.badge' + (j.has && j.done === j.total && j.total ? '.badge--ok' : '.badge--warn'), j.has ? j.done + '/' + j.total : 'nada nesta fase'))));

    const tb = clear($('rank-body'));
    if (!d.ranking.length) tb.appendChild(h('li', h('p.muted', 'Sem equipes confirmadas.')));
    d.ranking.forEach((r) => tb.appendChild(h('li',
      h('span.card__big', { style: 'font-size:34px;min-width:56px' }, r.position ? r.position + 'º' : '—'),
      h('div.list__main', h('b', r.name), h('span',
        'Nota ' + (r.pillars ? fmt10(r.score) + ' de 10' : fmt(r.score)) + ' · desempate ' + fmt(r.tiebreak) + ' · ' + r.judges + '/' + r.eligibleJudges + ' jurado(s)' +
        (c.phase === 'final' && r.finalist ? ' · final (fase 1: ' + (r.main.pillars ? fmt10(r.main.score) + ' de 10' : fmt(r.main.score)) + ')' : '') + (r.complete ? '' : ' · entrega incompleta')),
        r.pillars ? h('span.small', c.pillars.filter((p) => r.pillars[p.id]).map((p) => p.label + ' ' + fmt2(r.pillars[p.id].score)).join(' · ')) : null,
        h('div.row',
          r.suggested ? h('span.badge.badge--ok', 'Sugerida para a final') : null,
          r.belowFloor ? h('span.badge.badge--err', 'Pilar abaixo de ' + String(c.pillarFloor).replace('.', ',')) : null,
          r.incomplete ? h('span.badge.badge--warn', 'Pilar sem jurado (nota provisória)') : null)),
      h('label.check', { style: 'min-height:44px' },
        h('input', { type: 'checkbox', checked: r.finalist, disabled: c.resultsLocked, onchange: (ev) => {
          const ids = c.finalists.filter((x) => x !== r.teamId).concat(ev.target.checked ? [r.teamId] : []);
          evalAction({ action: 'finalists', teamIds: ids });
        } }), h('span', 'Finalista')))));
  }

  function critDialog(x) {
    // Sem pilar, o padrão é valer nas duas fases (como antes); com pilar, só fase 1.
    x = x || { name: '', description: '', weight: 1, scaleMax: 5, phase: 'both', pillar: null, gate: false, anchors: [] };
    const pillars = evalState.config.pillars;
    const anchors = x.anchors || [];
    const form = h('form.form',
      h('label.field', h('span', 'Nome'), h('input', { name: 'name', value: x.name, required: true, maxlength: 60 })),
      h('label.field', h('span', 'Descrição para a banca'), h('textarea', { name: 'description', maxlength: 300 }, x.description)),
      h('div.form-grid',
        h('label.field', h('span', 'Fase'), h('select', { name: 'phase' },
          h('option', { value: 'main', selected: x.phase === 'main' }, 'Fase 1 (entregáveis)'),
          h('option', { value: 'final', selected: x.phase === 'final' }, 'Final (pitch)'),
          h('option', { value: 'both', selected: !x.phase || x.phase === 'both' }, 'As duas'))),
        h('label.field', h('span', 'Pilar (só fase 1)'), h('select', { name: 'pillar', onchange: (ev) => { if (ev.target.value) ev.target.form.phase.value = 'main'; } },
          h('option', { value: '' }, 'Sem pilar (todos os jurados)'),
          pillars.map((p) => h('option', { value: p.id, selected: x.pillar === p.id }, p.label))))),
      h('div.form-grid',
        h('label.field', h('span', 'Peso'), h('input', { name: 'weight', type: 'number', min: '0.1', max: '10', step: '0.1', value: x.weight })),
        h('label.field', h('span', 'Escala'), h('select', { name: 'scaleMax' },
          h('option', { value: 5, selected: x.scaleMax === 5 }, '1 a 5'), h('option', { value: 10, selected: x.scaleMax === 10 }, '1 a 10')))),
      h('label.check', h('input', { type: 'checkbox', name: 'gate', checked: Boolean(x.gate) }), h('span', 'Trava: nota 1 limita o pilar a 1,0')),
      h('div.field', h('span', 'Âncoras: o que significa cada nota (de 1 a 5)'),
        [0, 1, 2, 3, 4].map((i) => h('label.field', h('span', 'Nota ' + (i + 1)), h('input', { name: 'anchor' + i, value: anchors[i] || '', maxlength: 160 })))),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const saved = await evalAction({
        action: x.id ? 'updateCriterion' : 'addCriterion', id: x.id, name: f.name.value, description: f.description.value,
        weight: Number(f.weight.value), scaleMax: Number(f.scaleMax.value), phase: f.phase.value, pillar: f.pillar.value || null,
        gate: f.gate.checked, anchors: [0, 1, 2, 3, 4].map((i) => f['anchor' + i].value),
      }, 'Critério salvo.');
      if (saved) dlg.close();
    });
    openDialog(x.id ? 'Editar critério' : 'Novo critério', form);
  }
  $('add-crit').addEventListener('click', () => critDialog(null));
  $('lock-crit').addEventListener('click', () => {
    const lock = !evalState.config.criteriaLocked;
    if (lock && !confirmTwice('Travar os critérios? Depois da primeira nota eles não mudam mais.')) return;
    evalAction({ action: 'lockCriteria', lock }, lock ? 'Critérios travados.' : 'Critérios destravados.');
  });
  $('toggle-open').addEventListener('click', () => evalAction({ action: 'open', open: !evalState.config.open }, evalState.config.open ? 'Avaliação fechada.' : 'Avaliação aberta para a banca.'));
  $('phase-btn').addEventListener('click', () => {
    const toFinal = evalState.config.phase !== 'final';
    if (toFinal && !confirmTwice('Abrir a fase final? Os jurados passam a avaliar só as finalistas.')) return;
    evalAction({ action: 'phase', phase: toFinal ? 'final' : 'main' }, toFinal ? 'Fase final aberta.' : 'Voltou para a fase única.');
  });
  $('lock-results').addEventListener('click', () => {
    const lock = !evalState.config.resultsLocked;
    if (lock && !confirmTwice('Travar o resultado? A banca não consegue mais mudar notas.')) return;
    evalAction({ action: 'lockResults', lock }, lock ? 'Resultado travado.' : 'Resultado destravado.');
  });
  $('reveal').addEventListener('click', () => {
    if (!confirmTwice('Revelar o resultado? O pódio aparece no portal de todo mundo.')) return;
    evalAction({ action: 'reveal' }, 'Resultado revelado.');
  });
  $('form-podium').addEventListener('submit', (ev) => {
    ev.preventDefault();
    evalAction({ action: 'podium', podiumSize: Number($('podium-in').value) }, 'Pódio atualizado.');
  });

  // ---------- parceiros ----------
  const KIND = { sponsor: 'Patrocinador', supporter: 'Apoiador' };
  async function loadPartners() {
    const r = await api('/hack/api/admin/partners');
    const rl = clear($('req-list'));
    if (!r.requests.length) rl.appendChild(h('li', h('p.muted', 'Nenhum pedido ainda.')));
    r.requests.forEach((x) => rl.appendChild(h('li',
      h('div.list__main', h('b', x.name + ' · ' + x.orgName), h('span', [KIND[x.kind], x.email, x.phone, x.role].filter(Boolean).join(' · '))),
      x.status === 'pending' ? h('div.row',
        h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => decide(x, true) }, 'Aprovar'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => decide(x, false) }, 'Recusar'))
        : h('span.badge' + (x.status === 'approved' ? '.badge--ok' : '.badge--err'), x.status === 'approved' ? 'Aprovado' : 'Recusado'))));
    const ol = clear($('org-list'));
    if (!r.orgs.length) ol.appendChild(h('li', h('p.muted', 'Cadastre as organizações para elas aparecerem no formulário.')));
    r.orgs.forEach((o) => ol.appendChild(h('li',
      h('div.list__main', h('b', o.name), h('span', KIND[o.kind] + (o.active ? '' : ' · fora do formulário'))),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => orgDialog(o) }, 'Editar'))));
    const rep = clear($('rep-list'));
    if (!r.representatives.length) rep.appendChild(h('li', h('p.muted', 'Nenhum representante aprovado.')));
    r.representatives.forEach((p) => rep.appendChild(h('li',
      h('div.list__main', h('b', p.name), h('span', [(r.orgs.find((o) => o.id === p.orgId) || {}).name, p.email].filter(Boolean).join(' · '))),
      h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: async () => {
        if (!confirmTwice('Remover ' + p.name + ' da organização?')) return;
        try { await api('/hack/api/admin/partners/representatives/' + p.id, { method: 'DELETE' }); toast('Removido.'); await loadPartners(); }
        catch (e) { toast(e.message, true); }
      } }, 'Remover'))));
    const ex = clear($('exp-list'));
    if (!r.exports.length) ex.appendChild(h('li', h('p.muted', 'Nenhuma exportação.')));
    r.exports.slice().reverse().forEach((x) => ex.appendChild(h('li', h('div.list__main', h('b', x.person), h('span', window.Hack.dayTime(x.at) + ' · ' + x.count + ' contato(s)')))));
  }

  async function decide(x, approve) {
    try {
      const r = await api('/hack/api/admin/partners/requests/' + x.id, { method: 'POST', body: { approve } });
      // O link aparece antes de recarregar a lista: se a recarga falhar, ele
      // não se perde (o pedido já está decidido e não volta).
      loadPartners().catch(() => toast((approve ? 'Aprovado' : 'Recusado') + ', mas não consegui atualizar a lista. Recarregue a página.', true));
      if (!approve) { toast('Recusado.'); return; }
      openDialog('Acesso de ' + x.name.split(' ')[0],
        h('p', 'Aprovado como ' + KIND[x.kind] + ' · ' + x.orgName + '.'),
        r.email ? h('p.small', 'E-mail: ' + ({ sent: 'enviado', outbox: 'gravado (teste)', failed: 'falhou', unknown: 'incerto', unconfigured: 'não configurado' }[r.email.status] || r.email.status)) : null,
        h('label.field', h('span', 'Link pessoal'), h('div.copy', h('input', { value: r.url, readonly: true, 'aria-label': 'Link de acesso' }),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => copy(r.url) }, 'Copiar'))),
        r.whatsappUrl ? h('a.btn.btn--red.btn--sm', { href: r.whatsappUrl, target: '_blank', rel: 'noopener' }, 'Abrir no WhatsApp') : null);
    } catch (e) { toast(e.message, true); }
  }

  function orgDialog(o) {
    o = o || { name: '', kind: 'sponsor', active: true };
    const form = h('form.form',
      h('label.field', h('span', 'Nome'), h('input', { name: 'name', value: o.name, required: true, maxlength: 80 })),
      h('label.field', h('span', 'Modalidade'), h('select', { name: 'kind' },
        h('option', { value: 'sponsor', selected: o.kind === 'sponsor' }, 'Patrocinador'),
        h('option', { value: 'supporter', selected: o.kind === 'supporter' }, 'Apoiador'))),
      h('label.check', h('input', { type: 'checkbox', name: 'active', checked: o.active }), h('span', 'Organização ativa (aparece no formulário; patrocinador ativo exporta contatos)')),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const body = { name: f.name.value, kind: f.kind.value, active: f.active.checked };
      try {
        await api('/hack/api/admin/partners/orgs' + (o.id ? '/' + o.id : ''), { method: o.id ? 'PATCH' : 'POST', body });
        dlg.close();
        toast('Organização salva.');
        await loadPartners();
      } catch (e) { toast(e.message, true); }
    });
    openDialog(o.id ? 'Editar organização' : 'Nova organização', form);
  }
  $('add-org').addEventListener('click', () => orgDialog(null));

  // ---------- visão geral (superadmin) ----------
  const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  // Número grande + rótulo; "alerta" quando o número pede ação.
  const stat = (n, label, warn) => h('div.ov-stat' + (warn ? '.ov-stat--warn' : ''), h('b', String(n)), h('span', label));
  const goTab = (name) => { location.hash = name; };

  async function loadOverview() {
    const o = await api('/hack/api/admin/overview');
    state.emailEnabled = o.emailEnabled;
    $('ov-when').textContent = 'Atualizado em ' + fmtWhen(o.now);
    const g = o.groups, a = o.access, sub = o.submissions, q = o.questions;
    clear($('ov-stats')).append(
      h('article.card', h('p.card__k', 'Grupos'),
        h('div.ov-row', stat(g.teams, 'equipes'), stat(g.confirmed, 'confirmadas'), stat(g.solo, 'sem equipe', g.solo > 0)),
        h('p.muted.small', g.soloWithGroup + ' sem equipe disseram ter grupo · ' + g.pendingIndications + ' indicação(ões) pendente(s)' + (g.small ? ' · ' + g.small + ' equipe(s) com 1 pessoa' : '')),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => goTab('equipes') }, 'Abrir Equipes →')),
      h('article.card', h('p.card__k', 'Acessos'),
        h('div.ov-row', stat(a.participants, 'participantes'), stat(a.loggedIn, 'já entraram'), stat(a.active24h, 'ativos em 24 h')),
        h('p.muted.small', a.linkSent + ' com link enviado · ' + a.neverIn.length + ' nunca entraram' + (a.linkFailed ? ' · ' + a.linkFailed + ' e-mail(s) com falha' : '')),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => goTab('pessoas') }, 'Abrir Pessoas →')),
      h('article.card', h('p.card__k', 'Entregas'),
        h('div.ov-row', stat(sub.complete, 'completas'), stat(sub.draft, 'rascunho'), stat(sub.missing.length, 'sem entrega', sub.missing.length > 0)),
        h('p.muted.small', 'Prazo: ' + fmtWhen(sub.deadline)),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => goTab('entregas') }, 'Abrir Entregas →')),
      h('article.card', h('p.card__k', 'Dúvidas'),
        h('div.ov-row', stat(q.open, 'sem resposta', q.open > 0), stat(q.answered, 'respondidas')),
        h('p.muted.small', q.oldestOpenAt ? 'Mais antiga sem resposta: ' + fmtWhen(q.oldestOpenAt) : 'Nenhuma esperando.'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => goTab('duvidas') }, 'Responder →')),
      h('article.card', h('p.card__k', 'Credenciamento'),
        h('div.ov-row', o.checkin.map((c) => stat(c.in + '/' + c.expected, c.place + ' · ' + c.day.slice(8, 10) + '/' + c.day.slice(5, 7))))),
      h('article.card', h('p.card__k', 'Avisos'),
        o.announcements.length ? h('ul.list', o.announcements.slice(0, 6).map((n) => {
          const st = n.stats || {};
          const sum = (ch, k) => (st[ch] && st[ch][k]) || 0;
          const sent = ['push', 'email', 'whatsapp'].reduce((t, ch) => t + sum(ch, 'sent'), 0);
          const failed = ['push', 'email', 'whatsapp'].reduce((t, ch) => t + sum(ch, 'failed'), 0);
          return h('li', h('div.list__main', h('b', n.title),
            h('span', n.status === 'published' ? 'Publicado ' + fmtWhen(n.publishedAt) + ' · ' + n.recipients + ' pessoa(s) · ' + n.read + ' leram · ' + sent + ' entregue(s)' + (failed ? ' · ' + failed + ' falha(s)' : '') : 'Agendado para ' + fmtWhen(n.scheduledAt))));
        })) : h('p.muted', 'Nenhum aviso.'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => goTab('avisos') }, 'Abrir Avisos →')));
    const people = (list, empty, actions) => list.length
      ? h('ul.list', list.map((p) => h('li', h('div.list__main', h('b', p.name), h('span', [p.email, p.phone].filter(Boolean).join(' · '))), actions ? actions(p) : null)))
      : h('p.muted', empty);
    clear($('ov-lists')).append(
      h('article.card', h('p.card__k', 'Nunca entraram'), h('h3.card__title', a.neverIn.length + ' participante(s)'),
        people(a.neverIn, 'Todo mundo já entrou na plataforma.', (p) => h('div.row',
          h('span.muted.small', p.lastLinkAt ? 'Link enviado ' + fmtWhen(p.lastLinkAt) + (p.linkStatus === 'failed' ? ' · e-mail falhou' : '') : 'Sem link enviado'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => linkDialog(p, loadOverview) }, 'Enviar link')))),
      h('article.card', h('p.card__k', 'Grupo sem indicação'), h('h3.card__title', g.stuck.length + ' pessoa(s)'),
        h('p.muted.small', 'Disseram que têm grupo, estão sem equipe e ninguém indicou ninguém.'),
        people(g.stuck, 'Ninguém travado.')),
      h('article.card', h('p.card__k', 'Equipes sem entrega'), h('h3.card__title', sub.missing.length + ' equipe(s)'),
        sub.missing.length ? h('ul.list', sub.missing.map((t) => h('li', h('div.list__main', h('b', t.name), h('span', t.size + ' pessoa(s)'))))) : h('p.muted', 'Toda equipe já começou a entrega.')),
      h('article.card', h('p.card__k', 'Exclusões'), h('h3.card__title', (o.removals || []).length + ' participante(s) excluído(s)'),
        (o.removals || []).length
          ? h('ul.list', o.removals.slice().reverse().map((x) => h('li', h('div.list__main', h('b', x.name), h('span', fmtWhen(x.at) + (x.by ? ' · por ' + x.by : ''))))))
          : h('p.muted', 'Ninguém excluído.')));
  }
  $('ov-reload').addEventListener('click', () => loadOverview().catch((e) => toast(e.message, true)));

  // ---------- dúvidas ----------
  async function loadQuestions() {
    const r = await api('/hack/api/admin/questions');
    const open = r.questions.filter((q) => !q.answer);
    $('q-sum').textContent = open.length + ' sem resposta · ' + (r.questions.length - open.length) + ' respondida(s)';
    const n = $('n-duvidas');
    n.hidden = !open.length;
    n.textContent = String(open.length);
    const box = clear($('q-list'));
    if (!r.questions.length) { box.appendChild(h('p.empty', 'Nenhuma dúvida ainda.')); return; }
    r.questions.forEach((q) => {
      const who = q.person ? q.person.name + ' · ' + [q.person.email, q.person.phone].filter(Boolean).join(' · ') : '?';
      if (q.answer) {
        box.appendChild(h('article.card', h('p.card__k', who + ' · ' + fmtWhen(q.createdAt)), h('p', q.text),
          h('p.answer', h('span.badge.badge--ok', 'Respondida por ' + q.answer.by + ' · ' + fmtWhen(q.answer.at)), ' ', q.answer.text)));
        return;
      }
      const ta = h('textarea', { name: 'text', rows: 3, maxlength: 1000, required: true });
      const form = h('form.form', h('label.field', h('span', 'Resposta'), ta), h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Responder'));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          const res = await api('/hack/api/admin/questions/' + q.id + '/answer', { method: 'POST', body: { text: ta.value } });
          const how = {
            sent: ' e notificada por push',
            no_device: '; a pessoa não ativou notificações (a resposta fica no portal dela)',
            unknown: '; não deu para confirmar o push (a resposta fica no portal dela)',
            failed: '; o push falhou (a resposta fica no portal dela)',
            unavailable: '; notificações push não estão configuradas (a resposta fica no portal dela)',
          }[res.push] || '';
          toast('Resposta enviada' + how + '.');
          await loadQuestions();
        } catch (e) {
          toast(e.message, true);
          // Outra pessoa respondeu antes: mostra a resposta que valeu.
          if (e.status === 409) await loadQuestions();
        }
      });
      box.appendChild(h('article.card.card--red', h('p.card__k', who + ' · ' + fmtWhen(q.createdAt)), h('p', q.text), form));
    });
  }

  // ---------- carga ----------
  const loaders = { visao: loadOverview, duvidas: loadQuestions, pessoas: loadPeople, equipes: () => Promise.all([loadTeams(), loadTeamMail()]), entregas: loadSubs, avaliacao: loadEval, parceiros: loadPartners, programacao: () => Promise.all([loadProgram(), loadAiCredit()]), avisos: () => { preview(); return loadAvisos(); }, whatsapp: loadWhats };
  const tabs = window.Hack.tabs((name) => {
    if (loaders[name]) loaders[name]().catch((e) => toast(e.message, true));
  });

  api('/hack/api/me').then((r) => {
    state.me = r.me;
    state.perms = r.perms;
    $('who').textContent = r.me.name;
    document.querySelectorAll('.tab[data-perm]').forEach((b) => { b.hidden = !r.perms[b.dataset.perm]; });
    $('link-cred').hidden = !r.perms.checkin;
    if (!document.querySelector('.tab[data-perm]:not([hidden])')) {
      // Staff só de credenciamento cai direto na tela de entrada.
      location.replace(r.perms.checkin ? '/hack/credenciamento' : '/hack/portal');
      return;
    }
    tabs.show();
  }).catch((e) => { if (e.status !== 401) toast(e.message, true); });
})();
