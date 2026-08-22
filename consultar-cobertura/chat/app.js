import { CHAT_CONFIG } from "./config.js?v=7";
import { createAiAssistService } from "./ai-service.js?v=7";
import { createChatFlow } from "./flow.js?v=7";
import { createBrowserLocationService, createCoverageNotificationService, createCoverageService, createCrmService, lookupAddress } from "./integrations.js?v=7";
import { routeMessage } from "./message-router.js?v=7";
import { createSession, loadSession, resetSession } from "./state.js?v=7";
import { createTrackingService } from "./tracking.js?v=7";
import { createChatUI } from "./ui.js?v=7";
import { createWhatsAppService } from "./whatsapp.js?v=7";

const ui = createChatUI();
const storage = window.localStorage;
const tracking = createTrackingService(CHAT_CONFIG);
tracking.initialize();
const whatsappService = createWhatsAppService(CHAT_CONFIG, tracking);
const aiService = createAiAssistService(CHAT_CONFIG);
const locationService = createBrowserLocationService({
  timeoutMs: CHAT_CONFIG.requestTimeoutMs,
  maxAccuracyMeters: CHAT_CONFIG.locationMaxAccuracyMeters
});
let session = loadSession(storage, CHAT_CONFIG.storageKey);
let flow;
let resumeAvailable = false;
const resumeDialog = document.getElementById("resume-dialog");
const launcher = document.getElementById("chat-launcher");

function buildFlow(currentSession) {
  return createChatFlow({
    session: currentSession,
    config: CHAT_CONFIG,
    storage,
    ui,
    coverageService: createCoverageService(CHAT_CONFIG),
    coverageNotificationService: createCoverageNotificationService(CHAT_CONFIG),
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
  resumeAvailable = false;
  closeResume({ restoreFocus: false });
  session = resetSession(storage, CHAT_CONFIG.storageKey);
  flow = buildFlow(session);
  await flow.start();
}

function continuePrevious() {
  resumeAvailable = false;
  closeResume({ restoreFocus: false });
  flow = buildFlow(session);
  flow.resume();
  ui.open();
}

function closeResume({ restoreFocus = true } = {}) {
  resumeDialog.hidden = true;
  document.body.classList.remove("chat-open");
  if (restoreFocus) launcher?.focus({ preventScroll: true });
}

function showResume() {
  resumeDialog.hidden = false;
  document.body.classList.add("chat-open");
  requestAnimationFrame(() => document.getElementById("resume-continue")?.focus({ preventScroll: true }));
}

function openChat() {
  if (resumeAvailable) {
    showResume();
    return;
  }
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

async function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const value = button.dataset.action === "select-installation-date"
    ? document.getElementById("installation-date-input")?.value
    : button.dataset.value;
  const result = await flow.handleAction(button.dataset.action, value);
  if (result === "restart") await startFresh();
}

document.getElementById("chat-actions").addEventListener("click", handleActionClick);
document.getElementById("chat-messages").addEventListener("click", handleActionClick);

document.getElementById("chat-launcher").addEventListener("click", openChat);
document.getElementById("hero-open-chat")?.addEventListener("click", openChat);
document.getElementById("chat-close").addEventListener("click", ui.close);
document.getElementById("chat-backdrop")?.addEventListener("click", ui.close);
document.getElementById("resume-close")?.addEventListener("click", closeResume);
resumeDialog.addEventListener("click", (event) => {
  if (event.target === resumeDialog) closeResume();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!resumeDialog.hidden) closeResume();
  else if (document.getElementById("chat-panel")?.classList.contains("is-open")) ui.close();
});
document.getElementById("resume-continue").addEventListener("click", continuePrevious);
document.getElementById("resume-new").addEventListener("click", async () => {
  await startFresh();
  ui.open();
});
document.querySelectorAll("[data-reset-session]").forEach((button) => button.addEventListener("click", startFresh));

if (CHAT_CONFIG.debug) document.body.classList.add("debug-enabled");
const realSubmission = CHAT_CONFIG.crmMode === "real";
const safetyNotice = document.getElementById("chat-safety");
safetyNotice.hidden = realSubmission;
safetyNotice.textContent = realSubmission ? "" : "Modo seguro · CRM e conversões em simulação";
const labDataMode = document.getElementById("lab-data-mode");
if (labDataMode) {
  labDataMode.textContent = realSubmission
    ? "✓ Pré-cadastro enviado ao confirmar"
    : "✓ Seus dados não são enviados neste teste";
}

if (session?.sessionId && session.messages?.length) {
  flow = buildFlow(session);
  resumeAvailable = true;
  resumeDialog.hidden = true;
  ui.updateDebug(session, CHAT_CONFIG);
} else {
  session = createSession();
  flow = buildFlow(session);
  flow.start();
}

if (new URLSearchParams(location.search).get("autostart") === "1") openChat();

aiService.status().then((status) => {
  session.ai.openAiConfigured = status.configured;
  ui.updateDebug(session, CHAT_CONFIG);
});

window.webturboChat = {
  getSession: () => flow.getSession(),
  reset: startFresh,
  open: openChat,
  close: ui.close,
  config: CHAT_CONFIG
};
