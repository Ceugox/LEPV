// Centro de gastos — lançamentos de ressarcimento dos membros e registro do
// que a diretoria já pagou. Segundo módulo ES do app (depois de board.js):
// o app.js põe a aba no nav e dispara "lepv:reimbursements:load" quando ela
// ativa. Visibilidade é privada: a API devolve só os lançamentos do membro,
// e o extrato consolidado só existe para quem tem papel de diretoria.

import { escapeHtml, escapeAttr } from "./board.js";

const STATUS_LABEL = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  pago: "Pago",
};
// Mesmo mapa do servidor (REIMBURSEMENT_TRANSITIONS) — esconde ação impossível.
const TRANSITIONS = { pendente: ["aprovado", "recusado"], aprovado: ["pago", "pendente"] };
const ACT_LABEL = { aprovado: "Aprovar", recusado: "Recusar", pago: "Marcar pago", pendente: "Reabrir" };
const MAX_ATTACHMENTS = 5;

const state = {
  root: null,
  me: null,
  expenses: [],
  members: [],
  filterStatus: "",
  filterMember: "",
  formOpen: false,
  editingId: null,
  pendingFiles: [],
  rejectId: null, // cartão com o campo de motivo de recusa aberto
  armedDelete: null, // id do cartão no segundo toque de exclusão
  busy: false,
  error: "",
};

async function api(path, options) {
  const r = await fetch(path, Object.assign({ headers: {} }, options));
  if (r.status === 401) { window.location.href = "/login.html"; throw new Error("not authenticated"); }
  let body = {};
  try { body = await r.json(); } catch (e) { body = {}; }
  if (!r.ok) {
    const err = new Error(body.message || body.error || "request failed");
    err.status = r.status; err.body = body;
    throw err;
  }
  return body;
}

// "Hoje" no fuso do Brasil — igual ao todayBR() do servidor.
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function fmtMoney(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
}
// Aceita "1.234,56" (BR) e "1234.56" (colado com ponto). Com vírgula, ponto é
// milhar; sem vírgula, um ponto é decimal e dois pontos são ambiguidade → null.
function parseAmount(text) {
  const t = String(text || "").trim();
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(parseFloat(norm) * 100);
}
function memberName(order) {
  const m = state.members.find((x) => x.order === order);
  return m ? m.name : "Membro " + order;
}
const isDirector = () => state.me && (state.me.director || state.me.superadmin);

async function refresh() {
  const q = new URLSearchParams();
  if (state.filterStatus) q.set("status", state.filterStatus);
  if (state.filterMember) q.set("member", state.filterMember);
  const qs = q.toString();
  const data = await api("/api/reimbursements" + (qs ? "?" + qs : ""));
  state.expenses = data.expenses || [];
}

// ---- render ----
function render() {
  const root = state.root;
  if (!root) return;
  const sums = { pendente: 0, aprovado: 0, pago: 0 };
  for (const e of state.expenses) if (e.status in sums) sums[e.status] += e.amountCents;
  let h = '<div class="card rv"><p class="section-label">Centro de gastos</p>';
  h += '<div class="gx-summary">';
  for (const k of ["pendente", "aprovado", "pago"]) {
    h += '<div class="gx-sum"><b>' + fmtMoney(sums[k]) + "</b><span>" + STATUS_LABEL[k] + "</span></div>";
  }
  h += "</div>";
  h += '<div class="gx-toolbar"><button type="button" class="primary" data-act="toggle-form" aria-expanded="' + state.formOpen + '">' +
    (state.formOpen ? "Fechar" : "Novo gasto") + "</button>";
  if (isDirector()) {
    h += '<span class="spacer"></span><select id="gx-member" aria-label="Filtrar por membro">' +
      '<option value="">Todos os membros</option>' +
      state.members.map((m) => '<option value="' + Number(m.order) + '"' + (String(m.order) === state.filterMember ? " selected" : "") + ">" + escapeHtml(m.name) + "</option>").join("") +
      "</select>";
  }
  h += "</div>";
  if (isDirector()) {
    h += '<div class="gx-filters" role="group" aria-label="Filtrar por status">';
    for (const s of ["", "pendente", "aprovado", "pago", "recusado"]) {
      h += '<button type="button" data-f="' + s + '" aria-pressed="' + (state.filterStatus === s) + '">' + (s ? STATUS_LABEL[s] : "Todos") + "</button>";
    }
    h += "</div>";
  }
  if (state.formOpen) h += formHtml();
  if (state.error) h += '<p class="gx-note warn">' + escapeHtml(state.error) + "</p>";
  if (!state.expenses.length) {
    h += '<p class="board-empty">Nenhum gasto lançado ainda. Toque em "Novo gasto" para registrar o primeiro.</p>';
  }
  h += '<ul class="board-list">' + state.expenses.map(cardHtml).join("") + "</ul>";
  h += "</div>";
  root.innerHTML = h;
}

