/* Evolução editorial das telas da liga. As ações continuam no app.js. */
const inicio = document.getElementById('panel-inicio');
const grid = document.getElementById('member-grid');
const eventos = document.getElementById('events-content');
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tipos = { reuniao: 'Reunião', aula: 'Aula', visita: 'Visita', social: 'Encontro', hackathon: 'Hackathon' };

function goToEvent(id) {
  document.getElementById('tab-eventos').click();
  if (!id) return;
  const findCard = () => eventos.querySelector(`[data-event="${CSS.escape(id)}"]`);
  const revealCard = () => {
    const card = findCard();
    if (!card) return false;
    card.tabIndex = -1;
    card.scrollIntoView({ block: 'center', behavior: 'instant' });
    card.focus({ preventScroll: true });
    return true;
  };
  if (revealCard()) return;
  const observer = new MutationObserver(() => {
    if (revealCard()) { observer.disconnect(); clearTimeout(timer); }
  });
  observer.observe(eventos, { childList: true, subtree: true });
  const timer = setTimeout(() => observer.disconnect(), 5000);
}

const desk = document.createElement('header');
desk.className = 'page-head portal-desk';
desk.innerHTML = '<div><p class="page-kicker">A vida da liga</p><h2 class="page-title" id="portal-greeting">Seu ponto de encontro.</h2><p class="page-sub">Próximas atividades, avisos e as pessoas que constroem a LEPV.</p></div><p class="portal-desk-date"></p>';
desk.querySelector('.portal-desk-date').textContent = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());
inicio.prepend(desk);
const nextBox = document.createElement('section');
nextBox.className = 'portal-next';
nextBox.setAttribute('aria-label', 'Próxima atividade');
nextBox.innerHTML = '<div class="portal-next-copy"><p class="portal-overline">Próximo encontro</p><h2>Consultando a agenda…</h2></div>';
desk.after(nextBox);
const mural = document.getElementById('mural-card');
const muralAdmin = document.getElementById('mural-admin');
nextBox.after(mural);
mural.after(muralAdmin);

async function loadNext() {
  try {
    const response = await fetch('/api/events');
    if (!response.ok) throw new Error('events');
    const data = await response.json();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const next = (data.events || []).filter(ev => ev.date && ev.date >= today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0];
    if (!next) {
      nextBox.innerHTML = '<div class="portal-next-copy"><p class="portal-overline">A agenda da liga</p><h2>O próximo encontro começa aqui.</h2><p class="portal-next-details">Assim que uma atividade for publicada, você encontra aqui a data, o local e sua inscrição.</p><button class="portal-action" type="button">Ver os eventos da liga →</button></div><img class="portal-next-photo" src="/assets/praia-vermelha-900.jpg" alt="Praia Vermelha vista do Morro da Urca">';
      nextBox.querySelector('button').onclick = () => goToEvent();
      return;
    }
    const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(next.date + 'T12:00:00Z'));
    const state = next.myStatus === 'confirmed' ? 'Sua inscrição está confirmada.'
      : next.myStatus === 'waitlist' ? 'Você está na lista de espera.'
      : next.signupsOpen ? 'Inscrições abertas para os membros da liga.' : 'Acompanhe os detalhes na agenda.';
    nextBox.innerHTML = `<div class="portal-next-copy"><p class="portal-overline">A seguir · ${escapeHtml(tipos[next.type] || 'Evento')}</p><h2>${escapeHtml(next.title)}</h2><p class="portal-next-details"><span>${escapeHtml(date)}${next.time ? ' · ' + escapeHtml(next.time) : ''}</span><span>${escapeHtml(next.location)}</span></p><p class="portal-next-state">${state}</p><button class="portal-action" type="button">Ver evento e inscrição →</button></div><img class="portal-next-photo" src="/assets/praia-vermelha-900.jpg" alt="Praia Vermelha vista do Morro da Urca">`;
    nextBox.querySelector('button').onclick = () => goToEvent(next.id);
  } catch {
    nextBox.innerHTML = '<div class="portal-next-copy"><p class="portal-overline">Agenda da liga</p><h2>Não foi possível consultar a agenda.</h2><p class="portal-next-details">Tente novamente para ver as próximas atividades.</p><button class="portal-action" type="button">Tentar novamente</button></div>';
    nextBox.querySelector('button').onclick = loadNext;
  }
}
loadNext();
document.addEventListener('click', event => {
  if (event.target.closest('[data-tab="inicio"]')) loadNext();
});

