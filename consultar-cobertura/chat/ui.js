import { formatCep, formatPhone, maskCpf } from "./validators.js";
import { formatPrice } from "./plans.js";

const ASSISTANT_AVATAR_SRC = "/consultar-cobertura/chat/assets/webturbo-assistente.png";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function assistantAvatar(className = "message-avatar", { decorative = true } = {}) {
  const avatar = element("img", className);
  avatar.src = ASSISTANT_AVATAR_SRC;
  avatar.width = className === "chat-header-avatar" ? 44 : 30;
  avatar.height = avatar.width;
  avatar.alt = decorative ? "" : "Atendente virtual WebTurbo";
  if (decorative) avatar.setAttribute("aria-hidden", "true");
  return avatar;
}

export function createChatUI() {
  const panel = document.getElementById("chat-panel");
  const backdrop = document.getElementById("chat-backdrop");
  const launcher = document.getElementById("chat-launcher");
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
      row.appendChild(assistantAvatar());
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
      if (item.value !== undefined) button.dataset.value = item.value;
      wrap.appendChild(button);
    });
    actions.appendChild(wrap);
    scrollToBottom();
  }

  function showAddressConfirmation(session) {
    messages.querySelector(".address-confirmation-card")?.remove();
    const card = element("section", "chat-summary address-confirmation-card");
    card.setAttribute("aria-label", "Endereço localizado para conferência");
    card.appendChild(element("h3", "", "Confira o endereço localizado"));
    const rows = [
      ["Endereço", `${session.logradouro || "Logradouro não identificado"}${session.numero ? `, ${session.numero}` : ""}`],
      ["Bairro", session.bairro || "-"],
      ["Cidade", session.cidade ? `${session.cidade}/${session.uf || ""}` : "-"],
      ["CEP", session.cep ? formatCep(session.cep) : "Localizado pelas coordenadas"]
    ];
    rows.forEach(([label, value]) => {
      const row = element("div", "summary-row");
      row.appendChild(element("span", "", label));
      row.appendChild(element("strong", "", value));
      card.appendChild(row);
    });
    if (session.addressSource === "geolocation" && session.locationAccuracy) {
      card.appendChild(element("small", "", `Localização do aparelho · precisão aproximada de ${session.locationAccuracy} m`));
    }
    messages.appendChild(card);
    showQuickReplies([
      { label: "Está correto", action: "confirm-address" },
      { label: "Corrigir endereço", action: "new-address" }
    ]);
    scrollToBottom();
  }

  function showPlans(plans, { showMore = false, showPromotions = false } = {}) {
    clearActions();
    const track = element("div", "chat-plan-track");
    plans.forEach((plan) => {
      const card = element("button", "chat-plan-card");
      if (plan.featured) card.classList.add("is-featured");
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
    if (showMore) {
      const more = element("button", "chat-more-plans", "Ver mais ofertas");
      more.type = "button";
      more.dataset.action = "show-more-plans";
      actions.appendChild(more);
    }
    if (showPromotions) {
      const back = element("button", "chat-more-plans chat-back-promotions", "← Voltar às promoções");
      back.type = "button";
      back.dataset.action = "show-promotions";
      actions.appendChild(back);
    }
    scrollToBottom();
  }

  function showDatePicker(minDate) {
    clearActions();
    const wrap = element("div", "date-picker-action");
    const label = element("label", "", "Data preferida");
    label.htmlFor = "installation-date-input";
    const input = element("input");
    input.id = "installation-date-input";
    input.type = "date";
    input.min = minDate;
    input.value = minDate;
    const button = element("button", "date-picker-submit", "Usar esta data");
    button.type = "button";
    button.dataset.action = "select-installation-date";
    wrap.append(label, input, button);
    actions.appendChild(wrap);
    scrollToBottom();
  }

  function showSummary(session) {
    messages.querySelector(".chat-summary:not(.address-confirmation-card)")?.remove();
    const summary = element("section", "chat-summary");
    summary.setAttribute("aria-label", "Resumo da contratação");
    summary.appendChild(element("h3", "", "Resumo da simulação"));
    const rows = [
      ["Endereço", `${session.logradouro || "CEP informado"}, ${session.numero}${session.bairro ? ` · ${session.bairro}` : ""}${session.cidade ? ` · ${session.cidade}/${session.uf}` : ""}`],
      ["Complemento", session.complemento || "-"],
      ["Plano", `${session.plano?.title || "-"} · ${session.plano ? formatPrice(session.plano.price) : "-"}/mês`],
      ["Fatura proporcional", session.faturamento?.proportional || "-"],
      ["Primeira fatura cheia", session.faturamento?.full || "-"],
      ["Cliente", session.nome],
      ["CPF", maskCpf(session.cpf)],
      ["Nascimento", session.dataNascimento.split("-").reverse().join("/")],
      ["E-mail", session.email],
      ["Contato principal", formatPhone(session.telefone)],
      ["Segundo contato", formatPhone(session.telefoneSecundario)],
      ["Vencimento", `Dia ${session.diaVencimentoFatura}`],
      ["Instalação", `${session.dataInstalacao.split("-").reverse().join("/")} · ${session.turnoInstalacao}`]
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
    messages.querySelectorAll(".chat-summary").forEach((node) => node.remove());
  }

  function showFinalPayload(payload) {
    messages.querySelector(".final-payload-card")?.remove();
    const card = element("div", "final-payload-card");
    card.appendChild(element("strong", "", "CRM MOCK"));
    card.appendChild(element("span", "", "Payload gerado localmente — POST bloqueado"));
    messages.appendChild(card);
    scrollToBottom();
  }

  function showPostSaleSuccess() {
    messages.querySelector(".post-sale-card")?.remove();
    const card = element("section", "post-sale-card");
    card.appendChild(element("span", "post-sale-icon", "✓"));
    card.appendChild(element("h3", "", "Cadastro recebido com sucesso!"));
    card.appendChild(element("p", "", "Sua solicitação foi enviada para nossa equipe de agendamento."));
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
    if (!config.debug) {
      debug.hidden = true;
      debug.querySelector("[data-debug-session]").textContent = "";
      debug.querySelector("[data-debug-payload]").textContent = "";
      return;
    }
    debug.hidden = false;
    const coverage = session.cobertura?.status || "-";
    const fields = {
      "Session ID": session.sessionId,
      "Estado atual": session.step,
      CEP: session.cep ? formatCep(session.cep) : "-",
      Cidade: session.cidade ? `${session.cidade}/${session.uf}` : "-",
      "Origem do endereço": session.addressSource || "-",
      "Endereço confirmado": session.addressConfirmed ? "yes" : "no",
      Coordenadas: session.coordenadas || "-",
      Cobertura: coverage,
      Plano: session.plano?.id || "-",
      Nome: session.nome || "-",
      "Segundo contato": session.telefoneSecundario || "-",
      Vencimento: session.diaVencimentoFatura || "-",
      Instalação: session.dataInstalacao ? `${session.dataInstalacao} · ${session.turnoInstalacao || "-"}` : "-",
      "CRM mode": config.crmMode,
      "Conversion mode": config.conversionMode,
      "WhatsApp mode": config.whatsappMode,
      "Chat mode": config.chatMode,
      "AI mode": config.aiMode,
      "OpenAI configured": session.ai?.openAiConfigured === true ? "yes" : session.ai?.openAiConfigured === false ? "no" : "checking",
      "AI calls this session": session.ai?.calls || 0,
      "Last routing decision": session.ai?.lastRoutingDecision || "-",
      "Last AI intent": session.ai?.lastIntent || "-",
      "Current flowStep": session.flowStep || session.step,
      conversationMode: session.conversationMode || "FLOW",
      "Last systemAction": session.ai?.lastSystemAction || "NONE",
      "AI latency": session.ai?.latencyMs ? `${session.ai.latencyMs} ms` : "-",
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
    backdrop?.classList.add("is-open");
    backdrop?.setAttribute("aria-hidden", "false");
    launcher?.setAttribute("aria-expanded", "true");
    document.body.classList.add("chat-open");
    input.focus({ preventScroll: true });
    scrollToBottom();
  }

  function close() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    backdrop?.classList.remove("is-open");
    backdrop?.setAttribute("aria-hidden", "true");
    launcher?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-open");
    launcher?.focus({ preventScroll: true });
  }

  return {
    addMessage,
    clearConversation,
    setTyping,
    clearActions,
    showQuickReplies,
    showAddressConfirmation,
    showPlans,
    showDatePicker,
    showSummary,
    removeSummary,
    showFinalPayload,
    showPostSaleSuccess,
    setComposerEnabled,
    setPlaceholder,
    updateDebug,
    open,
    close,
    input
  };
}
