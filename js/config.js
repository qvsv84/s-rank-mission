/* =========================================================
   SRANK CONFIG — Single source of truth + LRU Cache
   Load TRƯỚC tất cả script khác (không defer)
   ---------------------------------------------------------
   LRU Cache API (tương thích Map):
     new LRUCache({ max, ttl })
     .get(key)              -> value | undefined  (đẩy lên MRU)
     .peek(key)             -> value | undefined  (KHÔNG đổi recency)
     .set(key, value)       -> void
     .has(key)              -> boolean            (KHÔNG đổi recency)
     .delete(key)           -> boolean
     .clear()               -> void
     .keys()                -> Iterator
     .values()              -> Iterator
     .entries()             -> Iterator
     .forEach(fn, thisArg)  -> void
     .prune()               -> number (số entry hết hạn đã xoá)
     .size                  -> number
     [Symbol.iterator]()    -> Iterator (giống entries)
   ========================================================= */
(function(){
  "use strict";

  /* ---------- 0. Debug flag ----------
     Bật log chi tiết khi cần debug:
       window.__SRANK_DEBUG = true;  (đặt trước khi load file này)
  */
  const DEBUG = !!(typeof window !== 'undefined' && window.__SRANK_DEBUG);
  function log(){
    if (DEBUG && typeof console !== 'undefined' && console.log){
      console.log.apply(console, arguments);
    }
  }

  /* ---------- 1. LRU Cache + TTL ---------- */
  if (!window.LRUCache) {
    /**
     * @constructor
     * @param {{max?:number, ttl?:number}} [opts]
     *   max: số entry tối đa (mặc định 500)
     *   ttl: thời gian sống ms (0 = không hết hạn)
     */
    window.LRUCache = function(opts){
      const cfg = opts || {};
      const max = Number(cfg.max) > 0 ? Math.floor(Number(cfg.max)) : 500;
      const ttl = Number(cfg.ttl) > 0 ? Number(cfg.ttl) : 0;
      const map = new Map();  // key -> { value, ts }

      function isExpired(e){
        return ttl > 0 && (Date.now() - e.ts) > ttl;
      }

      const cache = {
        get(key) {
          const e = map.get(key);
          if (!e) return undefined;
          if (isExpired(e)) {
            map.delete(key);
            return undefined;
          }
          // Promote: xoá rồi set lại để đẩy xuống cuối (MRU)
          map.delete(key);
          map.set(key, e);
          return e.value;
        },

        peek(key) {
          const e = map.get(key);
          if (!e) return undefined;
          if (isExpired(e)) {
            map.delete(key);
            return undefined;
          }
          return e.value;
        },

        set(key, value) {
          if (map.has(key)) map.delete(key);
          map.set(key, { value, ts: Date.now() });
          // Evict LRU (phần tử đầu tiên — cũ nhất)
          if (map.size > max) {
            const oldest = map.keys().next().value;
            map.delete(oldest);
          }
        },

        has(key) {
          const e = map.get(key);
          if (!e) return false;
          if (isExpired(e)) {
            map.delete(key);
            return false;
          }
          return true;
        },

        delete(key) {
          return map.delete(key);
        },

        clear() {
          map.clear();
        },

        keys() {
          return Array.from(map.keys()).values();
        },

        values() {
          return Array.from(map.values(), e => e.value).values();
        },

        entries() {
          return Array.from(map.entries(), ([k, e]) => [k, e.value]).values();
        },

        forEach(fn, thisArg) {
          if (typeof fn !== 'function') {
            throw new TypeError('LRUCache.forEach: callback must be a function');
          }
          map.forEach((e, k) => fn.call(thisArg, e.value, k, cache));
        },

        // Xoá toàn bộ entry đã hết hạn — hữu ích khi cần dọn thủ công
        prune() {
          if (!ttl) return 0;
          const now = Date.now();
          let removed = 0;
          for (const [k, e] of map) {
            if (now - e.ts > ttl) {
              map.delete(k);
              removed++;
            }
          }
          return removed;
        },

        get size() {
          return map.size;
        }
      };

      cache[Symbol.iterator] = function(){ return cache.entries(); };
      return cache;
    };
    log('[LRU] installed ✓');
  }

  /* ---------- 2. Config ---------- */
  if (window.__SRANK_CONFIG) return;

  // Deep freeze — Object.freeze chỉ shallow
  function deepFreeze(obj, seen){
    if (obj === null || typeof obj !== 'object') return obj;
    if (!seen) seen = new WeakSet();
    if (seen.has(obj)) return obj;
    seen.add(obj);
    Object.getOwnPropertyNames(obj).forEach(function(prop){
      const v = obj[prop];
      if (v && typeof v === 'object' && !Object.isFrozen(v)) {
        deepFreeze(v, seen);
      }
    });
    return Object.freeze(obj);
  }

  window.__SRANK_CONFIG = deepFreeze({
    /* Debug flag dùng chung cho toàn app */
    DEBUG: false,

    /* Supabase — publishable key, an toàn khi expose ra client.
       Bảo mật dựa vào RLS (Row Level Security) trên Supabase. */
    SUPABASE_URL: 'https://yodvujkylnvzjybvgika.supabase.co',
    SUPABASE_KEY: 'sb_publishable_7D06m2x8CuBWmsUEQi3jMA_edSimUFg',

    /* Business config */
    CHECKIN_RESET_TIME: '00:00',
    CHECKIN_LOCK_TIME:  '21:00',
    BIRTHDAY_RECIPIENT: 'Mỹ Dung',

    /* Timeouts (ms) */
    TIMEOUT: {
      FAST:        8000,
      NORMAL:      12000,
      SLOW:        20000,
      DEFAULT:     12000,
      AVATAR:      5000,
      ADMIN_LOGIN: 45000
    },

    /* Sync intervals (ms) */
    SYNC: {
      CHECKLIST:       30000,
      AUTO:            15000,
      USER_PAUSE:      5000,
      SELF_CHECK:      20000,
      CHAT_POLL:       30000,
      LIVEFEED_POLL:   3000,
      BIRTHDAY_POLL:   5000,
      ATTENDANCE_AUTO: 60000
    },

    /* Cache limits */
    CACHE: {
      MAX_MESSAGES:    200,
      MAX_WISHES:      300,
      MAX_LIVE_EVENTS: 60,
      AVATAR_MAX:      200,
      AVATAR_TTL:      86400000,  // 24h
      IMG_MAX:         100,
      IMG_TTL:         3600000    // 1h
    },

    /* Special lunch gacha */
    LUNCH: {
      SPECIAL_PROB:         0.05,
      SPECIAL_MAX_PER_DAY:  3,
      SPECIAL_ONCE_PER_DAY: true
    }
  });

  log('[CONFIG] Loaded ✓', window.__SRANK_CONFIG.SUPABASE_URL);
})();
