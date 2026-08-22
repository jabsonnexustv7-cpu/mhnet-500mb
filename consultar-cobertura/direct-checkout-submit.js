// WebTurbo — fechamento direto após escolha do vencimento.
// Remove a etapa de revisão do caminho principal: vencimento -> CRM -> sucesso/WhatsApp.
(function () {
  "use strict";

  if (window.__webturboDirectCheckoutSubmitInstalled) return;
  window.__webturboDirectCheckoutSubmitInstalled = true;

  const DUE_DATES = ["05", "08", "09", "10", "15", "25"];
  let submitting = false;

  const byId = (id) => document.getElementById(id);

  function clean(value) {
    return String(value || "").trim();
  }

  function track(name, params) {
    const data = params || {};
    try { if (typeof window.trackGA4 === "function") window.trackGA4(name, data); } catch (_) {}
    try { if (typeof window.clarity === "function") window.clarity("event", name); } catch (_) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...data });
    } catch (_) {}
  }

  function context() {
    return {
      plano: byId("mPlano")?.value || "",
      vencimento: byId("mVencimento")?.value || "",
      cidade: clean(byId("mCidade")?.value),
      uf: clean(byId("mUf")?.value).toUpperCase()
    };
  }

  function configureDueDates() {
    const select = byId("mVencimento");
    if (!select) return;

    const currentValues = Array.from(select.options || []).map((option) => String(option.value || ""));
    const expected = ["", ...DUE_DATES];
    const alreadyCorrect = currentValues.length === expected.length && expected.every((value, index) => currentValues[index] === value);

    if (!alreadyCorrect) {
      const previous = DUE_DATES.includes(String(select.value || "").padStart(2, "0"))
        ? String(select.value || "").padStart(2, "0")
        : "";

      select.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Selecione o vencimento";
      select.appendChild(placeholder);

      DUE_DATES.forEach((day) => {
        const option = document.createElement("option");
        option.value = day;
        option.textContent = `Dia ${day}`;
        select.appendChild(option);
      });

      select.value = previous;
    }
  }

  function hideRedundantInstallationFields() {
    ["field-mDataInstalacao", "field-mTurnoInstalacao"].forEach((id) => {
      const field = byId(id);
      if (!field) return;
      field.hidden = true;
      field.style.display = "none";
      field.setAttribute("aria-hidden", "true");
    });

    const date = byId("mDataInstalacao");
    const shift = byId("mTurnoInstalacao");
    if (date) date.value = "";
    if (shift) shift.value = "";
  }

  function configureStepFourUi() {
    configureDueDates();
    hideRedundantInstallationFields();

    const title = byId("meta-landing-title");
    const description = byId("meta-landing-description");
    if (title) title.textContent = "Escolha o vencimento da sua fatura";
    if (description) description.textContent = "Escolha o melhor dia e conclua seu pedido. Data e turno de instalação serão confirmados no atendimento.";

    const step = byId("etapa4");
    if (!step) return;

    const nextButton = step.querySelector(".btn-modal-next") || Array.from(step.querySelectorAll("button")).find((button) => {
      const text = clean(button.textContent);
      return /avançar|revisar|continuar|concluir/i.test(text);
    });

    if (nextButton) {
      nextButton.textContent = "Concluir pedido";
      nextButton.setAttribute("aria-label", "Concluir pedido");
      nextButton.dataset.wtDirectCheckout = "true";
    }
  }

  async function directSubmit() {
    if (submitting) return;

    configureStepFourUi();
    const due = byId("mVencimento");
    if (!due?.value || !DUE_DATES.includes(String(due.value).padStart(2, "0"))) {
      try {
        if (typeof window.fieldReset === "function") window.fieldReset("mVencimento");
        if (typeof window.fieldError === "function") window.fieldError("mVencimento", "Selecione o vencimento.");
      } catch (_) {}
      due?.focus({ preventScroll: true });
      return;
    }

    due.value = String(due.value).padStart(2, "0");
    try { if (typeof window.fieldOk === "function") window.fieldOk("mVencimento"); } catch (_) {}

    track("vencimento_selecionado", context());
    track("checkout_direto_iniciado", context());

    if (typeof window.enviarFormulario !== "function") {
      console.warn("[WebTurbo] Função de envio ao CRM indisponível no checkout direto.");
      return;
    }

    submitting = true;
    const stepButton = byId("etapa4")?.querySelector("[data-wt-direct-checkout='true']");
    const originalText = stepButton?.textContent || "Concluir pedido";
    if (stepButton) {
      stepButton.disabled = true;
      stepButton.textContent = "Enviando pedido...";
    }

    try {
      await window.enviarFormulario();
    } catch (error) {
      console.warn("[WebTurbo] Falha inesperada no checkout direto.", error);
    } finally {
      submitting = false;
      if (stepButton && byId("etapa4")?.style.display !== "none") {
        stepButton.disabled = false;
        stepButton.textContent = originalText;
      }
    }
  }

  function patchInstallValidation() {
    if (typeof window.validarEtapaInstalacao !== "function") return false;
    if (window.validarEtapaInstalacao.__wtDirectCheckout) return true;

    const wrapped = function () {
      void directSubmit();
    };
    wrapped.__wtDirectCheckout = true;
    window.validarEtapaInstalacao = wrapped;
    return true;
  }

  function patchStepNavigation() {
    if (typeof window.mostrarEtapa !== "function") return false;
    if (window.mostrarEtapa.__wtDirectCheckout) return true;

    const original = window.mostrarEtapa;
    const wrapped = function (step) {
      const result = original.apply(this, arguments);
      if (Number(step) === 4) requestAnimationFrame(configureStepFourUi);
      return result;
    };
    wrapped.__wtDirectCheckout = true;
    window.mostrarEtapa = wrapped;
    return true;
  }

  function install() {
    configureDueDates();
    hideRedundantInstallationFields();
    patchInstallValidation();
    patchStepNavigation();

    // Compatibilidade com patches anteriores que podem substituir funções após o carregamento.
    setTimeout(() => {
      patchInstallValidation();
      patchStepNavigation();
      configureDueDates();
    }, 250);
    setTimeout(() => {
      patchInstallValidation();
      patchStepNavigation();
      configureDueDates();
    }, 900);
  }

  document.addEventListener("change", function (event) {
    if (event.target?.id === "mVencimento") {
      const value = String(event.target.value || "").padStart(2, "0");
      if (DUE_DATES.includes(value)) {
        event.target.value = value;
        track("vencimento_escolhido", context());
      }
    }
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
