const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function harness({local=[],remote=[],hook,fail=false,member=true,writeConflict=false}={}) {
 const storage=new Map();const events=[]; let reads=0;
 const tables={rempro_projects:structuredClone(remote),rempro_prices:[],rempro_documents:[],rempro_rules:[],rempro_members:member?[{email:'test@example.test'}]:[]};
 const ctx={console,crypto:require('node:crypto').webcrypto,Date,Map,Set,JSON,setTimeout,clearTimeout,CustomEvent:class{constructor(type){this.type=type;}}};
 ctx.window=ctx;ctx.addEventListener=()=>{};ctx.dispatchEvent=e=>events.push(e.type);
 ctx.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 const client={from(table){let mode='read',payload,opts,filters=[],start=0,end=499;const q={
  select(){return q;},order(){return q;},range(a,b){start=a;end=b;return q;},eq(k,v){filters.push([k,v]);return q;},
  upsert(p,o){mode='insert';payload=p;opts=o;return q;},update(p){mode='update';payload=p;return q;},
  async then(resolve,reject){try {
   if(fail && table==='rempro_projects') return resolve({error:{message:'offline'}});
   if(table==='rempro_projects' && mode==='read'){reads++;await hook?.({reads,tables,storage,ctx});}
   let result;
   if(mode==='read') result=tables[table].filter(r=>filters.every(([k,v])=>r[k]===v)).slice(start,end+1);
   else if(mode==='insert'){result=[];if(!tables[table].some(r=>r.id===payload.id)){tables[table].push({...payload});result=[payload];}}
   else {if(writeConflict && table==='rempro_projects') {tables[table][0].updated_at='2026-09-22T00:00:00.000Z';tables[table][0].name='Concurrent';} result=[];for(const r of tables[table])if(filters.every(([k,v])=>r[k]===v)){Object.assign(r,payload,{updated_at:'2026-09-21T12:00:00.000Z'});result.push(r);}}
   resolve({data:structuredClone(result),error:null});
  } catch(e){reject(e);}}
 };return q;}};
 ctx.RemProSupabase={ready:true,session:{user:{id:'user',email:'test@example.test'}},getClient:()=>client,onAuthChange:()=>{},signOut:async()=>{ctx.RemProSupabase.session=null;}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../data-store.js'),'utf8'),ctx);
 ctx.RemProData.local.save(ctx.RemProData.keys.projects,local);
 ctx.RemProData.local.save(ctx.RemProData.keys.rules,{liston:.61,canaleta:.9,angle:3.05,wire:.7,screws:50,mini:8,cajillo:.75,curtain:.35});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../sync.js'),'utf8'),ctx);
 return {ctx,tables,events,storage,load:()=>ctx.RemProData.local.load(ctx.RemProData.keys.projects,[])};
}
const row=(id,name,updated_at='2026-09-20T00:00:00.000Z')=>({id,name,client:'Test',updated_at,deleted:false});
test('first sync keeps server records and uploads local records, with safety backup',async()=>{const h=harness({local:[row('local','Local')],remote:[row('cloud','Cloud')]});await h.ctx.RemProSync.syncNow();assert.equal(h.load().length,2);assert.equal(h.tables.rempro_projects.length,2);assert.ok(h.storage.has(h.ctx.RemProData.keys.backup));assert.equal(h.ctx.RemProSync.status.status,'synced');assert.ok(h.events.includes('rempro:synced'));});
test('legacy record without timestamp never replaces newer cloud version',async()=>{const h=harness({local:[{id:'a',name:'Old'}],remote:[row('a','New')]});await h.ctx.RemProSync.syncNow();assert.equal(h.load()[0].name,'New');});
test('edits made during a network read survive and are uploaded in queued pass',async()=>{const h=harness({local:[row('a','Original')],remote:[row('a','Original')],hook:({reads,ctx})=>{if(reads===2)ctx.RemProData.local.save(ctx.RemProData.keys.projects,[row('a','Edited','2026-09-21T00:00:00.000Z')]);}});await h.ctx.RemProSync.syncNow();assert.equal(h.load()[0].name,'Edited');assert.equal(h.tables.rempro_projects[0].name,'Edited');});
test('failed reads do not write or discard local data or report success',async()=>{const h=harness({local:[row('a','Local')],fail:true});await h.ctx.RemProSync.syncNow();assert.equal(h.load()[0].name,'Local');assert.equal(h.ctx.RemProSync.status.status,'error');assert.equal(h.tables.rempro_projects.length,0);});
test('unauthorized account cannot be reported as synchronized with empty results',async()=>{const h=harness({member:false});await h.ctx.RemProSync.syncNow();assert.equal(h.ctx.RemProSync.status.status,'error');assert.match(h.ctx.RemProSync.status.message,/autorizado/);});
test('pagination fetches more than 1000 cloud records',async()=>{const h=harness({remote:Array.from({length:1003},(_,i)=>row(String(i),'Project'))});await h.ctx.RemProSync.syncNow();assert.equal(h.load().length,1003);});
test('tombstones remain deleted on other devices',async()=>{const h=harness({local:[row('a','Local')],remote:[{...row('a','Deleted','2026-09-21T00:00:00.000Z'),deleted:true}]});await h.ctx.RemProSync.syncNow();assert.equal(h.load()[0].deleted,true);});
test('session changed during read stops subsequent writes',async()=>{const h=harness({local:[row('a','Local')],hook:({ctx})=>{ctx.RemProSupabase.session=null;}});await h.ctx.RemProSync.syncNow();assert.equal(h.tables.rempro_projects.length,0);assert.equal(h.load()[0].name,'Local');});

test('concurrent server write is not overwritten and keeps local draft',async()=>{const h=harness({local:[row('a','Local','2026-09-21T00:00:00.000Z')],remote:[row('a','Remote')],writeConflict:true});await h.ctx.RemProSync.syncNow();assert.equal(h.ctx.RemProSync.status.status,'error');assert.equal(h.load()[0].name,'Local');assert.equal(h.tables.rempro_projects[0].name,'Concurrent');});

test('logical duplicate from another device reuses the server project id',async()=>{const local=row('local-id','Casa Demo','2026-09-20T00:00:00.000Z');const remote=row('cloud-id','Casa Demo','2026-09-20T00:00:00.000Z');const h=harness({local:[local],remote:[remote]});await h.ctx.RemProSync.syncNow();assert.equal(h.tables.rempro_projects.length,1);assert.equal(h.load().length,1);assert.equal(h.load()[0].id,'cloud-id');assert.equal(h.ctx.RemProSync.status.status,'synced');});
