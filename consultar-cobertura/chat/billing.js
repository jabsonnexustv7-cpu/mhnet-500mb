export const DUE_DATE_OPTIONS = Object.freeze(["05", "08", "09", "10", "15", "25"]);
export const INSTALLATION_SHIFT_OPTIONS = Object.freeze(["Manhã", "Tarde"]);

export function localIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function tomorrowISO(referenceDate = new Date()) {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  date.setDate(date.getDate() + 1);
  return localIsoDate(date);
}

export function parseInstallationDate(value, referenceDate = new Date()) {
  const raw = String(value || "").trim();
  const br = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : null;
  if (!parts) return { valid: false, iso: "", formatted: "", reason: "format" };

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  const exact = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!exact) return { valid: false, iso: "", formatted: "", reason: "invalid" };

  const minimum = tomorrowISO(referenceDate);
  const normalized = localIsoDate(date);
  if (normalized < minimum) return { valid: false, iso: "", formatted: "", reason: "past" };
  return {
    valid: true,
    iso: normalized,
    formatted: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    reason: ""
  };
}

function monthName(index) {
  return [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ][index];
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatReais(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

// Espelha calcularFaturamentoResumo() da contratação atual, inclusive a estimativa D+2.
export function calculateBillingSummary(planPrice, dueDay, referenceDate = new Date()) {
  const price = Number(planPrice || 0);
  const due = String(dueDay || "");
  if (!price || !DUE_DATE_OPTIONS.includes(due)) return { proportional: "-", full: "-" };

  const installation = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  installation.setDate(installation.getDate() + 2);

  const year = installation.getFullYear();
  const month = installation.getMonth();
  const day = installation.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const usedDays = Math.max(1, daysInMonth - day + 1);
  const proportionalValue = round2((price / daysInMonth) * usedDays);

  const proportionalMonth = (month + 1) % 12;
  const proportionalYear = year + (month === 11 ? 1 : 0);
  const fullMonth = (month + 2) % 12;
  const fullYear = year + (month >= 10 ? 1 : 0);
  const proportionalMonthLabel = `${monthName(proportionalMonth)}/${proportionalYear}`;
  const fullMonthLabel = `${monthName(fullMonth)}/${fullYear}`;
  const ratio = proportionalValue / price;
  const specialMessage = day <= 5 || ratio >= 0.9;

  return {
    proportional: specialMessage
      ? `A fatura de ${proportionalMonthLabel} será referente aos dias utilizados em ${monthName(month)}.`
      : `Em ${proportionalMonthLabel} você receberá um valor proporcional referente aos dias de uso — em torno de ${formatReais(proportionalValue)}.`,
    full: `${formatReais(price)} no dia ${due} de ${fullMonthLabel}.`
  };
}
