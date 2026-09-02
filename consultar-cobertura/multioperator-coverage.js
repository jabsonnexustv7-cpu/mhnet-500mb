// Integra a landing de cobertura ao resolvedor público multioperadora do CRM.
(function () {
  "use strict";

  const RESOLVER_ENDPOINT = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-coverage/resolve";
  const LEGACY_MHNET_ENDPOINT = "https://consulta-cobertura-mhnet-br-964927461432.southamerica-east1.run.app";
  const CACHE_KEY = "webturbo_site_coverage_v1";
  const REQUEST_TIMEOUT_MS = 18000;
  const MHNET_PLANS = [
    { code: "MHNET_500", name: "FIBRA 500MB", price: 99.90, description: "Boa performance para navegação, vídeos, redes sociais e uso diário da casa." },
    { code: "MHNET_500_GLOBOPLAY", name: "FIBRA 500MB + GLOBOPLAY", price: 114.80, description: "Internet fibra para o dia a dia com Globoplay incluso." },
    { code: "MHNET_500_WIFI_EXTRA", name: "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI", price: 119.90, description: "Mais alcance dentro da casa com um segundo ponto de Wi-Fi cabeado." },
    { code: "MHNET_600_WIFI_EXTRA_GLOBOPLAY", name: "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI + GLOBOPLAY", price: 139.90, description: "Mais velocidade, segundo ponto de Wi-Fi cabeado e Globoplay." },
    { code: "MHNET_700_WIFI_EXTRA", name: "FIBRA 700MB + 1 PONTO EXTRA DE WI-FI", price: 149.90, description: "Mais velocidade e alcance para famílias conectadas." },
    { code: "MHNET_1000_WIFI_EXTRA", name: "FIBRA 1 GIGA + 1 PONTO EXTRA DE WI-FI", price: 159.90, description: "Máxima velocidade e cobertura Wi-Fi ampliada." }
  ];

  const digits = (value) => String(value || "").replace(/\D/g, "");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPrice(value) {
    return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function normalizeAddress(payload) {
    return {
      postalCode: digits(payload?.cep),
      state: String(payload?.uf || "").trim().toUpperCase(),
      city: String(payload?.cidade || "").trim(),
      district: String(payload?.bairro || "").trim(),
      street: String(payload?.logradouro || "").trim(),
      number: String(payload?.numero || "").trim(),
      complement: String(payload?.complemento || "").trim()
    };
  }

  function addressKey(address) {
    return [address.postalCode, address.state, address.city, address.district, address.street, address.number, address.complement]
      .map((value) => String(value || "").trim().toUpperCase())
      .join("|");
  }

  function readCache(key) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      return cached && cached.addressKey === key ? cached : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(key, result) {
    try {
      const previous = readCache(key);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        addressKey: key,
        operatorCode: result?.operator?.code || null,
        state: result?.normalizedAddress?.state || "",
        normalizedAddress: result?.normalizedAddress || null,
        coverage: result?.coverage || null,
        selectedPlan: previous?.selectedPlan || "",
        result
      }));
    } catch (_) {}
  }

  function saveSelectedPlan(planCode) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!cached) return;
      cached.selectedPlan = String(planCode || "");
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (_) {}
  }

  function adaptResolution(data) {
    return {
      ...data,
      viavel: data?.viable === true,
      motivo: data?.coverage?.reason || "",
      coords: data?.coverage?.coords || ""
    };
  }

  function rememberResolution(resolution) {
    window.WEBTURBO_LAST_COVERAGE = resolution || null;
    return resolution;
  }

  function getPendingCoverage(resolution = window.WEBTURBO_LAST_COVERAGE) {
    const coverage = resolution?.coverage;
    if (!coverage || coverage.status !== "PENDENTE") return null;

    const options = Array.isArray(coverage.streetOptions)
      ? coverage.streetOptions
          .map((option) => ({
            street: String(option?.street || "").trim(),
            city: String(option?.city || "").trim()
          }))
          .filter((option) => option.street)
      : [];

    const matchedStreet = String(coverage.matchedStreet || "").trim();
    const candidate = options.length === 1
      ? options[0]
      : (options.length === 0 && matchedStreet ? { street: matchedStreet, city: "" } : null);

    return {
      reason: String(coverage.reason || "").trim(),
      requiresStreet: coverage.requiresStreet === true,
      requiresStreetConfirmation: coverage.requiresStreetConfirmation === true,
      options,
      candidate
    };
  }

  function applyPendingSuggestion(pending, streetId, cityId) {
    if (!pending) return;
    if (!pending.candidate) return;

    const streetInput = document.getElementById(streetId);
    const cityInput = document.getElementById(cityId);
    if (streetInput) streetInput.value = pending.candidate.street;
    if (cityInput && pending.candidate.city) cityInput.value = pending.candidate.city;
  }

  function pendingMessage(pending) {
    if (!pending) return "";
    if (pending.candidate) {
      return `Encontramos o logradouro "${pending.candidate.street}". Confira o nome preenchido e clique novamente em Consultar cobertura para confirmar.`;
    }
    if (pending.options.length > 1) {
      const names = pending.options.slice(0, 5).map((option) => option.street).join("; ");
      return `A TIM encontrou mais de um logradouro compatível: ${names}. Informe o nome completo da rua ou avenida e consulte novamente.`;
    }
    return "Não conseguimos identificar o logradouro com segurança. Informe o nome completo da rua ou avenida e consulte novamente.";
  }

  function looksLikeCoverageFailureMessage(text) {
    const value = String(text || "").toLowerCase();
    return value.includes("cobertura") || value.includes("viabilidade") || value.includes("logradouro");
  }

  function setPendingBoxStyle(box, pending) {
    if (!box) return;
    if (pending) {
      box.style.background = "#fff8e6";
      box.style.borderColor = "#e6b94f";
      box.style.color = "#6f4d00";
    } else {
      box.style.background = "";
      box.style.borderColor = "";
      box.style.color = "";
    }
  }

  function planCard(plan, index) {
    const name = escapeHtml(plan.name);
    const description = escapeHtml(plan.description || "Oferta disponível no endereço consultado.");
    const price = formatPrice(plan.price);
    const code = escapeHtml(plan.code);
    const badge = index === 0 ? "Oferta em destaque" : "Internet fibra";
    return `<div class="meta-plan-card${index === 0 ? " is-popular" : ""}" role="radio" aria-checked="false" tabindex="${index === 0 ? "0" : "-1"}" data-plan="${code}" aria-label="${name}, R$ ${price} por mês">
      <span class="meta-plan-card-check" aria-hidden="true">✓</span>
      <span class="meta-plan-card-inner">
        <span class="meta-plan-card-badge">${badge}</span>
        <h3>${name}</h3>
        <span class="meta-plan-card-description">${description}</span>
        <span class="meta-plan-card-price"><strong>R$ ${price}</strong><small>/mês</small></span>
        <ul><li>Internet fibra óptica</li><li>Oferta validada para o endereço</li><li>Instalação conforme viabilidade técnica</li></ul>
      </span>
    </div>`;
  }

  function applyPlans(resolution) {
    if (!resolution?.viavel || !resolution.operator || !Array.isArray(resolution.plans) || !resolution.plans.length) return;

    const grid = document.getElementById("metaPlanGrid");
    if (grid) {
      grid.setAttribute("aria-label", "Escolha seu plano de internet");
      grid.innerHTML = resolution.plans.map((plan, index) => planCard(plan, index)).join("");
    }

    const select = document.getElementById("mPlano");
    if (select) {
      const cached = readCache(addressKey(resolution.normalizedAddress || {}));
      const previous = select.value || cached?.selectedPlan || "";
      select.innerHTML = '<option value="">Selecione o plano...</option>' + resolution.plans.map((plan) =>
        `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.name)} — R$ ${formatPrice(plan.price)}/mês</option>`
      ).join("");
      select.value = resolution.plans.some((plan) => plan.code === previous) ? previous : "";
    }

    resolution.plans.forEach((plan) => {
      PLAN_LABELS[plan.code] = `${plan.name} — R$ ${formatPrice(plan.price)}/mês`;
      PLAN_VALUES[plan.code] = Number(plan.price || 0);
    });

    window.sincronizarCardsPlanoLanding?.();
  }

  async function fetchJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.message || data?.motivo || "Erro ao consultar cobertura.");
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Consulta demorou mais que o esperado. Tente novamente.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveLegacyMhnet(payload) {
    window.WEBTURBO_LAST_COVERAGE = null;
    const data = await fetchJson(LEGACY_MHNET_ENDPOINT, payload);
    if (data?.ok === true && data?.viavel === true) {
      const resolution = rememberResolution(adaptResolution({
        ok: true,
        viable: true,
        operator: { code: "MHNET", name: "MhNet" },
        normalizedAddress: normalizeAddress(payload),
        coverage: { status: "VIAVEL", reason: data.motivo || "", coords: data.coords || "" },
        plans: MHNET_PLANS
      }));
      applyPlans(resolution);
      return resolution;
    }
    return rememberResolution({ ...data, viable: false, viavel: false, operator: null, plans: [] });
  }

  async function resolveCoverage(payload) {
    window.WEBTURBO_LAST_COVERAGE = null;
    const address = normalizeAddress(payload);
    if (address.postalCode.length !== 8) return resolveLegacyMhnet(payload);

    const key = addressKey(address);
    const cached = readCache(key);
    if (cached?.result) {
      const resolution = rememberResolution(adaptResolution(cached.result));
      applyPlans(resolution);
      return resolution;
    }

    const data = await fetchJson(RESOLVER_ENDPOINT, address);
    writeCache(key, data);
    const resolution = rememberResolution(adaptResolution(data));
    applyPlans(resolution);
    return resolution;
  }

  // Os três fluxos existentes passam a usar o mesmo resolvedor e o mesmo cache.
  consultarCoberturaCloudRun = resolveCoverage;
  consultarCoberturaCloudRunComFallback = resolveCoverage;
  wtConsultarCoberturaEndpointComFallback = resolveCoverage;

  // PENDENTE da TIM é uma consulta ainda não concluída, não uma cobertura inviável.
  // Suprime métricas/notificações de inviabilidade enquanto o logradouro estiver pendente.
  if (typeof trackGA4 === "function") {
    const originalTrackGA4 = trackGA4;
    trackGA4 = function (eventName, payload) {
      if (eventName === "consulta_cobertura_inviavel" && getPendingCoverage()) return;
      return originalTrackGA4.apply(this, arguments);
    };
  }

  if (typeof notificarConsultaViavel === "function") {
    const originalNotifyCoverage = notificarConsultaViavel;
    notificarConsultaViavel = function (payload) {
      if (getPendingCoverage() && payload?.viavel === false) return;
      return originalNotifyCoverage.apply(this, arguments);
    };
  }

  // Fluxo da consulta principal: troca a mensagem de "sem cobertura" pela confirmação do logradouro.
  if (typeof setStatus === "function") {
    const originalSetStatus = setStatus;
    setStatus = function (text, type = "") {
      const pending = getPendingCoverage();
      if (pending && type === "bad" && looksLikeCoverageFailureMessage(text)) {
        applyPendingSuggestion(pending, "consultaLogradouro", "consultaCidade");
        return originalSetStatus(pendingMessage(pending), "");
      }
      return originalSetStatus.apply(this, arguments);
    };
  }

  // Fluxo pré-WhatsApp: mesma regra de pendência.
  if (typeof wtSetStatus === "function") {
    const originalWtSetStatus = wtSetStatus;
    wtSetStatus = function (text, type = "") {
      const pending = getPendingCoverage();
      if (pending && type === "bad" && looksLikeCoverageFailureMessage(text)) {
        applyPendingSuggestion(pending, "wtLogradouroWhats", "wtCidadeWhats");
        return originalWtSetStatus("Precisamos confirmar o logradouro. " + pendingMessage(pending), "");
      }
      return originalWtSetStatus.apply(this, arguments);
    };
  }

  // A landing /consultar-cobertura/ usa a etapa 1 do modal como formulário principal.
  // O botão chama validarEtapaEndereco() por onclick, então envolvemos a função original
  // e, após a resposta, transformamos PENDENTE em confirmação/correção do logradouro.
  if (typeof validarEtapaEndereco === "function") {
    const originalValidateAddress = validarEtapaEndereco;
    validarEtapaEndereco = async function () {
      const errorBox = document.getElementById("modalErro1");
      setPendingBoxStyle(errorBox, false);

      const result = await originalValidateAddress.apply(this, arguments);
      const pending = getPendingCoverage();
      if (!pending) return result;

      modalCoverageValidated = false;
      modalCoverageData = window.WEBTURBO_LAST_COVERAGE;
      applyPendingSuggestion(pending, "mLogradouro", "mCidade");

      if (errorBox) {
        errorBox.innerHTML = `<strong>Precisamos confirmar o logradouro para a TIM.</strong><br>${escapeHtml(pendingMessage(pending))}`;
        errorBox.classList.add("show");
        setPendingBoxStyle(errorBox, true);
      }

      const streetInput = document.getElementById("mLogradouro");
      if (streetInput) {
        try { streetInput.focus({ preventScroll: true }); } catch (_) { streetInput.focus(); }
        streetInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      return result;
    };
  }

  const originalBuildModalPayload = buildModalPayload;
  buildModalPayload = function () {
    const payload = originalBuildModalPayload();
    const coverage = modalCoverageData || window.WEBTURBO_LAST_COVERAGE;
    const planCode = document.getElementById("mPlano")?.value || "";
    payload.operatorCode = coverage?.operator?.code || "";
    payload.planCode = planCode;
    payload.planos = PLAN_LABELS[planCode] ? PLAN_LABELS[planCode].split(" — ")[0] : planCode;
    return payload;
  };

  const originalValidateCrmPayload = validarPayloadCrmSite;
  validarPayloadCrmSite = function (payload) {
    const originalError = originalValidateCrmPayload(payload);
    if (originalError) return originalError;
    if (!/^(TIM|ALGAR|MHNET)$/.test(String(payload.operatorCode || ""))) {
      return { fieldId: "mPlano", step: 2, message: "A cobertura precisa ser validada novamente antes de escolher o plano." };
    }
    if (!String(payload.planCode || "").trim()) {
      return { fieldId: "mPlano", step: 2, message: "Selecione novamente o plano desejado." };
    }
    return null;
  };

  document.addEventListener("DOMContentLoaded", function () {
    const select = document.getElementById("mPlano");
    select?.addEventListener("change", (event) => saveSelectedPlan(event.target.value));

    const grid = document.getElementById("metaPlanGrid");
    grid?.addEventListener("click", (event) => {
      const card = event.target.closest?.(".meta-plan-card[data-plan]");
      if (!card || !select) return;
      select.value = card.dataset.plan || "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      window.sincronizarCardsPlanoLanding?.();
    });
    grid?.addEventListener("keydown", (event) => {
      const card = event.target.closest?.(".meta-plan-card[data-plan]");
      if (!card) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const cards = Array.from(grid.querySelectorAll(".meta-plan-card[data-plan]"));
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      cards[(cards.indexOf(card) + direction + cards.length) % cards.length]?.focus();
    });
  });
})();