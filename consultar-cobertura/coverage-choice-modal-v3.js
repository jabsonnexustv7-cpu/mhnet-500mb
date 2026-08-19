// Modal de ofertas especiais apos confirmacao de cobertura.
(function () {
  "use strict";

  const RETENTION_SHOWN_FLAG = "wt_retention_offers_shown_v1";
  const OFFERS = [
    {
      plan: "FIBRA 300MB",
      speed: "300 Mega",
      price: "79,90",
      value: 79.90,
      badge: "Menor mensalidade",
      description: "Internet fibra para navegar, assistir e usar seus aplicativos no dia a dia."
    },
    {
      plan: "FIBRA 500MB (Combate)",
      speed: "500 Mega",
      price: "89,90",
      value: 89.90,
      badge: "Mais escolhido",
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
  let activeOptions = {};
  let previousBodyOverflow = "";
  let ctaWasVisible = false;
  let promoSelectionActive = false;
  let stepNavigationPatched = false;

  const byId = (id) => document.getElementById(id);
  const digits = (value) => String(value || "").replace(/\D+/g, "");

  function sessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function track(name, params) {
    try { if (typeof trackGA4 === "function") trackGA4(name, params || {}); } catch (_) {}
  }

  function currentData() {
    if (activeOptions && activeOptions.data) return activeOptions.data;
    try { if (typeof coberturaPaginaData !== "undefined" && coberturaPaginaData) return coberturaPaginaData; } catch (_) {}
    return {
      cep: byId("cep")?.value || byId("mCep")?.value || "",
      numero: byId("numero")?.value || byId("mNumero")?.value || "",
      logradouro: byId("mLogradouro")?.value || byId("consultaLogradouro")?.value || "",
      bairro: byId("mBairro")?.value || byId("consultaBairro")?.value || "",
      cidade: byId("mCidade")?.value || byId("consultaCidade")?.value || "",
      uf: byId("mUf")?.value || byId("consultaUf")?.value || ""
    };
  }

  function formatCep(value) {
    const d = digits(value);
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(value || "").trim();
  }

  function formatAddress(data) {
    const first = [data.logradouro, data.numero].map(v => String(v || "").trim()).filter(Boolean).join(", ");
    const location = [data.cidade, String(data.uf || "").trim().toUpperCase()].filter(Boolean).join("/");
    return [first, String(data.bairro || "").trim(), location].filter(Boolean).join(" - ") || "Endereço consultado no site";
  }

  function context() {
    const data = currentData();
    return {
      cidade: String(data.cidade || "").trim(),
      uf: String(data.uf || "").trim().toUpperCase(),
      cep: digits(data.cep),
      origem_consulta: activeOptions.source || "box_principal",
      campanha: "ofertas_combate"
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
      console.warn("Não foi possível registrar as ofertas especiais.", error);
    }
  }

  function ensureOption(offer) {
    const select = byId("mPlano");
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
    if (byId("wt-coverage-choice-v3-styles")) return;
    const style = document.createElement("style");
    style.id = "wt-coverage-choice-v3-styles";
    style.textContent = `
      .wt-choice-v3-overlay{position:fixed;inset:0;z-index:2147483200;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(7,22,55,.76);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
      .wt-choice-v3-overlay.is-open{display:flex}
      .wt-choice-v3-dialog{position:relative;width:min(680px,100%);max-height:94vh;overflow:auto;border-radius:22px;background:#fff;padding:26px 22px 20px;color:#102554;box-shadow:0 28px 80px rgba(7,22,55,.34)}
      .wt-choice-v3-close{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:#eef3ff;color:#15346d;font-size:25px;line-height:1;cursor:pointer}
      .wt-choice-v3-head{text-align:center}
      .wt-choice-v3-icon{width:58px;height:58px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8fff1;color:#008b3d;font-size:30px;font-weight:900}
      .wt-choice-v3-dialog h2{margin:0 38px 8px;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:clamp(24px,5vw,31px);font-weight:900;line-height:1.12}
      .wt-choice-v3-lead{margin:0 auto 10px;color:#3f506c;font-size:15px;line-height:1.5;max-width:520px}
      .wt-choice-v3-address{margin:0 auto 18px;padding:9px 12px;border-radius:12px;background:#f4f7fc;color:#53627b;font-size:12px;line-height:1.4;max-width:520px;text-align:center}
      .wt-choice-v3-question{display:block;margin:0 0 12px;text-align:center;color:#0a2463;font-size:15px;font-weight:900}
      .wt-choice-v3-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .wt-choice-v3-offer{position:relative;width:100%;min-width:0;border:1.5px solid #dbe5fb;border-radius:17px;background:#f8faff;padding:15px 13px;text-align:left;color:inherit;font-family:inherit;cursor:pointer;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease}
      .wt-choice-v3-offer:hover,.wt-choice-v3-offer:focus-visible{transform:translateY(-2px);border-color:#2d67d8;box-shadow:0 12px 26px rgba(24,72,160,.14);outline:none}
      .wt-choice-v3-offer.is-featured{border:2px solid #1a56db;background:#f3f7ff;box-shadow:0 10px 24px rgba(26,86,219,.12)}
      .wt-choice-v3-badge{display:inline-block;margin-bottom:8px;border-radius:999px;background:#e8f0ff;color:#174ea6;padding:4px 8px;font-size:10px;font-weight:900;letter-spacing:.02em}
      .wt-choice-v3-offer.is-featured .wt-choice-v3-badge{background:#00a651;color:#fff}
      .wt-choice-v3-speed{display:block;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:21px;font-weight:900;line-height:1.15}
      .wt-choice-v3-price{display:flex;align-items:baseline;gap:4px;margin:8px 0 9px;color:#0a2463}
      .wt-choice-v3-price strong{font-family:Montserrat,'Open Sans',sans-serif;font-size:23px;font-weight:900;line-height:1}
      .wt-choice-v3-price small{color:#72809a;font-size:10px;font-weight:700}
      .wt-choice-v3-description{display:block;min-height:50px;color:#66758f;font-size:11px;line-height:1.4}
      .wt-choice-v3-benefits{display:grid;gap:4px;margin:11px 0 13px;color:#405271;font-size:11px;font-weight:700}
      .wt-choice-v3-benefits span{position:relative;padding-left:16px}
      .wt-choice-v3-benefits span::before{content:"✓";position:absolute;left:0;color:#00a651;font-weight:900}
      .wt-choice-v3-cta{display:flex;align-items:center;justify-content:center;width:100%;min-height:42px;border-radius:10px;background:#0a2463;color:#fff;font-size:12px;font-weight:900;text-align:center}
      .wt-choice-v3-offer.is-featured .wt-choice-v3-cta{background:#1a56db}
      .wt-choice-v3-foot{margin:14px 0 0;text-align:center;color:#72809a;font-size:11px;line-height:1.45}
      @media(max-width:680px){.wt-choice-v3-overlay{align-items:flex-end;padding:8px}.wt-choice-v3-dialog{width:100%;max-height:94vh;border-radius:22px 22px 16px 16px;padding:22px 13px 15px}.wt-choice-v3-dialog h2{font-size:23px}.wt-choice-v3-grid{grid-template-columns:1fr}.wt-choice-v3-offer{display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;padding:12px}.wt-choice-v3-badge,.wt-choice-v3-speed,.wt-choice-v3-description,.wt-choice-v3-benefits{grid-column:1}.wt-choice-v3-price{grid-column:2;grid-row:1 / span 3;align-self:center;flex-direction:column;align-items:flex-end;margin:0}.wt-choice-v3-description{min-height:0}.wt-choice-v3-benefits{display:none}.wt-choice-v3-cta{grid-column:1 / -1;margin-top:9px;min-height:40px}.wt-choice-v3-price strong{font-size:20px}}
      @media(prefers-reduced-motion:reduce){.wt-choice-v3-offer{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function build() {
    if (overlay) return overlay;
    injectStyles();
    overlay = document.createElement("div");
    overlay.id = "wt-coverage-choice-v3";
    overlay.className = "wt-choice-v3-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const offersHtml = OFFERS.map((offer, index) => `
      <button type="button" class="wt-choice-v3-offer${index === 1 ? " is-featured" : ""}" data-combate-plan="${offer.plan}" aria-label="Escolher ${offer.speed} por R$ ${offer.price} por mês">
        <span class="wt-choice-v3-badge">${offer.badge}</span>
        <span class="wt-choice-v3-speed">${offer.speed}</span>
        <span class="wt-choice-v3-price"><strong>R$ ${offer.price}</strong><small>/mês</small></span>
        <span class="wt-choice-v3-description">${offer.description}</span>
        <span class="wt-choice-v3-benefits"><span>Internet fibra</span><span>Wi-Fi incluso</span><span>Instalação grátis</span></span>
        <span class="wt-choice-v3-cta">${index === 1 ? "Quero este plano" : "Escolher plano"}</span>
      </button>
    `).join("");

    overlay.innerHTML = `
      <div class="wt-choice-v3-dialog" role="dialog" aria-modal="true" aria-labelledby="wt-choice-v3-title" aria-describedby="wt-choice-v3-lead">
        <button type="button" class="wt-choice-v3-close" id="wt-choice-v3-close" aria-label="Fechar">×</button>
        <div class="wt-choice-v3-head">
          <div class="wt-choice-v3-icon" aria-hidden="true">✓</div>
          <h2 id="wt-choice-v3-title">Ótima notícia! Temos fibra no seu endereço.</h2>
          <p class="wt-choice-v3-lead" id="wt-choice-v3-lead">Seu endereço está disponível para instalação. Escolha uma das condições especiais abaixo para continuar.</p>
          <div class="wt-choice-v3-address" id="wt-choice-v3-address"></div>
          <span class="wt-choice-v3-question">Escolha sua condição especial</span>
        </div>
        <div class="wt-choice-v3-grid">${offersHtml}</div>
        <p class="wt-choice-v3-foot">Ao escolher um plano, você seguirá diretamente para o cadastro.</p>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-combate-plan]").forEach((button) => {
      button.addEventListener("click", function () {
        const offer = OFFERS.find((item) => item.plan === this.dataset.combatePlan);
        if (offer) selectOffer(offer);
      });
    });

    byId("wt-choice-v3-close")?.addEventListener("click", dismiss);
    overlay.addEventListener("click", e => { if (e.target === overlay) dismiss(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && overlay?.classList.contains("is-open")) dismiss(); });
    return overlay;
  }

  function close() {
    overlay?.classList.remove("is-open");
    overlay?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousBodyOverflow;
  }

  function dismiss() {
    track("cobertura_ofertas_combate_fechadas", context());
    close();
    try { if (typeof activeOptions.onDismiss === "function") activeOptions.onDismiss(); } catch (_) {}
  }

  function prepareContractModal() {
    const source = activeOptions.source || "box_principal";

    if (source === "box_principal") {
      try {
        if (typeof abrirModalCobertura === "function") abrirModalCobertura();
        else if (typeof abrirModal === "function") abrirModal("");
      } catch (error) {
        console.warn("Não foi possível abrir o cadastro da contratação.", error);
      }
    }
  }

  function selectOffer(offer) {
    registerMetadata();
    close();
    prepareContractModal();

    const select = byId("mPlano");
    if (!select) {
      console.warn("Campo de plano não encontrado ao selecionar oferta especial.");
      return;
    }

    ensureOption(offer);
    select.value = offer.plan;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    promoSelectionActive = true;
    sessionSet(RETENTION_SHOWN_FLAG, "1");

    const ctx = context();
    track("cobertura_oferta_combate_selecionada", {
      ...ctx,
      plano: offer.plan,
      valor: offer.value
    });

    try {
      if (typeof window.sincronizarCardsPlanoLanding === "function") window.sincronizarCardsPlanoLanding();
      if (typeof activeOptions.onPlanSelected === "function") activeOptions.onPlanSelected(offer);
      else if (typeof mostrarEtapa === "function") mostrarEtapa(3);
      window.atualizarConfirmacaoLanding?.();
    } catch (error) {
      console.warn("Não foi possível avançar para o cadastro.", error);
    }
  }

  function show(options) {
    if (overlay?.classList.contains("is-open")) return;
    activeOptions = options || {};
    const data = currentData();
    if (!data) return;

    const modal = build();
    const address = formatAddress(data);
    const cep = formatCep(data.cep);
    byId("wt-choice-v3-address").textContent = cep ? `${address} · CEP ${cep}` : address;

    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    // As mesmas tres ofertas deixam de aparecer novamente como retencao nesta sessao.
    sessionSet(RETENTION_SHOWN_FLAG, "1");

    track("cobertura_opcoes_exibidas", { ...context(), tipo_opcao: "ofertas_combate" });
    track("cobertura_ofertas_combate_exibidas", context());
    requestAnimationFrame(() => modal.querySelector("[data-combate-plan]")?.focus({ preventScroll: true }));
  }

  window.webTurboShowCoverageChoice = show;

  function patchStepNavigation() {
    if (stepNavigationPatched || typeof window.mostrarEtapa !== "function") return false;

    const original = window.mostrarEtapa;
    const patched = function (nextStep) {
      if (promoSelectionActive && Number(nextStep) === 2) {
        show({ source: "voltar_dados_para_ofertas", data: currentData() });
        return;
      }
      return original.apply(this, arguments);
    };

    patched.__wtCombatePatched = true;
    window.mostrarEtapa = patched;
    stepNavigationPatched = true;
    return true;
  }

  function interceptMainSiteButton() {
    const button = byId("btnFormCobertura");
    if (!button || button.__wtCombateIntercepted) return;

    button.addEventListener("click", function (event) {
      const cta = byId("ctaViavel");
      if (!cta?.classList.contains("show")) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      show({ source: "botao_contratar_aqui" });
    }, true);

    button.__wtCombateIntercepted = true;
  }

  function observeMainCoverage() {
    const cta = byId("ctaViavel");
    if (!cta) return;

    interceptMainSiteButton();

    const evaluate = () => {
      const visible = cta.classList.contains("show");
      if (visible && !ctaWasVisible) {
        ctaWasVisible = true;
        setTimeout(() => show({ source: "box_principal" }), 50);
      } else if (!visible) {
        ctaWasVisible = false;
      }
    };

    new MutationObserver(evaluate).observe(cta, { attributes: true, attributeFilter: ["class"] });
    evaluate();
  }

  function install() {
    registerMetadata();
    patchStepNavigation();
    observeMainCoverage();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
