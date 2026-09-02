import { STATES } from "./state.js";

export const COMMERCIAL_KNOWLEDGE = Object.freeze({
  scope: "Nova contratação de internet fibra pela WebTurbo com a operadora definida pelo resultado de cobertura do endereço.",

  companyAndPostSale: {
    webturbo: "A WebTurbo atua na intermediação comercial da contratação de internet fibra.",
    provider: "A operadora responsável pelo serviço é definida pelo resultado de cobertura. Nunca assuma MhNet, TIM ou Algar sem evidência no contexto confiável da sessão.",
    afterSale: "Ao final da contratação, a WebTurbo pode encaminhar o cliente para acompanhamento humano de pós-venda e instalação."
  },

  installation: {
    price: "No fluxo comercial atual, a instalação é apresentada como gratuita. Se o contexto confiável trouxer condição diferente para a oferta escolhida, prevalece o contexto.",
    equipment: "Equipamentos, modelo de roteador, comodato, ponto extra e regras técnicas podem variar conforme a operadora e o plano. Não generalize características de uma operadora para outra.",
    deadline: "Prazo e disponibilidade de instalação dependem da operadora, agenda e viabilidade técnica. Uma data escolhida no fluxo é preferência até a confirmação operacional.",
    adultPresent: "No dia da instalação deve haver uma pessoa maior de idade no imóvel para receber o técnico.",
    contact: "A forma de aviso da visita técnica varia por operadora. Não diga que o técnico sempre chama diretamente o cliente.",
    mhnetContact: "Quando o contexto indicar MhNet, o técnico pode chamar pelo WhatsApp antes do deslocamento e aguardar a confirmação de que há alguém no local.",
    timAlgarContact: "Quando o contexto indicar TIM ou Algar, o aviso de deslocamento é feito pelos canais oficiais da própria operadora; não atribua esse contato diretamente ao técnico.",
    apartments: "Em condomínios, regras de acesso e horários podem exigir autorização prévia. A instalação continua sujeita à viabilidade técnica do local."
  },

  billing: {
    dueDate: "Datas de vencimento e regras de cobrança devem vir das opções realmente apresentadas pelo sistema para a contratação atual.",
    firstInvoice: "A forma de cálculo da primeira fatura pode variar conforme a operadora, data de instalação e vencimento. Não aplique automaticamente a regra de uma operadora a outra.",
    proportionalEstimate: "Só faça estimativa proporcional quando houver regra aplicável à operadora atual e dados confiáveis suficientes. Deixe claro quando for simulação.",
    price: "O preço do plano deve ser exatamente o valor informado em availablePlans ou no plano selecionado. Nunca recupere preço de catálogo antigo ou memória.",
    fees: "Taxas e cobranças adicionais só podem ser afirmadas quando constarem no contexto confiável ou no conhecimento operacional aplicável à operadora atual."
  },

  loyaltyAndCancellation: {
    term: "Fidelidade, permanência mínima, multa e cancelamento podem variar conforme operadora e oferta. Não generalize uma regra sem contexto confiável.",
    penalty: "Nunca informe multa exata sem os dados contratuais e a regra aplicável à operadora/plano atual.",
    equipmentReturn: "A devolução de equipamentos depende das regras contratuais da operadora responsável pelo serviço.",
    addressChange: "Mudança de endereço exige nova verificação de cobertura e segue as regras da operadora contratada."
  },

  creditAndRegistration: {
    negatives: "Critérios para negativados, score e restrições variam por operadora. Não diga que aprovação é garantida nem aplique automaticamente a regra da MhNet à TIM ou Algar.",
    restriction: "Débitos internos e demais restrições devem ser avaliados pela operadora indicada no contexto. Se a regra específica não estiver disponível, diga que o sistema fará a validação.",
    approval: "A aprovação cadastral final pertence à operadora e ao sistema.",
    alternateCpf: "Não sugira troca de titular como forma de contornar uma reprovação sem que essa possibilidade esteja prevista no contexto operacional atual.",
    minimumAge: "O titular precisa ter 18 anos completos ou mais."
  },

  documentsAndPrivacy: {
    required: "Documentos, aceite, assinatura e etapas de validação variam conforme a operadora. Use somente o fluxo apresentado ao cliente e não antecipe exigências de outra operadora.",
    secondaryPhone: "Quando o fluxo solicitar um segundo contato, explique que ele serve como alternativa de comunicação durante a contratação/instalação.",
    email: "O e-mail pode ser usado para atualizações do pedido, comunicações e documentos da contratação.",
    lgpd: "Não solicite nem repita dados pessoais em respostas de FAQ. A coleta deve acontecer somente na etapa determinística apropriada do fluxo."
  },

  serviceQuality: {
    speed: "Velocidade, upload, tecnologia de Wi-Fi e demais características técnicas devem vir do plano/contexto atual; não transplante especificações entre operadoras.",
    dataCap: "Só afirme ausência de franquia ou limite de dados quando essa condição estiver confirmada para a oferta atual.",
    ping: "Nunca prometa um valor fixo de ping, pois ele varia conforme servidor, rota, equipamento, cabeamento e uso por Wi-Fi.",
    wifi: "A experiência por Wi-Fi depende do ambiente, distância, interferências e quantidade de dispositivos. Não prometa cobertura total do imóvel."
  },

  dynamicRules: {
    coverage: "Cobertura nunca deve ser inventada. Use exclusivamente o resultado de cobertura fornecido pelo sistema para o endereço consultado.",
    operator: "A operadora deve ser identificada apenas pelo contexto confiável da sessão, inclusive códigos e informações dos availablePlans. Se não for possível identificar com segurança, não presuma uma operadora.",
    plans: "Planos, preços e benefícios devem vir exclusivamente de availablePlans e do plano selecionado na sessão atual. Esses dados têm prioridade sobre qualquer conhecimento estático.",
    planCodes: "Códigos iniciados por TIM_, ALGAR_ ou MHNET_ identificam a operadora do plano. Use essa informação somente quando o código estiver presente no contexto confiável.",
    bestSeller: "Só chame um plano de 'Mais vendido' quando essa indicação estiver explicitamente presente nas features do plano enviado no contexto.",
    schedule: "Uma data específica só deve ser tratada como confirmada quando o sistema ou a equipe confirmar.",
    systemData: "Se uma resposta depender de cobertura, operadora, agenda, preço, benefício, aprovação, documento ou regra operacional não presente no contexto confiável, diga que será validada pelo sistema ou pela equipe."
  },

  handoff: {
    when: "Encaminhe para atendimento humano quando o cliente pedir uma pessoa, quando a dúvida estiver fora de nova contratação, ou quando a resposta depender de exceção operacional não disponível no contexto.",
    unsupported: "Suporte técnico de cliente já instalado, segunda via, cancelamento de contrato existente, troca de titularidade e exceções não previstas devem ser direcionados a um atendente."
  }
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
