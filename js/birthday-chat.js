/* =========================================================
   BIRTHDAY CHAT — v3.0
   - Messenger-style: bubble tròn, avatar cuối chuỗi
   - Reply là bubble riêng bên phải, có quote nhỏ
   - UI gọn, hồng cute
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
  const shortName = n => {
    const arr = String(n || '').trim().split(/\s+/);
    return arr[arr.length - 1] || 'bạn';
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
/* ===== FAB ===== */
#bdFab {
  position: fixed; right: 18px;
  bottom: max(24px, calc(18px + env(safe-area-inset-bottom)));
  z-index: 20600;
  min-width: 116px; height: 52px;
  padding: 0 18px 0 14px;
  border: 0; border-radius: 26px;
  background: linear-gradient(135deg, #ffa5d0 0%, #e91e63 100%);
  color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 700;
  letter-spacing: .01em;
  display: flex; align-items: center; gap: 8px;
  cursor: pointer;
  box-shadow: 0 8px 24px -8px rgba(233,30,99,.5);
  transition: transform .15s ease;
}
#bdFab:active { transform: scale(.96); }
#bdFab.hidden { display: none !important; }
#bdFab .bd-fab-icon { font-size: 20px; line-height: 1; }
#bdFab .bd-fab-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px;
  background: #fff; color: #e91e63;
  font-size: 11px; font-weight: 800;
  display: none; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,.15);
}
#bdFab .bd-fab-badge.show { display: flex; }

/* ===== PAGE ===== */
#bdPage {
  position: fixed; inset: 0;
  z-index: 20900;
  display: none; flex-direction: column;
  background: #fff0f5;
  color: #4a1f33;
  font-family: var(--font, ui-rounded, system-ui);
  overflow: hidden;
}
#bdPage.show { display: flex; }

