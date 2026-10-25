// Dúvidas: canal privado entre participante e organização. Quem pergunta vê
// só as próprias; diretoria e equipe com comunicação respondem; a resposta
// aparece no portal de quem perguntou (e chega por push, se ativou).
const { id } = require("./store");
const { HackError, findPerson } = require("./people");

const MAX_TEXT = 1000;
const MAX_OPEN = 10; // dúvidas sem resposta por pessoa

function cleanBody(raw) {
  return String(raw || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT);
}

function ask(state, personId, raw, now) {
  const text = cleanBody(raw);
  if (text.length < 3) throw new HackError(400, "invalid_text", "Escreva sua dúvida (pelo menos 3 caracteres).");
  const open = state.questions.filter((q) => q.personId === personId && !q.answer).length;
  if (open >= MAX_OPEN) throw new HackError(429, "too_many", "Você já tem " + MAX_OPEN + " dúvidas esperando resposta. Aguarde a organização responder.");
  const q = { id: id("q"), personId, text, createdAt: now.toISOString(), answer: null };
  state.questions.push(q);
  return q;
}

function answer(state, questionId, byId, raw, now) {
  const q = state.questions.find((x) => x.id === questionId);
  if (!q) throw new HackError(404, "question_not_found", "Dúvida não encontrada.");
  // Dois organizadores na mesma dúvida: vale a primeira resposta.
  if (q.answer) throw new HackError(409, "already_answered", "Essa dúvida já foi respondida. Recarregue a lista.");
  const text = cleanBody(raw);
  if (text.length < 1) throw new HackError(400, "invalid_text", "Escreva a resposta.");
  q.answer = { text, byId, at: now.toISOString() };
  return q;
}

function ownView(q) {
  return { id: q.id, text: q.text, createdAt: q.createdAt, answer: q.answer ? { text: q.answer.text, at: q.answer.at } : null };
}

function adminView(state, q) {
  const p = findPerson(state, q.personId);
  const by = q.answer ? findPerson(state, q.answer.byId) : null;
  return {
    id: q.id,
    text: q.text,
    createdAt: q.createdAt,
    person: p ? { id: p.id, name: p.name, email: p.email, phone: p.phone } : null,
    answer: q.answer ? { text: q.answer.text, at: q.answer.at, by: by ? by.name : "?" } : null,
  };
}

module.exports = { MAX_TEXT, MAX_OPEN, ask, answer, ownView, adminView };
