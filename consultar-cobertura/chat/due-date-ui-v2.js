// Garante que qualquer render legado da etapa de vencimento use as opções atuais.
(function () {
  "use strict";
  const DAYS = ["05", "08", "09", "10", "15", "25"];

  function refresh() {
    const session = window.webturboChat?.getSession?.();
    if (!session || session.step !== "VENCIMENTO") return;
    const host = document.getElementById("chat-actions");
    if (!host) return;
    const wrap = host.querySelector(".quick-replies");
    if (!wrap) return;

    const current = Array.from(wrap.querySelectorAll("[data-action='select-due-date']"));
    const signature = current.map((node) => node.dataset.value || "").join(",");
    if (signature === DAYS.join(",")) return;

    wrap.replaceChildren(...DAYS.map((day) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-reply";
      button.dataset.action = "select-due-date";
      button.dataset.value = day;
      button.textContent = `Dia ${day}`;
      return button;
    }));
  }

  new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(refresh, 500);
})();
