import { STATES } from "./state.js?v=9";
import { getPlansForCity, getPromotionalPlans } from "./plans.js?v=9";

const STEP_ORDER = [
  STATES.WELCOME,
  STATES.CEP,
  STATES.NUMERO,
  STATES.COMPLEMENTO,
  STATES.CONSULTANDO_COBERTURA,
  STATES.COBERTURA_INVIAVEL,
  STATES.COBERTURA_VIAVEL,
  STATES.ESCOLHA_PLANO,
  STATES.NOME,
  STATES.CPF,
  STATES.DATA_NASCIMENTO,
  STATES.EMAIL,
  STATES.TELEFONE,
  STATES.TELEFONE_SECUNDARIO,
  STATES.VENCIMENTO,
  STATES.DATA_INSTALACAO,
  STATES.TURNO_INSTALACAO,
  STATES.CONFIRMACAO,
  STATES.FINALIZADO
];

function rank(step) {
  const index = STEP_ORDER.indexOf(step);
  return index >= 0 ? index : 0;
}

function fieldValue(documentObject, id) {
  return String(documentObject?.getElementById?.(id)?.value || "").trim();
}

function isVisible(element, windowObject) {
  if (!element) return false;
  if (element.hidden) return false;
  const inline = String(element.style?.display || "").toLowerCase();
  if (inline === "none") return false;
  if (windowObject?.getComputedStyle) {
    const style = windowObject.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function detectHeroStage(documentObject, windowObject) {
  const candidates = [
    ["etapaSucesso", 6],
    ["etapa5", 5],
    ["etapa4", 4],
    ["etapa3", 3],
    ["etapa2", 2],
    ["etapa1", 1]
  ];
  for (const [id, stage] of candidates) {
    if (isVisible(documentObject?.getElementById?.(id), windowObject)) return stage;
  }
  return 0;
}

function parsePriceFromOption(documentObject, selectId) {
  const select = documentObject?.getElementById?.(selectId);
  const text = String(select?.selectedOptions?.[0]?.textContent || "");
  const match = text.match(/R\$\s*([\d.]+,[\d]{2})/i);
  if (!match) return 0;
  return Number(match[1].replace(/\./g, "").replace(",", ".")) || 0;
}

function findPlan(planId, city, documentObject) {
  if (!planId) return null;
  const plans = [...getPromotionalPlans(), ...getPlansForCity(city)];
  const exact = plans.find((plan) => plan.id === planId);
  if (exact) return exact;
  const selectedText = String(documentObject?.getElementById?.("mPlano")?.selectedOptions?.[0]?.textContent || planId).trim();
  const speedMatch = selectedText.match(/(\d+)\s*(?:MB|Mega)|1\s*GIGA/i);
  const speed = /1\s*GIGA/i.test(selectedText) ? 1000 : Number(speedMatch?.[1] || 0);
  return {
    id: planId,
    title: selectedText.split("—")[0].trim() || planId,
    speed,
    price: parsePriceFromOption(documentObject, "mPlano"),
    features: [],
    promotional: false
  };
}

export function mapHeroSnapshotToStep(snapshot = {}) {
  const stage = Number(snapshot.stage || 0);
  if (stage >= 6) return STATES.FINALIZADO;
  if (stage === 5) return STATES.CONFIRMACAO;
  if (stage === 4) {
    if (!snapshot.diaVencimentoFatura) return STATES.VENCIMENTO;
    if (!snapshot.dataInstalacao) return STATES.DATA_INSTALACAO;
    if (!snapshot.turnoInstalacao) return STATES.TURNO_INSTALACAO;
    return STATES.CONFIRMACAO;
  }
  if (stage === 3) {
    if (!snapshot.nome) return STATES.NOME;
    if (!snapshot.cpf) return STATES.CPF;
    if (!snapshot.dataNascimento) return STATES.DATA_NASCIMENTO;
    if (!snapshot.email) return STATES.EMAIL;
    if (!snapshot.telefone) return STATES.TELEFONE;
    if (!snapshot.telefoneSecundario) return STATES.TELEFONE_SECUNDARIO;
    return STATES.VENCIMENTO;
  }
  if (stage === 2) return snapshot.plano ? STATES.NOME : STATES.ESCOLHA_PLANO;
  if (stage === 1) {
    if (!snapshot.cep && !snapshot.coordenadas) return STATES.CEP;
    if (!snapshot.numero) return STATES.NUMERO;
    return STATES.COMPLEMENTO;
  }
  return STATES.WELCOME;
}

export function readHeroSnapshot({ documentObject = globalThis.document, windowObject = globalThis.window } = {}) {
  if (!documentObject?.getElementById?.("etapa1")) return null;
  const stage = detectHeroStage(documentObject, windowObject);
  if (!stage) return null;
  const cidade = fieldValue(documentObject, "mCidade");
  const planId = fieldValue(documentObject, "mPlano");
  const coords = fieldValue(documentObject, "mCoordenadasFixas") || fieldValue(documentObject, "consultaCoordenadasFixas");
  const coverageBox = documentObject.getElementById("coverageOkBox");
  const progressedBeyondAddress = stage >= 2;
  const coverageViable = progressedBeyondAddress || Boolean(coverageBox?.classList?.contains?.("show"));

  const snapshot = {
    source: "hero",
    stage,
    cep: fieldValue(documentObject, "mCep").replace(/\D/g, ""),
    numero: fieldValue(documentObject, "mNumero"),
    complemento: fieldValue(documentObject, "mComplemento"),
    logradouro: fieldValue(documentObject, "mLogradouro"),
    bairro: fieldValue(documentObject, "mBairro"),
    cidade,
    uf: fieldValue(documentObject, "mUf").toUpperCase(),
    coordenadas: coords,
    coverageViable,
    plano: findPlan(planId, cidade, documentObject),
    nome: fieldValue(documentObject, "mNome"),
    cpf: fieldValue(documentObject, "mCpf").replace(/\D/g, ""),
    dataNascimento: fieldValue(documentObject, "mNascimento"),
    email: fieldValue(documentObject, "mEmail"),
    telefone: fieldValue(documentObject, "mTelefone1").replace(/\D/g, ""),
    telefoneSecundario: fieldValue(documentObject, "mTelefone2").replace(/\D/g, ""),
    diaVencimentoFatura: fieldValue(documentObject, "mVencimento"),
    dataInstalacao: fieldValue(documentObject, "mDataInstalacao"),
    turnoInstalacao: fieldValue(documentObject, "mTurnoInstalacao")
  };
  snapshot.step = mapHeroSnapshotToStep(snapshot);
  snapshot.hasProgress = rank(snapshot.step) > rank(STATES.WELCOME);
  return snapshot;
}

export function applyHeroSnapshotToSession(session, snapshot) {
  if (!session || !snapshot?.hasProgress) return { applied: false, step: session?.step || STATES.WELCOME };
  const currentRank = rank(session.step);
  const heroRank = rank(snapshot.step);

  const merge = {
    cep: snapshot.cep || session.cep || "",
    numero: snapshot.numero || session.numero || "",
    complemento: snapshot.complemento || session.complemento || "",
    logradouro: snapshot.logradouro || session.logradouro || "",
    bairro: snapshot.bairro || session.bairro || "",
    cidade: snapshot.cidade || session.cidade || "",
    uf: snapshot.uf || session.uf || "",
    coordenadas: snapshot.coordenadas || session.coordenadas || "",
    nome: snapshot.nome || session.nome || "",
    cpf: snapshot.cpf || session.cpf || "",
    dataNascimento: snapshot.dataNascimento || session.dataNascimento || "",
    email: snapshot.email || session.email || "",
    telefone: snapshot.telefone || session.telefone || "",
    telefoneSecundario: snapshot.telefoneSecundario || session.telefoneSecundario || "",
    diaVencimentoFatura: snapshot.diaVencimentoFatura || session.diaVencimentoFatura || "",
    dataInstalacao: snapshot.dataInstalacao || session.dataInstalacao || "",
    turnoInstalacao: snapshot.turnoInstalacao || session.turnoInstalacao || ""
  };
  Object.assign(session, merge);

  if (snapshot.plano) session.plano = snapshot.plano;
  if (snapshot.coverageViable) {
    session.addressConfirmed = true;
    session.cobertura = {
      ...(session.cobertura || {}),
      viavel: true,
      status: "VIAVEL",
      motivo: session.cobertura?.motivo || "hero_sincronizado",
      coords: snapshot.coordenadas || session.cobertura?.coords || session.coordenadas || "",
      source: "real"
    };
  }

  if (heroRank >= currentRank || currentRank <= rank(STATES.CEP)) {
    session.step = snapshot.step;
    session.flowStep = snapshot.step;
  }
  session.conversationMode = "FLOW";
  session.heroSync = {
    source: "hero",
    stage: snapshot.stage,
    step: snapshot.step,
    promptedAt: session.heroSync?.promptedAt || "",
    syncedAt: new Date().toISOString()
  };
  return { applied: true, step: session.step, importedStep: snapshot.step };
}

function setHeroField(documentObject, id, value, { dispatch = true } = {}) {
  if (value === undefined || value === null || value === "") return;
  const element = documentObject?.getElementById?.(id);
  if (!element) return;
  const next = String(value);
  if (String(element.value || "") === next) return;
  element.value = next;
  if (dispatch && typeof element.dispatchEvent === "function" && globalThis.Event) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function heroStageForChatStep(step) {
  if ([STATES.ESCOLHA_PLANO].includes(step)) return 2;
  if ([STATES.NOME, STATES.CPF, STATES.DATA_NASCIMENTO, STATES.EMAIL, STATES.TELEFONE, STATES.TELEFONE_SECUNDARIO].includes(step)) return 3;
  if ([STATES.VENCIMENTO, STATES.DATA_INSTALACAO, STATES.TURNO_INSTALACAO].includes(step)) return 4;
  if (step === STATES.CONFIRMACAO) return 5;
  if (step === STATES.FINALIZADO) return 6;
  return 1;
}

export function syncChatSessionToHero(session, { documentObject = globalThis.document, windowObject = globalThis.window } = {}) {
  if (!session || !documentObject?.getElementById?.("etapa1")) return false;
  const formattedCep = String(session.cep || "").replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
  setHeroField(documentObject, "mCep", formattedCep);
  setHeroField(documentObject, "mNumero", session.numero);
  setHeroField(documentObject, "mLogradouro", session.logradouro);
  setHeroField(documentObject, "mBairro", session.bairro);
  setHeroField(documentObject, "mCidade", session.cidade);
  setHeroField(documentObject, "mUf", session.uf);
  setHeroField(documentObject, "mComplemento", session.complemento === "Sem complemento" ? "" : session.complemento);
  setHeroField(documentObject, "mCoordenadasFixas", session.coordenadas, { dispatch: false });
  setHeroField(documentObject, "mPlano", session.plano?.id);
  setHeroField(documentObject, "mNome", session.nome);
  setHeroField(documentObject, "mCpf", session.cpf);
  setHeroField(documentObject, "mNascimento", session.dataNascimento);
  setHeroField(documentObject, "mEmail", session.email);
  setHeroField(documentObject, "mTelefone1", session.telefone);
  setHeroField(documentObject, "mTelefone2", session.telefoneSecundario);
  setHeroField(documentObject, "mVencimento", session.diaVencimentoFatura);
  setHeroField(documentObject, "mDataInstalacao", session.dataInstalacao);
  setHeroField(documentObject, "mTurnoInstalacao", session.turnoInstalacao);

  windowObject?.sincronizarCardsPlanoLanding?.();
  windowObject?.atualizarConfirmacaoLanding?.();
  const stage = heroStageForChatStep(session.step);
  windowObject?.mostrarEtapa?.(stage);
  return true;
}

export function heroStageLabel(stage) {
  return ({
    1: "endereço",
    2: "escolha do plano",
    3: "dados pessoais",
    4: "preferências de instalação",
    5: "revisão final",
    6: "solicitação concluída"
  })[Number(stage)] || "contratação";
}

export { rank as chatStepRank };
