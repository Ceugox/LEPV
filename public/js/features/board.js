// Agenda da diretoria — quadro (ciclo de vida) e calendário mensal dos
// encontros externos da liga. Primeiro módulo ES do app (spec 2026-09-07):
// o app.js só injeta a aba no nav e dispara "lepv:board:load" quando ela
// ativa; tudo o mais vive aqui, sem global em window.
//
// Só diretor chega a esta aba (o nav não tem o botão para os demais), e o
// servidor exige o papel de novo em cada rota — o módulo é só a superfície.

const STATUSES = [
  { key: "a_marcar", label: "A marcar" },
  { key: "marcado", label: "Marcado" },
  { key: "realizado", label: "Realizado" },
  { key: "pendencia", label: "Com pendência" },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
const VIEW_KEY = "lepv.board.view";
const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

// ---- serialização (mesmos contratos da spec de modularização) ----
export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export const escapeAttr = escapeHtml;
export function safeUrl(value) {
  const url = String(value == null ? "" : value);
  return /^(?:\/|https?:\/\/)/i.test(url) ? url : "";
}

// ---- API ----
async function api(path, options) {
  const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options));
  if (r.status === 401) { window.location.href = "/login.html"; throw new Error("not authenticated"); }
  let body = {};
  try { body = await r.json(); } catch (e) { body = {}; }
  if (!r.ok) {
    const err = new Error(body.message || body.error || "request failed");
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ---- datas (fuso do Brasil, offset fixo -03:00, igual ao servidor) ----
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function fmtDateBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DOW[(dt.getUTCDay() + 6) % 7] + " " + String(d).padStart(2, "0") + "/" + String(m).padStart(2, "0") + "/" + y;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1); // "Setembro de 2026", não "Setembro De 2026"
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
function utcStamp(iso, time, plusMin) {
  const d = new Date(iso + "T" + time + ":00-03:00");
  if (plusMin) d.setTime(d.getTime() + plusMin * 60000);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function googleCalendarUrl(m) {
  const start = new Date(m.date + "T" + m.time + ":00-03:00");
  if (Number.isNaN(start.getTime())) return "";
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title + " · " + m.counterpart.org,
    dates: utcStamp(m.date, m.time) + "/" + utcStamp(m.date, m.time, m.durationMin || 60),
    details: (m.counterpart.person ? "Com " + m.counterpart.person + " (" + m.counterpart.org + ")" : "Com " + m.counterpart.org) + (safeUrl(m.link) ? "\n" + m.link : ""),
    location: m.location || "",
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
function initials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

// ---- estado ----
const state = {
  root: null,
  meetings: [],
  directors: [],
  view: "quadro",
  month: todayISO().slice(0, 7),
  selectedDay: null,
  openMenu: null, // { id, kind: "move" | "cal", confirm?: status, error?: string }
  subscribe: null, // payload do token enquanto o bloco está aberto
  loaded: false,
  error: "",
};
try {
  const v = localStorage.getItem(VIEW_KEY);
  if (v === "calendario" || v === "quadro") state.view = v;
} catch (e) { /* storage indisponível: fica o padrão */ }

// ---- render ----
function cardHtml(m) {
  const owners = (m.ownersView || [])
    .map((o) => '<span title="' + escapeAttr(o.name) + '">' + escapeHtml(initials(o.name)) + "</span>")
    .join(" ");
  const when = m.date
    ? escapeHtml(fmtDateBR(m.date)) + (m.time ? " · " + escapeHtml(m.time) : "") + (m.durationMin ? " · " + Number(m.durationMin) + " min" : "")
    : "sem data";
  const menuOpen = state.openMenu && state.openMenu.id === m.id ? state.openMenu : null;
  const canCal = Boolean(m.date && m.time);
  return (
    '<li class="board-card" data-id="' + escapeAttr(m.id) + '">' +
      '<p class="title">' + escapeHtml(m.title) + (m.front ? '<span class="front">' + escapeHtml(m.front) + "</span>" : "") + "</p>" +
      "<p>" + escapeHtml(m.counterpart.org) + (m.counterpart.person ? " · " + escapeHtml(m.counterpart.person) : "") + "</p>" +
      '<p class="meta">' + when + (m.location ? " · " + escapeHtml(m.location) : "") + "</p>" +
      (owners ? '<p class="meta">Responsáveis: ' + owners + "</p>" : "") +
      (m.status === "pendencia" && m.followUp && m.followUp.text
        ? '<p class="followup">' + escapeHtml(m.followUp.text) +
          (m.followUp.dueDate ? ' <span class="meta">até ' + escapeHtml(fmtDateBR(m.followUp.dueDate)) + "</span>" : "") + "</p>"
        : "") +
      '<div class="board-actions">' +
        '<button type="button" data-act="move" aria-expanded="' + (menuOpen && menuOpen.kind === "move" ? "true" : "false") + '">Mover</button>' +
        '<button type="button" data-act="edit">Editar</button>' +
        (canCal ? '<button type="button" data-act="cal" aria-expanded="' + (menuOpen && menuOpen.kind === "cal" ? "true" : "false") + '">Calendário</button>' : "") +
      "</div>" +
      (menuOpen ? menuHtml(m, menuOpen) : "") +
    "</li>"
  );
}
function menuHtml(m, menu) {
  if (menu.kind === "move") {
    const warn = menu.confirm
      ? '<p class="warn">A data desse encontro ainda não chegou. Confirma que ele já aconteceu?</p>'
      : "";
    const targets = menu.confirm
      ? '<button type="button" data-move="' + escapeAttr(menu.confirm) + '" data-confirm="1">Sim, mover para ' + escapeHtml(STATUS_LABEL[menu.confirm]) + "</button>"
      : STATUSES.filter((s) => s.key !== m.status)
          .map((s) => '<button type="button" data-move="' + s.key + '">' + escapeHtml(s.label) + "</button>")
          .join("");
    return (
      '<div class="board-menu" role="group" aria-label="Mover para">' + warn + targets +
        (menu.error ? '<p class="warn">' + escapeHtml(menu.error) + "</p>" : "") +
      "</div>"
    );
  }
  return (
    '<div class="board-menu" role="group" aria-label="Adicionar ao calendário">' +
      (googleCalendarUrl(m) ? '<a href="' + escapeAttr(googleCalendarUrl(m)) + '" target="_blank" rel="noopener">Google Calendar</a>' : "") +
      '<a href="/api/board/meetings/' + escapeAttr(encodeURIComponent(m.id)) + '.ics" download>Baixar .ics</a>' +
    "</div>"
  );
}
function boardHtml() {
  return (
    '<div class="board-columns">' +
    STATUSES.map((s) => {
      const list = state.meetings.filter((m) => m.status === s.key);
      return (
        '<section class="board-col" data-status="' + s.key + '">' +
          "<header><h3>" + escapeHtml(s.label) + '</h3><span class="board-count">' + list.length + "</span></header>" +
          (list.length ? '<ul class="board-list">' + list.map(cardHtml).join("") + "</ul>" : '<p class="board-empty">Nada aqui.</p>') +
        "</section>"
      );
    }).join("") +
    "</div>"
  );
}
function calendarHtml() {
  const [y, mo] = state.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // semana começa na segunda
  const today = todayISO();
  const byDay = new Map();
  for (const m of state.meetings) {
    if (!m.date || m.status === "a_marcar") continue;
    if (!byDay.has(m.date)) byDay.set(m.date, []);
    byDay.get(m.date).push(m);
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(y, mo - 1, 1 - startOffset + i));
    const iso = d.toISOString().slice(0, 10);
    const other = d.getUTCMonth() !== mo - 1;
    if (i >= 35 && other) break; // sexta linha só quando o mês precisa dela
    const list = (byDay.get(iso) || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    cells.push(
      '<button type="button" class="board-day' + (other ? " other" : "") + (iso === today ? " today" : "") + (iso === state.selectedDay ? " selected" : "") +
        '" data-day="' + iso + '" aria-label="' + escapeAttr(fmtDateBR(iso) + (list.length ? ", " + list.length + " encontro(s)" : "")) + '">' +
        '<span class="num">' + d.getUTCDate() + "</span>" +
        list.map((m) => '<span class="ev">' + escapeHtml((m.time ? m.time + " " : "") + m.title) + "</span>").join("") +
      "</button>"
    );
  }
  const dayList = state.selectedDay ? (byDay.get(state.selectedDay) || []) : [];
  return (
    '<div class="board-month-nav">' +
      '<button type="button" data-month="-1" aria-label="Mês anterior">‹</button>' +
      "<h3>" + escapeHtml(monthLabel(state.month)) + "</h3>" +
      '<button type="button" data-month="0">Hoje</button>' +
      '<button type="button" data-month="1" aria-label="Próximo mês">›</button>' +
    "</div>" +
    '<div class="board-month" role="grid">' + DOW.map((d) => '<div class="dow">' + d + "</div>").join("") + cells.join("") + "</div>" +
    (state.selectedDay
      ? '<div class="board-daylist"><p class="board-daylabel">' + escapeHtml(fmtDateBR(state.selectedDay)) + "</p>" +
        (dayList.length ? '<ul class="board-list">' + dayList.map(cardHtml).join("") + "</ul>" : '<p class="board-empty">Nenhum encontro neste dia.</p>') +
        "</div>"
      : "")
  );
}
function subscribeHtml() {
  const s = state.subscribe;
  if (!s) return "";
  return (
    '<div class="board-subscribe card rv">' +
      '<p class="section-label">Assinar no meu calendário</p>' +
      '<p class="board-hint">Este link é seu e mostra só os encontros com data. Quem tiver o link vê a agenda; se vazar, gere um novo.</p>' +
      '<div class="url"><input type="text" readonly value="' + escapeAttr(s.webcal) + '" aria-label="Endereço do feed">' +
        '<button type="button" data-sub="copy">Copiar</button>' +
        '<button type="button" data-sub="rotate">' + (s.confirmRotate ? "Confirmar novo link" : "Gerar novo link") + "</button></div>" +
      (s.copied ? '<p class="board-hint">Copiado.</p>' : "") +
      (s.confirmRotate ? '<p class="board-hint warn">O link atual para de funcionar em todos os seus calendários.</p>' : "") +
      "<ol>" +
        "<li><strong>Google Calendar</strong>: Outras agendas → + → Por URL → cole o endereço.</li>" +
        "<li><strong>Apple Calendário</strong>: Arquivo → Nova assinatura de calendário → cole o endereço.</li>" +
        "<li><strong>Outlook</strong>: Adicionar calendário → Assinar da Web → cole o endereço.</li>" +
      "</ol>" +
    "</div>"
  );
}
function bodyHtml() {
  if (!state.loaded) return '<p class="empty-state">Carregando...</p>';
  if (state.error) return '<p class="empty-state">' + escapeHtml(state.error) + "</p>";
  if (state.view === "calendario") return calendarHtml();
  if (!state.meetings.length) return '<p class="board-empty">Nenhum encontro registrado. Comece pelo botão "Novo encontro".</p>';
  return boardHtml();
}
function render() {
  const root = state.root;
  if (!root) return;
  root.innerHTML =
    '<div class="card rv">' +
      '<p class="section-label">Agenda da diretoria</p>' +
      '<div class="board-toolbar">' +
        '<button type="button" class="primary" data-act="new">Novo encontro</button>' +
        '<button type="button" data-act="subscribe" aria-expanded="' + (state.subscribe ? "true" : "false") + '">Assinar no meu calendário</button>' +
        '<span class="spacer"></span>' +
        '<div class="board-view" role="group" aria-label="Visão">' +
          '<button type="button" data-view="quadro" aria-pressed="' + (state.view === "quadro") + '">Quadro</button>' +
          '<button type="button" data-view="calendario" aria-pressed="' + (state.view === "calendario") + '">Calendário</button>' +
        "</div>" +
      "</div>" +
      bodyHtml() +
    "</div>" +
    subscribeHtml();
}

// ---- ações ----
async function load() {
  try {
    const data = await api("/api/board/meetings");
    state.meetings = data.meetings || [];
    state.directors = data.directors || [];
    state.error = "";
  } catch (e) {
    state.meetings = [];
    state.error = "Não foi possível carregar a agenda. " + (e.message || "");
  }
  state.loaded = true;
  render();
}
async function moveTo(id, status, confirm) {
  try {
    await api("/api/board/meetings/" + encodeURIComponent(id), {
      method: "PATCH",
      body: JSON.stringify(confirm ? { status, confirm: true } : { status }),
    });
    state.openMenu = null;
    await load();
  } catch (e) {
    if (e.status === 409 && e.body && e.body.error === "future_meeting") {
      state.openMenu = { id, kind: "move", confirm: status };
    } else if (e.status === 400 && e.body && e.body.fields) {
      // Faltam campos para esse status (data/hora ou texto da pendência):
      // abre o editor já no status escolhido, com os campos destacados.
      const m = state.meetings.find((x) => x.id === id);
      state.openMenu = null;
      render();
      openEditor(Object.assign({}, m, { status }), e.body.fields);
      return;
    } else {
      state.openMenu = { id, kind: "move", error: e.message };
    }
    render();
  }
}
async function toggleSubscribe() {
  if (state.subscribe) { state.subscribe = null; render(); return; }
  try {
    state.subscribe = await api("/api/board/calendar-token");
  } catch (e) {
    state.subscribe = null;
  }
  render();
}
async function copyFeed() {
  const url = state.subscribe.webcal;
  try {
    await navigator.clipboard.writeText(url);
    state.subscribe.copied = true;
  } catch (e) {
    const inp = state.root.querySelector(".board-subscribe input");
    if (inp) { inp.focus(); inp.select(); }
  }
  render();
}
async function rotateFeed() {
  if (!state.subscribe.confirmRotate) { state.subscribe.confirmRotate = true; render(); return; }
  try {
    state.subscribe = await api("/api/board/calendar-token/rotate", { method: "POST" });
  } catch (e) {
    state.subscribe.confirmRotate = false;
  }
  render();
}

// ---- editor (modal, mesma casca do modal de senha do app) ----
function fieldHtml(id, label, inner) {
  return '<div class="field" data-field="' + id + '"><label for="bm-' + id + '">' + label + "</label>" + inner + "</div>";
}
function editorHtml(m) {
  const val = (v) => escapeAttr(v == null ? "" : v);
  const owners = new Set(m.owners || []);
  return (
    '<h3 id="bm-modal-title">' + (m.id ? "Editar encontro" : "Novo encontro") + "</h3>" +
    '<form id="bm-form" novalidate>' +
      '<p class="form-error" id="bm-error"></p>' +
      fieldHtml("title", "Título", '<input type="text" id="bm-title" maxlength="120" required value="' + val(m.title) + '">') +
      '<div class="row2">' +
        fieldHtml("counterpart.org", "Organização", '<input type="text" id="bm-counterpart.org" maxlength="80" required value="' + val(m.counterpart && m.counterpart.org) + '">') +
        fieldHtml("counterpart.person", "Pessoa", '<input type="text" id="bm-counterpart.person" maxlength="80" value="' + val(m.counterpart && m.counterpart.person) + '">') +
      "</div>" +
      '<div class="row2">' +
        fieldHtml("front", "Frente", '<input type="text" id="bm-front" maxlength="30" placeholder="Hackathon, Conselho..." value="' + val(m.front) + '">') +
        fieldHtml("status", "Status", '<select id="bm-status">' +
          STATUSES.map((s) => '<option value="' + s.key + '"' + (s.key === (m.status || "a_marcar") ? " selected" : "") + ">" + escapeHtml(s.label) + "</option>").join("") +
          "</select>") +
      "</div>" +
      '<div class="row2">' +
        fieldHtml("date", "Data", '<input type="date" id="bm-date" value="' + val(m.date) + '">') +
        fieldHtml("time", "Hora", '<input type="time" id="bm-time" value="' + val(m.time) + '">') +
      "</div>" +
      '<div class="row2">' +
        fieldHtml("durationMin", "Duração (min)", '<input type="number" id="bm-durationMin" min="15" max="480" step="15" value="' + val(m.durationMin || 60) + '">') +
        fieldHtml("location", "Local", '<input type="text" id="bm-location" maxlength="160" placeholder="Online (Google Meet), sala..." value="' + val(m.location) + '">') +
      "</div>" +
      fieldHtml("link", "Link da chamada", '<input type="url" id="bm-link" maxlength="500" placeholder="https://" value="' + val(m.link) + '">') +
      '<div class="field" data-field="owners"><span class="label">Responsáveis</span><div class="owners">' +
        (state.directors.length
          ? state.directors.map((d) => '<label><input type="checkbox" name="owners" value="' + Number(d.order) + '"' + (owners.has(d.order) ? " checked" : "") + "> " + escapeHtml(d.name) + "</label>").join("")
          : '<span class="board-hint">Nenhum diretor ativo.</span>') +
      "</div></div>" +
      fieldHtml("agenda", "Pauta", '<textarea id="bm-agenda" maxlength="2000">' + escapeHtml(m.agenda) + "</textarea>") +
      fieldHtml("outcome", "Resultado", '<textarea id="bm-outcome" maxlength="2000">' + escapeHtml(m.outcome) + "</textarea>") +
      '<div id="bm-followup-wrap">' +
        fieldHtml("followUp.text", "Pendência", '<input type="text" id="bm-followUp.text" maxlength="300" placeholder="O que ficou para cobrar" value="' + val(m.followUp && m.followUp.text) + '">') +
        fieldHtml("followUp.dueDate", "Prazo da pendência", '<input type="date" id="bm-followUp.dueDate" value="' + val(m.followUp && m.followUp.dueDate) + '">') +
      "</div>" +
      '<div class="field confirm-wrap" id="bm-confirm-wrap" hidden><label><input type="checkbox" id="bm-confirm"> A data ainda não chegou; confirmo que o encontro já aconteceu.</label></div>' +
      '<div class="pin-actions"><button type="button" class="btn-ghost" id="bm-cancel">Cancelar</button><button type="submit" class="btn-primary">Salvar</button></div>' +
      (m.id ? '<div class="danger-zone"><button type="button" id="bm-delete">Apagar encontro</button><span class="board-hint" id="bm-delete-hint"></span></div>' : "") +
    "</form>"
  );
}
function openEditor(meeting, invalidFields) {
  const m = Object.assign({ counterpart: {}, followUp: {}, owners: [], status: "a_marcar" }, meeting || {});
  if (document.getElementById("bm-form")) return; // um editor por vez
  const backdrop = document.createElement("div");
  backdrop.className = "pin-backdrop";
  const modal = document.createElement("div");
  modal.className = "pin-modal form-modal board-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "bm-modal-title");
  modal.innerHTML = editorHtml(m);
  // Irmãos no body, como o modal de senha: .pin-modal é position:fixed e só
  // aparece com .open (transform + opacity), no backdrop e no modal.
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  requestAnimationFrame(() => { backdrop.classList.add("open"); modal.classList.add("open"); });
  const prevFocus = document.activeElement;
  const form = modal.querySelector("#bm-form");
  const errorEl = modal.querySelector("#bm-error");
  const statusEl = modal.querySelector("#bm-status");
  const followWrap = modal.querySelector("#bm-followup-wrap");
  const confirmWrap = modal.querySelector("#bm-confirm-wrap");
  function syncStatus() { followWrap.hidden = statusEl.value !== "pendencia"; }
  syncStatus();
  statusEl.addEventListener("change", syncStatus);
  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    modal.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", close);
  modal.querySelector("#bm-cancel").addEventListener("click", close);
  function markInvalid(fields, message) {
    modal.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    (fields || []).forEach((f) => {
      const el = modal.querySelector('[data-field="' + f + '"]');
      if (el) el.classList.add("invalid");
    });
    errorEl.textContent = message || "";
    errorEl.classList.toggle("show", Boolean(message));
  }
  if (invalidFields && invalidFields.length) markInvalid(invalidFields, "Complete os campos destacados para esse status.");
  const v = (id) => modal.querySelector("#bm-" + id.replace(/\./g, "\\.")).value.trim();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: v("title"),
      counterpart: { org: v("counterpart.org"), person: v("counterpart.person") },
      front: v("front"),
      status: statusEl.value,
      date: v("date"),
      time: v("time"),
      durationMin: Number(v("durationMin")) || 60,
      location: v("location"),
      link: v("link"),
      owners: Array.from(modal.querySelectorAll('input[name="owners"]:checked')).map((c) => Number(c.value)),
      agenda: v("agenda"),
      outcome: v("outcome"),
      followUp: { text: v("followUp.text"), dueDate: v("followUp.dueDate") },
    };
    if (!confirmWrap.hidden && modal.querySelector("#bm-confirm").checked) payload.confirm = true;
    try {
      await api(m.id ? "/api/board/meetings/" + encodeURIComponent(m.id) : "/api/board/meetings", {
        method: m.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      close();
      await load();
    } catch (err) {
      if (err.status === 409 && err.body && err.body.error === "future_meeting") {
        confirmWrap.hidden = false;
        markInvalid(["date"], err.message);
      } else {
        markInvalid((err.body && err.body.fields) || [], err.message || "Não foi possível salvar.");
      }
    }
  });
  const del = modal.querySelector("#bm-delete");
  if (del) {
    let armed = false;
    del.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        del.textContent = "Confirmar exclusão";
        modal.querySelector("#bm-delete-hint").textContent = "Não dá para desfazer.";
        return;
      }
      try {
        await api("/api/board/meetings/" + encodeURIComponent(m.id), { method: "DELETE" });
        close();
        await load();
      } catch (err) {
        markInvalid([], err.message);
      }
    });
  }
  const first = modal.querySelector("#bm-title");
  if (first) first.focus();
}

