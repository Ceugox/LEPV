// Estado da plataforma do hackathon: um arquivo JSON no volume, carregado na
// memória e regravado a cada mutação.
//
// Consistência: toda alteração passa por mutate(fn), que é síncrono do começo
// ao fim (lê da memória, aplica, grava com writeStore atômico). No Node isso é
// uma seção crítica de graça — duas requisições não intercalam dentro dela.
// Por isso nada assíncrono (upload, e-mail, push) pode acontecer dentro de fn:
// faça o trabalho lento antes e só registre o resultado dentro.
//
// Um único processo escritor. Mais de uma réplica exige outra persistência.
const crypto = require("crypto");

const SCHEMA_VERSION = 1;

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    config: {
      submissionDeadline: "2026-10-31T13:00:00-03:00",
      evaluation: {
        criteria: [],
        criteriaLocked: false,
        open: false,
        phase: "main", // "main" | "final"
        finalists: [],
        tiebreakCriterionId: null, // desempate da fase 1
        finalTiebreakCriterionId: null,
        mainSnapshot: null, // ranking da fase 1 congelado quando a final abre
        resultsLocked: false,
        revealedAt: null,
        podiumSize: 3,
      },
      whatsappAutomation: false,
      // Código e link do crédito de IA: só no volume (o repo é público).
      aiCredit: { code: "", redeemUrl: "" },
    },
    people: [],
    tokens: [],
    announcements: [],
    deliveries: [],
    pushSubs: [],
    orgs: [],
    partnerRequests: [],
    program: [],
    teams: [],
    invites: [],
    submissions: [],
    conflicts: [],
    scores: [],
    checkins: [],
    devices: [],
    exportLog: [],
    checkinOps: [],
    questions: [],
    removals: [],
  };
}

// Completa chaves que faltam (arquivo de versão anterior) sem apagar dados.
function normalize(state) {
  const base = emptyState();
  const out = Object.assign({}, base, state);
  out.config = Object.assign({}, base.config, state.config || {});
  out.config.evaluation = Object.assign({}, base.config.evaluation, (state.config || {}).evaluation || {});
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = [];
  }
  out.version = SCHEMA_VERSION;
  return out;
}

function createStore({ filePath, readStore, writeStore, fs, seed, migrate }) {
  let state;
  if (fs.existsSync(filePath)) {
    state = normalize(readStore(filePath));
    if (migrate && migrate(state)) writeStore(filePath, state);
  } else {
    state = emptyState();
    if (seed) seed(state);
    writeStore(filePath, state);
  }

  return {
    // Leitura: devolve o estado vivo. Quem lê não altera — para isso, mutate.
    get() {
      return state;
    },
    // fn recebe o estado e pode alterá-lo; se lançar, nada é gravado e o
    // estado em memória volta ao anterior.
    mutate(fn) {
      const snapshot = JSON.stringify(state);
      try {
        const result = fn(state);
        writeStore(filePath, state);
        return result;
      } catch (err) {
        state = JSON.parse(snapshot);
        throw err;
      }
    },
  };
}

const id = (prefix) => prefix + crypto.randomBytes(6).toString("hex");
const secret = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

module.exports = { createStore, emptyState, normalize, id, secret, sha256, SCHEMA_VERSION };
