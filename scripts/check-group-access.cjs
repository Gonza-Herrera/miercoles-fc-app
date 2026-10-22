const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const {randomUUID}=require('node:crypto');
const signal=initial=>{let value=initial;const read=()=>value;read.set=v=>value=v;read.update=fn=>value=fn(value);return read;};
function load(path,client){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{exports,require:name=>name==='@angular/core'?{Injectable:()=>c=>c,signal,DestroyRef:'destroy',inject:token=>token==='destroy'?{onDestroy(){}}:{client}}:{SupabaseService:'supabase'},AbortSignal,crypto:{randomUUID},setInterval(){},clearInterval(){},window:{addEventListener(){},removeEventListener(){}}});return exports;}
let allowed=true,offline=false,delayed=false,resolveRead;
const accessClient={rpc(){const result=delayed?new Promise(resolve=>{resolveRead=resolve;}):Promise.resolve(offline?{error:new Error('Offline')}:{data:{allowed}});return{abortSignal:()=>result};}};
const {GroupAccessService}=load('src/app/services/group-access.service.ts',accessClient);
const server=new Map(),operations=new Map();let lost=false;
const invitesClient={rpc(name,args){return{abortSignal:async()=>{
 if(offline)return{error:new Error('Offline')};
 let row=server.get(args.p_id);
 if(!operations.has(args.p_operation)){
  if((row?.version??-1)!==args.p_version)return{error:{code:'40001'}};
  row={id:args.p_id,version:args.p_version+1,display_name:args.p_name,email:args.p_email,active:args.p_active};server.set(row.id,row);operations.set(args.p_operation,row.id);
 }
 if(lost){lost=false;return{error:new Error('Lost response')};}
 return{data:[structuredClone(server.get(operations.get(args.p_operation)))]};
 }};},from(){throw new Error('Unexpected query');}};
const {InvitesService}=load('src/app/services/invites.service.ts',invitesClient);
(async()=>{
 const access=new GroupAccessService();assert.equal(await access.check(),false);
 access.activate('a');assert.equal(access.status(),'checking');assert.equal(await access.check(),true);assert.equal(access.status(),'allowed');
 allowed=false;assert.equal(await access.check(),false);assert.equal(access.status(),'denied');
 offline=true;assert.equal(await access.check(),false);assert.equal(access.status(),'error');offline=false;
 delayed=true;const pending=access.check();access.activate('b');resolveRead({data:{allowed:true}});assert.equal(await pending,false);assert.equal(access.status(),'checking','old account response must not authorize the next account');delayed=false;allowed=true;
 assert.equal(await access.check(),true);access.activate('');assert.equal(access.status(),'denied');
 const admin=new InvitesService();lost=true;
 assert.equal(await admin.save('Diego',' DIEGO@example.com ',true),false);assert.equal(admin.rows().length,0);assert.equal(admin.canRetry(),true);
 assert.equal(await admin.retry(),true);assert.equal(server.size,1);assert.equal(admin.rows()[0].email,'diego@example.com');
 const original=structuredClone(admin.rows()[0]);
 assert.equal(await admin.save(original.display_name,original.email,false,original),true);
 assert.equal(admin.rows()[0].active,false);
 assert.equal(await admin.save(original.display_name,original.email,true,original),false,'stale session must not reactivate');
 assert.match(admin.error(),/otra sesión/);
 assert.equal(await admin.save('A','invalid',true),false);
 console.log('Group access: initial checks, live revocation, connection failure, session isolation, invitation validation, lost response retry and stale admin conflicts passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
