const CRM_API_BASE_URL = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app";
const SIGNATURE_SESSION_ENDPOINT = "/api/v1/public/signature-portal/session";
const SIGNATURE_EVENT_ENDPOINT = "/api/v1/public/signature-portal/events";
const EXPECTED_SIGNATURE_HOSTNAME = "vds.voalle.app";

const OVERLAY_OPEN_DELAY_MS = 450;
const FRAME_RETRY_DELAY_MS = 80;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CUSTOMER_NAME_LENGTH = 100;
const MAX_PLAN_LENGTH = 100;
const MAX_CITY_LENGTH = 120;
const MAX_STATE_LENGTH = 2;
const HELP_OPENED_SESSION_KEY = "webturbo-signature-help-opened";
const PORTAL_TOKEN_SESSION_KEY = "webturbo-signature-portal-token";
const CLARITY_EVENT_NAMES = new Set([
  "ajuda_aberta",
  "ajuda_fechada",
  "ajuda_comecar_aberta",
  "ajuda_camera_aberta",
  "ajuda_selfie_aberta",
  "ajuda_documento_aberta",
  "assinatura_recarregada",
  "assinatura_aberta_diretamente"
]);

const customerName = document.getElementById("customerName");
const customerPlan = document.getElementById("customerPlan");
const summaryCustomerName = document.getElementById("summaryCustomerName");
const summaryPlanName = document.getElementById("summaryPlanName");
const summaryOperatorName = document.getElementById("summaryOperatorName");
const summaryCity = document.getElementById("summaryCity");
const summaryDueDay = document.getElementById("summaryDueDay");
const portalSessionStatus = document.getElementById("portalSessionStatus");
const signatureButton = document.getElementById("signatureButton");
const signatureButtonLabel = signatureButton?.querySelector("[data-button-label]");
const signatureError = document.getElementById("signatureError");
const signatureOverlay = document.getElementById("signatureOverlay");
const closeSignatureOverlayButton = document.getElementById("closeSignatureOverlay");
const signatureFrame = document.getElementById("signatureFrame");
const signatureFrameLoading = document.getElementById("signatureFrameLoading");
const signatureFrameFallback = document.getElementById("signatureFrameFallback");
const signatureOverlayGuidance = document.getElementById("signatureOverlayGuidance");
const signatureHelpButton = document.getElementById("signatureHelpButton");
const signatureHelpDialog = document.getElementById("signatureHelpDialog");
const signatureOverlayHeader = signatureOverlay?.querySelector(".signature-overlay-header");
const signatureFrameContainer = signatureOverlay?.querySelector(".signature-frame-container");
const retrySignatureFrameButton = document.getElementById("retrySignatureFrame");
const openSignatureDirectlyButton = document.getElementById("openSignatureDirectly");
const closeSignatureHelpButton = document.getElementById("closeSignatureHelp");
const confirmSignatureHelpButton = document.getElementById("confirmSignatureHelp");
const helpAccordions = Array.from(document.querySelectorAll(".help-accordion"));
const portalDetails = Array.from(document.querySelectorAll(".portal-details"));

let portalToken = "";
let signatureUrl = "";
let sessionReady = false;
let clickInProgress = false;
let overlayOpenTimer;
let frameRetryTimer;
let helpReturnFocusElement = null;

function trackClarityEvent(eventName) {
  if (!CLARITY_EVENT_NAMES.has(eventName) || typeof window.clarity !== "function") return;

  try {
    window.clarity("event", eventName);
  } catch {
    // A telemetria nunca deve interromper a assinatura.
  }
}

