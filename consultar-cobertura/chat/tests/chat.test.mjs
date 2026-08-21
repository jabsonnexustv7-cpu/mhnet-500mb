import assert from "node:assert/strict";
import test from "node:test";

import { calculateBillingSummary, parseInstallationDate, tomorrowISO } from "../billing.js";
import { createCoverageService, createCrmService, buildCrmPayload } from "../integrations.js";
import { createChatFlow } from "../flow.js";
import { extractCep, selectPlanFromText, wantsMorePlans } from "../parser.js";
import { BASE_PLANS, PLAN_SELECTION_VIEWS, PROMOTIONAL_PLANS } from "../plans.js";
import { createSession, loadSession, resetSession, saveSession, STATES, transition } from "../state.js";
import { isValidCep, isValidCpf, normalizeCep } from "../validators.js";
import { createWhatsAppService } from "../whatsapp.js";

const sampleSession = () => ({
  ...createSession(() => "session-test"),
  step: STATES.CONFIRMACAO,
  cep: "92120141",
  numero: "1186",
  complemento: "Apto 302",
  logradouro: "Rua Exemplo",
  bairro: "Centro",
  cidade: "Canoas",
  uf: "RS",
  coordenadas: "-29.92,-51.18",
  cobertura: { viavel: true, status: "VIAVEL", motivo: "ftth_disponivel", source: "real" },
  plano: BASE_PLANS[0],
  nome: "João da Silva",
  cpf: "52998224725",
  dataNascimento: "1990-05-20",
  email: "joao@example.com",
  telefone: "51999998888",
  telefoneSecundario: "51988887777",
  diaVencimentoFatura: "10",
  dataInstalacao: "2026-08-25",
  turnoInstalacao: "Manhã",
  faturamento: calculateBillingSummary(99.9, "10", new Date(2026, 7, 21))
});

test("normaliza CEP removendo máscara e texto excedente", () => {
  assert.equal(normalizeCep("92120-141"), "92120141");
});

test("valida CEP com oito dígitos", () => {
  assert.equal(isValidCep("92120-141"), true);
  assert.equal(isValidCep("11111-111"), false);
  assert.equal(isValidCep("92120"), false);
});

test("valida CPF pelos dígitos verificadores", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
});

test("extrai CEP de uma frase", () => {
  assert.equal(extractCep("meu cep é 92120-141"), "92120141");
});

test("seleciona o plano mais barato", () => {
  assert.equal(selectPlanFromText("quero o mais barato", BASE_PLANS)?.id, "FIBRA 500MB");
});

test("seleciona plano por velocidade", () => {
  assert.equal(selectPlanFromText("quero 700 mega", BASE_PLANS)?.speed, 700);
  assert.equal(selectPlanFromText("quero 500 mega", BASE_PLANS)?.id, "FIBRA 500MB");
});

test("ofertas iniciais reproduzem as três promoções do fluxo atual", () => {
  assert.deepEqual(
    PROMOTIONAL_PLANS.map(({ id, price }) => [id, price]),
    [
      ["FIBRA 300MB", 79.9],
      ["FIBRA 500MB (Combate)", 89.9],
      ["FIBRA 700MB", 99.9]
    ]
  );
  assert.equal(selectPlanFromText("quero o mais barato", PROMOTIONAL_PLANS)?.id, "FIBRA 300MB");
  assert.equal(selectPlanFromText("quero 500 mega", PROMOTIONAL_PLANS)?.id, "FIBRA 500MB (Combate)");
});

test("reconhece pedido escrito para ver mais ofertas", () => {
  assert.equal(wantsMorePlans("quero ver mais ofertas"), true);
  assert.equal(wantsMorePlans("mostrar outros planos"), true);
  assert.equal(wantsMorePlans("quero 500 mega"), false);
});

test("máquina de estados aceita a transição prevista e rejeita salto inválido", () => {
  const session = createSession(() => "state-test");
  transition(session, STATES.CEP);
  assert.equal(session.step, STATES.CEP);
  assert.throws(() => transition(session, STATES.CPF), /Transição inválida/);
});

test("mock de cobertura retorna cenário viável", async () => {
  const service = createCoverageService({ coverageMode: "mock", mockCoverageResult: "viavel" }, { logger: { info() {}, warn() {} } });
  const result = await service.check(sampleSession());
  assert.equal(result.viavel, true);
  assert.equal(result.status, "VIAVEL");
});

