// WebTurbo — hotfix de conversão: contatos, checkout direto, Telegram e compatibilidade do Chat.
(function () {
  "use strict";

  if (window.__webturboCheckoutRecoveryHotfixInstalled) return;
  window.__webturboCheckoutRecoveryHotfixInstalled = true;

  const TELEGRAM_ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const CHAT_STORAGE_KEY = "webturbo-chat-mvp-v5";
  const DUE_DATES = ["05", "08", "09", "10", "15", "25"];
  const TELEGRAM_DEDUPE_PREFIX = "wt_telegram_lead_once_v7:";
  let submitting = false;

  function clean(value) {
    return String(value || "").trim();
  }

  function digits(value) {
    return clean(value).replace(/\D+/g, "");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function track(name, params) {
    const data = params || {};
    try { window.clarity?.("event", name); } catch (_) {}
    try { window.gtag?.("event", name, data); } catch (_) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...data });
    } catch (_) {}
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

    if (phone1Label) phone1Label.textContent = "Seu WhatsApp principal *";
    if (phone2Label) phone2Label.textContent = "WhatsApp para recados (opcional)";
    if (phone1) {
      phone1.placeholder = "Seu WhatsApp com DDD";
      phone1.setAttribute("aria-label", "Seu WhatsApp principal com DDD");
    }
    if (phone2) {
      phone2.placeholder = "WhatsApp de alguém para recados";
      phone2.setAttribute("aria-label", "WhatsApp opcional de alguém para recados");
    }
    if (phone1Error) phone1Error.textContent = "Informe seu WhatsApp principal com DDD.";
    if (phone2Error) phone2Error.textContent = "Opcional: informe um WhatsApp diferente do principal para recados.";
  }

  // Sessões antigas do Chat podiam permanecer em data/turno de instalação.
  // O fluxo atual termina no vencimento e envia direto ao CRM, portanto convertemos
  // qualquer sessão legada antes de o módulo do Chat ser importado.
  function migrateLegacyChatSession() {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session || typeof session !== "object") return;

      const obsolete = new Set(["DATA_INSTALACAO", "TURNO_INSTALACAO", "CONFIRMACAO"]);
      const needsMigration = obsolete.has(session.step) || Boolean(session.dataInstalacao) || Boolean(session.turnoInstalacao);
      if (!needsMigration) return;

      session.dataInstalacao = "";
      session.turnoInstalacao = "";
      if (obsolete.has(session.step)) {
        session.step = "VENCIMENTO";
        session.flowStep = "VENCIMENTO";
      }
      session.conversationMode = "FLOW";
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(session));
      track("chat_sessao_instalacao_legada_migrada", { etapa: session.step });
    } catch (_) {}
  }

  function notificationIdentity(payload) {
    const cpf = digits(payload?.cpf || payload?.documentoCliente);
    const phone = digits(payload?.telefone1 || payload?.telefone1Cliente).slice(-11);
    const cep = digits(payload?.cep);
    if (!cpf && !phone) return "";
    return [cpf, phone, cep].join(":");
  }

  // Garante um único Telegram de recuperação por lead na sessão, independentemente
  // de a mesma pessoa aparecer primeiro no Hero e logo depois no Chat sincronizado.
  // Também elimina o disparo legado do coverage-base.
  (function installTelegramDedupe() {
    if (window.__webturboTelegramDedupeV7Installed) return;
    window.__webturboTelegramDedupeV7Installed = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = function webturboTelegramDedupFetch(input, init) {
      try {
        const url = typeof input === "string" ? input : String(input?.url || "");
        if (url === TELEGRAM_ENDPOINT && typeof init?.body === "string") {
          const payload = JSON.parse(init.body);
          if (payload?.action === "notifyAbandonoModal") {
            const identity = notificationIdentity(payload);
            if (identity) {
              const key = TELEGRAM_DEDUPE_PREFIX + identity;
              if (sessionStorage.getItem(key) === "1") {
                track("telegram_recuperacao_duplicado_bloqueado", {
                  origem: clean(payload?.origem),
                  finalizacao: clean(payload?.finalizacao),
                  evento: clean(payload?.evento)
                });
                return Promise.resolve(new Response(JSON.stringify({
                  ok: true,
                  skipped: true,
                  telegramSent: true,
                  reason: "same_lead_already_notified"
                }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                }));
              }

              // Reserva antes do request para impedir corrida entre input, blur, click,
              // polling e sincronização Hero -> Chat.
              sessionStorage.setItem(key, "1");
              return previousFetch(input, init).then((response) => {
                if (!response.ok) sessionStorage.removeItem(key);
                return response;
              }).catch((error) => {
                sessionStorage.removeItem(key);
                throw error;
              });
            }

            // Sem identidade suficiente, ainda bloqueia exclusivamente a rotina legada.
            const isLegacy = payload?.evento !== "lead_recuperacao_dados_completos";
            if (isLegacy) {
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

  function hideInstallationFields() {
    ["field-mDataInstalacao", "field-mTurnoInstalacao"].forEach((id) => {
      const field = byId(id);
      if (!field) return;
      field.hidden = true;
      field.style.setProperty("display", "none", "important");
      field.setAttribute("aria-hidden", "true");
    });
    if (byId("mDataInstalacao")) byId("mDataInstalacao").value = "";
    if (byId("mTurnoInstalacao")) byId("mTurnoInstalacao").value = "";
  }

  async function submitFromDueDate(button) {
    if (submitting) return;
    hideInstallationFields();

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
      track("checkout_direto_funcao_indisponivel");
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
    track("checkout_direto_hotfix_iniciado", { vencimento: value });

    try {
      await Promise.resolve(window.enviarFormulario());
    } catch (error) {
      console.warn("[WebTurbo] Falha ao enviar pedido diretamente da etapa de vencimento.", error);
      track("checkout_direto_hotfix_erro", { erro: clean(error?.message) || "erro" });
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

  // O onclick original ainda chama validarEtapaInstalacao(), que exige data/turno.
  // Capturamos o clique antes do handler legado e enviamos diretamente pelo vencimento.
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

  migrateLegacyChatSession();

  function refresh() {
    configurePhoneCopy();
    hideInstallationFields();
    const button = byId("etapa4")?.querySelector(".btn-modal-next");
    if (button) {
      button.textContent = "Concluir pedido";
      button.setAttribute("aria-label", "Concluir pedido");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();

  setTimeout(refresh, 300);
  setTimeout(refresh, 1200);
})();
