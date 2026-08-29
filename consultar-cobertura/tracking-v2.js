// Rastreamento v2: atribuição por último toque pago explícito e Lead pelo Meta Pixel.
(function () {
  "use strict";

  const TRAFFIC_KEY = "webturbo_origem_trafego";
  const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const GOOGLE_FINAL_LEAD_SEND_TO = "AW-17075496858/zJmpCO2zoM8bEJrPnc4_";
  const TIKTOK_SERVER_EVENT_URL = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/tiktok-events";
  const TIKTOK_ATTRIBUTION_KEY = "webturbo_tiktok_attribution";
  const TIKTOK_EVENT_DEDUP_MS = 8 * 1000;
  const tiktokRecentCoverageEvents = new Map();

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

    if ((data.gclid || data.gbraid || data.wbraid) && data.fbclid && !data.paid_source) {
      data = clearPaidFields(data);
      data.last_seen_at = now.toISOString();
      safeWriteTraffic(data);
    }

    return data;
  }

  function readCookie(name) {
    try {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : "";
    } catch (_) {
      return "";
    }
  }

  function saveTikTokAttribution() {
    const ttclid = param("ttclid");
    if (!ttclid) return;

    try {
      localStorage.setItem(TIKTOK_ATTRIBUTION_KEY, JSON.stringify({
        ttclid,
        captured_at: Date.now()
      }));
    } catch (_) {}
  }

  function readTikTokClickId() {
    const current = param("ttclid");
    if (current) return current;

    try {
      const saved = JSON.parse(localStorage.getItem(TIKTOK_ATTRIBUTION_KEY) || "{}");
      const capturedAt = Number(saved.captured_at || 0);
      if (!saved.ttclid || !capturedAt || Date.now() - capturedAt > ATTRIBUTION_TTL_MS) {
        localStorage.removeItem(TIKTOK_ATTRIBUTION_KEY);
        return "";
      }
      return String(saved.ttclid || "").trim();
    } catch (_) {
      return "";
    }
  }

  function createTikTokEventId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `tt_cov_${window.crypto.randomUUID()}`;
    }
    return `tt_cov_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function shouldSendTikTokCoverageEvent(details) {
    const cep = String(details && details.cep || "").replace(/\D+/g, "");
    const origem = String(details && details.origem || "").slice(0, 80);
    const status = details && details.viavel === true ? "viavel" : "inviavel";
    const key = `${cep}|${origem}|${status}`;
    const now = Date.now();
    const last = Number(tiktokRecentCoverageEvents.get(key) || 0);

    for (const [savedKey, timestamp] of tiktokRecentCoverageEvents.entries()) {
      if (now - timestamp > TIKTOK_EVENT_DEDUP_MS * 3) tiktokRecentCoverageEvents.delete(savedKey);
    }

    if (last && now - last < TIKTOK_EVENT_DEDUP_MS) return false;
    tiktokRecentCoverageEvents.set(key, now);
    return true;
  }

  function sendTikTokCoverageLead(details = {}) {
    if (!shouldSendTikTokCoverageEvent(details)) return;

    const eventId = createTikTokEventId();
    const eventTime = Math.floor(Date.now() / 1000);
    const status = details.viavel === true ? "viavel" : "inviavel";
    const source = String(details.origem || "site_webturbo").slice(0, 120);
    const properties = {
      content_name: "consulta_cobertura",
      description: `consulta_${status}`
    };

    try {
      if (window.ttq && typeof window.ttq.track === "function") {
        window.ttq.track("Lead", properties, { event_id: eventId });
      }
    } catch (error) {
      console.warn("TikTok Pixel: falha ao disparar Lead de consulta concluída.", error);
    }

    const payload = {
      event: "Lead",
      event_id: eventId,
      event_time: eventTime,
      page_url: window.location.href,
      referrer: document.referrer || "",
      ttclid: readTikTokClickId(),
      ttp: readCookie("_ttp"),
      status,
      source
    };

    fetch(TIKTOK_SERVER_EVENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(async (response) => {
      if (response.ok) return;
      const body = await response.json().catch(() => ({}));
      if (response.status !== 503) {
        console.warn("TikTok Events API: evento não confirmado pelo backend.", {
          status: response.status,
          code: body && body.code ? body.code : ""
        });
      }
    }).catch((error) => {
      console.warn("TikTok Events API: falha não bloqueante ao enviar evento.", error);
    });
  }

  function patchCoverageNotificationForTikTok() {
    const original = window.notificarConsultaViavel;
    if (typeof original !== "function" || original.__tiktokCoveragePatched) return;

    const wrapped = function (...args) {
      const details = args[0] && typeof args[0] === "object" ? args[0] : {};
      try {
        sendTikTokCoverageLead(details);
      } catch (error) {
        console.warn("TikTok: falha não bloqueante no rastreamento de cobertura.", error);
      }
      return original.apply(this, args);
    };

    wrapped.__tiktokCoveragePatched = true;
    window.notificarConsultaViavel = wrapped;
  }

  normalizeTrafficAttribution();
  saveTikTokAttribution();
  patchCoverageNotificationForTikTok();

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

  // Substitui o envio server-side/Zapier do Lead da página.
  // O mesmo ponto do funil passa a disparar o evento padrão Lead diretamente pelo Meta Pixel.
  window.enviarLeadDadosPessoais = async function () {
    if (leadDadosPessoaisEnviado || leadDadosPessoaisEmEnvio) return;

    if (!leadDadosPessoaisEventId) {
      leadDadosPessoaisEventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
