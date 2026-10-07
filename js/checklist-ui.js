/* =========================================================
   CHECKLIST UI v3.1 — Fix vị trí: root nằm TRONG #checklistPanel
   - Ẩn nội dung cũ của panel (không xoá)
   - Chèn root mới vào trong panel → đi theo show/hide
   - Đọc data trực tiếp từ __srankApi
   - Auto refresh 15s + khi visible + khi checkinDone
   ========================================================= */
(function(){
  "use strict";
  if (window.__clV3) return;

  const ROOT_ID    = 'clV3Root';
  const REFRESH_MS = 15000;
  const JUST_CHECKED_MS = 2600;
  const MAX_RETRY  = 20;

  const S = {
    names: [], checks: [], times: [], points: [], ranks: [],
    prev: null,
    loading: false,
    timer: null,
    retryCount: 0,
    booted: false,
  };

  /* ============ HELPERS ============ */
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const log = (...args) => console.log('[CL3]', ...args);
  const warn = (...args) => console.warn('[CL3]', ...args);

  function getApi(){
    return window.__srankApi
        || (window.SRank && window.SRank.api)
        || null;
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

  /* ============ STYLES ============ */
  function injectStyles(){
    if ($('clV3Styles')) return;
    const style = document.createElement('style');
    style.id = 'clV3Styles';
    style.textContent = `
#clV3Root {
  padding: 14px 12px 12px;
  border-radius: 22px;
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,.9), transparent 70%),
    linear-gradient(160deg, #ffffff 0%, #f5fbf5 55%, #eef7ef 100%);
  border: 1px solid rgba(203,220,201,.55);
  box-shadow:
    0 12px 32px -14px rgba(53,91,61,.16),
    0 4px 12px -4px rgba(53,91,61,.08),
    inset 0 1px 0 rgba(255,255,255,.95);
}
.clv3-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 10px; padding: 0 2px;
}
.clv3-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 950; color: #315744;
}
.clv3-title .ico { font-size: 17px; }
.clv3-count {
  font-size: 12px; font-weight: 900;
  color: #6b8f78;
  background: rgba(122,184,150,.14);
  padding: 3px 9px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.clv3-count.full {
  color: #fff;
  background: linear-gradient(135deg, #7ab896, #4fa370);
  box-shadow: 0 3px 10px -3px rgba(79,163,112,.5);
}
.clv3-bar {
  height: 6px; border-radius: 3px;
  background: rgba(203,220,201,.45);
  overflow: hidden; margin: 0 2px 12px;
}
.clv3-bar-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #8ecfa6 0%, #4fa370 100%);
  border-radius: 3px;
  transition: width .7s cubic-bezier(.16,.9,.25,1);
  box-shadow: 0 0 10px rgba(79,163,112,.45);
}
.clv3-bar-fill.full {
  background: linear-gradient(90deg, #7ad79a 0%, #3f9a65 100%);
  animation: clv3BarGlow 2s ease-in-out infinite;
}
@keyframes clv3BarGlow {
  0%,100% { box-shadow: 0 0 10px rgba(79,163,112,.45); }
  50%     { box-shadow: 0 0 18px rgba(79,163,112,.75); }
}
.clv3-list {
  display: flex; flex-direction: column; gap: 7px;
}
.clv3-card {
  display: grid;
  grid-template-columns: 26px 38px 1fr auto;
  align-items: center; gap: 9px;
  padding: 9px 11px; border-radius: 14px;
  background: #fff;
  border: 1.5px solid rgba(203,220,201,.5);
  transition: transform .2s cubic-bezier(.16,.9,.25,1),
              box-shadow .25s ease,
              background .25s ease,
              border-color .25s ease;
  opacity: 0; transform: translateY(10px);
  animation: clv3In .45s cubic-bezier(.16,.9,.25,1) forwards;
  position: relative; overflow: hidden;
}
@keyframes clv3In { to { opacity:1; transform: translateY(0); } }
.clv3-card.checked {
  background: linear-gradient(160deg, #f3fbf5 0%, #e9f7ee 100%);
  border-color: rgba(122,184,150,.48);
}
.clv3-card.top1 {
  background: linear-gradient(160deg, #fffbe9 0%, #ffefc4 100%);
  border-color: rgba(216,168,32,.55);
  box-shadow: 0 6px 20px -10px rgba(216,168,32,.4);
}
.clv3-card.top2 {
  background: linear-gradient(160deg, #fafafa 0%, #ebedee 100%);
  border-color: rgba(150,158,168,.5);
  box-shadow: 0 5px 18px -10px rgba(120,130,140,.3);
}
.clv3-card.top3 {
  background: linear-gradient(160deg, #fff2e3 0%, #ffe1c2 100%);
  border-color: rgba(200,130,70,.5);
  box-shadow: 0 5px 18px -10px rgba(200,130,70,.32);
}
.clv3-card.just-checked {
  animation: clv3Pulse .9s cubic-bezier(.16,.9,.25,1);
}
@keyframes clv3Pulse {
  0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(79,163,112,.55); }
  45%  { transform: scale(1.035); box-shadow: 0 0 0 14px rgba(79,163,112,0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(79,163,112,0); }
}
.clv3-rank {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; line-height: 1; flex-shrink: 0;
}
.clv3-rank.empty {
  font-size: 12px; color: #c0d0c4; font-weight: 900;
}
.clv3-rank.badge {
  animation: clv3Badge .5s cubic-bezier(.16,.9,.25,1);
}
@keyframes clv3Badge {
  0%   { transform: scale(0) rotate(-40deg); }
  65%  { transform: scale(1.25) rotate(8deg); }
  100% { transform: scale(1) rotate(0); }
}
.clv3-av {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, #e8f5ec, #d4ead9);
  color: #4a7a5a;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 900;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 3px 10px -4px rgba(53,91,61,.22);
  position: relative;
}
.clv3-av img { width:100%; height:100%; object-fit:cover; display:block; }
.clv3-card.checked .clv3-av {
  box-shadow: 0 0 0 2px #7ab896, 0 3px 12px -4px rgba(79,163,112,.35);
}
.clv3-card.top1 .clv3-av { box-shadow: 0 0 0 2px #e0b840, 0 3px 12px -4px rgba(216,168,32,.4); }
.clv3-card.top2 .clv3-av { box-shadow: 0 0 0 2px #a8b0b8, 0 3px 12px -4px rgba(120,130,140,.3); }
.clv3-card.top3 .clv3-av { box-shadow: 0 0 0 2px #c88246, 0 3px 12px -4px rgba(200,130,70,.32); }
.clv3-card.just-checked .clv3-av {
  animation: clv3AvBounce .7s cubic-bezier(.16,.9,.25,1);
}
@keyframes clv3AvBounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); }
  70%  { transform: scale(.95); }
  100% { transform: scale(1); }
}
.clv3-info {
  min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.clv3-name {
  font-size: 13.5px; font-weight: 850; color: #2a4d38;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.clv3-card.checked .clv3-name { color: #1a3d28; }
.clv3-sub {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 800; color: #7a9a85;
  flex-wrap: wrap;
}
.clv3-time { font-variant-numeric: tabular-nums; font-weight: 900; }
.clv3-time.recent { color: #4fa370; }
.clv3-dot { width: 3px; height: 3px; border-radius: 50%; background: #c0d0c4; }
.clv3-pts { font-variant-numeric: tabular-nums; font-weight: 900; color: #4fa370; }
.clv3-pts.early { color: #d89020; }
.clv3-status {
  font-size: 19px; line-height: 1; flex-shrink: 0;
  transition: transform .3s cubic-bezier(.16,.9,.25,1);
}
.clv3-status.idle { font-size: 15px; color: #c0d0c4; }
.clv3-card.just-checked .clv3-status {
  animation: clv3StatusPop .65s cubic-bezier(.16,.9,.25,1);
}
@keyframes clv3StatusPop {
  0%   { transform: scale(0) rotate(-160deg); opacity: 0; }
  55%  { transform: scale(1.4) rotate(12deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}
.clv3-empty {
  padding: 40px 20px; text-align: center;
  color: #9ab0a0; font-size: 13px; font-weight: 800;
}
.clv3-empty-emoji { font-size: 42px; margin-bottom: 8px; opacity: .7; }
.clv3-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed rgba(203,220,201,.7);
}
.clv3-actions button {
  min-height: 42px; padding: 8px 12px;
  border: 1.5px solid rgba(203,220,201,.75);
  border-radius: 12px; background: #fff; color: #315744;
  font-family: inherit; font-size: 12.5px; font-weight: 900;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
.clv3-actions button:active {
  transform: scale(.96);
  background: #f5fbf5;
  border-color: rgba(122,184,150,.6);
}
.clv3-debug {
  margin-top: 8px; font-size: 10.5px; font-weight: 800;
  color: #9ab0a0; text-align: center; min-height: 14px;
}
    `;
    document.head.appendChild(style);
  }

  /* ============ BUILD ROOT — chèn VÀO TRONG #checklistPanel ============ */
  function ensureRoot(){
    let root = $(ROOT_ID);
    if (root) return root;

    const panel = $('checklistPanel');
    if (!panel){
      warn('Không tìm thấy #checklistPanel');
      return null;
    }

    // Ẩn nội dung cũ (table + nút cũ) nhưng KHÔNG xoá — main.js có thể cần ID
    const oldScroll = panel.querySelector('#checklistScroll');
    const oldActions = panel.querySelector('#checklistActions');
    if (oldScroll) oldScroll.style.display = 'none';
    if (oldActions) oldActions.style.display = 'none';

    // Tạo root mới
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-label', 'Checklist hôm nay');
    root.innerHTML = `
      <div class="clv3-head">
        <div class="clv3-title">
          <span class="ico">☑</span>
          <span>Checklist hôm nay</span>
        </div>
        <span class="clv3-count" id="clv3Count">0/0</span>
      </div>
      <div class="clv3-bar">
        <div class="clv3-bar-fill" id="clv3Bar"></div>
      </div>
      <div class="clv3-list" id="clv3List"></div>
      <div class="clv3-actions">
        <button type="button" id="clv3Capture">📸 Chụp checklist</button>
        <button type="button" id="clv3Sync">↻ Đồng bộ lại</button>
      </div>
      <div class="clv3-debug" id="clv3Debug"></div>
    `;

    // ⚡ Chèn root vào TRONG panel — đi theo show/hide của panel
    panel.appendChild(root);

    // Bind action buttons
    root.querySelector('#clv3Capture').addEventListener('click', onCapture);
    root.querySelector('#clv3Sync').addEventListener('click', () => forceRefresh());

    log('Root created inside #checklistPanel ✓');
    return root;
  }

  /* ============ RENDER ============ */
  function detectTop3(){
    const arr = S.names
      .map((n, i) => ({ name: n, checked: S.checks[i], time: S.times[i] || '' }))
      .filter(x => x.checked && x.time)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .slice(0, 3);
    const map = {};
    arr.forEach((x, i) => { map[x.name] = i; });
    return map;
  }

  function render(){
    const list = $('clv3List');
    const countEl = $('clv3Count');
    const barEl = $('clv3Bar');
    if (!list) { warn('list không tồn tại'); return; }

    const total = S.names.length;
    const checkedCount = S.checks.filter(Boolean).length;
    const pct = total ? Math.round(checkedCount * 100 / total) : 0;

    if (countEl){
      countEl.textContent = `${checkedCount}/${total}`;
      countEl.classList.toggle('full', total > 0 && checkedCount === total);
    }
    if (barEl){
      barEl.style.width = pct + '%';
      barEl.classList.toggle('full', total > 0 && checkedCount === total);
    }

    if (!total){
      list.innerHTML = `
        <div class="clv3-empty">
          <div class="clv3-empty-emoji">🐱</div>
          <div>Chưa có ai trong danh sách</div>
        </div>`;
      return;
    }

    const top3 = detectTop3();
    const RANK_ICONS = ['🥇','🥈','🥉'];
    const frag = document.createDocumentFragment();

    S.names.forEach((name, i) => {
      if (!name) return;
      const checked = !!S.checks[i];
      const time = String(S.times[i] || '').trim();
      const pts = Number(S.points[i]) || 0;
      const prev = S.prev ? S.prev[i] : null;
      const justChecked = prev === false && checked === true;
      const rankIdx = top3[name];

      const card = document.createElement('div');
      card.className = 'clv3-card';
      if (checked) card.classList.add('checked');
      if (rankIdx !== undefined) card.classList.add('top' + (rankIdx + 1));
      if (justChecked) card.classList.add('just-checked');
      card.style.animationDelay = (i * 40) + 'ms';

      // Rank
      const rankEl = document.createElement('div');
      rankEl.className = 'clv3-rank';
      if (rankIdx !== undefined){
        rankEl.classList.add('badge');
        rankEl.textContent = RANK_ICONS[rankIdx];
      } else {
        rankEl.classList.add('empty');
        rankEl.textContent = String(i + 1);
      }

      // Avatar
      const av = document.createElement('div');
      av.className = 'clv3-av';
      const url = avatarUrl(name);
      if (url){
        const img = document.createElement('img');
        img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.onerror = () => { img.remove(); av.textContent = getInitial(name); };
        av.appendChild(img);
      } else {
        av.textContent = getInitial(name);
      }

      // Info
      const info = document.createElement('div');
      info.className = 'clv3-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'clv3-name';
      nameEl.textContent = name;

      const sub = document.createElement('div');
      sub.className = 'clv3-sub';

      if (checked && time){
        const ago = timeAgo(time);
        const isRecent = ago === 'vừa xong' || /\d+ phút trước/.test(ago);
        const tEl = document.createElement('span');
        tEl.className = 'clv3-time' + (isRecent ? ' recent' : '');
        tEl.textContent = '🕐 ' + time;
        sub.appendChild(tEl);

        if (isRecent && ago !== time){
          const d = document.createElement('span');
          d.className = 'clv3-dot';
          const a = document.createElement('span');
          a.style.color = '#4fa370';
          a.textContent = ago;
          sub.appendChild(d);
          sub.appendChild(a);
        }

        if (pts > 0){
          const d2 = document.createElement('span');
          d2.className = 'clv3-dot';
          const p = document.createElement('span');
          p.className = 'clv3-pts' + (pts >= 20 ? ' early' : '');
          p.textContent = '⭐ ' + pts + 'đ';
          sub.appendChild(d2);
          sub.appendChild(p);
        }
      } else {
        const idle = document.createElement('span');
        idle.textContent = 'Chưa check hôm nay';
        idle.style.color = '#a8bdb0';
        sub.appendChild(idle);
      }

      info.appendChild(nameEl);
      info.appendChild(sub);

      // Status
      const status = document.createElement('div');
      status.className = 'clv3-status';
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

    // Lưu state hiện tại làm prev
    S.prev = S.checks.slice();

    // Debug line
    const dbg = $('clv3Debug');
    if (dbg){
      const now = new Date();
      dbg.textContent = `Cập nhật lúc ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }
  }

  /* ============ DATA ============ */
  async function fetchData(){
    const api = getApi();
    if (!api){
      warn('API chưa sẵn sàng');
      return null;
    }
    try {
      log('Gọi getData...');
      const r = await api('getData', { _ts: Date.now() }, 15000);
      if (!r || !r.ok){
        warn('getData lỗi:', r && r.error);
        return null;
      }
      log('getData OK. names:', r.data && r.data.names ? r.data.names.length : 0);
      return r.data;
    } catch (e){
      warn('getData exception:', e && e.message);
      return null;
    }
  }

  function applyState(data){
    if (!data || !Array.isArray(data.names)){
      warn('data không hợp lệ:', data);
      return false;
    }
    S.names  = data.names.slice();
    S.checks = Array.isArray(data.checks) ? data.checks.slice() : [];
    S.times  = Array.isArray(data.times)  ? data.times.slice()  : [];
    S.points = Array.isArray(data.points) ? data.points.slice() : [];
    S.ranks  = Array.isArray(data.ranks)  ? data.ranks.slice()  : [];
    const checked = S.checks.filter(Boolean).length;
    log(`Applied: ${checked}/${S.names.length} checked`);
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
    log('Force refresh');
    // Ghi nhớ state cũ để phát hiện just-checked
    const oldChecks = S.checks.slice();
    const data = await fetchData();
    if (!data) return;

    // So sánh để animate nếu ai vừa chuyển false→true
    const newChecks = Array.isArray(data.checks) ? data.checks : [];
    if (oldChecks.length === newChecks.length){
      S.prev = oldChecks.map(c => !!c);
    } else {
      S.prev = null;
    }

    applyState(data);
    // Sau applyState, S.prev bị set trong render → cần gán lại trước render
    if (oldChecks.length === newChecks.length){
      S.prev = oldChecks.map(c => !!c);
    }
    render();
  }

  /* ============ CAPTURE ============ */
  async function onCapture(){
    log('Capture clicked');
    try {
      const ensure = window.SRank && window.SRank.ensureHtml2Canvas
        ? window.SRank.ensureHtml2Canvas
        : (window.ensureHtml2Canvas || null);
      const preview = window.SRank && window.SRank.showCapturePreview
        ? window.SRank.showCapturePreview
        : (window.showCapturePreview || null);

      if (!window.html2canvas && typeof ensure !== 'function'){
        alert('Chưa tải được thư viện chụp ảnh. Thử lại sau.');
        return;
      }

      if (typeof ensure === 'function') await ensure();

      const root = $(ROOT_ID);
      if (!root) return;

      const canvas = await window.html2canvas(root, {
        backgroundColor: null,
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        useCORS: true,
        allowTaint: false,
        logging: false,
      });

      const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 1));
      if (!blob) throw new Error('Không tạo được ảnh');

      const url = URL.createObjectURL(blob);
      if (typeof preview === 'function'){
        preview(url, blob, '📸 Checklist', 'checklist-dao-meo.png', 'Bấm Lưu ảnh hoặc nhấn giữ để lưu.');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'checklist-dao-meo.png';
        a.click();
      }
    } catch (e){
      console.error('[CL3] capture lỗi:', e);
      alert('Chụp thất bại: ' + (e && e.message || e));
    }
  }

  /* ============ EVENTS ============ */
  function bindGlobalEvents(){
    window.addEventListener('checkinDone', (e) => {
      const name = e && e.detail && e.detail.name;
      log('checkinDone:', name);
      if (name && S.prev && Array.isArray(S.names)){
        const idx = S.names.indexOf(name);
        if (idx >= 0) S.prev[idx] = false;
      }
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
      if (S.retryCount >= MAX_RETRY){
        warn('Không tìm thấy #checklistPanel sau ' + MAX_RETRY + ' lần thử');
        return;
      }
      setTimeout(boot, 300);
      return;
    }

    S.booted = true;
    bindGlobalEvents();
    startAutoTimer();

    log('Boot lần đầu, fetch data...');
    await refresh();

    // Retry nếu chưa có data sau 3s
    setTimeout(async () => {
      if (!S.names.length){
        log('Retry fetch sau 3s...');
        await refresh();
      }
    }, 3000);

    window.__clV3 = {
      refresh,
      forceRefresh,
      render,
      state: S,
      root: () => $(ROOT_ID),
    };
    log('✓ Checklist UI v3.1 ready');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }
})();