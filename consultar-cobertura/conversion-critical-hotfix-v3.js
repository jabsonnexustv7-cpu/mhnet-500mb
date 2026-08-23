// WebTurbo — hotfix crítico de conversão v3.
// 1) Telegram de recuperação assim que o WhatsApp principal fica completo, sem duplicar.
// 2) Checkout direto da etapa de vencimento para o CRM, sem data/turno de instalação.
// 3) Redirecionamento pós-venda direto para o WhatsApp.
(function () {
  "use strict";

  if (window.__webturboConversionCriticalHotfixV3) return;
  window.__webturboConversionCriticalHotfixV3 = true;

  const TELEGRAM_ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const WHATS_NUMBER = "555193187300";
  const DUE_DATES = ["05", "08", "09", "10", "15", "25"];
  const telegramKeys = new Set();
  const checkoutEventId = `site_direct_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  let submitting = false;

  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value || "").trim();
  const digits = (value) => clean(value).replace(/\D+/g, "");

  function track(name, params) {
    try { window.clarity?.("event", name); } catch (_) {}
    try { window.gtag?.("event", name, params || {}); } catch (_) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...(params || {}) });
    } catch (_) {}
  }

  function telegramIdentity(payload) {
    const cpf = digits(payload?.documentoCliente || payload?.cpf);
    const phone = digits(payload?.telefone1Cliente || payload?.telefone1).slice(-11);
    const cep = digits(payload?.cep);
    if (!cpf || !phone) return "";
    return `${cpf}:${phone}:${cep}`;
  }

  // Fica abaixo dos wrappers carregados depois e funciona como trava final antes da rede.
  // Assim HERO, CHAT e rotina legada podem tentar notificar, mas apenas a primeira passa.
  const fetchBeforeHotfix = window.fetch.bind(window);
  window.fetch = async function webturboCriticalFetch(input, init) {
    try {
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (url === TELEGRAM_ENDPOINT && typeof init?.body === "string") {
        const payload = JSON.parse(init.body);
        if (payload?.action === "notifyAbandonoModal") {
          const key = telegramIdentity(payload);
          if (key && telegramKeys.has(key)) {
            track("telegram_recuperacao_duplicata_bloqueada", { origem: payload?.origem || "" });
            return new Response(JSON.stringify({
              ok: true,
              skipped: true,
              telegramSent: true,
              reason: "same_lead_same_page"
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          if (key) telegramKeys.add(key);
          const response = await fetchBeforeHotfix(input, init);
          const copy = response.clone();
          const data = await copy.json().catch(() => ({}));
          if (!response.ok || data?.ok === false || data?.telegramSent === false) {
            if (key) telegramKeys.delete(key);
          }
          return response;
        }
      }
    } catch (_) {}
    return fetchBeforeHotfix(input, init);
  };

  function requestRecoveryNow() {
    const phone = digits(byId("mTelefone1")?.value);
    if (phone.length < 10) return;
    // O lead-recovery-notification já monta o payload completo e valida os demais campos.
    // Chamamos explicitamente aqui para não depender do poll de 900 ms.
    try {
      const result = window.webturboLeadRecovery?.notifyNow?.("HERO");
      result?.catch?.(() => {});
    } catch (_) {}
  }

  function configurePhoneCopy() {
    const step = byId("etapa3");
    if (!step) return;
    const phone1Label = step.querySelector('label[for="mTelefone1"]');
    const phone2Label = step.querySelector('label[for="mTelefone2"]');
    if (phone1Label) phone1Label.textContent = "Seu WhatsApp principal *";
    if (phone2Label) phone2Label.textContent = "WhatsApp para recados (opcional)";
    const phone1 = byId("mTelefone1");
    const phone2 = byId("mTelefone2");
    if (phone1) phone1.placeholder = "Seu WhatsApp com DDD";
    if (phone2) phone2.placeholder = "WhatsApp de alguém para recados";
  }

  function traffic() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("webturbo_origem_trafego") || "{}"); } catch (_) {}
    const params = new URLSearchParams(location.search);
    const get = (name) => params.get(name) || saved[name] || "";
    return {
      landing_page: saved.landing_page || location.href,
      referrer: document.referrer || saved.referrer || "",
      gclid: get("gclid"), gbraid: get("gbraid"), wbraid: get("wbraid"), fbclid: get("fbclid"),
      utm_source: get("utm_source"), utm_medium: get("utm_medium"), utm_campaign: get("utm_campaign"),
      utm_content: get("utm_content"), utm_term: get("utm_term")
    };
  }

  function cookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()\[\]\\/+^]/g, "\\$&") + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function buildCrmPayload() {
    const t = traffic();
    const coords = clean(byId("mCoordenadasFixas")?.value);
    const detected = clean(byId("mEnderecoDetectadoLocalizacao")?.value);
    return {
      nomeCliente: clean(byId("mNome")?.value),
      tipoCliente: "Pessoa Física",
      documentoCliente: digits(byId("mCpf")?.value),
      emailCliente: clean(byId("mEmail")?.value),
      dataNascimentoCliente: clean(byId("mNascimento")?.value),
      telefone1Cliente: digits(byId("mTelefone1")?.value),
      telefone2Cliente: digits(byId("mTelefone2")?.value),
      cep: digits(byId("mCep")?.value),
      uf: clean(byId("mUf")?.value).toUpperCase(),
      nomeCidade: clean(byId("mCidade")?.value),
      cidade: clean(byId("mCidade")?.value),
      bairro: clean(byId("mBairro")?.value),
      logradouro: clean(byId("mLogradouro")?.value),
      numero: clean(byId("mNumero")?.value),
      complemento: clean(byId("mComplemento")?.value),
      pontoReferencia: clean(byId("mPontoRef")?.value) || (coords ? "Localização enviada pelo mapa/GPS" : ""),
      ponto_referencia: clean(byId("mPontoRef")?.value) || (coords ? "Localização enviada pelo mapa/GPS" : ""),
      latitudeFixa: clean(byId("mLatitudeFixa")?.value),
      longitudeFixa: clean(byId("mLongitudeFixa")?.value),
      coordenadasFixas: coords,
      coordenadas: coords,
      coords,
      enderecoLocalizacaoFixa: detected,
      planos: clean(byId("mPlano")?.value),
      diaVencimentoFatura: clean(byId("mVencimento")?.value),
      dataInstalacao1: "",
      turnoInstalacao1: "",
      linkLocalizacao: clean(byId("mLinkLocalizacaoFixa")?.value) || (coords ? `https://www.google.com/maps?q=${coords}` : ""),
      urlAdicional: "",
      obsEndereco: `Cobertura validada pelo site. Data e turno de instalação serão confirmados no atendimento.${coords ? ` Localização fixa enviada pelo cliente: ${coords}.${detected ? ` Endereço detectado: ${detected}.` : ""}` : ""}`,
      page_url: location.href,
      landing_page: t.landing_page,
      referrer: t.referrer,
      user_agent: navigator.userAgent,
      fbp: cookie("_fbp"),
      fbc: cookie("_fbc"),
      gclid: t.gclid,
      gbraid: t.gbraid,
      wbraid: t.wbraid,
      fbclid: t.fbclid,
      utm_source: t.utm_source,
      utm_medium: t.utm_medium,
      utm_campaign: t.utm_campaign,
      utm_content: t.utm_content,
      utm_term: t.utm_term,
      event_id: checkoutEventId
    };
  }

  function errorBox(message) {
    const box = byId("modalErro");
    if (!box) return;
    box.textContent = message;
    box.classList.add("show");
  }

  function buildWhatsUrl() {
    const cpf = digits(byId("mCpf")?.value);
    const text = cpf
      ? `Acabei de concluir meu pedido de internet. Meu CPF é ${cpf}.`
      : "Acabei de concluir meu pedido de internet pelo site da WebTurbo.";
    return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(text)}`;
  }

  async function submitDirect(button) {
    if (submitting) return;
    const due = String(byId("mVencimento")?.value || "").padStart(2, "0");
    if (!DUE_DATES.includes(due)) {
      try { window.fieldError?.("mVencimento", "Selecione o vencimento."); } catch (_) {}
      byId("mVencimento")?.focus({ preventScroll: true });
      return;
    }

    const payload = buildCrmPayload();
    if (!payload.nomeCliente || payload.documentoCliente.length !== 11 || !payload.planos || !payload.cidade || !payload.uf || !payload.numero) {
      errorBox("Alguns dados obrigatórios não foram carregados. Volte uma etapa, confira seus dados e tente novamente.");
      return;
    }

    submitting = true;
    const original = clean(button?.textContent) || "Concluir pedido";
    if (button) { button.disabled = true; button.textContent = "Enviando pedido..."; }
    try { window.showGlobalLoading?.("Estamos gravando sua pré-venda no CRM. Aguarde a confirmação.", "Finalizando seu pedido..."); } catch (_) {}
    track("checkout_crm_direto_iniciado", { cidade: payload.cidade, uf: payload.uf, vencimento: due });

    try {
      const response = await fetch(CRM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true || !data?.preSaleId) {
        throw new Error(data?.message || data?.code || `HTTP ${response.status}`);
      }

      track("checkout_crm_direto_sucesso", {
        pre_sale_id: data.preSaleId,
        created: data.created === true ? "sim" : "nao"
      });
      try { window.hideGlobalLoading?.(); } catch (_) {}
      try { window.mostrarEtapa?.(6); } catch (_) {}

      // Redirecionamento não usa link/âncora, portanto não pode ser capturado pelo chat.
      setTimeout(() => window.location.assign(buildWhatsUrl()), 900);
    } catch (error) {
      console.error("[WebTurbo] Falha crítica ao gravar pré-venda no CRM", error);
      track("checkout_crm_direto_erro", { erro: error?.message || "erro" });
      try { window.hideGlobalLoading?.(); } catch (_) {}
      errorBox(`Não foi possível gravar a pré-venda no CRM: ${error?.message || "erro de conexão"}. Tente novamente.`);
      submitting = false;
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  // Registrado antes dos hotfixes antigos: este listener é o primeiro da fase capture.
  document.addEventListener("click", function (event) {
    const button = event.target.closest?.("#etapa4 .btn-modal-next, #etapa4 [data-wt-direct-checkout='true']");
    if (!button) return;
    const step = byId("etapa4");
    if (!step || getComputedStyle(step).display === "none") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void submitDirect(button);
  }, true);

  document.addEventListener("input", function (event) {
    if (event.target?.id !== "mTelefone1") return;
    if (digits(event.target.value).length >= 10) setTimeout(requestRecoveryNow, 0);
  }, true);
  document.addEventListener("blur", function (event) {
    if (event.target?.id === "mTelefone1") requestRecoveryNow();
  }, true);

  function refresh() {
    configurePhoneCopy();
    const date = byId("mDataInstalacao");
    const shift = byId("mTurnoInstalacao");
    if (date) date.value = "";
    if (shift) shift.value = "";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
  setTimeout(refresh, 250);
  setTimeout(refresh, 1000);
})();
