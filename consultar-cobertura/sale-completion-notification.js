// WebTurbo — notificação simples de venda concluída via Telegram + pós-venda do Chat.
// Observa apenas respostas de sucesso do endpoint público do CRM. A notificação
// é fire-and-forget e, quando a finalização ocorreu no CHAT, replica o pós-venda
// do Hero: exibe fallback e encaminha para o WhatsApp sem depender do Telegram.
(function () {
  "use strict";

  if (window.__webturboSaleCompletionNotificationInstalled) return;
  window.__webturboSaleCompletionNotificationInstalled = true;

  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const NOTIFICATION_ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const WHATS_NUMBER = "555193187300";
  const originalFetch = window.fetch.bind(window);
  const sentKeys = new Set();
  const redirectedKeys = new Set();

  function clean(value) {
    return String(value || "").trim();
  }

  function onlyDigits(value) {
    return clean(value).replace(/\D+/g, "");
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

  function buildPostSaleWhatsAppUrl(body) {
    const cpf = onlyDigits(body?.documentoCliente || body?.cpf || "");
    const message = cpf
      ? `Acabei de concluir um pedido de internet, meu CPF: ${cpf}`
      : "Acabei de concluir um pedido de internet pelo site da WebTurbo.";
    return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function installChatWhatsAppFallback(url) {
    const card = document.querySelector("#webturbo-chat-root .post-sale-card");
    if (!card) return false;

    let hint = card.querySelector("[data-chat-post-sale-whatsapp-hint]");
    if (!hint) {
      hint = document.createElement("p");
      hint.dataset.chatPostSaleWhatsappHint = "true";
      hint.textContent = "Para concluir o atendimento, continue no WhatsApp.";
      hint.style.marginTop = "10px";
      card.appendChild(hint);
    }

    let button = card.querySelector("[data-chat-post-sale-whatsapp]");
    if (!button) {
      button = document.createElement("a");
      button.dataset.chatPostSaleWhatsapp = "true";
      button.href = url;
      button.target = "_self";
      button.rel = "noopener";
      button.textContent = "Continuar no WhatsApp";
      button.setAttribute("role", "button");
      button.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "min-height:46px",
        "margin-top:12px",
        "padding:0 18px",
        "border-radius:12px",
        "background:#00c853",
        "color:#fff",
        "font-weight:800",
        "text-decoration:none",
        "box-shadow:0 8px 22px rgba(0,200,83,.22)"
      ].join(";");
      card.appendChild(button);
    } else {
      button.href = url;
    }

    return true;
  }

  function redirectChatSaleToWhatsApp(body) {
    const finalization = detectFinalization(body);
    if (finalization !== "CHAT") return;

    const key = saleKey(body, finalization);
    if (redirectedKeys.has(key)) return;
    redirectedKeys.add(key);

    const url = buildPostSaleWhatsAppUrl(body);

    // O card do Chat é renderizado logo após o retorno do CRM. Tentamos instalar
    // o fallback algumas vezes antes do redirecionamento automático.
    setTimeout(() => installChatWhatsAppFallback(url), 50);
    setTimeout(() => installChatWhatsAppFallback(url), 250);

    // Pequeno intervalo apenas para a UI de sucesso/fallback ser renderizada.
    // location.assign funciona no mobile e desktop; se o navegador impedir,
    // o botão "Continuar no WhatsApp" permanece disponível no card.
    setTimeout(() => {
      try {
        installChatWhatsAppFallback(url);
        window.location.assign(url);
      } catch (error) {
        console.warn("[WebTurbo] Redirecionamento pós-venda do Chat não foi aceito; fallback mantido.", error);
      }
    }, 650);
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
            if (response.ok && data?.ok === true) {
              notifySale(body);
              redirectChatSaleToWhatsApp(body);
            }
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.warn("[WebTurbo] Não foi possível preparar o pós-venda; resposta do CRM preservada.", error);
    }

    return response;
  };
})();