function formHtml() {
  const edit = state.editingId ? state.expenses.find((e) => e.id === state.editingId) : null;
  let h = '<form class="gx-form" id="gx-form" novalidate>';
  h += '<div class="field"><label for="gx-desc">Descrição</label>' +
    '<input type="text" id="gx-desc" maxlength="160" required placeholder="Ex.: Uber até a gráfica — banner" value="' +
    escapeAttr(edit ? edit.description : "") + '"></div>';
  h += '<div class="gx-row2">';
  h += '<div class="field"><label for="gx-amount">Valor (R$)</label>' +
    '<input type="text" id="gx-amount" inputmode="decimal" required placeholder="0,00" value="' +
    (edit ? escapeAttr((edit.amountCents / 100).toFixed(2).replace(".", ",")) : "") + '"></div>';
  h += '<div class="field"><label for="gx-spent">Data do gasto</label>' +
    '<input type="date" id="gx-spent" required max="' + todayISO() + '" value="' + (edit ? escapeAttr(edit.spentAt) : todayISO()) + '"></div>';
  h += "</div>";
  if (!edit) {
    h += '<div class="gx-check"><input type="checkbox" id="gx-paid">' +
      '<label for="gx-paid">A diretoria já pagou este gasto</label></div>';
    // Dois inputs porque "capture" sozinho trava o Android na câmera e não
    // deixa escolher arquivo/PDF. Um abre a câmera, o outro a galeria.
    h += '<div class="field"><span class="label">Nota fiscal / comprovantes</span>' +
      '<div class="gx-attach-btns">' +
      '<button type="button" data-pick="camera">Tirar foto</button>' +
      '<button type="button" data-pick="file">Escolher arquivo</button>' +
      "</div>" +
      '<input type="file" id="gx-camera" accept="image/*" capture="environment" hidden>' +
      '<input type="file" id="gx-files" accept="image/*,application/pdf" multiple hidden>' +
      '<ul class="gx-pending" id="gx-pending"></ul>' +
      '<p class="gx-note">Foto (JPG, PNG, WebP) ou PDF — até ' + MAX_ATTACHMENTS + " por gasto.</p></div>";
  }
  h += '<div class="gx-actions"><button type="submit" class="primary" id="gx-save">' +
    (edit ? "Salvar" : "Lançar gasto") + "</button>" +
    (edit ? '<button type="button" data-act="toggle-form">Cancelar</button>' : "") + "</div>";
  h += '<p class="gx-note warn" id="gx-msg" role="alert"></p>';
  h += "</form>";
  return h;
}

