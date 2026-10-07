/* =========================================================
   BIRTHDAY CHAT — v3.4 (Pink-Black theme, soft flame)
   - Đọc config từ window.__SRANK_CONFIG (js/config.js)
   - Dùng __srankApi adapter thay vì fetch REST trực tiếp
   ========================================================= */
(function(){
  "use strict";
  if (window.__birthdayChatLoaded) return;
  window.__birthdayChatLoaded = true;

  const CFG = window.__SRANK_CONFIG || {};
  const RECIPIENT = CFG.BIRTHDAY_RECIPIENT || 'Mỹ Dung';
  const OWNER_PASSWORD = '0810';
  const POLL_MS = (CFG.SYNC && CFG.SYNC.BIRTHDAY_POLL) || 5000;
  const MAX_WISHES = (CFG.CACHE && CFG.CACHE.MAX_WISHES) || 300;
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
    seenIds: new Set(),
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

  /* =======================================================
     rpc() — dùng __srankApi adapter (không fetch REST nữa)
     ======================================================= */
  async function rpc(name, params, timeout) {
    const api = window.__srankApi || (window.SRank && window.SRank.api);
    if (!api) throw new Error('API chưa sẵn sàng');

    if (name === 'rpc_get_birthday_wishes') {
      const r = await api('getBirthdayWishes', { since: params.p_since || 0 }, timeout || 12000);
      if (!r || !r.ok) throw new Error(r && r.error || 'Không tải được lời chúc');
      const d = r.data || {};
      return Array.isArray(d) ? { wishes: d } : (d.wishes ? d : { wishes: [] });
    }

    if (name === 'rpc_send_birthday_wish') {
      const r = await api('sendBirthdayWish', {
        sender: params.p_sender || '',
        message: params.p_message || '',
        isFromRecipient: !!params.p_is_from_recipient,
        replyToId: params.p_reply_to_id || null
      }, timeout || 15000);
      if (!r || !r.ok) throw new Error(r && r.error || 'Không gửi được');
      return r.data || {};
    }

    throw new Error('RPC không hỗ trợ qua adapter: ' + name);
  }

  /* ============ CSS — PINK BLACK THEME ============ */
  function injectStyles() {
    if ($('bdStyles')) return;

    const oldStyle = document.createElement('style');
    oldStyle.id = 'bdHideOldChat';
    oldStyle.textContent = '#secretMailBtn{display:none !important;visibility:hidden !important;pointer-events:none !important;opacity:0 !important;}';
    document.head.appendChild(oldStyle);

    const style = document.createElement('style');
    style.id = 'bdStyles';
    style.textContent = `
/* ============================================================
   FLAME KEYFRAMES — dịu nhẹ
============================================================ */
@keyframes bdFlameRotate {
  from { --bd-angle: 0deg; }
  to { --bd-angle: 360deg; }
}
@property --bd-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@keyframes bdFlameShift {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes bdFlamePulse {
  0%,100% { filter: brightness(1) saturate(1); }
  50%     { filter: brightness(1.15) saturate(1.1); }
}
@keyframes bdGlowSoft {
  0%,100% {
    box-shadow: 0 0 6px rgba(255,77,148,.4), 0 0 12px rgba(255,77,148,.2);
  }
  50% {
    box-shadow: 0 0 10px rgba(255,120,180,.55), 0 0 20px rgba(255,77,148,.35);
  }
}
@keyframes bdFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes bdCardIn {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes bdReplyIn {
  0% { opacity: 0; transform: translateX(-6px); }
  100% { opacity: 1; transform: translateX(0); }
}
@keyframes bdShine {
  to { transform: translateX(100%); }
}
@keyframes bdSlideUp { to { transform: translateY(0); } }
@keyframes bdPop {
  0% { opacity: 0; transform: scale(.94); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes bdCakeBob {
  0%,100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-6px) rotate(3deg); }
}
@keyframes bdConfettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}

/* ============================================================
   FAB
============================================================ */
#bdFab {
  position: fixed; right: 18px;
  bottom: max(24px, calc(18px + env(safe-area-inset-bottom)));
  z-index: 20600;
  min-width: 116px; height: 52px;
  padding: 0 18px 0 14px;
  border: 0; border-radius: 26px;
  background: linear-gradient(135deg, #ff4d94 0%, #b1005c 100%);
  color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 800;
  letter-spacing: .01em;
  display: flex; align-items: center; gap: 8px;
  cursor: pointer;
  box-shadow:
    0 0 0 1px rgba(255,120,180,.4),
    0 8px 24px -6px rgba(255,77,148,.5);
  transition: transform .15s ease;
}
#bdFab:active { transform: scale(.96); }
#bdFab.hidden { display: none !important; }
#bdFab .bd-fab-icon { font-size: 20px; line-height: 1; }
#bdFab .bd-fab-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px;
  background: #fff; color: #b1005c;
  font-size: 11px; font-weight: 800;
  display: none; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,.3);
}
#bdFab .bd-fab-badge.show { display: flex; }

/* ============================================================
   PAGE — nền đen hồng + flame viền dịu
============================================================ */
#bdPage {
  position: fixed; inset: 0;
  z-index: 20900;
  display: none; flex-direction: column;
  background: #0f0508;
  color: #fff0f5;
  font-family: var(--font, ui-rounded, system-ui);
  overflow: hidden;
  padding: 5px;
  box-sizing: border-box;
}
#bdPage.show { display: flex; }

#bdPage::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  padding: 2px;
  background: conic-gradient(
    from var(--bd-angle),
    rgba(255,77,148,0) 0deg,
    rgba(255,77,148,.15) 40deg,
    rgba(255,120,180,.45) 90deg,
    rgba(255,180,210,.7) 130deg,
    rgba(255,220,235,.85) 160deg,
    rgba(255,180,210,.7) 190deg,
    rgba(255,120,180,.45) 240deg,
    rgba(255,77,148,.15) 300deg,
    rgba(255,77,148,0) 360deg
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: bdFlameRotate 6s linear infinite;
  pointer-events: none;
  z-index: 1;
  filter: drop-shadow(0 0 8px rgba(255,120,180,.35));
}

.bd-shell {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #1a0812 0%, #0f0508 100%);
  border-radius: 14px;
  overflow: hidden;
  z-index: 2;
  box-shadow: inset 0 0 40px rgba(255,77,148,.06);
}

/* ============================================================
   HEADER
============================================================ */
.bd-head {
  flex: 0 0 auto;
  position: relative;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: calc(14px + env(safe-area-inset-top)) 14px 14px;
  background: linear-gradient(135deg, #1f0a14 0%, #2a0f1a 100%);
  border-bottom: 1px solid rgba(255,120,180,.15);
  z-index: 10;
}

.bd-head::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 2px;
  background: linear-gradient(90deg,
    rgba(255,77,148,0),
    rgba(255,77,148,.35) 20%,
    rgba(255,150,195,.65) 50%,
    rgba(255,77,148,.35) 80%,
    rgba(255,77,148,0));
  background-size: 200% 100%;
  animation: bdFlameShift 4s linear infinite;
  box-shadow: 0 0 8px rgba(255,120,180,.4);
}

.bd-head-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,120,180,.3);
  border-radius: 50%;
  background: rgba(255,120,180,.08);
  color: #ffb8d1;
  font-size: 18px; font-weight: 700;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
  position: relative;
  z-index: 2;
}
.bd-head-btn:active {
  transform: scale(.92);
  background: rgba(255,120,180,.18);
  border-color: rgba(255,120,180,.5);
}

.bd-head-center {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 2;
}

.bd-head-avatar {
  position: relative;
  width: 46px; height: 46px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 800;
  overflow: hidden;
  box-shadow:
    0 0 0 2px #1a0812,
    0 0 0 3px rgba(255,120,180,.7),
    0 0 12px rgba(255,77,148,.45);
  animation: bdGlowSoft 2.8s ease-in-out infinite;
}
.bd-head-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

.bd-head-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bd-head-title {
  font-size: 22px;
  font-weight: 950;
  letter-spacing: -.01em;
  line-height: 1.15;
  background: linear-gradient(
    90deg,
    #ff4d94 0%,
    #ffb8d1 25%,
    #ffffff 50%,
    #ffb8d1 75%,
    #ff4d94 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: bdFlameShift 5s linear infinite;
  filter: drop-shadow(0 0 6px rgba(255,120,180,.4));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bd-head-sub {
  font-size: 12.5px;
  font-weight: 700;
  color: #d1759a;
  line-height: 1.3;
  letter-spacing: .01em;
}

/* ============================================================
   BODY
============================================================ */
.bd-body {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 14px 12px 130px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  z-index: 2;
}
.bd-body::-webkit-scrollbar { width: 3px; }
.bd-body::-webkit-scrollbar-thumb {
  background: rgba(255,120,180,.35);
  border-radius: 2px;
}
.bd-body > * { flex-shrink: 0; }

.bd-day-divider {
  align-self: center;
  margin: 14px 0 6px;
  padding: 4px 14px;
  background: rgba(255,120,180,.08);
  border: 1px solid rgba(255,120,180,.2);
  border-radius: 999px;
  color: #ff9ec7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.bd-empty {
  padding: 80px 24px;
  text-align: center;
  color: #b08899;
}
.bd-empty-emoji {
  font-size: 56px;
  margin-bottom: 14px;
  opacity: .6;
  filter: drop-shadow(0 4px 8px rgba(255,77,148,.3));
}
.bd-empty-title {
  font-size: 15.5px;
  font-weight: 800;
  color: #ffb8d1;
  margin-bottom: 6px;
}
.bd-empty-sub {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.55;
  color: #a08090;
}

/* ============================================================
   CARD
============================================================ */
.bd-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: bdCardIn .4s cubic-bezier(.16,.9,.25,1) both;
  position: relative;
}
.bd-card.me { align-items: flex-end; }

.bd-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 82%;
  min-width: 0;
}
.bd-card.me .bd-main {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.bd-av {
  width: 34px; height: 34px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800;
  overflow: hidden;
  box-shadow:
    0 0 0 2px #1a0812,
    0 0 0 3px rgba(255,120,180,.5),
    0 2px 8px rgba(255,77,148,.25);
  margin-top: 2px;
}
.bd-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bd-card.me .bd-av { display: none; }

.bd-bubble-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.bd-card.me .bd-bubble-wrap { align-items: flex-end; }

.bd-name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 4px 4px 4px;
  min-width: 0;
}
.bd-card.me .bd-name-row { flex-direction: row-reverse; }
.bd-name {
  font-size: 12.5px;
  font-weight: 800;
  color: #ff7fb0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
.bd-time-inline {
  font-size: 10.5px;
  font-weight: 600;
  color: #a08090;
  flex-shrink: 0;
}

/* ============================================================
   BUBBLE — wish người khác
============================================================ */
.bd-bubble {
  position: relative;
  padding: 10px 14px;
  border-radius: 20px 20px 20px 6px;
  background: rgba(255,240,245,.06);
  color: #fff0f5;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid rgba(255,120,180,.18);
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
  overflow: hidden;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* ============================================================
   BUBBLE ME — flame hồng dịu
============================================================ */
.bd-card.me .bd-bubble {
  padding: 11px 16px;
  border-radius: 20px 20px 6px 20px;
  background: linear-gradient(135deg, #ff4d94 0%, #b1005c 100%);
  color: #fff;
  font-weight: 600;
  border: 0;
  text-shadow: 0 1px 1px rgba(90,0,45,.25);
  box-shadow:
    0 0 0 1px rgba(255,150,195,.5),
    0 4px 16px -2px rgba(255,77,148,.45),
    0 0 20px rgba(255,77,148,.25);
}

.bd-card.me .bd-bubble::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 23px 23px 9px 23px;
  padding: 1.5px;
  background: conic-gradient(
    from var(--bd-angle),
    rgba(255,77,148,0) 0deg,
    rgba(255,77,148,.2) 40deg,
    rgba(255,150,195,.55) 90deg,
    rgba(255,220,235,.85) 140deg,
    rgba(255,255,255,.9) 180deg,
    rgba(255,220,235,.85) 220deg,
    rgba(255,150,195,.55) 270deg,
    rgba(255,77,148,.2) 320deg,
    rgba(255,77,148,0) 360deg
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: bdFlameRotate 4s linear infinite;
  pointer-events: none;
  filter: drop-shadow(0 0 6px rgba(255,150,195,.55));
}

.bd-card.me .bd-bubble.shine::after {
  content: '';
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 100%;
  background: linear-gradient(100deg,
    transparent 0%,
    transparent 30%,
    rgba(255,255,255,.45) 50%,
    transparent 70%,
    transparent 100%);
  transform: translateX(-100%);
  animation: bdShine .9s ease-out .12s;
  pointer-events: none;
}

/* ============================================================
   REPLIES
============================================================ */
.bd-replies {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 42px;
  margin-top: 4px;
  max-width: 82%;
}
.bd-card.me .bd-replies {
  margin-left: 0;
  align-self: flex-end;
}

.bd-reply-inline {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(255,120,180,.08);
  border: 1px solid rgba(255,120,180,.2);
  animation: bdReplyIn .35s cubic-bezier(.16,.9,.25,1) both;
}
.bd-card.me .bd-reply-inline {
  background: rgba(255,77,148,.14);
  border-color: rgba(255,120,180,.3);
}

.bd-reply-av {
  width: 24px; height: 24px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800;
  overflow: hidden;
  box-shadow: 0 0 0 1.5px #1a0812, 0 0 0 2.5px rgba(255,120,180,.5);
  margin-top: 1px;
}
.bd-reply-av img { width: 100%; height: 100%; object-fit: cover; display: block; }

.bd-reply-body {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.5;
  color: #ffe0ec;
  word-break: break-word;
}
.bd-reply-name {
  font-weight: 800;
  color: #ff80b0;
  margin-right: 4px;
}
.bd-reply-time {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: #a08090;
  margin-left: 6px;
}

/* ============================================================
   INPUT INLINE
============================================================ */
.bd-reply-input-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  border-radius: 14px;
  background: rgba(255,240,245,.08);
  border: 1.5px solid rgba(255,120,180,.5);
  box-shadow: 0 0 12px rgba(255,77,148,.25);
  animation: bdReplyIn .25s cubic-bezier(.16,.9,.25,1) both;
}
.bd-reply-input-av {
  width: 24px; height: 24px; border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800;
  overflow: hidden;
  margin-top: 4px;
}
.bd-reply-input-av img { width: 100%; height: 100%; object-fit: cover; display: block; }

.bd-reply-input {
  flex: 1;
  min-height: 24px;
  max-height: 80px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: #fff0f5;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.4;
  outline: none;
  resize: none;
  overflow-y: auto;
}
.bd-reply-input::placeholder { color: #a08090; }

.bd-reply-send {
  width: 28px; height: 28px;
  flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  font-size: 12px; font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease, opacity .15s ease;
  box-shadow: 0 3px 10px -2px rgba(255,77,148,.5);
  margin-top: 2px;
}
.bd-reply-send:active { transform: scale(.9); }
.bd-reply-send:disabled { opacity: .35; pointer-events: none; box-shadow: none; }

.bd-reply-cancel {
  width: 24px; height: 24px;
  flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: rgba(255,120,180,.15);
  color: #d1759a;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s ease;
  margin-top: 2px;
}
.bd-reply-cancel:active { background: rgba(255,120,180,.3); }

.bd-reply-error {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #ff6b8a;
  padding: 0 6px;
}

/* ============================================================
   REPLY LINK
============================================================ */
.bd-reply-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  margin-left: 42px;
  padding: 4px 10px;
  border: 0;
  background: rgba(255,120,180,.12);
  color: #ff9ec7;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 999px;
  transition: background .15s ease, transform .15s ease;
}
.bd-card.me .bd-reply-link { margin-left: 0; }
.bd-reply-link:active {
  background: rgba(255,120,180,.25);
  transform: scale(.96);
}
.bd-reply-link .bd-rl-icon { font-size: 11px; }

/* ============================================================
   COMPOSER
============================================================ */
.bd-composer {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #1f0a14 0%, #16060d 100%);
  box-shadow: 0 -4px 20px rgba(0,0,0,.3);
}
.bd-composer::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 1.5px;
  background: linear-gradient(90deg,
    rgba(255,77,148,0),
    rgba(255,77,148,.35) 20%,
    rgba(255,150,195,.7) 50%,
    rgba(255,77,148,.35) 80%,
    rgba(255,77,148,0));
  background-size: 200% 100%;
  animation: bdFlameShift 4s linear infinite;
  box-shadow: 0 0 8px rgba(255,120,180,.4);
}

.bd-gift-btn {
  width: 44px; height: 44px;
  border: 0; border-radius: 50%;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow:
    0 0 0 1px rgba(255,150,195,.5),
    0 0 12px rgba(255,77,148,.4),
    0 6px 16px -4px rgba(255,77,148,.5);
  transition: transform .15s ease;
  animation: bdGlowSoft 2.4s ease-in-out infinite;
}
.bd-gift-btn:active { transform: scale(.92); }

.bd-composer-inner { display: flex; align-items: flex-end; gap: 8px; }

.bd-input {
  flex: 1;
  min-height: 44px;
  max-height: 100px;
  padding: 10px 16px;
  border: 1.5px solid rgba(255,120,180,.3);
  border-radius: 22px;
  background: rgba(255,240,245,.08);
  color: #fff0f5;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.4;
  outline: none;
  resize: none;
  overflow-y: auto;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.bd-input:focus {
  border-color: #ff7fb0;
  background: rgba(255,240,245,.12);
  box-shadow: 0 0 0 4px rgba(255,120,180,.15);
}
.bd-input::placeholder { color: #a08090; }

.bd-send-btn {
  width: 44px; height: 44px;
  flex: 0 0 auto;
  border: 0; border-radius: 50%;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  font-size: 15px; font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow:
    0 0 0 1px rgba(255,150,195,.5),
    0 0 12px rgba(255,77,148,.4),
    0 6px 16px -4px rgba(255,77,148,.5);
  transition: transform .15s ease, opacity .15s ease;
  animation: bdGlowSoft 2.4s ease-in-out infinite;
}
.bd-send-btn:active { transform: scale(.92) rotate(-8deg); }
.bd-send-btn:disabled {
  opacity: .35;
  pointer-events: none;
  box-shadow: none;
  animation: none;
}

/* ============================================================
   MODAL
============================================================ */
#bdModal {
  position: fixed; inset: 0;
  z-index: 21100;
  display: none; align-items: flex-end; justify-content: center;
  background: rgba(15,5,8,.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
#bdModal.show { display: flex; animation: bdFade .2s ease; }
.bd-modal-panel {
  width: 100%; max-width: 560px; max-height: 88vh;
  overflow-y: auto;
  padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #1a0812 0%, #0f0508 100%);
  border-top: 1px solid rgba(255,120,180,.3);
  border-radius: 24px 24px 0 0;
  animation: bdSlideUp .28s cubic-bezier(.16,.9,.25,1) forwards;
  transform: translateY(100%);
  box-shadow: 0 -20px 60px rgba(255,77,148,.15);
}
.bd-modal-handle {
  width: 36px; height: 4px; border-radius: 99px;
  background: rgba(255,120,180,.3);
  margin: 0 auto 20px;
}
.bd-modal-title {
  font-size: 20px;
  font-weight: 950;
  background: linear-gradient(90deg, #ff4d94, #ffb8d1, #ffffff, #ffb8d1, #ff4d94);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: bdFlameShift 5s linear infinite;
  margin-bottom: 6px;
}
.bd-modal-sub {
  font-size: 13px; font-weight: 600;
  color: #d1759a;
  margin-bottom: 20px;
}
.bd-group-label {
  font-size: 11px; font-weight: 800;
  color: #d1759a;
  letter-spacing: .1em;
  text-transform: uppercase;
  margin: 18px 0 8px 0;
}
.bd-preset {
  display: block; width: 100%; text-align: left;
  padding: 11px 14px;
  margin-bottom: 6px;
  border: 1.5px solid rgba(255,120,180,.2);
  border-radius: 12px;
  background: rgba(255,240,245,.05);
  color: #ffe0ec;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  cursor: pointer;
  transition: all .15s ease;
}
.bd-preset:active { transform: scale(.98); }
.bd-preset.selected {
  border-color: #ff7fb0;
  background: rgba(255,77,148,.15);
  color: #fff;
  font-weight: 700;
}
.bd-textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px 14px;
  border: 1.5px solid rgba(255,120,180,.25);
  border-radius: 12px;
  background: rgba(255,240,245,.06);
  color: #fff0f5;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.bd-textarea:focus {
  border-color: #ff7fb0;
  background: rgba(255,240,245,.1);
  box-shadow: 0 0 0 4px rgba(255,120,180,.15);
}
.bd-textarea::placeholder { color: #a08090; }
.bd-field-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 16px;
}
.bd-field-label {
  font-size: 13px; font-weight: 800;
  color: #ffb8d1;
  white-space: nowrap;
}
.bd-select {
  flex: 1;
  height: 44px;
  padding: 0 12px;
  border: 1.5px solid rgba(255,120,180,.25);
  border-radius: 12px;
  background: rgba(255,240,245,.06);
  color: #fff0f5;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  outline: none;
  transition: border-color .15s ease;
}
.bd-select:focus { border-color: #ff7fb0; }
.bd-select option {
  background: #1a0812;
  color: #fff0f5;
}
.bd-hint {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,77,148,.12);
  border: 1px solid rgba(255,120,180,.3);
  font-size: 12px;
  font-weight: 700;
  color: #ff9ec7;
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
  font-weight: 800;
  cursor: pointer;
  border: 1.5px solid rgba(255,120,180,.25);
  background: rgba(255,240,245,.06);
  color: #ffb8d1;
  transition: transform .15s ease, background .15s ease;
}
.bd-btn:active { transform: scale(.98); }
.bd-btn.primary {
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  border-color: transparent;
  box-shadow:
    0 0 0 1px rgba(255,150,195,.4),
    0 8px 20px -6px rgba(255,77,148,.5);
}
.bd-btn:disabled { opacity: .5; pointer-events: none; }
.bd-modal-msg {
  min-height: 18px;
  margin-top: 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #ff9ec7;
}

/* ============================================================
   CONFETTI
============================================================ */
.bd-confetti {
  position: fixed;
  top: -20px;
  z-index: 21400;
  font-size: 22px;
  pointer-events: none;
  animation: bdConfettiFall linear forwards;
}

/* ============================================================
   CELEBRATION
============================================================ */
#bdCelebration {
  position: fixed; inset: 0; z-index: 21300;
  display: none; align-items: center; justify-content: center;
  background:
    radial-gradient(circle at 30% 30%, rgba(255,77,148,.35), transparent 50%),
    radial-gradient(circle at 70% 70%, rgba(177,0,92,.5), transparent 50%),
    linear-gradient(135deg, #1a0812 0%, #0f0508 100%);
  text-align: center;
}
#bdCelebration.show { display: flex; animation: bdFade .3s ease; }
.bd-cele-inner {
  padding: 24px;
  animation: bdPop .5s cubic-bezier(.16,.9,.25,1);
}
.bd-cele-cake {
  font-size: 72px;
  margin-bottom: 12px;
  animation: bdCakeBob 1.8s ease-in-out infinite;
  filter: drop-shadow(0 8px 20px rgba(255,77,148,.5));
}
.bd-cele-title {
  font-size: 20px;
  font-weight: 500;
  color: #ff9ec7;
  letter-spacing: .18em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.bd-cele-name {
  font-size: 34px;
  font-weight: 800;
  background: linear-gradient(135deg, #ff4d94, #ffb8d1, #ff4d94);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: bdFlameShift 3s linear infinite;
  letter-spacing: -.02em;
  margin-bottom: 14px;
}
.bd-cele-sub {
  font-size: 14px;
  font-weight: 600;
  color: #d1759a;
  margin-bottom: 28px;
  line-height: 1.5;
}
.bd-cele-btn {
  padding: 12px 28px;
  border: 0; border-radius: 999px;
  background: linear-gradient(135deg, #ff4d94, #b1005c);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow:
    0 0 0 1px rgba(255,150,195,.4),
    0 10px 24px -8px rgba(255,77,148,.6);
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
      <div class="bd-shell">
        <header class="bd-head">
          <button type="button" class="bd-head-btn" id="bdBack" aria-label="Quay lại">←</button>
          <div class="bd-head-center">
            <div class="bd-head-avatar">
              <span id="bdHeadAvatar">🎂</span>
              <img id="bdHeadAvatarImg" alt="" style="display:none">
            </div>
            <div class="bd-head-info">
              <span class="bd-head-title" id="bdHeadTitle">Sinh nhật ${esc(RECIPIENT)} 🎂</span>
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
      btn.style.background = 'linear-gradient(135deg, #ff4d94, #b1005c)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'transparent';
      btn.style.boxShadow = '0 0 0 1px rgba(255,150,195,.5), 0 0 10px rgba(255,77,148,.5)';
    } else {
      btn.style.background = 'rgba(255,120,180,.08)';
      btn.style.color = '#ffb8d1';
      btn.style.borderColor = 'rgba(255,120,180,.3)';
      btn.style.boxShadow = '';
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
          inputEl.closest('.bd-reply-input-row')?.parentNode?.appendChild(errEl);
        }
        errEl.textContent = 'Lỗi: ' + (e.message || e);
      }
      if (sendBtn) sendBtn.disabled = false;
    } finally {
      S.inlineSending = false;
    }
  }

  /* ============ BUILD HELPERS ============ */
  function buildAvatarEl(name, size) {
    const av = document.createElement('div');
    av.className = size === 'sm' ? 'bd-reply-av' : (size === 'input' ? 'bd-reply-input-av' : 'bd-av');
    const avUrl = getAvatarUrl(name);
    if (avUrl) {
      const img = document.createElement('img');
      img.src = avUrl; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.remove(); av.textContent = getInitial(name); };
      av.appendChild(img);
    } else {
      av.textContent = getInitial(name);
    }
    return av;
  }

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

  function renderReplyInline(r) {
    const row = document.createElement('div');
    row.className = 'bd-reply-inline';
    row.dataset.id = r.id;

    row.appendChild(buildAvatarEl(r.sender, 'sm'));

    const body = document.createElement('div');
    body.className = 'bd-reply-body';

    const nameEl = document.createElement('span');
    nameEl.className = 'bd-reply-name';
    nameEl.textContent = (r.sender || RECIPIENT) + ':';

    const textEl = document.createElement('span');
    textEl.className = 'bd-reply-text';
    textEl.textContent = r.message;

    const timeEl = document.createElement('span');
    timeEl.className = 'bd-reply-time';
    timeEl.textContent = formatTime(r.ts);

    body.append(nameEl, document.createTextNode(' '), textEl, timeEl);
    row.appendChild(body);

    return row;
  }

  function renderReplyInput(w) {
    const row = document.createElement('div');
    row.className = 'bd-reply-input-row';

    row.appendChild(buildAvatarEl(RECIPIENT, 'input'));

    const input = document.createElement('textarea');
    input.className = 'bd-reply-input';
    input.dataset.id = w.id;
    input.rows = 1;
    input.maxLength = 500;
    input.placeholder = 'Trả lời ' + shortName(w.sender) + '...';
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

    row.append(input, sendBtn, cancelBtn);
    return row;
  }

  function renderCard(w, replies) {
    const isMe = !!w.isFromRecipient;
    const isNew = !S.seenIds.has(w.id);

    const card = document.createElement('div');
    card.className = 'bd-card' + (isMe ? ' me' : '');
    card.dataset.id = w.id;

    const main = document.createElement('div');
    main.className = 'bd-main';

    if (!isMe) {
      main.appendChild(buildAvatarEl(w.sender, 'md'));
    }

    const wrap = document.createElement('div');
    wrap.className = 'bd-bubble-wrap';

    const nameRow = document.createElement('div');
    nameRow.className = 'bd-name-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'bd-name';
    nameEl.textContent = w.sender || 'Ẩn danh';

    const timeEl = document.createElement('span');
    timeEl.className = 'bd-time-inline';
    timeEl.textContent = formatTime(w.ts);

    nameRow.append(nameEl, timeEl);
    wrap.appendChild(nameRow);

    const bubble = document.createElement('div');
    bubble.className = 'bd-bubble' + (isMe && isNew ? ' shine' : '');
    bubble.textContent = w.message;
    wrap.appendChild(bubble);

    main.appendChild(wrap);
    card.appendChild(main);

    const hasReplies = replies && replies.length > 0;
    const isReplying = S.inlineReplyToId === w.id;

    if (hasReplies || isReplying) {
      const repliesBlock = document.createElement('div');
      repliesBlock.className = 'bd-replies';

      if (hasReplies) {
        replies.forEach(r => repliesBlock.appendChild(renderReplyInline(r)));
      }

      if (isReplying) {
        repliesBlock.appendChild(renderReplyInput(w));
      }

      card.appendChild(repliesBlock);
    }

    if (S.isOwner && !isMe && !isReplying) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'bd-reply-link';
      link.innerHTML = '<span class="bd-rl-icon">↩</span><span>Trả lời</span>';
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInlineReply(w.id);
      });
      card.appendChild(link);
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
          <div class="bd-empty-sub">Hãy là người đầu tiên gửi lời chúc<br>đến ${esc(RECIPIENT)} nhé!</div>
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
      frag.appendChild(renderCard(w, replies));

      lastTs = w.ts;
      S.seenIds.add(w.id);
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

      if (force) { S.wishes = []; S.seenIds.clear(); }

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
    const emojis = ['🎊','🎉','🌸','💖','✨','🎂','🎁','🌟','💝','🌺'];
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
        <div class="bd-modal-title">Gửi lời chúc 🎂</div>
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

    log('v3.4 ready ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once: true });
  } else {
    setTimeout(boot, 200);
  }
})();