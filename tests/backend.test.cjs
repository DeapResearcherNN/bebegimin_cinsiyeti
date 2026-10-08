const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness(options={}) {
  const rows=[], cache=new Map();let locked=false;
  const sheet={appendRow(row){rows.push(row);},getLastRow(){return rows.length+1;},
    getRange(start,col,n,width=1){return {
      getDisplayValues(){return rows.slice(start-2,start-2+n).map(r=>r.slice(col-1,col-1+width).map(String));},
      getValues(){return rows.slice(start-2,start-2+n).map(r=>r.slice(col-1,col-1+width));}
    };}};
  const participants={getRange(){return {setValues(){if(options.participantFailure)throw Error('participant update failed');}};}};
  const ctx={console:{error(){}},Date,
    SpreadsheetApp:{openById(){return {getSheetByName(name){return name==='Cevaplar'?sheet:participants;}};}},
    CacheService:{getScriptCache(){return {put(k,v){cache.set(k,v);},get(k){return cache.get(k);}};}},
    LockService:{getScriptLock(){return {waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}};}},
    Utilities:{getUuid:()=> 'record-uuid'}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/Code.gs'),'utf8'),ctx);
  let settings={FORM_ACIK:'TRUE'};
  ctx.getSettings_=()=>settings;
  ctx.findParticipant_=()=>({row:2,id:'person-1',answered:false});
  ctx.hasResponse_=()=>rows.length>0;
  ctx.saveUpload_=()=>{if(options.uploadFailure)throw Error('Drive upload permission denied');return {};};
  ctx.writeBackupJson_=()=>{throw Error('backup failed');};
  ctx.sendNotification_=()=>{throw Error('mail failed');};
  ctx.postMessage_=data=>data;
  return {ctx,rows,cache,close(){settings.FORM_ACIK='FALSE';}};
}
const fields={action:'submit',name:'TEST - regression',relation:'Deneme (TEST)',gender:'👧 Kız',firstGuess:'İlk andan beri kız',requestId:'req_12345678901234567890',attemptId:'req_09876543210987654321'};

test('durable answer remains successful when participant, backup and mail fail',()=>{
  const h=harness({participantFailure:true});
  assert.equal(h.ctx.doPost({parameter:fields}).ok,true);
  assert.equal(h.rows.length,1);
  assert.equal(h.ctx.submissionReceipt_(fields).saved,true);
});
test('retry of the same receipt is idempotent even after the form closes',()=>{
  const h=harness();h.ctx.submitResponse_(fields);h.close();
  assert.equal(h.ctx.submitResponse_(fields).ok,true);assert.equal(h.rows.length,1);
});
test('upload errors reach the receipt without saving a response',()=>{
  const h=harness({uploadFailure:true});
  const failure=h.ctx.doPost({parameter:fields});assert.equal(failure.ok,false);
  assert.equal(h.rows.length,0);assert.match(h.ctx.submissionReceipt_(fields).error,/permission denied/);
  assert.equal(h.ctx.submissionReceipt_({...fields,attemptId:'req_other_attempt_123456789'}).saved,false);
});
test('unknown receipt is pending and invalid receipt is rejected',()=>{
  const h=harness();assert.equal(h.ctx.submissionReceipt_(fields).saved,false);
  assert.throws(()=>h.ctx.submissionReceipt_({requestId:'guess'}),/Gecersiz/);
});
