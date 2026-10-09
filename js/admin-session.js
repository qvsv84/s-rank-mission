/* =========================================================
   ADMIN SESSION — v2.0
   ---------------------------------------------------------
   Tách khỏi main.js. Quản lý session admin sau khi đăng nhập
   thành công qua RPC rpc_admin_login (server verify password).

   LƯU Ý BẢO MẬT:
     - Password lưu trong localStorage dưới dạng plaintext.
       Rủi ro: XSS có thể đọc được.
     - Đây là "session token tạm" — server vẫn verify lại mỗi
       request admin qua RPC (adminSetCheck, setSettings, ...).
     - RLS + server-side verify là lớp bảo vệ chính.

   v2.0 THAY ĐỔI:
     - Thêm implementation thật cho các stub v1:
         sha256Hex, checkRateLimit, recordFailure/Success,
         checkPasswordLocal, rememberPassword, forgetPassword.
     - Nhưng TẮT bằng USE_STRICT_MODE = false để giữ behavior cũ.
     - Bật USE_STRICT_MODE = true khi muốn:
         • hash password trước khi lưu localStorage
         • rate limit login attempts (local, chống brute force client)
         • verify local trước khi gọi server

   API (không đổi so với v1):
     AdminSession.load()                -> string | null
     AdminSession.save(password)        -> void
     AdminSession.clear()               -> void
     AdminSession.isValid()             -> boolean
     AdminSession.get()                 -> string | null
     AdminSession.checkRateLimit()      -> {allowed, data}
     AdminSession.recordFailure()       -> void
     AdminSession.recordSuccess()       -> void
     AdminSession.forgetPassword()      -> void
     AdminSession.sha256Hex(str)        -> Promise<string>
     AdminSession.checkPasswordLocal(p) -> Promise<boolean> | null
     AdminSession.rememberPassword(p)   -> Promise<void>

   YÊU CẦU:
     - Load SAU config.js, TRƯỚC main.js.
     - main.js dùng AdminSession ở nhiều chỗ (openAdminSettings,
       verifyAdmin, adminToggleCheck, ...).
   ========================================================= */
