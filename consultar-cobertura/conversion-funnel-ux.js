// Ajustes de conversao do funil WebTurbo: retenção independente, instrumentação,
// personalização de plano e remoção da coleta redundante de data/turno de instalação.
(function () {
  "use strict";

  const COMBATE_FLAG = "wt_combate_offer_shown_v1";
  const RETENTION_FLAG = "wt_retention_offers_shown_v1";
  let combateAberto = false;
  let catalogoAberto = false;
  let patched = false;

  const byId = (id) => document.getElementById(id);

  function track(name, params) {
    const data = params || {};
    try { if (typeof window.trackGA4 === "function") window.trackGA4(name, data); } catch (_) {}
    try { if (typeof window.clarity === "function") window.clarity("event", name); } catch (_) {}
  }

  function sessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function sessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch (_) {}
  }

  function planContext() {
    return {
      plano: byId("mPlano")?.value || "",
      cidade: byId("mCidade")?.value?.trim() || "",
      uf: byId("mUf")?.value?.trim()?.toUpperCase() || ""
    };
  }

  function releaseRetentionFlagFromCombate() {
    // O modal de combate antigo gravava a flag de retenção. Mantemos a retenção
    // exclusiva para uma tentativa real de abandono e registramos uma flag própria.
    sessionRemove(RETENTION_FLAG);
    sessionSet(COMBATE_FLAG, "1");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'\"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[c]));
  }

  function personalizePlanConfirmation() {
    const step = byId("etapa2");
    if (!step) return;
    const plan = byId("mPlano")?.value || "";
    if (!plan) return;

    const label = plan
      .replace(/^FIBRA\s+/i, "")
      .replace(/\s*\(Combate\)\s*/i, "")
      .trim();

    const success = step.querySelector(".meta-coverage-success");
    if (success) {
      const html = `Ótima notícia! O plano <strong>${escapeHtml(label)}</strong> está disponível no seu endereço.`;
      if (success.innerHTML !== html) success.innerHTML = html;
    }

    const subtitle = step.querySelector(".modal-subtitle");
    if (subtitle) {
      const text = "Seu plano já está selecionado. Você pode continuar ou comparar outras opções.";
      if (subtitle.textContent !== text) subtitle.textContent = text;
    }
  }

  function hideInstallationPreferenceFields() {
    ["field-mDataInstalacao", "field-mTurnoInstalacao"].forEach((id) => {
      const el = byId(id);
      if (el) {
        el.hidden = true;
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
      }
    });

    const date = byId("mDataInstalacao");
    const shift = byId("mTurnoInstalacao");
    if (date && date.value) date.value = "";
    if (shift && shift.value) shift.value = "";
  }

  function removeInstallationSummary() {
    const summary = byId("modalResumo");
    if (!summary) return;
    summary.querySelectorAll(".summary-row").forEach((row) => {
      const label = row.querySelector("strong")?.textContent?.trim() || "";
      if (/prefer[eê]ncia de instala[cç][aã]o/i.test(label)) row.remove();
    });
  }

  function patchFunctions() {
    if (patched) return;
    patched = true;

    if (typeof window.atualizarCabecalhoLanding === "function" && !window.atualizarCabecalhoLanding.__wtConversionPatched) {
      const originalHeader = window.atualizarCabecalhoLanding;
      const wrappedHeader = function (step) {
        const result = originalHeader.apply(this, arguments);
        if (Number(step) === 4) {
          const title = byId("meta-landing-title");
          const description = byId("meta-landing-description");
          if (title) title.textContent = "Escolha o vencimento da sua fatura";
          if (description) description.textContent = "Selecione apenas o melhor dia de vencimento. Data e turno de instalação serão confirmados no atendimento.";
          hideInstallationPreferenceFields();
        }
        if (Number(step) === 2) personalizePlanConfirmation();
        return result;
      };
      wrappedHeader.__wtConversionPatched = true;
      window.atualizarCabecalhoLanding = wrappedHeader;
    }

    if (typeof window.validarEtapaInstalacao === "function" && !window.validarEtapaInstalacao.__wtConversionPatched) {
      const wrappedInstallStep = function () {
        hideInstallationPreferenceFields();
        const due = byId("mVencimento");
        try { if (typeof window.fieldReset === "function") window.fieldReset("mVencimento"); } catch (_) {}

        if (!due?.value) {
          try { if (typeof window.fieldError === "function") window.fieldError("mVencimento", "Selecione o vencimento."); } catch (_) {}
          due?.focus({ preventScroll: true });
          return;
        }

        try { if (typeof window.fieldOk === "function") window.fieldOk("mVencimento"); } catch (_) {}
        try { if (typeof window.montarResumo === "function") window.montarResumo(); } catch (_) {}
        removeInstallationSummary();
        track("vencimento_selecionado", { ...planContext(), vencimento: due.value });
        try { if (typeof window.mostrarEtapa === "function") window.mostrarEtapa(5); } catch (_) {}
      };
      wrappedInstallStep.__wtConversionPatched = true;
      window.validarEtapaInstalacao = wrappedInstallStep;
    }

    if (typeof window.buildModalPayload === "function" && !window.buildModalPayload.__wtConversionPatched) {
      const originalPayload = window.buildModalPayload;
      const wrappedPayload = function () {
        const payload = originalPayload.apply(this, arguments) || {};
        delete payload.dataInstalacao1;
        delete payload.turnoInstalacao1;
        return payload;
      };
      wrappedPayload.__wtConversionPatched = true;
      window.buildModalPayload = wrappedPayload;
    }

    if (typeof window.mostrarEtapa === "function" && !window.mostrarEtapa.__wtConversionObserved) {
      const originalStep = window.mostrarEtapa;
      const wrappedStep = function (step) {
        const result = originalStep.apply(this, arguments);
        const n = Number(step);
        if (n === 2) {
          requestAnimationFrame(() => {
            personalizePlanConfirmation();
            track("catalogo_exibido", planContext());
          });
        }
        if (n === 3) track("dados_pessoais_iniciados", planContext());
        if (n === 4) {
          hideInstallationPreferenceFields();
          track("etapa_vencimento_exibida", planContext());
        }
        if (n === 5) {
          removeInstallationSummary();
          track("resumo_exibido", planContext());
        }
        return result;
      };
      wrappedStep.__wtConversionObserved = true;
      window.mostrarEtapa = wrappedStep;
    }
  }

  function improveCombateUi(modal) {
    if (!modal) return;

    // Mantém apenas o ribbon "Mais escolhido" e elimina o espaço vazio do badge oculto.
    const featuredBadge = modal.querySelector(".wt-choice-v3-offer.is-featured .wt-choice-v3-badge");
    if (featuredBadge && featuredBadge.style.display !== "none") featuredBadge.style.display = "none";

    const morePlans = byId("wt-choice-v3-more-plans");
    if (morePlans) {
      const label = "Ver todos os planos e adicionais";
      const aria = "Ver todos os planos, opções com mais velocidade, Wi-Fi extra e Globoplay";
      if (morePlans.textContent !== label) morePlans.textContent = label;
      if (morePlans.getAttribute("aria-label") !== aria) morePlans.setAttribute("aria-label", aria);
    }
  }

  function observeUi() {
    const evaluate = () => {
      const modal = byId("wt-coverage-choice-v3");
      const open = Boolean(modal?.classList.contains("is-open"));
      if (modal) improveCombateUi(modal);

      if (open && !combateAberto) {
        combateAberto = true;
        releaseRetentionFlagFromCombate();
        track("combate_exibido", planContext());
      } else if (!open && combateAberto) {
        combateAberto = false;
      }

      const normalMode = document.body.classList.contains("wt-normal-plans-mode");
      if (normalMode && !catalogoAberto) {
        catalogoAberto = true;
        track("catalogo_completo_exibido", planContext());
      } else if (!normalMode && catalogoAberto) {
        catalogoAberto = false;
      }

      hideInstallationPreferenceFields();
      personalizePlanConfirmation();
    };

    new MutationObserver(evaluate).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    evaluate();
  }

  document.addEventListener("click", function (event) {
    const planButton = event.target.closest?.("[data-combate-plan]");
    if (planButton) {
      releaseRetentionFlagFromCombate();
      track("combate_plano_selecionado", {
        ...planContext(),
        plano: planButton.dataset.combatePlan || ""
      });
      return;
    }

    if (event.target.closest?.("#wt-choice-v3-more-plans")) {
      releaseRetentionFlagFromCombate();
      track("combate_ver_todos_planos", planContext());
      return;
    }

    if (event.target.closest?.("#wt-choice-v3-close")) {
      releaseRetentionFlagFromCombate();
      track("combate_fechado", planContext());
      return;
    }

    const normalPlanButton = event.target.closest?.("#conteudo-principal .plans-section .btn-contratar-plano");
    if (normalPlanButton) track("catalogo_plano_selecionado", planContext());
  }, true);

  function install() {
    patchFunctions();
    hideInstallationPreferenceFields();
    observeUi();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
