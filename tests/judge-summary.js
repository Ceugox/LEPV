const assert = require("node:assert/strict");
const { summarize } = require("../lib/hackathon/judge-summary");

async function main() {
  const input = { notes: [{ text: "Fluxo claro, mas não mostrou tratamento de erro." }], criteria: [{ name: "Tech" }], teamName: "Alfa" };
  await assert.rejects(summarize(input, { env: {} }), (e) => e.code === "summary_unavailable");
  let payload;
  const summary = await summarize(input, { env: { HACK_JUDGE_AI_KEY: "test-only-key" }, fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    payload = JSON.parse(options.body);
    assert.equal(options.headers["x-api-key"], "test-only-key");
    assert(!options.body.includes("test-only-key"));
    return { ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Fluxo claro; erros não demonstrados [1]." }] }) };
  } });
  assert.equal(summary, "Fluxo claro; erros não demonstrados [1].");
  assert.equal(JSON.parse(payload.messages[0].content).comentarios.length, 1);
  assert(payload.system.includes("não atribua ou sugira notas"));
  for (const result of [{ ok: false }, { ok: true, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "text", text: "incompleto" }] }) }]) {
    await assert.rejects(summarize(input, { env: { HACK_JUDGE_AI_KEY: "private-test" }, fetchImpl: async () => result }),
      (e) => e.code === "summary_failed" && !e.message.includes("private-test"));
  }
  await assert.rejects(summarize({ ...input, notes: [] }, { env: { HACK_JUDGE_AI_KEY: "x" } }), (e) => e.code === "no_notes");
  console.log("Resumo dos jurados: testes passaram");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
