
(() => {
  "use strict";
  const $=selector=>document.querySelector(selector);
  const SESSION_KEY="bebegimin_cinsiyeti_admin_session";
  let adminToken="";
  try{adminToken=sessionStorage.getItem(SESSION_KEY)||"";}catch(ignored){}
  const post=fields=>window.BabyApi.post(fields);
  function clearSession(){adminToken="";try{sessionStorage.removeItem(SESSION_KEY);}catch(ignored){}}
  function showLogin(message=""){$("#dashboard").hidden=true;$("#admin-login").hidden=false;$("#login-status").textContent=message;}
  function render(data){
    const responses=data.responses||[],participants=data.participants||[];
    for(const [selector,value]of [
      ["#stat-total",responses.length],
      ["#stat-girl",responses.filter(r=>String(r.gender).includes("Kız")).length],
      ["#stat-boy",responses.filter(r=>String(r.gender).includes("Erkek")).length],
      ["#stat-pending",participants.filter(p=>p.active&&!p.answered).length]
    ])$(selector).textContent=String(value);
    $("#participant-list").replaceChildren();
    for(const p of participants){
      const span=document.createElement("span");span.className="participant-chip"+(p.answered?" done":"");
      span.textContent=p.name+" · "+p.relation+(p.answered?" ✓":"");$("#participant-list").append(span);
    }
    $("#response-body").replaceChildren();
    for(const r of responses){
      const tr=document.createElement("tr");
      for(const value of [r.name,r.relation,r.gender,r.firstGuess,r.shortNote||"—"]){
        const td=document.createElement("td");td.textContent=value||"—";tr.append(td);
      }
      for(const kind of ["photo","media"]){
        const td=document.createElement("td");
        if(kind==="photo"?r.hasPhoto:r.hasMedia){
          const button=document.createElement("button");button.type="button";
          button.textContent=kind==="photo"?"Fotoğrafı indir":"Dosyayı indir";
          button.addEventListener("click",async()=>{
            button.disabled=true;
            try{await window.BabyApi.openMedia(r.recordId,kind,adminToken);}
            catch(error){$("#settings-status").textContent=error.message;}
            finally{button.disabled=false;}
          });td.append(button);
        }else td.textContent="—";
        tr.append(td);
      }
      const time=document.createElement("td"),date=new Date(r.submittedAt);
      time.textContent=Number.isFinite(date.getTime())?new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(date):"—";
      tr.append(time);$("#response-body").append(tr);
    }
  }
  let dashboardLoading=false;
  async function loadDashboard(){
    if(dashboardLoading||!adminToken)return;
    dashboardLoading=true;
    const requestedToken=adminToken;
    try{
      const data=await post({action:"adminList",adminToken:requestedToken});
      if(adminToken!==requestedToken)return;
      render(data);
      $("#admin-login").hidden=true;$("#dashboard").hidden=false;$("#login-status").textContent="";
      $("#refresh-status").textContent="Son kontrol: "+new Intl.DateTimeFormat("tr-TR",{timeStyle:"short"}).format(new Date())+" · Yeni cevaplar otomatik güncellenir.";
    }finally{dashboardLoading=false;}
  }
  async function refreshDashboard(){
    if(!adminToken||document.hidden||$("#dashboard").hidden)return;
    try{await loadDashboard();}catch(error){
      $("#refresh-status").textContent="Güncelleme yapılamadı: "+error.message+" Tekrar denenecek.";
      if(/oturum|giriş/i.test(error.message)){clearSession();showLogin(error.message);}
    }
  }
  setInterval(refreshDashboard,15000);
  window.addEventListener("focus",refreshDashboard);
  document.addEventListener("visibilitychange",refreshDashboard);
  window.addEventListener("storage",event=>{if(event.key==="baby_results_changed_at")refreshDashboard();});
  $("#admin-password-form").addEventListener("submit",async event=>{
    event.preventDefault();const button=$("#admin-login-btn");if(button.disabled)return;
    button.disabled=true;$("#login-status").textContent="Giriş yapılıyor…";
    try{
      const result=await post({action:"adminLogin",password:$("#admin-password").value});
      $("#admin-password").value="";adminToken=result.adminToken;
      try{sessionStorage.setItem(SESSION_KEY,adminToken);}catch(ignored){}
      await loadDashboard();
    }catch(error){clearSession();showLogin(error.message||"Giriş yapılamadı.");}
    finally{button.disabled=false;}
  });
  $("#logout-btn").addEventListener("click",async()=>{
    const previous=adminToken;clearSession();showLogin("Çıkış yapıldı.");
    try{await post({action:"logoutAdmin",adminToken:previous});}catch(ignored){}
  });
  $("#refresh-btn").addEventListener("click",async()=>{
    const button=$("#refresh-btn");button.disabled=true;
    try{await loadDashboard();}catch(error){
      $("#settings-status").textContent=error.message;
      if(/oturum|giriş/i.test(error.message)){clearSession();showLogin(error.message);}
    }finally{button.disabled=false;}
  });
  $("#participant-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");if(button.disabled)return;
    button.disabled=true;
    try{
      const fd=new FormData(form);
      await post({action:"adminAddParticipant",adminToken,name:fd.get("name"),relation:fd.get("relation")});
      form.reset();await loadDashboard();$("#settings-status").textContent="Katılımcı eklendi.";
    }catch(error){$("#settings-status").textContent=error.message;}
    finally{button.disabled=false;}
  });
  document.querySelectorAll(".setting-btn").forEach(button=>button.addEventListener("click",async()=>{
    button.disabled=true;
    try{
      const result=await post({action:"adminSetSetting",adminToken,key:button.dataset.key,value:button.dataset.value});
      await loadDashboard();$("#settings-status").textContent=result.message;
    }catch(error){$("#settings-status").textContent=error.message;}
    finally{button.disabled=false;}
  }));
  window.BabyApi.checkHealth().then(async data=>{
    if(!data.adminReady)throw new Error("Yönetici şifresi henüz yapılandırılmadı.");
    if(adminToken)await loadDashboard();
  }).catch(error=>{clearSession();showLogin(error.message);});
})();