(function () {
  "use strict";

  if (window.AdminSession) return; // đã load

  /* ---------- Config ---------- */
  const PWD_KEY = "srank_admin_pwd_v1";
  const HASH_KEY = "srank_admin_hash_v1";
  const RL_KEY = "srank_admin_rl_v1";
  const USE_STRICT_MODE = false; // true → hash + rate limit thật

  /* Rate limit config (dùng khi USE_STRICT_MODE = true) */
  const MAX_ATTEMPTS = 5;
  const LOCK_MS = 60 * 1000;        // khoá 60s sau 5 lần sai
  const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // đếm trong 5 phút

  /* ---------- State ---------- */
  let _password = null;

  /* =========================================================
     1. CORE — load/save/clear/isValid/get
     ========================================================= */

  function load() {
    try {
      const raw = localStorage.getItem(PWD_KEY);
      if (raw) {
        _password = String(raw);
        return _password;
      }
    } catch (_) {}
    return null;
  }

  function save(password) {
    _password = String(password || "");
    try {
      localStorage.setItem(PWD_KEY, _password);
      if (USE_STRICT_MODE) {
        // Lưu hash song song để verify offline (không thay plaintext)
        sha256Hex(_password).then(function (h) {
          try { localStorage.setItem(HASH_KEY, h); } catch (_) {}
        }).catch(function () {});
      }
    } catch (_) {}
  }

  function clear() {
    _password = null;
    try {
      localStorage.removeItem(PWD_KEY);
      localStorage.removeItem(HASH_KEY);
    } catch (_) {}
  }

  function isValid() { return !!_password; }
  function get() { return _password; }

  /* =========================================================
     2. RATE LIMIT — chống brute force phía client
     ========================================================= */

  function _readRateLimit() {
    try {
      const raw = localStorage.getItem(RL_KEY);
      if (!raw) return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
      const d = JSON.parse(raw);
      if (!d || typeof d !== "object") return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
      return {
        attempts: Number(d.attempts) || 0,
        firstAttemptAt: Number(d.firstAttemptAt) || 0,
        lockedUntil: Number(d.lockedUntil) || 0
      };
    } catch (_) {
      return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
    }
  }

  function _writeRateLimit(d) {
    try { localStorage.setItem(RL_KEY, JSON.stringify(d)); } catch (_) {}
  }

  /**
   * Kiểm tra xem có được phép thử login admin hay không.
   * @returns {{allowed: boolean, data: {attempts, lockedUntil, remainingMs?}}}
   */
  function checkRateLimit() {
    const now = Date.now();
    const d = _readRateLimit();

    // Đang bị khoá
    if (d.lockedUntil > now) {
      return {
        allowed: false,
        data: {
          attempts: d.attempts,
          lockedUntil: d.lockedUntil,
          remainingMs: d.lockedUntil - now
        }
      };
    }

    // Hết window → reset attempts
    if (d.firstAttemptAt && (now - d.firstAttemptAt) > ATTEMPT_WINDOW_MS) {
      d.attempts = 0;
      d.firstAttemptAt = 0;
      _writeRateLimit(d);
    }

    return { allowed: true, data: { attempts: d.attempts, lockedUntil: 0 } };
  }

  function recordFailure() {
    const now = Date.now();
    const d = _readRateLimit();

    if (!d.firstAttemptAt || (now - d.firstAttemptAt) > ATTEMPT_WINDOW_MS) {
      d.attempts = 1;
      d.firstAttemptAt = now;
    } else {
      d.attempts += 1;
    }

    if (d.attempts >= MAX_ATTEMPTS) {
      d.lockedUntil = now + LOCK_MS;
    }

    _writeRateLimit(d);

    if (USE_STRICT_MODE && window.Toast && d.lockedUntil > now) {
      try {
        Toast.show("Quá nhiều lần thử. Khoá " + Math.ceil(LOCK_MS / 1000) + "s.", {
          type: "warning",
          duration: 3000
        });
      } catch (_) {}
    }
  }

  function recordSuccess() {
    try {
      localStorage.removeItem(RL_KEY);
    } catch (_) {}
  }

  function forgetPassword() { clear(); }

  /* =========================================================
     3. CRYPTO — SHA-256 (SubtleCrypto, fallback stub)
     ========================================================= */

  async function sha256Hex(str) {
    const input = String(str || "");
    if (!input) return "";
    try {
      if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
        const buf = new TextEncoder().encode(input);
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        const bytes = new Uint8Array(hashBuf);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) {
          hex += bytes[i].toString(16).padStart(2, "0");
        }
        return hex;
      }
    } catch (_) {}
    return ""; // không có SubtleCrypto → trả rỗng (như v1)
  }

  /**
   * Verify password với hash đã lưu (offline check).
   * @returns {Promise<boolean>|null}
   *   - null  : chưa có hash → không verify được (fallback về server)
   *   - true  : khớp
   *   - false : sai
   */
  async function checkPasswordLocal(password) {
    try {
      const savedHash = localStorage.getItem(HASH_KEY);
      if (!savedHash) return null;
      const h = await sha256Hex(String(password || ""));
      if (!h) return null;
      return h === savedHash;
    } catch (_) {
      return null;
    }
  }

  /**
   * Ghi nhớ password: save plaintext + lưu hash song song.
   * @returns {Promise<void>}
   */
  async function rememberPassword(password) {
    save(password);
    try {
      const h = await sha256Hex(String(password || ""));
      if (h) localStorage.setItem(HASH_KEY, h);
    } catch (_) {}
  }

  /* =========================================================
     4. EXPORT
     ========================================================= */

  const API = {
    // Core
    load: load,
    save: save,
    clear: clear,
    isValid: isValid,
    get: get,

    // Rate limit
    checkRateLimit: checkRateLimit,
    recordFailure: recordFailure,
    recordSuccess: recordSuccess,
    forgetPassword: forgetPassword,

    // Crypto
    sha256Hex: sha256Hex,
    checkPasswordLocal: checkPasswordLocal,
    rememberPassword: rememberPassword,

    // Meta
    USE_STRICT_MODE: USE_STRICT_MODE,
    _KEYS: { PWD_KEY: PWD_KEY, HASH_KEY: HASH_KEY, RL_KEY: RL_KEY }
  };

  window.AdminSession = API;

  // Auto-load ngay khi script chạy (giống v1 trong main.js)
  API.load();

  console.log("[AdminSession] v2.0 ready ✓ (strict mode: " + (USE_STRICT_MODE ? "ON" : "OFF") + ")");
})();