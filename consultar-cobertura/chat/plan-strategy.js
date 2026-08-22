// WebTurbo Chat — estratégia comercial de planos.
// O Chat mostra o catálogo principal primeiro. Ofertas de combate ficam fora do
// fluxo normal e permanecem reservadas para recuperação de abandono no site.
(function () {
  "use strict";

  if (window.__webturboChatPlanStrategyInstalled) return;
  window.__webturboChatPlanStrategyInstalled = true;

  const CATALOG = [
    { id: "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI", title: "500 Mega + 1 Ponto extra", badge: "Mais popular", price: "R$ 119,90", description: "Mais cobertura de Wi-Fi pela casa com um ponto extra.", features: "Ponto extra de Wi-Fi · Instalação grátis", featured: true },
    { id: "FIBRA 500MB", title: "500 Mega", badge: "", price: "R$ 99,90", description: "Internet fibra para navegação, vídeos e uso diário.", features: "Wi-Fi incluso · Instalação grátis" },
    { id: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY", title: "600 Mega + Ponto extra + Globoplay", badge: "Completo", price: "R$ 139,90", description: "Mais velocidade, cobertura de Wi-Fi e Globoplay no mesmo plano.", features: "Ponto extra · Globoplay · Instalação grátis" },
    { id: "FIBRA 500MB + GLOBOPLAY", title: "500 Mega + Globoplay", badge: "Globoplay", price: "R$ 114,80", description: "Internet fibra com Globoplay incluso.", features: "Globoplay incluso · Instalação grátis" },
    { id: "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI", title: "700 Mega + 1 Ponto extra", badge: "Alta velocidade", price: "R$ 149,90", description: "Mais velocidade e cobertura para vários aparelhos.", features: "Ponto extra de Wi-Fi · Instalação grátis" },
    { id: "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI", title: "1 Giga + 1 Ponto extra", badge: "Máxima velocidade", price: "R$ 159,90", description: "Máxima performance para casas com muitos dispositivos.", features: "Ponto extra de Wi-Fi · Instalação grátis" }
  ];

  function session() {
    try { return window.webturboChat?.getSession?.() || null; } catch (_) { return null; }
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
    button.setAttribute("aria-label", `Selecionar ${plan.title}, ${plan.price} por mês${plan.featured ? ", Mais popular" : ""}`);
    button.innerHTML = `
      ${plan.badge ? `<span class="chat-plan-badge">${plan.badge}</span>` : ""}
      <strong class="chat-plan-title">${plan.title}</strong>
      <span class="chat-plan-price">${plan.price}<small>/mês</small></span>
      <span class="chat-plan-description">${plan.description}</span>
      <span class="chat-plan-features">${plan.features}</span>
      <span class="chat-plan-cta">Escolher plano</span>
    `;
    return button;
  }

  function rewriteAssistantCopy(selection) {
    const previous = selection.previousElementSibling;
    const bubble = previous?.querySelector?.(".message-bubble") || (previous?.classList?.contains("message-bubble") ? previous : null);
    if (!bubble) return;
    const text = String(bubble.textContent || "");
    if (/tr[eê]s condi[cç][oõ]es especiais|ver mais ofertas|demais planos/i.test(text)) {
      bubble.textContent = "Escolha o plano que combina melhor com sua casa. O plano de 500 Mega com ponto extra é o mais popular.";
    }
  }

  function renderCatalog(selection) {
    if (!selection || selection.dataset.wtCatalogStrategy === "true") return;
    const hasPromo = Boolean(selection.querySelector('[data-value="FIBRA 300MB"], [data-value="FIBRA 500MB (Combate)"]'));
    if (!hasPromo) {
      // Mesmo quando o fluxo interno já estiver em catálogo, organizamos e removemos
      // qualquer atalho que volte às promoções durante a jornada principal.
      selection.querySelectorAll(".chat-back-promotions, [data-action='show-promotions'], [data-action='show-more-plans']").forEach((node) => node.remove());
      return;
    }

    forceCatalogView();
    selection.dataset.wtCatalogStrategy = "true";
    selection.setAttribute("aria-label", "Planos principais disponíveis");
    rewriteAssistantCopy(selection);

    const track = selection.querySelector(".chat-plan-track");
    if (!track) return;
    track.replaceChildren(...CATALOG.map(card));
    selection.querySelectorAll(".chat-more-plans").forEach((node) => node.remove());
  }

  function refresh() {
    document.querySelectorAll("#webturbo-chat-root .chat-plan-selection").forEach(renderCatalog);
  }

  // Antes do handler principal do Chat, garantimos que a seleção seja validada
  // contra o catálogo normal em vez das ofertas de combate.
  document.addEventListener("click", function (event) {
    const plan = event.target.closest?.("#webturbo-chat-root .chat-plan-card[data-action='select-plan']");
    if (plan) forceCatalogView();
  }, true);

  new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
})();
