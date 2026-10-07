/* =========================================================
   CHECKLIST UI v4.2
   - FIX chụp: modal preview tự chứa, không cần main.js
   - FIX scroll + sort (giữ từ v4.0)
   - Load html2canvas từ 2 CDN dự phòng
   ========================================================= */
(function(){
  "use strict";
  if (window.__clV4) return;

  const ROOT_ID    = 'clV4Root';
  const REFRESH_MS = 15000;
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
  };

  /* ============ HELPERS ============ */
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const log = (...args) => console.log('[CL4]', ...args);
  const warn = (...args) => console.warn('[CL4]', ...args);

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

  /* ============ LOAD html2canvas (multi-CDN fallback) ============ */
  function tryLoadScript(url){
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => {
        if (typeof window.html2canvas === 'function') resolve(true);
        else resolve(false);
      };
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  function loadHtml2Canvas(){
    if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
    if (S.h2cPromise) return S.h2cPromise;

    S.h2cPromise = (async () => {
      // Thử SRank helper trước
      if (window.SRank && typeof window.SRank.ensureHtml2Canvas === 'function'){
        try {
          await window.SRank.ensureHtml2Canvas();
          if (typeof window.html2canvas === 'function'){
            log('h2c loaded via SRank helper ✓');
            return window.html2canvas;
          }
        } catch(_){}
      }

      // Thử lần lượt các CDN
      for (const url of CDN_LIST){
        const ok = await tryLoadScript(url);
        if (ok){
          log('h2c loaded from CDN ✓', url);
          return window.html2canvas;
        }
      }

      warn('Không tải được html2canvas từ mọi CDN');
      return null;
    })();

    return S.h2cPromise;
  }

  /* ============ STYLES ============ */
  function injectStyles(){
    if ($('clV4Styles')) return;
    const style = document.createElement('style');
    style.id = 'clV4Styles';
    style.textContent = `
#clV4Root {
  display: flex; flex-direction: column;
  padding: 14px 12px 12px; border-radius: 22px;
  background:
    radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,.9), transparent 70%),
    linear-gradient(160deg, #ffffff 0%, #f5fbf5 55%, #eef7ef 100%);
  border: 1px solid rgba(203,220,201,.55);
  box-shadow:
    0 12px 32px -14px rgba(53,91,61,.16),
    0 4px 12px -4px rgba(53,91,61,.08),
    inset 0 1px 0 rgba(255,255,255,.95);
}
.clv4-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 10px; padding: 0 2px; flex-shrink: 0;
}
.clv4-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 950; color: #315744;
}
.clv4-title .ico { font-size: 17px; }
.clv4-count {
  font-size: 12px; font-weight: 900; color: #6b8f78;
  background: rgba(122,184,150,.14);
  padding: 3px 9px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.clv4-count.full {
  color: #fff;
  background: linear-gradient(135deg, #7ab896, #4fa370);
  box-shadow: 0 3px 10px -3px rgba(79,163,112,.5);
}
.clv4-bar {
  height: 6px; border-radius: 3px;
  background: rgba(203,220,201,.45);
  overflow: hidden; margin: 0 2px 12px; flex-shrink: 0;
}
.clv4-bar-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #8ecfa6 0%, #4fa370 100%);
  border-radius: 3px;
  transition: width .7s cubic-bezier(.16,.9,.25,1);
  box-shadow: 0 0 10px rgba(79,163,112,.45);
}
.clv4-bar-fill.full {
  background: linear-gradient(90deg, #7ad79a 0%, #3f9a65 100%);
  animation: clv4BarGlow 2s ease-in-out infinite;
}
@keyframes clv4BarGlow {
  0%,100% { box-shadow: 0 0 10px rgba(79,163,112,.45); }
  50%     { box-shadow: 0 0 18px rgba(79,163,112,.75); }
}
.clv4-list {
  display: flex; flex-direction: column; gap: 7px;
  max-height: 58vh; overflow-y: auto; overflow-x: hidden;
  padding: 2px 6px 2px 2px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(122,184,150,.5) transparent;
}
.clv4-list::-webkit-scrollbar { width: 5px; }
.clv4-list::-webkit-scrollbar-track { background: transparent; }
.clv4-list::-webkit-scrollbar-thumb {
  background: rgba(122,184,150,.42); border-radius: 3px;
}
.clv4-list::-webkit-scrollbar-thumb:active { background: rgba(122,184,150,.7); }
.clv4-divider {
  display: flex; align-items: center; gap: 8px;
  margin: 6px 2px 2px;
  font-size: 10.5px; font-weight: 900;
  color: #8fa89a; letter-spacing: .08em;
  text-transform: uppercase;
}
.clv4-divider::before, .clv4-divider::after {
  content: ''; flex: 1; height: 1px;
  background: rgba(203,220,201,.55);
}
.clv4-card {
  display: grid; grid-template-columns: 26px 38px 1fr auto;
  align-items: center; gap: 9px;
  padding: 9px 11px; border-radius: 14px;
  background: #fff;
  border: 1.5px solid rgba(203,220,201,.5);
  transition: transform .2s cubic-bezier(.16,.9,.25,1),
              box-shadow .25s ease,
              background .25s ease,
              border-color .25s ease;
  position: relative; overflow: hidden;
  flex-shrink: 0;
}
.clv4-card.checked {
  background: linear-gradient(160deg, #f3fbf5 0%, #e9f7ee 100%);
  border-color: rgba(122,184,150,.48);
}
.clv4-card.top1 {
  background: linear-gradient(160deg, #fffbe9 0%, #ffefc4 100%);
  border-color: rgba(216,168,32,.55);
  box-shadow: 0 6px 20px -10px rgba(216,168,32,.4);
}
.clv4-card.top2 {
  background: linear-gradient(160deg, #fafafa 0%, #ebedee 100%);
  border-color: rgba(150,158,168,.5);
  box-shadow: 0 5px 18px -10px rgba(120,130,140,.3);
}
.clv4-card.top3 {
  background: linear-gradient(160deg, #fff2e3 0%, #ffe1c2 100%);
  border-color: rgba(200,130,70,.5);
  box-shadow: 0 5px 18px -10px rgba(200,130,70,.32);
}
.clv4-rank {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; line-height: 1; flex-shrink: 0;
}
.clv4-rank.empty { font-size: 12px; color: #c0d0c4; font-weight: 900; }
.clv4-av {
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
.clv4-av img { width:100%; height:100%; object-fit:cover; display:block; }
.clv4-card.checked .clv4-av {
  box-shadow: 0 0 0 2px #7ab896, 0 3px 12px -4px rgba(79,163,112,.35);
}
.clv4-card.top1 .clv4-av { box-shadow: 0 0 0 2px #e0b840, 0 3px 12px -4px rgba(216,168,32,.4); }
.clv4-card.top2 .clv4-av { box-shadow: 0 0 0 2px #a8b0b8, 0 3px 12px -4px rgba(120,130,140,.3); }
.clv4-card.top3 .clv4-av { box-shadow: 0 0 0 2px #c88246, 0 3px 12px -4px rgba(200,130,70,.32); }
.clv4-info {
  min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.clv4-name {
  font-size: 13.5px; font-weight: 850; color: #2a4d38;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.clv4-card.checked .clv4-name { color: #1a3d28; }
.clv4-sub {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 800; color: #7a9a85;
  flex-wrap: wrap;
}
.clv4-time { font-variant-numeric: tabular-nums; font-weight: 900; }
.clv4-time.recent { color: #4fa370; }
.clv4-dot { width: 3px; height: 3px; border-radius: 50%; background: #c0d0c4; }
.clv4-pts { font-variant-numeric: tabular-nums; font-weight: 900; color: #4fa370; }
.clv4-pts.early { color: #d89020; }
.clv4-status { font-size: 19px; line-height: 1; flex-shrink: 0; }
.clv4-status.idle { font-size: 15px; color: #c0d0c4; }
.clv4-empty {
  padding: 40px 20px; text-align: center;
  color: #9ab0a0; font-size: 13px; font-weight: 800;
}
.clv4-empty-emoji { font-size: 42px; margin-bottom: 8px; opacity: .7; }
.clv4-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed rgba(203,220,201,.7);
  flex-shrink: 0;
}
.clv4-actions button {
  min-height: 42px; padding: 8px 12px;
  border: 1.5px solid rgba(203,220,201,.75);
  border-radius: 12px; background: #fff; color: #315744;
  font-family: inherit; font-size: 12.5px; font-weight: 900;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease, border-color .15s ease, opacity .15s ease;
}
.clv4-actions button:active {
  transform: scale(.96);
  background: #f5fbf5;
  border-color: rgba(122,184,150,.6);
}
.clv4-actions button:disabled { opacity: .55; pointer-events: none; }
.clv4-debug {
  margin-top: 8px; font-size: 10.5px; font-weight: 800;
  color: #9ab0a0; text-align: center; min-height: 14px; flex-shrink: 0;
}

/* ===== MODAL PREVIEW ===== */
#clv4PreviewModal {
  position: fixed; inset: 0; z-index: 30000;
  display: none; align-items: center; justify-content: center;
  background: rgba(17, 40, 30, .72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 16px;
}
#clv4PreviewModal.show { display: flex; animation: clv4Fade .22s ease; }
@keyframes clv4Fade { from { opacity: 0 } to { opacity: 1 } }
.clv4-preview-panel {
  width: 100%; max-width: 440px; max-height: 92vh;
  background: #fff;
  border-radius: 22px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 12px;
  box-shadow: 0 30px 80px rgba(0,0,0,.35);
  animation: clv4Pop .28s cubic-bezier(.16,.9,.25,1);
}
@keyframes clv4Pop {
  from { opacity: 0; transform: scale(.92) }
  to   { opacity: 1; transform: scale(1) }
}
.clv4-preview-head {
  display: flex; align-items: center; justify-content: space-between;
}
.clv4-preview-title {
  font-size: 15px; font-weight: 950; color: #2a4d38;
}
.clv4-preview-close {
  width: 34px; height: 34px;
  border: 0; border-radius: 50%;
  background: rgba(203,220,201,.5);
  color: #4a7a5a;
  font-size: 20px; font-weight: 900;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.clv4-preview-imgbox {
  flex: 1 1 auto;
  overflow: auto;
  border-radius: 12px;
  background: #f5fbf5;
  display: flex; align-items: flex-start; justify-content: center;
  min-height: 120px;
}
.clv4-preview-imgbox img {
  width: 100%; height: auto; display: block;
  border-radius: 12px;
}
.clv4-preview-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.clv4-preview-actions button {
  min-height: 44px; padding: 10px 14px;
  border-radius: 12px;
  font-family: inherit; font-size: 13px; font-weight: 900;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: transform .15s ease, opacity .15s ease;
}
.clv4-preview-actions button:active { transform: scale(.96); }
.clv4-preview-actions .save {
  background: linear-gradient(180deg, #7ab896 0%, #4fa370 100%);
  color: #fff;
  box-shadow: 0 6px 16px -6px rgba(79,163,112,.5);
}
.clv4-preview-actions .open {
  background: #fff; color: #315744;
  border-color: rgba(203,220,201,.75);
}
.clv4-preview-hint {
  font-size: 11.5px; font-weight: 800; color: #8fa89a;
  text-align: center; line-height: 1.4;
}
    `;
    document.head.appendChild(style);
  }

  /* ============ PREVIEW MODAL (tự chứa) ============ */
  function showPreview(url, filename){
    let modal = $('clv4PreviewModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'clv4PreviewModal';
    modal.setAttribute('aria-hidden', 'false');
    modal.innerHTML = `
      <div class="clv4-preview-panel" role="dialog" aria-modal="true">
        <div class="clv4-preview-head">
          <div class="clv4-preview-title">📸 Checklist đã chụp</div>
          <button type="button" class="clv4-preview-close" aria-label="Đóng">×</button>
        </div>
        <div class="clv4-preview-imgbox">
          <img src="${url}" alt="Checklist">
        </div>
        <div class="clv4-preview-actions">
          <button type="button" class="save">💾 Lưu ảnh</button>
          <button type="button" class="open">🔗 Mở tab mới</button>
        </div>
        <div class="clv4-preview-hint">
          Nếu nút Lưu không hoạt động → <b>nhấn giữ vào ảnh</b> rồi chọn "Lưu ảnh" để tải về.
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Đóng
    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
        // Giải phóng blob URL khi không cần nữa (sau 10s)
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch(_){} }, 10000);
      }, 250);
    };
    modal.querySelector('.clv4-preview-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Lưu ảnh
    modal.querySelector('.save').addEventListener('click', () => {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || ('checklist-' + Date.now() + '.png');
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e){
        warn('Download fail:', e && e.message);
        // Fallback: mở tab mới
        window.open(url, '_blank');
      }
    });

    // Mở tab mới
    modal.querySelector('.open').addEventListener('click', () => {
      window.open(url, '_blank');
    });

    // Show
    requestAnimationFrame(() => modal.classList.add('show'));

    // ESC để đóng
    const onEsc = (e) => {
      if (e.key === 'Escape'){ close(); document.removeEventListener('keydown', onEsc); }
    };
    document.addEventListener('keydown', onEsc);
  }

  /* ============ BUILD ROOT ============ */
  function ensureRoot(){
    let root = $(ROOT_ID);
    if (root) return root;

    const panel = $('checklistPanel');
    if (!panel){
      warn('Không tìm thấy #checklistPanel');
      return null;
    }

    const oldScroll = panel.querySelector('#checklistScroll');
    const oldActions = panel.querySelector('#checklistActions');
    if (oldScroll) oldScroll.style.display = 'none';
    if (oldActions) oldActions.style.display = 'none';

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-label', 'Checklist hôm nay');
    root.innerHTML = `
      <div class="clv4-head">
        <div class="clv4-title">
          <span class="ico">☑</span>
          <span>Checklist hôm nay</span>
        </div>
        <span class="clv4-count" id="clv4Count">0/0</span>
      </div>
      <div class="clv4-bar">
        <div class="clv4-bar-fill" id="clv4Bar"></div>
      </div>
      <div class="clv4-list" id="clv4List"></div>
      <div class="clv4-actions">
        <button type="button" id="clv4Capture">📸 Chụp checklist</button>
        <button type="button" id="clv4Sync">↻ Đồng bộ lại</button>
      </div>
      <div class="clv4-debug" id="clv4Debug"></div>
    `;

    panel.appendChild(root);

    const captureBtn = root.querySelector('#clv4Capture');
    const syncBtn = root.querySelector('#clv4Sync');

    captureBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      onCapture();
    }, true);

    syncBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      forceRefresh();
    }, true);

    log('Root created inside #checklistPanel ✓');
    return root;
  }

  /* ============ SORT ============ */
  function sortData(){
    const items = S.names.map((name, i) => ({
      name,
      checked: !!S.checks[i],
      time: String(S.times[i] || '').trim(),
      points: Number(S.points[i]) || 0,
      rank: S.ranks[i] || 'B',
      origIdx: i
    }));

    const checkedWithTime = items
      .filter(x => x.checked && x.time)
      .sort((a, b) => a.time.localeCompare(b.time));

    const groupTop3 = checkedWithTime.slice(0, 3);
    const top3Names = new Set(groupTop3.map(x => x.name));
    const groupChecked = checkedWithTime.slice(3);

    const groupUnchecked = items
      .filter(x => !x.checked)
      .sort((a, b) => a.origIdx - b.origIdx);

    return {
      items: [...groupTop3, ...groupChecked, ...groupUnchecked],
      top3Names,
      top3: groupTop3,
      checkedCount: checkedWithTime.length,
      uncheckedCount: groupUnchecked.length
    };
  }

  /* ============ RENDER ============ */
  function render(){
    const list = $('clv4List');
    const countEl = $('clv4Count');
    const barEl = $('clv4Bar');
    if (!list) return;

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
        <div class="clv4-empty">
          <div class="clv4-empty-emoji">🐱</div>
          <div>Chưa có ai trong danh sách</div>
        </div>`;
      return;
    }

    const sorted = sortData();
    const RANK_ICONS = ['🥇','🥈','🥉'];
    const frag = document.createDocumentFragment();

    const prevByName = {};
    if (S.prev && S.prev.byName) Object.assign(prevByName, S.prev.byName);

    let lastSection = null;

    sorted.items.forEach((item, displayIdx) => {
      let section = null;
      if (displayIdx < sorted.top3.length) section = 'top3';
      else if (item.checked) section = 'checked';
      else section = 'unchecked';

      if (section !== lastSection){
        const div = document.createElement('div');
        div.className = 'clv4-divider';
        div.textContent = section === 'top3'
          ? '🏆 Top 3 check sớm'
          : section === 'checked'
            ? `✓ Đã check (${sorted.checkedCount - sorted.top3.length})`
            : `○ Chưa check (${sorted.uncheckedCount})`;
        frag.appendChild(div);
        lastSection = section;
      }

      const { name, checked, time, points } = item;
      const prevVal = prevByName[name];
      const justChecked = prevVal === false && checked === true;
      const rankIdx = sorted.top3Names.has(name)
        ? sorted.top3.findIndex(x => x.name === name)
        : undefined;

      const card = document.createElement('div');
      card.className = 'clv4-card';
      if (checked) card.classList.add('checked');
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2){
        card.classList.add('top' + (rankIdx + 1));
      }
      if (justChecked) card.classList.add('just-checked');

      const rankEl = document.createElement('div');
      rankEl.className = 'clv4-rank';
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2){
        rankEl.textContent = RANK_ICONS[rankIdx];
      } else {
        rankEl.classList.add('empty');
        rankEl.textContent = String(item.origIdx + 1);
      }

      const av = document.createElement('div');
      av.className = 'clv4-av';
      const url = avatarUrl(name);
      if (url){
        const img = document.createElement('img');
        img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.onerror = () => { img.remove(); av.textContent = getInitial(name); };
        av.appendChild(img);
      } else {
        av.textContent = getInitial(name);
      }

      const info = document.createElement('div');
      info.className = 'clv4-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'clv4-name';
      nameEl.textContent = name;

      const sub = document.createElement('div');
      sub.className = 'clv4-sub';

      if (checked && time){
        const ago = timeAgo(time);
        const isRecent = ago === 'vừa xong' || /\d+ phút trước/.test(ago);
        const tEl = document.createElement('span');
        tEl.className = 'clv4-time' + (isRecent ? ' recent' : '');
        tEl.textContent = '🕐 ' + time;
        sub.appendChild(tEl);

        if (isRecent && ago !== time){
          const d = document.createElement('span');
          d.className = 'clv4-dot';
          const a = document.createElement('span');
          a.style.color = '#4fa370';
          a.textContent = ago;
          sub.appendChild(d);
          sub.appendChild(a);
        }

        if (points > 0){
          const d2 = document.createElement('span');
          d2.className = 'clv4-dot';
          const p = document.createElement('span');
          p.className = 'clv4-pts' + (points >= 20 ? ' early' : '');
          p.textContent = '⭐ ' + points + 'đ';
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

      const status = document.createElement('div');
      status.className = 'clv4-status';
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

    const byName = {};
    S.names.forEach((n, i) => { byName[n] = !!S.checks[i]; });
    S.prev = { byName };

    const dbg = $('clv4Debug');
    if (dbg){
      const now = new Date();
      const hh = String(now.getHours()).padStart(2,'0');
      const mm = String(now.getMinutes()).padStart(2,'0');
      const ss = String(now.getSeconds()).padStart(2,'0');
      dbg.textContent = `Cập nhật lúc ${hh}:${mm}:${ss} · ${sorted.top3.length} top3 · ${sorted.checkedCount} checked`;
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
    } catch (e){
      warn('getData exception:', e && e.message);
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
    log('=== CAPTURE START ===');
    const btn = $('clv4Capture');
    const oldLabel = btn ? btn.textContent : '';
    if (btn){
      btn.disabled = true;
      btn.textContent = '⏳ Đang tạo ảnh…';
    }

    let clone = null;
    try {
      // 1. Load html2canvas
      log('Step 1: load html2canvas...');
      const h2c = await loadHtml2Canvas();
      if (typeof h2c !== 'function'){
        throw new Error('Không tải được html2canvas. Kiểm tra mạng / tắt adblock.');
      }
      log('Step 1 ✓ html2canvas ready');

      // 2. Tìm root
      const root = $(ROOT_ID);
      if (!root) throw new Error('Không tìm thấy #' + ROOT_ID);
      log('Step 2 ✓ root found, size:', root.offsetWidth, 'x', root.offsetHeight);

      // 3. Clone
      log('Step 3: clone...');
      clone = root.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

      // Reset animation
      clone.style.animation = 'none';
      clone.style.transition = 'none';
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
        opacity: '1',
        visibility: 'visible',
        background: '#f5fbf5'
      });

      // Mở list clone (bỏ scroll)
      const listClone = clone.querySelector('.clv4-list');
      if (listClone){
        listClone.style.maxHeight = 'none';
        listClone.style.overflow = 'visible';
        listClone.style.height = 'auto';
      }

      // Bỏ actions + debug
      clone.querySelector('.clv4-actions')?.remove();
      clone.querySelector('.clv4-debug')?.remove();

      // Reset animation card
      clone.querySelectorAll('.clv4-card').forEach(c => {
        c.style.animation = 'none';
        c.style.opacity = '1';
        c.style.transform = 'none';
      });

      document.body.appendChild(clone);
      log('Step 3 ✓ clone appended, size:', clone.offsetWidth, 'x', clone.scrollHeight);

      // 4. Đợi layout
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // 5. Chụp
      log('Step 4: render canvas...');
      const canvas = await h2c(clone, {
        backgroundColor: '#f5fbf5',
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        useCORS: true,
        allowTaint: false,
        logging: true,
        width: clone.offsetWidth,
        height: clone.scrollHeight,
        windowWidth: clone.offsetWidth,
        windowHeight: clone.scrollHeight,
      });
      log('Step 4 ✓ canvas:', canvas.width, 'x', canvas.height);

      // 6. Blob
      log('Step 5: toBlob...');
      const blob = await new Promise((res, rej) => {
        canvas.toBlob((b) => {
          if (b) res(b);
          else rej(new Error('toBlob trả về null'));
        }, 'image/png', 1);
      });
      log('Step 5 ✓ blob size:', (blob.size / 1024).toFixed(1), 'KB');

      const url = URL.createObjectURL(blob);

      // 7. Preview modal
      log('Step 6: show preview modal...');
      const filename = 'checklist-' + new Date().toISOString().slice(0,10) + '.png';
      showPreview(url, filename);
      log('=== CAPTURE SUCCESS ===');

    } catch (e){
      console.error('[CL4] CAPTURE ERROR:', e);
      alert('Chụp thất bại:\n\n' + (e && e.message || e));
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      if (btn){
        btn.disabled = false;
        btn.textContent = oldLabel || '📸 Chụp checklist';
      }
    }
  }

  /* ============ EVENTS ============ */
  function bindGlobalEvents(){
    window.addEventListener('checkinDone', (e) => {
      const name = e && e.detail && e.detail.name;
      if (name && S.prev && S.prev.byName) S.prev.byName[name] = false;
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

    await refresh();

    setTimeout(async () => {
      if (!S.names.length) await refresh();
    }, 3000);

    // Preload html2canvas nền
    loadHtml2Canvas().catch(() => {});

    window.__clV4 = {
      refresh, forceRefresh, render, state: S,
      root: () => $(ROOT_ID),
      capture: onCapture,
      loadH2C: loadHtml2Canvas,
      preview: showPreview,
    };
    log('✓ Checklist UI v4.2 ready');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }
})();