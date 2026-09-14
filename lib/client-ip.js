"use strict";
// Quem é o visitante quando há proxies no caminho.
//
// O Railway põe um salto na frente do app; a Cloudflare, quando o proxy da
// zona está ligado (nuvem laranja), põe outro. Com `trust proxy` fixo em 1,
// req.ip viraria o IP da Cloudflare e todo rate limit por IP (login, cadastro,
// inscrição, presença) agruparia o mundo inteiro num contador só.
//
// A regra aqui: o primeiro salto (o próprio Railway, dono do socket) é sempre
// confiável; qualquer salto seguinte só é confiável se for um IP publicado
// pela Cloudflare. Assim o app funciona igual com a nuvem laranja ligada ou
// desligada, e um cliente falando direto com o Railway não consegue forjar o
// próprio IP escrevendo X-Forwarded-For: o último salto real nunca é Cloudflare.
//
// Faixas de https://www.cloudflare.com/ips-v4 e /ips-v6, lidas em 14/09/2026.
// Mudam raramente; se a Cloudflare anunciar faixa nova, atualizar aqui.
const net = require("net");

const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const cloudflare = new net.BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [addr, bits] = range.split("/");
  cloudflare.addSubnet(addr, parseInt(bits, 10), net.isIPv6(addr) ? "ipv6" : "ipv4");
}

function isCloudflareIp(ip) {
  if (typeof ip !== "string") return false;
  // O Node entrega IPv4 mapeado em IPv6 (::ffff:1.2.3.4) em socket dual-stack.
  const plain = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (net.isIPv4(plain)) return cloudflare.check(plain, "ipv4");
  if (net.isIPv6(plain)) return cloudflare.check(plain, "ipv6");
  return false;
}

// Assinatura que o Express espera em app.set("trust proxy", fn): recebe o IP
// do salto e a posição dele contando do app para fora (0 = quem abriu o socket).
function trustProxy(ip, hop) {
  if (hop === 0) return true;
  return isCloudflareIp(ip);
}

module.exports = { CLOUDFLARE_RANGES, isCloudflareIp, trustProxy };
