
import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../worker.mjs";
import {pbkdf2Sync} from "node:crypto";

function harness(){
  const db=new DatabaseSync(":memory:");db.exec(readFileSync(new URL("../schema.sql",import.meta.url),"utf8"));
  const objects=new Map();
  const statement=(sql,args=[])=>({
    sql,args,bind(...values){return statement(sql,values);},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){return db.prepare(sql).run(...args);}
  });
  const salt="00112233445566778899aabbccddeeff";
  const digest=pbkdf2Sync("test-password",Buffer.from(salt,"hex"),100000,32,"sha256").toString("hex");
  const env={SITE_ORIGIN:"https://deapresearchernn.github.io",ADMIN_PASSWORD_HASH:"pbkdf2-sha256$100000$"+salt+"$"+digest,
    DB:{prepare:statement,async batch(statements){
      db.exec("BEGIN");
      try{const results=statements.map(s=>db.prepare(s.sql).run(...s.args));db.exec("COMMIT");return results;}
      catch(e){db.exec("ROLLBACK");throw e;}
    }},
    MEDIA:{async put(key,stream,metadata){objects.set(key,{bytes:await new Response(stream).arrayBuffer(),...metadata});},
      async delete(key){objects.delete(key);},async get(key){const obj=objects.get(key);return obj?{body:obj.bytes,httpMetadata:obj.httpMetadata}:null;}}
  };
  async function call(fields,options={}){
    const method=options.method||"POST",url=new URL("https://family.example/api");
    if(method==="GET")Object.entries(fields).forEach(([k,v])=>url.searchParams.set(k,v));
    const request=new Request(url,{method,headers:{Origin:env.SITE_ORIGIN,...(options.body||method==="GET"?{}:{"Content-Type":"application/json"})},
      ...(method==="POST"?{body:options.body||JSON.stringify(fields)}:{})});
    const response=await worker.fetch(request,env);
    const ct=response.headers.get("Content-Type")||"";
    return {status:response.status,data:ct.includes("application/json")?await response.json():await response.arrayBuffer(),headers:response.headers};
  }
  async function submit(fields){
    const fd=new FormData();for(const [key,value] of Object.entries(fields))fd.set(key,value);
    fd.set("photo",new File([new Uint8Array([1,2,3])],"family.png",{type:"image/png"}));
    return call(fields,{body:fd});
  }
  const dispose=()=>db.close();
  return {env,db,objects,call,submit,dispose};
}
const answer={action:"submit",name:"TEST - integration",relation:"Deneme (TEST)",gender:"👧 Kız",firstGuess:"İlk andan beri kız",shortNote:"Private message",requestId:"req_12345678901234567890"};
async function login(h){
  const result=await h.call({action:"adminLogin",password:"test-password"});
  assert.equal(result.status,200);return result.data.adminToken;
}
test("durable save and lost-response receipt are idempotent",async()=>{
 const h=harness();try{
  assert.equal((await h.submit(answer)).data.saved,true);
  assert.equal((await h.call({action:"submissionReceipt",requestId:answer.requestId},{method:"GET"})).data.saved,true);
  await h.submit(answer);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM responses").get().n,1);
  h.db.exec("UPDATE settings SET value='FALSE' WHERE key='FORM_ACIK'");
  assert.equal((await h.submit(answer)).data.saved,true);
 }finally{h.dispose();}
});
test("public results never disclose names, notes, tokens or media keys",async()=>{
 const h=harness();try{
  await h.submit(answer);
  const result=await h.call({action:"publicResults"},{method:"GET"});
  assert.equal(result.data.responses.length,1);
  const json=JSON.stringify(result.data);
  assert.equal(json.includes(answer.name),false);assert.equal(json.includes(answer.shortNote),false);
  assert.equal(json.includes(answer.requestId),false);
  assert.equal(result.data.responses[0].hasNote,true);
  assert.equal((await h.call({action:"adminList"})).status,401);
 }finally{h.dispose();}
});
test("name/relation duplicate, closed form and unlisted participant are rejected",async()=>{
 const h=harness();try{
  await h.submit(answer);
  assert.equal((await h.submit({...answer,requestId:"req_12345678901234567891"})).status,409);
  h.db.exec("UPDATE settings SET value='TRUE' WHERE key='KATILIMCI_LISTESI_ZORUNLU'");
  assert.equal((await h.submit({...answer,name:"Other person",requestId:"req_12345678901234567892"})).status,400);
  h.db.exec("UPDATE settings SET value='FALSE' WHERE key='FORM_ACIK'");
  assert.equal((await h.submit({...answer,name:"Other person",requestId:"req_12345678901234567893"})).status,400);
 }finally{h.dispose();}
});

