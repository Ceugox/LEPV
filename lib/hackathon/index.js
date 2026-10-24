// Plataforma do 1º Hackathon LEPV, servida sob /hack.
//
// Composição: o server.js chama registerHackathonRoutes(app, deps) ANTES do
// express.static, para que as rotas limpas (/hack/acesso, /hack/portal...)
// vençam os arquivos e nenhuma página privada dependa só do HTML estático.
// Toda autorização acontece na API; o HTML é casca sem dado.
const path = require("path");

function registerHackathonRoutes(app, deps) {
  const { publicDir, readEventsStore } = deps;
  const hackDir = path.join(publicDir, "hack");
  const page = (file) => (req, res) => res.sendFile(path.join(hackDir, file));

  // O evento do hackathon: HACK_EVENT_ID fixa um específico; sem ele, o
  // próximo (data mais cedo a partir de hoje) e, se todos passaram, o último.
  // "Mais recente" sozinho pegaria uma edição futura cadastrada com antecedência.
  function hackathonEvent() {
    const events = readEventsStore().events.filter((e) => e.type === "hackathon");
    if (process.env.HACK_EVENT_ID) return events.find((e) => e.id === process.env.HACK_EVENT_ID) || null;
    const today = deps.todayBR();
    const byDate = events.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return byDate.find((e) => e.date >= today) || byDate[byDate.length - 1] || null;
  }

  // Sem barra, o escopo do service worker (/hack/) não cobre a página. O
  // roteador do Express não é estrito: "/hack" e "/hack/" caem na mesma rota,
  // então a distinção é pela URL original.
  app.get("/hack", (req, res) => {
    const q = req.originalUrl.indexOf("?");
    const pathname = q === -1 ? req.originalUrl : req.originalUrl.slice(0, q);
    if (pathname === "/hack") return res.redirect(301, "/hack/" + (q === -1 ? "" : req.originalUrl.slice(q)));
    res.sendFile(path.join(hackDir, "index.html"));
  });

  // Páginas dos próximos módulos: até lá, uma casca "em breve" em vez de 404.
  app.get(["/hack/acesso", "/hack/parceiros"], page("em-breve.html"));

  // A inscrição continua sendo a do evento (inscricao.html?t=...); a LP só
  // aponta para ela, e sabe dizer quando as inscrições fecharam.
  app.get("/hack/inscricao", (req, res) => {
    const ev = hackathonEvent();
    if (ev && ev.signups && ev.signups.open && ev.signups.token) {
      return res.redirect(302, "/inscricao.html?t=" + ev.signups.token);
    }
    res.redirect(302, "/hack/?inscricoes=encerradas");
  });

  return { hackathonEvent };
}

module.exports = { registerHackathonRoutes };
