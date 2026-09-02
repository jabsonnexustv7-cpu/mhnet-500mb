// WebTurbo — destaque comercial do plano "Mais vendido" por operadora/região.
(function () {
  "use strict";

  if (window.__webturboBestSellerHighlightInstalled) return;
  window.__webturboBestSellerHighlightInstalled = true;

  const TARGETS = [
    "TIM_RS_800_YOUTUBE_PREMIUM",
    "TIM_SC_1000",
    "ALGAR_800",
    "MHNET_500_WIFI_EXTRA"
  ];

  function getGrid() {
    return document.getElementById("metaPlanGrid");
  }

  function getCards() {
    const grid = getGrid();
    return grid ? Array.from(grid.querySelectorAll(".meta-plan-card[data-plan]")) : [];
  }

  function targetCard(cards) {
    for (const code of TARGETS) {
      const card = cards.find((item) => item.dataset.plan === code);
      if (card) return card;
    }
    return null;
  }

  function cleanAriaLabel(value) {
    return String(value || "")
      .replace(/,\s*(?:⭐\s*)?Mais vendido/gi, "")
      .replace(/,\s*Mais popular/gi, "")
      .replace(/,\s*Oferta em destaque/gi, "")
      .trim();
  }

  function applyBestSellerHighlight() {
    const grid = getGrid();
    const cards = getCards();
    if (!grid || !cards.length) return;

    const target = targetCard(cards);
    if (!target) return;

    for (const card of cards) {
      const isTarget = card === target;
      const code = String(card.dataset.plan || "");
      const dynamicOperatorCard = /^(?:TIM|ALGAR|MHNET)_/.test(code);

      card.classList.toggle("is-popular", isTarget);
      card.classList.toggle("wt-plan-recommended", isTarget);

      const badge = card.querySelector(".meta-plan-card-badge");
      if (badge) {
        if (isTarget) {
          badge.textContent = "⭐ Mais vendido";
          badge.hidden = false;
        } else if (dynamicOperatorCard) {
          badge.textContent = "Internet fibra";
          badge.hidden = false;
        }
      }

      const ariaBase = cleanAriaLabel(card.getAttribute("aria-label"));
      card.setAttribute(
        "aria-label",
        isTarget ? `${ariaBase}, Mais vendido` : ariaBase
      );
    }

    // O plano destacado fica primeiro para aparecer imediatamente na etapa de escolha.
    if (grid.firstElementChild !== target) {
      grid.insertBefore(target, grid.firstElementChild);
    }
  }

  function wrapGlobalFunction(name) {
    const original = window[name];
    window[name] = function () {
      const result = typeof original === "function" ? original.apply(this, arguments) : undefined;
      applyBestSellerHighlight();
      return result;
    };
  }

  function install() {
    wrapGlobalFunction("sincronizarCardsPlanoLanding");
    wrapGlobalFunction("atualizarConfirmacaoLanding");
    applyBestSellerHighlight();

    document.addEventListener("change", function (event) {
      if (event.target?.id === "mCidade" || event.target?.id === "mPlano") {
        requestAnimationFrame(applyBestSellerHighlight);
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
