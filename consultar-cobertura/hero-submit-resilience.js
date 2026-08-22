// WebTurbo — resiliência do envio final do HERO para o CRM.
// Reexecuta apenas falhas transitórias e oferece recuperação clara sem perder o formulário.
(function () {
  "use strict";

  if (window.__webturboHeroSubmitResilienceInstalled) return;
  window.__webturboHeroSubmitResilienceInstalled = true;

  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
  const RETRY_DELAY_MS = 900;
  const originalFetch = window.fetch.bind(window);
  let retrying = false;

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
      const value = JSON.parse(init.body);
      return value && typeof value === "object" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function isHeroRequest(input, init) {
    const url = normalizedUrl(input);
    const method = clean(init?.method || (input && input.method) || "GET").toUpperCase();
    if (url !== CRM_ENDPOINT || method !== "POST") return false;
    const body = parseBody(init);
    if (!body) return false;
    const eventId = clean(body.event_id).toLowerCase();
    const observation = clean(body.obsEndereco).toLowerCase();
    return !eventId.startsWith("chat_") && !observation.includes("chat-lab");
  }

  function clarityEvent(name) {
    try { window.clarity?.("event", name); } catch (_) {}
  }

  function gaEvent(name, params) {
    try { window.gtag?.("event", name, params || {}); } catch (_) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...(params || {}) });
    } catch (_) {}
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function stageFiveVisible() {
    const stage = document.getElementById("etapa5");
    if (!stage) return false;
    const style = window.getComputedStyle?.(stage);
    return stage.style.display !== "none" && style?.display !== "none" && style?.visibility !== "hidden";
  }

  function buildWhatsappUrl() {
    const value = (id) => clean(document.getElementById(id)?.value);
    const lines = [
      "Olá! Tive um erro ao finalizar meu pedido no site da WebTurbo e quero concluir a contratação.",
      value("mNome") ? `Nome: ${value("mNome")}` : "",
      value("mPlano") ? `Plano: ${value("mPlano")}` : "",
      value("mCidade") ? `Cidade: ${value("mCidade")}/${value("mUf")}` : "",
      value("mCep") ? `CEP: ${value("mCep")}` : ""
    ].filter(Boolean);
    return `https://wa.me/555193187300?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  function ensureRecoveryPanel() {
    if (!stageFiveVisible()) return;
    const error = document.getElementById("modalErro");
    const submit = document.getElementById("btnSubmit");
    if (!error || !submit) return;

    let panel = document.getElementById("wt-hero-submit-recovery");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "wt-hero-submit-recovery";
      panel.setAttribute("role", "alert");
      panel.style.cssText = "margin:12px 0;padding:14px;border:1px solid #f0b6b6;border-radius:10px;background:#fff7f7;color:#7a1f1f;font-size:13px;line-height:1.45";
      panel.innerHTML = [
        "<strong style=\"display:block;margin-bottom:5px\">Não precisa preencher tudo novamente.</strong>",
        "<span style=\"display:block;margin-bottom:10px\">Se o envio falhar, tente novamente. Seus dados continuam preenchidos nesta tela.</span>",
        "<div style=\"display:flex;gap:8px;flex-wrap:wrap\">",
        "<button type=\"button\" id=\"wt-hero-retry-submit\" style=\"min-height:42px;padding:0 14px;border:0;border-radius:8px;background:#0a2463;color:#fff;font-weight:800;cursor:pointer\">Tentar enviar novamente</button>",
        "<a id=\"wt-hero-whatsapp-fallback\" target=\"_blank\" rel=\"noopener\" style=\"min-height:42px;padding:0 14px;border-radius:8px;background:#00a884;color:#fff;font-weight:800;display:inline-flex;align-items:center;text-decoration:none\">Concluir pelo WhatsApp</a>",
        "</div>"
      ].join("");
      error.insertAdjacentElement("afterend", panel);
      panel.querySelector("#wt-hero-retry-submit")?.addEventListener("click", () => {
        panel.remove();
        clarityEvent("hero_crm_retry_manual");
        gaEvent("hero_crm_retry_manual");
        submit.click();
      });
      panel.querySelector("#wt-hero-whatsapp-fallback")?.addEventListener("click", () => {
        clarityEvent("hero_crm_fallback_whatsapp");
        gaEvent("hero_crm_fallback_whatsapp");
      });
    }
    const link = panel.querySelector("#wt-hero-whatsapp-fallback");
    if (link) link.href = buildWhatsappUrl();
    panel.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function hideRecoveryPanel() {
    document.getElementById("wt-hero-submit-recovery")?.remove();
  }

  async function readErrorCode(response) {
    try {
      const copy = response.clone();
      const data = await copy.json();
      return clean(data?.code || data?.message || data?.motivo || "").slice(0, 80);
    } catch (_) {
      return "";
    }
  }

  window.fetch = async function webturboHeroResilientFetch(input, init) {
    if (!isHeroRequest(input, init)) return originalFetch(input, init);

    hideRecoveryPanel();
    let firstResponse;
    try {
      firstResponse = await originalFetch(input, init);
    } catch (error) {
      if (!retrying) {
        retrying = true;
        clarityEvent("hero_crm_retry_automatico");
        gaEvent("hero_crm_retry_automatico", { motivo: "network_error" });
        await wait(RETRY_DELAY_MS);
        try {
          const retryResponse = await originalFetch(input, init);
          retrying = false;
          if (retryResponse.ok) {
            clarityEvent("hero_crm_sucesso_apos_retry");
            return retryResponse;
          }
          const code = await readErrorCode(retryResponse);
          gaEvent("hero_crm_erro_final", { http_status: retryResponse.status, codigo: code || "sem_codigo" });
          clarityEvent("hero_crm_erro_final");
          setTimeout(ensureRecoveryPanel, 80);
          return retryResponse;
        } catch (retryError) {
          retrying = false;
          gaEvent("hero_crm_erro_final", { http_status: 0, codigo: "network_error" });
          clarityEvent("hero_crm_erro_final");
          setTimeout(ensureRecoveryPanel, 80);
          throw retryError;
        }
      }
      throw error;
    }

    if (firstResponse.ok) {
      clarityEvent("hero_crm_sucesso");
      return firstResponse;
    }

    if (TRANSIENT_STATUS.has(firstResponse.status) && !retrying) {
      retrying = true;
      clarityEvent("hero_crm_retry_automatico");
      gaEvent("hero_crm_retry_automatico", { motivo: `http_${firstResponse.status}` });
      await wait(RETRY_DELAY_MS);
      try {
        const retryResponse = await originalFetch(input, init);
        retrying = false;
        if (retryResponse.ok) {
          clarityEvent("hero_crm_sucesso_apos_retry");
          return retryResponse;
        }
        const code = await readErrorCode(retryResponse);
        gaEvent("hero_crm_erro_final", { http_status: retryResponse.status, codigo: code || "sem_codigo" });
        clarityEvent("hero_crm_erro_final");
        setTimeout(ensureRecoveryPanel, 80);
        return retryResponse;
      } catch (error) {
        retrying = false;
        gaEvent("hero_crm_erro_final", { http_status: 0, codigo: "network_error" });
        clarityEvent("hero_crm_erro_final");
        setTimeout(ensureRecoveryPanel, 80);
        throw error;
      }
    }

    const code = await readErrorCode(firstResponse);
    gaEvent("hero_crm_erro_final", { http_status: firstResponse.status, codigo: code || "sem_codigo" });
    clarityEvent("hero_crm_erro_final");
    setTimeout(ensureRecoveryPanel, 80);
    return firstResponse;
  };
})();
