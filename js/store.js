/* =========================================================
   STORE — v1.0
   ---------------------------------------------------------
   Persistence layer + helpers cho checklist state.
   Tách khỏi main.js để:
     - Tập trung logic cache vào 1 chỗ
     - Timezone Asia/Ho_Chi_Minh xử lý 1 nơi duy nhất
     - Rank thresholds không rải rác nhiều file
     - main.js giảm ~200 dòng

   KIẾN TRÚC:
     - Store KHÔNG giữ array state (names[], checked[]...).
       main.js vẫn sở hữu array, Store chỉ:
         • validate schema khi load
         • debounce save (requestIdleCallback)
         • expose time/rank helpers

   API:
     // Constants
     Store.SCHEMA_VERSION                 -> number
     Store.CACHE_KEY                      -> string

     // Time helpers (timezone Asia/Ho_Chi_Minh)
     Store.todayKey()                     -> "YYYY-MM-DD"
     Store.yesterdayKey()                 -> "YYYY-MM-DD"
     Store.dayKeyOf(ts)                   -> "YYYY-MM-DD"
     Store.nowHHMM()                      -> "HH:MM"
     Store.isValid24hTime(str)            -> boolean

     // Rank helpers
     Store.rankClient(score)              -> "B"|"A"|"S"|"SS"|"SSS"
     Store.normalizeServerRank(r, score)  -> same

     // Cache
     Store.loadCache()                    -> {names,checked,times,points,ranks,day} | null
     Store.saveCache(state)               -> void (immediate)
     Store.scheduleSave(getStateFn)       -> void (debounced)
     Store.flushSave(getStateFn)          -> void (force write now)
     Store.clearCache()                   -> void

   YÊU CẦU:
     - Load SAU config.js, TRƯỚC main.js.
     - Không phụ thuộc module nào khác (ngoài Intl built-in).
   ========================================================= */
