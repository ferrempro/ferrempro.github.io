// RemPro Control V2 — cliente Supabase con sesión persistente.
// A diferencia de la base V2 original (persistSession:false,
// autoRefreshToken:false, sin pantalla de acceso), este archivo SÍ
// mantiene la sesión entre recargas y expone signIn/signOut para
// que sync.js y app.js puedan usarlos. Si el SDK no carga (sin red) o el
// proyecto no coincide, la app sigue funcionando en modo local: nunca se
// bloquea la interfaz por falta de nube.
(() => {
  'use strict';

  const state = {
    client: null,
    ready: false,
    reason: 'not-initialized',
    session: null,
    listeners: []
  };

  function notify() {
    state.listeners.forEach(fn => {
      try { fn(state.session); } catch (err) { /* no romper por un listener */ }
    });
  }

  function initialize() {
    const config = window.REMPRO_SUPABASE_CONFIG;

    if (
      !config ||
      config.projectRef !== 'rvjjnkrojkpepbcxvevl' ||
      config.url !== 'https://rvjjnkrojkpepbcxvevl.supabase.co'
    ) {
      state.reason = 'invalid-config';
      return null;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      state.reason = 'sdk-unavailable';
      return null;
    }

    try {
      state.client = window.supabase.createClient(
        config.url,
        config.publishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: 'rempro_supabase_auth_v1'
          }
        }
      );

      state.client.auth.getSession().then(({ data }) => {
        state.session = data && data.session ? data.session : null;
        setTimeout(notify, 0);
      });

      state.client.auth.onAuthStateChange((_event, session) => {
        state.session = session || null;
        setTimeout(notify, 0);
      });

      state.ready = true;
      state.reason = 'ready';
      return state.client;
    } catch (error) {
      state.client = null;
      state.ready = false;
      state.reason = 'initialization-failed';
      console.info('RemPro Supabase no disponible; el modo local sigue activo.');
      return null;
    }
  }

  async function signIn(email, password) {
    if (!state.client) throw new Error('Sin conexión a Supabase todavía.');
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.session = data.session;
    notify();
    return data.session;
  }

  async function signOut() {
    if (!state.client) return;
    const { error } = await state.client.auth.signOut();
    if (error) throw error;
    state.session = null;
    notify();
  }

  window.RemProSupabase = Object.freeze({
    initialize,
    getClient: () => state.client,
    get ready() { return state.ready; },
    get reason() { return state.reason; },
    get session() { return state.session; },
    signIn,
    signOut,
    onAuthChange(fn) {
      state.listeners.push(fn);
      // Notifica de inmediato con el estado actual conocido.
      fn(state.session);
      return () => {
        state.listeners = state.listeners.filter(f => f !== fn);
      };
    }
  });

  initialize();
})();
