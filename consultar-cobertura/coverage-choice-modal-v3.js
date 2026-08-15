// Modal unificado de escolha apos confirmacao de cobertura.
(function () {
  "use strict";

  const COUNTDOWN_SECONDS = 10;
  const FALLBACK_WHATS_NUMBER = "555193187300";
  let overlay = null, timer = null, remaining = COUNTDOWN_SECONDS, resolved = false, activeOptions = {}, previousBodyOverflow = "", ctaWasVisible = false;
  const byId = (id) => document.getElementById(id);
  const digits = (value) => String(value || "").replace(/\D+/g, "");

  function track(name, params) {
    try { if (typeof trackGA4 === "function") trackGA4(name, params || {}); } catch (_) {}
  }

  function currentData() {
    if (activeOptions && activeOptions.data) return activeOptions.data;
    try { if (typeof coberturaPaginaData !== "undefined" && coberturaPaginaData) return coberturaPaginaData; } catch (_) {}
    return {
      cep: byId("cep")?.value || byId("mCep")?.value || "",
      numero: byId("numero")?.value || byId("mNumero")?.value || "",
      logradouro: byId("mLogradouro")?.value || "",
      bairro: byId("mBairro")?.value || "",
      cidade: byId("mCidade")?.value || "",
      uf: byId("mUf")?.value || ""
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
      origem_consulta: activeOptions.source || "box_principal"
    };
  }

  function whatsappUrl() {
    const data = currentData();
    const number = typeof WHATS_NUMBER !== "undefined" && WHATS_NUMBER ? String(WHATS_NUMBER) : FALLBACK_WHATS_NUMBER;
    const message = [
      "Olá! Consultei a cobertura pelo site da WebTurbo e há disponibilidade no meu endereço. Gostaria de continuar a contratação pelo WhatsApp.",
      "",
      `CEP: ${formatCep(data.cep) || "Não informado"}`,
      `Número: ${String(data.numero || "").trim() || "Não informado"}`,
      `Endereço: ${formatAddress(data)}`
    ].join("\n");
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  function injectStyles() {
    if (byId("wt-coverage-choice-v3-styles")) return;
    const style = document.createElement("style");
    style.id = "wt-coverage-choice-v3-styles";
    style.textContent = `.wt-choice-v3-overlay{position:fixed;inset:0;z-index:2147483200;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(7,22,55,.74);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}.wt-choice-v3-overlay.is-open{display:flex}.wt-choice-v3-dialog{position:relative;width:min(520px,100%);max-height:94vh;overflow:auto;border-radius:22px;background:#fff;padding:28px 24px 20px;text-align:center;color:#102554;box-shadow:0 28px 80px rgba(7,22,55,.34)}.wt-choice-v3-close{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:#eef3ff;color:#15346d;font-size:25px;cursor:pointer}.wt-choice-v3-icon{width:58px;height:58px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8fff1;color:#008b3d;font-size:30px;font-weight:900}.wt-choice-v3-dialog h2{margin:0 38px 8px;color:#0a2463;font-family:Montserrat,'Open Sans',sans-serif;font-size:clamp(24px,5vw,31px);font-weight:900;line-height:1.12}.wt-choice-v3-lead{margin:0 auto 10px;color:#3f506c;font-size:15px;line-height:1.5;max-width:430px}.wt-choice-v3-address{margin:0 auto 20px;padding:10px 12px;border-radius:12px;background:#f4f7fc;color:#53627b;font-size:12px;line-height:1.4;max-width:440px}.wt-choice-v3-question{display:block;margin-bottom:12px;font-size:15px;font-weight:800}.wt-choice-v3-actions{display:grid;gap:10px}.wt-choice-v3-action{width:100%;min-height:60px;border:0;border-radius:14px;padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;color:#fff;font-family:inherit;cursor:pointer}.wt-choice-v3-site{background:#0a2463}.wt-choice-v3-whatsapp{background:#00a651}.wt-choice-v3-action strong{display:block;font-size:15px;font-weight:800}.wt-choice-v3-action small{display:block;margin-top:3px;font-size:11px;font-weight:600;opacity:.84}.wt-choice-v3-arrow{font-size:23px;font-weight:800}.wt-choice-v3-countdown{margin:15px 0 2px;color:#66758f;font-size:12px;line-height:1.45}.wt-choice-v3-countdown strong{color:#0a2463}.wt-choice-v3-dismiss{margin-top:3px;border:0;background:transparent;color:#66758f;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px}@media(max-width:560px){.wt-choice-v3-overlay{align-items:flex-end;padding:8px}.wt-choice-v3-dialog{width:100%;border-radius:22px 22px 16px 16px;padding:24px 14px 16px}.wt-choice-v3-dialog h2{font-size:24px}.wt-choice-v3-action{min-height:62px}}`;
    document.head.appendChild(style);
  }

  function build() {
    if (overlay) return overlay;
    injectStyles();
    overlay = document.createElement("div");
    overlay.id = "wt-coverage-choice-v3";
    overlay.className = "wt-choice-v3-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `<div class="wt-choice-v3-dialog" role="dialog" aria-modal="true" aria-labelledby="wt-choice-v3-title"><button type="button" class="wt-choice-v3-close" id="wt-choice-v3-close" aria-label="Fechar">×</button><div class="wt-choice-v3-icon" aria-hidden="true">✓</div><h2 id="wt-choice-v3-title">Ótima notícia! Temos cobertura no seu endereço.</h2><p class="wt-choice-v3-lead">Encontramos internet fibra disponível para o endereço informado.</p><div class="wt-choice-v3-address" id="wt-choice-v3-address"></div><span class="wt-choice-v3-question">Como você prefere continuar?</span><div class="wt-choice-v3-actions"><button type="button" class="wt-choice-v3-action wt-choice-v3-site" id="wt-choice-v3-site"><span><strong>Continuar por aqui</strong><small>Escolher plano e fazer a contratação online</small></span><span class="wt-choice-v3-arrow">→</span></button><button type="button" class="wt-choice-v3-action wt-choice-v3-whatsapp" id="wt-choice-v3-whatsapp"><span><strong>Continuar no WhatsApp</strong><small>Falar com nossa equipe pelo WhatsApp</small></span><span class="wt-choice-v3-arrow">→</span></button></div><p class="wt-choice-v3-countdown" id="wt-choice-v3-countdown" aria-live="polite"></p><button type="button" class="wt-choice-v3-dismiss" id="wt-choice-v3-dismiss">Agora não</button></div>`;
    document.body.appendChild(overlay);
    byId("wt-choice-v3-site")?.addEventListener("click", continueSite);
    byId("wt-choice-v3-whatsapp")?.addEventListener("click", continueWhatsappManual);
    byId("wt-choice-v3-close")?.addEventListener("click", dismiss);
    byId("wt-choice-v3-dismiss")?.addEventListener("click", dismiss);
    overlay.addEventListener("click", e => { if (e.target === overlay) dismiss(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && overlay?.classList.contains("is-open")) dismiss(); });
    return overlay;
  }

  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function updateTimer() { const el = byId("wt-choice-v3-countdown"); if (el) el.innerHTML = `Se nenhuma opção for escolhida, continuaremos pelo WhatsApp em <strong>${remaining}s</strong>.`; }
  function startTimer() {
    stopTimer(); remaining = COUNTDOWN_SECONDS; updateTimer();
    timer = setInterval(() => {
      if (resolved || document.hidden) return;
      remaining -= 1;
      if (remaining <= 0) { stopTimer(); continueWhatsappAutomatic(); }
      else updateTimer();
    }, 1000);
  }
  function close() { stopTimer(); overlay?.classList.remove("is-open"); overlay?.setAttribute("aria-hidden", "true"); document.body.style.overflow = previousBodyOverflow; }
  function dismiss() { if (resolved) return; resolved = true; track("cobertura_opcoes_fechadas", context()); close(); try { if (typeof activeOptions.onDismiss === "function") activeOptions.onDismiss(); } catch (_) {} }
  function continueSite() {
    if (resolved) return;
    resolved = true;
    track("continuar_contratacao_site", { ...context(), origem_botao: "modal_pos_cobertura" });
    close();
    try {
      if (typeof activeOptions.onSiteContinue === "function") activeOptions.onSiteContinue();
      else if (typeof abrirModalCobertura === "function") abrirModalCobertura();
    } catch (error) { console.warn("Não foi possível continuar a contratação pelo site.", error); }
  }
  function continueWhatsappManual() {
    if (resolved) return;
    resolved = true;
    try { if (typeof trackGoogleAdsWhatsAppConversion === "function") trackGoogleAdsWhatsAppConversion(); } catch (_) {}
    track("continuar_contratacao_whatsapp", { ...context(), origem: "clique_manual", origem_botao: "modal_pos_cobertura" });
    track("clique_whatsapp", { ...context(), origem_botao: "modal_pos_cobertura" });
    const url = whatsappUrl(); close(); window.location.href = url;
  }
  function continueWhatsappAutomatic() {
    if (resolved) return;
    resolved = true;
    track("continuar_contratacao_whatsapp", { ...context(), origem: "redirecionamento_automatico", origem_botao: "modal_pos_cobertura" });
    const url = whatsappUrl(); close(); window.location.href = url;
  }
  function show(options) {
    if (overlay?.classList.contains("is-open")) return;
    activeOptions = options || {};
    const data = currentData(); if (!data) return;
    const modal = build(); resolved = false;
    const address = formatAddress(data), cep = formatCep(data.cep);
    byId("wt-choice-v3-address").textContent = cep ? `${address} · CEP ${cep}` : address;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    track("cobertura_opcoes_exibidas", context());
    startTimer();
    requestAnimationFrame(() => byId("wt-choice-v3-site")?.focus({ preventScroll: true }));
  }

  window.webTurboShowCoverageChoice = show;

  function observeMainCoverage() {
    const cta = byId("ctaViavel"); if (!cta) return;
    const evaluate = () => {
      const visible = cta.classList.contains("show");
      if (visible && !ctaWasVisible) { ctaWasVisible = true; setTimeout(() => show({ source: "box_principal" }), 50); }
      else if (!visible) ctaWasVisible = false;
    };
    new MutationObserver(evaluate).observe(cta, { attributes: true, attributeFilter: ["class"] });
    evaluate();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeMainCoverage, { once: true });
  else observeMainCoverage();
})();
