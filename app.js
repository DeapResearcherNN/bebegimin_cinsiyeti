(() => {
  const order = ["intro","identity","prediction","appearance","birth","future","names","capsule","uploads","last","review","success"];
  const sections = ["identity","prediction","appearance","birth","future","names","capsule","uploads","last"];
  const sectionNames = {
    identity:"Sen kimsin?", prediction:"Şimdi tahmin zamanı", appearance:"Bebeğimizi biraz daha tahmin edelim",
    birth:"Doğum tahminleri", future:"Gelecekte nasıl biri olacak?", names:"İsim tahminleri",
    capsule:"Bebeğimize zaman kapsülü", uploads:"İsteğe bağlı hatıra", last:"Son soru"
  };
  const state = {};
  let current = "intro";
  const screens = [...document.querySelectorAll(".screen")];
  const progressHead = document.querySelector("#progress-head");
  const progressLabel = document.querySelector("#progress-label");
  const progressTitle = document.querySelector("#progress-title");
  const progressBar = document.querySelector("#progress-bar");

  function show(step){
    screens.forEach(s => s.classList.toggle("active", s.dataset.step === step));
    current = step;
    const idx = sections.indexOf(step);
    progressHead.hidden = idx < 0;
    if(idx >= 0){
      progressLabel.textContent = "Bölüm " + (idx+1) + " / " + sections.length;
      progressTitle.textContent = sectionNames[step];
      progressBar.style.width = (((idx+1)/sections.length)*100) + "%";
    }
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function valueOf(el){
    if(el.type === "file") return el.files && el.files[0] ? el.files[0].name : "";
    return el.value;
  }

  function collect(form){
    const data = new FormData(form);
    for(const [key,val] of data.entries()){
      if(val instanceof File){
        if(val.name) state[key] = val.name;
      } else if(key === "character"){
        if(!Array.isArray(state[key])) state[key] = [];
        if(!state[key].includes(val)) state[key].push(val);
      } else {
        state[key] = val;
      }
    }
    form.querySelectorAll('input[type="file"]').forEach(el => {
      if(el.files && el.files[0]) state[el.name] = el.files[0].name;
    });
  }

  document.querySelectorAll(".step-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      if(!form.reportValidity()) return;
      if(form.querySelectorAll('input[name="character"]').length){
        const checked = [...form.querySelectorAll('input[name="character"]:checked')].map(x=>x.value);
        if(!checked.length){
          alert("Lütfen 14. soruda en az bir özellik seç.");
          return;
        }
        state.character = checked;
      }
      collect(form);
      const next = form.dataset.next;
      if(next === "review") buildReview();
      show(next);
    });
  });

  const labels = {
    name:"1. Ad ve soyad", relation:"2. Bebeğimizin nesi", gender:"3. Cinsiyet tahmini", confidence:"4. Eminlik",
    reason:"5. Neden böyle düşünüyorsun?", firstGuess:"6. İlk tahmin", resemblance:"7. Kime benzeyecek?",
    hair:"8. Saçları", eyes:"9. Gözleri", birthDate:"10. Doğum tarihi", birthWeight:"11. Doğum kilosu",
    birthHeight:"12. Doğum boyu", birthTime:"13. Doğum saati", character:"14. Karakter", likes:"15. En çok neyi sevecek?",
    career:"16. Ne olmak isteyecek?", girlName:"17. Kız ismi tahmini", boyName:"18. Erkek ismi tahmini",
    yourNameChoice:"19. Senin isim seçimin", futureMessage:"20. Yıllar sonra mesaj", biggestWish:"21. En büyük dilek",
    hardTimes:"22. Zor zamanlar için cümle", lifeAdvice:"23. Hayat tavsiyesi", futureActivity:"24. Birlikte yapmak istediğin şey",
    photo:"25. Fotoğraf", media:"26. Video / ses", funnyAnswer:"27. En çok hangi cevaba güleceğiz?"
  };
  const groups = [
    ["Sen kimsin?",["name","relation"]],
    ["Tahmin",["gender","confidence","reason","firstGuess"]],
    ["Görünüş",["resemblance","hair","eyes"]],
    ["Doğum",["birthDate","birthWeight","birthHeight","birthTime"]],
    ["Gelecek",["character","likes","career"]],
    ["İsimler",["girlName","boyName","yourNameChoice"]],
    ["Zaman kapsülü",["futureMessage","biggestWish","hardTimes","lifeAdvice","futureActivity"]],
    ["Hatıra",["photo","media"]],
    ["Son soru",["funnyAnswer"]]
  ];

  function esc(s){return String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
  function buildReview(){
    const box = document.querySelector("#review-list");
    box.innerHTML = groups.map(([title,keys]) => {
      const rows = keys.map(k => {
        let v = state[k];
        if(Array.isArray(v)) v = v.join(", ");
        if(!v) v = "—";
        return '<div class="review-row"><span>'+esc(labels[k])+'</span><strong>'+esc(v)+'</strong></div>';
      }).join("");
      return '<section class="review-group"><h3>'+esc(title)+'</h3>'+rows+'</section>';
    }).join("");
  }

  function save(){
    const record = {...state, createdAt:new Date().toISOString()};
    const key = "bebegimin_cinsiyeti_full_form";
    let list=[];
    try{ list=JSON.parse(localStorage.getItem(key)||"[]"); if(!Array.isArray(list)) list=[]; }catch(e){list=[];}
    list.push(record);
    localStorage.setItem(key,JSON.stringify(list));
    document.querySelector("#success-name").textContent = state.name || "";
    document.querySelector("#success-gender").textContent = state.gender || "";
    document.querySelector("#success-date").textContent = new Intl.DateTimeFormat("tr-TR",{dateStyle:"long",timeStyle:"short"}).format(new Date());
    show("success");
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-action]");
    if(!a) return;
    const action = a.dataset.action;
    if(action==="start") show("identity");
    if(action==="back"){
      const i=order.indexOf(current);
      if(i>0) show(order[i-1]);
    }
    if(action==="submit") save();
    if(action==="restart"){
      document.querySelectorAll("form").forEach(f=>f.reset());
      Object.keys(state).forEach(k=>delete state[k]);
      show("intro");
    }
  });
})();