const ROOT_ID = "webturbo-chat-root";
const ASSISTANT_AVATAR = "/consultar-cobertura/chat/assets/webturbo-assistente.png";
const DIRECT_WHATSAPP_IDS = [
  "metaFloatingWhats",
  "botaoWhats",
  "botaoWhatsTopo",
  "btnContratarCobertura",
  "btnContinuarWhatsModal"
];
let pendingOpen = false;

function chatMarkup() {
  return `
    <button id="chat-launcher" class="chat-launcher" type="button" aria-label="Abrir atendimento on-line da WebTurbo">
      <img class="chat-launcher-avatar" src="${ASSISTANT_AVATAR}" width="38" height="38" alt="">
      <span>Atendimento on-line</span>
      <i aria-label="Online"></i>
    </button>

    <section id="chat-panel" class="chat-panel" aria-label="Chat da WebTurbo" aria-hidden="true">
      <header class="chat-header">
        <img class="chat-header-avatar" src="${ASSISTANT_AVATAR}" width="44" height="44" alt="Atendente virtual WebTurbo">
        <div class="chat-header-copy">
          <strong>WebTurbo</strong>
          <span><i></i> Atendimento on-line</span>
        </div>
        <button id="chat-close" class="chat-close" type="button" aria-label="Fechar chat">×</button>
      </header>

      <div id="chat-safety" class="chat-safety">Envio real ativado · ao confirmar, o pré-cadastro será criado no CRM</div>
      <div id="chat-messages" class="chat-messages" role="log" aria-live="polite" aria-label="Mensagens da conversa"></div>
      <div id="chat-typing" class="typing-row" hidden>
        <img class="message-avatar" src="${ASSISTANT_AVATAR}" width="30" height="30" alt="" aria-hidden="true">
        <span class="typing-bubble" aria-label="WebTurbo está digitando"><i></i><i></i><i></i></span>
      </div>
      <div id="chat-actions" class="chat-actions"></div>

      <form id="chat-form" class="chat-composer">
        <label class="sr-only" for="chat-input">Digite sua mensagem</label>
        <input id="chat-input" type="text" autocomplete="off" maxlength="500" placeholder="Digite sua mensagem">
        <button id="chat-send" type="submit" aria-label="Enviar mensagem">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-7-8-3Zm8 3 4-4"/></svg>
        </button>
      </form>
      <footer class="chat-footer">Protegido pela WebTurbo</footer>
    </section>

    <section id="resume-dialog" class="resume-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title" hidden>
      <div class="resume-card">
        <span class="resume-icon" aria-hidden="true">↻</span>
        <h2 id="resume-title">Atendimento anterior encontrado</h2>
        <p>Quer continuar de onde parou ou iniciar uma nova contratação?</p>
        <button id="resume-continue" class="primary-button" type="button">Continuar atendimento</button>
        <button id="resume-new" class="secondary-button" type="button">Iniciar nova contratação</button>
      </div>
    </section>
  `;
}

function openChat() {
  if (window.webturboChat?.open) {
    window.webturboChat.open();
    return;
  }
  pendingOpen = true;
}

function replacePrimaryWhatsAppCtas(root = document) {
  for (const id of DIRECT_WHATSAPP_IDS) {
    const element = root.getElementById?.(id) || root.querySelector?.(`#${id}`);
    if (!element) continue;
    if (element.dataset.webturboChatTrigger === "true") continue;
    element.dataset.webturboChatTrigger = "true";
    element.setAttribute("aria-label", "Abrir atendimento on-line da WebTurbo");
    element.removeAttribute("target");
    if (id === "metaFloatingWhats" || id === "botaoWhats") {
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
      element.style.setProperty("display", "none", "important");
    } else {
      element.textContent = "Atendimento on-line";
      if (element.tagName === "A") element.setAttribute("href", "#atendimento-online");
    }
  }

  for (const element of root.querySelectorAll?.("a[href*='wa.me']") || []) {
    if (element.closest(`#${ROOT_ID}`) || element.dataset.webturboChatTrigger === "true") continue;
    element.dataset.webturboChatTrigger = "true";
    element.setAttribute("aria-label", "Abrir atendimento on-line da WebTurbo");
    element.removeAttribute("target");
    element.setAttribute("href", "#atendimento-online");
    if (/whatsapp|falar com|contratar/i.test(element.textContent || "")) {
      element.textContent = "Atendimento on-line";
    }
  }
}

if (!document.getElementById(ROOT_ID)) {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "webturbo-chat-root";
  root.innerHTML = chatMarkup();
  document.body.appendChild(root);
}

window.WEBTURBO_CHAT_CONFIG = {
  ...(window.WEBTURBO_CHAT_CONFIG || {}),
  chatMode: "production",
  aiMode: "openai",
  coverageMode: "real",
  crmMode: "real",
  conversionMode: "real",
  whatsappMode: "real",
  aiAssistEndpoint: "https://webturbo-chat-ai-hydcvtcuga-rj.a.run.app/api/chat/assist"
};

document.addEventListener("click", (event) => {
  const target = event.target.closest?.("[data-webturbo-chat-trigger='true'], a[href*='wa.me']");
  if (!target || target.closest(`#${ROOT_ID}`)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openChat();
}, true);

replacePrimaryWhatsAppCtas();
new MutationObserver(() => replacePrimaryWhatsAppCtas()).observe(document.body, { childList: true, subtree: true });

await import("./app.js");
if (pendingOpen) window.webturboChat?.open?.();