function cardHtml(e) {
  const own = state.me && e.memberOrder === state.me.order;
  const canEdit = isDirector() || (own && e.status === "pendente");
  const canAttach = canEdit && (e.attachments || []).length < MAX_ATTACHMENTS;
  let h = '<li class="gx-card" data-id="' + escapeAttr(e.id) + '">';
  h += '<div class="gx-head"><b>' + escapeHtml(e.description) + '</b><span class="gx-money">' + fmtMoney(e.amountCents) + "</span></div>";
  h += '<p class="gx-meta">' + fmtDate(e.spentAt) +
    (e.kind === "paid_by_board" ? " · pago pela diretoria" : " · ressarcimento") +
    (isDirector() ? " · " + escapeHtml(memberName(e.memberOrder)) : "") + "</p>";
  h += '<p class="gx-meta"><span class="gx-badge ' + e.status + '">' + STATUS_LABEL[e.status] + "</span>";
  if (e.note) h += ' — ' + escapeHtml(e.note);
  h += "</p>";
  if (e.attachments && e.attachments.length) {
    h += '<div class="gx-atts">';
    for (const a of e.attachments) {
      h += '<a href="/api/reimbursements/' + escapeAttr(e.id) + "/attachments/" + escapeAttr(a.id) + '" target="_blank" rel="noopener">' +
        (a.type === "pdf" ? "PDF · " : "Foto · ") + escapeHtml(a.name) + "</a>";
    }
    h += "</div>";
  }
  if (state.rejectId === e.id) {
    h += '<div class="gx-reject"><label for="gx-note-' + escapeAttr(e.id) + '">Motivo da recusa</label>' +
      '<input type="text" id="gx-note-' + escapeAttr(e.id) + '" maxlength="280" placeholder="Ex.: falta a nota fiscal">' +
      '<div class="gx-actions"><button type="button" class="primary" data-act="confirm-recusado">Recusar</button>' +
      '<button type="button" data-act="cancel-reject">Voltar</button></div></div>';
  }
  h += '<div class="gx-actions">';
  if (canEdit) {
    h += '<button type="button" data-act="edit">Editar</button>';
    if (canAttach) h += '<button type="button" data-act="attach">Anexar</button>';
    h += '<button type="button" class="gx-danger" data-act="del">' +
      (state.armedDelete === e.id ? "Confirmar exclusão" : "Excluir") + "</button>";
  }
  if (isDirector() && state.rejectId !== e.id) {
    for (const t of TRANSITIONS[e.status] || []) {
      h += '<button type="button" data-act="' + t + '"' + (t === "pago" ? ' class="primary"' : "") + ">" + ACT_LABEL[t] + "</button>";
    }
  }
  h += "</div></li>";
  return h;
}

function pendingFilesHtml() {
  const ul = document.getElementById("gx-pending");
  if (ul) {
    ul.innerHTML = state.pendingFiles
      .map((f, i) => '<li>' + escapeHtml(f.name) + ' <button type="button" data-drop="' + i + '" aria-label="Remover ' + escapeAttr(f.name) + '">×</button></li>')
      .join("");
  }
}

// ---- ações ----
async function uploadAttachments(id, files) {
  let failed = 0;
  for (const f of files) {
    const up = await fetch("/api/reimbursements/" + id + "/attachments?name=" + encodeURIComponent(f.name), {
      method: "POST",
      headers: { "Content-Type": f.type || "application/octet-stream" },
      body: f,
    });
    if (!up.ok) failed++;
  }
  return failed;
}

async function saveForm(form) {
  if (state.busy) return;
  const msg = form.querySelector("#gx-msg");
  const description = form.querySelector("#gx-desc").value;
  const amountCents = parseAmount(form.querySelector("#gx-amount").value);
  const spentAt = form.querySelector("#gx-spent").value;
  if (String(description).trim().length < 3) { msg.textContent = "Descreva o gasto."; return; }
  if (amountCents === null || amountCents <= 0) { msg.textContent = "Valor inválido — use vírgula: 12,50."; return; }
  if (!spentAt) { msg.textContent = "Informe a data do gasto."; return; }
  state.busy = true;
  try {
    let warn = "";
    if (state.editingId) {
      await api("/api/reimbursements/" + state.editingId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amountCents, spentAt }),
      });
    } else {
      const paid = form.querySelector("#gx-paid").checked;
      const created = await api("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amountCents, spentAt, kind: paid ? "paid_by_board" : "reimbursement" }),
      });
      // Anexos sobem depois do lançamento existir — um POST por arquivo,
      // corpo cru, como o upload de avatar.
      const failed = await uploadAttachments(created.expense.id, state.pendingFiles);
      if (failed) warn = "Lançado, mas " + failed + " anexo(s) não subiu(ram) — anexe de novo no cartão.";
    }
    state.formOpen = false; state.editingId = null; state.pendingFiles = [];
    state.error = warn;
    await refresh();
    render();
  } catch (err) {
    msg.textContent = err.message || "Não foi possível salvar.";
  } finally {
    state.busy = false;
  }
}

function pickFiles(kind) {
  // kind "camera" abre a câmera (capture=environment); "file" abre o seletor
  // de arquivo/galeria, onde entram PDFs e fotos já salvas.
  const input = document.getElementById(kind === "camera" ? "gx-camera" : "gx-files");
  if (!input) return;
  input.value = "";
  input.onchange = () => {
    const room = MAX_ATTACHMENTS - state.pendingFiles.length;
    state.pendingFiles = state.pendingFiles.concat(Array.from(input.files).slice(0, room));
    pendingFilesHtml();
  };
  input.click();
}

