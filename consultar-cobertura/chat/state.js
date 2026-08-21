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

const ALLOWED_TRANSITIONS = {
  [STATES.WELCOME]: [STATES.CEP],
  [STATES.CEP]: [STATES.NUMERO],
  [STATES.NUMERO]: [STATES.COMPLEMENTO, STATES.CEP],
  [STATES.COMPLEMENTO]: [STATES.CONSULTANDO_COBERTURA, STATES.CEP],
  [STATES.CONSULTANDO_COBERTURA]: [STATES.COBERTURA_VIAVEL, STATES.COBERTURA_INVIAVEL, STATES.COMPLEMENTO],
  [STATES.COBERTURA_INVIAVEL]: [STATES.CEP, STATES.NUMERO],
  [STATES.COBERTURA_VIAVEL]: [STATES.ESCOLHA_PLANO, STATES.CEP],
  [STATES.ESCOLHA_PLANO]: [STATES.NOME, STATES.CEP],
  [STATES.NOME]: [STATES.CPF, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.CPF]: [STATES.DATA_NASCIMENTO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.DATA_NASCIMENTO]: [STATES.EMAIL, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.EMAIL]: [STATES.TELEFONE, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.TELEFONE]: [STATES.TELEFONE_SECUNDARIO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.TELEFONE_SECUNDARIO]: [STATES.VENCIMENTO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.VENCIMENTO]: [STATES.DATA_INSTALACAO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.DATA_INSTALACAO]: [STATES.TURNO_INSTALACAO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.TURNO_INSTALACAO]: [STATES.CONFIRMACAO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.CONFIRMACAO]: [STATES.FINALIZADO, STATES.CEP, STATES.ESCOLHA_PLANO],
  [STATES.FINALIZADO]: [STATES.CEP]
};

export function createSession(idFactory = () => globalThis.crypto?.randomUUID?.() || `wt-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  return {
    sessionId: idFactory(),
    step: STATES.WELCOME,
    cep: "",
    numero: "",
    complemento: "",
    logradouro: "",
    bairro: "",
    cidade: "",
    uf: "",
    coordenadas: "",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function transition(session, nextStep) {
  if (!ALLOWED_TRANSITIONS[session.step]?.includes(nextStep)) {
    throw new Error(`Transição inválida: ${session.step} -> ${nextStep}`);
  }
  const previous = session.step;
  session.step = nextStep;
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
    cobertura: null,
    plano: null,
    planSelectionView: "promotions",
    crmPayload: null
  });
  return session;
}

export function saveSession(session, storage, key) {
  session.updatedAt = new Date().toISOString();
  storage.setItem(key, JSON.stringify(session));
}

export function loadSession(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key));
    return parsed && parsed.sessionId && parsed.step ? parsed : null;
  } catch {
    return null;
  }
}

export function resetSession(storage, key, idFactory) {
  storage.removeItem(key);
  return createSession(idFactory);
}

export { ALLOWED_TRANSITIONS };
