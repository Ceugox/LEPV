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
      h('label.field', h('span', 'Descrição (até 500 caracteres)'), h('textarea', { name: 'description', maxlength: 500, disabled: !editable }, sub.description)),
      editable ? h('button.btn.btn--red.btn--sm', { type: 'submit' }, 'Salvar entrega') : null);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await api('/hack/api/team/submission', { method: 'PUT', body: { projectName: f.projectName.value, repoUrl: f.repoUrl.value, videoUrl: f.videoUrl.value, description: f.description.value } });
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
    if (!d.teams.length) out.push(h('p.empty', 'Nenhuma equipe com entrega completa ainda.'));
    d.teams.forEach((t) => out.push(teamCard(d, t, box)));
    clear(box).append(...out);
  }

  function teamCard(d, t, box) {
    const links = h('p.small',
      t.repoUrl ? h('a', { href: t.repoUrl, target: '_blank', rel: 'noopener' }, 'Repositório ↗') : null, ' ',
      t.videoUrl ? h('a', { href: t.videoUrl, target: '_blank', rel: 'noopener' }, ' · Vídeo/demo ↗') : null, ' ',
      t.slides ? h('a', { href: t.slides.url, target: '_blank', rel: 'noopener' }, ' · Slides (PDF) ↗') : null);
    const conflictBtn = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
      try { await api('/hack/api/judge/conflicts/' + t.team.id, { method: 'POST', body: { conflict: !t.conflict } }); renderJudge(box); }
      catch (e) { toast(e.message, true); }
    } }, t.conflict ? 'Retirar impedimento' : 'Estou impedido(a)');
    const card = h('article.card',
      h('div.row', { style: 'margin-bottom:8px' },
        t.conflict ? h('span.badge.badge--err', 'Impedido(a)') : t.myScore ? h('span.badge.badge--ok', 'Avaliada') : h('span.badge.badge--warn', 'Pendente'),
        h('span.muted.small', t.team.size + ' pessoas')),
      h('h3.card__title', (t.projectName || t.team.name) + (t.projectName ? ' · ' + t.team.name : '')),
      t.description ? h('p', t.description) : null,
      links);
    if (!t.conflict && d.open && d.criteria.length) {
      const vals = (t.myScore && t.myScore.values) || {};
      const form = h('form.form',
        d.criteria.map((c) => h('label.field',
          h('span', c.name + ' (1 a ' + c.scaleMax + (c.weight !== 1 ? ', peso ' + c.weight : '') + ')'),
          c.description ? h('small', c.description) : null,
          h('select', { name: c.id, required: true },
            h('option', { value: '' }, '—'),
            Array.from({ length: c.scaleMax }, (_, i) => h('option', { value: i + 1, selected: vals[c.id] === i + 1 }, String(i + 1)))))),
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
