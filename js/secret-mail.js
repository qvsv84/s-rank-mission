/* =========================================================
   SECRET CHAT — Chat nhóm real-time (thay thế Secret Mail)
   - Polling 3s để lấy tin mới
   - Optimistic UI khi gửi
   - Auto-scroll + scroll-lock khi user kéo lên đọc
   - Grouping tin nhắn liên tiếp cùng người
   - Avatar từ getAvatarUrl
   - Inject CSS động (không cần sửa main.css)
   ========================================================= */
(function(){
  "use strict";

  if (window.__secretChatLoaded) return;
  window.__secretChatLoaded = true;

  // =========================================================
  // CONFIG
  // =========================================================
  const POLL_INTERVAL_MS  = 3000;
  const POLL_HIDDEN_MS    = 15000;
  const MAX_MESSAGES      = 200;
  const GROUP_WINDOW_MS   = 60000;
  const LAST_PICKED_KEY   = "srank_last_picked_name_v1";
  const LAST_SEEN_TS_KEY  = "srank_chat_last_seen_ts_v1";
  const UNREAD_KEY        = "srank_chat_unread_v1";
  const MAX_TEXT_LENGTH   = 1000;

  // =========================================================
  // STATE
  // =========================================================
  const state = {
    messages: [],
    lastTs: 0,
    myName: "",
    pageOpen: false,
    pollTimer: null,
    pollInFlight: false,
    isAtBottom: true,
    unread: 0,
    pendingSends: new Map(),
  };

  // =========================================================
  // UTILITIES
  // =========================================================
  const $ = id => document.getElementById(id);
  const escapeHtml = s => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function pad(n){ return String(n).padStart(2, "0"); }
  function formatTime(ts){
    const d = new Date(ts);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function formatDay(ts){
    const d = new Date(ts), now = new Date();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return "Hôm nay";
    if (diff === 1) return "Hôm qua";
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(d);
  }
  function sameDay(a, b){
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
  }
  function getInitial(name){
    const s = String(name || "").trim();
    return s ? s.slice(0, 1).toUpperCase() : "?";
  }
  function getAvatar(name){
    try{
      if (typeof window.getAvatarUrl === "function") return window.getAvatarUrl(name) || "";
      if (window.SRank && typeof window.SRank.getAvatarUrl === "function") return window.SRank.getAvatarUrl(name) || "";
    }catch(_){}
    return "";
  }
  function getApi(){
    return window.__srankApi || (window.SRank && window.SRank.api) || null;
  }

  // =========================================================
  // IDENTITY (ai đang chat)
  // =========================================================
  function loadMyName(){
    try{
      const saved = String(localStorage.getItem(LAST_PICKED_KEY) || "").trim();
      if (saved) return saved;
    }catch(_){}
    try{
      const s = window.__getChecklistState && window.__getChecklistState();
      if (s && Array.isArray(s.names) && s.names.length) return s.names[0];
    }catch(_){}
    return "";
  }
  function saveMyName(name){
    state.myName = String(name || "").trim();
    try{ localStorage.setItem(LAST_PICKED_KEY, state.myName); }catch(_){}
    updateComposerAvatar();
  }
  function getAllNames(){
    try{
      const s = window.__getChecklistState && window.__getChecklistState();
      if (s && Array.isArray(s.names) && s.names.length) return s.names.slice();
    }catch(_){}
    return [];
  }

  // =========================================================
  // UNREAD BADGE
  // =========================================================
  function loadUnread(){
    try{ state.unread = Math.max(0, Number(localStorage.getItem(UNREAD_KEY) || 0) || 0); }
    catch(_){ state.unread = 0; }
  }
  function saveUnread(){
    try{ localStorage.setItem(UNREAD_KEY, String(state.unread)); }catch(_){}
    updateFabBadge();
  }
  function updateFabBadge(){
    const fab = $("secretMailBtn");
    if (!fab) return;
    let badge = fab.querySelector(".sc-fab-badge");
    if (state.unread > 0 && !state.pageOpen){
      if (!badge){
        badge = document.createElement("span");
        badge.className = "sc-fab-badge";
        fab.appendChild(badge);
      }
      badge.textContent = state.unread > 99 ? "99+" : String(state.unread);
    } else if (badge){
      badge.remove();
    }
  }
  function markAllSeen(){
    if (state.unread === 0) return;
    state.unread = 0;
    saveUnread();
  }

  // =========================================================
  // CSS INJECTION
  // =========================================================
  function injectStyles(){
    if ($("secretChatStyles")) return;
    const style = document.createElement("style");
    style.id = "secretChatStyles";
    style.textContent = `
/* ============ SECRET CHAT ============ */
.sc-fab-badge{
  position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 6px;
  border-radius:10px;background:linear-gradient(135deg,#e05b9e,#f07fb5);color:#fff;
  font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 10px rgba(216,91,158,.42);animation:scBadgePop .32s cubic-bezier(.16,.9,.25,1)
}
@keyframes scBadgePop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}

.secret-chat-page{
  position:fixed;inset:0;z-index:20500;display:none;flex-direction:column;
  background:
    radial-gradient(circle at 15% 0%,rgba(255,214,232,.5),transparent 42%),
    radial-gradient(circle at 88% 100%,rgba(197,240,220,.45),transparent 44%),
    radial-gradient(circle at 50% 50%,rgba(232,220,255,.25),transparent 60%),
    linear-gradient(180deg,#fffbf7 0%,#fdf6ff 50%,#f5fffa 100%);
  color:#3d4a58;font-family:var(--font, ui-rounded, system-ui);
  overflow:hidden;
}
.secret-chat-page.show{display:flex}

.sc-header{
  flex:0 0 auto;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:8px;
  padding:calc(10px + env(safe-area-inset-top)) 12px 10px;
  background:rgba(255,255,255,.94);backdrop-filter:blur(20px) saturate(120%);
  -webkit-backdrop-filter:blur(20px) saturate(120%);
  border-bottom:1px solid rgba(255,158,199,.22);
  box-shadow:0 4px 20px rgba(255,120,180,.06);
  z-index:10;
}
.sc-header-btn{
  width:44px;height:44px;display:flex;align-items:center;justify-content:center;
  border:1.5px solid rgba(255,158,199,.3);border-radius:14px;
  background:rgba(255,255,255,.9);color:#c04a90;font-size:20px;font-weight:900;
  cursor:pointer;transition:transform .15s ease,background .15s ease;
}
.sc-header-btn:active{transform:scale(.94);background:#fff}
.sc-header-center{display:flex;align-items:center;gap:10px;min-width:0}
.sc-header-avatar{
  position:relative;width:40px;height:40px;border-radius:50%;flex:0 0 auto;
  background:linear-gradient(135deg,#ffd6e8,#e8dcff);color:#fff;
  display:flex;align-items:center;justify-content:center;
  font-size:16px;font-weight:900;overflow:hidden;
  border:2px solid #fff;box-shadow:0 3px 10px rgba(216,91,158,.18);
}
.sc-header-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}
.sc-header-avatar .sc-online-dot{
  position:absolute;bottom:0;right:0;width:12px;height:12px;border-radius:50%;
  background:#5cbd91;border:2px solid #fff;box-shadow:0 0 8px #5cbd91;
  animation:scPulse 2s ease-in-out infinite;
}
@keyframes scPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.7}}
.sc-header-info{min-width:0;display:flex;flex-direction:column;gap:1px}
.sc-header-title{
  font-size:15px;font-weight:950;color:#c04a90;letter-spacing:.02em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.sc-header-sub{
  font-size:10.5px;font-weight:800;color:#8fb7a3;
  display:flex;align-items:center;gap:4px;
}
.sc-header-sub .dot{
  width:5px;height:5px;border-radius:50%;background:#5cbd91;
  animation:scPulse 2s ease-in-out infinite;
}

.sc-list{
  flex:1 1 auto;overflow-y:auto;overflow-x:hidden;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  padding:14px 12px 8px;
  display:flex;flex-direction:column;gap:2px;
  scroll-behavior:smooth;
}
.sc-list::-webkit-scrollbar{width:4px}
.sc-list::-webkit-scrollbar-thumb{background:rgba(255,158,199,.35);border-radius:2px}

.sc-day-divider{
  align-self:center;margin:14px 0 10px;padding:4px 14px;
  background:rgba(255,255,255,.75);border:1px solid rgba(255,158,199,.25);
  border-radius:999px;color:#8a9a91;font-size:10.5px;font-weight:900;
  letter-spacing:.06em;text-transform:uppercase;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
}

.sc-row{
  display:flex;gap:8px;align-items:flex-end;
  margin-top:8px;animation:scMsgIn .28s cubic-bezier(.16,.9,.25,1) both;
}
.sc-row.me{flex-direction:row-reverse}
.sc-row.compact{margin-top:2px}
@keyframes scMsgIn{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}

.sc-avatar{
  width:32px;height:32px;border-radius:50%;flex:0 0 auto;
  background:linear-gradient(135deg,#ffd6e8,#e8dcff);color:#fff;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:900;overflow:hidden;
  border:2px solid #fff;box-shadow:0 3px 8px rgba(216,91,158,.15);
  align-self:flex-start;margin-top:18px;
}
.sc-row.compact .sc-avatar{visibility:hidden}
.sc-row.me .sc-avatar{display:none}
.sc-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}

.sc-bubble-wrap{display:flex;flex-direction:column;max-width:72%;min-width:0}
.sc-row.me .sc-bubble-wrap{align-items:flex-end}

.sc-meta{
  display:flex;align-items:baseline;gap:6px;padding:0 4px 3px;
  font-size:10px;color:#b7a8b8;font-weight:800;
}
.sc-row.me .sc-meta{flex-direction:row-reverse}
.sc-sender{
  font-size:11.5px;font-weight:900;color:#5cbd91;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;
}
.sc-time{font-variant-numeric:tabular-nums}
.sc-row.compact .sc-meta{display:none}

.sc-bubble{
  position:relative;padding:10px 14px;border-radius:20px 20px 20px 4px;
  background:#fff;border:1.5px solid rgba(255,158,199,.22);
  color:#3d4a58;font-size:15px;font-weight:650;line-height:1.45;
  word-break:break-word;white-space:pre-wrap;
  box-shadow:0 3px 12px -4px rgba(255,120,180,.15);
  transition:transform .15s ease;
}
.sc-row.me .sc-bubble{
  background:linear-gradient(135deg,#ffa5d0,#ff7db5);
  border-color:transparent;color:#fff;
  border-radius:20px 20px 4px 20px;
  box-shadow:0 4px 14px -4px rgba(255,120,180,.45);
  text-shadow:0 1px 1px rgba(180,60,120,.15);
}
.sc-bubble.pending{opacity:.72}
.sc-bubble.failed{
  border-color:rgba(216,91,158,.55)!important;
  background:linear-gradient(135deg,#ffe0ef,#ffd0e5)!important;
  color:#a04070!important;
}
.sc-bubble.failed::after{
  content:"⚠ Gửi lỗi • chạm để thử lại";
  display:block;margin-top:4px;font-size:10px;font-weight:800;
  color:#d9663f;letter-spacing:.02em;
}

.sc-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;padding:60px 24px;text-align:center;color:#b7a8b8;
}
.sc-empty-emoji{font-size:64px;opacity:.6;filter:drop-shadow(0 4px 10px rgba(255,158,199,.3))}
.sc-empty-title{font-size:16px;font-weight:900;color:#8a9a91}
.sc-empty-sub{font-size:12px;font-weight:700;color:#b7a8b8;line-height:1.5}

.sc-jump-btn{
  position:absolute;right:16px;bottom:88px;z-index:5;
  width:40px;height:40px;border-radius:50%;border:1.5px solid rgba(255,158,199,.4);
  background:rgba(255,255,255,.97);color:#c04a90;font-size:18px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  box-shadow:0 8px 22px -6px rgba(216,91,158,.3);
  opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;
}
.sc-jump-btn.show{opacity:1;pointer-events:auto}
.sc-jump-btn:active{transform:scale(.92)}

.sc-composer{
  flex:0 0 auto;display:flex;gap:8px;align-items:flex-end;
  padding:10px 12px calc(10px + env(safe-area-inset-bottom));
  background:rgba(255,255,255,.96);backdrop-filter:blur(20px) saturate(120%);
  -webkit-backdrop-filter:blur(20pxurate) sat(120%);
  border-top:1px solid rgba(255,158,199,.2);
  box-shadow:0 -4px 24px rgba(255,120,180,.06);
  z-index:10;
}
.sc-composer-avatar{
  width:40px;height:40px;border-radius:50%;flex:0 0 auto;cursor:pointer;
  background:linear-gradient(135deg,#ffd6e8,#e8dcff);color:#fff;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:900;overflow:hidden;
  border:2px solid #fff;box-shadow:0 3px 10px rgba(216,91,158,.18);
  transition:transform .15s ease;
}
.sc-composer-avatar:active{transform:scale(.9)}
.sc-composer-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}
.sc-composer-input{
  flex:1 1 auto;min-height:40px;max-height:120px;
  padding:10px 14px;border:1.5px solid rgba(255,158,199,.28);
  border-radius:20px;background:#fff;color:#3d4a58;
  font-family:inherit;font-size:15px;font-weight:650;line-height:1.4;
  outline:none;resize:none;overflow-y:auto;
  transition:border-color .2s,box-shadow .2s;
}
.sc-composer-input:focus{
  border-color:#ff9ec7;
  box-shadow:0 0 0 4px rgba(255,158,199,.15);
}
.sc-composer-input::placeholder{color:#c9b8c4}
.sc-send-btn{
  width:40px;height:40px;flex:0 0 auto;border:0;border-radius:50%;
  background:linear-gradient(135deg,#ffa5d0,#ff7db5);color:#fff;
  font-size:16px;font-weight:900;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 6px 14px -4px rgba(255,120,180,.5);
  transition:transform .15s ease,opacity .2s,box-shadow .2s;
}
.sc-send-btn:active{transform:scale(.92)}
.sc-send-btn:disabled{opacity:.4;pointer-events:none;box-shadow:none}

.sc-picker-overlay{
  position:fixed;inset:0;z-index:20600;display:none;align-items:center;justify-content:center;
  padding:18px;background:rgba(17,52,45,.42);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
}
.sc-picker-overlay.show{display:flex;animation:scFade .22s ease}
@keyframes scFade{from{opacity:0}to{opacity:1}}
.sc-picker-panel{
  width:min(92vw,380px);padding:18px 14px 16px;
  border:1.5px solid rgba(255,214,232,.75);border-radius:26px;
  background:#fff8fd;box-shadow:0 24px 70px rgba(180,100,150,.28);
  animation:scSheetPop .28s cubic-bezier(.16,.9,.25,1);
}
@keyframes scSheetPop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
.sc-picker-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sc-picker-title{font-size:16px;font-weight:900;color:#c04a90}
.sc-picker-close{
  width:36px;height:36px;border:0;border-radius:50%;
  background:rgba(255,214,232,.5);color:#c04a90;font-size:20px;cursor:pointer;
}
.sc-picker-list{
  display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow-y:auto;
  padding:2px;scrollbar-width:thin;
}
.sc-picker-item{
  display:flex;align-items:center;gap:10px;padding:10px 12px;
  border:1.5px solid rgba(255,158,199,.2);border-radius:14px;
  background:#fff;cursor:pointer;font-family:inherit;
  transition:transform .15s ease,background .15s ease,border-color .15s ease;
}
.sc-picker-item:active{transform:scale(.98)}
.sc-picker-item:hover{border-color:rgba(255,158,199,.5);background:#fffafd}
.sc-picker-item.active{
  background:linear-gradient(135deg,#fff0f8,#ffe0f0);
  border-color:#ff9ec7;
}
.sc-picker-avatar{
  width:34px;height:34px;border-radius:50%;flex:0 0 auto;
  background:linear-gradient(135deg,#ffd6e8,#e8dcff);color:#fff;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:900;overflow:hidden;
  border:2px solid #fff;box-shadow:0 2px 6px rgba(216,91,158,.15);
}
.sc-picker-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}
.sc-picker-name{
  flex:1;min-width:0;font-size:13.5px;font-weight:850;color:#3d4a58;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.sc-picker-check{color:#ff7db5;font-size:18px;font-weight:900}

@media (max-width: 420px){
  .sc-bubble{font-size:14.5px;padding:9px 13px}
  .sc-bubble-wrap{max-width:76%}
  .sc-sender{max-width:110px}
}
`;
    document.head.appendChild(style);
  }

  // =========================================================
  // BUILD UI
  // =========================================================
  function ensureFab(){
    let fab = $("secretMailBtn");
    if (fab) return fab;
    fab = document.createElement("button");
    fab.id = "secretMailBtn";
    fab.type = "button";
    fab.className = "sm-fab";
    fab.setAttribute("aria-label", "Mở Chat nhóm");
    fab.innerHTML = `
      <span class="sm-fab-icon" aria-hidden="true">🐱</span>
      <span class="sm-fab-text">Chat nhóm</span>
      <span class="sm-fab-shine" aria-hidden="true"></span>`;
    document.body.appendChild(fab);
    return fab;
  }

  function buildPage(){
    let page = $("secretMailPage");
    if (page) return page;

    page = document.createElement("section");
    page.id = "secretMailPage";
    page.className = "secret-chat-page";
    page.setAttribute("aria-hidden", "true");
    page.innerHTML = `
      <header class="sc-header">
        <button type="button" class="sc-header-btn" id="scBackBtn" aria-label="Quay lại">←</button>
        <div class="sc-header-center">
          <div class="sc-header-avatar">
            <span id="scHeaderAvatarFallback">🐱</span>
            <img id="scHeaderAvatarImg" alt="" style="display:none">
            <span class="sc-online-dot"></span>
          </div>
          <div class="sc-header-info">
            <span class="sc-header-title">Chat nhóm Đảo Mèo</span>
            <span class="sc-header-sub">
              <span class="dot"></span>
              <span id="scHeaderSub">Đang hoạt động</span>
            </span>
          </div>
        </div>
        <button type="button" class="sc-header-btn" id="scMenuBtn" aria-label="Tuỳ chọn">⋯</button>
      </header>

      <div class="sc-list" id="scList"></div>

      <button type="button" class="sc-jump-btn" id="scJumpBtn" aria-label="Xuống cuối">↓</button>

      <div class="sc-composer">
        <button type="button" class="sc-composer-avatar" id="scComposerAvatar" aria-label="Đổi danh tính">
          <span id="scComposerAvatarFallback">?</span>
          <img id="scComposerAvatarImg" alt="" style="display:none">
        </button>
        <textarea class="sc-composer-input" id="scInput" rows="1" maxlength="${MAX_TEXT_LENGTH}" placeholder="Nhập tin nhắn…" autocomplete="off"></textarea>
        <button type="button" class="sc-send-btn" id="scSendBtn" aria-label="Gửi" disabled>➤</button>
      </div>

      <div class="sc-picker-overlay" id="scPickerOverlay" aria-hidden="true">
        <div class="sc-picker-panel" role="dialog" aria-modal="true">
          <div class="sc-picker-head">
            <span class="sc-picker-title">Bạn là ai?</span>
            <button type="button" class="sc-picker-close" id="scPickerClose">×</button>
          </div>
          <div class="sc-picker-list" id="scPickerList"></div>
        </div>
      </div>
    `;
    document.body.appendChild(page);
    return page;
  }

  // =========================================================
  // RENDER — MESSAGE LIST
  // =========================================================
  let _lastRenderSig = "";

  function messageSig(m){
    return `${m.id}|${m.name}|${m.text}|${m.ts}|${m.pending ? 1 : 0}|${m.failed ? 1 : 0}`;
  }
  function computeSig(){
    return state.messages.map(messageSig).join("::");
  }

  function renderMessages(force = false){
    const list = $("scList");
    if (!list) return;
    const sig = computeSig();
    if (!force && sig === _lastRenderSig) return;
    _lastRenderSig = sig;

    const sorted = state.messages.slice().sort((a, b) => a.ts - b.ts);

    if (sorted.length === 0){
      list.innerHTML = `
        <div class="sc-empty">
          <div class="sc-empty-emoji">🐱</div>
          <div class="sc-empty-title">Chưa có tin nhắn nào</div>
          <div class="sc-empty-sub">Hãy là người đầu tiên gửi lời chào<br>đến cả nhà Đảo Mèo nhé!</div>
        </div>`;
      _lastRenderSig = sig;
      return;
    }

    const frag = document.createDocumentFragment();
    let lastTs = 0;
    let lastSender = "";
    let lastMsgTime = 0;

    for (let i = 0; i < sorted.length; i++){
      const m = sorted[i];

      if (!lastTs || !sameDay(lastTs, m.ts)){
        const div = document.createElement("div");
        div.className = "sc-day-divider";
        div.textContent = formatDay(m.ts);
        frag.appendChild(div);
        lastSender = "";
        lastMsgTime = 0;
      }

      const isMe = String(m.name || "").trim() === state.myName && state.myName;
      const isSameSender = m.name === lastSender;
      const withinWindow = (m.ts - lastMsgTime) < GROUP_WINDOW_MS;
      const compact = isSameSender && withinWindow && !isMe;

      const row = document.createElement("div");
      row.className = "sc-row" + (isMe ? " me" : "") + (compact ? " compact" : "");
      row.dataset.id = m.id;

      const av = document.createElement("div");
      av.className = "sc-avatar";
      const avUrl = getAvatar(m.name);
      if (avUrl){
        av.innerHTML = `<img src="${escapeHtml(avUrl)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentNode.textContent='${escapeHtml(getInitial(m.name))}'">`;
      } else {
        av.textContent = getInitial(m.name);
      }

      const wrap = document.createElement("div");
      wrap.className = "sc-bubble-wrap";

      const meta = document.createElement("div");
      meta.className = "sc-meta";
      meta.innerHTML = `<span class="sc-sender">${escapeHtml(m.name || "Ẩn danh")}</span><span class="sc-time">${formatTime(m.ts)}</span>`;

      const bubble = document.createElement("div");
      bubble.className = "sc-bubble" + (m.pending ? " pending" : "") + (m.failed ? " failed" : "");
      bubble.textContent = m.text;

      if (m.failed && isMe){
        bubble.style.cursor = "pointer";
        bubble.addEventListener("click", () => retrySend(m.id), { once: true });
      }

      wrap.append(meta, bubble);
      row.append(av, wrap);
      frag.appendChild(row);

      lastTs = m.ts;
      lastSender = m.name;
      lastMsgTime = m.ts;
    }

    list.innerHTML = "";
    list.appendChild(frag);
  }

  // =========================================================
  // SCROLL HANDLING
  // =========================================================
  function scrollToBottom(smooth = true){
    const list = $("scList");
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }
  function updateJumpBtn(){
    const btn = $("scJumpBtn");
    if (!btn) return;
    btn.classList.toggle("show", !state.isAtBottom && state.messages.length > 0);
  }

  // =========================================================
  // POLLING
  // =========================================================
  function startPolling(){
    stopPolling();
    const tick = async () => {
      state.pollTimer = setTimeout(tick, state.pageOpen && !document.hidden
        ? POLL_INTERVAL_MS
        : POLL_HIDDEN_MS);
      if (state.pollInFlight) return;
      if (!state.pageOpen && document.hidden) return;
      await fetchMessages();
    };
    tick();
  }
  function stopPolling(){
    if (state.pollTimer){ clearTimeout(state.pollTimer); state.pollTimer = null; }
  }

  async function fetchMessages(){
    const api = getApi();
    if (!api) return;
    state.pollInFlight = true;
    try{
      const since = state.lastTs > 0 ? state.lastTs - 1000 : 0;
      const r = await api("getSecretMessages", { since, _ts: Date.now() }, 12000);
      if (!r || !r.ok) return;
      const arr = Array.isArray(r.data && r.data.messages) ? r.data.messages : [];
      let added = 0;
      let newest = 0;
      for (const raw of arr){
        const id = String(raw && raw.id || "").trim();
        const text = String(raw && raw.text || "").trim();
        if (!id || !text) continue;
        if (state.messages.some(m => m.id === id)) continue;
        const name = String(raw && raw.name || "").trim() || "Ẩn danh";
        const ts = Number(raw && raw.ts) || Date.now();
        state.messages.push({ id, name, text, ts });
        added++;
        if (ts > newest) newest = ts;
      }
      if (newest > state.lastTs) state.lastTs = newest;
      if (state.messages.length > MAX_MESSAGES){
        state.messages = state.messages.slice(-MAX_MESSAGES);
        _lastRenderSig = "";
      }
      if (added > 0){
        if (!state.pageOpen){
          for (const raw of arr){
            const name = String(raw && raw.name || "").trim() || "Ẩn danh";
            if (name !== state.myName) state.unread++;
          }
          saveUnread();
        }
        const wasAtBottom = state.isAtBottom;
        renderMessages();
        if (wasAtBottom || state.pageOpen === false){
          requestAnimationFrame(() => scrollToBottom(true));
        } else {
          updateJumpBtn();
        }
        if (state.pageOpen) markAllSeen();
      } else {
        renderMessages();
      }
    } catch(_){}
    finally{ state.pollInFlight = false; }
  }

  // =========================================================
  // SEND
  // =========================================================
  function makeLocalId(){
    return "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  async function sendMessage(text){
    const raw = String(text || "").trim();
    if (!raw) return;
    if (!state.myName){
      openPicker();
      return;
    }
    if (raw.length > MAX_TEXT_LENGTH) return;

    const localId = makeLocalId();
    const now = Date.now();
    const pending = {
      id: localId, name: state.myName, text: raw, ts: now,
      pending: true, failed: false,
    };
    state.messages.push(pending);
    state.pendingSends.set(localId, { text: raw, name: state.myName });
    renderMessages();
    requestAnimationFrame(() => scrollToBottom(true));

    await doSend(localId, raw, state.myName);
  }

  async function doSend(localId, text, name){
    const api = getApi();
    if (!api){
      markSendFailed(localId);
      return;
    }
    try{
      const r = await api("sendSecretMessage", {
        text,
        name,
        clientTs: String(Date.now()),
      }, 15000);
      if (!r || !r.ok){
        markSendFailed(localId);
        return;
      }
      const official = r.data || {};
      const idx = state.messages.findIndex(m => m.id === localId);
      if (idx >= 0){
        const realId = String(official.id || localId);
        const realTs = Number(official.ts) || state.messages[idx].ts;
        state.messages[idx] = {
          id: realId, name, text,
          ts: realTs,
          pending: false, failed: false,
        };
        if (realTs > state.lastTs) state.lastTs = realTs;
      }
      state.pendingSends.delete(localId);
      _lastRenderSig = "";
      renderMessages();
    } catch(_){
      markSendFailed(localId);
    }
  }

  function markSendFailed(localId){
    const idx = state.messages.findIndex(m => m.id === localId);
    if (idx < 0) return;
    state.messages[idx].pending = false;
    state.messages[idx].failed = true;
    _lastRenderSig = "";
    renderMessages();
  }

  function retrySend(localId){
    const info = state.pendingSends.get(localId);
    const idx = state.messages.findIndex(m => m.id === localId);
    if (idx < 0) return;
    const m = state.messages[idx];
    const text = info && info.text || m.text;
    const name = info && info.name || m.name;
    m.pending = true;
    m.failed = false;
    _lastRenderSig = "";
    renderMessages();
    doSend(localId, text, name);
  }
// =========================================================
  // IDENTITY PICKER
  // =========================================================
  function openPicker(){
    const overlay = $("scPickerOverlay");
    const list = $("scPickerList");
    if (!overlay || !list) return;
    const names = getAllNames();
    if (names.length === 0){
      list.innerHTML = `<div style="text-align:center;padding:20px;color:#b7a8b8;font-size:12px">Chưa có danh sách thành viên</div>`;
    } else {
      list.innerHTML = "";
      names.forEach(n => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sc-picker-item" + (n === state.myName ? " active" : "");
        const avUrl = getAvatar(n);
        const av = avUrl
          ? `<img src="${escapeHtml(avUrl)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.textContent='${escapeHtml(getInitial(n))}'">`
          : escapeHtml(getInitial(n));
        item.innerHTML = `
          <span class="sc-picker-avatar">${av}</span>
          <span class="sc-picker-name">${escapeHtml(n)}</span>
          ${n === state.myName ? '<span class="sc-picker-check">✓</span>' : ""}`;
        item.addEventListener("click", () => {
          saveMyName(n);
          closePicker();
          renderMessages(true);
          updateHeaderSub();
        });
        list.appendChild(item);
      });
    }
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }
  function closePicker(){
    const overlay = $("scPickerOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }

  // =========================================================
  // HEADER / AVATAR UPDATES
  // =========================================================
  function updateComposerAvatar(){
    const fallback = $("scComposerAvatarFallback");
    const img = $("scComposerAvatarImg");
    if (!fallback || !img) return;
    if (!state.myName){
      fallback.style.display = "";
      fallback.textContent = "?";
      img.style.display = "none";
      return;
    }
    const url = getAvatar(state.myName);
    if (url){
      img.src = url;
      img.style.display = "";
      img.onerror = () => {
        img.style.display = "none";
        fallback.style.display = "";
        fallback.textContent = getInitial(state.myName);
      };
      fallback.style.display = "none";
    } else {
      img.style.display = "none";
      fallback.style.display = "";
      fallback.textContent = getInitial(state.myName);
    }
  }

  function updateHeaderSub(){
    const sub = $("scHeaderSub");
    if (!sub) return;
    const names = getAllNames();
    if (names.length > 0){
      sub.textContent = names.length + " thành viên";
    } else {
      sub.textContent = "Đang hoạt động";
    }
  }

  // =========================================================
  // OPEN / CLOSE PAGE
  // =========================================================
  function openPage(){
    const page = $("secretMailPage");
    if (!page) return;
    if (!state.myName) state.myName = loadMyName();
    page.classList.add("show");
    page.setAttribute("aria-hidden", "false");
    state.pageOpen = true;
    document.body.style.overflow = "hidden";

    updateComposerAvatar();
    updateHeaderSub();
    renderMessages(true);
    markAllSeen();
    startPolling();
    fetchMessages();
    requestAnimationFrame(() => scrollToBottom(false));

    if (typeof window.syncQuickTools === "function") window.syncQuickTools();
  }
  function closePage(){
    const page = $("secretMailPage");
    if (!page) return;
    page.classList.remove("show");
    page.setAttribute("aria-hidden", "true");
    state.pageOpen = false;
    document.body.style.overflow = "";
    if (typeof window.syncQuickTools === "function") window.syncQuickTools();
  }

  // =========================================================
  // EVENT WIRING
  // =========================================================
  function bindEvents(){
    const fab = $("secretMailBtn");
    if (fab){
      fab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPage();
      });
    }

    const backBtn = $("scBackBtn");
    if (backBtn) backBtn.addEventListener("click", closePage);

    const composerAv = $("scComposerAvatar");
    if (composerAv) composerAv.addEventListener("click", openPicker);

    const pickerClose = $("scPickerClose");
    if (pickerClose) pickerClose.addEventListener("click", closePicker);

    const pickerOverlay = $("scPickerOverlay");
    if (pickerOverlay){
      pickerOverlay.addEventListener("click", (e) => {
        if (e.target && e.target.id === "scPickerOverlay") closePicker();
      });
    }

    const input = $("scInput");
    const sendBtn = $("scSendBtn");
    if (input && sendBtn){
      const refreshSendState = () => {
        const has = input.value.trim().length > 0;
        sendBtn.disabled = !has;
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      };
      input.addEventListener("input", refreshSendState);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing){
          e.preventDefault();
          if (input.value.trim()){
            sendMessage(input.value);
            input.value = "";
            refreshSendState();
          }
        }
      });
      sendBtn.addEventListener("click", () => {
        if (input.value.trim()){
          sendMessage(input.value);
          input.value = "";
          refreshSendState();
        }
      });
      refreshSendState();
    }

    const list = $("scList");
    if (list){
      list.addEventListener("scroll", () => {
        const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
        state.isAtBottom = distanceFromBottom < 60;
        updateJumpBtn();
      }, { passive: true });
    }

    const jumpBtn = $("scJumpBtn");
    if (jumpBtn){
      jumpBtn.addEventListener("click", () => {
        state.isAtBottom = true;
        scrollToBottom(true);
        updateJumpBtn();
      });
    }

    const menuBtn = $("scMenuBtn");
    if (menuBtn){
      menuBtn.addEventListener("click", () => {
        const choice = confirm("Xoá lịch sử chat trên thiết bị này?\n(Tin nhắn trên server vẫn còn)");
        if (choice){
          state.messages = [];
          state.lastTs = 0;
          _lastRenderSig = "";
          renderMessages(true);
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const picker = $("scPickerOverlay");
      if (picker && picker.classList.contains("show")){
        closePicker();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (state.pageOpen){
        closePage();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.pageOpen){
        fetchMessages();
        if (typeof window.syncQuickTools === "function") window.syncQuickTools();
      }
    });

    window.addEventListener("checkinDone", (e) => {
      const name = e && e.detail && e.detail.name;
      if (name && name !== state.myName){
        saveMyName(name);
      }
    });
  }

  // =========================================================
  // BOOT
  // =========================================================
  function init(){
    injectStyles();
    ensureFab();
    buildPage();
    state.myName = loadMyName();
    loadUnread();

    setTimeout(() => {
      fetchMessages();
      updateFabBadge();
    }, 800);

    setInterval(() => {
      if (state.pageOpen) return;
      if (document.hidden) return;
      fetchMessages();
    }, POLL_HIDDEN_MS);

    bindEvents();
    updateComposerAvatar();
    updateHeaderSub();
    updateFabBadge();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
