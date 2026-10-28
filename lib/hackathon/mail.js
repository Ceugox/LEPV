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

const { networkOutcome } = require("./util");

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

// Molde visual dos e-mails do hackathon, na linguagem da LP "Noite no Rio":
// foto do Pão de Açúcar à noite, tinta, serifa no título e o vermelho LEPV.
//
// Feito para programa de e-mail, não para navegador: tabelas, estilo inline,
// largura de 600px que encolhe no celular, botão em tabela (o Outlook ignora
// padding em <a>) e nenhuma fonte da web (quase nenhum leitor carrega; a
// serifa cai em Georgia). Imagens por URL absoluta da base pública; com
// imagens bloqueadas, o texto alternativo e a cor de fundo seguram a peça.
//
//   base: origem dos links e imagens (https://lepv.org em produção);
//   preheader: a linha cinza que o leitor mostra ao lado do assunto;
//   eyebrow: rótulo acima do título ("Aviso da organização", "Urgente");
//   urgent: pinta o rótulo de vermelho cheio;
//   title / titleEm: título, com o fim opcional em itálico vermelho;
//   facts: [[rótulo, valor]] em bloco destacado (data e local do evento);
//   paragraphs: corpo antes do botão, um parágrafo por item;
//   cta: { label, url } — o botão;
//   fallbackUrl: o endereço do botão escrito por extenso;
//   after: parágrafos depois do botão (detalhes que não devem empurrá-lo);
//   note: linha pequena no fim do cartão (aviso de segurança).
const C = {
  ink: "#0b0b0d",
  card: "#141215",
  line: "#2a252b",
  paper: "#f5f1ec",
  muted: "#b9b1ab",
  red: "#d31e24",
  redLit: "#ff5a5f",
};
const SANS = "Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

function layout(o) {
  const base = String(o.base || "https://lepv.org").replace(/\/$/, "");
  const e = escapeHtml;
  const para = (list) =>
    (list || [])
      .map((p) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.paper}">${e(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  const ps = para(o.paragraphs);
  const after = para(o.after);
  const eyebrow = o.eyebrow
    ? o.urgent
      ? `<span style="display:inline-block;background:${C.red};color:#ffffff;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:5px 10px;border-radius:4px">${e(o.eyebrow)}</span>`
      : `<span style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.redLit}">${e(o.eyebrow)}</span>`
    : "";
  const title = `<h1 style="margin:14px 0 22px;font-family:${SERIF};font-size:34px;line-height:1.1;font-weight:400;color:#ffffff">${e(o.title)}${
    o.titleEm ? ` <em style="font-style:italic;color:${C.redLit}">${e(o.titleEm)}</em>` : ""
  }</h1>`;
  const facts = (o.facts || []).length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 24px;border-collapse:collapse"><tr><td style="background:${C.ink};border-left:3px solid ${C.red};border-radius:0 8px 8px 0;padding:14px 18px">${o.facts
        .map(
          ([k, v], i) =>
            `<p style="margin:${i ? "10px" : "0"} 0 0;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.redLit}">${e(k)}</p><p style="margin:3px 0 0;font-family:${SANS};font-size:15px;line-height:1.45;color:#ffffff">${e(v).replace(/\n/g, "<br>")}</p>`
        )
        .join("")}</td></tr></table>`
    : "";
  const button = o.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr><td align="center" bgcolor="${C.red}" style="border-radius:999px"><a href="${e(o.cta.url)}" style="display:inline-block;padding:15px 28px;font-family:${SANS};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${e(o.cta.label)} &rarr;</a></td></tr></table>`
    : "";
  const fallback = o.fallbackUrl
    ? `<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted}">Se o botão não abrir, copie este endereço no navegador:</p><p style="margin:0 0 4px;font-family:${SANS};font-size:13px;line-height:1.5;word-break:break-all"><a href="${e(o.fallbackUrl)}" style="color:${C.redLit};text-decoration:underline">${e(o.fallbackUrl)}</a></p>`
    : "";
  const note = o.note
    ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted}">${e(o.note)}</p>`
    : "";
  // Espaços de largura zero depois do preheader: o leitor não completa a
  // prévia com o começo do corpo.
  const pre = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.ink};opacity:0">${e(o.preheader)}${"&#8203;&nbsp;".repeat(60)}</div>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${e(o.title)}</title>
<style>
  @media (max-width: 620px) {
    .wrap { width: 100% !important; }
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .hero { height: auto !important; }
    h1 { font-size: 29px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ink}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" style="background:${C.ink}">
<tr><td align="center" style="padding:24px 12px 32px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
    <tr><td style="padding:0 6px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle"><img src="${base}/hack/img/email-logo.png" width="28" height="26" alt="" style="display:block;border:0"></td>
        <td style="vertical-align:middle;padding-left:10px;font-family:${SANS};font-size:15px;font-weight:800;letter-spacing:.06em;color:#ffffff">LEPV</td>
        <td style="vertical-align:middle;padding-left:12px;font-family:${SANS};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">1º Hackathon</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background:${C.card};border-radius:18px;overflow:hidden">
      <img class="hero" src="${base}/hack/img/email-header.jpg" width="600" height="200" alt="Pão de Açúcar e a Baía de Guanabara à noite" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px 18px 0 0;background:${C.card};color:${C.muted};font-family:${SANS};font-size:12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="pad" style="padding:8px 40px 36px">
          ${eyebrow}${title}${ps}${button}${fallback}${facts}${after}${note}
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="pad" style="padding:22px 26px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">
      <strong style="color:${C.paper}">1º Hackathon LEPV</strong> · 30 e 31 de outubro de 2026 · Rio de Janeiro<br>
      LEPV · Liga de Empreendedorismo da Praia Vermelha<br>
      <a href="${base}/hack/" style="color:${C.muted};text-decoration:underline">lepv.org/hack</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
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
    // Sem conexão: "failed" (tenta de novo). Timeout/queda no meio: "unknown".
    return networkOutcome(err);
  }
}

module.exports = { sendEmail, emailEnabled, layout, escapeHtml };
