/* =========================================================
   SRANK CONFIG — Single source of truth + LRU Cache
   Load TRƯỚC tất cả script khác (không defer)
   ========================================================= */
(function(){
  "use strict";

  /* ---------- 1. LRU Cache + TTL ---------- */
  if (!window.LRUCache) {
    window.LRUCache = function(opts){
      const cfg = opts || {};
      const max = Number(cfg.max) > 0 ? Number(cfg.max) : 500;
      const ttl = Number(cfg.ttl) > 0 ? Number(cfg.ttl) : 0;
      const map = new Map();  // key -> { value, ts }

      const cache = {
        get(key) {
          const e = map.get(key);
          if (!e) return undefined;
          if (ttl && Date.now() - e.ts > ttl) {
            map.delete(key);
            return undefined;
          }
          map.delete(key);
          map.set(key, e);
          return e.value;
        },
        set(key, value) {
          if (map.has(key)) map.delete(key);
          map.set(key, { value, ts: Date.now() });
          if (map.size > max) {
            const oldest = map.keys().next().value;
            map.delete(oldest);
          }
        },
        has(key) {
          return cache.get(key) !== undefined;
        },
        delete(key) {
          return map.delete(key);
        },
        clear() {
          map.clear();
        },
        keys() {
          return Array.from(map.keys())[Symbol.iterator]();
        },
        values() {
          return Array.from(map.values(), e => e.value)[Symbol.iterator]();
        },
        entries() {
          return Array.from(map.entries(), ([k, e]) => [k, e.value])[Symbol.iterator]();
        },
        forEach(fn, thisArg) {
          map.forEach((e, k) => fn.call(thisArg, e.value, k, cache));
        },
        get size() {
          return map.size;
        }
      };
      cache[Symbol.iterator] = cache.entries;
      return cache;
    };
    console.log('[LRU] installed ✓');
  }

  /* ---------- 2. Config ---------- */
  if (window.__SRANK_CONFIG) return;

  window.__SRANK_CONFIG = Object.freeze({
    /* Supabase */
    SUPABASE_URL: 'https://yodvujkylnvzjybvgika.supabase.co',
    SUPABASE_KEY: 'sb_publishable_7D06m2x8CuBWmsUEQi3jMA_edSimUFg',

    /* Business config */
    CHECKIN_RESET_TIME: '00:00',
    CHECKIN_LOCK_TIME:  '21:00',
    BIRTHDAY_RECIPIENT: 'Mỹ Dung',

    /* Timeouts (ms) */
    TIMEOUT: {
      FAST:    8000,
      NORMAL:  12000,
      SLOW:    20000,
      DEFAULT: 12000,
      AVATAR:  5000,
      ADMIN_LOGIN: 45000
    },

    /* Sync intervals (ms) */
    SYNC: {
      CHECKLIST:    30000,
      AUTO:         15000,
      USER_PAUSE:   5000,
      SELF_CHECK:   20000,
      CHAT_POLL:    30000,
      LIVEFEED_POLL: 3000,
      BIRTHDAY_POLL: 5000,
      ATTENDANCE_AUTO: 60000
    },

    /* Cache limits */
    CACHE: {
      MAX_MESSAGES:     200,
      MAX_WISHES:       300,
      MAX_LIVE_EVENTS:  60,
      AVATAR_MAX:       200,
      AVATAR_TTL:       86400000,  // 24h
      IMG_MAX:          100,
      IMG_TTL:          3600000    // 1h
    },

    /* Special lunch gacha */
    LUNCH: {
      SPECIAL_PROB:        0.05,
      SPECIAL_MAX_PER_DAY: 3,
      SPECIAL_ONCE_PER_DAY: true
    }
  });

  console.log('[CONFIG] Loaded ✓', window.__SRANK_CONFIG.SUPABASE_URL);
})();