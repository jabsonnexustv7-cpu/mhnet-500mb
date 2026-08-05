// URL temporária usada somente para teste visual. Remover antes da integração definitiva.
const TEST_SIGNATURE_URL = "https://vds.voalle.app/documents/15b9a990-31fd-4407-ac11-2d9224ea76a2/7673c198-b5b6-48c0-960b-ced50cd458f0";
const EXPECTED_SIGNATURE_HOSTNAME = "vds.voalle.app";
const REDIRECT_DELAY_MS = 650;

const signatureButton = document.getElementById("signatureButton");
const signatureButtonLabel = signatureButton?.querySelector("[data-button-label]");
const signatureError = document.getElementById("signatureError");

function getValidatedSignatureUrl() {
  const destination = new URL(TEST_SIGNATURE_URL);

  if (destination.protocol !== "https:" || destination.hostname !== EXPECTED_SIGNATURE_HOSTNAME) {
    throw new Error("Invalid signature destination");
  }

  return destination.href;
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

signatureButton?.addEventListener("click", () => {
  if (signatureButton.disabled || !signatureButtonLabel) return;

  signatureButton.disabled = true;
  signatureButton.classList.add("is-loading");
  signatureButton.setAttribute("aria-busy", "true");
  signatureButtonLabel.textContent = "Abrindo assinatura...";

  if (signatureError) {
    signatureError.hidden = true;
  }

  let destination;

  try {
    destination = getValidatedSignatureUrl();
  } catch {
    showSignatureError();
    return;
  }

  window.setTimeout(() => {
    window.location.assign(destination);
  }, REDIRECT_DELAY_MS);
});
