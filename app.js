(() => {
  const state = {
    name: "",
    relation: "",
    prediction: "",
    firstWord: "",
    todayNote: "",
    wish: "",
    babyMessage: "",
    funnyNote: ""
  };

  const order = ["intro", "identity", "prediction", "memory", "message", "review", "success"];
  const journeySteps = ["identity", "prediction", "memory", "message", "review"];
  let currentIndex = 0;

  const screens = Array.from(document.querySelectorAll(".screen"));
  const identityForm = document.querySelector("#identity-form");
  const memoryForm = document.querySelector("#memory-form");
  const messageForm = document.querySelector("#message-form");
  const predictionButtons = Array.from(document.querySelectorAll("[data-prediction]"));
  const predictionNext = document.querySelector('[data-action="prediction-next"]');
  const predictionError = document.querySelector("#prediction-error");

  function clean(value) {
    return String(value || "").trim();
  }

  function showStep(name) {
    screens.forEach((screen) => {
      screen.classList.toggle("is-active", screen.dataset.step === name);
    });

    currentIndex = order.indexOf(name);

    document.querySelectorAll("[data-nav-step]").forEach((item) => {
      item.classList.toggle("is-current", item.dataset.navStep === name);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    const active = document.querySelector('.screen[data-step="' + name + '"]');
    const focusTarget = active ? active.querySelector("h1, h2, input, button, textarea") : null;
    if (focusTarget) {
      setTimeout(() => focusTarget.focus({ preventScroll: true }), 120);
    }
  }

  function goBack() {
    if (currentIndex <= 0) return;
    showStep(order[currentIndex - 1]);
  }

  function updatePredictionUI() {
    predictionButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.dataset.prediction === state.prediction ? "true" : "false"
      );
    });
    predictionNext.disabled = !state.prediction;
  }

  function fillReview() {
    document.querySelector("#review-name").textContent = state.name;
    document.querySelector("#review-relation").textContent = state.relation;
    document.querySelector("#review-prediction").textContent = state.prediction;
    document.querySelector("#review-avatar").textContent =
      state.name.charAt(0).toLocaleUpperCase("tr-TR") || "♡";

    document.querySelector("#review-first-word").textContent = state.firstWord;
    document.querySelector("#review-today-note").textContent = state.todayNote;
    document.querySelector("#review-wish").textContent = state.wish;
    document.querySelector("#review-message").textContent = state.babyMessage;
    document.querySelector("#review-funny").textContent = state.funnyNote;

    document.querySelector("#review-today-note-wrap").hidden = !state.todayNote;
    document.querySelector("#review-wish-wrap").hidden = !state.wish;
    document.querySelector("#review-message-wrap").hidden = !state.babyMessage;
    document.querySelector("#review-funny-wrap").hidden = !state.funnyNote;
  }

  function savePrototype() {
    const record = {
      id: "prediction_" + Date.now(),
      ...state,
      createdAt: new Date().toISOString()
    };

    const storageKey = "bebegimin_cinsiyeti_predictions";
    let saved = [];

    try {
      saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(saved)) saved = [];
    } catch (_) {
      saved = [];
    }

    saved.push(record);
    localStorage.setItem(storageKey, JSON.stringify(saved));

    document.querySelector("#success-name").textContent = state.name;
    document.querySelector("#success-relation").textContent = state.relation;
    document.querySelector("#success-prediction").textContent = state.prediction;
    document.querySelector("#success-date").textContent =
      new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "long",
        timeStyle: "short"
      }).format(new Date());

    showStep("success");
  }

  function resetAll() {
    Object.keys(state).forEach((key) => {
      state[key] = "";
    });

    identityForm.reset();
    memoryForm.reset();
    messageForm.reset();
    updatePredictionUI();
    showStep("intro");
  }

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      const action = actionButton.dataset.action;

      if (action === "start") {
        showStep("identity");
        return;
      }

      if (action === "back") {
        goBack();
        return;
      }

      if (action === "prediction-next") {
        if (!state.prediction) {
          predictionError.textContent = "Devam etmek için bir tahmin seç.";
          return;
        }
        predictionError.textContent = "";
        showStep("memory");
        return;
      }

      if (action === "submit") {
        savePrototype();
        return;
      }

      if (action === "restart") {
        resetAll();
      }
    }

    const predictionButton = event.target.closest("[data-prediction]");
    if (predictionButton) {
      state.prediction = predictionButton.dataset.prediction;
      predictionError.textContent = "";
      updatePredictionUI();
    }
  });

  identityForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = clean(document.querySelector("#name").value);
    const relation = clean(document.querySelector("#relation").value);

    if (!name || !relation) return;

    state.name = name;
    state.relation = relation;
    showStep("prediction");
  });

  memoryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const firstWord = clean(document.querySelector("#first-word").value);
    if (!firstWord) return;

    state.firstWord = firstWord;
    state.todayNote = clean(document.querySelector("#today-note").value);
    showStep("message");
  });

  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();

    state.wish = clean(document.querySelector("#wish").value);
    state.babyMessage = clean(document.querySelector("#baby-message").value);
    state.funnyNote = clean(document.querySelector("#funny-note").value);

    fillReview();
    showStep("review");
  });

  updatePredictionUI();
})();