(() => {
  "use strict";

  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const TOKEN_KEY = "bebegimin_cinsiyeti_admin_session";
  const REFRESH_MS = 60000;

  // These are fictional samples only. Private family replies never enter
  // the public GitHub source; they are fetched after server-side authorization.
  const samples = [
    {
      name:"TEST - Ayşe Örnek", relation:"Teyzesi (TEST)", gender:"👧 Kız",
      firstGuess:"İlk andan beri kız",
      shortNote:"TEST KAYDI: Minik bebeğimize kucak dolusu sevgiler. Ailemize hoş geldin!",
      photoUrl:"",mediaUrl:"",submittedAt:"2026-10-07T21:50:56.211Z"
    },
    {
      name:"TEST - Mehmet Deneme", relation:"Amcası (TEST)", gender:"👦 Erkek",
      firstGuess:"İlk andan beri erkek",
      shortNote:"TEST KAYDI: Büyüdüğünde bu tahminlere birlikte gülümseriz.",
      photoUrl:"",mediaUrl:"",submittedAt:"2026-10-07T21:50:56.211Z"
    },
    {
      name:"TEST - Zeynep Kontrol", relation:"Kuzeni (TEST)", gender:"👧 Kız",
      firstGuess:"Önce erkek düşündüm, sonra fikrim değişti",
      shortNote:"TEST KAYDI: Seni tanıyacağımız günü heyecanla bekliyoruz.",
      photoUrl:"",mediaUrl:"",submittedAt:"2026-10-07T21:50:56.211Z"
    }
  ];

  let responses = samples.slice();
  let participants = samples.map(p => ({name:p.name,relation:p.relation,answered:true}));
  let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
  let mode = "demo";
  let requestedEmail = "";
  let polling = false;
  let lastSync = null;

  const $ = selector => document.querySelector(selector);
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  };

  const clamp = (value, a, b) => Math.max(a, Math.min(b, value));
  const normalize = value => String(value || "").toLocaleLowerCase("tr-TR").trim();
  const isTest = person => /^test\b/i.test(String(person.name || "").trim()) || /\(test\)/i.test(String(person.relation || ""));
  const isGirl = person => normalize(person.gender).includes("kız");
  const isBoy = person => normalize(person.gender).includes("erkek");
  const percent = (count, all) => all ? Math.round(count * 100 / all) : 0;
  const isRealDriveUrl = value => /^https:\/\/drive\.google\.com\/(?:file\/|open|drive\/)/i.test(String(value || ""));

  function formatDate(value) {
    if (!value) return "Tarih belirtilmemiş";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(date);
  }

  function syncStatus() {
    const live = mode === "live";
    const status = $("#data-status");
    status.classList.toggle("live", live);
    status.lastChild.textContent = live ? " Canlı sonuçlar" : " Örnek görünüm";
    $("#updated-at").textContent = live && lastSync
      ? "Son güncelleme: " + formatDate(lastSync)
      : "Tanıtım verileri gösteriliyor";
    $("#sample-banner").hidden = live;
    $("#logout-btn").hidden = !live;
  }

  function mainDataset() {
    if (!$("#hide-tests").checked) return responses.slice();
    return responses.filter(r => !isTest(r));
  }

  function writeStats(dataset) {
    const total = dataset.length;
    const girls = dataset.filter(isGirl).length;
    const boys = dataset.filter(isBoy).length;
    const girlShare = percent(girls,total);
    const boyShare = percent(boys,total);

    let relevantParticipants = participants;
    if ($("#hide-tests").checked) relevantParticipants = participants.filter(p => !isTest(p));
    const participantCount = Math.max(relevantParticipants.length,total);
    const waiting = Math.max(0, participantCount - total);
    const turnout = participantCount ? percent(total, participantCount) : 0;

    $("#stat-total").textContent = total;
    $("#stat-girl").textContent = girls;
    $("#stat-boy").textContent = boys;
    $("#stat-turnout").textContent = "%" + turnout;
    $("#girl-percent").textContent = "Toplamın %" + girlShare + "'i";
    $("#boy-percent").textContent = "Toplamın %" + boyShare + "'i";
    $("#waiting-label").textContent = waiting + " kişi bekleniyor";

    $("#donut-total").textContent = total;
    $("#legend-girl").textContent = girls + " (%"+girlShare+")";
    $("#legend-boy").textContent = boys + " (%"+boyShare+")";

    const donut = $("#vote-donut");
    if (total > 0) {
      donut.style.background = "conic-gradient(#dc719d 0 " + girlShare + "%, #82add8 " + girlShare + "% 100%)";
    } else {
      donut.style.background = "conic-gradient(#e8e3e7 0 100%)";
    }
    donut.setAttribute("aria-label", total + " tahminin " + girls + " tanesi kız, " + boys + " tanesi erkek");
    $("#vote-bar-pink").style.width = girlShare + "%";
    $("#vote-bar-blue").style.width = (total ? 100-girlShare : 0) + "%";
    $("#distribution-insight").textContent = !total
      ? "İlk tahminlerimizi bekliyoruz."
      : girls === boys ? "Ailede tahminler başa baş gidiyor!"
      : girls > boys ? "Şimdilik kız tahminleri biraz daha önde."
      : "Şimdilik erkek tahminleri biraz daha önde.";

    const noteCount = dataset.filter(r => String(r.shortNote||"").trim()).length;
    const photoCount = dataset.filter(r => isRealDriveUrl(r.photoUrl)).length;
    const mediaCount = dataset.filter(r => isRealDriveUrl(r.mediaUrl)).length;
    $("#count-notes").textContent = noteCount;
    $("#count-photos").textContent = photoCount;
    $("#count-media").textContent = mediaCount;
    $("#memory-insight").textContent = noteCount
      ? noteCount + " kişi bebeğimize bugünden küçük bir mesaj bırakmış. Her satır yıllar sonra ayrı bir hatıra olacak."
      : "Bebeğimiz için bırakılan güzel sözler burada çoğalacak.";
  }

  function writeFirstChart(dataset) {
    const choices = [
      {text:"İlk andan beri kız",short:"İlk andan beri kız"},
      {text:"İlk andan beri erkek",short:"İlk andan beri erkek"},
      {text:"Önce kız düşündüm, sonra fikrim değişti",short:"Önce kız, sonra erkek"},
      {text:"Önce erkek düşündüm, sonra fikrim değişti",short:"Önce erkek, sonra kız"},
      {text:"Hiç tahminim olmadı",short:"Hiç tahminim yoktu"}
    ];
    const target = $("#first-chart");
    target.textContent = "";
    for (const choice of choices) {
      const count = dataset.filter(r => normalize(r.firstGuess) === normalize(choice.text)).length;
      const item = node("div","bar-item");
      const label = node("div","bar-label");
      label.append(node("span",null,choice.short),node("strong",null,count));
      const track=node("div","bar-track");
      const fill=node("span","bar-fill");
      fill.style.width=percent(count,dataset.length)+"%";
      track.append(fill);
      item.append(label,track);
      target.append(item);
    }
  }

  function relativeLabel(value) {
    const v = normalize(String(value || "").replace(/\(\s*test\s*\)/ig,""));
    if (v.includes("teyze")) return "Teyze";
    if (v.includes("hala")) return "Hala";
    if (v.includes("dayı")) return "Dayı";
    if (v.includes("amca")) return "Amca";
    if (v.includes("anneanne")) return "Anneanne";
    if (v.includes("babaanne")) return "Babaanne";
    if (v.includes("dede")) return "Dede";
    if (v.includes("kuzen")) return "Kuzen";
    if (v.includes("abi") || v.includes("ağabey")) return "Abi";
    if (v.includes("abla")) return "Abla";
    if (v.includes("büyükanne")) return "Büyükanne";
    return String(value || "Diğer").replace(/\(\s*test\s*\)/ig,"").trim() || "Diğer";
  }

  function writeRelatives(dataset) {
    const target=$("#relative-chart");
    target.textContent="";
    const counts=new Map();
    dataset.forEach(r => {
      const label=relativeLabel(r.relation);
      counts.set(label,(counts.get(label)||0)+1);
    });
    const pairs=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"tr"));
    if(!pairs.length){
      target.append(node("p","no-relatives","Henüz katılan yok."));
      return;
    }
    pairs.forEach(([label,count])=>{
      const item=node("div","relation-pill");
      item.append(node("span",null,label),node("strong",null,count));
      target.append(item);
    });
  }

  function addFileLink(target, url, label) {
    if (!isRealDriveUrl(url)) return;
    const anchor=node("a",null,label);
    anchor.href=url;
    anchor.target="_blank";
    anchor.rel="noopener noreferrer";
    target.append(anchor);
  }

  function renderCard(person) {
    const gender=isGirl(person)?"girl":"boy";
    const card=node("article","response-card");
    card.dataset.gender=gender;

    const header=node("div","response-heading");
    const identity=node("div","response-person");
    const avatar=node("span","avatar",Array.from(String(person.name||"?").replace(/^TEST\s*-\s*/i,"").trim())[0]||"?");
    const intro=node("div","response-person-copy");
    intro.append(node("strong",null,person.name||"Bilinmeyen kişi"),node("small",null,person.relation||""));
    identity.append(avatar,intro);
    header.append(identity,node("span","guess-chip",isGirl(person)?"👧 Kız":"👦 Erkek"));

    const first=node("div","response-first");
    first.append(node("span",null,"İlk içinden geçen"),node("strong",null,person.firstGuess||"Belirtilmedi"));

    const note=node("div","response-note");
    note.append(node("span",null,"BEBEĞİMİZE BIRAKTIĞI MESAJ"));
    const noteText=node("p",String(person.shortNote||"").trim()?"":"missing",
      String(person.shortNote||"").trim() || "Yazılı mesaj bırakılmamış.");
    note.append(noteText);

    const foot=node("div","response-foot");
    foot.append(node("span","response-date",formatDate(person.submittedAt)));
    const media=node("div","media-links");
    addFileLink(media,person.photoUrl,"📷 Fotoğraf");
    addFileLink(media,person.mediaUrl,"▶ Video / Ses");
    if (isTest(person)) media.append(node("span","demo-label","TEST"));
    foot.append(media);

    card.append(header,first,note,foot);
    return card;
  }

  function writeResponses(dataset){
    const q=normalize($("#search-input").value);
    const choice=$("#gender-filter").value;
    const sort=$("#sort-filter").value;
    const filtered=dataset.filter(r=>{
      if(choice==="girl"&&!isGirl(r))return false;
      if(choice==="boy"&&!isBoy(r))return false;
      if(q){
        const haystack=normalize([r.name,r.relation,r.firstGuess,r.shortNote].join(" "));
        if(!haystack.includes(q))return false;
      }
      return true;
    });
    filtered.sort((a,b)=>{
      if(sort==="name")return String(a.name||"").localeCompare(String(b.name||""),"tr");
      const t1=new Date(a.submittedAt||0).getTime()||0;
      const t2=new Date(b.submittedAt||0).getTime()||0;
      return sort==="oldest"?t1-t2:t2-t1;
    });

    const container=$("#response-grid");
    container.textContent="";
    const batch=document.createDocumentFragment();
    filtered.forEach(r=>batch.append(renderCard(r)));
    container.append(batch);
    $("#visible-count").textContent=filtered.length+" cevap";
    $("#empty-state").hidden=filtered.length>0;
  }

  function render(){
    syncStatus();
    const data=mainDataset();
    writeStats(data);
    writeFirstChart(data);
    writeRelatives(data);
    writeResponses(data);
  }

  function setMessage(text,isError=false) {
    const el=$("#access-message");
    el.textContent=text;
    el.style.color=isError?"#a84050":"#567960";
  }

  function openAccess(){
    $("#access-panel").hidden=false;
    $("#request-code-form").hidden=false;
    $("#verify-code-form").hidden=true;
    $("#access-panel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function hideAccess(){
    $("#access-panel").hidden=true;
    setMessage("");
  }

  function postAction(fields){
    return new Promise((resolve,reject)=>{
      if(!apiUrl)return reject(new Error("Google kayıt bağlantısı henüz kurulmamış."));
      const requestId="result_"+Date.now()+"_"+Math.random().toString(36).slice(2);
      const form=document.createElement("form");
      form.method="POST";
      form.action=apiUrl;
      form.target="results-frame";
      form.hidden=true;
      Object.entries({...fields,requestId}).forEach(([key,value])=>{
        const input=document.createElement("input");
        input.type="hidden";
        input.name=key;
        input.value=value==null?"":String(value);
        form.append(input);
      });
      let done=false;
      const timeout=setTimeout(()=>{
        cleanup();
        reject(new Error("Google bağlantısından yanıt alınamadı. Bağlantıyı ve dağıtımı kontrol et."));
      },35000);
      function cleanup(){
        if(done)return;
        done=true;
        clearTimeout(timeout);
        window.removeEventListener("message",onMessage);
        form.remove();
      }
      function onMessage(event){
        const data=event.data;
        if(!data||data.source!=="baby-form-api"||data.requestId!==requestId)return;
        cleanup();
        if(data.ok)resolve(data);
        else reject(new Error(data.error||"İşlem başarısız."));
      }
      window.addEventListener("message",onMessage);
      document.body.append(form);
      form.submit();
    });
  }

  async function loadLive(silent=false){
    if(!adminToken)throw new Error("Gerçek cevapları görüntülemek için güvenli giriş gerekiyor.");
    if(polling)return;
    polling=true;
    try{
      const data=await postAction({action:"adminList",adminToken});
      if(!Array.isArray(data.responses)||!Array.isArray(data.participants)){
        throw new Error("Sunucudan geçerli sonuç verisi gelmedi.");
      }
      responses=data.responses;
      participants=data.participants;
      lastSync=Date.now();
      mode="live";
      hideAccess();
      render();
    }catch(error){
      if(/oturum|giriş|session|token/i.test(String(error.message||""))){
        adminToken="";
        sessionStorage.removeItem(TOKEN_KEY);
        mode="demo";
        responses=samples.slice();
        participants=samples.map(p=>({name:p.name,relation:p.relation,answered:true}));
        render();
        if(!silent)openAccess();
      }
      if(!silent)throw error;
    }finally{
      polling=false;
    }
  }

  $("#open-access").addEventListener("click",openAccess);
  $("#close-access").addEventListener("click",hideAccess);

  $("#request-code-form").addEventListener("submit",async e=>{
    e.preventDefault();
    requestedEmail=$("#admin-email").value;
    const button=$("#request-code-btn");
    button.disabled=true;
    setMessage("E-postana kod gönderiliyor…");
    try{
      const result=await postAction({action:"requestAdminCode",adminEmail:requestedEmail});
      setMessage(result.message||"Kodu e-postana gönderdik.");
      $("#request-code-form").hidden=true;
      $("#verify-code-form").hidden=false;
      $("#admin-code").focus();
    }catch(error){
      setMessage(error.message,true);
    }finally{
      button.disabled=false;
    }
  });

  $("#verify-code-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const button=$("#verify-code-btn");
    button.disabled=true;
    setMessage("Kod kontrol ediliyor…");
    try{
      const result=await postAction({
        action:"verifyAdminCode",
        adminEmail:requestedEmail,
        adminCode:$("#admin-code").value.trim()
      });
      if(!result.adminToken)throw new Error("Sunucu geçerli oturum bilgisi göndermedi.");
      adminToken=result.adminToken;
      sessionStorage.setItem(TOKEN_KEY,adminToken);
      $("#admin-code").value="";
      await loadLive();
    }catch(error){
      setMessage(error.message,true);
    }finally{
      button.disabled=false;
    }
  });

  $("#change-email").addEventListener("click",()=>{
    $("#verify-code-form").hidden=true;
    $("#request-code-form").hidden=false;
    $("#admin-code").value="";
    setMessage("");
  });

  $("#refresh-btn").addEventListener("click",async()=>{
    if(mode!=="live"){openAccess();return;}
    const button=$("#refresh-btn");
    button.disabled=true;
    button.textContent="Yenileniyor…";
    try{
      await loadLive();
    }catch(error){
      openAccess();
      setMessage(error.message,true);
    }finally{
      button.disabled=false;
      button.textContent="↻ Yenile";
    }
  });

  $("#logout-btn").addEventListener("click",async()=>{
    const previous=adminToken;
    adminToken="";
    sessionStorage.removeItem(TOKEN_KEY);
    responses=samples.slice();
    participants=samples.map(p=>({name:p.name,relation:p.relation,answered:true}));
    mode="demo";
    lastSync=null;
    render();
    if(previous){
      try{await postAction({action:"logoutAdmin",adminToken:previous});}
      catch(error){/* Local session is already discarded. */}
    }
  });

  $("#pdf-btn").addEventListener("click",()=>window.print());
  ["search-input","gender-filter","sort-filter"].forEach(id=>{
    $("#"+id).addEventListener(id==="search-input"?"input":"change",()=>writeResponses(mainDataset()));
  });
  $("#hide-tests").addEventListener("change",render);

  render();
  if(adminToken){
    loadLive(true).catch(()=>{});
  }
  setInterval(()=>{
    if(mode==="live"&&adminToken&&!document.hidden&&!polling){
      loadLive(true).catch(()=>{});
    }
  },REFRESH_MS);
})();