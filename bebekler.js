(() => {
  "use strict";
  const baby = `
    <svg class="baby-drawing" viewBox="0 0 180 120" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <ellipse class="baby-shadow" cx="90" cy="108" rx="65" ry="5" fill="#9c7489" opacity=".12"/>
      <g class="baby-back-leg"><path d="M70 77 Q43 81 47 96 L67 100" fill="none" stroke="#e8aa87" stroke-width="13" stroke-linecap="round"/><ellipse cx="69" cy="100" rx="9" ry="6" fill="#f4bf9e"/></g>
      <g class="baby-back-arm"><path d="M109 66 Q104 80 107 99 L118 100" fill="none" stroke="#e8aa87" stroke-width="12" stroke-linecap="round"/></g>
      <g class="baby-body"><ellipse cx="84" cy="74" rx="34" ry="22" class="baby-outfit"/><path d="M62 61 Q57 72 65 88" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="4" stroke-linecap="round"/><path d="M95 57 Q101 70 97 87" fill="none" class="baby-seam" stroke-width="2"/><circle cx="100" cy="65" r="2.5" fill="#fff" opacity=".8"/></g>
      <g class="baby-front-leg"><path d="M71 80 Q61 82 57 100 L37 100" fill="none" stroke="#f4bf9e" stroke-width="14" stroke-linecap="round"/><ellipse cx="35" cy="100" rx="10" ry="6" fill="#f8c8a9"/></g>
      <g class="baby-front-arm"><path d="M111 67 Q118 78 120 99 L135 100" fill="none" stroke="#f8c8a9" stroke-width="12" stroke-linecap="round"/><ellipse cx="138" cy="100" rx="10" ry="6" fill="#f8c8a9"/><path d="M140 99 L145 100" stroke="#dda384" stroke-width="1.5" stroke-linecap="round"/></g>
      <g class="baby-head">
        <path class="baby-ponytail" d="M112 29 Q91 20 99 43 Q101 51 108 41" fill="#8d6145"/>
        <ellipse cx="130" cy="42" rx="28" ry="27" fill="#f8c8a9"/>
        <ellipse cx="108" cy="46" rx="7" ry="8" fill="#f4bf9e"/><path d="M108 44 Q103 43 106 49" fill="none" stroke="#dda384" stroke-width="1.8" stroke-linecap="round"/>
        <ellipse cx="156" cy="47" rx="5" ry="4" fill="#f8c8a9"/>
        <path d="M112 24 Q125 10 144 20 Q131 15 132 25 Q121 31 123 21" fill="#8d6145"/>
        <path d="M126 19 Q134 10 139 18 Q141 23 135 24" fill="none" stroke="#8d6145" stroke-width="4" stroke-linecap="round"/>
        <path d="M140 35 Q144 33 148 36" fill="none" stroke="#8d6145" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="145" cy="42" rx="2.8" ry="4" fill="#4c3b3a"/><circle cx="146" cy="41" r=".9" fill="#fff"/>
        <ellipse cx="137" cy="53" rx="6" ry="3.5" fill="#ec9b91" opacity=".6"/>
        <path d="M148 53 Q151 57 155 53" fill="none" stroke="#a6685d" stroke-width="1.8" stroke-linecap="round"/>
        <g class="baby-bow"><path d="M113 23 Q100 10 100 23 Q101 34 113 27 Q124 36 123 23 Q122 12 113 23" fill="#d985a9"/><circle cx="113" cy="24" r="4" fill="#f4bbd2"/></g>
      </g>
    </svg>`;
  const scene = document.createElement("div");
  scene.className = "baby-scene";
  scene.setAttribute("aria-hidden", "true");
  scene.innerHTML = ["girl", "boy"].map(kind => `
    <div class="baby-zone baby-${kind}">
      <span class="baby-sparkle baby-sparkle-one">✧</span><span class="baby-sparkle baby-sparkle-two">♡</span>
      <div class="baby-traveler"><div class="baby-facing">${baby}</div></div>
    </div>`).join("");
  document.body.classList.add("baby-background-page");
  document.body.append(scene);
})();
