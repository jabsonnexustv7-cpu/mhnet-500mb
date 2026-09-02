import { validateAiResponse } from "./ai-schema.js";

const PREFIX = "[WEBTURBO CHAT]";
const BEST_SELLER_PLAN_CODES = new Set([
  "TIM_RS_800_YOUTUBE_PREMIUM",
  "TIM_SC_1000",
  "ALGAR_800",
  "MHNET_500_WIFI_EXTRA",
  "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI",
  "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI"
]);

function withTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function operatorFeature(planId) {
  const id = String(planId || "").toUpperCase();
  if (id.startsWith("TIM_")) return "Operadora: TIM";
  if (id.startsWith("ALGAR_")) return "Operadora: Algar";
  if (id.startsWith("MHNET_")) return "Operadora: MhNet";
  return "";
}

function inferredFeatures(plan) {
  const id = String(plan?.id || "").toUpperCase();
  const name = String(plan?.title || "").toUpperCase();
  const features = [];
  const operator = operatorFeature(id);
  if (operator) features.push(operator);
  if (BEST_SELLER_PLAN_CODES.has(id)) features.push("⭐ Mais vendido");
  if (name.includes("YOUTUBE PREMIUM")) features.push("YouTube Premium incluso");
  if (name.includes("GLOBOPLAY")) features.push("Globoplay incluso");
  if (name.includes("PARAMOUNT")) features.push("Paramount+ incluso");
  if (name.includes("HBO MAX")) features.push("HBO Max incluso");
  if (name.includes("PONTO EXTRA")) features.push("Ponto extra de Wi-Fi");
  if (Array.isArray(plan?.features)) features.push(...plan.features);

  return [...new Set(features.map((item) => String(item || "").trim()).filter(Boolean))]
    .slice(0, 5)
    .map((item) => item.slice(0, 80));
}

export function buildAiRequest(session, message, availablePlans) {
  return {
    sessionId: String(session.sessionId || "").slice(0, 100),
    step: session.step,
    message: String(message || "").slice(0, 500),
    context: {
      cidade: String(session.cidade || "").slice(0, 80),
      uf: String(session.uf || "").slice(0, 2),
      coverageStatus: session.cobertura?.status || "NAO_CONSULTADA",
      selectedPlan: session.plano?.id || "",
      selectedPlanValue: Number(session.plano?.price || 0),
      availablePlans: availablePlans.slice(0, 12).map((plan) => ({
        id: String(plan.id || "").slice(0, 120),
        name: String(plan.title || "").slice(0, 120),
        speed: Number(plan.speed || 0),
        price: Number(plan.price || 0),
        features: inferredFeatures(plan)
      }))
    }
  };
}

export function createAiAssistService(config, { fetchImpl = fetch, logger = console } = {}) {
  async function status() {
    try {
      const response = await withTimeout(fetchImpl, `${config.aiAssistEndpoint}/status`, { headers: { Accept: "application/json" } }, 3000);
      if (!response.ok) return { configured: false };
      const data = await response.json();
      return { configured: data.configured === true, model: data.model || "" };
    } catch {
      return { configured: false };
    }
  }

  async function assist(session, message, availablePlans) {
    if (config.aiMode !== "openai") throw new Error("AI_DISABLED");
    const body = buildAiRequest(session, message, availablePlans);
    logger.info(`${PREFIX} AI fallback requested`, { step: session.step });
    let response;
    try {
      response = await withTimeout(fetchImpl, config.aiAssistEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, config.aiTimeoutMs || 12000);
    } catch (error) {
      throw new Error(error?.name === "AbortError" ? "AI_TIMEOUT" : "AI_UNAVAILABLE");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.code || "AI_UNAVAILABLE");
    const validated = validateAiResponse(data.result, session.step);
    if (!validated) throw new Error("AI_INVALID_RESPONSE");
    return { ...validated, latencyMs: Number(data.latencyMs || 0), configured: data.configured === true };
  }

  return { assist, status };
}
