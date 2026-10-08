
import {writeFile,readFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {pbkdf2Sync,randomBytes,randomUUID} from "node:crypto";
const account=process.env.CLOUDFLARE_ACCOUNT_ID,secret=process.env.CLOUDFLARE_API_TOKEN;
const password=process.env.BABY_ADMIN_PASSWORD||"";
if(password.length<8||password.length>256)throw new Error("Add BABY_ADMIN_PASSWORD (8-256 characters) to GitHub Actions encrypted secrets.");
if(!account||!secret)throw new Error("Cloudflare connection required: add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to GitHub Actions secrets.");
const apiBase="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account);
async function api(path,method="GET",body){
  const response=await fetch(apiBase+path,{method,headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok||!data.success)throw new Error("Cloudflare resource operation failed ("+response.status+"): "+path);
  return data.result;
}
const databaseName="bebegimin-cinsiyeti",bucketName="bebegimin-cinsiyeti-hatiralar";
let database;
for(let page=1;page<=20;page++){
  const rows=await api("/d1/database?per_page=100&page="+page);
  database=rows.find(row=>row.name===databaseName);
  if(database||rows.length<100)break;
}
if(!database)database=await api("/d1/database","POST",{name:databaseName});
const bucketResult=await api("/r2/buckets?per_page=1000&name_contains="+encodeURIComponent(bucketName));
const bucket=(bucketResult.buckets||[]).find(row=>row.name===bucketName);
if(!bucket)await api("/r2/buckets","POST",{name:bucketName});
const config={name:"bebegimin-cinsiyeti-api",main:"cloudflare/worker.mjs",account_id:account,
  compatibility_date:"2026-10-01",workers_dev:true,
  d1_databases:[{binding:"DB",database_name:databaseName,database_id:database.uuid}],
  r2_buckets:[{binding:"MEDIA",bucket_name:bucketName}],
  vars:{SITE_ORIGIN:"https://deapresearchernn.github.io"},
  triggers:{crons:["0 3 * * *"]}};
await writeFile("wrangler.generated.json",JSON.stringify(config,null,2));
execFileSync("npx",["--yes","wrangler@4.102.0","d1","execute",databaseName,"--remote","--file","cloudflare/schema.sql","--config","wrangler.generated.json"],{stdio:"inherit"});
const output=execFileSync("npx",["--yes","wrangler@4.102.0","deploy","--config","wrangler.generated.json"],{encoding:"utf8"});
const salt=randomBytes(16).toString("hex");
const digest=pbkdf2Sync(password,Buffer.from(salt,"hex"),100000,32,"sha256").toString("hex");
const passwordHash="pbkdf2-sha256$100000$"+salt+"$"+digest;
execFileSync("npx",["--yes","wrangler@4.102.0","secret","put","ADMIN_PASSWORD_HASH","--config","wrangler.generated.json"],{input:passwordHash+"\n",stdio:["pipe","inherit","inherit"]});
const url=output.match(/https:\/\/bebegimin-cinsiyeti-api\.[a-zA-Z0-9-]+\.workers\.dev/);
if(!url)throw new Error("Cloudflare did not return the deployment URL.");
const apiUrl=url[0]+"/api";
console.log("Cloudflare service created: "+url[0]);
let ready=false,lastStatus="network";
for(let attempt=0;attempt<30;attempt++){
  try{
    const response=await fetch(apiUrl+"?action=health",{signal:AbortSignal.timeout(10000)});
    lastStatus=String(response.status);
    const health=await response.json();
    if(response.ok&&health.provider==="cloudflare"&&health.ok===true&&health.adminReady===true){ready=true;break;}
  }catch(ignored){}
  await new Promise(resolve=>setTimeout(resolve,2000));
}
if(!ready)throw new Error("Cloudflare deployment health check failed after propagation wait (HTTP "+lastStatus+").");
async function call(payload){
  const response=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Origin:config.vars.SITE_ORIGIN},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||data.ok!==true)throw new Error("Live API verification failed: "+payload.action+" (HTTP "+response.status+").");
  return data;
}
const login=await call({action:"adminLogin",password});
const adminToken=login.adminToken;
const checkId=randomUUID(),checkName="TEST - Deployment "+checkId;
const checkRelation="Deployment (TEST)",requestId="req_"+checkId;
let checkParticipant;
try{
  const list=await call({action:"adminList",adminToken});
  const publicResponse=await fetch(apiUrl+"?action=publicResults",{headers:{Origin:config.vars.SITE_ORIGIN}});
  const publicData=await publicResponse.json();
  if(!publicResponse.ok||publicData.ok!==true||publicData.responses.some(row=>row.shortNote||row.photoUrl||row.mediaUrl))throw new Error("Live anonymous results verification failed.");
  if(list.settings.FORM_ACIK==="TRUE"){
    checkParticipant=(await call({action:"adminAddParticipant",adminToken,name:checkName,relation:checkRelation})).participantId;
    const photo=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO7sAAAAASUVORK5CYII=","base64");
    const send=async()=>{
      const form=new FormData();
      for(const [key,value] of Object.entries({action:"submit",requestId,name:checkName,relation:checkRelation,gender:"👧 Kız",firstGuess:"Hiç tahminim olmadı",shortNote:"Deployment verification"}))form.set(key,value);
      form.set("photo",new File([photo],"verification.png",{type:"image/png"}));
      const response=await fetch(apiUrl,{method:"POST",headers:{Origin:config.vars.SITE_ORIGIN},body:form,signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok||!data.saved)throw new Error("Live multipart submission verification failed.");
      return data;
    };
    const saved=await send(),repeated=await send();
    if(saved.recordId!==repeated.recordId)throw new Error("Live duplicate submission verification failed.");
    const records=await call({action:"adminList",adminToken});
    if(records.responses.filter(row=>row.recordId===saved.recordId).length!==1)throw new Error("Live durable storage verification failed.");
    const media=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Origin:config.vars.SITE_ORIGIN},body:JSON.stringify({action:"adminMedia",adminToken,recordId:saved.recordId,kind:"photo"})});
    if(!media.ok||!photo.equals(Buffer.from(await media.arrayBuffer())))throw new Error("Live private file verification failed.");
    const denied=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"adminMedia",recordId:saved.recordId,kind:"photo"})});
    if(denied.status!==401)throw new Error("Live private file authorization verification failed.");
    console.log("Live checks passed: password login, D1 submission, duplicate prevention, private R2 upload/download and anonymous results.");
  }else console.log("Live checks passed: password login and anonymous results; submission skipped because the form is closed.");
}finally{
  // Only this run's randomly named verification record and object are removed.
  const rows=await api("/d1/database/"+database.uuid+"/query","POST",{sql:"SELECT id,photo_key FROM responses WHERE request_id=?",params:[requestId]});
  for(const row of rows[0]?.results||[]){
    if(row.photo_key)execFileSync("npx",["--yes","wrangler@4.102.0","r2","object","delete",bucketName+"/"+row.photo_key,"--remote","--force","--config","wrangler.generated.json"],{stdio:"inherit"});
  }
  await api("/d1/database/"+database.uuid+"/query","POST",{sql:"DELETE FROM responses WHERE request_id=?",params:[requestId]});
  if(checkParticipant)await api("/d1/database/"+database.uuid+"/query","POST",{sql:"DELETE FROM participants WHERE id=? AND name=?",params:[checkParticipant,checkName]});
  await call({action:"logoutAdmin",adminToken});
}
await mkdir("publish",{recursive:true});
const paths=[".nojekyll","index.html","style.css","app.js","api.js","admin.html","admin.css","admin.js","sonuclar.html","sonuclar.css","sonuclar.js","sonuclar-yenile.js","yonetim.html","bebekler.css","bebekler.js","baby-girl-crawl.webp","baby-boy-crawl.webp","hero-mascot.webp"];
for(const path of paths)await writeFile("publish/"+path,await readFile(path));
await writeFile("publish/config.js","window.BABY_APP_CONFIG = "+JSON.stringify({provider:"cloudflare",apiUrl})+";\n");
console.log("Verified deployment: "+url[0]);
