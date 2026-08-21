import { normalizeCep, normalizeCpf, normalizeName, normalizePhone, onlyDigits } from "./validators.js";

function plain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function extractCep(text) {
  const match = String(text || "").match(/\b(\d{5})[-.\s]?(\d{3})\b/);
  return match ? normalizeCep(`${match[1]}${match[2]}`) : "";
}

export function extractAddressNumber(text) {
  const normalized = plain(text);
  if (/\b(s\/?n|sem numero)\b/.test(normalized)) return "S/N";
  const explicit = normalized.match(/(?:numero|n[º°o]?|casa)\s*(?:e|eh|:|=)?\s*(\d+[a-z]?)/i);
  if (explicit) return explicit[1].toUpperCase();
  const match = normalized.match(/\b\d{1,7}[a-z]?\b/i);
  return match ? match[0].toUpperCase() : "";
}

export function extractComplement(text) {
  const normalized = plain(text);
  if (/\b(nao tenho|sem complemento|nenhum|nao possui)\b/.test(normalized)) return "Sem complemento";
  return String(text || "")
    .replace(/^\s*(?:é|e|fica|complemento\s*(?:é|e|:)?|apartamento|apto)\s*/i, (prefix) => /apartamento|apto/i.test(prefix) ? "Apto " : "")
    .trim();
}

export function extractName(text) {
  return normalizeName(String(text || "").replace(/^\s*(?:meu nome (?:é|e)|sou|chamo-me|me chamo)\s+/i, ""));
}

export function extractCpf(text) {
  const match = String(text || "").match(/(?:\d[.\s-]?){11}/);
  return match ? normalizeCpf(match[0]) : normalizeCpf(text);
}

export function extractBirthDate(text) {
  const match = String(text || "").match(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{8}\b|\b\d{4}-\d{2}-\d{2}\b/);
  return match ? match[0] : String(text || "").trim();
}

export function extractEmail(text) {
  const match = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : String(text || "").trim().toLowerCase();
}

export function extractPhone(text) {
  return normalizePhone(text);
}

export function wantsAddressCorrection(text) {
  return /\b(corrigir|alterar|trocar|mudar|refazer)\b.*\b(endereco|cep|numero)\b|\b(endereco|cep|numero)\b.*\b(errado|incorreto)\b/.test(plain(text));
}

export function wantsConfirmation(text) {
  return /^(sim|confirmo|confirmar|pode finalizar|esta certo|tudo certo|ok|fechado)[.!\s]*$/.test(plain(text));
}

export function wantsMorePlans(text) {
  return /\b(ver|mostrar|quero|conhecer|exibir)\b.*\b(mais|outr[oa]s?)\b.*\b(planos?|ofertas?)\b|\b(mais|outr[oa]s?)\b.*\b(planos?|ofertas?)\b/.test(plain(text));
}

export function selectPlanFromText(text, plans) {
  const normalized = plain(text);
  if (!Array.isArray(plans) || !plans.length) return null;

  if (/mais barato|menor preco|economico|mais em conta/.test(normalized)) {
    return [...plans].sort((a, b) => a.price - b.price)[0];
  }

  const giga = /\b(?:1\s*)?(?:giga|gb)\b/.test(normalized);
  const speedMatch = normalized.match(/\b(300|500|600|700|1000)\s*(?:mega|mb|m)?\b/);
  const speed = giga ? 1000 : speedMatch ? Number(speedMatch[1]) : 0;
  if (!speed) return null;

  const matching = plans.filter((plan) => plan.speed === speed);
  if (/globo|streaming/.test(normalized)) {
    return matching.find((plan) => /GLOBOPLAY/.test(plan.id)) || null;
  }
  if (/ponto|wifi extra|wi-fi extra/.test(normalized)) {
    return matching.find((plan) => /PONTO EXTRA/.test(plan.id) && !/GLOBOPLAY/.test(plan.id)) || matching[0] || null;
  }
  return [...matching].sort((a, b) => a.price - b.price)[0] || null;
}

export function hasMeaningfulText(value) {
  return onlyDigits(value).length > 0 || String(value || "").trim().length > 0;
}
