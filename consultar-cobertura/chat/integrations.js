import { maskCpf, onlyDigits } from "./validators.js";

const LOG_PREFIX = "[WEBTURBO CHAT]";
const COVERAGE_CACHE_KEY = "webturbo_site_coverage_v1";
const MHNET_FALLBACK_PLANS = Object.freeze([
  { code: "MHNET_500", name: "FIBRA 500MB", price: 99.9, description: "Boa performance para navegação, vídeos e uso diário." },
  { code: "MHNET_500_GLOBOPLAY", name: "FIBRA 500MB + GLOBOPLAY", price: 114.8, description: "Internet fibra com Globoplay incluso." },
  { code: "MHNET_500_WIFI_EXTRA", name: "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI", price: 119.9, description: "Mais alcance com um segundo ponto de Wi-Fi." },
  { code: "MHNET_600_WIFI_EXTRA_GLOBOPLAY", name: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY", price: 139.9, description: "Mais velocidade, alcance e Globoplay." },
  { code: "MHNET_700_WIFI_EXTRA", name: "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI", price: 149.9, description: "Mais velocidade e alcance para vários aparelhos." },
  { code: "MHNET_1000_WIFI_EXTRA", name: "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI", price: 159.9, description: "Máxima velocidade e cobertura Wi-Fi ampliada." }
]);

const BRAZIL_STATE_CODES = Object.freeze({
  Acre: "AC", Alagoas: "AL", Amapá: "AP", Amazonas: "AM", Bahia: "BA", Ceará: "CE",
  "Distrito Federal": "DF", "Espírito Santo": "ES", Goiás: "GO", Maranhão: "MA",
  "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", Pará: "PA",
  Paraíba: "PB", Paraná: "PR", Pernambuco: "PE", Piauí: "PI", "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", Rondônia: "RO", Roraima: "RR",
  "Santa Catarina": "SC", "São Paulo": "SP", Sergipe: "SE", Tocantins: "TO"
});

function withTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function lookupAddress(cep, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const response = await withTimeout(fetchImpl, `https://viacep.com.br/ws/${onlyDigits(cep)}/json/`, {
    method: "GET",
    headers: { Accept: "application/json" }
  }, timeoutMs);
  const data = await response.json();
  if (!response.ok || data.erro) throw new Error("CEP não localizado");
  return {
    logradouro: data.logradouro || "",
    bairro: data.bairro || "",
    cidade: data.localidade || "",
    uf: data.uf || ""
  };
}

function normalizeReverseAddress(data = {}) {
  const address = data.address || {};
  const isoState = String(address["ISO3166-2-lvl4"] || address["ISO3166-2-lvl6"] || "");
  const isoCode = isoState.includes("-") ? isoState.split("-").pop() : "";
  const uf = String(address.state_code || isoCode || BRAZIL_STATE_CODES[address.state] || "").toUpperCase().slice(0, 2);
  return {
    cep: onlyDigits(address.postcode || "").slice(0, 8),
    logradouro: address.road || address.pedestrian || address.residential || address.path || address.footway || "",
    bairro: address.suburb || address.neighbourhood || address.quarter || address.city_district || "",
    cidade: address.city || address.town || address.municipality || address.village || address.county || "",
    uf,
    displayAddress: data.display_name || ""
  };
}

export async function reverseGeocodeLocation(lat, lng, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Coordenadas inválidas");
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");
  const response = await withTimeout(fetchImpl, url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", "Accept-Language": "pt-BR,pt;q=0.9" }
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.address) throw new Error("Não foi possível localizar o endereço pelas coordenadas");
  return normalizeReverseAddress(data);
}

export function createBrowserLocationService({ navigatorObject = globalThis.navigator, fetchImpl = globalThis.fetch, timeoutMs = 10000, maxAccuracyMeters = 250 } = {}) {
  return {
    async locate() {
      if (!navigatorObject?.geolocation?.getCurrentPosition) {
        throw new Error("Seu navegador não oferece acesso à localização.");
      }
      const position = await new Promise((resolve, reject) => {
        navigatorObject.geolocation.getCurrentPosition(resolve, (error) => {
          const message = error?.code === 1
            ? "A permissão de localização foi negada. Você pode informar o CEP manualmente."
            : error?.code === 3
              ? "A localização demorou para responder. Tente novamente ou informe o CEP."
              : "Não foi possível obter sua localização. Tente novamente ou informe o CEP.";
          reject(new Error(message));
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      });
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      const accuracy = Math.round(Number(position.coords.accuracy) || 0);
      if (accuracy > maxAccuracyMeters) {
        throw new Error("A localização ficou imprecisa. Tente novamente em um local aberto ou informe o CEP.");
      }
      const address = await reverseGeocodeLocation(latitude, longitude, { fetchImpl, timeoutMs });
      if (!address.logradouro || !address.cidade || !address.uf) {
        throw new Error("Localizei sua posição, mas não consegui identificar o endereço completo. Informe o CEP para continuar.");
      }
      return {
        ...address,
        coordenadas: `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
        locationAccuracy: accuracy,
        addressSource: "geolocation"
      };
    }
  };
}

function createCoveragePayload(session, radius) {
  const fachada = [session.logradouro, session.numero, session.bairro, session.cidade, session.uf]
    .filter(Boolean)
    .join(", ");
  const cep = onlyDigits(session.cep);
  const coords = String(session.coordenadas || "").trim();
  const [latitude = "", longitude = ""] = coords.split(",").map((value) => value.trim());
  const semCep = !cep;
  return {
    cep,
    numero: session.numero,
    logradouro: session.logradouro,
    bairro: session.bairro,
    cidade: session.cidade,
    uf: session.uf,
    complemento: session.complemento === "Sem complemento" ? "" : session.complemento,
    fachada,
    radius,
    semCep,
    sem_cep: semCep,
    coords,
    coordenadas: coords,
    coordenadasFixas: coords,
    latitude,
    longitude,
    latitudeFixa: latitude,
    longitudeFixa: longitude,
    linkLocalizacao: coords ? `https://www.google.com/maps?q=${coords}` : "",
    enderecoLocalizacaoFixa: session.addressSource === "geolocation" ? fachada : ""
  };
}

function createResolverPayload(payload) {
  return {
    postalCode: onlyDigits(payload.cep),
    state: String(payload.uf || "").trim().toUpperCase(),
    city: String(payload.cidade || "").trim(),
    district: String(payload.bairro || "").trim(),
    street: String(payload.logradouro || "").trim(),
    number: String(payload.numero || "").trim(),
    complement: String(payload.complemento || "").trim()
  };
}

function coverageAddressKey(address) {
  return [address.postalCode, address.state, address.city, address.district, address.street, address.number, address.complement]
    .map((value) => String(value || "").trim().toUpperCase())
    .join("|");
}

function readCoverageCache(key) {
  try {
    const cached = JSON.parse(globalThis.sessionStorage?.getItem(COVERAGE_CACHE_KEY) || "null");
    return cached && cached.addressKey === key ? cached.result : null;
  } catch {
    return null;
  }
}

function writeCoverageCache(key, result) {
  try {
    globalThis.sessionStorage?.setItem(COVERAGE_CACHE_KEY, JSON.stringify({
      addressKey: key,
      operatorCode: result?.operator?.code || null,
      state: result?.normalizedAddress?.state || "",
      normalizedAddress: result?.normalizedAddress || null,
      coverage: result?.coverage || null,
      selectedPlan: "",
      result
    }));
  } catch { /* cache não pode bloquear a consulta */ }
}

function normalizeCommercialPlan(plan, index) {
  const name = String(plan?.name || plan?.code || "Plano de internet");
  const giga = /1\s*GIGA/i.test(name);
  const speed = giga ? 1000 : Number(name.match(/(\d+)\s*(?:MB|MEGA)/i)?.[1] || 0);
  return {
    id: String(plan?.code || ""),
    speed,
    title: name,
    badge: index === 0 ? "Oferta em destaque" : "",
    price: Number(plan?.price || 0),
    description: String(plan?.description || "Oferta disponível no endereço consultado."),
    features: ["Internet fibra óptica", "Instalação conforme viabilidade técnica"],
    featured: index === 0
  };
}

function normalizeCoverage(data, source) {
  const viable = data?.ok === true && (data?.viable === true || data?.viavel === true);
  const coverage = data?.coverage || {};
  return {
    viavel: viable,
    status: viable ? "VIAVEL" : "INVIAVEL",
    motivo: coverage.reason || data?.motivo || data?.reason || (viable ? "cobertura_disponivel" : "sem_viabilidade"),
    coords: coverage.coords || data?.coords || data?.coordenadas || "",
    operator: data?.operator || null,
    plans: Array.isArray(data?.plans) ? data.plans.map(normalizeCommercialPlan).filter((plan) => plan.id) : [],
    source,
    raw: data || {}
  };
}

export function createMockCoverageService(config = {}) {
  return {
    async check(session) {
      const requested = String(config.mockCoverageResult || "viavel").toLowerCase();
      const viable = requested !== "inviavel";
      return {
        viavel: viable,
        status: viable ? "VIAVEL" : "INVIAVEL",
        motivo: viable ? "mock_ftth_disponivel" : "mock_sem_ftth_no_raio",
        coords: session.coordenadas || "-29.946000,-51.184000",
        source: "mock",
        raw: { ok: true, viavel: viable, mock: true, cep: session.cep }
      };
    }
  };
}

export function createCoverageService(config, { fetchImpl = fetch, logger = console } = {}) {
  const mock = createMockCoverageService(config);

  async function realCheck(session) {
    const payload = createCoveragePayload(session, config.coverageRadius || 200);
    const legacyMhnet = !payload.cep;
    const resolverPayload = createResolverPayload(payload);
    const key = coverageAddressKey(resolverPayload);
    if (!legacyMhnet) {
      const cached = readCoverageCache(key);
      if (cached) return normalizeCoverage(cached, "real");
    }

    const request = async (url, body) => {
      const response = await withTimeout(fetchImpl, url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, config.requestTimeoutMs || 10000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.motivo || "Falha na consulta de cobertura");
      return data;
    };

    if (legacyMhnet) {
      const legacy = await request(config.legacyCoverageEndpoint || config.coverageEndpoint, payload);
      const adapted = legacy?.ok === true && legacy?.viavel === true
        ? {
            ...legacy,
            viable: true,
            operator: { code: "MHNET", name: "MhNet" },
            coverage: { status: "VIAVEL", reason: legacy.motivo || "", coords: legacy.coords || "" },
            plans: MHNET_FALLBACK_PLANS
          }
        : legacy;
      return normalizeCoverage(adapted, "real");
    }

    const result = await request(config.coverageEndpoint, resolverPayload);
    writeCoverageCache(key, result);
    return normalizeCoverage(result, "real");
  }

  return {
    async check(session) {
      logger.info(`${LOG_PREFIX} Coverage request started`, { mode: config.coverageMode, cep: session.cep, addressSource: session.addressSource || "cep" });
      if (config.coverageMode === "mock") return mock.check(session);
      try {
        return await realCheck(session);
      } catch (error) {
        logger.warn(`${LOG_PREFIX} Real coverage unavailable`, error.message);
        if (config.coverageFallback === "mock") {
          const result = await mock.check(session);
          return { ...result, source: "mock-fallback", fallbackReason: error.message };
        }
        throw error;
      }
    }
  };
}

export function buildCoverageNotificationPayload(session, coverage, context = {}) {
  const cep = onlyDigits(session.cep);
  const viavel = coverage?.viavel === true;
  const origem = context.origin || "chat_atendimento_online";
  const fachada = [session.logradouro, session.numero, session.bairro, session.cidade, session.uf]
    .filter(Boolean)
    .join(", ");
  const eventId = `ic_${cep || "sem_cep"}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return {
    action: viavel ? "notifyConsulta" : "notifyConsultaInviavel",
    cep,
    fachada: fachada || "-",
    nomeCidade: session.cidade || "",
    uf: session.uf || "",
    origemConsulta: origem,
    origem,
    siteOrigem: "webturbo",
    resultadoConsulta: viavel ? "viavel" : "inviavel",
    statusCobertura: viavel ? "VIAVEL" : "INVIAVEL",
    viavel,
    skipInitiateCheckout: true,
    page_url: context.pageUrl || "",
    landing_page: context.landingPage || context.pageUrl || "",
    referrer: context.referrer || "",
    user_agent: context.userAgent || "",
    gclid: context.gclid || "",
    gbraid: context.gbraid || "",
    wbraid: context.wbraid || "",
    fbclid: context.fbclid || "",
    utm_source: context.utmSource || "",
    utm_medium: context.utmMedium || "",
    utm_campaign: context.utmCampaign || "",
    utm_content: context.utmContent || "",
    utm_term: context.utmTerm || "",
    event_id: eventId,
    cobertura: {
      viavel,
      status: viavel ? "VIAVEL" : "INVIAVEL",
      motivo: coverage?.motivo || "-",
      coords: coverage?.coords || session.coordenadas || ""
    }
  };
}

export function createCoverageNotificationService(config, { fetchImpl = fetch, logger = console } = {}) {
  return {
    async notify(session, coverage, context = {}) {
      const payload = buildCoverageNotificationPayload(session, coverage, context);
      if (config.notificationMode !== "real") {
        logger.info(`${LOG_PREFIX} COVERAGE NOTIFICATION MOCK`, {
          action: payload.action,
          cep: payload.cep,
          posted: false
        });
        return { ok: true, mock: true, posted: false, payload };
      }

      if (coverage?.source !== "real") {
        logger.warn(`${LOG_PREFIX} Coverage notification skipped for non-real result`, { source: coverage?.source || "unknown" });
        return { ok: false, mock: false, posted: false, skipped: true, payload };
      }

      if (payload.viavel && payload.cep.length !== 8) {
        logger.warn(`${LOG_PREFIX} Viable coverage notification skipped: invalid CEP`);
        return { ok: false, mock: false, posted: false, skipped: true, payload };
      }

      try {
        const response = await withTimeout(fetchImpl, config.notificationEndpoint || config.coverageEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }, config.requestTimeoutMs || 10000);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) {
          logger.warn(`${LOG_PREFIX} Coverage notification failed`, { action: payload.action, status: response.status });
          return { ok: false, mock: false, posted: true, status: response.status, payload, data };
        }
        logger.info(`${LOG_PREFIX} Coverage notification sent`, { action: payload.action, cep: payload.cep });
        return { ok: true, mock: false, posted: true, payload, data };
      } catch (error) {
        logger.warn(`${LOG_PREFIX} Coverage notification unavailable`, error?.message || error);
        return { ok: false, mock: false, posted: false, payload, error: error?.message || "unknown" };
      }
    }
  };
}

export function buildCrmPayload(session, context = {}) {
  const coords = session.coordenadas || "";
  const semCep = !onlyDigits(session.cep);
  return {
    nomeCliente: session.nome.trim(),
    tipoCliente: "Pessoa Física",
    documentoCliente: onlyDigits(session.cpf),
    emailCliente: session.email.trim(),
    dataNascimentoCliente: session.dataNascimento,
    telefone1Cliente: onlyDigits(session.telefone),
    telefone2Cliente: onlyDigits(session.telefoneSecundario),
    cep: onlyDigits(session.cep),
    semCep,
    sem_cep: semCep,
    uf: session.uf.trim().toUpperCase(),
    nomeCidade: session.cidade.trim(),
    cidade: session.cidade.trim(),
    bairro: session.bairro.trim(),
    logradouro: session.logradouro.trim(),
    numero: session.numero.trim(),
    complemento: session.complemento === "Sem complemento" ? "" : session.complemento.trim(),
    pontoReferencia: "",
    ponto_referencia: "",
    latitudeFixa: coords.split(",")[0] || "",
    longitudeFixa: coords.split(",")[1] || "",
    coordenadasFixas: coords,
    coordenadas: coords,
    coords,
    enderecoLocalizacaoFixa: session.addressSource === "geolocation"
      ? [session.logradouro, session.numero, session.bairro, session.cidade, session.uf].filter(Boolean).join(", ")
      : "",
    operatorCode: session.cobertura?.operator?.code || "",
    planCode: session.plano?.id || "",
    planos: session.plano?.title || session.plano?.id || "",
    diaVencimentoFatura: session.diaVencimentoFatura || "",
    dataInstalacao1: session.dataInstalacao || "",
    turnoInstalacao1: session.turnoInstalacao || "",
    linkLocalizacao: coords ? `https://www.google.com/maps?q=${coords}` : "",
    urlAdicional: "",
    obsEndereco: `Cobertura validada pelo chat-lab. Origem do endereço: ${session.addressSource || "cep"}. Motivo: ${session.cobertura?.motivo || "-"}`,
    page_url: context.pageUrl || "",
    landing_page: context.landingPage || context.pageUrl || "",
    referrer: context.referrer || "",
    user_agent: context.userAgent || "",
    fbp: "",
    fbc: "",
    gclid: context.gclid || "",
    gbraid: context.gbraid || "",
    wbraid: context.wbraid || "",
    fbclid: context.fbclid || "",
    utm_source: context.utmSource || "",
    utm_medium: context.utmMedium || "",
    utm_campaign: context.utmCampaign || "",
    utm_content: context.utmContent || "",
    utm_term: context.utmTerm || "",
    event_id: session.leadEventId || `chat_${session.sessionId}`
  };
}

export function createCrmService(config, { fetchImpl = fetch, logger = console } = {}) {
  return {
    async submit(session, context) {
      const payload = buildCrmPayload(session, context);
      if (config.crmMode === "mock") {
        logger.info(`${LOG_PREFIX} CRM MOCK payload generated`, {
          ...payload,
          documentoCliente: maskCpf(payload.documentoCliente)
        });
        return { ok: true, mock: true, posted: false, payload };
      }

      const response = await fetchImpl(config.crmEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || "Falha ao enviar ao CRM");
      return { ...data, mock: false, posted: true, payload };
    }
  };
}

export { createCoveragePayload, normalizeCoverage, normalizeReverseAddress };
