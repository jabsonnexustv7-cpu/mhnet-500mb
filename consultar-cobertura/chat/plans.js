const BASE_PLANS = [
  {
    id: "FIBRA 500MB",
    speed: 500,
    title: "500 Mega",
    badge: "Plano econômico",
    price: 99.9,
    description: "Boa performance para vídeos, redes sociais e uso diário.",
    features: ["Instalação grátis", "Wi-Fi incluso"]
  },
  {
    id: "FIBRA 500MB + GLOBOPLAY",
    speed: 500,
    title: "500 Mega + Globoplay",
    badge: "Com streaming",
    price: 114.8,
    description: "Internet fibra com Globoplay para seus conteúdos favoritos.",
    features: ["Instalação grátis", "Globoplay incluso"]
  },
  {
    id: "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI",
    speed: 500,
    title: "500 Mega + ponto extra",
    badge: "Mais vendido",
    price: 119.9,
    description: "Mais alcance com um segundo ponto de Wi-Fi cabeado.",
    features: ["Instalação grátis", "Ponto extra incluso"]
  },
  {
    id: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY",
    speed: 600,
    title: "600 Mega + ponto extra",
    badge: "Combo streaming",
    price: 139.9,
    description: "Velocidade, alcance e Globoplay no mesmo plano.",
    features: ["Ponto extra", "Globoplay incluso"]
  },
  {
    id: "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI",
    speed: 700,
    title: "700 Mega + ponto extra",
    badge: "Alta performance",
    price: 149.9,
    description: "Mais velocidade e alcance para vários aparelhos.",
    features: ["Instalação grátis", "Ponto extra incluso"]
  },
  {
    id: "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI",
    speed: 1000,
    title: "1 Giga + ponto extra",
    badge: "Combo destaque",
    price: 159.9,
    description: "Alta performance para casas muito conectadas.",
    features: ["Instalação grátis", "Ponto extra incluso"]
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

  plans[0] = { ...plans[0], id: "FIBRA 600MB", speed: 600, title: "600 Mega" };
  plans[2] = {
    ...plans[2],
    id: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI",
    speed: 600,
    title: "600 Mega + ponto extra"
  };
  return plans;
}

export function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export { BASE_PLANS };
