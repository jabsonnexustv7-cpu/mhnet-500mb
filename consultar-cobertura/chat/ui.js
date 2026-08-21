import { formatCep, maskCpf } from "./validators.js";
import { formatPrice } from "./plans.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createChatUI() {
  const panel = document.getElementById("chat-panel");
  const messages = document.getElementById("chat-messages");
  const actions = document.getElementById("chat-actions");
  const typing = document.getElementById("chat-typing");
  const input = document.getElementById("chat-input");
  const send = document.getElementById("chat-send");
  const debug = document.getElementById("debug-panel");

  function scrollToBottom() {
    requestAnimationFrame(() => messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" }));
  }

  function addMessage(message) {
    const row = element("div", `message-row message-row--${message.role}`);
    if (message.role === "assistant") {
      const avatar = element("span", "message-avatar", "W");
      avatar.setAttribute("aria-hidden", "true");
      row.appendChild(avatar);
    }
    const bubble = element("div", `message-bubble${message.meta?.kind === "status" ? " message-bubble--status" : ""}`);
    bubble.textContent = message.text;
    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToBottom();
  }

  function clearConversation() {
    messages.replaceChildren();
    clearActions();
  }

  function setTyping(visible) {
    typing.hidden = !visible;
    if (visible) scrollToBottom();
  }

  function clearActions() {
    actions.replaceChildren();
  }

  function showQuickReplies(items) {
    clearActions();
    const wrap = element("div", "quick-replies");
    items.forEach((item) => {
      const button = element("button", "quick-reply", item.label);
      button.type = "button";
      button.dataset.action = item.action;
      wrap.appendChild(button);
    });
    actions.appendChild(wrap);
    scrollToBottom();
  }

  function showPlans(plans) {
    clearActions();
    const track = element("div", "chat-plan-track");
    plans.forEach((plan) => {
      const card = element("button", "chat-plan-card");
      card.type = "button";
      card.dataset.action = "select-plan";
      card.dataset.value = plan.id;
      card.setAttribute("aria-label", `Selecionar ${plan.title}, ${formatPrice(plan.price)} por mês`);

      card.appendChild(element("span", "chat-plan-badge", plan.badge));
      card.appendChild(element("strong", "chat-plan-title", plan.title));
      const price = element("span", "chat-plan-price", formatPrice(plan.price));
      price.appendChild(element("small", "", "/mês"));
      card.appendChild(price);
      card.appendChild(element("span", "chat-plan-description", plan.description));
      const features = element("span", "chat-plan-features", plan.features.join(" · "));
      card.appendChild(features);
      card.appendChild(element("span", "chat-plan-cta", "Escolher plano"));
      track.appendChild(card);
    });
    actions.appendChild(track);
    scrollToBottom();
  }

  function showSummary(session) {
    messages.querySelector(".chat-summary")?.remove();
    const summary = element("section", "chat-summary");
    summary.setAttribute("aria-label", "Resumo da contratação");
    summary.appendChild(element("h3", "", "Resumo da simulação"));
    const rows = [
      ["Endereço", `${session.logradouro || "CEP informado"}, ${session.numero}${session.bairro ? ` · ${session.bairro}` : ""}${session.cidade ? ` · ${session.cidade}/${session.uf}` : ""}`],
      ["Complemento", session.complemento || "-"],
      ["Plano", `${session.plano?.title || "-"} · ${session.plano ? formatPrice(session.plano.price) : "-"}/mês`],
      ["Cliente", session.nome],
      ["CPF", maskCpf(session.cpf)],
      ["Nascimento", session.dataNascimento.split("-").reverse().join("/")],
      ["E-mail", session.email],
      ["Telefone", session.telefone]
    ];
    rows.forEach(([label, value]) => {
      const row = element("div", "summary-row");
      row.appendChild(element("span", "", label));
      row.appendChild(element("strong", "", value));
      summary.appendChild(row);
    });
    messages.appendChild(summary);
    scrollToBottom();
  }

  function removeSummary() {
    messages.querySelector(".chat-summary")?.remove();
  }

  function showFinalPayload(payload) {
    messages.querySelector(".final-payload-card")?.remove();
    const card = element("div", "final-payload-card");
    card.appendChild(element("strong", "", "CRM MOCK"));
    card.appendChild(element("span", "", "Payload gerado localmente — POST bloqueado"));
    messages.appendChild(card);
    scrollToBottom();
  }

  function setComposerEnabled(enabled) {
    input.disabled = !enabled;
    send.disabled = !enabled;
  }

  function setPlaceholder(value) {
    input.placeholder = value;
    if (!input.disabled && panel.classList.contains("is-open")) input.focus({ preventScroll: true });
  }

  function updateDebug(session, config) {
    if (!debug) return;
    const coverage = session.cobertura?.status || "-";
    const fields = {
      "Session ID": session.sessionId,
      "Estado atual": session.step,
      CEP: session.cep ? formatCep(session.cep) : "-",
      Cidade: session.cidade ? `${session.cidade}/${session.uf}` : "-",
      Cobertura: coverage,
      Plano: session.plano?.id || "-",
      Nome: session.nome || "-",
      "CRM mode": config.crmMode,
      "Chat mode": config.chatMode,
      "Coverage mode": `${config.coverageMode}${session.cobertura?.source ? ` (${session.cobertura.source})` : ""}`
    };
    const list = debug.querySelector("[data-debug-fields]");
    list.replaceChildren();
    Object.entries(fields).forEach(([label, value]) => {
      const row = element("div", "debug-field");
      row.appendChild(element("span", "", label));
      row.appendChild(element("strong", "", value));
      list.appendChild(row);
    });
    debug.querySelector("[data-debug-session]").textContent = JSON.stringify(session, null, 2);
    debug.querySelector("[data-debug-payload]").textContent = session.crmPayload ? JSON.stringify(session.crmPayload, null, 2) : "Payload ainda não gerado.";
  }

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("chat-open");
    input.focus({ preventScroll: true });
    scrollToBottom();
  }

  function close() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chat-open");
  }

  return {
    addMessage,
    clearConversation,
    setTyping,
    clearActions,
    showQuickReplies,
    showPlans,
    showSummary,
    removeSummary,
    showFinalPayload,
    setComposerEnabled,
    setPlaceholder,
    updateDebug,
    open,
    close,
    input
  };
}
