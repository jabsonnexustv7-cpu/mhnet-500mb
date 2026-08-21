export function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

export function normalizeCep(value) {
  return onlyDigits(value).slice(0, 8);
}

export function formatCep(value) {
  const cep = normalizeCep(value);
  return cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

export function isValidCep(value) {
  const cep = normalizeCep(value);
  return cep.length === 8 && !/^(\d)\1{7}$/.test(cep);
}

export function normalizeCpf(value) {
  return onlyDigits(value).slice(0, 11);
}

export function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function maskCpf(value) {
  const cpf = normalizeCpf(value);
  return cpf.length === 11 ? `***.***.***-${cpf.slice(-2)}` : "-";
}

export function normalizePhone(value) {
  const digits = onlyDigits(value);
  const withoutCountry = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  return withoutCountry.slice(0, 11);
}

export function isValidPhone(value) {
  const phone = normalizePhone(value);
  return /^(?:[1-9]{2})9?\d{8}$/.test(phone) && !/^(\d)\1+$/.test(phone);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

export function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isValidName(value) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.length >= 2 && parts.every((part) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/.test(part));
}

export function parseBirthDate(value) {
  const raw = String(value || "").trim();
  const digits = onlyDigits(raw).slice(0, 8);
  let day;
  let month;
  let year;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [year, month, day] = raw.split("-").map(Number);
  } else if (digits.length === 8) {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = Number(digits.slice(4));
  } else {
    return { valid: false, iso: "", formatted: "" };
  }

  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const valid = year >= 1900 && date <= today && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!valid) return { valid: false, iso: "", formatted: "" };

  return {
    valid: true,
    iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    formatted: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`
  };
}
