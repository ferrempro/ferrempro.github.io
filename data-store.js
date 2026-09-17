(() => {
  'use strict';

  const keys = Object.freeze({
    projects: 'rempro_projects_v1',
    prices: 'rempro_prices_v1',
    rules: 'rempro_rules_v1',
    syncMeta: 'rempro_sync_meta_v1'
  });

  const local = Object.freeze({
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) ?? fallback);
      } catch {
        return fallback;
      }
    },

    save(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
      return value;
    }
  });

  const remote = Object.freeze({
    get available() {
      return Boolean(
        window.RemProSupabase &&
        window.RemProSupabase.ready &&
        window.RemProSupabase.getClient()
      );
    },

    getClient() {
      return window.RemProSupabase &&
        typeof window.RemProSupabase.getClient === 'function'
        ? window.RemProSupabase.getClient()
        : null;
    }
  });

  // Da un id/updated_at/deleted estables a cada registro que aún no lo
  // tenga (respaldos viejos de V1 no traían estos campos). Se ejecuta una
  // sola vez por registro: si ya trae id, se respeta tal cual.
  function ensureRecordMeta(list) {
    let changed = false;
    const now = new Date().toISOString();
    const out = (Array.isArray(list) ? list : []).map(item => {
      const copy = { ...item };
      if (!copy.id) { copy.id = crypto.randomUUID(); changed = true; }
      if (!copy.updated_at) { copy.updated_at = now; changed = true; }
      if (typeof copy.deleted !== 'boolean') { copy.deleted = false; changed = true; }
      return copy;
    });
    return { list: out, changed };
  }

  window.RemProData = Object.freeze({
    keys,
    local,
    remote,
    ensureRecordMeta
  });
})();
