/* =========================================================
   SUPABASE ADAPTER — v3 (FULL)
   Cover: checklist, attendance, admin, livefeed, lunch, chat, quiz
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

  function withTimeout(p, ms, label) {
    return Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout: ' + label)), ms || 15000))
    ]);
  }
  function parseMeta_(m) {
    if (!m) return {};
    if (typeof m === 'object') return m;
    try { return JSON.parse(String(m)); } catch (_) { return {}; }
  }
  function wrapRpc_(data) {
    if (data && data.ok === false) return { ok: false, error: data.error, ts: Date.now() };
    return { ok: true, data: data && data.data !== undefined ? data.data : data, ts: Date.now() };
  }

  async function sbApi(action, params, timeoutMs) {
    params = params || {};
    const t = timeoutMs || 15000;

    try {
      switch (action) {

        /* ============ CHECKLIST ============ */
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
          return wrapRpc_(data);
        }

        /* ============ ATTENDANCE ============ */
        case 'getAttendance': {
          const { data, error } = await withTimeout(
            sb.rpc('rpc_get_attendance', { p_month: Number(params.month) || new Date().getMonth() + 1 }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }
        case 'setAttendance': {
          const { data, error } = await withTimeout(sb.rpc('rpc_set_attendance', {
            p_month: Number(params.month),
            p_days: [Number(params.day)],
            p_name: params.name || '',
            p_status: String(params.status || '')
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
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
          return wrapRpc_(data);
        }
        case 'clearAttendance': {
          const { data, error } = await withTimeout(sb.rpc('rpc_set_attendance', {
            p_month: Number(params.month),
            p_days: [Number(params.day)],
            p_name: params.name || '',
            p_status: ''
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }

        /* ============ LEADERBOARD ============ */
        case 'scoreLeaderboard': {
          const { data, error } = await withTimeout(
            sb.rpc('rpc_score_leaderboard', { p_month: Number(params.month) || new Date().getMonth() + 1 }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }

        /* ============ SETTINGS ============ */
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
          return wrapRpc_(data);
        }

        /* ============ ADMIN ============ */
        case 'adminLogin': {
          const { data, error } = await withTimeout(
            sb.rpc('rpc_admin_login', { p_password: params.password || '' }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'adminSetCheck': {
          const { data, error } = await withTimeout(sb.rpc('rpc_admin_set_check', {
            p_token: params.token || params.password || '',
            p_name: params.name || '',
            p_checked: params.checked === true || params.checked === 'true'
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'resetNow':
        case 'reset': {
          const { data, error } = await withTimeout(sb.rpc('rpc_reset_now', {
            p_token: params.token || params.password || ''
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }

        /* ============ LIVE FEED ============ */
        case 'pushLiveEvent': {
          const { data, error } = await withTimeout(sb.rpc('rpc_push_live_event', {
            p_type: String(params.type || ''),
            p_name: String(params.name || ''),
            p_meta: parseMeta_(params.meta),
            p_client_ts: String(params.clientTs || ''),
            p_client_key: String(params.clientKey || '')
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'getLiveEvents': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_live_events', {
            p_since: Number(params.since) || 0
          }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }

        /* ============ LUNCH ============ */
        case 'getLunchDishes': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_lunch_dishes'), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }
        case 'addLunchDish': {
          const { data, error } = await withTimeout(sb.rpc('rpc_add_lunch_dish', {
            p_name: params.name || '',
            p_category: params.category || 'home'
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'updateLunchDish': {
          const { data, error } = await withTimeout(sb.rpc('rpc_update_lunch_dish', {
            p_id: params.id || null,
            p_name: params.name || ''
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'deleteLunchDish': {
          const { data, error } = await withTimeout(sb.rpc('rpc_delete_lunch_dish', {
            p_id: params.id || null
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }

        /* ============ CHAT ============ */
        case 'sendSecretMessage': {
          const { data, error } = await withTimeout(sb.rpc('rpc_send_secret_message', {
            p_name: params.name || '',
            p_text: params.text || params.message || '',
            p_client_ts: String(params.clientTs || params.clientTime || '')
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'getSecretMessages': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_secret_messages', {
            p_since: Number(params.since) || 0
          }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }

        /* ============ QUIZ ============ */
        case 'quizList': {
          const { data, error } = await withTimeout(sb.rpc('rpc_quiz_list', {
            p_name: params.name || ''
          }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }
        case 'quizAdd': {
          const { data, error } = await withTimeout(sb.rpc('rpc_quiz_add', {
            p_token: params.token || '',
            p_question: params.question || '',
            p_answers: params.answers || '[]',
            p_correct_idx: Number(params.correctIdx) || 0
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'quizUpdate': {
          const { data, error } = await withTimeout(sb.rpc('rpc_quiz_update', {
            p_token: params.token || '',
            p_id: params.id || null,
            p_question: params.question || '',
            p_answers: params.answers || '[]',
            p_correct_idx: Number(params.correctIdx) || 0
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'quizDelete': {
          const { data, error } = await withTimeout(sb.rpc('rpc_quiz_delete', {
            p_token: params.token || '',
            p_id: params.id || null
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'quizSubmit': {
          const { data, error } = await withTimeout(sb.rpc('rpc_quiz_submit', {
            p_name: params.name || '',
            p_answers: params.answers || '{}'
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }
        case 'quizResults': {
          const { data, error } = await withTimeout(sb.rpc('rpc_quiz_results', {
            p_token: params.token || ''
          }), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }

        /* ============ MISC ============ */
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
    if (!window.SRank) { setTimeout(install, 100); return; }
    if (typeof window.SRank.api === 'function' && !window.__srankOriginalApi) {
      window.__srankOriginalApi = window.SRank.api.bind(window.SRank);
    }
    window.SRank.api = sbApi;
    if (window.__srankApi) window.__srankApi = sbApi;
    console.log('[SB] Adapter v3 installed ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 200));
  } else {
    setTimeout(install, 200);
  }

  window.__sb = sb;
  window.__sbApi = sbApi;
})();