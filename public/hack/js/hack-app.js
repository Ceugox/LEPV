/* Base das telas de uso do hackathon: API, construção de DOM sem innerHTML,
   abas por hash, datas no fuso de Brasília e avisos flutuantes.
   Exposto como window.Hack. */
(function () {
  'use strict';

  const TZ = 'America/Sao_Paulo';

  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined && !(opts.body instanceof FormData) && !(opts.body instanceof Blob)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    } else if (opts.body !== undefined) {
      init.body = opts.body;
      if (opts.contentType) init.headers['Content-Type'] = opts.contentType;
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      const err = new Error('Sem conexão. Confira a internet e tente de novo.');
      err.offline = true;
      throw err;
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json().catch(() => null);
    if (res.status === 401 && !opts.allow401) {
      location.href = '/hack/acesso';
      const err = new Error('Sessão expirada.');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error((data && data.message) || 'Algo deu errado (' + res.status + ').');
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data;
  }

  // h('div.card#id', { attrs }, children...) — texto sempre por textContent.
  function h(tag, attrs) {
    const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(tag);
    const el = document.createElement(m ? m[1] : 'div');
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
    }
    let kids = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'required') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  // Esvazia e preenche, ignorando null/false (Element.append escreveria "null").
  function fill(el) { clear(el); append(el, Array.prototype.slice.call(arguments, 1)); return el; }

  let toastTimer;
  function toast(msg, isErr) {
    let t = document.querySelector('.toast');
    if (!t) { t = h('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle('toast--err', !!isErr);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
  }

  // Datas: sempre no fuso do evento, independente do aparelho.
  const fmt = (opts) => new Intl.DateTimeFormat('pt-BR', Object.assign({ timeZone: TZ }, opts));
  const fDayTime = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
  const fDay = fmt({ weekday: 'long', day: '2-digit', month: '2-digit' });
  function dayTime(iso) { return iso ? fDayTime.format(new Date(iso)) : ''; }
  function time(iso) { return iso ? fTime.format(new Date(iso)) : ''; }
  function dayLabel(ymd) { return fDay.format(new Date(ymd + 'T12:00:00-03:00')); }
  // "2026-10-31" + "13:00" → instante absoluto (o evento é todo em -03:00).
  function at(day, hm) { return new Date(day + 'T' + hm + ':00-03:00'); }
  // "08:00" → "8h", "16:30" → "16h30".
  function hm(s) {
    if (!s) return '';
    const [H, M] = s.split(':');
    return Number(H) + 'h' + (M && M !== '00' ? M : '');
  }

  // Abas por hash: <button class="tab" data-tab="x"> + <section class="panel" data-panel="x">.
  function tabs(onShow) {
    const btns = Array.from(document.querySelectorAll('.tab[data-tab]'));
    function show(name, push) {
      const visible = btns.filter((b) => !b.hidden);
      const target = visible.find((b) => b.dataset.tab === name) || visible[0];
      if (!target) return;
      name = target.dataset.tab;
      btns.forEach((b) => b.setAttribute('aria-selected', String(b === target)));
      document.querySelectorAll('.panel[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (push) history.replaceState(null, '', '#' + name);
      if (onShow) onShow(name);
    }
    btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab, true)));
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    return { show: (n) => show(n || location.hash.slice(1)) };
  }

  // Só sai de verdade se o servidor encerrou a sessão: num aparelho
  // compartilhado, "Sair" que falhou em silêncio deixaria a conta aberta.
  async function logout() {
    // Notificações deste aparelho não seguem para a próxima pessoa que usar:
    // o servidor apaga a inscrição pelo endpoint e o navegador cancela a dele.
    let endpoint = '';
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/hack/') : null;
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
      }
    } catch (e) { /* sem push neste aparelho */ }
    try { await api('/hack/api/access/logout', { method: 'POST', allow401: true, body: { endpoint } }); }
    catch (e) { toast('Não foi possível sair: ' + e.message, true); return; }
    try {
      // Dados locais do credenciamento e do portal não sobrevivem à troca de pessoa.
      Object.keys(localStorage).filter((k) => k.indexOf('hack:') === 0).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* armazenamento bloqueado */ }
    if (window.HackOffline && window.HackOffline.wipe) { try { await window.HackOffline.wipe(); } catch (e) { /* segue */ } }
    location.href = '/hack/';
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copiado.'); }
    catch (e) { toast('Não deu para copiar. Selecione e copie à mão.', true); }
  }

  // PWA: worker próprio com escopo /hack/ (o da raiz deixa /hack de fora).
  if ('serviceWorker' in navigator && location.pathname.indexOf('/hack/') === 0) {
    navigator.serviceWorker.register('/hack/sw.js', { scope: '/hack/' }).catch(() => {});
  }

  window.Hack = { api, h, clear, fill, toast, dayTime, time, dayLabel, at, hm, tabs, logout, copy, TZ };
})();
