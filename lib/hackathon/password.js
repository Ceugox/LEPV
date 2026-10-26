// Senha pessoal da plataforma do hackathon. É opcional: o link de uso único
// continua valendo como entrada e como recuperação ("esqueci minha senha").
//
// Guardada só como hash bcrypt em person.passwordHash. Criar ou trocar a
// senha sobe person.sessionEpoch: os outros aparelhos saem, e quem trocou
// continua conectado porque a rota regrava a própria sessão com o epoch novo.
const bcrypt = require("bcryptjs");
const { HackError, findByEmail, canAccess } = require("./people");

const MIN_LENGTH = 8;
// bcrypt só lê os primeiros 72 bytes: acima disso o resto seria ignorado.
const MAX_BYTES = 72;
const COST = 10;

// Hash de uma senha que ninguém tem: comparar contra ele quando o e-mail não
// existe (ou não tem senha) iguala o tempo de resposta ao de uma senha errada.
const DUMMY_HASH = bcrypt.hashSync("lepv-hack-dummy-" + Date.now(), COST);

const OBVIOUS = new Set([
  "12345678", "123456789", "1234567890", "87654321", "password", "password1", "senha123",
  "senha1234", "qwertyui", "qwerty123", "abcdefgh", "abc12345", "11111111", "00000000",
  "iloveyou", "hackathon", "lepv2026", "hackathon2026",
]);

// Devolve a mensagem do problema, ou "" se a senha serve.
function passwordProblem(pw, person) {
  if (typeof pw !== "string" || pw.length < MIN_LENGTH) return "A senha precisa ter pelo menos " + MIN_LENGTH + " caracteres.";
  if (Buffer.byteLength(pw, "utf8") > MAX_BYTES) return "Senha longa demais. Use uma mais curta (letras com acento contam em dobro).";
  const low = pw.toLowerCase();
  const email = String((person && person.email) || "").toLowerCase();
  const local = email.split("@")[0];
  if (OBVIOUS.has(low) || /^(.)\1+$/.test(pw)) return "Essa senha é fácil de adivinhar. Escolha outra.";
  if (email && (low === email || (local.length >= 4 && low === local))) return "A senha não pode ser o seu e-mail.";
  return "";
}

// Senha nova → hash. A API assíncrona do bcryptjs (JS puro) divide o
// trabalho em fatias e devolve o event loop entre elas; e fica FORA do
// store.mutate, que é síncrono. Quem chama grava o hash com applyPassword.
async function hashPassword(pw, person) {
  const problem = passwordProblem(pw, person);
  if (problem) throw new HackError(400, "weak_password", problem);
  return bcrypt.hash(pw, COST);
}

// Grava o hash (dentro do mutate) e sobe o epoch. Devolve o epoch novo.
function applyPassword(person, hash, now) {
  person.passwordHash = hash;
  person.passwordSetAt = now.toISOString();
  person.sessionEpoch = (person.sessionEpoch || 1) + 1;
  return person.sessionEpoch;
}

// Apaga a senha. Usada sempre que o acesso de alguém é revogado (Desconectar,
// Bloquear, promoção a jurado/staff, troca de e-mail): senão quem estava
// dentro volta por e-mail e senha logo depois. A pessoa cria outra entrando
// pelo link. (Tirar o papel de representante não apaga: a pessoa continua
// entrando com os papéis que restaram.)
function clearPassword(person) {
  delete person.passwordHash;
  delete person.passwordSetAt;
}

async function checkPassword(person, pw) {
  // Corpo enorme não chega ao bcrypt (que só leria 72 bytes de qualquer jeito).
  if (typeof pw === "string" && Buffer.byteLength(pw, "utf8") > MAX_BYTES) return false;
  const hash = person && person.passwordHash;
  const ok = await bcrypt.compare(typeof pw === "string" ? pw : "", hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}

// E-mail + senha → pessoa, ou null. Inexistente, sem senha, bloqueada e senha
// errada dão o mesmo null, no mesmo tempo (sempre um compare de bcrypt).
// Relê a pessoa depois do compare: o await abre espaço para um bloqueio.
async function authenticate(store, email, pw) {
  const before = findByEmail(store.get(), email);
  const ok = await checkPassword(before, pw);
  const p = findByEmail(store.get(), email);
  return ok && p && p.id === before.id && p.passwordHash === before.passwordHash && canAccess(p) ? p : null;
}

module.exports = { MIN_LENGTH, passwordProblem, hashPassword, applyPassword, clearPassword, checkPassword, authenticate };
