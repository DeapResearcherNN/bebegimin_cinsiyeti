

const FIRST = ["İlk andan beri kız","İlk andan beri erkek","Önce kız düşündüm, sonra fikrim değişti","Önce erkek düşündüm, sonra fikrim değişti","Hiç tahminim olmadı"];
const RECEIPT = /^req_[A-Za-z0-9_-]{18,100}$/;
const clean = value => String(value ?? "").trim();
const normalize = value => clean(value).toLocaleLowerCase("tr-TR").replace(/\s+/g," ");
const id = () => crypto.randomUUID();
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");
export async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,"0")).join("");
}
class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function fail(message,status=400){throw new ApiError(message,status);}
const first = (env,sql,...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env,sql,...args) => env.DB.prepare(sql).bind(...args).run();
const all = async (env,sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
async function throttle(env,key,limit,seconds){
  const window=Math.floor(Date.now()/(seconds*1000));
  const row=await first(env,"INSERT INTO throttle(key,window,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window,expires_at=excluded.expires_at RETURNING count",key,window,(window+1)*seconds*1000);
  if(row.count>limit)fail("Çok sık deneme yapıldı. Biraz sonra tekrar dene.",429);
}
async function settings(env){
  const rows=await all(env,"SELECT key,value FROM settings");
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}
async function receipt(env,requestId){
  if(!RECEIPT.test(requestId))fail("Geçersiz kayıt anahtarı.");
  const r=await first(env,"SELECT id,submitted_at FROM responses WHERE request_id=?",requestId);
  return r?{ok:true,saved:true,recordId:r.id,submittedAt:r.submitted_at}:{ok:true,saved:false};
}
export function validate(p){
  const name=clean(p.name),relation=clean(p.relation),gender=clean(p.gender),firstGuess=clean(p.firstGuess),shortNote=clean(p.shortNote);
  if(!name||name.length>80||!relation||relation.length>80)fail("Ad ve yakınlık bilgisi zorunlu; en fazla 80 karakter olabilir.");
  if(!["👧 Kız","👦 Erkek"].includes(gender)||!FIRST.includes(firstGuess))fail("Tahmin seçeneklerinden birini seç.");
  if(shortNote.length>800)fail("Mesaj en fazla 800 karakter olabilir.");
  if(!RECEIPT.test(clean(p.requestId)))fail("Geçersiz kayıt anahtarı.");
  return {name,relation,gender,firstGuess,shortNote};
}
function validFile(file,kind){
  if(!file||typeof file.arrayBuffer!=="function"||!file.size)return null;
  const limit=(kind==="photo"?8:20)*1024*1024;
  if(file.size>limit)fail("Dosya boyutu sınırı aşıldı.",413);
  const allowed=kind==="photo"?/^image\/(jpeg|png|gif|webp|avif|heic|heif)$/i:/^(video|audio)\/[a-z0-9.+-]+$/i;
  if(!allowed.test(file.type))fail("Desteklenmeyen dosya türü.");
  return file;
}
async function submit(env,p,uploads){
  const v=validate(p),requestId=clean(p.requestId);
  const previous=await receipt(env,requestId);
  if(previous.saved)return previous;
  if(!v.shortNote)fail("Bebeğimize bir anı notu yazmalısın.");
  const config=await settings(env);
  if(config.FORM_ACIK!=="TRUE")fail("Form şu anda yeni cevap kabul etmiyor.");
  const identity=await hash(normalize(v.name)+"\0"+normalize(v.relation));
  const person=await first(env,"SELECT * FROM participants WHERE identity=?",identity);
  if(person&&person.active===0)fail("Bu katılımcı için form kapalı.");
  if(!person&&config.KATILIMCI_LISTESI_ZORUNLU==="TRUE")fail("Bu kişi katılımcı listesinde bulunamadı.");
  if(person&&await first(env,"SELECT id FROM responses WHERE participant_id=?",person.id))fail("Bu kişi daha önce cevap gönderdi. Cevap değiştirilemez.",409);
  const recordId=id(),personId=person?.id||id(),submittedAt=new Date().toISOString();
  const photo=validFile(uploads?.photo,"photo"),media=validFile(uploads?.media,"media");
  if(!photo)fail("Göndermek için bir fotoğraf yüklemeli veya çekmelisin.");
  const keys=[];
  try {
    for(const [kind,file] of [["photo",photo],["media",media]]){
      if(!file)continue;
      const key=recordId+"/"+kind;
      await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{originalName:clean(file.name).slice(0,120)}});
      keys.push(key);
    }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO participants(id,identity,name,relation,active) VALUES(?,?,?,?,1) ON CONFLICT(identity) DO NOTHING").bind(personId,identity,v.name,v.relation),
      env.DB.prepare("INSERT INTO responses(id,request_id,participant_id,gender,first_guess,short_note,photo_key,media_key,submitted_at) SELECT ?,?,id,?,?,?,?,?,? FROM participants WHERE identity=?").bind(recordId,requestId,v.gender,v.firstGuess,v.shortNote,photo?recordId+"/photo":"",media?recordId+"/media":"",submittedAt,identity)
    ]);
  }catch(error){
    for(const key of keys){try{await env.MEDIA.delete(key);}catch(ignored){}}
    const raced=await receipt(env,requestId);
    if(raced.saved)return raced;
    if(await first(env,"SELECT id FROM responses WHERE participant_id IN (SELECT id FROM participants WHERE identity=?)",identity))fail("Bu kişi daha önce cevap gönderdi. Cevap değiştirilemez.",409);
    throw error;
  }
  return {ok:true,saved:true,recordId,submittedAt,message:"Tahminin kaydedildi ve artık değiştirilemez."};
}
const isTest = (name,relation) => /^TEST(?:\b|\s*[-:])/i.test(clean(name))||/\(TEST\)/i.test(clean(relation));
function publicRelation(value){
  const r=normalize(value);
  for(const word of ["anneanne","babaanne","teyze","dayı","hala","amca","dede","kuzen","abla","abi"]){
    if(r.includes(word))return word.charAt(0).toLocaleUpperCase("tr-TR")+word.slice(1);
  }
  return "Aile / arkadaş";
}
async function publicResults(env){
  const records=await all(env,"SELECT r.*,p.name,p.relation FROM responses r JOIN participants p ON p.id=r.participant_id ORDER BY r.submitted_at,r.id");
  let real=0,test=0;
  const responses=records.map((r,index)=>{
    const t=isTest(r.name,r.relation);
    return {name:t?"TEST - Deneme "+(++test):"Katılımcı "+(++real),sequence:index+1,relation:t?"Deneme (TEST)":publicRelation(r.relation),gender:r.gender,firstGuess:r.first_guess,shortNote:"",hasNote:!!r.short_note,hasPhoto:!!r.photo_key,hasMedia:!!r.media_key,photoUrl:"",mediaUrl:"",submittedAt:"",isTest:t};
  });
  const people=await all(env,"SELECT p.name,p.relation,EXISTS(SELECT 1 FROM responses r WHERE r.participant_id=p.id) AS answered FROM participants p WHERE p.active=1 ORDER BY p.id");
  return {ok:true,service:"baby-family-api",publicVersion:"anonymous-v1",responses,participants:people.map((p,i)=>({name:"Katılımcı "+(i+1),relation:"Aile / arkadaş",answered:!!p.answered,isTest:isTest(p.name,p.relation)})),updatedAt:new Date().toISOString()};
}

