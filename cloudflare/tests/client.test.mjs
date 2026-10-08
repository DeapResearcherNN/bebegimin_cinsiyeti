
import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../../api.js",import.meta.url),"utf8");
function harness(fetcher){
 const timers=new Set();
 const ctx={BABY_APP_CONFIG:{provider:"cloudflare",apiUrl:"https://family.example/api"},
  URL,URLSearchParams,AbortController,FormData,File,Uint8Array,atob,crypto,
  document:{createElement(){return {};}},
  setTimeout(fn,ms){const t=setTimeout(fn,ms);timers.add(t);return t;},clearTimeout(t){clearTimeout(t);timers.delete(t);},
  fetch:fetcher};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 return {api:ctx.BabyApi,close(){for(const t of timers)clearTimeout(t);}};
}
const success=data=>new Response(JSON.stringify({ok:true,...data}),{headers:{"Content-Type":"application/json"}});
test("Cloudflare adapter makes a direct JSON health request without scripts or cookies",async()=>{
 let called=0;const h=harness(async(url,opts)=>{called++;assert.equal(url.searchParams.get("action"),"health");assert.equal(opts.credentials,"omit");return success({provider:"cloudflare"});});
 try{assert.equal((await h.api.checkHealth()).provider,"cloudflare");assert.equal(called,1);}finally{h.close();}
});
test("Cloudflare adapter sends real multipart binary files in one POST",async()=>{
 let called=0;const h=harness(async(url,opts)=>{
  called++;assert.equal(opts.method,"POST");assert.equal(opts.body.get("requestId"),"req_12345678901234567890");
  const photo=opts.body.get("photo");assert.equal(photo.type,"image/png");assert.equal(photo.size,3);
  assert.equal(opts.body.has("photoData"),false);return success({saved:true});
 });
 try{assert.equal((await h.api.submit({action:"submit",name:"TEST",photoData:"data:image/png;base64,AQID",photoMime:"image/png",photoName:"family.png"},"req_12345678901234567890")).saved,true);assert.equal(called,1);}finally{h.close();}
});
test("Cloudflare adapter reports a server rejection without automatic duplicate writes",async()=>{
 let called=0;const h=harness(async()=>{called++;return new Response(JSON.stringify({ok:false,error:"Form kapalı."}),{status:400,headers:{"Content-Type":"application/json"}});});
 try{await assert.rejects(h.api.submit({action:"submit"},"req_12345678901234567890"),/Form kapalı/);assert.equal(called,1);}finally{h.close();}
});
test("Cloudflare adapter checks a receipt after the POST response is lost",async()=>{
 let posts=0,reads=0;const h=harness(async(url,opts)=>{
  if(opts.method==="POST"){posts++;throw Error("lost reply");}
  reads++;assert.equal(url.searchParams.get("action"),"submissionReceipt");return success({saved:true});
 });
 try{assert.equal((await h.api.submit({action:"submit"},"req_12345678901234567890")).saved,true);assert.equal(posts,1);assert.equal(reads,1);}finally{h.close();}
});
