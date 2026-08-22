// WebTurbo — captura antecipada para recuperação comercial.
// Assim que endereço + plano + dados pessoais mínimos estiverem completos,
// envia uma única notificação ao Telegram. Não depende do envio final ao CRM.
(function () {
  "use strict";

  if (window.__webturboLeadRecoveryNotificationInstalled) return;
  window.__webturboLeadRecoveryNotificationInstalled = true;

  const ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const CHECK_INTERVAL_MS = 900;
  const SENT_PREFIX = "wt_lead_recovery_sent_v6:";
  const VISIT_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  function clean(value) {
    return String(value || "").trim();
  }

  function digits(value) {
    return clean(value).replace(/\D+/g, "");
  }

  function value(id) {
    return clean(document.getElementById(id)?.value);
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

  function alreadySent(key) {
    try { return sessionStorage.getItem(SENT_PREFIX + key) === "1"; } catch (_) { return false; }
  }

  function markSent(key) {
    try { sessionStorage.setItem(SENT_PREFIX + key, "1"); } catch (_) {}
  }

  function clearSent(key) {
    try { sessionStorage.removeItem(SENT_PREFIX + key); } catch (_) {}
  }

  function buildKey(source, cpf, phone, cep, sessionId) {
    return [source, clean(sessionId) || VISIT_ID, digits(cpf), digits(phone).slice(-11), digits(cep)].join(":");
  }

  function buildAddress(logradouro, numero, bairro, cidade, uf) {
    const streetNumber = [clean(logradouro), clean(numero)].filter(Boolean).join(", ");
    const cityUf = [clean(cidade), clean(uf).toUpperCase()].filter(Boolean).join("/");
    return [streetNumber, clean(bairro), cityUf].filter(Boolean).join(" - ");
  }

  // O coverage-base ainda possui a rotina antiga de abandono. Ela pode disparar
  // o mesmo lead depois que a recuperação antecipada já enviou o Telegram.
  // Interceptamos apenas a duplicata da etapa de dados pessoais; outros usos do
  // endpoint permanecem intactos.
  (function installLegacyAbandonmentGuard() {
    if (window.__webturboLegacyAbandonmentGuardInstalled) return;
    window.__webturboLegacyAbandonmentGuardInstalled = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = function guardedFetch(input, init) {
      try {
        const url = typeof input === "string" ? input : String(input?.url || "");
        if (url === ENDPOINT && init?.body) {
          const payload = typeof init.body === "string" ? JSON.parse(init.body) : null;
          const etapa = clean(payload?.etapaAbandono || payload?.etapa || payload?.etapa_abandono).toLowerCase();
          const isLegacyDuplicate = payload?.action === "notifyAbandonoModal"
            && payload?.evento !== "lead_recuperacao_dados_completos"
            && etapa === "dados_pessoais_concluidos";

          if (isLegacyDuplicate) {
            clarityEvent("lead_recuperacao_telegram_duplicata_bloqueada");
            gaEvent("lead_recuperacao_telegram_duplicata_bloqueada", { etapa });
            return Promise.resolve(new Response(JSON.stringify({
              ok: true,
              skipped: true,
              telegramSent: true,
              reason: "legacy_duplicate_blocked"
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }));
          }
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  })();

  function recoveryPayload(data) {
    const endereco = buildAddress(data.logradouro, data.numero, data.bairro, data.cidade, data.uf);
    const etapa = "dados_pessoais_concluidos";

    return {
      action: "notifyAbandonoModal",
      evento: "lead_recuperacao_dados_completos",
      etapa_abandono: etapa,
      etapaAbandono: etapa,
      etapa,
      origem: data.origem,
      finalizacao: data.source,
      horario_site: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),

      nome: data.nome,
      nomeCliente: data.nome,
      cpf: data.cpf,
      documentoCliente: data.cpf,
      nascimento: data.nascimento,
      dataNascimentoCliente: data.nascimento,
      email: data.email,
      emailCliente: data.email,
      telefone1: data.telefone1,
      telefone1Cliente: data.telefone1,
      telefone2: data.telefone2 || "",
      telefone2Cliente: data.telefone2 || "",

      plano: data.plano,
      planos: data.plano,

      endereco,
      cep: data.cep,
      numero: data.numero,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.cidade,
      nomeCidade: data.cidade,
      uf: clean(data.uf).toUpperCase(),
      complemento: data.complemento || "",
      ponto_referencia: data.pontoReferencia || "",

      vencimento: data.vencimento || "",
      coordenadas: data.coordenadas || "",
      latitude: data.latitude || "",
      longitude: data.longitude || "",
      endereco_detectado: data.enderecoDetectado || "",
      link_localizacao: data.linkLocalizacao || "",
      cobertura_validada: data.coberturaValidada === true,
      cobertura_motivo: data.coberturaMotivo || "",
      cobertura_coords: data.coberturaCoords || data.coordenadas || "",
      url_pagina: location.href,
      user_agent: navigator.userAgent
    };
  }

  function heroLead() {
    const nome = value("mNome");
    const cpf = value("mCpf");
    const nascimento = value("mNascimento") || value("mNascimentoTexto");
    const telefone1 = value("mTelefone1");
    const telefone2 = value("mTelefone2");
    const email = value("mEmail");
    const plano = value("mPlano");
    const cep = value("mCep");
    const numero = value("mNumero");
    const logradouro = value("mLogradouro");
    const bairro = value("mBairro");
    const cidade = value("mCidade");
    const uf = value("mUf");

    if (!nome || digits(cpf).length !== 11 || !nascimento || !email) return null;
    if (digits(telefone1).length < 10) return null;
    if (!plano || !numero || !cidade || !uf || (!logradouro && digits(cep).length !== 8)) return null;

    const data = {
      source: "HERO",
      origem: "site_webturbo_hero",
      nome,
      cpf,
      nascimento,
      email,
      telefone1,
      telefone2,
      plano,
      cep,
      numero,
      logradouro,
      bairro,
      cidade,
      uf,
      complemento: value("mComplemento"),
      pontoReferencia: value("mPontoRef"),
      vencimento: value("mVencimento"),
      coordenadas: value("mCoordenadasFixas"),
      latitude: value("mLatitudeFixa"),
      longitude: value("mLongitudeFixa"),
      enderecoDetectado: value("mEnderecoDetectadoLocalizacao"),
      linkLocalizacao: value("mLinkLocalizacaoFixa"),
      coberturaValidada: true
    };

    return {
      source: "HERO",
      key: buildKey("HERO", cpf, telefone1, cep),
      payload: recoveryPayload(data)
    };
  }

  function chatLead() {
    let session;
    try { session = window.webturboChat?.getSession?.(); } catch (_) { session = null; }
    if (!session) return null;

    const nome = clean(session.nome);
    const cpf = clean(session.cpf);
    const nascimento = clean(session.dataNascimento);
    const email = clean(session.email);
    const telefone1 = clean(session.telefone);
    const telefone2 = clean(session.telefoneSecundario);
    const plano = clean(session.plano?.title || session.plano?.id);
    const cep = clean(session.cep);
    const numero = clean(session.numero);
    const cidade = clean(session.cidade);
    const uf = clean(session.uf);
    const logradouro = clean(session.logradouro);

    if (!nome || digits(cpf).length !== 11 || !nascimento || !email) return null;
    if (digits(telefone1).length < 10) return null;
    if (!plano || !numero || !cidade || !uf) return null;

    const data = {
      source: "CHAT",
      origem: "site_webturbo_chat",
      nome,
      cpf,
      nascimento,
      email,
      telefone1,
      telefone2,
      plano,
      cep,
      numero,
      logradouro,
      bairro: clean(session.bairro),
      cidade,
      uf,
      complemento: clean(session.complemento),
      pontoReferencia: clean(session.pontoReferencia),
      vencimento: clean(session.diaVencimentoFatura),
      coordenadas: clean(session.coordenadas || session.cobertura?.coords),
      coberturaValidada: session.cobertura?.viavel === true,
      coberturaMotivo: clean(session.cobertura?.motivo),
      coberturaCoords: clean(session.cobertura?.coords || session.coordenadas)
    };

    return {
      source: "CHAT",
      key: buildKey("CHAT", cpf, telefone1, cep, session.sessionId),
      payload: recoveryPayload(data)
    };
  }

  async function send(lead, reason = "automatic") {
    if (!lead || alreadySent(lead.key)) return false;
    markSent(lead.key);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead.payload),
        keepalive: true
      });
      const responseData = await response.clone().json().catch(() => ({}));
      if (!response.ok || responseData?.ok === false || responseData?.telegramSent === false) {
        throw new Error(responseData?.message || `http_${response.status}`);
      }
      clarityEvent("lead_recuperacao_telegram_enviado");
      gaEvent("lead_recuperacao_telegram_enviado", {
        origem_fluxo: lead.source.toLowerCase(),
        cidade: lead.payload.cidade || "",
        gatilho: reason
      });
      return true;
    } catch (error) {
      clearSent(lead.key);
      clarityEvent("lead_recuperacao_telegram_erro");
      gaEvent("lead_recuperacao_telegram_erro", {
        origem_fluxo: lead.source.toLowerCase(),
        erro: error?.message || "erro_envio",
        gatilho: reason
      });
      return false;
    }
  }

  function check(reason = "poll") {
    void send(heroLead(), reason);
    void send(chatLead(), reason);
  }

  window.webturboLeadRecovery = {
    notifyNow(source) {
      const normalized = clean(source).toUpperCase();
      if (normalized === "CHAT") return send(chatLead(), "explicit_chat");
      if (normalized === "HERO") return send(heroLead(), "explicit_hero");
      check("explicit_any");
      return Promise.resolve(true);
    },
    check
  };

  document.addEventListener("change", () => check("change"), true);
  document.addEventListener("input", () => setTimeout(() => check("input"), 100), true);
  document.addEventListener("click", () => setTimeout(() => check("click"), 140), true);
  document.addEventListener("blur", () => setTimeout(() => check("blur"), 60), true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") check("visibility_hidden");
  });
  window.addEventListener("pagehide", () => check("pagehide"));
  setInterval(() => check("poll"), CHECK_INTERVAL_MS);
  setTimeout(() => check("boot"), 700);
})();
