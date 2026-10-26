// Senha pessoal da plataforma do hackathon. É opcional: o link de uso único
// continua valendo como entrada e como recuperação ("esqueci minha senha").
//
// Guardada só como hash bcrypt em person.passwordHash. Criar ou trocar a
// senha sobe person.sessionEpoch: os outros aparelhos saem, e quem trocou
// continua conectado porque a rota regrava a própria sessão com o epoch novo.
const bcrypt = require("bcryptjs");
const { HackError, findByEmail, canAccess } = require("./people");

const MIN_LENGTH = 8;
const MAX_LENGTH = 200;
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
  if (pw.length > MAX_LENGTH) return "Senha longa demais.";
  const low = pw.toLowerCase();
  const email = String((person && person.email) || "").toLowerCase();
  const local = email.split("@")[0];
  if (OBVIOUS.has(low) || /^(.)\1+$/.test(pw)) return "Essa senha é fácil de adivinhar. Escolha outra.";
  if (email && (low === email || (local.length >= 4 && low === local))) return "A senha não pode ser o seu e-mail.";
  return "";
}

// Grava a senha nova. Devolve o epoch novo da pessoa.
function setPassword(person, pw, now) {
  const problem = passwordProblem(pw, person);
  if (problem) throw new HackError(400, "weak_password", problem);
  person.passwordHash = bcrypt.hashSync(pw, COST);
  person.passwordSetAt = now.toISOString();
  person.sessionEpoch = (person.sessionEpoch || 1) + 1;
  return person.sessionEpoch;
}

// Apaga a senha. Usada sempre que o acesso de alguém é revogado (Desconectar,
// promoção a jurado/staff, troca de e-mail): senão quem estava dentro volta
// por e-mail e senha logo depois. A pessoa cria outra entrando pelo link.
function clearPassword(person) {
  delete person.passwordHash;
  delete person.passwordSetAt;
}

function checkPassword(person, pw) {
  const hash = person && person.passwordHash;
  const ok = bcrypt.compareSync(typeof pw === "string" ? pw.slice(0, MAX_LENGTH) : "", hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}

// E-mail + senha → pessoa, ou null. Inexistente, sem senha, bloqueada e senha
// errada dão o mesmo null, no mesmo tempo (sempre um compare de bcrypt).
function authenticate(state, email, pw) {
  const p = findByEmail(state, email);
  const ok = checkPassword(p, pw);
  return ok && canAccess(p) ? p : null;
}

module.exports = { MIN_LENGTH, passwordProblem, setPassword, clearPassword, checkPassword, authenticate };
