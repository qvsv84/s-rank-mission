/* =========================================================
   CHECKLIST UI v2.0 — Card-based với hiệu ứng
   - Tự inject CSS, tự build UI, không cần sửa HTML/CSS
   - Đọc state qua __srankApi("getData") hoặc __getChecklistState
   - Tự refresh 20s + nghe event checkinDone
   - Hiệu ứng: stagger entrance, pulse just-checked, top3 badge
   ========================================================= */
(function(){
  "use strict";
  if (window.__clV2Loaded) return;
  window.__clV2Loaded = true;

  /* ============ CONFIG ============ */
  const REFRESH_MS = 20000;
  const JUST_CHECKED_MS = 2600;
  const RANK_ICONS = ['🥇','🥈','🥉'];

  /* ============ STATE ============ */
  const S = {
    names: [],
    checks: [],
    times: [],
    points: [],
    ranks: [],
    prevChecked: null,   // null lần đầu → không animate
    refreshing: false,
    refreshTimer: null,
  };

  /* ============ HELPERS ============ */
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  function getApi(){
    return window.__srankApi || (window.SRank && window.SRank.api) || null;
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

  /* ============ STYLES ============ */
  function injectStyles(){
    if ($('clV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'clV2Styles';
    style.textContent = `
/* ===== CHECKLIST V2 ===== */
#checklistPanel {
  padding: 14px 12px 12px;
  border-radius: 22px;
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,.85), transparent 70%),
    linear-gradient(160deg, #ffffff 0%, #f5fbf5 55%, #eef7ef 100%);
  border: 1px solid rgba(203, 220, 201, .55);
  box-shadow:
    0 12px 32px -14px rgba(53, 91, 61, .16),
    0 4px 12px -4px rgba(53, 91, 61, .08),
    inset 0 1px 0 rgba(255,255,255,.95);
}

#checklistScroll {
  /* giữ scroll cũ, nhưng bỏ table */
  background: transparent;
}

.cl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 0 2px;
}
.cl-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 950;
  color: #315744;
  letter-spacing: .01em;
}
.cl-head-title .cl-icon {
  font-size: 17px;
  filter: drop-shadow(0 2px 4px rgba(53,91,61,.18));
}
.cl-head-count {
  font-size: 12px;
  font-weight: 900;
  color: #6b8f78;
  background: rgba(122, 184, 150, .14);
  padding: 3px 9px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.cl-head-count.full {
  color: #fff;
  background: linear-gradient(135deg, #7ab896, #4fa370);
  box-shadow: 0 3px 10px -3px rgba(79, 163, 112, .5);
}

.cl-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(203, 220, 201, .45);
  overflow: hidden;
  margin: 0 2px 12px;
  position: relative;
}
.cl-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #8ecfa6 0%, #4fa370 100%);
  border-radius: 3px;
  transition: width .7s cubic-bezier(.16,.9,.25,1);
  box-shadow: 0 0 10px rgba(79, 163, 112, .45);
}
.cl-bar-fill.full {
  background: linear-gradient(90deg, #7ad79a 0%, #3f9a65 100%);
  animation: clBarGlow 2s ease-in-out infinite;
}
@keyframes clBarGlow {
  0%, 100% { box-shadow: 0 0 10px rgba(79, 163, 112, .45); }
  50%      { box-shadow: 0 0 18px rgba(79, 163, 112, .75); }
}

.cl-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

/* ===== CARD ===== */
.cl-card {
  display: grid;
  grid-template-columns: 24px 38px 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 9px 11px;
  border-radius: 14px;
  background: #fff;
  border: 1.5px solid rgba(203, 220, 201, .5);
  transition: transform .2s cubic-bezier(.16,.9,.25,1),
              box-shadow .25s ease,
              background .25s ease,
              border-color .25s ease;
  opacity: 0;
  transform: translateY(10px);
  animation: clCardIn .45s cubic-bezier(.16,.9,.25,1) forwards;
  position: relative;
  overflow: hidden;
}
@keyframes clCardIn {
  to { opacity: 1; transform: translateY(0); }
}

.cl-card.checked {
  background: linear-gradient(160deg, #f3fbf5 0%, #e9f7ee 100%);
  border-color: rgba(122, 184, 150, .48);
}

/* ===== TOP3 ===== */
.cl-card.top1 {
  background: linear-gradient(160deg, #fffbe9 0%, #ffefc4 100%);
  border-color: rgba(216, 168, 32, .55);
  box-shadow: 0 6px 20px -10px rgba(216, 168, 32, .4);
}
.cl-card.top2 {
  background: linear-gradient(160deg, #fafafa 0%, #ebedee 100%);
  border-color: rgba(150, 158, 168, .5);
  box-shadow: 0 5px 18px -10px rgba(120, 130, 140, .3);
}
.cl-card.top3 {
  background: linear-gradient(160deg, #fff2e3 0%, #ffe1c2 100%);
  border-color: rgba(200, 130, 70, .5);
  box-shadow: 0 5px 18px -10px rgba(200, 130, 70, .32);
}

/* ===== JUST CHECKED ===== */
.cl-card.just-checked {
  animation: clPulse .9s cubic-bezier(.16,.9,.25,1);
}
@keyframes clPulse {
  0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(79, 163, 112, .55); }
  45%  { transform: scale(1.035); box-shadow: 0 0 0 14px rgba(79, 163, 112, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(79, 163, 112, 0); }
}

/* ===== RANK ===== */
.cl-rank {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
  flex-shrink: 0;
}
.cl-rank.empty {
  font-size: 12px;
  color: #c0d0c4;
  font-weight: 900;
}
.cl-rank.badge {
  animation: clBadgePop .5s cubic-bezier(.16,.9,.25,1);
}
@keyframes clBadgePop {
  0%   { transform: scale(0) rotate(-40deg); }
  65%  { transform: scale(1.25) rotate(8deg); }
  100% { transform: scale(1) rotate(0); }
}

/* ===== AVATAR ===== */
.cl-av {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(135deg, #e8f5ec, #d4ead9);
  color: #4a7a5a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 900;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 3px 10px -4px rgba(53, 91, 61, .22);
  transition: box-shadow .3s ease, transform .3s ease;
  position: relative;
}
.cl-av img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.cl-card.checked .cl-av {
  box-shadow:
    0 0 0 2px #7ab896,
    0 3px 12px -4px rgba(79, 163, 112, .35);
}
.cl-card.top1 .cl-av { box-shadow: 0 0 0 2px #e0b840, 0 3px 12px -4px rgba(216,168,32,.4); }
.cl-card.top2 .cl-av { box-shadow: 0 0 0 2px #a8b0b8, 0 3px 12px -4px rgba(120,130,140,.3); }
.cl-card.top3 .cl-av { box-shadow: 0 0 0 2px #c88246, 0 3px 12px -4px rgba(200,130,70,.32); }

.cl-card.just-checked .cl-av {
  animation: clAvBounce .7s cubic-bezier(.16,.9,.25,1);
}
@keyframes clAvBounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); }
  70%  { transform: scale(.95); }
  100% { transform: scale(1); }
}

/* ===== INFO ===== */
.cl-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cl-name {
  font-size: 13.5px;
  font-weight: 850;
  color: #2a4d38;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: .005em;
}
.cl-card.checked .cl-name { color: #1a3d28; }

.cl-sub {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 800;
  color: #7a9a85;
  flex-wrap: wrap;
}
.cl-time {
  font-variant-numeric: tabular-nums;
  font-weight: 900;
}
.cl-time.recent {
  color: #4fa370;
}
.cl-pts {
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  color: #4fa370;
}
.cl-pts.early {
  color: #d89020;
}
.cl-sub .dot {
  width: 3px; height: 3px; border-radius: 50%;
  background: #c0d0c4;
}

/* ===== STATUS ===== */
.cl-status {
  font-size: 19px;
  line-height: 1;
  flex-shrink: 0;
  transition: transform .3s cubic-bezier(.16,.9,.25,1);
}
.cl-status.idle {
  font-size: 15px;
  color: #c0d0c4;
}
.cl-card.just-checked .cl-status {
  animation: clStatusPop .65s cubic-bezier(.16,.9,.25,1);
}
@keyframes clStatusPop {
  0%   { transform: scale(0) rotate(-160deg); opacity: 0; }
  55%  { transform: scale(1.4) rotate(12deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}

/* ===== EMPTY ===== */
.cl-empty {
  padding: 40px 20px;
  text-align: center;
  color: #9ab0a0;
  font-size: 13px;
  font-weight: 800;
}
.cl-empty-emoji {
  font-size: 42px;
  margin-bottom: 8px;
  opacity: .7;
}

/* ===== ACTION BUTTONS (giữ cũ) ===== */
#checklistActions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(203, 220, 201, .7);
}
#checklistActions button {
  min-height: 42px;
  padding: 8px 12px;
  border: 1.5px solid rgba(203, 220, 201, .75);
  border-radius: 12px;
  background: #fff;
  color: #315744;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 900;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
#checklistActions button:active {
  transform: scale(.96);
  background: #f5fbf5;
  border-color: rgba(122, 184, 150, .6);
}
    `;
    document.head.appendChild(style);
  }

  /* ============ BUILD UI SHELL ============ */
  function buildShell(){
    const scroll = $('checklistScroll');
    if (!scroll) return false;
    // Xoá table cũ, thay bằng card list
    scroll.innerHTML = `
      <div class="cl-head">
        <div class="cl-head-title">
          <span class="cl-icon">☑</span>
          <span>Checklist hôm nay</span>
        </div>
        <span class="cl-head-count" id="clCount">0/0</span>
      </div>
      <div class="cl-bar">
        <div class="cl-bar-fill" id="clBarFill"></div>
      </div>
      <div class="cl-list" id="clList"></div>
    `;
    return true;
  }

  /* ============ RENDER ============ */
  function detectTop3(){
    const entries = S.names
      .map((n, i) => ({ name: n, checked: S.checks[i], time: S.times[i] || '' }))
      .filter(x => x.checked && x.time)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .slice(0, 3);
    const map = {};
    entries.forEach((x, i) => { map[x.name] = i; });
    return map;
  }

  function render(){
    const list = $('clList');
    const countEl = $('clCount');
    const barFill = $('clBarFill');
    if (!list) return;

    const total = S.names.length;
    const checkedCount = S.checks.filter(Boolean).length;
    const pct = total ? Math.round(checkedCount * 100 / total) : 0;

    // Header count
    if (countEl){
      countEl.textContent = checkedCount + '/' + total;
      countEl.classList.toggle('full', total > 0 && checkedCount === total);
    }
    // Progress bar
    if (barFill){
      barFill.style.width = pct + '%';
      barFill.classList.toggle('full', total > 0 && checkedCount === total);
    }

    if (!total){
      list.innerHTML = `
        <div class="cl-empty">
          <div class="cl-empty-emoji">🐱</div>
          <div>Chưa có ai trong danh sách</div>
        </div>`;
      return;
    }

    const top3 = detectTop3();
    const frag = document.createDocumentFragment();
    const now = Date.now();

    S.names.forEach((name, i) => {
      if (!name) return;

      const checked = !!S.checks[i];
      const time = String(S.times[i] || '').trim();
      const pts = Number(S.points[i]) || 0;

      // Có phải vừa mới check? (detect từ prevChecked)
      const prev = S.prevChecked ? S.prevChecked[i] : null;
      const justChecked = prev === false && checked === true;

      // Top3?
      const rankIdx = top3[name];
      const isTop = rankIdx !== undefined;

      const card = document.createElement('div');
      card.className = 'cl-card';
      if (checked) card.classList.add('checked');
      if (isTop) card.classList.add('top' + (rankIdx + 1));
      if (justChecked) card.classList.add('just-checked');
      // Stagger entrance
      card.style.animationDelay = (i * 40) + 'ms';

      // Rank column
      const rankEl = document.createElement('div');
      rankEl.className = 'cl-rank';
      if (isTop){
        rankEl.classList.add('badge');
        rankEl.textContent = RANK_ICONS[rankIdx];
      } else {
        rankEl.classList.add('empty');
        rankEl.textContent = String(i + 1);
      }

      // Avatar
      const av = document.createElement('div');
      av.className = 'cl-av';
      const url = avatarUrl(name);
      if (url){
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = () => {
          img.remove();
          av.textContent = getInitial(name);
        };
        av.appendChild(img);
      } else {
        av.textContent = getInitial(name);
      }

      // Info
      const info = document.createElement('div');
      info.className = 'cl-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'cl-name';
      nameEl.textContent = name;

      const sub = document.createElement('div');
      sub.className = 'cl-sub';

      if (checked && time){
        const ago = timeAgo(time);
        const isRecent = ago === 'vừa xong' || /\d+ phút trước/.test(ago);

        const tEl = document.createElement('span');
        tEl.className = 'cl-time' + (isRecent ? ' recent' : '');
        tEl.textContent = '🕐 ' + time;

        sub.appendChild(tEl);

        // Nếu recent, thêm "vừa xong" / "X phút trước"
        if (isRecent && ago !== time){
          const dot1 = document.createElement('span');
          dot1.className = 'dot';
          const agoEl = document.createElement('span');
          agoEl.style.color = '#4fa370';
          agoEl.textContent = ago;
          sub.appendChild(dot1);
          sub.appendChild(agoEl);
        }
      } else {
        const idle = document.createElement('span');
        idle.textContent = 'Chưa check';
        idle.style.color = '#a8bdb0';
        sub.appendChild(idle);
      }

      info.appendChild(nameEl);
      info.appendChild(sub);

      // Status icon
      const status = document.createElement('div');
      status.className = 'cl-status';
      if (checked){
        status.textContent = '✅';
      } else {
        status.classList.add('idle');
        status.textContent = '○';
      }

      card.appendChild(rankEl);
      card.appendChild(av);
      card.appendChild(info);
      card.appendChild(status);

      frag.appendChild(card);
    });

    list.innerHTML = '';
    list.appendChild(frag);

    // Lưu state hiện tại làm prev cho lần sau
    S.prevChecked = S.checks.slice();
  }

  /* ============ DATA ============ */
  function applyState(data){
    if (!data || !Array.isArray(data.names)) return;
    S.names = data.names.slice();
    S.checks = Array.isArray(data.checks) ? data.checks.slice() : [];
    S.times  = Array.isArray(data.times)  ? data.times.slice()  : [];
    S.points = Array.isArray(data.points) ? data.points.slice() : [];
    S.ranks  = Array.isArray(data.ranks)  ? data.ranks.slice()  : [];
    render();
  }

  async function refresh(force){
    if (S.refreshing) return;
    S.refreshing = true;
    try {
      // Ưu tiên state đã có sẵn trong bộ nhớ
      if (!force && typeof window.__getChecklistState === 'function'){
        const s = window.__getChecklistState();
        if (s && Array.isArray(s.names)){
          applyState(s);
          return;
        }
      }
      // Fallback: gọi API
      const api = getApi();
      if (!api) return;
      const r = await api('getData', {}, 15000);
      if (r && r.ok && r.data){
        applyState(r.data);
      }
    } catch (e){
      console.warn('[CL] refresh lỗi:', e && e.message);
    } finally {
      S.refreshing = false;
    }
  }

  /* ============ EVENTS ============ */
  function bindEvents(){
    // User vừa checkin → refresh ngay + animate
    window.addEventListener('checkinDone', (e) => {
      const name = e && e.detail && e.detail.name;
      if (name){
        // Đánh dấu sẽ animate: đặt prevChecked[name] = false nếu đang false
        if (S.prevChecked && S.names.indexOf(name) >= 0){
          const idx = S.names.indexOf(name);
          S.prevChecked[idx] = false;
        }
      }
      // Delay nhẹ để state kịp cập nhật
      setTimeout(() => refresh(true), 400);
    });

    // Refresh khi tab visible lại
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden){
        refresh(false);
      }
    });

    // Auto refresh định kỳ
    function startTimer(){
      if (S.refreshTimer) clearInterval(S.refreshTimer);
      S.refreshTimer = setInterval(() => {
        if (document.hidden) return;
        refresh(false);
      }, REFRESH_MS);
    }
    startTimer();
  }

  /* ============ BOOT ============ */
  function init(){
    injectStyles();
    const ok = buildShell();
    if (!ok){
      // Panel chưa có trong DOM → thử lại sau
      setTimeout(init, 100);
      return;
    }
    bindEvents();

    // Load lần đầu
    refresh(false);

    // Expose để debug / gọi tay
    window.__clV2 = {
      refresh: refresh,
      render: render,
      state: S,
    };

    console.log('[CL] Checklist UI v2.0 ready ✓');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();