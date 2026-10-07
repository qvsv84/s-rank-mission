/* =========================================================
   CHECKLIST UI v4.3 — Debug mode cho mobile
   - Nút 🐛 Debug hiện kết quả bằng alert()
   - Chụp checklist: hiện alert từng bước, lỗi ở đâu biết ngay
   - Giữ sort + scroll
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

  const $ = id => document.getElementById(id);
  const log = (...args) => console.log('[CL4]', ...args);
  const warn = (...args) => console.warn('[CL4]', ...args);
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

  /* ============ LOAD html2canvas ============ */
  function tryLoadScript(url){
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => resolve(typeof window.html2canvas === 'function');
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  function loadHtml2Canvas(){
    if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
    if (S.h2cPromise) return S.h2cPromise;

    S.h2cPromise = (async () => {
      if (window.SRank && typeof window.SRank.ensureHtml2Canvas === 'function'){
        try {
          await window.SRank.ensureHtml2Canvas();
          if (typeof window.html2canvas === 'function') return window.html2canvas;
        } catch(_){}
      }
      for (const url of CDN_LIST){
        const ok = await tryLoadScript(url);
        if (ok) return window.html2canvas;
      }
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
  background: linear-gradient(160deg, #ffffff 0%, #f5fbf5 55%, #eef7ef 100%);
  border: 1px solid rgba(203,220,201,.55);
  box-shadow: 0 12px 32px -14px rgba(53,91,61,.16), 0 4px 12px -4px rgba(53,91,61,.08), inset 0 1px 0 rgba(255,255,255,.95);
}
.clv4-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; padding: 0 2px; flex-shrink: 0; }
.clv4-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 950; color: #315744; }
.clv4-title .ico { font-size: 17px; }
.clv4-count { font-size: 12px; font-weight: 900; color: #6b8f78; background: rgba(122,184,150,.14); padding: 3px 9px; border-radius: 999px; }
.clv4-count.full { color: #fff; background: linear-gradient(135deg, #7ab896, #4fa370); }
.clv4-bar { height: 6px; border-radius: 3px; background: rgba(203,220,201,.45); overflow: hidden; margin: 0 2px 12px; flex-shrink: 0; }
.clv4-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #8ecfa6 0%, #4fa370 100%); border-radius: 3px; transition: width .7s; }
.clv4-list { display: flex; flex-direction: column; gap: 7px; max-height: 58vh; overflow-y: auto; overflow-x: hidden; padding: 2px 6px 2px 2px; -webkit-overflow-scrolling: touch; }
.clv4-list::-webkit-scrollbar { width: 5px; }
.clv4-list::-webkit-scrollbar-thumb { background: rgba(122,184,150,.42); border-radius: 3px; }
.clv4-divider { display: flex; align-items: center; gap: 8px; margin: 6px 2px 2px; font-size: 10.5px; font-weight: 900; color: #8fa89a; letter-spacing: .08em; text-transform: uppercase; }
.clv4-divider::before, .clv4-divider::after { content: ''; flex: 1; height: 1px; background: rgba(203,220,201,.55); }
.clv4-card { display: grid; grid-template-columns: 26px 38px 1fr auto; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 14px; background: #fff; border: 1.5px solid rgba(203,220,201,.5); position: relative; overflow: hidden; flex-shrink: 0; }
.clv4-card.checked { background: linear-gradient(160deg, #f3fbf5 0%, #e9f7ee 100%); border-color: rgba(122,184,150,.48); }
.clv4-card.top1 { background: linear-gradient(160deg, #fffbe9 0%, #ffefc4 100%); border-color: rgba(216,168,32,.55); }
.clv4-card.top2 { background: linear-gradient(160deg, #fafafa 0%, #ebedee 100%); border-color: rgba(150,158,168,.5); }
.clv4-card.top3 { background: linear-gradient(160deg, #fff2e3 0%, #ffe1c2 100%); border-color: rgba(200,130,70,.5); }
.clv4-rank { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
.clv4-rank.empty { font-size: 12px; color: #c0d0c4; font-weight: 900; }
.clv4-av { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; background: linear-gradient(135deg, #e8f5ec, #d4ead9); color: #4a7a5a; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; overflow: hidden; border: 2px solid #fff; }
.clv4-av img { width:100%; height:100%; object-fit:cover; display:block; }
.clv4-card.checked .clv4-av { box-shadow: 0 0 0 2px #7ab896; }
.clv4-card.top1 .clv4-av { box-shadow: 0 0 0 2px #e0b840; }
.clv4-card.top2 .clv4-av { box-shadow: 0 0 0 2px #a8b0b8; }
.clv4-card.top3 .clv4-av { box-shadow: 0 0 0 2px #c88246; }
.clv4-info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.clv4-name { font-size: 13.5px; font-weight: 850; color: #2a4d38; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.clv4-sub { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; color: #7a9a85; flex-wrap: wrap; }
.clv4-time { font-weight: 900; }
.clv4-dot { width: 3px; height: 3px; border-radius: 50%; background: #c0d0c4; }
.clv4-pts { font-weight: 900; color: #4fa370; }
.clv4-pts.early { color: #d89020; }
.clv4-status { font-size: 19px; flex-shrink: 0; }
.clv4-status.idle { font-size: 15px; color: #c0d0c4; }
.clv4-empty { padding: 40px 20px; text-align: center; color: #9ab0a0; font-size: 13px; font-weight: 800; }
.clv4-actions {
  display: grid; grid-template-columns: 1fr 1fr 40px; gap: 8px;
  margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(203,220,201,.7);
  flex-shrink: 0;
}
.clv4-actions button {
  min-height: 42px; padding: 8px 12px;
  border: 1.5px solid rgba(203,220,201,.75); border-radius: 12px;
  background: #fff; color: #315744; font-family: inherit;
  font-size: 12.5px; font-weight: 900; cursor: pointer;
}
.clv4-actions button:active { transform: scale(.96); background: #f5fbf5; }
.clv4-actions button:disabled { opacity: .55; pointer-events: none; }
.clv4-actions #clv4DebugBtn { font-size: 16px; padding: 0; }
.clv4-debug { margin-top: 8px; font-size: 10.5px; font-weight: 800; color: #9ab0a0; text-align: center; min-height: 14px; }

/* ===== PREVIEW MODAL ===== */
#clv4PreviewModal { position: fixed; inset: 0; z-index: 30000; display: none; align-items: center; justify-content: center; background: rgba(17, 40, 30, .72); backdrop-filter: blur(10px); padding: 16px; }
#clv4PreviewModal.show { display: flex; }
.clv4-preview-panel { width: 100%; max-width: 440px; max-height: 92vh; background: #fff; border-radius: 22px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.clv4-preview-head { display: flex; align-items: center; justify-content: space-between; }
.clv4-preview-title { font-size: 15px; font-weight: 950; color: #2a4d38; }
.clv4-preview-close { width: 34px; height: 34px; border: 0; border-radius: 50%; background: rgba(203,220,201,.5); color: #4a7a5a; font-size: 20px; font-weight: 900; cursor: pointer; }
.clv4-preview-imgbox { flex: 1 1 auto; overflow: auto; border-radius: 12px; background: #f5fbf5; display: flex; align-items: flex-start; justify-content: center; min-height: 120px; }
.clv4-preview-imgbox img { width: 100%; height: auto; display: block; border-radius: 12px; }
.clv4-preview-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.clv4-preview-actions button { min-height: 44px; padding: 10px 14px; border-radius: 12px; font-family: inherit; font-size: 13px; font-weight: 900; cursor: pointer; border: 1.5px solid transparent; }
.clv4-preview-actions .save { background: linear-gradient(180deg, #7ab896 0%, #4fa370 100%); color: #fff; }
.clv4-preview-actions .open { background: #fff; color: #315744; border-color: rgba(203,220,201,.75); }
.clv4-preview-hint { font-size: 11.5px; font-weight: 800; color: #8fa89a; text-align: center; line-height: 1.4; }

/* ===== DEBUG PANEL ===== */
#clv4DebugModal {
  position: fixed; inset: 0; z-index: 31000; display: none;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,.7); padding: 16px;
}
#clv4DebugModal.show { display: flex; }
.clv4-debug-panel {
  width: 100%; max-width: 440px; max-height: 80vh;
  background: #1e1e1e; color: #d4d4d4;
  border-radius: 16px; padding: 16px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.6;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.clv4-debug-panel .ok { color: #4ec9b0; }
.clv4-debug-panel .fail { color: #f48771; }
.clv4-debug-panel .warn { color: #dcdcaa; }
.clv4-debug-panel .info { color: #9cdcfe; }
.clv4-debug-panel button {
  margin-top: 12px; width: 100%; padding: 10px;
  background: #007acc; color: #fff; border: 0;
  border-radius: 8px; font-weight: 900; cursor: pointer; font-size: 13px;
}
    `;
    document.head.appendChild(style);
  }

  /* ============ DEBUG PANEL ============ */
  function showDebugPanel(lines){
    let modal = $('clv4DebugModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'clv4DebugModal';
    modal.innerHTML = `
      <div class="clv4-debug-panel">
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

  /* ============ PREVIEW MODAL ============ */
  function showPreview(url, filename){
    let modal = $('clv4PreviewModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'clv4PreviewModal';
    modal.innerHTML = `
      <div class="clv4-preview-panel">
        <div class="clv4-preview-head">
          <div class="clv4-preview-title">📸 Checklist đã chụp</div>
          <button type="button" class="clv4-preview-close">×</button>
        </div>
        <div class="clv4-preview-imgbox">
          <img src="${url}" alt="Checklist">
        </div>
        <div class="clv4-preview-actions">
          <button type="button" class="save">💾 Lưu ảnh</button>
          <button type="button" class="open">🔗 Mở tab mới</button>
        </div>
        <div class="clv4-preview-hint">
          Nếu nút Lưu không hoạt động → <b>nhấn giữ vào ảnh</b> rồi chọn "Lưu ảnh".
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 250);
    };
    modal.querySelector('.clv4-preview-close').addEventListener('click', close);
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
        <button type="button" id="clv4Capture">📸 Chụp</button>
        <button type="button" id="clv4Sync">↻ Đồng bộ</button>
        <button type="button" id="clv4DebugBtn" title="Debug">🐛</button>
      </div>
      <div class="clv4-debug" id="clv4Debug"></div>
    `;
    panel.appendChild(root);

    root.querySelector('#clv4Capture').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); onCapture();
    }, true);
    root.querySelector('#clv4Sync').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); forceRefresh();
    }, true);
    root.querySelector('#clv4DebugBtn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); runDebug();
    }, true);

    return root;
  }

  /* ============ DEBUG RUN ============ */
  async function runDebug(){
    const L = [];
    const push = (icon, txt) => L.push(icon + ' ' + txt);

    push('ℹ️', '=== DEBUG CHECKLIST ===');
    push('ℹ️', 'Time: ' + new Date().toLocaleString('vi-VN'));

    // 1. Root
    const root = $(ROOT_ID);
    push(root ? '✅' : '❌', 'Root: ' + (root ? 'OK' : 'KHÔNG TÌM THẤY'));

    // 2. Panel
    const panel = $('checklistPanel');
    push(panel ? '✅' : '❌', 'Panel: ' + (panel ? 'OK' : 'KHÔNG TÌM THẤY'));

    // 3. API
    const api = getApi();
    push(api ? '✅' : '❌', 'API: ' + (api ? 'OK' : 'KHÔNG CÓ'));

    // 4. Data
    push('ℹ️', 'Data: ' + S.names.length + ' người');
    if (S.names.length){
      const checked = S.checks.filter(Boolean).length;
      push('ℹ️', 'Đã check: ' + checked + '/' + S.names.length);
    }

    // 5. html2canvas
    push('ℹ️', 'html2canvas: ' + (typeof window.html2canvas === 'function' ? 'đã load' : 'chưa load, đang thử...'));
    showDebugPanel([...L, '', '<span class="warn">Đang thử load html2canvas...</span>']);

    try {
      const h2c = await loadHtml2Canvas();
      push(h2c ? '✅' : '❌', 'html2canvas load: ' + (h2c ? 'THÀNH CÔNG' : 'THẤT BẠI (mạng/adblock chặn CDN)'));

      // 6. Test chụp 1 ô nhỏ
      if (h2c && root){
        push('ℹ️', 'Test chụp nhỏ...');
        const testDiv = document.createElement('div');
        testDiv.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:100px;background:red;color:white;padding:20px;font-size:20px;font-weight:bold';
        testDiv.textContent = 'TEST OK';
        document.body.appendChild(testDiv);
        try {
          const c = await h2c(testDiv, { logging: false });
          push('✅', 'Test canvas: ' + c.width + 'x' + c.height);
        } catch(e) {
          push('❌', 'Test canvas lỗi: ' + e.message);
        }
        testDiv.remove();
      }

      // 7. Kiểm tra API data mới nhất
      if (api){
        push('ℹ️', 'Gọi getData...');
        try {
          const r = await api('getData', { _ts: Date.now() }, 10000);
          if (r && r.ok && r.data){
            push('✅', 'getData OK: ' + r.data.names.length + ' người');
          } else {
            push('❌', 'getData lỗi: ' + (r && r.error || 'không rõ'));
          }
        } catch(e){
          push('❌', 'getData exception: ' + e.message);
        }
      }

      push('ℹ️', '=== KẾT THÚC ===');
      push('ℹ️', 'Chụp ảnh ở nút 📸 Chụp');
      showDebugPanel(L);

    } catch (e){
      push('❌', 'Lỗi: ' + e.message);
      showDebugPanel(L);
    }
  }

  /* ============ SORT ============ */
  function sortData(){
    const items = S.names.map((name, i) => ({
      name,
      checked: !!S.checks[i],
      time: String(S.times[i] || '').trim(),
      points: Number(S.points[i]) || 0,
      origIdx: i
    }));
    const withTime = items.filter(x => x.checked && x.time)
      .sort((a, b) => a.time.localeCompare(b.time));
    const top3 = withTime.slice(0, 3);
    const top3Names = new Set(top3.map(x => x.name));
    const checked = withTime.slice(3);
    const unchecked = items.filter(x => !x.checked).sort((a, b) => a.origIdx - b.origIdx);
    return {
      items: [...top3, ...checked, ...unchecked],
      top3Names, top3,
      checkedCount: withTime.length,
      uncheckedCount: unchecked.length
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
    if (barEl) barEl.style.width = pct + '%';

    if (!total){
      list.innerHTML = '<div class="clv4-empty">🐱 Chưa có ai trong danh sách</div>';
      return;
    }

    const sorted = sortData();
    const ICONS = ['🥇','🥈','🥉'];
    const frag = document.createDocumentFragment();
    let lastSection = null;

    sorted.items.forEach((item, idx) => {
      let section = idx < sorted.top3.length ? 'top3' : (item.checked ? 'checked' : 'unchecked');
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
      const rankIdx = sorted.top3Names.has(name) ? sorted.top3.findIndex(x => x.name === name) : undefined;

      const card = document.createElement('div');
      card.className = 'clv4-card';
      if (checked) card.classList.add('checked');
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2) card.classList.add('top' + (rankIdx + 1));

      const rankEl = document.createElement('div');
      rankEl.className = 'clv4-rank';
      if (rankIdx !== undefined && rankIdx >= 0 && rankIdx <= 2) rankEl.textContent = ICONS[rankIdx];
      else { rankEl.classList.add('empty'); rankEl.textContent = String(item.origIdx + 1); }

      const av = document.createElement('div');
      av.className = 'clv4-av';
      const u = avatarUrl(name);
      if (u){
        const img = document.createElement('img');
        img.src = u; img.loading = 'lazy';
        img.onerror = () => { img.remove(); av.textContent = getInitial(name); };
        av.appendChild(img);
      } else av.textContent = getInitial(name);

      const info = document.createElement('div');
      info.className = 'clv4-info';
      const nm = document.createElement('div');
      nm.className = 'clv4-name';
      nm.textContent = name;
      const sub = document.createElement('div');
      sub.className = 'clv4-sub';

      if (checked && time){
        const ago = timeAgo(time);
        const isRecent = ago === 'vừa xong' || /\d+ phút trước/.test(ago);
        const tEl = document.createElement('span');
        tEl.className = 'clv4-time';
        tEl.style.color = isRecent ? '#4fa370' : '';
        tEl.textContent = '🕐 ' + time;
        sub.appendChild(tEl);
        if (points > 0){
          const d = document.createElement('span');
          d.className = 'clv4-dot';
          const p = document.createElement('span');
          p.className = 'clv4-pts' + (points >= 20 ? ' early' : '');
          p.textContent = '⭐ ' + points + 'đ';
          sub.appendChild(d);
          sub.appendChild(p);
        }
      } else {
        const idle = document.createElement('span');
        idle.textContent = 'Chưa check hôm nay';
        idle.style.color = '#a8bdb0';
        sub.appendChild(idle);
      }
      info.appendChild(nm);
      info.appendChild(sub);

      const st = document.createElement('div');
      st.className = 'clv4-status';
      if (checked) st.textContent = '✅';
      else { st.classList.add('idle'); st.textContent = '○'; }

      card.appendChild(rankEl);
      card.appendChild(av);
      card.appendChild(info);
      card.appendChild(st);
      frag.appendChild(card);
    });

    list.innerHTML = '';
    list.appendChild(frag);
  }

  /* ============ DATA ============ */
  async function fetchData(){
    const api = getApi();
    if (!api) return null;
    try {
      const r = await api('getData', { _ts: Date.now() }, 15000);
      if (!r || !r.ok) return null;
      return r.data;
    } catch(e){ return null; }
  }

  function applyState(data){
    if (!data || !Array.isArray(data.names)) return false;
    S.names = data.names.slice();
    S.checks = Array.isArray(data.checks) ? data.checks.slice() : [];
    S.times = Array.isArray(data.times) ? data.times.slice() : [];
    S.points = Array.isArray(data.points) ? data.points.slice() : [];
    S.ranks = Array.isArray(data.ranks) ? data.ranks.slice() : [];
    return true;
  }

  async function refresh(){
    if (S.loading) return;
    S.loading = true;
    try {
      const data = await fetchData();
      if (data && applyState(data)) render();
    } finally { S.loading = false; }
  }

  async function forceRefresh(){
    const data = await fetchData();
    if (!data) return;
    applyState(data);
    render();
  }

  /* ============ CAPTURE — có alert lỗi ============ */
  async function onCapture(){
    const btn = $('clv4Capture');
    const oldLabel = btn ? btn.textContent : '';
    if (btn){ btn.disabled = true; btn.textContent = '⏳...'; }

    let clone = null;
    try {
      const h2c = await loadHtml2Canvas();
      if (typeof h2c !== 'function'){
        alert('❌ Không tải được thư viện chụp ảnh.\n\nNguyên nhân:\n• Mạng yếu\n• Adblock chặn CDN\n\nThử tắt chặn quảng cáo rồi bấm lại.');
        return;
      }

      const root = $(ROOT_ID);
      if (!root){ alert('❌ Không tìm thấy checklist'); return; }

      clone = root.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      Object.assign(clone.style, {
        position: 'fixed', left: '-100000px', top: '0',
        width: root.offsetWidth + 'px',
        maxHeight: 'none', height: 'auto',
        transform: 'none', overflow: 'visible',
        pointerEvents: 'none', zIndex: '-1',
        background: '#f5fbf5'
      });

      const lc = clone.querySelector('.clv4-list');
      if (lc){ lc.style.maxHeight = 'none'; lc.style.overflow = 'visible'; }
      clone.querySelector('.clv4-actions')?.remove();
      clone.querySelector('.clv4-debug')?.remove();

      document.body.appendChild(clone);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await h2c(clone, {
        backgroundColor: '#f5fbf5',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: clone.offsetWidth,
        height: clone.scrollHeight,
        windowWidth: clone.offsetWidth,
        windowHeight: clone.scrollHeight,
      });

      const blob = await new Promise((res, rej) => {
        canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png', 1);
      });

      const url = URL.createObjectURL(blob);
      const filename = 'checklist-' + new Date().toISOString().slice(0,10) + '.png';
      showPreview(url, filename);

    } catch(e){
      console.error('[CL4] capture error:', e);
      alert('❌ Chụp thất bại:\n\n' + (e.message || e) + '\n\nBấm nút 🐛 để xem chi tiết.');
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      if (btn){ btn.disabled = false; btn.textContent = oldLabel || '📸 Chụp'; }
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

    window.__clV4 = {
      refresh, forceRefresh, render, state: S,
      capture: onCapture,
      debug: runDebug,
      loadH2C: loadHtml2Canvas,
    };
    console.log('[CL4] v4.3 ready');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }
})();