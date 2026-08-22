const PROMOTIONAL_PLANS = [
  {
    id: "FIBRA 300MB",
    speed: 300,
    title: "300 Mega",
    badge: "Menor mensalidade",
    price: 79.9,
    description: "Internet fibra para navegar, assistir e usar seus aplicativos no dia a dia.",
    features: ["Instalação grátis", "Wi-Fi incluso"],
    promotional: true
  },
  {
    id: "FIBRA 500MB (Combate)",
    speed: 500,
    title: "500 Mega",
    badge: "Mais escolhido",
    price: 89.9,
    description: "Mais velocidade por apenas R$ 10 a mais que o plano de 300 Mega.",
    features: ["Instalação grátis", "Wi-Fi incluso"],
    promotional: true,
    featured: true
  },
  {
    id: "FIBRA 700MB",
    speed: 700,
    title: "700 Mega",
    badge: "Mais velocidade",
    price: 99.9,
    description: "Alta velocidade para vários aparelhos, streaming, trabalho e jogos.",
    features: ["Instalação grátis", "Wi-Fi incluso"],
    promotional: true
  }
];

const PLAN_SELECTION_VIEWS = Object.freeze({
  PROMOTIONS: "promotions",
  CATALOG: "catalog"
});

// Ordem comercial deliberada: primeiro o plano recomendado, depois a alternativa
// básica e, em seguida, as opções de maior valor percebido/ticket.
const BASE_PLANS = [
  {
    id: "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI",
    speed: 500,
    title: "500 Mega + 1 Ponto extra",
    badge: "Mais popular",
    price: 119.9,
    description: "Mais cobertura de Wi-Fi pela casa com um ponto extra.",
    features: ["Ponto extra de Wi-Fi", "Instalação grátis"],
    featured: true
  },
  {
    id: "FIBRA 500MB",
    speed: 500,
    title: "500 Mega",
    badge: "",
    price: 99.9,
    description: "Internet fibra para navegação, vídeos e uso diário.",
    features: ["Wi-Fi incluso", "Instalação grátis"]
  },
  {
    id: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY",
    speed: 600,
    title: "600 Mega + Ponto extra + Globoplay",
    badge: "Completo",
    price: 139.9,
    description: "Mais velocidade, cobertura de Wi-Fi e Globoplay no mesmo plano.",
    features: ["Ponto extra de Wi-Fi", "Globoplay incluso", "Instalação grátis"]
  },
  {
    id: "FIBRA 500MB + GLOBOPLAY",
    speed: 500,
    title: "500 Mega + Globoplay",
    badge: "Globoplay",
    price: 114.8,
    description: "Internet fibra com Globoplay incluso.",
    features: ["Globoplay incluso", "Instalação grátis"]
  },
  {
    id: "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI",
    speed: 700,
    title: "700 Mega + 1 Ponto extra",
    badge: "Alta velocidade",
    price: 149.9,
    description: "Mais velocidade e cobertura para vários aparelhos.",
    features: ["Ponto extra de Wi-Fi", "Instalação grátis"]
  },
  {
    id: "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI",
    speed: 1000,
    title: "1 Giga + 1 Ponto extra",
    badge: "Máxima velocidade",
    price: 159.9,
    description: "Máxima performance para casas com muitos dispositivos.",
    features: ["Ponto extra de Wi-Fi", "Instalação grátis"]
  }
];

const REGIONAL_CITIES = new Set(["sorocaba", "votorantim"]);

function normalizeCity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function getPlansForCity(city) {
  const plans = structuredClone(BASE_PLANS);
  if (!REGIONAL_CITIES.has(normalizeCity(city))) return plans;

  const basicIndex = plans.findIndex((plan) => plan.id === "FIBRA 500MB");
  if (basicIndex >= 0) {
    plans[basicIndex] = { ...plans[basicIndex], id: "FIBRA 600MB", speed: 600, title: "600 Mega" };
  }

  const extraIndex = plans.findIndex((plan) => plan.id === "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI");
  if (extraIndex >= 0) {
    plans[extraIndex] = {
      ...plans[extraIndex],
      id: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI",
      speed: 600,
      title: "600 Mega + 1 Ponto extra"
    };
  }
  return plans;
}

export function getPromotionalPlans() {
  return structuredClone(PROMOTIONAL_PLANS);
}

export function isPromotionalPlan(plan) {
  return Boolean(plan?.promotional || PROMOTIONAL_PLANS.some((offer) => offer.id === plan?.id));
}

export function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export { BASE_PLANS, PLAN_SELECTION_VIEWS, PROMOTIONAL_PLANS };
