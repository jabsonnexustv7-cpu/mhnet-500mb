import { isFullDebugEnabled, isLocalDevelopmentLocation, resolveAiAssistEndpoint } from "./runtime-config.js";

const params = new URLSearchParams(window.location.search);
const safeMode = params.get("safe") === "1";
const localDevelopment = isLocalDevelopmentLocation(window.location);
const runtimeConfig = window.WEBTURBO_CHAT_CONFIG && typeof window.WEBTURBO_CHAT_CONFIG === "object"
  ? window.WEBTURBO_CHAT_CONFIG
  : {};
const metaAiEndpoint = document.querySelector('meta[name="webturbo-chat-ai-endpoint"]')?.content || "";

export const CHAT_CONFIG = {
  chatMode: params.get("chat") || runtimeConfig.chatMode || "local",
  aiMode: params.has("ai")
    ? (params.get("ai") === "openai" ? "openai" : "off")
    : (runtimeConfig.aiMode === "openai" ? "openai" : "off"),
  coverageMode: params.get("coverage") || runtimeConfig.coverageMode || "real",
  coverageFallback: params.get("coverageFallback") || "mock",
  mockCoverageResult: params.get("mockCoverage") || "viavel",
  crmMode: safeMode ? "mock" : (params.get("crm") || runtimeConfig.crmMode || "real"),
  conversionMode: safeMode ? "mock" : (params.get("conversions") || runtimeConfig.conversionMode || "real"),
  whatsappMode: safeMode ? "mock" : (params.get("whatsapp") || runtimeConfig.whatsappMode || "real"),
  notificationMode: safeMode ? "mock" : (params.get("notifications") || runtimeConfig.notificationMode || "real"),
  coverageEndpoint: "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-coverage/resolve",
  legacyCoverageEndpoint: "https://consulta-cobertura-mhnet-br-964927461432.southamerica-east1.run.app",
  notificationEndpoint: runtimeConfig.notificationEndpoint || "https://modal-easy-964927461432.southamerica-east1.run.app",
  crmEndpoint: runtimeConfig.crmEndpoint || "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales",
  whatsNumber: "555193187300",
  aiAssistEndpoint: resolveAiAssistEndpoint(window.location, {
    aiAssistEndpoint: runtimeConfig.aiAssistEndpoint || metaAiEndpoint
  }),
  aiTimeoutMs: 12000,
  aiMaxMessageLength: 500,
  coverageRadius: 200,
  requestTimeoutMs: 18000,
  locationMaxAccuracyMeters: 250,
  typingDelayMs: 380,
  storageKey: "webturbo-chat-mvp-v5",
  sessionTtlMs: 24 * 60 * 60 * 1000,
  debug: isFullDebugEnabled(window.location, window.location.search),
  localDevelopment
};

// Facilita a inspeção e a troca de modo durante a homologação local.
window.CHAT_CONFIG = CHAT_CONFIG;
