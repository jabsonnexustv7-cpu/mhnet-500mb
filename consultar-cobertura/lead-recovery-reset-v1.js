// Remove somente travas antigas de recuperação persistidas em sessionStorage.
// A deduplicação da visita atual é feita em memória pelo conversion-critical-hotfix-v3.
(function () {
  "use strict";
  try {
    const prefixes = ["wt_lead_recovery_sent_v6:", "wt_lead_recovery_sent_v7:"];
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i) || "";
      if (prefixes.some((prefix) => key.startsWith(prefix))) sessionStorage.removeItem(key);
    }
  } catch (_) {}
})();
