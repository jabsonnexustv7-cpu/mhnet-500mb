// Redesign visual da primeira etapa da consulta de cobertura.
(function () {
  "use strict";

  const STYLE_ID = "wt-landing-hero-redesign-styles";
  const ACTIVE_CLASS = "wt-hero-step1-active";

  const byId = (id) => document.getElementById(id);

  function injectStyles() {
    if (byId(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .meta-landing-header{background:linear-gradient(135deg,#06153d 0%,#0a2463 58%,#123a8a 100%);overflow:hidden}
      .meta-landing-header::before,.meta-landing-header::after{content:"";position:absolute;left:-5%;width:110%;height:80px;pointer-events:none;opacity:.24;border-radius:50%}
      .meta-landing-header::before{top:-54px;border:2px solid #1a56db;transform:rotate(4deg)}
      .meta-landing-header::after{top:34px;border:2px solid #00c853;transform:rotate(-4deg);opacity:.16}
      .meta-landing-header-inner{position:relative;z-index:1;min-height:64px;justify-content:center}
      .meta-landing-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .meta-landing-brand strong{font-family:Montserrat,'Open Sans',sans-serif;font-size:20px;font-weight:900;line-height:1;color:#fff;letter-spacing:-.25px}
      .meta-landing-brand span{margin-top:4px;color:#b9c9f5;font-size:10px;font-weight:700;letter-spacing:.075em;text-transform:uppercase}

      body.${ACTIVE_CLASS}{background:linear-gradient(180deg,#fff 0,#f7f9fd 560px,#fff 900px)}
      body.${ACTIVE_CLASS} .meta-landing-intro{max-width:760px;padding:24px 18px 8px}
      body.${ACTIVE_CLASS} .meta-landing-intro h1{max-width:700px;margin:0 auto 8px;font-size:clamp(27px,4.6vw,39px);line-height:1.13;letter-spacing:-.55px}
      .wt-hero-accent{color:#1a56db}
      body.${ACTIVE_CLASS} .meta-landing-intro>p{max-width:560px;font-size:14.5px;line-height:1.55}

      body.${ACTIVE_CLASS} #modalOverlay{padding:8px 18px 42px;background:transparent}
      body.${ACTIVE_CLASS} #modalOverlay .modal{max-width:720px;border:1px solid #e1e7f0;border-radius:20px;overflow:hidden;box-shadow:0 20px 48px -18px rgba(10,36,99,.26);background:#fff}
      body.${ACTIVE_CLASS} #etapa1 .modal-header{padding:17px 20px 15px;border-radius:0;background:linear-gradient(135deg,#0a2463,#123a8a);text-align:left}
      body.${ACTIVE_CLASS} #etapa1 .modal-header h2{margin:0 0 4px;color:#fff;font-family:Montserrat,'Open Sans',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.15px}
      body.${ACTIVE_CLASS} #etapa1 .modal-subtitle{margin:0;color:#c3d1f7;font-size:12.5px;line-height:1.45}
      body.${ACTIVE_CLASS} #etapa1 .modal-body{padding:18px 20px 20px;min-height:0}
      body.${ACTIVE_CLASS} #etapa1 .modal-steps,
      body.${ACTIVE_CLASS} #etapa1 .modal-step-label{display:none!important}
      body.${ACTIVE_CLASS} #etapa1 .coverage-ok-box:not(.show){display:none!important}
      body.${ACTIVE_CLASS} #etapa1 .mgrid{gap:0 14px}
      body.${ACTIVE_CLASS} #etapa1 .mfield{margin-bottom:14px}
      body.${ACTIVE_CLASS} #etapa1 .mfield label{margin-bottom:6px;color:#0a2463;font-size:11.5px;font-weight:800;letter-spacing:.025em}
      body.${ACTIVE_CLASS} #etapa1 .mfield input,
      body.${ACTIVE_CLASS} #etapa1 .mfield select{min-height:48px;border:1.5px solid #e0e5ef;border-radius:12px;background:#f4f7ff;padding:11px 13px;font-size:14.5px;color:#0f1b3d;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease}
      body.${ACTIVE_CLASS} #etapa1 .mfield input:focus,
      body.${ACTIVE_CLASS} #etapa1 .mfield select:focus{border-color:#1a56db;background:#fff;box-shadow:0 0 0 3px rgba(26,86,219,.11)}
      body.${ACTIVE_CLASS} #etapa1 .modal-actions{margin-top:4px}
      body.${ACTIVE_CLASS} #etapa1 .btn-modal-next{min-height:52px;border-radius:13px;background:linear-gradient(90deg,#1a56db,#049945 135%);font-family:Montserrat,'Open Sans',sans-serif;font-size:14.5px;font-weight:800;box-shadow:0 12px 24px -10px rgba(0,200,83,.55)}
      body.${ACTIVE_CLASS} #etapa1 .btn-modal-next::after{content:"→";font-size:18px;line-height:1;margin-left:3px}
      body.${ACTIVE_CLASS} #etapa1 .btn-modal-next:hover{filter:brightness(1.05);transform:translateY(-1px)}

      .wt-hero-geo{grid-column:1/-1!important;width:100%;min-height:42px;margin:0 0 15px!important;border:1.5px solid #b9f2cd!important;border-radius:12px!important;background:#eafff3!important;color:#049945!important;display:flex!important;align-items:center;justify-content:center;gap:7px;padding:9px 12px!important;text-align:center!important;font-size:12.5px!important;font-weight:800!important;text-decoration:none!important}
      .wt-hero-geo::before{content:"⌖";font-size:17px;line-height:1}
      .wt-hero-geo:hover{background:#dffcea!important;text-decoration:none!important}

      body.${ACTIVE_CLASS} .meta-trust-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0 0;padding:0}
      body.${ACTIVE_CLASS} .meta-trust-row span{min-height:48px;padding:8px 9px;border:1px solid #e2e7f0;border-radius:12px;background:#fff;justify-content:center;text-align:center;color:#0f1b3d;font-size:10.8px;font-weight:800;line-height:1.25;box-shadow:0 5px 14px -9px rgba(10,36,99,.24)}
      body.${ACTIVE_CLASS} .meta-trust-row span:nth-child(1){background:#f5f8ff}
      body.${ACTIVE_CLASS} .meta-trust-row span:nth-child(2){background:#f2fff7}
      body.${ACTIVE_CLASS} .meta-trust-row span:nth-child(3){background:#fff9f2}

      @media(max-width:600px){
        .meta-landing-header-inner{min-height:60px;padding:8px 14px}
        .meta-landing-brand strong{font-size:18px}
        body.${ACTIVE_CLASS} .meta-landing-intro{padding:20px 14px 6px}
        body.${ACTIVE_CLASS} .meta-landing-intro h1{font-size:clamp(25px,8.2vw,32px)}
        body.${ACTIVE_CLASS} .meta-landing-intro>p{font-size:13.5px}
        body.${ACTIVE_CLASS} #modalOverlay{padding:7px 10px 34px}
        body.${ACTIVE_CLASS} #modalOverlay .modal{border-radius:16px}
        body.${ACTIVE_CLASS} #etapa1 .modal-header{padding:15px 16px 13px}
        body.${ACTIVE_CLASS} #etapa1 .modal-header h2{font-size:17px}
        body.${ACTIVE_CLASS} #etapa1 .modal-subtitle{font-size:12px}
        body.${ACTIVE_CLASS} #etapa1 .modal-body{padding:16px}
        body.${ACTIVE_CLASS} #etapa1 .mgrid{grid-template-columns:1fr}
        body.${ACTIVE_CLASS} #etapa1 .mfield{grid-column:1/-1}
        body.${ACTIVE_CLASS} .meta-trust-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
        body.${ACTIVE_CLASS} .meta-trust-row span{min-height:46px;padding:7px 5px;font-size:9.7px}
      }

      @media(max-width:380px){
        body.${ACTIVE_CLASS} .meta-trust-row{grid-template-columns:1fr}
        body.${ACTIVE_CLASS} .meta-trust-row span{min-height:36px}
      }

      @media(prefers-reduced-motion:reduce){
        body.${ACTIVE_CLASS} #etapa1 .btn-modal-next{transition:none}
      }
    `;
    document.head.appendChild(style);
  }

  function moveTrustRow() {
    const trust = byId("meta-trust-row");
    const actions = document.querySelector("#etapa1 .modal-actions");
    if (!trust || !actions || trust.dataset.wtHeroMoved === "1") return;

    Array.from(trust.querySelectorAll("span")).forEach((item) => {
      item.textContent = item.textContent.replace(/^\s*✓\s*/, "");
    });

    actions.insertAdjacentElement("afterend", trust);
    trust.dataset.wtHeroMoved = "1";
  }

  function enhanceGeoButton() {
    const button = byId("btnNaoSeiCepModal");
    const grid = document.querySelector("#etapa1 .mgrid");
    const numberField = byId("field-mNumero");
    if (!button) return;

    button.textContent = "Não sabe seu CEP? Use sua localização";
    button.classList.add("wt-hero-geo");

    if (grid && numberField && button.parentElement !== grid) {
      numberField.insertAdjacentElement("afterend", button);
    }
  }

  function isStepOneVisible() {
    const step = byId("etapa1");
    if (!step) return false;
    return step.style.display !== "none" && !step.hidden;
  }

  function decorateStepOneTitle() {
    const title = byId("meta-landing-title");
    if (!title || !isStepOneVisible()) return;
    if (title.querySelector(".wt-hero-accent")) return;

    const plain = String(title.textContent || "").trim().toLowerCase();
    if (plain === "consulte a cobertura no seu endereço") {
      title.innerHTML = 'Consulte a <span class="wt-hero-accent">cobertura</span> no seu endereço';
    }
  }

  function updateStepState() {
    document.body.classList.toggle(ACTIVE_CLASS, isStepOneVisible());
    decorateStepOneTitle();
  }

  function observeSteps() {
    const title = byId("meta-landing-title");
    const steps = [1, 2, 3, 4, 5].map((n) => byId(`etapa${n}`)).filter(Boolean);
    const success = byId("etapaSucesso");
    if (success) steps.push(success);

    const observer = new MutationObserver(updateStepState);
    steps.forEach((step) => observer.observe(step, { attributes: true, attributeFilter: ["style", "hidden", "class"] }));
    if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
  }

  function install() {
    injectStyles();
    moveTrustRow();
    enhanceGeoButton();
    updateStepState();
    observeSteps();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
