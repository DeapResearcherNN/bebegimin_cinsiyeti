(() => {
  "use strict";
  const scene = document.createElement("div");
  scene.className = "baby-scene";
  scene.setAttribute("aria-hidden", "true");
  scene.innerHTML = ["girl", "boy"].map(kind => `
    <div class="baby-zone baby-${kind}">
      <span class="baby-sparkle baby-sparkle-one">✧</span><span class="baby-sparkle baby-sparkle-two">♡</span>
      <div class="baby-traveler"><div class="baby-facing"><div class="baby-sprite"></div></div></div>
    </div>`).join("");
  document.body.classList.add("baby-background-page");
  document.body.append(scene);
})();
