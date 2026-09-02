// WebTurbo — apresentação principal dos planos no Hero.
// Destaca o plano comercial escolhido como "Mais vendido" por operadora/região.
(function () {
  "use strict";

  if (window.__webturboPlanPresentationV2Installed) return;
  window.__webturboPlanPresentationV2Installed = true;

  const BEST_SELLER_CODES = [
    "TIM_RS_800_YOUTUBE_PREMIUM",
    "TIM_SC_1000",
    "ALGAR_800",
    "MHNET_500_WIFI_EXTRA"
  ];

  const ORDER_GROUPS = [
    ["FIBRA 500MB + 1 PONTO EXTRA DE WI-FI", "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI"],
    ["FIBRA 500MB", "FIBRA 600MB"],
    ["FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY"],
    ["FIBRA 500MB + GLOBOPLAY"],
    ["FIBRA 700MB + 1 PONTO EXTRA DE WI-FI"],
    ["FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI"]
  ];

  const COPY = {
    "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI": { badge: "⭐ Mais vendido", title: "500 Mega + 1 Ponto extra", description: "Mais cobertura de Wi-Fi pela casa com um ponto extra.", recommended: true },
    "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI": { badge: "⭐ Mais vendido", title: "600 Mega + 1 Ponto extra", description: "Mais cobertura de Wi-Fi pela casa com um ponto extra.", recommended: true },
    "FIBRA 500MB": { badge: "Plano econômico", title: "500 Mega", description: "Internet fibra para navegação, vídeos e uso diário." },
    "FIBRA 600MB": { badge: "Plano econômico", title: "600 Mega", description: "Internet fibra para navegação, vídeos e uso diário." },
    "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY": { badge: "Completo", title: "600 Mega + Ponto extra + Globoplay", description: "Mais velocidade, cobertura de Wi-Fi e Globoplay no mesmo plano." },
    "FIBRA 500MB + GLOBOPLAY": { badge: "Globoplay", title: "500 Mega + Globoplay", description: "Internet fibra com Globoplay incluso." },
    "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI": { badge: "Alta velocidade", title: "700 Mega + 1 Ponto extra", description: "Mais velocidade e cobertura para vários aparelhos." },
    "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI": { badge: "Máxima performance", title: "1 Giga + 1 Ponto extra", description: "Máxima performance para casas com muitos dispositivos." }
  };

  function byId(id) { return document.getElementById(id); }
  function track(name, params) { try { window.trackGA4?.(name, params || {}); } catch (_) {} try { window.clarity?.("event", name); } catch (_) {} }
  function cardFor(plan) { return document.querySelector(`#metaPlanGrid .meta-plan-card[data-plan="${CSS.escape(plan)}"]`); }

  function cleanAria(value) {
    return String(value || "")
      .replace(/,\s*(?:⭐\s*)?Mais vendido/gi, "")
      .replace(/,\s*Mais popular/gi, "")
      .replace(/,\s*Oferta em destaque/gi, "")
      .trim();
  }

  function configureDynamicCards() {
    const grid = byId("metaPlanGrid");
    if (!grid) return false;

    const cards = Array.from(grid.querySelectorAll(".meta-plan-card[data-plan]"));
    const target = BEST_SELLER_CODES
      .map((code) => cards.find((card) => card.dataset.plan === code))
      .find(Boolean);

    if (!target) return false;

    cards.forEach((card) => {
      const code = String(card.dataset.plan || "");
      if (!/^(?:TIM|ALGAR|MHNET)_/.test(code)) return;

      const recommended = card === target;
      card.classList.toggle("is-popular", recommended);
      card.classList.toggle("wt-plan-recommended", recommended);
      card.classList.remove("wt-plan-premium");

      const badge = card.querySelector(".meta-plan-card-badge");
      if (badge) {
        badge.textContent = recommended ? "⭐ Mais vendido" : "Internet fibra";
        badge.hidden = false;
      }

      const aria = cleanAria(card.getAttribute("aria-label"));
      card.setAttribute("aria-label", recommended ? `${aria}, Mais vendido` : aria);
    });

    if (grid.firstElementChild !== target) grid.insertBefore(target, grid.firstElementChild);
    return true;
  }

  function configureCard(plan) {
    const card = cardFor(plan);
    const copy = COPY[plan];
    if (!card || !copy) return;
    card.classList.toggle("is-popular", Boolean(copy.recommended));
    card.classList.toggle("wt-plan-recommended", Boolean(copy.recommended));
    card.classList.remove("wt-plan-premium");
    const badge = card.querySelector(".meta-plan-card-badge");
    if (badge) { badge.textContent = copy.badge; badge.hidden = !copy.badge; }
    const title = card.querySelector("h3");
    if (title) title.textContent = copy.title;
    const description = card.querySelector(".meta-plan-card-description");
    if (description) description.textContent = copy.description;
    const priceText = card.querySelector(".meta-plan-card-price strong")?.textContent?.trim() || "";
    const qualifiers = [copy.recommended ? "Mais vendido" : ""].filter(Boolean).join(", ");
    card.setAttribute("aria-label", `${copy.title}, ${priceText} por mês${qualifiers ? `, ${qualifiers}` : ""}`);
  }

  function reorderCards() {
    if (configureDynamicCards()) return;

    const grid = byId("metaPlanGrid");
    if (!grid) return;
    ORDER_GROUPS.forEach((group) => {
      const plan = group.find((candidate) => cardFor(candidate));
      if (!plan) return;
      configureCard(plan);
      grid.appendChild(cardFor(plan));
    });
  }

  function selectedPlanLabel(selected) {
    return COPY[selected]?.title || selected.replace(/^FIBRA\s+/i, "").replace(/\bMB\b/g, " Mega").trim();
  }

  function updateHeader() {
    const step = byId("etapa2");
    if (!step) return;
    const selected = byId("mPlano")?.value || "";
    const header = step.querySelector(".modal-header h2");
    const subtitle = step.querySelector(".modal-subtitle");
    if (selected) {
      const label = selectedPlanLabel(selected);
      if (header) header.textContent = "Confirme seu plano";
      if (subtitle) subtitle.innerHTML = `Ótimo! O plano <strong>${label}</strong> está disponível no seu endereço — ele já está marcado abaixo, mas você pode trocar antes de continuar.`;
    } else {
      if (header) header.textContent = "Escolha seu plano";
      if (subtitle) subtitle.textContent = "Compare as opções disponíveis e escolha a melhor para sua casa.";
    }
  }

  function injectStyles() {
    if (byId("wt-plan-presentation-v2-styles")) return;
    const style = document.createElement("style");
    style.id = "wt-plan-presentation-v2-styles";
    style.textContent = `
      #metaPlanGrid .meta-plan-card.wt-plan-recommended{border-color:#00c853;background:linear-gradient(180deg,#f4fff8,#fff 46%);box-shadow:0 12px 30px rgba(0,200,83,.14)}
      #metaPlanGrid .meta-plan-card.wt-plan-recommended.is-selected{border-color:#1a56db;background:#f4f8ff;box-shadow:0 10px 28px rgba(26,86,219,.16)}
      #metaPlanGrid .meta-plan-card-badge[hidden]{display:none!important}
      #etapa2 .modal-subtitle strong{color:#7ee6a8;font-weight:800}
      @media(max-width:600px){#metaPlanGrid{grid-template-columns:1fr!important}#metaPlanGrid .meta-plan-card{min-height:0}#metaPlanGrid .meta-plan-card-description{min-height:0}}
    `;
    document.head.appendChild(style);
  }

  function refresh() { injectStyles(); reorderCards(); updateHeader(); }

  document.addEventListener("change", function (event) {
    if (event.target?.id === "mPlano") requestAnimationFrame(() => { updateHeader(); track("plano_principal_selecionado", { plano: event.target.value || "", origem: "hero" }); });
    if (event.target?.id === "mCidade") setTimeout(refresh, 0);
  }, true);
  document.addEventListener("input", function (event) { if (event.target?.id === "mCidade") setTimeout(refresh, 0); }, true);

  new MutationObserver(() => {
    const step = byId("etapa2");
    if (step && step.style.display !== "none") requestAnimationFrame(refresh);
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["style", "class", "data-plan"] });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
})();
