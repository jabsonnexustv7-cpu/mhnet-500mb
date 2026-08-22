export const STATES = Object.freeze({
  WELCOME: "WELCOME",
  CEP: "CEP",
  NUMERO: "NUMERO",
  COMPLEMENTO: "COMPLEMENTO",
  CONSULTANDO_COBERTURA: "CONSULTANDO_COBERTURA",
  COBERTURA_INVIAVEL: "COBERTURA_INVIAVEL",
  COBERTURA_VIAVEL: "COBERTURA_VIAVEL",
  ESCOLHA_PLANO: "ESCOLHA_PLANO",
  NOME: "NOME",
  CPF: "CPF",
  DATA_NASCIMENTO: "DATA_NASCIMENTO",
  EMAIL: "EMAIL",
  TELEFONE: "TELEFONE",
  TELEFONE_SECUNDARIO: "TELEFONE_SECUNDARIO",
  VENCIMENTO: "VENCIMENTO",
  DATA_INSTALACAO: "DATA_INSTALACAO",
  TURNO_INSTALACAO: "TURNO_INSTALACAO",
  CONFIRMACAO: "CONFIRMACAO",
  FINALIZADO: "FINALIZADO"
});

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const ALLOWED_TRANSITIONS = {
  [STATES.WELCOME]: [STATES.CEP],
  [STATES.CEP]: [STATES.NUMERO],
  [STATES.NUMERO]: [STATES.COMPLEMENTO, STATES.CEP],
  [STATES.COMPLEMENTO]: [STATES.CONSULTANDO_COBERTURA, STATES.CEP, STATES.NUMERO],
  [STATES.CONSULTANDO_COBERTURA]: [STATES.COBERTURA_VIAVEL, STATES.COBERTURA_INVIAVEL, STATES.COMPLEMENTO],
  [STATES.COBERTURA_INVIAVEL]: [STATES.CEP, STATES.NUMERO],
  [STATES.COBERTURA_VIAVEL]: [STATES.ESCOLHA_PLANO, STATES.CEP],
  [STATES.ESCOLHA_PLANO]: [STATES.NOME, STATES.CEP],
  [STATES.NOME]: [STATES.CPF, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.CPF]: [STATES.DATA_NASCIMENTO, STATES.NOME, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.DATA_NASCIMENTO]: [STATES.EMAIL, STATES.CPF, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.EMAIL]: [STATES.TELEFONE, STATES.DATA_NASCIMENTO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.TELEFONE]: [STATES.TELEFONE_SECUNDARIO, STATES.EMAIL, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.TELEFONE_SECUNDARIO]: [STATES.VENCIMENTO, STATES.TELEFONE, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.VENCIMENTO]: [STATES.DATA_INSTALACAO, STATES.TELEFONE_SECUNDARIO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.DATA_INSTALACAO]: [STATES.TURNO_INSTALACAO, STATES.VENCIMENTO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.TURNO_INSTALACAO]: [STATES.CONFIRMACAO, STATES.DATA_INSTALACAO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.CONFIRMACAO]: [STATES.FINALIZADO, STATES.TURNO_INSTALACAO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.FINALIZADO]: [STATES.CEP]
};

export function createSession(
  idFactory = () => globalThis.crypto?.randomUUID?.() || `wt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  now = Date.now()
) {
  const createdAt = new Date(now).toISOString();
  return {
    sessionId: idFactory(),
    step: STATES.WELCOME,
    flowStep: STATES.WELCOME,
    conversationMode: "FLOW",
    cep: "",
    numero: "",
    complemento: "",
    logradouro: "",
    bairro: "",
    cidade: "",
    uf: "",
    coordenadas: "",
    addressSource: "",
    addressConfirmed: false,
    locationAccuracy: null,
    cobertura: null,
    plano: null,
    planSelectionView: "promotions",
    nome: "",
    cpf: "",
    dataNascimento: "",
    email: "",
    telefone: "",
    telefoneSecundario: "",
    diaVencimentoFatura: "",
    dataInstalacao: "",
    turnoInstalacao: "",
    faturamento: null,
    leadEventId: "",
    messages: [],
    crmPayload: null,
    crmResult: null,
    ai: {
      openAiConfigured: null,
      calls: 0,
      lastRoutingDecision: "",
      lastIntent: "",
      lastSystemAction: "NONE",
      latencyMs: 0
    },
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
}

export function transition(session, nextStep) {
  if (!ALLOWED_TRANSITIONS[session.step]?.includes(nextStep)) {
    throw new Error(`Transição inválida: ${session.step} -> ${nextStep}`);
  }
  const previous = session.step;
  session.step = nextStep;
  session.flowStep = nextStep;
  session.conversationMode = "FLOW";
  session.updatedAt = new Date().toISOString();
  return { previous, next: nextStep };
}

export function clearAddress(session) {
  Object.assign(session, {
    cep: "",
    numero: "",
    complemento: "",
    logradouro: "",
    bairro: "",
    cidade: "",
    uf: "",
    coordenadas: "",
    addressSource: "",
    addressConfirmed: false,
    locationAccuracy: null,
    cobertura: null,
    plano: null,
    planSelectionView: "promotions",
    crmPayload: null
  });
  return session;
}

export function saveSession(session, storage, key, now = Date.now()) {
  session.updatedAt = new Date(now).toISOString();
  session.expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  storage.setItem(key, JSON.stringify(session));
}

export function loadSession(storage, key, now = Date.now()) {
  try {
    const parsed = JSON.parse(storage.getItem(key));
    if (!parsed?.sessionId || !parsed?.step) return null;
    const reference = Date.parse(parsed.updatedAt || parsed.createdAt || "");
    const expiresAt = Date.parse(parsed.expiresAt || "");
    const effectiveExpiry = Number.isFinite(expiresAt)
      ? expiresAt
      : (Number.isFinite(reference) ? reference + SESSION_TTL_MS : 0);
    if (!effectiveExpiry || now >= effectiveExpiry) {
      storage.removeItem(key);
      return null;
    }
    parsed.expiresAt = new Date(effectiveExpiry).toISOString();
    parsed.flowStep = parsed.step;
    parsed.conversationMode = parsed.conversationMode === "AI_HELP" ? "FLOW" : (parsed.conversationMode || "FLOW");
    parsed.addressSource = parsed.addressSource || "";
    parsed.addressConfirmed = parsed.addressConfirmed === true;
    parsed.locationAccuracy = Number.isFinite(parsed.locationAccuracy) ? parsed.locationAccuracy : null;
    parsed.ai = {
      openAiConfigured: null,
      calls: 0,
      lastRoutingDecision: "",
      lastIntent: "",
      lastSystemAction: "NONE",
      latencyMs: 0,
      ...(parsed.ai || {})
    };
    return parsed;
  } catch {
    return null;
  }
}

export function resetSession(storage, key, idFactory) {
  storage.removeItem(key);
  return createSession(idFactory);
}

export { ALLOWED_TRANSITIONS };
