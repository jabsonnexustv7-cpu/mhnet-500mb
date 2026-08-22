import { createServer } from "node:http";

import { createOpenAiAssist } from "../../tools/chat-ai/openai-assist.mjs";
import { createChatAiHttpHandler } from "./app.mjs";

const port = Number(process.env.PORT || 8080);
const host = "0.0.0.0";
const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const assistService = createOpenAiAssist({
  apiKey: process.env.OPENAI_API_KEY,
  model,
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 10_000)
});
const handler = createChatAiHttpHandler({
  assistService,
  allowedOrigins: process.env.ALLOWED_ORIGINS || "https://webturbo-internet.com.br",
  allowDevelopmentOrigins: process.env.NODE_ENV !== "production",
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 10),
  serviceVersion: process.env.SERVICE_VERSION || "1.0.0"
});

const server = createServer(async (request, response) => {
  if (await handler(request, response)) return;
  response.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }));
});

server.listen(port, host, () => {
  console.log(`[WEBTURBO CHAT AI] ${JSON.stringify({ event: "service_started", port, model, configured: assistService.configured })}`);
});
