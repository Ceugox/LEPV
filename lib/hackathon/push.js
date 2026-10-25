// Web Push (VAPID) do hackathon.
//
// Produção: HACK_VAPID_PUBLIC_KEY / HACK_VAPID_PRIVATE_KEY (gere com
// `npx web-push generate-vapid-keys`) e HACK_VAPID_SUBJECT (mailto:). Sem as
// chaves, push fica indisponível e o portal não oferece o botão.
// Teste: HACK_PUSH_OUTBOX=<dir> grava cada envio como arquivo, sem rede.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");
const { networkOutcome } = require("./util");

// Serviços de push dos navegadores (Chrome/Android, Firefox, Edge/Windows,
// Safari/iPhone). Endpoint fora daqui é recusado: senão o servidor viraria
// disparador de requisições para qualquer endereço.
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

function config() {
  return {
    publicKey: process.env.HACK_VAPID_PUBLIC_KEY || "",
    privateKey: process.env.HACK_VAPID_PRIVATE_KEY || "",
    subject: process.env.HACK_VAPID_SUBJECT || "mailto:hackathon@lepv.org",
    outbox: process.env.HACK_PUSH_OUTBOX || "",
  };
}

function createPush() {
  const c = config();
  let real = Boolean(c.publicKey && c.privateKey);
  if (real) {
    // Chave VAPID malformada não pode derrubar o boot: push fica desligado e o
    // painel mostra o canal como indisponível.
    try {
      webpush.setVapidDetails(c.subject, c.publicKey, c.privateKey);
    } catch (err) {
      console.error("[hack] chaves VAPID inválidas, push desligado:", err.message);
      real = false;
    }
  }

  return {
    enabled: () => real || Boolean(c.outbox),
    // Chave pública para o navegador assinar a inscrição.
    publicKey: () => (real ? c.publicKey : c.outbox ? "BOUTBOX-TEST-KEY" : ""),
    // Devolve { status: "sent"|"failed"|"unknown", gone?, error? }.
    async send(sub, payload, urgent) {
      if (c.outbox) {
        fs.mkdirSync(c.outbox, { recursive: true });
        fs.writeFileSync(
          path.join(c.outbox, Date.now() + "-" + crypto.randomBytes(3).toString("hex") + ".json"),
          JSON.stringify({ endpoint: sub.endpoint, personId: sub.personId, payload: JSON.parse(payload), urgent })
        );
        return { status: "sent" };
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
          TTL: 60 * 60 * 6,
          urgency: urgent ? "high" : "normal",
          timeout: 15000,
        });
        return { status: "sent" };
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) return { status: "failed", gone: true, error: "inscrição expirada (" + code + ")" };
        if (code) return { status: "failed", error: "HTTP " + code };
        return networkOutcome(err);
      }
    },
  };
}

// Valida a inscrição vinda do navegador (PushSubscription.toJSON()).
function validSubscription(s, opts) {
  if (!s || typeof s !== "object") return null;
  const endpoint = String(s.endpoint || "");
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint)) return null;
  let host;
  try {
    host = new URL(endpoint).hostname;
  } catch (e) {
    return null;
  }
  if (!(opts && opts.anyHost) && !PUSH_HOSTS.some((re) => re.test(host))) return null;
  const keys = s.keys || {};
  const p256dh = String(keys.p256dh || "");
  const auth = String(keys.auth || "");
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,60}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

module.exports = { createPush, validSubscription };
