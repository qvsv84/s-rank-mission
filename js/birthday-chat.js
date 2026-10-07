/* =========================================================
   BIRTHDAY CHAT — v2.2
   - Reply nằm GỌN trong card wish (nested replies)
   - Card tự mở rộng để chứa reply
   - Input inline cũng nằm trong card
   ========================================================= */
(function(){
  "use strict";
  if (window.__birthdayChatLoaded) return;
  window.__birthdayChatLoaded = true;

  const SUPABASE_URL = 'https://yodvujkylnvzjybvgika.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_7D06m2x8CuBWmsUEQi3jMA_edSimUFg';
  const RECIPIENT = 'Mỹ Dung';
  const OWNER_PASSWORD = '0810';
  const POLL_MS = 5000;
  const MAX_WISHES = 300;
  const LAST_PICKED_KEY = 'srank_last_picked_name_v1';
  const UNREAD_KEY = 'srank_birthday_unread_v1';
  const OWNER_KEY = 'srank_birthday_owner_v1';

  const PRESET_WISHES = [
    { group: '🌸 Yêu thương', text: 'Chúc Mỹ Dung sinh nhật vui vẻ, luôn xinh đẹp và hạnh phúc 🎂' },
    { group: '🌸 Yêu thương', text: 'Happy birthday Mỹ Dung! Tuổi mới ngập tràn yêu thương và niềm vui' },
    { group: '🌸 Yêu thương', text: 'Chúc Mỹ Dung tuổi mới an nhiên, bình yên và tràn đầy yêu thương 🌸' },
    { group: '🌸 Yêu thương', text: 'Chúc mừng sinh nhật! Mong Mỹ Dung mãi tỏa sáng như ánh nến lung linh ✨' },
    { group: '😄 Vui vẻ', text: 'Sinh nhật vui vẻ! Chúc Mỹ Dung mãi mãi 18 tuổi nha 😆' },
    { group: '😄 Vui vẻ', text: 'Happy birthday! Tuổi mới ngày càng giàu, ngày càng xinh 💖' },
    { group: '😄 Vui vẻ', text: 'Chúc Mỹ Dung sinh nhật vui vẻ, cười tươi cả ngày nha 🥳' },
    { group: '😄 Vui vẻ', text: 'Chúc mừng sinh nhật! Chúc Mỹ Dung năm nay đạt được mọi điều ước 🎁' },
    { group: '💪 Ý nghĩa', text: 'Chúc Mỹ Dung tuổi mới thật nhiều sức khỏe, thành công trong công việc' },
    { group: '💪 Ý nghĩa', text: 'Happy birthday! Mong Mỹ Dung luôn vững vàng và tỏa sáng trên mọi hành trình' },
    { group: '💪 Ý nghĩa', text: 'Chúc mừng sinh nhật! Mong mọi điều tốt đẹp nhất sẽ đến với Mỹ Dung' },
    { group: '💪 Ý nghĩa', text: 'Tuổi mới, chúc Mỹ Dung gặp nhiều may mắn và niềm vui bất ngờ 🍀' }
  ];

  const S = {
    wishes: [],
    lastTs: 0,
    myName: '',
    pageOpen: false,
    pollTimer: null,
    pollInFlight: false,
    unread: 0,
    sending: false,
    booted: false,
    isOwner: false,
    inlineReplyToId: null,
    inlineSending: false,
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const log = (...a) => console.log('[BD]', ...a);
  const pad = n => String(n).padStart(2,'0');
  const getInitial = n => { const s = String(n || '').trim(); return s ? s.slice(0,1).toUpperCase() : '?'; };
  const formatTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const formatDay = ts => {
    const d = new Date(ts), now = new Date();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Hôm nay';
    if (diff === 1) return 'Hôm qua';
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(d);
  };
  const sameDay = (a, b) => {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
  };
  const getAvatarUrl = n => {
    try { if (typeof window.getAvatarUrl === 'function') return window.getAvatarUrl(n) || ''; } catch(_){}
    return '';
  };
  const getAllNames = () => {
    try {
      const s = window.__getChecklistState && window.__getChecklistState();
      if (s && Array.isArray(s.names) && s.names.length) return s.names.slice();
    } catch(_){}
    return [];
  };
  const loadMyName = () => {
    try { const v = String(localStorage.getItem(LAST_PICKED_KEY) || '').trim(); if (v) return v; } catch(_){}
    const n = getAllNames();
    return n.length ? n[0] : '';
  };
  const saveMyName = n => {
    S.myName = String(n || '').trim();
    try { localStorage.setItem(LAST_PICKED_KEY, S.myName); } catch(_){}
  };

  async function rpc(name, params, timeout) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${name}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || 12000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params || {}),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 200));
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /* ============ CSS ============ */
  function injectStyles() {
    if ($('bdStyles')) return;

    const oldStyle = document.createElement('style');
    oldStyle.id = 'bdHideOldChat';
    oldStyle.textContent = '#secretMailBtn{display:none !important;visibility:hidden !important;pointer-events:none !important;opacity:0 !important;}';
    document.head.appendChild(oldStyle);

    const style = document.createElement('style');
    style.id = 'bdStyles';
    style.textContent = `
#bdFab {
  position: fixed; right: 18px;
  bottom: max(24px, calc(18px + env(safe-area-inset-bottom)));
  z-index: 20600;
  min-width: 120px; height: 56px;
  padding: 0 18px 0 14px;
  border: 0; border-radius: 28px;
  background: linear-gradient(135deg, #ff7db5 0%, #e05b9e 40%, #c04a90 100%);
  color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 950;
  letter-spacing: .02em;
  display: flex; align-items: center; gap: 8px;
  cursor: pointer;
  box-shadow: 0 14px 32px -8px rgba(216,91,158,.55), 0 4px 10px -2px rgba(140,40,100,.3), inset 0 1px 0 rgba(255,255,255,.35);
  animation: bdFabPulse 2.6s ease-in-out infinite;
  transition: transform .18s ease;
}
#bdFab:active { transform: scale(.94); }
#bdFab.hidden { display: none !important; }
@keyframes bdFabPulse {
  0%,100% { box-shadow: 0 14px 32px -8px rgba(216,91,158,.55), 0 4px 10px -2px rgba(140,40,100,.3), inset 0 1px 0 rgba(255,255,255,.35); }
  50%     { box-shadow: 0 14px 40px -6px rgba(216,91,158,.85), 0 6px 14px -2px rgba(140,40,100,.4), inset 0 1px 0 rgba(255,255,255,.5); }
}
#bdFab .bd-fab-icon { font-size: 22px; line-height: 1; }
#bdFab .bd-fab-badge {
  position: absolute; top: -6px; right: -6px;
  min-width: 22px; height: 22px; padding: 0 6px;
  border-radius: 11px; background: #fff; color: #c04a90;
  font-size: 11px; font-weight: 950;
  display: none; align-items: center; justify-content: center;
  box-shadow: 0 4px 10px rgba(180,60,120,.4);
}
#bdFab .bd-fab-badge.show { display: flex; }

#bdPage {
  position: fixed; inset: 0;
  z-index: 20900;
  display: none; flex-direction: column;
  background:
    radial-gradient(circle at 15% 0%, rgba(255,214,232,.55), transparent 42%),
    radial-gradient(circle at 88% 100%, rgba(255,240,200,.5), transparent 44%),
    linear-gradient(180deg, #fff8fc 0%, #fffaf2 100%);
  color: #4a2a3a;
  font-family: var(--font, ui-rounded, system-ui);
  overflow: hidden;
}
#bdPage.show { display: flex; }

.bd-head {
  flex: 0 0 auto;
  display: grid; grid-template-columns: 44px 1fr auto;
  align-items: center; gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
  background: linear-gradient(135deg, rgba(255,240,248,.97), rgba(255,250,235,.97));
  backdrop-filter: blur(20px) saturate(120%);
  -webkit-backdrop-filter: blur(20px) saturate(120%);
  border-bottom: 1px solid rgba(255,158,199,.35);
  box-shadow: 0 4px 20px rgba(255,120,180,.12);
  z-index: 10;
}
.bd-head-btn {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid rgba(255,158,199,.4);
  border-radius: 14px;
  background: rgba(255,255,255,.9);
  color: #c04a90; font-size: 20px; font-weight: 900;
  cursor: pointer;
  transition: all .15s ease;
}
.bd-head-btn:active { transform: scale(.94); }
.bd-head-center { min-width: 0; display: flex; align-items: center; gap: 10px; }
.bd-head-avatar {
  position: relative;
  width: 42px; height: 42px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ffd6e8, #ffb0d5);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 950; color: #fff;
  border: 2px solid #fff;
  box-shadow: 0 3px 10px rgba(216,91,158,.25);
  overflow: visible;
}
.bd-head-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
.bd-head-cake {
  position: absolute; bottom: -4px; right: -4px;
  font-size: 18px;
  filter: drop-shadow(0 2px 3px rgba(180,60,120,.3));
  animation: bdCakeBob 2.2s ease-in-out infinite;
}
@keyframes bdCakeBob { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-3px) rotate(6deg); } }
.bd-head-info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.bd-head-title {
  font-size: 14.5px; font-weight: 950;
  color: #c04a90; letter-spacing: .01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bd-head-sub {
  font-size: 10.5px; font-weight: 800;
  color: #e05b9e;
  display: flex; align-items: center; gap: 4px;
}
.bd-head-sub .dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #ff7db5;
  animation: bdPulse 2s ease-in-out infinite;
}
@keyframes bdPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: .6; } }

.bd-body {
  flex: 1 1 auto;
  overflow-y: auto; overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 14px 12px 120px;
  display: flex; flex-direction: column; gap: 10px;
}
.bd-body::-webkit-scrollbar { width: 4px; }
.bd-body::-webkit-scrollbar-thumb { background: rgba(255,158,199,.4); border-radius: 2px; }
.bd-body > * { flex-shrink: 0; }

.bd-day-divider {
  align-self: center; margin: 12px 0 4px;
  padding: 4px 14px;
  background: rgba(255,255,255,.85);
  border: 1px solid rgba(255,158,199,.35);
  border-radius: 999px;
  color: #c04a90;
  font-size: 10.5px; font-weight: 900;
  letter-spacing: .08em; text-transform: uppercase;
}

.bd-empty { padding: 60px 24px; text-align: center; color: #c9a0b8; }
.bd-empty-emoji { font-size: 64px; margin-bottom: 10px; opacity: .7; }
.bd-empty-title { font-size: 15px; font-weight: 900; color: #c04a90; margin-bottom: 4px; }
.bd-empty-sub { font-size: 12px; font-weight: 700; line-height: 1.5; }

/* ===== WISH CARD ===== */
.bd-wish {
  position: relative;
  align-self: flex-start;
  max-width: 92%;
  padding: 14px 16px 12px;
  border-radius: 18px 18px 18px 4px;
  background:
    radial-gradient(circle at 100% 0%, rgba(255,180,210,.55), transparent 30%),
    linear-gradient(140deg, #fff8fc 0%, #fff0e0 100%);
  border: 1.5px solid rgba(255,158,199,.45);
  box-shadow: 0 6px 18px -10px rgba(216,91,158,.35);
  animation: bdWishIn .4s ease-out both;
}
.bd-wish.me {
  align-self: flex-end;
  border-radius: 18px 18px 4px 18px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255,180,210,.55), transparent 30%),
    linear-gradient(140deg, #ffe4f5 0%, #ffd0e5 100%);
  border-color: rgba(216,91,158,.65);
  box-shadow: 0 8px 24px -10px rgba(216,91,158,.55), 0 0 20px rgba(255,180,210,.35);
}
@keyframes bdWishIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

.bd-wish-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.bd-wish.me .bd-wish-head { flex-direction: row-reverse; }

.bd-wish-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ffd6e8, #ffb0d5);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 950; color: #fff;
  border: 2px solid #fff;
  box-shadow: 0 3px 8px rgba(216,91,158,.25);
  overflow: hidden;
}
.bd-wish-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

.bd-wish-name {
  flex: 1; min-width: 0;
  font-size: 13.5px; font-weight: 950;
  color: #c04a90;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bd-wish.me .bd-wish-name { text-align: right; }

.bd-wish-icon {
  font-size: 22px; flex: 0 0 auto;
  filter: drop-shadow(0 2px 3px rgba(216,91,158,.3));
}

.bd-wish-message {
  font-size: 14.5px; font-weight: 650;
  line-height: 1.5; color: #4a2a3a;
  white-space: pre-wrap; word-break: break-word;
  padding-left: 46px;
  padding-right: 0;
  text-align: left;
}
.bd-wish.me .bd-wish-message {
  padding-left: 0;
  padding-right: 46px;
  text-align: right;
}

.bd-wish-foot {
  margin-top: 8px;
  padding-left: 46px;
  padding-right: 0;
  font-size: 10.5px; font-weight: 800;
  color: #c9a0b8;
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
}
.bd-wish.me .bd-wish-foot {
  padding-left: 0;
  padding-right: 46px;
  justify-content: flex-end;
}

.bd-wish-tag {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px; font-weight: 900;
  letter-spacing: .04em;
}
.bd-wish-tag.special {
  background: linear-gradient(135deg, #ff7db5, #c04a90);
  color: #fff;
}

/* ===== REPLIES BLOCK — nằm trong card ===== */
.bd-wish-replies {
  margin-top: 12px;
  padding-left: 46px;            /* thẳng hàng với message */
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}
/* Viền trái hồng phân biệt nested */
.bd-wish-replies::before {
  content: '';
  position: absolute;
  left: 20px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, transparent, rgba(216,91,158,.35) 15%, rgba(216,91,158,.35) 85%, transparent);
  border-radius: 2px;
}

/* Mỗi reply trong card */
.bd-reply-nested {
  padding: 9px 12px;
  border-radius: 12px;
  background: linear-gradient(140deg, rgba(255,240,250,.95) 0%, rgba(255,220,240,.95) 100%);
  border: 1px solid rgba(216,91,158,.35);
  animation: bdWishIn .35s ease-out both;
}
.bd-reply-nested-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.bd-reply-nested-avatar {
  width: 20px; height: 20px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ffd6e8, #ffb0d5);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 950; color: #fff;
  border: 1.5px solid #fff;
  overflow: hidden;
}
.bd-reply-nested-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bd-reply-nested-arrow {
  font-size: 11px;
  color: #c04a90;
  opacity: .7;
}
.bd-reply-nested-name {
  font-size: 11px; font-weight: 950;
  color: #c04a90;
  white-space: nowrap;
}
.bd-reply-nested-time {
  margin-left: auto;
  font-size: 9.5px; font-weight: 800;
  color: #c9a0b8;
}
.bd-reply-nested-message {
  font-size: 13px; font-weight: 650;
  line-height: 1.45;
  color: #4a2a3a;
  white-space: pre-wrap; word-break: break-word;
}

/* ===== ACTION + INLINE INPUT ===== */
.bd-wish-actions {
  margin-top: 10px;
  padding-left: 46px;
}
.bd-wish.me .bd-wish-actions {
  padding-left: 0;
  padding-right: 46px;
  display: flex;
  justify-content: flex-end;
}

.bd-reply-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1.5px solid rgba(216,91,158,.5);
  background: linear-gradient(135deg, #fff5fa, #ffe6f2);
  color: #c04a90;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 950;
  letter-spacing: .02em;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .2s ease, background .2s ease;
  box-shadow: 0 3px 10px -4px rgba(216,91,158,.3);
}
.bd-reply-btn:active {
  transform: scale(.95);
  background: linear-gradient(135deg, #ffe6f2, #ffd0e5);
}
.bd-reply-btn .bd-reply-icon { font-size: 13px; line-height: 1; }

/* Inline reply input — nằm trong card */
.bd-inline-reply {
  margin-top: 8px;
  padding-left: 46px;
  animation: bdWishIn .3s ease-out both;
}
.bd-wish.me .bd-inline-reply {
  padding-left: 0;
  padding-right: 46px;
}
.bd-inline-reply-wrap {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 6px 6px 12px;
  border-radius: 14px;
  background: linear-gradient(140deg, rgba(255,240,250,.95), rgba(255,220,240,.95));
  border: 1.5px solid rgba(216,91,158,.5);
  box-shadow: 0 4px 12px -8px rgba(216,91,158,.4);
}
.bd-inline-input {
  flex: 1;
  min-height: 26px;
  max-height: 80px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: #4a2a3a;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.4;
  outline: none;
  resize: none;
  overflow-y: auto;
}
.bd-inline-input::placeholder {
  color: #d0a8c0;
  font-style: italic;
}
.bd-inline-send {
  width: 32px; height: 32px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffa5d0, #ff7db5);
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 10px -4px rgba(255,120,180,.55);
  transition: transform .15s ease, opacity .15s ease;
}
.bd-inline-send:active { transform: scale(.9); }
.bd-inline-send:disabled { opacity: .4; pointer-events: none; }
.bd-inline-cancel {
  width: 28px; height: 28px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,.75);
  color: #c04a90;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease;
}
.bd-inline-cancel:active { transform: scale(.9); }
.bd-inline-error {
  margin-top: 6px;
  padding-left: 46px;
  font-size: 11px;
  font-weight: 800;
  color: #e05b5b;
}

/* Composer */
.bd-composer {
  position: absolute; left: 0; right: 0; bottom: 0;
  z-index: 20;
  display: grid; grid-template-columns: 52px 1fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: rgba(255,255,255,.97);
  backdrop-filter: blur(20px) saturate(120%);
  -webkit-backdrop-filter: blur(20px) saturate(120%);
  border-top: 1px solid rgba(255,158,199,.3);
  box-shadow: 0 -4px 24px rgba(255,120,180,.1);
}
.bd-gift-btn {
  width: 52px; height: 52px;
  border: 0; border-radius: 16px;
  background: linear-gradient(135deg, #ff7db5 0%, #c04a90 100%);
  color: #fff; font-size: 24px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 14px -6px rgba(216,91,158,.55);
  transition: transform .15s ease;
}
.bd-gift-btn:active { transform: scale(.92); }
.bd-composer-inner { display: flex; align-items: flex-end; gap: 8px; }
.bd-input {
  flex: 1; min-height: 44px; max-height: 100px;
  padding: 10px 14px;
  border: 1.5px solid rgba(255,158,199,.4);
  border-radius: 22px;
  background: #fff; color: #4a2a3a;
  font-family: inherit; font-size: 15px; font-weight: 650;
  outline: none; resize: none; overflow-y: auto;
}
.bd-input:focus { border-color: #ff9ec7; box-shadow: 0 0 0 4px rgba(255,158,199,.15); }
.bd-send-btn {
  width: 44px; height: 44px; flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: linear-gradient(135deg, #ffa5d0, #ff7db5);
  color: #fff; font-size: 16px; font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 14px -4px rgba(255,120,180,.5);
  transition: transform .15s ease, opacity .15s ease;
}
.bd-send-btn:active { transform: scale(.92); }
.bd-send-btn:disabled { opacity: .4; pointer-events: none; }

#bdModal {
  position: fixed; inset: 0;
  z-index: 21100;
  display: none; align-items: flex-end; justify-content: center;
  background: rgba(74,20,50,.5);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
#bdModal.show { display: flex; animation: bdFade .22s ease; }
@keyframes bdFade { from { opacity: 0 } to { opacity: 1 } }
.bd-modal-panel {
  width: 100%; max-width: 560px; max-height: 88vh;
  overflow-y: auto;
  padding: 20px 18px calc(24px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #fff8fc 0%, #fffaf2 100%);
  border-radius: 26px 26px 0 0;
  box-shadow: 0 -20px 60px rgba(180,60,120,.25);
  animation: bdSlideUp .3s cubic-bezier(.16,.9,.25,1) forwards;
  transform: translateY(100%);
}
@keyframes bdSlideUp { to { transform: translateY(0); } }
.bd-modal-handle {
  width: 44px; height: 5px; border-radius: 99px;
  background: rgba(216,91,158,.25);
  margin: 0 auto 16px;
}
.bd-modal-title {
  font-size: 18px; font-weight: 950; color: #c04a90;
  text-align: center; margin-bottom: 4px;
}
.bd-modal-sub {
  font-size: 12px; font-weight: 800; color: #e05b9e;
  text-align: center; margin-bottom: 16px;
}
.bd-group-label {
  font-size: 11px; font-weight: 950; color: #c04a90;
  letter-spacing: .08em; text-transform: uppercase;
  margin: 14px 0 8px 4px;
}
.bd-preset {
  display: block; width: 100%; text-align: left;
  padding: 12px 14px; margin-bottom: 8px;
  border: 1.5px solid rgba(255,158,199,.3);
  border-radius: 14px;
  background: #fff; color: #4a2a3a;
  font-family: inherit; font-size: 13.5px; font-weight: 700;
  line-height: 1.4; cursor: pointer;
  transition: all .15s ease;
}
.bd-preset:active { transform: scale(.98); }
.bd-preset.selected {
  border-color: #ff7db5;
  background: linear-gradient(135deg, #fff0f8, #ffe0f0);
  box-shadow: 0 4px 12px -6px rgba(216,91,158,.4);
}
.bd-textarea {
  width: 100%; min-height: 80px;
  padding: 12px 14px;
  border: 1.5px solid rgba(255,158,199,.35);
  border-radius: 14px;
  background: #fff; color: #4a2a3a;
  font-family: inherit; font-size: 14.5px; font-weight: 650;
  outline: none; resize: vertical;
}
.bd-textarea:focus { border-color: #ff9ec7; box-shadow: 0 0 0 4px rgba(255,158,199,.15); }
.bd-field-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 14px;
}
.bd-field-label {
  font-size: 12px; font-weight: 950; color: #c04a90;
  white-space: nowrap;
}
.bd-select {
  flex: 1; height: 44px; padding: 0 14px;
  border: 1.5px solid rgba(255,158,199,.35);
  border-radius: 12px;
  background: #fff; color: #4a2a3a;
  font-family: inherit; font-size: 14px; font-weight: 850;
  outline: none;
}
.bd-hint {
  margin-top: 10px; padding: 10px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fff0f8, #ffe4d0);
  border: 1.5px dashed rgba(216,91,158,.4);
  font-size: 11.5px; font-weight: 800;
  color: #c04a90; text-align: center;
  line-height: 1.45; display: none;
}
.bd-hint.show { display: block; animation: bdPop .3s ease; }
@keyframes bdPop { 0% { transform: scale(.95); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
.bd-modal-actions {
  display: grid; grid-template-columns: 1fr 1.4fr;
  gap: 10px; margin-top: 16px;
}
.bd-btn {
  min-height: 48px; padding: 12px 16px;
  border-radius: 14px;
  font-family: inherit; font-size: 13.5px; font-weight: 950;
  cursor: pointer;
  border: 1.5px solid rgba(255,158,199,.4);
  background: #fff; color: #c04a90;
  transition: transform .15s ease;
}
.bd-btn:active { transform: scale(.97); }
.bd-btn.primary {
  background: linear-gradient(135deg, #ff7db5, #c04a90);
  color: #fff; border-color: transparent;
  box-shadow: 0 8px 18px -8px rgba(216,91,158,.55);
}
.bd-btn:disabled { opacity: .5; pointer-events: none; }
.bd-modal-msg {
  min-height: 18px; margin-top: 10px;
  text-align: center;
  font-size: 12px; font-weight: 800; color: #c04a90;
}

.bd-confetti {
  position: fixed; top: -20px;
  z-index: 21400; font-size: 22px;
  pointer-events: none;
  animation: bdConfettiFall linear forwards;
}
@keyframes bdConfettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}

#bdCelebration {
  position: fixed; inset: 0; z-index: 21300;
  display: none; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 40%, rgba(255,240,248,.98), rgba(255,220,235,.98));
  text-align: center;
}
#bdCelebration.show { display: flex; animation: bdFade .35s ease; }
.bd-cele-inner {
  padding: 20px;
  animation: bdPop 0.5s cubic-bezier(.16,.9,.25,1);
}
.bd-cele-cake {
  font-size: 96px; margin-bottom: 8px;
  filter: drop-shadow(0 8px 20px rgba(216,91,158,.4));
  animation: bdCakeBob 1.6s ease-in-out infinite;
}
.bd-cele-title {
  font-size: 28px; font-weight: 950; color: #c04a90;
  letter-spacing: -.01em; margin-bottom: 6px;
  text-shadow: 0 2px 0 rgba(255,255,255,.9);
}
.bd-cele-name {
  font-size: 38px; font-weight: 950;
  background: linear-gradient(135deg, #ff7db5, #c04a90, #ff7db5);
  background-size: 200% 200%;
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  animation: bdGradientShift 2.5s ease-in-out infinite;
  margin-bottom: 12px; letter-spacing: -.02em;
}
@keyframes bdGradientShift { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
.bd-cele-sub {
  font-size: 14px; font-weight: 850; color: #e05b9e;
  margin-bottom: 24px;
}
.bd-cele-btn {
  padding: 12px 28px;
  border: 0; border-radius: 999px;
  background: linear-gradient(135deg, #ff7db5, #c04a90);
  color: #fff;
  font-family: inherit; font-size: 14px; font-weight: 950;
  cursor: pointer;
  box-shadow: 0 10px 24px -8px rgba(216,91,158,.55);
}
.bd-cele-btn:active { transform: scale(.95); }
`;
    document.head.appendChild(style);
  }

  /* ============ FAB ============ */
  function ensureFab() {
    let fab = $('bdFab');
    if (fab) return fab;
    fab = document.createElement('button');
    fab.id = 'bdFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Chúc mừng sinh nhật Mỹ Dung');
    fab.innerHTML = `
      <span class="bd-fab-icon">🎂</span>
      <span class="bd-fab-text">Chúc mừng SN</span>
      <span class="bd-fab-badge" id="bdFabBadge"></span>`;
    fab.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openPage(); });
    document.body.appendChild(fab);
    return fab;
  }

  function updateFabBadge() {
    const badge = $('bdFabBadge');
    if (!badge) return;
    if (S.unread > 0 && !S.pageOpen) {
      badge.textContent = S.unread > 99 ? '99+' : String(S.unread);
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  function syncFabVisibility() {
    const fab = $('bdFab');
    if (!fab) return;
    const otherOpen =
      $('lunchPage')?.classList.contains('show') ||
      $('quizOverlay')?.classList.contains('show') ||
      $('liveFeedOverlay')?.classList.contains('show') ||
      $('attendancePage')?.classList.contains('show') ||
      $('adminPage')?.classList.contains('show') ||
      $('monitorOverlay')?.classList.contains('show') ||
      $('checklistPanel')?.classList.contains('show') ||
      window.BXH?.isOpen?.();
    fab.classList.toggle('hidden', !!otherOpen);
  }

  /* ============ PAGE ============ */
  function ensurePage() {
    let page = $('bdPage');
    if (page) return page;

    page = document.createElement('section');
    page.id = 'bdPage';
    page.setAttribute('aria-hidden', 'true');
    page.innerHTML = `
      <header class="bd-head">
        <button type="button" class="bd-head-btn" id="bdBack" aria-label="Quay lại">←</button>
        <div class="bd-head-center">
          <div class="bd-head-avatar">
            <span id="bdHeadAvatar">🎂</span>
            <img id="bdHeadAvatarImg" alt="" style="display:none">
            <span class="bd-head-cake">🎂</span>
          </div>
          <div class="bd-head-info">
            <span class="bd-head-title">Sinh nhật ${esc(RECIPIENT)}</span>
            <span class="bd-head-sub"><span class="dot"></span><span id="bdWishCount">0 lời chúc</span></span>
          </div>
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button type="button" class="bd-head-btn" id="bdOwnerBtn" aria-label="Đăng nhập chính chủ">👑</button>
          <button type="button" class="bd-head-btn" id="bdClose" aria-label="Đóng">×</button>
        </div>
      </header>
      <div class="bd-body" id="bdBody"></div>
      <div class="bd-composer">
        <button type="button" class="bd-gift-btn" id="bdGiftBtn" aria-label="Gửi lời chúc">🎁</button>
        <div class="bd-composer-inner">
          <textarea class="bd-input" id="bdInput" rows="1" maxlength="500" placeholder="Nhắn tin với ${esc(RECIPIENT)}..." autocomplete="off"></textarea>
          <button type="button" class="bd-send-btn" id="bdSendBtn" disabled>➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    page.querySelector('#bdBack').addEventListener('click', closePage);
    page.querySelector('#bdClose').addEventListener('click', closePage);
    page.querySelector('#bdGiftBtn').addEventListener('click', openModal);
    page.querySelector('#bdOwnerBtn').addEventListener('click', loginOwner);

    const input = page.querySelector('#bdInput');
    const sendBtn = page.querySelector('#bdSendBtn');
    const refresh = () => {
      sendBtn.disabled = input.value.trim().length === 0 || S.sending;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    };
    input.addEventListener('input', refresh);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (input.value.trim()) { sendChat(input.value); input.value = ''; refresh(); }
      }
    });
    sendBtn.addEventListener('click', () => {
      if (input.value.trim()) { sendChat(input.value); input.value = ''; refresh(); }
    });
    refresh();

    log('Page created ✓');
    return page;
  }

  function updateHeadAvatar() {
    const img = $('bdHeadAvatarImg');
    const fallback = $('bdHeadAvatar');
    if (!img || !fallback) return;
    const url = getAvatarUrl(RECIPIENT);
    if (url) {
      img.src = url;
      img.style.display = '';
      fallback.style.display = 'none';
      img.onerror = () => { img.style.display = 'none'; fallback.style.display = ''; fallback.textContent = getInitial(RECIPIENT); };
    } else {
      img.style.display = 'none';
      fallback.style.display = '';
      fallback.textContent = getInitial(RECIPIENT);
    }
  }

  function updateOwnerBtn() {
    const btn = $('bdOwnerBtn');
    if (!btn) return;
    if (S.isOwner) {
      btn.textContent = '👑';
      btn.style.background = 'linear-gradient(135deg,#ffd700,#ff8c00)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'transparent';
      btn.style.boxShadow = '0 4px 12px -4px rgba(255,140,0,.6)';
      btn.title = 'Chính chủ đã đăng nhập — bấm để đăng xuất';
    } else {
      btn.textContent = '👑';
      btn.style.background = '';
      btn.style.color = '#c04a90';
      btn.style.borderColor = '';
      btn.style.boxShadow = '';
      btn.title = 'Đăng nhập chính chủ';
    }
  }

  function loginOwner() {
    if (S.isOwner) {
      if (confirm('👑 Bạn đang đăng nhập chính chủ.\n\nĐăng xuất khỏi chế độ này?')) {
        S.isOwner = false;
        S.inlineReplyToId = null;
        try { localStorage.removeItem(OWNER_KEY); } catch(_){}
        updateOwnerBtn();
        render();
      }
      return;
    }
    const pwd = prompt('👑 Nhập mật khẩu chính chủ:');
    if (pwd === null) return;
    if (String(pwd).trim() === OWNER_PASSWORD) {
      S.isOwner = true;
      try { localStorage.setItem(OWNER_KEY, '1'); } catch(_){}
      updateOwnerBtn();
      render();
      fireConfetti(40);
      alert('👑 Đã đăng nhập chính chủ!\n\nBây giờ bạn có thể:\n• Bấm ↩️ để trả lời ngay dưới lời chúc\n• Gõ chat → tin nhắn tự động là lời chúc đặc biệt');
    } else {
      alert('❌ Mật khẩu không đúng');
    }
  }

  /* ============ INLINE REPLY ============ */
  function toggleInlineReply(wishId) {
    if (S.inlineReplyToId === wishId) {
      S.inlineReplyToId = null;
    } else {
      S.inlineReplyToId = wishId;
    }
    _lastRenderSig = '';
    render();

    if (S.inlineReplyToId) {
      setTimeout(() => {
        const input = document.querySelector('.bd-inline-input[data-id="' + S.inlineReplyToId + '"]');
        if (input) {
          input.focus();
          try { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        }
      }, 100);
    }
  }

  function cancelInlineReply() {
    S.inlineReplyToId = null;
    _lastRenderSig = '';
    render();
  }

  async function sendInlineReply(wishId, text) {
    const msg = String(text || '').trim();
    if (!msg) return;
    if (S.inlineSending) return;

    S.inlineSending = true;
    const sendBtn = document.querySelector('.bd-inline-send[data-id="' + wishId + '"]');
    if (sendBtn) sendBtn.disabled = true;

    try {
      await sendWish(RECIPIENT, msg, true, wishId);
      S.inlineReplyToId = null;
      _lastRenderSig = '';
      render();
    } catch (e) {
      log('Reply error:', e);
      const inputEl = document.querySelector('.bd-inline-input[data-id="' + wishId + '"]');
      if (inputEl) {
        let errEl = document.querySelector('.bd-inline-error[data-id="' + wishId + '"]');
        if (!errEl) {
          errEl = document.createElement('div');
          errEl.className = 'bd-inline-error';
          errEl.dataset.id = wishId;
          inputEl.closest('.bd-inline-reply')?.appendChild(errEl);
        }
        errEl.textContent = 'Lỗi: ' + (e.message || e);
      }
      if (sendBtn) sendBtn.disabled = false;
    } finally {
      S.inlineSending = false;
    }
  }

  /* ============ BUILD CARD ============ */
  function buildThreadsMap() {
    const topWishes = [];
    const repliesByParent = {};
    for (const w of S.wishes) {
      if (w.replyToId) {
        if (!repliesByParent[w.replyToId]) repliesByParent[w.replyToId] = [];
        repliesByParent[w.replyToId].push(w);
      } else {
        topWishes.push(w);
      }
    }
    topWishes.sort((a, b) => a.ts - b.ts);
    Object.keys(repliesByParent).forEach(k => {
      repliesByParent[k].sort((a, b) => a.ts - b.ts);
    });
    return { topWishes, repliesByParent };
  }

  function renderReplyNested(reply) {
    const box = document.createElement('div');
    box.className = 'bd-reply-nested';
    box.dataset.id = reply.id;

    const head = document.createElement('div');
    head.className = 'bd-reply-nested-head';

    const arrow = document.createElement('span');
    arrow.className = 'bd-reply-nested-arrow';
    arrow.textContent = '↩️';

    const av = document.createElement('span');
    av.className = 'bd-reply-nested-avatar';
    const avUrl = getAvatarUrl(reply.sender);
    if (avUrl) {
      const img = document.createElement('img');
      img.src = avUrl; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.remove(); av.textContent = getInitial(reply.sender); };
      av.appendChild(img);
    } else av.textContent = getInitial(reply.sender);

    const nameEl = document.createElement('span');
    nameEl.className = 'bd-reply-nested-name';
    nameEl.textContent = reply.sender || RECIPIENT;

    const timeEl = document.createElement('span');
    timeEl.className = 'bd-reply-nested-time';
    timeEl.textContent = formatTime(reply.ts);

    head.append(arrow, av, nameEl, timeEl);

    const msg = document.createElement('div');
    msg.className = 'bd-reply-nested-message';
    msg.textContent = reply.message;

    box.append(head, msg);
    return box;
  }

  function renderInlineReply(w) {
    const box = document.createElement('div');
    box.className = 'bd-inline-reply';

    const wrap = document.createElement('div');
    wrap.className = 'bd-inline-reply-wrap';

    const input = document.createElement('textarea');
    input.className = 'bd-inline-input';
    input.dataset.id = w.id;
    input.rows = 1;
    input.maxLength = 500;
    input.placeholder = 'Trả lời ' + (String(w.sender || '').split(' ')[0] || 'bạn') + '...';
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
      const btn = document.querySelector('.bd-inline-send[data-id="' + w.id + '"]');
      if (btn) btn.disabled = input.value.trim().length === 0;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (input.value.trim()) sendInlineReply(w.id, input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlineReply();
      }
    });

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'bd-inline-send';
    sendBtn.dataset.id = w.id;
    sendBtn.disabled = true;
    sendBtn.textContent = '➤';
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (input.value.trim()) sendInlineReply(w.id, input.value);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bd-inline-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelInlineReply();
    });

    wrap.append(input, sendBtn, cancelBtn);
    box.appendChild(wrap);

    return box;
  }

  function renderWishCard(w, replies) {
    const card = document.createElement('div');
    card.className = 'bd-wish' + (w.isFromRecipient ? ' me' : '');
    card.dataset.id = w.id;

    const head = document.createElement('div');
    head.className = 'bd-wish-head';

    const av = document.createElement('div');
    av.className = 'bd-wish-avatar';
    const avUrl = getAvatarUrl(w.sender);
    if (avUrl) {
      const img = document.createElement('img');
      img.src = avUrl; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.remove(); av.textContent = getInitial(w.sender); };
      av.appendChild(img);
    } else av.textContent = getInitial(w.sender);

    const nameEl = document.createElement('div');
    nameEl.className = 'bd-wish-name';
    nameEl.textContent = w.sender || 'Ẩn danh';

    const iconEl = document.createElement('div');
    iconEl.className = 'bd-wish-icon';
    iconEl.textContent = w.isFromRecipient ? '🎉' : '🎁';

    head.append(av, nameEl, iconEl);

    const msg = document.createElement('div');
    msg.className = 'bd-wish-message';
    msg.textContent = w.message;

    const foot = document.createElement('div');
    foot.className = 'bd-wish-foot';
    const tEl = document.createElement('span');
    tEl.textContent = formatTime(w.ts);
    foot.appendChild(tEl);
    if (w.isFromRecipient) {
      const tag = document.createElement('span');
      tag.className = 'bd-wish-tag special';
      tag.textContent = 'SPECIAL';
      foot.appendChild(tag);
    }

    card.append(head, msg, foot);

    // ===== Replies block — NẰM TRONG CARD =====
    const isReplying = S.inlineReplyToId === w.id;
    const hasReplies = replies && replies.length > 0;

    if (hasReplies || isReplying) {
      const repliesBox = document.createElement('div');
      repliesBox.className = 'bd-wish-replies';

      if (hasReplies) {
        replies.forEach(r => repliesBox.appendChild(renderReplyNested(r)));
      }

      if (isReplying) {
        repliesBox.appendChild(renderInlineReply(w));
      }

      card.appendChild(repliesBox);
    }

    // ===== Action button =====
    if (S.isOwner && !w.isFromRecipient) {
      const actions = document.createElement('div');
      actions.className = 'bd-wish-actions';

      if (!isReplying) {
        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'bd-reply-btn';
        const firstName = String(w.sender || '').split(' ')[0] || 'bạn';
        replyBtn.innerHTML = '<span class="bd-reply-icon">↩️</span><span>Trả lời ' + esc(firstName) + '</span>';
        replyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleInlineReply(w.id);
        });
        actions.appendChild(replyBtn);
        card.appendChild(actions);
      }
    }

    return card;
  }

  /* ============ RENDER ============ */
  let _lastRenderSig = '';

  function render() {
    const body = $('bdBody');
    const countEl = $('bdWishCount');
    if (!body) return;

    const sig = S.wishes.map(w => `${w.id}|${w.ts}|${w.isFromRecipient?1:0}|${w.replyToId||''}`).join('::')
      + '|' + (S.isOwner ? 'O' : 'U')
      + '|' + (S.inlineReplyToId || '');
    if (sig === _lastRenderSig) return;
    _lastRenderSig = sig;

    if (countEl) countEl.textContent = S.wishes.length + ' lời chúc';

    if (!S.wishes.length) {
      body.innerHTML = `
        <div class="bd-empty">
          <div class="bd-empty-emoji">🎂</div>
          <div class="bd-empty-title">Chưa có lời chúc nào</div>
          <div class="bd-empty-sub">Hãy là người đầu tiên gửi lời chúc<br>đến ${esc(RECIPIENT)} nhé! 🎁</div>
        </div>`;
      return;
    }

    const { topWishes, repliesByParent } = buildThreadsMap();
    const frag = document.createDocumentFragment();
    let lastTs = 0;

    for (const w of topWishes) {
      if (!lastTs || !sameDay(lastTs, w.ts)) {
        const d = document.createElement('div');
        d.className = 'bd-day-divider';
        d.textContent = formatDay(w.ts);
        frag.appendChild(d);
      }

      const replies = repliesByParent[w.id] || [];
      frag.appendChild(renderWishCard(w, replies));

      lastTs = w.ts;
    }

    body.innerHTML = '';
    body.appendChild(frag);
    requestAnimationFrame(() => {
      if (!S.inlineReplyToId) {
        body.scrollTop = body.scrollHeight;
      }
    });
  }

  /* ============ DATA ============ */
  async function fetchWishes(force) {
    if (S.pollInFlight && !force) return;
    S.pollInFlight = true;
    try {
      const since = force ? 0 : (S.lastTs > 0 ? S.lastTs - 1000 : 0);
      const r = await rpc('rpc_get_birthday_wishes', { p_since: since }, 12000);
      const arr = Array.isArray(r.wishes) ? r.wishes : [];
      let added = 0;
      let newest = 0;

      if (force) S.wishes = [];

      for (const raw of arr) {
        const id = String(raw.id || '').trim();
        if (!id) continue;
        if (S.wishes.some(w => w.id === id)) continue;
        const ts = Number(raw.ts) || Date.now();
        const replyToId = raw.replyToId ? String(raw.replyToId) : null;
        S.wishes.push({
          id,
          sender: String(raw.sender || '').trim() || 'Ẩn danh',
          message: String(raw.message || ''),
          isFromRecipient: !!raw.isFromRecipient,
          replyToId,
          ts
        });
        added++;
        if (ts > newest) newest = ts;
      }

      if (newest > S.lastTs) S.lastTs = newest;
      if (S.wishes.length > MAX_WISHES) S.wishes = S.wishes.slice(-MAX_WISHES);

      if (added > 0 && !S.pageOpen) {
        S.unread += added;
        try { localStorage.setItem(UNREAD_KEY, String(S.unread)); } catch(_){}
      }

      if (added > 0 || force) {
        _lastRenderSig = '';
        render();
      }
      updateFabBadge();
    } catch (e) {
      log('fetch lỗi:', e && e.message);
    } finally {
      S.pollInFlight = false;
    }
  }

  async function sendWish(sender, message, isFromRecipient, replyToId) {
    if (S.sending) return null;
    S.sending = true;
    try {
      const params = {
        p_sender: sender,
        p_message: message,
        p_is_from_recipient: !!isFromRecipient
      };
      if (replyToId) params.p_reply_to_id = replyToId;

      const data = await rpc('rpc_send_birthday_wish', params, 15000);

      const w = {
        id: String(data.id || ''),
        sender: String(data.sender || sender),
        message: String(data.message || message),
        isFromRecipient: !!data.isFromRecipient,
        replyToId: data.replyToId ? String(data.replyToId) : null,
        ts: Number(data.ts) || Date.now()
      };
      S.wishes.push(w);
      S.lastTs = Math.max(S.lastTs, w.ts);
      _lastRenderSig = '';
      render();

      if (data.isFromRecipient) {
        fireConfetti(40);
        if (!data.replyToId) showCelebration();
      } else {
        fireConfetti(30);
      }

      return w;
    } finally {
      S.sending = false;
    }
  }

  async function sendChat(text) {
    const msg = String(text || '').trim();
    if (!msg) return;
    if (!S.myName) { S.myName = loadMyName(); }
    if (!S.myName) { alert('Chưa có tên người gửi'); return; }

    const sender = S.isOwner ? RECIPIENT : S.myName;
    const isFromRecipient = S.isOwner;

    try {
      await sendWish(sender, msg, isFromRecipient, null);
    } catch (e) {
      alert('Gửi lỗi: ' + (e.message || e));
    }
  }

  function fireConfetti(count) {
    const emojis = ['🎊','🎉','🌸','💖','✨','🎂','🎁','🌟'];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'bd-confetti';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left = (Math.random() * 100) + 'vw';
      const duration = 2.2 + Math.random() * 1.5;
      const delay = Math.random() * 0.6;
      el.style.animationDuration = duration + 's';
      el.style.animationDelay = delay + 's';
      el.style.fontSize = (16 + Math.random() * 20) + 'px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), (duration + delay + 0.5) * 1000);
    }
  }

  function showCelebration() {
    let el = $('bdCelebration');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bdCelebration';
      el.innerHTML = `
        <div class="bd-cele-inner">
          <div class="bd-cele-cake">🎂</div>
          <div class="bd-cele-title">Happy Birthday</div>
          <div class="bd-cele-name">${esc(RECIPIENT)}</div>
          <div class="bd-cele-sub">🎉 Mọi người yêu thương bạn! 🎉</div>
          <button type="button" class="bd-cele-btn" id="bdCeleClose">Tiếp tục →</button>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('#bdCeleClose').addEventListener('click', () => {
        el.classList.remove('show');
      });
      el.addEventListener('click', e => { if (e.target === el) el.classList.remove('show'); });
    }
    el.classList.add('show');
    fireConfetti(100);
  }

  /* ============ MODAL ============ */
  function buildModal() {
    let modal = $('bdModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'bdModal';
    modal.setAttribute('aria-hidden', 'true');

    const groups = {};
    PRESET_WISHES.forEach(w => {
      if (!groups[w.group]) groups[w.group] = [];
      groups[w.group].push(w.text);
    });

    let presetHtml = '';
    Object.keys(groups).forEach(g => {
      presetHtml += `<div class="bd-group-label">${esc(g)}</div>`;
      groups[g].forEach((t) => {
        presetHtml += `<button type="button" class="bd-preset" data-text="${esc(t)}">${esc(t)}</button>`;
      });
    });

    const names = getAllNames().filter(n => S.isOwner || n !== RECIPIENT);
    const namesOpts = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

    modal.innerHTML = `
      <div class="bd-modal-panel" role="dialog" aria-modal="true">
        <div class="bd-modal-handle"></div>
        <div class="bd-modal-title">🎁 Gửi lời chúc</div>
        <div class="bd-modal-sub">Cho ${esc(RECIPIENT)} — sinh nhật 7/10 🎂</div>
        ${presetHtml}
        <div class="bd-group-label">✍️ Hoặc tự viết</div>
        <textarea class="bd-textarea" id="bdCustomMsg" maxlength="500" placeholder="Viết lời chúc từ trái tim bạn..."></textarea>
        <div class="bd-field-row">
          <span class="bd-field-label">Gửi với tên:</span>
          <select class="bd-select" id="bdSenderSelect">
            ${namesOpts}
          </select>
        </div>
        <div class="bd-hint" id="bdHint">🎉 Bạn đang gửi thay mặt ${esc(RECIPIENT)} — sẽ có hiệu ứng đặc biệt!</div>
        <div class="bd-modal-msg" id="bdModalMsg"></div>
        <div class="bd-modal-actions">
          <button type="button" class="bd-btn" id="bdModalCancel">Huỷ</button>
          <button type="button" class="bd-btn primary" id="bdModalSend">🎁 Gửi chúc</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let selectedPreset = '';
    modal.querySelectorAll('.bd-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.bd-preset').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedPreset = btn.dataset.text;
        modal.querySelector('#bdCustomMsg').value = '';
      });
    });

    const senderSel = modal.querySelector('#bdSenderSelect');
    if (S.isOwner) {
      senderSel.value = RECIPIENT;
    } else {
      senderSel.value = S.myName || (names[0] || '');
    }

    const hintEl = modal.querySelector('#bdHint');
    const checkSender = () => {
      hintEl.classList.toggle('show', senderSel.value.trim() === RECIPIENT);
    };
    senderSel.addEventListener('change', checkSender);
    checkSender();

    const close = () => {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      modal.querySelector('#bdModalMsg').textContent = '';
      selectedPreset = '';
      modal.querySelectorAll('.bd-preset').forEach(b => b.classList.remove('selected'));
      modal.querySelector('#bdCustomMsg').value = '';
      setTimeout(() => { if (modal.parentNode) modal.remove(); }, 300);
    };

    modal.querySelector('#bdModalCancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('#bdModalSend').addEventListener('click', async () => {
      const custom = modal.querySelector('#bdCustomMsg').value.trim();
      const msg = custom || selectedPreset;
      const sender = senderSel.value.trim();
      const msgEl = modal.querySelector('#bdModalMsg');

      if (!msg) { msgEl.textContent = 'Chọn 1 lời chúc hoặc tự viết nhé!'; return; }
      if (!sender) { msgEl.textContent = 'Chọn tên người gửi'; return; }

      const isFromRecipient = sender === RECIPIENT;

      const btn = modal.querySelector('#bdModalSend');
      btn.disabled = true;
      btn.textContent = '⏳ Đang gửi…';
      msgEl.textContent = '';

      try {
        await sendWish(sender, msg, isFromRecipient, null);
        msgEl.style.color = '#4fa370';
        msgEl.textContent = 'Đã gửi ✓';
        saveMyName(sender);
        setTimeout(close, 800);
      } catch (e) {
        msgEl.style.color = '#e05b5b';
        msgEl.textContent = 'Lỗi: ' + (e.message || e);
      } finally {
        btn.disabled = false;
        btn.textContent = '🎁 Gửi chúc';
      }
    });

    return modal;
  }

  function openModal() {
    const old = $('bdModal');
    if (old) old.remove();
    const modal = buildModal();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function openPage() {
    const page = $('bdPage');
    if (!page) return;
    if (!S.myName) S.myName = loadMyName();
    page.classList.add('show');
    page.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    S.pageOpen = true;

    updateHeadAvatar();
    updateOwnerBtn();
    S.unread = 0;
    try { localStorage.setItem(UNREAD_KEY, '0'); } catch(_){}
    updateFabBadge();
    syncFabVisibility();

    _lastRenderSig = '';
    render();
    fetchWishes(true);
  }

  function closePage() {
    const page = $('bdPage');
    if (!page) return;
    page.classList.remove('show');
    page.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    S.pageOpen = false;
    S.inlineReplyToId = null;
    syncFabVisibility();
  }

  function startPolling() {
    stopPolling();
    const tick = () => {
      S.pollTimer = setTimeout(tick, POLL_MS);
      if (document.hidden) return;
      if (!S.pageOpen && S.wishes.length === 0) return;
      if (S.inlineReplyToId) return;
      fetchWishes(false);
    };
    tick();
  }

  function stopPolling() {
    if (S.pollTimer) { clearTimeout(S.pollTimer); S.pollTimer = null; }
  }

  function boot() {
    if (S.booted) return;
    S.booted = true;

    injectStyles();
    ensureFab();
    ensurePage();

    S.myName = loadMyName();
    try {
      S.unread = Math.max(0, Number(localStorage.getItem(UNREAD_KEY) || 0) || 0);
      S.isOwner = localStorage.getItem(OWNER_KEY) === '1';
    } catch(_){}
    updateFabBadge();
    updateOwnerBtn();

    const origSync = window.syncQuickTools;
    if (typeof origSync === 'function') {
      window.syncQuickTools = function() {
        try { origSync(); } catch(_){}
        syncFabVisibility();
      };
    }
    setInterval(syncFabVisibility, 800);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !S.inlineReplyToId) fetchWishes(false);
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (S.inlineReplyToId) {
        cancelInlineReply();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const modal = $('bdModal');
      if (modal && modal.classList.contains('show')) {
        modal.querySelector('#bdModalCancel')?.click();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (S.pageOpen) {
        closePage();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });

    setTimeout(startPolling, 3000);
    setTimeout(() => fetchWishes(false), 1500);

    log('v2.2 ready ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once: true });
  } else {
    setTimeout(boot, 200);
  }
})();