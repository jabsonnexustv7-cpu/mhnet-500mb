import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBrowserLocationService,
  createCoveragePayload,
  createCoverageService,
  reverseGeocodeLocation
} from "../integrations.js";
import { createChatFlow } from "../flow.js";
import { routeMessage } from "../message-router.js";
import { createSession, loadSession, saveSession, STATES } from "../state.js";

function createUiRecorder() {
  return {
    messages: [],
    actions: [],
    addressReviews: [],
    addMessage(message) { this.messages.push(message); },
    updateDebug() {},
    clearConversation() { this.messages = []; },
    setTyping() {},
    clearActions() { this.actions = []; },
    setComposerEnabled() {},
    setPlaceholder() {},
    showPlans() {},
    showDatePicker() {},
    showSummary() {},
    removeSummary() {},
    showFinalPayload() {},
    showQuickReplies(items) { this.actions = items; },
    showAddressConfirmation(session) {
      this.addressReviews.push({
        cep: session.cep,
        logradouro: session.logradouro,
        numero: session.numero,
        bairro: session.bairro,
        cidade: session.cidade,
        uf: session.uf,
        source: session.addressSource
      });
      this.actions = [
        { label: "Está correto", action: "confirm-address" },
        { label: "Corrigir endereço", action: "new-address" }
      ];
    }
  };
}

function createStorage() {
  return { getItem() { return null; }, setItem() {}, removeItem() {} };
}

test("reverse geocode normaliza endereço brasileiro localizado por coordenadas", async () => {
  const result = await reverseGeocodeLocation(-29.65, -50.78, {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          display_name: "Rua Júlio de Castilhos, Centro, Taquara, RS",
          address: {
            road: "Rua Júlio de Castilhos",
            suburb: "Centro",
            town: "Taquara",
            state: "Rio Grande do Sul",
            postcode: "95600-000"
          }
        };
      }
    })
  });
  assert.equal(result.logradouro, "Rua Júlio de Castilhos");
  assert.equal(result.bairro, "Centro");
  assert.equal(result.cidade, "Taquara");
  assert.equal(result.uf, "RS");
  assert.equal(result.cep, "95600000");
});

test("serviço do navegador captura coordenadas e endereço sem expor a IA", async () => {
  const navigatorObject = {
    geolocation: {
      getCurrentPosition(success) {
        success({ coords: { latitude: -29.65, longitude: -50.78, accuracy: 24 } });
      }
    }
  };
  const service = createBrowserLocationService({
    navigatorObject,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          address: {
            road: "Rua Teste",
            neighbourhood: "Centro",
            city: "Taquara",
            state: "Rio Grande do Sul",
            postcode: "95600-000"
          }
        };
      }
    })
  });
  const result = await service.locate();
  assert.equal(result.addressSource, "geolocation");
  assert.equal(result.coordenadas, "-29.650000,-50.780000");
  assert.equal(result.locationAccuracy, 24);
  assert.equal(result.cep, "95600000");
});

test("localização negada orienta CEP sem travar", async () => {
  const service = createBrowserLocationService({
    navigatorObject: {
      geolocation: {
        getCurrentPosition(_success, failure) { failure({ code: 1 }); }
      }
    },
    fetchImpl: async () => { throw new Error("reverse geocode não deveria ser chamado"); }
  });
  await assert.rejects(() => service.locate(), /permissão de localização foi negada/i);
});

test("navegador sem geolocalização usa fallback controlado", async () => {
  const service = createBrowserLocationService({ navigatorObject: {}, fetchImpl: async () => ({}) });
  await assert.rejects(() => service.locate(), /não oferece acesso à localização/i);
});

test("falha no reverse geocode é controlada", async () => {
  const service = createBrowserLocationService({
    navigatorObject: {
      geolocation: {
        getCurrentPosition(success) { success({ coords: { latitude: -29.65, longitude: -50.78, accuracy: 20 } }); }
      }
    },
    fetchImpl: async () => ({ ok: false, async json() { return {}; } })
  });
  await assert.rejects(() => service.locate(), /não foi possível localizar o endereço/i);
});

test("localização imprecisa oferece fallback sem chamar reverse geocode", async () => {
  let reverseCalls = 0;
  const service = createBrowserLocationService({
    maxAccuracyMeters: 250,
    navigatorObject: {
      geolocation: {
        getCurrentPosition(success) { success({ coords: { latitude: -29.65, longitude: -50.78, accuracy: 900 } }); }
      }
    },
    fetchImpl: async () => { reverseCalls += 1; return {}; }
  });
  await assert.rejects(() => service.locate(), /localização ficou imprecisa/i);
  assert.equal(reverseCalls, 0);
});