function hasOpenedHelpInThisSession() {
  try {
    return window.sessionStorage.getItem(HELP_OPENED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markHelpAsOpened() {
  signatureHelpButton?.classList.remove("is-pulsing");
  try {
    window.sessionStorage.setItem(HELP_OPENED_SESSION_KEY, "1");
  } catch {
    // O sessionStorage pode estar indisponível em modos de privacidade restritos.
  }
}

function readStoredPortalToken() {
  try {
    return window.sessionStorage.getItem(PORTAL_TOKEN_SESSION_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function storePortalToken(token) {
  try {
    window.sessionStorage.setItem(PORTAL_TOKEN_SESSION_KEY, token);
  } catch {
    // Se o sessionStorage estiver indisponível, o primeiro acesso ainda funciona normalmente.
  }
}

function clearStoredPortalToken() {
  try {
    window.sessionStorage.removeItem(PORTAL_TOKEN_SESSION_KEY);
  } catch {
    // Nenhuma ação adicional é necessária.
  }
}

function sanitizeOptionalText(value, maximumLength) {
  if (typeof value !== "string") return "";

  const normalizedValue = value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (/^(undefined|null)$/iu.test(normalizedValue)) return "";
  return Array.from(normalizedValue).slice(0, maximumLength).join("").trim();
}

function getValidatedSignatureUrl(candidate) {
  try {
    const destination = new URL(candidate);
    if (
      destination.protocol === "https:" &&
      destination.hostname === EXPECTED_SIGNATURE_HOSTNAME &&
      !destination.username &&
      !destination.password
    ) {
      return destination.href;
    }
  } catch {
    return null;
  }

  return null;
}

function setSessionStatus(message, isError = false) {
  if (!portalSessionStatus) return;
  portalSessionStatus.textContent = message;
  portalSessionStatus.classList.toggle("is-error", isError);
  portalSessionStatus.hidden = !message;
}

function setSignatureError(message) {
  if (!signatureError) return;
  signatureError.textContent = message;
  signatureError.hidden = !message;
}

function setButtonLoading(label) {
  if (!signatureButton || !signatureButtonLabel) return;
  signatureButton.disabled = true;
  signatureButton.classList.add("is-loading");
  signatureButton.setAttribute("aria-busy", "true");
  signatureButtonLabel.textContent = label;
}

function restoreSignatureButton() {
  clickInProgress = false;
  if (!signatureButton || !signatureButtonLabel) return;

  signatureButton.disabled = !sessionReady;
  signatureButton.classList.remove("is-loading");
  signatureButton.setAttribute("aria-busy", "false");
  signatureButtonLabel.textContent = "Assinar documento";
}

function applyCustomerData(data) {
  const safeCustomerName = sanitizeOptionalText(data?.customer?.name, MAX_CUSTOMER_NAME_LENGTH);
  const safePlanName = sanitizeOptionalText(data?.plan?.name, MAX_PLAN_LENGTH);
  const safeOperatorName = sanitizeOptionalText(data?.operator?.name, MAX_PLAN_LENGTH);
  const safeCity = sanitizeOptionalText(data?.location?.city, MAX_CITY_LENGTH);
  const safeState = sanitizeOptionalText(data?.location?.state, MAX_STATE_LENGTH).toUpperCase();
  const dueDay = Number.isInteger(data?.billing?.dueDay) && data.billing.dueDay >= 1 && data.billing.dueDay <= 31
    ? data.billing.dueDay
    : 0;
  const speedMbps = Number.isInteger(data?.plan?.speedMbps) && data.plan.speedMbps > 0
    ? `${data.plan.speedMbps} Mbps`
    : "";
  const planLabel = safePlanName || speedMbps || "Plano de internet contratado";
  const cityLabel = safeCity && safeState
    ? `${safeCity}/${safeState}`
    : safeCity || safeState || "Cidade/UF";

  if (customerName) {
    customerName.textContent = safeCustomerName;
    customerName.hidden = !safeCustomerName;
  }
  if (customerPlan) customerPlan.textContent = `Plano contratado: ${planLabel}`;
  if (summaryCustomerName) summaryCustomerName.textContent = safeCustomerName || "Cliente WebTurbo";
  if (summaryPlanName) summaryPlanName.textContent = planLabel;
  if (summaryOperatorName) summaryOperatorName.textContent = safeOperatorName || "Operadora contratada";
  if (summaryCity) summaryCity.textContent = cityLabel;
  if (summaryDueDay) summaryDueDay.textContent = dueDay ? `Dia ${dueDay}` : "Dia escolhido";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadPortalSession(token) {
  setButtonLoading("Carregando...");
  setSessionStatus("Carregando sua contratação...");
  setSignatureError("");

  try {
    const response = await fetchWithTimeout(`${CRM_API_BASE_URL}${SIGNATURE_SESSION_ENDPOINT}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (payload?.error?.code === "SIGNATURE_PORTAL_CONTRACT_NOT_FOUND") {
        throw new Error("CONTRACT_NOT_FOUND");
      }
      if (response.status >= 400 && response.status < 500) {
        throw new Error("INVALID_LINK");
      }
      throw new Error("CONNECTION_FAILED");
    }

    const validatedUrl = getValidatedSignatureUrl(payload?.data?.signature?.url);
    if (!validatedUrl) throw new Error("CONTRACT_NOT_FOUND");

    signatureUrl = validatedUrl;
    applyCustomerData(payload.data);
    sessionReady = true;
    setSessionStatus("");
    restoreSignatureButton();
  } catch (error) {
    sessionReady = false;
    signatureUrl = "";
    restoreSignatureButton();
    if (error instanceof Error && error.message === "INVALID_LINK") {
      portalToken = "";
      clearStoredPortalToken();
      setSessionStatus("Este link de assinatura não é mais válido.", true);
    } else if (error instanceof Error && error.message === "CONTRACT_NOT_FOUND") {
      setSessionStatus("Não foi possível localizar o documento desta contratação.", true);
    } else {
      setSessionStatus("Não foi possível carregar sua contratação. Tente novamente.", true);
    }
  }
}

function initializePortalSession() {
  const hashParameters = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hashToken = hashParameters.get("acesso")?.trim() ?? "";

  if (hashToken) {
    portalToken = hashToken;
    storePortalToken(hashToken);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void loadPortalSession(portalToken);
    return;
  }

  const storedToken = readStoredPortalToken();
  if (storedToken) {
    portalToken = storedToken;
    void loadPortalSession(portalToken);
    return;
  }

  portalToken = "";
  signatureUrl = "";
  sessionReady = false;
  restoreSignatureButton();
  setSessionStatus("Este link de assinatura não é válido ou expirou. Solicite um novo link de acesso.", true);
}

async function sendSignatureEvent(eventId) {
  const response = await fetchWithTimeout(`${CRM_API_BASE_URL}${SIGNATURE_EVENT_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${portalToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ eventId, type: "SIGNATURE_BUTTON_CLICKED" }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });

  if (!response.ok) throw new Error("EVENT_FAILED");
}

async function recordSignatureClick() {
  const eventId = crypto.randomUUID();
  try {
    await sendSignatureEvent(eventId);
  } catch {
    await sendSignatureEvent(eventId);
  }
}

function clearFrameTimers() {
  window.clearTimeout(frameRetryTimer);
}

function resetSignatureGuidance() {
  if (signatureOverlayGuidance) signatureOverlayGuidance.hidden = true;
}

function showSignatureGuidance() {
  if (signatureOverlayGuidance) signatureOverlayGuidance.hidden = false;
}

function getHelpFocusableElements() {
  if (!signatureHelpDialog) return [];

  return Array.from(signatureHelpDialog.querySelectorAll(
    'button:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => {
    const closedDetails = element.closest("details:not([open])");
    return !closedDetails || (element.tagName === "SUMMARY" && element.parentElement === closedDetails);
  });
}

function setSignatureHelpVisibility(shouldShowHelp) {
  if (!signatureFrameFallback || !signatureHelpButton || !signatureHelpDialog) return;

  const isHelpOpen = !signatureFrameFallback.hidden;
  if (shouldShowHelp === isHelpOpen) return;

  if (shouldShowHelp) {
    helpReturnFocusElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : signatureHelpButton;
    signatureFrameFallback.hidden = false;
    signatureHelpButton.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("signature-help-open");
    document.body.classList.add("signature-help-open");
    markHelpAsOpened();
    trackClarityEvent("ajuda_aberta");
    closeSignatureHelpButton?.focus();
    if (signatureOverlayHeader) {
      signatureOverlayHeader.inert = true;
      signatureOverlayHeader.setAttribute("aria-hidden", "true");
    }
    if (signatureFrameContainer) {
      signatureFrameContainer.inert = true;
      signatureFrameContainer.setAttribute("aria-hidden", "true");
    }
    return;
  }

  signatureFrameFallback.hidden = true;
  signatureHelpButton.setAttribute("aria-expanded", "false");
  document.documentElement.classList.remove("signature-help-open");
  document.body.classList.remove("signature-help-open");
  if (signatureOverlayHeader) {
    signatureOverlayHeader.inert = false;
    signatureOverlayHeader.removeAttribute("aria-hidden");
  }
  if (signatureFrameContainer) {
    signatureFrameContainer.inert = false;
    signatureFrameContainer.removeAttribute("aria-hidden");
  }
  trackClarityEvent("ajuda_fechada");
  const focusTarget = helpReturnFocusElement?.isConnected ? helpReturnFocusElement : signatureHelpButton;
  helpReturnFocusElement = null;
  focusTarget?.focus();
}

function loadSignatureFrame() {
  const validatedUrl = getValidatedSignatureUrl(signatureUrl);
  if (!validatedUrl || !signatureFrame || !signatureFrameLoading) {
    setSignatureError("Não foi possível abrir o documento. Tente novamente.");
    closeSignatureOverlay();
    return;
  }

  clearFrameTimers();
  resetSignatureGuidance();
  signatureFrameLoading.hidden = false;
  setSignatureHelpVisibility(false);
  signatureFrame.removeAttribute("src");
  frameRetryTimer = window.setTimeout(() => {
    signatureFrame.src = validatedUrl;
  }, FRAME_RETRY_DELAY_MS);
}

function openSignatureOverlay() {
  if (!signatureOverlay || !closeSignatureOverlayButton) {
    setSignatureError("Não foi possível abrir o documento. Tente novamente.");
    restoreSignatureButton();
    return;
  }

  signatureOverlay.hidden = false;
  signatureOverlay.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("signature-open");
  document.body.classList.add("signature-open");
  loadSignatureFrame();
  closeSignatureOverlayButton.focus();
}

function closeSignatureOverlay() {
  window.clearTimeout(overlayOpenTimer);
  clearFrameTimers();
  if (signatureFrame) signatureFrame.removeAttribute("src");
  if (signatureFrameLoading) signatureFrameLoading.hidden = false;
  setSignatureHelpVisibility(false);
  resetSignatureGuidance();
  if (signatureOverlay) {
    signatureOverlay.hidden = true;
    signatureOverlay.removeAttribute("aria-hidden");
  }
  document.documentElement.classList.remove("signature-open");
  document.body.classList.remove("signature-open");
  restoreSignatureButton();
  signatureButton?.focus();
}

signatureButton?.addEventListener("click", async () => {
  if (clickInProgress || signatureButton.disabled || !sessionReady || !signatureButtonLabel) return;

  clickInProgress = true;
  setButtonLoading("Abrindo assinatura...");
  setSignatureError("");

  if (!getValidatedSignatureUrl(signatureUrl)) {
    setSignatureError("Não foi possível abrir o documento. Tente novamente.");
    restoreSignatureButton();
    return;
  }

  try {
    await recordSignatureClick();
  } catch {
    setSignatureError("Não foi possível iniciar a assinatura. Tente novamente.");
    restoreSignatureButton();
    return;
  }

  overlayOpenTimer = window.setTimeout(openSignatureOverlay, OVERLAY_OPEN_DELAY_MS);
});

closeSignatureOverlayButton?.addEventListener("click", closeSignatureOverlay);
retrySignatureFrameButton?.addEventListener("click", loadSignatureFrame);

signatureHelpButton?.addEventListener("click", () => {
  setSignatureHelpVisibility(true);
});

closeSignatureHelpButton?.addEventListener("click", () => {
  setSignatureHelpVisibility(false);
});

confirmSignatureHelpButton?.addEventListener("click", () => {
  setSignatureHelpVisibility(false);
});

retrySignatureFrameButton?.addEventListener("click", () => {
  trackClarityEvent("assinatura_recarregada");
});

openSignatureDirectlyButton?.addEventListener("click", () => {
  const validatedUrl = getValidatedSignatureUrl(signatureUrl);
  if (validatedUrl) {
    trackClarityEvent("assinatura_aberta_diretamente");
    window.location.assign(validatedUrl);
  } else {
    setSignatureError("Não foi possível abrir o documento. Tente novamente.");
    closeSignatureOverlay();
  }
});

signatureFrame?.addEventListener("load", () => {
  if (signatureOverlay && !signatureOverlay.hidden && signatureFrame.hasAttribute("src") && signatureFrameLoading) {
    signatureFrameLoading.hidden = true;
    showSignatureGuidance();
  }
});

portalDetails.forEach((detailsElement) => {
  detailsElement.open = false;
  detailsElement.addEventListener("toggle", () => {
    if (!detailsElement.open) return;
    portalDetails.forEach((otherDetailsElement) => {
      if (otherDetailsElement !== detailsElement && otherDetailsElement.open) {
        otherDetailsElement.open = false;
      }
    });
  });
});

helpAccordions.forEach((detailsElement) => {
  detailsElement.open = false;
  detailsElement.addEventListener("toggle", () => {
    if (!detailsElement.open) return;

    helpAccordions.forEach((otherDetailsElement) => {
      if (otherDetailsElement !== detailsElement && otherDetailsElement.open) {
        otherDetailsElement.open = false;
      }
    });

    trackClarityEvent(detailsElement.dataset.clarityEvent ?? "");
  });
});

if (hasOpenedHelpInThisSession()) {
  signatureHelpButton?.classList.remove("is-pulsing");
}

initializePortalSession();

document.addEventListener("keydown", (event) => {
  const isHelpOpen = Boolean(signatureFrameFallback && !signatureFrameFallback.hidden);

  if (event.key === "Escape" && isHelpOpen) {
    event.preventDefault();
    setSignatureHelpVisibility(false);
    return;
  }

  if (event.key === "Tab" && isHelpOpen) {
    const focusableElements = getHelpFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      signatureHelpDialog?.focus();
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
    return;
  }

  if (event.key === "Escape" && signatureOverlay && !signatureOverlay.hidden) {
    closeSignatureOverlay();
  }
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted && signatureOverlay && !signatureOverlay.hidden) {
    closeSignatureOverlay();
  }
});
