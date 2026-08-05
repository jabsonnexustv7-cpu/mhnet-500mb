// URL temporária usada somente para teste visual. Remover antes da integração definitiva.
const TEST_SIGNATURE_URL = "https://vds.voalle.app/documents/15b9a990-31fd-4407-ac11-2d9224ea76a2/7673c198-b5b6-48c0-960b-ced50cd458f0";
const EXPECTED_SIGNATURE_HOSTNAME = "vds.voalle.app";
const OVERLAY_OPEN_DELAY_MS = 450;
const FRAME_RETRY_DELAY_MS = 80;
const MAX_CUSTOMER_NAME_LENGTH = 100;
const MAX_PLAN_LENGTH = 50;

const customerName = document.getElementById("customerName");
const customerPlan = document.getElementById("customerPlan");
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

let overlayOpenTimer;
let frameRetryTimer;

function sanitizeOptionalParameter(value, maximumLength) {
  if (!value) return "";

  const normalizedValue = value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (/^(undefined|null)$/iu.test(normalizedValue)) return "";

  return Array.from(normalizedValue).slice(0, maximumLength).join("").trim();
}

function applyCustomerPersonalization() {
  const searchParameters = new URLSearchParams(window.location.search);
  const safeCustomerName = sanitizeOptionalParameter(searchParameters.get("nome"), MAX_CUSTOMER_NAME_LENGTH);
  const safePlan = sanitizeOptionalParameter(searchParameters.get("plano"), MAX_PLAN_LENGTH);

  if (customerName && safeCustomerName) {
    customerName.textContent = safeCustomerName;
    customerName.hidden = false;
  }

  if (customerPlan) {
    customerPlan.textContent = safePlan ? `Plano contratado: ${safePlan}` : "Seu plano de internet";
  }
}

function getValidatedSignatureUrl() {
  try {
    const destination = new URL(TEST_SIGNATURE_URL);

    if (destination.protocol === "https:" && destination.hostname === EXPECTED_SIGNATURE_HOSTNAME) {
      return destination.href;
    }
  } catch {
    return null;
  }

  return null;
}

function restoreSignatureButton() {
  if (!signatureButton || !signatureButtonLabel) return;

  signatureButton.disabled = false;
  signatureButton.classList.remove("is-loading");
  signatureButton.setAttribute("aria-busy", "false");
  signatureButtonLabel.textContent = "Assinar documento";
}

function showSignatureError() {
  restoreSignatureButton();

  if (signatureError) {
    signatureError.hidden = false;
  }
}

function clearFrameTimers() {
  window.clearTimeout(frameRetryTimer);
}

function resetSignatureGuidance() {
  if (signatureOverlayGuidance) {
    signatureOverlayGuidance.hidden = true;
  }
}

function showSignatureGuidance() {
  if (signatureOverlayGuidance) {
    signatureOverlayGuidance.hidden = false;
  }
}

function setSignatureHelpVisibility(shouldShowHelp) {
  if (signatureFrameFallback) {
    signatureFrameFallback.hidden = !shouldShowHelp;
  }

  signatureHelpButton?.setAttribute("aria-expanded", String(shouldShowHelp));
}

function loadSignatureFrame() {
  const signatureUrl = getValidatedSignatureUrl();

  if (!signatureUrl || !signatureFrame || !signatureFrameLoading || !signatureFrameFallback) {
    showSignatureError();
    closeSignatureOverlay();
    return;
  }

  clearFrameTimers();
  resetSignatureGuidance();
  signatureFrameLoading.hidden = false;
  setSignatureHelpVisibility(false);
  signatureFrame.removeAttribute("src");

  frameRetryTimer = window.setTimeout(() => {
    signatureFrame.src = signatureUrl;
  }, FRAME_RETRY_DELAY_MS);
}

function openSignatureOverlay() {
  if (!signatureOverlay || !closeSignatureOverlayButton) {
    showSignatureError();
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

  if (signatureFrame) {
    signatureFrame.removeAttribute("src");
  }

  if (signatureFrameLoading) {
    signatureFrameLoading.hidden = false;
  }

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

signatureButton?.addEventListener("click", () => {
  if (signatureButton.disabled || !signatureButtonLabel) return;

  signatureButton.disabled = true;
  signatureButton.classList.add("is-loading");
  signatureButton.setAttribute("aria-busy", "true");
  signatureButtonLabel.textContent = "Abrindo assinatura...";

  if (signatureError) {
    signatureError.hidden = true;
  }

  if (!getValidatedSignatureUrl()) {
    showSignatureError();
    return;
  }

  overlayOpenTimer = window.setTimeout(openSignatureOverlay, OVERLAY_OPEN_DELAY_MS);
});

closeSignatureOverlayButton?.addEventListener("click", closeSignatureOverlay);
retrySignatureFrameButton?.addEventListener("click", loadSignatureFrame);

signatureHelpButton?.addEventListener("click", () => {
  if (!signatureFrameFallback) return;

  const shouldShowHelp = signatureFrameFallback.hidden;
  setSignatureHelpVisibility(shouldShowHelp);
});

closeSignatureHelpButton?.addEventListener("click", () => {
  setSignatureHelpVisibility(false);
  signatureHelpButton?.focus();
});

openSignatureDirectlyButton?.addEventListener("click", () => {
  const signatureUrl = getValidatedSignatureUrl();

  if (signatureUrl) {
    window.location.assign(signatureUrl);
  } else {
    showSignatureError();
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

applyCustomerPersonalization();

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
