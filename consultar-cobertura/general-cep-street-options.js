// UX de confirmação de logradouro para CEP geral na landing pública.
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getPending() {
    const resolution = window.WEBTURBO_LAST_COVERAGE;
    const coverage = resolution && resolution.coverage;
    if (!coverage || coverage.status !== "PENDENTE") return null;

    const options = Array.isArray(coverage.streetOptions)
      ? coverage.streetOptions
          .map((item) => ({
            street: String(item && item.street || "").trim(),
            city: String(item && item.city || "").trim()
          }))
          .filter((item) => item.street)
      : [];

    const matchedStreet = String(coverage.matchedStreet || "").trim();
    if (!options.length && matchedStreet) {
      options.push({ street: matchedStreet, city: "" });
    }

    const unique = [];
    const seen = new Set();
    options.forEach((item) => {
      const key = item.street.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(item);
    });

    return {
      reason: String(coverage.reason || "").trim(),
      options: unique.slice(0, 5)
    };
  }

  function pendingPlainMessage(pending) {
    if (!pending) return "";
    if (pending.options.length === 1) {
      return "Encontramos um endereço compatível. Selecione o logradouro abaixo para confirmar e continuar.";
    }
    if (pending.options.length > 1) {
      return "Encontramos mais de um endereço compatível. Selecione o seu logradouro abaixo para continuar.";
    }
    return "Não conseguimos identificar o logradouro com segurança. Informe o nome completo da rua ou avenida e consulte novamente.";
  }

  function stylePendingBox(box, pending) {
    if (!box) return;
    if (!pending) {
      box.style.background = "";
      box.style.borderColor = "";
      box.style.color = "";
      return;
    }
    box.style.background = "#fff8e6";
    box.style.borderColor = "#e6b94f";
    box.style.color = "#6f4d00";
  }

  function streetButton(item, index) {
    return `<button type="button" data-wt-street-index="${index}" style="display:block;width:100%;text-align:left;margin-top:8px;padding:12px 14px;border:1px solid #d5a83c;border-radius:10px;background:#fff;color:#17335f;font:inherit;font-weight:700;cursor:pointer;">${escapeHtml(item.street)}</button>`;
  }

  function setChosenStreet(item) {
    const street = document.getElementById("mLogradouro");
    const city = document.getElementById("mCidade");
    if (street) {
      street.value = item.street;
      street.dispatchEvent(new Event("input", { bubbles: true }));
      street.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (city && item.city) {
      city.value = item.city;
      city.dispatchEvent(new Event("input", { bubbles: true }));
      city.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function renderModalPending(pending) {
    const box = document.getElementById("modalErro1");
    if (!box || !pending) return;

    stylePendingBox(box, true);
    box.classList.add("show");

    const buttons = pending.options.map(streetButton).join("");
    box.innerHTML = `<strong>Confirme seu logradouro</strong><br><span>${escapeHtml(pendingPlainMessage(pending))}</span>${buttons}`;

    box.querySelectorAll("[data-wt-street-index]").forEach((button) => {
      button.addEventListener("click", async function () {
        const index = Number(button.getAttribute("data-wt-street-index"));
        const current = getPending();
        const item = current && current.options[index];
        if (!item) return;

        setChosenStreet(item);

        box.querySelectorAll("button").forEach((btn) => { btn.disabled = true; });
        box.innerHTML = `<strong>Logradouro selecionado:</strong> ${escapeHtml(item.street)}<br>Consultando cobertura...`;

        if (typeof window.validarEtapaEndereco === "function") {
          await window.validarEtapaEndereco();
        }
      });
    });
  }

  // Remove qualquer referência à operadora nas mensagens auxiliares da página.
  if (typeof window.setStatus === "function") {
    const previousSetStatus = window.setStatus;
    window.setStatus = function (text, type) {
      const pending = getPending();
      if (pending && String(type || "") === "bad") {
        return previousSetStatus.call(this, pendingPlainMessage(pending), "");
      }
      return previousSetStatus.apply(this, arguments);
    };
  }

  if (typeof window.wtSetStatus === "function") {
    const previousWtSetStatus = window.wtSetStatus;
    window.wtSetStatus = function (text, type) {
      const pending = getPending();
      if (pending && String(type || "") === "bad") {
        return previousWtSetStatus.call(this, pendingPlainMessage(pending), "");
      }
      return previousWtSetStatus.apply(this, arguments);
    };
  }

  // A página /consultar-cobertura/ usa validarEtapaEndereco() como consulta principal.
  if (typeof window.validarEtapaEndereco === "function") {
    const previousValidateAddress = window.validarEtapaEndereco;
    window.validarEtapaEndereco = async function () {
      const box = document.getElementById("modalErro1");
      stylePendingBox(box, false);

      const result = await previousValidateAddress.apply(this, arguments);
      const pending = getPending();
      if (!pending) return result;

      // PENDENTE não pode avançar nem aparecer como ausência de cobertura.
      if (typeof window.modalCoverageValidated !== "undefined") {
        window.modalCoverageValidated = false;
      }

      renderModalPending(pending);
      return result;
    };
  }
})();
