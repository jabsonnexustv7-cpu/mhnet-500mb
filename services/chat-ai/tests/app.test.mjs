import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createChatAiHttpHandler } from "../app.mjs";

const validRequest = {
  sessionId: "service-test",
  step: "CPF",
  message: "Tem fidelidade?",
  context: {
    cidade: "Canoas",
    uf: "RS",
    coverageStatus: "VIAVEL",
    selectedPlan: "FIBRA 500MB (Combate)",
    selectedPlanValue: 89.9,
    availablePlans: []
  }
};

function validResult(step = "CPF") {
  return {
    type: "FAQ",
    answer: "A condição de fidelidade será confirmada conforme a oferta escolhida.",
    resumeFlow: true,
    resumeStep: step,
    systemAction: "NONE",
    handoffSuggested: false
  };
}

async function withService(options, callback) {
  const handler = createChatAiHttpHandler(options);
  const server = createServer(async (request, response) => {
    if (await handler(request, response)) return;
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function service(overrides = {}) {
  return {
    configured: true,
    model: "gpt-5.4-mini",
    async assist(request) {
      return { status: 200, body: { ok: true, configured: true, result: validResult(request.step), latencyMs: 2 } };
    },
    ...overrides
  };
}

test("healthcheck não consulta OpenAI", async () => {
  let calls = 0;
  await withService({ assistService: service({ async assist() { calls += 1; } }) }, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls, 0);
  });
});

test("status configurado informa modelo e versão sem segredo", async () => {
  await withService({ assistService: service(), serviceVersion: "test-1" }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist/status`);
    const body = await response.json();
    assert.deepEqual(body, { ok: true, configured: true, model: "gpt-5.4-mini", version: "test-1" });
    assert.doesNotMatch(JSON.stringify(body), /key|token|secret/i);
  });
});

test("status não configurado não revela modelo ou segredo", async () => {
  await withService({ assistService: service({ configured: false, model: "" }) }, async (base) => {
    const body = await (await fetch(`${base}/api/chat/assist/status`)).json();
    assert.equal(body.configured, false);
    assert.equal(body.model, "");
  });
});

test("CORS aceita somente origem configurada", async () => {
  await withService({ assistService: service(), allowedOrigins: "https://webturbo-internet.com.br" }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist/status`, { headers: { Origin: "https://webturbo-internet.com.br" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://webturbo-internet.com.br");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
  });
});

test("CORS bloqueia origem não permitida", async () => {
  await withService({ assistService: service(), allowedOrigins: "https://webturbo-internet.com.br", logger: { warn() {} } }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist/status`, { headers: { Origin: "https://evil.example" } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("preflight retorna política CORS restrita", async () => {
  await withService({ assistService: service(), allowedOrigins: "http://localhost:4173" }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist`, { method: "OPTIONS", headers: { Origin: "http://localhost:4173" } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:4173");
  });
});

test("POST válido chama assistência e devolve resposta estruturada", async () => {
  let calls = 0;
  await withService({
    assistService: service({ async assist(request) { calls += 1; return { status: 200, body: { ok: true, result: validResult(request.step) } }; } }),
    logger: { info() {} }
  }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest)
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.resumeStep, "CPF");
    assert.equal(calls, 1);
  });
});

test("POST inválido retorna 400 e não chama assistência", async () => {
  let calls = 0;
  await withService({ assistService: service({ async assist() { calls += 1; } }), logger: { warn() {} } }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validRequest, step: "ETAPA_INVENTADA" })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_REQUEST");
    assert.equal(calls, 0);
  });
});

test("body acima de 16 KiB retorna 413", async () => {
  await withService({ assistService: service(), logger: { warn() {} } }, async (base) => {
    const response = await fetch(`${base}/api/chat/assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validRequest, padding: "x".repeat(17 * 1024) })
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "INVALID_REQUEST");
  });
});

test("rate limit retorna 429, Retry-After e não chama OpenAI novamente", async () => {
  let calls = 0;
  await withService({
    assistService: service({ async assist(request) { calls += 1; return { status: 200, body: { ok: true, result: validResult(request.step) } }; } }),
    rateLimitMax: 1,
    logger: { info() {}, warn() {} }
  }, async (base) => {
    const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validRequest) };
    assert.equal((await fetch(`${base}/api/chat/assist`, options)).status, 200);
    const limited = await fetch(`${base}/api/chat/assist`, options);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "RATE_LIMITED");
    assert.match(limited.headers.get("retry-after"), /^\d+$/);
    assert.equal(calls, 1);
  });
});

test("logs não incluem mensagem bruta nem dados pessoais", async () => {
  const logs = [];
  const logger = { info(line) { logs.push(line); }, warn(line) { logs.push(line); }, error(line) { logs.push(line); } };
  await withService({ assistService: service(), logger }, async (base) => {
    await fetch(`${base}/api/chat/assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validRequest, message: "CPF 529.982.247-25, pessoa@example.com, tem fidelidade?" })
    });
  });
  const serialized = logs.join("\n");
  assert.match(serialized, /\[WEBTURBO CHAT AI\]/);
  assert.doesNotMatch(serialized, /529|pessoa@example|tem fidelidade/);
});
