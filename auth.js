/* =========================================================
   SRANK AUTH — Supabase Auth wrapper
   ---------------------------------------------------------
   - Đăng nhập bằng username ngắn (VD: "tienloi")
     -> Tự động thêm "@daomeo.local" trước khi gọi Supabase
   - Lấy display_name từ user_metadata (đã set qua SQL)
   - Reactive: onChange(cb) fire khi login/logout
   - Cache user vào localStorage để tránh flicker khi F5

   API:
     SRank.Auth.login(username, password) -> Promise<user>
     SRank.Auth.logout()                  -> Promise<void>
     SRank.Auth.refresh()                 -> Promise<user|null>
     SRank.Auth.getCurrentUser()          -> user | null
     SRank.Auth.isLoggedIn()              -> boolean
     SRank.Auth.onChange(cb)              -> unsubscribe fn
     SRank.Auth.normalizeUsername(input)  -> email
   ========================================================= */
(function(){
  "use strict";

  const DOMAIN = '@daomeo.local';
  const CACHE_KEY = 'srank_auth_cached_v1';

  const sb = window.__sb;
  if (!sb || !sb.auth) {
    console.error('[AUTH] window.__sb chưa sẵn sàng — cần load supabase-adapter.js trước auth.js');
    return;
  }
  const auth = sb.auth;

  let _currentUser = null;
  const _listeners = [];
  let _ready = false;
  let _initDone = false;

  /* ---------- Helpers ---------- */

  function normalizeUsername(input){
    const v = String(input || '').trim().toLowerCase();
    if (!v) return '';
    if (v.includes('@')) return v;
    return v + DOMAIN;
  }

  function extractDisplayName(user){
    if (!user) return '';
    const m = user.user_metadata || {};
    return String(m.display_name || m.full_name || m.name || '').trim();
  }

  function buildUser(sbUser){
    if (!sbUser) return null;
    const email = String(sbUser.email || '');
    return {
      id: sbUser.id,
      email: email,
      username: email.split('@')[0] || '',
      displayName: extractDisplayName(sbUser)
    };
  }

  function cacheUser(u){
    try {
      if (u){
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          id: u.id, email: u.email, username: u.username, displayName: u.displayName
        }));
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (_) {}
  }

  function loadCachedUser(){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (!u || typeof u !== 'object' || !u.id) return null;
      return u;
    } catch (_) { return null; }
  }

  function notify(){
    for (let i = 0; i < _listeners.length; i++){
      try { _listeners[i](_currentUser); } catch (e) { console.error('[AUTH] listener error:', e); }
    }
  }

  function translateError(err){
    const msg = String((err && err.message) || err || '').toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Sai tài khoản hoặc mật khẩu';
    if (msg.includes('email not confirmed')) return 'Tài khoản chưa được xác nhận';
    if (msg.includes('too many requests')) return 'Thử quá nhiều lần, chờ 1 phút rồi thử lại';
    if (msg.includes('network') || msg.includes('fetch')) return 'Không kết nối được server — kiểm tra mạng';
    if (msg.includes('user not found')) return 'Tài khoản không tồn tại';
    return (err && err.message) ? String(err.message) : 'Đăng nhập thất bại';
  }

  /* ---------- Public API ---------- */

  async function login(username, password){
    const email = normalizeUsername(username);
    if (!email) throw new Error('Vui lòng nhập tên đăng nhập');
    if (!password) throw new Error('Vui lòng nhập mật khẩu');

    const { data, error } = await auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateError(error));
    if (!data || !data.user) throw new Error('Đăng nhập thất bại — không có user trả về');

    _currentUser = buildUser(data.user);
    cacheUser(_currentUser);
    notify();
    return _currentUser;
  }

  async function logout(){
    try { await auth.signOut(); } catch (_) {}
    _currentUser = null;
    cacheUser(null);
    notify();
  }

  async function refresh(){
    try {
      const { data } = await auth.getSession();
      _currentUser = (data && data.session) ? buildUser(data.session.user) : null;
    } catch (_) {
      _currentUser = null;
    }
    cacheUser(_currentUser);
    return _currentUser;
  }

  function getCurrentUser(){ return _currentUser; }
  function isLoggedIn(){ return !!_currentUser; }

  function onChange(cb){
    if (typeof cb !== 'function') return function(){};
    _listeners.push(cb);
    if (_ready){
      try { cb(_currentUser); } catch (_) {}
    }
    return function unsubscribe(){
      const idx = _listeners.indexOf(cb);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }

  /* ---------- Boot ---------- */

  // Load cache trước để tránh flicker nút "Đăng nhập" khi F5
  _currentUser = loadCachedUser();

  // Listen auth state changes (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED...)
  try {
    auth.onAuthStateChange(function(_event, session){
      _currentUser = session ? buildUser(session.user) : null;
      cacheUser(_currentUser);
      _ready = true;
      if (!_initDone){
        _initDone = true;
        // Fire lần đầu — quan trọng để main.js biết state
      }
      notify();
    });
  } catch (e) {
    console.warn('[AUTH] onAuthStateChange không khả dụng:', e);
  }

  // Fallback: refresh thủ công nếu onAuthStateChange không fire (hiếm)
  setTimeout(function(){
    if (!_initDone){
      refresh().then(function(){
        _ready = true;
        _initDone = true;
        notify();
      }).catch(function(){
        _ready = true;
        _initDone = true;
        notify();
      });
    }
  }, 800);

  /* ---------- Expose ---------- */

  window.SRank = window.SRank || {};
  window.SRank.Auth = {
    login: login,
    logout: logout,
    refresh: refresh,
    getCurrentUser: getCurrentUser,
    isLoggedIn: isLoggedIn,
    onChange: onChange,
    normalizeUsername: normalizeUsername,
    DOMAIN: DOMAIN
  };
})();
