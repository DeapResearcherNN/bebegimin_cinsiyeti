(() => {
  "use strict";

  const apiUrl = (window.BABY_APP_CONFIG && window.BABY_APP_CONFIG.apiUrl) || "";
  const REFRESH_MS = 60000;
  let responses = [];
  let participants = [];
  let loaded = false;
  let busy = false;
  let loadError = "";
  let lastSync = null;

  const $ = selector => document.querySelector(selector);
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if(cls) element.className = cls;
    if(text !== undefined && text !== null) element.textContent = String(text);
    return element;
  };
  const normalize = value => String(value || "").toLocaleLowerCase("tr-TR").trim();
  const isTest = person => person.isTest === true ||
    /^test\b/i.test(String(person.name || "").trim()) ||
    /\(test\)/i.test(String(person.relation || ""));
  const isGirl = person => normalize(person.gender).includes("kız");
  const isBoy = person => normalize(person.gender).includes("erkek");
  const percent = (count, total) => total ? Math.round(100 * count / total) : 0;

  function formatDate(value) {
    if(!value) return "Tarih belirtilmemiş";
    const date = new Date(value);
    if(!Number.isFinite(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("tr-TR",{
      dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"
    }).format(date);
  }

  function syncStatus() {
    const pill=$("#data-status");
    pill.classList.toggle("live",loaded && !loadError);
    pill.lastChild.textContent = loaded
      ? (loadError ? " Yeniden bağlantı kuruluyor" : " Canlı sonuçlar")
      : " Canlı veriye bağlanıyor";
    $("#updated-at").textContent = loaded
      ? "Son güncelleme: " + formatDate(lastSync)
      : "İstatistikler hazırlanıyor…";
    $("#sample-banner").hidden = loaded && !loadError;
    $("#load-notice-title").textContent = loadError
      ? "Veriler şu anda güncellenemiyor"
      : "Canlı sonuçlara bağlanılıyor…";
    $("#load-notice-message").textContent = loadError ||
      "Google tahmin kayıtları yükleniyor. Admin girişi veya şifre gerekmiyor.";
  }

  function mainDataset() {
    return $("#hide-tests").checked
      ? responses.filter(r => !isTest(r))
      : responses.slice();
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

    const noteCount = dataset.filter(r => r.hasNote === true).length;
    const photoCount = dataset.filter(r => r.hasPhoto === true).length;
    const mediaCount = dataset.filter(r => r.hasMedia === true).length;
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
    note.append(node("span",null,"BEBEĞİMİZE KÜÇÜK BİR HATIRA"));
    const noteText=node("p",person.hasNote?"":"missing",
      person.hasNote
        ? "Bebeğimiz için bir mesaj bıraktı. Mesajın metni özel arşivimizde saklanıyor. ♡"
        : "Yazılı mesaj bırakılmamış.");
    note.append(noteText);

    const foot=node("div","response-foot");
    foot.append(node("span","response-date","Anonim aile tahmini"));
    const media=node("div","media-links");
    if(person.hasPhoto) media.append(node("span","media-badge","📷 Fotoğraf bıraktı"));
    if(person.hasMedia) media.append(node("span","media-badge","▶ Video / ses bıraktı"));
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
      const t1=Number(a.sequence)||0;
      const t2=Number(b.sequence)||0;
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


  function renderPending() {
    $("#pdf-btn").disabled = true;
    for(const id of [
      "stat-total","stat-girl","stat-boy","stat-turnout",
      "donut-total","count-notes","count-photos","count-media"
    ]) $("#"+id).textContent = "—";
    $("#girl-percent").textContent = "Yükleniyor";
    $("#boy-percent").textContent = "Yükleniyor";
    $("#waiting-label").textContent = "Güncelleniyor";
    $("#legend-girl").textContent = "—";
    $("#legend-boy").textContent = "—";
    $("#vote-bar-pink").style.width = "0%";
    $("#vote-bar-blue").style.width = "0%";
    $("#vote-donut").style.background = "conic-gradient(#e8e3e7 0 100%)";
    $("#distribution-insight").textContent = "Canlı istatistikler hazırlanıyor.";
    $("#first-chart").replaceChildren(node("p","no-relatives","İlk tahminler yükleniyor…"));
    $("#relative-chart").replaceChildren(node("p","no-relatives","Katılım istatistikleri yükleniyor…"));
    $("#memory-insight").textContent = "Fotoğraf ve mesaj sayıları yükleniyor…";
    $("#response-grid").replaceChildren();
    $("#visible-count").textContent = "Yükleniyor";
    $("#empty-state").hidden = false;
    $("#empty-state-title").textContent = "Tahminler yükleniyor…";
    $("#empty-state-description").textContent = "Birazdan güncel sonuçları göreceksin.";
  }

  function render() {
    syncStatus();
    if(!loaded) return renderPending();
    $("#pdf-btn").disabled = false;
    const data=mainDataset();
    writeStats(data);
    writeFirstChart(data);
    writeRelatives(data);
    writeResponses(data);
    $("#empty-state-title").textContent = "Bu filtreye uygun tahmin yok.";
    $("#empty-state-description").textContent = "Başka bir filtre seçebilirsin.";
  }

  function fetchPublicResults() {
    return new Promise((resolve,reject) => {
      if(!apiUrl) return reject(new Error(
        "Google kayıt sistemi bağlantısı henüz yapılandırılmamış."
      ));
      const callback="__baby_public_"+Date.now()+"_"+Math.random().toString(36).slice(2);
      const script=document.createElement("script");
      const url=new URL(apiUrl);
      url.searchParams.set("action","publicResults");
      url.searchParams.set("callback",callback);
      url.searchParams.set("_",String(Date.now()));

      let finished=false;
      const timer=setTimeout(()=>{
        cleanup();
        reject(new Error("Google sonuç sunucusu yanıt vermedi. Bağlantıyı kontrol et."));
      },18000);

      function cleanup() {
        if(finished) return;
        finished=true;
        clearTimeout(timer);
        delete window[callback];
        script.remove();
      }

      window[callback]=data=>{
        cleanup();
        if(!data || data.ok !== true){
          const original = String(data?.error || "");
          reject(new Error(
            /Bilinmeyen işlem/i.test(original)
              ? "Yeni sonuç servisi henüz Google Apps Script'te yayımlanmadı. Kodun yeni sürümünü dağıtmak gerekiyor."
              : (original || "Sonuç sunucusu geçersiz yanıt verdi.")
          ));
        } else if(data.publicVersion !== "anonymous-v1"){
          reject(new Error("Sonuç servisi güncel değil. Google Apps Script sürümünü yenile."));
        } else if(!Array.isArray(data.responses) || !Array.isArray(data.participants)){
          reject(new Error("Sunucunun sonuç listesi eksik."));
        } else {
          resolve(data);
        }
      };

      script.onerror=()=>{
        cleanup();
        reject(new Error("Google sonuç bağlantısı açılamadı. Ağ bağlantını ve Apps Script dağıtımını kontrol et."));
      };

      script.src=url.toString();
      document.head.append(script);
    });
  }

  async function refreshResults() {
    if(busy) return;
    busy=true;
    $("#refresh-btn").disabled=true;
    try{
      const data=await fetchPublicResults();
      responses=data.responses;
      participants=data.participants;
      loaded=true;
      loadError="";
      lastSync=Date.now();
      render();
    }catch(error){
      loadError=String(error?.message || "Sonuçlar alınamadı.");
      render();
    }finally{
      busy=false;
      $("#refresh-btn").disabled=false;
    }
  }

  $("#refresh-btn").addEventListener("click",refreshResults);
  $("#retry-results").addEventListener("click",refreshResults);
  $("#pdf-btn").addEventListener("click",()=>{if(loaded)window.print();});

  ["search-input","gender-filter","sort-filter"].forEach(id=>{
    $("#"+id).addEventListener(id==="search-input"?"input":"change",()=>{
      if(loaded) writeResponses(mainDataset());
    });
  });
  $("#hide-tests").addEventListener("change",render);

  window.addEventListener("storage",event=>{
    if(event.key==="baby_results_changed_at" && !document.hidden) refreshResults();
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden) refreshResults();
  });

  render();
  refreshResults();
  setInterval(()=>{
    if(!document.hidden) refreshResults();
  },REFRESH_MS);
})();