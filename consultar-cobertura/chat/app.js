import { CHAT_CONFIG } from "./config.js?v=9";
import { createAiAssistService } from "./ai-service.js?v=9";
import { createChatFlow } from "./flow-friction-v2.js?v=3";
import { readHeroSnapshot, applyHeroSnapshotToSession, syncChatSessionToHero, heroStageLabel } from "./hero-bridge.js?v=2";
import { createBrowserLocationService, createCoverageNotificationService, createCoverageService, createCrmService, lookupAddress } from "./integrations.js?v=9";
import { resumePromptForStep } from "./knowledge.js?v=9";
import { routeMessage } from "./message-router.js?v=9";
import { createSession, loadSession, resetSession, saveSession } from "./state.js?v=9";
import { createTrackingService } from "./tracking.js?v=9";
import { createChatUI } from "./ui.js?v=9";
import { createWhatsAppService } from "./whatsapp.js?v=9";

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

function appendAssistantMessage(text, meta = {}) {
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "assistant",
    text,
    meta,
    at: new Date().toISOString()
  };
  session.messages ||= [];
  session.messages.push(message);
  saveSession(session, storage, CHAT_CONFIG.storageKey);
  return message;
}

function heroSyncPrompt(snapshot) {
  const label = heroStageLabel(snapshot.stage);
  const planText = snapshot.plano?.title ? ` O plano ${snapshot.plano.title} já está selecionado.` : "";
  if (snapshot.stage === 5) {
    return `Vi que seu pedido já está na revisão final.${planText} Você não precisa preencher tudo novamente. Posso tentar finalizar o envio agora.`;
  }
  return `Vi que você já iniciou sua contratação pelo formulário e está na etapa de ${label}.${planText} Pode tirar sua dúvida aqui sem perder o que já foi preenchido.`;
}

function synchronizeHeroIntoChat() {
  const snapshot = readHeroSnapshot();
  if (!snapshot?.hasProgress || snapshot.stage < 2) return false;

  const previousSignature = `${session?.heroSync?.stage || ""}:${session?.heroSync?.step || ""}`;
  const nextSignature = `${snapshot.stage}:${snapshot.step}`;
  const alreadyPrompted = previousSignature === nextSignature && Boolean(session?.heroSync?.promptedAt);

  applyHeroSnapshotToSession(session, snapshot);
  if (!alreadyPrompted) {
    appendAssistantMessage(heroSyncPrompt(snapshot), { kind: "hero-context", heroStage: snapshot.stage });
    session.heroSync.promptedAt = new Date().toISOString();
  }
  saveSession(session, storage, CHAT_CONFIG.storageKey);
  flow = buildFlow(session);
  flow.resume();
  resumeAvailable = false;

  if (!alreadyPrompted) {
    if (snapshot.stage === 5) {
      ui.showQuickReplies([
        { label: "Tentar finalizar meu pedido", action: "finalize-hero-order" },
        { label: "Voltar para o formulário", action: "return-to-hero" }
      ]);
    } else {
      ui.showQuickReplies([
        { label: "Continuar preenchendo aqui", action: "continue-from-hero" },
        { label: "Voltar para o formulário", action: "return-to-hero" }
      ]);
    }
  }
  return true;
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

function closeChat({ syncHero = true } = {}) {
  if (syncHero && session?.heroSync?.source === "hero") {
    syncChatSessionToHero(session);
  }
  ui.close();
}

function openChat() {
  if (synchronizeHeroIntoChat()) {
    ui.open();
    return;
  }
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
  const action = button.dataset.action;

  if (action === "continue-from-hero") {
    ui.clearActions();
    flow = buildFlow(session);
    if (session?.heroSync?.stage === 4 && session.diaVencimentoFatura) {
      appendAssistantMessage(`Vou concluir usando o vencimento do dia ${session.diaVencimentoFatura}.`, { kind: "hero-resume-submit" });
      await flow.handleAction("select-due-date", session.diaVencimentoFatura);
      return;
    }
    appendAssistantMessage(resumePromptForStep(session.step), { kind: "hero-resume" });
    flow.resume();
    return;
  }

  if (action === "finalize-hero-order") {
    ui.clearActions();
    syncChatSessionToHero(session);
    appendAssistantMessage("Certo. Vou tentar finalizar o envio do seu pedido agora.", { kind: "hero-finalize" });
    try { window.clarity?.("event", "chat_tentou_finalizar_hero"); } catch (_) {}
    try { window.gtag?.("event", "chat_tentou_finalizar_hero", { origem: "chat_webturbo" }); } catch (_) {}
    closeChat({ syncHero: false });
    setTimeout(() => {
      const submit = document.getElementById("btnSubmit");
      if (submit && !submit.disabled) submit.click();
      else {
        try { window.clarity?.("event", "chat_finalizar_hero_indisponivel"); } catch (_) {}
      }
    }, 180);
    return;
  }

  if (action === "return-to-hero") {
    syncChatSessionToHero(session);
    appendAssistantMessage("Certo. Mantive seus dados no formulário para você continuar por lá.", { kind: "hero-return" });
    closeChat({ syncHero: false });
    return;
  }

  const value = action === "select-installation-date"
    ? document.getElementById("installation-date-input")?.value
    : button.dataset.value;
  const result = await flow.handleAction(action, value);
  if (result === "restart") await startFresh();
}

document.getElementById("chat-actions").addEventListener("click", handleActionClick);
document.getElementById("chat-messages").addEventListener("click", handleActionClick);

document.getElementById("chat-launcher").addEventListener("click", openChat);
document.getElementById("hero-open-chat")?.addEventListener("click", openChat);
document.getElementById("chat-close").addEventListener("click", () => closeChat());
document.getElementById("chat-backdrop")?.addEventListener("click", () => closeChat());
document.getElementById("resume-close")?.addEventListener("click", closeResume);
resumeDialog.addEventListener("click", (event) => {
  if (event.target === resumeDialog) closeResume();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!resumeDialog.hidden) closeResume();
  else if (document.getElementById("chat-panel")?.classList.contains("is-open")) closeChat();
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
    ? "✓ Pré-cadastro enviado após escolher o vencimento"
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
  close: closeChat,
  syncFromHero: synchronizeHeroIntoChat,
  syncToHero: () => syncChatSessionToHero(session),
  config: CHAT_CONFIG
};
