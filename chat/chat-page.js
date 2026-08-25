const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid"
]);

function traditionalFlowUrl() {
  const params = new URLSearchParams();
  const current = new URLSearchParams(window.location.search);
  for (const [key, value] of current) {
    if (TRACKING_PARAMS.has(key) && value) params.set(key, value);
  }
  params.set("page_variant", "chat_only_return");
  return `/consultar-cobertura/?${params.toString()}`;
}

function preserveTraditionalFlowAttribution() {
  const url = traditionalFlowUrl();
  document.querySelectorAll("[data-traditional-flow]").forEach((link) => {
    link.href = url;
  });
  return url;
}

function installPersistentReturnLink(url) {
  for (const id of ["chat-close", "resume-close"]) {
    const button = document.getElementById(id);
    if (!button) continue;
    const link = document.createElement("a");
    link.id = id;
    link.className = button.className;
    link.href = url;
    link.setAttribute("aria-label", "Voltar para o formulário tradicional");
    link.innerHTML = '<span aria-hidden="true">←</span>';
    button.replaceWith(link);
  }
}

const traditionalUrl = preserveTraditionalFlowAttribution();

await import("/consultar-cobertura/chat/embed.js?v=17");

installPersistentReturnLink(traditionalUrl);
document.body.classList.add("chat-page-ready");

try { window.clarity?.("set", "page_variant", "chat_only"); } catch (_) {}
try { window.clarity?.("event", "chat_only_opened"); } catch (_) {}
try { window.gtag?.("event", "chat_only_opened", { page_variant: "chat_only", origem: "chat_webturbo" }); } catch (_) {}
try { window.dataLayer?.push({ event: "chat_only_opened", page_variant: "chat_only", origem: "chat_webturbo" }); } catch (_) {}

window.webturboChat?.open?.();

// Na página dedicada, Escape não deve fechar o único conteúdo interativo.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
