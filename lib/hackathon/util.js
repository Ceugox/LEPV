// Utilidades HTTP da plataforma do hackathon.
const { HackError } = require("./people");

// Quem recebe os 500 (o motor de resiliência do servidor, via index.js).
let reporter = (scope, err) => console.error("[" + scope + "]", err && err.stack ? err.stack : err);
function setReporter(fn) {
  reporter = fn;
}

// Envolve um handler (sync ou async): HackError vira resposta JSON com o
// status dela; qualquer outro erro vira 500 genérico e vai para o registro.
function route(fn) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch((err) => {
        if (err instanceof HackError) {
          return res.status(err.status).json({ error: err.code, message: err.message });
        }
        reporter("hack:" + req.method + " " + req.path, err);
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

// Classifica erro de envio:
//   - não conectou (DNS, recusado): "failed", tenta de novo;
//   - timeout ou queda NO MEIO da conversa: "unknown", pode ter chegado;
//   - qualquer outro (chave inválida, payload, bug): "failed" — não é "talvez
//     entregue", é configuração errada, e precisa aparecer como falha.
const NO_CONNECT = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "CERT_HAS_EXPIRED"];
const MIDWAY = ["ETIMEDOUT", "ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ESOCKETTIMEDOUT"];
function networkOutcome(err) {
  const code = (err && (err.code || (err.cause && err.cause.code))) || "";
  const name = (err && err.name) || "";
  const msg = String((err && err.message) || err).slice(0, 200);
  const label = (code ? code + " " : "") + msg;
  if (NO_CONNECT.includes(code)) return { status: "failed", error: label };
  if (MIDWAY.includes(code) || name === "TimeoutError" || name === "AbortError") return { status: "unknown", error: label };
  return { status: "failed", error: label };
}

const isRailway = (env) => Boolean(env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID);

// Base dos links de acesso. HACK_PUBLIC_URL vence; no Railway, o domínio
// oficial; fora dele (dev), o host da requisição. Em produção o cabeçalho
// Host vem do cliente e não pode decidir para onde aponta um link de acesso.
function publicBaseFor(env, req) {
  if (env.HACK_PUBLIC_URL) return env.HACK_PUBLIC_URL.replace(/\/$/, "");
  if (isRailway(env) || !req) return "https://lepv.org";
  return req.protocol + "://" + req.get("host");
}

module.exports = { route, setReporter, rateLimiter, waPhone, waLink, isHttpUrl, requireBody, publicBaseFor, isRailway, networkOutcome, HackError };
