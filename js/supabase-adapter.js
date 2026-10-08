/* =========================================================
   SUPABASE ADAPTER — v3.3
   ---------------------------------------------------------
   - Dùng __SRANK_CONFIG (load trước từ js/config.js)
   - Override __srankApi NGAY khi load (không chờ DOMContentLoaded)
   - Cover: checklist, attendance, admin, livefeed, lunch, chat, quiz
   ---------------------------------------------------------
   FIX v3.3:
     - withTimeout: clear timer khi promise settle (fix memory leak)
     - withTimeout: cho phép tắt timeout bằng cách truyền 0
     - Setter __srankApi: warn khi có ai cố ghi đè (thay vì silent)
     - Error: giữ nguyên err.code (nếu có) để caller phân biệt lỗi
     - Poll SRank.api: gộp fast/slow thành 1 loop đơn giản
   ---------------------------------------------------------
   YÊU CẦU THỨ TỰ LOAD (index.html):
     1. js/config.js          (sync)
     2. @supabase/supabase-js (sync hoặc defer, MIỄN LÀ trước adapter)
     3. js/supabase-adapter.js (defer)  ← file này
     4. js/main.js            (defer, sau adapter)
   ========================================================= */
(function(){
  "use strict";

  /* ---------- 0. Env checks ---------- */
  const CFG = window.__SRANK_CONFIG;
  if (!CFG) {
    console.error('[SB] __SRANK_CONFIG chưa load — thiếu js/config.js?');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[SB] Supabase JS chưa load — cần load CDN trước adapter');
    return;
  }

  const SUPABASE_URL = CFG.SUPABASE_URL;
  const SUPABASE_KEY = CFG.SUPABASE_KEY;
  const DEFAULT_TIMEOUT_MS = 15000;
  const ADAPTER_VERSION = 'v3.3';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ---------- 1. Helpers ---------- */

  /**
   * Race 1 promise với timeout. Timer được CLEAR khi promise settle
   * để tránh leak (bản cũ để timer chạy tới hết dù promise resolve rồi).
   * @param {Promise|Thenable} p
   * @param {number} ms  - <=0 hoặc null/undefined → không timeout
   * @param {string} label - dùng cho thông báo lỗi
   */
  function withTimeout(p, ms, label) {
    const t = Number(ms);
    if (!t || t <= 0) return Promise.resolve(p);
    return new Promise(function(resolve, reject){
      let settled = false;
      const timer = setTimeout(function(){
        if (settled) return;
        settled = true;
        reject(new Error('Timeout: ' + (label || 'request')));
      }, t);

      Promise.resolve(p).then(
        function(v){
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(v);
        },
        function(e){
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  /** Parse meta: nhận object, JSON string, hoặc garbage → {}. */
  function parseMeta_(m) {
    if (!m) return {};
    if (typeof m === 'object') return m;
    try { return JSON.parse(String(m)); } catch (_) { return {}; }
  }

  /**
   * Chuẩn hoá output RPC có envelope {ok, data|error} thành {ok, data|error}.
   * Nếu RPC trả raw (không có envelope) → bọc thành {ok:true, data:raw}.
   */
  function wrapRpc_(data) {
    if (data && data.ok === false) {
      return { ok: false, error: data.error != null ? data.error : 'Unknown RPC error' };
    }
    return {
      ok: true,
      data: data && data.data !== undefined ? data.data : data
    };
  }

  /** Chuyển error (bất kỳ shape nào) thành string ngắn gọn, không throw. */
  function errToString(err) {
    if (err == null) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err.message) return String(err.message);
    try { return String(err); } catch (_) { return 'Unknown error'; }
  }

  /* ---------- 2. sbApi dispatcher ---------- */

  async function sbApi(action, params, timeoutMs) {
    params = params || {};
    const t = (timeoutMs == null) ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);

    try {
      switch (action) {

        /* ---------- CHECKLIST ---------- */
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

        /* ---------- ATTENDANCE ---------- */
        case 'getAttendance': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_attendance', {
            p_month: Number(params.month) || new Date().getMonth() + 1
          }), t, action);
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

        /* ---------- LEADERBOARD ---------- */
        case 'scoreLeaderboard': {
          const { data, error } = await withTimeout(sb.rpc('rpc_score_leaderboard', {
            p_month: Number(params.month) || new Date().getMonth() + 1
          }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }

        /* ---------- SETTINGS ---------- */
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

        /* ---------- ADMIN ---------- */
        case 'adminLogin': {
          const { data, error } = await withTimeout(sb.rpc('rpc_admin_login', {
            p_password: params.password || ''
          }), t, action);
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

        /* ---------- LIVE FEED ---------- */
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

        /* ---------- LUNCH ---------- */
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

        /* ---------- CHAT ---------- */
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

        /* ---------- BIRTHDAY CHAT ---------- */
        case 'getBirthdayWishes': {
          const { data, error } = await withTimeout(sb.rpc('rpc_get_birthday_wishes', {
            p_since: Number(params.since) || 0
          }), t, action);
          if (error) throw error;
          return { ok: true, data, ts: Date.now() };
        }
        case 'sendBirthdayWish': {
          const rpcParams = {
            p_sender: params.sender || '',
            p_message: params.message || '',
            p_is_from_recipient: !!params.isFromRecipient
          };
          if (params.replyToId) rpcParams.p_reply_to_id = params.replyToId;
          const { data, error } = await withTimeout(
            sb.rpc('rpc_send_birthday_wish', rpcParams), t, action);
          if (error) throw error;
          return wrapRpc_(data);
        }

        /* ---------- QUIZ ---------- */
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

        /* ---------- PING ---------- */
        case 'ping':
          return { ok: true, data: { pong: true, source: 'supabase' }, ts: Date.now() };

        default:
          throw new Error('Action chưa hỗ trợ Supabase: ' + action);
      }

    } catch (err) {
      console.error('[SB]', action, err);
      const out = { ok: false, error: errToString(err) };
      if (err && err.code) out.code = String(err.code);
      return out;
    }
  }

  /* ---------- 3. Lock __srankApi (chặn main.js ghi đè) ---------- */
  try {
    Object.defineProperty(window, '__srankApi', {
      get() { return sbApi; },
      set(v) {
        if (v && v !== sbApi) {
          console.warn('[SB] __srankApi đã bị lock — bỏ qua ghi đè');
        }
      },
      configurable: false,
      enumerable: false
    });
  } catch (e) {
    console.warn('[SB] Không lock được __srankApi, dùng fallback:', e);
    window.__srankApi = sbApi;
  }

  /* ---------- 4. Gán SRank.api (chờ SRank xuất hiện rồi mới gán) ---------- */
  let installedLogged = false;
  function installSRankApi() {
    if (!window.SRank) return;
    if (window.SRank.api !== sbApi) {
      window.SRank.api = sbApi;
      if (!installedLogged) {
        installedLogged = true;
        console.log('[SB] Adapter ' + ADAPTER_VERSION + ' installed ✓');
      }
    }
  }

  // Poll 100ms trong 10s — vừa chờ SRank xuất hiện,
  // vừa re-install nếu main.js lỡ ghi đè SRank.api sau đó.
  const pollId = setInterval(installSRankApi, 100);
  setTimeout(function(){ clearInterval(pollId); }, 10000);

  /* ---------- 5. Expose ---------- */
  window.__sb = sb;
  window.__sbApi = sbApi;
})();
