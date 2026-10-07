/* =========================================================
   CHECKLIST UI v5.1
   - FIX 1: cleanup v3/v4 cũ tránh chồng UI
   - FIX 2: đợi ảnh avatar load xong trước khi chụp
   - FIX 3: revoke blob URL khi đóng preview (tránh leak)
   - FIX 4: normalize giờ "5:12" → "05:12" để sort đúng
   - FIX 5: search tiếng Việt không dấu
   - Nút chụp: chỉ dùng CDN + timeout, không treo
   - UI: logo + tabs filter + search + stat pills
   ========================================================= */
(function(){
  "use strict";
  if (window.__clV5) return;

  // ⚡ FIX 1: Cleanup v3/v4 cũ nếu còn sót
  try {
    ['clV3Root','clV4Root','clV3Styles','clV4Styles','clV3DebugModal','clV4DebugModal','clV4PreviewModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    window.__clV3Loaded = true;
    window.__clV4Loaded = true;
  } catch(_){}

  const ROOT_ID    = 'clV5Root';
  const REFRESH_MS = 20000;
  const MAX_RETRY  = 20;
  const CDN_LIST   = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
  ];

  const S = {
    names: [], checks: [], times: [], points: [], ranks: [],
    prev: null,
    loading: false,
    timer: null,
    retryCount: 0,
    booted: false,
    h2cPromise: null,
    filter: 'all',
    search: '',
  };

  /* ============ HELPERS ============ */
  const $ = id => document.getElementById(id);
  const log = (...args) => console.log('[CL5]', ...args);
  const warn = (...args) => console.warn('[CL5]', ...args);

  // ⚡ FIX 5: normalize bỏ dấu tiếng Việt
  function normalize(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  // ⚡ FIX 4: normalize giờ "5:12" → "05:12"
  function normTime(t){
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '99:99';
    return String(m[1]).padStart(2, '0') + ':' + m[2];
  }

  function getApi(){
    return window.__srankApi || (window.SRank && window.SRank.api) || null;
  }
  function getInitial(n){
    const s = String(n || '').trim();
    return s ? s.slice(0,1).toUpperCase() : '?';
  }
  function avatarUrl(n){
    try {
      if (typeof window.getAvatarUrl === 'function') return window.getAvatarUrl(n) || '';
      if (window.SRank && typeof window.SRank.getAvatarUrl === 'function') return window.SRank.getAvatarUrl(n) || '';
    } catch(_){}
    return '';
  }
  function timeAgo(hhmm){
    if (!hhmm) return '';
    const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return hhmm;
    const h = Number(m[1]), mi = Number(m[2]);
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    const diff = now.getTime() - t.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 0) return hhmm;
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return mins + ' phút trước';
    return hhmm;
  }

  /* ============ LOAD html2canvas — ROBUST ============ */
  function tryLoadScript(url, timeoutMs){
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        warn('Timeout CDN: ' + url);
        resolve(false);
      }, timeoutMs || 4000);

      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => {
        clearTimeout(timer);
        resolve(typeof window.html2canvas === 'function');
      };
      s.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  function loadHtml2Canvas(){
    if (typeof window.html2canvas === 'function'){
      return Promise.resolve(window.html2canvas);
    }
    if (S.h2cPromise) return S.h2cPromise;

    log('Bắt đầu load html2canvas từ CDN...');
    S.h2cPromise = (async () => {
      for (const url of CDN_LIST){
        const ok = await tryLoadScript(url, 4000);
        if (ok){
          log('✓ h2c loaded: ' + url);
          return window.html2canvas;
        }
      }
      warn('✗ Tất cả CDN thất bại');
      S.h2cPromise = null;
      return null;
    })();

    return S.h2cPromise;
  }

  /* ============ STYLES ============ */
  function injectStyles(){
    if ($('clV5Styles')) return;
    const style = document.createElement('style');
    style.id = 'clV5Styles';
    style.textContent = `
#clV5Root {
  display: flex; flex-direction: column;
  padding: 16px 14px 14px; border-radius: 24px;
  background:
    radial-gradient(ellipse 100% 60% at 50% 0%, rgba(232,247,238,.9), transparent 60%),
    linear-gradient(160deg, #ffffff 0%, #f8fcf9 50%, #eef7ef 100%);
  border: 1px solid rgba(200,220,205,.55);
  box-shadow:
    0 16px 40px -16px rgba(45,85,60,.16),
    0 4px 12px -4px rgba(45,85,60,.08),
    inset 0 1px 0 rgba(255,255,255,.95);
}
.clv5-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 14px; padding: 0 2px; flex-shrink: 0;
}
.clv5-title-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; }
.clv5-logo {
  width: 34px; height: 34px; border-radius: 11px;
  background: linear-gradient(135deg, #7ad79a, #4fa370);
  color: #fff; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 14px -6px rgba(79,163,112,.55);
  flex-shrink: 0;
}
.clv5-title { font-size: 15.5px; font-weight: 950; color: #234a32; line-height: 1.15; }
.clv5-sub { font-size: 10.5px; font-weight: 800; color: #7a9a85; margin-top: 1px; }
.clv5-count-pill {
  flex-shrink: 0; font-size: 12.5px; font-weight: 950;
  color: #4a7a5a; background: rgba(122,184,150,.16);
  padding: 5px 12px; border-radius: 999px;
  border: 1px solid rgba(122,184,150,.25);
  font-variant-numeric: tabular-nums;
}
.clv5-count-pill.full {
  color: #fff;
  background: linear-gradient(135deg, #7ad79a, #4fa370);
  border-color: transparent;
  box-shadow: 0 4px 12px -3px rgba(79,163,112,.5);
}
.clv5-progress {
  height: 8px; border-radius: 4px;
  background: rgba(200,220,205,.42);
  overflow: hidden; margin: 0 2px 14px; flex-shrink: 0;
  position: relative;
}
.clv5-progress-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #a3e0b8 0%, #4fa370 100%);
  border-radius: 4px;
  transition: width .8s cubic-bezier(.16,.9,.25,1);
  box-shadow: 0 0 12px rgba(79,163,112,.5);
  position: relative;
}
.clv5-progress-fill::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0; width: 30px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.5));
  animation: clv5Shine 2.5s ease-in-out infinite;
}
@keyframes clv5Shine {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}
.clv5-toolbar {
  display: flex; gap: 8px; margin-bottom: 12px;
  flex-shrink: 0; align-items: center;
}
.clv5-search-wrap { flex: 1; position: relative; min-width: 0; }
.clv5-search {
  width: 100%; height: 38px;
  padding: 0 32px 0 34px;
  border: 1.5px solid rgba(200,220,205,.7);
  border-radius: 12px;
  background: rgba(255,255,255,.9);
  color: #2a4d38;
  font-family: inherit; font-size: 13px; font-weight: 700;
  outline: none;
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.clv5-search::placeholder { color: #a8bdb0; font-weight: 800; }
.clv5-search:focus {
  border-color: #7ab896;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(122,184,150,.15);
}
.clv5-search-icon {
  position: absolute; left: 11px; top: 50%;
  transform: translateY(-50%);
  font-size: 14px; color: #8fa89a;
  pointer-events: none;
}
.clv5-search-clear {
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  width: 22px; height: 22px; padding: 0;
  border: 0; border-radius: 50%;
  background: rgba(200,220,205,.5);
  color: #6b8f78;
  font-size: 12px; font-weight: 900;
  cursor: pointer;
  display: none;
  align-items: center; justify-content: center;
}
.clv5-search-clear.show { display: flex; }
.clv5-tabs {
  display: flex; gap: 6px; margin-bottom: 12px;
  padding: 4px; border-radius: 14px;
  background: rgba(200,220,205,.25);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.clv5-tabs::-webkit-scrollbar { display: none; }
.clv5-tab {
  flex: 1 1 auto; min-width: 0;
  min-height: 34px; padding: 6px 12px;
  border: 1.5px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #6b8f78;
  font-family: inherit; font-size: 12px; font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  transition: all .2s ease;
  display: flex; align-items: center; justify-content: center; gap: 5px;
}
.clv5-tab:active { transform: scale(.96); }
.clv5-tab.active {
  background: #fff;
  color: #2a4d38;
  border-color: rgba(122,184,150,.35);
  box-shadow: 0 2px 8px -2px rgba(45,85,60,.14);
}
.clv5-tab-badge {
  font-size: 10px;
  padding: 1px 6px; border-radius: 999px;
  background: rgba(200,220,205,.6);
  color: #4a7a5a;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.clv5-tab.active .clv5-tab-badge {
  background: rgba(122,184,150,.22);
  color: #2a6b45;
}
.clv5-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 56vh; overflow-y: auto; overflow-x: hidden;
  padding: 2px 6px 2px 2px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(122,184,150,.42) transparent;
}
.clv5-list::-webkit-scrollbar { width: 5px; }
.clv5-list::-webkit-scrollbar-track { background: transparent; }
.clv5-list::-webkit-scrollbar-thumb {
  background: rgba(122,184,150,.42);
  border-radius: 3px;
}
.clv5-divider {
  display: flex; align-items: center; gap: 10px;
  margin: 10px 2px 2px;
  font-size: 10.5px; font-weight: 950;
  color: #8fa89a; letter-spacing: .1em;
  text-transform: uppercase;
}
.clv5-divider::before, .clv5-divider::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200,220,205,.8), transparent);
}
.clv5-divider:first-child { margin-top: 2px; }
.clv5-card {
  display: grid;
  grid-template-columns: 24px 40px 1fr auto;
  align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 14px;
  background: #fff;
  border: 1.5px solid rgba(200,220,205,.55);
  transition: transform .18s cubic-bezier(.16,.9,.25,1),
              box-shadow .25s ease,
              background .25s ease,
              border-color .25s ease;
  position: relative; overflow: hidden;
  flex-shrink: 0;
}
.clv5-card:active { transform: scale(.985); }
.clv5-card.checked {
  background: linear-gradient(160deg, #f4fbf6 0%, #e8f6ed 100%);
  border-color: rgba(122,184,150,.55);
}
.clv5-card.top1 {
  background: linear-gradient(160deg, #fffbe9 0%, #fff0c4 100%);
  border-color: rgba(216,168,32,.6);
  box-shadow: 0 6px 18px -10px rgba(216,168,32,.45);
}
.clv5-card.top2 {
  background: linear-gradient(160deg, #fafbfc 0%, #eaedef 100%);
  border-color: rgba(150,158,168,.55);
  box-shadow: 0 5px 16px -10px rgba(120,130,140,.35);
}
.clv5-card.top3 {
  background: linear-gradient(160deg, #fff5e8 0%, #ffe2c4 100%);
  border-color: rgba(200,130,70,.55);
  box-shadow: 0 5px 16px -10px rgba(200,130,70,.38);
}
.clv5-rank {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1; flex-shrink: 0;
}
.clv5-rank-num {
  font-size: 11.5px; color: #a8bdb0; font-weight: 950;
  font-variant-numeric: tabular-nums;
}
.clv5-av {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, #e8f5ec, #d4ead9);
  color: #4a7a5a;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 950;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 3px 10px -4px rgba(45,85,60,.2);
  position: relative;
}
.clv5-av img { width:100%; height:100%; object-fit:cover; display:block; }
.clv5-card.checked .clv5-av { box-shadow: 0 0 0 2px #7ab896, 0 3px 12px -4px rgba(79,163,112,.35); }
.clv5-card.top1 .clv5-av { box-shadow: 0 0 0 2px #e0b840, 0 3px 12px -4px rgba(216,168,32,.45); }
.clv5-card.top2 .clv5-av { box-shadow: 0 0 0 2px #a8b0b8, 0 3px 12px -4px rgba(120,130,140,.3); }
.clv5-card.top3 .clv5-av { box-shadow: 0 0 0 2px #c88246, 0 3px 12px -4px rgba(200,130,70,.35); }
.clv5-info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.clv5-name {
  font-size: 14px; font-weight: 900; color: #234a32;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.clv5-card.checked .clv5-name { color: #1a3d28; }
.clv5-card.top1 .clv5-name { color: #7a5410; }
.clv5-card.top2 .clv5-name { color: #4a5460; }
.clv5-card.top3 .clv5-name { color: #7a4a20; }
.clv5-sub {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 800; color: #7a9a85;
  flex-wrap: wrap; min-height: 14px;
}
.clv5-time { font-variant-numeric: tabular-nums; font-weight: 900; color: #6b8f78; }
.clv5-time.recent { color: #4fa370; }
.clv5-dot { width: 3px; height: 3px; border-radius: 50%; background: #c0d0c4; flex-shrink: 0; }
.clv5-pts { font-variant-numeric: tabular-nums; font-weight: 950; color: #4fa370; }
.clv5-pts.early { color: #d89020; }
.clv5-idle { color: #a8bdb0; }
.clv5-check {
  width: 26px; height: 26px; border-radius: 50%;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(200,220,205,.4);
  border: 2px solid rgba(200,220,205,.7);
  transition: all .3s ease;
}
.clv5-check.on {
  background: linear-gradient(135deg, #7ad79a, #4fa370);
  border-color: transparent;
  box-shadow: 0 3px 10px -3px rgba(79,163,112,.55);
}
.clv5-check svg { width: 14px; height: 14px; }
.clv5-check.on svg { color: #fff; }
.clv5-check svg { color: transparent; }
.clv5-empty {
  padding: 40px 20px; text-align: center;
  color: #9ab0a0; font-size: 13px; font-weight: 800;
}
.clv5-empty-emoji {
  font-size: 44px; margin-bottom: 10px;
  opacity: .55;
  filter: drop-shadow(0 4px 8px rgba(122,184,150,.2));
}
.clv5-empty-title { font-size: 14px; font-weight: 900; color: #6b8f78; margin-bottom: 4px; }
.clv5-empty-sub { font-size: 11.5px; color: #a8bdb0; }
.clv5-actions {
  display: grid;
  grid-template-columns: 1fr 1fr 40px;
  gap: 8px;
  margin-top: 14px; padding-top: 14px;
  border-top: 1px dashed rgba(200,220,205,.7);
  flex-shrink: 0;
}
.clv5-btn {
  min-height: 44px; padding: 10px 14px;
  border: 1.5px solid rgba(200,220,205,.8);
  border-radius: 12px;
  background: #fff; color: #315744;
  font-family: inherit; font-size: 12.5px; font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: all .15s ease;
}
.clv5-btn:active { transform: scale(.96); background: #f5fbf5; }
.clv5-btn:disabled { opacity: .55; pointer-events: none; }
.clv5-btn svg { width: 15px; height: 15px; }
.clv5-btn.primary {
  background: linear-gradient(180deg, #7ab896, #4fa370);
  color: #fff; border-color: transparent;
  box-shadow: 0 6px 14px -6px rgba(79,163,112,.5);
}
.clv5-btn.primary:active { background: linear-gradient(180deg, #6ba885, #44956a); }
.clv5-btn.icon-only { padding: 0; }
.clv5-foot {
  margin-top: 8px; font-size: 10.5px; font-weight: 800;
  color: #a8bdb0; text-align: center;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; gap: 5px;
}
.clv5-foot-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #7ab896;
  animation: clv5Pulse 2.2s ease-in-out infinite;
}
@keyframes clv5Pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .4; transform: scale(.85); }
}
#clv5PreviewModal {
  position: fixed; inset: 0; z-index: 30000;
  display: none; align-items: center; justify-content: center;
  background: rgba(15, 38, 26, .78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 16px;
}
#clv5PreviewModal.show { display: flex; animation: clv5Fade .22s ease; }
@keyframes clv5Fade { from { opacity: 0 } to { opacity: 1 } }
.clv5-preview-panel {
  width: 100%; max-width: 440px; max-height: 92vh;
  background: #fff; border-radius: 22px; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  box-shadow: 0 30px 80px rgba(0,0,0,.4);
  animation: clv5Pop .3s cubic-bezier(.16,.9,.25,1);
}
@keyframes clv5Pop {
  from { opacity: 0; transform: scale(.92) translateY(10px) }
  to   { opacity: 1; transform: scale(1) translateY(0) }
}
.clv5-preview-head {
  display: flex; align-items: center; justify-content: space-between;
}
.clv5-preview-title {
  font-size: 15px; font-weight: 950; color: #234a32;
  display: flex; align-items: center; gap: 8px;
}
.clv5-preview-close {
  width: 34px; height: 34px; border: 0; border-radius: 50%;
  background: rgba(200,220,205,.5); color: #4a7a5a;
  font-size: 20px; font-weight: 900; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.clv5-preview-imgbox {
  flex: 1 1 auto; overflow: auto;
  border-radius: 14px; background: #f5fbf5;
  display: flex; align-items: flex-start; justify-content: center;
  min-height: 120px;
}
.clv5-preview-imgbox img {
  width: 100%; height: auto; display: block; border-radius: 14px;
}
.clv5-preview-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.clv5-preview-actions button {
  min-height: 46px; padding: 10px 14px;
  border-radius: 12px; font-family: inherit;
  font-size: 13px; font-weight: 950; cursor: pointer;
  border: 1.5px solid transparent;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: transform .15s ease;
}
.clv5-preview-actions button:active { transform: scale(.96); }
.clv5-preview-actions .save {
  background: linear-gradient(180deg, #7ab896, #4fa370); color: #fff;
  box-shadow: 0 8px 18px -8px rgba(79,163,112,.5);
}
.clv5-preview-actions .open {
  background: #fff; color: #315744;
  border-color: rgba(200,220,205,.75);
}
.clv5-preview-hint {
  font-size: 11.5px; font-weight: 800;
  color: #8fa89a; text-align: center; line-height: 1.45;
}
.clv5-preview-hint b { color: #4a7a5a; }
#clv5DebugModal {
  position: fixed; inset: 0; z-index: 31000;
  display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.75);
  padding: 16px;
}
#clv5DebugModal.show { display: flex; }
.clv5-debug-panel {
  width: 100%; max-width: 440px; max-height: 80vh;
  background: #0f1e17; color: #d4d4d4;
  border-radius: 16px; padding: 18px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px; line-height: 1.7;
  overflow: auto;
  white-space: pre-wrap; word-break: break-word;
}
.clv5-debug-panel .ok { color: #4ec9b0; }
.clv5-debug-panel .fail { color: #f48771; }
.clv5-debug-panel .warn { color: #dcdcaa; }
.clv5-debug-panel .info { color: #9cdcfe; }
.clv5-debug-panel button {
  margin-top: 14px; width: 100%; padding: 12px;
  background: #007acc; color: #fff; border: 0;
  border-radius: 10px; font-weight: 950;
  cursor: pointer; font-size: 13px; font-family: inherit;
}
    `;
    document.head.appendChild(style);
  }

  /* ============ ICONS ============ */
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 12h2M3 12h2M19 6l2-1M3 6l2-1M19 18l2 1M3 18l2 1M9 3l1 2M15 3l-1 2"/></svg>'
  };

  /* ============ BUILD ROOT ============ */
  function ensureRoot(){
    let root = $(ROOT_ID);
    if (root) return root;
    const panel = $('checklistPanel');
    if (!panel) return null;

    const oldScroll = panel.querySelector('#checklistScroll');
    const oldActions = panel.querySelector('#checklistActions');
    if (oldScroll) oldScroll.style.display = 'none';
    if (oldActions) oldActions.style.display = 'none';

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="clv5-head">
        <div class="clv5-title-wrap">
          <div class="clv5-logo">☑</div>
          <div>
            <div class="clv5-title">Checklist hôm nay</div>
            <div class="clv5-sub" id="clv5Sub">Đang tải…</div>
          </div>
        </div>
        <div class="clv5-count-pill" id="clv5Count">0/0</div>
      </div>

      <div class="clv5-progress">
        <div class="clv5-progress-fill" id="clv5Bar"></div>
      </div>

      <div class="clv5-toolbar">
        <div class="clv5-search-wrap">
          <span class="clv5-search-icon">🔍</span>
          <input type="text" class="clv5-search" id="clv5Search" placeholder="Tìm tên..." autocomplete="off">
          <button type="button" class="clv5-search-clear" id="clv5SearchClear">×</button>
        </div>
      </div>

      <div class="clv5-tabs" id="clv5Tabs">
        <button type="button" class="clv5-tab active" data-filter="all">
          Tất cả <span class="clv5-tab-badge" id="clv5TabAll">0</span>
        </button>
        <button type="button" class="clv5-tab" data-filter="checked">
          Đã <span class="clv5-tab-badge" id="clv5TabChecked">0</span>
        </button>
        <button type="button" class="clv5-tab" data-filter="unchecked">
          Chưa <span class="clv5-tab-badge" id="clv5TabUnchecked">0</span>
        </button>
      </div>

      <div class="clv5-list" id="clv5List"></div>

      <div class="clv5-actions">
        <button type="button" class="clv5-btn primary" id="clv5Capture">
          ${ICON.camera}<span>Chụp</span>
        </button>
        <button type="button" class="clv5-btn" id="clv5Sync">
          ${ICON.sync}<span>Đồng bộ</span>
        </button>
        <button type="button" class="clv5-btn icon-only" id="clv5DebugBtn" title="Debug">
          ${ICON.bug}
        </button>
      </div>

      <div class="clv5-foot">
        <span class="clv5-foot-dot"></span>
        <span id="clv5Foot">Đang khởi động…</span>
      </div>
    `;
    panel.appendChild(root);

    // Bind nút với capture=true để chặn event bubble
    root.querySelector('#clv5Capture').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); onCapture();
    }, true);
    root.querySelector('#clv5Sync').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); forceRefresh();
    }, true);
    root.querySelector('#clv5DebugBtn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); runDebug();
    }, true);

    // Search
    const search = root.querySelector('#clv5Search');
    const searchClear = root.querySelector('#clv5SearchClear');
    search.addEventListener('input', () => {
      // ⚡ FIX 5: normalize bỏ dấu
      S.search = normalize(search.value.trim());
      searchClear.classList.toggle('show', S.search.length > 0);
      render();
    });
    searchClear.addEventListener('click', () => {
      search.value = '';
      S.search = '';
      searchClear.classList.remove('show');
      render();
    });

    // Tabs
    root.querySelectorAll('.clv5-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        root.querySelectorAll('.clv5-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        S.filter = tab.dataset.filter;
        render();
      });
    });

    log('Root created ✓');
    return root;
  }

  /* ============ DEBUG ============ */
  async function runDebug(){
    const L = [];
    const p = (icon, txt) => L.push(icon + ' ' + txt);

    p('ℹ️', '=== DEBUG CHECKLIST v5.1 ===');
    p('ℹ️', 'Time: ' + new Date().toLocaleString('vi-VN'));
    p('ℹ️', '');

    const root = $(ROOT_ID);
    p(root ? '✅' : '❌', 'Root: ' + (root ? 'OK' : 'KHÔNG'));

    const panel = $('checklistPanel');
    p(panel ? '✅' : '❌', 'Panel: ' + (panel ? 'OK' : 'KHÔNG'));

    const api = getApi();
    p(api ? '✅' : '❌', 'API: ' + (api ? 'OK' : 'KHÔNG'));

    p('ℹ️', 'Data: ' + S.names.length + ' người');

    if (S.names.length){
      const checked = S.checks.filter(Boolean).length;
      p('ℹ️', 'Đã check: ' + checked + '/' + S.names.length);
    }

    p('ℹ️', 'html2canvas: ' + (typeof window.html2canvas === 'function' ? 'đã load' : 'chưa load'));
    p('ℹ️', '');
    p('⏳', 'Đang test load html2canvas...');

    showDebugPanel(L);

    try {
      const h2c = await loadHtml2Canvas();
      p(h2c ? '✅' : '❌', 'html2canvas: ' + (h2c ? 'LOAD OK' : 'LOAD FAIL (mạng/adblock)'));

      if (h2c){
        p('⏳', 'Test chụp 1 ô nhỏ...');
        const testDiv = document.createElement('div');
        testDiv.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:80px;background:#4fa370;color:#fff;padding:20px;font-size:20px;font-weight:bold;border-radius:12px';
        testDiv.textContent = 'TEST';
        document.body.appendChild(testDiv);
        try {
          const c = await h2c(testDiv, { logging: false });
          p('✅', 'Test canvas: ' + c.width + 'x' + c.height);
        } catch(e){
          p('❌', 'Test canvas lỗi: ' + e.message);
        }
        testDiv.remove();
      }
    } catch(e){
      p('❌', 'Load lỗi: ' + e.message);
    }

    p('ℹ️', '');
    p('ℹ️', '=== KẾT THÚC ===');
    showDebugPanel(L);
  }

  function showDebugPanel(lines){
    let modal = $('clv5DebugModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'clv5DebugModal';
    modal.innerHTML = `
      <div class="clv5-debug-panel">
        ${lines.join('\n')}
        <button type="button">Đóng</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('show');

    const close = () => modal.remove();
    modal.querySelector('button').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  /* ============ PREVIEW ============ */
  function showPreview(url, filename){
    let modal = $('clv5PreviewModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'clv5PreviewModal';
    modal.innerHTML = `
      <div class="clv5-preview-panel">
        <div class="clv5-preview-head">
          <div class="clv5-preview-title">📸 Checklist đã chụp</div>
          <button type="button" class="clv5-preview-close">×</button>
        </div>
        <div class="clv5-preview-imgbox">
          <img src="${url}" alt="Checklist">
        </div>
        <div class="clv5-preview-actions">
          <button type="button" class="save">💾 Lưu ảnh</button>
          <button type="button" class="open">🔗 Mở tab</button>
        </div>
        <div class="clv5-preview-hint">
          Nút <b>Lưu</b> không chạy? → <b>nhấn giữ vào ảnh</b> rồi chọn "Lưu ảnh".
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // ⚡ FIX 3: revoke URL khi đóng
    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
        setTimeout(() => {
          try { URL.revokeObjectURL(url); } catch(_){}
        }, 5000);
      }, 250);
    };
    modal.querySelector('.clv5-preview-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('.save').addEventListener('click', () => {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || ('checklist-' + Date.now() + '.png');
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch(e) {
        window.open(url, '_blank');
      }
    });

    modal.querySelector('.open').addEventListener('click', () => {
      window.open(url, '_blank');
    });

    requestAnimationFrame(() => modal.classList.add('show'));
  }

  /* ============ SORT + FILTER ============ */
  function buildSortedList(){
    const items = S.names.map((name, i) => ({
      name,
      checked: !!S.checks[i],
      time: String(S.times[i] || '').trim(),
      points: Number(S.points[i]) || 0,
      origIdx: i
    }));

    // ⚡ FIX 4: normalize giờ trước khi sort
    const withTime = items.filter(x => x.checked && x.time)
      .sort((a, b) => normTime(a.time).localeCompare(normTime(b.time)));
    const top3 = withTime.slice(0, 3);
    const top3Names = new Set(top3.map(x => x.name));
    const checked = withTime.slice(3);
    const unchecked = items.filter(x => !x.checked).sort((a, b) => a.origIdx - b.origIdx);

    return {
      all: [...top3, ...checked, ...unchecked],
      top3, top3Names,
      counts: {
        all: items.length,
        checked: items.filter(x => x.checked).length,
        unchecked: items.filter(x => !x.checked).length
      }
    };
  }

  /* ============ RENDER ============ */
  function render(){
    const list = $('clv5List');
    const countEl = $('clv5Count');
    const barEl = $('clv5Bar');
    const subEl = $('clv5Sub');
    const footEl = $('clv5Foot');

    if (!list) return;

    const total = S.names.length;
    const checkedCount = S.checks.filter(Boolean).length;
    const pct = total ? Math.round(checkedCount * 100 / total) : 0;

    if (countEl){
      countEl.textContent = `${checkedCount}/${total}`;
      countEl.classList.toggle('full', total > 0 && checkedCount === total);
    }
    if (barEl) barEl.style.width = pct + '%';

    if (subEl){
      subEl.textContent = total > 0
        ? `${checkedCount} đã check · ${total - checkedCount} còn lại`
        : 'Chưa có ai';
    }

    const all = buildSortedList();
    const tabAll = $('clv5TabAll');
    const tabChecked = $('clv5TabChecked');
    const tabUnchecked = $('clv5TabUnchecked');
    if (tabAll) tabAll.textContent = all.counts.all;
    if (tabChecked) tabChecked.textContent = all.counts.checked;
    if (tabUnchecked) tabUnchecked.textContent = all.counts.unchecked;

    if (!total){
      list.innerHTML = `
        <div class="clv5-empty">
          <div class="clv5-empty-emoji">🐱</div>
          <div class="clv5-empty-title">Chưa có ai</div>
          <div class="clv5-empty-sub">Danh sách trống</div>
        </div>`;
      if (footEl) footEl.textContent = 'Danh sách trống';
      return;
    }

    // Filter theo tab
    let displayItems;
    if (S.filter === 'checked'){
      displayItems = all.all.filter(x => x.checked);
    } else if (S.filter === 'unchecked'){
      displayItems = all.all.filter(x => !x.checked);
    } else {
      displayItems = all.all.slice();
    }

    // ⚡ FIX 5: search với normalize
    if (S.search){
      const q = S.search;
      displayItems = displayItems.filter(x =>
        normalize(x.name).includes(q)
      );
    }

    if (!displayItems.length){
      list.innerHTML = `
        <div class="clv5-empty">
          <div class="clv5-empty-emoji">🔍</div>
          <div class="clv5-empty-title">Không tìm thấy</div>
          <div class="clv5-empty-sub">Thử từ khoá khác</div>
        </div>`;
      return;
    }

    const ICONS = ['🥇','🥈','🥉'];
    const frag = document.createDocumentFragment();

    const prevByName = (S.prev && S.prev.byName) ? S.prev.byName : {};

    let lastSection = null;
    const showDividers = (S.filter === 'all' && !S.search);

    displayItems.forEach(item => {
      let section;
      if (all.top3Names.has(item.name)) section = 'top3';
      else if (item.checked) section = 'checked';
      else section = 'unchecked';

      if (showDividers && section !== lastSection){
        const div = document.createElement('div');
        div.className = 'clv5-divider';
        div.textContent = section === 'top3'
          ? '🏆 Top 3'
          : section === 'checked'
            ? `✓ Đã check (${all.counts.checked - all.top3.length})`
            : `○ Chưa (${all.counts.unchecked})`;
        frag.appendChild(div);
        lastSection = section;
      }

      const { name, checked, time, points } = item;
      const prevVal = prevByName[name];
      const justChecked = prevVal === false && checked === true;
      const rankIdx = all.top3Names.has(name)
        ? all.top3.findIndex(x => x.name === name)
        : undefined;

      const card = document.createElement('div');
      card.className = 'clv5-card';
      if (checked) card.classList.add('checked');
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2){
        card.classList.add('top' + (rankIdx + 1));
      }

      // Rank
      const rankEl = document.createElement('div');
      rankEl.className = 'clv5-rank';
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2){
        rankEl.textContent = ICONS[rankIdx];
      } else {
        const numEl = document.createElement('span');
        numEl.className = 'clv5-rank-num';
        numEl.textContent = String(item.origIdx + 1);
        rankEl.appendChild(numEl);
      }

      // Avatar
      const av = document.createElement('div');
      av.className = 'clv5-av';
      const u = avatarUrl(name);
      if (u){
        const img = document.createElement('img');
        img.src = u; img.loading = 'lazy'; img.decoding = 'async';
        img.onerror = () => { img.remove(); av.textContent = getInitial(name); };
        av.appendChild(img);
      } else {
        av.textContent = getInitial(name);
      }

      // Info
      const info = document.createElement('div');
      info.className = 'clv5-info';

      const nm = document.createElement('div');
      nm.className = 'clv5-name';
      nm.textContent = name;

      const sub = document.createElement('div');
      sub.className = 'clv5-sub';

      if (checked && time){
        const ago = timeAgo(time);
        const isRecent = ago === 'vừa xong' || /\d+ phút trước/.test(ago);
        const tEl = document.createElement('span');
        tEl.className = 'clv5-time' + (isRecent ? ' recent' : '');
        tEl.textContent = time;
        sub.appendChild(tEl);

        if (isRecent && ago !== time){
          const d = document.createElement('span');
          d.className = 'clv5-dot';
          sub.appendChild(d);
          const a = document.createElement('span');
          a.style.color = '#4fa370';
          a.textContent = ago;
          sub.appendChild(a);
        }

        if (points > 0){
          const d2 = document.createElement('span');
          d2.className = 'clv5-dot';
          sub.appendChild(d2);
          const p = document.createElement('span');
          p.className = 'clv5-pts' + (points >= 20 ? ' early' : '');
          p.textContent = '⭐ ' + points + 'đ';
          sub.appendChild(p);
        }
      } else {
        const idle = document.createElement('span');
        idle.className = 'clv5-idle';
        idle.textContent = 'Chưa check hôm nay';
        sub.appendChild(idle);
      }

      info.appendChild(nm);
      info.appendChild(sub);

      // Check icon
      const checkEl = document.createElement('div');
      checkEl.className = 'clv5-check' + (checked ? ' on' : '');
      checkEl.innerHTML = ICON.check;

      card.appendChild(rankEl);
      card.appendChild(av);
      card.appendChild(info);
      card.appendChild(checkEl);
      frag.appendChild(card);
    });

    list.innerHTML = '';
    list.appendChild(frag);

    const byName = {};
    S.names.forEach((n, i) => { byName[n] = !!S.checks[i]; });
    S.prev = { byName };

    if (footEl){
      const now = new Date();
      const hh = String(now.getHours()).padStart(2,'0');
      const mm = String(now.getMinutes()).padStart(2,'0');
      footEl.textContent = `Cập nhật ${hh}:${mm} · ${displayItems.length} hiển thị`;
    }
  }

  /* ============ DATA ============ */
  async function fetchData(){
    const api = getApi();
    if (!api) return null;
    try {
      const r = await api('getData', { _ts: Date.now() }, 15000);
      if (!r || !r.ok) return null;
      return r.data;
    } catch(e){
      warn('getData lỗi:', e && e.message);
      return null;
    }
  }

  function applyState(data){
    if (!data || !Array.isArray(data.names)) return false;
    S.names  = data.names.slice();
    S.checks = Array.isArray(data.checks) ? data.checks.slice() : [];
    S.times  = Array.isArray(data.times)  ? data.times.slice()  : [];
    S.points = Array.isArray(data.points) ? data.points.slice() : [];
    S.ranks  = Array.isArray(data.ranks)  ? data.ranks.slice()  : [];
    return true;
  }

  async function refresh(){
    if (S.loading) return;
    S.loading = true;
    try {
      const data = await fetchData();
      if (data && applyState(data)) render();
    } finally {
      S.loading = false;
    }
  }

  async function forceRefresh(){
    const oldBy = {};
    S.names.forEach((n, i) => { oldBy[n] = !!S.checks[i]; });
    const data = await fetchData();
    if (!data) return;
    S.prev = { byName: oldBy };
    applyState(data);
    render();
  }

  /* ============ CAPTURE ============ */
  async function onCapture(){
    const btn = $('clv5Capture');
    const oldHTML = btn ? btn.innerHTML : '';
    if (btn){
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Đang chụp…</span>';
    }

    let clone = null;
    try {
      log('Capture: load h2c...');
      const h2c = await loadHtml2Canvas();
      if (typeof h2c !== 'function'){
        alert('❌ Không tải được thư viện chụp ảnh.\n\nNguyên nhân có thể:\n• Mạng yếu\n• Adblock chặn CDN\n\nThử tắt chặn quảng cáo rồi bấm lại.');
        return;
      }

      const root = $(ROOT_ID);
      if (!root){ alert('❌ Không tìm thấy checklist'); return; }

      log('Capture: clone...');
      clone = root.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

      Object.assign(clone.style, {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        width: root.offsetWidth + 'px',
        maxHeight: 'none',
        height: 'auto',
        transform: 'none',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: '-1',
        background: '#f5fbf5',
        animation: 'none',
      });

      // Bỏ toolbar + tabs + actions + footer khỏi ảnh
      clone.querySelector('.clv5-toolbar')?.remove();
      clone.querySelector('.clv5-tabs')?.remove();
      clone.querySelector('.clv5-actions')?.remove();
      clone.querySelector('.clv5-foot')?.remove();

      // Bỏ scroll ở list
      const listClone = clone.querySelector('.clv5-list');
      if (listClone){
        listClone.style.maxHeight = 'none';
        listClone.style.overflow = 'visible';
        listClone.style.height = 'auto';
      }

      document.body.appendChild(clone);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // ⚡ FIX 2: đợi tất cả ảnh load xong
      const imgs = [...clone.querySelectorAll('img')];
      if (imgs.length){
        log('Capture: đợi ' + imgs.length + ' ảnh load...');
        await Promise.all(imgs.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise(res => {
            img.onload = res;
            img.onerror = res;
            setTimeout(res, 3000);
          });
        }));
        log('Capture: ảnh load xong');
      }

      log('Capture: render canvas...');
      const canvas = await h2c(clone, {
        backgroundColor: '#f5fbf5',
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: clone.offsetWidth,
        height: clone.scrollHeight,
        windowWidth: clone.offsetWidth,
        windowHeight: clone.scrollHeight,
      });

      log('Capture: canvas ' + canvas.width + 'x' + canvas.height);

      const blob = await new Promise((res, rej) => {
        canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png', 1);
      });

      const url = URL.createObjectURL(blob);
      const filename = 'checklist-' + new Date().toISOString().slice(0,10) + '.png';
      showPreview(url, filename);
      log('Capture: success ✓');

    } catch(e){
      console.error('[CL5] capture error:', e);
      alert('❌ Chụp thất bại:\n\n' + (e.message || e) + '\n\nBấm nút 🐛 để xem chi tiết.');
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      if (btn){
        btn.disabled = false;
        btn.innerHTML = oldHTML;
      }
    }
  }

  /* ============ EVENTS ============ */
  function bindGlobalEvents(){
    window.addEventListener('checkinDone', () => {
      setTimeout(() => forceRefresh(), 500);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
  }

  function startAutoTimer(){
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, REFRESH_MS);
  }

  /* ============ BOOT ============ */
  async function boot(){
    if (S.booted) return;
    injectStyles();

    const root = ensureRoot();
    if (!root){
      S.retryCount++;
      if (S.retryCount >= MAX_RETRY) return;
      setTimeout(boot, 300);
      return;
    }

    S.booted = true;
    bindGlobalEvents();
    startAutoTimer();
    await refresh();

    setTimeout(async () => {
      if (!S.names.length) await refresh();
    }, 3000);

    loadHtml2Canvas().catch(() => {});

    window.__clV5 = {
      refresh, forceRefresh, render,
      state: S,
      capture: onCapture,
      debug: runDebug,
      loadH2C: loadHtml2Canvas,
    };
    log('v5.1 ready ✓');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }
})();