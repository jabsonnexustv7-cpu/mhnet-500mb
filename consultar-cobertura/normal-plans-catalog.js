// Catálogo ampliado de planos após a confirmação de cobertura.
(function () {
  "use strict";

  const MODE_CLASS = "wt-normal-plans-mode";
  const STYLE_ID = "wt-normal-plans-catalog-styles";
  const TOOLBAR_ID = "wt-normal-plans-toolbar";
  const MORE_BUTTON_ID = "wt-choice-v3-more-plans";
  const CONTRACT_OVERLAY_ID = "modalOverlay";
  const SPECIAL_OVERLAY_ID = "wt-coverage-choice-v3";
  const REGIONAL_CITIES = new Set(["sorocaba", "votorantim", "itapetininga", "ipero"]);

  let normalPlanSelectionActive = false;
  let stepNavigationPatched = false;

  const byId = (id) => document.getElementById(id);

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function track(name, params) {
    try {
      if (typeof trackGA4 === "function") trackGA4(name, params || {});
    } catch (_) {}
  }

  function currentCoveragePageData() {
    try {
      return typeof coberturaPaginaData !== "undefined" && coberturaPaginaData ? coberturaPaginaData : null;
    } catch (_) {
      return null;
    }
  }

  function coverageApproved() {
    try {
      if (typeof modalCoverageValidated !== "undefined" && modalCoverageValidated === true) return true;
    } catch (_) {}

    const pageData = currentCoveragePageData();
    return Boolean(pageData?.cobertura?.viavel === true);
  }

  function buildCoverageData() {
    const pageData = currentCoveragePageData();
    if (pageData) return pageData;

    let coverage = null;
    try {
      if (typeof modalCoverageData !== "undefined") coverage = modalCoverageData;
    } catch (_) {}

    return {
      cep: byId("mCep")?.value || "",
      numero: byId("mNumero")?.value || "",
      logradouro: byId("mLogradouro")?.value || "",
      bairro: byId("mBairro")?.value || "",
      cidade: byId("mCidade")?.value || "",
      uf: byId("mUf")?.value || "",
      complemento: byId("mComplemento")?.value || "",
      cobertura: coverage
    };
  }

  function coverageContext() {
    const data = buildCoverageData();
    return {
      cidade: byId("mCidade")?.value?.trim() || byId("consultaCidade")?.value?.trim() || String(data?.cidade || "").trim(),
      uf: (byId("mUf")?.value || byId("consultaUf")?.value || data?.uf || "").trim().toUpperCase(),
      cep: (byId("mCep")?.value || byId("cep")?.value || data?.cep || "").replace(/\D+/g, ""),
      plano_atual: byId("mPlano")?.value || ""
    };
  }

  function injectStyles() {
    if (byId(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .wt-choice-v3-more-plans{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;margin:14px 0 0;border:1.5px solid #ccd9f3;border-radius:13px;background:#f6f9ff;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease}
      .wt-choice-v3-more-plans:hover,.wt-choice-v3-more-plans:focus-visible{background:#edf3ff;border-color:#9db8ef;transform:translateY(-1px);outline:3px solid rgba(26,86,219,.13);outline-offset:2px}
      .wt-choice-v3-more-plans::after{content:"→";margin-left:7px;font-size:17px;line-height:1}

      body.${MODE_CLASS}{overflow:auto!important;background:#f4f7fc!important}
      body.meta-coverage-landing.${MODE_CLASS} .meta-landing-intro{display:none!important}
      body.meta-coverage-landing.${MODE_CLASS} .meta-floating-whatsapp{display:none!important}
      body.meta-coverage-landing.${MODE_CLASS} #modalOverlay{opacity:0!important;pointer-events:none!important}
      body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal{display:block!important}
      body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal > :not(.plans-section){display:none!important}
      body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal > .plans-section{display:block!important;min-height:calc(100dvh - 64px);padding-top:28px!important;background:#f4f7fc!important}
      body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal > .plans-section .section-head{margin-bottom:24px}
      body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal > .plans-section .section-head h2{font-size:clamp(25px,4vw,34px)}
      body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal > .plans-section .plans{padding-top:8px}

      .wt-normal-plans-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 22px;padding:14px 16px;border:1px solid #dfe6f2;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(10,36,99,.07)}
      .wt-normal-plans-toolbar-copy{min-width:0}
      .wt-normal-plans-toolbar-copy strong{display:block;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:15px;font-weight:900;line-height:1.25}
      .wt-normal-plans-toolbar-copy span{display:block;margin-top:3px;color:#66758f;font-size:12px;line-height:1.4}
      .wt-normal-plans-back{flex:0 0 auto;min-height:42px;padding:0 14px;border:1.5px solid #cdd8ee;border-radius:11px;background:#f7f9fd;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:12px;font-weight:800;cursor:pointer}
      .wt-normal-plans-back:hover,.wt-normal-plans-back:focus-visible{background:#edf3ff;border-color:#9db8ef;outline:3px solid rgba(26,86,219,.12);outline-offset:2px}

      body.${MODE_CLASS} .plans-section .plan.is-selected-normal-plan{border:2px solid #1a56db;box-shadow:0 16px 38px rgba(26,86,219,.16)}

      @media(max-width:640px){
        body.meta-coverage-landing.${MODE_CLASS} #conteudo-principal > .plans-section{padding-top:18px!important}
        .wt-normal-plans-toolbar{align-items:stretch;flex-direction:column;padding:13px 14px;margin-bottom:18px}
        .wt-normal-plans-back{width:100%}
      }

      @media(prefers-reduced-motion:reduce){.wt-choice-v3-more-plans{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function ensureMorePlansButton() {
    const special = byId(SPECIAL_OVERLAY_ID);
    if (!special || byId(MORE_BUTTON_ID)) return;

    const benefits = special.querySelector(".wt-choice-v3-common-benefits");
    const foot = special.querySelector(".wt-choice-v3-foot");
    if (!benefits && !foot) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = MORE_BUTTON_ID;
    button.className = "wt-choice-v3-more-plans";
    button.textContent = "Ver mais planos";
    button.addEventListener("click", showNormalPlans);

    if (benefits) benefits.insertAdjacentElement("afterend", button);
    else foot.insertAdjacentElement("beforebegin", button);
  }

  function ensureToolbar() {
    const section = document.querySelector("#conteudo-principal .plans-section");
    if (!section) return null;

    let toolbar = byId(TOOLBAR_ID);
    if (toolbar) return toolbar;

    const container = section.querySelector(":scope > .container");
    if (!container) return null;

    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.className = "wt-normal-plans-toolbar";
    toolbar.innerHTML = `
      <div class="wt-normal-plans-toolbar-copy">
        <strong>Veja todas as opções disponíveis</strong>
        <span>Você pode comparar os demais planos e voltar às ofertas especiais quando quiser.</span>
      </div>
      <button type="button" class="wt-normal-plans-back" id="wt-normal-plans-back">← Voltar às ofertas especiais</button>
    `;

    container.insertAdjacentElement("afterbegin", toolbar);
    byId("wt-normal-plans-back")?.addEventListener("click", returnToSpecialOffers);
    return toolbar;
  }

  function extractPlanFromButton(button) {
    if (!button) return "";
    if (button.dataset.wtPlan) return button.dataset.wtPlan;

    const inline = String(button.getAttribute("onclick") || "");
    const match = inline.match(/abrirModal\(\s*['\"]([^'\"]+)['\"]\s*\)/i);
    const plan = match ? match[1].trim() : "";
    if (plan) button.dataset.wtPlan = plan;
    return plan;
  }

  function findNormalPlanCard(plan) {
    return Array.from(document.querySelectorAll("#conteudo-principal .plans-section .btn-contratar-plano"))
      .map((button) => ({ button, plan: extractPlanFromButton(button), card: button.closest(".plan") }))
      .find((item) => item.plan === plan);
  }

  function setButtonPlan(item, plan) {
    if (!item?.button) return;
    item.button.dataset.wtPlan = plan;
  }

  function updateRegionalCatalog() {
    const data = buildCoverageData();
    const city = normalize(byId("mCidade")?.value || byId("consultaCidade")?.value || data?.cidade || "");
    const regional = REGIONAL_CITIES.has(city);

    const standard = findNormalPlanCard("FIBRA 500MB") || findNormalPlanCard("FIBRA 600MB");
    const extra = findNormalPlanCard("FIBRA 500MB + 1 PONTO EXTRA DE WI-FI") || findNormalPlanCard("FIBRA 600MB + 1 PONTO EXTRA DE WI-FI");

    if (standard?.card) {
      const title = standard.card.querySelector("h3");
      if (title) title.textContent = regional ? "600 Mega" : "500 Mega";
      setButtonPlan(standard, regional ? "FIBRA 600MB" : "FIBRA 500MB");
    }

    if (extra?.card) {
      const title = extra.card.querySelector("h3");
      if (title) title.textContent = regional ? "600MB + 1 Ponto extra" : "500MB + 1 Ponto extra";
      Array.from(extra.card.querySelectorAll("li")).forEach((item) => {
        const text = String(item.textContent || "");
        if (/\b(500|600)MB\b/i.test(text)) {
          item.textContent = text.replace(/\b(500|600)MB\b/i, regional ? "600MB" : "500MB");
        }
      });
      setButtonPlan(extra, regional ? "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI" : "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI");
    }
  }

  function highlightCurrentPlan() {
    const selected = byId("mPlano")?.value || "";
    document.querySelectorAll("#conteudo-principal .plans-section .plan").forEach((card) => card.classList.remove("is-selected-normal-plan"));
    if (!selected) return;

    const item = Array.from(document.querySelectorAll("#conteudo-principal .plans-section .btn-contratar-plano"))
      .map((button) => ({ button, plan: extractPlanFromButton(button) }))
      .find((entry) => entry.plan === selected);
    item?.button?.closest(".plan")?.classList.add("is-selected-normal-plan");
  }

  function hideContractOverlay() {
    byId(CONTRACT_OVERLAY_ID)?.classList.remove("open");
  }

  function showContractOverlay() {
    const contract = byId(CONTRACT_OVERLAY_ID);
    if (contract) contract.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function hideSpecialOverlay() {
    const special = byId(SPECIAL_OVERLAY_ID);
    special?.classList.remove("is-open");
    special?.setAttribute("aria-hidden", "true");
  }

  function showNormalPlans() {
    if (!coverageApproved()) {
      console.warn("[WEBTURBO] Catálogo de planos bloqueado: cobertura ainda não validada.");
      return;
    }

    injectStyles();
    ensureToolbar();
    updateRegionalCatalog();
    highlightCurrentPlan();

    hideSpecialOverlay();
    hideContractOverlay();
    document.body.classList.add(MODE_CLASS);
    document.body.style.overflow = "";

    const section = document.querySelector("#conteudo-principal .plans-section");
    requestAnimationFrame(() => {
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      byId("wt-normal-plans-back")?.focus({ preventScroll: true });
    });

    track("cobertura_planos_normais_exibidos", {
      ...coverageContext(),
      origem: normalPlanSelectionActive ? "voltar_dados" : "ofertas_especiais"
    });
  }

  function ensureContractDataReady() {
    const hasAddress = Boolean(byId("mCep")?.value || byId("mCidade")?.value);
    if (hasAddress) {
      showContractOverlay();
      return;
    }

    try {
      if (typeof abrirModalCobertura === "function") {
        abrirModalCobertura();
        return;
      }
    } catch (error) {
      console.warn("Não foi possível restaurar os dados da cobertura no cadastro.", error);
    }

    showContractOverlay();
  }

  function returnToSpecialOffers() {
    if (typeof window.webTurboShowCoverageChoice !== "function") return;

    normalPlanSelectionActive = false;
    document.body.classList.remove(MODE_CLASS);
    ensureContractDataReady();

    track("cobertura_planos_normais_voltar_ofertas", coverageContext());
    window.webTurboShowCoverageChoice({
      source: "modal_contratacao",
      data: buildCoverageData()
    });
  }

  function selectNormalPlan(plan) {
    if (!plan || !coverageApproved()) return;

    document.body.classList.remove(MODE_CLASS);
    ensureContractDataReady();

    const select = byId("mPlano");
    if (!select) {
      console.warn("Campo de plano não encontrado ao selecionar plano normal.");
      return;
    }

    const option = Array.from(select.options).find((item) => item.value === plan);
    if (!option) {
      console.warn("Plano normal não disponível no cadastro:", plan);
      return;
    }

    if (option.disabled || option.hidden) {
      console.warn("Plano normal indisponível para a cidade consultada:", plan);
      return;
    }

    select.value = plan;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    normalPlanSelectionActive = true;

    track("cobertura_plano_normal_selecionado", {
      ...coverageContext(),
      plano: plan
    });

    try {
      window.sincronizarCardsPlanoLanding?.();
      if (typeof window.mostrarEtapa === "function") window.mostrarEtapa(3);
      window.atualizarConfirmacaoLanding?.();
    } catch (error) {
      console.warn("Não foi possível avançar para o cadastro após escolher o plano.", error);
    }
  }

  function interceptNormalPlanButtons() {
    document.addEventListener("click", function (event) {
      if (!document.body.classList.contains(MODE_CLASS)) return;

      const button = event.target.closest("#conteudo-principal .plans-section .btn-contratar-plano");
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      selectNormalPlan(extractPlanFromButton(button));
    }, true);
  }

  function patchStepNavigation() {
    if (stepNavigationPatched || typeof window.mostrarEtapa !== "function") return false;

    const original = window.mostrarEtapa;
    const patched = function (nextStep) {
      if (normalPlanSelectionActive && Number(nextStep) === 2) {
        showNormalPlans();
        return;
      }
      return original.apply(this, arguments);
    };

    patched.__wtNormalPlansPatched = true;
    window.mostrarEtapa = patched;
    stepNavigationPatched = true;
    return true;
  }

  function observeSpecialModal() {
    const observer = new MutationObserver(() => ensureMorePlansButton());
    observer.observe(document.body, { childList: true, subtree: true });
    ensureMorePlansButton();
  }

  function install() {
    injectStyles();
    ensureToolbar();
    interceptNormalPlanButtons();
    patchStepNavigation();
    observeSpecialModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
