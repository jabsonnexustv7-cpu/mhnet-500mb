// Regras regionais da etapa de planos da consulta de cobertura.
(function () {
  "use strict";

  const REGIONAL_CITIES = new Set(["sorocaba", "votorantim", "itapetininga", "ipero"]);
  const PLAN_500 = "FIBRA 500MB";
  const PLAN_600 = "FIBRA 600MB";
  const PLAN_500_EXTRA = "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI";
  const PLAN_600_EXTRA = "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI";

  function normalizeCity(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function isRegionalCity() {
    return REGIONAL_CITIES.has(normalizeCity(document.getElementById("mCidade")?.value));
  }

  function ensurePlanOption(select, value, label) {
    let option = Array.from(select.options).find((item) => item.value === value);
    if (!option) {
      option = document.createElement("option");
      option.value = value;
      select.appendChild(option);
    }
    option.textContent = label;
    return option;
  }

  function setOptionAvailability(select, value, enabled) {
    const option = Array.from(select.options).find((item) => item.value === value);
    if (!option) return;
    option.disabled = !enabled;
    option.hidden = !enabled;
  }

  function findCard(plans) {
    return Array.from(document.querySelectorAll(".meta-plan-card")).find((card) => plans.includes(card.dataset.plan));
  }

  function setCardTitle(card, text) {
    const title = card?.querySelector("h3");
    if (title) title.textContent = text;
  }

  function setFirstSpeedBullet(card, text) {
    if (!card) return;
    const bullets = Array.from(card.querySelectorAll("li"));
    const speedBullet = bullets.find((item) => /\b500\s*MB\b|\b600\s*MB\b/i.test(item.textContent || ""));
    if (speedBullet) speedBullet.textContent = text;
  }

  function registerPlanMetadata() {
    try {
      if (typeof PLAN_LABELS !== "undefined") {
        PLAN_LABELS[PLAN_600] = "FIBRA 600MB — R$ 99,90/mês";
        PLAN_LABELS[PLAN_600_EXTRA] = "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI — R$ 119,90/mês";
      }
      if (typeof PLAN_VALUES !== "undefined") {
        PLAN_VALUES[PLAN_600] = 99.90;
        PLAN_VALUES[PLAN_600_EXTRA] = 119.90;
      }
    } catch (error) {
      console.warn("Não foi possível registrar os planos regionais.", error);
    }
  }

  function applyRegionalPlans() {
    const select = document.getElementById("mPlano");
    if (!select) return;

    registerPlanMetadata();

    ensurePlanOption(select, PLAN_600, "FIBRA 600MB — R$ 99,90/mês");
    ensurePlanOption(select, PLAN_600_EXTRA, "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI — R$ 119,90/mês");

    const regional = isRegionalCity();
    const standardCard = findCard([PLAN_500, PLAN_600]);
    const extraCard = findCard([PLAN_500_EXTRA, PLAN_600_EXTRA]);

    if (regional) {
      if (standardCard) {
        standardCard.dataset.plan = PLAN_600;
        standardCard.setAttribute("aria-label", "600 Mega, R$ 99,90 por mês");
        setCardTitle(standardCard, "600 Mega");
      }
      if (extraCard) {
        extraCard.dataset.plan = PLAN_600_EXTRA;
        extraCard.setAttribute("aria-label", "600 Mega com um ponto extra de Wi-Fi, R$ 119,90 por mês, Mais popular");
        setCardTitle(extraCard, "600MB + 1 Ponto extra");
        setFirstSpeedBullet(extraCard, "600MB de internet fibra WebTurbo");
      }

      setOptionAvailability(select, PLAN_500, false);
      setOptionAvailability(select, PLAN_500_EXTRA, false);
      setOptionAvailability(select, PLAN_600, true);
      setOptionAvailability(select, PLAN_600_EXTRA, true);

      if (select.value === PLAN_500) select.value = PLAN_600;
      if (select.value === PLAN_500_EXTRA) select.value = PLAN_600_EXTRA;
    } else {
      if (standardCard) {
        standardCard.dataset.plan = PLAN_500;
        standardCard.setAttribute("aria-label", "500 Mega, R$ 99,90 por mês");
        setCardTitle(standardCard, "500 Mega");
      }
      if (extraCard) {
        extraCard.dataset.plan = PLAN_500_EXTRA;
        extraCard.setAttribute("aria-label", "500 Mega com um ponto extra de Wi-Fi, R$ 119,90 por mês, Mais popular");
        setCardTitle(extraCard, "500MB + 1 Ponto extra");
        setFirstSpeedBullet(extraCard, "500MB de internet fibra WebTurbo");
      }

      setOptionAvailability(select, PLAN_500, true);
      setOptionAvailability(select, PLAN_500_EXTRA, true);
      setOptionAvailability(select, PLAN_600, false);
      setOptionAvailability(select, PLAN_600_EXTRA, false);

      if (select.value === PLAN_600) select.value = PLAN_500;
      if (select.value === PLAN_600_EXTRA) select.value = PLAN_500_EXTRA;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    registerPlanMetadata();
    applyRegionalPlans();

    const cityInput = document.getElementById("mCidade");
    cityInput?.addEventListener("input", applyRegionalPlans);
    cityInput?.addEventListener("change", applyRegionalPlans);

    const originalSync = window.sincronizarCardsPlanoLanding;
    window.sincronizarCardsPlanoLanding = function () {
      applyRegionalPlans();
      return typeof originalSync === "function" ? originalSync.apply(this, arguments) : undefined;
    };

    const originalConfirmation = window.atualizarConfirmacaoLanding;
    window.atualizarConfirmacaoLanding = function () {
      applyRegionalPlans();
      return typeof originalConfirmation === "function" ? originalConfirmation.apply(this, arguments) : undefined;
    };
  });
})();
