import { STATES } from "./state.js";

export const COMMERCIAL_KNOWLEDGE = Object.freeze({
  scope: "Nova contratação de internet fibra pela WebTurbo usando rede MhNet.",

  companyAndPostSale: {
    webturbo: "A WebTurbo é uma empresa de representação com atendimento em nível nacional.",
    provider: "A ativação e a rede do serviço são da MhNet.",
    afterSale: "Ao final da contratação, o cliente é encaminhado para um consultor humano exclusivo da WebTurbo, que acompanha a jornada de pós-venda e instalação."
  },

  installation: {
    price: "A instalação é gratuita.",
    equipment: "Todos os equipamentos são fornecidos em comodato, inclusive ponto extra de Wi-Fi.",
    router: "Os roteadores fornecidos são Wi-Fi 6.",
    deadline: "A instalação ocorre em até 24 horas. Dependendo do horário em que a contratação for concluída, pode ocorrer no mesmo dia, embora o seletor do fluxo normalmente exiba como primeira preferência o dia seguinte.",
    days: "Há instalações de segunda a sábado. Não há atendimento de instalação aos domingos.",
    shifts: "Turno da manhã: 08h às 12h30. Turno da tarde: 13h30 às 18h30.",
    reschedule: "O agendamento pode ser remarcado inclusive no mesmo dia.",
    adultPresent: "É necessário haver alguém com 18 anos completos ou mais no imóvel para receber o técnico. Essa pessoa não precisa ser o titular.",
    technicianContact: "No dia da instalação, o técnico chama o titular pelo WhatsApp e só inicia o deslocamento depois que o titular confirma que há alguém no imóvel.",
    cabling: "Não há necessidade padrão de furar a parede. O cliente escolhe o ponto de preferência para entrada do cabo, respeitando a viabilidade técnica do local.",
    apartments: "Em condomínio com regras de horário, o cliente deve verificar previamente a necessidade de autorização com o condomínio.",
    buildings: "Prédios de um bloco com até 3 andares não precisam de adequação prévia. Nas demais situações, a necessidade de adequação é avaliada depois do envio completo da venda."
  },

  billing: {
    firstInvoice: "Via de regra, a primeira fatura é proporcional aos dias utilizados e vence no dia escolhido pelo cliente no mês seguinte. Dependendo da combinação entre data de instalação e vencimento escolhido, a primeira fatura cheia pode ficar para até cerca de 60 dias.",
    dueDate: "O vencimento é escolhido em uma etapa do próprio fluxo. Use somente as datas de vencimento realmente apresentadas pelo sistema ao cliente; não invente datas.",
    proportionalEstimate: "Pode explicar ou fazer uma estimativa aproximada da cobrança proporcional quando houver valor do plano, data de instalação e vencimento confiáveis no contexto. Deixe claro que é uma simulação e que o valor final é calculado pelo sistema.",
    fees: "Não há taxa de adesão nem taxa extra para iniciar o serviço.",
    price: "O preço informado do plano é fixo e, conforme a regra comercial fornecida pela WebTurbo, não aumenta em razão do tempo de permanência do cliente.",
    delinquency: "Com 15 dias de inadimplência o serviço já pode ser bloqueado."
  },

  loyaltyAndCancellation: {
    term: "Todo plano pós-pago possui permanência mínima de 12 meses.",
    reason: "A fidelidade existe porque a operadora assume um custo elevado para instalar e disponibilizar o serviço sem cobrança inicial de instalação e equipamentos ao cliente.",
    cancellation: "O cliente pode cancelar quando quiser, respeitando as regras de fidelidade.",
    penalty: "A multa padrão parte do valor do plano escolhido multiplicado por 12 e é reduzida proporcionalmente conforme o tempo já cumprido da fidelidade. Ao explicar, trate como cálculo pró-rata e evite afirmar um valor exato sem os dados do contrato.",
    equipmentReturn: "No cancelamento, um técnico recolhe os equipamentos em comodato.",
    addressChange: "Para mudança de endereço, o cliente deve entrar em contato com pelo menos 5 dias de antecedência. A fidelidade é mantida e o novo endereço precisa passar por verificação de cobertura."
  },

  creditAndRegistration: {
    negatives: "Clientes negativados podem contratar. Não é feita consulta ao SPC ou Serasa para esta contratação.",
    restriction: "A restrição considerada é a existência de débito interno anterior junto à MhNet, pois a rede utilizada no serviço é da MhNet.",
    approval: "Nunca diga que a aprovação é garantida. A validação cadastral final é da operadora e do sistema.",
    alternateCpf: "Se um CPF não for aprovado, a contratação pode ser feita com outro CPF, desde que o novo titular autorize a contratação.",
    minimumAge: "O titular precisa ter 18 anos completos ou mais."
  },

  documentsAndPrivacy: {
    signature: "Ao final da contratação, o titular conclui a assinatura pelo portal mediante envio das fotos solicitadas.",
    required: "O titular precisa enviar selfie e foto de documento ao final da contratação.",
    physicalDocuments: "São aceitos RG, CNH ou carteira de trabalho física.",
    digitalDocuments: "Em formato digital, são aceitos somente RG e CNH.",
    secondaryPhone: "São solicitados dois contatos para que a equipe técnica tenha uma alternativa caso não consiga falar com o contato principal no dia da instalação.",
    email: "O e-mail é usado para atualizações do pedido e envio do contrato.",
    lgpd: "Os dados pessoais devem ser tratados conforme a Lei nº 13.709/2018, a Lei Geral de Proteção de Dados Pessoais (LGPD). Não solicite nem repita dados pessoais para responder dúvidas comerciais."
  },

  serviceQuality: {
    upload: "O upload corresponde a 50% da velocidade contratada.",
    dataCap: "Não há franquia ou limite mensal de dados.",
    ping: "A conexão possui boa latência para jogos e aplicações em tempo real, especialmente por cabo. Não prometa um valor fixo de ping em milissegundos, pois ele varia conforme servidor, rota, equipamento e uso por Wi-Fi.",
    wifi: "A experiência por Wi-Fi depende do ambiente, distância, interferências e quantidade de dispositivos. Não prometa cobertura total da casa sem considerar o ambiente ou um ponto extra."
  },

  dynamicRules: {
    coverage: "Cobertura nunca deve ser inventada. Use exclusivamente o resultado de cobertura fornecido pelo sistema para o endereço consultado.",
    plans: "Planos, preços e benefícios devem vir exclusivamente dos planos disponíveis no contexto atual. Não invente ofertas nem preços.",
    schedule: "A IA pode explicar as regras gerais de instalação, mas uma data específica só deve ser tratada como confirmada quando o sistema ou a equipe confirmar.",
    systemData: "Se uma informação depender de cobertura, agenda, plano disponível, preço atual, aprovação ou outro dado operacional não presente no contexto confiável, diga que será validada pelo sistema ou pela equipe."
  },

  handoff: {
    when: "Encaminhe para atendimento humano quando o cliente pedir uma pessoa, quando a dúvida estiver fora de nova contratação, ou quando a resposta depender de uma exceção operacional não disponível no contexto.",
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
