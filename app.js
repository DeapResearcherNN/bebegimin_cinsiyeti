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
  let lastSubmission = null;

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
    const video = {facingMode:{ideal:facing},width:{ideal:mode === "video" ? 960 : 1280},height:{ideal:mode === "video" ? 540 : 720}};
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
      const settings = {videoBitsPerSecond:700000,audioBitsPerSecond:64000};
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

  // Most mobile photos are many megabytes. Downsize large JPEG-capable
  // images locally before encoding for the Google Apps Script form POST.
  function optimizePhoto(file) {
    return new Promise(resolve => {
      if(!file || file.size < 600000 || !/^image\//i.test(file.type || "")) {
        resolve(file);
        return;
      }

      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      let finished = false;
      function complete(result) {
        if(finished) return;
        finished = true;
        URL.revokeObjectURL(objectUrl);
        resolve(result || file);
      }
      image.onload = () => {
        try {
          const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            if(blob && blob.size > 0 && blob.size < file.size) {
              complete(new File([blob], "aile_fotografi_" + Date.now() + ".jpg", {type:"image/jpeg"}));
            } else {
              complete(file);
            }
          }, "image/jpeg", 0.79);
        } catch(err) {
          complete(file);
        }
      };
      image.onerror = () => complete(file);
      image.src = objectUrl;
    });
  }

  function newRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "req_" + window.crypto.randomUUID();
    }
    return "req_" + Date.now() + "_" + Math.random().toString(36).slice(2) + "_" + Math.random().toString(36).slice(2);
  }

  function verifySavedReceipt(requestId) {
    return new Promise((resolve,reject) => {
      const callback = "__baby_receipt_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const url = new URL(apiUrl);
      url.searchParams.set("action","submissionReceipt");
      url.searchParams.set("requestId",requestId);
      url.searchParams.set("callback",callback);
      url.searchParams.set("_",String(Date.now()));
      let finished = false;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Kayıt kontrol servisi yanıt vermedi."));
      },7500);
      function cleanup() {
        if(finished) return;
        finished = true;
        clearTimeout(timer);
        delete window[callback];
        script.remove();
      }
      window[callback] = result => {
        cleanup();
        if(result && result.ok && typeof result.saved === "boolean") resolve(result);
        else reject(new Error((result && result.error) || "Kayıt kontrol servisi henüz hazır değil."));
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Kayıt kontrol bağlantısı açılamadı."));
      };
      script.src = url.toString();
      document.head.append(script);
    });
  }

  function sendWithReceipt(fields, requestId, hasMedia) {
    return new Promise((resolve,reject) => {
      let finished = false;
      let polling = false;
      let receiptSupported = true;
      const maxWait = hasMedia ? 65000 : 42000;
      const pollEvery = 3500;

      function cleanup() {
        clearTimeout(timeout);
        clearInterval(checker);
      }
      function success(result) {
        if(finished) return;
        finished = true;
        cleanup();
        resolve(result);
      }
      function failure(error) {
        if(finished) return;
        finished = true;
        cleanup();
        reject(error);
      }

      const timeout = setTimeout(() => failure(new Error(
        "Google bağlantısı çok gecikti. Cevabın kaydedilmiş olabilir. " +
        "Lütfen tekrar göndermeden önce sonuç tablosunu kontrol et."
      )),maxWait);

      async function checkReceipt() {
        if(finished || polling || !receiptSupported) return;
        polling = true;
        try {
          const result = await verifySavedReceipt(requestId);
          if(result.saved) {
            success({ok:true,submittedAt:result.submittedAt,verifiedByReceipt:true});
          }
        } catch(err) {
          if(/henüz hazır değil|Bilinmeyen işlem/i.test(err.message || "")) receiptSupported = false;
        } finally {
          polling = false;
        }
      }
      const checker = setInterval(checkReceipt,pollEvery);

      postToBackend(fields,requestId).then(success).catch(error => {
        if(error.serverResponse) {
          failure(error);
        } else if(!finished) {
          submitStatus.textContent = "Google yanıtı gecikiyor. Kaydın gerçekten oluştuğunu kontrol ediyoruz, lütfen bekle…";
        }
      });
    });
  }

  function postToBackend(fields, requestId) {
    return new Promise((resolve,reject)=>{
      if (!apiUrl) return reject(new Error("Google Drive kayıt sistemi henüz etkinleştirilmedi."));
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
      },70000);

      function onMessage(event) {
        const data = event.data;
        if (!data || data.source !== "baby-form-api" || data.requestId !== requestId) return;
        cleanup();
        if (data.ok) resolve(data);
        else {
          const error = new Error(data.error || "Kayıt başarısız.");
          error.serverResponse = true;
          reject(error);
        }
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
    submitButton.classList.add("is-saving");
    submitButton.textContent = "Gönderiliyor…";
    const progressTimers = [];

    try {
      closeCamera();
      const data = new FormData(form);
      const hasPhoto = !!selectedFiles.photo;
      const hasMedia = !!selectedFiles.media;

      submitStatus.textContent = hasPhoto
        ? "Fotoğraf gönderim için hazırlanıyor…"
        : hasMedia ? "Video / ses dosyan hazırlanıyor…" : "Tahminin Google'a gönderiliyor…";

      const preparedPhoto = await optimizePhoto(selectedFiles.photo);
      const [photo,media] = await Promise.all([
        readFileAsDataUrl(preparedPhoto,MAX_PHOTO,"Fotoğraf"),
        readFileAsDataUrl(selectedFiles.media,MAX_MEDIA,"Video / ses")
      ]);

      const submittedFields = {
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
      };

      // Preserve the same request ID if the user retries unchanged answers
      // after a network timeout. The backend de-duplicates this ID.
      const fingerprint = [
        submittedFields.name,submittedFields.relation,
        submittedFields.gender,submittedFields.firstGuess,
        submittedFields.shortNote,
        selectedFiles.photo && selectedFiles.photo.name,
        selectedFiles.photo && selectedFiles.photo.size,
        selectedFiles.media && selectedFiles.media.name,
        selectedFiles.media && selectedFiles.media.size
      ].join("|");

      const fresh = !lastSubmission ||
        lastSubmission.fingerprint !== fingerprint ||
        Date.now() - lastSubmission.started > 1800000;
      if(fresh) {
        lastSubmission = {
          fingerprint,
          requestId:newRequestId(),
          started:Date.now()
        };
      }

      submitStatus.textContent = hasMedia
        ? "Dosyalar güvenle aktarılıyor. Büyük videolar biraz daha uzun sürebilir."
        : "Tahminin kaydediliyor; lütfen sayfayı kapatma.";

      progressTimers.push(setTimeout(()=>{
        submitStatus.textContent = "Google Drive ile bağlantı kuruldu, kayıt onayı bekleniyor…";
      },8500));
      progressTimers.push(setTimeout(()=>{
        submitStatus.textContent =
          "İşlem beklenenden uzun sürüyor. Cevabın yazılıp yazılmadığını ayrıca kontrol ediyoruz.";
      },19500));
      progressTimers.push(setTimeout(()=>{
        submitStatus.textContent =
          "Bağlantı yavaş. Yanlışlıkla ikinci kez göndermemek için kayıt onayını bekliyoruz.";
      },34000));

      const result = await sendWithReceipt(
        submittedFields, lastSubmission.requestId, hasMedia
      );

      // This signal is anonymous; no family name, guess or attachment is
      // stored in browser storage.
      try {
        localStorage.setItem("baby_results_changed_at", String(Date.now()));
      } catch(ignored) {}

      lastSubmission = null;
      document.querySelector("#success-name").textContent = data.get("name") || "";
      document.querySelector("#success-gender").textContent = data.get("gender") || "";
      document.querySelector("#success-date").textContent =
        new Intl.DateTimeFormat("tr-TR",{dateStyle:"long",timeStyle:"short"})
          .format(new Date(result.submittedAt || Date.now()));
      submitStatus.textContent = "";
      show("success");
    } catch(error) {
      submitStatus.textContent = error.message ||
        "Kayıt yanıtı alınamadı. Tekrar göndermeden önce sonucunu kontrol et.";
    } finally {
      progressTimers.forEach(timer => clearTimeout(timer));
      submitButton.disabled = false;
      submitButton.classList.remove("is-saving");
      submitButton.textContent = "Tahminimi kaydet ♡";
    }
  });

  updateFirstGuess();
})();