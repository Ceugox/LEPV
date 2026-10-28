// Crédito de IA dos parceiros (Featherless): código promocional e link de
// resgate. O repositório é público, então os dois só existem no volume
// (config.aiCredit), cadastrados pela diretoria. O participante só recebe o
// código depois de um check-in validado (qualquer dia, qualquer credenciador);
// desfeito o check-in, o código volta a ficar oculto.
const { HackError } = require("./util");

const CODE_RE = /^[A-Za-z0-9_-]{3,40}$/;

function validateCredit(body) {
  const code = String((body && body.code) || "").trim();
  const redeemUrl = String((body && body.redeemUrl) || "").trim();
  // Os dois vazios desligam a liberação.
  if (!code && !redeemUrl) return { code: "", redeemUrl: "" };
  if (!CODE_RE.test(code)) throw new HackError(400, "invalid_code", "Código inválido: use de 3 a 40 letras, números, - ou _.");
  if (redeemUrl && (!/^https:\/\/[^\s]+$/.test(redeemUrl) || redeemUrl.length > 300)) {
    throw new HackError(400, "invalid_url", "O link de resgate precisa começar com https://.");
  }
  return { code, redeemUrl };
}

function creditConfig(state) {
  const c = (state.config && state.config.aiCredit) || {};
  return { code: c.code || "", redeemUrl: c.redeemUrl || "" };
}

// O que o portal mostra a uma pessoa. Sem check-in, nada do código sai daqui.
function creditFor(state, person) {
  const cfg = creditConfig(state);
  const eligible = Boolean(person && !person.disabled && person.roles.includes("participant"));
  const checkedIn = eligible && state.checkins.some((c) => c.personId === person.id);
  const out = { configured: Boolean(cfg.code), eligible, checkedIn, released: checkedIn && Boolean(cfg.code) };
  if (out.released) Object.assign(out, cfg);
  return out;
}

module.exports = { validateCredit, creditConfig, creditFor };
