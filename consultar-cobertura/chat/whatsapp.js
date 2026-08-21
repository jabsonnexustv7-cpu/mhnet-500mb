import { onlyDigits } from "./validators.js";

export function createWhatsAppService(config, tracking, { locationObject = window.location, timerApi = window } = {}) {
  let redirectTimer = null;

  function buildUrl(session) {
    const message = `Acabei de concluir um pedido de internet, meu CPF: ${onlyDigits(session.cpf)}`;
    return `https://wa.me/${config.whatsNumber}?text=${encodeURIComponent(message)}`;
  }

  function buildHandoffUrl(session) {
    const details = [session.cidade ? `Cidade: ${session.cidade}/${session.uf}` : "", session.plano?.title ? `Plano de interesse: ${session.plano.title}` : ""].filter(Boolean).join(". ");
    const message = `Olá! Quero falar com um atendente sobre uma nova contratação de internet.${details ? ` ${details}.` : ""}`;
    return `https://wa.me/${config.whatsNumber}?text=${encodeURIComponent(message)}`;
  }

  function openHandoff(session) {
    const url = buildHandoffUrl(session);
    if (config.whatsappMode === "real") locationObject.assign(url);
    return { url, redirected: config.whatsappMode === "real", mock: config.whatsappMode !== "real" };
  }

  function startRedirect(session, onTick = () => {}) {
    const url = buildUrl(session);
    if (config.whatsappMode !== "real") return { url, redirected: false, mock: true };
    let seconds = 3;
    onTick(seconds);
    redirectTimer = timerApi.setInterval(() => {
      seconds -= 1;
      onTick(seconds);
      if (seconds <= 0) {
        timerApi.clearInterval(redirectTimer);
        redirectTimer = null;
        tracking.whatsapp(session, "automatico");
        locationObject.assign(url);
      }
    }, 1000);
    return { url, redirected: true, mock: false };
  }

  function trackManual(session) {
    tracking.whatsapp(session, "manual");
  }

  return { buildUrl, buildHandoffUrl, openHandoff, startRedirect, trackManual };
}
