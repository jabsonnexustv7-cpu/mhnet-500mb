// WebTurbo — pós-venda: redirecionamento robusto para WhatsApp.
(function () {
  "use strict";

  if (window.__webturboPostSaleWhatsAppInstalled) return;
  window.__webturboPostSaleWhatsAppInstalled = true;

  const FALLBACK_WHATS_NUMBER = "555193187300";
  let whatsappConversionTracked = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function getWhatsNumber() {
    try {
      if (typeof WHATS_NUMBER !== "undefined" && WHATS_NUMBER) return String(WHATS_NUMBER);
    } catch (_) {}
    return FALLBACK_WHATS_NUMBER;
  }

  function buildWhatsUrl() {
    const cpf = onlyDigits(byId("mCpf")?.value || "");
    const mensagem = `Acabei de concluir um pedido de internet, meu CPF: ${cpf}`;
    return `https://wa.me/${getWhatsNumber()}?text=${encodeURIComponent(mensagem)}`;
  }

  function currentContext() {
    return {
      plano: byId("mPlano")?.value || "",
      cidade: byId("mCidade")?.value?.trim() || "",
      uf: byId("mUf")?.value?.trim().toUpperCase() || ""
    };
  }

  function safeTrackAttempt(mode) {
    const context = currentContext();

    try {
      if (typeof trackGA4 === "function") {
        trackGA4("tentou_redirecionar_whatsapp_pos_venda", {
          origem_botao: "pos_envio_formulario_crm",
          modo_redirecionamento: mode,
          ...context
        });
      } else {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "tentou_redirecionar_whatsapp_pos_venda",
          origem: "site_webturbo",
          origem_botao: "pos_envio_formulario_crm",
          modo_redirecionamento: mode,
          ...context
        });
      }
    } catch (error) {
      console.warn("[WebTurbo] Falha ao registrar tentativa de redirecionamento para WhatsApp.", error);
    }
  }

  function safeTrackLegacyClick(mode) {
    const context = currentContext();
    try {
      if (typeof trackGA4 === "function") {
        trackGA4("clique_whatsapp", {
          origem_botao: mode === "manual"
            ? "pos_envio_formulario_crm_manual"
            : "pos_envio_formulario_crm",
          ...context
        });
      }
    } catch (error) {
      console.warn("[WebTurbo] Falha ao registrar clique/tentativa de WhatsApp.", error);
    }
  }

  function safeTrackWhatsConversionOnce() {
    if (whatsappConversionTracked) return;
    whatsappConversionTracked = true;

    try {
      if (typeof trackGoogleAdsWhatsAppConversion === "function") {
        trackGoogleAdsWhatsAppConversion();
      }
    } catch (error) {
      // Tracking nunca deve impedir o redirecionamento.
      console.warn("[WebTurbo] Falha no tracking de conversão do WhatsApp; seguindo com o redirecionamento.", error);
    }
  }

  function installSuccessFallback() {
    const success = byId("etapaSucesso");
    if (!success) return null;

    const title = success.querySelector("h3");
    if (title) title.textContent = "Cadastro recebido com sucesso!";

    const paragraphs = success.querySelectorAll("p");
    if (paragraphs[0]) {
      paragraphs[0].textContent = "Sua solicitação foi enviada para nossa equipe de agendamento.";
    }

    const countdownParagraph = byId("contadorWhats")?.closest("p");
    if (countdownParagraph) {
      countdownParagraph.textContent = "Para concluir o atendimento, continue no WhatsApp.";
    }

    let hint = byId("posVendaWhatsHint");
    if (!hint) {
      hint = document.createElement("p");
      hint.id = "posVendaWhatsHint";
      hint.textContent = "Se o WhatsApp não abrir automaticamente, toque no botão abaixo.";
      hint.style.marginTop = "8px";
      hint.style.fontSize = "13px";
      hint.style.color = "#4a5a70";
      success.appendChild(hint);
    }

    let button = byId("posVendaWhatsButton");
    if (!button) {
      button = document.createElement("a");
      button.id = "posVendaWhatsButton";
      button.textContent = "Continuar no WhatsApp";
      button.href = buildWhatsUrl();
      button.target = "_self";
      button.rel = "noopener";
      button.setAttribute("role", "button");
      button.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "min-height:52px",
        "margin-top:16px",
        "padding:0 24px",
        "border-radius:10px",
        "background:#00c853",
        "color:#fff",
        "font-family:Montserrat,sans-serif",
        "font-size:15px",
        "font-weight:800",
        "text-decoration:none",
        "box-shadow:0 8px 22px rgba(0,200,83,.28)"
      ].join(";");

      button.addEventListener("click", function () {
        button.href = buildWhatsUrl();
        safeTrackAttempt("manual");
        safeTrackLegacyClick("manual");
        safeTrackWhatsConversionOnce();
        // Não usamos preventDefault: o clique real do usuário deve abrir o link diretamente.
      });

      success.appendChild(button);
    }

    return button;
  }

  // Sobrescreve apenas o redirecionamento final. O envio ao CRM e as demais conversões permanecem intactos.
  window.redirecionarWhatsAppFinal = function redirecionarWhatsAppFinalRobusto() {
    const url = buildWhatsUrl();
    const button = installSuccessFallback();
    if (button) button.href = url;

    // Registra primeiro, mas qualquer falha de tracking fica isolada e nunca bloqueia a navegação.
    safeTrackAttempt("automatico");
    safeTrackLegacyClick("automatico");
    safeTrackWhatsConversionOnce();

    try {
      // Sem espera de 3 segundos: tenta encaminhar assim que o CRM confirma a pré-venda.
      window.location.assign(url);
    } catch (error) {
      console.warn("[WebTurbo] Redirecionamento automático para WhatsApp não foi aceito pelo navegador.", error);
      // O botão manual permanece visível como fallback para Facebook/Instagram in-app browser.
    }
  };

  installSuccessFallback();
})();
