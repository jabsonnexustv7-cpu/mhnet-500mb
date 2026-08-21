import { AI_RESPONSE_SCHEMA, validateAiResponse } from "../../consultar-cobertura/chat/ai-schema.js";
import { COMMERCIAL_KNOWLEDGE } from "../../consultar-cobertura/chat/knowledge.js";
import { STATES } from "../../consultar-cobertura/chat/state.js";
import { WEBTURBO_AI_SYSTEM_PROMPT } from "./system-prompt.mjs";

const VALID_STEPS = new Set(Object.values(STATES));
const MAX_BODY_BYTES = 16 * 1024;

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function sanitizeServerMessage(value) {
  return cleanString(value, 500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[E-MAIL REMOVIDO]")
    .replace(/(?:\d[.\s-]?){11}/g, "[DOCUMENTO REMOVIDO]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}/g, "[TELEFONE REMOVIDO]")
    .replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g, "[DATA REMOVIDA]")
    .replace(/\b\d{5}[-.\s]?\d{3}\b/g, "[CEP REMOVIDO]")
    .replace(/\b\d{7,}\b/g, "[DADO REMOVIDO]")
    .trim();
}

function sanitizePlans(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((plan) => ({
    id: cleanString(plan?.id, 120),
    name: cleanString(plan?.name, 120),
    speed: Number.isFinite(Number(plan?.speed)) ? Number(plan.speed) : 0,
    price: Number.isFinite(Number(plan?.price)) ? Number(plan.price) : 0,
    features: Array.isArray(plan?.features) ? plan.features.slice(0, 5).map((item) => cleanString(item, 80)) : []
  }));
}

export function validateAssistRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const step = cleanString(value.step, 40);
  const message = sanitizeServerMessage(value.message);
  if (!VALID_STEPS.has(step) || !message) return null;
  const context = value.context && typeof value.context === "object" && !Array.isArray(value.context) ? value.context : {};
  return {
    sessionId: cleanString(value.sessionId, 100),
    step,
    message,
    context: {
      cidade: cleanString(context.cidade, 80),
      uf: cleanString(context.uf, 2).toUpperCase(),
      coverageStatus: ["VIAVEL", "INVIAVEL", "NAO_CONSULTADA"].includes(context.coverageStatus) ? context.coverageStatus : "NAO_CONSULTADA",
      selectedPlan: cleanString(context.selectedPlan, 120),
      selectedPlanValue: Number.isFinite(Number(context.selectedPlanValue)) ? Number(context.selectedPlanValue) : 0,
      availablePlans: sanitizePlans(context.availablePlans)
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
        return { status: 502, body: { ok: false, code: "OPENAI_UPSTREAM_ERROR", configured: true, latencyMs: Date.now() - started } };
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
