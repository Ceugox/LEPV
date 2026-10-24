/* Aba Equipe do portal: sem equipe (criar, código, descoberta, convites) ou
   com equipe (integrantes, código para colegas, pedidos, confirmação).
   Exposto como window.HackTeam.render(container). */
(function () {
  'use strict';
  const { api, h, clear, toast } = window.Hack;
  let box = null;

  async function act(fn, ok) {
    try { await fn(); if (ok) toast(ok); await render(box); }
    catch (e) { toast(e.message, true); }
  }

  function skillsLine(list) { return (list || []).join(' · '); }

  function profileCard(d) {
    const p = d.profile || {};
    const form = h('form.form',
      h('label.field', h('span', 'Sobre você (curto)'), h('textarea', { name: 'bio', maxlength: 300 }, p.bio || '')),
      h('label.field', h('span', 'Habilidades (separe por vírgula)'), h('input', { name: 'skills', value: (p.skills || []).join(', '), placeholder: 'front-end, dados, design, pitch' })),
      h('label.field', h('span', 'Interesses'), h('input', { name: 'interests', value: (p.interests || []).join(', '), placeholder: 'educação, IA, produto' })),
      h('label.check', h('input', { type: 'checkbox', name: 'published', checked: p.published }), h('span', 'Mostrar meu perfil para quem procura equipe')),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar perfil'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target;
      act(() => api('/hack/api/team/profile', { method: 'PUT', body: { bio: f.bio.value, skills: f.skills.value, interests: f.interests.value, published: f.published.checked } }), 'Perfil salvo.');
    });
    return h('article.card', h('p.card__k', 'Seu perfil'), h('h3.card__title', 'Encontrar equipe'),
      h('p.muted', 'Com o perfil visível, equipes com vaga podem te convidar e você pode pedir para entrar.'), form);
  }

  function startCard(d) {
    const create = h('form.form',
      h('label.field', h('span', 'Nome da equipe'), h('input', { name: 'name', maxlength: 40, required: true })),
      h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Criar equipe'));
    create.addEventListener('submit', (ev) => {
      ev.preventDefault();
      act(() => api('/hack/api/team', { method: 'POST', body: { name: ev.target.name.value } }), 'Equipe criada. Passe o código para os colegas.');
    });
    const join = h('form.form',
      h('label.field', h('span', 'Código da equipe'), h('input', { name: 'code', maxlength: 6, autocapitalize: 'characters', autocomplete: 'off', required: true })),
      h('button.btn.btn--ghost.btn--sm', { type: 'submit' }, 'Entrar com código'));
    join.addEventListener('submit', (ev) => {
      ev.preventDefault();
      act(() => api('/hack/api/team/join', { method: 'POST', body: { code: ev.target.code.value } }), 'Você entrou na equipe.');
    });
    return h('article.card.card--red',
      h('p.card__k', 'Equipe · ' + d.min + ' a ' + d.max + ' pessoas'),
      h('h3.card__title', 'Você ainda não está numa equipe'),
      d.hasGroup ? h('p', 'Na inscrição você disse que já tem grupo. Uma pessoa do grupo cria a equipe aqui e passa o código para as outras.') : null,
      h('div.grid.grid--2', create, join));
  }

  function invitesCard(d) {
    if (!d.invites.length) return null;
    return h('article.card', h('p.card__k', 'Convites e pedidos'),
      h('ul.list', d.invites.map((i) => h('li',
        h('div.list__main', h('b', i.team ? i.team.name : 'Equipe'),
          h('span', i.kind === 'invite' ? 'Convidou você · ' + (i.team ? i.team.size + '/4' : '') : 'Você pediu para entrar · aguardando a equipe')),
        i.kind === 'invite' ? h('div.row',
          h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/invites/' + i.id, { method: 'POST', body: { accept: true } }), 'Você entrou na equipe.') }, 'Aceitar'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/invites/' + i.id, { method: 'POST', body: { accept: false } })) }, 'Recusar')) : null))));
  }

  async function discoverCard(d, inTeam) {
    if (!d.canDiscover) return null;
    let data;
    try { data = await api('/hack/api/team/discover'); } catch (e) { return h('p.muted', e.message); }
    const people = h('ul.list', data.people.length ? data.people.map((p) => h('li',
      h('div.list__main', h('b', p.name), h('span', [p.curso, skillsLine(p.skills)].filter(Boolean).join(' · ')), p.bio ? h('span', p.bio) : null),
      inTeam ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/invite', { method: 'POST', body: { personId: p.id } }), 'Convite enviado.') }, 'Convidar') : null))
      : h('li', h('p.muted', 'Ninguém com perfil visível por enquanto.')));
    const teams = inTeam ? null : h('ul.list', data.teams.length ? data.teams.map((t) => h('li',
      h('div.list__main', h('b', t.name + ' · ' + t.size + '/4'), h('span', t.lookingFor || 'Sem descrição de vaga')),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/request', { method: 'POST', body: { teamId: t.id } }), 'Pedido enviado.') }, 'Pedir para entrar')))
      : h('li', h('p.muted', 'Nenhuma equipe com vaga ainda.')));
    return h('article.card', h('p.card__k', 'Descoberta'),
      teams ? [h('h3.card__title', 'Equipes com vaga'), teams] : null,
      h('h3.card__title', { style: 'margin-top:18px' }, inTeam ? 'Pessoas procurando equipe' : 'Quem também procura'), people);
  }

  function teamCard(d) {
    const t = d.team;
    const me = window.HackTeam.meId;
    const isOwner = t.members.some((m) => m.owner && m.id === me);
    const status = t.status === 'confirmed' ? h('span.badge.badge--ok', 'Confirmada') : h('span.badge.badge--warn', 'Em formação');
    const vagas = h('form.form',
      h('label.field', h('span', 'O que vocês procuram (aparece para quem busca equipe)'), h('input', { name: 'lookingFor', value: t.lookingFor || '', maxlength: 200 })),
      h('button.btn.btn--ghost.btn--sm', { type: 'submit' }, 'Salvar'));
    vagas.addEventListener('submit', (ev) => {
      ev.preventDefault();
      act(() => api('/hack/api/team', { method: 'PATCH', body: { lookingFor: ev.target.lookingFor.value } }), 'Salvo.');
    });
    return h('article.card.card--red',
      h('div.row', { style: 'margin-bottom:8px' }, status, h('span.muted.small', t.size + ' de ' + d.max + ' pessoas')),
      h('h3.card__title', t.name),
      h('p', 'Código para os colegas: ', h('b.mono', { style: 'font-size:22px;letter-spacing:.16em' }, t.code),
        ' ', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => window.Hack.copy(t.code) }, 'Copiar')),
      h('ul.list', t.members.map((m) => h('li',
        h('div.list__main', h('b', m.name + (m.owner ? ' · criou a equipe' : '')), m.skills && m.skills.length ? h('span', skillsLine(m.skills)) : null),
        isOwner && m.id !== me && !d.locked ? h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team', { method: 'PATCH', body: { removeMember: m.id } }), 'Removido.') }, 'Remover') : null))),
      d.locked ? h('p.muted', 'O prazo de entrega passou: a composição está congelada.') : h('div.row', { style: 'margin-top:14px' },
        t.status !== 'confirmed'
          ? h('button.btn.btn--red.btn--sm', { type: 'button', disabled: t.size < d.min, onclick: () => act(() => api('/hack/api/team', { method: 'PATCH', body: { confirm: true } }), 'Equipe confirmada.') }, t.size < d.min ? 'Confirmar (mínimo ' + d.min + ')' : 'Confirmar equipe')
          : null,
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/leave', { method: 'POST' }), 'Você saiu da equipe.') }, 'Sair da equipe')),
      t.open && !d.locked ? vagas : null);
  }

  function requestsCard(d) {
    if (!d.requests.length) return null;
    return h('article.card', h('p.card__k', 'Pedidos e convites pendentes'),
      h('ul.list', d.requests.map((r) => h('li',
        h('div.list__main', h('b', r.person ? r.person.name : '?'), h('span', r.kind === 'request' ? 'Quer entrar · ' + skillsLine(r.person && r.person.skills) : 'Convidada pela equipe · aguardando resposta')),
        r.kind === 'request' ? h('div.row',
          h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/invites/' + r.id, { method: 'POST', body: { accept: true } }), 'Aceito.') }, 'Aceitar'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => act(() => api('/hack/api/team/invites/' + r.id, { method: 'POST', body: { accept: false } })) }, 'Recusar')) : null))));
  }

  async function render(container) {
    box = container;
    let d;
    try { d = await api('/hack/api/team'); } catch (e) { if (e.status !== 401) toast(e.message, true); return; }
    const out = [];
    if (d.team) {
      out.push(teamCard(d), requestsCard(d));
      if (d.team.open && !d.locked) out.push(await discoverCard(d, true));
    } else {
      out.push(startCard(d), invitesCard(d));
      if (d.canDiscover && !d.locked) out.push(profileCard(d), await discoverCard(d, false));
    }
    clear(box).append(...out.filter(Boolean));
  }

  window.HackTeam = { render, meId: null };
})();
