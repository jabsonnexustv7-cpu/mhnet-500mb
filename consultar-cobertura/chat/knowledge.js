import { STATES } from "./state.js";

export const COMMERCIAL_KNOWLEDGE = Object.freeze({
  scope: "Nova contratação de internet fibra WebTurbo",
  installation: "A instalação é gratuita nas ofertas que exibem esse benefício, sujeita à viabilidade e à agenda técnica do endereço.",
  wifi: "As ofertas informam Wi-Fi incluso. Alguns planos também incluem ponto extra de Wi-Fi.",
  schedule: "A data escolhida é uma preferência. A confirmação depende da agenda técnica disponível para o endereço.",
  credit: "O CPF é usado no processo cadastral. A aprovação ou reprovação não é decidida pelo chat nem pela IA.",
  billing: "Os vencimentos disponíveis no fluxo são 05, 10, 15, 20 e 25. O resumo calcula a cobrança proporcional conforme a regra atual.",
  privacy: "Dados pessoais são tratados pelo fluxo determinístico e não são necessários para responder dúvidas comerciais gerais.",
  unsupported: "Suporte técnico, segunda via, cancelamento de contrato existente e troca de titularidade devem ser direcionados a um atendente."
});

const RESUME_PROMPTS = Object.freeze({
  [STATES.CEP]: "Para continuar, informe seu CEP.",
  [STATES.NUMERO]: "Para continuar, informe o número do imóvel.",
  [STATES.COMPLEMENTO]: "Para continuar, informe o complemento ou diga que não possui.",
  [STATES.COBERTURA_INVIAVEL]: "Você pode fazer uma nova consulta ou corrigir o endereço.",
  [STATES.ESCOLHA_PLANO]: "Para continuar, escolha um dos planos exibidos.",
  [STATES.NOME]: "Para continuar, informe seu nome completo.",
  [STATES.CPF]: "Para continuar, informe seu CPF.",
  [STATES.DATA_NASCIMENTO]: "Para continuar, informe sua data de nascimento.",
  [STATES.EMAIL]: "Para continuar, informe seu e-mail.",
  [STATES.TELEFONE]: "Para continuar, informe seu telefone principal com DDD.",
  [STATES.TELEFONE_SECUNDARIO]: "Para continuar, informe um segundo telefone com DDD.",
  [STATES.VENCIMENTO]: "Para continuar, escolha o dia de vencimento.",
  [STATES.DATA_INSTALACAO]: "Para continuar, escolha a data preferida de instalação.",
  [STATES.TURNO_INSTALACAO]: "Para continuar, escolha manhã ou tarde.",
  [STATES.CONFIRMACAO]: "Confira o resumo e confirme quando estiver tudo certo."
});

export function resumePromptForStep(step) {
  return RESUME_PROMPTS[step] || "Podemos continuar sua contratação por aqui.";
}