async function attachTo(id) {
  // Anexar depois, no cartão: quem guardou a nota no bolso fotografa depois.
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,application/pdf";
  input.onchange = async () => {
    if (!input.files.length) return;
    state.busy = true;
    try {
      const failed = await uploadAttachments(id, Array.from(input.files));
      state.error = failed ? "Um anexo não subiu — tente de novo." : "";
      await refresh();
    } finally {
      state.busy = false;
      render();
    }
  };
  input.click();
}

async function decide(id, act) {
  if (act === "recusado" && state.rejectId !== id) { state.rejectId = id; render(); return; }
  let note;
  if (act === "recusado") {
    const inp = state.root.querySelector("#gx-note-" + CSS.escape(id));
    note = inp ? inp.value.trim() : "";
    if (!note) { if (inp) inp.focus(); return; }
  }
  try {
    await api("/api/reimbursements/" + id + "/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note ? { status: act, note } : { status: act }),
    });
    state.rejectId = null;
    state.error = "";
  } catch (e) {
    state.error = e.message;
  }
  await refresh();
  render();
}

function onClick(e) {
  const t = e.target.closest("button");
  if (!t || !state.root.contains(t)) return;
  const act = t.dataset.act;
  if (t.dataset.f !== undefined) {
    state.filterStatus = t.dataset.f;
    refresh().then(render);
    return;
  }
  if (t.dataset.pick) { pickFiles(t.dataset.pick); return; }
  if (t.dataset.drop !== undefined) {
    state.pendingFiles.splice(Number(t.dataset.drop), 1);
    pendingFilesHtml();
    return;
  }
  if (act === "toggle-form") {
    state.formOpen = !state.formOpen;
    if (!state.formOpen) { state.editingId = null; state.pendingFiles = []; }
    render();
    return;
  }
  const card = t.closest(".gx-card");
  if (!card) return;
  const id = card.dataset.id;
  if (act === "edit") {
    state.editingId = id; state.formOpen = true;
    render();
    const f = document.getElementById("gx-form");
    if (f) f.scrollIntoView();
    return;
  }
  if (act === "attach") { attachTo(id); return; }
  if (act === "cancel-reject") { state.rejectId = null; render(); return; }
  if (act === "confirm-recusado") { decide(id, "recusado"); return; }
  if (act === "del") {
    // Toque duplo, sem confirm() nativo — padrão do bm-delete do board.
    if (state.armedDelete !== id) { state.armedDelete = id; render(); return; }
    state.armedDelete = null;
    api("/api/reimbursements/" + id, { method: "DELETE" })
      .then(() => refresh())
      .catch((err) => { state.error = err.message; })
      .then(render);
    return;
  }
  if (act === "aprovado" || act === "recusado" || act === "pago" || act === "pendente") {
    decide(id, act);
  }
}

function onChange(e) {
  if (e.target && e.target.id === "gx-member") {
    state.filterMember = e.target.value;
    refresh().then(render);
  }
}
function onSubmit(e) {
  if (e.target && e.target.id === "gx-form") {
    e.preventDefault();
    saveForm(e.target);
  }
}

// ---- carga sob demanda, a cada abertura de aba ----
async function load() {
  if (!state.root) return;
  try {
    if (!state.me) {
      state.me = await api("/api/me");
      if (isDirector()) {
        // /api/members é array puro de fichas públicas (order, name, ...).
        state.members = await api("/api/members");
      }
    }
    state.error = "";
    await refresh();
    render();
  } catch (err) {
    state.root.innerHTML = '<div class="card rv"><p class="empty-state">Não foi possível carregar os gastos.</p></div>';
  }
}

export function initReimbursements() {
  const root = document.getElementById("expenses-root");
  if (!root || root.dataset.gxInit === "1") return;
  root.dataset.gxInit = "1";
  state.root = root;
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  document.addEventListener("lepv:reimbursements:load", load);
  const panel = document.getElementById("panel-gastos");
  if (panel && panel.classList.contains("active")) load();
}

initReimbursements();
