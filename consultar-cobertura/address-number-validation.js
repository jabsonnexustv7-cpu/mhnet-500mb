// WebTurbo — validação do número do imóvel no Hero.
(function () {
  "use strict";

  if (window.__webturboAddressNumberValidationInstalled) return;
  window.__webturboAddressNumberValidationInstalled = true;

  const NUMBER_RE = /^(?:S\/?N|\d{1,7}(?:[-\s]?[A-Za-z]{1,3})?)$/i;

  function clean(value) {
    return String(value || "").trim();
  }

  function normalize(value) {
    const raw = clean(value).toUpperCase();
    if (/^(?:S\/?N|SEM\s*N[ÚU]MERO)$/i.test(raw)) return "S/N";
    return raw;
  }

  function valid(value) {
    return NUMBER_RE.test(normalize(value));
  }

  function message(input) {
    if (!input) return;
    input.setCustomValidity("Informe o número do imóvel, por exemplo 123, 123A ou S/N.");
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    try { input.reportValidity(); } catch (_) {}

    const status = document.getElementById("status");
    if (status) {
      status.textContent = "Informe um número de imóvel válido, por exemplo 123, 123A ou S/N.";
      status.className = "status-text bad";
    }
  }

  function clearError(input) {
    try { input?.setCustomValidity(""); } catch (_) {}
  }

  function validateInput(input) {
    if (!input) return true;
    const normalized = normalize(input.value);
    if (!valid(normalized)) {
      message(input);
      return false;
    }
    input.value = normalized;
    clearError(input);
    return true;
  }

  function setupInput(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.setAttribute("autocomplete", "address-line2");
    input.setAttribute("maxlength", "12");
    input.setAttribute("placeholder", "Ex.: 123, 123A ou S/N");
    input.addEventListener("input", () => clearError(input));
    input.addEventListener("blur", () => {
      if (clean(input.value)) validateInput(input);
    });
  }

  // Bloqueia a consulta principal antes que a rotina legada receba textos como "casa".
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("#btnConsultar");
    if (!button) return;
    const input = document.getElementById("numero");
    if (validateInput(input)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  // Segurança adicional para chamadas programáticas da função global.
  function patchConsultar() {
    if (typeof window.consultarCobertura !== "function" || window.consultarCobertura.__wtNumberGuarded) return;
    const original = window.consultarCobertura;
    const guarded = function (...args) {
      if (!validateInput(document.getElementById("numero"))) return;
      return original.apply(this, args);
    };
    guarded.__wtNumberGuarded = true;
    window.consultarCobertura = guarded;
  }

  window.webturboAddressNumber = { valid, normalize, validateInput };

  function boot() {
    setupInput("numero");
    setupInput("mNumero");
    patchConsultar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  setTimeout(boot, 600);
})();
