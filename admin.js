(() => {
  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const login = document.querySelector("#admin-login");
  const dashboard = document.querySelector("#dashboard");
  const loginForm = document.querySelector("#login-form");
  const loginStatus = document.querySelector("#login-status");
  const participantForm = document.querySelector("#participant-form");
  const participantList = document.querySelector("#participant-list");
  const responseBody = document.querySelector("#response-body");
  const settingsStatus = document.querySelector("#settings-status");
  let adminPassword = "";

  function jsonp(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!apiUrl) return reject(new Error("Backend henüz bağlanmadı."));

      const cb = "__baby_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const url = new URL(apiUrl);
      url.searchParams.set("action", action);
      url.searchParams.set("callback", cb);

      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sunucu yanıt vermedi."));
      }, 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      }

      window[cb] = data => {
        cleanup();
        if (!data || !data.ok) reject(new Error((data && data.error) || "İşlem başarısız."));
        else resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Sunucuya ulaşılamadı."));
      };

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function postAction(fields) {
    return new Promise((resolve, reject) => {
      if (!apiUrl) return reject(new Error("Backend henüz bağlanmadı."));

      const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = apiUrl;
      form.target = "api-frame";
      form.hidden = true;

      const payload = { ...fields, requestId };
      Object.entries(payload).forEach(([k, v]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = v == null ? "" : String(v);
        form.appendChild(input);
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sunucu yanıt vermedi."));
      }, 20000);

      function onMessage(event) {
        const data = event.data;
        if (!data || data.source !== "baby-form-api") return;
        cleanup();
        if (!data.ok) reject(new Error(data.error || "İşlem başarısız."));
        else resolve(data);
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

  function text(el, value) { document.querySelector(el).textContent = String(value ?? ""); }

  function render(data) {
    const responses = data.responses || [];
    const participants = data.participants || [];

    text("#stat-total", responses.length);
    text("#stat-girl", responses.filter(r => String(r.gender).includes("Kız")).length);
    text("#stat-boy", responses.filter(r => String(r.gender).includes("Erkek")).length);
    text("#stat-pending", participants.filter(p => !p.answered).length);

    document.querySelector("#sheet-link").href = data.sheetUrl || "#";

    participantList.innerHTML = "";
    participants.forEach(p => {
      const span = document.createElement("span");
      span.className = "participant-chip" + (p.answered ? " done" : "");
      span.textContent = p.name + " · " + p.relation + (p.answered ? " ✓" : "");
      participantList.appendChild(span);
    });

    responseBody.innerHTML = "";
    responses.forEach(r => {
      const tr = document.createElement("tr");
      const vals = [r.name, r.relation, r.gender, r.firstGuess, r.shortNote || "—"];
      vals.forEach(v => {
        const td = document.createElement("td");
        td.textContent = v || "—";
        tr.appendChild(td);
      });

      [r.photoUrl, r.mediaUrl].forEach((url, idx) => {
        const td = document.createElement("td");
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = idx === 0 ? "Fotoğrafı aç" : "Dosyayı aç";
          td.appendChild(a);
        } else td.textContent = "—";
        tr.appendChild(td);
      });

      const tdTime = document.createElement("td");
      tdTime.textContent = r.submittedAt || "—";
      tr.appendChild(tdTime);

      responseBody.appendChild(tr);
    });
  }

  async function loadDashboard() {
    const data = await jsonp("adminList", { adminPassword });
    render(data);
    login.hidden = true;
    dashboard.hidden = false;
  }

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    loginStatus.textContent = "";

    try {
      adminPassword = document.querySelector("#admin-password").value;
      await loadDashboard();
    } catch (err) {
      loginStatus.textContent = err.message;
    }
  });

  document.querySelector("#refresh-btn").addEventListener("click", () => {
    loadDashboard().catch(err => settingsStatus.textContent = err.message);
  });

  participantForm.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(participantForm);

    try {
      await postAction({
        action: "adminAddParticipant",
        adminPassword,
        name: fd.get("name"),
        relation: fd.get("relation")
      });
      participantForm.reset();
      await loadDashboard();
    } catch (err) {
      settingsStatus.textContent = err.message;
    }
  });

  document.querySelectorAll(".setting-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      settingsStatus.textContent = "";

      try {
        await postAction({
          action: "adminSetSetting",
          adminPassword,
          key: btn.dataset.key,
          value: btn.dataset.value
        });
        settingsStatus.textContent = "Ayar güncellendi.";
        await loadDashboard();
      } catch (err) {
        settingsStatus.textContent = err.message;
      }
    });
  });
})();