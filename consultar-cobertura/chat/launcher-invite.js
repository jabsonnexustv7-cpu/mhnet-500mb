// WebTurbo — convite mobile do launcher do atendimento.
(function () {
  "use strict";

  if (window.__webturboLauncherInviteInstalled) return;
  window.__webturboLauncherInviteInstalled = true;

  const MOBILE_QUERY = "(max-width: 640px)";
  const PROMPT_DELAY_MS = 2000;
  const PROMPT_VISIBLE_MS = 5000;
  const OPENED_SESSION_KEY = "webturbo_chat_opened_session_v1";
  let promptTimer = null;
  let hideTimer = null;

  function wasOpenedThisSession() {
    try {
      return sessionStorage.getItem(OPENED_SESSION_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markOpenedThisSession() {
    try {
      sessionStorage.setItem(OPENED_SESSION_KEY, "1");
    } catch (_) {}
  }

  function hideInvite(launcher) {
    if (!launcher) return;
    launcher.classList.remove("is-inviting");
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function showInvite(launcher) {
    if (!launcher || wasOpenedThisSession()) return;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (document.visibilityState === "hidden") return;

    launcher.classList.add("is-inviting");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideInvite(launcher), PROMPT_VISIBLE_MS);
  }

  function scheduleInvite(launcher) {
    if (!launcher || wasOpenedThisSession()) return;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = setTimeout(() => showInvite(launcher), PROMPT_DELAY_MS);
  }

  function enhanceLauncher(launcher) {
    if (!launcher || launcher.dataset.webturboInviteReady === "true") return;
    launcher.dataset.webturboInviteReady = "true";
    launcher.classList.add("chat-launcher--invite");

    const avatar = launcher.querySelector(".chat-launcher-avatar");
    const status = launcher.querySelector("i[aria-label='Online']");
    const srOnly = launcher.querySelector(".sr-only");

    const bubble = document.createElement("span");
    bubble.className = "chat-launcher-bubble";
    bubble.setAttribute("aria-hidden", "true");
    bubble.textContent = "Alguma dúvida? Fale comigo 👋";

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "chat-launcher-avatar-wrap";

    if (avatar) avatarWrap.appendChild(avatar);
    if (status) {
      status.classList.add("chat-launcher-status");
      avatarWrap.appendChild(status);
    }

    launcher.prepend(bubble);
    if (srOnly) launcher.insertBefore(avatarWrap, srOnly);
    else launcher.appendChild(avatarWrap);

    launcher.addEventListener("click", () => {
      markOpenedThisSession();
      hideInvite(launcher);
    }, { passive: true });

    scheduleInvite(launcher);
  }

  function findAndEnhance() {
    const launcher = document.getElementById("chat-launcher");
    if (!launcher) return false;
    enhanceLauncher(launcher);
    return true;
  }

  if (!findAndEnhance()) {
    const observer = new MutationObserver(() => {
      if (findAndEnhance()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const launcher = document.getElementById("chat-launcher");
    if (launcher && !launcher.classList.contains("is-inviting") && !wasOpenedThisSession()) {
      scheduleInvite(launcher);
    }
  });
})();
