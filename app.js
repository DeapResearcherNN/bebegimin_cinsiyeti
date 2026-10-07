(() => {
  "use strict";

  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const MAX_PHOTO = 8 * 1024 * 1024;
  const MAX_MEDIA = 20 * 1024 * 1024;
  const MAX_RECORD_SECONDS = 30;

  const screens = [...document.querySelectorAll(".screen")];
  const form = document.querySelector("#family-form");
  const submitButton = document.querySelector("#submit-button");
  const submitStatus = document.querySelector("#submit-status");

  const firstQuestion = document.querySelector("#first-guess-question");
  const firstOptions = document.querySelector("#first-guess-options");
  const firstHelp = document.querySelector("#first-guess-help");

  const cameraPanel = document.querySelector("#camera-studio");
  const cameraVideo = document.querySelector("#camera-live");
  const cameraMessage = document.querySelector("#camera-message");
  const cameraTitle = document.querySelector("#camera-title");
  const captureButton = document.querySelector("#capture-photo-btn");
  const startRecordButton = document.querySelector("#start-video-btn");
  const stopRecordButton = document.querySelector("#stop-video-btn");
  const switchCameraButton = document.querySelector("#switch-camera-btn");
  const nativeCameraButton = document.querySelector("#native-camera-option");
  const recordIndicator = document.querySelector("#record-indicator");
  const recordClock = document.querySelector("#record-clock");

  const inputs = {
    photo: {
      upload: document.querySelector("#photo-upload"),
      native: document.querySelector("#native-photo-input"),
      output: document.querySelector("#photo-result"),
      fileName: document.querySelector("#photo-file-name"),
      preview: document.querySelector("#photo-preview")
    },
    media: {
      upload: document.querySelector("#media-upload"),
      native: document.querySelector("#native-video-input"),
      output: document.querySelector("#media-result"),
      fileName: document.querySelector("#media-file-name"),
      video: document.querySelector("#media-preview"),
      audio: document.querySelector("#audio-preview")
    }
  };

  const selectedFiles = {photo: null, media: null};
  const previewUrls = {photo: "", media: ""};

  let cameraStream = null;
  let cameraMode = "";
  let cameraFacing = "environment";
  let cameraToken = 0;
  let activeRecording = null;
  let clockTimer = null;
  let recordLimitTimer = null;
  let cameraReady = false;

  function show(step) {
    if (step !== "form") closeCamera();
    screens.forEach(screen => screen.classList.toggle("active", screen.dataset.step === step));
    window.scrollTo({top: 0, behavior: "smooth"});
  }

  function updateFirstGuess() {
    const selectedGender = form.querySelector('input[name="gender"]:checked');
    const isGirl = selectedGender && selectedGender.value.includes("Kız");

    firstOptions.replaceChildren();
    firstQuestion.hidden = !selectedGender;

    if (!selectedGender) return;

    const same = isGirl ? "kız" : "erkek";
    const opposite = isGirl ? "erkek" : "kız";
    firstHelp.textContent = "Şimdi " + same + " dedin. İlk öğrendiğinde de böyle mi düşünüyordun?";

    const choices = isGirl
      ? [
          {value:"İlk andan beri kız", label:"Evet, en başından beri kız diyordum."},
          {value:"Önce erkek düşündüm, sonra fikrim değişti", label:"Hayır, önce erkek diyordum. Sonra fikrim değişti."},
          {value:"Hiç tahminim olmadı", label:"O zaman bir tahminim yoktu."}
        ]
      : [
          {value:"İlk andan beri erkek", label:"Evet, en başından beri erkek diyordum."},
          {value:"Önce kız düşündüm, sonra fikrim değişti", label:"Hayır, önce kız diyordum. Sonra fikrim değişti."},
          {value:"Hiç tahminim olmadı", label:"O zaman bir tahminim yoktu."}
        ];

    choices.forEach((choice, index) => {
      const label = document.createElement("label");
      label.className = "choice";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "firstGuess";
      radio.value = choice.value;
      if (index === 0) radio.required = true;
      const text = document.createElement("span");
      text.textContent = choice.label;
      label.append(radio, text);
      firstOptions.append(label);
    });
  }

  function releaseUrl(kind) {
    if (previewUrls[kind]) {
      URL.revokeObjectURL(previewUrls[kind]);
      previewUrls[kind] = "";
    }
  }

  function resetSelected(kind) {
    selectedFiles[kind] = null;
    inputs[kind].upload.value = "";
    inputs[kind].native.value = "";
    inputs[kind].output.hidden = true;
    inputs[kind].fileName.textContent = "";
    releaseUrl(kind);
    if (kind === "photo") {
      inputs.photo.preview.removeAttribute("src");
    } else {
      inputs.media.video.pause();
      inputs.media.video.removeAttribute("src");
      inputs.media.video.load();
      inputs.media.audio.pause();
      inputs.media.audio.removeAttribute("src");
      inputs.media.audio.load();
      inputs.media.video.hidden = true;
      inputs.media.audio.hidden = true;
    }
  }

  function chooseFile(kind, file, source) {
    if (!file) return;
    const limit = kind === "photo" ? MAX_PHOTO : MAX_MEDIA;
    const title = kind === "photo" ? "Fotoğraf" : "Video / ses";
    const type = String(file.type || "").toLowerCase();
    if (file.size > limit) {
      submitStatus.textContent = title + " dosyası çok büyük. En fazla " + Math.floor(limit / 1048576) + " MB yükleyebilirsin.";
      if (source === "upload" || source === "native") inputs[kind][source].value = "";
      return;
    }
    if (kind === "photo" && type && !type.startsWith("image/")) {
      submitStatus.textContent = "Lütfen yalnızca fotoğraf dosyası seç.";
      return;
    }
    if (kind === "media" && type && !type.startsWith("video/") && !type.startsWith("audio/")) {
      submitStatus.textContent = "Lütfen video veya ses dosyası seç.";
      return;
    }

    // Only the most recently selected capture/upload is sent.
    if (source !== "upload") inputs[kind].upload.value = "";
    if (source !== "native") inputs[kind].native.value = "";

    selectedFiles[kind] = file;
    submitStatus.textContent = "";

    releaseUrl(kind);
    previewUrls[kind] = URL.createObjectURL(file);
    inputs[kind].fileName.textContent = file.name + " · " + (file.size / 1048576).toFixed(1) + " MB";
    inputs[kind].output.hidden = false;

    if (kind === "photo") {
      inputs.photo.preview.src = previewUrls.photo;
    } else {
      const audioOnly = type.startsWith("audio/") ||
        (!type && /\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name));
      const video = inputs.media.video;
      const audio = inputs.media.audio;
      video.pause();
      audio.pause();
      video.hidden = audioOnly;
      audio.hidden = !audioOnly;
      if (audioOnly) {
        audio.src = previewUrls.media;
        video.removeAttribute("src");
      } else {
        video.src = previewUrls.media;
        audio.removeAttribute("src");
      }
    }
  }

  function cameraStatus(text) {
    cameraMessage.textContent = text;
  }

  function clearRecordingTimers() {
    if (clockTimer !== null) clearInterval(clockTimer);
    if (recordLimitTimer !== null) clearTimeout(recordLimitTimer);
    clockTimer = null;
    recordLimitTimer = null;
  }

  function stopTracks(stream) {
    if (stream) stream.getTracks().forEach(track => track.stop());
  }

  function closeCamera() {
    cameraToken++;
    clearRecordingTimers();
    if (activeRecording && activeRecording.recorder.state !== "inactive") {
      activeRecording.keep = false;
      try { activeRecording.recorder.stop(); } catch (err) { /* stopped already */ }
    }
    activeRecording = null;
    stopTracks(cameraStream);
    cameraStream = null;
    cameraReady = false;
    cameraMode = "";
    cameraVideo.pause();
    cameraVideo.srcObject = null;
    cameraPanel.hidden = true;
    recordIndicator.hidden = true;
    captureButton.hidden = true;
    startRecordButton.hidden = true;
    stopRecordButton.hidden = true;
    switchCameraButton.disabled = false;
  }

  async function obtainCamera(mode, facing) {
    const video = {facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}};
    if (mode === "photo") return {stream:await navigator.mediaDevices.getUserMedia({video,audio:false}), hasAudio:false};
    try {
      return {stream:await navigator.mediaDevices.getUserMedia({
        video,
        audio:{echoCancellation:true,noiseSuppression:true}
      }),hasAudio:true};
    } catch (error) {
      // A microphone permission error should not prevent a silent video.
      return {stream:await navigator.mediaDevices.getUserMedia({video,audio:false}),hasAudio:false};
    }
  }

  async function openCamera(mode, facing) {
    closeCamera();
    cameraMode = mode;
    cameraFacing = facing || (mode === "photo" ? "environment" : "user");
    cameraPanel.hidden = false;
    cameraTitle.textContent = mode === "photo" ? "Kamerayla fotoğraf çek" : "Kısa bir video kaydet";
    captureButton.hidden = mode !== "photo";
    startRecordButton.hidden = mode !== "video";
    stopRecordButton.hidden = true;
    captureButton.disabled = true;
    startRecordButton.disabled = true;
    nativeCameraButton.textContent = "📱 Telefonun kamerasını kullan";
    cameraStatus("Kamera izni isteniyor… Kameraya izin vermen gerekiyor.");

    const ticket = cameraToken;
    cameraPanel.scrollIntoView({behavior:"smooth",block:"center"});

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraStatus("Tarayıcın canlı kamera erişimini desteklemiyor. 'Telefonun kamerasını kullan' seçeneğini dene.");
      return;
    }

    try {
      const result = await obtainCamera(mode,cameraFacing);
      if (ticket !== cameraToken) {
        stopTracks(result.stream);
        return;
      }
      cameraStream = result.stream;
      cameraVideo.srcObject = cameraStream;
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      try { await cameraVideo.play(); } catch (playError) { /* user can tap preview */ }
      if (ticket !== cameraToken) return;
      cameraReady = true;
      captureButton.disabled = false;
      startRecordButton.disabled = false;
      if (mode === "video" && !result.hasAudio) {
        cameraStatus("Kamera açık. Mikrofon erişimi olmadığından video sessiz kaydedilecek.");
      } else {
        cameraStatus(mode === "photo"
          ? "Kamera hazır. Fotoğrafı çek düğmesine bas."
          : "Kamera hazır. Video kaydın en fazla 30 saniye sürebilir.");
      }
    } catch (error) {
      if (ticket !== cameraToken) return;
      cameraStatus("Kamera açılamadı. Kamera iznini kontrol et veya 'Telefonun kamerasını kullan' seçeneğini dene.");
    }
  }

  function capturePhoto() {
    if (cameraMode !== "photo" || !cameraReady || !cameraStream) return;
    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;
    if (!width || !height) {
      cameraStatus("Kamera görüntüsü henüz hazır değil. Birkaç saniye sonra tekrar dene.");
      return;
    }

    const scale = Math.min(1,1600 / Math.max(width,height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(cameraVideo,0,0,canvas.width,canvas.height);

    const ticket = cameraToken;
    captureButton.disabled = true;
    cameraStatus("Fotoğraf hazırlanıyor…");

    canvas.toBlob(blob => {
      if (ticket !== cameraToken) return;
      captureButton.disabled = false;
      if (!blob) {
        cameraStatus("Fotoğraf kaydedilemedi. Tekrar dene.");
        return;
      }
      if (blob.size > MAX_PHOTO) {
        cameraStatus("Fotoğraf 8 MB sınırını aşıyor. Başka bir fotoğraf çek.");
        return;
      }
      const photo = new File([blob],"bebegimize_fotograf_" + Date.now() + ".jpg",{type:"image/jpeg"});
      chooseFile("photo",photo,"camera");
      closeCamera();
      inputs.photo.output.scrollIntoView({behavior:"smooth",block:"nearest"});
    },"image/jpeg",0.84);
  }

  function mimePreference() {
    if (typeof MediaRecorder === "undefined") return "";
    const types = ["video/mp4","video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus","video/webm"];
    if (typeof MediaRecorder.isTypeSupported !== "function") return "";
    return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function beginVideoRecording() {
    if (cameraMode !== "video" || !cameraReady || !cameraStream) return;
    if (typeof MediaRecorder === "undefined") {
      cameraStatus("Bu tarayıcıda doğrudan video kaydı yok. Telefonun kamerasını kullan seçeneğini seç.");
      return;
    }

    let recorder;
    try {
      const mimeType = mimePreference();
      const settings = {videoBitsPerSecond:1000000,audioBitsPerSecond:96000};
      if (mimeType) settings.mimeType = mimeType;
      recorder = new MediaRecorder(cameraStream,settings);
    } catch (error) {
      cameraStatus("Bu cihazda video kaydı başlatılamadı. Telefonun kamerasını kullan seçeneğini dene.");
      return;
    }

    const session = {
      recorder,keep:true,chunks:[],bytes:0,token:cameraToken,started:Date.now()
    };
    activeRecording = session;

    recorder.ondataavailable = event => {
      if (!event.data || !event.data.size) return;
      session.chunks.push(event.data);
      session.bytes += event.data.size;
      if (session.bytes > MAX_MEDIA && recorder.state === "recording") {
        session.keep = false;
        cameraStatus("Video 20 MB sınırını aştı. Daha kısa bir video kaydet.");
        recorder.stop();
      }
    };

    recorder.onerror = () => {
      session.keep = false;
      clearRecordingTimers();
      cameraStatus("Video kaydı sırasında bir hata oluştu. Tekrar dene.");
      startRecordButton.hidden = false;
      stopRecordButton.hidden = true;
      recordIndicator.hidden = true;
      switchCameraButton.disabled = false;
    };

    recorder.onstop = () => {
      clearRecordingTimers();
      if (activeRecording === session) activeRecording = null;
      recordIndicator.hidden = true;
      startRecordButton.hidden = false;
      stopRecordButton.hidden = true;
      switchCameraButton.disabled = false;

      if (!session.keep || session.token !== cameraToken) return;

      const mediaType = String(recorder.mimeType || session.chunks[0]?.type || "video/webm");
      const extension = mediaType.includes("mp4") ? "mp4" : "webm";
      const fileType = extension === "mp4" ? "video/mp4" : "video/webm";
      const blob = new Blob(session.chunks,{type:fileType});
      if (!blob.size) {
        cameraStatus("Video boş kaydedildi. Tekrar dene.");
        return;
      }
      if (blob.size > MAX_MEDIA) {
        cameraStatus("Video 20 MB sınırını aşıyor. Daha kısa bir video kaydet.");
        return;
      }
      const file = new File([blob],"bebegimize_video_" + Date.now() + "." + extension,{type:fileType});
      chooseFile("media",file,"camera");
      closeCamera();
      inputs.media.output.scrollIntoView({behavior:"smooth",block:"nearest"});
    };

    try {
      recorder.start(1000);
    } catch (error) {
      activeRecording = null;
      cameraStatus("Kayıt başlatılamadı. Tekrar dene.");
      return;
    }

    startRecordButton.hidden = true;
    stopRecordButton.hidden = false;
    recordIndicator.hidden = false;
    switchCameraButton.disabled = true;
    recordClock.textContent = "00:00";
    cameraStatus("Kayıt yapılıyor. İşin bitince 'Kaydı bitir' düğmesine bas.");

    clockTimer = setInterval(() => {
      const elapsed = Math.min(MAX_RECORD_SECONDS,Math.floor((Date.now()-session.started)/1000));
      recordClock.textContent = "00:" + String(elapsed).padStart(2,"0");
    },250);
    recordLimitTimer = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    },MAX_RECORD_SECONDS*1000);
  }

  function stopVideoRecording() {
    if (!activeRecording || activeRecording.recorder.state !== "recording") return;
    stopRecordButton.disabled = true;
    cameraStatus("Video hazırlanıyor, lütfen bekle…");
    activeRecording.recorder.stop();
    // Reset happens after MediaRecorder's onstop callback.
    Promise.resolve().then(() => { stopRecordButton.disabled = false; });
  }

  function readFileAsDataUrl(file,maxBytes,label) {
    return new Promise((resolve,reject)=>{
      if (!file || !file.name) return resolve({name:"",mime:"",data:""});
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

  function postToBackend(fields) {
    return new Promise((resolve,reject)=>{
      if (!apiUrl) return reject(new Error("Google Drive kayıt sistemi henüz etkinleştirilmedi."));
      const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const postForm = document.createElement("form");
      postForm.method = "POST";
      postForm.action = apiUrl;
      postForm.target = "api-frame";
      postForm.hidden = true;

      Object.entries({...fields,requestId}).forEach(([key,value])=>{
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value == null ? "" : String(value);
        postForm.append(input);
      });

      let resolved = false;
      const timer = setTimeout(()=>{
        cleanup();
        reject(new Error("Kayıt sunucusu zamanında yanıt vermedi. Bağlantıyı kontrol edip tekrar dene."));
      },90000);

      function onMessage(event) {
        const data = event.data;
        if (!data || data.source !== "baby-form-api" || data.requestId !== requestId) return;
        cleanup();
        if (data.ok) resolve(data);
        else reject(new Error(data.error || "Kayıt başarısız."));
      }
      function cleanup() {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        window.removeEventListener("message",onMessage);
        postForm.remove();
      }
      window.addEventListener("message",onMessage);
      document.body.append(postForm);
      postForm.submit();
    });
  }

  form.querySelectorAll('input[name="gender"]').forEach(radio=>{
    radio.addEventListener("change",updateFirstGuess);
  });

  inputs.photo.upload.addEventListener("change",()=>{
    chooseFile("photo",inputs.photo.upload.files[0],"upload");
  });
  inputs.photo.native.addEventListener("change",()=>{
    const file = inputs.photo.native.files[0];
    if (file) {
      chooseFile("photo",file,"native");
      closeCamera();
    }
  });
  inputs.media.upload.addEventListener("change",()=>{
    chooseFile("media",inputs.media.upload.files[0],"upload");
  });
  inputs.media.native.addEventListener("change",()=>{
    const file = inputs.media.native.files[0];
    if (file) {
      chooseFile("media",file,"native");
      closeCamera();
    }
  });

  document.querySelector("#remove-photo").addEventListener("click",()=>resetSelected("photo"));
  document.querySelector("#remove-media").addEventListener("click",()=>resetSelected("media"));
  document.querySelector("#open-photo-camera").addEventListener("click",()=>openCamera("photo"));
  document.querySelector("#open-video-camera").addEventListener("click",()=>openCamera("video"));
  document.querySelector("#close-camera").addEventListener("click",closeCamera);
  captureButton.addEventListener("click",capturePhoto);
  startRecordButton.addEventListener("click",beginVideoRecording);
  stopRecordButton.addEventListener("click",stopVideoRecording);

  switchCameraButton.addEventListener("click",()=>{
    if (activeRecording && activeRecording.recorder.state === "recording") return;
    if (!cameraMode) return;
    openCamera(cameraMode,cameraFacing === "environment" ? "user" : "environment");
  });
  nativeCameraButton.addEventListener("click",()=>{
    if (cameraMode === "photo") inputs.photo.native.click();
    if (cameraMode === "video") inputs.media.native.click();
  });

  document.addEventListener("click",event=>{
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "start") show("form");
    if (button.dataset.action === "back") show("intro");
    if (button.dataset.action === "restart") {
      form.reset();
      updateFirstGuess();
      resetSelected("photo");
      resetSelected("media");
      submitStatus.textContent = "";
      show("intro");
    }
  });

  document.addEventListener("visibilitychange",()=>{
    if (document.hidden && cameraStream) closeCamera();
  });
  window.addEventListener("pagehide",closeCamera);

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    submitStatus.textContent = "";

    if (!form.reportValidity()) return;

    if (activeRecording && activeRecording.recorder.state === "recording") {
      submitStatus.textContent = "Önce video kaydını bitirip kaydedilmesini bekle.";
      return;
    }

    if (!apiUrl) {
      submitStatus.textContent = "Kayıt sistemi henüz Google Drive'a bağlanmadı. Şu an form gönderilemez.";
      return;
    }

    if (!window.confirm("Cevaplarını gönderdikten sonra değiştiremeyeceksin. Göndermek istediğine emin misin?")) return;

    submitButton.disabled = true;
    submitButton.textContent = "Kaydediliyor…";

    try {
      closeCamera();
      const data = new FormData(form);
      const [photo,media] = await Promise.all([
        readFileAsDataUrl(selectedFiles.photo,MAX_PHOTO,"Fotoğraf"),
        readFileAsDataUrl(selectedFiles.media,MAX_MEDIA,"Video / ses")
      ]);
      const result = await postToBackend({
        action:"submit",
        name:data.get("name"),
        relation:data.get("relation"),
        gender:data.get("gender"),
        firstGuess:data.get("firstGuess"),
        shortNote:data.get("shortNote") || "",
        photoName:photo.name,
        photoMime:photo.mime,
        photoData:photo.data,
        mediaName:media.name,
        mediaMime:media.mime,
        mediaData:media.data
      });

      document.querySelector("#success-name").textContent = data.get("name") || "";
      document.querySelector("#success-gender").textContent = data.get("gender") || "";
      document.querySelector("#success-date").textContent =
        new Intl.DateTimeFormat("tr-TR",{dateStyle:"long",timeStyle:"short"})
          .format(new Date(result.submittedAt || Date.now()));
      show("success");
    } catch(error) {
      submitStatus.textContent = error.message || "Gönderim sırasında bir hata oluştu.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Tahminimi kaydet ♡";
    }
  });

  updateFirstGuess();
})();