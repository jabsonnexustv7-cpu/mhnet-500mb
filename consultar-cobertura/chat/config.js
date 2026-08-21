const params = new URLSearchParams(window.location.search);
const safeMode = params.get("safe") === "1";

export const CHAT_CONFIG = {
  chatMode: params.get("chat") || "local",
  coverageMode: params.get("coverage") || "real",
  coverageFallback: params.get("coverageFallback") || "mock",
  mockCoverageResult: params.get("mockCoverage") || "viavel",
  crmMode: safeMode ? "mock" : (params.get("crm") || "real"),
  conversionMode: safeMode ? "mock" : (params.get("conversions") || "real"),
  whatsappMode: safeMode ? "mock" : (params.get("whatsapp") || "real"),
  coverageEndpoint: "https://consulta-cobertura-mhnet-br-964927461432.southamerica-east1.run.app",
  crmEndpoint: "/api/chat/crm",
  whatsNumber: "555193187300",
  openAiProxyEndpoint: "/api/chat/parse",
  coverageRadius: 200,
  requestTimeoutMs: 10000,
  typingDelayMs: 380,
  storageKey: "webturbo-chat-mvp-v3",
  debug: params.get("debug") === "1"
};

// Facilita a inspeção e a troca de modo durante a homologação local.
window.CHAT_CONFIG = CHAT_CONFIG;
