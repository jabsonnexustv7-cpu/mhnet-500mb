import assert from "node:assert/strict";
import test from "node:test";

import { createCoverageService, createCrmService, buildCrmPayload } from "../integrations.js";
import { createChatFlow } from "../flow.js";
import { extractCep, selectPlanFromText } from "../parser.js";
import { BASE_PLANS } from "../plans.js";
import { createSession, loadSession, resetSession, saveSession, STATES, transition } from "../state.js";
import { isValidCep, isValidCpf, normalizeCep } from "../validators.js";

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
  cobertura: { viavel: true, status: "VIAVEL", motivo: "ftth_disponivel" },
  plano: BASE_PLANS[0],
  nome: "João da Silva",
  cpf: "52998224725",
  dataNascimento: "1990-05-20",
  email: "joao@example.com",
  telefone: "51999998888"
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

test("gera payload final compatível com o CRM existente", () => {
  const payload = buildCrmPayload(sampleSession(), { pageUrl: "http://localhost/chat-lab.html" });
  assert.equal(payload.documentoCliente, "52998224725");
  assert.equal(payload.planos, "FIBRA 500MB");
  assert.equal(payload.nomeCidade, "Canoas");
  assert.equal(payload.event_id, "chat_mvp_session-test");
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
  assert.equal(session.step, STATES.CONFIRMACAO);
  await flow.handleAction("confirm");

  assert.equal(session.step, STATES.FINALIZADO);
  assert.equal(session.crmPayload.documentoCliente, "52998224725");
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
