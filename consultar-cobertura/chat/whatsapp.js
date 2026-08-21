import { onlyDigits } from "./validators.js";

export function createWhatsAppService(config, tracking, { locationObject = window.location, timerApi = window } = {}) {
  let redirectTimer = null;

  function buildUrl(session) {
    const message = `Acabei de concluir um pedido de internet, meu CPF: ${onlyDigits(session.cpf)}`;
    return `https://wa.me/${config.whatsNumber}?text=${encodeURIComponent(message)}`;
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

  return { buildUrl, startRedirect, trackManual };
}
