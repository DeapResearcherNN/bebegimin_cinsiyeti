import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const target={identity:'b7c62bcddc2f8bc6bcd2435b15226e30b2b9708ef0ee5ad8b83aa392d86e72f5',gender:'👧 Kız',firstGuess:'Hiç tahminim olmadı',before:'2026-10-08T14:33:37.000Z'};
export async function resetAuthorizedResponse(query,removeObject){
  const matches=await query('SELECT r.id,r.request_id,r.participant_id,r.photo_key,r.media_key,r.submitted_at,p.active FROM responses r JOIN participants p ON p.id=r.participant_id WHERE p.identity=? AND r.gender=? AND r.first_guess=? AND r.submitted_at<?',[target.identity,target.gender,target.firstGuess,target.before]);
  if(matches.length!==1)throw Error('Expected exactly one authorized existing response; no deletion performed.');
  const row=matches[0];
  if(row.active!==1)throw Error('Participant is inactive; cannot confirm resubmission readiness.');
  const before=(await query('SELECT COUNT(*) AS n FROM responses'))[0].n;
  for(const key of [row.photo_key,row.media_key].filter(Boolean)){
    if(![row.id+'/photo',row.id+'/media'].includes(key))throw Error('Unexpected attachment key; stop.');
  }
  for(const key of [row.photo_key,row.media_key].filter(Boolean))await removeObject(key);
  await query('DELETE FROM responses WHERE id=? AND request_id=? AND participant_id=? AND submitted_at=? AND gender=? AND first_guess=? AND participant_id IN (SELECT id FROM participants WHERE identity=?)',[row.id,row.request_id,row.participant_id,row.submitted_at,target.gender,target.firstGuess,target.identity]);
  const remaining=await query('SELECT r.id FROM responses r JOIN participants p ON p.id=r.participant_id WHERE p.identity=?',[target.identity]);
  const participant=await query('SELECT id,active FROM participants WHERE id=? AND identity=?',[row.participant_id,target.identity]);
  const after=(await query('SELECT COUNT(*) AS n FROM responses'))[0].n;
  if(remaining.length!==0||participant.length!==1||participant[0].active!==1)throw Error('Reset readiness verification failed.');
  console.log('AUTHORIZED_RESET_VERIFIED: response removed; participant active with no prior response; attachment deletion complete.');
  console.log('Response count before='+before+' after='+after+'.');
  return {before,after};
}
async function main(){
  if(process.env.GITHUB_REF!=='refs/heads/maintenance-reset-20261008')throw Error('Wrong maintenance branch.');
  const account=process.env.CLOUDFLARE_ACCOUNT_ID,secret=process.env.CLOUDFLARE_API_TOKEN;
  if(!account||!secret)throw Error('Existing Cloudflare connection required.');
  async function api(path,method='GET',body){
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+path,{method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!response.ok||!data.success)throw Error('Cloudflare operation failed: HTTP '+response.status);return data.result;
  }
  let database;
  for(let page=1;page<=20;page++){
    const rows=await api('/d1/database?per_page=100&page='+page);database=rows.find(r=>r.name==='bebegimin-cinsiyeti');if(database||rows.length<100)break;
  }
  if(!database)throw Error('Existing family database not found.');
  const query=async(sql,params=[])=>{
    const result=await api('/d1/database/'+database.uuid+'/query','POST',{sql,params});
    if(result.length!==1||result[0].success!==true)throw Error('Database query failed.');return result[0].results||[];
  };
  const bucket='bebegimin-cinsiyeti-hatiralar';
  await writeFile('wrangler.maintenance.json',JSON.stringify({name:'baby-family-maintenance',account_id:account,compatibility_date:'2026-10-01',r2_buckets:[{binding:'MEDIA',bucket_name:bucket}]}));
  await resetAuthorizedResponse(query,async key=>execFileSync('npx',['--yes','wrangler@4.102.0','r2','object','delete',bucket+'/'+key,'--remote','--force','--config','wrangler.maintenance.json'],{stdio:'pipe'}));
}
if(process.argv[1]?.endsWith('/reset-authorized-response.mjs'))await main();
