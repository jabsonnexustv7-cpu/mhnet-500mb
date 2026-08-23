// WebTurbo — hotfix de conversão: telefones, checkout direto e Telegram legado.
(function () {
  "use strict";

  if (window.__webturboCheckoutRecoveryHotfixInstalled) return;
  window.__webturboCheckoutRecoveryHotfixInstalled = true;

  const TELEGRAM_ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const DUE_DATES = ["05", "08", "09", "10", "15", "25"];
  let submitting = false;

  function clean(value) {
    return String(value || "").trim();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function configurePhoneCopy() {
    const step = byId("etapa3");
    if (!step) return;

    const phone1Label = step.querySelector('label[for="mTelefone1"]');
    const phone2Label = step.querySelector('label[for="mTelefone2"]');
    const phone1 = byId("mTelefone1");
    const phone2 = byId("mTelefone2");
    const phone1Error = byId("err-mTelefone1");
    const phone2Error = byId("err-mTelefone2");

    if (phone1Label) phone1Label.textContent = "Atendimento online principal *";
    if (phone2Label) phone2Label.textContent = "Telefone secundário (opcional)";
    if (phone1) {
      phone1.placeholder = "Seu WhatsApp com DDD";
      phone1.setAttribute("aria-label", "Atendimento online principal - seu WhatsApp com DDD");
    }
    if (phone2) {
      phone2.placeholder = "WhatsApp de alguém para recados";
      phone2.setAttribute("aria-label", "Telefone secundário opcional - WhatsApp de alguém para recados");
    }
    if (phone1Error) phone1Error.textContent = "Informe seu WhatsApp principal com DDD.";
    if (phone2Error) phone2Error.textContent = "Opcional: informe um WhatsApp diferente do principal para recados.";
  }

  // A rotina nova de recuperação é a única responsável pelo Telegram de lead.
  // Qualquer notifyAbandonoModal legado é descartado para impedir duplicidade.
  (function installLegacyTelegramBlock() {
    if (window.__webturboLegacyTelegramBlockInstalled) return;
    window.__webturboLegacyTelegramBlockInstalled = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = function webturboTelegramDedupFetch(input, init) {
      try {
        const url = typeof input === "string" ? input : String(input?.url || "");
        if (url === TELEGRAM_ENDPOINT && typeof init?.body === "string") {
          const payload = JSON.parse(init.body);
          const isLegacyAbandonment = payload?.action === "notifyAbandonoModal"
            && payload?.evento !== "lead_recuperacao_dados_completos";

          if (isLegacyAbandonment) {
            try { window.clarity?.("event", "telegram_abandono_legado_bloqueado"); } catch (_) {}
            return Promise.resolve(new Response(JSON.stringify({
              ok: true,
              skipped: true,
              telegramSent: true,
              reason: "legacy_abandonment_disabled"
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }));
          }
        }
      } catch (_) {}
      return previousFetch(input, init);
    };
  })();

  function showDueDateError() {
    const due = byId("mVencimento");
    try { window.fieldReset?.("mVencimento"); } catch (_) {}
    try { window.fieldError?.("mVencimento", "Selecione o vencimento."); } catch (_) {}
    due?.focus({ preventScroll: true });
  }

  async function submitFromDueDate(button) {
    if (submitting) return;
    const due = byId("mVencimento");
    const value = String(due?.value || "").padStart(2, "0");
    if (!DUE_DATES.includes(value)) {
      showDueDateError();
      return;
    }
    if (typeof window.enviarFormulario !== "function") {
      const error = byId("modalErro");
      if (error) {
        error.textContent = "Não foi possível iniciar o envio. Atualize a página e tente novamente.";
        error.classList.add("show");
      }
      return;
    }

    due.value = value;
    try { window.fieldOk?.("mVencimento"); } catch (_) {}

    submitting = true;
    const originalText = clean(button?.textContent) || "Concluir pedido";
    if (button) {
      button.disabled = true;
      button.textContent = "Enviando pedido...";
    }

    try {
      await window.enviarFormulario();
    } catch (error) {
      console.warn("[WebTurbo] Falha ao enviar pedido diretamente da etapa de vencimento.", error);
      const errorBox = byId("modalErro");
      if (errorBox) {
        errorBox.textContent = "Não foi possível concluir agora. Tente novamente em instantes.";
        errorBox.classList.add("show");
      }
    } finally {
      submitting = false;
      if (button && byId("etapa4") && getComputedStyle(byId("etapa4")).display !== "none") {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  // Intercepta o clique antes do onclick legado que ainda valida data/turno de instalação.
  document.addEventListener("click", function (event) {
    const button = event.target.closest?.("#etapa4 .btn-modal-next, #etapa4 [data-wt-direct-checkout='true']");
    if (!button) return;
    const step = byId("etapa4");
    if (!step || getComputedStyle(step).display === "none") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void submitFromDueDate(button);
  }, true);

  function refresh() {
    configurePhoneCopy();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();

  setTimeout(refresh, 300);
  setTimeout(refresh, 1200);
})();
