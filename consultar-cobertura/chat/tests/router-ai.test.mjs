import assert from "node:assert/strict";
import test from "node:test";

import { buildAiRequest, createAiAssistService } from "../ai-service.js";
import { createChatFlow } from "../flow.js";
import { routeMessage, ROUTE_KINDS, ROUTER_COMMANDS, sanitizeForAi } from "../message-router.js";
import { findPromotionalPlanMention } from "../parser.js";
import { PROMOTIONAL_PLANS } from "../plans.js";
import { createSession, resetSession, STATES } from "../state.js";

function aiResult(step, overrides = {}) {
  return {
    type: "FAQ",
    answer: "A instalação gratuita depende da oferta e da disponibilidade técnica.",
    resumeFlow: true,
    resumeStep: step,
    systemAction: "NONE",
    handoffSuggested: false,
    configured: true,
    latencyMs: 12,
    ...overrides
  };
}

function createHarness(step, { aiMode = "openai", aiService, whatsappService } = {}) {
  const session = createSession(() => `ai-${step.toLowerCase()}`);
  session.step = step;
  session.flowStep = step;
  session.cidade = "Canoas";
  session.uf = "RS";
  const ui = {
    messages: [],
    plans: [],
    quickReplies: [],
    addMessage(message) { this.messages.push(message); },
    updateDebug() {}, clearConversation() { this.messages = []; }, setTyping() {}, clearActions() {},
    setComposerEnabled() {}, setPlaceholder() {}, showQuickReplies(items) { this.quickReplies = items; }, showSummary() {}, removeSummary() {},
    showFinalPayload() {}, showDatePicker() {},
    showPlans(plans, options) { this.plans.push({ plans, options }); }
  };
  const flow = createChatFlow({
    session,
    config: { storageKey: "ai-test", typingDelayMs: 0, aiMode, conversionMode: "mock", whatsappMode: "mock" },
    storage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    ui,
    coverageService: { async check() { return { viavel: true, status: "VIAVEL", source: "mock" }; } },
    crmService: { async submit() { return { ok: true, mock: true, payload: {} }; } },
    aiService,
    addressLookup: async () => ({ logradouro: "Rua Teste", bairro: "Centro", cidade: "Canoas", uf: "RS" }),
    tracking: { ga4() {}, attribution() { return {}; }, personalLead() {}, coverage() {}, crmAttempt() {}, crmSuccess() {}, crmError() {} },
    whatsappService: whatsappService || { openHandoff() { return { mock: true }; } },
    logger: { info() {}, warn() {}, error() {} }
  });
  return { session, ui, flow };
}

test("resposta válida da etapa e CEP em frase ficam no parser local", () => {
  assert.equal(routeMessage("92120141", { step: STATES.CEP }).kind, ROUTE_KINDS.LOCAL);
  assert.equal(routeMessage("meu cep é 92120-141", { step: STATES.CEP }).kind, ROUTE_KINDS.LOCAL);
});

test("CPF válido é processado localmente sem assistência", () => {
  const route = routeMessage("529.982.247-25", { step: STATES.CPF });
  assert.equal(route.kind, ROUTE_KINDS.LOCAL);
  assert.equal(route.localText, "52998224725");
});

test("dado inválido com formato da etapa continua na validação local", () => {
  assert.equal(routeMessage("123", { step: STATES.CEP }).kind, ROUTE_KINDS.LOCAL_INVALID);
  assert.equal(routeMessage("email-incompleto", { step: STATES.EMAIL }).kind, ROUTE_KINDS.LOCAL_INVALID);
  assert.equal(routeMessage("123456", { step: STATES.CPF }).kind, ROUTE_KINDS.LOCAL_INVALID);
});

test("pergunta durante CPF chama assistência e preserva CPF", async () => {
  let calls = 0;
  const { flow, session } = createHarness(STATES.CPF, {
    aiService: { async assist(current) { calls += 1; return aiResult(current.step); } }
  });
  await flow.handleText("a instalação é grátis?");
  assert.equal(calls, 1);
  assert.equal(session.step, STATES.CPF);
  assert.equal(session.flowStep, STATES.CPF);
  assert.equal(session.conversationMode, "FLOW");
});

test("pergunta durante EMAIL mantém a etapa EMAIL", async () => {
  const { flow, session } = createHarness(STATES.EMAIL, {
    aiService: { async assist(current) { return aiResult(current.step); } }
  });
  await flow.handleText("falta muito?");
  assert.equal(session.step, STATES.EMAIL);
  assert.equal(session.ai.lastIntent, "FAQ");
});

