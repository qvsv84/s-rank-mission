/* =========================================================
   SRANK CONFIG — Single source of truth
   Load TRƯỚC tất cả script khác (không defer)
   ========================================================= */
(function(){
  "use strict";

  if (window.__SRANK_CONFIG) return; // idempotent

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