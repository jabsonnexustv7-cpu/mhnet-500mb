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
import { getPlansForCity } from "./plans.js";
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

export function createChatFlow({ session, config, storage, ui, coverageService, crmService, interpreter, addressLookup, logger = console }) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      [STATES.COMPLEMENTO]: "Complemento ou 'não tenho'",
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

    if (session.step === STATES.COMPLEMENTO) {
      ui.showQuickReplies([{ label: "Não tenho complemento", action: "no-complement" }]);
    } else if (session.step === STATES.COBERTURA_INVIAVEL) {
      ui.showQuickReplies([
        { label: "Fazer nova consulta", action: "new-address" },
        { label: "Corrigir número", action: "fix-number" }
      ]);
    } else if (session.step === STATES.ESCOLHA_PLANO) {
      ui.showPlans(getPlansForCity(session.cidade));
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
    const prompts = {
      [STATES.CEP]: "Para começar, qual é o seu CEP?",
      [STATES.NUMERO]: `Encontrei ${session.cidade ? `${session.cidade}/${session.uf}` : "a região"}. Qual é o número do imóvel?`,
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
      addMessage("assistant", "A consulta foi interrompida pelo recarregamento. Envie o complemento novamente para continuar.");
    }
    if (session.step === STATES.COBERTURA_VIAVEL) changeStep(STATES.ESCOLHA_PLANO);
    ui.updateDebug(session, config);
    if (session.step === STATES.CONFIRMACAO) ui.showSummary(session);
    if (session.step === STATES.FINALIZADO && session.crmPayload) ui.showFinalPayload(session.crmPayload);
    showControlsForStep();
  }

  async function correctAddress() {
    ui.removeSummary?.();
    clearAddress(session);
    if (session.step !== STATES.CEP) changeStep(STATES.CEP);
    await assistant("Sem problema. Vamos corrigir o endereço desde o começo.");
    await askCurrentStep();
  }

  async function consultCoverage() {
    changeStep(STATES.CONSULTANDO_COBERTURA);
    ui.setComposerEnabled(false);
    await assistant("Só um instante enquanto consulto a disponibilidade de fibra…", { kind: "status" });
    try {
      const coverage = await coverageService.check(session);
      session.cobertura = coverage;
      session.coordenadas = coverage.coords || "";
      logger.info(`${PREFIX} Coverage result: ${coverage.status}`, { source: coverage.source, motivo: coverage.motivo });
      changeStep(coverage.viavel ? STATES.COBERTURA_VIAVEL : STATES.COBERTURA_INVIAVEL);
      if (!coverage.viavel) {
        await assistant("Neste endereço ainda não encontramos cobertura disponível.");
        showControlsForStep();
        return;
      }
      await assistant("Ótima notícia! Temos fibra disponível no seu endereço. 🎉");
      changeStep(STATES.ESCOLHA_PLANO);
      await assistant("Estes são os planos disponíveis. Você pode tocar em um card ou escrever, por exemplo, “quero o mais barato”.");
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
    addMessage("user", `Quero o plano ${plan.title}.`, { planId: plan.id });
    changeStep(STATES.NOME);
    await assistant(`Boa escolha: ${plan.title} por ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}/mês.`);
    await askCurrentStep();
  }

  function contextFromLocation() {
    const params = new URLSearchParams(location.search);
    return {
      pageUrl: location.href,
      landingPage: location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      gclid: params.get("gclid") || "",
      gbraid: params.get("gbraid") || "",
      wbraid: params.get("wbraid") || "",
      fbclid: params.get("fbclid") || "",
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmContent: params.get("utm_content") || "",
      utmTerm: params.get("utm_term") || ""
    };
  }

  async function confirm() {
    const result = await crmService.submit(session, contextFromLocation());
    session.crmPayload = result.payload;
    persist();
    changeStep(STATES.FINALIZADO);
    ui.showFinalPayload(result.payload);
    await assistant("Simulação concluída! Nenhuma venda foi criada e nenhum dado foi enviado ao CRM. O payload está disponível no painel de debug.");
    showControlsForStep();
  }

  async function handleText(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || session.step === STATES.CONSULTANDO_COBERTURA) return;
    addMessage("user", trimmed);

    if (wantsAddressCorrection(trimmed) && session.step !== STATES.CEP) {
      await correctAddress();
      return;
    }

    let parsedText = trimmed;
    if (interpreter) {
      try {
        const interpretation = await interpreter.interpret(trimmed, { step: session.step, session });
        if (interpretation?.normalizedText) parsedText = interpretation.normalizedText;
      } catch {
        // O parser local continua sendo a fonte de verdade do MVP.
      }
    }

    switch (session.step) {
      case STATES.CEP: {
        const cep = extractCep(parsedText);
        if (!isValidCep(cep)) {
          await assistant("Esse CEP parece incompleto. Confira os 8 números e me envie novamente.");
          break;
        }
        session.cep = cep;
        try {
          const address = await addressLookup(cep);
          Object.assign(session, address);
        } catch {
          Object.assign(session, { logradouro: "", bairro: "", cidade: "", uf: "" });
        }
        changeStep(STATES.NUMERO);
        await askCurrentStep();
        break;
      }
      case STATES.NUMERO: {
        const number = extractAddressNumber(parsedText);
        if (!number) {
          await assistant("Não consegui identificar o número. Pode enviar apenas o número do imóvel?");
          break;
        }
        session.numero = number;
        changeStep(STATES.COMPLEMENTO);
        await askCurrentStep();
        break;
      }
      case STATES.COMPLEMENTO: {
        const complement = extractComplement(parsedText);
        if (!complement) {
          await assistant("Se não houver complemento, é só responder “não tenho complemento”.");
          break;
        }
        session.complemento = complement;
        await consultCoverage();
        break;
      }
      case STATES.COBERTURA_INVIAVEL:
        await assistant("Use uma das opções abaixo para tentar outro endereço.");
        break;
      case STATES.ESCOLHA_PLANO: {
        const plan = selectPlanFromText(parsedText, getPlansForCity(session.cidade));
        if (!plan) {
          await assistant("Não consegui identificar esse plano. Toque em um card ou diga a velocidade, como “quero 500 mega”.");
          showControlsForStep();
          break;
        }
        // A mensagem digitada já foi registrada; evita duplicar como acontece no clique.
        session.plano = plan;
        session.faturamento = null;
        session.crmPayload = null;
        logger.info(`${PREFIX} Plan selected: ${plan.id}`);
        changeStep(STATES.NOME);
        await assistant(`Boa escolha: ${plan.title} por ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}/mês.`);
        await askCurrentStep();
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
        await askCurrentStep();
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
        await askCurrentStep();
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
        await askCurrentStep();
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
        await askCurrentStep();
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
        await askCurrentStep();
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
        changeStep(STATES.VENCIMENTO);
        await askCurrentStep();
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
        await askCurrentStep();
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
        await askCurrentStep();
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
        await askCurrentStep();
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
    showControlsForStep();
  }

  async function handleAction(action, value) {
    if (action === "no-complement") return handleText("não tenho complemento");
    if (action === "new-address") return correctAddress();
    if (action === "fix-number") {
      Object.assign(session, {
        numero: "",
        complemento: "",
        coordenadas: "",
        cobertura: null,
        plano: null,
        crmPayload: null
      });
      changeStep(STATES.NUMERO);
      await askCurrentStep();
      return;
    }
    if (action === "select-plan") {
      const plan = getPlansForCity(session.cidade).find((item) => item.id === value);
      if (plan) await choosePlan(plan);
      return;
    }
    if (["select-due-date", "select-installation-date", "select-shift"].includes(action)) {
      return handleText(value);
    }
    if (action === "change-plan") {
      ui.removeSummary?.();
      changeStep(STATES.ESCOLHA_PLANO);
      await assistant("Claro. Escolha outro plano:");
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
