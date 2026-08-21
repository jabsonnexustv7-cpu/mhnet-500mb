import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenAiPayload, createOpenAiAssist, sanitizeServerMessage, validateAssistRequest } from "../../../tools/chat-ai/openai-assist.mjs";

const request = {
  sessionId: "server-test",
  step: "CPF",
  message: "A instalação é grátis?",
  context: {
    cidade: "Canoas",
    uf: "RS",
    coverageStatus: "VIAVEL",
    selectedPlan: "FIBRA 500MB (Combate)",
    selectedPlanValue: 89.9,
    availablePlans: [{ id: "FIBRA 500MB (Combate)", name: "500 Mega", speed: 500, price: 89.9, features: ["Instalação grátis"] }]
  }
};

const validResult = {
  type: "FAQ",
  answer: "Sim, essa oferta informa instalação grátis, sujeita à disponibilidade técnica.",
  resumeFlow: true,
  resumeStep: "CPF",
  systemAction: "NONE",
  handoffSuggested: false
};

function responseWithOutput(value, ok = true) {
  return {
    ok,
    async json() {
      return { output: [{ type: "message", content: [{ type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value) }] }] };
    }
  };
}

test("backend rejeita step não reconhecido e limita o contexto", () => {
  assert.equal(validateAssistRequest({ ...request, step: "IGNORE_TUDO" }), null);
  const clean = validateAssistRequest({ ...request, message: "x".repeat(800), context: { ...request.context, availablePlans: Array(20).fill(request.context.availablePlans[0]) } });
  assert.equal(clean.message.length, 500);
  assert.equal(clean.context.availablePlans.length, 12);
});

test("backend repete a sanitização mesmo sem confiar no navegador", () => {
  const clean = sanitizeServerMessage("CPF 529.982.247-25, telefone (51) 99999-8888, a instalação é grátis?");
  assert.doesNotMatch(clean, /529|99999/);
  assert.match(clean, /instalação é grátis/);
});

test("payload da Responses API usa structured output e não armazena resposta", () => {
  const payload = buildOpenAiPayload(validateAssistRequest(request), "modelo-configurado");
  assert.equal(payload.model, "modelo-configurado");
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
});

test("servidor sem configuração não chama OpenAI", async () => {
  let calls = 0;
  const service = createOpenAiAssist({ fetchImpl: async () => { calls += 1; } });
  const result = await service.assist(request);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "OPENAI_NOT_CONFIGURED");
  assert.equal(calls, 0);
});

test("mock da Responses API retorna objeto validado", async () => {
  let authorization = "";
  const service = createOpenAiAssist({
    apiKey: "test-key-not-real",
    model: "modelo-teste",
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return responseWithOutput(validResult);
    }
  });
  const result = await service.assist(request);
  assert.equal(result.status, 200);
  assert.equal(result.body.result.type, "FAQ");
  assert.equal(authorization, "Bearer test-key-not-real");
  assert.doesNotMatch(JSON.stringify(result.body), /test-key-not-real/);
});

test("resposta malformada da OpenAI usa erro controlado", async () => {
  const service = createOpenAiAssist({ apiKey: "fake", model: "test", fetchImpl: async () => responseWithOutput("não é JSON") });
  const result = await service.assist(request);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, "OPENAI_INVALID_RESPONSE");
});

test("resumeStep divergente é rejeitado pelo backend", async () => {
  const service = createOpenAiAssist({ apiKey: "fake", model: "test", fetchImpl: async () => responseWithOutput({ ...validResult, resumeStep: "EMAIL" }) });
  const result = await service.assist(request);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, "OPENAI_INVALID_RESPONSE");
});

test("timeout do upstream retorna código controlado sem chamada real", async () => {
  const service = createOpenAiAssist({
    apiKey: "fake",
    model: "test",
    timeoutMs: 2,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))
  });
  const result = await service.assist(request);
  assert.equal(result.status, 504);
  assert.equal(result.body.code, "OPENAI_TIMEOUT");
});
