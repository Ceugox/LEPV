/* Entrada por link pessoal (#t=...) e pedido de novo link por e-mail. */
(function () {
  'use strict';
  const { api } = window.Hack;
  const $ = (id) => document.getElementById(id);

  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token) {
    // O token sai da barra de endereço antes de qualquer coisa: não fica no
    // histórico nem num print da tela.
    history.replaceState(null, '', location.pathname);
    $('pedir').hidden = true;
    $('entrando').hidden = false;
    api('/hack/api/access/consume', { method: 'POST', body: { token }, allow401: true })
      .then((r) => { location.replace(r.redirect || '/hack/portal'); })
      .catch((e) => {
        $('entrando').hidden = true;
        $('pedir').hidden = false;
        const el = $('erro-link');
        el.textContent = e.message;
        el.hidden = false;
      });
  } else {
    // Já conectado? Vai direto ao portal. (/session responde 200 sempre: um
    // 401 aqui sujaria o console de quem só veio pedir o link.)
    api('/hack/api/session').then((r) => { if (r.authenticated) location.replace('/hack/portal'); }).catch(() => {});
  }

  $('form-pedir').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    const email = ev.target.email.value.trim();
    $('erro-link').hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      $('erro-link').textContent = 'Informe um e-mail válido.';
      $('erro-link').hidden = false;
      ev.target.email.focus();
      return;
    }
    btn.disabled = true;
    try {
      const r = await api('/hack/api/access/request', { method: 'POST', body: { email }, allow401: true });
      $('pedir-ok').textContent = r.message;
      $('pedir-ok').hidden = false;
      ev.target.hidden = true;
    } catch (e) {
      $('erro-link').textContent = e.message;
      $('erro-link').hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
})();
