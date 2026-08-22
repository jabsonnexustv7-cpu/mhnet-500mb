// WebTurbo — redução de fricção na etapa de dados pessoais.
// O cliente informa o CPF; nome e nascimento são consultados no backend Consulta CPF,
// permanecem editáveis e, quando não retornados, viram campos manuais obrigatórios.
(function () {
  "use strict";

  if (window.__webturboCpfAutofillInstalled) return;
  window.__webturboCpfAutofillInstalled = true;

  const ENDPOINT = "https://vocal-lokum-ee03a5.netlify.app/.netlify/functions/consulta";
  const LOOKUP_TIMEOUT_MS = 9000;
  let lookupCpf = "";
  let lookupPromise = null;
  let debounceTimer = null;

  const byId = (id) => document.getElementById(id);
  const digits = (value) => String(value || "").replace(/\D+/g, "");

  function track(name, params) {
    try { window.trackGA4?.(name, params || {}); } catch (_) {}
    try { window.clarity?.("event", name); } catch (_) {}
  }

  function normalizeResponse(data) {
    const r = data?.result || data?.resultado || {};
    return {
      nome: String(r.nomeCompleto || r.nome || "").trim(),
      nascimento: String(r.dataDeNascimento || r.data_de_nascimento || "").trim()
    };
  }

  function normalizeBirth(value) {
    const raw = String(value || "").trim();
    if (!raw) return { display: "", iso: "" };

    let dd, mm, yyyy;
    let match = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
    if (match) [, dd, mm, yyyy] = match;
    else {
      match = raw.match(/^(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/);
      if (match) [, yyyy, mm, dd] = match;
    }

    if (!dd || !mm || !yyyy) return { display: "", iso: "" };
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd)) {
      return { display: "", iso: "" };
    }
    return { display: `${dd}/${mm}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
  }

  function ensureStatus() {
    let status = byId("wtCpfLookupStatus");
    if (status) return status;
    const field = byId("field-mCpf");
    if (!field) return null;
    status = document.createElement("div");
    status.id = "wtCpfLookupStatus";
    status.className = "wt-cpf-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    field.appendChild(status);
    return status;
  }

  function setStatus(text, type) {
    const status = ensureStatus();
    if (!status) return;
    status.textContent = text || "";
    status.className = `wt-cpf-status${type ? ` is-${type}` : ""}`;
    status.hidden = !text;
  }

  function revealIdentityFields() {
    ["field-mNome", "field-mNascimento"].forEach((id) => {
      const field = byId(id);
      if (!field) return;
      field.hidden = false;
      field.classList.remove("wt-cpf-dependent-hidden");
    });
  }

  function concealIdentityFields() {
    ["field-mNome", "field-mNascimento"].forEach((id) => {
      const field = byId(id);
      if (!field) return;
      field.hidden = true;
      field.classList.add("wt-cpf-dependent-hidden");
    });
  }

  function clearIdentityForNewCpf() {
    const nome = byId("mNome");
    const nascimentoTexto = byId("mNascimentoTexto");
    const nascimento = byId("mNascimento");
    if (nome) {
      nome.value = "";
      delete nome.dataset.wtUserEdited;
    }
    if (nascimentoTexto) {
      nascimentoTexto.value = "";
      delete nascimentoTexto.dataset.wtUserEdited;
    }
    if (nascimento) nascimento.value = "";
    try { window.fieldReset?.("mNome"); } catch (_) {}
    try { window.fieldReset?.("mNascimento"); } catch (_) {}
  }

  function applyResult(result) {
    const nome = byId("mNome");
    const nascimentoTexto = byId("mNascimentoTexto");
    const nascimento = byId("mNascimento");
    const birth = normalizeBirth(result.nascimento);

    revealIdentityFields();

    if (result.nome && nome && !nome.dataset.wtUserEdited) nome.value = result.nome;
    if (birth.display && nascimentoTexto && !nascimentoTexto.dataset.wtUserEdited) {
      nascimentoTexto.value = birth.display;
      if (nascimento) nascimento.value = birth.iso;
    }

    // Sincroniza validadores sem marcar o preenchimento automático como edição manual.
    try { window.sincronizarNascimentoTexto?.(); } catch (_) {}
    try { if (nome?.value) window.fieldOk?.("mNome"); } catch (_) {}
    try { if (nascimento?.value) window.fieldOk?.("mNascimento"); } catch (_) {}

    const hasName = Boolean(nome?.value.trim());
    const hasBirth = Boolean(nascimento?.value || nascimentoTexto?.value.trim());

    if (hasName && hasBirth) {
      setStatus("Dados localizados. Confira e altere se necessário.", "ok");
      track("cpf_dados_localizados", { nome: "sim", nascimento: "sim" });
    } else if (hasName || hasBirth) {
      setStatus("Localizamos parte dos dados. Complete o campo que ficou em branco.", "partial");
      track("cpf_dados_parciais", { nome: hasName ? "sim" : "nao", nascimento: hasBirth ? "sim" : "nao" });
    } else {
      setStatus("Não localizamos nome e nascimento. Preencha os campos abaixo para continuar.", "manual");
      track("cpf_dados_nao_localizados");
    }
  }

  async function fetchCpf(cpf) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const url = `${ENDPOINT}?mode=completa&cpf=${encodeURIComponent(cpf)}`;
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || `http_${response.status}`);
      return normalizeResponse(data);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function lookup({ force = false } = {}) {
    const input = byId("mCpf");
    const cpf = digits(input?.value);
    if (cpf.length !== 11) {
      lookupCpf = "";
      lookupPromise = null;
      concealIdentityFields();
      setStatus("", "");
      return null;
    }

    if (!force && lookupCpf === cpf && lookupPromise) return lookupPromise;
    lookupCpf = cpf;
    setStatus("Buscando seus dados pelo CPF...", "loading");
    track("cpf_consulta_iniciada");

    lookupPromise = fetchCpf(cpf)
      .then((result) => {
        // Ignora resposta atrasada se o cliente já trocou o CPF.
        if (digits(byId("mCpf")?.value) !== cpf) return null;
        applyResult(result);
        return result;
      })
      .catch((error) => {
        if (digits(byId("mCpf")?.value) !== cpf) return null;
        revealIdentityFields();
        setStatus("Não foi possível completar os dados automaticamente. Preencha nome e nascimento para continuar.", "manual");
        track("cpf_consulta_falhou", { motivo: error?.name === "AbortError" ? "timeout" : "erro" });
        return null;
      });

    return lookupPromise;
  }

  function handleCpfInput() {
    const cpf = digits(byId("mCpf")?.value);
    if (cpf !== lookupCpf) {
      lookupCpf = "";
      lookupPromise = null;
      clearIdentityForNewCpf();
      if (cpf.length !== 11) concealIdentityFields();
      setStatus("", "");
    }
    clearTimeout(debounceTimer);
    if (cpf.length === 11) debounceTimer = setTimeout(() => void lookup(), 450);
  }

  function configureUi() {
    const step = byId("etapa3");
    const grid = step?.querySelector(".mgrid");
    const cpfField = byId("field-mCpf");
    const nameField = byId("field-mNome");
    if (!step || !grid || !cpfField || !nameField) return;

    // CPF passa a ser o primeiro dado solicitado.
    if (grid.firstElementChild !== cpfField) grid.insertBefore(cpfField, grid.firstElementChild);
    cpfField.classList.add("full");

    const header = step.querySelector(".modal-header h2");
    const subtitle = step.querySelector(".modal-subtitle");
    if (header) header.textContent = "Seus dados";
    if (subtitle) subtitle.textContent = "Informe seu CPF. Vamos preencher nome e nascimento automaticamente quando disponíveis.";

    const phone2Label = step.querySelector('label[for="mTelefone2"]');
    if (phone2Label) phone2Label.textContent = "Telefone secundário (opcional)";
    const phone2Error = byId("err-mTelefone2");
    if (phone2Error) phone2Error.textContent = "Se informar um segundo telefone, use um número válido e diferente do principal.";

    if (!digits(byId("mCpf")?.value)) concealIdentityFields();
    else revealIdentityFields();
    ensureStatus();
  }

  function patchValidation() {
    if (typeof window.validarEtapaDados !== "function") return false;
    if (window.validarEtapaDados.__wtCpfAutofill) return true;

    const wrapped = async function () {
      const cpfInput = byId("mCpf");
      const cpf = digits(cpfInput?.value);

      ["mNome", "mCpf", "mNascimento", "mEmail", "mTelefone1", "mTelefone2"].forEach((id) => {
        try { window.fieldReset?.(id); } catch (_) {}
      });

      let hasError = false;
      try {
        if (!window.isValidCpf?.(cpfInput?.value)) {
          window.fieldError?.("mCpf", "CPF inválido. Verifique os números.");
          hasError = true;
        } else window.fieldOk?.("mCpf");
      } catch (_) {
        if (cpf.length !== 11) hasError = true;
      }

      if (hasError) {
        cpfInput?.focus({ preventScroll: true });
        return;
      }

      // Garante que a tentativa automática termine antes de validar os campos dependentes.
      await lookup();
      revealIdentityFields();

      const nome = byId("mNome")?.value.trim() || "";
      let nascimento = { ok: false, reason: "empty" };
      try { nascimento = window.sincronizarNascimentoTexto?.() || nascimento; } catch (_) {}

      if (!nome || nome.split(/\s+/).filter(Boolean).length < 2) {
        window.fieldError?.("mNome", "Informe nome e sobrenome.");
        hasError = true;
      } else window.fieldOk?.("mNome");

      if (!nascimento.ok) {
        const messages = {
          empty: "Informe a data de nascimento.",
          incomplete: "Digite a data completa no formato DD/MM/AAAA.",
          invalid: "Informe uma data de nascimento válida.",
          future: "A data de nascimento não pode estar no futuro.",
          year: "Informe um ano de nascimento válido."
        };
        window.fieldError?.("mNascimento", messages[nascimento.reason] || messages.invalid);
        hasError = true;
      } else window.fieldOk?.("mNascimento");

      if (!window.isValidEmail?.(byId("mEmail")?.value)) {
        window.fieldError?.("mEmail", "Informe um e-mail válido.");
        hasError = true;
      } else window.fieldOk?.("mEmail");

      const tel1 = digits(byId("mTelefone1")?.value);
      const tel2 = digits(byId("mTelefone2")?.value);
      if (tel1.length < 10) {
        window.fieldError?.("mTelefone1", "Informe telefone com DDD.");
        hasError = true;
      } else window.fieldOk?.("mTelefone1");

      // Segundo telefone é opcional; só validamos se houver conteúdo.
      if (tel2) {
        if (tel2.length < 10) {
          window.fieldError?.("mTelefone2", "Informe um telefone válido com DDD ou deixe em branco.");
          hasError = true;
        } else if (tel1 === tel2) {
          window.fieldError?.("mTelefone2", "O segundo contato precisa ser diferente do principal.");
          hasError = true;
        } else window.fieldOk?.("mTelefone2");
      } else {
        try { window.fieldReset?.("mTelefone2"); } catch (_) {}
      }

      if (hasError) {
        const firstError = document.querySelector("#etapa3 .mfield.has-error input:not([type='hidden'])");
        if (firstError) {
          firstError.focus({ preventScroll: true });
          firstError.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      try {
        window.enviarLeadDadosPessoais?.().catch?.((error) => console.warn("Não foi possível enviar o evento de Lead.", error));
      } catch (_) {}
      window.mostrarEtapa?.(4);
    };

    wrapped.__wtCpfAutofill = true;
    window.validarEtapaDados = wrapped;
    return true;
  }

  function injectStyles() {
    if (byId("wt-cpf-autofill-styles")) return;
    const style = document.createElement("style");
    style.id = "wt-cpf-autofill-styles";
    style.textContent = `
      #etapa3 .wt-cpf-dependent-hidden{display:none!important}
      #etapa3 .wt-cpf-status{margin-top:4px;padding:9px 11px;border-radius:8px;font-size:12px;line-height:1.4;background:#eef4ff;color:#425a7c;border:1px solid #d7e3f6}
      #etapa3 .wt-cpf-status[hidden]{display:none!important}
      #etapa3 .wt-cpf-status.is-ok{background:#effaf2;border-color:#b7e0c3;color:#14532d}
      #etapa3 .wt-cpf-status.is-partial,#etapa3 .wt-cpf-status.is-manual{background:#fff8e8;border-color:#eedba3;color:#725716}
      #etapa3 .wt-cpf-status.is-loading{background:#eef4ff;border-color:#bfd0ef;color:#244f91}
      #etapa3 #field-mCpf.full{grid-column:1/-1}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    const cpf = byId("mCpf");
    const nome = byId("mNome");
    const birth = byId("mNascimentoTexto");
    if (!cpf || cpf.dataset.wtCpfAutofillBound === "1") return;
    cpf.dataset.wtCpfAutofillBound = "1";

    cpf.addEventListener("input", handleCpfInput);
    cpf.addEventListener("blur", () => void lookup());
    nome?.addEventListener("input", () => { nome.dataset.wtUserEdited = "1"; }, { passive: true });
    birth?.addEventListener("input", () => { birth.dataset.wtUserEdited = "1"; }, { passive: true });
  }

  function install() {
    injectStyles();
    configureUi();
    bind();
    patchValidation();
    if (digits(byId("mCpf")?.value).length === 11) void lookup();
    setTimeout(() => { configureUi(); bind(); patchValidation(); }, 300);
    setTimeout(() => { configureUi(); bind(); patchValidation(); }, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
