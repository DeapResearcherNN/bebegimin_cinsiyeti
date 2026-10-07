(() => {
  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const login = document.querySelector("#admin-login");
  const dashboard = document.querySelector("#dashboard");
  const loginForm = document.querySelector("#login-form");
  const loginStatus = document.querySelector("#login-status");
  const participantForm = document.querySelector("#participant-form");
  const familyCodeForm = document.querySelector("#family-code-form");
  const participantList = document.querySelector("#participant-list");
  const responseBody = document.querySelector("#response-body");
  const settingsStatus = document.querySelector("#settings-status");
  const accessModeStatus = document.querySelector("#access-mode-status");
  let adminPassword = "";

  function postAction(fields) {
    return new Promise((resolve, reject) => {
      if (!apiUrl) return reject(new Error("Backend henüz bağlanmadı."));
      const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = apiUrl;
      form.target = "api-frame";
      form.hidden = true;

      Object.entries({...fields,requestId}).forEach(([k,v]) => {
        const input = document.createElement("input");
        input.type = "hidden"; input.name = k; input.value = v == null ? "" : String(v);
        form.appendChild(input);
      });

      const timer = setTimeout(() => { cleanup(); reject(new Error("Sunucu yanıt vermedi.")); }, 30000);
      function onMessage(event) {
        const data = event.data;
        if (!data || data.source !== "baby-form-api") return;
        if (data.requestId && data.requestId !== requestId) return;
        cleanup();
        if (!data.ok) reject(new Error(data.error || "İşlem başarısız.")); else resolve(data);
      }
      function cleanup() { clearTimeout(timer); window.removeEventListener("message",onMessage); form.remove(); }

      window.addEventListener("message",onMessage);
      document.body.appendChild(form);
      form.submit();
    });
  }

  function text(sel,value){ document.querySelector(sel).textContent = String(value ?? ""); }

  function render(data) {
    const responses = data.responses || [];
    const participants = data.participants || [];
    const settings = data.settings || {};

    text("#stat-total",responses.length);
    text("#stat-girl",responses.filter(r => String(r.gender).includes("Kız")).length);
    text("#stat-boy",responses.filter(r => String(r.gender).includes("Erkek")).length);
    text("#stat-pending",participants.filter(p => !p.answered).length);

    accessModeStatus.textContent =
      String(settings.AILE_SIFRESI_ZORUNLU).toUpperCase() === "TRUE"
      ? "Mevcut giriş modu: ŞİFRELİ"
      : "Mevcut giriş modu: ŞİFRESİZ";

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
      [r.name,r.relation,r.gender,r.firstGuess,r.shortNote || "—"].forEach(v => {
        const td = document.createElement("td"); td.textContent = v || "—"; tr.appendChild(td);
      });

      [r.photoUrl,r.mediaUrl].forEach((url,idx) => {
        const td = document.createElement("td");
        if (url) {
          const a = document.createElement("a");
          a.href = url; a.target = "_blank"; a.rel = "noopener";
          a.textContent = idx === 0 ? "Fotoğrafı aç" : "Dosyayı aç";
          td.appendChild(a);
        } else td.textContent = "—";
        tr.appendChild(td);
      });

      const td = document.createElement("td"); td.textContent = r.submittedAt || "—"; tr.appendChild(td);
      responseBody.appendChild(tr);
    });
  }

  async function loadDashboard(){
    const data = await postAction({action:"adminList",adminPassword});
    render(data); login.hidden = true; dashboard.hidden = false;
  }

  loginForm.addEventListener("submit",async e => {
    e.preventDefault(); loginStatus.textContent = "";
    try { adminPassword = document.querySelector("#admin-password").value; await loadDashboard(); }
    catch(err){ loginStatus.textContent = err.message; }
  });

  document.querySelector("#refresh-btn").addEventListener("click",() => {
    loadDashboard().catch(err => settingsStatus.textContent = err.message);
  });

  participantForm.addEventListener("submit",async e => {
    e.preventDefault(); const fd = new FormData(participantForm);
    try {
      await postAction({action:"adminAddParticipant",adminPassword,name:fd.get("name"),relation:fd.get("relation")});
      participantForm.reset(); await loadDashboard();
    } catch(err){ settingsStatus.textContent = err.message; }
  });

  familyCodeForm.addEventListener("submit",async e => {
    e.preventDefault(); const fd = new FormData(familyCodeForm);
    try {
      const result = await postAction({action:"adminSetFamilyCode",adminPassword,familyCode:fd.get("familyCode")});
      familyCodeForm.reset(); settingsStatus.textContent = result.message;
    } catch(err){ settingsStatus.textContent = err.message; }
  });

  document.querySelectorAll(".setting-btn").forEach(btn => {
    btn.addEventListener("click",async () => {
      settingsStatus.textContent = "";
      try {
        const result = await postAction({
          action:"adminSetSetting",adminPassword,key:btn.dataset.key,value:btn.dataset.value
        });
        settingsStatus.textContent = result.message; await loadDashboard();
      } catch(err){ settingsStatus.textContent = err.message; }
    });
  });
})();