(function () {
  "use strict";

  if (window.Store) return; // đã load

  /* =========================================================
     1. CONSTANTS
     ========================================================= */

  const SCHEMA_VERSION = 7;
  const CACHE_KEY = "srank_check_v" + SCHEMA_VERSION;
  const TZ = "Asia/Ho_Chi_Minh";

  /* Rank thresholds (đồng bộ với rankClient trong main.js cũ) */
  const RANK_THRESHOLDS = [
    { min: 340, rank: "SSS" },
    { min: 240, rank: "SS"  },
    { min: 180, rank: "S"   },
    { min: 100, rank: "A"   }
  ];
  const VALID_RANKS = ["B", "A", "S", "SS", "SSS", "VIP"];

  /* =========================================================
     2. TIME HELPERS (timezone Asia/Ho_Chi_Minh)
     ========================================================= */

  function _dtParts(ts) {
    const d = (ts == null) ? new Date() : new Date(ts);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(d);
  }

  function _pick(parts, type) {
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === type) return parts[i].value || "";
    }
    return "";
  }

  function dayKeyOf(ts) {
    const p = _dtParts(ts);
    return _pick(p, "year") + "-" + _pick(p, "month") + "-" + _pick(p, "day");
  }

  function todayKey() {
    return dayKeyOf(Date.now());
  }

  function yesterdayKey() {
    return dayKeyOf(Date.now() - 86400000);
  }

  function nowHHMM() {
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date());
    } catch (_) {
      const d = new Date();
      return String(d.getHours()).padStart(2, "0") + ":" +
             String(d.getMinutes()).padStart(2, "0");
    }
  }

  function isValid24hTime(v) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "").trim());
  }

  /* =========================================================
     3. RANK HELPERS
     ========================================================= */

  function rankClient(value) {
    const score = Number(value) || 0;
    for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
      if (score >= RANK_THRESHOLDS[i].min) return RANK_THRESHOLDS[i].rank;
    }
    return "B";
  }

  function normalizeServerRank(value, score) {
    const r = String(value || "").trim().toUpperCase();
    return VALID_RANKS.indexOf(r) >= 0 ? r : rankClient(score);
  }

  /* =========================================================
     4. CACHE — LOAD
     ========================================================= */

  /**
   * Đọc cache từ localStorage.
   * @returns {{names, checked, times, points, ranks, day}|null}
   *   - Trả null nếu: không có cache / schema cũ / khác ngày / lỗi parse.
   *   - Trả object đã validate: names là mảng string, các mảng khác
   *     được cắt/pad đúng length.
   */
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      const x = JSON.parse(raw);
      if (!x || x.v !== SCHEMA_VERSION) {
        // Schema cũ → xoá
        try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
        return null;
      }

      // Khác ngày → xoá (main.js sẽ tự reset state)
      if (x.day !== todayKey()) {
        try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
        return null;
      }

      if (!Array.isArray(x.names) || !Array.isArray(x.checked)) {
        try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
        return null;
      }

      const names = x.names
        .filter(function (n) { return typeof n === "string" && n.trim(); });

      if (!names.length) {
        try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
        return null;
      }

      const L = names.length;

      const checked = x.checked
        .slice(0, L)
        .map(function (c) { return c === true; });

      const times = Array.isArray(x.times)
        ? x.times.slice(0, L).map(function (t) {
            return typeof t === "string" ? t : "";
          })
        : names.map(function () { return ""; });

      const points = Array.isArray(x.points)
        ? x.points.slice(0, L).map(function (p) {
            const n = Number(p);
            return Number.isFinite(n) ? n : 0;
          })
        : names.map(function () { return 0; });

      const ranks = points.map(rankClient);

      return {
        names: names,
        checked: checked,
        times: times,
        points: points,
        ranks: ranks,
        day: x.day || todayKey()
      };
    } catch (_) {
      try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
      return null;
    }
  }

  /* =========================================================
     5. CACHE — SAVE
     ========================================================= */

  /**
   * Ghi cache ngay lập tức (blocking).
   * @param {{names,checked,times,points,ranks,day?}} state
   */
  function saveCache(state) {
    if (!state || !Array.isArray(state.names)) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        v: SCHEMA_VERSION,
        names: state.names,
        checked: state.checked || [],
        times: state.times || [],
        points: state.points || [],
        ranks: state.ranks || [],
        day: state.day || todayKey(),
        ts: Date.now()
      }));
    } catch (_) {
      // localStorage đầy → xoá để nhường chỗ
      try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
    }
  }

  /* =========================================================
     6. CACHE — SCHEDULED (debounced qua requestIdleCallback)
     ========================================================= */

  let _timer = null;
  let _dirty = false;
  let _getStateFn = null;

  function _doWrite() {
    if (!_dirty || !_getStateFn) return;
    _dirty = false;
    try {
      const state = _getStateFn();
      saveCache(state);
    } catch (_) {}
  }

  /**
   * Lên lịch ghi cache (debounced). Chỉ ghi khi browser rảnh.
   * @param {Function} getStateFn — callback trả về state object.
   */
  function scheduleSave(getStateFn) {
    if (typeof getStateFn === "function") _getStateFn = getStateFn;
    _dirty = true;

    if (_timer) return;

    const idle = window.requestIdleCallback ||
      function (cb) { return setTimeout(function () { cb({ didTimeout: false }); }, 250); };

    _timer = idle(function () {
      _timer = null;
      if (_dirty) _doWrite();
    });
  }

  /**
   * Force ghi cache ngay (dùng trong beforeunload).
   * @param {Function} [getStateFn]
   */
  function flushSave(getStateFn) {
    if (typeof getStateFn === "function") _getStateFn = getStateFn;
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    _dirty = true;
    _doWrite();
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
    _dirty = false;
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
  }

  /* =========================================================
     7. EXPORT
     ========================================================= */

  window.Store = {
    // Constants
    SCHEMA_VERSION: SCHEMA_VERSION,
    CACHE_KEY: CACHE_KEY,
    TIMEZONE: TZ,
    RANK_THRESHOLDS: RANK_THRESHOLDS,
    VALID_RANKS: VALID_RANKS,

    // Time
    todayKey: todayKey,
    yesterdayKey: yesterdayKey,
    dayKeyOf: dayKeyOf,
    nowHHMM: nowHHMM,
    isValid24hTime: isValid24hTime,

    // Rank
    rankClient: rankClient,
    normalizeServerRank: normalizeServerRank,

    // Cache
    loadCache: loadCache,
    saveCache: saveCache,
    scheduleSave: scheduleSave,
    flushSave: flushSave,
    clearCache: clearCache
  };

  console.log("[Store] v1.0 ready ✓ (schema v" + SCHEMA_VERSION + ")");
})();