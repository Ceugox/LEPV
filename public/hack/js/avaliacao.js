/* Avaliação em rodadas: a seleção e os textos locais não são trocados pelo polling. */
(function () {
  'use strict';
  const { h, clear, toast } = window.Hack;
  const $ = (id) => document.getElementById(id);
  const base = '/hack/api';
  const state = { perms: {}, live: null, admin: null, selected: null, details: {}, local: {}, view: null, busy: false, loading: false, summaries: {} };
  async function api(path, options) {
    try { return await window.Hack.api(base + path, Object.assign({ allow401: true, timeoutMs: 15000 }, options)); }
    catch (err) { if (err.status === 401) location.href = '/hack/acesso#next=avaliacao'; throw err; }
  }
  const post = (path, body) => api(path, { method: 'POST', body });
  const put = (path, body) => api(path, { method: 'PUT', body });
  const pathRound = (id) => '/judge/live/rounds/' + encodeURIComponent(id);
  function error(err) { toast(err.message || 'Não foi possível concluir. Tente novamente.', true); }
  function show(view) {
    state.view = view;
    $('banca').hidden = view !== 'banca'; $('admin').hidden = view !== 'admin';
    document.querySelectorAll('#nav button').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.view === view)));
  }
  function nav() {
    const navEl = clear($('nav'));
    [['banca', 'Minha banca', state.perms.judge], ['admin', 'Organização', state.perms.manage]].forEach(([key, name, allowed]) => {
      if (allowed) navEl.append(h('button.tab', { type: 'button', dataset: { view: key }, 'aria-selected': String(key === state.view), onclick: () => show(key) }, name));
    });
  }
  function roundLabel(round) { return (round && round.team && (round.team.projectName || round.team.name)) || 'Equipe'; }
  function roundType(round) { return round.kind === 'pitch' ? 'Apresentação' : 'Entrega'; }
  function localFor(id, detail) {
    if (!state.local[id]) state.local[id] = { note: '', opId: null, values: Object.assign({}, detail.draft.values || {}), comment: detail.draft.comment || '', revision: detail.draft.revision, review: false, step: 0 };
    return state.local[id];
  }
  function link(label, url) {
    if (!url) return null;
    try { const parsed = new URL(url, location.origin); if (!['http:', 'https:'].includes(parsed.protocol)) return null; }
    catch (_) { return null; }
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label);
  }
  function drawLive() {
    const current = state.live && state.live.currentRound;
    clear($('live')).append(h('div.aval-live', h('div', h('strong', current ? 'Em avaliação agora: ' + roundLabel(current) : 'Aguardando a próxima equipe'),
      h('p', current ? roundType(current) + ' · ' + (current.team.name || '') : 'A organização abrirá a próxima rodada.')),
      current && state.selected && state.selected !== current.id ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => selectRound(current.id) }, 'Ir para equipe atual') : null));
    const box = clear($('rounds'));
    box.append(h('h2.aval-section-title', 'Rodadas'));
    const list = h('div.aval-rounds');
    (state.live.rounds || []).slice().reverse().forEach((round) => {
      const status = round.conflict ? 'Impedido' : round.pending ? 'Nota pendente' : round.scored ? 'Nota confirmada' : 'Sem nota';
      list.append(h('button.aval-round', { type: 'button', 'aria-current': String(state.selected === round.id), onclick: () => selectRound(round.id) }, roundLabel(round), h('small', roundType(round) + ' · ' + status)));
    });
    if (!list.childNodes.length) box.append(h('p.muted', 'Nenhuma rodada disponível ainda.'));
    else box.append(list);
  }
  async function selectRound(id) {
    if (state.busy) return;
    state.selected = id; drawLive();
    if (!state.details[id]) {
      clear($('detail')).append(h('p.muted', 'Carregando equipe…'));
      try { state.details[id] = await api(pathRound(id)); }
      catch (err) { if (state.selected === id) clear($('detail')).append(h('p.aval-error', err.message)); return; }
    }
    if (state.selected === id) drawDetail();
  }
  function drawDetail() {
    const id = state.selected, detail = state.details[id];
    if (!detail) return;
    const local = localFor(id, detail), round = detail.round, team = round.team;
    const root = clear($('detail'));
    const project = h('article.card.aval-project', h('span.badge', roundType(round)), h('h2', team.projectName || team.name),
      team.projectName ? h('p', team.name) : null,
      h('div.aval-links', link('Repositório', team.repoUrl), link('Slides', team.slides && team.slides.url), link('Vídeo ou demonstração', team.videoUrl)));
    root.append(project);
    if (detail.conflict) { root.append(h('p.aval-error', 'Você está impedido de avaliar esta equipe.')); return; }
    const notes = h('article.card.aval-note-card', h('h3.card__title', 'Minhas observações'), h('p.muted.small', 'Privadas. Escreva durante a apresentação; você pode retornar a esta rodada.'));
    (detail.notes || []).forEach((n) => notes.append(h('div.aval-note', h('p', n.text), h('small', n.createdAt ? new Date(n.createdAt).toLocaleString('pt-BR') : ''))));
    const note = h('textarea', { rows: 3, maxlength: 3000, placeholder: 'Escreva uma observação', 'aria-label': 'Nova observação' }, local.note);
    note.addEventListener('input', () => { if (local.note !== note.value) local.opId = null; local.note = note.value; });
    const noteButton = h('button.btn.btn--red.btn--sm', { type: 'button' }, 'Salvar observação');
    noteButton.addEventListener('click', async () => {
      if (!local.note.trim() || state.busy) return;
      state.busy = true; noteButton.disabled = true; note.disabled = true;
      local.opId = local.opId || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      try { const result = await post(pathRound(id) + '/notes', { text: local.note.trim(), opId: local.opId }); local.note = ''; local.opId = null; state.details[id] = result; if (state.selected === id) drawDetail(); toast('Observação salva.'); }
      catch (err) { error(err); }
      finally { state.busy = false; noteButton.disabled = false; note.disabled = false; }
    });
    const summaryBox = h('div', { 'aria-live': 'polite' });
    state.summaries[id] = { box: summaryBox, revision: null };
    const summary = h('button.btn.btn--ghost.btn--sm', { type: 'button', disabled: !(detail.notes || []).length }, 'Organizar minhas observações');
    summary.addEventListener('click', async () => {
      summary.disabled = true;
      summaryBox.textContent = 'Organizando suas observações…';
      try {
        const result = await api(pathRound(id) + '/summary', { method: 'POST', body: {}, timeoutMs: 35000 });
        const latest = await api(pathRound(id));
        if (latest.notesRevision !== result.notesRevision) {
          summaryBox.textContent = 'As observações mudaram. Gere o resumo novamente.';
          return;
        }
        state.summaries[id].revision = result.notesRevision;
        clear(summaryBox).append(h('p.muted.small', 'Resumo das suas observações. Suas notas não foram alteradas.'), h('p.aval-note', result.summary));
      } catch (err) { summaryBox.textContent = 'Resumo indisponível: ' + err.message; }
      finally { summary.disabled = false; }
    });
    const notesWrite = h('fieldset.aval-write-group', { id: 'notes-write' }, note, h('div.aval-actions', noteButton));
    notes.append(notesWrite, h('div.aval-actions', summary), summaryBox); root.append(notes);
    const score = h('article.card.aval-score', h('h3.card__title', 'Notas da equipe'));
    const criteria = detail.criteria || [];
    if (!criteria.length) score.append(h('p.muted', 'Os critérios ainda não estão disponíveis.'));
    else {
      score.append(h('p.muted.small', 'Escolha uma nota para cada critério e revise antes de confirmar.'));
      const criterion = criteria[Math.min(local.step, criteria.length - 1)];
      if (!local.review) {
        score.append(h('p.aval-section-title', 'Critério ' + (local.step + 1) + ' de ' + criteria.length));
        const field = h('fieldset.aval-criterion', h('legend', criterion.name), criterion.description ? h('p', criterion.description) : null);
        const options = h('div.aval-options');
        for (let n = 1; n <= criterion.scaleMax; n++) {
          const input = h('input', { type: 'radio', name: 'criterion-' + criterion.id, value: n, checked: Number(local.values[criterion.id]) === n });
          input.addEventListener('change', () => { local.values[criterion.id] = n; });
          options.append(h('label', input, h('span', String(n))));
        }
        field.append(options); score.append(field);
        const comment = h('textarea', { rows: 3, maxlength: 1000, placeholder: 'Comentário para a organização (opcional)', 'aria-label': 'Comentário para a organização' }, local.comment);
        comment.addEventListener('input', () => { local.comment = comment.value; });
        score.append(h('label.field', h('span', 'Comentário final'), comment));
        const prev = h('button.btn.btn--ghost.btn--sm', { type: 'button', disabled: local.step === 0, onclick: () => { local.step--; drawDetail(); } }, 'Anterior');
        const next = h('button.btn.btn--red.btn--sm', { type: 'button', onclick: () => {
          if (!local.values[criterion.id]) { toast('Selecione uma nota para este critério.', true); return; }
          if (local.step < criteria.length - 1) local.step++; else local.review = true;
          drawDetail();
        } }, local.step < criteria.length - 1 ? 'Próximo critério' : 'Revisar notas');
        const save = h('button.btn.btn--ghost.btn--sm', { type: 'button' }, 'Salvar rascunho');
        save.addEventListener('click', async () => {
          if (state.busy) return;
          state.busy = true; save.disabled = true;
          try {
            const saved = await put(pathRound(id) + '/draft', { values: local.values, comment: local.comment, revision: local.revision });
            local.revision = saved.draft.revision;
            toast('Rascunho salvo.');
          } catch (err) { error(err); }
          finally { state.busy = false; save.disabled = false; }
        });
        score.append(h('div.aval-actions', prev, next, save));
      } else {
        const missing = criteria.filter((c) => !local.values[c.id]);
        const list = h('dl'); criteria.forEach((c) => list.append(h('dt', c.name), h('dd', local.values[c.id] ? String(local.values[c.id]) + ' / ' + c.scaleMax : 'Pendente')));
        const review = h('div.aval-review', h('h4', 'Confira antes de confirmar'), list, h('p', local.comment || 'Sem comentário final.'));
        const edit = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { local.review = false; local.step = 0; drawDetail(); } }, 'Editar notas');
        const confirm = h('button.btn.btn--red.btn--sm', { type: 'button', disabled: !!missing.length || state.busy }, 'Confirmar avaliação');
        confirm.addEventListener('click', async () => {
          if (state.busy) return; state.busy = true; confirm.disabled = true;
          try {
            const saved = await put(pathRound(id) + '/draft', { values: local.values, comment: local.comment, revision: local.revision });
            local.revision = saved.draft.revision;
            await post(pathRound(id) + '/confirm', { revision: local.revision, confirm: true });
            toast('Avaliação confirmada.'); state.details[id] = await api(pathRound(id)); delete state.local[id]; if (state.selected === id) drawDetail();
          } catch (err) { error(err); }
          finally { state.busy = false; confirm.disabled = false; }
        });
        review.append(h('div.aval-actions', edit, confirm)); score.append(review);
      }
    }
    if (detail.score) score.append(h('p.aval-pending', 'Há uma avaliação confirmada. Alterações precisam ser confirmadas novamente.'));
    const scoreWrite = h('fieldset.aval-write-group', { id: 'score-write' }, score);
    root.append(h('p.aval-pending#write-status', { role: 'status' }), scoreWrite);
    updateWriteState();
  }
  function updateWriteState() {
    const detail = state.details[state.selected];
    if (!detail || !state.live || !$('notes-write') || !$('score-write')) return;
    const config = state.live.config;
    const blocked = !config.open || config.resultsLocked || detail.conflict;
    const phaseChanged = detail.round.phase !== config.phase;
    const pitchOpen = detail.round.kind === 'pitch' && detail.round.status === 'open';
    $('notes-write').disabled = blocked;
    $('score-write').disabled = blocked || phaseChanged || pitchOpen;
    $('write-status').textContent = detail.conflict ? 'Você está impedido de avaliar esta equipe. Os textos nesta tela foram mantidos.' : blocked ? 'Avaliação fechada ou resultado travado. Os textos nesta tela foram mantidos.' : phaseChanged ? 'Esta rodada pertence a outra fase. As notas ficam disponíveis para consulta.' : pitchOpen ? 'Durante o pitch, registre observações. As notas serão liberadas ao encerrar a apresentação.' : '';
  }
  function drawAdmin() {
    const data = state.admin, root = clear($('admin-content'));
    const current = data.currentRound;
    const header = h('article.card.card--red', h('h2.card__title', current ? 'Rodada em andamento' : 'Nenhuma rodada aberta'), h('p', current ? roundLabel(current) + ' · ' + roundType(current) : 'Selecione a próxima equipe para iniciar.'));
    if (current) header.append(h('button.btn.btn--red.btn--sm', { type: 'button', onclick: async (event) => { event.target.disabled = true; try { await post('/admin/live/rounds/' + encodeURIComponent(current.id) + '/close', {}); await poll(true); toast('Rodada encerrada.'); } catch (err) { error(err); } finally { event.target.disabled = false; } } }, 'Encerrar rodada'));
    else {
      const teams = h('select', { 'aria-label': 'Equipe' }, h('option', { value: '' }, 'Selecione a equipe'), (data.teams || []).map((t) => h('option', { value: t.id }, t.name)));
      const kind = data.config.phase === 'final' ? 'pitch' : 'delivery';
      const open = h('button.btn.btn--red.btn--sm', { type: 'button' }, 'Abrir rodada');
      open.addEventListener('click', async () => { if (!teams.value) { toast('Selecione uma equipe.', true); return; } open.disabled = true; try { await post('/admin/live/rounds', { teamId: teams.value, kind }); await poll(true); toast('Rodada aberta.'); } catch (err) { error(err); } finally { open.disabled = false; } });
      header.append(h('p.muted', kind === 'pitch' ? 'Fase final: apresentação.' : 'Fase inicial: entrega.'), h('div.aval-actions', teams, open));
    }
    root.append(header);
    root.append(h('p', h('a', { href: '/hack/organizacao#avaliacao' }, 'Abrir avaliação e configurar finalistas')));
    const pending = h('article.card', h('h2.card__title', 'Pendências dos jurados'));
    (data.judges || []).forEach((judge) => pending.append(h('p', h('strong', judge.name), ': ', judge.pending.length ? judge.pending.length + ' rodada(s) pendente(s)' : 'sem pendências')));
    if (!(data.judges || []).length) pending.append(h('p.muted', 'Nenhum jurado cadastrado.'));
    root.append(h('div.aval-stack', pending));
  }
  async function poll(forceAdmin) {
    if (state.loading) return; state.loading = true;
    try {
      if (state.perms.judge) {
        state.live = await api('/judge/live'); drawLive();
        if (!state.selected && state.live.currentRound) await selectRound(state.live.currentRound.id);
        const selectedRound = state.live.rounds.find((r) => r.id === state.selected);
        if (selectedRound && state.details[state.selected]) {
          state.details[state.selected].round = selectedRound;
          state.details[state.selected].conflict = selectedRound.conflict;
        }
        updateWriteState();
        if (state.selected && state.summaries[state.selected] && state.summaries[state.selected].revision !== null) {
          const currentSummary = state.summaries[state.selected];
          const detail = await api(pathRound(state.selected));
          if (detail.notesRevision !== currentSummary.revision) {
            currentSummary.revision = null;
            currentSummary.box.textContent = 'As observações mudaram. Gere o resumo novamente.';
          }
        }
      }
      if (state.perms.manage) {
        state.admin = await api('/admin/live');
        if (forceAdmin || !$('admin').contains(document.activeElement)) drawAdmin();
      }
      $('status').textContent = '';
    } catch (err) { $('status').textContent = 'Atualização indisponível: ' + err.message + ' Seus textos nesta tela foram mantidos.'; }
    finally { state.loading = false; }
  }
  $('sair').addEventListener('click', () => window.Hack.logout());
  async function init() {
    try {
      const result = await api('/me'); state.perms = result.perms || {}; $('who').textContent = result.me.name;
      if (!state.perms.judge && !state.perms.manage) { $('status').textContent = 'Esta área é restrita à banca e à organização.'; return; }
      state.view = state.perms.judge ? 'banca' : 'admin'; nav(); show(state.view); await poll();
      setInterval(poll, 12000);
    } catch (err) { $('status').textContent = err.message; }
  }
  init();
})();

