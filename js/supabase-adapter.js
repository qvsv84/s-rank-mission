/* =========================================================
   SUPABASE ADAPTER — Override SRank.api
   Load file này SAU main.js, TRƯỚC các module khác
   ========================================================= */
(function(){
  "use strict";

  const SUPABASE_URL = 'https://yodvujkylnvzjybvgika.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_7D06m2x8CuBWmsUEQi3jMA_edSimUFg';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[SB] Supabase JS chưa load');
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: ' + label)), ms || 15000))
    ]);
  }

  async function sbApi(action, params, timeoutMs) {
    params = params || {};
    const t = timeoutMs || 15000;

    try {
      let raw;

      switch (action) {
        case 'getData': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_data'), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }

        case 'checkin': {
          const { data, error } = await withTimeout(sb.rpc('rpc_checkin', {
            p_name: params.name || '',
            p_client_time: String(params.clientTime || '')
          }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'getAttendance': {
          const { data, error } = await withTimeout(
            sb.rpc('rpc_get_attendance', { p_month: Number(params.month) || new Date().getMonth() + 1 }), t, action);
          if (error) throw error;
          return { ok: true, data: data, ts: Date.now() };
        }

        case 'setAttendance': {
          const { data, error } = await withTimeout(sb.rpc('rpc_set_attendance', {
            p_month: Number(params.month),
            p_days: [Number(params.day)],
            p_name: params.name || '',
            p_status: String(params.status || '')
          }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'setAttendanceBatch': {
          const days = Array.isArray(params.days) ? params.days.map(Number) : [];
          const { data, error } = await withTimeout(sb.rpc('rpc_set_attendance', {
            p_month: Number(params.month),
            p_days: days,
            p_name: params.name || '',
            p_status: String(params.status || '')
          }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'clearAttendance': {
          const { data, error } = await withTimeout(sb.rpc('rpc_set_attendance', {
            p_month: Number(params.month),
            p_days: [Number(params.day)],
            p_name: params.name || '',
            p_status: ''
          }), t, action);
          if (error) throw error;
          return { ok: true, data: data && data.data, ts: Date.now() };
        }

        case 'scoreLeaderboard': {
          const { data, error } = await withTimeout(
            sb.rpc('rpc_score_leaderboard', { p_month: Number(params.month) || new Date().getMonth() + 1 }), t, action);
          if (error) throw error;
          return { ok: true, data: data, ts: Date.now() };
        }

        case 'getSettings': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_settings'), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }

        case 'setSettings': {
          const { data, error } = await withTimeout(sb.rpc('rpc_set_settings', {
            p_token: params.token || params.password || '',
            p_reset: params.resetTime || '00:00',
            p_lock: params.checklistLockTime || '21:00'
          }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'adminLogin': {
          const { data, error } = await withTimeout(
            sb.rpc('rpc_admin_login', { p_password: params.password || '' }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'adminSetCheck': {
          const { data, error } = await withTimeout(sb.rpc('rpc_admin_set_check', {
            p_token: params.token || params.password || '',
            p_name: params.name || '',
            p_checked: params.checked === true || params.checked === 'true'
          }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'resetNow':
        case 'reset': {
          const { data, error } = await withTimeout(sb.rpc('rpc_reset_now', {
            p_token: params.token || params.password || ''
          }), t, action);
          if (error) throw error;
          return data && data.ok === false
            ? { ok: false, error: data.error }
            : { ok: true, data: data.data, ts: Date.now() };
        }

        case 'ping':
          return { ok: true, data: { pong: true, source: 'supabase' }, ts: Date.now() };

        default: {
          if (typeof window.__srankOriginalApi === 'function') {
            return await window.__srankOriginalApi(action, params, t);
          }
          throw new Error('Action chưa hỗ trợ Supabase: ' + action);
        }
      }
    } catch (err) {
      console.error('[SB]', action, err);
      return { ok: false, error: String(err.message || err) };
    }
  }

  function install() {
    if (!window.SRank) {
      setTimeout(install, 100);
      return;
    }

    if (typeof window.SRank.api === 'function' && !window.__srankOriginalApi) {
      window.__srankOriginalApi = window.SRank.api.bind(window.SRank);
    }

    window.SRank.api = sbApi;
    if (window.__srankApi) window.__srankApi = sbApi;

    console.log('[SB] Adapter installed ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 200));
  } else {
    setTimeout(install, 200);
  }

  window.__sb = sb;
  window.__sbApi = sbApi;
})();