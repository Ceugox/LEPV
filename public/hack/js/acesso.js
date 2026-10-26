/* Entrada por e-mail e senha, por link pessoal (#t=...) e pedido de novo
   link por e-mail. Depois de entrar pelo link, quem ainda não tem senha vê
   "Crie sua senha" (com "Agora não"). */
(function () {
  'use strict';
  const { api } = window.Hack;
  const $ = (id) => document.getElementById(id);
  const VIEWS = ['entrar', 'pedir', 'entrando', 'senha'];

  function show(view) {
    VIEWS.forEach((v) => { $(v).hidden = v !== view; });
    $('inscricao-nota').hidden = !(view === 'entrar' || view === 'pedir');
    const first = $(view).querySelector('input');
    if (first && view !== 'entrando') first.focus();
  }

  function fail(id, msg, input) {
    $(id).textContent = msg;
    $(id).hidden = false;
    if (input) input.focus();
  }

  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token) {
    // O token sai da barra de endereço antes de qualquer coisa: não fica no
    // histórico nem num print da tela.
    history.replaceState(null, '', location.pathname);
    show('entrando');
    api('/hack/api/access/consume', { method: 'POST', body: { token }, allow401: true })
      .then((r) => {
        if (r.needsPassword) show('senha');
        else location.replace(r.redirect || '/hack/portal');
      })
      .catch((e) => {
        show('pedir');
        fail('erro-link', e.message);
      });
  } else {
    if (location.hash === '#link') show('pedir');
    // Já conectado? Vai direto ao portal. (/session responde 200 sempre: um
    // 401 aqui sujaria o console de quem só veio entrar.)
    api('/hack/api/session').then((r) => { if (r.authenticated) location.replace('/hack/portal'); }).catch(() => {});
  }

  $('ir-link').addEventListener('click', (ev) => {
    ev.preventDefault();
    // Leva o e-mail já digitado.
    $('form-pedir').email.value = $('form-entrar').email.value.trim();
    show('pedir');
  });
  $('ir-senha').addEventListener('click', (ev) => {
    ev.preventDefault();
    show('entrar');
  });

  $('form-entrar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('button');
    const email = f.email.value.trim();
    $('erro-entrar').hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('erro-entrar', 'Informe um e-mail válido.', f.email);
    if (!f.password.value) return fail('erro-entrar', 'Informe a senha.', f.password);
    btn.disabled = true;
    try {
      const r = await api('/hack/api/access/login', { method: 'POST', body: { email, password: f.password.value }, allow401: true });
      location.replace(r.redirect || '/hack/portal');
    } catch (e) {
      f.password.value = '';
      fail('erro-entrar', e.message, f.password);
      btn.disabled = false;
    }
  });

  $('form-senha').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('button');
    $('erro-senha').hidden = true;
    if (f.password.value.length < 8) return fail('erro-senha', 'A senha precisa ter pelo menos 8 caracteres.', f.password);
    if (f.password.value !== f.confirm.value) return fail('erro-senha', 'As duas senhas não são iguais.', f.confirm);
    btn.disabled = true;
    try {
      await api('/hack/api/me/password', { method: 'POST', body: { password: f.password.value } });
      location.replace('/hack/portal');
    } catch (e) {
      fail('erro-senha', e.message, f.password);
      btn.disabled = false;
    }
  });

  $('form-pedir').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    const email = ev.target.email.value.trim();
    $('erro-link').hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('erro-link', 'Informe um e-mail válido.', ev.target.email);
    btn.disabled = true;
    try {
      const r = await api('/hack/api/access/request', { method: 'POST', body: { email }, allow401: true });
      $('pedir-ok').textContent = r.message;
      $('pedir-ok').hidden = false;
      ev.target.hidden = true;
    } catch (e) {
      fail('erro-link', e.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
