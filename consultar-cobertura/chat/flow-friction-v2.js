import { createChatFlow as createBaseChatFlow } from "./flow.js?v=9";
import { extractBirthDate, extractCpf, extractName } from "./parser.js?v=9";
import { DUE_DATE_OPTIONS, calculateBillingSummary } from "./billing.js?v=10";
import { getPlansForCity, getPromotionalPlans, PLAN_SELECTION_VIEWS } from "./plans.js?v=9";
import { saveSession, STATES } from "./state.js?v=9";
import { isValidCpf, isValidName, onlyDigits, parseBirthDate } from "./validators.js?v=9";

const CPF_ENDPOINT = "https://vocal-lokum-ee03a5.netlify.app/.netlify/functions/consulta";
const CPF_TIMEOUT_MS = 9000;

function formatBirth(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(iso || "");
}

function normalizeCpfResponse(data) {
  const r = data?.result || data?.resultado || {};
  const rawBirth = String(r.dataDeNascimento || r.data_de_nascimento || "").trim();
  const parsed = rawBirth ? parseBirthDate(rawBirth) : { valid: false, iso: "" };
  return {
    nome: String(r.nomeCompleto || r.nome || "").trim(),
    dataNascimento: parsed.valid ? parsed.iso : ""
  };
}

async function lookupCpfData(cpf) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CPF_TIMEOUT_MS);
  try {
    const url = `${CPF_ENDPOINT}?mode=completa&cpf=${encodeURIComponent(onlyDigits(cpf))}`;
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || data?.message || `http_${response.status}`);
    return normalizeCpfResponse(data);
  } finally {
    clearTimeout(timer);
  }
}

