import { AI_RESPONSE_SCHEMA, validateAiResponse } from "../../consultar-cobertura/chat/ai-schema.js";
import { COMMERCIAL_KNOWLEDGE } from "../../consultar-cobertura/chat/knowledge.js";
import { STATES } from "../../consultar-cobertura/chat/state.js";
import { WEBTURBO_AI_SYSTEM_PROMPT } from "./system-prompt.mjs";

const VALID_STEPS = new Set(Object.values(STATES));
export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_SESSION_ID_LENGTH = 100;
export const MAX_AVAILABLE_PLANS = 12;
export const MAX_PLAN_FEATURES = 5;
const REQUEST_KEYS = new Set(["sessionId", "step", "message", "context"]);
const CONTEXT_KEYS = new Set(["cidade", "uf", "coverageStatus", "selectedPlan", "selectedPlanValue", "availablePlans"]);
const PLAN_KEYS = new Set(["id", "name", "speed", "price", "features"]);

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isStringWithin(value, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) return !required;
  if (typeof value !== "string" || value.length > maxLength) return false;
  return !required || Boolean(value.trim());
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function sanitizeServerMessage(value) {
  return cleanString(value, MAX_MESSAGE_LENGTH)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[E-MAIL REMOVIDO]")
    .replace(/(?:\d[.\s-]?){11}/g, "[DOCUMENTO REMOVIDO]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}/g, "[TELEFONE REMOVIDO]")
    .replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g, "[DATA REMOVIDA]")
    .replace(/\b\d{5}[-.\s]?\d{3}\b/g, "[CEP REMOVIDO]")
    .replace(/\b(?:rua|avenida|av\.?|travessa|alameda)\s+[^,;!?]+/gi, "[ENDEREÇO REMOVIDO]")
    .replace(/\b\d{7,}\b/g, "[DADO REMOVIDO]")
    .trim();
}

function validatePlans(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_AVAILABLE_PLANS) return null;
  const valid = value.every((plan) => {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) return false;
    if (!hasOnlyKeys(plan, PLAN_KEYS)) return false;
    if (!isStringWithin(plan.id, 120) || !isStringWithin(plan.name, 120)) return false;
    if (plan.speed !== undefined && (typeof plan.speed !== "number" || !Number.isFinite(plan.speed) || plan.speed < 0)) return false;
    if (plan.price !== undefined && (typeof plan.price !== "number" || !Number.isFinite(plan.price) || plan.price < 0)) return false;
    if (plan.features !== undefined && (!Array.isArray(plan.features) || plan.features.length > MAX_PLAN_FEATURES)) return false;
    return (plan.features || []).every((item) => isStringWithin(item, 80));
  });
  if (!valid) return null;
  return value.map((plan) => ({
    id: cleanString(plan?.id, 120),
    name: cleanString(plan?.name, 120),
    speed: plan.speed ?? 0,
    price: plan.price ?? 0,
    features: (plan.features || []).map((item) => cleanString(item, 80))
  }));
}

export function validateAssistRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!hasOnlyKeys(value, REQUEST_KEYS)) return null;
  if (!isStringWithin(value.sessionId, MAX_SESSION_ID_LENGTH, { required: true })) return null;
  if (!isStringWithin(value.step, 40, { required: true })) return null;
  if (!isStringWithin(value.message, MAX_MESSAGE_LENGTH, { required: true })) return null;
  const step = cleanString(value.step, 40);
  const message = sanitizeServerMessage(value.message);
  if (!VALID_STEPS.has(step) || !message) return null;
  if (value.context !== undefined && (!value.context || typeof value.context !== "object" || Array.isArray(value.context))) return null;
  const context = value.context || {};
  if (!hasOnlyKeys(context, CONTEXT_KEYS)) return null;
  if (!isStringWithin(context.cidade, 80) || !isStringWithin(context.uf, 2) || !isStringWithin(context.coverageStatus, 20) || !isStringWithin(context.selectedPlan, 120)) return null;
  if (context.selectedPlanValue !== undefined && (typeof context.selectedPlanValue !== "number" || !Number.isFinite(context.selectedPlanValue) || context.selectedPlanValue < 0)) return null;
  const availablePlans = validatePlans(context.availablePlans);
  if (!availablePlans) return null;
  return {
    sessionId: cleanString(value.sessionId, MAX_SESSION_ID_LENGTH),
    step,
    message,
    context: {
      cidade: cleanString(context.cidade, 80),
      uf: cleanString(context.uf, 2).toUpperCase(),
      coverageStatus: ["VIAVEL", "INVIAVEL", "NAO_CONSULTADA"].includes(context.coverageStatus) ? context.coverageStatus : "NAO_CONSULTADA",
      selectedPlan: cleanString(context.selectedPlan, 120),
      selectedPlanValue: context.selectedPlanValue ?? 0,
      availablePlans
    }
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

export function buildOpenAiPayload(request, model) {
  const safeInput = {
    flowStep: request.step,
    customerMessage: request.message,
    context: request.context,
    commercialKnowledge: COMMERCIAL_KNOWLEDGE
  };
  return {
    model,
    instructions: WEBTURBO_AI_SYSTEM_PROMPT,
    input: JSON.stringify(safeInput),
    store: false,
    max_output_tokens: 300,
    text: {
      format: {
        type: "json_schema",
        name: "webturbo_chat_assist",
        strict: true,
        schema: AI_RESPONSE_SCHEMA
      }
    }
  };
}

export function createOpenAiAssist({ apiKey, model, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const configured = Boolean(apiKey && model);

  async function assist(rawRequest) {
    const request = validateAssistRequest(rawRequest);
    if (!request) return { status: 400, body: { ok: false, code: "INVALID_REQUEST", configured } };
    if (!configured) return { status: 503, body: { ok: false, code: "OPENAI_NOT_CONFIGURED", configured: false } };

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildOpenAiPayload(request, model)),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          status: 502,
          body: {
            ok: false,
            code: "OPENAI_UPSTREAM_ERROR",
            configured: true,
            upstreamStatus: Number(response.status || 0),
            latencyMs: Date.now() - started
          }
        };
      }
      let parsed;
      try {
        parsed = JSON.parse(extractOutputText(data));
      } catch {
        return { status: 502, body: { ok: false, code: "OPENAI_INVALID_RESPONSE", configured: true, latencyMs: Date.now() - started } };
      }
      const result = validateAiResponse(parsed, request.step);
      if (!result) return { status: 502, body: { ok: false, code: "OPENAI_INVALID_RESPONSE", configured: true, latencyMs: Date.now() - started } };
      return { status: 200, body: { ok: true, configured: true, result, latencyMs: Date.now() - started } };
    } catch (error) {
      return {
        status: 504,
        body: { ok: false, code: error?.name === "AbortError" ? "OPENAI_TIMEOUT" : "OPENAI_UNAVAILABLE", configured: true, latencyMs: Date.now() - started }
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { assist, configured, model: configured ? model : "" };
}

export async function readJsonBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { status: 400 });
  }
}
