(() => {
  "use strict";
  const config = () => window.BABY_APP_CONFIG || {};
  const unavailable = () => new Error(
    "Kayıt servisine erişilemiyor. Cevabın gönderilmedi. " +
    "Site yöneticisi Google Apps Script dağıtımında erişimi 'Herkes', " +
    "çalıştıran hesabı 'Ben' olarak kontrol etmeli. Bağlantını da kontrol edebilirsin."
  );

  function jsonp(fields, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!config().apiUrl) return reject(unavailable());
      const callback = "__baby_api_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const url = new URL(config().apiUrl);
      Object.entries({...fields, callback, _: Date.now()}).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
      let settled = false;
      function finish(error, data) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.remove();
        // A removed script can still finish loading. Ignore that late reply.
        window[callback] = () => {};
        setTimeout(() => { delete window[callback]; }, 30000);
        if (error) reject(error); else resolve(data);
      }
      const timer = setTimeout(() => finish(unavailable()), timeoutMs);
      window[callback] = data => {
        if (!data || typeof data.ok !== "boolean") return finish(unavailable());
        finish(null, data);
      };
      script.onerror = () => finish(unavailable());
      script.src = url.toString();
      document.head.append(script);
    });
  }

  async function checkHealth() {
    const data = await jsonp({action: "health"});
    if (!data.ok || data.service !== "baby-family-api") throw unavailable();
    return data;
  }

  async function submit(fields, requestId) {
    const attemptId = "req_" + (window.crypto?.randomUUID?.() ||
      Date.now() + "_" + Math.random().toString(36).slice(2) + "_" + Math.random().toString(36).slice(2));
    const deadline = Date.now() + (fields.mediaData ? 120000 : fields.photoData ? 90000 : 60000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadline - Date.now());
    try {
      // Exactly one POST. An opaque response is never a success receipt.
      // Errors and durable writes are confirmed by the private receipt ID.
      const posted = fetch(config().apiUrl, {
        method: "POST", mode: "no-cors", credentials: "omit",
        redirect: "follow", signal: controller.signal,
        body: new URLSearchParams({...fields, requestId, attemptId})
      }).then(() => null, error => error);
      while (Date.now() < deadline) {
        let result;
        try {
          result = await jsonp({action: "submissionReceipt", requestId, attemptId},
            Math.min(10000, deadline - Date.now()));
        } catch (ignored) {
          // A lost response cannot tell us whether the write reached Google.
        }
        if (result && !result.ok) throw new Error(result.error || "Cevap kaydedilemedi.");
        if (result?.saved === true) return result;
        if (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, Math.min(2000, deadline - Date.now())));
        }
      }
      void posted;
      throw new Error("Kayıt onayı alınamadı. Cevabın kaydedilmiş olabilir. " +
        "Aynı cevaplarla tekrar denersen aynı kayıt anahtarı kullanılacak.");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  function isTrustedOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" &&
        (url.hostname === "script.google.com" || url.hostname === "script.googleusercontent.com" ||
         url.hostname.endsWith(".script.googleusercontent.com") ||
         /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname));
    } catch (ignored) { return false; }
  }

  window.BabyApi = {checkHealth, submit, isTrustedOrigin};
})();


(() => {
  "use strict";
  if (window.BABY_APP_CONFIG?.provider !== "cloudflare") return;
  const apiUrl=window.BABY_APP_CONFIG.apiUrl;
  async function request(fields,{method="POST",body,timeout=60000,binary=false}={}) {
    if(!apiUrl)throw new Error("Kayıt bağlantısı henüz hazır değil.");
    const url=new URL(apiUrl),controller=new AbortController();
    if(method==="GET")Object.entries(fields).forEach(([key,value])=>url.searchParams.set(key,String(value)));
    const timer=setTimeout(()=>controller.abort(),timeout);
    let response;
    try {
      response=await fetch(url,{method,credentials:"omit",cache:"no-store",signal:controller.signal,
        ...(method==="POST"?{body:body||JSON.stringify(fields),headers:body?{}:{"Content-Type":"application/json"}}:{})});
      if(binary&&response.ok)return response.blob();
      const data=await response.json();
      if(!response.ok||data.ok!==true){const error=new Error(data.error||"İşlem tamamlanamadı.");error.serverResponse=true;throw error;}
      return data;
    }finally{clearTimeout(timer);}
  }
  function attachment(data,mime,name){
    const raw=atob(data.slice(data.indexOf(",")+1)),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new File([bytes],name||"hatira",{type:mime||"application/octet-stream"});
  }
  async function submit(fields,requestId){
    const body=new FormData();
    for(const [key,value] of Object.entries({...fields,requestId})){
      if(!/^(photo|media)(Data|Name|Mime)$/.test(key))body.append(key,String(value??""));
    }
    for(const kind of ["photo","media"]){
      if(fields[kind+"Data"])body.append(kind,attachment(fields[kind+"Data"],fields[kind+"Mime"],fields[kind+"Name"]));
    }
    let acknowledged;
    try {
      acknowledged=await request({}, {body,timeout:fields.mediaData?120000:60000});
    } catch(error) {
      if(error.serverResponse)throw error;
      // A lost reply may still have written the record. Keep the same ID.
    }
    // Only show success after a separate read confirms the durable record.
    for(let i=0;i<3;i++){
      try {
        const result=await request({action:"submissionReceipt",requestId},{method:"GET",timeout:10000});
        if(result.saved===true&&result.recordId&&result.submittedAt&&
          (!acknowledged?.recordId||result.recordId===acknowledged.recordId))return result;
      }catch(ignored){}
      if(i<2)await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw new Error("Kayıt onayı alınamadı. Aynı cevaplarla tekrar denersen aynı kayıt anahtarı kullanılacak.");
  }

  async function openMedia(recordId,kind,adminToken){
    const blob=await request({action:"adminMedia",recordId,kind,adminToken},{binary:true});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=kind+"-hatira";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  window.BabyApi={...window.BabyApi,
    checkHealth:()=>request({action:"health"},{method:"GET",timeout:10000}),
    post:fields=>request(fields),publicResults:()=>request({action:"publicResults"},{method:"GET",timeout:15000}),
    submit,openMedia
  };
})();
