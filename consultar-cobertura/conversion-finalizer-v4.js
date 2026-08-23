// WebTurbo — finalização autoritativa v4.
// Um único controlador para: Telegram ao concluir WhatsApp, vencimento -> CRM e pós-venda -> WhatsApp.
(function () {
  "use strict";

  if (window.__webturboConversionFinalizerV4Installed) return;
  window.__webturboConversionFinalizerV4Installed = true;

  const TELEGRAM_ENDPOINT = "https://modal-easy-964927461432.southamerica-east1.run.app";
  const CRM_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";
  const WHATS_NUMBER = "555193187300";
  const DUE_DATES = ["05", "08", "09", "10", "15", "25"];
  const telegramSent = new Set();
  const checkoutEventId = `site_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  let submitting = false;

  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value || "").trim();
  const digits = (value) => clean(value).replace(/\D+/g, "");

  function track(name, params = {}) {
    try { window.clarity?.("event", name); } catch (_) {}
    try { window.gtag?.("event", name, params); } catch (_) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...params });
    } catch (_) {}
  }

  function visibleStepFour() {
    const step = byId("etapa4");
    if (!step) return false;
    const style = window.getComputedStyle(step);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function ensureStepFourError() {
    let box = byId("wtCheckoutErrorV4");
    if (box) return box;
    const actions = document.querySelector("#etapa4 .modal-actions");
    if (!actions) return null;
    box = document.createElement("div");
    box.id = "wtCheckoutErrorV4";
    box.setAttribute("role", "alert");
    box.style.cssText = "display:none;margin:14px 0 0;padding:12px 14px;border:1px solid #efb5b5;border-radius:9px;background:#fff5f5;color:#9b1c1c;font-size:13px;font-weight:600;line-height:1.45";
    actions.insertAdjacentElement("beforebegin", box);
    return box;
  }

  function showError(message) {
    const box = ensureStepFourError();
    if (!box) return;
    box.textContent = message;
    box.style.display = "block";
    box.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function clearError() {
    const box = ensureStepFourError();
    if (!box) return;
    box.textContent = "";
    box.style.display = "none";
  }

  function apiErrorMessage(data, status) {
    const detail = Array.isArray(data?.error?.details) ? data.error.details[0] : null;
    return clean(data?.message || data?.error?.message || detail?.message || data?.code || data?.error?.code || (status ? `Erro HTTP ${status}` : ""));
  }

  function configureDueDates() {
    const select = byId("mVencimento");
    if (!select) return;
    const previous = DUE_DATES.includes(String(select.value || "").padStart(2, "0")) ? String(select.value || "").padStart(2, "0") : "";
    const current = Array.from(select.options).map((option) => String(option.value || ""));
    const expected = ["", ...DUE_DATES];
    if (current.length !== expected.length || !expected.every((value, index) => current[index] === value)) {
      select.innerHTML = '<option value="">Selecione o vencimento</option>';
      for (const day of DUE_DATES) {
        const option = document.createElement("option");
        option.value = day;
        option.textContent = `Dia ${day}`;
        select.appendChild(option);
      }
    }
    select.value = previous;
  }

  function configureStepFour() {
    configureDueDates();
    for (const id of ["field-mDataInstalacao", "field-mTurnoInstalacao"]) {
      const field = byId(id);
      if (field) {
        field.hidden = true;
        field.style.display = "none";
        field.setAttribute("aria-hidden", "true");
      }
    }
    if (byId("mDataInstalacao")) byId("mDataInstalacao").value = "";
    if (byId("mTurnoInstalacao")) byId("mTurnoInstalacao").value = "";
    const step = byId("etapa4");
    const header = step?.querySelector(".modal-header h2");
    const subtitle = step?.querySelector(".modal-subtitle");
    const label = step?.querySelector(".modal-step-label");
    const button = step?.querySelector(".btn-modal-next");
    if (header) header.textContent = "Escolha o vencimento da sua fatura";
    if (subtitle) subtitle.textContent = "Escolha o melhor dia e conclua seu pedido. O agendamento será confirmado no atendimento.";
    if (label) label.textContent = "Etapa final — Vencimento";
    if (button) {
      button.textContent = "Concluir pedido";
      button.setAttribute("aria-label", "Concluir pedido");
      button.removeAttribute("onclick");
      button.dataset.wtFinalizerV4 = "true";
    }
    ensureStepFourError();
  }

  function configurePhoneCopy() {
    const step = byId("etapa3");
    if (!step) return;
    const phone1Label = step.querySelector('label[for="mTelefone1"]');
    const phone2Label = step.querySelector('label[for="mTelefone2"]');
    if (phone1Label) phone1Label.textContent = "Seu WhatsApp principal *";
    if (phone2Label) phone2Label.textContent = "WhatsApp para recados (opcional)";
    if (byId("mTelefone1")) byId("mTelefone1").placeholder = "Seu WhatsApp com DDD";
    if (byId("mTelefone2")) byId("mTelefone2").placeholder = "WhatsApp de alguém para recados";
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
      utm_source: get("utm_source"), utm_medium: get("utm_medium"), utm_campaign: get("utm_campaign"), utm_content: get("utm_content"), utm_term: get("utm_term")
    };
  }

  function cookie(name) {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|; )${safe}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function buildRecoveryPayload() {
    const cpf = digits(byId("mCpf")?.value);
    const phone = digits(byId("mTelefone1")?.value);
    const cep = digits(byId("mCep")?.value);
    const nome = clean(byId("mNome")?.value);
    const nascimento = clean(byId("mNascimento")?.value) || clean(byId("mNascimentoTexto")?.value);
    const email = clean(byId("mEmail")?.value);
    const plano = clean(byId("mPlano")?.value);
    const numero = clean(byId("mNumero")?.value);
    const cidade = clean(byId("mCidade")?.value);
    const uf = clean(byId("mUf")?.value).toUpperCase();
    if (cpf.length !== 11 || phone.length < 10 || !nome || !nascimento || !email || !plano || !numero || !cidade || uf.length !== 2) return null;
    return {
      key: `${cpf}:${phone.slice(-11)}:${cep}`,
      payload: {
        action: "notifyAbandonoModal", evento: "lead_recuperacao_dados_completos",
        etapa_abandono: "whatsapp_principal_concluido", etapaAbandono: "whatsapp_principal_concluido", etapa: "whatsapp_principal_concluido",
        origem: "site_webturbo_hero", finalizacao: "HERO",
        horario_site: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        nome, nomeCliente: nome, cpf, documentoCliente: cpf, nascimento, dataNascimentoCliente: nascimento,
        email, emailCliente: email, telefone1: phone, telefone1Cliente: phone,
        telefone2: digits(byId("mTelefone2")?.value), telefone2Cliente: digits(byId("mTelefone2")?.value),
        plano, planos: plano, cep, numero,
        logradouro: clean(byId("mLogradouro")?.value), bairro: clean(byId("mBairro")?.value), cidade, nomeCidade: cidade, uf,
        complemento: clean(byId("mComplemento")?.value), ponto_referencia: clean(byId("mPontoRef")?.value),
        vencimento: clean(byId("mVencimento")?.value), coordenadas: clean(byId("mCoordenadasFixas")?.value),
        link_localizacao: clean(byId("mLinkLocalizacaoFixa")?.value), cobertura_validada: true,
        url_pagina: location.href, user_agent: navigator.userAgent
      }
    };
  }

  const previousFetch = window.fetch.bind(window);

  async function sendRecoveryNow(reason) {
    const recovery = buildRecoveryPayload();
    if (!recovery || telegramSent.has(recovery.key)) return false;
    try {
      const response = await previousFetch(TELEGRAM_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recovery.payload), keepalive: true
      });
      const data = await response.clone().json().catch(() => ({}));
      if (!response.ok || data?.ok === false || data?.telegramSent === false) throw new Error(apiErrorMessage(data, response.status) || "Falha ao enviar recuperação");
      telegramSent.add(recovery.key);
      track("lead_recuperacao_telegram_enviado", { gatilho: reason || "whatsapp" });
      return true;
    } catch (error) {
      telegramSent.delete(recovery.key);
      console.warn("[WebTurbo] Telegram de recuperação não enviado", error);
      track("lead_recuperacao_telegram_erro", { erro: error?.message || "erro" });
      return false;
    }
  }

  window.fetch = async function webturboFinalizerFetch(input, init) {
    try {
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (url === TELEGRAM_ENDPOINT && typeof init?.body === "string") {
        const payload = JSON.parse(init.body);
        if (payload?.action === "notifyAbandonoModal") {
          const cpf = digits(payload.documentoCliente || payload.cpf);
          const phone = digits(payload.telefone1Cliente || payload.telefone1).slice(-11);
          const cep = digits(payload.cep);
          const key = cpf && phone ? `${cpf}:${phone}:${cep}` : "";
          if (key && telegramSent.has(key)) return new Response(JSON.stringify({ ok: true, skipped: true, telegramSent: true, reason: "duplicate_same_visit" }), { status: 200, headers: { "Content-Type": "application/json" } });
          if (key) telegramSent.add(key);
          const response = await previousFetch(input, init);
          const data = await response.clone().json().catch(() => ({}));
          if (!response.ok || data?.ok === false || data?.telegramSent === false) if (key) telegramSent.delete(key);
          return response;
        }
      }
    } catch (_) {}
    return previousFetch(input, init);
  };

  function buildCrmPayload() {
    const t = traffic();
    const coords = clean(byId("mCoordenadasFixas")?.value);
    const detected = clean(byId("mEnderecoDetectadoLocalizacao")?.value);
    return {
      nomeCliente: clean(byId("mNome")?.value), tipoCliente: "Pessoa Física", documentoCliente: digits(byId("mCpf")?.value),
      emailCliente: clean(byId("mEmail")?.value), dataNascimentoCliente: clean(byId("mNascimento")?.value),
      telefone1Cliente: digits(byId("mTelefone1")?.value), telefone2Cliente: digits(byId("mTelefone2")?.value),
      cep: digits(byId("mCep")?.value), uf: clean(byId("mUf")?.value).toUpperCase(), nomeCidade: clean(byId("mCidade")?.value), cidade: clean(byId("mCidade")?.value),
      bairro: clean(byId("mBairro")?.value), logradouro: clean(byId("mLogradouro")?.value), numero: clean(byId("mNumero")?.value), complemento: clean(byId("mComplemento")?.value),
      pontoReferencia: clean(byId("mPontoRef")?.value) || (coords ? "Localização enviada pelo mapa/GPS" : ""),
      ponto_referencia: clean(byId("mPontoRef")?.value) || (coords ? "Localização enviada pelo mapa/GPS" : ""),
      coordenadasFixas: coords, coordenadas: coords, coords,
      linkLocalizacao: clean(byId("mLinkLocalizacaoFixa")?.value) || (coords ? `https://www.google.com/maps?q=${coords}` : ""),
      obsEndereco: `Cobertura validada pelo site. Data e turno de instalação serão confirmados no atendimento.${detected ? ` Endereço detectado: ${detected}.` : ""}`,
      planos: clean(byId("mPlano")?.value), diaVencimentoFatura: clean(byId("mVencimento")?.value), dataInstalacao1: "", turnoInstalacao1: "",
      page_url: location.href, landing_page: t.landing_page, referrer: t.referrer, user_agent: navigator.userAgent,
      fbp: cookie("_fbp"), fbc: cookie("_fbc"), gclid: t.gclid, gbraid: t.gbraid, wbraid: t.wbraid, fbclid: t.fbclid,
      utm_source: t.utm_source, utm_medium: t.utm_medium, utm_campaign: t.utm_campaign, utm_content: t.utm_content, utm_term: t.utm_term,
      event_id: checkoutEventId
    };
  }

  function validatePayload(payload) {
    if (!payload.nomeCliente) return "Nome do cliente não foi carregado.";
    if (payload.documentoCliente.length !== 11) return "CPF não foi carregado corretamente.";
    if (!payload.emailCliente) return "E-mail não foi carregado.";
    if (!payload.dataNascimentoCliente) return "Data de nascimento não foi carregada.";
    if (payload.telefone1Cliente.length < 10) return "WhatsApp principal não foi carregado.";
    if (!payload.planos) return "Plano não foi carregado.";
    if (!payload.cidade || payload.uf.length !== 2) return "Cidade/UF não foram carregadas.";
    if (!payload.numero) return "Número do imóvel não foi carregado.";
    return "";
  }

  function buildWhatsUrl() {
    const cpf = digits(byId("mCpf")?.value);
    const message = cpf ? `Acabei de concluir um pedido de internet, meu CPF: ${cpf}` : "Acabei de concluir um pedido de internet pelo site da WebTurbo.";
    return `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  async function submitOrder(button) {
    if (submitting) return;
    clearError();
    const due = String(byId("mVencimento")?.value || "").padStart(2, "0");
    if (!DUE_DATES.includes(due)) {
      try { window.fieldError?.("mVencimento", "Selecione o vencimento."); } catch (_) {}
      showError("Selecione um dos vencimentos disponíveis para concluir.");
      byId("mVencimento")?.focus({ preventScroll: true });
      return;
    }
    byId("mVencimento").value = due;
    const payload = buildCrmPayload();
    const validation = validatePayload(payload);
    if (validation) {
      showError(`${validation} Volte aos dados pessoais, confira o preenchimento e tente novamente.`);
      track("checkout_dados_incompletos", { motivo: validation });
      return;
    }
    submitting = true;
    const originalText = clean(button?.textContent) || "Concluir pedido";
    if (button) { button.disabled = true; button.textContent = "Enviando pedido..."; }
    track("checkout_crm_direto_iniciado", { cidade: payload.cidade, uf: payload.uf, vencimento: due });
    try {
      const response = await window.fetch(CRM_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true || !data?.preSaleId) throw new Error(apiErrorMessage(data, response.status) || "O CRM recusou o envio.");
      track("checkout_crm_direto_sucesso", { pre_sale_id: String(data.preSaleId), created: data.created === true ? "sim" : "nao" });
      submitting = false;
      if (button) { button.disabled = true; button.textContent = "Pedido concluído"; }
      try { window.mostrarEtapa?.(6); } catch (_) {}
      window.setTimeout(() => window.location.assign(buildWhatsUrl()), 500);
    } catch (error) {
      submitting = false;
      if (button) { button.disabled = false; button.textContent = originalText; }
      const message = error?.message || "Falha de conexão com o CRM.";
      showError(`Não foi possível concluir o pedido: ${message}`);
      track("checkout_crm_direto_erro", { erro: message });
      console.error("[WebTurbo] Falha ao gravar pré-venda", error);
    }
  }

  function bindStepFourButton() {
    configureStepFour();
    const button = document.querySelector("#etapa4 .btn-modal-next");
    if (!button || button.dataset.wtFinalizerBound === "true") return;
    button.dataset.wtFinalizerBound = "true";
    button.addEventListener("click", function (event) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (!visibleStepFour()) return;
      void submitOrder(button);
    }, true);
  }

  window.validarEtapaInstalacao = function validarEtapaInstalacaoV4() {
    const button = document.querySelector("#etapa4 .btn-modal-next");
    void submitOrder(button);
  };

  document.addEventListener("input", function (event) {
    if (event.target?.id === "mTelefone1" && digits(event.target.value).length >= 10) window.setTimeout(() => void sendRecoveryNow("whatsapp_completo"), 0);
  }, true);
  document.addEventListener("blur", function (event) {
    if (event.target?.id === "mTelefone1" && digits(event.target.value).length >= 10) void sendRecoveryNow("whatsapp_blur");
  }, true);

  function refresh() { configurePhoneCopy(); bindStepFourButton(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true }); else refresh();
  window.setTimeout(refresh, 250);
  window.setTimeout(refresh, 1000);
  window.setInterval(() => { if (visibleStepFour()) bindStepFourButton(); }, 1500);
})();
