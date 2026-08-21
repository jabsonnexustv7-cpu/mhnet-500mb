(function () {
  "use strict";

  if (window.__webturboCrmCoordinatesFallbackInstalled) return;
  window.__webturboCrmCoordinatesFallbackInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const CRM_PRE_SALE_PATH = "/api/v1/public/site-pre-sales";

  function normalizeCoords(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return "";

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "";
    if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return "";

    return `${match[1]},${match[2]}`;
  }

  function coordsFromMapsLink(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const url = new URL(raw, window.location.origin);
      return normalizeCoords(url.searchParams.get("q") || url.searchParams.get("query") || "");
    } catch {
      const match = raw.match(/[?&](?:q|query)=([^&#]+)/i);
      if (!match) return "";
      try {
        return normalizeCoords(decodeURIComponent(match[1].replace(/\+/g, " ")));
      } catch {
        return "";
      }
    }
  }

  window.fetch = function (input, init) {
    try {
      const requestUrl = typeof input === "string" ? input : input && input.url ? input.url : "";
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();

      if (
        method === "POST" &&
        requestUrl.includes(CRM_PRE_SALE_PATH) &&
        init &&
        typeof init.body === "string"
      ) {
        const body = JSON.parse(init.body);
        const existingCoords = normalizeCoords(
          body.coordenadasFixas || body.coordenadas || body.coords || ""
        );
        const fallbackCoords = existingCoords || coordsFromMapsLink(body.linkLocalizacao);

        if (fallbackCoords) {
          body.coordenadasFixas = fallbackCoords;
          body.coordenadas = fallbackCoords;
          body.coords = fallbackCoords;
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (error) {
      console.warn("[WebTurbo] Não foi possível aplicar o fallback de coordenadas do CRM.", error);
    }

    return originalFetch(input, init);
  };

  // O wrapper da página já carrega este arquivo em todas as visitas.
  // Aproveitamos o ponto estável para carregar a melhoria do pós-venda sem alterar o HTML monolítico.
  if (!document.querySelector('script[data-webturbo-post-sale-whatsapp]')) {
    const script = document.createElement("script");
    script.src = "/consultar-cobertura/post-sale-whatsapp.js?v=1";
    script.async = false;
    script.dataset.webturboPostSaleWhatsapp = "1";
    document.body.appendChild(script);
  }
})();
