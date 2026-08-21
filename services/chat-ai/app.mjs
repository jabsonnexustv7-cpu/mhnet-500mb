import { createHash, randomUUID } from "node:crypto";

import {
  MAX_BODY_BYTES,
  readJsonBody,
  validateAssistRequest
} from "../../tools/chat-ai/openai-assist.mjs";

const LOG_PREFIX = "[WEBTURBO CHAT AI]";
const DEFAULT_VERSION = "1.0.0";

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseAllowedOrigins(value) {
  return new Set(String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean));
}

function isDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "0.0.0.0"
      || /^10\./.test(url.hostname)
      || /^192\.168\./.test(url.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  } catch {
    return false;
  }
}

function shortHash(value) {
  return value ? createHash("sha256").update(String(value)).digest("hex").slice(0, 12) : "none";
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || request.socket?.remoteAddress || "unknown").slice(0, 64);
}

export function createInMemoryRateLimiter({ windowMs = 60_000, max = 10, now = () => Date.now() } = {}) {
  const buckets = new Map();

  function consume(keys) {
    const timestamp = now();
    const normalizedKeys = [...new Set(keys.filter(Boolean))];
    const records = normalizedKeys.map((key) => {
      const current = buckets.get(key);
      if (!current || timestamp >= current.resetAt) return { key, count: 0, resetAt: timestamp + windowMs };
      return { key, count: current.count, resetAt: current.resetAt };
    });
    const blocked = records.find((record) => record.count >= max);
    if (blocked) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((blocked.resetAt - timestamp) / 1000)) };
    }
    records.forEach((record) => buckets.set(record.key, { count: record.count + 1, resetAt: record.resetAt }));
    if (buckets.size > 5_000) {
      for (const [key, record] of buckets) {
        if (timestamp >= record.resetAt) buckets.delete(key);
      }
    }
    return { allowed: true, retryAfter: 0 };
  }

  return { consume };
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function safeLog(logger, level, event) {
  const method = typeof logger?.[level] === "function" ? logger[level].bind(logger) : logger?.log?.bind(logger);
  method?.(`${LOG_PREFIX} ${JSON.stringify(event)}`);
}

export function createChatAiHttpHandler({
  assistService,
  allowedOrigins = "",
  allowDevelopmentOrigins = false,
  rateLimitWindowMs = 60_000,
  rateLimitMax = 10,
  rateLimiter,
  logger = console,
  serviceVersion = DEFAULT_VERSION
} = {}) {
  if (!assistService?.assist) throw new Error("assistService é obrigatório");
  const origins = parseAllowedOrigins(allowedOrigins);
  const limiter = rateLimiter || createInMemoryRateLimiter({
    windowMs: parsePositiveInteger(rateLimitWindowMs, 60_000),
    max: parsePositiveInteger(rateLimitMax, 10)
  });

  function corsHeaders(origin) {
    if (!origin) return {};
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin"
    };
  }

  function originAllowed(origin) {
    if (!origin) return true;
    const normalized = origin.replace(/\/$/, "");
    return origins.has(normalized) || (allowDevelopmentOrigins && isDevelopmentOrigin(normalized));
  }

  return async function handleChatAiRequest(request, response) {
    const url = new URL(request.url || "/", "http://localhost");
    const isAiPath = url.pathname === "/health"
      || url.pathname === "/api/chat/assist"
      || url.pathname === "/api/chat/assist/status";
    if (!isAiPath) return false;

    const requestId = randomUUID();
    const started = Date.now();
    const origin = String(request.headers.origin || "").trim();
    if (!originAllowed(origin)) {
      safeLog(logger, "warn", { requestId, status: 403, code: "ORIGIN_NOT_ALLOWED" });
      sendJson(response, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", requestId });
      return true;
    }
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...cors, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end();
      return true;
    }

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED", requestId }, { ...cors, Allow: "GET, OPTIONS" });
        return true;
      }
      sendJson(response, 200, { ok: true }, cors);
      return true;
    }

    if (url.pathname === "/api/chat/assist/status") {
      if (request.method !== "GET") {
        sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED", requestId }, { ...cors, Allow: "GET, OPTIONS" });
        return true;
      }
      sendJson(response, 200, {
        ok: true,
        configured: assistService.configured === true,
        model: assistService.model || "",
        version: serviceVersion
      }, cors);
      return true;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED", requestId }, { ...cors, Allow: "POST, OPTIONS" });
      return true;
    }

    let rawBody;
    try {
      rawBody = await readJsonBody(request, MAX_BODY_BYTES);
    } catch (error) {
      const status = error?.status === 413 ? 413 : 400;
      safeLog(logger, "warn", { requestId, status, code: "INVALID_REQUEST" });
      sendJson(response, status, { ok: false, code: "INVALID_REQUEST", requestId }, cors);
      return true;
    }

    const validated = validateAssistRequest(rawBody);
    if (!validated) {
      safeLog(logger, "warn", { requestId, status: 400, code: "INVALID_REQUEST" });
      sendJson(response, 400, { ok: false, code: "INVALID_REQUEST", requestId }, cors);
      return true;
    }

    const ipHash = shortHash(clientIp(request));
    const sessionHash = shortHash(validated.sessionId);
    const rate = limiter.consume([`ip:${ipHash}`, `session:${sessionHash}`]);
    if (!rate.allowed) {
      safeLog(logger, "warn", {
        requestId,
        session: sessionHash,
        step: validated.step,
        status: 429,
        code: "RATE_LIMITED",
        rateLimited: true
      });
      sendJson(response, 429, {
        ok: false,
        code: "RATE_LIMITED",
        requestId,
        retryAfter: rate.retryAfter
      }, { ...cors, "Retry-After": String(rate.retryAfter) });
      return true;
    }

    let result;
    try {
      result = await assistService.assist(validated);
    } catch {
      result = { status: 503, body: { ok: false, code: "OPENAI_UNAVAILABLE", configured: assistService.configured === true } };
    }
    const status = Number(result?.status || 503);
    const body = result?.body && typeof result.body === "object"
      ? { ...result.body, requestId }
      : { ok: false, code: "OPENAI_UNAVAILABLE", requestId };
    safeLog(logger, status >= 500 ? "error" : "info", {
      requestId,
      session: sessionHash,
      step: validated.step,
      intent: body.result?.type || "",
      latencyMs: Number(body.latencyMs || Date.now() - started),
      status,
      code: body.code || "OK",
      upstreamStatus: Number(body.upstreamStatus || 0),
      rateLimited: false
    });
    sendJson(response, status, body, cors);
    return true;
  };
}