export async function passwordHash(password,salt){
  const bytes=new Uint8Array(salt.match(/.{2}/g).map(byte=>parseInt(byte,16)));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:bytes,iterations:100000},key,256);
  return Array.from(new Uint8Array(bits),v=>v.toString(16).padStart(2,"0")).join("");
}
async function adminLogin(env,p,ip){
  if(!env.ADMIN_PASSWORD_HASH)fail("Yönetici şifresi henüz yapılandırılmadı.",503);
  await throttle(env,"login:"+await hash(ip),5,900);
  const password=String(p.password||"");
  if(password.length<8||password.length>256)fail("Yönetici şifresi yanlış.",401);
  const parts=env.ADMIN_PASSWORD_HASH.split("$");
  if(parts.length!==4||parts[0]!=="pbkdf2-sha256"||parts[1]!=="100000"||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))fail("Yönetici şifresi yapılandırması geçersiz.",503);
  const actual=await passwordHash(password,parts[2]);
  let different=0;for(let i=0;i<actual.length;i++)different|=actual.charCodeAt(i)^parts[3].charCodeAt(i);
  if(different)fail("Yönetici şifresi yanlış.",401);
  const adminToken=token();
  await run(env,"INSERT INTO sessions(token_hash,role,expires_at) VALUES(?,?,?)",await hash(adminToken),"admin",Date.now()+21600000);
  return {ok:true,adminToken};
}
async function session(env,value){
  if(!/^[a-f0-9]{64}$/.test(clean(value)))fail("Yönetici girişi gerekli.",401);
  const r=await first(env,"SELECT role FROM sessions WHERE token_hash=? AND expires_at>?",await hash(value),Date.now());
  if(!r||r.role!=="admin")fail("Oturumun süresi dolmuş. Yeniden giriş yap.",401);
  return r.role;
}
async function adminList(env){
  const rows=await all(env,"SELECT r.*,p.name,p.relation FROM responses r JOIN participants p ON p.id=r.participant_id ORDER BY r.submitted_at DESC");
  const people=await all(env,"SELECT p.*,EXISTS(SELECT 1 FROM responses r WHERE r.participant_id=p.id) AS answered FROM participants p ORDER BY p.name");
  return {ok:true,responses:rows.map(r=>({recordId:r.id,name:r.name,relation:r.relation,gender:r.gender,firstGuess:r.first_guess,shortNote:r.short_note,hasPhoto:!!r.photo_key,hasMedia:!!r.media_key,submittedAt:r.submitted_at,locked:true})),participants:people.map(p=>({id:p.id,name:p.name,relation:p.relation,active:!!p.active,answered:!!p.answered})),settings:await settings(env)};
}
async function action(env,p,uploads,ip){
  switch(p.action){
    case "submit":return submit(env,p,uploads);
    case "adminLogin":return adminLogin(env,p,ip);
  }
  await session(env,p.adminToken);
  if(p.action==="adminList")return adminList(env);
  if(p.action==="logoutAdmin"){await run(env,"DELETE FROM sessions WHERE token_hash=?",await hash(p.adminToken));return {ok:true};}
  if(p.action==="adminAddParticipant"){
    const name=clean(p.name),relation=clean(p.relation);
    if(!name||name.length>80||!relation||relation.length>80)fail("Ad ve yakınlık zorunlu.");
    const identity=await hash(normalize(name)+"\0"+normalize(relation));
    if(await first(env,"SELECT id FROM participants WHERE identity=?",identity))fail("Bu kişi zaten listede.");
    const participantId=id();
    await run(env,"INSERT INTO participants(id,identity,name,relation,active) VALUES(?,?,?,?,1)",participantId,identity,name,relation);
    return {ok:true,participantId};
  }
  if(p.action==="adminSetSetting"){
    const key=clean(p.key),value=clean(p.value);
    if(!["FORM_ACIK","CANLI_ACIKLAMA_MODU","ETKINLIK_TARIHI","KATILIMCI_LISTESI_ZORUNLU"].includes(key)||value.length>100)fail("Geçersiz ayar.");
    if(key!=="ETKINLIK_TARIHI"&&!["TRUE","FALSE"].includes(value))fail("Geçersiz ayar değeri.");
    await run(env,"INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key,value);
    return {ok:true,message:"Ayar kaydedildi."};
  }
  if(p.action==="adminMedia"){
    if(!["photo","media"].includes(p.kind))fail("Geçersiz dosya türü.");
    const row=await first(env,"SELECT photo_key,media_key FROM responses WHERE id=?",clean(p.recordId));
    const key=row?.[p.kind+"_key"];
    if(!key)fail("Dosya bulunamadı.",404);
    const obj=await env.MEDIA.get(key);
    if(!obj)fail("Dosya bulunamadı.",404);
    return new Response(obj.body,{headers:{"Content-Type":obj.httpMetadata?.contentType||"application/octet-stream","Content-Disposition":'attachment; filename="'+p.kind+'-hatira"',"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
  fail("Bilinmeyen işlem.",404);
}
export default {
  async fetch(request,env){
    const origin=request.headers.get("Origin"),allowed=env.SITE_ORIGIN||"https://deapresearchernn.github.io";
    const cors={"Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json;charset=utf-8"}});
    try {
      if(origin&&origin!==allowed)fail("Bu kaynaktan erişime izin verilmiyor.",403);
      if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
      const url=new URL(request.url);
      if(url.pathname!=="/api")fail("Bulunamadı.",404);
      if(request.method==="GET"){
        const act=url.searchParams.get("action")||"health";
        if(act==="health")return json({ok:true,service:"baby-family-api",provider:"cloudflare",authVersion:"shared-password-v1",publicVersion:"anonymous-v1",adminReady:!!env.ADMIN_PASSWORD_HASH});
        if(act==="publicResults")return json(await publicResults(env));
        if(act==="submissionReceipt")return json(await receipt(env,clean(url.searchParams.get("requestId"))));
        fail("Bilinmeyen işlem.",404);
      }
      if(request.method!=="POST")fail("Yöntem desteklenmiyor.",405);
      if(Number(request.headers.get("Content-Length"))>30*1024*1024)fail("Dosyalar çok büyük.",413);
      const ct=request.headers.get("Content-Type")||"";
      let p,uploads;
      if(ct.startsWith("multipart/form-data")){
        const fd=await request.formData();p={};for(const [key,value] of fd){if(typeof value==="string")p[key]=value;}uploads={photo:fd.get("photo"),media:fd.get("media")};
      }else if(ct.startsWith("application/json")){
        if(Number(request.headers.get("Content-Length"))>8192)fail("İstek çok büyük.",413);
        const text=await request.text();if(text.length>8192)fail("İstek çok büyük.",413);p=JSON.parse(text);
      }else fail("Geçersiz içerik türü.",415);
      const ip=request.headers.get("CF-Connecting-IP")||"unknown";
      if(["submit","adminLogin"].includes(p.action))await throttle(env,"ip:"+await hash(ip),30,600);
      const result=await action(env,p,uploads,ip);
      if(result instanceof Response){for(const [k,v] of Object.entries(cors))result.headers.set(k,v);return result;}
      return json(result);
    }catch(error){
      const known=error instanceof ApiError;
      if(!known)console.error("family-api",error?.name||"Error");
      return json({ok:false,error:known?error.message:"Sunucu işlemi tamamlayamadı. Aynı cevaplarla tekrar deneyebilirsin."},known?error.status:500);
    }
  },
  async scheduled(event,env){
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
      env.DB.prepare("DELETE FROM throttle WHERE expires_at<?").bind(now)
    ]);
  }
};