test("mock de cobertura retorna cenário inviável", async () => {
  const service = createCoverageService({ coverageMode: "mock", mockCoverageResult: "inviavel" }, { logger: { info() {}, warn() {} } });
  const result = await service.check(sampleSession());
  assert.equal(result.viavel, false);
  assert.equal(result.status, "INVIAVEL");
});

test("reset remove a sessão anterior e cria uma nova", () => {
  const values = new Map([["chat", JSON.stringify(sampleSession())]]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const fresh = resetSession(storage, "chat", () => "new-session");
  assert.equal(values.has("chat"), false);
  assert.equal(fresh.sessionId, "new-session");
  assert.equal(fresh.step, STATES.WELCOME);
});

test("sessão persistida pode ser retomada após recarregar", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const session = sampleSession();
  saveSession(session, storage, "chat");
  const restored = loadSession(storage, "chat");
  assert.equal(restored.sessionId, "session-test");
  assert.equal(restored.step, STATES.CONFIRMACAO);
  assert.equal(restored.plano.id, "FIBRA 500MB");
});

test("seleção de planos começa nas promoções e expande para o catálogo", async () => {
  const session = createSession(() => "plan-view-test");
  session.step = STATES.ESCOLHA_PLANO;
  session.cidade = "Canoas";
  session.uf = "RS";
  session.cobertura = { viavel: true, source: "real" };
  const rendered = [];
  const ui = {
    addMessage() {}, updateDebug() {}, clearConversation() {}, setTyping() {}, clearActions() {},
    setComposerEnabled() {}, setPlaceholder() {}, showQuickReplies() {}, showSummary() {},
    showFinalPayload() {},
    showPlans(plans, options) {
      rendered.push({ ids: plans.map((plan) => plan.id), options });
    }
  };
  const flow = createChatFlow({
    session,
    config: { storageKey: "plan-view", typingDelayMs: 0, conversionMode: "mock" },
    storage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    ui,
    coverageService: { async check() { return { viavel: true }; } },
    crmService: { async submit() { return { ok: true }; } },
    addressLookup: async () => ({}),
    interpreter: { async interpret() { return null; } },
    tracking: { ga4() {}, attribution() { return {}; } },
    logger: { info() {}, warn() {}, error() {} }
  });

  flow.resume();
  assert.deepEqual(rendered.at(-1).ids, PROMOTIONAL_PLANS.map((plan) => plan.id));
  assert.equal(rendered.at(-1).options.showMore, true);

  await flow.handleAction("show-more-plans");
  assert.equal(session.planSelectionView, PLAN_SELECTION_VIEWS.CATALOG);
  assert.deepEqual(rendered.at(-1).ids, BASE_PLANS.map((plan) => plan.id));
  assert.equal(rendered.at(-1).options.showMore, false);
});

test("gera payload final compatível com o CRM existente", () => {
  const payload = buildCrmPayload(sampleSession(), { pageUrl: "http://localhost/chat-lab.html" });
  assert.equal(payload.documentoCliente, "52998224725");
  assert.equal(payload.planos, "FIBRA 500MB");
  assert.equal(payload.nomeCidade, "Canoas");
  assert.equal(payload.telefone2Cliente, "51988887777");
  assert.equal(payload.diaVencimentoFatura, "10");
  assert.equal(payload.dataInstalacao1, "2026-08-25");
  assert.equal(payload.turnoInstalacao1, "Manhã");
  assert.equal(payload.event_id, "chat_session-test");
});

test("data de instalação respeita o mínimo de amanhã", () => {
  const reference = new Date(2026, 7, 21);
  assert.equal(tomorrowISO(reference), "2026-08-22");
  assert.equal(parseInstallationDate("21/08/2026", reference).valid, false);
  assert.equal(parseInstallationDate("22/08/2026", reference).iso, "2026-08-22");
});

test("cálculo proporcional espelha o texto do fluxo normal", () => {
  const billing = calculateBillingSummary(99.9, "10", new Date(2026, 7, 21));
  assert.equal(billing.proportional, "Em setembro/2026 você receberá um valor proporcional referente aos dias de uso — em torno de R$ 29,00.");
  assert.equal(billing.full, "R$ 99,90 no dia 10 de outubro/2026.");
});

