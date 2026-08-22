import {
  extractAddressNumber,
  extractBirthDate,
  extractCep,
  extractComplement,
  extractCpf,
  extractEmail,
  extractName,
  extractPhone,
  selectPlanFromText,
  wantsAddressCorrection,
  wantsConfirmation
} from "./parser.js";
import { resumePromptForStep } from "./knowledge.js";
import { routeMessage, ROUTE_KINDS, ROUTER_COMMANDS } from "./message-router.js";
import { getPlansForCity, getPromotionalPlans, isPromotionalPlan, PLAN_SELECTION_VIEWS } from "./plans.js";
import { calculateBillingSummary, DUE_DATE_OPTIONS, INSTALLATION_SHIFT_OPTIONS, parseInstallationDate, tomorrowISO } from "./billing.js";
import { clearAddress, saveSession, STATES, transition } from "./state.js";
import {
  formatCep,
  isValidCep,
  isValidCpf,
  isValidEmail,
  isValidName,
  isValidPhone,
  maskCpf,
  onlyDigits,
  parseBirthDate
} from "./validators.js";

const PREFIX = "[WEBTURBO CHAT]";

const BACK_STEPS = Object.freeze({
  [STATES.NUMERO]: STATES.CEP,
  [STATES.COMPLEMENTO]: STATES.NUMERO,
  [STATES.NOME]: STATES.ESCOLHA_PLANO,
  [STATES.CPF]: STATES.NOME,
  [STATES.DATA_NASCIMENTO]: STATES.CPF,
  [STATES.EMAIL]: STATES.DATA_NASCIMENTO,
  [STATES.TELEFONE]: STATES.EMAIL,
  [STATES.TELEFONE_SECUNDARIO]: STATES.TELEFONE,
  [STATES.VENCIMENTO]: STATES.TELEFONE_SECUNDARIO,
  [STATES.DATA_INSTALACAO]: STATES.VENCIMENTO,
  [STATES.TURNO_INSTALACAO]: STATES.DATA_INSTALACAO,
  [STATES.CONFIRMACAO]: STATES.TURNO_INSTALACAO
});

