// WebTurbo — captura antecipada para recuperação comercial.
// Assim que endereço + plano + dados pessoais + telefones estiverem completos,
// envia uma única notificação ao Telegram. Não depende do envio final ao CRM.
(function () {
  "use strict";

  if (window.__webturboLeadRecoveryNotificationInstalled) return;
  window.__webturboLeadRecoveryNotificationInstalled = true;

  const ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const CHECK_INTERVAL_MS = 1200;
  const SENT_PREFIX = "wt_lead_recovery_sent:";

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

  function buildKey(source, phone, cep) {
    return [source, digits(phone).slice(-11), digits(cep)].join(":");
  }

  function heroLead() {
    const nome = value("mNome");
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

    if (!nome || digits(telefone1).length < 10 || digits(telefone2).length < 10) return null;
    if (!plano || !numero || !cidade || !uf || (!logradouro && digits(cep).length !== 8)) return null;

    return {
      source: "HERO",
      key: buildKey("HERO", telefone1, cep),
      payload: {
        action: "notifyAbandonoModal",
        evento: "lead_recuperacao_dados_completos",
        etapa_abandono: "dados_pessoais_concluidos",
        origem: "site_webturbo_hero",
        horario_site: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        nome,
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
        ponto_referencia: value("mPontoRef"),
        vencimento: value("mVencimento"),
        data_instalacao: value("mDataInstalacao"),
        turno_instalacao: value("mTurnoInstalacao"),
        cobertura_validada: true,
        url_pagina: location.href,
        user_agent: navigator.userAgent
      }
    };
  }

  function chatLead() {
    let session;
    try { session = window.webturboChat?.getSession?.(); } catch (_) { session = null; }
    if (!session) return null;

    const nome = clean(session.nome);
    const telefone1 = clean(session.telefone);
    const telefone2 = clean(session.telefoneSecundario);
    const plano = clean(session.plano?.title || session.plano?.id);
    const cep = clean(session.cep);
    const numero = clean(session.numero);
    const cidade = clean(session.cidade);
    const uf = clean(session.uf);

    if (!nome || digits(telefone1).length < 10 || digits(telefone2).length < 10) return null;
    if (!plano || !numero || !cidade || !uf) return null;

    return {
      source: "CHAT",
      key: buildKey("CHAT", telefone1, cep),
      payload: {
        action: "notifyAbandonoModal",
        evento: "lead_recuperacao_dados_completos",
        etapa_abandono: "dados_pessoais_concluidos",
        origem: "site_webturbo_chat",
        horario_site: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        nome,
        email: clean(session.email),
        telefone1,
        telefone2,
        plano,
        cep,
        numero,
        logradouro: clean(session.logradouro),
        bairro: clean(session.bairro),
        cidade,
        uf,
        complemento: clean(session.complemento),
        vencimento: clean(session.diaVencimentoFatura),
        data_instalacao: clean(session.dataInstalacao),
        turno_instalacao: clean(session.turnoInstalacao),
        cobertura_validada: session.cobertura?.viavel === true,
        cobertura_motivo: clean(session.cobertura?.motivo),
        cobertura_coords: clean(session.cobertura?.coords || session.coordenadas),
        url_pagina: location.href,
        user_agent: navigator.userAgent
      }
    };
  }

  async function send(lead) {
    if (!lead || alreadySent(lead.key)) return;
    // Marca antes para evitar duplicidade causada por vários observadores/timers.
    markSent(lead.key);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead.payload),
        keepalive: true
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      clarityEvent("lead_recuperacao_telegram_enviado");
      gaEvent("lead_recuperacao_telegram_enviado", { origem_fluxo: lead.source.toLowerCase(), cidade: lead.payload.cidade || "" });
    } catch (error) {
      // Permite nova tentativa caso a notificação em si tenha falhado.
      try { sessionStorage.removeItem(SENT_PREFIX + lead.key); } catch (_) {}
      clarityEvent("lead_recuperacao_telegram_erro");
      gaEvent("lead_recuperacao_telegram_erro", { origem_fluxo: lead.source.toLowerCase(), erro: error?.message || "erro_envio" });
    }
  }

  function check() {
    void send(heroLead());
    void send(chatLead());
  }

  document.addEventListener("change", check, true);
  document.addEventListener("input", () => setTimeout(check, 120), true);
  document.addEventListener("click", () => setTimeout(check, 180), true);
  setInterval(check, CHECK_INTERVAL_MS);
  setTimeout(check, 900);
})();
