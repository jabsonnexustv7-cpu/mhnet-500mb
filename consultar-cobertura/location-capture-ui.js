// Simplifica a opção "Não sei meu CEP" e remove o mapa manual do fluxo principal.
(function () {
  "use strict";

  // O cliente não precisa escolher um ponto no mapa. A localização vem somente do GPS/navegador.
  if (typeof window.initModalLocationMap === "function") {
    window.initModalLocationMap = function () { return null; };
  }

  function track(eventName, params) {
    try {
      if (typeof window.trackGA4 === "function") window.trackGA4(eventName, params || {});
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById("wt-no-cep-ui-styles")) return;

    const style = document.createElement("style");
    style.id = "wt-no-cep-ui-styles";
    style.textContent = `
      #btnNaoSeiCepModal.wt-no-cep-cta{
        display:flex !important;
        width:100% !important;
        align-items:center;
        justify-content:center;
        gap:8px;
        margin-top:10px !important;
        padding:12px 14px !important;
        border:1.5px solid #16a34a !important;
        border-radius:12px !important;
        background:#f0fdf4 !important;
        color:#087a36 !important;
        font-size:13px !important;
        font-weight:850 !important;
        line-height:1.25 !important;
        text-align:center !important;
        box-shadow:0 5px 14px rgba(22,163,74,.10) !important;
        cursor:pointer;
      }
      #btnNaoSeiCepModal.wt-no-cep-cta:hover,
      #btnNaoSeiCepModal.wt-no-cep-cta:focus-visible{
        background:#dcfce7 !important;
        border-color:#15803d !important;
        outline:none;
        box-shadow:0 7px 18px rgba(22,163,74,.16) !important;
      }

      #modalLocationBox.wt-gps-only{
        padding:15px !important;
        border:1.5px solid #16a34a !important;
        border-radius:16px !important;
        background:linear-gradient(180deg,#f7fff9 0%,#effcf3 100%) !important;
        box-shadow:0 8px 22px rgba(22,163,74,.08) !important;
      }
      #modalLocationBox.wt-gps-only .modal-location-head{
        display:block !important;
      }
      #modalLocationBox.wt-gps-only .modal-location-head > div{
        text-align:center;
        margin-bottom:12px;
      }
      #modalLocationBox.wt-gps-only .modal-location-head strong{
        display:block;
        color:#0a2463 !important;
        font-size:16px !important;
        margin-bottom:5px;
      }
      #modalLocationBox.wt-gps-only .modal-location-head span{
        display:block;
        color:#52627f !important;
        font-size:12.5px !important;
        line-height:1.45 !important;
      }
      #modalLocationBox.wt-gps-only #btnUsarLocalizacaoModal{
        display:flex !important;
        width:100% !important;
        min-height:50px;
        align-items:center;
        justify-content:center;
        margin:0 !important;
        border-radius:12px !important;
        font-size:14px !important;
        font-weight:900 !important;
        box-shadow:0 8px 20px rgba(0,200,83,.20) !important;
      }

      /* Elementos técnicos e mapa manual removidos da experiência do cliente. */
      #modalLocationBox.wt-gps-only #modalLocationMap,
      #modalLocationBox.wt-gps-only #modalLocationStatus,
      #modalLocationBox.wt-gps-only .map-tap-hint,
      #modalLocationBox.wt-gps-only label[for="mEnderecoDetectadoLocalizacao"],
      #modalLocationBox.wt-gps-only #mEnderecoDetectadoLocalizacao,
      #modalLocationBox.wt-gps-only .modal-location-coords{
        display:none !important;
      }

      @media(max-width:560px){
        #btnNaoSeiCepModal.wt-no-cep-cta{font-size:13px !important;padding:13px 10px !important}
        #modalLocationBox.wt-gps-only{padding:14px 12px !important}
        #modalLocationBox.wt-gps-only .modal-location-head strong{font-size:15px !important}
        #modalLocationBox.wt-gps-only #btnUsarLocalizacaoModal{min-height:52px;font-size:14px !important}
      }
    `;
    document.head.appendChild(style);
  }

  function updateCopy() {
    const noCepButton = document.getElementById("btnNaoSeiCepModal");
    if (noCepButton) {
      noCepButton.classList.add("wt-no-cep-cta");
      noCepButton.innerHTML = "📍 <span><strong>Não sabe seu CEP?</strong> Use sua localização</span>";
      noCepButton.setAttribute("aria-label", "Não sabe seu CEP? Use sua localização para encontrar o endereço");
    }

    const locationBox = document.getElementById("modalLocationBox");
    if (locationBox) {
      locationBox.classList.add("wt-gps-only");

      const title = locationBox.querySelector(".modal-location-head strong");
      if (title) title.textContent = "📍 Encontre seu endereço pela localização";

      const description = locationBox.querySelector(".modal-location-head span");
      if (description) description.textContent = "Toque no botão abaixo e autorize a localização. O endereço será preenchido automaticamente.";
    }

    const captureButton = document.getElementById("btnUsarLocalizacaoModal");
    if (captureButton) {
      captureButton.textContent = "📍 Capturar minha localização";
      captureButton.setAttribute("aria-label", "Capturar minha localização para preencher o endereço automaticamente");
    }
  }

  injectStyles();
  updateCopy();

  document.addEventListener("DOMContentLoaded", function () {
    updateCopy();

    document.getElementById("btnNaoSeiCepModal")?.addEventListener("click", function () {
      track("nao_sei_cep_clicou", { origem: "landing_cobertura_etapa_endereco" });
      setTimeout(updateCopy, 0);
    });

    document.getElementById("btnUsarLocalizacaoModal")?.addEventListener("click", function () {
      track("capturar_localizacao_clicou", { origem: "landing_cobertura_sem_cep" });
    });
  });
})();
