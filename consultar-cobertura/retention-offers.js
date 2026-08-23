// Modal de retenção por comportamento para a consulta de cobertura.
(function () {
  "use strict";

  const SHOWN_FLAG = "wt_retention_offers_shown_v1";
  const OFFERS = [
    {
      plan: "FIBRA 300MB",
      speed: "300 Mega",
      price: "79,90",
      value: 79.90,
      badge: "Menor mensalidade",
      description: "Uma opção econômica para navegar, assistir e usar seus aplicativos no dia a dia."
    },
    {
      plan: "FIBRA 500MB (Combate)",
      speed: "500 Mega",
      price: "89,90",
      oldPrice: "99,90",
      value: 89.90,
      badge: "Mais escolhido",
      ribbon: "★ Melhor custo-benefício",
      description: "Mais velocidade por apenas R$ 10 a mais que o plano de 300 Mega."
    },
    {
      plan: "FIBRA 700MB",
      speed: "700 Mega",
      price: "99,90",
      value: 99.90,
      badge: "Mais velocidade",
      description: "Alta velocidade para vários aparelhos, streaming, trabalho e jogos."
    }
  ];

  let overlay = null;
  let currentTrigger = "";
  let browserBackGuardArmed = false;
  let browserBackGuardConsumed = false;
  let suppressNextPopstate = false;

  function sessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function sessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function track(eventName, params) {
    try {
      if (typeof trackGA4 === "function") trackGA4(eventName, params || {});
    } catch (_) {}
  }

  function coverageValidated() {
    try {
      return typeof modalCoverageValidated !== "undefined" && modalCoverageValidated === true;
    } catch (_) {
      return false;
    }
  }

  function activeStep() {
    const ids = ["etapa1", "etapa2", "etapa3", "etapa4", "etapa5", "etapaSucesso"];
    const index = ids.findIndex((id) => {
      const el = document.getElementById(id);
      return el && window.getComputedStyle(el).display !== "none";
    });
    return index >= 0 ? index + 1 : 0;
  }

  function context() {
    return {
      etapa: activeStep(),
      cidade: document.getElementById("mCidade")?.value?.trim() || "",
      uf: document.getElementById("mUf")?.value?.trim()?.toUpperCase() || "",
      plano_atual: document.getElementById("mPlano")?.value || ""
    };
  }

  function registerMetadata() {
    try {
      if (typeof PLAN_LABELS !== "undefined") {
        PLAN_LABELS["FIBRA 300MB"] = "FIBRA 300MB — R$ 79,90/mês";
        PLAN_LABELS["FIBRA 500MB (Combate)"] = "FIBRA 500MB — R$ 89,90/mês";
        PLAN_LABELS["FIBRA 700MB"] = "FIBRA 700MB — R$ 99,90/mês";
      }
      if (typeof PLAN_VALUES !== "undefined") {
        PLAN_VALUES["FIBRA 300MB"] = 79.90;
        PLAN_VALUES["FIBRA 500MB (Combate)"] = 89.90;
        PLAN_VALUES["FIBRA 700MB"] = 99.90;
      }
    } catch (error) {
      console.warn("Não foi possível registrar as ofertas de retenção.", error);
    }
  }

  function ensureOption(offer) {
    const select = document.getElementById("mPlano");
    if (!select) return;

    let option = Array.from(select.options).find((item) => item.value === offer.plan);
    if (!option) {
      option = document.createElement("option");
      option.value = offer.plan;
      select.appendChild(option);
    }
    option.textContent = `${offer.speed} — R$ ${offer.price}/mês`;
    option.hidden = true;
  }

  function injectStyles() {
    if (document.getElementById("wt-retention-styles")) return;

    const style = document.createElement("style");
    style.id = "wt-retention-styles";
    style.textContent = `
      .wt-retention-overlay{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(7,22,55,.76);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
      .wt-retention-overlay.is-open{display:flex}
      .wt-retention-dialog{position:relative;width:min(620px,100%);max-height:min(92vh,860px);overflow:auto;border-radius:24px;background:#fff;box-shadow:0 30px 90px rgba(7,22,55,.38);padding:24px;color:#102554}
      .wt-retention-close{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:#eef3ff;color:#15346d;font-size:25px;line-height:1;cursor:pointer}
      .wt-retention-kicker{display:inline-flex;margin-bottom:8px;color:#174ea6;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
      .wt-retention-context{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#174ea6;font-size:11px;font-weight:800}
      .wt-retention-dialog h2{margin:0 42px 8px 0;color:#0a2463;font-size:clamp(23px,5vw,31px);line-height:1.08}
      .wt-retention-lead{margin:0 0 18px;color:#52627f;font-size:15px;line-height:1.5}
      .wt-retention-grid{display:grid;gap:12px}
      .wt-retention-offer{position:relative;width:100%;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;text-align:left;border:1px solid #dbe5fb;border-radius:16px;background:#f8faff;padding:14px;cursor:pointer;color:inherit;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
      .wt-retention-offer:hover,.wt-retention-offer:focus-visible{transform:translateY(-1px);border-color:#2d67d8;box-shadow:0 10px 24px rgba(24,72,160,.12);outline:none}
      .wt-retention-offer.is-featured{margin-top:5px;border:2px solid #00c853;background:linear-gradient(180deg,#f4fff8,#fff 42%);box-shadow:0 12px 28px rgba(0,200,83,.12)}
      .wt-retention-ribbon{position:absolute;top:-11px;left:14px;padding:4px 9px;border-radius:999px;background:#00c853;color:#053;font-size:10px;font-weight:900;box-shadow:0 5px 12px rgba(0,200,83,.18)}
      .wt-retention-badge{display:inline-block;margin-bottom:5px;border-radius:999px;background:#e8f0ff;color:#174ea6;padding:4px 8px;font-size:11px;font-weight:800}
      .wt-retention-offer.is-featured .wt-retention-badge{background:#d9f7e4;color:#046a34}
      .wt-retention-speed{display:block;color:#0a2463;font-size:19px;font-weight:900}
      .wt-retention-description{display:block;margin-top:3px;color:#66758f;font-size:12px;line-height:1.35}
      .wt-retention-description strong{color:#049945}
      .wt-retention-price{white-space:nowrap;color:#0a2463;text-align:right}
      .wt-retention-price-old{display:block;color:#9aa5ba;font-size:11px;font-weight:700;text-decoration:line-through;margin-bottom:2px}
      .wt-retention-price small{display:block;color:#72809a;font-size:10px;font-weight:700}
      .wt-retention-price strong{display:block;font-size:21px;line-height:1}
      .wt-retention-save{display:inline-block;margin-top:4px;padding:2px 7px;border-radius:6px;background:#e8fff1;color:#049945;font-size:9.5px;font-weight:900}
      .wt-retention-benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0;color:#405271;font-size:12px;font-weight:700}
      .wt-retention-benefits span{display:flex;align-items:center;gap:5px}
      .wt-retention-benefits span::before{content:"✓";color:#00a651;font-weight:900}
      .wt-retention-bridge{width:100%;border:1.5px dashed #c7d3f0;background:#f8faff;color:#1a56db;border-radius:12px;padding:12px 14px;font-size:13px;font-weight:800;cursor:pointer}
      .wt-retention-bridge:hover,.wt-retention-bridge:focus-visible{border-color:#1a56db;background:#f1f6ff;outline:none}
      .wt-retention-dismiss{width:100%;border:0;background:transparent;color:#6f7c92;padding:9px 10px 2px;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
      @media(max-width:560px){.wt-retention-overlay{align-items:flex-end;padding:8px}.wt-retention-dialog{width:100%;max-height:94vh;border-radius:22px 22px 16px 16px;padding:19px 14px 14px}.wt-retention-offer{padding:12px}.wt-retention-speed{font-size:17px}.wt-retention-price strong{font-size:19px}.wt-retention-benefits{grid-template-columns:1fr;gap:5px}}
      @media(prefers-reduced-motion:reduce){.wt-retention-offer{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function buildModal() {
    if (overlay) return overlay;

    injectStyles();
    overlay = document.createElement("div");
    overlay.className = "wt-retention-overlay";
    overlay.id = "wt-retention-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const offersHtml = OFFERS.map((offer) => {
      const featured = Boolean(offer.ribbon);
      const description = offer.plan === "FIBRA 500MB (Combate)"
        ? 'Mais velocidade por <strong>apenas R$ 10 a mais</strong> que o plano de 300 Mega.'
        : offer.description;
      const priceAnchor = offer.oldPrice
        ? `<span class="wt-retention-price-old">de R$ ${offer.oldPrice}</span>`
        : "";
      const save = offer.oldPrice
        ? `<span class="wt-retention-save">R$ 10 a menos por mês</span>`
        : "";
      return `
        <button type="button" class="wt-retention-offer${featured ? " is-featured" : ""}" data-retention-plan="${offer.plan}" aria-label="Escolher ${offer.speed} por R$ ${offer.price} por mês">
          ${offer.ribbon ? `<span class="wt-retention-ribbon">${offer.ribbon}</span>` : ""}
          <span>
            <span class="wt-retention-badge">${offer.badge}</span>
            <span class="wt-retention-speed">Internet Fibra ${offer.speed}</span>
            <span class="wt-retention-description">${description}</span>
          </span>
          <span class="wt-retention-price">${priceAnchor}<small>por apenas</small><strong>R$ ${offer.price}</strong><small>por mês</small>${save}</span>
        </button>
      `;
    }).join("");

    overlay.innerHTML = `
      <div class="wt-retention-dialog" role="dialog" aria-modal="true" aria-labelledby="wt-retention-title" aria-describedby="wt-retention-description">
        <button type="button" class="wt-retention-close" id="wt-retention-close" aria-label="Fechar ofertas especiais">×</button>
        <span class="wt-retention-kicker">Condições especiais</span>
        <div class="wt-retention-context">Condição especial para contratação online</div>
        <h2 id="wt-retention-title">Antes de sair, veja estas ofertas</h2>
        <p class="wt-retention-lead" id="wt-retention-description">Se o valor estava pesando na decisão, escolha uma destas opções para continuar sua contratação.</p>
        <div class="wt-retention-grid">${offersHtml}</div>
        <div class="wt-retention-benefits"><span>Internet fibra</span><span>Instalação grátis</span><span>Wi-Fi incluso</span></div>
        <button type="button" class="wt-retention-bridge" id="wt-retention-bridge">Quero mais velocidade ou streaming incluso →</button>
        <button type="button" class="wt-retention-dismiss" id="wt-retention-dismiss">Agora não</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-retention-plan]").forEach((button) => {
      button.addEventListener("click", function () {
        const offer = OFFERS.find((item) => item.plan === this.dataset.retentionPlan);
        if (offer) selectOffer(offer);
      });
    });

    overlay.querySelector("#wt-retention-close")?.addEventListener("click", () => hideModal(true));
    overlay.querySelector("#wt-retention-dismiss")?.addEventListener("click", () => hideModal(true));
    overlay.querySelector("#wt-retention-bridge")?.addEventListener("click", openMainPlans);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) hideModal(true);
    });

    return overlay;
  }

  function armBrowserBackGuard() {
    if (browserBackGuardArmed || browserBackGuardConsumed) return;
    if (sessionGet(SHOWN_FLAG)) return;
    if (!coverageValidated() || ![2, 3].includes(activeStep())) return;

    try {
      const previousState = history.state && typeof history.state === "object" && !Array.isArray(history.state)
        ? history.state
        : {};
      history.pushState({ ...previousState, wtRetentionGuard: true }, "", location.href);
      browserBackGuardArmed = true;
      track("retencao_voltar_navegador_armada", context());
    } catch (error) {
      console.warn("Não foi possível preparar o gatilho do botão voltar.", error);
    }
  }

  function releaseBrowserBackGuard() {
    if (!browserBackGuardArmed) return;

    browserBackGuardArmed = false;
    suppressNextPopstate = true;
    try {
      history.back();
    } catch (_) {
      suppressNextPopstate = false;
    }
  }

  function showModal(trigger) {
    if (sessionGet(SHOWN_FLAG)) return false;
    if (!coverageValidated()) return false;
    if (![2, 3].includes(activeStep())) return false;

    currentTrigger = trigger || "abandono_comportamental";
    sessionSet(SHOWN_FLAG, "1");

    if (currentTrigger !== "botao_voltar_navegador") {
      releaseBrowserBackGuard();
    }

    const modal = buildModal();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    const ctx = context();
    track("retencao_ofertas_exibida", {
      gatilho: currentTrigger,
      etapa: ctx.etapa,
      cidade: ctx.cidade,
      uf: ctx.uf,
      plano_atual: ctx.plano_atual
    });

    requestAnimationFrame(() => modal.querySelector("[data-retention-plan]")?.focus({ preventScroll: true }));
    return true;
  }

  function hideModal(manual) {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    if (manual) {
      const ctx = context();
      track("retencao_ofertas_recusada", {
        gatilho: currentTrigger,
        etapa: ctx.etapa,
        cidade: ctx.cidade,
        uf: ctx.uf,
        plano_atual: ctx.plano_atual
      });
    }
  }

  function openMainPlans() {
    const ctx = context();
    track("retencao_ver_planos_principais", {
      gatilho: currentTrigger,
      etapa: ctx.etapa,
      cidade: ctx.cidade,
      uf: ctx.uf,
      plano_atual: ctx.plano_atual
    });
    hideModal(false);
    if (typeof window.mostrarEtapa === "function") window.mostrarEtapa(2);
    setTimeout(() => document.getElementById("metaPlanGrid")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  function selectOffer(offer) {
    const select = document.getElementById("mPlano");
    if (!select) return;

    registerMetadata();
    ensureOption(offer);
    select.value = offer.plan;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const ctx = context();
    track("retencao_oferta_selecionada", {
      gatilho: currentTrigger,
      plano: offer.plan,
      valor: offer.value,
      cidade: ctx.cidade,
      uf: ctx.uf
    });

    hideModal(false);
    if (typeof window.sincronizarCardsPlanoLanding === "function") window.sincronizarCardsPlanoLanding();
    if (typeof window.mostrarEtapa === "function") window.mostrarEtapa(3);
  }

  function handleBrowserBackAttempt() {
    if (suppressNextPopstate) {
      suppressNextPopstate = false;
      return;
    }

    if (!browserBackGuardArmed || browserBackGuardConsumed) return;

    browserBackGuardArmed = false;
    browserBackGuardConsumed = true;

    const ctx = context();
    track("retencao_tentativa_voltar_navegador", {
      etapa: ctx.etapa,
      cidade: ctx.cidade,
      uf: ctx.uf,
      plano_atual: ctx.plano_atual
    });

    if (coverageValidated() && [2, 3].includes(activeStep()) && !sessionGet(SHOWN_FLAG)) {
      showModal("botao_voltar_navegador");
      return;
    }

    setTimeout(() => {
      try { history.back(); } catch (_) {}
    }, 0);
  }

  function patchStepNavigation() {
    if (typeof window.mostrarEtapa !== "function" || window.mostrarEtapa.__wtRetentionPatched) return;

    const original = window.mostrarEtapa;
    const patched = function (nextStep) {
      const previous = activeStep();
      const next = Number(nextStep);
      const result = original.apply(this, arguments);

      if ([2, 3].includes(next)) {
        setTimeout(armBrowserBackGuard, 0);
      } else if ([1, 4, 5, 6].includes(next)) {
        releaseBrowserBackGuard();
      }

      if (previous === 3 && next === 2) {
        setTimeout(() => showModal("voltou_dados_para_planos"), 0);
      }
      return result;
    };
    patched.__wtRetentionPatched = true;
    window.mostrarEtapa = patched;
  }

  function patchInternalClose() {
    if (typeof window.fecharModal !== "function" || window.fecharModal.__wtRetentionPatched) return;

    const original = window.fecharModal;
    const patched = function () {
      if ([2, 3].includes(activeStep()) && showModal("fechar_formulario")) return;
      return original.apply(this, arguments);
    };
    patched.__wtRetentionPatched = true;
    window.fecharModal = patched;
  }

  document.addEventListener("DOMContentLoaded", function () {
    registerMetadata();
    OFFERS.forEach(ensureOption);
    buildModal();
    patchStepNavigation();
    patchInternalClose();
    window.addEventListener("popstate", handleBrowserBackAttempt);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay?.classList.contains("is-open")) {
        event.preventDefault();
        hideModal(true);
      }
    });
  });
})();