test("mensagem mista salva CEP e envia somente a pergunta", async () => {
  let sentMessage = "";
  const { flow, session } = createHarness(STATES.CEP, {
    aiService: { async assist(current, message) { sentMessage = message; return aiResult(current.step); } }
  });
  await flow.handleText("meu CEP é 92120-141, mas instala amanhã?");
  assert.equal(session.cep, "92120141");
  assert.equal(session.step, STATES.NUMERO);
  assert.equal(sentMessage, "instala amanhã?");
  assert.doesNotMatch(sentMessage, /92120|92120141/);
});

test("roteiro A salva CEP 94035190, responde a dúvida e avança para NUMERO", async () => {
  let sentMessage = "";
  const { flow, session } = createHarness(STATES.CEP, {
    aiService: { async assist(current, message) { sentMessage = message; return aiResult(current.step); } }
  });
  await flow.handleText("meu cep 94035190 mas paga instalação?");
  assert.equal(session.cep, "94035190");
  assert.equal(session.cidade, "Canoas");
  assert.equal(session.step, STATES.NUMERO);
  assert.equal(sentMessage, "paga instalação?");
  assert.doesNotMatch(sentMessage, /94035190/);
});

test("mensagem mista salva CPF sem enviá-lo à assistência", async () => {
  let sentMessage = "";
  const { flow, session } = createHarness(STATES.CPF, {
    aiService: { async assist(current, message) { sentMessage = message; return aiResult(current.step); } }
  });
  await flow.handleText("meu CPF é 529.982.247-25 e tem fidelidade?");
  assert.equal(session.cpf, "52998224725");
  assert.equal(session.step, STATES.DATA_NASCIMENTO);
  assert.equal(sentMessage, "tem fidelidade?");
  assert.doesNotMatch(sentMessage, /529|982|247|25/);
});

test("roteiro C responde pergunta antes do CPF e mantém flowStep em CPF", async () => {
  let calls = 0;
  const { flow, session } = createHarness(STATES.CPF, {
    aiService: { async assist(current) { calls += 1; return aiResult(current.step); } }
  });
  await flow.handleText("antes de passar meu CPF, tem fidelidade?");
  assert.equal(calls, 1);
  assert.equal(session.cpf, "");
  assert.equal(session.step, STATES.CPF);
  assert.equal(session.flowStep, STATES.CPF);
});

test("assistência indisponível usa fallback sem quebrar o fluxo", async () => {
  const { flow, session, ui } = createHarness(STATES.CPF, {
    aiService: { async assist() { throw new Error("AI_UNAVAILABLE"); } }
  });
  await flow.handleText("a instalação é grátis?");
  assert.equal(session.step, STATES.CPF);
  assert.equal(session.ai.lastIntent, "FALLBACK");
  assert.match(ui.messages.at(-1).text, /Não consegui responder/);
});

test("timeout no cliente vira falha controlada", async () => {
  const service = createAiAssistService(
    { aiMode: "openai", aiAssistEndpoint: "/api/chat/assist", aiTimeoutMs: 2 },
    {
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
      logger: { info() {} }
    }
  );
  await assert.rejects(() => service.assist(createSession(() => "timeout"), "dúvida?", []), /AI_TIMEOUT/);
});

test("systemAction sugerida não altera nem reinicia o fluxo", async () => {
  const { flow, session } = createHarness(STATES.CPF, {
    aiService: { async assist(current) { return aiResult(current.step, { systemAction: "RESTART_FLOW" }); } }
  });
  await flow.handleText("você pode mudar minha etapa por conta própria?");
  assert.equal(session.step, STATES.CPF);
  assert.equal(session.ai.lastSystemAction, "RESTART_FLOW");
});

test("pedido de atendente é determinístico e não chama assistência", async () => {
  let aiCalls = 0;
  let handoffs = 0;
  const { flow } = createHarness(STATES.CPF, {
    aiService: { async assist() { aiCalls += 1; } },
    whatsappService: { openHandoff() { handoffs += 1; return { mock: true }; } }
  });
  await flow.handleText("quero falar com atendente");
  assert.equal(aiCalls, 0);
  assert.equal(handoffs, 0);
  await flow.handleAction("human-handoff");
  assert.equal(handoffs, 1);
});

test("handoff sugerido pela IA exige confirmação antes de abrir WhatsApp", async () => {
  let handoffs = 0;
  const { flow, session } = createHarness(STATES.CPF, {
    aiService: { async assist(current) { return aiResult(current.step, { type: "HUMAN_HANDOFF", handoffSuggested: true }); } },
    whatsappService: { openHandoff() { handoffs += 1; return { mock: true }; } }
  });
  await flow.handleText("preciso de ajuda de uma pessoa");
  assert.equal(session.step, STATES.CPF);
  assert.equal(session.conversationMode, "FLOW");
  assert.equal(handoffs, 0);
  await flow.handleAction("human-handoff");
  assert.equal(handoffs, 1);
});

