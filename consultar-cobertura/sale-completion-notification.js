// WebTurbo — notificação simples de venda concluída via Telegram.
// Observa apenas respostas de sucesso do endpoint público do CRM e dispara
// a action notifyVendaConcluida no modal-easy sem bloquear o fluxo pós-venda.
(function () {
  "use strict";

  if (window.__webturboSaleCompletionNotificationInstalled) return;
  window.__webturboSaleCompletionNotificationInstalled = true;

  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const NOTIFICATION_ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const originalFetch = window.fetch.bind(window);
  const sentKeys = new Set();

  function clean(value) {
    return String(value || "").trim();
  }

  function normalizedUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, window.location.href).href;
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === "string") return new URL(input.url, window.location.href).href;
    } catch (_) {}
    return "";
  }

  function parseBody(init) {
    try {
      if (!init || typeof init.body !== "string") return null;
      const parsed = JSON.parse(init.body);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function detectFinalization(body) {
    const eventId = clean(body?.event_id).toLowerCase();
    const observation = clean(body?.obsEndereco).toLowerCase();
    if (eventId.startsWith("chat_") || observation.includes("chat-lab") || observation.includes("chat")) {
      return "CHAT";
    }
    return "HERO";
  }

  function buildAddress(body) {
    const streetNumber = [clean(body?.logradouro), clean(body?.numero)].filter(Boolean).join(", ");
    const district = clean(body?.bairro);
    const cityUf = [clean(body?.nomeCidade || body?.cidade), clean(body?.uf).toUpperCase()].filter(Boolean).join("/");
    return [streetNumber, district, cityUf].filter(Boolean).join(" - ");
  }

  function saleKey(body, finalization) {
    return [
      clean(body?.event_id),
      clean(body?.nomeCliente).toLowerCase(),
      clean(body?.cep),
      clean(body?.numero),
      clean(body?.planos).toLowerCase(),
      finalization
    ].join("|");
  }

  function notifySale(body) {
    const finalization = detectFinalization(body);
    const key = saleKey(body, finalization);
    if (sentKeys.has(key)) return;
    sentKeys.add(key);

    const payload = {
      action: "notifyVendaConcluida",
      nomeCliente: clean(body?.nomeCliente),
      endereco: buildAddress(body),
      logradouro: clean(body?.logradouro),
      numero: clean(body?.numero),
      bairro: clean(body?.bairro),
      nomeCidade: clean(body?.nomeCidade || body?.cidade),
      uf: clean(body?.uf).toUpperCase(),
      planos: clean(body?.planos),
      finalizacao: finalization
    };

    // Fire-and-forget: Telegram nunca pode atrasar ou impedir o pós-venda/WhatsApp.
    void originalFetch(NOTIFICATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.warn("[WebTurbo] Notificação de venda concluída retornou erro.", {
          status: response.status,
          finalizacao: finalization,
          message: data?.message || ""
        });
      }
    }).catch((error) => {
      console.warn("[WebTurbo] Falha ao notificar venda concluída; fluxo pós-venda preservado.", {
        finalizacao: finalization,
        message: error?.message || String(error)
      });
    });
  }

  window.fetch = async function webturboSaleCompletionFetch(input, init) {
    const response = await originalFetch(input, init);

    try {
      const url = normalizedUrl(input);
      const method = clean(init?.method || (input && input.method) || "GET").toUpperCase();
      if (url === CRM_ENDPOINT && method === "POST") {
        const body = parseBody(init);
        if (body) {
          const responseCopy = response.clone();
          void responseCopy.json().then((data) => {
            if (response.ok && data?.ok === true) notifySale(body);
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.warn("[WebTurbo] Não foi possível preparar a notificação pós-venda; resposta do CRM preservada.", error);
    }

    return response;
  };
})();
