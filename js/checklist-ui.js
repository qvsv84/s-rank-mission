/* =========================================================
   CHECKLIST UI v6.2 — Avatar cache + Canvas có ảnh thật
   - FIX flicker: cache DOM node theo tên (reuse khi render)
   - FIX canvas: preload avatar + vẽ vào canvas (clip tròn)
   - Full page + native canvas + share
   - Số thứ tự: theo vị trí hiển thị sau sort
   ========================================================= */
(function(){
  "use strict";
  if (window.__clV6) return;

  // Cleanup bản cũ
  try {
    ['clV3Root','clV4Root','clV5Root','clV3Styles','clV4Styles','clV5Styles',
     'clV3DebugModal','clV4DebugModal','clV5DebugModal','clV4PreviewModal','clV5PreviewModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    window.__clV3Loaded = true;
    window.__clV4Loaded = true;
    window.__clV5 = null;
  } catch(_){}

  const PAGE_ID = 'clV6Page';
  const REFRESH_MS = 25000;
  const MAX_RETRY = 20;
  const AVATAR_TIMEOUT = 5000;

  const S = {
    names: [], checks: [], times: [], points: [], ranks: [],
    prev: null,
    loading: false,
    timer: null,
    retryCount: 0,
    booted: false,
    pageOpen: false,
    search: '',
    busy: false,
    cardCache: new Map(),   // name → cached DOM node
  };

  // Cache URL avatar (tránh tính lại)
  const _avatarUrlCache = new Map();
  // Cache Image object cho canvas (đã load)
  const _avatarImgCache = new Map();  // url → { status, img, promise }

  /* ============ HELPERS ============ */
  const $ = id => document.getElementById(id);
  const log = (...args) => console.log('[CL6]', ...args);

  function normalize(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }
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
  // ⚡ Cache URL avatar
  function avatarUrl(name){
    if (_avatarUrlCache.has(name)) return _avatarUrlCache.get(name);
    let url = '';
    try {
      if (typeof window.getAvatarUrl === 'function') url = window.getAvatarUrl(name) || '';
      else if (window.SRank && typeof window.SRank.getAvatarUrl === 'function') {
        url = window.SRank.getAvatarUrl(name) || '';
      }
    } catch(_){}
    _avatarUrlCache.set(name, url);
    return url;
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

  /* =========================================================
     AVATAR LOADER CHO CANVAS
     ========================================================= */
  function loadAvatarImage(url){
    if (!url) return Promise.resolve(null);
    if (_avatarImgCache.has(url)){
      const c = _avatarImgCache.get(url);
      if (c.status === 'ready') return Promise.resolve(c.img);
      if (c.status === 'failed') return Promise.resolve(null);
      return c.promise;
    }

    const entry = { status: 'loading', img: null, promise: null };
    _avatarImgCache.set(url, entry);

    entry.promise = new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        if (entry.status === 'loading'){
          entry.status = 'failed';
          resolve(null);
        }
      }, AVATAR_TIMEOUT);
      img.onload = () => {
        clearTimeout(timer);
        entry.img = img;
        entry.status = 'ready';
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        entry.status = 'failed';
        resolve(null);
      };
      img.src = url;
    });

    return entry.promise;
  }

  // Preload avatar chạy nền (không block UI)
  function preloadAvatarsInBackground(){
    S.names.forEach(name => {
      const url = avatarUrl(name);
      if (!url) return;
      if (_avatarImgCache.has(url)) return;
      loadAvatarImage(url).catch(() => {});
    });
  }

  /* ============ STYLES ============ */
  function injectStyles(){
    if ($('clV6Styles')) return;
    const style = document.createElement('style');
    style.id = 'clV6Styles';
    style.textContent = `
#${PAGE_ID} {
  position: fixed; inset: 0; z-index: 20800;
  display: none; flex-direction: column;
  background:
    radial-gradient(ellipse 100% 40% at 50% 0%, rgba(232,247,238,.9), transparent 60%),
    linear-gradient(180deg, #f8fcf9 0%, #eef7ef 100%);
  color: #234a32;
  font-family: var(--font, ui-rounded, system-ui);
  overflow: hidden;
}
#${PAGE_ID}.show { display: flex; }

.clv6-head {
  flex-shrink: 0;
  display: grid; grid-template-columns: 44px 1fr 44px;
  align-items: center; gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 14px 10px;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(20px) saturate(120%);
  -webkit-backdrop-filter: blur(20px) saturate(120%);
  border-bottom: 1px solid rgba(200,220,205,.5);
  z-index: 10;
}
.clv6-head-btn {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid rgba(200,220,205,.7);
  border-radius: 14px;
  background: rgba(255,255,255,.9);
  color: #4a7a5a;
  font-size: 20px; font-weight: 900;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease;
}
.clv6-head-btn:active { transform: scale(.94); background: #f5fbf5; }
.clv6-head-btn.spinning svg { animation: clv6Spin .8s linear infinite; }
@keyframes clv6Spin { to { transform: rotate(360deg); } }
.clv6-head-title {
  min-width: 0; text-align: center;
  display: flex; flex-direction: column; gap: 1px;
}
.clv6-kicker {
  font-size: 9px; font-weight: 900;
  letter-spacing: .26em; color: #8fa89a;
  text-transform: uppercase;
}
.clv6-title {
  font-size: 18px; font-weight: 950;
  color: #234a32; letter-spacing: -.01em;
  line-height: 1.15; margin-top: 2px;
}
.clv6-body {
  flex: 1 1 auto; overflow-y: auto; overflow-x: hidden;
  -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  padding: 14px 14px 140px;
}
.clv6-body::-webkit-scrollbar { width: 5px; }
.clv6-body::-webkit-scrollbar-thumb {
  background: rgba(122,184,150,.4); border-radius: 3px;
}
.clv6-stats {
  padding: 16px 18px; border-radius: 20px;
  background:
    radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255,255,255,.95), transparent 70%),
    linear-gradient(160deg, #ffffff 0%, #f0f9f3 100%);
  border: 1px solid rgba(200,220,205,.55);
  box-shadow: 0 8px 24px -12px rgba(45,85,60,.16);
  margin-bottom: 14px;
}
.clv6-stats-top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 12px;
}
.clv6-stats-num {
  font-size: 28px; font-weight: 950;
  color: #4fa370;
  font-variant-numeric: tabular-nums;
  line-height: 1; letter-spacing: -.02em;
}
.clv6-stats-num small {
  font-size: 16px; font-weight: 900;
  color: #8fa89a; margin-left: 4px;
}
.clv6-stats-label {
  font-size: 11px; font-weight: 900;
  color: #6b8f78; letter-spacing: .1em;
  text-transform: uppercase;
}
.clv6-stats-date {
  font-size: 11.5px; font-weight: 900;
  color: #8fa89a;
  background: rgba(200,220,205,.35);
  padding: 5px 11px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.clv6-progress {
  height: 8px; border-radius: 4px;
  background: rgba(200,220,205,.45);
  overflow: hidden; position: relative;
}
.clv6-progress-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #a3e0b8 0%, #4fa370 100%);
  border-radius: 4px;
  transition: width .8s cubic-bezier(.16,.9,.25,1);
  box-shadow: 0 0 12px rgba(79,163,112,.5);
  position: relative;
}
.clv6-progress-fill::after {
  content: '';
  position: absolute; top: 0; right: 0; bottom: 0; width: 30px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.55));
  animation: clv6Shine 2.5s ease-in-out infinite;
}
@keyframes clv6Shine { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
.clv6-search-wrap {
  position: relative; margin-bottom: 14px;
}
.clv6-search {
  width: 100%; height: 46px;
  padding: 0 40px 0 42px;
  border: 1.5px solid rgba(200,220,205,.7);
  border-radius: 14px;
  background: rgba(255,255,255,.95);
  color: #234a32;
  font-family: inherit; font-size: 15px; font-weight: 700;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.clv6-search::placeholder { color: #a8bdb0; font-weight: 800; }
.clv6-search:focus {
  border-color: #7ab896; background: #fff;
  box-shadow: 0 0 0 4px rgba(122,184,150,.15);
}
.clv6-search-icon {
  position: absolute; left: 15px; top: 50%;
  transform: translateY(-50%);
  font-size: 15px; color: #8fa89a;
  pointer-events: none;
}
.clv6-search-clear {
  position: absolute; right: 10px; top: 50%;
  transform: translateY(-50%);
  width: 26px; height: 26px; padding: 0;
  border: 0; border-radius: 50%;
  background: rgba(200,220,205,.5);
  color: #4a7a5a;
  font-size: 14px; font-weight: 900;
  cursor: pointer;
  display: none; align-items: center; justify-content: center;
}
.clv6-search-clear.show { display: flex; }
.clv6-divider {
  display: flex; align-items: center; gap: 10px;
  margin: 14px 2px 8px;
  font-size: 11px; font-weight: 950;
  color: #8fa89a; letter-spacing: .12em;
  text-transform: uppercase;
}
.clv6-divider::before, .clv6-divider::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200,220,205,.85), transparent);
}
.clv6-divider:first-child { margin-top: 4px; }
.clv6-list {
  display: flex; flex-direction: column; gap: 8px;
}
.clv6-card {
  display: grid;
  grid-template-columns: 34px 46px 1fr auto;
  align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 16px;
  background: #fff;
  border: 1.5px solid rgba(200,220,205,.55);
  transition: transform .18s ease, box-shadow .25s ease, background .25s ease, border-color .25s ease;
  position: relative; overflow: hidden;
}
.clv6-card:active { transform: scale(.985); }
.clv6-card.checked {
  background: linear-gradient(160deg, #f4fbf6 0%, #e8f6ed 100%);
  border-color: rgba(122,184,150,.55);
}
.clv6-card.top1 {
  background: linear-gradient(160deg, #fffbe9 0%, #fff0c4 100%);
  border-color: rgba(216,168,32,.6);
  box-shadow: 0 6px 20px -12px rgba(216,168,32,.5);
}
.clv6-card.top2 {
  background: linear-gradient(160deg, #fafbfc 0%, #eaedef 100%);
  border-color: rgba(150,158,168,.55);
  box-shadow: 0 6px 20px -12px rgba(120,130,140,.4);
}
.clv6-card.top3 {
  background: linear-gradient(160deg, #fff5e8 0%, #ffe2c4 100%);
  border-color: rgba(200,130,70,.55);
  box-shadow: 0 6px 20px -12px rgba(200,130,70,.42);
}
.clv6-rank {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; line-height: 1; flex-shrink: 0;
}
.clv6-rank-num {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #8fa89a; font-weight: 950;
  background: rgba(200,220,205,.35);
  border-radius: 50%;
  font-variant-numeric: tabular-nums;
}
.clv6-card.checked .clv6-rank-num {
  background: rgba(122,184,150,.22); color: #4a7a5a;
}
.clv6-av {
  width: 46px; height: 46px; border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(135deg, #e8f5ec, #d4ead9);
  color: #4a7a5a;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 950;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 3px 10px -4px rgba(45,85,60,.22);
  position: relative;
  contain: paint;
}
.clv6-av img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.clv6-card.checked .clv6-av { box-shadow: 0 0 0 2px #7ab896, 0 3px 12px -4px rgba(79,163,112,.4); }
.clv6-card.top1 .clv6-av { box-shadow: 0 0 0 2px #e0b840, 0 3px 12px -4px rgba(216,168,32,.5); }
.clv6-card.top2 .clv6-av { box-shadow: 0 0 0 2px #a8b0b8, 0 3px 12px -4px rgba(120,130,140,.35); }
.clv6-card.top3 .clv6-av { box-shadow: 0 0 0 2px #c88246, 0 3px 12px -4px rgba(200,130,70,.4); }
.clv6-info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.clv6-name {
  font-size: 15px; font-weight: 900; color: #234a32;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: .002em;
}
.clv6-card.checked .clv6-name { color: #1a3d28; }
.clv6-card.top1 .clv6-name { color: #7a5410; }
.clv6-card.top2 .clv6-name { color: #4a5460; }
.clv6-card.top3 .clv6-name { color: #7a4a20; }
.clv6-sub {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 800; color: #7a9a85;
  flex-wrap: wrap;
}
.clv6-time { color: #6b8f78; font-weight: 900; font-variant-numeric: tabular-nums; }
.clv6-time.recent { color: #4fa370; }
.clv6-dot { width: 3px; height: 3px; border-radius: 50%; background: #c0d0c4; flex-shrink: 0; }
.clv6-pts { color: #4fa370; font-weight: 950; font-variant-numeric: tabular-nums; }
.clv6-pts.early { color: #d89020; }
.clv6-idle { color: #a8bdb0; }
.clv6-check {
  width: 30px; height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(200,220,205,.4);
  border: 2px solid rgba(200,220,205,.8);
  transition: background .3s, border-color .3s, box-shadow .3s;
}
.clv6-check.on {
  background: linear-gradient(135deg, #7ad79a, #4fa370);
  border-color: transparent;
  box-shadow: 0 4px 12px -4px rgba(79,163,112,.55);
}
.clv6-check svg { width: 16px; height: 16px; color: transparent; }
.clv6-check.on svg { color: #fff; }
.clv6-empty {
  padding: 60px 20px; text-align: center; color: #9ab0a0;
}
.clv6-empty-emoji { font-size: 52px; margin-bottom: 12px; opacity: .55; }
.clv6-empty-title { font-size: 15px; font-weight: 900; color: #6b8f78; margin-bottom: 4px; }
.clv6-empty-sub { font-size: 12px; color: #a8bdb0; font-weight: 700; }
.clv6-footer {
  position: absolute; left: 0; right: 0; bottom: 0;
  z-index: 20;
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(20px) saturate(120%);
  -webkit-backdrop-filter: blur(20px) saturate(120%);
  border-top: 1px solid rgba(200,220,205,.5);
  box-shadow: 0 -8px 24px rgba(45,85,60,.08);
}
.clv6-foot-btn {
  min-height: 50px; padding: 12px 14px;
  border-radius: 14px;
  font-family: inherit; font-size: 13.5px; font-weight: 950;
  cursor: pointer;
  border: 1.5px solid transparent;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: transform .15s ease, opacity .15s ease;
  letter-spacing: .02em;
}
.clv6-foot-btn:active { transform: scale(.96); }
.clv6-foot-btn:disabled { opacity: .55; pointer-events: none; }
.clv6-foot-btn svg { width: 18px; height: 18px; }
.clv6-foot-btn.save {
  background: #fff; color: #315744;
  border-color: rgba(200,220,205,.85);
  box-shadow: 0 4px 12px -6px rgba(45,85,60,.16);
}
.clv6-foot-btn.share {
  background: linear-gradient(180deg, #7ab896, #4fa370);
  color: #fff;
  box-shadow: 0 8px 20px -8px rgba(79,163,112,.55);
}
#clv6Toast {
  position: fixed; bottom: 90px; left: 50%;
  transform: translateX(-50%) translateY(20px);
  z-index: 33000;
  padding: 10px 18px;
  background: rgba(35,74,50,.95);
  color: #fff; font-family: inherit;
  font-size: 13px; font-weight: 900;
  border-radius: 999px;
  box-shadow: 0 12px 30px -8px rgba(0,0,0,.4);
  opacity: 0; pointer-events: none;
  transition: opacity .25s, transform .25s;
  max-width: 90vw; text-align: center;
}
#clv6Toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(style);
  }

  /* ============ ICONS ============ */
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  };

  /* ============ BUILD PAGE ============ */
  function ensurePage(){
    let page = $(PAGE_ID);
    if (page) return page;

    page = document.createElement('section');
    page.id = PAGE_ID;
    page.setAttribute('aria-label', 'Checklist hôm nay');
    page.setAttribute('aria-hidden', 'true');
    page.innerHTML = `
      <header class="clv6-head">
        <button type="button" class="clv6-head-btn" id="clv6Back" aria-label="Đóng">←</button>
        <div class="clv6-head-title">
          <span class="clv6-kicker">HỆ THỐNG 04</span>
          <span class="clv6-title">Checklist</span>
        </div>
        <button type="button" class="clv6-head-btn" id="clv6Sync" aria-label="Đồng bộ">${ICON.sync}</button>
      </header>

      <div class="clv6-body" id="clv6Body">
        <div class="clv6-stats">
          <div class="clv6-stats-top">
            <div>
              <div class="clv6-stats-num" id="clv6StatNum">0<small>/0</small></div>
              <div class="clv6-stats-label">đã check</div>
            </div>
            <div class="clv6-stats-date" id="clv6StatDate">--/--/----</div>
          </div>
          <div class="clv6-progress">
            <div class="clv6-progress-fill" id="clv6Bar"></div>
          </div>
        </div>

        <div class="clv6-search-wrap">
          <span class="clv6-search-icon">🔍</span>
          <input type="text" class="clv6-search" id="clv6Search" placeholder="Tìm tên..." autocomplete="off">
          <button type="button" class="clv6-search-clear" id="clv6SearchClear">×</button>
        </div>

        <div class="clv6-list" id="clv6List"></div>
      </div>

      <div class="clv6-footer">
        <button type="button" class="clv6-foot-btn save" id="clv6Save">
          ${ICON.save}<span>Lưu ảnh</span>
        </button>
        <button type="button" class="clv6-foot-btn share" id="clv6Share">
          ${ICON.share}<span>Chia sẻ</span>
        </button>
      </div>
    `;
    document.body.appendChild(page);

    page.querySelector('#clv6Back').addEventListener('click', closePage);
    page.querySelector('#clv6Sync').addEventListener('click', e => {
      const btn = e.currentTarget;
      btn.classList.add('spinning');
      forceRefresh().finally(() => {
        setTimeout(() => btn.classList.remove('spinning'), 400);
      });
    });
    page.querySelector('#clv6Save').addEventListener('click', onSave);
    page.querySelector('#clv6Share').addEventListener('click', onShare);

    const search = page.querySelector('#clv6Search');
    const searchClear = page.querySelector('#clv6SearchClear');
    search.addEventListener('input', () => {
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

    log('Page created ✓');
    return page;
  }

  /* ============ TOAST ============ */
  function toast(msg){
    let el = $('clv6Toast');
    if (!el){
      el = document.createElement('div');
      el.id = 'clv6Toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ============ SORT ============ */
  function buildSortedList(){
    const items = S.names.map((name, i) => ({
      name,
      checked: !!S.checks[i],
      time: String(S.times[i] || '').trim(),
      points: Number(S.points[i]) || 0,
      origIdx: i
    }));

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

  /* =========================================================
     CARD FACTORY + UPDATE (giữ DOM node, không tạo lại)
     ========================================================= */
  function createCard(){
    const card = document.createElement('div');
    card.className = 'clv6-card';

    const rankEl = document.createElement('div');
    rankEl.className = 'clv6-rank';

    const av = document.createElement('div');
    av.className = 'clv6-av';

    const info = document.createElement('div');
    info.className = 'clv6-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'clv6-name';
    const subEl = document.createElement('div');
    subEl.className = 'clv6-sub';
    info.appendChild(nameEl);
    info.appendChild(subEl);

    const checkEl = document.createElement('div');
    checkEl.className = 'clv6-check';
    checkEl.innerHTML = ICON.check;

    card.appendChild(rankEl);
    card.appendChild(av);
    card.appendChild(info);
    card.appendChild(checkEl);

    return {
      card, rankEl, av, nameEl, subEl, checkEl,
      _avatarUrl: undefined,
      _subKey: undefined,
      _rankKey: undefined,
      _name: undefined,
      _cardClass: undefined,
      _checkClass: undefined,
    };
  }

  function updateCard(cached, item, displayIdx, rankIdx){
    const { card, rankEl, av, nameEl, subEl, checkEl } = cached;
    const checked = !!item.checked;

    // ⚡ Card class — chỉ set khi đổi
    const isTop = rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2;
    const newCardClass = 'clv6-card' +
      (checked ? ' checked' : '') +
      (isTop ? ' top' + (rankIdx + 1) : '');
    if (cached._cardClass !== newCardClass){
      cached._cardClass = newCardClass;
      card.className = newCardClass;
    }

    // ⚡ Rank — chỉ update khi đổi
    const rankKey = isTop ? 'top' + rankIdx : 'num' + displayIdx;
    if (cached._rankKey !== rankKey){
      cached._rankKey = rankKey;
      if (isTop){
        rankEl.innerHTML = '';
        rankEl.textContent = ['🥇','🥈','🥉'][rankIdx];
      } else {
        rankEl.innerHTML = '';
        const num = document.createElement('span');
        num.className = 'clv6-rank-num';
        num.textContent = String(displayIdx);
        rankEl.appendChild(num);
      }
    }

    // ⚡ Avatar — CHỈ update nếu URL đổi (không tạo lại img)
    const url = avatarUrl(item.name) || '';
    if (cached._avatarUrl !== url){
      cached._avatarUrl = url;
      av.innerHTML = '';
      if (url){
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = () => {
          img.remove();
          av.textContent = getInitial(item.name);
        };
        av.appendChild(img);
      } else {
        av.textContent = getInitial(item.name);
      }
    }

    // ⚡ Name — chỉ update khi đổi
    if (cached._name !== item.name){
      cached._name = item.name;
      nameEl.textContent = item.name;
    }

    // ⚡ Sub — chỉ update khi đổi giờ/điểm/status
    const subKey = checked
      ? `${item.time}|${item.points}`
      : 'idle';
    if (cached._subKey !== subKey){
      cached._subKey = subKey;
      subEl.innerHTML = '';

      if (checked && item.time){
        const ago = timeAgo(item.time);
        const isRecent = ago === 'vừa xong' || /\d+ phút trước/.test(ago);

        const tEl = document.createElement('span');
        tEl.className = 'clv6-time' + (isRecent ? ' recent' : '');
        tEl.textContent = '🕐 ' + item.time;
        subEl.appendChild(tEl);

        if (isRecent && ago !== item.time){
          const d = document.createElement('span');
          d.className = 'clv6-dot';
          subEl.appendChild(d);
          const a = document.createElement('span');
          a.style.color = '#4fa370';
          a.textContent = ago;
          subEl.appendChild(a);
        }

        if (item.points > 0){
          const d2 = document.createElement('span');
          d2.className = 'clv6-dot';
          subEl.appendChild(d2);
          const p = document.createElement('span');
          p.className = 'clv6-pts' + (item.points >= 20 ? ' early' : '');
          p.textContent = '⭐ ' + item.points + 'đ';
          subEl.appendChild(p);
        }
      } else {
        const idle = document.createElement('span');
        idle.className = 'clv6-idle';
        idle.textContent = 'Chưa check hôm nay';
        subEl.appendChild(idle);
      }
    }

    // ⚡ Check — chỉ update class khi đổi
    const newCheckClass = 'clv6-check' + (checked ? ' on' : '');
    if (cached._checkClass !== newCheckClass){
      cached._checkClass = newCheckClass;
      checkEl.className = newCheckClass;
    }
  }

  /* ============ RENDER ============ */
  function render(){
    const list = $('clv6List');
    if (!list) return;

    const total = S.names.length;
    const checkedCount = S.checks.filter(Boolean).length;
    const pct = total ? Math.round(checkedCount * 100 / total) : 0;

    const numEl = $('clv6StatNum');
    if (numEl) numEl.innerHTML = `${checkedCount}<small>/${total}</small>`;

    const dateEl = $('clv6StatDate');
    if (dateEl){
      const now = new Date();
      dateEl.textContent = String(now.getDate()).padStart(2,'0') + '/' +
                          String(now.getMonth()+1).padStart(2,'0') + '/' +
                          now.getFullYear();
    }
    const barEl = $('clv6Bar');
    if (barEl) barEl.style.width = pct + '%';

    if (!total){
      list.innerHTML = `
        <div class="clv6-empty">
          <div class="clv6-empty-emoji">🐱</div>
          <div class="clv6-empty-title">Chưa có ai</div>
          <div class="clv6-empty-sub">Danh sách trống</div>
        </div>`;
      return;
    }

    const all = buildSortedList();
    let displayItems = all.all.slice();
    if (S.search){
      const q = S.search;
      displayItems = displayItems.filter(x => normalize(x.name).includes(q));
    }

    if (!displayItems.length){
      list.innerHTML = `
        <div class="clv6-empty">
          <div class="clv6-empty-emoji">🔍</div>
          <div class="clv6-empty-title">Không tìm thấy</div>
          <div class="clv6-empty-sub">Thử từ khoá khác</div>
        </div>`;
      return;
    }

    // ⚡ Xoá card cache không dùng nữa
    const keepNames = new Set(displayItems.map(x => x.name));
    for (const [name, cached] of S.cardCache){
      if (!keepNames.has(name)){
        cached.card.remove();
        S.cardCache.delete(name);
      }
    }

    // ⚡ Clear list nhưng KHÔNG destroy cache
    // (card node vẫn được giữ trong S.cardCache)
    list.innerHTML = '';

    let counter = 0;
    let lastSection = null;
    const showDividers = !S.search;

    displayItems.forEach(item => {
      counter++;

      const isTop3 = all.top3Names.has(item.name);
      const rankIdx = isTop3
        ? all.top3.findIndex(x => x.name === item.name)
        : undefined;

      let section;
      if (isTop3) section = 'top3';
      else if (item.checked) section = 'checked';
      else section = 'unchecked';

      if (showDividers && section !== lastSection){
        const div = document.createElement('div');
        div.className = 'clv6-divider';
        div.textContent = section === 'top3'
          ? '🏆 Top 3 check sớm'
          : section === 'checked'
            ? `✓ Đã check (${all.counts.checked - all.top3.length})`
            : `○ Chưa check (${all.counts.unchecked})`;
        list.appendChild(div);
        lastSection = section;
      }

      // ⚡ Reuse card từ cache, hoặc tạo mới
      let cached = S.cardCache.get(item.name);
      if (!cached){
        cached = createCard();
        S.cardCache.set(item.name, cached);
      }
      updateCard(cached, item, counter, rankIdx);

      // appendChild sẽ move node (không tạo lại)
      list.appendChild(cached.card);
    });

    const byName = {};
    S.names.forEach((n, i) => { byName[n] = !!S.checks[i]; });
    S.prev = { byName };
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
      log('getData lỗi:', e && e.message);
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
    // Clear URL cache khi data đổi (phòng trường hợp user đổi avatar)
    // Nhưng thực tế URL avatar ít đổi → giữ cache cũng OK
    return true;
  }

  async function refresh(){
    if (S.loading) return;
    S.loading = true;
    try {
      const data = await fetchData();
      if (data && applyState(data)) {
        render();
        // Preload avatar cho canvas chạy nền
        preloadAvatarsInBackground();
      }
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
    preloadAvatarsInBackground();
  }

  /* =========================================================
     DRAW CANVAS — CÓ AVATAR THẬT
     ========================================================= */
  async function drawCanvas(){
    const sorted = buildSortedList();
    const total = sorted.all.length;
    if (!total) return null;

    // ⚡ Preload avatar trước khi vẽ
    const avatarImages = {};
    await Promise.all(sorted.all.map(async item => {
      const url = avatarUrl(item.name) || '';
      if (!url) return;
      const img = await loadAvatarImage(url);
      if (img) avatarImages[item.name] = img;
    }));

    const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    const W = 520;
    const rowH = 70;
    const headerH = 130;
    const footerH = 60;
    const padX = 16;

    const H = headerH + (total * rowH) + footerH;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f5fbf5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Header bg
    const headGrad = ctx.createLinearGradient(0, 0, W, headerH);
    headGrad.addColorStop(0, '#f0faf3');
    headGrad.addColorStop(1, '#e6f5ec');
    ctx.fillStyle = headGrad;
    ctx.fillRect(0, 0, W, headerH);

    // Logo
    ctx.fillStyle = '#4fa370';
    roundRect(ctx, padX, 22, 46, 46, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☑', padX + 23, 46);

    // Title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#234a32';
    ctx.font = 'bold 20px -apple-system, system-ui, sans-serif';
    ctx.fillText('Checklist hôm nay', padX + 60, 48);

    const checkedCount = S.checks.filter(Boolean).length;
    ctx.fillStyle = '#7a9a85';
    ctx.font = '600 13px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${checkedCount} đã check · ${total - checkedCount} còn lại`, padX + 60, 68);

    // Date
    const now = new Date();
    const dateStr = String(now.getDate()).padStart(2,'0') + '/' +
                    String(now.getMonth()+1).padStart(2,'0') + '/' +
                    now.getFullYear();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fa89a';
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    ctx.fillText(dateStr, W - padX, 48);

    // Progress
    const barY = 100;
    const barW = W - padX * 2;
    ctx.fillStyle = 'rgba(200,220,205,.5)';
    roundRect(ctx, padX, barY, barW, 8, 4);
    ctx.fill();
    const pct = checkedCount / total;
    const fillGrad = ctx.createLinearGradient(padX, 0, padX + barW * pct, 0);
    fillGrad.addColorStop(0, '#a3e0b8');
    fillGrad.addColorStop(1, '#4fa370');
    ctx.fillStyle = fillGrad;
    roundRect(ctx, padX, barY, barW * pct, 8, 4);
    ctx.fill();

    // Rows
    let y = headerH;
    const rowPad = 6;
    const rowW = W - padX * 2;
    let counter = 0;

    sorted.all.forEach(item => {
      counter++;
      const isTop3 = sorted.top3Names.has(item.name);
      const rankIdx = isTop3 ? sorted.top3.findIndex(x => x.name === item.name) : undefined;

      const rowY = y + rowPad / 2;
      const rowHeight = rowH - rowPad;

      // Row bg
      if (rankIdx === 0) ctx.fillStyle = '#fff8e3';
      else if (rankIdx === 1) ctx.fillStyle = '#f3f5f7';
      else if (rankIdx === 2) ctx.fillStyle = '#fff0e0';
      else if (item.checked) ctx.fillStyle = '#eef8f1';
      else ctx.fillStyle = '#ffffff';
      roundRect(ctx, padX, rowY, rowW, rowHeight, 14);
      ctx.fill();

      // Row border
      let borderColor;
      if (rankIdx === 0) borderColor = 'rgba(216,168,32,.6)';
      else if (rankIdx === 1) borderColor = 'rgba(150,158,168,.55)';
      else if (rankIdx === 2) borderColor = 'rgba(200,130,70,.55)';
      else if (item.checked) borderColor = 'rgba(122,184,150,.5)';
      else borderColor = 'rgba(200,220,205,.65)';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      roundRect(ctx, padX, rowY, rowW, rowHeight, 14);
      ctx.stroke();

      const cy = rowY + rowHeight / 2;

      // Rank
      const rankX = padX + 24;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2){
        ctx.font = '24px -apple-system, system-ui, sans-serif';
        ctx.fillStyle = '#234a32';
        ctx.fillText(['🥇','🥈','🥉'][rankIdx], rankX, cy);
      } else {
        ctx.fillStyle = item.checked ? 'rgba(122,184,150,.25)' : 'rgba(200,220,205,.4)';
        ctx.beginPath();
        ctx.arc(rankX, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = item.checked ? '#4a7a5a' : '#8fa89a';
        ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
        ctx.fillText(String(counter), rankX, cy + 1);
      }

      // ⚡ Avatar — dùng ảnh thật nếu có
      const avX = padX + 68;
      const avR = 22;

      // Vẽ nền tròn (fallback)
      ctx.fillStyle = '#d4ead9';
      ctx.beginPath();
      ctx.arc(avX, cy, avR, 0, Math.PI * 2);
      ctx.fill();

      // Vẽ ảnh nếu có
      const avImg = avatarImages[item.name];
      if (avImg){
        try {
          ctx.save();
          ctx.beginPath();
          ctx.arc(avX, cy, avR, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(avImg, avX - avR, cy - avR, avR * 2, avR * 2);
          ctx.restore();
        } catch(e){
          // CORS fail → vẽ chữ cái
          ctx.fillStyle = '#4a7a5a';
          ctx.font = 'bold 17px -apple-system, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(getInitial(item.name), avX, cy + 1);
        }
      } else {
        // Không có ảnh → chữ cái
        ctx.fillStyle = '#4a7a5a';
        ctx.font = 'bold 17px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getInitial(item.name), avX, cy + 1);
      }

      // Avatar ring
      if (rankIdx === 0) ctx.strokeStyle = '#e0b840';
      else if (rankIdx === 1) ctx.strokeStyle = '#a8b0b8';
      else if (rankIdx === 2) ctx.strokeStyle = '#c88246';
      else if (item.checked) ctx.strokeStyle = '#7ab896';
      else ctx.strokeStyle = 'rgba(200,220,205,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(avX, cy, avR, 0, Math.PI * 2);
      ctx.stroke();

      // Name
      const textX = padX + 104;
      const textMaxW = W - textX - 60;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      let nameColor = '#234a32';
      if (rankIdx === 0) nameColor = '#7a5410';
      else if (rankIdx === 1) nameColor = '#4a5460';
      else if (rankIdx === 2) nameColor = '#7a4a20';
      ctx.fillStyle = nameColor;
      ctx.font = 'bold 16px -apple-system, system-ui, sans-serif';
      ctx.fillText(truncate(ctx, item.name, textMaxW), textX, rowY + 30);

      // Sub
      ctx.font = '600 13px -apple-system, system-ui, sans-serif';
      if (item.checked && item.time){
        ctx.fillStyle = '#4fa370';
        let subTxt = '🕐 ' + item.time;
        if (item.points > 0) subTxt += '   ⭐ ' + item.points + 'đ';
        ctx.fillText(subTxt, textX, rowY + 52);
      } else {
        ctx.fillStyle = '#a8bdb0';
        ctx.fillText('Chưa check hôm nay', textX, rowY + 52);
      }

      // Check circle
      const checkCX = W - padX - 22;
      const checkR = 15;
      if (item.checked){
        const cg = ctx.createLinearGradient(checkCX - checkR, cy - checkR, checkCX + checkR, cy + checkR);
        cg.addColorStop(0, '#7ad79a');
        cg.addColorStop(1, '#4fa370');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(checkCX, cy, checkR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(checkCX - 6, cy);
        ctx.lineTo(checkCX - 2, cy + 5);
        ctx.lineTo(checkCX + 7, cy - 5);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(200,220,205,.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(checkCX, cy, checkR, 0, Math.PI * 2);
        ctx.stroke();
      }

      y += rowH;
    });

    // Footer
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a8bdb0';
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    const timeStr = String(now.getHours()).padStart(2,'0') + ':' +
                    String(now.getMinutes()).padStart(2,'0');
    ctx.fillText('Cập nhật lúc ' + timeStr + ' · Đảo Mèo', W / 2, H - 28);

    return canvas;
  }

  function roundRect(ctx, x, y, w, h, r){
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function truncate(ctx, text, maxWidth){
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth){
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  /* ============ SAVE / SHARE ============ */
  async function canvasToBlob(canvas){
    return new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png', 1);
    });
  }

  async function onSave(){
    if (S.busy) return;
    S.busy = true;

    const btn = $('clv6Save');
    const oldHTML = btn ? btn.innerHTML : '';
    if (btn){
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Đang tạo…</span>';
    }

    try {
      // ⚡ await vì drawCanvas giờ là async
      const canvas = await drawCanvas();
      if (!canvas) throw new Error('Chưa có dữ liệu');

      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'checklist-' + new Date().toISOString().slice(0,10) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => { try { URL.revokeObjectURL(url); } catch(_){} }, 5000);
      toast('Đã lưu ảnh ✓');
    } catch(e){
      console.error('[CL6] save error:', e);
      toast('Lỗi: ' + (e.message || e));
    } finally {
      S.busy = false;
      if (btn){
        btn.disabled = false;
        btn.innerHTML = oldHTML;
      }
    }
  }

  async function onShare(){
    if (S.busy) return;
    S.busy = true;

    const btn = $('clv6Share');
    const oldHTML = btn ? btn.innerHTML : '';
    if (btn){
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Đang tạo…</span>';
    }

    try {
      const canvas = await drawCanvas();
      if (!canvas) throw new Error('Chưa có dữ liệu');

      const blob = await canvasToBlob(canvas);
      const filename = 'checklist-' + new Date().toISOString().slice(0,10) + '.png';

      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        try {
          await navigator.share({
            files: [file],
            title: 'Checklist Đảo Mèo',
            text: 'Checklist hôm nay — ' + new Date().toLocaleDateString('vi-VN')
          });
          toast('Đã chia sẻ ✓');
          return;
        } catch(e){
          if (e && e.name === 'AbortError') return;
          console.warn('[CL6] share fail, fallback download:', e);
        }
      }

      // Fallback download
      toast('Thiết bị không hỗ trợ chia sẻ, đã lưu ảnh');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch(_){} }, 5000);
    } catch(e){
      console.error('[CL6] share error:', e);
      toast('Lỗi: ' + (e.message || e));
    } finally {
      S.busy = false;
      if (btn){
        btn.disabled = false;
        btn.innerHTML = oldHTML;
      }
    }
  }

  /* ============ OPEN / CLOSE ============ */
  function openPage(){
    const page = $(PAGE_ID);
    if (!page) return;
    page.classList.add('show');
    page.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    S.pageOpen = true;

    const search = page.querySelector('#clv6Search');
    if (search){ search.value = ''; S.search = ''; }
    const searchClear = page.querySelector('#clv6SearchClear');
    if (searchClear) searchClear.classList.remove('show');

    render();
    refresh();
  }

  function closePage(){
    const page = $(PAGE_ID);
    if (!page) return;
    page.classList.remove('show');
    page.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    S.pageOpen = false;
  }

  /* ============ EVENTS ============ */
  function bindGlobalEvents(){
    window.addEventListener('checkinDone', () => {
      if (S.pageOpen) setTimeout(() => forceRefresh(), 500);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.pageOpen) refresh();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.pageOpen) closePage();
    });
  }

  function startAutoTimer(){
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(() => {
      if (document.hidden || !S.pageOpen) return;
      refresh();
    }, REFRESH_MS);
  }

  /* ============ BOOT ============ */
  async function boot(){
    if (S.booted) return;
    injectStyles();

    const page = ensurePage();
    if (!page){
      S.retryCount++;
      if (S.retryCount >= MAX_RETRY) return;
      setTimeout(boot, 300);
      return;
    }

    S.booted = true;
    bindGlobalEvents();
    startAutoTimer();

    // Bind nút mở page
    const openBtn = $('checklistBtn');
    if (openBtn){
      const newBtn = openBtn.cloneNode(true);
      openBtn.parentNode.replaceChild(newBtn, openBtn);
      newBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openPage();
      });
    }

    window.__clV6 = {
      open: openPage,
      close: closePage,
      refresh, forceRefresh, render,
      state: S,
      draw: drawCanvas,
      save: onSave,
      share: onShare,
    };

    log('v6.2 ready ✓');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }
})();