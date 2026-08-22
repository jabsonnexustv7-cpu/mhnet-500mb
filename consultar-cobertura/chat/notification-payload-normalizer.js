const NOTIFICATION_ENDPOINT_HOST = "modal-easy-964927461432.southamerica-east1.run.app";
const NOTIFICATION_ACTIONS = new Set(["notifyConsulta", "notifyConsultaInviavel"]);

function plain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isNotificationRequest(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  if (!url.includes(NOTIFICATION_ENDPOINT_HOST)) return false;
  const method = String(init.method || (typeof input !== "string" ? input?.method : "") || "GET").toUpperCase();
  return method === "POST";
}

function sourceLabel(payload = {}) {
  const raw = plain(payload.origemConsulta || payload.origem || payload.origin || "");
  return raw.includes("chat") ? "CHAT" : "HERO";
}

function extractCoords(payload = {}) {
  const candidates = [
    payload.coords,
    payload.coordenadas,
    payload.coordenadasFixas,
    payload.cobertura?.coords,
    payload.cobertura?.coordenadas
  ];
  for (const candidate of candidates) {
    const match = String(candidate || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) return `${match[1]},${match[2]}`;
  }
  return "";
}

function cleanAddress(payload = {}) {
  return String(payload.fachada || "")
    .replace(/^\[(CHAT|HERO)\]\s*/i, "")
    .replace(/\s*\|\s*Mapa:\s*https?:\/\/\S+$/i, "")
    .trim();
}

async function geocodeAddress(payload, fetchImpl) {
  const address = cleanAddress(payload);
  if (!address || address === "-") return "";
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", address);
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "Accept-Language": "pt-BR,pt;q=0.9" }
    });
    if (!response.ok) return "";
    const data = await response.json().catch(() => []);
    const first = Array.isArray(data) ? data[0] : null;
    const lat = Number(first?.lat);
    const lon = Number(first?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    return `${lat.toFixed(6)},${lon.toFixed(6)}`;
  } catch {
    return "";
  }
}

function enrichPayload(payload, coords) {
  const label = sourceLabel(payload);
  const originalOrigin = payload.origemConsulta || payload.origem || "";
  const baseAddress = cleanAddress(payload) || "-";
  const mapLink = coords
    ? `https://www.google.com/maps?q=${coords}`
    : baseAddress !== "-"
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(baseAddress)}`
      : "";
  const isUnviable = payload.action === "notifyConsultaInviavel" || payload.viavel === false;
  const addressWithSource = `[${label}] ${baseAddress}`;
  const addressForMessage = isUnviable && mapLink
    ? `${addressWithSource} | Mapa: ${mapLink}`
    : addressWithSource;
  const [latitude = "", longitude = ""] = coords.split(",").map((value) => value.trim());

  return {
    ...payload,
    fachada: addressForMessage,
    origemConsulta: label,
    origem: label,
    origemOriginal: originalOrigin,
    origemDetalhe: originalOrigin,
    canalConsulta: label,
    identificadorConsulta: label,
    coords,
    coordenadas: coords,
    coordenadasFixas: coords,
    latitude,
    longitude,
    latitudeFixa: latitude,
    longitudeFixa: longitude,
    linkLocalizacao: mapLink,
    mapa: mapLink,
    cobertura: {
      ...(payload.cobertura || {}),
      coords,
      coordenadas: coords,
      linkLocalizacao: mapLink,
      mapa: mapLink
    }
  };
}

if (!window.__webturboNotificationFetchPatched) {
  window.__webturboNotificationFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function webturboNotificationFetch(input, init = {}) {
    if (!isNotificationRequest(input, init) || typeof init.body !== "string") {
      return originalFetch(input, init);
    }

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return originalFetch(input, init);
    }

    if (!NOTIFICATION_ACTIONS.has(payload?.action)) {
      return originalFetch(input, init);
    }

    let coords = extractCoords(payload);
    if (!coords) coords = await geocodeAddress(payload, originalFetch);
    const enriched = enrichPayload(payload, coords);

    return originalFetch(input, {
      ...init,
      body: JSON.stringify(enriched)
    });
  };
}

export { cleanAddress, enrichPayload, extractCoords, sourceLabel };
