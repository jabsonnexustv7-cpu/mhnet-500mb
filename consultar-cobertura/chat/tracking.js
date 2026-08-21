const PREFIX = "[WEBTURBO CHAT]";
const TRAFFIC_KEY = "webturbo_origem_trafego";
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GOOGLE_FINAL_LEAD_SEND_TO = "AW-17075496858/zJmpCO2zoM8bEJrPnc4_";
const GOOGLE_WHATSAPP_SEND_TO = "AW-18209661462/fkbCN-lhrkcEJbEhetD";
const META_PIXEL_ID = "907334254744897";

function param(name) {
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

function currentPaidSource() {
  const utmSource = param("utm_source").toLowerCase();
  const google = Boolean(param("gclid") || param("gbraid") || param("wbraid") || utmSource.includes("google"));
  const meta = Boolean(param("fbclid") || /(facebook|instagram|meta)/i.test(utmSource));
  if (google && meta) return "ambiguous";
  if (google) return "google";
  if (meta) return "meta";
  return "";
}

function readTraffic() {
  try { return JSON.parse(localStorage.getItem(TRAFFIC_KEY) || "{}"); } catch { return {}; }
}

function writeTraffic(value) {
  try { localStorage.setItem(TRAFFIC_KEY, JSON.stringify(value)); } catch { /* sem bloqueio do funil */ }
}

function normalizeTrafficAttribution() {
  const now = new Date();
  const paidSource = currentPaidSource();
  let data = readTraffic();
  if (paidSource) {
    data = {
      landing_page: window.location.href,
      page_url: window.location.href,
      referrer: document.referrer || "",
      paid_source: paidSource,
      paid_touch_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      gclid: paidSource === "google" ? param("gclid") : "",
      gbraid: paidSource === "google" ? param("gbraid") : "",
      wbraid: paidSource === "google" ? param("wbraid") : "",
      fbclid: paidSource === "meta" ? param("fbclid") : "",
      utm_source: param("utm_source"),
      utm_medium: param("utm_medium"),
      utm_campaign: param("utm_campaign"),
      utm_content: param("utm_content"),
      utm_term: param("utm_term")
    };
    writeTraffic(data);
    return data;
  }
  const paidAt = Date.parse(data.paid_touch_at || "");
  if (Number.isFinite(paidAt) && now.getTime() - paidAt > ATTRIBUTION_TTL_MS) {
    data = {};
    writeTraffic(data);
  }
  return data;
}

function installGoogleTags() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", "AW-17075496858");
  window.gtag("config", "AW-18209661462");
  window.gtag("config", "G-FQ4D45L8CS");
  if (!document.querySelector('script[data-webturbo-google-tag]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=AW-17075496858";
    script.dataset.webturboGoogleTag = "true";
    document.head.appendChild(script);
  }
}

function installMetaPixel() {
  if (!window.fbq) {
    const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }
  if (!document.querySelector('script[data-webturbo-meta-pixel]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.webturboMetaPixel = "true";
    document.head.appendChild(script);
  }
  window.fbq("init", META_PIXEL_ID);
  window.fbq("track", "PageView");
}

export function createTrackingService(config, { logger = console } = {}) {
  const real = config.conversionMode === "real";
  let initialized = false;

  function initialize() {
    if (initialized) return;
    initialized = true;
    normalizeTrafficAttribution();
    if (!real) {
      logger.info(`${PREFIX} Conversion tracking in MOCK mode`);
      return;
    }
    installGoogleTags();
    installMetaPixel();
    logger.info(`${PREFIX} Conversion tracking initialized`);
  }

  function ga4(eventName, params = {}) {
    const clean = { origem: "chat_webturbo", ...params };
    if (!real) {
      logger.info(`${PREFIX} CONVERSION MOCK ${eventName}`, clean);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...clean });
    window.gtag?.("event", eventName, clean);
  }

  function personalLead(session) {
    const eventId = session.leadEventId || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    session.leadEventId = eventId;
    if (!real) {
      logger.info(`${PREFIX} META Lead MOCK`, { eventId, plano: session.plano?.id || "" });
      return eventId;
    }
    window.fbq?.("track", "Lead", {
      value: 0,
      currency: "BRL",
      content_name: session.plano?.id || "",
      plan_value: session.plano?.price || 0,
      lead_stage: "dados_pessoais_enviados",
      source: "site_webturbo"
    }, { eventID: eventId });
    logger.info(`${PREFIX} Meta Lead sent`, { eventId });
    return eventId;
  }

  function crmAttempt(session) {
    ga4("tentou_enviar_formulario_easy", {
      plano: session.plano?.id || "",
      cidade: session.cidade || "",
      uf: session.uf || "",
      destino: "crm_webturbo"
    });
  }

  function crmSuccess(session, result) {
    ga4("enviou_formulario_easy", {
      plano: session.plano?.id || "",
      valor: session.plano?.price || 0,
      cidade: session.cidade || "",
      uf: session.uf || "",
      destino: "crm_webturbo",
      crm_ok: result?.ok === true ? "sim" : "nao",
      pre_venda_criada: result?.created === true ? "sim" : "ja_existia"
    });
    const traffic = normalizeTrafficAttribution();
    if (real && traffic.paid_source === "google") {
      window.gtag?.("event", "conversion", { send_to: GOOGLE_FINAL_LEAD_SEND_TO, value: 1, currency: "BRL" });
    }
  }

  function crmError(session, error) {
    ga4("erro_envio_formulario", {
      plano: session.plano?.id || "",
      cidade: session.cidade || "",
      uf: session.uf || "",
      erro: error?.message || "falha_crm"
    });
  }

  function coverage(session, result) {
    ga4(result.viavel ? "consulta_cobertura_viavel" : "consulta_cobertura_inviavel", {
      origem_consulta: "chat_lab",
      cidade: session.cidade || "",
      uf: session.uf || "",
      cep: session.cep || "",
      motivo: result.motivo || ""
    });
  }

  function whatsapp(session, mode) {
    ga4("tentou_redirecionar_whatsapp_pos_venda", {
      origem_botao: "pos_envio_formulario_crm",
      modo_redirecionamento: mode,
      plano: session.plano?.id || "",
      cidade: session.cidade || "",
      uf: session.uf || ""
    });
    ga4("clique_whatsapp", {
      origem_botao: mode === "manual" ? "pos_envio_formulario_crm_manual" : "pos_envio_formulario_crm",
      plano: session.plano?.id || "",
      cidade: session.cidade || "",
      uf: session.uf || ""
    });
    if (real) window.gtag?.("event", "conversion", { send_to: GOOGLE_WHATSAPP_SEND_TO });
  }

  return { initialize, attribution: normalizeTrafficAttribution, ga4, personalLead, crmAttempt, crmSuccess, crmError, coverage, whatsapp };
}

export { normalizeTrafficAttribution };