export function createChatFlow(args) {
  const base = createBaseChatFlow(args);
  const { session, storage, config, ui, crmService, tracking, logger = console } = args;
  let submitting = false;

  function persist() {
    session.flowStep = session.step;
    session.conversationMode = "FLOW";
    saveSession(session, storage, config.storageKey);
    ui.updateDebug?.(session, config);
  }

  function setStep(step) {
    session.step = step;
    persist();
  }

  function addMessage(role, text, meta = {}) {
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      text,
      meta,
      at: new Date().toISOString()
    };
    session.messages ||= [];
    session.messages.push(message);
    ui.addMessage(message);
    persist();
  }

  function removeLastAssistantPrompt(pattern) {
    const messages = session.messages || [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role !== "assistant") continue;
      if (!pattern.test(String(messages[i].text || ""))) return;
      messages.splice(i, 1);
      const rows = document.querySelectorAll("#chat-messages .message-row--assistant");
      rows[rows.length - 1]?.remove();
      persist();
      return;
    }
  }

  function showIdentityConfirmation() {
    ui.clearActions();
    addMessage("assistant", `Localizei seus dados cadastrais.\n\nNome: ${session.nome}\nNascimento: ${formatBirth(session.dataNascimento)}\n\nConfira os dados. Você pode continuar ou editar se necessário.`, { kind: "cpf-identity" });
    ui.showQuickReplies([
      { label: "Continuar", action: "identity-continue" },
      { label: "Editar nome", action: "identity-edit-name" },
      { label: "Editar nascimento", action: "identity-edit-birth" }
    ]);
    ui.setPlaceholder("Confira os dados acima");
  }

  function showEmailPrompt() {
    setStep(STATES.EMAIL);
    addMessage("assistant", "Qual é o seu melhor e-mail?");
    ui.clearActions();
    ui.setPlaceholder("seuemail@exemplo.com");
  }

  function showBirthPrompt(prefix = "") {
    setStep(STATES.DATA_NASCIMENTO);
    addMessage("assistant", `${prefix ? `${prefix} ` : ""}Qual é sua data de nascimento? Use DD/MM/AAAA.`.trim());
    ui.clearActions();
    ui.setPlaceholder("DD/MM/AAAA");
  }

  function showNamePrompt(prefix = "") {
    setStep(STATES.NOME);
    addMessage("assistant", `${prefix ? `${prefix} ` : ""}Qual é seu nome completo?`.trim());
    ui.clearActions();
    ui.setPlaceholder("Seu nome completo");
  }

  function showOptionalSecondPhone() {
    removeLastAssistantPrompt(/segundo telefone|segundo contato/i);
    addMessage("assistant", "Se quiser, informe um segundo telefone com DDD. Esse campo é opcional.");
    ui.showQuickReplies([{ label: "Continuar sem segundo telefone", action: "skip-secondary-phone" }]);
    ui.setPlaceholder("Segundo telefone (opcional)");
  }

  function trackPersonalLead() {
    if (session.cobertura?.source === "real" || config.conversionMode !== "real") {
      tracking?.personalLead?.(session);
    }
  }

  function showDueDates() {
    setStep(STATES.VENCIMENTO);
    addMessage("assistant", "Escolha o dia de vencimento da sua fatura.");
    ui.showQuickReplies(DUE_DATE_OPTIONS.map((day) => ({ label: `Dia ${day}`, action: "select-due-date", value: day })));
    ui.setPlaceholder("Ex.: dia 10");
  }

  function contextFromLocation() {
    const currentLocation = globalThis.location || { href: "", search: "" };
    const currentDocument = globalThis.document || { referrer: "" };
    const currentNavigator = globalThis.navigator || { userAgent: "" };
    const params = new URLSearchParams(currentLocation.search || "");
    const saved = tracking?.attribution?.() || {};
    return {
      pageUrl: currentLocation.href || "",
      landingPage: saved.landing_page || currentLocation.href || "",
      referrer: currentDocument.referrer || saved.referrer || "",
      userAgent: currentNavigator.userAgent || "",
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

  async function submitDirect() {
    if (submitting) return;
    if (config.crmMode === "real" && session.cobertura?.source !== "real") {
      addMessage("assistant", "O envio ao CRM exige uma consulta de cobertura real e viável.");
      showDueDates();
      return;
    }

    submitting = true;
    ui.clearActions();
    ui.setComposerEnabled(false);
    tracking?.crmAttempt?.(session);
    addMessage("assistant", config.crmMode === "real" ? "Enviando seu pedido para a WebTurbo…" : "Gerando a simulação do CRM…", { kind: "status" });

    try {
      session.dataInstalacao = "";
      session.turnoInstalacao = "";
      session.faturamento = calculateBillingSummary(session.plano?.price, session.diaVencimentoFatura);
      const result = await crmService.submit(session, contextFromLocation());
      session.crmPayload = result.payload;
      session.crmResult = {
        ok: result.ok === true,
        created: result.created === true,
        mock: result.mock === true,
        posted: result.posted === true
      };
      setStep(STATES.FINALIZADO);

      if (result.mock) {
        ui.showFinalPayload?.(result.payload);
        addMessage("assistant", "Simulação concluída. Nenhum dado foi enviado ao CRM.");
        return;
      }

      tracking?.crmSuccess?.(session, result);
      addMessage("assistant", "Cadastro recebido com sucesso! Sua solicitação foi enviada para nossa equipe de agendamento.");
      ui.showPostSaleSuccess?.();
    } catch (error) {
      logger.error("[WEBTURBO CHAT] Direct CRM submission failed", error);
      tracking?.crmError?.(session, error);
      addMessage("assistant", error?.message || "Não foi possível enviar ao CRM. Tente novamente.");
      showDueDates();
    } finally {
      submitting = false;
      if (session.step !== STATES.FINALIZADO) ui.setComposerEnabled(true);
    }
  }

  async function handleCpfText(text) {
    addMessage("user", String(text || "").trim());
    const cpf = extractCpf(text);
    if (!isValidCpf(cpf)) {
      addMessage("assistant", "Esse CPF parece inválido ou incompleto. Confira os números e me envie novamente.");
      ui.setPlaceholder("Seu CPF");
      return;
    }

    session.cpf = cpf;
    session.nome = "";
    session.dataNascimento = "";
    persist();
    ui.clearActions();
    ui.setComposerEnabled(false);
    addMessage("assistant", "Buscando seus dados pelo CPF…", { kind: "status" });
    try {
      const result = await lookupCpfData(cpf);
      session.nome = result.nome || "";
      session.dataNascimento = result.dataNascimento || "";
      persist();
      try { tracking?.ga4?.("cpf_dados_localizados_chat", { nome: session.nome ? "sim" : "nao", nascimento: session.dataNascimento ? "sim" : "nao" }); } catch (_) {}

      if (session.nome && session.dataNascimento) {
        setStep(STATES.EMAIL);
        showIdentityConfirmation();
      } else if (session.nome) {
        showBirthPrompt("Localizei seu nome, mas não encontrei a data de nascimento.");
      } else if (session.dataNascimento) {
        showNamePrompt("Localizei sua data de nascimento, mas não encontrei seu nome.");
      } else {
        showNamePrompt("Não consegui completar seus dados automaticamente.");
      }
    } catch (error) {
      logger.warn("[WEBTURBO CHAT] CPF lookup unavailable", error?.message || error);
      try { tracking?.ga4?.("cpf_consulta_falhou_chat", { motivo: error?.name === "AbortError" ? "timeout" : "erro" }); } catch (_) {}
      showNamePrompt("Não consegui completar seus dados automaticamente.");
    } finally {
      ui.setComposerEnabled(true);
    }
  }

  async function handleNameText(text) {
    addMessage("user", String(text || "").trim());
    const name = extractName(text);
    if (!isValidName(name)) {
      addMessage("assistant", "Preciso do seu nome e sobrenome. Pode conferir e enviar novamente?");
      return;
    }
    session.nome = name;
    persist();
    if (session.identityEditMode === "name") {
      session.identityEditMode = "";
      persist();
      showIdentityConfirmation();
      return;
    }
    if (session.dataNascimento) showEmailPrompt();
    else showBirthPrompt();
  }

  async function handleBirthText(text) {
    addMessage("user", String(text || "").trim());
    const birthDate = parseBirthDate(extractBirthDate(text));
    if (!birthDate.valid) {
      addMessage("assistant", "Não consegui validar essa data. Envie no formato DD/MM/AAAA.");
      return;
    }
    session.dataNascimento = birthDate.iso;
    persist();
    if (session.identityEditMode === "birth") {
      session.identityEditMode = "";
      persist();
      showIdentityConfirmation();
      return;
    }
    showEmailPrompt();
  }

  async function handleDueText(text, { recordUser = true } = {}) {
    if (recordUser) addMessage("user", String(text || "").trim());
    const raw = onlyDigits(text);
    const day = raw.length === 1 ? `0${raw}` : raw.slice(-2);
    if (!DUE_DATE_OPTIONS.includes(day)) {
      addMessage("assistant", `Os vencimentos disponíveis são nos dias ${DUE_DATE_OPTIONS.join(", ")}. Escolha uma dessas opções.`);
      ui.showQuickReplies(DUE_DATE_OPTIONS.map((item) => ({ label: `Dia ${item}`, action: "select-due-date", value: item })));
      return;
    }
    session.diaVencimentoFatura = day;
    persist();
    await submitDirect();
  }

  async function postProcess(previousStep) {
    if (previousStep === STATES.ESCOLHA_PLANO && session.step === STATES.NOME) {
      removeLastAssistantPrompt(/nome completo/i);
      setStep(STATES.CPF);
      addMessage("assistant", "Para continuar, informe seu CPF. Vamos localizar nome e data de nascimento automaticamente quando estiverem disponíveis.");
      ui.setPlaceholder("Seu CPF");
      return;
    }

    if (previousStep === STATES.TELEFONE && session.step === STATES.TELEFONE_SECUNDARIO) {
      showOptionalSecondPhone();
    }
  }

  return {
    ...base,
    async handleText(text) {
      const previousStep = session.step;
      if (previousStep === STATES.CPF) return handleCpfText(text);
      if (previousStep === STATES.NOME) return handleNameText(text);
      if (previousStep === STATES.DATA_NASCIMENTO) return handleBirthText(text);
      if (previousStep === STATES.VENCIMENTO) return handleDueText(text);

      const result = await base.handleText(text);
      await postProcess(previousStep);
      return result;
    },

    async handleAction(action, value) {
      const previousStep = session.step;

      if (action === "identity-continue") {
        addMessage("user", "Continuar");
        showEmailPrompt();
        return;
      }
      if (action === "identity-edit-name") {
        addMessage("user", "Editar nome");
        session.identityEditMode = "name";
        persist();
        showNamePrompt(`O nome atual é ${session.nome}.`);
        return;
      }
      if (action === "identity-edit-birth") {
        addMessage("user", "Editar nascimento");
        session.identityEditMode = "birth";
        persist();
        showBirthPrompt(`A data atual é ${formatBirth(session.dataNascimento)}.`);
        return;
      }
      if (action === "skip-secondary-phone") {
        addMessage("user", "Continuar sem segundo telefone");
        session.telefoneSecundario = "";
        trackPersonalLead();
        persist();
        showDueDates();
        return;
      }
      if (action === "select-due-date") return handleDueText(value, { recordUser: true });

      const result = await base.handleAction(action, value);
      await postProcess(previousStep);
      return result;
    }
  };
}
