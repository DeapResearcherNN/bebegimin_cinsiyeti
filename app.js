(() => {
  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const screens = [...document.querySelectorAll(".screen")];
  const form = document.querySelector("#family-form");
  const submitButton = document.querySelector("#submit-button");
  const submitStatus = document.querySelector("#submit-status");

  function show(step){
    screens.forEach(s => s.classList.toggle("active", s.dataset.step === step));
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function readFileAsDataUrl(file, maxBytes, label){
    return new Promise((resolve, reject) => {
      if (!file || !file.name) return resolve({name:"", mime:"", data:""});
      if (file.size > maxBytes) return reject(new Error(label + " dosyası çok büyük."));

      const reader = new FileReader();
      reader.onload = () => resolve({
        name:file.name,
        mime:file.type || "application/octet-stream",
        data:reader.result
      });
      reader.onerror = () => reject(new Error(label + " okunamadı."));
      reader.readAsDataURL(file);
    });
  }

  function postToBackend(fields){
    return new Promise((resolve, reject) => {
      if (!apiUrl) return reject(new Error("Google Drive kayıt sistemi henüz etkinleştirilmedi."));

      const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const postForm = document.createElement("form");
      postForm.method = "POST";
      postForm.action = apiUrl;
      postForm.target = "api-frame";
      postForm.hidden = true;

      Object.entries({...fields, requestId}).forEach(([key,value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value == null ? "" : String(value);
        postForm.appendChild(input);
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Kayıt sunucusu zamanında yanıt vermedi."));
      }, 60000);

      function onMessage(event){
        const data = event.data;
        if (!data || data.source !== "baby-form-api") return;
        if (data.requestId && data.requestId !== requestId) return;

        cleanup();
        if (data.ok) resolve(data);
        else reject(new Error(data.error || "Kayıt başarısız."));
      }

      function cleanup(){
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        postForm.remove();
      }

      window.addEventListener("message", onMessage);
      document.body.appendChild(postForm);
      postForm.submit();
    });
  }

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    if (btn.dataset.action === "start") show("form");
    if (btn.dataset.action === "back") show("intro");

    if (btn.dataset.action === "restart") {
      form.reset();
      show("intro");
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    submitStatus.textContent = "";

    if (!form.reportValidity()) return;

    if (!apiUrl) {
      submitStatus.textContent = "Kayıt sistemi henüz Google Drive'a bağlanmadı. Şu an form gönderilemez.";
      return;
    }

    if (!window.confirm("Cevaplarını gönderdikten sonra değiştiremeyeceksin. Göndermek istediğine emin misin?")) {
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Kaydediliyor…";

    try {
      const fd = new FormData(form);
      const photoFile = form.querySelector('input[name="photo"]').files[0];
      const mediaFile = form.querySelector('input[name="media"]').files[0];

      const [photo, media] = await Promise.all([
        readFileAsDataUrl(photoFile, 8 * 1024 * 1024, "Fotoğraf"),
        readFileAsDataUrl(mediaFile, 20 * 1024 * 1024, "Video / ses")
      ]);

      const result = await postToBackend({
        action:"submit",
        name:fd.get("name"),
        relation:fd.get("relation"),
        gender:fd.get("gender"),
        firstGuess:fd.get("firstGuess"),
        shortNote:fd.get("shortNote") || "",
        photoName:photo.name,
        photoMime:photo.mime,
        photoData:photo.data,
        mediaName:media.name,
        mediaMime:media.mime,
        mediaData:media.data
      });

      document.querySelector("#success-name").textContent = fd.get("name") || "";
      document.querySelector("#success-gender").textContent = fd.get("gender") || "";
      document.querySelector("#success-date").textContent =
        new Intl.DateTimeFormat("tr-TR",{dateStyle:"long",timeStyle:"short"})
          .format(new Date(result.submittedAt || Date.now()));

      show("success");
    } catch (err) {
      submitStatus.textContent = err.message;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Tahminimi kaydet ♡";
    }
  });
})();