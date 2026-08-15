// Reduz friccao na etapa de endereco da landing de anuncios.
(function () {
  "use strict";

  function removeReferenceField() {
    const field = document.getElementById("field-mPontoRef");
    const input = document.getElementById("mPontoRef");

    if (input && !String(input.value || "").trim()) {
      input.value = "Não informado";
    }

    if (field) {
      field.hidden = true;
      field.style.display = "none";
      field.setAttribute("aria-hidden", "true");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeReferenceField, { once: true });
  } else {
    removeReferenceField();
  }
})();