const nameNode = document.getElementById('who-name');
const updateGreeting = () => {
  const first = nameNode.textContent.trim().split(/\s+/)[0];
  if (first) document.getElementById('portal-greeting').textContent = `Bom te ver, ${first}.`;
};
new MutationObserver(updateGreeting).observe(nameNode, { childList: true, characterData: true, subtree: true });
updateGreeting();

const tools = document.createElement('div');
tools.className = 'portal-member-tools';
tools.innerHTML = '<label class="portal-field">Encontre alguém<input id="portal-member-search" type="search" placeholder="Nome, turma ou interesse" autocomplete="off"></label><label class="portal-field">Turma<select id="portal-member-turma"><option value="">Todas as turmas</option></select></label><button type="button" class="portal-own-link">Meu perfil ↗</button>';
const gridCard = grid.closest('.card');
gridCard.before(tools);
const result = document.createElement('p');
result.className = 'portal-member-count';
result.setAttribute('role', 'status');
tools.after(result);
const empty = document.createElement('p');
empty.className = 'portal-member-empty';
empty.textContent = 'Nenhum membro encontrado. Tente outro nome, turma ou interesse.';
empty.hidden = true;
grid.after(empty);
const search = tools.querySelector('input');
const turmaSelect = tools.querySelector('select');

function filterMembers() {
  const query = fold(search.value.trim());
  const turma = turmaSelect.value;
  const cards = [...grid.querySelectorAll('.member-card')];
  let found = 0;
  for (const card of cards) {
    const content = [card.querySelector('.name')?.textContent, card.querySelector('.meta')?.textContent,
      ...[...card.querySelectorAll('.interest-chip')].map(chip => chip.firstChild?.textContent)].join(' ');
    const visible = (!query || fold(content).includes(query)) && (!turma || card.dataset.turma === turma);
    card.hidden = !visible;
    if (visible) found++;
  }
  const label = cards.length ? `${found} de ${cards.length} membros${query || turma ? ' encontrados' : ' na liga'}` : 'Carregando membros…';
  if (result.textContent !== label) result.textContent = label;
  empty.hidden = !cards.length || found > 0;
}

function refreshMembers() {
  const cards = [...grid.querySelectorAll('.member-card')];
  const turmas = new Set();
  for (const card of cards) {
    const turma = card.querySelector('.meta')?.textContent.match(/Turma\s+([IVXLCDM]+)(?=\s|·|$)/)?.[1] || '';
    card.dataset.turma = turma;
    if (turma) turmas.add(turma);
    if (card.querySelector('#avatar-edit-btn')) {
      card.dataset.self = 'true';
      if (!card.querySelector('.portal-self')) {
        const label = document.createElement('span');
        label.className = 'portal-self'; label.textContent = 'Você';
        card.querySelector('.who').append(label);
      }
    }
  }
  const options = [...turmas].sort();
  const currentOptions = [...turmaSelect.options].slice(1).map(option => option.value);
  if (options.join(',') !== currentOptions.join(',')) {
    const selected = turmaSelect.value;
    turmaSelect.replaceChildren(new Option('Todas as turmas', ''), ...options.map(turma => new Option(turma, turma)));
    if (options.includes(selected)) turmaSelect.value = selected;
  }
  filterMembers();
}
search.addEventListener('input', filterMembers);
turmaSelect.addEventListener('change', filterMembers);
tools.querySelector('button').addEventListener('click', () => {
  search.value = ''; turmaSelect.value = ''; filterMembers();
  const own = grid.querySelector('[data-self]');
  if (own) { own.tabIndex = -1; own.scrollIntoView({ block: 'center' }); own.focus({ preventScroll: true }); }
});
new MutationObserver(refreshMembers).observe(grid, { childList: true, characterData: true, subtree: true });
refreshMembers();
