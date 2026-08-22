import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PRODUCTION_AI_ASSIST_ENDPOINT,
  isFullDebugEnabled,
  isLocalDevelopmentLocation,
  resolveAiAssistEndpoint
} from "../runtime-config.js";

test("frontend local usa endpoint relativo do servidor de laboratório", () => {
  const location = { hostname: "localhost", port: "4173" };
  assert.equal(isLocalDevelopmentLocation(location), true);
  assert.equal(resolveAiAssistEndpoint(location), "/api/chat/assist");
});

test("frontend em produção usa endpoint preparado para Cloud Run", () => {
  const endpoint = resolveAiAssistEndpoint({ hostname: "webturbo-internet.com.br", port: "" });
  assert.equal(endpoint, PRODUCTION_AI_ASSIST_ENDPOINT);
  assert.match(endpoint, /^https:\/\/webturbo-chat-ai-/);
});

test("endpoint pode ser substituído por configuração de runtime", () => {
  const endpoint = resolveAiAssistEndpoint(
    { hostname: "webturbo-internet.com.br", port: "" },
    { aiAssistEndpoint: "https://chat.example.test/api/chat/assist/" }
  );
  assert.equal(endpoint, "https://chat.example.test/api/chat/assist");
});

test("debug completo é bloqueado em hostname de produção", () => {
  assert.equal(isFullDebugEnabled({ hostname: "localhost", port: "4173" }, "?debug=1"), true);
  assert.equal(isFullDebugEnabled({ hostname: "webturbo-internet.com.br", port: "" }, "?debug=1"), false);
});

test("bundle frontend não contém chave nem header Bearer da OpenAI", () => {
  const directory = dirname(fileURLToPath(new URL("../config.js", import.meta.url)));
  const source = readdirSync(directory)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /OPENAI_API_KEY|Authorization\s*:\s*[`'"]Bearer|sk-[A-Za-z0-9_-]{20,}/);
});
