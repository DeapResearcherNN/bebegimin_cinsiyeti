(() => {
  const state = {
    name: "",
    relation: "",
    prediction: "",
    note: "",
    babyMessage: ""
  };

  const order = ["intro", "identity", "prediction", "message", "review", "success"];
  let currentIndex = 0;

  const allSteps = Array.from(document.querySelectorAll(".step"));
  const identityForm = document.querySelector("#identity-form");
  const messageForm = document.querySelector("#message-form");
  const predictionButtons = Array.from(document.querySelectorAll("[data-prediction]"));
  const predictionNext = document.querySelector('[data-action="prediction-next"]');
  const predictionError = document.querySelector("#prediction-error");

  function showStep(name) {
    allSteps.forEach((step) => {
      step.classList.toggle("is-active", step.dataset.step === name);
    });

    currentIndex = order.indexOf(name);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const active = document.querySelector('.step[data-step="' + name + '"]');
    const focusTarget = active ? active.querySelector("h1, h2, input, button") : null;
    if (focusTarget) {
      setTimeout(() => focusTarget.focus({ preventScroll: true }), 120);
    }
  }

  function goBack() {
    if (currentIndex <= 0) return;
    showStep(order[currentIndex - 1]);
  }

  function normalize(value) {
    return String(value || "").trim();
  }

  function updatePredictionButtons() {
    predictionButtons.forEach((button) => {
      const selected = button.dataset.prediction === state.prediction;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    predictionNext.disabled = !state.prediction;
  }

  function fillReview() {
    document.querySelector("#review-name").textContent = state.name;
    document.querySelector("#review-relation").textContent = state.relation;
    document.querySelector("#review-prediction").textContent = state.prediction;
    document.querySelector("#review-avatar").textContent = state.name.charAt(0).toLocaleUpperCase("tr-TR") || "♡";

    const noteWrap = document.querySelector("#review-note-wrap");
    const messageWrap = document.querySelector("#review-message-wrap");

    document.querySelector("#review-note").textContent = state.note;
    document.querySelector("#review-message").textContent = state.babyMessage;

    noteWrap.hidden = !state.note;
    messageWrap.hidden = !state.babyMessage;
  }

  function savePrototypePrediction() {
    const record = {
      id: "prediction_" + Date.now(),
      name: state.name,
      relation: state.relation,
      prediction: state.prediction,
      note: state.note,
      babyMessage: state.babyMessage,
      createdAt: new Date().toISOString()
    };

    const key = "bebegimin_cinsiyeti_predictions";
    let existing = [];

    try {
      existing = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(existing)) existing = [];
    } catch (_) {
      existing = [];
    }

    existing.push(record);
    localStorage.setItem(key, JSON.stringify(existing));

    document.querySelector("#success-name").textContent = state.name;
    document.querySelector("#success-prediction").textContent = state.prediction;
    document.querySelector("#success-date").textContent = new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "long",
      timeStyle: "short"
    }).format(new Date());

    showStep("success");
  }

  document.addEventListener("click", (event) => {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.action;

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
      showStep("message");
      return;
    }

    if (action === "submit") {
      savePrototypePrediction();
      return;
    }

    if (action === "restart") {
      state.name = "";
      state.relation = "";
      state.prediction = "";
      state.note = "";
      state.babyMessage = "";

      identityForm.reset();
      messageForm.reset();
      updatePredictionButtons();
      showStep("intro");
    }
  });

  identityForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = normalize(document.querySelector("#name").value);
    const relation = normalize(document.querySelector("#relation").value);

    if (!name || !relation) return;

    state.name = name;
    state.relation = relation;
    showStep("prediction");
  });

  predictionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.prediction = button.dataset.prediction;
      predictionError.textContent = "";
      updatePredictionButtons();
    });
  });

  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();

    state.note = normalize(document.querySelector("#note").value);
    state.babyMessage = normalize(document.querySelector("#baby-message").value);

    fillReview();
    showStep("review");
  });

  updatePredictionButtons();
})();