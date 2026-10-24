/* Formulário público de vínculo de parceiros: a lista de organizações
   depende da modalidade escolhida. Pedir não dá acesso: a diretoria aprova. */
(function () {
  'use strict';
  const { api, h, clear } = window.Hack;
  const $ = (id) => document.getElementById(id);
  const form = $('form-parceiro');
  let orgs = { sponsor: [], supporter: [] };

  function fillOrgs(kind) {
    const sel = clear($('org-select'));
    const list = orgs[kind] || [];
    sel.disabled = !list.length;
    sel.appendChild(h('option', { value: '' }, list.length ? 'Escolha a organização' : 'Nenhuma organização cadastrada nesta modalidade'));
    list.forEach((o) => sel.appendChild(h('option', { value: o.id }, o.name)));
  }

  api('/hack/api/partners/orgs', { allow401: true }).then((r) => {
    orgs = r;
    const k = form.querySelector('input[name=kind]:checked');
    if (k) fillOrgs(k.value);
  }).catch(() => {});

  form.addEventListener('change', (ev) => { if (ev.target.name === 'kind') fillOrgs(ev.target.value); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const err = $('parceiro-erro');
    err.hidden = true;
    const kind = (f.querySelector('input[name=kind]:checked') || {}).value;
    const show = (m) => { err.textContent = m; err.hidden = false; };
    if (!kind) return show('Escolha a modalidade.');
    if (!f.orgId.value) return show('Escolha a organização.');
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('/hack/api/partners/request', { method: 'POST', allow401: true, body: {
        kind, orgId: f.orgId.value, name: f.name.value, email: f.email.value, phone: f.phone.value, role: f.role.value, website: f.website.value,
      } });
      $('parceiro-ok').textContent = r.message;
      $('parceiro-ok').hidden = false;
      f.hidden = true;
    } catch (e) {
      show(e.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
