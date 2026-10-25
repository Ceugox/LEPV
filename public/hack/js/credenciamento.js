/* Credenciamento no celular: câmera (BarcodeDetector ou jsQR), busca manual,
   e modo offline com fila local. Online, o servidor decide. Offline, o
   aparelho decide com a cópia preparada e mostra "sincronização pendente"
   — nunca um sucesso definitivo antes do servidor confirmar. */
(function () {
  'use strict';
  const { api, h, clear, fill, toast, time, dayLabel } = window.Hack;
  const OFF = window.HackOffline;
  const $ = (id) => document.getElementById(id);
  const PREFIX = 'LEPVHACK1:';
  const ROLE = { participant: 'Participante', judge: 'Jurado(a)', staff: 'Staff', sponsor: 'Patrocinador', supporter: 'Apoiador' };
  let me = null;
  let setup = null; // { personId, deviceId, deviceToken, expiresAt, snapshot }
  let otherOwner = false; // a fila guardada é de outra pessoa da organização
  let expired = false; // autorização vencida: só envia o que já foi lido
  const history = [];

  // ---------- resultado ----------
  function show(kind, title, lines) {
    const el = $('result');
    el.className = 'result result--' + kind;
    fill(el, h('h2', title), (lines || []).filter(Boolean).map((l) => h('p', l)));
    el.hidden = false;
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 60 : [80, 60, 80]);
  }
  function describe(person) {
    if (!person) return [];
    return [person.name, [person.roles.map((r) => ROLE[r] || r).join(', '), person.team ? 'Equipe ' + person.team : null].filter(Boolean).join(' · ')];
  }
  function remember(line) {
    history.unshift(line);
    history.length = Math.min(history.length, 15);
    fill($('hist'), history.map((x) => h('li', h('div.list__main', h('b', x.name || '—'), h('span', x.label)))));
  }

  // Presença confirmada online entra na cópia local: se a rede cair logo
  // depois, o mesmo QR não é aceito de novo offline.
  function rememberServerCheckin(r) {
    if (!setup || !r.person || !r.checkin) return;
    const c = { personId: r.person.id, day: r.checkin.day, at: r.checkin.at };
    if (!setup.snapshot.checkins.some((x) => x.personId === c.personId && x.day === c.day)) {
      setup.snapshot.checkins.push(c);
      OFF.set('setup', setup).catch(() => {});
    }
  }

  function showServer(r) {
    const name = r.person ? r.person.name : null;
    if (r.status === 'ok' || r.status === 'duplicate') rememberServerCheckin(r);
    if (r.status === 'ok') { show('ok', 'Entrada liberada', describe(r.person)); remember({ name, label: 'Entrou ' + time(r.checkin.at) }); }
    else if (r.status === 'duplicate') { show('dup', 'Já registrado', describe(r.person).concat('Entrada às ' + time(r.checkin.at) + (r.checkin.by ? ' por ' + r.checkin.by : ''))); remember({ name, label: 'Repetido' }); }
    else if (r.status === 'waitlist') { show('err', 'Lista de espera', describe(r.person).concat('Inscrição ainda não confirmada: fale com a diretoria.')); remember({ name, label: 'Lista de espera' }); }
    else if (r.status === 'blocked') { show('err', 'Acesso bloqueado', describe(r.person).concat('Fale com a diretoria.')); remember({ name, label: 'Bloqueado' }); }
    else { show('err', 'QR inválido', ['Não é um ingresso deste hackathon. Use a busca manual.']); remember({ name: null, label: 'QR inválido' }); }
    refreshStats();
  }

  // Num dia do evento o dia é sempre o de hoje (relógio de Brasília), mesmo
  // com a tela aberta desde ontem; fora do evento, o do seletor (ensaio).
  let dayLocked = false;
  // Relógio do servidor corrigido pela diferença do aparelho: celular com a
  // hora errada não registra o dia errado (medido no /status).
  let clockSkew = 0;
  const brtToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + clockSkew));
  const day = () => (dayLocked ? brtToday() : $('dia').value);
  // O que vai para o servidor: nada quando travado (ele usa o dia dele).
  const dayParam = () => (dayLocked ? undefined : day());

  // ---------- leitura (online com queda para offline) ----------
  async function handleCode(code) {
    try {
      const r = await api('/hack/api/checkin/scan', { method: 'POST', timeoutMs: 6000, body: { code, day: dayParam() } });
      showServer(r);
    } catch (e) {
      // Sem rede ou servidor fora (502/503/504): segue pela cópia do aparelho.
      const down = e.offline || (e.status >= 502 && e.status <= 504);
      if (down && setup && !otherOwner) return handleOffline(code);
      if (down) return show('err', 'Sem conexão com o servidor', ['Este aparelho não está preparado para offline. Use a busca manual quando a rede voltar ou outro aparelho.']);
      show('err', 'Erro', [e.message]);
    }
  }

  async function localCheckins() {
    const ops = await OFF.listOps();
    return { server: setup.snapshot.checkins, local: ops };
  }

  async function handleOffline(code) {
    try {
      await handleOfflineInner(code);
    } catch (e) {
      // IndexedDB ou crypto.subtle indisponível: diz o que fazer.
      show('err', 'Armazenamento offline indisponível', ['Não deu para guardar a leitura neste aparelho (' + (e.message || e) + '). Anote o nome e registre quando a rede voltar.']);
    }
  }

  // Pode ler offline? Devolve a mensagem de recusa, ou null.
  function offlineBlocked() {
    if (!setup) return 'Este aparelho não está preparado para offline.';
    if (otherOwner) return syncBlocked;
    if (expired || Date.parse(setup.expiresAt) <= Date.now()) return 'Autorização deste aparelho expirou. Conecte à internet e prepare de novo.';
    return null;
  }

  async function handleOfflineInner(code) {
    if (!code.startsWith(PREFIX)) return show('err', 'QR inválido', ['Não é um ingresso deste hackathon.']);
    const why = offlineBlocked();
    if (why) return show('err', 'Offline indisponível', [why]);
    const hsh = await OFF.sha256Hex(code.slice(PREFIX.length));
    const t = setup.snapshot.tickets.find((x) => x.h === hsh);
    if (!t) return show('err', 'QR desconhecido', ['Não está na cópia deste aparelho. Pode ser inscrição recente: sincronize quando a rede voltar.']);
    if (t.status !== 'valid') return show('err', t.status === 'waitlist' ? 'Lista de espera' : 'Acesso bloqueado', describe(t));
    const { server, local } = await localCheckins();
    const prev = server.find((c) => c.personId === t.id && c.day === day());
    if (prev) return show('dup', 'Já registrado', describe(t).concat('Entrada às ' + time(prev.at) + ' (cópia do aparelho)'));
    if (local.some((o) => o.personId === t.id && o.day === day())) return show('dup', 'Já lido neste aparelho', describe(t).concat('Aguardando sincronização.'));
    await OFF.addOp({ opId: OFF.newOpId(), h: hsh, personId: t.id, day: day(), at: new Date(Date.now() + clockSkew).toISOString() });
    show('pending', 'Registrado neste aparelho', describe(t).concat('Sincronização pendente — confirme quando a rede voltar.'));
    remember({ name: t.name, label: 'Pendente (offline)' });
    refreshPending();
  }

  // ---------- sincronização ----------
  // Sincronização. Cada resultado sai da fila (o servidor já decidiu), mas
  // só "ok" conta como sincronizado; recusas aparecem com nome e motivo.
  let syncing = false;
  let syncBlocked = ''; // motivo para parar a sincronização automática
  const REFUSED = { blocked: 'acesso bloqueado', waitlist: 'lista de espera', invalid: 'QR inválido', rejected: 'leitura inválida', undone: 'entrada desfeita pela organização' };
  async function sync(manual) {
    if (!setup || syncing || otherOwner) return;
    if (syncBlocked && !manual) return;
    let ops;
    try { ops = await OFF.listOps(); } catch (e) { toast('Não consegui ler as leituras guardadas neste aparelho.', true); return; }
    if (!ops.length) { if (manual) toast('Nada pendente.'); return; }
    syncing = true;
    try {
      // allow401: recusa do aparelho não pode virar redirecionamento em loop
      // para o login a cada 20s — a fila ficaria parada sem ninguém ver.
      // Em lotes: o servidor aceita corpo JSON de até 100 KB, e uma fila de
      // centenas de leituras numa requisição só viraria 413 para sempre.
      // Se um lote falhar no meio, o que os anteriores já trouxeram (inclusive
      // recusas) é processado e mostrado antes de tratar o erro.
      const r = { results: [] };
      let batchError = null;
      for (let i = 0; i < ops.length; i += 200) {
        try {
          const part = await api('/hack/api/checkin/sync', { method: 'POST', allow401: true, timeoutMs: 20000, body: {
            deviceId: setup.deviceId, deviceToken: setup.deviceToken,
            ops: ops.slice(i, i + 200).map((o) => ({ opId: o.opId, h: o.h, personId: o.personId, day: o.day, at: o.at })),
          } });
          await OFF.removeOps(part.results.map((x) => x.opId));
          r.results = r.results.concat(part.results);
        } catch (e) {
          batchError = e;
          break;
        }
      }
      if (!r.results.length && batchError) throw batchError;
      if (!batchError) syncBlocked = '';
      const ok = r.results.filter((x) => x.status === 'ok');
      const dups = r.results.filter((x) => x.status === 'duplicate');
      const refused = r.results.filter((x) => REFUSED[x.status]);
      r.results.filter((x) => x.checkin).forEach((x) => setup.snapshot.checkins.push({ personId: x.personId, day: x.checkin.day, at: x.checkin.at }));
      await OFF.set('setup', setup);
      if (refused.length) {
        // Quem entrou offline mas não podia: alerta inequívoco, com nome e o
        // motivo do servidor, guardado numa lista que a próxima leitura não apaga.
        const lines = refused.map((x) => (x.name || 'Pessoa desconhecida') + ' — ' + REFUSED[x.status] + (x.reason ? ' (' + x.reason + ')' : ''));
        show('err', refused.length + ' leitura(s) recusada(s)', lines);
        setup.refused = (setup.refused || []).concat(lines.map((l) => ({ line: l, at: new Date().toISOString() }))).slice(-50);
        await OFF.set('setup', setup);
        renderRefused();
      }
      toast(ok.length + ' sincronizada(s)' + (dups.length ? ' · ' + dups.length + ' já registrada(s) em outro aparelho' : '') + (refused.length ? ' · ' + refused.length + ' recusada(s)' : '') + '.', refused.length > 0);
      refreshStats();
      // O resto da fila (lote que falhou) segue o tratamento normal de erro.
      if (batchError) throw batchError;
    } catch (e) {
      if (e.offline) { if (manual) toast('Ainda sem internet.', true); }
      else if ((e.status === 401 || e.status === 403) && /^device_/.test(e.code || '')) {
        syncBlocked = e.message + ' As leituras continuam guardadas: prepare o aparelho de novo para enviá-las.';
        show('err', 'Aparelho sem autorização', [syncBlocked]);
      } else if (e.status === 401) {
        syncBlocked = 'Sua sessão expirou: entre de novo (as leituras continuam guardadas).';
        show('err', 'Sessão expirada', [syncBlocked]);
      } else toast(e.message, true);
    } finally {
      syncing = false;
      refreshPending();
    }
  }

  function renderRefused() {
    const list = (setup && setup.refused) || [];
    $('refused-card').hidden = !list.length;
    fill($('refused'), list.slice().reverse().map((x) => h('li', h('div.list__main', h('b', x.line), h('span', time(x.at))))));
  }

  async function refreshPending() {
    const n = await OFF.pendingCount();
    const what = n === null ? 'Não consegui ler a fila deste aparelho.' : n ? n + ' leitura(s) aguardando sincronização.' : 'Nada pendente.';
    $('pend').textContent = setup ? what + ' Autorização até ' + window.Hack.dayTime(setup.expiresAt) + '.' + (syncBlocked ? ' ' + syncBlocked : '') : '';
    $('sync').hidden = !setup;
  }

  $('prep').addEventListener('click', async () => {
    if (otherOwner) { toast('Há leituras de outra pessoa guardadas aqui: ela precisa sincronizar antes.', true); return; }
    try {
      // Já preparado: só atualiza a cópia, com a mesma credencial. Aparelho
      // novo só na primeira vez ou se a autorização antiga não vale mais.
      if (setup && !syncBlocked) {
        try {
          const snap = await api('/hack/api/checkin/snapshot', { method: 'POST', allow401: true, body: { deviceId: setup.deviceId, deviceToken: setup.deviceToken } });
          setup.snapshot = snap.snapshot;
          await OFF.set('setup', setup);
          $('off-msg').textContent = 'Cópia atualizada: ' + snap.snapshot.tickets.length + ' ingressos.';
          toast('Cópia atualizada.');
          refreshPending();
          return;
        } catch (e) {
          if (!(e.status === 401 && /^device_/.test(e.code || ''))) throw e;
        }
      }
      const r = await api('/hack/api/checkin/prepare', { method: 'POST', body: { label: navigator.userAgent.slice(0, 60) } });
      // Fila antiga (aparelho vencido) sobe antes de trocar de credencial.
      if (expired) await sync(true);
      setup = { personId: r.operatorId, deviceId: r.deviceId, deviceToken: r.deviceToken, expiresAt: r.expiresAt, snapshot: r.snapshot };
      syncBlocked = '';
      expired = false;
      await OFF.set('setup', setup);
      $('off-msg').textContent = 'Aparelho preparado: ' + r.snapshot.tickets.length + ' ingressos na cópia local.';
      $('prep').textContent = 'Atualizar cópia';
      toast('Pronto para offline.');
      refreshPending();
    } catch (e) { toast(e.message, true); }
  });
  $('sync').addEventListener('click', () => sync(true));
  window.addEventListener('online', () => { setNet(); sync(false); });
  window.addEventListener('offline', setNet);
  setInterval(() => { if (navigator.onLine) sync(false); }, 20000);

  function setNet() {
    const on = navigator.onLine;
    const b = $('net');
    b.textContent = on ? 'Online' : 'Offline';
    b.className = 'badge ' + (on ? 'badge--ok' : 'badge--warn');
  }

  // ---------- câmera ----------
  let stream = null;
  let detector = null;
  let lastCode = '';
  let lastAt = 0;
  let busy = false;

  async function startCam() {
    $('cam-msg').textContent = '';
    try {
      // Câmera só depois do toque explícito no botão.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      $('cam-msg').textContent = 'Câmera indisponível ou negada. Use a busca manual.';
      return;
    }
    const v = $('video');
    v.srcObject = stream;
    await v.play().catch(() => {});
    $('scanner').hidden = false;
    $('cam-on').hidden = true;
    $('cam-off').hidden = false;
    if ('BarcodeDetector' in window) {
      try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    }
    if (!detector && !window.jsQR) $('cam-msg').textContent = 'Este navegador não decodifica QR. Use a busca manual.';
    loop();
  }
  function stopCam() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $('scanner').hidden = true;
    $('cam-on').hidden = false;
    $('cam-off').hidden = true;
  }
  async function decodeFrame(v) {
    if (detector) {
      try {
        const codes = await detector.detect(v);
        return codes.length ? codes[0].rawValue : null;
      } catch (e) {
        // Detector nativo quebrado neste aparelho: passa a usar o jsQR.
        detector = null;
        if (!window.jsQR) $('cam-msg').textContent = 'Este navegador não decodifica QR. Use a busca manual.';
      }
    }
    if (!window.jsQR || !v.videoWidth) return null;
    const c = $('canvas');
    const w = 480;
    const hgt = Math.round((v.videoHeight / v.videoWidth) * w);
    c.width = w;
    c.height = hgt;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, w, hgt);
    const img = g.getImageData(0, 0, w, hgt);
    const r = window.jsQR(img.data, w, hgt, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }
  async function loop() {
    if (!stream) return;
    try {
      if (!busy) {
        const code = await decodeFrame($('video'));
        // A mesma pessoa diante da câmera não vira dez leituras.
        if (code && !(code === lastCode && Date.now() - lastAt < 4000)) {
          lastCode = code;
          lastAt = Date.now();
          busy = true;
          try {
            await handleCode(code);
          } catch (e) {
            show('err', 'Erro na leitura', [e.message || 'Falha inesperada. Use a busca manual.']);
          } finally {
            setTimeout(() => { busy = false; }, 1200);
          }
        }
      }
    } catch (e) {
      $('cam-msg').textContent = 'Falha ao decodificar a imagem: ' + (e.message || e);
    } finally {
      // Nunca deixa de agendar a próxima volta: câmera parada em silêncio é o pior caso.
      setTimeout(loop, 180);
    }
  }
  $('cam-on').addEventListener('click', startCam);
  $('cam-off').addEventListener('click', stopCam);

  // ---------- busca manual ----------
  let searchTimer;
  $('busca').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  });
  $('form-busca').addEventListener('submit', (ev) => { ev.preventDefault(); runSearch(); });

  async function runSearch() {
    const q = $('busca').value.trim();
    const list = clear($('busca-res'));
    if (q.length < 2) return;
    let people;
    try {
      people = (await api('/hack/api/checkin/search?q=' + encodeURIComponent(q) + (dayLocked ? '' : '&day=' + day()), { timeoutMs: 6000 })).people;
    } catch (e) {
      const down = e.offline || (e.status >= 502 && e.status <= 504);
      if (!(down && setup && !otherOwner)) { toast(e.message, true); return; }
      const s = q.toLowerCase();
      people = setup.snapshot.tickets.filter((t) => t.name.toLowerCase().includes(s)).slice(0, 20)
        .map((t) => Object.assign({}, t, { offline: true }));
    }
    if (!people.length) list.appendChild(h('li', h('p.muted', 'Ninguém encontrado.')));
    people.forEach((p) => list.appendChild(h('li',
      h('div.list__main', h('b', p.name), h('span', [p.roles.map((r) => ROLE[r] || r).join(', '), p.team ? 'Equipe ' + p.team : null, p.checkin ? 'Entrou ' + time(p.checkin.at) : null].filter(Boolean).join(' · '))),
      p.checkin ? h('span.badge.badge--ok', 'Já entrou')
        : h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => admitManual(p) }, 'Registrar entrada'))));
  }

  async function admitManual(p) {
    try {
      const r = await api('/hack/api/checkin/person/' + p.id, { method: 'POST', timeoutMs: 6000, body: { day: dayParam() } });
      showServer(r);
      runSearch();
    } catch (e) {
      const down = e.offline || (e.status >= 502 && e.status <= 504);
      if (!(down && setup && !otherOwner)) { toast(e.message, true); return; }
      try {
        const why = offlineBlocked();
        if (why) return show('err', 'Offline indisponível', [why]);
        const t = setup.snapshot.tickets.find((x) => x.id === p.id);
        if (!t || t.status !== 'valid') return show('err', 'Não liberado', describe(t));
        const { server, local } = await localCheckins();
        if (server.some((c) => c.personId === t.id && c.day === day()) || local.some((o) => o.personId === t.id && o.day === day())) {
          return show('dup', 'Já registrado', describe(t));
        }
        await OFF.addOp({ opId: OFF.newOpId(), personId: t.id, h: t.h, day: day(), at: new Date(Date.now() + clockSkew).toISOString() });
        show('pending', 'Registrado neste aparelho', describe(t).concat('Sincronização pendente.'));
        remember({ name: t.name, label: 'Pendente (offline)' });
        refreshPending();
      } catch (err) {
        show('err', 'Armazenamento offline indisponível', ['Não deu para guardar a entrada de ' + p.name + ' (' + (err.message || err) + '). Anote e registre quando a rede voltar.']);
      }
    }
  }

  // ---------- estado ----------
  async function refreshStats() {
    try {
      const r = await api('/hack/api/checkin/status');
      const st = r.stats.find((x) => x.day === day());
      $('stats').textContent = st ? st.participants + ' de ' + st.expected + ' participantes · ' + st.total + ' entradas no total' : '';
    } catch (e) { /* offline: mantém o último */ }
  }

  // Sair: Hack.logout já pede confirmação se houver leitura não sincronizada.
  $('sair').addEventListener('click', () => window.Hack.logout());

  (async function init() {
    setNet();
    try {
      const r = await api('/hack/api/me');
      me = r.me;
      if (!r.perms.checkin) { location.replace('/hack/portal'); return; }
    } catch (e) {
      if (e.status === 401) return;
      // Sem rede ao abrir: segue com o aparelho preparado, se houver.
    }
    try {
      setup = await OFF.get('setup');
    } catch (e) {
      setup = null;
      $('off-msg').textContent = 'Não consegui ler a cópia offline deste aparelho (' + (e.message || e) + '). Prepare de novo com internet.';
    }
    // Leituras ainda não enviadas NUNCA são apagadas ao abrir a tela.
    const pending = setup ? await OFF.pendingCount() : 0;
    if (setup && me && setup.personId !== me.id) {
      if (pending === 0) {
        // Cópia de outra pessoa, sem nada pendente: some.
        if (!(await OFF.wipe())) $('off-msg').textContent = 'Não consegui apagar a cópia offline anterior (feche outras abas do portal e recarregue).';
        setup = null;
      } else {
        // Fila de outra pessoa: só ela consegue enviar. Fica guardada e o
        // offline deste aparelho fica desligado até lá.
        otherOwner = true;
        syncBlocked = 'Este aparelho tem ' + (pending === null ? 'leituras' : pending + ' leitura(s)') + ' de outra pessoa da organização ainda não sincronizada(s). Ela precisa entrar aqui e sincronizar.';
        show('err', 'Leituras pendentes de outra pessoa', [syncBlocked]);
      }
    } else if (setup && Date.parse(setup.expiresAt) <= Date.now()) {
      // Vencido: a fila ainda sobe (o servidor aceita o que foi lido antes do
      // vencimento); novas leituras offline exigem preparar de novo.
      expired = true;
      if (pending === 0) {
        if (!(await OFF.wipe())) $('off-msg').textContent = 'Não consegui apagar a cópia vencida (feche outras abas do portal e recarregue).';
        setup = null;
      }
    }
    let days = ['2026-10-30', '2026-10-31'];
    // Offline: o dia sai do relógio do aparelho corrigido pela última diferença
    // medida com o servidor, no fuso de Brasília.
    try { clockSkew = Number(await OFF.get('clockSkew')) || 0; } catch (e) { clockSkew = 0; }
    const localToday = brtToday();
    let def = days.includes(localToday) ? localToday : days[0];
    let locked = days.includes(localToday);
    try {
      const st = await api('/hack/api/checkin/status');
      days = st.days;
      def = st.defaultDay;
      locked = st.dayLocked;
      clockSkew = Date.parse(st.now) - Date.now();
      try { await OFF.set('clockSkew', clockSkew); } catch (e) { /* segue sem guardar */ }
    } catch (e) { /* offline */ }
    fill($('dia'), days.map((d) => h('option', { value: d, selected: d === def }, dayLabel(d))));
    // No dia do evento não se escolhe dia: é o de hoje (o servidor também impõe).
    $('dia').disabled = locked;
    dayLocked = locked;
    // Tela aberta de um dia para o outro: o seletor acompanha o relógio.
    setInterval(() => {
      const t = brtToday();
      if (days.includes(t) && $('dia').value !== t) {
        $('dia').value = t;
        dayLocked = true;
        $('dia').disabled = true;
        refreshStats();
      }
    }, 60000);
    renderRefused();
    $('dia').addEventListener('change', refreshStats);
    if (setup) {
      $('off-msg').textContent = 'Aparelho preparado: ' + setup.snapshot.tickets.length + ' ingressos na cópia local.';
      $('prep').textContent = 'Atualizar cópia';
    }
    refreshPending();
    refreshStats();
    if (setup && navigator.onLine) sync(false);
  })();
})();
