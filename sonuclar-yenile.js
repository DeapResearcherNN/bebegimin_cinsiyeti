(() => {
  "use strict";
  function refreshIfVisible() {
    if (document.hidden) return;
    const status = document.querySelector("#data-status");
    const button = document.querySelector("#refresh-btn");
    if (status && status.classList.contains("live") && button && !button.disabled) {
      button.click();
    }
  }
  window.addEventListener("storage", event => {
    if (event.key === "baby_results_changed_at") refreshIfVisible();
  });
  document.addEventListener("visibilitychange", refreshIfVisible);
})();
