const CRM_API_BASE_URL = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app";
const SIGNATURE_SESSION_ENDPOINT = "/api/v1/public/signature-portal/session";
const SIGNATURE_EVENT_ENDPOINT = "/api/v1/public/signature-portal/events";
const EXPECTED_SIGNATURE_HOSTNAME = "vds.voalle.app";

// Modo demonstrativo isolado: usado apenas quando a URL não contém #acesso.
const DEMO_SIGNATURE_URL = "https://vds.voalle.app/documents/15b9a990-31fd-4407-ac11-2d9224ea76a2/7673c198-b5b6-48c0-960b-ced50cd458f0";

const OVERLAY_OPEN_DELAY_MS = 450;
const FRAME_RETRY_DELAY_MS = 80;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CUSTOMER_NAME_LENGTH = 100;
const MAX_PLAN_LENGTH = 100;
const MAX_CITY_LENGTH = 120;
const MAX_STATE_LENGTH = 2;

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
const retrySignatureFrameButton = document.getElementById("retrySignatureFrame");
const openSignatureDirectlyButton = document.getElementById("openSignatureDirectly");
const closeSignatureHelpButton = document.getElementById("closeSignatureHelp");
const portalDetails = Array.from(document.querySelectorAll("details"));

let portalToken = "";
let signatureUrl = "";
let sessionReady = false;
let demoMode = false;
let clickInProgress = false;
let overlayOpenTimer;
let frameRetryTimer;

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

function applyDemoPersonalization() {
  const searchParameters = new URLSearchParams(window.location.search);
  const safeCustomerName = sanitizeOptionalText(
    searchParameters.get("nome"),
    MAX_CUSTOMER_NAME_LENGTH
  );
  const safePlan = sanitizeOptionalText(searchParameters.get("plano"), MAX_PLAN_LENGTH);

  applyCustomerData({
    customer: { name: safeCustomerName },
    plan: { name: safePlan || "Seu plano de internet" },
    operator: { name: "MhNet" }
  });
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
  const token = hashParameters.get("acesso")?.trim() ?? "";

  if (token) {
    portalToken = token;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void loadPortalSession(portalToken);
    return;
  }

  demoMode = true;
  signatureUrl = getValidatedSignatureUrl(DEMO_SIGNATURE_URL) ?? "";
  applyDemoPersonalization();
  sessionReady = Boolean(signatureUrl);
  restoreSignatureButton();
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

function setSignatureHelpVisibility(shouldShowHelp) {
  if (signatureFrameFallback) signatureFrameFallback.hidden = !shouldShowHelp;
  signatureHelpButton?.setAttribute("aria-expanded", String(shouldShowHelp));
}

function loadSignatureFrame() {
  const validatedUrl = getValidatedSignatureUrl(signatureUrl);
  if (!validatedUrl || !signatureFrame || !signatureFrameLoading || !signatureFrameFallback) {
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

  if (!demoMode) {
    try {
      await recordSignatureClick();
    } catch {
      setSignatureError("Não foi possível iniciar a assinatura. Tente novamente.");
      restoreSignatureButton();
      return;
    }
  }

  overlayOpenTimer = window.setTimeout(openSignatureOverlay, OVERLAY_OPEN_DELAY_MS);
});

closeSignatureOverlayButton?.addEventListener("click", closeSignatureOverlay);
retrySignatureFrameButton?.addEventListener("click", loadSignatureFrame);

signatureHelpButton?.addEventListener("click", () => {
  if (!signatureFrameFallback) return;
  setSignatureHelpVisibility(signatureFrameFallback.hidden);
});

closeSignatureHelpButton?.addEventListener("click", () => {
  setSignatureHelpVisibility(false);
  signatureHelpButton?.focus();
});

openSignatureDirectlyButton?.addEventListener("click", () => {
  const validatedUrl = getValidatedSignatureUrl(signatureUrl);
  if (validatedUrl) {
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

initializePortalSession();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && signatureOverlay && !signatureOverlay.hidden) {
    closeSignatureOverlay();
  }
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted && signatureOverlay && !signatureOverlay.hidden) {
    closeSignatureOverlay();
  }
});