test("shared password grants an expiring session without email or verification codes",async()=>{
 const h=harness();try{
  assert.equal((await h.call({action:"adminLogin",password:"wrong-password"})).status,401);
  const adminToken=await login(h);
  assert.equal((await h.call({action:"adminList",adminToken})).status,200);
  assert.equal(h.db.prepare("SELECT token_hash FROM sessions").get().token_hash===adminToken,false);
  await h.call({action:"logoutAdmin",adminToken});
  assert.equal((await h.call({action:"adminList",adminToken})).status,401);
 }finally{h.dispose();}
});
test("password login rejects attempts above the rate limit",async()=>{
 const h=harness();try{
  for(let i=0;i<5;i++)assert.equal((await h.call({action:"adminLogin",password:"wrong-password"})).status,401);
  assert.equal((await h.call({action:"adminLogin",password:"test-password"})).status,429);
 }finally{h.dispose();}
});
test("expired sessions cannot read private answers",async()=>{
 const h=harness();try{
  const adminToken=await login(h);h.db.exec("UPDATE sessions SET expires_at=0");
  assert.equal((await h.call({action:"adminList",adminToken})).status,401);
 }finally{h.dispose();}
});
test("photo is private, survives successful save and is available only to admins",async()=>{
 const h=harness();try{
  const fd=new FormData();for(const[k,v]of Object.entries(answer))fd.set(k,v);
  fd.set("photo",new File([new Uint8Array([1,2,3])],"family.png",{type:"image/png"}));
  const result=await h.call(answer,{body:fd});assert.equal(result.data.saved,true);assert.equal(h.objects.size,1);
  const args={action:"adminMedia",recordId:result.data.recordId,kind:"photo"};
  assert.equal((await h.call(args)).status,401);
  const adminToken=await login(h);const file=await h.call({...args,adminToken});
  assert.equal(file.status,200);assert.equal(file.data.byteLength,3);
 }finally{h.dispose();}
});
test("incorrect MIME and disallowed origins cannot write data",async()=>{
 const h=harness();try{
  const fd=new FormData();for(const[k,v]of Object.entries(answer))fd.set(k,v);
  fd.set("photo",new File(["<svg/>"],"bad.svg",{type:"image/svg+xml"}));
  assert.equal((await h.call(answer,{body:fd})).status,400);assert.equal(h.objects.size,0);
  const response=await worker.fetch(new Request("https://family.example/api",{method:"POST",headers:{Origin:"https://evil.example","Content-Type":"application/json"},body:JSON.stringify(answer)}),h.env);
  assert.equal(response.status,403);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM responses").get().n,0);
 }finally{h.dispose();}
});
test("R2 failure does not create a false success or a half-saved database record",async()=>{
 const h=harness();try{
  h.env.MEDIA.put=async()=>{throw Error("simulated storage error");};
  const fd=new FormData();for(const[k,v]of Object.entries(answer))fd.set(k,v);
  fd.set("photo",new File(["test"],"family.png",{type:"image/png"}));
  assert.equal((await h.call(answer,{body:fd})).status,500);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM responses").get().n,0);
 }finally{h.dispose();}
});

test("different people from the same browser/IP each have a durable independent receipt",async()=>{
 const h=harness();try{
  const first=await h.submit({...answer,name:"TEST - First visitor"});
  const secondId="req_12345678901234567891";
  const second=await h.submit({...answer,name:"TEST - Second visitor",requestId:secondId});
  assert.equal(first.data.saved,true);assert.equal(second.data.saved,true);
  assert.notEqual(first.data.recordId,second.data.recordId);
  for(const [requestId,recordId] of [[answer.requestId,first.data.recordId],[secondId,second.data.recordId]]){
   const read=await h.call({action:"submissionReceipt",requestId},{method:"GET"});
   assert.equal(read.data.recordId,recordId);
  }
  const adminToken=await login(h),list=await h.call({action:"adminList",adminToken});
  assert.equal(list.data.responses.length,2);
  assert.equal((await h.submit({...answer,name:"TEST - Second visitor",requestId:secondId})).data.recordId,second.data.recordId);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM responses").get().n,2);
 }finally{h.dispose();}
});

test("new responses require both a nonblank note and a nonempty photo without partial writes",async()=>{
 const h=harness();try{
  const noPhoto=await h.call(answer);assert.equal(noPhoto.status,400);assert.match(noPhoto.data.error,/fotoğraf/);
  for(const shortNote of ["","   ","\n\t"]){
   const noNote=await h.submit({...answer,shortNote});assert.equal(noNote.status,400);assert.match(noNote.data.error,/anı notu/);
  }
  const fd=new FormData();for(const [key,value] of Object.entries(answer))fd.set(key,value);
  fd.set("photo",new File([],"empty.png",{type:"image/png"}));
  assert.equal((await h.call(answer,{body:fd})).status,400);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM responses").get().n,0);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM participants").get().n,0);
  assert.equal(h.objects.size,0);
  assert.equal((await h.submit(answer)).data.saved,true);
 }finally{h.dispose();}
});
test("a previously saved receipt remains recoverable even with missing required fields",async()=>{
 const h=harness();try{
  const saved=await h.submit(answer);
  const retry=await h.call({...answer,shortNote:""});
  assert.equal(retry.data.saved,true);assert.equal(retry.data.recordId,saved.data.recordId);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM responses").get().n,1);
 }finally{h.dispose();}
});
