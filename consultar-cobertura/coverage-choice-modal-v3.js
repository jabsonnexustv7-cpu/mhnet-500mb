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
      description: "Internet fibra para navegar, assistir e usar seus aplicativos no dia a dia.",
      gaugeClass: "is-300"
    },
    {
      plan: "FIBRA 500MB (Combate)",
      speed: "500 Mega",
      price: "89,90",
      value: 89.90,
      badge: "Mais escolhido",
      description: "Mais velocidade por apenas R$ 10 a mais que o plano de 300 Mega.",
      gaugeClass: "is-500"
    },
    {
      plan: "FIBRA 700MB",
      speed: "700 Mega",
      price: "99,90",
      value: 99.90,
      badge: "Mais velocidade",
      description: "Alta velocidade para vários aparelhos, streaming, trabalho e jogos.",
      gaugeClass: "is-700"
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
      .wt-choice-v3-overlay{position:fixed;inset:0;z-index:2147483200;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(7,22,55,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
      .wt-choice-v3-overlay.is-open{display:flex}
      .wt-choice-v3-dialog{position:relative;width:min(620px,100%);max-height:min(94dvh,860px);overflow-y:auto;overflow-x:hidden;border-radius:28px;background:#fff;color:#0f1b3d;box-shadow:0 30px 90px rgba(7,22,55,.38);font-family:'Open Sans',system-ui,sans-serif;animation:wtChoiceRise .42s cubic-bezier(.2,.8,.2,1) both;overscroll-behavior:contain}
      .wt-choice-v3-handle{display:none;width:42px;height:4px;margin:10px auto 0;border-radius:999px;background:#e6e9f2}
      .wt-choice-v3-inner{position:relative;padding:25px 24px 22px}
      .wt-choice-v3-close{position:absolute;z-index:3;top:15px;right:15px;width:34px;height:34px;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#f4f7ff;color:#0a2463;font-size:22px;line-height:1;cursor:pointer;transition:background .16s ease,transform .16s ease}
      .wt-choice-v3-close:hover,.wt-choice-v3-close:focus-visible{background:#e7ecfb;outline:3px solid rgba(26,86,219,.18);outline-offset:2px}
      .wt-choice-v3-head{position:relative;text-align:center;padding:3px 30px 0}
      .wt-choice-v3-fiber{position:absolute;top:-12px;left:-24px;right:-24px;height:92px;overflow:hidden;pointer-events:none;opacity:.7}
      .wt-choice-v3-fiber svg{display:block;width:100%;height:100%}
      .wt-choice-v3-icon{position:relative;z-index:1;width:62px;height:62px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,#e8fff1,#c7f7db);color:#049945;box-shadow:0 9px 22px -7px rgba(0,200,83,.48);font-size:31px;font-weight:900;animation:wtChoicePop .45s .08s cubic-bezier(.34,1.56,.64,1) both}
      .wt-choice-v3-dialog h2{position:relative;z-index:1;margin:0 auto 8px;max-width:500px;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:clamp(23px,4vw,30px);font-weight:900;line-height:1.16;letter-spacing:-.02em}
      .wt-choice-v3-lead{position:relative;z-index:1;margin:0 auto;color:#64708a;font-size:14px;line-height:1.5;max-width:490px}
      .wt-choice-v3-address{display:flex;align-items:flex-start;gap:10px;margin:18px auto 0;padding:11px 13px;border:1px solid #e6e9f2;border-radius:14px;background:#f4f7ff;text-align:left;max-width:520px}
      .wt-choice-v3-address-icon{flex:0 0 auto;width:18px;height:18px;margin-top:2px;color:#1a56db}
      .wt-choice-v3-address-copy{min-width:0}
      .wt-choice-v3-address-label{display:block;margin-bottom:2px;color:#1a56db;font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
      .wt-choice-v3-address-text{display:block;color:#0f1b3d;font-size:12px;line-height:1.45;overflow-wrap:anywhere}
      .wt-choice-v3-section{display:flex;align-items:center;gap:8px;margin:22px 0 13px}
      .wt-choice-v3-bolt{width:23px;height:23px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a56db,#0a2463);color:#fff;box-shadow:0 5px 12px rgba(26,86,219,.2)}
      .wt-choice-v3-question{color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:15px;font-weight:800}
      .wt-choice-v3-grid{display:flex;flex-direction:column;gap:13px}
      .wt-choice-v3-offer{position:relative;width:100%;border:1.5px solid #e6e9f2;border-radius:18px;background:#fff;padding:15px 15px 14px;text-align:left;color:inherit;font-family:inherit;cursor:pointer;box-shadow:0 7px 20px rgba(10,36,99,.055);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}
      .wt-choice-v3-offer:hover,.wt-choice-v3-offer:focus-visible{transform:translateY(-1px);border-color:#9db8ef;box-shadow:0 12px 28px rgba(10,36,99,.11);outline:none}
      .wt-choice-v3-offer.is-featured{margin-top:5px;border:2px solid #00c853;background:linear-gradient(180deg,#f4fff8,#fff 42%);box-shadow:0 12px 30px -12px rgba(0,200,83,.42)}
      .wt-choice-v3-ribbon{position:absolute;top:-12px;left:15px;display:none;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:linear-gradient(90deg,#00c853,#049945);color:#fff;font-size:10px;font-weight:900;letter-spacing:.02em;box-shadow:0 5px 12px -4px rgba(0,200,83,.55)}
      .wt-choice-v3-offer.is-featured .wt-choice-v3-ribbon{display:flex}
      .wt-choice-v3-card-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}
      .wt-choice-v3-card-copy{min-width:0}
      .wt-choice-v3-badge{display:inline-flex;align-items:center;margin-bottom:8px;padding:4px 9px;border-radius:999px;background:#eaf1ff;color:#1a56db;font-size:10px;font-weight:900;letter-spacing:.02em}
      .wt-choice-v3-offer.is-featured .wt-choice-v3-badge{visibility:hidden;height:18px;margin-bottom:8px;padding:0}
      .wt-choice-v3-speed{display:block;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:21px;font-weight:900;line-height:1.15}
      .wt-choice-v3-description{display:block;margin-top:5px;color:#64708a;font-size:12px;line-height:1.45;max-width:360px}
      .wt-choice-v3-offer.is-featured .wt-choice-v3-description strong{color:#049945;font-weight:900}
      .wt-choice-v3-side{display:flex;align-items:flex-end;gap:12px;padding-top:2px}
      .wt-choice-v3-gauge{width:42px;height:28px;flex:0 0 auto}
      .wt-choice-v3-gauge-track{fill:none;stroke:#e6e9f2;stroke-width:4;stroke-linecap:round}
      .wt-choice-v3-gauge-value{fill:none;stroke-width:4;stroke-linecap:round}
      .wt-choice-v3-gauge.is-300 .wt-choice-v3-gauge-value{stroke:#1a56db;stroke-dasharray:33 100}
      .wt-choice-v3-gauge.is-500 .wt-choice-v3-gauge-value{stroke:#00c853;stroke-dasharray:62 100}
      .wt-choice-v3-gauge.is-700 .wt-choice-v3-gauge-value{stroke:#0a2463;stroke-dasharray:89 100}
      .wt-choice-v3-price{min-width:94px;text-align:right;color:#0a2463;white-space:nowrap}
      .wt-choice-v3-price strong{display:block;font-family:Montserrat,'Open Sans',sans-serif;font-size:22px;font-weight:900;line-height:1.05;letter-spacing:-.02em}
      .wt-choice-v3-price small{display:block;margin-top:2px;color:#64708a;font-size:10px;font-weight:700}
      .wt-choice-v3-cta{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:13px;border-radius:12px;background:#0a2463;color:#fff;font-size:13px;font-weight:900;text-align:center;box-shadow:0 7px 16px -9px rgba(10,36,99,.5)}
      .wt-choice-v3-offer.is-featured .wt-choice-v3-cta{background:linear-gradient(90deg,#1a56db,#049945 135%);box-shadow:0 10px 22px -9px rgba(0,200,83,.5)}
      .wt-choice-v3-common-benefits{display:flex;flex-wrap:wrap;justify-content:center;gap:7px 14px;margin:16px 0 0;padding:0;color:#405271;font-size:11px;font-weight:800}
      .wt-choice-v3-common-benefits span{position:relative;padding-left:15px}
      .wt-choice-v3-common-benefits span::before{content:"✓";position:absolute;left:0;color:#00a651;font-weight:900}
      .wt-choice-v3-foot{margin:14px 0 0;text-align:center;color:#72809a;font-size:11px;line-height:1.45}
      @keyframes wtChoiceRise{from{transform:translateY(22px);opacity:0}to{transform:translateY(0);opacity:1}}
      @keyframes wtChoicePop{from{transform:scale(.45);opacity:0}to{transform:scale(1);opacity:1}}
      @media(max-width:680px){
        .wt-choice-v3-overlay{align-items:flex-end;padding:0;background:rgba(7,22,55,.72)}
        .wt-choice-v3-dialog{width:100%;max-height:94dvh;border-radius:28px 28px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);box-shadow:0 -14px 42px rgba(7,22,55,.26)}
        .wt-choice-v3-handle{display:block}
        .wt-choice-v3-inner{padding:13px 16px 18px}
        .wt-choice-v3-close{top:13px;right:14px;width:32px;height:32px;font-size:20px}
        .wt-choice-v3-head{padding:0 28px}
        .wt-choice-v3-fiber{top:-14px;left:-16px;right:-16px;height:82px}
        .wt-choice-v3-icon{width:56px;height:56px;margin-bottom:12px;font-size:28px}
        .wt-choice-v3-dialog h2{font-size:22px}
        .wt-choice-v3-lead{font-size:13px}
        .wt-choice-v3-address{margin-top:14px;padding:10px 11px}
        .wt-choice-v3-address-text{font-size:11.5px}
        .wt-choice-v3-section{margin:18px 0 12px}
        .wt-choice-v3-grid{gap:12px}
        .wt-choice-v3-offer{padding:14px 13px 13px}
        .wt-choice-v3-card-top{gap:10px}
        .wt-choice-v3-speed{font-size:19px}
        .wt-choice-v3-description{font-size:11.5px}
        .wt-choice-v3-side{gap:8px}
        .wt-choice-v3-gauge{width:38px;height:26px}
        .wt-choice-v3-price{min-width:84px}
        .wt-choice-v3-price strong{font-size:20px}
        .wt-choice-v3-cta{min-height:42px;margin-top:11px}
        .wt-choice-v3-common-benefits{margin-top:14px;gap:6px 11px;font-size:10.5px}
      }
      @media(max-width:390px){
        .wt-choice-v3-inner{padding-left:13px;padding-right:13px}
        .wt-choice-v3-head{padding:0 24px}
        .wt-choice-v3-dialog h2{font-size:20px}
        .wt-choice-v3-side{flex-direction:column;align-items:flex-end;gap:3px}
        .wt-choice-v3-gauge{display:none}
      }
      @media(prefers-reduced-motion:reduce){.wt-choice-v3-dialog,.wt-choice-v3-icon{animation:none}.wt-choice-v3-offer,.wt-choice-v3-close{transition:none}}
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

    const offersHtml = OFFERS.map((offer, index) => {
      const description = index === 1
        ? "Mais velocidade por <strong>apenas R$ 10 a mais</strong> que o plano de 300 Mega."
        : offer.description;
      return `
        <button type="button" class="wt-choice-v3-offer${index === 1 ? " is-featured" : ""}" data-combate-plan="${offer.plan}" aria-label="Escolher ${offer.speed} por R$ ${offer.price} por mês">
          <span class="wt-choice-v3-ribbon" aria-hidden="true">★ Mais escolhido</span>
          <span class="wt-choice-v3-card-top">
            <span class="wt-choice-v3-card-copy">
              <span class="wt-choice-v3-badge">${offer.badge}</span>
              <span class="wt-choice-v3-speed">${offer.speed}</span>
              <span class="wt-choice-v3-description">${description}</span>
            </span>
            <span class="wt-choice-v3-side">
              <svg class="wt-choice-v3-gauge ${offer.gaugeClass}" viewBox="0 0 42 28" aria-hidden="true">
                <path class="wt-choice-v3-gauge-track" d="M3 25 A18 18 0 0 1 39 25" pathLength="100"></path>
                <path class="wt-choice-v3-gauge-value" d="M3 25 A18 18 0 0 1 39 25" pathLength="100"></path>
              </svg>
              <span class="wt-choice-v3-price"><strong>R$ ${offer.price}</strong><small>por mês</small></span>
            </span>
          </span>
          <span class="wt-choice-v3-cta">${index === 1 ? "Quero este plano" : "Escolher plano"}</span>
        </button>
      `;
    }).join("");

    overlay.innerHTML = `
      <div class="wt-choice-v3-dialog" role="dialog" aria-modal="true" aria-labelledby="wt-choice-v3-title" aria-describedby="wt-choice-v3-lead">
        <div class="wt-choice-v3-handle" aria-hidden="true"></div>
        <div class="wt-choice-v3-inner">
          <button type="button" class="wt-choice-v3-close" id="wt-choice-v3-close" aria-label="Fechar">×</button>
          <div class="wt-choice-v3-head">
            <div class="wt-choice-v3-fiber" aria-hidden="true">
              <svg viewBox="0 0 620 92" preserveAspectRatio="none">
                <path d="M-20 22 C 120 68, 250 -12, 650 42" stroke="#1a56db" stroke-opacity=".18" stroke-width="2" fill="none"></path>
                <path d="M-20 58 C 150 12, 350 96, 650 30" stroke="#00c853" stroke-opacity=".16" stroke-width="2" fill="none"></path>
              </svg>
            </div>
            <div class="wt-choice-v3-icon" aria-hidden="true">✓</div>
            <h2 id="wt-choice-v3-title">Ótima notícia! Temos fibra no seu endereço.</h2>
            <p class="wt-choice-v3-lead" id="wt-choice-v3-lead">Seu endereço está disponível para instalação. Escolha uma das condições especiais abaixo para continuar.</p>
          </div>
          <div class="wt-choice-v3-address">
            <svg class="wt-choice-v3-address-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z" stroke="currentColor" stroke-width="1.8"></path><circle cx="12" cy="9" r="2.4" stroke="currentColor" stroke-width="1.8"></circle></svg>
            <span class="wt-choice-v3-address-copy"><span class="wt-choice-v3-address-label">Endereço confirmado</span><span class="wt-choice-v3-address-text" id="wt-choice-v3-address"></span></span>
          </div>
          <div class="wt-choice-v3-section">
            <span class="wt-choice-v3-bolt" aria-hidden="true">⚡</span>
            <span class="wt-choice-v3-question">Escolha sua condição especial</span>
          </div>
          <div class="wt-choice-v3-grid">${offersHtml}</div>
          <div class="wt-choice-v3-common-benefits" aria-label="Benefícios das ofertas"><span>Internet fibra</span><span>Wi-Fi incluso</span><span>Instalação grátis</span></div>
          <p class="wt-choice-v3-foot">Ao escolher um plano, você seguirá diretamente para o cadastro.</p>
        </div>
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
