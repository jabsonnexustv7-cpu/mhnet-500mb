import { maskCpf, onlyDigits } from "./validators.js";

const LOG_PREFIX = "[WEBTURBO CHAT]";

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

function createCoveragePayload(session, radius) {
  const fachada = [session.logradouro, session.numero, session.bairro, session.cidade, session.uf]
    .filter(Boolean)
    .join(", ");
  return {
    cep: onlyDigits(session.cep),
    numero: session.numero,
    logradouro: session.logradouro,
    bairro: session.bairro,
    cidade: session.cidade,
    uf: session.uf,
    complemento: session.complemento === "Sem complemento" ? "" : session.complemento,
    fachada,
    radius,
    semCep: false,
    sem_cep: false,
    coords: "",
    coordenadas: "",
    coordenadasFixas: "",
    latitude: "",
    longitude: "",
    latitudeFixa: "",
    longitudeFixa: "",
    linkLocalizacao: "",
    enderecoLocalizacaoFixa: ""
  };
}

function createMinimalFallbackPayload(payload) {
  if (!payload.cep || !payload.logradouro || !payload.numero) return null;
  return {
    cep: payload.cep,
    fachada: `${payload.logradouro} ${payload.numero}`.trim(),
    radius: payload.radius,
    fachada_original_site: payload.fachada,
    tentativa_frontend: "fallback_minimo_cep_fachada"
  };
}

function shouldRetryCoverage(data) {
  return data?.viavel !== true && String(data?.motivo || data?.reason || "").toLowerCase().includes("sem_ftth_no_raio");
}

function normalizeCoverage(data, source) {
  const viable = data?.ok === true && data?.viavel === true;
  return {
    viavel: viable,
    status: viable ? "VIAVEL" : "INVIAVEL",
    motivo: data?.motivo || data?.reason || (viable ? "cobertura_disponivel" : "sem_viabilidade"),
    coords: data?.coords || data?.coordenadas || "",
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
        coords: "-29.946000,-51.184000",
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
    const request = async (body) => {
      const response = await withTimeout(fetchImpl, config.coverageEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, config.requestTimeoutMs || 10000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.motivo || "Falha na consulta de cobertura");
      return data;
    };

    const first = await request(payload);
    if (!shouldRetryCoverage(first)) return normalizeCoverage(first, "real");
    const fallbackPayload = createMinimalFallbackPayload(payload);
    if (!fallbackPayload) return normalizeCoverage(first, "real");
    try {
      const second = await request(fallbackPayload);
      return normalizeCoverage(second?.ok === true && second?.viavel === true ? second : first, "real");
    } catch {
      return normalizeCoverage(first, "real");
    }
  }

  return {
    async check(session) {
      logger.info(`${LOG_PREFIX} Coverage request started`, { mode: config.coverageMode, cep: session.cep });
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

export function buildCrmPayload(session, context = {}) {
  const coords = session.coordenadas || "";
  return {
    nomeCliente: session.nome.trim(),
    tipoCliente: "Pessoa Física",
    documentoCliente: onlyDigits(session.cpf),
    emailCliente: session.email.trim(),
    dataNascimentoCliente: session.dataNascimento,
    telefone1Cliente: onlyDigits(session.telefone),
    telefone2Cliente: onlyDigits(session.telefoneSecundario),
    cep: onlyDigits(session.cep),
    semCep: false,
    sem_cep: false,
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
    enderecoLocalizacaoFixa: "",
    planos: session.plano?.id || "",
    diaVencimentoFatura: session.diaVencimentoFatura || "",
    dataInstalacao1: session.dataInstalacao || "",
    turnoInstalacao1: session.turnoInstalacao || "",
    linkLocalizacao: coords ? `https://www.google.com/maps?q=${coords}` : "",
    urlAdicional: "",
    obsEndereco: `Cobertura validada pelo chat-lab. Motivo: ${session.cobertura?.motivo || "-"}`,
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
    event_id: `chat_mvp_${session.sessionId}`
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

export function createConversationInterpreter(config, { fetchImpl = fetch, logger = console } = {}) {
  return {
    async interpret(text, context) {
      if (config.chatMode !== "openai") return null;
      try {
        const response = await fetchImpl(config.openAiProxyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, context })
        });
        if (!response.ok) throw new Error("Proxy OpenAI indisponível");
        return await response.json();
      } catch (error) {
        logger.warn(`${LOG_PREFIX} OpenAI mode unavailable; using local parser`, error.message);
        return null;
      }
    }
  };
}

export { createCoveragePayload, createMinimalFallbackPayload, normalizeCoverage };
