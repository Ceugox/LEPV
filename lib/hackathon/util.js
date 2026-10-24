// Utilidades HTTP da plataforma do hackathon.
const { HackError } = require("./people");

// Envolve um handler (sync ou async): HackError vira resposta JSON com o
// status dela; qualquer outro erro vira 500 genérico e vai para o log.
function route(fn) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch((err) => {
        if (err instanceof HackError) {
          return res.status(err.status).json({ error: err.code, message: err.message });
        }
        console.error("[hack] erro em " + req.method + " " + req.path + ":", err && err.stack ? err.stack : err);
        if (!res.headersSent) res.status(500).json({ error: "internal", message: "Erro interno. Tente de novo." });
      });
  };
}

// Limite por chave em janela fixa. Memória do processo: some no restart, o
// que é aceitável para conter abuso, não para auditoria.
function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return function limited(key) {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now - rec.start > windowMs) {
      hits.set(key, { start: now, n: 1 });
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      }
      return false;
    }
    rec.n += 1;
    return rec.n > limit;
  };
}

// Telefone brasileiro para o wa.me: só dígitos, com 55 na frente quando vier
// com DDD e sem país. Devolve "" se não parecer telefone.
function waPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return "";
  return d;
}

function waLink(phone, text) {
  const p = waPhone(phone);
  if (!p) return "";
  return "https://wa.me/" + p + "?text=" + encodeURIComponent(text);
}

const isHttpUrl = (s) => {
  try {
    const u = new URL(String(s));
    return u.protocol === "https:" || u.protocol === "http:";
  } catch (e) {
    return false;
  }
};

function requireBody(req) {
  if (!req.body || typeof req.body !== "object") throw new HackError(400, "invalid_body", "Requisição inválida.");
  return req.body;
}

module.exports = { route, rateLimiter, waPhone, waLink, isHttpUrl, requireBody, HackError };