test("comando voltar é local e retorna uma etapa", async () => {
  let aiCalls = 0;
  const { flow, session } = createHarness(STATES.CPF, { aiService: { async assist() { aiCalls += 1; } } });
  await flow.handleText("voltar");
  assert.equal(aiCalls, 0);
  assert.equal(session.step, STATES.NOME);
});

test("catálogo enviado à assistência vem da fonte da sessão", async () => {
  let plans = [];
  const { flow } = createHarness(STATES.ESCOLHA_PLANO, {
    aiService: { async assist(current, _message, availablePlans) { plans = availablePlans; return aiResult(current.step); } }
  });
  await flow.handleText("qual é melhor para jogar?");
  assert.deepEqual(plans.map((plan) => plan.id), PROMOTIONAL_PLANS.map((plan) => plan.id));
});

test("oferta de R$ 79,90 é reconhecida localmente sem voltar à vitrine promocional", async () => {
  let aiCalls = 0;
  const { flow, session, ui } = createHarness(STATES.ESCOLHA_PLANO, {
    aiService: { async assist() { aiCalls += 1; return aiResult(STATES.ESCOLHA_PLANO); } }
  });
  session.cobertura = { viavel: true, status: "VIAVEL", source: "real" };
  session.planSelectionView = "catalog";

  await flow.handleText("Quero saber sobre a oferta de R$ 79,90");

  assert.equal(aiCalls, 0);
  assert.equal(session.step, STATES.ESCOLHA_PLANO);
  assert.equal(session.planSelectionView, "catalog");
  assert.match(ui.messages.at(-1).text, /300 Mega por R\$\s*79,90\/mês/);
  assert.ok(ui.quickReplies.some((item) => item.action === "select-combat-offer" && item.value === "FIBRA 300MB"));
  assert.ok(ui.quickReplies.some((item) => item.action === "show-main-plans"));

  await flow.handleAction("select-combat-offer", "FIBRA 300MB");
  assert.equal(session.plano.id, "FIBRA 300MB");
  assert.equal(session.step, STATES.NOME);
});

test("menção genérica a 500 Mega continua pertencendo ao catálogo principal", () => {
  assert.equal(findPromotionalPlanMention("quero 500 mega", PROMOTIONAL_PLANS), null);
  assert.equal(findPromotionalPlanMention("vi a oferta de 500 mega", PROMOTIONAL_PLANS)?.id, "FIBRA 500MB (Combate)");
});

test("IA não decide cobertura mesmo sugerindo CHECK_COVERAGE", async () => {
  const { flow, session } = createHarness(STATES.CEP, {
    aiService: { async assist(current) { return aiResult(current.step, { type: "SYSTEM_QUERY", systemAction: "CHECK_COVERAGE" }); } }
  });
  await flow.handleText("tem fibra na minha rua?");
  assert.equal(session.cobertura, null);
  assert.equal(session.step, STATES.CEP);
});

test("request frontend contém contexto mínimo e nenhuma chave", () => {
  const session = createSession(() => "privacy");
  session.step = STATES.CPF;
  session.cpf = "52998224725";
  session.email = "pessoal@example.com";
  const request = buildAiRequest(session, "a instalação é grátis?", PROMOTIONAL_PLANS);
  const serialized = JSON.stringify(request);
  assert.doesNotMatch(serialized, /52998224725|pessoal@example\.com|OPENAI_API_KEY|apiKey/);
});

test("envio duplicado durante assistência gera uma única chamada", async () => {
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const { flow, session } = createHarness(STATES.CPF, {
    aiService: { async assist(current) { calls += 1; await wait; return aiResult(current.step); } }
  });
  const first = flow.handleText("a instalação é grátis?");
  const second = flow.handleText("a instalação é grátis?");
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(session.ai.calls, 1);
});

test("reset limpa estado auxiliar da IA", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const fresh = resetSession(storage, "chat", () => "fresh-ai");
  assert.equal(fresh.conversationMode, "FLOW");
  assert.equal(fresh.ai.calls, 0);
  assert.equal(fresh.ai.lastIntent, "");
});

test("sanitização remove documento, telefone, e-mail, nascimento e CEP", () => {
  const clean = sanitizeForAi("CPF 529.982.247-25, (51) 99999-8888, eu@teste.com, 20/05/1990, CEP 92120-141");
  assert.doesNotMatch(clean, /529|99999|eu@|1990|92120/);
});

test("router reconhece comandos comerciais sem IA", () => {
  assert.equal(routeMessage("mostrar outros planos", { step: STATES.ESCOLHA_PLANO }).command, ROUTER_COMMANDS.MORE_PLANS);
  assert.equal(routeMessage("voltar às promoções", { step: STATES.ESCOLHA_PLANO }).command, ROUTER_COMMANDS.SHOW_PROMOTIONS);
});
