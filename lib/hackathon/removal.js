// Exclusão de participante pelo superadmin (Revisão 6 da spec, 26/10/2026).
//
// Excluir é definitivo: a pessoa e os dados dela no /hack somem (links,
// aparelhos de notificação, recibos de aviso, presenças, dúvidas, convites e
// indicações), e a rota apaga também a inscrição no evento — senão a
// sincronização recriaria a pessoa no minuto seguinte. A versão reversível
// continua sendo o "Bloquear".
//
// Só participante (confirmado ou na fila). Jurado, staff e representante de
// parceiro não: apagar quem tem outro papel mexeria em notas, credenciamento
// ou agenda de organização — para eles, Bloquear.
//
// Fica um registro mínimo (nome, quando, quem excluiu) em state.removals, que
// a Visão geral do superadmin mostra. Nada além do nome do excluído.
const { HackError, findPerson } = require("./people");
const T = require("./teams");

// Confere, sem mudar nada, se dá para excluir. Devolve a pessoa.
function checkRemovable(state, personId) {
  const p = findPerson(state, personId);
  if (!p) throw new HackError(404, "not_found", "Pessoa não encontrada.");
  // "removed": exclusão anterior que apagou a inscrição e parou antes do /hack.
  const isParticipant = p.roles.includes("participant") || p.signupStatus === "waitlist" || p.signupStatus === "removed";
  const others = p.roles.filter((r) => r !== "participant");
  if (!isParticipant || !p.signupId) throw new HackError(409, "not_participant", "Só participantes inscritos podem ser excluídos.");
  if (others.length) {
    throw new HackError(409, "has_other_roles", "Essa pessoa também é jurado, staff ou parceiro: use Bloquear.");
  }
  const t = T.teamOf(state, p.id);
  if (t && t.members.length === 1 && T.hasSubmission(state, t.id)) {
    throw new HackError(409, "has_submission", "A equipe dela já tem entrega e ela é a única integrante: desfaça a entrega antes.");
  }
  return p;
}

// Apaga a pessoa e tudo o que é dela no estado do hackathon. Roda dentro de
// um store.mutate (erro desfaz tudo).
function removePerson(state, personId, now, byName) {
  const p = checkRemovable(state, personId);
  const t = T.teamOf(state, p.id);
  if (t) T.leave(state, t, p.id, now);
  const mine = (x) => x.personId === p.id;
  state.tokens = state.tokens.filter((x) => !mine(x));
  state.pushSubs = state.pushSubs.filter((x) => !mine(x));
  state.deliveries = state.deliveries.filter((x) => !mine(x));
  state.checkins = state.checkins.filter((x) => !mine(x));
  state.questions = state.questions.filter((x) => !mine(x));
  state.invites = state.invites.filter((x) => x.personId !== p.id && x.fromId !== p.id);
  // O registro de operação offline fica (é ele que impede reaplicar a mesma
  // leitura), mas sem o nome nem o id de quem foi excluído.
  for (const op of state.checkinOps) {
    if (op.result && op.result.personId === p.id) Object.assign(op.result, { personId: null, name: null });
  }
  state.people = state.people.filter((x) => x.id !== p.id);
  (state.removals = state.removals || []).push({ name: p.name, at: now.toISOString(), by: byName || "" });
  if (state.removals.length > 500) state.removals = state.removals.slice(-500);
  return { name: p.name, signupId: p.signupId };
}

module.exports = { checkRemovable, removePerson };
