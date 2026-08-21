export const PRODUCTION_AI_ASSIST_ENDPOINT = "https://webturbo-chat-ai-964927461432.southamerica-east1.run.app/api/chat/assist";

export function isLocalDevelopmentLocation(locationLike = {}) {
  const hostname = String(locationLike.hostname || "").toLowerCase();
  const port = String(locationLike.port || "");
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || port === "4173";
}

export function resolveAiAssistEndpoint(locationLike = {}, runtimeConfig = {}) {
  const override = String(runtimeConfig.aiAssistEndpoint || "").trim().replace(/\/$/, "");
  if (override) return override;
  return isLocalDevelopmentLocation(locationLike) ? "/api/chat/assist" : PRODUCTION_AI_ASSIST_ENDPOINT;
}

export function isFullDebugEnabled(locationLike = {}, search = "") {
  return isLocalDevelopmentLocation(locationLike) && new URLSearchParams(search).get("debug") === "1";
}