/* ===== HEADER ===== */
.bd-head {
  flex: 0 0 auto;
  display: grid; grid-template-columns: 40px 1fr auto;
  align-items: center; gap: 10px;
  padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
  background: #fff;
  border-bottom: 1px solid #ffe0ec;
  z-index: 10;
}
.bd-head-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%;
  background: #fff0f5;
  color: #e91e63;
  font-size: 18px;
  cursor: pointer;
  transition: background .15s ease, transform .15s ease;
}
.bd-head-btn:active { transform: scale(.92); background: #ffe0ec; }
.bd-head-center { min-width: 0; display: flex; align-items: center; gap: 10px; }
.bd-head-avatar {
  position: relative;
  width: 36px; height: 36px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ffd6e8, #ffa5d0);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 800;
  overflow: hidden;
}
.bd-head-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
.bd-head-info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.bd-head-title {
  font-size: 14.5px; font-weight: 700;
  color: #4a1f33;
  letter-spacing: -.005em;
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bd-head-sub {
  font-size: 11.5px; font-weight: 500;
  color: #c98ba6;
  line-height: 1.3;
}

/* ===== BODY ===== */
.bd-body {
  flex: 1 1 auto;
  overflow-y: auto; overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 12px 12px 120px;
  display: flex; flex-direction: column; gap: 2px;
}
.bd-body::-webkit-scrollbar { width: 3px; }
.bd-body::-webkit-scrollbar-thumb { background: #ffc7dd; border-radius: 2px; }
.bd-body > * { flex-shrink: 0; }

.bd-day-divider {
  align-self: center; margin: 16px 0 10px;
  padding: 4px 14px;
  background: rgba(255,255,255,.85);
  border-radius: 999px;
  color: #c98ba6;
  font-size: 11px; font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.bd-empty {
  padding: 80px 24px;
  text-align: center;
  color: #c98ba6;
}
.bd-empty-emoji { font-size: 52px; margin-bottom: 12px; opacity: .65; }
.bd-empty-title { font-size: 15px; font-weight: 700; color: #8a4a68; margin-bottom: 6px; }
.bd-empty-sub { font-size: 13px; font-weight: 500; line-height: 1.55; }

/* ===== MESSAGE ROW ===== */
.bd-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 8px;
  animation: bdMsgIn .28s cubic-bezier(.16,.9,.25,1) both;
}
.bd-row.compact { margin-top: 2px; }
.bd-row.me { flex-direction: row-reverse; }
@keyframes bdMsgIn {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}

.bd-row-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ffd6e8, #ffa5d0);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800;
  overflow: hidden;
  align-self: flex-end;
}
.bd-row-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bd-row-avatar.hidden { visibility: hidden; }
.bd-row.me .bd-row-avatar { display: none; }

.bd-bubble-wrap {
  display: flex; flex-direction: column;
  max-width: 76%;
  min-width: 0;
}
.bd-row.me .bd-bubble-wrap { align-items: flex-end; }

.bd-sender {
  font-size: 11px;
  font-weight: 700;
  color: #c98ba6;
  padding: 0 4px 3px 4px;
  letter-spacing: .01em;
}
.bd-row.compact .bd-sender { display: none; }

/* ===== BUBBLE ===== */
.bd-bubble {
  position: relative;
  padding: 9px 14px;
  border-radius: 20px 20px 20px 6px;
  background: #fff;
  color: #3a1f30;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 1px 3px rgba(233,30,99,.06);
}
.bd-row.me .bd-bubble {
  background: linear-gradient(135deg, #ffb8d1 0%, #ff9cc0 100%);
  color: #4a1f33;
  border-radius: 20px 20px 6px 20px;
  box-shadow: 0 2px 8px rgba(255,120,170,.25);
}

/* Quote trong reply */
.bd-bubble-quote {
  margin: -2px 0 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(255,255,255,.55);
  border-left: 3px solid #ff80b0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
  color: #8a4a68;
  max-width: 100%;
}
.bd-bubble-quote-sender {
  display: block;
  font-weight: 700;
  font-size: 11.5px;
  color: #e91e63;
  margin-bottom: 1px;
}
.bd-bubble-quote-text {
  display: block;
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Time */
.bd-time {
  font-size: 10.5px;
  font-weight: 500;
  color: #c98ba6;
  padding: 3px 6px 0 6px;
  letter-spacing: .01em;
}

/* ===== NÚT REPLY (text link nhỏ) ===== */
.bd-reply-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  padding: 2px 6px;
  border: 0;
  background: transparent;
  color: #e91e63;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 8px;
  transition: background .15s ease;
}
.bd-reply-link:active { background: rgba(233,30,99,.08); }
.bd-reply-link .bd-rl-icon { font-size: 11px; }

/* ===== INLINE REPLY INPUT ===== */
.bd-reply-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 6px;
  padding: 6px 6px 6px 10px;
  border-radius: 20px;
  background: #fff;
  border: 2px solid #ffb8d1;
  box-shadow: 0 4px 16px -6px rgba(233,30,99,.2);
  max-width: 82%;
  animation: bdMsgIn .25s cubic-bezier(.16,.9,.25,1) both;
}
.bd-row.me .bd-reply-input-wrap { margin-left: auto; }
.bd-reply-input-quote {
  position: absolute;
}

.bd-reply-input {
  flex: 1;
  min-height: 24px;
  max-height: 80px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #3a1f30;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  outline: none;
  resize: none;
  overflow-y: auto;
}
.bd-reply-input::placeholder { color: #d4a8bd; }

.bd-reply-send {
  width: 30px; height: 30px;
  flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: linear-gradient(135deg, #ff80b0, #e91e63);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease, opacity .15s ease;
}
.bd-reply-send:active { transform: scale(.9); }
.bd-reply-send:disabled { opacity: .35; pointer-events: none; }

.bd-reply-cancel {
  width: 26px; height: 26px;
  flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: #fff0f5;
  color: #c98ba6;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s ease;
}
.bd-reply-cancel:active { background: #ffe0ec; }

.bd-reply-error {
  margin-top: 4px;
  padding: 0 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: #e0425b;
}

/* ===== COMPOSER ===== */
.bd-composer {
  position: absolute; left: 0; right: 0; bottom: 0;
  z-index: 20;
  display: grid; grid-template-columns: 44px 1fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #ffe0ec;
}
.bd-gift-btn {
  width: 44px; height: 44px;
  border: 0; border-radius: 50%;
  background: #fff0f5;
  color: #e91e63;
  font-size: 20px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s ease, transform .15s ease;
}
.bd-gift-btn:active { transform: scale(.92); background: #ffe0ec; }
.bd-composer-inner { display: flex; align-items: flex-end; gap: 8px; }

.bd-input {
  flex: 1;
  min-height: 44px;
  max-height: 100px;
  padding: 10px 16px;
  border: 2px solid #ffe0ec;
  border-radius: 22px;
  background: #fff;
  color: #3a1f30;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.4;
  outline: none;
  resize: none;
  overflow-y: auto;
  transition: border-color .15s ease;
}
.bd-input:focus { border-color: #ffb8d1; }
.bd-input::placeholder { color: #d4a8bd; }

.bd-send-btn {
  width: 44px; height: 44px;
  flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: linear-gradient(135deg, #ff80b0, #e91e63);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px -6px rgba(233,30,99,.5);
  transition: transform .15s ease, opacity .15s ease;
}
.bd-send-btn:active { transform: scale(.92); }
.bd-send-btn:disabled { opacity: .3; pointer-events: none; box-shadow: none; }

/* ===== MODAL ===== */
#bdModal {
  position: fixed; inset: 0;
  z-index: 21100;
  display: none; align-items: flex-end; justify-content: center;
  background: rgba(74,31,51,.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
#bdModal.show { display: flex; animation: bdFade .2s ease; }
@keyframes bdFade { from { opacity: 0 } to { opacity: 1 } }
.bd-modal-panel {
  width: 100%; max-width: 560px; max-height: 88vh;
  overflow-y: auto;
  padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
  background: #fff;
  border-radius: 24px 24px 0 0;
  animation: bdSlideUp .28s cubic-bezier(.16,.9,.25,1) forwards;
  transform: translateY(100%);
}
@keyframes bdSlideUp { to { transform: translateY(0); } }
.bd-modal-handle {
  width: 36px; height: 4px; border-radius: 99px;
  background: #ffd6e8;
  margin: 0 auto 20px;
}
.bd-modal-title {
  font-size: 18px; font-weight: 800;
  color: #4a1f33;
  margin-bottom: 4px;
  letter-spacing: -.01em;
}
.bd-modal-sub {
  font-size: 13px; font-weight: 500;
  color: #c98ba6;
  margin-bottom: 20px;
}
.bd-group-label {
  font-size: 11px; font-weight: 800;
  color: #c98ba6;
  letter-spacing: .1em;
  text-transform: uppercase;
  margin: 18px 0 8px 0;
}
.bd-preset {
  display: block; width: 100%; text-align: left;
  padding: 11px 14px;
  margin-bottom: 6px;
  border: 1.5px solid #ffe0ec;
  border-radius: 12px;
  background: #fff;
  color: #3a1f30;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  cursor: pointer;
  transition: all .15s ease;
}
.bd-preset:active { transform: scale(.98); }
.bd-preset.selected {
  border-color: #ff80b0;
  background: #fff0f5;
  color: #e91e63;
  font-weight: 700;
}
.bd-textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px 14px;
  border: 1.5px solid #ffe0ec;
  border-radius: 12px;
  background: #fff;
  color: #3a1f30;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  transition: border-color .15s ease;
}
.bd-textarea:focus { border-color: #ffb8d1; }
.bd-textarea::placeholder { color: #d4a8bd; }
.bd-field-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 16px;
}
.bd-field-label {
  font-size: 13px; font-weight: 700;
  color: #4a1f33;
  white-space: nowrap;
}
.bd-select {
  flex: 1;
  height: 44px;
  padding: 0 12px;
  border: 1.5px solid #ffe0ec;
  border-radius: 12px;
  background: #fff;
  color: #3a1f30;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  transition: border-color .15s ease;
}
.bd-select:focus { border-color: #ffb8d1; }
.bd-hint {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff0f5;
  border: 1px solid #ffe0ec;
  font-size: 12px;
  font-weight: 600;
  color: #e91e63;
  text-align: center;
  line-height: 1.5;
  display: none;
}
.bd-hint.show { display: block; }
.bd-modal-actions {
  display: grid; grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  margin-top: 20px;
}
.bd-btn {
  min-height: 46px;
  padding: 12px 16px;
  border-radius: 14px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1.5px solid #ffe0ec;
  background: #fff;
  color: #4a1f33;
  transition: background .15s ease, transform .15s ease;
}
.bd-btn:active { transform: scale(.98); }
.bd-btn.primary {
  background: linear-gradient(135deg, #ff80b0, #e91e63);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 8px 18px -8px rgba(233,30,99,.5);
}
.bd-btn:disabled { opacity: .5; pointer-events: none; }
.bd-modal-msg {
  min-height: 18px;
  margin-top: 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #e91e63;
}

/* ===== CONFETTI ===== */
.bd-confetti {
  position: fixed;
  top: -20px;
  z-index: 21400;
  font-size: 22px;
  pointer-events: none;
  animation: bdConfettiFall linear forwards;
}
@keyframes bdConfettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}

/* ===== CELEBRATION ===== */
#bdCelebration {
  position: fixed; inset: 0; z-index: 21300;
  display: none; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #fff0f5 0%, #ffe0ec 100%);
  text-align: center;
}
#bdCelebration.show { display: flex; animation: bdFade .3s ease; }
.bd-cele-inner {
  padding: 24px;
  animation: bdPop .5s cubic-bezier(.16,.9,.25,1);
}
@keyframes bdPop {
  0% { opacity: 0; transform: scale(.94); }
  100% { opacity: 1; transform: scale(1); }
}
.bd-cele-cake {
  font-size: 72px; margin-bottom: 12px;
  animation: bdCakeBob 1.8s ease-in-out infinite;
}
@keyframes bdCakeBob {
  0%,100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-5px) rotate(3deg); }
}
.bd-cele-title {
  font-size: 20px; font-weight: 500;
  color: #c98ba6;
  letter-spacing: .15em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.bd-cele-name {
  font-size: 34px; font-weight: 800;
  color: #e91e63;
  letter-spacing: -.02em;
  margin-bottom: 14px;
}
.bd-cele-sub {
  font-size: 14px; font-weight: 500;
  color: #8a4a68;
  margin-bottom: 28px;
  line-height: 1.5;
}
.bd-cele-btn {
  padding: 12px 28px;
  border: 0; border-radius: 999px;
  background: linear-gradient(135deg, #ff80b0, #e91e63);
  color: #fff;
  font-family: inherit;
  font-size: 14px; font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px -8px rgba(233,30,99,.5);
  transition: transform .15s ease;
}
.bd-cele-btn:active { transform: scale(.96); }
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
          </div>
          <div class="bd-head-info">
            <span class="bd-head-title">Sinh nhật ${esc(RECIPIENT)}</span>
            <span class="bd-head-sub" id="bdWishCount">0 lời chúc</span>
          </div>
        </div>
        <button type="button" class="bd-head-btn" id="bdOwnerBtn" aria-label="Đăng nhập chính chủ">👑</button>
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
      btn.style.background = 'linear-gradient(135deg, #ff80b0, #e91e63)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = '#fff0f5';
      btn.style.color = '#e91e63';
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
      fireConfetti(30);
      alert('👑 Đã đăng nhập chính chủ!\n\nBây giờ bạn có thể:\n• Bấm ↩ để trả lời lời chúc\n• Gõ chat → tin nhắn tự động là lời chúc đặc biệt');
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
        const input = document.querySelector('.bd-reply-input[data-id="' + S.inlineReplyToId + '"]');
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
    const sendBtn = document.querySelector('.bd-reply-send[data-id="' + wishId + '"]');
    if (sendBtn) sendBtn.disabled = true;

    try {
      await sendWish(RECIPIENT, msg, true, wishId);
      S.inlineReplyToId = null;
      _lastRenderSig = '';
      render();
    } catch (e) {
      log('Reply error:', e);
      const inputEl = document.querySelector('.bd-reply-input[data-id="' + wishId + '"]');
      if (inputEl) {
        let errEl = document.querySelector('.bd-reply-error[data-id="' + wishId + '"]');
        if (!errEl) {
          errEl = document.createElement('div');
          errEl.className = 'bd-reply-error';
          errEl.dataset.id = wishId;
          inputEl.closest('.bd-reply-input-wrap')?.parentNode?.appendChild(errEl);
        }
        errEl.textContent = 'Lỗi: ' + (e.message || e);
      }
      if (sendBtn) sendBtn.disabled = false;
    } finally {
      S.inlineSending = false;
    }
  }

  /* ============ BUILD DATA ============ */
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

  /* ============ RENDER MESSAGE ROW ============ */
  function buildBubbleElement(w, isMe, options) {
    options = options || {};
    const parentWish = options.parentWish || null;

    const wrap = document.createElement('div');
    wrap.className = 'bd-bubble-wrap';

    // Sender name (chỉ hiện ở message đầu chuỗi, không phải của mình)
    if (!isMe && !options.compact) {
      const senderEl = document.createElement('div');
      senderEl.className = 'bd-sender';
      senderEl.textContent = w.sender || 'Ẩn danh';
      wrap.appendChild(senderEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bd-bubble';

    // Quote nhỏ nếu là reply
    if (parentWish) {
      const quote = document.createElement('div');
      quote.className = 'bd-bubble-quote';
      const quoteSender = document.createElement('span');
      quoteSender.className = 'bd-bubble-quote-sender';
      quoteSender.textContent = (parentWish.sender || 'Ẩn danh') + ' đã viết:';
      const quoteText = document.createElement('span');
      quoteText.className = 'bd-bubble-quote-text';
      quoteText.textContent = String(parentWish.message || '');
      quote.appendChild(quoteSender);
      quote.appendChild(quoteText);
      bubble.appendChild(quote);
    }

    const msgText = document.createTextNode(w.message);
    bubble.appendChild(msgText);

    wrap.appendChild(bubble);

    // Time
    const timeEl = document.createElement('div');
    timeEl.className = 'bd-time';
    timeEl.textContent = formatTime(w.ts);
    wrap.appendChild(timeEl);

    // Nút reply (chỉ cho owner + không phải wish của Mỹ Dung)
    if (S.isOwner && !w.isFromRecipient && !options.hideReplyBtn) {
      const replyLink = document.createElement('button');
      replyLink.type = 'button';
      replyLink.className = 'bd-reply-link';
      replyLink.innerHTML = '<span class="bd-rl-icon">↩</span><span>Trả lời</span>';
      replyLink.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInlineReply(w.id);
      });
      wrap.appendChild(replyLink);
    }

    return wrap;
  }

  function buildMessageRow(w, options) {
    options = options || {};
    const isMe = !!w.isFromRecipient;

    const row = document.createElement('div');
    row.className = 'bd-row' + (isMe ? ' me' : '') + (options.compact ? ' compact' : '');
    row.dataset.id = w.id;

    // Avatar (chỉ cho tin không phải của mình)
    if (!isMe) {
      const av = document.createElement('div');
      av.className = 'bd-row-avatar' + (options.hideAvatar ? ' hidden' : '');
      const avUrl = getAvatarUrl(w.sender);
      if (avUrl) {
        const img = document.createElement('img');
        img.src = avUrl; img.alt = ''; img.loading = 'lazy';
        img.onerror = () => { img.remove(); av.textContent = getInitial(w.sender); };
        av.appendChild(img);
      } else {
        av.textContent = getInitial(w.sender);
      }
      row.appendChild(av);
    }

    const bubbleWrap = buildBubbleElement(w, isMe, {
      compact: options.compact,
      parentWish: options.parentWish,
      hideReplyBtn: options.hideReplyBtn
    });
    row.appendChild(bubbleWrap);

    return row;
  }

  function buildReplyInput(w, parentWish) {
    const wrap = document.createElement('div');
    wrap.className = 'bd-reply-input-wrap';

    const input = document.createElement('textarea');
    input.className = 'bd-reply-input';
    input.dataset.id = w.id;
    input.rows = 1;
    input.maxLength = 500;
    input.placeholder = 'Trả lời ' + shortName(parentWish.sender) + '...';
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
      const btn = document.querySelector('.bd-reply-send[data-id="' + w.id + '"]');
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
    sendBtn.className = 'bd-reply-send';
    sendBtn.dataset.id = w.id;
    sendBtn.disabled = true;
    sendBtn.textContent = '➤';
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (input.value.trim()) sendInlineReply(w.id, input.value);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bd-reply-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelInlineReply();
    });

    wrap.append(input, sendBtn, cancelBtn);
    return wrap;
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
          <div class="bd-empty-sub">Hãy là người đầu tiên gửi lời chúc<br>đến ${esc(RECIPIENT)} nhé!</div>
        </div>`;
      return;
    }

    const { topWishes, repliesByParent } = buildThreadsMap();
    const frag = document.createDocumentFragment();
    let lastTs = 0;
    let lastSender = '';
    let lastWish = null;

    for (const w of topWishes) {
      if (!lastTs || !sameDay(lastTs, w.ts)) {
        const d = document.createElement('div');
        d.className = 'bd-day-divider';
        d.textContent = formatDay(w.ts);
        frag.appendChild(d);
        lastSender = '';
      }

      // Wish gốc
      frag.appendChild(buildMessageRow(w, { compact: false }));
      lastSender = w.sender;
      lastWish = w;

      // Replies
      const replies = repliesByParent[w.id] || [];
      replies.forEach((r, idx) => {
        frag.appendChild(buildMessageRow(r, {
          compact: false,
          parentWish: w,
          hideReplyBtn: true
        }));
        lastSender = r.sender;
      });

      // Input inline nếu đang reply
      if (S.inlineReplyToId === w.id) {
        const inputRow = document.createElement('div');
        inputRow.className = 'bd-row me';
        inputRow.appendChild(buildReplyInput(w, w));
        frag.appendChild(inputRow);
      }

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
          <div class="bd-cele-sub">Mọi người yêu thương bạn!</div>
          <button type="button" class="bd-cele-btn" id="bdCeleClose">Tiếp tục</button>
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
        <div class="bd-modal-title">Gửi lời chúc</div>
        <div class="bd-modal-sub">Cho ${esc(RECIPIENT)} — sinh nhật 7/10</div>
        ${presetHtml}
        <div class="bd-group-label">Hoặc tự viết</div>
        <textarea class="bd-textarea" id="bdCustomMsg" maxlength="500" placeholder="Viết lời chúc từ trái tim bạn..."></textarea>
        <div class="bd-field-row">
          <span class="bd-field-label">Gửi với tên:</span>
          <select class="bd-select" id="bdSenderSelect">
            ${namesOpts}
          </select>
        </div>
        <div class="bd-hint" id="bdHint">Bạn đang gửi thay mặt ${esc(RECIPIENT)} — sẽ có hiệu ứng đặc biệt</div>
        <div class="bd-modal-msg" id="bdModalMsg"></div>
        <div class="bd-modal-actions">
          <button type="button" class="bd-btn" id="bdModalCancel">Huỷ</button>
          <button type="button" class="bd-btn primary" id="bdModalSend">Gửi chúc</button>
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
      btn.textContent = 'Đang gửi…';
      msgEl.textContent = '';

      try {
        await sendWish(sender, msg, isFromRecipient, null);
        msgEl.textContent = 'Đã gửi ✓';
        saveMyName(sender);
        setTimeout(close, 800);
      } catch (e) {
        msgEl.textContent = 'Lỗi: ' + (e.message || e);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Gửi chúc';
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

    log('v3.0 ready ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once: true });
  } else {
    setTimeout(boot, 200);
  }
})();