test("payload de cobertura preserva coordenadas e suporta localização sem CEP", () => {
  const payload = createCoveragePayload({
    cep: "",
    numero: "123",
    logradouro: "Rua Teste",
    bairro: "Centro",
    cidade: "Taquara",
    uf: "RS",
    complemento: "Sem complemento",
    coordenadas: "-29.650000,-50.780000",
    addressSource: "geolocation"
  }, 200);
  assert.equal(payload.semCep, true);
  assert.equal(payload.sem_cep, true);
  assert.equal(payload.latitudeFixa, "-29.650000");
  assert.equal(payload.longitudeFixa, "-50.780000");
  assert.equal(payload.coordenadasFixas, "-29.650000,-50.780000");
});

test("coordenadas localizadas persistem e são retomadas na sessão", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const session = createSession(() => "persist-location", Date.now());
  session.coordenadas = "-29.650000,-50.780000";
  session.addressSource = "geolocation";
  session.locationAccuracy = 18;
  saveSession(session, storage, "location-session");
  const restored = loadSession(storage, "location-session");
  assert.equal(restored.coordenadas, session.coordenadas);
  assert.equal(restored.addressSource, "geolocation");
  assert.equal(restored.locationAccuracy, 18);
});

test("cliente sem CEP pode usar localização, informar número e conferir o endereço", async () => {
  const session = createSession(() => "geo-flow");
  const ui = createUiRecorder();
  const config = {
    storageKey: "geo-flow",
    typingDelayMs: 0,
    coverageMode: "mock",
    mockCoverageResult: "viavel",
    crmMode: "mock",
    conversionMode: "mock"
  };
  const flow = createChatFlow({
    session,
    config,
    storage: createStorage(),
    ui,
    coverageService: createCoverageService(config, { logger: { info() {}, warn() {} } }),
    crmService: { async submit() { return { ok: true, mock: true, payload: {} }; } },
    aiService: null,
    messageRouter: { route: routeMessage },
    addressLookup: async () => ({}),
    locationService: {
      async locate() {
        return {
          cep: "95600000",
          logradouro: "Rua Teste",
          bairro: "Centro",
          cidade: "Taquara",
          uf: "RS",
          coordenadas: "-29.650000,-50.780000",
          locationAccuracy: 18,
          addressSource: "geolocation"
        };
      }
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  await flow.start();
  await flow.handleText("não sei meu cep");
  assert.equal(session.step, STATES.CEP);
  assert.ok(ui.actions.some((item) => item.action === "use-location"));

  await flow.handleAction("use-location");
  assert.equal(session.step, STATES.NUMERO);
  assert.equal(session.logradouro, "Rua Teste");
  assert.equal(session.addressSource, "geolocation");
  assert.equal(session.coordenadas, "-29.650000,-50.780000");

  await flow.handleText("123");
  assert.equal(session.step, STATES.COMPLEMENTO);
  assert.equal(session.addressConfirmed, false);
  assert.equal(ui.addressReviews.at(-1).numero, "123");
  assert.ok(ui.actions.some((item) => item.action === "confirm-address"));

  await flow.handleAction("confirm-address");
  assert.equal(session.addressConfirmed, true);
  assert.equal(session.step, STATES.COMPLEMENTO);
  assert.ok(ui.actions.some((item) => item.action === "no-complement"));

  await flow.handleAction("no-complement");
  assert.equal(session.step, STATES.ESCOLHA_PLANO);
});

test("CEP digitado também passa pela conferência do endereço antes da cobertura", async () => {
  const session = createSession(() => "cep-review");
  const ui = createUiRecorder();
  const config = { storageKey: "cep-review", typingDelayMs: 0, coverageMode: "mock", mockCoverageResult: "viavel", crmMode: "mock" };
  let coverageCalls = 0;
  const flow = createChatFlow({
    session,
    config,
    storage: createStorage(),
    ui,
    coverageService: { async check() { coverageCalls += 1; return { viavel: true, status: "VIAVEL", source: "mock" }; } },
    crmService: { async submit() { return { ok: true, mock: true, payload: {} }; } },
    messageRouter: { route: routeMessage },
    addressLookup: async () => ({ logradouro: "Rua Exemplo", bairro: "Centro", cidade: "Canoas", uf: "RS" }),
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.start();
  await flow.handleText("92120-141");
  await flow.handleText("1186");
  assert.equal(session.step, STATES.COMPLEMENTO);
  assert.equal(session.addressSource, "cep");
  assert.equal(session.addressConfirmed, false);
  assert.equal(ui.addressReviews.at(-1).logradouro, "Rua Exemplo");
  await flow.handleText("apartamento 12");
  assert.equal(session.addressConfirmed, false);
  assert.equal(session.complemento, "");
  assert.equal(coverageCalls, 0);
  await flow.handleAction("confirm-address");
  assert.equal(coverageCalls, 0);
  await flow.handleText("apartamento 12");
  assert.equal(coverageCalls, 1);
});

test("corrigir endereço limpa dados e coordenadas anteriores", async () => {
  const session = createSession(() => "correct-address");
  Object.assign(session, {
    step: STATES.COMPLEMENTO,
    flowStep: STATES.COMPLEMENTO,
    cep: "95600000",
    numero: "123",
    complemento: "Apto 2",
    logradouro: "Rua Teste",
    bairro: "Centro",
    cidade: "Taquara",
    uf: "RS",
    coordenadas: "-29.650000,-50.780000",
    addressSource: "geolocation",
    addressConfirmed: true,
    locationAccuracy: 18,
    cobertura: { status: "VIAVEL" }
  });
  const ui = createUiRecorder();
  const flow = createChatFlow({
    session,
    config: { storageKey: "correct-address", typingDelayMs: 0 },
    storage: createStorage(),
    ui,
    coverageService: { async check() { throw new Error("não deve consultar cobertura"); } },
    crmService: { async submit() { return {}; } },
    messageRouter: { route: routeMessage },
    addressLookup: async () => ({}),
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.handleAction("new-address");
  assert.equal(session.step, STATES.CEP);
  for (const field of ["cep", "numero", "complemento", "logradouro", "bairro", "cidade", "uf", "coordenadas", "addressSource"]) {
    assert.equal(session[field], "", `${field} deve ser limpo`);
  }
  assert.equal(session.locationAccuracy, null);
  assert.equal(session.addressConfirmed, false);
  assert.equal(session.cobertura, null);
  assert.ok(ui.actions.some((item) => item.action === "offer-location"));
});

test("falha de localização mantém tentativa e entrada de CEP disponíveis", async () => {
  const session = createSession(() => "location-fallback");
  session.step = STATES.CEP;
  session.flowStep = STATES.CEP;
  const ui = createUiRecorder();
  const flow = createChatFlow({
    session,
    config: { storageKey: "location-fallback", typingDelayMs: 0 },
    storage: createStorage(),
    ui,
    coverageService: { async check() { return {}; } },
    crmService: { async submit() { return {}; } },
    messageRouter: { route: routeMessage },
    addressLookup: async () => ({}),
    locationService: { async locate() { throw new Error("A permissão de localização foi negada. Você pode informar o CEP manualmente."); } },
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.handleAction("use-location");
  assert.equal(session.step, STATES.CEP);
  assert.ok(ui.actions.some((item) => item.action === "use-location"));
  assert.ok(ui.actions.some((item) => item.action === "enter-cep"));
});

test("avatar aparece somente para a assistente e não altera a lógica do fluxo", () => {
  const uiSource = readFileSync(new URL("../ui.js", import.meta.url), "utf8");
  const labSource = readFileSync(new URL("../../chat-lab.html", import.meta.url), "utf8");
  assert.match(uiSource, /message\.role === "assistant"[\s\S]*assistantAvatar\(\)/);
  assert.match(uiSource, /webturbo-assistente\.png/);
  assert.match(labSource, /chat-header-avatar[\s\S]*webturbo-assistente\.png/);
  assert.doesNotMatch(uiSource, /message\.role === "user"[\s\S]{0,120}assistantAvatar/);
});

test("WhatsApp só abre após confirmação explícita de handoff", async () => {
  const session = createSession(() => "handoff-test");
  session.step = STATES.CEP;
  session.flowStep = STATES.CEP;
  const ui = createUiRecorder();
  let opens = 0;
  const flow = createChatFlow({
    session,
    config: { storageKey: "handoff", typingDelayMs: 0 },
    storage: createStorage(),
    ui,
    coverageService: { async check() { return { viavel: true }; } },
    crmService: { async submit() { return { ok: true }; } },
    messageRouter: { route: routeMessage },
    addressLookup: async () => ({}),
    whatsappService: {
      openHandoff() { opens += 1; return { mock: true }; }
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  await flow.handleText("quero falar com atendente");
  assert.equal(opens, 0);
  assert.ok(ui.actions.some((item) => item.action === "human-handoff"));
  await flow.handleAction("human-handoff");
  assert.equal(opens, 1);
});
