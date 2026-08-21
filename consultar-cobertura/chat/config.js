const params = new URLSearchParams(window.location.search);

export const CHAT_CONFIG = {
  chatMode: params.get("chat") || "local",
  coverageMode: params.get("coverage") || "real",
  coverageFallback: params.get("coverageFallback") || "mock",
  mockCoverageResult: params.get("mockCoverage") || "viavel",
  crmMode: "mock",
  coverageEndpoint: "https://consulta-cobertura-mhnet-br-964927461432.southamerica-east1.run.app",
  crmEndpoint: "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales",
  openAiProxyEndpoint: "/api/chat/parse",
  coverageRadius: 200,
  requestTimeoutMs: 10000,
  typingDelayMs: 380,
  storageKey: "webturbo-chat-mvp-v1",
  debug: params.get("debug") === "1"
};

// Facilita a inspeção e a troca de modo durante a homologação local.
window.CHAT_CONFIG = CHAT_CONFIG;
