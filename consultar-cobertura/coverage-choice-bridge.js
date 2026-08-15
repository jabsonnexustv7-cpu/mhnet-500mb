// Garante que o fluxo de cobertura dentro do modal de contratacao passe pela escolha Site x WhatsApp.
(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function buildModalCoverageData() {
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
      enderecoCompleto: [
        byId("mLogradouro")?.value || "",
        byId("mNumero")?.value || "",
        byId("mBairro")?.value || "",
        byId("mCidade")?.value || "",
        byId("mUf")?.value || ""
      ].filter(Boolean).join(", "),
      cobertura: coverage
    };
  }

  function coverageWasApproved() {
    try {
      return modalCoverageValidated === true && modalCoverageData && modalCoverageData.viavel === true;
    } catch (_) {
      return false;
    }
  }

  function install() {
    if (typeof window.validarEtapaEndereco !== "function") return false;
    if (window.validarEtapaEndereco.__wtChoiceBridge) return true;

    const original = window.validarEtapaEndereco;

    const wrapped = async function () {
      let beforeCoverage = null;
      try { beforeCoverage = modalCoverageData; } catch (_) {}

      const result = await original.apply(this, arguments);

      if (!coverageWasApproved()) return result;

      let currentCoverage = null;
      try { currentCoverage = modalCoverageData; } catch (_) {}
      if (currentCoverage === beforeCoverage) return result;

      const data = buildModalCoverageData();

      try {
        coberturaPaginaData = data;
      } catch (_) {}

      // O fluxo original avanca direto para a etapa 2. Voltamos para a etapa 1
      // antes do proximo repaint e deixamos a escolha do canal decidir o avanço.
      try {
        if (typeof mostrarEtapa === "function") mostrarEtapa(1);
      } catch (_) {}

      if (typeof window.webTurboShowCoverageChoice === "function") {
        window.webTurboShowCoverageChoice({
          source: "modal_contratacao",
          data,
          onSiteContinue: function () {
            try {
              if (typeof mostrarEtapa === "function") mostrarEtapa(2);
              window.atualizarConfirmacaoLanding?.();
            } catch (error) {
              console.warn("Não foi possível avançar para a seleção de plano.", error);
            }
          }
        });
      } else {
        // Fallback seguro: se o controlador não carregar, mantém o fluxo antigo.
        try {
          if (typeof mostrarEtapa === "function") mostrarEtapa(2);
          window.atualizarConfirmacaoLanding?.();
        } catch (_) {}
      }

      return result;
    };

    wrapped.__wtChoiceBridge = true;
    window.validarEtapaEndereco = wrapped;
    return true;
  }

  if (!install()) {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
