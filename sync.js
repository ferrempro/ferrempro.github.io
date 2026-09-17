// RemPro Control V2 — motor de sincronización.
// Responsabilidad única: llevar los arreglos locales (projects, prices,
// rules) a las tablas rempro_projects / rempro_prices / rempro_rules de
// Supabase y de regreso, sin bloquear nunca el uso local si no hay sesión,
// red o permiso. app.js sigue leyendo/escribiendo localStorage a través
// de RemProData tal como en V1; este archivo sólo añade la capa de nube.
(() => {
  'use strict';

  const PROJECT_FIELDS = ['id', 'name', 'client', 'folio', 'status', 'contract', 'collected', 'cost', 'progress', 'deleted', 'updated_at', 'updated_by'];
  const PRICE_FIELDS = ['id', 'item', 'supplier', 'unit', 'net', 'vat', 'date', 'deleted', 'updated_at', 'updated_by'];
  const RULE_FIELDS = ['id', 'liston', 'canaleta', 'angle', 'wire', 'screws', 'mini', 'cajillo', 'curtain', 'updated_at', 'updated_by'];

  const state = {
    status: 'local', // local | signed-out | syncing | synced | error
    message: '',
    email: null,
    lastSyncAt: null,
    listeners: []
  };

  let debounceTimer = null;

  function setStatus(status, message) {
    state.status = status;
    state.message = message || '';
    state.listeners.forEach(fn => {
      try { fn({ ...state }); } catch (err) { /* no romper por un listener */ }
    });
  }

  function pick(obj, fields) {
    const out = {};
    fields.forEach(f => { out[f] = obj[f] !== undefined ? obj[f] : null; });
    return out;
  }

  // Fusiona un arreglo local con las filas remotas por id, con la regla:
  // gana el registro con updated_at más reciente. Devuelve el arreglo
  // fusionado (para guardar local) y la lista de filas que hay que subir
  // (las locales que ganaron o que el remoto no tiene todavía).
  function mergeById(localList, remoteRows) {
    const remoteMap = new Map(remoteRows.map(r => [r.id, r]));
    const localMap = new Map(localList.map(r => [r.id, r]));
    const mergedMap = new Map();
    const toPush = [];

    localList.forEach(rec => {
      const remote = remoteMap.get(rec.id);
      if (!remote || new Date(rec.updated_at) > new Date(remote.updated_at)) {
        mergedMap.set(rec.id, rec);
        toPush.push(rec);
      } else {
        mergedMap.set(rec.id, remote);
      }
    });

    remoteRows.forEach(rec => {
      if (!localMap.has(rec.id)) mergedMap.set(rec.id, rec);
    });

    return { merged: Array.from(mergedMap.values()), toPush };
  }

  async function syncArrayTable(table, storageKey, fields) {
    const data = window.RemProData;
    const { list, changed } = data.ensureRecordMeta(data.local.load(storageKey, []));
    if (changed) data.local.save(storageKey, list);

    const client = data.remote.getClient();
    const email = window.RemProSupabase.session && window.RemProSupabase.session.user
      ? window.RemProSupabase.session.user.email
      : null;

    const { data: remoteRows, error: selectError } = await client.from(table).select('*');
    if (selectError) throw selectError;

    const { merged, toPush } = mergeById(list, remoteRows || []);

    if (toPush.length) {
      const rows = toPush.map(r => pick({ ...r, updated_by: email }, fields));
      const { error: upsertError } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (upsertError) throw upsertError;
    }

    merged.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
    data.local.save(storageKey, merged);
    return merged;
  }

  async function syncRules() {
    const data = window.RemProData;
    const localRules = data.local.load(data.keys.rules, {});
    const localRow = {
      id: 'default',
      liston: localRules.liston, canaleta: localRules.canaleta, angle: localRules.angle,
      wire: localRules.wire, screws: localRules.screws, mini: localRules.mini,
      cajillo: localRules.cajillo, curtain: localRules.curtain,
      updated_at: localRules.updated_at || new Date(0).toISOString()
    };

    const client = data.remote.getClient();
    const email = window.RemProSupabase.session && window.RemProSupabase.session.user
      ? window.RemProSupabase.session.user.email
      : null;

    const { data: rows, error: selectError } = await client.from('rempro_rules').select('*').eq('id', 'default');
    if (selectError) throw selectError;
    const remoteRow = rows && rows[0];

    if (!remoteRow || new Date(localRow.updated_at) > new Date(remoteRow.updated_at)) {
      const { error: upsertError } = await client.from('rempro_rules')
        .upsert([pick({ ...localRow, updated_by: email }, RULE_FIELDS)], { onConflict: 'id' });
      if (upsertError) throw upsertError;
    } else {
      const { liston, canaleta, angle, wire, screws, mini, cajillo, curtain, updated_at } = remoteRow;
      data.local.save(data.keys.rules, { liston, canaleta, angle, wire, screws, mini, cajillo, curtain, updated_at });
    }
  }

  async function syncNow() {
    const data = window.RemProData;
    if (!data.remote.available) {
      setStatus('local', 'Modo local: el SDK de Supabase no está disponible ahora mismo.');
      return;
    }
    const session = window.RemProSupabase.session;
    if (!session) {
      setStatus('signed-out', 'Inicia sesión para sincronizar entre dispositivos.');
      return;
    }

    setStatus('syncing', 'Sincronizando…');
    try {
      const projects = await syncArrayTable('rempro_projects', data.keys.projects, PROJECT_FIELDS);
      const prices = await syncArrayTable('rempro_prices', data.keys.prices, PRICE_FIELDS);
      await syncRules();
      state.lastSyncAt = new Date().toISOString();
      data.local.save(data.keys.syncMeta, { lastSyncAt: state.lastSyncAt });
      setStatus('synced', `Sincronizado ${new Date(state.lastSyncAt).toLocaleTimeString('es-MX')}`);
      window.dispatchEvent(new CustomEvent('rempro:synced', { detail: { projects, prices } }));
    } catch (err) {
      const denied = err && (err.code === '42501' || /row-level security/i.test(err.message || ''));
      setStatus('error', denied
        ? 'Tu cuenta inició sesión pero no tiene acceso a los datos de RemPro (pide que agreguen tu correo en rempro_members).'
        : `No se pudo sincronizar: ${err && err.message ? err.message : err}`);
    }
  }

  function queueSync(delayMs) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(syncNow, delayMs || 1200);
  }

  async function signIn(email, password) {
    await window.RemProSupabase.signIn(email, password);
    await syncNow();
  }

  async function signUp(email, password) {
    return window.RemProSupabase.signUp(email, password);
  }

  async function signOut() {
    await window.RemProSupabase.signOut();
    setStatus('signed-out', 'Sesión cerrada. Los datos locales de este dispositivo se conservan.');
  }

  window.RemProSync = Object.freeze({
    syncNow,
    queueSync,
    signIn,
    signUp,
    signOut,
    onStatusChange(fn) {
      state.listeners.push(fn);
      fn({ ...state });
      return () => { state.listeners = state.listeners.filter(f => f !== fn); };
    },
    get status() { return { ...state }; }
  });

  if (window.RemProSupabase) {
    window.RemProSupabase.onAuthChange(session => {
      state.email = session && session.user ? session.user.email : null;
      if (session) {
        syncNow();
      } else if (window.RemProData.remote.available) {
        setStatus('signed-out', 'Inicia sesión para sincronizar entre dispositivos.');
      } else {
        setStatus('local', 'Modo local: sin conexión a Supabase.');
      }
    });
  }
})();
