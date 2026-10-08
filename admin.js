(() => {
  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const SESSION_KEY = "bebegimin_cinsiyeti_admin_session";

  const login = document.querySelector("#admin-login");
  const dashboard = document.querySelector("#dashboard");
  const requestForm = document.querySelector("#request-code-form");
  const verifyForm = document.querySelector("#verify-code-form");
  const emailField = document.querySelector("#admin-email");
  const codeField = document.querySelector("#admin-code");
  const loginStatus = document.querySelector("#login-status");
  const participantForm = document.querySelector("#participant-form");
  const participantList = document.querySelector("#participant-list");
  const responseBody = document.querySelector("#response-body");
  const settingsStatus = document.querySelector("#settings-status");
  const serviceTestLink = document.querySelector("#service-test-link");
  if (serviceTestLink && apiUrl) {
    const test = new URL(apiUrl);
    test.searchParams.set("action", "health");
    test.searchParams.set("callback", "siteTest");
    serviceTestLink.href = test.toString();
    serviceTestLink.hidden = false;
  }


  let adminToken = sessionStorage.getItem(SESSION_KEY) || "";
  let requestedEmail = "";

  async function checkDeployment() {
    const data = await window.BabyApi.checkHealth();
    if (data.authVersion !== "email-otp-v2") {
      throw new Error("Yönetim servisi güncel değil. Apps Script dağıtımını yeni sürümle güncelle.");
    }
  }

  function postAction(fields) {
    return new Promise((resolve, reject) => {
      if (!apiUrl) {
        reject(new Error("Google kayıt sistemi henüz bağlanmadı."));
        return;
      }

      const requestId = "baby_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = apiUrl;
      form.target = "api-frame";
      form.hidden = true;

      Object.entries({...fields, requestId}).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value == null ? "" : String(value);
        form.appendChild(input);
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sunucu yanıt vermedi. Apps Script dağıtımını kontrol et."));
      }, 40000);

      function onMessage(event) {
        if (!window.BabyApi.isTrustedOrigin(event.origin)) return;
        const data = event.data;
        if (!data || data.source !== "baby-form-api" || data.requestId !== requestId) return;
        cleanup();
        if (data.ok) resolve(data);
        else reject(new Error(data.error || "İşlem başarısız."));
      }

      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        form.remove();
      }

      window.addEventListener("message", onMessage);
      document.body.appendChild(form);
      form.submit();
    });
  }

  function setText(selector, value) {
    document.querySelector(selector).textContent = String(value ?? "");
  }

  function showLogin(message = "") {
    dashboard.hidden = true;
    login.hidden = false;
    loginStatus.textContent = message;
  }

  function clearSession() {
    adminToken = "";
    sessionStorage.removeItem(SESSION_KEY);
  }

  function render(data) {
    const responses = data.responses || [];
    const participants = data.participants || [];

    setText("#stat-total", responses.length);
    setText("#stat-girl", responses.filter(r => String(r.gender).includes("Kız")).length);
    setText("#stat-boy", responses.filter(r => String(r.gender).includes("Erkek")).length);
    setText("#stat-pending", participants.filter(p => !p.answered).length);

    document.querySelector("#sheet-link").href = data.sheetUrl || "#";

    participantList.textContent = "";
    participants.forEach(p => {
      const span = document.createElement("span");
      span.className = "participant-chip" + (p.answered ? " done" : "");
      span.textContent = p.name + " · " + p.relation + (p.answered ? " ✓" : "");
      participantList.appendChild(span);
    });

    responseBody.textContent = "";
    responses.forEach(r => {
      const tr = document.createElement("tr");

      [r.name, r.relation, r.gender, r.firstGuess, r.shortNote || "—"].forEach(v => {
        const td = document.createElement("td");
        td.textContent = v || "—";
        tr.appendChild(td);
      });

      [r.photoUrl, r.mediaUrl].forEach((url, index) => {
        const td = document.createElement("td");
        if (url && /^https:\/\/drive\.google\.com\//.test(url)) {
          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = index === 0 ? "Fotoğrafı aç" : "Dosyayı aç";
          td.appendChild(link);
        } else {
          td.textContent = "—";
        }
        tr.appendChild(td);
      });

      const time = document.createElement("td");
      time.textContent = r.submittedAt || "—";
      tr.appendChild(time);
      responseBody.appendChild(tr);
    });
  }

  async function loadDashboard() {
    const data = await postAction({action: "adminList", adminToken});
    render(data);
    loginStatus.textContent = "";
    login.hidden = true;
    dashboard.hidden = false;
  }

  requestForm.addEventListener("submit", async e => {
    e.preventDefault();
    requestedEmail = emailField.value;
    loginStatus.textContent = "E-postaya kod gönderiliyor…";
    const button = document.querySelector("#send-code-btn");
    button.disabled = true;

    try {
      await checkDeployment();
      const data = await postAction({
        action: "requestAdminCode",
        adminEmail: requestedEmail
      });
      requestForm.hidden = true;
      verifyForm.hidden = false;
      loginStatus.textContent = data.message || "E-postanı kontrol et.";
      codeField.focus();
    } catch (error) {
      loginStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  verifyForm.addEventListener("submit", async e => {
    e.preventDefault();
    const button = document.querySelector("#verify-code-btn");
    button.disabled = true;
    loginStatus.textContent = "Kod kontrol ediliyor…";

    try {
      const result = await postAction({
        action: "verifyAdminCode",
        adminEmail: requestedEmail,
        adminCode: codeField.value.trim()
      });
      adminToken = result.adminToken;
      sessionStorage.setItem(SESSION_KEY, adminToken);
      codeField.value = "";
      await loadDashboard();
    } catch (error) {
      loginStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#change-email-btn").addEventListener("click", () => {
    verifyForm.hidden = true;
    requestForm.hidden = false;
    codeField.value = "";
    loginStatus.textContent = "";
  });

  document.querySelector("#logout-btn").addEventListener("click", async () => {
    const oldToken = adminToken;
    clearSession();
    verifyForm.hidden = true;
    requestForm.hidden = false;
    showLogin("Bu tarayıcıdaki yönetici oturumundan çıkıldı.");

    if (oldToken) {
      try {
        await postAction({action: "logoutAdmin", adminToken: oldToken});
      } catch (error) {
        loginStatus.textContent = "Yerel oturum kapandı, ancak sunucu oturumunu kapatırken sorun oluştu.";
      }
    }
  });

  document.querySelector("#refresh-btn").addEventListener("click", () => {
    loadDashboard().catch(error => {
      settingsStatus.textContent = error.message;
      if (/oturum|giriş/i.test(error.message)) {
        clearSession();
        showLogin("Oturum süren doldu. Yeniden kod al.");
      }
    });
  });

  participantForm.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(participantForm);
    settingsStatus.textContent = "";

    try {
      await postAction({
        action: "adminAddParticipant",
        adminToken,
        name: fd.get("name"),
        relation: fd.get("relation")
      });
      participantForm.reset();
      await loadDashboard();
    } catch (error) {
      settingsStatus.textContent = error.message;
    }
  });

  document.querySelectorAll(".setting-btn").forEach(button => {
    button.addEventListener("click", async () => {
      settingsStatus.textContent = "";
      try {
        const result = await postAction({
          action: "adminSetSetting",
          adminToken,
          key: button.dataset.key,
          value: button.dataset.value
        });
        settingsStatus.textContent = result.message || "Ayar kaydedildi.";
        await loadDashboard();
      } catch (error) {
        settingsStatus.textContent = error.message;
      }
    });
  });

  checkDeployment().then(() => {
    if (adminToken) {
      return loadDashboard().catch(error => {
        clearSession();
        showLogin("Oturumun süresi doldu. E-posta adresini seçerek yeni kod al.");
      });
    }
    loginStatus.textContent = "Google bağlantısı hazır. Hesap seçip giriş kodu isteyebilirsin.";
  }).catch(error => {
    loginStatus.textContent = error.message;
  });
})();