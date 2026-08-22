import { DUE_DATE_OPTIONS, INSTALLATION_SHIFT_OPTIONS, parseInstallationDate } from "./billing.js";
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
  wantsMorePlans
} from "./parser.js";
import { STATES } from "./state.js";
import { isValidCep, isValidCpf, isValidEmail, isValidName, isValidPhone, onlyDigits, parseBirthDate } from "./validators.js";

export const ROUTE_KINDS = Object.freeze({
  LOCAL: "LOCAL",
  LOCAL_INVALID: "LOCAL_INVALID",
  AI_ONLY: "AI_ONLY",
  MIXED: "MIXED",
  COMMAND: "COMMAND"
});

export const ROUTER_COMMANDS = Object.freeze({
  HANDOFF: "HANDOFF",
  BACK: "BACK",
  RESTART: "RESTART",
  CANCEL: "CANCEL",
  CHANGE_PLAN: "CHANGE_PLAN",
  MORE_PLANS: "MORE_PLANS",
  SHOW_PROMOTIONS: "SHOW_PROMOTIONS"
});

function plain(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function commandFromText(text) {
  const normalized = plain(text);
  if (/\b(falar com (alguem|atendente|humano)|quero (um )?(atendente|humano)|whats ?app|atendente humano)\b/.test(normalized)) return ROUTER_COMMANDS.HANDOFF;
  if (/\b(trocar|mudar|alterar|escolher outro)\b.*\b(plano|oferta)\b/.test(normalized)) return ROUTER_COMMANDS.CHANGE_PLAN;
  if (/\b(voltar|retornar|mostrar|ver)\b.*\b(promocoes?|ofertas especiais)\b/.test(normalized)) return ROUTER_COMMANDS.SHOW_PROMOTIONS;
  if (wantsMorePlans(normalized)) return ROUTER_COMMANDS.MORE_PLANS;
  if (/^(voltar|retornar|etapa anterior)[.!\s]*$/.test(normalized)) return ROUTER_COMMANDS.BACK;
  if (/\b(comecar|iniciar|recomecar)\b.*\b(novamente|de novo|novo atendimento)\b|^reiniciar$/.test(normalized)) return ROUTER_COMMANDS.RESTART;
  if (/^(cancelar|parar|desistir)[.!\s]*$/.test(normalized)) return ROUTER_COMMANDS.CANCEL;
  return "";
}

function containsAssistIntent(text) {
  const normalized = plain(text);
  return /\?|\b(qual|quais|quanto|como|quando|onde|porque|por que|instala|instalacao|gratis|gratuita|fidelidade|caro|barato|duvida|ajuda|seguro|medo|pensar|esposa|jogar|jogos|streaming|aparelhos|wifi|wi-fi|globoplay|ponto extra|funciona|falta muito|internet e fibra|fibra mesmo|nao quero|prefiro nao)\b/.test(normalized);
}

function firstPartBeforeQuestion(text) {
  return String(text || "").split(/[,;]|\b(?:mas|por[eé]m)\b/i)[0].replace(/\?[^]*$/, "").trim();
}

function localCandidate(text, step, plans) {
  const raw = String(text || "");
  switch (step) {
    case STATES.CEP: {
      const match = raw.match(/\b\d{5}[-.\s]?\d{3}\b/);
      const value = extractCep(raw);
      return { matched: isValidCep(value), value, rawMatch: match?.[0] || "" };
    }
    case STATES.NUMERO: {
      const match = raw.match(/(?:^|\b(?:n[uú]mero|n[º°o]?|casa)\s*(?:e|é|:|=)?\s*)(\d{1,7}[a-z]?|s\/?n)\b/i);
      const value = match ? extractAddressNumber(match[0]) : "";
      return { matched: Boolean(value), value, rawMatch: match?.[0] || "" };
    }
    case STATES.COMPLEMENTO: {
      if (containsAssistIntent(raw) && !/[,;]/.test(raw)) return { matched: false, value: "", rawMatch: "" };
      const candidate = containsAssistIntent(raw) ? firstPartBeforeQuestion(raw) : raw;
      const value = extractComplement(candidate);
      return { matched: Boolean(value), value, rawMatch: candidate };
    }
    case STATES.ESCOLHA_PLANO: {
      const candidate = /[,;?]/.test(raw) ? firstPartBeforeQuestion(raw) : raw;
      const plan = selectPlanFromText(candidate, plans);
      return { matched: Boolean(plan), value: candidate, rawMatch: candidate };
    }
    case STATES.NOME: {
      const candidate = containsAssistIntent(raw) ? firstPartBeforeQuestion(raw) : raw;
      const value = extractName(candidate);
      return { matched: isValidName(value), value, rawMatch: candidate };
    }
    case STATES.CPF: {
      const match = raw.match(/(?:\d[.\s-]?){11}/);
      const value = extractCpf(match?.[0] || "");
      return { matched: isValidCpf(value), value, rawMatch: match?.[0] || "" };
    }
    case STATES.DATA_NASCIMENTO: {
      const match = raw.match(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{8}\b|\b\d{4}-\d{2}-\d{2}\b/);
      const parsed = parseBirthDate(extractBirthDate(match?.[0] || ""));
      return { matched: parsed.valid, value: match?.[0] || "", rawMatch: match?.[0] || "" };
    }
    case STATES.EMAIL: {
      const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const value = extractEmail(match?.[0] || "");
      return { matched: isValidEmail(value), value, rawMatch: match?.[0] || "" };
    }
    case STATES.TELEFONE:
    case STATES.TELEFONE_SECUNDARIO: {
      const match = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}/);
      const value = extractPhone(match?.[0] || "");
      return { matched: isValidPhone(value), value, rawMatch: match?.[0] || "" };
    }
    case STATES.VENCIMENTO: {
      const day = onlyDigits(raw).slice(-2).padStart(2, "0");
      return { matched: DUE_DATE_OPTIONS.includes(day), value: day, rawMatch: raw.match(/\b\d{1,2}\b/)?.[0] || "" };
    }
    case STATES.DATA_INSTALACAO: {
      const match = raw.match(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/);
      return { matched: Boolean(match && parseInstallationDate(match[0]).valid), value: match?.[0] || "", rawMatch: match?.[0] || "" };
    }
    case STATES.TURNO_INSTALACAO: {
      const match = plain(raw).match(/\b(manha|tarde)\b/);
      const value = match?.[1] === "manha" ? INSTALLATION_SHIFT_OPTIONS[0] : match?.[1] === "tarde" ? INSTALLATION_SHIFT_OPTIONS[1] : "";
      return { matched: Boolean(value), value, rawMatch: match?.[0] || "" };
    }
    case STATES.CONFIRMACAO:
      return { matched: /^(sim|confirmo|confirmar|pode finalizar|esta certo|tudo certo|ok|fechado)[.!\s]*$/.test(plain(raw)), value: raw, rawMatch: raw };
    default:
      return { matched: false, value: "", rawMatch: "" };
  }
}

