// Rastreamento v2: atribuição por último toque pago explícito e Lead pelo Meta Pixel.
(function () {
  "use strict";

  const TRAFFIC_KEY = "webturbo_origem_trafego";
  const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

  // Mantém o mesmo ponto do funil que antes enviava Lead ao servidor/Zapier,
  // mas agora registra o Lead diretamente no navegador pelo Meta Pixel.
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

    if (typeof fbq !== "function") {
      console.warn("Meta Pixel indisponível; evento Lead não foi enviado.");
      return;
    }

    const plano = $("mPlano").value;
    const planValue = typeof PLAN_VALUES !== "undefined" ? (PLAN_VALUES[plano] || 0) : 0;

    leadDadosPessoaisEmEnvio = true;

    try {
      fbq(
        "track",
        "Lead",
        {
          value: 0,
          currency: "BRL",
          content_name: plano,
          plan_value: planValue,
          lead_stage: "dados_pessoais_enviados",
          source: "site_webturbo"
        },
        { eventID: leadDadosPessoaisEventId }
      );

      leadDadosPessoaisEnviado = true;
      console.info("Evento Lead enviado pelo Meta Pixel.", {
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
