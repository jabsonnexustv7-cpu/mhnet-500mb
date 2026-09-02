// WebTurbo Chat — estratégia comercial de planos.
// Mantém o catálogo real retornado pela cobertura e aplica o destaque "Mais vendido".
// O catálogo fixo abaixo existe somente como fallback para o fluxo legado MhNet.
(function () {
  "use strict";

  if (window.__webturboChatPlanStrategyInstalled) return;
  window.__webturboChatPlanStrategyInstalled = true;

  const REGIONAL_CITIES = new Set(["sorocaba", "votorantim", "itapetininga", "ipero"]);
  const BEST_SELLER_IDS = new Set([
    "TIM_RS_800_YOUTUBE_PREMIUM",
    "TIM_SC_1000",
    "ALGAR_800",
    "MHNET_500_WIFI_EXTRA",
    "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI",
    "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI"
  ]);

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  }

  function session() {
    try { return window.webturboChat?.getSession?.() || null; } catch (_) { return null; }
  }

  function catalog() {
    const current = session();
    const regional = REGIONAL_CITIES.has(normalize(current?.cidade));
    return [
      { id: regional ? "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI" : "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI", title: regional ? "600 Mega + 1 Ponto extra" : "500 Mega + 1 Ponto extra", badge: "⭐ Mais vendido", price: "R$ 119,90", description: "Mais cobertura de Wi-Fi pela casa com um ponto extra.", features: "Ponto extra de Wi-Fi · Instalação grátis", featured: true },
      { id: regional ? "FIBRA 600MB" : "FIBRA 500MB", title: regional ? "600 Mega" : "500 Mega", badge: "", price: "R$ 99,90", description: "Internet fibra para navegação, vídeos e uso diário.", features: "Wi-Fi incluso · Instalação grátis" },
      { id: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY", title: "600 Mega + Ponto extra + Globoplay", badge: "Completo", price: "R$ 139,90", description: "Mais velocidade, cobertura de Wi-Fi e Globoplay no mesmo plano.", features: "Ponto extra · Globoplay · Instalação grátis" },
      { id: "FIBRA 500MB + GLOBOPLAY", title: "500 Mega + Globoplay", badge: "Globoplay", price: "R$ 114,80", description: "Internet fibra com Globoplay incluso.", features: "Globoplay incluso · Instalação grátis" },
      { id: "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI", title: "700 Mega + 1 Ponto extra", badge: "Alta velocidade", price: "R$ 149,90", description: "Mais velocidade e cobertura para vários aparelhos.", features: "Ponto extra de Wi-Fi · Instalação grátis" },
      { id: "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI", title: "1 Giga + 1 Ponto extra", badge: "Máxima velocidade", price: "R$ 159,90", description: "Máxima performance para casas com muitos dispositivos.", features: "Ponto extra de Wi-Fi · Instalação grátis" }
    ];
  }

  function forceCatalogView() {
    const current = session();
    if (current) current.planSelectionView = "catalog";
  }

  function card(plan) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-plan-card${plan.featured ? " is-featured" : ""}`;
    button.dataset.action = "select-plan";
    button.dataset.value = plan.id;
    button.setAttribute("aria-label", `Selecionar ${plan.title}, ${plan.price} por mês${plan.featured ? ", Mais vendido" : ""}`);
    button.innerHTML = `${plan.badge ? `<span class="chat-plan-badge">${plan.badge}</span>` : ""}<strong class="chat-plan-title">${plan.title}</strong><span class="chat-plan-price">${plan.price}<small>/mês</small></span><span class="chat-plan-description">${plan.description}</span><span class="chat-plan-features">${plan.features}</span><span class="chat-plan-cta">Escolher plano</span>`;
    return button;
  }

  function rewriteAssistantCopy(selection) {
    const previous = selection.previousElementSibling;
    const bubble = previous?.querySelector?.(".message-bubble") || (previous?.classList?.contains("message-bubble") ? previous : null);
    if (!bubble) return;
    const text = String(bubble.textContent || "");
    if (/tr[eê]s condi[cç][oõ]es especiais|ver mais ofertas|demais planos|mais popular/i.test(text)) {
      bubble.textContent = "Escolha o plano que combina melhor com sua casa. O plano destacado é o mais vendido entre as opções apresentadas.";
    }
  }

  function applyBestSeller(selection) {
    const track = selection?.querySelector(".chat-plan-track");
    if (!track) return;
    const cards = Array.from(track.querySelectorAll(".chat-plan-card[data-value]"));
    const target = cards.find((item) => BEST_SELLER_IDS.has(String(item.dataset.value || "")));
    if (!target) return;

    cards.forEach((item) => {
      const isTarget = item === target;
      item.classList.toggle("is-featured", isTarget);
      const badge = item.querySelector(".chat-plan-badge");
      if (!badge) return;
      const currentText = String(badge.textContent || "").trim();
      if (isTarget) {
        if (currentText !== "⭐ Mais vendido") badge.textContent = "⭐ Mais vendido";
      } else if (/^(Oferta em destaque|Plano recomendado|Mais popular|⭐ Mais vendido)$/i.test(currentText)) {
        badge.textContent = "";
      }
    });

    if (track.firstElementChild !== target) track.insertBefore(target, track.firstElementChild);
    const label = String(target.getAttribute("aria-label") || "").replace(/,\s*(?:⭐\s*)?Mais (?:popular|vendido)$/i, "");
    const nextLabel = `${label}, Mais vendido`;
    if (target.getAttribute("aria-label") !== nextLabel) target.setAttribute("aria-label", nextLabel);
  }

  function renderCatalog(selection) {
    if (!selection) return;
    const hasPromo = Boolean(selection.querySelector('[data-value="FIBRA 300MB"], [data-value="FIBRA 500MB (Combate)"]'));
    if (hasPromo) {
      forceCatalogView();
      selection.dataset.wtCatalogStrategy = "true";
      selection.setAttribute("aria-label", "Planos principais disponíveis");
      rewriteAssistantCopy(selection);
      const track = selection.querySelector(".chat-plan-track");
      if (track) track.replaceChildren(...catalog().map(card));
      selection.querySelectorAll(".chat-more-plans").forEach((node) => node.remove());
    } else {
      selection.querySelectorAll(".chat-back-promotions, [data-action='show-promotions'], [data-action='show-more-plans']").forEach((node) => node.remove());
    }
    applyBestSeller(selection);
  }

  function refresh() {
    document.querySelectorAll("#webturbo-chat-root .chat-plan-selection").forEach(renderCatalog);
  }

  document.addEventListener("click", function (event) {
    const plan = event.target.closest?.("#webturbo-chat-root .chat-plan-card[data-action='select-plan']");
    if (plan) forceCatalogView();
  }, true);

  new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
})();
