// Local-first synchronization. Read before writing; preserve edits made in flight.
(() => {
  'use strict';
  const data = window.RemProData;
  const state = { status: 'local', message: '', email: null, lastSyncAt: null };
  const listeners = new Set();
  let timer, running = null, requested = false;
  const fields = {
    projects: ['id','name','client','folio','status','contract','collected','cost','progress','deleted','updated_at','updated_by'],
    prices: ['id','item','supplier','unit','net','vat','date','deleted','updated_at','updated_by'],
    rules: ['id','liston','canaleta','angle','wire','screws','mini','cajillo','curtain','updated_at','updated_by'],
    documents: ['id','project_id','title','document_type','folio','amount','status','sent_state','due_date','notes','deleted','updated_at','updated_by']
  };
  const stamp = row => Date.parse(row?.updated_at) || 0;
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const norm = v => String(v ?? '').trim().toLocaleLowerCase('es');
  function projectIdentity(row) { return `${norm(row?.name)}|${norm(row?.client)}`; }
  function setStatus(status,message) {
    Object.assign(state,{status,message:message || ''});
    listeners.forEach(fn => { try { fn({...state}); } catch {} });
  }
  function assertSession(id) {
    if (window.RemProSupabase.session?.user.id !== id) throw new Error('La sesión cambió. Vuelve a sincronizar con la cuenta correcta.');
  }
  async function readAll(client,table) {
    const all=[];
    for (let offset=0;;offset+=500) {
      const {data:rows,error}=await client.from(table).select('*').order('id').range(offset,offset+499);
      if(error) throw error;
      all.push(...(rows || []));
      if (!rows || rows.length<500) return all;
    }
  }
  // Compare-and-set avoids overwriting a server row changed since our read.
  async function writeRow(client,table,row,remote,columns,user) {
    assertSession(user.id);
    const payload=Object.fromEntries(columns.map(k=>[k,row[k] ?? null]));
    payload.updated_by=user.email;
    const query=remote
      ? client.from(table).update(payload).eq('id',row.id).eq('updated_at',remote.updated_at)
      : client.from(table).upsert(payload,{onConflict:'id',ignoreDuplicates:true});
    const {data:written,error}=await query.select();
    if(error) throw error;
    if (!written?.length) throw new Error('Otro dispositivo cambió un registro durante la sincronización. Tu versión sigue guardada localmente; exporta un respaldo antes de resolver la diferencia');
  }
  async function syncTable(client,kind,user) {
    const key=data.keys[kind], table='rempro_'+kind;
    let snapshot=data.ensureRecordMeta(data.local.load(key,[])).list;
    data.local.save(key,snapshot);
    const remote=await readAll(client,table);
    assertSession(user.id);
    const remoteMap=new Map(remote.map(r=>[r.id,r]));
    if (kind==='projects') {
      const canonicalByIdentity=new Map();
      for (const row of remote.filter(r=>!r.deleted)) {
        const identity=projectIdentity(row);
        if (!identity || identity==='|') continue;
        const current=canonicalByIdentity.get(identity);
        if (!current || stamp(row)>stamp(current)) canonicalByIdentity.set(identity,row);
      }
      const remapped=[];
      const seenIds=new Set();
      for (const row of snapshot) {
        let next=row;
        if (!row.deleted && !remoteMap.has(row.id)) {
          const candidate=canonicalByIdentity.get(projectIdentity(row));
          if (candidate) {
            next=stamp(row)>stamp(candidate) ? {...row,id:candidate.id} : {...candidate};
          }
        }
        const previous=remapped.find(r=>r.id===next.id);
        if (!previous) { remapped.push(next); seenIds.add(next.id); }
        else if (stamp(next)>stamp(previous)) remapped[remapped.indexOf(previous)]=next;
      }
      snapshot=remapped;
      data.local.save(key,snapshot);
    }
    for (const row of snapshot) {
      const other=remoteMap.get(row.id);
      if (!other || stamp(row)>stamp(other)) await writeRow(client,table,row,other,fields[kind],user);
    }
    const confirmed=await readAll(client,table);
    assertSession(user.id);
    const merged=new Map(confirmed.map(r=>[r.id,r]));
    const original=new Map(snapshot.map(r=>[r.id,r]));
    const latest=data.local.load(key,[]);
    for (const row of latest) {
      if (!same(row,original.get(row.id))) { merged.set(row.id,row); requested=true; }
      else if (!merged.has(row.id)) merged.set(row.id,row);
    }
    data.local.save(key,[...merged.values()]);
    window.dispatchEvent(new CustomEvent('rempro:synced'));
  }
  async function syncRules(client,user) {
    const snapshot=data.local.load(data.keys.rules,{});
    const local={...snapshot,id:'default',updated_at:snapshot.updated_at || new Date(0).toISOString()};
    const rows=await readAll(client,'rempro_rules');
    assertSession(user.id);
    const remote=rows.find(r=>r.id==='default');
    if (!remote || stamp(local)>stamp(remote)) await writeRow(client,'rempro_rules',local,remote,fields.rules,user);
    const confirmed=(await readAll(client,'rempro_rules')).find(r=>r.id==='default');
    assertSession(user.id);
    if (!same(snapshot,data.local.load(data.keys.rules,{}))) requested=true;
    else if (confirmed) {
      data.local.save(data.keys.rules,confirmed);
      window.dispatchEvent(new CustomEvent('rempro:synced'));
    }
  }
  async function run() {
    if (!data.remote.available) { setStatus('local','Modo local: la nube no está disponible.'); return; }
    const user=window.RemProSupabase.session?.user;
    if (!user) { setStatus('signed-out','Inicia sesión para sincronizar entre dispositivos.'); return; }
    setStatus('syncing','Sincronizando…');
    try {
      const client=data.remote.getClient();
      const {data:authorized,error}=await client.rpc('rempro_is_member');
      if(error) {
        if (error.code === '42501') throw new Error('La sesión de RemPro no tiene permisos válidos. Cierra sesión y vuelve a iniciar sesión.');
        throw error;
      }
      if (authorized !== true) throw new Error('Tu correo no está autorizado para RemPro Control.');
      assertSession(user.id);
      const meta=data.local.load(data.keys.syncMeta,{});
      if (!meta.lastSyncAt && !data.local.load(data.keys.backup,null)) {
        data.local.save(data.keys.backup,{version:1,exportedAt:new Date().toISOString(),projects:data.local.load(data.keys.projects,[]),prices:data.local.load(data.keys.prices,[]),rules:data.local.load(data.keys.rules,{})});
      }
      await syncTable(client,'projects',user);
      await syncTable(client,'prices',user);
      await syncTable(client,'documents',user);
      await syncRules(client,user);
      assertSession(user.id);
      state.lastSyncAt=new Date().toISOString();
      data.local.save(data.keys.syncMeta,{lastSyncAt:state.lastSyncAt});
      setStatus('synced',`Sincronizado ${new Date(state.lastSyncAt).toLocaleTimeString('es-MX')}`);
    } catch(error) {
      requested=false;
      setStatus('error',`No se pudo sincronizar: ${error.message || error}. Los datos locales se conservan.`);
    }
  }
  function syncNow() {
    clearTimeout(timer);
    if (running) { requested=true; return running; }
    running=(async()=>{ do { requested=false; await run(); } while(requested); })().finally(()=>{running=null;});
    return running;
  }
  function queueSync(delay=1200) { clearTimeout(timer); timer=setTimeout(syncNow,delay); }
  async function signIn(email,password) { await window.RemProSupabase.signIn(email.trim(),password); await syncNow(); }
  async function signOut() {
    clearTimeout(timer);
    requested=false;
    try { await window.RemProSupabase.signOut(); setStatus('signed-out','Sesión cerrada. Los datos locales se conservan.'); }
    catch(e) { setStatus('error',`No se pudo cerrar sesión: ${e.message}`); }
  }
  window.RemProSync=Object.freeze({syncNow,queueSync,signIn,signOut,
    onStatusChange(fn){listeners.add(fn);fn({...state});return()=>listeners.delete(fn);},
    get status(){return {...state};}
  });
  window.RemProSupabase?.onAuthChange(session=>{
    state.email=session?.user.email || null;
    if(session) queueSync(0);
    else { clearTimeout(timer); setStatus(data.remote.available?'signed-out':'local','Datos guardados en este dispositivo.'); }
  });
  window.addEventListener('online',()=>queueSync(0));
  window.addEventListener('focus',()=>queueSync(0));
})();
