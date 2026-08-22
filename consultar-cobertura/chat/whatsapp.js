export function createWhatsAppService(config, tracking, { locationObject = window.location } = {}) {
  function buildHandoffUrl(session) {
    const details = [session.cidade ? `Cidade: ${session.cidade}/${session.uf}` : "", session.plano?.title ? `Plano de interesse: ${session.plano.title}` : ""].filter(Boolean).join(". ");
    const message = `Olá! Quero falar com um atendente sobre uma nova contratação de internet.${details ? ` ${details}.` : ""}`;
    return `https://wa.me/${config.whatsNumber}?text=${encodeURIComponent(message)}`;
  }

  function openHandoff(session) {
    const url = buildHandoffUrl(session);
    tracking?.whatsapp?.(session, "handoff_confirmado");
    if (config.whatsappMode === "real") locationObject.assign(url);
    return { url, redirected: config.whatsappMode === "real", mock: config.whatsappMode !== "real" };
  }

  return { buildHandoffUrl, openHandoff };
}
