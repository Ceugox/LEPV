// Envio de e-mail do hackathon.
//
// Produção: Resend (RESEND_API_KEY, remetente HACK_EMAIL_FROM). Sem chave, o
// envio devolve "unconfigured" — nunca finge que mandou.
// Desenvolvimento e teste: HACK_EMAIL_OUTBOX=<dir> grava cada mensagem como
// arquivo JSON nesse diretório em vez de enviar. É assim que a e2e pega o link
// de acesso sem rede e sem segredo.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RESEND_URL = "https://api.resend.com/emails";

function emailConfig() {
  return {
    outbox: process.env.HACK_EMAIL_OUTBOX || "",
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.HACK_EMAIL_FROM || "1º Hackathon LEPV <hackathon@lepv.org>",
  };
}

function emailEnabled() {
  const c = emailConfig();
  return Boolean(c.outbox || c.apiKey);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Molde visual mínimo do e-mail, nas cores da LP (tinta + vermelho LEPV).
function layout({ title, paragraphs, cta }) {
  const ps = paragraphs.map((p) => `<p style="margin:0 0 14px;font:16px/1.55 Arial,sans-serif;color:#f5f1ec">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#d31e24;color:#ffffff;font:700 16px Arial,sans-serif;text-decoration:none;padding:14px 22px;border-radius:999px">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0b0d;padding:28px 16px"><div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 18px;font:700 13px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#ff5a5f">1º Hackathon LEPV</p>
<h1 style="margin:0 0 18px;font:800 26px/1.15 Arial,sans-serif;color:#ffffff">${escapeHtml(title)}</h1>${ps}${button}
<p style="margin:26px 0 0;font:12px/1.5 Arial,sans-serif;color:#c9c2bd">LEPV — Liga de Empreendedorismo da Praia Vermelha · lepv.org/hack</p>
</div></body></html>`;
}

// Devolve { status, error? }: "sent" (provedor aceitou), "outbox" (gravado
// em arquivo, teste), "unconfigured" (sem chave), "failed" (recusado) ou
// "unknown" (timeout/queda: não dá para saber se saiu).
async function sendEmail({ to, subject, text, html }) {
  const c = emailConfig();
  if (!to) return { status: "failed", error: "sem destinatário" };
  if (c.outbox) {
    fs.mkdirSync(c.outbox, { recursive: true });
    const name = Date.now() + "-" + crypto.randomBytes(4).toString("hex") + ".json";
    fs.writeFileSync(path.join(c.outbox, name), JSON.stringify({ to, subject, text, html, from: c.from }, null, 2));
    return { status: "outbox" };
  }
  if (!c.apiKey) return { status: "unconfigured" };
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + c.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { status: "sent" };
    const body = await res.text().catch(() => "");
    return { status: "failed", error: "HTTP " + res.status + " " + body.slice(0, 200) };
  } catch (err) {
    // Timeout ou queda de rede: não dá para saber se o Resend recebeu.
    return { status: "unknown", error: err.message };
  }
}

module.exports = { sendEmail, emailEnabled, layout, escapeHtml };
