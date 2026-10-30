/* Aba Entrega do portal (participantes) e aba Banca (jurados).
   Expostos como window.HackSubmission.render(el) e window.HackJudge.render(el). */
(function () {
  'use strict';
  const { api, h, clear, toast, dayTime } = window.Hack;

  // ---------- entrega ----------
  async function renderSubmission(box) {
    let d;
    try { d = await api('/hack/api/team/submission'); } catch (e) { if (e.status !== 401) toast(e.message, true); return; }
    const out = [];
    const sub = d.submission;
    const head = h('article.card.card--red',
      h('p.card__k', 'Prazo de entrega'),
      h('h3.card__title', dayTime(d.deadline)),
      h('p', d.open ? 'Até lá a equipe pode editar quantas vezes quiser. Depois, a entrega trava.' : 'O prazo passou: a entrega está travada. Erro no envio? Fale com a organização.'));
    out.push(head);
    if (!sub) {
      out.push(h('article.card', h('p.card__k', 'Entrega'), h('p', 'Entre numa equipe (aba Equipe) para entregar o projeto.')));
      clear(box).append(...out);
      return;
    }
    const st = sub.complete ? h('span.badge.badge--ok', 'Entrega completa') : h('span.badge.badge--warn', 'Falta repositório ou slides');
    const confirmed = sub.team.status === 'confirmed';
    const editable = d.open && confirmed;
    const form = h('form.form',
      h('label.field', h('span', 'Nome do projeto'), h('input', { name: 'projectName', value: sub.projectName, maxlength: 80, disabled: !editable })),
      h('label.field', h('span', 'Link do repositório (obrigatório)'), h('input', { name: 'repoUrl', type: 'url', value: sub.repoUrl, placeholder: 'https://github.com/...', disabled: !editable })),
      h('label.field', h('span', 'Link do vídeo ou demo (opcional)'), h('input', { name: 'videoUrl', type: 'url', value: sub.videoUrl, placeholder: 'https://...', disabled: !editable })),
      h('label.field', h('span', 'Link da solução no ar (opcional)'), h('input', { name: 'deployUrl', type: 'url', value: sub.deployUrl || '', placeholder: 'https://...', disabled: !editable })),
      h('p.small.muted', 'Na fase 1, o repositório é lido e pontuado em Tech por um agente de IA (se a solução roda, organização do código e como a equipe conduziu a IA). Com o link no ar, ele testa a solução por ali.'),
      h('label.field', h('span', 'Descrição (até 500 caracteres)'), h('textarea', { name: 'description', maxlength: 500, disabled: !editable }, sub.description)),
      editable ? h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar entrega') : null);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await api('/hack/api/team/submission', { method: 'PUT', body: { projectName: f.projectName.value, repoUrl: f.repoUrl.value, videoUrl: f.videoUrl.value, deployUrl: f.deployUrl.value, description: f.description.value } });
        toast('Entrega salva.');
        renderSubmission(box);
      } catch (e) { toast(e.message, true); }
    });

    const file = h('input', { type: 'file', accept: 'application/pdf', name: 'slides', disabled: !editable });
    const upload = h('form.form',
      h('label.field', h('span', 'Slides em PDF (obrigatório, até ' + d.maxSlidesMb + ' MB)'), file),
      sub.slides ? h('p.small', 'Enviado: ', h('a', { href: sub.slides.url, target: '_blank', rel: 'noopener' }, sub.slides.name), ' · ' + (sub.slides.size / 1048576).toFixed(1) + ' MB') : null,
      editable ? h('button.btn.btn--ghost.btn--sm', { type: 'submit' }, sub.slides ? 'Trocar PDF' : 'Enviar PDF') : null);
    upload.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = file.files[0];
      if (!f) { toast('Escolha o PDF.', true); return; }
      if (f.size > d.maxSlidesMb * 1048576) { toast('O PDF passa de ' + d.maxSlidesMb + ' MB.', true); return; }
      const btn = upload.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try {
        const res = await fetch('/hack/api/team/submission/slides', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(f.name).slice(0, 200) },
          body: f,
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { location.href = '/hack/acesso'; return; }
        if (!res.ok) throw new Error(data.message || 'Falha no envio (' + res.status + ').');
        toast('Slides enviados.');
        renderSubmission(box);
      } catch (e) {
        toast(e.message, true);
        btn.disabled = false;
        btn.textContent = 'Enviar PDF';
      }
    });

    out.push(h('article.card',
      h('div.row', { style: 'margin-bottom:8px' }, st, sub.updatedAt ? h('span.muted.small', 'Última edição ' + dayTime(sub.updatedAt) + (sub.updatedBy ? ' por ' + sub.updatedBy : '')) : null),
      h('h3.card__title', sub.team.name),
      !confirmed ? h('p', 'Confirme a equipe (2 a 4 pessoas, aba Equipe) para liberar a entrega.') : null,
      form));
    out.push(h('article.card', h('p.card__k', 'Apresentação'), upload));
    const res = await api('/hack/api/team/result').catch((e) => { if (e.status !== 401) toast('Resultado da fase 1 indisponível: ' + e.message, true); return null; });
    if (res && res.percentile) {
      out.unshift(h('article.card.card--red', h('p.card__k', 'Resultado da fase 1'),
        h('h3.card__title', 'Sua equipe ficou entre as ' + res.percentile.top + '% primeiras'),
        h('p.muted', 'Entre ' + res.percentile.teams + ' equipes avaliadas na fase 1. As finalistas apresentam agora.')));
    } else if (res && res.finalist) {
      out.unshift(h('article.card.card--red', h('p.card__k', 'Resultado da fase 1'), h('h3.card__title', 'Sua equipe está na final'), h('p.muted', 'Prepare o pitch.')));
    }
    clear(box).append(...out);
  }

  // ---------- banca ----------
  async function renderJudge(box) {
    let d;
    try { d = await api('/hack/api/judge'); } catch (e) { if (e.status !== 401) toast(e.message, true); return; }
    const out = [];
    const phase = d.phase === 'final' ? 'Final' : 'Avaliação';
    if (!d.visible) {
      out.push(h('article.card.card--red', h('p.card__k', 'Banca'), h('h3.card__title', 'Projetos depois do prazo'),
        h('p.muted', 'Os projetos aparecem aqui quando o prazo de entrega terminar ou a organização abrir a avaliação.')));
      clear(box).append(...out);
      return;
    }
    out.push(h('article.card.card--red',
      h('p.card__k', 'Banca · ' + phase),
      h('h3.card__title', d.open ? d.done + ' de ' + d.teams.length + ' equipes avaliadas' : d.resultsLocked ? 'Resultado travado' : 'Avaliação ainda não aberta'),
      h('p.muted', d.open
        ? 'Suas notas só aparecem para você e entram na média da organização. Pode revisar até a avaliação fechar.'
        : 'A organização abre a avaliação depois do prazo de entrega. Você já pode olhar os projetos e marcar impedimentos.')));
    if (d.open && d.criteriaLocked && !d.criteria.length) {
      out.push(h('article.card', h('p.card__k', 'Sem critérios para você'),
        h('p', 'Nesta fase você não tem critério para avaliar (os pilares marcados para você não têm critério). Fale com a organização se isso não estiver certo.')));
    }
    if (!d.teams.length) out.push(h('p.empty', 'Nenhuma equipe com entrega completa ainda.'));
    d.teams.forEach((t) => out.push(teamCard(d, t, box)));
    clear(box).append(...out);
  }

  const pillarLabel = (d, id) => ((d.pillars || []).find((p) => p.id === id) || {}).label || id;

  function teamCard(d, t, box) {
    const links = h('p.small',
      t.repoUrl ? h('a', { href: t.repoUrl, target: '_blank', rel: 'noopener' }, 'Repositório ↗') : null, ' ',
      t.videoUrl ? h('a', { href: t.videoUrl, target: '_blank', rel: 'noopener' }, ' · Vídeo/demo ↗') : null, ' ',
      t.deployUrl ? h('a', { href: t.deployUrl, target: '_blank', rel: 'noopener' }, ' · Solução no ar ↗') : null, ' ',
      t.slides ? h('a', { href: t.slides.url, target: '_blank', rel: 'noopener' }, ' · Slides (PDF) ↗') : null);
    const conflictBtn = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
      try { await api('/hack/api/judge/conflicts/' + t.team.id, { method: 'POST', body: { conflict: !t.conflict } }); renderJudge(box); }
      catch (e) { toast(e.message, true); }
    } }, t.conflict ? 'Retirar impedimento' : 'Estou impedido(a)');
    const card = h('article.card',
      h('div.row', { style: 'margin-bottom:8px' },
        t.conflict ? h('span.badge.badge--err', 'Impedido(a)') : t.myScore && t.myScore.complete ? h('span.badge.badge--ok', 'Avaliada') : h('span.badge.badge--warn', t.myScore ? 'Falta critério' : 'Pendente'),
        h('span.muted.small', t.team.size + ' pessoas')),
      h('h3.card__title', (t.projectName || t.team.name) + (t.projectName ? ' · ' + t.team.name : '')),
      t.description ? h('p', t.description) : null,
      links,
      t.summary ? h('details', h('summary', 'Resumo para a banca (sem nota)'), h('p', { style: 'white-space:pre-wrap' }, t.summary)) : null);
    if (!t.conflict && d.open && d.criteria.length) {
      const vals = (t.myScore && t.myScore.values) || {};
      const form = h('form.form',
        d.criteria.map((c) => h('label.field',
          h('span', (c.pillar ? pillarLabel(d, c.pillar) + ' · ' : '') + c.name + ' (1 a ' + c.scaleMax + (c.weight !== 1 ? ', peso ' + c.weight : '') + ')'),
          c.description ? h('small', c.description) : null,
          c.gate ? h('small', 'Trava: nota 1 aqui limita sua nota no pilar a 1,0. Só a nota 1 trava; 1,5 não.') : null,
          c.anchors && c.anchors.length ? h('small', c.anchors.map((a, i) => a ? (i + 1) + ' = ' + a : null).filter(Boolean).join(' · ')) : null,
          h('select', { name: c.id, required: true },
            h('option', { value: '' }, '—'),
            // De 0,5 em 0,5; âncora só nos inteiros.
            Array.from({ length: c.scaleMax * 2 - 1 }, (_, i) => {
              const n = 1 + i / 2;
              const anchor = Number.isInteger(n) && c.anchors && c.anchors[n - 1] ? ' · ' + c.anchors[n - 1] : '';
              return h('option', { value: n, selected: vals[c.id] === n }, String(n).replace('.', ',') + anchor);
            })))),
        h('label.field', h('span', 'Comentário (só a organização vê)'), h('textarea', { name: 'comment', maxlength: 1000 }, (t.myScore && t.myScore.comment) || '')),
        h('div.row', h('button.btn.btn--red.btn--sm', { type: 'submit' }, t.myScore ? 'Atualizar nota' : 'Salvar nota'), conflictBtn));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const values = {};
        d.criteria.forEach((c) => { values[c.id] = Number(f[c.id].value); });
        try { await api('/hack/api/judge/scores/' + t.team.id, { method: 'PUT', body: { values, comment: f.comment.value } }); toast('Nota salva.'); renderJudge(box); }
        catch (e) { toast(e.message, true); }
      });
      card.appendChild(form);
    } else if (!d.resultsLocked) {
      card.appendChild(h('div.row', conflictBtn));
    }
    return card;
  }

  window.HackSubmission = { render: renderSubmission };
  window.HackJudge = { render: renderJudge };
})();
