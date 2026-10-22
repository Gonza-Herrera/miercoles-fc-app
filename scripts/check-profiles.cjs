const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {randomUUID} = require('node:crypto');
const signal = initial => { let value=initial; const read=()=>value; read.set=v=>value=v; read.update=fn=>value=fn(value); return read; };
let identity='a', network='ok', uploadCount=0, deferredRead, deferRead=false;
const rows={}, files=new Set();
const clone=v=>JSON.parse(JSON.stringify(v));
const client={
 auth:{getUser:async()=>({data:{user:{id:identity}},error:null})},
 storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:`https://storage.test/${path}`}}),upload:async path=>{
   uploadCount++; if(files.has(path)) return {error:{statusCode:'409',message:'Already exists'}};
   files.add(path); if(network==='lost-upload'){network='ok';return {error:{message:'Connection lost'}};} return {error:null};
 }})},
 from:()=>{
   let payload,start=0,end=199;
   const q={select:()=>q,order:()=>q,range:(a,b)=>{start=a;end=b;return q;},upsert:p=>{payload=clone(p);return q;},
    abortSignal:()=>q,single:()=>run(),then:(resolve,reject)=>run().then(resolve,reject)};
   async function run(){
     if(network==='offline')return {error:new Error('Offline')};
     if(payload){ rows[payload.id]=payload; if(network==='lost-save'){network='ok';return {error:new Error('Lost response')};} return {data:clone(payload)}; }
     const data=clone(Object.values(rows).slice(start,end+1));
     if(deferRead){deferRead=false;return new Promise(resolve=>{deferredRead=()=>resolve({data});});} return {data};
   }return q;
 }
};
function load(path,imports){const exports={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{exports,require:name=>imports[name]??{},AbortSignal,crypto:{randomUUID},setTimeout(){},clearTimeout(){}});return exports;}
const {ProfileService,profileNameError}=load('src/app/services/profile.service.ts',{'@angular/core':{Injectable:()=>c=>c,inject:()=>({client}),signal},'./supabase.service':{SupabaseService:'supabase'}});
(async()=>{
 const service=new ProfileService();service.activate('a');await service.load();
 assert.equal(service.avatar(undefined,'google.jpg'),'google.jpg');
 assert.ok(profileNameError(' '));assert.ok(profileNameError('x'.repeat(61)));assert.ok(profileNameError('Gon\na'));
 assert.equal(await service.save(' Gonza ',null,false),true);assert.equal(rows.a.display_name,'Gonza');assert.equal(rows.a.use_google_avatar,true);
 const player={id:'a',name:'imcisnerosg',avatar:'google.jpg',role:'DEF'};
 assert.equal(service.player(player).name,'Gonza');assert.equal(service.player(player).role,'DEF');
 assert.equal(service.player({id:'b',name:'B',avatar:''}).name,'B');
 const photo={type:'image/jpeg',size:1234};network='lost-upload';
 assert.equal(await service.save('Gonza',photo,false),false);assert.equal(rows.a.avatar_path,null);
 assert.equal(await service.save('Gonza',photo,false),true);assert.equal(uploadCount,2);assert.equal(files.size,1,'upload retry must reuse object path');
 assert.match(service.player(player).avatar,/storage.test/);
 const newerPhoto={type:'image/jpeg',size:4321};network='lost-save';
 assert.equal(await service.save('Gonza nuevo',newerPhoto,false),false);const path=rows.a.avatar_path;
 assert.equal(await service.save('Gonza nuevo',newerPhoto,false),true);assert.equal(rows.a.avatar_path,path);assert.equal(files.size,2);
 assert.equal(await service.save('Gonza',null,true),true);assert.equal(service.avatar(rows.a,'google.jpg'),'');
 assert.equal(service.player(player).avatar,'/icons/avatar-placeholder.svg');
 network='offline';assert.equal(await service.save('No guardar',null,false),false);assert.equal(service.profiles().a.display_name,'Gonza');network='ok';
 // A late profile read cannot overwrite a save.
 deferRead=true;const read=service.load();await Promise.resolve();assert.ok(deferredRead);
 assert.equal(await service.save('Nombre reciente',null,false),true);deferredRead();await read;assert.equal(service.profiles().a.display_name,'Nombre reciente');
 // Old account requests must not populate the next account.
 deferRead=true;const oldRead=service.load();await Promise.resolve();service.activate('b');identity='b';deferredRead();await oldRead;
 assert.equal(Object.keys(service.profiles()).length,0);
 await service.load();
 // Google refreshes still use the app profile, without changing authorization.
 const session={user:{id:'a',email:'player@example.test',user_metadata:{full_name:'Google original',avatar_url:'google.jpg'}}};
 let onChange;
 client.auth.getSession=async()=>({data:{session}});client.auth.onAuthStateChange=cb=>{onChange=cb;};
 const {AuthService}=load('src/app/services/auth.service.ts',{'@angular/core':{Injectable:()=>c=>c,signal,computed:fn=>fn,effect:()=>{},untracked:fn=>fn(),inject:token=>token==='access'?{status:()=> 'allowed',activate:()=>{},check:async()=>true}:token==='profiles'?service:token==='supabase'?{client}:{}},'./group-access.service':{GroupAccessService:'access'},'./profile.service':{ProfileService:'profiles'},'./supabase.service':{SupabaseService:'supabase'},'./push-notifications.service':{PushNotificationsService:'push'},'@angular/router':{Router:'router'}});
 const auth=new AuthService();await Promise.resolve();await service.load();
 assert.equal(auth.currentUser().name,'Nombre reciente');assert.equal(auth.currentUser().isAdmin,false);
 onChange('SIGNED_IN',{user:{...session.user,user_metadata:{full_name:'Otro nombre de Google'}}});
 assert.equal(auth.currentUser().name,'Nombre reciente');assert.equal(auth.currentUser().isAdmin,false);
 console.log('Profiles: Google fallback, custom identity, roles, photo retries, lost responses, offline saves, stale reads and session isolation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