function removeLocalPart(text, rawMatch) {
  if (!rawMatch) return String(text || "");
  const index = String(text).toLowerCase().indexOf(String(rawMatch).toLowerCase());
  if (index < 0) return String(text || "");
  return `${String(text).slice(0, index)} ${String(text).slice(index + rawMatch.length)}`
    .replace(/^\s*(?:meu|minha|o|a)?\s*(?:cep|cpf|email|e-mail|telefone|numero|número)?\s*(?:e|é|:|=)?\s*/i, "")
    .replace(/^\s*[,;.!?-]*\s*(?:e|mas|por[eé]m)?\s*/i, "")
    .trim();
}

export function sanitizeForAi(text) {
  return String(text || "")
    .slice(0, 500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[E-MAIL REMOVIDO]")
    .replace(/(?:\d[.\s-]?){11}/g, "[DOCUMENTO REMOVIDO]")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}/g, "[TELEFONE REMOVIDO]")
    .replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g, "[DATA REMOVIDA]")
    .replace(/\b\d{5}[-.\s]?\d{3}\b/g, "[CEP REMOVIDO]")
    .replace(/\b(?:rua|avenida|av\.?|travessa|alameda)\s+[^,;!?]+/gi, "[ENDEREÇO REMOVIDO]")
    .replace(/\b\d{7,}\b/g, "[DADO REMOVIDO]")
    .trim();
}

function looksLikePrivateStageInput(text, step) {
  if (![STATES.NOME, STATES.CPF, STATES.DATA_NASCIMENTO, STATES.EMAIL, STATES.TELEFONE, STATES.TELEFONE_SECUNDARIO].includes(step)) return false;
  if (containsAssistIntent(text)) return /@|\d{6,}/.test(String(text || ""));
  return true;
}

function looksLikeStructuredStageAttempt(text, step) {
  if (containsAssistIntent(text)) return false;
  if ([STATES.CEP, STATES.NUMERO, STATES.VENCIMENTO, STATES.DATA_INSTALACAO].includes(step)) return /\d/.test(String(text || ""));
  if (step === STATES.TURNO_INSTALACAO) return /\b(manha|tarde|noite)\b/.test(plain(text));
  return false;
}

export function routeMessage(text, { step, plans = [] } = {}) {
  const message = String(text || "").trim().slice(0, 500);
  const command = commandFromText(message);
  if (command) return { kind: ROUTE_KINDS.COMMAND, command, localText: message, aiText: "", decision: `COMMAND:${command}` };

  const local = localCandidate(message, step, plans);
  const assistIntent = containsAssistIntent(message);
  const remainder = sanitizeForAi(removeLocalPart(message, local.rawMatch));

  if (local.matched && assistIntent && remainder && containsAssistIntent(remainder)) {
    return { kind: ROUTE_KINDS.MIXED, localText: local.value, aiText: remainder, decision: `MIXED:${step}` };
  }
  if (local.matched) return { kind: ROUTE_KINDS.LOCAL, localText: local.value, aiText: "", decision: `LOCAL:${step}` };
  if (looksLikePrivateStageInput(message, step) || looksLikeStructuredStageAttempt(message, step)) {
    return { kind: ROUTE_KINDS.LOCAL_INVALID, localText: message, aiText: "", decision: `LOCAL_PRIVATE_INVALID:${step}` };
  }
  return { kind: ROUTE_KINDS.AI_ONLY, localText: "", aiText: sanitizeForAi(message), decision: `AI_FALLBACK:${step}` };
}
