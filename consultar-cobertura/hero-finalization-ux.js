// WebTurbo — UX da etapa final do HERO + redirecionamento garantido para WhatsApp.
(function () {
  "use strict";

  if (window.__webturboHeroFinalizationUxInstalled) return;
  window.__webturboHeroFinalizationUxInstalled = true;

  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const WHATS_NUMBER = "555193187300";
  const originalFetch = window.fetch.bind(window);
  let redirectScheduled = false;
  let observerQueued = false;

  function clean(value) {
    return String(value || "").trim();
  }

  function digits(value) {
    return clean(value).replace(/\D+/g, "");
  }

  function value(id) {
    return clean(document.getElementById(id)?.value);
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

  function isHeroCrmRequest(input, init) {
    const url = normalizedUrl(input);
    const method = clean(init?.method || (input && input.method) || "GET").toUpperCase();
    if (url !== CRM_ENDPOINT || method !== "POST") return false;
    const body = parseBody(init);
    if (!body) return false;
    const eventId = clean(body.event_id).toLowerCase();
    const observation = clean(body.obsEndereco).toLowerCase();
    return !eventId.startsWith("chat_") && !observation.includes("chat-lab");
  }

  function buildWhatsUrl() {
    const cpf = digits(value("mCpf"));
    const message = cpf
      ? `Acabei de concluir um pedido de internet, meu CPF: ${cpf}`
      : "Acabei de concluir um pedido de internet pelo site da WebTurbo e quero falar com um atendente.";
    return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function track(name, params = {}) {
    try { window.clarity?.("event", name); } catch (_) {}
    try { window.gtag?.("event", name, params); } catch (_) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...params });
    } catch (_) {}
  }

  function setTextIfChanged(element, text) {
    if (element && clean(element.textContent) !== text) element.textContent = text;
  }

  function renameButtons() {
    const submit = document.getElementById("btnSubmit");
    if (submit) {
      setTextIfChanged(submit, "Concluir pedido");
      if (submit.getAttribute("aria-label") !== "Concluir pedido") submit.setAttribute("aria-label", "Concluir pedido");
    }

    const stage4 = document.getElementById("etapa4");
    if (stage4) {
      stage4.querySelectorAll("button, a").forEach((element) => {
        const text = clean(element.textContent);
        if (/revisar\s*(dados)?/i.test(text)) {
          setTextIfChanged(element, "Avançar");
          if (element.getAttribute("aria-label") !== "Avançar") element.setAttribute("aria-label", "Avançar");
        }
      });
    }
  }

  function ensureDirectWhatsButton() {
    const success = document.getElementById("etapaSucesso");
    if (!success) return null;

    let button = document.getElementById("posVendaWhatsButton");
    if (!button) {
      button = document.createElement("a");
      button.id = "posVendaWhatsButton";
      button.setAttribute("role", "button");
      button.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "min-height:52px",
        "margin-top:16px",
        "padding:0 24px",
        "border-radius:10px",
        "background:#00c853",
        "color:#fff",
        "font-family:Montserrat,sans-serif",
        "font-size:15px",
        "font-weight:800",
        "text-decoration:none",
        "box-shadow:0 8px 22px rgba(0,200,83,.28)"
      ].join(";");
      success.appendChild(button);
    }

    if (button.getAttribute("href") !== "#") button.setAttribute("href", "#");
    if (button.getAttribute("target") !== "_self") button.setAttribute("target", "_self");
    if (button.getAttribute("rel") !== "noopener") button.setAttribute("rel", "noopener");
    setTextIfChanged(button, "Falar com atendente");
    if (button.dataset.webturboDirectWhatsapp !== "true") button.dataset.webturboDirectWhatsapp = "true";
    button.removeAttribute("data-webturbo-chat-trigger");

    if (button.dataset.webturboDirectBound !== "true") {
      button.dataset.webturboDirectBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        track("pos_venda_falar_com_atendente", { origem_fluxo: "hero" });
        window.location.assign(buildWhatsUrl());
      }, true);
    }
    return button;
  }

  function scheduleWhatsappRedirect() {
    if (redirectScheduled) return;
    redirectScheduled = true;
    ensureDirectWhatsButton();
    track("hero_pos_venda_redirecionamento_whatsapp", { modo: "automatico" });

    window.setTimeout(() => {
      try {
        window.location.assign(buildWhatsUrl());
      } catch (error) {
        redirectScheduled = false;
        console.warn("[WebTurbo] Redirecionamento pós-venda para WhatsApp bloqueado; botão manual preservado.", error);
      }
    }, 350);
  }

  function refreshUi() {
    renameButtons();
    ensureDirectWhatsButton();
  }

  function queueRefresh() {
    if (observerQueued) return;
    observerQueued = true;
    window.requestAnimationFrame(() => {
      observerQueued = false;
      refreshUi();
    });
  }

  document.addEventListener("DOMContentLoaded", refreshUi, { once: true });
  new MutationObserver(queueRefresh).observe(document.body || document.documentElement, { childList: true, subtree: true });
  window.setTimeout(refreshUi, 300);

  window.fetch = async function webturboHeroFinalizationFetch(input, init) {
    const heroRequest = isHeroCrmRequest(input, init);
    const response = await originalFetch(input, init);

    if (heroRequest) {
      try {
        const copy = response.clone();
        const data = await copy.json().catch(() => ({}));
        if (response.ok && data?.ok === true) scheduleWhatsappRedirect();
      } catch (error) {
        console.warn("[WebTurbo] Não foi possível preparar o pós-venda do HERO.", error);
      }
    }

    return response;
  };
})();
