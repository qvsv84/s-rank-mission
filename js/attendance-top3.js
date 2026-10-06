/* =========================================================
   ATTENDANCE TOP3 — 🥇🥈🥉 cho top 3 check sớm nhất
   Load SAU attendance.js
   ========================================================= */
(function(){
  "use strict";
  if (window.__attendanceTop3Loaded) return;
  window.__attendanceTop3Loaded = true;

  const CACHE = {};
  const MEDALS = { "1": "🥇", "2": "🥈", "3": "🥉" };

  function getApi() {
    if (window.__srankApi) return window.__srankApi;
    if (window.SRank && window.SRank.api) return window.SRank.api;
    return null;
  }

  function getSelectedName() {
    const btn = document.getElementById('attendanceEmployeeWheelBtn');
    if (!btn) return '';
    const v = btn.querySelector('.wheel-value');
    return v ? String(v.textContent || '').trim() : '';
  }

  function getCurrentMonth() {
    const lbl = document.getElementById('attendanceMonthLabel');
    if (!lbl) return 0;
    const m = String(lbl.textContent || '').match(/\d+/);
    return m ? Number(m[0]) : 0;
  }

  async function fetchTop3(month) {
    if (CACHE[month]) return CACHE[month];
    const api = getApi();
    if (!api) return null;
    try {
      const r = await api('getAttendance', { month: month }, 12000);
      if (!r || !r.ok || !r.data || !Array.isArray(r.data.employees)) return null;
      const map = {};
      r.data.employees.forEach(function(e) {
        if (e.top3Ranks && Object.keys(e.top3Ranks).length) {
          map[e.name] = e.top3Ranks;
        }
      });
      CACHE[month] = map;
      return map;
    } catch (_) { return null; }
  }

  function clearBadges() {
    document.querySelectorAll('.att-top3-badge').forEach(function(b) { b.remove(); });
    document.querySelectorAll('.att-day').forEach(function(d) {
      d.classList.remove('att-top3', 'att-top1', 'att-top2', 'att-top3rd');
    });
  }

  async function patch() {
    const grid = document.getElementById('attendanceGrid');
    if (!grid) return;
    const name = getSelectedName();
    const month = getCurrentMonth();
    if (!name || !month) return;

    const map = await fetchTop3(month);
    if (!map) return;

    clearBadges();
    const ranks = map[name];
    if (!ranks) return;

    grid.querySelectorAll('.att-day[data-day]').forEach(function(cell) {
      const day = String(cell.dataset.day);
      const rank = ranks[day];
      if (!rank) return;
      const medal = MEDALS[String(rank)];
      if (!medal) return;

      cell.classList.add('att-top3', 'att-top' + rank);
      const badge = document.createElement('span');
      badge.className = 'att-top3-badge';
      badge.textContent = medal;
      cell.appendChild(badge);
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function() {
      scheduled = false;
      patch().catch(function(){});
    });
  }

  function injectCss() {
    if (document.getElementById('attTop3Css')) return;
    const s = document.createElement('style');
    s.id = 'attTop3Css';
    s.textContent = [
      '.att-day{position:relative}',
      '.att-day.att-top3{border-width:1.5px!important}',
      '.att-day.att-top1{border-color:#e8b84b!important;box-shadow:0 0 0 2px rgba(232,184,75,.45),0 4px 12px -4px rgba(232,184,75,.55)!important;background:linear-gradient(160deg,#fffcf0 0%,#fff5cc 100%)!important}',
      '.att-day.att-top2{border-color:#b8bec8!important;box-shadow:0 0 0 2px rgba(184,190,200,.4),0 4px 12px -4px rgba(184,190,200,.5)!important;background:linear-gradient(160deg,#fafbfc 0%,#eef1f5 100%)!important}',
      '.att-day.att-top3rd{border-color:#d99a5c!important;box-shadow:0 0 0 2px rgba(217,154,92,.4),0 4px 12px -4px rgba(217,154,92,.5)!important;background:linear-gradient(160deg,#fff8f0 0%,#fcecd8 100%)!important}',
      '.att-day.att-top3 .att-day-num{font-weight:900!important}',
      '.att-top1 .att-day-num{color:#8a5a10!important}',
      '.att-top2 .att-day-num{color:#5a6068!important}',
      '.att-top3rd .att-day-num{color:#8a5a28!important}',
      '.att-top3-badge{position:absolute;top:0;right:2px;font-size:13px;line-height:1;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(120,80,40,.35));z-index:3}'
    ].join('');
    document.head.appendChild(s);
  }

  function init() {
    injectCss();

    const grid = document.getElementById('attendanceGrid');
    if (grid) new MutationObserver(schedule).observe(grid, { childList: true, subtree: true });

    const btn = document.getElementById('attendanceEmployeeWheelBtn');
    if (btn) new MutationObserver(schedule).observe(btn, { childList: true, subtree: true, characterData: true });

    const lbl = document.getElementById('attendanceMonthLabel');
    if (lbl) new MutationObserver(schedule).observe(lbl, { childList: true, subtree: true, characterData: true });

    const page = document.getElementById('attendancePage');
    if (page) new MutationObserver(schedule).observe(page, { attributes: true, attributeFilter: ['class'] });

    setTimeout(schedule, 500);
    setTimeout(schedule, 1500);
    setTimeout(schedule, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();