test("CRM mock não executa POST real", async () => {
  let fetchCalls = 0;
  const service = createCrmService(
    { crmMode: "mock", crmEndpoint: "https://example.invalid/crm" },
    { fetchImpl: async () => { fetchCalls += 1; throw new Error("não deveria chamar fetch"); }, logger: { info() {} } }
  );
  const result = await service.submit(sampleSession(), {});
  assert.equal(result.mock, true);
  assert.equal(result.posted, false);
  assert.equal(fetchCalls, 0);
});

test("CRM real executa um único POST com o payload completo", async () => {
  const calls = [];
  const service = createCrmService(
    { crmMode: "real", crmEndpoint: "https://crm.example.test/pre-sales" },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, async json() { return { ok: true, created: true }; } };
      },
      logger: { info() {} }
    }
  );
  const result = await service.submit(sampleSession(), {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(JSON.parse(calls[0].options.body).telefone2Cliente, "51988887777");
  assert.equal(result.posted, true);
  assert.equal(result.created, true);
});

test("pós-venda monta a mensagem existente e redireciona após três segundos", () => {
  const callbacks = [];
  const assigned = [];
  const tracked = [];
  const service = createWhatsAppService(
    { whatsappMode: "real", whatsNumber: "555193187300" },
    { whatsapp: (_session, mode) => tracked.push(mode) },
    {
      locationObject: { assign: (url) => assigned.push(url) },
      timerApi: {
        setInterval(callback) { callbacks.push(callback); return 7; },
        clearInterval() {}
      }
    }
  );
  const ticks = [];
  const started = service.startRedirect(sampleSession(), (seconds) => ticks.push(seconds));
  callbacks[0](); callbacks[0](); callbacks[0]();
  assert.match(decodeURIComponent(started.url), /Acabei de concluir um pedido de internet, meu CPF: 52998224725/);
  assert.deepEqual(ticks, [3, 2, 1, 0]);
  assert.equal(assigned[0], started.url);
  assert.deepEqual(tracked, ["automatico"]);
});

