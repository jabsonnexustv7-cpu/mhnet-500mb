// WebTurbo — normaliza erros do endpoint público do CRM para Hero/Chat.
(function () {
  "use strict";
  if (window.__webturboCrmErrorNormalizerInstalled) return;
  window.__webturboCrmErrorNormalizerInstalled = true;

  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const previousFetch = window.fetch.bind(window);

  function normalizedUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, location.href).href;
      if (input instanceof URL) return input.href;
      if (input?.url) return new URL(input.url, location.href).href;
    } catch (_) {}
    return "";
  }

  window.fetch = async function webturboCrmErrorNormalizedFetch(input, init) {
    const response = await previousFetch(input, init);
    if (normalizedUrl(input) !== CRM_ENDPOINT || response.ok) return response;

    try {
      const data = await response.clone().json().catch(() => ({}));
      if (data?.message) return response;
      const detail = Array.isArray(data?.error?.details) ? data.error.details[0] : null;
      const message = data?.error?.message || detail?.message || data?.error?.code || `Falha ao enviar ao CRM (HTTP ${response.status})`;
      const normalized = {
        ...data,
        ok: false,
        message,
        code: data?.code || data?.error?.code || "CRM_ERROR"
      };
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json" }
      });
    } catch (_) {
      return response;
    }
  };
})();
