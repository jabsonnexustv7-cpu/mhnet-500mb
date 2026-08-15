// Escolha de canal apos confirmacao de cobertura na landing de anuncios.
(function () {
  "use strict";

  const COUNTDOWN_SECONDS = 10;
  const FALLBACK_WHATS_NUMBER = "555193187300";

  let overlay = null;
  let countdownTimer = null;
  let remainingSeconds = COUNTDOWN_SECONDS;
  let choiceResolved = false;
  let ctaWasVisible = false;
  let previousBodyOverflow = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function track(eventName, params) {
    try {
      if (typeof trackGA4 === "function") trackGA4(eventName, params || {});
    } catch (_) {}
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function currentCoverageData() {
    try {
      if (typeof coberturaPaginaData !== "undefined" && coberturaPaginaData) {
        return coberturaPaginaData;
      }
    } catch (_) {}

    return {
      cep: byId("cep")?.value || "",
      numero: byId("numero")?.value || "",
      logradouro: "",
      bairro: "",
      cidade: "",
      uf: ""
    };
  }

  function coverageContext() {
    const data = currentCoverageData() || {};
    return {
      cidade: String(data.cidade || "").trim(),
      uf: String(data.uf || "").trim().toUpperCase(),
      cep: onlyDigits(data.cep || byId("cep")?.value || "")
    };
  }

  function formatCep(value) {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return String(value || "").trim();
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  function formatAddress(data) {
    const street = String(data.logradouro || "").trim();
    const number = String(data.numero || "").trim();
    const bairro = String(data.bairro || "").trim();
    const cidade = String(data.cidade || "").trim();
    const uf = String(data.uf || "").trim().toUpperCase();

    const firstLine = [street, number].filter(Boolean).join(", ");
    const location = [cidade, uf].filter(Boolean).join("/");
    const parts = [firstLine, bairro, location].filter(Boolean);
    return parts.join(" - ") || "Endereco consultado no site";
  }

  function whatsappUrl() {
    const data = currentCoverageData() || {};
    const cep = formatCep(data.cep || byId("cep")?.value || "");
    const numero = String(data.numero || byId("numero")?.value || "").trim();
    const endereco = formatAddress(data);
    const number = typeof WHATS_NUMBER !== "undefined" && WHATS_NUMBER
      ? String(WHATS_NUMBER)
      : FALLBACK_WHATS_NUMBER;

    const message = [
      "Olá! Consultei a cobertura pelo site da WebTurbo e há disponibilidade no meu endereço. Gostaria de continuar a contratação pelo WhatsApp.",
      "",
      `CEP: ${cep || "Não informado"}`,
      `Número: ${numero || "Não informado"}`,
      `Endereço: ${endereco}`
    ].join("\n");

    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  function addressLabel() {
    const data = currentCoverageData() || {};
    const endereco = formatAddress(data);
    const cep = formatCep(data.cep || byId("cep")?.value || "");
    return cep ? `${endereco} · CEP ${cep}` : endereco;
  }

  function injectStyles() {
    if (byId("wt-coverage-choice-styles")) return;

    const style = document.createElement("style");
    style.id = "wt-coverage-choice-styles";
    style.textContent = `
      .wt-coverage-choice-overlay{position:fixed;inset:0;z-index:2147482900;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(7,22,55,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
      .wt-coverage-choice-overlay.is-open{display:flex}
      .wt-coverage-choice-dialog{position:relative;width:min(520px,100%);max-height:92vh;overflow:auto;border-radius:22px;background:#fff;box-shadow:0 28px 80px rgba(7,22,55,.34);padding:28px 24px 22px;color:#102554;text-align:center}
      .wt-coverage-choice-close{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:#eef3ff;color:#15346d;font-size:25px;line-height:1;cursor:pointer}
      .wt-coverage-choice-icon{width:58px;height:58px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8fff1;color:#008b3d;font-size:30px;font-weight:900}
      .wt-coverage-choice-dialog h2{margin:0 38px 8px;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:clamp(24px,5vw,31px);font-weight:900;line-height:1.12}
      .wt-coverage-choice-lead{margin:0 auto 10px;color:#3f506c;font-size:15px;line-height:1.5;max-width:430px}
      .wt-coverage-choice-address{margin:0 auto 20px;padding:10px 12px;border-radius:12px;background:#f4f7fc;color:#53627b;font-size:12px;line-height:1.4;max-width:440px}
      .wt-coverage-choice-question{display:block;margin-bottom:12px;color:#102554;font-size:15px;font-weight:800}
      .wt-coverage-choice-actions{display:grid;gap:10px}
      .wt-coverage-choice-action{width:100%;min-height:58px;border-radius:14px;padding:12px 15px;border:0;cursor:pointer;font-family:inherit;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px;transition:transform .15s ease,filter .15s ease,box-shadow .15s ease}
      .wt-coverage-choice-action:hover,.wt-coverage-choice-action:focus-visible{transform:translateY(-1px);filter:brightness(1.03);outline:none}
      .wt-coverage-choice-site{background:#0a2463;color:#fff;box-shadow:0 9px 22px rgba(10,36,99,.18)}
      .wt-coverage-choice-whatsapp{background:#00a651;color:#fff;box-shadow:0 9px 22px rgba(0,166,81,.16)}
      .wt-coverage-choice-action strong{display:block;font-size:15px;font-weight:800;line-height:1.2}
      .wt-coverage-choice-action small{display:block;margin-top:3px;font-size:11px;font-weight:600;opacity:.82;line-height:1.25}
      .wt-coverage-choice-arrow{font-size:23px;font-weight:800;line-height:1}
      .wt-coverage-choice-countdown{margin:15px 0 2px;color:#66758f;font-size:12px;line-height:1.45}
      .wt-coverage-choice-countdown strong{color:#0a2463}
      .wt-coverage-choice-dismiss{margin-top:3px;border:0;background:transparent;color:#66758f;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
      @media(max-width:560px){.wt-coverage-choice-overlay{align-items:flex-end;padding:8px}.wt-coverage-choice-dialog{width:100%;max-height:94vh;border-radius:22px 22px 16px 16px;padding:24px 14px 16px}.wt-coverage-choice-dialog h2{font-size:24px}.wt-coverage-choice-action{min-height:62px;padding:13px 14px}}
      @media(prefers-reduced-motion:reduce){.wt-coverage-choice-action{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function buildModal() {
    if (overlay) return overlay;

    injectStyles();
    overlay = document.createElement("div");
    overlay.id = "wt-coverage-choice-overlay";
    overlay.className = "wt-coverage-choice-overlay";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <div class="wt-coverage-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="wt-coverage-choice-title" aria-describedby="wt-coverage-choice-description">
        <button type="button" class="wt-coverage-choice-close" id="wt-coverage-choice-close" aria-label="Fechar">×</button>
        <div class="wt-coverage-choice-icon" aria-hidden="true">✓</div>
        <h2 id="wt-coverage-choice-title">Ótima notícia! Temos cobertura no seu endereço.</h2>
        <p class="wt-coverage-choice-lead" id="wt-coverage-choice-description">Encontramos internet fibra disponível para o endereço informado.</p>
        <div class="wt-coverage-choice-address" id="wt-coverage-choice-address"></div>
        <span class="wt-coverage-choice-question">Como você prefere continuar?</span>
        <div class="wt-coverage-choice-actions">
          <button type="button" class="wt-coverage-choice-action wt-coverage-choice-site" id="wt-coverage-choice-site">
            <span><strong>Continuar por aqui</strong><small>Escolher plano e fazer a contratação online</small></span>
            <span class="wt-coverage-choice-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" class="wt-coverage-choice-action wt-coverage-choice-whatsapp" id="wt-coverage-choice-whatsapp">
            <span><strong>Continuar no WhatsApp</strong><small>Falar com nossa equipe pelo WhatsApp</small></span>
            <span class="wt-coverage-choice-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <p class="wt-coverage-choice-countdown" id="wt-coverage-choice-countdown" aria-live="polite"></p>
        <button type="button" class="wt-coverage-choice-dismiss" id="wt-coverage-choice-dismiss">Agora não</button>
      </div>
    `;

    document.body.appendChild(overlay);

    byId("wt-coverage-choice-site")?.addEventListener("click", continueOnSite);
    byId("wt-coverage-choice-whatsapp")?.addEventListener("click", continueOnWhatsappManual);
    byId("wt-coverage-choice-close")?.addEventListener("click", dismissModal);
    byId("wt-coverage-choice-dismiss")?.addEventListener("click", dismissModal);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) dismissModal();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay?.classList.contains("is-open")) dismissModal();
    });

    return overlay;
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function updateCountdownText() {
    const el = byId("wt-coverage-choice-countdown");
    if (!el) return;
    el.innerHTML = `Se nenhuma opção for escolhida, continuaremos pelo WhatsApp em <strong>${remainingSeconds}s</strong>.`;
  }

  function startCountdown() {
    stopCountdown();
    remainingSeconds = COUNTDOWN_SECONDS;
    updateCountdownText();

    countdownTimer = setInterval(function () {
      if (choiceResolved || document.hidden) return;

      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        stopCountdown();
        continueOnWhatsappAutomatic();
        return;
      }
      updateCountdownText();
    }, 1000);
  }

  function closeModal() {
    stopCountdown();
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousBodyOverflow;
  }

  function dismissModal() {
    if (choiceResolved) return;
    choiceResolved = true;
    const ctx = coverageContext();
    track("cobertura_opcoes_fechadas", ctx);
    closeModal();
  }

  function continueOnSite() {
    if (choiceResolved) return;
    choiceResolved = true;
    const ctx = coverageContext();
    track("continuar_contratacao_site", {
      ...ctx,
      origem_botao: "modal_pos_cobertura"
    });
    closeModal();

    try {
      if (typeof abrirModalCobertura === "function") {
        abrirModalCobertura();
      }
    } catch (error) {
      console.warn("Não foi possível abrir a contratação pelo site.", error);
    }
  }

  function continueOnWhatsappManual() {
    if (choiceResolved) return;
    choiceResolved = true;
    const ctx = coverageContext();
    const url = whatsappUrl();

    try {
      if (typeof trackGoogleAdsWhatsAppConversion === "function") {
        trackGoogleAdsWhatsAppConversion();
      }
    } catch (_) {}

    track("continuar_contratacao_whatsapp", {
      ...ctx,
      origem: "clique_manual",
      origem_botao: "modal_pos_cobertura"
    });
    track("clique_whatsapp", {
      ...ctx,
      origem_botao: "modal_pos_cobertura"
    });

    closeModal();
    window.location.href = url;
  }

  function continueOnWhatsappAutomatic() {
    if (choiceResolved) return;
    choiceResolved = true;
    const ctx = coverageContext();
    const url = whatsappUrl();

    // Não registra conversão de clique do Google Ads: não houve clique voluntário.
    track("continuar_contratacao_whatsapp", {
      ...ctx,
      origem: "redirecionamento_automatico",
      origem_botao: "modal_pos_cobertura"
    });

    closeModal();
    window.location.href = url;
  }

  function showModal() {
    if (overlay?.classList.contains("is-open")) return;

    const data = currentCoverageData();
    if (!data) return;

    const modal = buildModal();
    choiceResolved = false;
    byId("wt-coverage-choice-address").textContent = addressLabel();
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    const ctx = coverageContext();
    track("cobertura_opcoes_exibidas", ctx);
    startCountdown();

    requestAnimationFrame(function () {
      byId("wt-coverage-choice-site")?.focus({ preventScroll: true });
    });
  }

  function patchCoverageSuccessStatus() {
    try {
      if (typeof window.setStatus !== "function" || window.setStatus.__wtCoverageChoicePatched) return;

      const originalSetStatus = window.setStatus;
      const patchedSetStatus = function (text, type) {
        const result = originalSetStatus.apply(this, arguments);
        const success = type === "ok" && /cobertura\s+dispon[ií]vel/i.test(String(text || ""));
        if (success) setTimeout(showModal, 0);
        return result;
      };

      patchedSetStatus.__wtCoverageChoicePatched = true;
      window.setStatus = patchedSetStatus;
    } catch (error) {
      console.warn("Não foi possível conectar o modal ao status de cobertura.", error);
    }
  }

  function observeCoverageResult() {
    const cta = byId("ctaViavel");
    if (!cta) return;

    function evaluate() {
      const visible = cta.classList.contains("show");
      if (visible && !ctaWasVisible) {
        ctaWasVisible = true;
        setTimeout(showModal, 80);
      } else if (!visible) {
        ctaWasVisible = false;
      }
    }

    const observer = new MutationObserver(evaluate);
    observer.observe(cta, { attributes: true, attributeFilter: ["class"] });
    evaluate();
  }

  function initialize() {
    patchCoverageSuccessStatus();
    observeCoverageResult();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
