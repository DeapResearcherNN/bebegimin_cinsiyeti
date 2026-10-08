const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../api.js'),'utf8');

function harness(reply, fetchImpl = async () => ({type:'opaque'}), shortDeadline = false) {
  const timers = new Set();
  let posts = 0;
  const context = {
    URL, URLSearchParams, AbortController,
    crypto: require('node:crypto').webcrypto,
    BABY_APP_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},
    document:{createElement:()=>({remove(){}}),head:{append(script){
      const url = new URL(script.src);
      queueMicrotask(() => reply(url,context));
    }}},
    fetch(...args){ posts++; return fetchImpl(...args); },
    setTimeout(fn,ms){
      const timer=setTimeout(fn,shortDeadline ? Math.min(ms,15) : ms===2000 ? 1 : ms);
      timers.add(timer); return timer;
    },
    clearTimeout(timer){ clearTimeout(timer);timers.delete(timer); },
    Date:shortDeadline ? class extends Date { static now(){return Date.now()*10000;} } : Date
  };
  context.window=context;
  vm.createContext(context);vm.runInContext(source,context);
  return {api:context.BabyApi,posts:()=>posts,dispose(){for(const t of timers)clearTimeout(t);}};
}
const respond=(url,ctx,data)=>ctx[url.searchParams.get('callback')](data);

test('unreachable deployment fails before submission', async()=>{
  const h=harness(()=>{},undefined,true);
  try { await assert.rejects(h.api.checkHealth(),/Cevabın gönderilmedi/);assert.equal(h.posts(),0); }
  finally {h.dispose();}
});
test('opaque POST is followed by a durable receipt, with exactly one POST',async()=>{
  let checks=0;
  const h=harness((url,ctx)=>respond(url,ctx,{ok:true,saved:++checks>=2,submittedAt:'2026-10-08T08:00:00Z'}));
  try {
    const data=await h.api.submit({action:'submit'},'req_123456789012345678');
    assert.equal(data.saved,true);assert.equal(checks,2);assert.equal(h.posts(),1);
  } finally {h.dispose();}
});
test('backend rejection is shown instead of being mistaken for a timeout',async()=>{
  const h=harness((url,ctx)=>respond(url,ctx,{ok:false,error:'Form kapalı.'}));
  try {await assert.rejects(h.api.submit({action:'submit'},'req_123456789012345678'),/Form kapalı/);assert.equal(h.posts(),1);}
  finally {h.dispose();}
});
test('lost POST response can still succeed through a saved receipt',async()=>{
  const h=harness((url,ctx)=>respond(url,ctx,{ok:true,saved:true}),async()=>{throw Error('lost network response');});
  try {assert.equal((await h.api.submit({},'req_123456789012345678')).saved,true);assert.equal(h.posts(),1);}
  finally {h.dispose();}
});
test('missing receipt never produces a success or an automatic duplicate POST',async()=>{
  const h=harness((url,ctx)=>respond(url,ctx,{ok:true,saved:false}),undefined,true);
  try {await assert.rejects(h.api.submit({},'req_123456789012345678'),/kaydedilmiş olabilir/);assert.equal(h.posts(),1);}
  finally {h.dispose();}
});
test('only HTTPS Google script origins can reply to admin actions',()=>{
  const h=harness(()=>{});
  try {
    assert.equal(h.api.isTrustedOrigin('https://x.script.googleusercontent.com'),true);
    assert.equal(h.api.isTrustedOrigin('https://n-example-0lu-script.googleusercontent.com'),true);
    for(const origin of ['null','http://script.google.com','https://script.googleusercontent.com.evil.test','https://evil.test']){
      assert.equal(h.api.isTrustedOrigin(origin),false);
    }
  } finally {h.dispose();}
});
