(() => {
  const state = {};
  const screens = [...document.querySelectorAll(".screen")];
  const form = document.querySelector("#family-form");

  function show(step){
    screens.forEach(s => s.classList.toggle("active", s.dataset.step === step));
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function collect(){
    const data = new FormData(form);

    for(const [key,val] of data.entries()){
      if(val instanceof File){
        if(val.name) state[key] = val.name;
      } else {
        state[key] = val;
      }
    }
  }

  form.addEventListener("submit", e => {
    e.preventDefault();

    if(!form.reportValidity()) return;

    collect();

    const record = {
      name: state.name || "",
      relation: state.relation || "",
      gender: state.gender || "",
      firstGuess: state.firstGuess || "",
      photo: state.photo || "",
      media: state.media || "",
      createdAt: new Date().toISOString()
    };

    const key = "bebegimin_cinsiyeti_form_v2";
    let list = [];

    try{
      list = JSON.parse(localStorage.getItem(key) || "[]");
      if(!Array.isArray(list)) list = [];
    }catch(e){
      list = [];
    }

    list.push(record);
    localStorage.setItem(key, JSON.stringify(list));

    document.querySelector("#success-name").textContent = record.name;
    document.querySelector("#success-gender").textContent = record.gender;
    document.querySelector("#success-date").textContent =
      new Intl.DateTimeFormat("tr-TR", {
        dateStyle:"long",
        timeStyle:"short"
      }).format(new Date());

    show("success");
  });

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if(!btn) return;

    const action = btn.dataset.action;

    if(action === "start") show("form");
    if(action === "back") show("intro");

    if(action === "restart"){
      form.reset();
      Object.keys(state).forEach(k => delete state[k]);
      show("intro");
    }
  });
})();