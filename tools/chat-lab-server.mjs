import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, relative } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const portArg = process.argv.find((arg) => /^--port=\d+$/.test(arg));
const port = Number(portArg?.split("=")[1] || process.env.CHAT_LAB_PORT || 4173);
const host = "0.0.0.0";
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

const server = createServer((request, response) => {
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
