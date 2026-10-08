
import {writeFile,readFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
const account=process.env.CLOUDFLARE_ACCOUNT_ID,secret=process.env.CLOUDFLARE_API_TOKEN;
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
if(process.env.CLOUDFLARE_EMAIL_FROM){
 config.vars.EMAIL_FROM=process.env.CLOUDFLARE_EMAIL_FROM;
 config.send_email=[{name:"EMAIL",allowed_destination_addresses:["naimegunduz75@gmail.com","serhan.narli@gmail.com"]}];
}
await writeFile("wrangler.generated.json",JSON.stringify(config,null,2));
execFileSync("npx",["--yes","wrangler@4.102.0","d1","execute",databaseName,"--remote","--file","cloudflare/schema.sql","--config","wrangler.generated.json"],{stdio:"inherit"});
const output=execFileSync("npx",["--yes","wrangler@4.102.0","deploy","--config","wrangler.generated.json"],{encoding:"utf8"});
const url=output.match(/https:\/\/bebegimin-cinsiyeti-api\.[a-zA-Z0-9-]+\.workers\.dev/);
if(!url)throw new Error("Cloudflare did not return the deployment URL.");
const apiUrl=url[0]+"/api";
const response=await fetch(apiUrl+"?action=health");const health=await response.json();
if(!response.ok||health.provider!=="cloudflare"||health.ok!==true)throw new Error("Cloudflare deployment health check failed.");
await mkdir("publish",{recursive:true});
const paths=[".nojekyll","index.html","style.css","app.js","api.js","admin.html","admin.css","admin.js","sonuclar.html","sonuclar.css","sonuclar.js","sonuclar-yenile.js","yonetim.html"];
for(const path of paths){
 let content=await readFile(path);
 if(path==="yonetim.html"){
  content=Buffer.from(content.toString().replace(/href="https:\/\/(docs|drive)\.google\.com[^"]*"/g,'href="./admin.html"').replace(/\(Google hesabıyla\)/g,"").replace(/Google tablosu/g,"Yönetim ekranı").replace(/Google tablosuna/g,"Yönetim ekranına"));
 }
 await writeFile("publish/"+path,content);
}
await writeFile("publish/config.js","window.BABY_APP_CONFIG = "+JSON.stringify({provider:"cloudflare",apiUrl})+";\n");
console.log("Verified deployment: "+url[0]);
