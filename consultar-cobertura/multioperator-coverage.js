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
    window.WEBTURBO_LAST_COVERAGE = resolution;

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
    const data = await fetchJson(LEGACY_MHNET_ENDPOINT, payload);
    if (data?.ok === true && data?.viavel === true) {
      const resolution = adaptResolution({
        ok: true,
        viable: true,
        operator: { code: "MHNET", name: "MhNet" },
        normalizedAddress: normalizeAddress(payload),
        coverage: { status: "VIAVEL", reason: data.motivo || "", coords: data.coords || "" },
        plans: MHNET_PLANS
      });
      applyPlans(resolution);
      return resolution;
    }
    return { ...data, viable: false, viavel: false, operator: null, plans: [] };
  }

  async function resolveCoverage(payload) {
    const address = normalizeAddress(payload);
    if (address.postalCode.length !== 8) return resolveLegacyMhnet(payload);

    const key = addressKey(address);
    const cached = readCache(key);
    if (cached?.result) {
      const resolution = adaptResolution(cached.result);
      applyPlans(resolution);
      return resolution;
    }

    const data = await fetchJson(RESOLVER_ENDPOINT, address);
    writeCache(key, data);
    const resolution = adaptResolution(data);
    applyPlans(resolution);
    return resolution;
  }

  // Os três fluxos existentes passam a usar o mesmo resolvedor e o mesmo cache.
  consultarCoberturaCloudRun = resolveCoverage;
  consultarCoberturaCloudRunComFallback = resolveCoverage;
  wtConsultarCoberturaEndpointComFallback = resolveCoverage;

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
