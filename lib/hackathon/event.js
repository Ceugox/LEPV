// Qual evento de events.json é o hackathon desta plataforma, e para onde vai
// o "Inscreva-se". Funções puras: testadas em tests/hackathon.js.

// envId (HACK_EVENT_ID) fixa um evento. Sem ele: o próximo hackathon (data
// mais cedo a partir de hoje, inclusive o próprio dia) e, se todos passaram,
// o último. "Mais recente" sozinho pegaria uma edição futura cadastrada com
// antecedência no meio da atual.
//
// O evento dura dois dias (30 e 31/10) mas ev.date guarda o primeiro: no dia
// 31 ele já "passou" pela comparação de data. Por isso a comparação usa
// ontem (graceDay): o evento de ontem ainda é o atual.
function pickHackathonEvent(events, today, envId) {
  const list = (events || []).filter((e) => e && e.type === "hackathon");
  if (envId) return list.find((e) => e.id === envId) || null;
  const graceDay = new Date(Date.parse(today + "T12:00:00Z") - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const byDate = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return byDate.find((e) => e.date >= graceDay) || byDate[byDate.length - 1] || null;
}

// Devolve { location, reason }: reason "open" vai ao formulário; os demais
// caem no aviso de inscrições encerradas, mas com o motivo para o log.
function signupRedirect(ev) {
  const closed = "/hack/?inscricoes=encerradas";
  if (!ev) return { location: closed, reason: "no_event" };
  if (!ev.signups || !ev.signups.token) return { location: closed, reason: "no_token" };
  if (!ev.signups.open) return { location: closed, reason: "closed" };
  return { location: "/inscricao.html?t=" + encodeURIComponent(ev.signups.token), reason: "open" };
}

module.exports = { pickHackathonEvent, signupRedirect };
