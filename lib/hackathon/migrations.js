// Migrações de dados que rodam no boot sobre o hackathon.json já gravado.
const { migrateProgram } = require("./program");
const { migrateStartAnnouncement } = require("./announcements");

// Horários de 25/10: a sexta e o aviso de início andam juntos. Se a
// programação não foi trocada (diretoria editou a sexta), o aviso fica às 15h
// para não dizer "começou" antes da hora que o portal mostra.
function migrateSchedule(state, { now = new Date(), log = console } = {}) {
  const program = migrateProgram(state, log);
  if (program === "noop") return false;
  if (program === "applied") {
    const moved = migrateStartAnnouncement(state, now);
    log.log(moved
      ? "[hack] avisos: 'O hackathon começou!' agendado para 14h30."
      : "[hack] avisos: 'O hackathon começou!' mantido como estava (editado, publicado ou fora do prazo).");
  } else {
    log.warn("[hack] avisos: 'O hackathon começou!' mantido no horário anterior, junto com a programação.");
  }
  return true;
}

module.exports = { migrateSchedule };