function plain(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function doesNotKnowCep(text) {
  const normalized = plain(text);
  return /\b(nao sei|nao tenho|nao lembro|desconheco)\b.*\bcep\b|\bcep\b.*\b(nao sei|nao tenho|nao lembro|desconheco)\b/.test(normalized)
    || /^(nao sei|nao tenho|nao lembro)[.!\s]*$/.test(normalized);
}

function addressLine(session) {
  const street = session.logradouro || "endereço localizado";
  const district = session.bairro ? ` · ${session.bairro}` : "";
  const city = session.cidade ? ` · ${session.cidade}/${session.uf || ""}` : "";
  const cep = session.cep ? ` · CEP ${formatCep(session.cep)}` : "";
  return `${street}${district}${city}${cep}`;
}

export function createChatFlow({ session, config, storage, ui, coverageService, crmService, aiService, messageRouter, addressLookup, locationService, tracking, whatsappService, logger = console }) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const analytics = tracking || {
    attribution() { return {}; }, personalLead() {}, crmAttempt() {}, crmSuccess() {}, crmError() {}, coverage() {}, whatsapp() {}
  };
  let submitting = false;
  let aiInFlight = false;
  const router = messageRouter || { route: routeMessage };

  function persist() {
    saveSession(session, storage, config.storageKey);
    ui.updateDebug(session, config);
  }

  function changeStep(next) {
    const { previous } = transition(session, next);
    logger.info(`${PREFIX} Step changed: ${previous} -> ${next}`);
    persist();
  }

  function addMessage(role, text, meta = {}) {
    const message = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, meta, at: new Date().toISOString() };
    session.messages.push(message);
    ui.addMessage(message);
    persist();
  }

  function planSelectionView() {
    return session.planSelectionView === PLAN_SELECTION_VIEWS.CATALOG
      ? PLAN_SELECTION_VIEWS.CATALOG
      : PLAN_SELECTION_VIEWS.PROMOTIONS;
  }

  function visiblePlans() {
    return planSelectionView() === PLAN_SELECTION_VIEWS.CATALOG
      ? getPlansForCity(session.cidade)
      : getPromotionalPlans();
  }

  function trackPlanEvent(name, params = {}) {
    if (session.cobertura?.source !== "real" && config.conversionMode === "real") return;
    analytics.ga4?.(name, {
      origem_consulta: "chat_lab",
      campanha: "ofertas_combate",
      cidade: session.cidade || "",
      uf: session.uf || "",
      ...params
    });
  }

  function trackPromotionsDisplayed() {
    trackPlanEvent("cobertura_opcoes_exibidas", { tipo_opcao: "ofertas_combate" });
    trackPlanEvent("cobertura_ofertas_combate_exibidas");
  }

  async function assistant(text, meta = {}) {
    ui.setTyping(true);
    await delay(config.typingDelayMs || 0);
    ui.setTyping(false);
    addMessage("assistant", text, meta);
  }

  function showControlsForStep() {
    ui.clearActions();
    ui.setComposerEnabled(![STATES.CONSULTANDO_COBERTURA, STATES.FINALIZADO].includes(session.step));
    const placeholders = {
      [STATES.CEP]: "Digite seu CEP",
      [STATES.NUMERO]: "Número do imóvel",
      [STATES.COMPLEMENTO]: session.addressConfirmed ? "Complemento ou 'não tenho'" : "Confirme o endereço localizado",
      [STATES.ESCOLHA_PLANO]: "Ex.: quero o mais barato",
      [STATES.NOME]: "Seu nome completo",
      [STATES.CPF]: "Seu CPF",
      [STATES.DATA_NASCIMENTO]: "DD/MM/AAAA",
      [STATES.EMAIL]: "seuemail@exemplo.com",
      [STATES.TELEFONE]: "(DDD) 99999-9999",
      [STATES.TELEFONE_SECUNDARIO]: "Outro telefone com DDD",
      [STATES.VENCIMENTO]: "Ex.: dia 10",
      [STATES.DATA_INSTALACAO]: "DD/MM/AAAA",
      [STATES.TURNO_INSTALACAO]: "Manhã ou tarde",
      [STATES.CONFIRMACAO]: "Digite confirmar"
    };
    ui.setPlaceholder(placeholders[session.step] || "Digite sua mensagem");

    if (session.step === STATES.CEP) {
      ui.showQuickReplies([{ label: "Não sei meu CEP", action: "offer-location" }]);
    } else if (session.step === STATES.COMPLEMENTO && !session.addressConfirmed) {
      ui.showAddressConfirmation?.(session);
    } else if (session.step === STATES.COMPLEMENTO) {
      ui.showQuickReplies([{ label: "Não tenho complemento", action: "no-complement" }]);
    } else if (session.step === STATES.COBERTURA_INVIAVEL) {
      ui.showQuickReplies([
        { label: "Fazer nova consulta", action: "new-address" },
        { label: "Corrigir número", action: "fix-number" }
      ]);
    } else if (session.step === STATES.ESCOLHA_PLANO) {
      const promotions = planSelectionView() === PLAN_SELECTION_VIEWS.PROMOTIONS;
      ui.showPlans(visiblePlans(), { showMore: promotions, showPromotions: !promotions });
    } else if (session.step === STATES.VENCIMENTO) {
      ui.showQuickReplies(DUE_DATE_OPTIONS.map((day) => ({ label: `Dia ${day}`, action: "select-due-date", value: day })));
    } else if (session.step === STATES.DATA_INSTALACAO) {
      ui.showDatePicker?.(tomorrowISO());
    } else if (session.step === STATES.TURNO_INSTALACAO) {
      ui.showQuickReplies(INSTALLATION_SHIFT_OPTIONS.map((shift) => ({ label: shift, action: "select-shift", value: shift })));
    } else if (session.step === STATES.CONFIRMACAO) {
      ui.showQuickReplies([
        { label: "Confirmar contratação", action: "confirm" },
        { label: "Trocar plano", action: "change-plan" },
        { label: "Corrigir endereço", action: "new-address" }
      ]);
    } else if (session.step === STATES.FINALIZADO) {
      ui.showQuickReplies([{ label: "Iniciar nova contratação", action: "restart" }]);
    }
  }

  async function askCurrentStep() {
    if (session.step === STATES.COMPLEMENTO && !session.addressConfirmed) {
      await assistant("Antes de consultar a cobertura, confira se o endereço abaixo está correto.");
      showControlsForStep();
      return;
    }
    const prompts = {
      [STATES.CEP]: "Para começar, qual é o seu CEP? Se não souber, posso localizar seu endereço pelo aparelho.",
      [STATES.NUMERO]: `Encontrei ${addressLine(session)}. Qual é o número da casa ou prédio?`,
      [STATES.COMPLEMENTO]: "Tem complemento? Pode ser apartamento, bloco ou casa dos fundos.",
      [STATES.NOME]: "Perfeito. Qual é o seu nome completo?",
      [STATES.CPF]: "Agora me informe seu CPF.",
      [STATES.DATA_NASCIMENTO]: "Qual é a sua data de nascimento? Use DD/MM/AAAA.",
      [STATES.EMAIL]: "Qual é o seu melhor e-mail?",
      [STATES.TELEFONE]: "E qual telefone com DDD podemos usar para contato?",
      [STATES.TELEFONE_SECUNDARIO]: "Informe também um segundo telefone com DDD. Ele precisa ser diferente do contato principal.",
      [STATES.VENCIMENTO]: "Qual dia você prefere para o vencimento da fatura?",
      [STATES.DATA_INSTALACAO]: `Qual é a data preferida para instalação? A primeira data disponível é ${tomorrowISO().split("-").reverse().join("/" )}.`,
      [STATES.TURNO_INSTALACAO]: "Qual turno você prefere para a instalação?",
      [STATES.CONFIRMACAO]: "Confira o resumo abaixo. Se estiver tudo certo, confirme a simulação."
    };
    if (prompts[session.step]) await assistant(prompts[session.step]);
    showControlsForStep();
  }

  async function start() {
    logger.info(`${PREFIX} Session created`, { sessionId: session.sessionId });
    ui.clearConversation();
    session.messages = [];
    await assistant("Olá! Sou o assistente da WebTurbo. Vou verificar se temos fibra disponível no seu endereço.");
    changeStep(STATES.CEP);
    await askCurrentStep();
  }

  function resume() {
    ui.clearConversation();
    session.messages.forEach((message) => ui.addMessage(message));
    if (session.step === STATES.WELCOME) changeStep(STATES.CEP);
    if (session.step === STATES.CONSULTANDO_COBERTURA) {
      changeStep(STATES.COMPLEMENTO);
      addMessage("assistant", "A consulta foi interrompida pelo recarregamento. Confira o endereço e continue.");
    }
    if (session.step === STATES.COBERTURA_VIAVEL) changeStep(STATES.ESCOLHA_PLANO);
    if (session.step === STATES.ESCOLHA_PLANO && !session.planSelectionView) {
      session.planSelectionView = PLAN_SELECTION_VIEWS.PROMOTIONS;
      persist();
    }
    ui.updateDebug(session, config);
    if (session.step === STATES.CONFIRMACAO) ui.showSummary(session);
    if (session.step === STATES.FINALIZADO && session.crmPayload) {
      if (session.crmResult?.mock === false && whatsappService) {
        ui.showPostSaleSuccess?.();
      } else {
        ui.showFinalPayload(session.crmPayload);
      }
    }
    showControlsForStep();
  }

  async function correctAddress() {
    ui.removeSummary?.();
    clearAddress(session);
    if (session.step !== STATES.CEP) changeStep(STATES.CEP);
    await assistant("Sem problema. Vamos corrigir o endereço desde o começo.");
    await askCurrentStep();
  }

  async function offerLocation({ recordUser = false } = {}) {
    if (recordUser) addMessage("user", "Não sei meu CEP");
    await assistant("Sem problema. Posso usar a localização do seu aparelho para encontrar o endereço aproximado. Você poderá conferir antes da consulta de cobertura.");
    ui.showQuickReplies([
      { label: "Usar minha localização", action: "use-location" },
      { label: "Digitar CEP", action: "enter-cep" }
    ]);
  }

  async function captureLocation() {
    if (session.step !== STATES.CEP) return;
    if (!locationService?.locate) {
      await assistant("A localização não está disponível neste navegador. Informe o CEP para continuar.");
      ui.showQuickReplies([
        { label: "Tentar localização novamente", action: "use-location" },
        { label: "Digitar CEP", action: "enter-cep" }
      ]);
      return;
    }
    ui.clearActions();
    ui.setComposerEnabled(false);
    await assistant("Vou solicitar a permissão de localização do navegador. Só usarei esse ponto para identificar e conferir o endereço.", { kind: "status" });
    try {
      const located = await locationService.locate();
      Object.assign(session, {
        cep: located.cep || "",
        logradouro: located.logradouro || "",
        bairro: located.bairro || "",
        cidade: located.cidade || "",
        uf: located.uf || "",
        coordenadas: located.coordenadas || "",
        addressSource: "geolocation",
        addressConfirmed: false,
        locationAccuracy: located.locationAccuracy || null,
        numero: "",
        complemento: ""
      });
      persist();
      changeStep(STATES.NUMERO);
      await assistant("Localização encontrada. Registrei os dados do endereço e preciso apenas do número do imóvel antes da conferência.");
      await askCurrentStep();
    } catch (error) {
      logger.warn(`${PREFIX} Location lookup failed`, error?.message || error);
      ui.setComposerEnabled(true);
      await assistant(error?.message || "Não foi possível localizar seu endereço. Informe o CEP para continuar.");
      ui.showQuickReplies([
        { label: "Tentar localização novamente", action: "use-location" },
        { label: "Digitar CEP", action: "enter-cep" }
      ]);
    }
  }

  async function confirmAddress({ recordUser = false } = {}) {
    if (session.step !== STATES.COMPLEMENTO || !session.numero) return;
    if (recordUser) addMessage("user", "Está correto");
    session.addressConfirmed = true;
    persist();
    await assistant("Perfeito, endereço confirmado.");
    await askCurrentStep();
  }

  async function consultCoverage() {
    changeStep(STATES.CONSULTANDO_COBERTURA);
    ui.setComposerEnabled(false);
    await assistant("Só um instante enquanto consulto a disponibilidade de fibra…", { kind: "status" });
    try {
      const coverage = await coverageService.check(session);
      session.cobertura = coverage;
      session.coordenadas = coverage.coords || session.coordenadas || "";
      if (coverage.source === "real" || config.conversionMode !== "real") analytics.coverage(session, coverage);
      logger.info(`${PREFIX} Coverage result: ${coverage.status}`, { source: coverage.source, motivo: coverage.motivo });
      changeStep(coverage.viavel ? STATES.COBERTURA_VIAVEL : STATES.COBERTURA_INVIAVEL);
      if (!coverage.viavel) {
        await assistant("Neste endereço ainda não encontramos cobertura disponível.");
        showControlsForStep();
        return;
      }
      await assistant("Ótima notícia! Temos fibra disponível no seu endereço. 🎉");
      session.planSelectionView = PLAN_SELECTION_VIEWS.PROMOTIONS;
      changeStep(STATES.ESCOLHA_PLANO);
      await assistant("Escolha uma das três condições especiais abaixo. Se preferir, toque em “Ver mais ofertas” para consultar os demais planos.");
      trackPromotionsDisplayed();
      showControlsForStep();
    } catch (error) {
      logger.error(`${PREFIX} Coverage request failed`, error);
      changeStep(STATES.COMPLEMENTO);
      await assistant("Não consegui consultar a cobertura agora. Tente novamente em instantes.");
      showControlsForStep();
    }
  }

  async function choosePlan(plan) {
    session.plano = plan;
    session.faturamento = null;
    session.crmPayload = null;
    logger.info(`${PREFIX} Plan selected: ${plan.id}`);
    if (isPromotionalPlan(plan)) {
      trackPlanEvent("cobertura_oferta_combate_selecionada", { plano: plan.id, valor: plan.price });
    }
    addMessage("user", `Quero o plano ${plan.title}.`, { planId: plan.id });
    changeStep(STATES.NOME);
    await assistant(`Boa escolha: ${plan.title} por ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}/mês.`);
    await askCurrentStep();
  }

  async function showMorePlans({ recordUser = true } = {}) {
    if (planSelectionView() === PLAN_SELECTION_VIEWS.CATALOG) return;
    if (recordUser) addMessage("user", "Ver mais ofertas");
    session.planSelectionView = PLAN_SELECTION_VIEWS.CATALOG;
    persist();
    trackPlanEvent("cobertura_ofertas_combate_fechadas", { motivo: "ver_mais_ofertas" });
    trackPlanEvent("cobertura_opcoes_exibidas", { tipo_opcao: "outros_planos" });
    await assistant("Claro! Aqui estão os demais planos disponíveis para o seu endereço.");
    showControlsForStep();
  }

  async function showPromotions({ recordUser = true } = {}) {
    if (planSelectionView() === PLAN_SELECTION_VIEWS.PROMOTIONS) return;
    if (recordUser) addMessage("user", "Voltar às promoções");
    session.planSelectionView = PLAN_SELECTION_VIEWS.PROMOTIONS;
    persist();
    trackPromotionsDisplayed();
    await assistant("Estas são novamente as três condições especiais disponíveis.");
    showControlsForStep();
  }

  async function goBack() {
    if (session.step === STATES.ESCOLHA_PLANO && planSelectionView() === PLAN_SELECTION_VIEWS.CATALOG) {
      await showPromotions({ recordUser: false });
      return;
    }
    const previous = BACK_STEPS[session.step];
    if (!previous) {
      await assistant("Não há uma etapa anterior disponível aqui. Você pode continuar ou corrigir o endereço.");
      showControlsForStep();
      return;
    }
    ui.removeSummary?.();
    changeStep(previous);
    if (previous === STATES.NUMERO) session.addressConfirmed = false;
    persist();
    await assistant("Tudo bem, voltamos uma etapa.");
    await askCurrentStep();
  }

  async function offerHumanHandoff() {
    await assistant("Posso encaminhar seu atendimento para nossa equipe.");
    ui.showQuickReplies([{ label: "Seguir com atendente", action: "human-handoff" }]);
  }

  async function openHumanHandoff() {
    const result = whatsappService?.openHandoff?.(session);
    if (result?.mock) {
      await assistant("O atendimento humano pelo WhatsApp está em simulação neste modo de teste.");
    } else {
      await assistant("Abrindo o atendimento com nossa equipe no WhatsApp.");
    }
    showControlsForStep();
  }

  async function handleAiAssistance(question) {
    if (aiInFlight) return;
    const preservedStep = session.step;
    session.flowStep = preservedStep;
    session.conversationMode = "AI_HELP";
    session.ai.lastRoutingDecision = session.ai.lastRoutingDecision || `AI_FALLBACK:${preservedStep}`;
    persist();

    const resume = resumePromptForStep(preservedStep);
    if (config.aiMode !== "openai" || !aiService) {
      logger.info(`${PREFIX} AI unavailable, fallback used`, { step: preservedStep, reason: "disabled" });
      session.conversationMode = "FLOW";
      session.ai.lastIntent = "FALLBACK";
      session.ai.lastSystemAction = "NONE";
      persist();
      await assistant(`Não consegui responder essa dúvida agora, mas podemos continuar sua contratação por aqui. ${resume}`);
      return;
    }

    aiInFlight = true;
    session.ai.calls += 1;
    ui.setComposerEnabled(false);
    ui.setTyping(true);
    const started = Date.now();
    let shouldOfferHuman = false;
    try {
      const result = await aiService.assist(session, question, visiblePlans());
      ui.setTyping(false);
      session.ai.openAiConfigured = result.configured;
      session.ai.lastIntent = result.type;
      session.ai.lastSystemAction = result.systemAction;
      session.ai.latencyMs = result.latencyMs || (Date.now() - started);
      shouldOfferHuman = result.handoffSuggested === true || result.systemAction === "HUMAN_HANDOFF" || result.type === "HUMAN_HANDOFF";
      logger.info(`${PREFIX} AI intent: ${result.type}`, { systemAction: result.systemAction });
      addMessage("assistant", `${result.answer} ${shouldOfferHuman ? "" : resume}`.trim(), { kind: "ai-assist" });
      logger.info(`${PREFIX} AI answered, resuming: ${preservedStep}`);
    } catch (error) {
      ui.setTyping(false);
      session.ai.lastIntent = "FALLBACK";
      session.ai.lastSystemAction = "NONE";
      session.ai.latencyMs = Date.now() - started;
      logger.info(`${PREFIX} AI unavailable, fallback used`, { step: preservedStep, reason: error?.message || "unknown" });
      addMessage("assistant", `Não consegui responder essa dúvida agora, mas podemos continuar sua contratação por aqui. ${resume}`);
    } finally {
      session.step = preservedStep;
      session.flowStep = preservedStep;
      session.conversationMode = "FLOW";
      aiInFlight = false;
      persist();
      if (shouldOfferHuman) {
        ui.showQuickReplies([{ label: "Seguir com atendente", action: "human-handoff" }]);
      } else {
        showControlsForStep();
      }
    }
  }

  function contextFromLocation() {
    const params = new URLSearchParams(location.search);
    const saved = analytics.attribution?.() || {};
    return {
      pageUrl: location.href,
      landingPage: saved.landing_page || location.href,
      referrer: document.referrer || saved.referrer || "",
      userAgent: navigator.userAgent,
      gclid: params.get("gclid") || saved.gclid || "",
      gbraid: params.get("gbraid") || saved.gbraid || "",
      wbraid: params.get("wbraid") || saved.wbraid || "",
      fbclid: params.get("fbclid") || saved.fbclid || "",
      utmSource: params.get("utm_source") || saved.utm_source || "",
      utmMedium: params.get("utm_medium") || saved.utm_medium || "",
      utmCampaign: params.get("utm_campaign") || saved.utm_campaign || "",
      utmContent: params.get("utm_content") || saved.utm_content || "",
      utmTerm: params.get("utm_term") || saved.utm_term || ""
    };
  }

  async function confirm() {
    if (submitting) return;
    if (config.crmMode === "real" && session.cobertura?.source !== "real") {
      await assistant("O envio real ao CRM exige uma consulta de cobertura real e viável. Reinicie o atendimento sem o parâmetro coverage=mock ou use safe=1 para simular.");
      showControlsForStep();
      return;
    }
    submitting = true;
    ui.clearActions();
    ui.setComposerEnabled(false);
    analytics.crmAttempt(session);
    await assistant(config.crmMode === "real" ? "Enviando seu pré-cadastro para a WebTurbo…" : "Gerando a simulação do CRM…", { kind: "status" });
    try {
      const result = await crmService.submit(session, contextFromLocation());
      session.crmPayload = result.payload;
      session.crmResult = {
        ok: result.ok === true,
        created: result.created === true,
        mock: result.mock === true,
        posted: result.posted === true
      };
      persist();
      changeStep(STATES.FINALIZADO);

      if (result.mock) {
        ui.showFinalPayload(result.payload);
        await assistant("Simulação concluída! Nenhuma venda foi criada e nenhum dado foi enviado ao CRM. O payload está disponível no painel de debug.");
        showControlsForStep();
        return;
      }

      analytics.crmSuccess(session, result);
      addMessage("assistant", "Cadastro recebido com sucesso! Sua solicitação foi enviada para nossa equipe de agendamento.");
      ui.showPostSaleSuccess?.();
      showControlsForStep();
    } catch (error) {
      logger.error(`${PREFIX} CRM submission failed`, error);
      analytics.crmError(session, error);
      await assistant(error?.message || "Não foi possível enviar ao CRM. Confira os dados e tente novamente.");
      showControlsForStep();
    } finally {
      submitting = false;
    }
  }

  async function handleText(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || session.step === STATES.CONSULTANDO_COBERTURA || aiInFlight) return;
    addMessage("user", trimmed);

    if (session.step === STATES.CEP && doesNotKnowCep(trimmed)) {
      session.ai.lastRoutingDecision = "LOCAL:CEP_UNKNOWN";
      persist();
      await offerLocation();
      return;
    }

    if (session.step === STATES.COMPLEMENTO && !session.addressConfirmed && wantsConfirmation(trimmed)) {
      session.ai.lastRoutingDecision = "LOCAL:ADDRESS_CONFIRMATION";
      persist();
      await confirmAddress();
      return;
    }

    if (wantsAddressCorrection(trimmed) && session.step !== STATES.CEP) {
      session.ai.lastRoutingDecision = "COMMAND:ADDRESS_CORRECTION";
      persist();
      await correctAddress();
      return;
    }

    const routedStep = session.step;
    const route = router.route(trimmed, { step: routedStep, session, plans: visiblePlans() });
    session.ai.lastRoutingDecision = route.decision;
    persist();

    if (route.kind === ROUTE_KINDS.COMMAND) {
      logger.info(`${PREFIX} Local parser matched: ${route.command}`);
      switch (route.command) {
        case ROUTER_COMMANDS.HANDOFF:
          await offerHumanHandoff();
          return;
        case ROUTER_COMMANDS.RESTART:
          return "restart";
        case ROUTER_COMMANDS.BACK:
          await goBack();
          return;
        case ROUTER_COMMANDS.CHANGE_PLAN:
          if (session.step === STATES.FINALIZADO) {
            await assistant("Este atendimento já foi finalizado. Inicie uma nova contratação para escolher outro plano.");
          } else if (session.plano || session.step === STATES.ESCOLHA_PLANO) {
            ui.removeSummary?.();
            session.planSelectionView = PLAN_SELECTION_VIEWS.PROMOTIONS;
            if (session.step !== STATES.ESCOLHA_PLANO) changeStep(STATES.ESCOLHA_PLANO);
            await assistant("Claro. Escolha uma das condições especiais ou veja mais ofertas:");
            trackPromotionsDisplayed();
          } else {
            await assistant(`A escolha do plano aparece depois da cobertura. ${resumePromptForStep(session.step)}`);
          }
          showControlsForStep();
          return;
        case ROUTER_COMMANDS.MORE_PLANS:
          if (session.step === STATES.ESCOLHA_PLANO) await showMorePlans({ recordUser: false });
          else await assistant(`Os planos serão exibidos depois da consulta de cobertura. ${resumePromptForStep(session.step)}`);
          showControlsForStep();
          return;
        case ROUTER_COMMANDS.SHOW_PROMOTIONS:
          if (session.step === STATES.ESCOLHA_PLANO) await showPromotions({ recordUser: false });
          else await assistant(`As promoções serão exibidas depois da consulta de cobertura. ${resumePromptForStep(session.step)}`);
          showControlsForStep();
          return;
        case ROUTER_COMMANDS.CANCEL:
          await assistant("Tudo bem. O atendimento ficou pausado e você pode retomá-lo quando quiser.");
          showControlsForStep();
          return;
      }
    }

    if (route.kind === ROUTE_KINDS.AI_ONLY) {
      await handleAiAssistance(route.aiText);
      showControlsForStep();
      return;
    }

    const parsedText = route.localText || trimmed;
    const hasAiFollowUp = route.kind === ROUTE_KINDS.MIXED && Boolean(route.aiText);
    let localAccepted = false;
    const completeLocalStep = async () => {
      localAccepted = true;
      logger.info(`${PREFIX} Local parser matched: ${routedStep}`);
      if (!hasAiFollowUp) await askCurrentStep();
    };

    switch (session.step) {
      case STATES.CEP: {
        const cep = extractCep(parsedText);
        if (!isValidCep(cep)) {
          await assistant("Esse CEP parece incompleto. Confira os 8 números e me envie novamente. Se não souber o CEP, use a opção de localização abaixo.");
          break;
        }
        session.cep = cep;
        session.addressSource = "cep";
        session.addressConfirmed = false;
        session.locationAccuracy = null;
        session.coordenadas = "";
        try {
          const address = await addressLookup(cep);
          Object.assign(session, address);
        } catch {
          Object.assign(session, { logradouro: "", bairro: "", cidade: "", uf: "" });
        }
        changeStep(STATES.NUMERO);
        await completeLocalStep();
        break;
      }
      case STATES.NUMERO: {
        const number = extractAddressNumber(parsedText);
        if (!number) {
          await assistant("Não consegui identificar o número. Pode enviar apenas o número do imóvel?");
          break;
        }
        session.numero = number;
        session.addressConfirmed = false;
        changeStep(STATES.COMPLEMENTO);
        await completeLocalStep();
        break;
      }
      case STATES.COMPLEMENTO: {
        if (!session.addressConfirmed) {
          await assistant("Primeiro confira o endereço localizado. Se estiver correto, toque em “Está correto”.");
          showControlsForStep();
          break;
        }
        const complement = extractComplement(parsedText);
        if (!complement) {
          await assistant(session.addressConfirmed
            ? "Se não houver complemento, é só responder “não tenho complemento”."
            : "Primeiro confira o endereço localizado. Se estiver correto, toque em “Está correto”.");
          break;
        }
        session.complemento = complement;
        persist();
        localAccepted = true;
        await consultCoverage();
        break;
      }
      case STATES.COBERTURA_INVIAVEL:
        await assistant("Use uma das opções abaixo para tentar outro endereço.");
        break;
      case STATES.ESCOLHA_PLANO: {
        const plan = selectPlanFromText(parsedText, visiblePlans());
        if (!plan) {
          await assistant("Não consegui identificar esse plano. Toque em um card ou diga a velocidade, como “quero 500 mega”.");
          showControlsForStep();
          break;
        }
        session.plano = plan;
        session.faturamento = null;
        session.crmPayload = null;
        logger.info(`${PREFIX} Plan selected: ${plan.id}`);
        if (isPromotionalPlan(plan)) {
          trackPlanEvent("cobertura_oferta_combate_selecionada", { plano: plan.id, valor: plan.price });
        }
        changeStep(STATES.NOME);
        await assistant(`Boa escolha: ${plan.title} por ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}/mês.`);
        await completeLocalStep();
        break;
      }
      case STATES.NOME: {
        const name = extractName(parsedText);
        if (!isValidName(name)) {
          await assistant("Preciso do seu nome e sobrenome. Pode conferir e enviar novamente?");
          break;
        }
        session.nome = name;
        changeStep(STATES.CPF);
        await completeLocalStep();
        break;
      }
      case STATES.CPF: {
        const cpf = extractCpf(parsedText);
        if (!isValidCpf(cpf)) {
          await assistant("Esse CPF parece inválido ou incompleto. Confira os números e me envie novamente.");
          break;
        }
        session.cpf = cpf;
        logger.info(`${PREFIX} CPF validated: ${maskCpf(cpf)}`);
        changeStep(STATES.DATA_NASCIMENTO);
        await completeLocalStep();
        break;
      }
      case STATES.DATA_NASCIMENTO: {
        const birthDate = parseBirthDate(extractBirthDate(parsedText));
        if (!birthDate.valid) {
          await assistant("Não consegui validar essa data. Envie no formato DD/MM/AAAA.");
          break;
        }
        session.dataNascimento = birthDate.iso;
        changeStep(STATES.EMAIL);
        await completeLocalStep();
        break;
      }
      case STATES.EMAIL: {
        const email = extractEmail(parsedText);
        if (!isValidEmail(email)) {
          await assistant("Esse e-mail parece incompleto. Confira, por exemplo: nome@email.com.");
          break;
        }
        session.email = email;
        changeStep(STATES.TELEFONE);
        await completeLocalStep();
        break;
      }
      case STATES.TELEFONE: {
        const phone = extractPhone(parsedText);
        if (!isValidPhone(phone)) {
          await assistant("Esse telefone parece incompleto. Envie o DDD e o número com 10 ou 11 dígitos.");
          break;
        }
        session.telefone = phone;
        changeStep(STATES.TELEFONE_SECUNDARIO);
        await completeLocalStep();
        break;
      }
      case STATES.TELEFONE_SECUNDARIO: {
        const phone = extractPhone(parsedText);
        if (!isValidPhone(phone)) {
          await assistant("Esse segundo telefone parece incompleto. Envie o DDD e o número com 10 ou 11 dígitos.");
          break;
        }
        if (phone === session.telefone) {
          await assistant("O segundo contato precisa ser diferente do telefone principal. Pode informar outro número?");
          break;
        }
        session.telefoneSecundario = phone;
        if (session.cobertura?.source === "real" || config.conversionMode !== "real") {
          analytics.personalLead(session);
        }
        persist();
        changeStep(STATES.VENCIMENTO);
        await completeLocalStep();
        break;
      }
      case STATES.VENCIMENTO: {
        const digits = onlyDigits(parsedText);
        const dueDay = digits.length === 1 ? `0${digits}` : digits.slice(-2);
        if (!DUE_DATE_OPTIONS.includes(dueDay)) {
          await assistant("Os vencimentos disponíveis são nos dias 05, 10, 15, 20 ou 25. Escolha uma dessas opções.");
          break;
        }
        session.diaVencimentoFatura = dueDay;
        changeStep(STATES.DATA_INSTALACAO);
        await completeLocalStep();
        break;
      }
      case STATES.DATA_INSTALACAO: {
        const installationDate = parseInstallationDate(parsedText);
        if (!installationDate.valid) {
          const message = installationDate.reason === "past"
            ? `A instalação deve ser a partir de ${tomorrowISO().split("-").reverse().join("/")}. Escolha outra data.`
            : "Não consegui validar a data. Envie no formato DD/MM/AAAA ou use o seletor abaixo.";
          await assistant(message);
          break;
        }
        session.dataInstalacao = installationDate.iso;
        changeStep(STATES.TURNO_INSTALACAO);
        await completeLocalStep();
        break;
      }
      case STATES.TURNO_INSTALACAO: {
        const normalized = String(parsedText).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const shift = normalized.includes("manha") ? "Manhã" : normalized.includes("tarde") ? "Tarde" : "";
        if (!shift) {
          await assistant("Os turnos disponíveis são manhã ou tarde. Qual você prefere?");
          break;
        }
        session.turnoInstalacao = shift;
        session.faturamento = calculateBillingSummary(session.plano?.price, session.diaVencimentoFatura);
        changeStep(STATES.CONFIRMACAO);
        ui.showSummary(session);
        await completeLocalStep();
        break;
      }
      case STATES.CONFIRMACAO:
        if (wantsConfirmation(parsedText)) await confirm();
        else await assistant("Para finalizar a simulação, toque em “Confirmar contratação” ou digite “confirmar”.");
        break;
      case STATES.FINALIZADO:
        break;
      default:
        await assistant("Vamos continuar de onde paramos.");
    }
    if (hasAiFollowUp && localAccepted) await handleAiAssistance(route.aiText);
    showControlsForStep();
  }

  async function handleAction(action, value) {
    if (aiInFlight) return;
    if (action === "offer-location") return offerLocation({ recordUser: true });
    if (action === "use-location") return captureLocation();
    if (action === "enter-cep") {
      await assistant("Tudo bem. Digite o CEP com 8 números.");
      showControlsForStep();
      return;
    }
    if (action === "confirm-address") return confirmAddress({ recordUser: true });
    if (action === "no-complement") return handleText("não tenho complemento");
    if (action === "new-address") return correctAddress();
    if (action === "fix-number") {
      Object.assign(session, {
        numero: "",
        complemento: "",
        addressConfirmed: false,
        cobertura: null,
        plano: null,
        crmPayload: null
      });
      changeStep(STATES.NUMERO);
      await askCurrentStep();
      return;
    }
    if (action === "select-plan") {
      const plan = visiblePlans().find((item) => item.id === value);
      if (plan) await choosePlan(plan);
      return;
    }
    if (action === "show-more-plans") return showMorePlans();
    if (action === "show-promotions") return showPromotions();
    if (["select-due-date", "select-installation-date", "select-shift"].includes(action)) {
      return handleText(value);
    }
    if (action === "human-handoff") return openHumanHandoff();
    if (action === "change-plan") {
      ui.removeSummary?.();
      session.planSelectionView = PLAN_SELECTION_VIEWS.PROMOTIONS;
      changeStep(STATES.ESCOLHA_PLANO);
      await assistant("Claro. Escolha uma das condições especiais ou veja mais ofertas:");
      trackPromotionsDisplayed();
      showControlsForStep();
      return;
    }
    if (action === "confirm") {
      addMessage("user", "Confirmar contratação");
      return confirm();
    }
    if (action === "restart") return "restart";
  }

  return { start, resume, handleText, handleAction, getSession: () => session };
}
