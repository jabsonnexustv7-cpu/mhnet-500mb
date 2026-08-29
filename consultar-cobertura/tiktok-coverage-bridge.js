// WebTurbo — ponte confiável entre o funil de cobertura e o TikTok Pixel/Events API.
(function () {
  "use strict";

  if (window.__webturboTikTokCoverageBridgeInstalled) return;
  window.__webturboTikTokCoverageBridgeInstalled = true;

  const SERVER_URL = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/tiktok-events";
  const ATTR_KEY = "webturbo_tiktok_attribution";
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const DEDUP_MS = 8000;
  const recent = new Map();

  function param(name) {
    return (new URLSearchParams(location.search).get(name) || "").trim();
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

  function saveTtclid() {
    const ttclid = param("ttclid");
    if (!ttclid) return;
    try {
      localStorage.setItem(ATTR_KEY, JSON.stringify({ ttclid, captured_at: Date.now() }));
    } catch (_) {}
  }

  function readTtclid() {
    const current = param("ttclid");
    if (current) return current;
    try {
      const saved = JSON.parse(localStorage.getItem(ATTR_KEY) || "{}");
      const capturedAt = Number(saved.captured_at || 0);
      if (!saved.ttclid || !capturedAt || Date.now() - capturedAt > TTL_MS) return "";
      return String(saved.ttclid || "").trim();
    } catch (_) {
      return "";
    }
  }

  function value(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && String(el.value || "").trim()) return String(el.value || "").trim();
    }
    return "";
  }

  function eventId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `tt_cov_${window.crypto.randomUUID()}`;
    }
    return `tt_cov_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function shouldSend(details) {
    const cep = String(details.cep || "").replace(/\D+/g, "");
    const status = details.viavel === true ? "viavel" : "inviavel";
    const origem = String(details.origem || "site_webturbo").slice(0, 80);
    const key = `${cep}|${status}|${origem}`;
    const now = Date.now();
    const last = Number(recent.get(key) || 0);
    if (last && now - last < DEDUP_MS) return false;
    recent.set(key, now);
    return true;
  }

  function send(details) {
    if (!shouldSend(details)) return;

    const id = eventId();
    const status = details.viavel === true ? "viavel" : "inviavel";
    const origem = String(details.origem || "site_webturbo").slice(0, 120);
    const properties = {
      content_name: "consulta_cobertura",
      description: `consulta_${status}`
    };

    try {
      if (window.ttq && typeof window.ttq.track === "function") {
        window.ttq.track("Lead", properties, { event_id: id });
        console.info("[TikTok] Lead de consulta concluída enviado pelo Pixel.", { status, event_id: id });
      }
    } catch (error) {
      console.warn("[TikTok] Falha no Pixel.", error);
    }

    const payload = {
      event: "Lead",
      event_id: id,
      event_time: Math.floor(Date.now() / 1000),
      page_url: location.href,
      referrer: document.referrer || "",
      ttclid: readTtclid(),
      ttp: readCookie("_ttp"),
      status,
      source: origem
    };

    fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(async (response) => {
      if (response.ok || response.status === 503) return;
      const body = await response.json().catch(() => ({}));
      console.warn("[TikTok] Events API não confirmou o evento.", {
        status: response.status,
        code: body && body.code ? body.code : ""
      });
    }).catch(() => {});
  }

  function detailsFromDataLayer(entry) {
    if (!entry || typeof entry !== "object") return null;
    const name = String(entry.event || "");
    if (name !== "consulta_cobertura_viavel" && name !== "consulta_cobertura_inviavel") return null;

    return {
      viavel: name === "consulta_cobertura_viavel",
      cep: entry.cep || value("mCep", "cep", "cepModalWhats"),
      origem: entry.origem || entry.origem_consulta || entry.origemConsulta || "site_webturbo"
    };
  }

  function process(entry) {
    const details = detailsFromDataLayer(entry);
    if (details) send(details);
  }

  saveTtclid();
  const dataLayer = window.dataLayer = window.dataLayer || [];
  dataLayer.forEach(process);

  const originalPush = dataLayer.push.bind(dataLayer);
  dataLayer.push = function (...items) {
    const result = originalPush(...items);
    items.forEach(process);
    return result;
  };
})();
