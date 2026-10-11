/* =========================================================
   ADMIN SESSION — v3.0 (Role-based, no password)
   ---------------------------------------------------------
   v3.0 THAY ĐỔI HOÀN TOÀN:
   - KHÔNG còn password admin
   - isValid() = check role từ Supabase Auth user
   - get() = trả 'ROLE_ADMIN' constant → gửi lên RPC
   - Server RPC verify auth.uid() có role admin
   - save()/clear() = no-op (giữ API để tương thích)

   FLOW:
     1. User login Supabase Auth
     2. Auth metadata có role = 'admin'/'super'/'owner'
     3. AdminSession.isValid() = true → hiện nút Admin
     4. Bấm → vào thẳng panel (không hỏi password)
     5. RPC gửi token='ROLE_ADMIN' → server check auth.uid()

   API (không đổi để tương thích):
     AdminSession.isValid()  → boolean
     AdminSession.get()      → 'ROLE_ADMIN' | null
     AdminSession.save(pwd)  → no-op
     AdminSession.clear()    → no-op
     AdminSession.load()     → void
     ... các method cũ giữ nguyên signature
   ========================================================= */
(function(){
  "use strict";

  if (window.AdminSession) return;

  const ROLE_TOKEN = 'ROLE_ADMIN';
  const ADMIN_ROLES = /admin|super|owner|quản|quan/i;

  /* =========================================================
     HELPERS — Check role từ nhiều nguồn
     ========================================================= */

  function getAuthUser(){
    try {
      const u = window.SRank?.Auth?.getCurrentUser?.();
      if (u) return u;
    } catch(_) {}
    // Fallback: đọc từ localStorage session
    try {
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if (!k || !/^sb-.*-auth-token$/i.test(k)) continue;
        const v = localStorage.getItem(k);
        if (!v) continue;
        try {
          const j = JSON.parse(v);
          const user = j?.user || j?.currentSession?.user || j?.session?.user;
          if (user) return user;
        } catch(_) {}
      }
    } catch(_) {}
    return null;
  }

  function extractRole(user){
    if (!user) return '';
    try {
      const appMeta = user.app_metadata || {};
      const userMeta = user.user_metadata || {};
      return String(
        appMeta.role ||
        userMeta.role ||
        user.role ||
        ''
      ).trim();
    } catch(_) {
      return '';
    }
  }

  function isAdminRole(){
    const user = getAuthUser();
    if (!user) return false;
    const role = extractRole(user);
    if (!role) return false;
    return ADMIN_ROLES.test(role);
  }

  /* =========================================================
     CORE API — giữ signature cũ
     ========================================================= */

  function load() {
    // Không làm gì — role được check on-the-fly
    return isAdminRole() ? ROLE_TOKEN : null;
  }

  function save(_password) {
    // No-op — không lưu gì
    // Vẫn giữ để tương thích với code cũ gọi AdminSession.save()
  }

  function clear() {
    // No-op
  }

  function isValid() {
    return isAdminRole();
  }

  function get() {
    return isAdminRole() ? ROLE_TOKEN : null;
  }

  /* =========================================================
     STUBS — giữ để tương thích với code cũ
     ========================================================= */

  function checkRateLimit() {
    return { allowed: true, data: { attempts: 0, lockedUntil: 0 } };
  }
  function recordFailure() {}
  function recordSuccess() {}
  function forgetPassword() { clear(); }

  async function sha256Hex(str) {
    const input = String(str || '');
    if (!input) return '';
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        const buf = new TextEncoder().encode(input);
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        const bytes = new Uint8Array(hashBuf);
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
          hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
      }
    } catch(_) {}
    return '';
  }

  async function checkPasswordLocal() { return null; }
  async function rememberPassword() {}

  /* =========================================================
     EXPORT
     ========================================================= */

  window.AdminSession = {
    // Core
    load: load,
    save: save,
    clear: clear,
    isValid: isValid,
    get: get,

    // Stubs
    checkRateLimit: checkRateLimit,
    recordFailure: recordFailure,
    recordSuccess: recordSuccess,
    forgetPassword: forgetPassword,
    sha256Hex: sha256Hex,
    checkPasswordLocal: checkPasswordLocal,
    rememberPassword: rememberPassword,

    // Meta
    ROLE_TOKEN: ROLE_TOKEN,
    _isAdminRole: isAdminRole,
    _getAuthUser: getAuthUser,
    _extractRole: extractRole
  };

  // Auto-load
  load();

  console.log('[AdminSession] v3.0 ready ✓ (role-based, no password)');

  // Re-log khi auth state thay đổi
  try {
    if (window.SRank?.Auth?.onChange) {
      window.SRank.Auth.onChange(function(){
        const ok = isAdminRole();
        console.log('[AdminSession] auth change → isAdmin:', ok);
      });
    }
  } catch(_) {}
})();