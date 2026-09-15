(() => {
  'use strict';

  const keys = Object.freeze({
    projects: 'rempro_projects_v1',
    prices: 'rempro_prices_v1',
    rules: 'rempro_rules_v1'
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

  window.RemProData = Object.freeze({
    keys,
    local,
    remote
  });
})();
