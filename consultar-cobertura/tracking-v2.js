// Rastreamento v2: atribuição por último toque pago explícito e Lead com dados completos.
(function () {
  "use strict";

  const TRAFFIC_KEY = "webturbo_origem_trafego";
  const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const LEAD_TIMEOUT_MS = 10_000;
  const LEAD_MAX_ATTEMPTS = 2;
  const GOOGLE_FINAL_LEAD_SEND_TO = "AW-17075496858/zJmpCO2zoM8bEJrPnc4_";

  function param(name) {
    return (new URLSearchParams(window.location.search).get(name) || "").trim();
  }

  function safeReadTraffic() {
    try {
      return JSON.parse(localStorage.getItem(TRAFFIC_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function safeWriteTraffic(value) {
    try {
      localStorage.setItem(TRAFFIC_KEY, JSON.stringify(value));
    } catch (_) {}
  }

  function sourceFromCurrentVisit() {
    const utmSource = param("utm_source").toLowerCase();
    const hasGoogleClick = Boolean(param("gclid") || param("gbraid") || param("wbraid"));
    const hasMetaClick = Boolean(param("fbclid"));

    if (/^(google|googleads|adwords)$/i.test(utmSource) || utmSource.includes("google")) return "google";
    if (/(facebook|instagram|meta)/i.test(utmSource)) return "meta";
    if (hasMetaClick && !hasGoogleClick) return "meta";
    if (hasGoogleClick && !hasMetaClick) return "google";

    // Em uma URL anômala com IDs das duas plataformas, evita herdar um toque antigo.
    if (hasGoogleClick && hasMetaClick) return "ambiguous";
    return "";
  }

  function currentUtmData() {
    return {
      utm_source: param("utm_source"),
      utm_medium: param("utm_medium"),
      utm_campaign: param("utm_campaign"),
      utm_content: param("utm_content"),
      utm_term: param("utm_term")
    };
  }

  function clearPaidFields(data) {
    return {
      ...data,
      gclid: "",
      gbraid: "",
      wbraid: "",
      fbclid: "",
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: "",
      paid_source: "",
      paid_touch_at: ""
    };
  }

  function normalizeTrafficAttribution() {
    const now = new Date();
    const currentSource = sourceFromCurrentVisit();
    let data = safeReadTraffic();

    if (currentSource) {
      data = clearPaidFields(data);
      data = {
        ...data,
        ...currentUtmData(),
        landing_page: window.location.href,
        page_url: window.location.href,
        referrer: document.referrer || "",
        paid_source: currentSource,
        paid_touch_at: now.toISOString(),
        last_seen_at: now.toISOString()
      };

      if (currentSource === "meta") {
        data.fbclid = param("fbclid");
      } else if (currentSource === "google") {
        data.gclid = param("gclid");
        data.gbraid = param("gbraid");
        data.wbraid = param("wbraid");
      }

      safeWriteTraffic(data);
      return data;
    }

    const paidTouchAt = Date.parse(data.paid_touch_at || "");
    if (Number.isFinite(paidTouchAt) && now.getTime() - paidTouchAt > ATTRIBUTION_TTL_MS) {
      data = clearPaidFields(data);
      data.last_seen_at = now.toISOString();
      safeWriteTraffic(data);
      return data;
    }

    // Corrige legado em que um gclid antigo e um fbclid novo podiam coexistir.
    if ((data.gclid || data.gbraid || data.wbraid) && data.fbclid && !data.paid_source) {
      data = clearPaidFields(data);
      data.last_seen_at = now.toISOString();
      safeWriteTraffic(data);
    }

    return data;
  }

  normalizeTrafficAttribution();

  // Nunca usa somente utm_medium=cpc/ppc para classificar Google.
  window.vendaVeioDoGoogleSite = function () {
    const origem = normalizeTrafficAttribution();
    const utmSource = String(origem.utm_source || "").toLowerCase();
    return Boolean(
      origem.paid_source === "google" ||
      origem.gclid ||
      origem.gbraid ||
      origem.wbraid ||
      utmSource.includes("google")
    );
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function postLeadWithRetry(payload) {
    let lastError = null;

    for (let attempt = 1; attempt <= LEAD_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LEAD_TIMEOUT_MS);

      try {
        const response = await fetch(LEAD_DADOS_PESSOAIS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (response.ok) return response;

        lastError = new Error(`http_${response.status}`);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === LEAD_MAX_ATTEMPTS) throw lastError;
      } catch (error) {
        lastError = error;
        if (attempt === LEAD_MAX_ATTEMPTS) throw error;
      } finally {
        clearTimeout(timeout);
      }

      await sleep(350 * attempt);
    }

    throw lastError || new Error("lead_send_failed");
  }

  window.enviarLeadDadosPessoais = async function () {
    if (leadDadosPessoaisEnviado || leadDadosPessoaisEmEnvio) return;

    if (!leadDadosPessoaisEventId) {
      leadDadosPessoaisEventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    // Mantém Meta e Google separados caso Google Ads volte a ser usado no futuro.
    if (window.vendaVeioDoGoogleSite()) {
      leadDadosPessoaisEnviado = true;
      if (typeof trackGA4 === "function") {
        trackGA4("lead_meta_ignorado_origem_google", {
          event_id: leadDadosPessoaisEventId,
          cidade: $("mCidade").value.trim(),
          uf: $("mUf").value.trim().toUpperCase()
        });
      }
      return;
    }

    const nomeCompleto = $("mNome").value.trim();
    const partesNome = nomeCompleto.split(/\s+/);
    const primeiroNome = partesNome[0] || "";
    const sobrenome = partesNome.slice(1).join(" ");
    const origem = normalizeTrafficAttribution();
    const plano = $("mPlano").value;

    const payload = {
      event_id: leadDadosPessoaisEventId,
      user_id: leadDadosPessoaisEventId,
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      phone: onlyDigits($("mTelefone1").value),
      email: $("mEmail").value.trim().toLowerCase(),
      first_name: primeiroNome,
      last_name: sobrenome,
      external_id: onlyDigits($("mCpf").value),
      city: $("mCidade").value.trim(),
      state: $("mUf").value.trim().toUpperCase(),
      zip: onlyDigits($("mCep").value),
      country: "BR",
      currency: "BRL",
      value: 0,
      content_name: plano,
      plan_value: typeof PLAN_VALUES !== "undefined" ? (PLAN_VALUES[plano] || 0) : 0,
      lead_stage: "dados_pessoais_enviados",
      source: "site_webturbo",
      traffic_source: "meta",
      event_source_url: window.location.href,
      page_url: window.location.href,
      landing_page: origem.landing_page || window.location.href,
      referrer: document.referrer || origem.referrer || "",
      client_user_agent: navigator.userAgent,
      fbp: typeof getCookieValue === "function" ? getCookieValue("_fbp") : "",
      fbc: typeof getCookieValue === "function" ? getCookieValue("_fbc") : "",
      fbclid: origem.fbclid || "",
      utm_source: origem.utm_source || "",
      utm_medium: origem.utm_medium || "",
      utm_campaign: origem.utm_campaign || "",
      utm_content: origem.utm_content || "",
      utm_term: origem.utm_term || ""
    };

    leadDadosPessoaisEmEnvio = true;

    try {
      const response = await postLeadWithRetry(payload);
      leadDadosPessoaisEnviado = true;
      console.info("Evento de Lead enviado com sucesso.", {
        status_http: response.status,
        event_id: leadDadosPessoaisEventId
      });
    } finally {
      leadDadosPessoaisEmEnvio = false;
    }
  };

  // Cobertura viável continua no GA4, mas não é mais uma conversão do Google Ads.
  // Quando Google Ads voltar, a conversão ocorre somente após a pré-venda ser aceita pelo CRM.
  window.dispararLeadGoogleAdsConsultaViavel = function () {};

  window.dispararConversaoLeadGoogleAds = function () {
    if (window.googleAdsLeadConversionSent) return;
    if (!window.vendaVeioDoGoogleSite()) return;
    if (typeof gtag !== "function") return;

    window.googleAdsLeadConversionSent = true;
    gtag("event", "conversion", {
      send_to: GOOGLE_FINAL_LEAD_SEND_TO,
      value: 1.0,
      currency: "BRL"
    });
  };
})();
