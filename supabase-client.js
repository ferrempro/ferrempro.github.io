(() => {
  'use strict';

  const state = {
    client: null,
    ready: false,
    reason: 'not-initialized'
  };

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

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      state.reason = 'sdk-unavailable';
      return null;
    }

    try {
      state.client = window.supabase.createClient(
        config.url,
        config.publishableKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      state.ready = true;
      state.reason = 'ready';
      return state.client;
    } catch (error) {
      state.client = null;
      state.ready = false;
      state.reason = 'initialization-failed';
      console.info(
        'RemPro Supabase baseline unavailable; V1 local mode remains active.'
      );
      return null;
    }
  }

  window.RemProSupabase = Object.freeze({
    initialize,
    getClient: () => state.client,
    get ready() {
      return state.ready;
    },
    get reason() {
      return state.reason;
    }
  });

  initialize();
})();