// ---- eventos de UI (delegação na raiz) ----
function onClick(e) {
  const t = e.target.closest("button, a");
  if (!t || !state.root.contains(t)) return;
  if (t.dataset.view) {
    state.view = t.dataset.view;
    try { localStorage.setItem(VIEW_KEY, state.view); } catch (err) { /* sem storage */ }
    state.openMenu = null;
    render();
    return;
  }
  if (t.dataset.act === "new") { openEditor(null); return; }
  if (t.dataset.act === "subscribe") { toggleSubscribe(); return; }
  if (t.dataset.sub === "copy") { copyFeed(); return; }
  if (t.dataset.sub === "rotate") { rotateFeed(); return; }
  if (t.dataset.month !== undefined) {
    if (t.dataset.month === "0") {
      state.month = todayISO().slice(0, 7);
      state.selectedDay = todayISO();
    } else {
      state.month = shiftMonth(state.month, Number(t.dataset.month));
    }
    render();
    return;
  }
  if (t.dataset.day) {
    state.selectedDay = state.selectedDay === t.dataset.day ? null : t.dataset.day;
    state.openMenu = null;
    render();
    return;
  }
  const card = t.closest(".board-card");
  if (!card) return;
  const id = card.dataset.id;
  const m = state.meetings.find((x) => x.id === id);
  if (!m) return;
  if (t.dataset.move) { moveTo(id, t.dataset.move, t.dataset.confirm === "1"); return; }
  if (t.dataset.act === "edit") { openEditor(m); return; }
  if (t.dataset.act === "move" || t.dataset.act === "cal") {
    const kind = t.dataset.act;
    state.openMenu = state.openMenu && state.openMenu.id === id && state.openMenu.kind === kind ? null : { id, kind };
    render();
  }
}

export function initBoard() {
  const root = document.getElementById("board-root");
  if (!root || root.dataset.boardInit === "1") return;
  root.dataset.boardInit = "1";
  state.root = root;
  root.addEventListener("click", onClick);
  document.addEventListener("lepv:board:load", () => { load(); });
  // Se a aba já estiver ativa quando o módulo carregar, carrega sem esperar.
  const panel = document.getElementById("panel-diretoria");
  if (panel && panel.classList.contains("active")) load();
}

// Auto-inicialização quando carregado direto pelo app.html. Quando o main.js
// da modularização importar este módulo, initBoard é idempotente.
initBoard();
