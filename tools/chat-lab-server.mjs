import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, relative } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { createOpenAiAssist, readJsonBody } from "./chat-ai/openai-assist.mjs";

const root = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const portArg = process.argv.find((arg) => /^--port=\d+$/.test(arg));
const port = Number(portArg?.split("=")[1] || process.env.CHAT_LAB_PORT || 4173);
const host = "0.0.0.0";
const crmUpstream = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function loadLocalEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadLocalEnv();
const openAiAssist = createOpenAiAssist({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 10000)
});

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function resolveRequestPath(rawUrl) {
  const pathname = decodeURIComponent(new URL(rawUrl, `http://localhost:${port}`).pathname);
  const requested = normalize(join(root, pathname.replace(/^[/\\]+/, "")));
  if (relative(root, requested).startsWith("..")) return null;
  try {
    if (statSync(requested).isDirectory()) return join(requested, "index.html");
  } catch {
    // A resposta 404 é gerada abaixo.
  }
  return requested;
}

async function proxyCrm(request, response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, message: "Payload excede o limite local." }));
      return;
    }
    chunks.push(chunk);
  }
  try {
    const upstream = await fetch(crmUpstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Buffer.concat(chunks)
    });
    const body = await upstream.text();
    response.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, message: "Falha ao conectar com o WebTurbo CRM.", detail: error.message }));
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://localhost:${port}`);
  if (requestUrl.pathname === "/api/chat/assist/status") {
    if (request.method !== "GET") {
      sendJson(response, 405, { ok: false, message: "Método não permitido." }, { Allow: "GET" });
      return;
    }
    sendJson(response, 200, { ok: true, configured: openAiAssist.configured, model: openAiAssist.model });
    return;
  }
  if (requestUrl.pathname === "/api/chat/assist") {
    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, message: "Método não permitido." }, { Allow: "POST" });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const result = await openAiAssist.assist(body);
      sendJson(response, result.status, result.body);
    } catch (error) {
      sendJson(response, error?.status || 400, { ok: false, code: error?.message || "INVALID_REQUEST" });
    }
    return;
  }
  if (requestUrl.pathname === "/api/chat/crm") {
    if (request.method !== "POST") {
      response.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "POST" });
      response.end(JSON.stringify({ ok: false, message: "Método não permitido." }));
      return;
    }
    await proxyCrm(request, response);
    return;
  }
  const filePath = resolveRequestPath(request.url || "/");
  try {
    if (!filePath || !statSync(filePath).isFile()) throw new Error("not_found");
    response.writeHead(200, {
      "Content-Type": mime[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo não encontrado.");
  }
});

server.listen(port, host, () => {
  const path = "/consultar-cobertura/chat-lab.html?debug=1";
  console.log(`[WEBTURBO CHAT] Servidor local ativo em http://localhost:${port}${path}`);
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((item) => item?.family === "IPv4" && !item.internal)
    .map((item) => item.address);
  addresses.forEach((address) => console.log(`[WEBTURBO CHAT] Celular na mesma rede: http://${address}:${port}${path}`));
  console.log("Pressione Ctrl+C para encerrar.");
});
