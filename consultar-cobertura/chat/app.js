import { CHAT_CONFIG } from "./config.js";
import { createAiAssistService } from "./ai-service.js";
import { createChatFlow } from "./flow.js";
import { createBrowserLocationService, createCoverageService, createCrmService, lookupAddress } from "./integrations.js";
import { routeMessage } from "./message-router.js";
import { createSession, loadSession, resetSession } from "./state.js";
import { createTrackingService } from "./tracking.js";
import { createChatUI } from "./ui.js";
import { createWhatsAppService } from "./whatsapp.js";

const ui = createChatUI();
const storage = window.localStorage;
const tracking = createTrackingService(CHAT_CONFIG);
tracking.initialize();
const whatsappService = createWhatsAppService(CHAT_CONFIG, tracking);
const aiService = createAiAssistService(CHAT_CONFIG);
const locationService = createBrowserLocationService({ timeoutMs: CHAT_CONFIG.requestTimeoutMs });
let session = loadSession(storage, CHAT_CONFIG.storageKey);
let flow;

function buildFlow(currentSession) {
  return createChatFlow({
    session: currentSession,
    config: CHAT_CONFIG,
    storage,
    ui,
    coverageService: createCoverageService(CHAT_CONFIG),
    crmService: createCrmService(CHAT_CONFIG),
    aiService,
    messageRouter: { route: routeMessage },
    addressLookup: (cep) => lookupAddress(cep, { timeoutMs: CHAT_CONFIG.requestTimeoutMs }),
    locationService,
    tracking,
    whatsappService
  });
}

async function startFresh() {
  session = resetSession(storage, CHAT_CONFIG.storageKey);
  flow = buildFlow(session);
  document.getElementById("resume-dialog").hidden = true;
  await flow.start();
}

function continuePrevious() {
  flow = buildFlow(session);
  document.getElementById("resume-dialog").hidden = true;
  flow.resume();
  ui.open();
}

const form = document.getElementById("chat-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = ui.input.value;
  ui.input.value = "";
  const result = await flow.handleText(text);
  if (result === "restart") await startFresh();
});

document.getElementById("chat-actions").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const value = button.dataset.action === "select-installation-date"
    ? document.getElementById("installation-date-input")?.value
    : button.dataset.value;
  const result = await flow.handleAction(button.dataset.action, value);
  if (result === "restart") await startFresh();
});

document.getElementById("chat-launcher").addEventListener("click", ui.open);
document.getElementById("hero-open-chat").addEventListener("click", ui.open);
document.getElementById("chat-close").addEventListener("click", ui.close);
document.getElementById("resume-continue").addEventListener("click", continuePrevious);
document.getElementById("resume-new").addEventListener("click", async () => {
  await startFresh();
  ui.open();
});
document.querySelectorAll("[data-reset-session]").forEach((button) => button.addEventListener("click", startFresh));

if (CHAT_CONFIG.debug) document.body.classList.add("debug-enabled");
const realSubmission = CHAT_CONFIG.crmMode === "real";
document.getElementById("chat-safety").textContent = realSubmission
  ? "Envio real ativado · ao confirmar, o pré-cadastro será criado no CRM"
  : "Modo seguro · CRM e conversões em simulação";
document.getElementById("lab-data-mode").textContent = realSubmission
  ? "✓ Pré-cadastro enviado ao confirmar"
  : "✓ Seus dados não são enviados neste teste";

if (session?.sessionId && session.messages?.length) {
  flow = buildFlow(session);
  document.getElementById("resume-dialog").hidden = false;
  ui.updateDebug(session, CHAT_CONFIG);
} else {
  session = createSession();
  flow = buildFlow(session);
  flow.start();
}

if (new URLSearchParams(location.search).get("autostart") === "1") ui.open();

aiService.status().then((status) => {
  session.ai.openAiConfigured = status.configured;
  ui.updateDebug(session, CHAT_CONFIG);
});

window.webturboChat = {
  getSession: () => flow.getSession(),
  reset: startFresh,
  config: CHAT_CONFIG
};