test("confirmação real registra conversão, CRM e pós-venda", async () => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "http://localhost/chat-lab.html", search: "", assign() {} }
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "" } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "node-test" } });
  const session = sampleSession();
  const events = [];
  let crmCalls = 0;
  let redirectCalls = 0;
  const ui = {
    addMessage() {}, updateDebug() {}, clearConversation() {}, setTyping() {}, clearActions() {},
    setComposerEnabled() {}, setPlaceholder() {}, showQuickReplies() {}, showPlans() {}, showSummary() {},
    showFinalPayload() {}, showPostSaleSuccess() {}, updateWhatsAppCountdown() {}
  };
  const flow = createChatFlow({
    session,
    config: { storageKey: "real-flow", typingDelayMs: 0, crmMode: "real" },
    storage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    ui,
    coverageService: { async check() { return { viavel: true }; } },
    crmService: {
      async submit(current) {
        crmCalls += 1;
        return { ok: true, created: true, mock: false, posted: true, payload: buildCrmPayload(current, {}) };
      }
    },
    addressLookup: async () => ({}),
    interpreter: { async interpret() { return null; } },
    tracking: {
      crmAttempt() { events.push("attempt"); },
      crmSuccess() { events.push("success"); },
      crmError() { events.push("error"); },
      personalLead() {}, coverage() {}, whatsapp() {}
    },
    whatsappService: {
      buildUrl() { return "https://wa.me/test"; },
      startRedirect() { redirectCalls += 1; },
      trackManual() {}
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.handleAction("confirm");
  assert.equal(crmCalls, 1);
  assert.equal(session.step, STATES.FINALIZADO);
  assert.deepEqual(events, ["attempt", "success"]);
  assert.equal(redirectCalls, 1);
});

test("cobertura mock nunca cria pré-venda real", async () => {
  const session = sampleSession();
  session.cobertura.source = "mock";
  let crmCalls = 0;
  const ui = {
    addMessage() {}, updateDebug() {}, clearConversation() {}, setTyping() {}, clearActions() {},
    setComposerEnabled() {}, setPlaceholder() {}, showQuickReplies() {}, showPlans() {}, showSummary() {},
    showFinalPayload() {}, showPostSaleSuccess() {}, updateWhatsAppCountdown() {}
  };
  const flow = createChatFlow({
    session,
    config: { storageKey: "mock-guard", typingDelayMs: 0, crmMode: "real" },
    storage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    ui,
    coverageService: { async check() { return { viavel: true }; } },
    crmService: { async submit() { crmCalls += 1; } },
    addressLookup: async () => ({}),
    interpreter: { async interpret() { return null; } },
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.handleAction("confirm");
  assert.equal(crmCalls, 0);
  assert.equal(session.step, STATES.CONFIRMACAO);
});

test("fluxo ponta a ponta viável chega ao CRM MOCK", async () => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "http://localhost/chat-lab.html?coverage=mock", search: "?coverage=mock" }
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "" }
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "node-test" }
  });

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const ui = {
    messages: [],
    addMessage(message) { this.messages.push(message); },
    updateDebug() {}, clearConversation() { this.messages = []; }, setTyping() {},
    clearActions() {}, setComposerEnabled() {}, setPlaceholder() {}, showQuickReplies() {},
    showPlans() {}, showSummary() {}, showFinalPayload() {}
  };
  const config = {
    storageKey: "e2e",
    typingDelayMs: 0,
    coverageMode: "mock",
    mockCoverageResult: "viavel",
    crmMode: "mock"
  };
  let fetchCalls = 0;
  const session = createSession(() => "e2e-session");
  const flow = createChatFlow({
    session,
    config,
    storage,
    ui,
    coverageService: createCoverageService(config, { logger: { info() {}, warn() {} } }),
    crmService: createCrmService(config, { fetchImpl: async () => { fetchCalls += 1; }, logger: { info() {} } }),
    interpreter: { async interpret() { return null; } },
    addressLookup: async () => ({ logradouro: "Rua Exemplo", bairro: "Centro", cidade: "Canoas", uf: "RS" }),
    logger: { info() {}, warn() {}, error() {} }
  });

  await flow.start();
  await flow.handleText("meu cep é 92120-141");
  await flow.handleText("o número é 1186");
  await flow.handleText("não tenho complemento");
  assert.equal(session.step, STATES.ESCOLHA_PLANO);
  await flow.handleText("quero o mais barato");
  await flow.handleText("meu nome é João da Silva");
  await flow.handleText("529.982.247-25");
  await flow.handleText("20/05/1990");
  await flow.handleText("joao@example.com");
  await flow.handleText("(51) 99999-8888");
  assert.equal(session.step, STATES.TELEFONE_SECUNDARIO);
  await flow.handleText("(51) 99999-8888");
  assert.equal(session.step, STATES.TELEFONE_SECUNDARIO);
  await flow.handleText("(51) 98888-7777");
  await flow.handleText("dia 10");
  await flow.handleText(tomorrowISO());
  await flow.handleText("manhã");
  assert.equal(session.step, STATES.CONFIRMACAO);
  await flow.handleAction("confirm");

  assert.equal(session.step, STATES.FINALIZADO);
  assert.equal(session.crmPayload.documentoCliente, "52998224725");
  assert.equal(session.crmPayload.telefone2Cliente, "51988887777");
  assert.equal(session.crmPayload.diaVencimentoFatura, "10");
  assert.equal(session.crmPayload.turnoInstalacao1, "Manhã");
  assert.match(session.faturamento.proportional, /valor proporcional|referente aos dias utilizados/);
  assert.equal(fetchCalls, 0);
  assert.match(ui.messages.at(-1).text, /Nenhuma venda foi criada/);
});

test("fluxo inviável oferece nova consulta sem avançar para planos", async () => {
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const ui = {
    addMessage() {}, updateDebug() {}, clearConversation() {}, setTyping() {}, clearActions() {},
    setComposerEnabled() {}, setPlaceholder() {}, showQuickReplies() {}, showPlans() {}, showSummary() {}, showFinalPayload() {}
  };
  const config = { storageKey: "inviavel", typingDelayMs: 0, coverageMode: "mock", mockCoverageResult: "inviavel", crmMode: "mock" };
  const session = createSession(() => "inviavel-session");
  const flow = createChatFlow({
    session, config, storage, ui,
    coverageService: createCoverageService(config, { logger: { info() {}, warn() {} } }),
    crmService: createCrmService(config, { logger: { info() {} } }),
    interpreter: { async interpret() { return null; } },
    addressLookup: async () => ({ logradouro: "Rua Exemplo", bairro: "Centro", cidade: "Canoas", uf: "RS" }),
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.start();
  await flow.handleText("92120-141");
  await flow.handleText("1186");
  await flow.handleText("não tenho complemento");
  assert.equal(session.step, STATES.COBERTURA_INVIAVEL);
  assert.equal(session.plano, null);
});
