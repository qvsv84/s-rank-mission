/* =========================================================
   COURT FIGHT — v1.0
   ---------------------------------------------------------
   Hiệu ứng: Vua 👑 (top 1) vung bàn tay 🖐️ đánh
     → Top 2 (☀️) bay sang trái + khóc "hu hu 😭"
     → Top 3 (🌙) bay sang phải + khóc "hu hu 😭"

   SPEC:
     - Trigger: khi landing court render ra (tự động)
     - Loop: mỗi 30s
     - Điều kiện: có ít nhất 1 advisor (top 2 hoặc top 3)
     - Giới hạn: chạy tối đa 5 lần TỔNG CỘNG, sau đó tự tắt
       (đếm qua localStorage, không reset khi F5)
     - Không âm thanh — chỉ visual
     - Layout: advisor bay ra rồi quay về vị trí cũ

   Timeline (~2.8s):
     0.0 – 1.0s  : chuẩn bị (hand fade in + advisor đứng yên)
     1.0 – 1.2s  : rung lắc nhẹ (impact)
     1.2 – 1.5s  : advisor bay ra xa + khóc hiện
     1.5 – 1.9s  : ở xa, khóc bay lên
     1.9 – 2.5s  : advisor bay về
     2.5 – 2.8s  : khóc mờ dần, reset

   YÊU CẦU:
     - Load SAU js/main.js (vì cần #question đã render)
     - HTML phải có <script src="js/court-fight.js" defer></script>
   ========================================================= */
(function(){
  "use strict";
  if (window.__courtFightLoaded) return;
  window.__courtFightLoaded = true;

  const STORAGE_KEY = 'srank_court_fight_count_v1';
  const MAX_RUNS = 5;
  const LOOP_MS = 30000;
  const ANIM_MS = 2800;

  let _lastTrigger = 0;

  /* ---------- counter ---------- */
  function getCount() {
    try { return Math.max(0, parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0); }
    catch(_) { return 0; }
  }
  function setCount(n) {
    try { localStorage.setItem(STORAGE_KEY, String(n)); } catch(_) {}
  }

  /* ---------- CSS ---------- */
  function injectCSS() {
    if (document.getElementById('courtFightStyles')) return;
    const s = document.createElement('style');
    s.id = 'courtFightStyles';
    s.textContent = `
      /* Container của advisor — cần position relative để hand/cry định vị */
      #question .court-advisors { position: relative !important; z-index: 5; }
      #question .court-advisors.is-fighting { z-index: 60 !important; }
      #question .court-advisors .advisor { position: relative !important; }

      /* ── BÀN TAY 🖐️ ── */
      #question .advisor-hand {
        position: absolute;
        top: 22%;
        font-size: 36px;
        line-height: 1;
        pointer-events: none;
        opacity: 0;
        z-index: 30;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,.35));
        will-change: transform, opacity;
      }
      /* Top 2: bàn tay xuất phát bên PHẢI advisor (phía vua) → bay vào */
      #question .advisor.rank-2 .advisor-hand { right: -55px; }
      /* Top 3: bàn tay xuất phát bên TRÁI advisor (phía vua) → bay vào */
      #question .advisor.rank-3 .advisor-hand { left: -55px; }

      #question .court-advisors.is-fighting .advisor.rank-2 .advisor-hand {
        animation: courtHandRight 2.8s cubic-bezier(.4,0,.2,1) both;
      }
      #question .court-advisors.is-fighting .advisor.rank-3 .advisor-hand {
        animation: courtHandLeft 2.8s cubic-bezier(.4,0,.2,1) both;
      }

      @keyframes courtHandRight {
        0%   { opacity: 0; transform: translate(50px, 0) rotate(-45deg) scale(.4); }
        18%  { opacity: 1; transform: translate(0, 0) rotate(-15deg) scale(1); }
        32%  { opacity: 1; transform: translate(-10px, 0) rotate(20deg) scale(1.15); }
        44%  { opacity: 1; transform: translate(0, 0) rotate(-8deg) scale(1); }
        58%  { opacity: 0; transform: translate(30px, 0) rotate(-40deg) scale(.7); }
        100% { opacity: 0; transform: translate(50px, 0) rotate(-45deg) scale(.4); }
      }
      @keyframes courtHandLeft {
        0%   { opacity: 0; transform: translate(-50px, 0) rotate(45deg) scale(.4); }
        18%  { opacity: 1; transform: translate(0, 0) rotate(15deg) scale(1); }
        32%  { opacity: 1; transform: translate(10px, 0) rotate(-20deg) scale(1.15); }
        44%  { opacity: 1; transform: translate(0, 0) rotate(8deg) scale(1); }
        58%  { opacity: 0; transform: translate(-30px, 0) rotate(40deg) scale(.7); }
        100% { opacity: 0; transform: translate(-50px, 0) rotate(45deg) scale(.4); }
      }

      /* ── ADVISOR BAY ── */
      #question .court-advisors.is-fighting .advisor.rank-2 {
        animation: courtFlyLeft 2.8s cubic-bezier(.4,0,.2,1) both;
        will-change: transform;
      }
      #question .court-advisors.is-fighting .advisor.rank-3 {
        animation: courtFlyRight 2.8s cubic-bezier(.4,0,.2,1) both;
        will-change: transform;
      }

      @keyframes courtFlyLeft {
        0%, 34%   { transform: translate(0, 0) rotate(0); }
        37%       { transform: translate(-6px, 0) rotate(-4deg); }
        40%       { transform: translate(6px, 0) rotate(4deg); }
        43%       { transform: translate(-6px, 0) rotate(-4deg); }
        46%       { transform: translate(6px, 0) rotate(4deg); }
        49%       { transform: translate(-4px, 0) rotate(-2deg); }
        56%       { transform: translate(-150px, -30px) rotate(-22deg); }
        72%       { transform: translate(-150px, -30px) rotate(-22deg); }
        90%, 100% { transform: translate(0, 0) rotate(0); }
      }
      @keyframes courtFlyRight {
        0%, 34%   { transform: translate(0, 0) rotate(0); }
        37%       { transform: translate(6px, 0) rotate(4deg); }
        40%       { transform: translate(-6px, 0) rotate(-4deg); }
        43%       { transform: translate(6px, 0) rotate(4deg); }
        46%       { transform: translate(-6px, 0) rotate(-4deg); }
        49%       { transform: translate(4px, 0) rotate(2deg); }
        56%       { transform: translate(150px, -30px) rotate(22deg); }
        72%       { transform: translate(150px, -30px) rotate(22deg); }
        90%, 100% { transform: translate(0, 0) rotate(0); }
      }

      /* ── KHÓC "hu hu 😭" ── */
      #question .advisor-cry {
        position: absolute;
        top: -30px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 11px;
        font-weight: 900;
        color: #7a1a3a;
        background: #fff;
        padding: 4px 10px;
        border-radius: 12px;
        box-shadow: 0 3px 10px rgba(0,0,0,.25), 0 0 0 1.5px rgba(255,120,180,.5);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        z-index: 35;
        line-height: 1.2;
        font-family: var(--font, ui-rounded, system-ui);
      }
      #question .advisor-cry::after {
        content: '';
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #fff;
      }
      #question .court-advisors.is-fighting .advisor-cry {
        animation: courtCryFloat 2.8s ease-in-out both;
      }
      @keyframes courtCryFloat {
        0%, 42%  { opacity: 0; transform: translate(-50%, 0) scale(.7); }
        52%      { opacity: 1; transform: translate(-50%, -22px) scale(1); }
        85%      { opacity: 1; transform: translate(-50%, -60px) scale(1); }
        100%     { opacity: 0; transform: translate(-50%, -80px) scale(.85); }
      }

      @media (prefers-reduced-motion: reduce) {
        #question .court-advisors.is-fighting .advisor,
        #question .court-advisors.is-fighting .advisor-hand,
        #question .court-advisors.is-fighting .advisor-cry {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------- DOM helpers ---------- */
  function findCourt() {
    return document.querySelector('#question .landing-court .court-advisors');
  }

  function hasAdvisors(court) {
    if (!court) return false;
    return court.querySelectorAll('.advisor').length > 0;
  }

  function ensurePieces(court) {
    court.querySelectorAll('.advisor').forEach(function(adv){
      if (!adv.querySelector('.advisor-hand')) {
        const hand = document.createElement('div');
        hand.className = 'advisor-hand';
        hand.textContent = '🖐️';
        hand.setAttribute('aria-hidden', 'true');
        adv.appendChild(hand);
      }
      if (!adv.querySelector('.advisor-cry')) {
        const cry = document.createElement('div');
        cry.className = 'advisor-cry';
        cry.textContent = 'hu hu 😭';
        cry.setAttribute('aria-hidden', 'true');
        adv.appendChild(cry);
      }
    });
  }

  /* ---------- trigger ---------- */
  function tryTrigger() {
    if (getCount() >= MAX_RUNS) return false;

    const now = Date.now();
    if (now - _lastTrigger < LOOP_MS) return false;

    const court = findCourt();
    if (!court || !hasAdvisors(court)) return false;
    if (court.classList.contains('is-fighting')) return false;

    ensurePieces(court);
    court.classList.add('is-fighting');
    setTimeout(function(){
      court.classList.remove('is-fighting');
    }, ANIM_MS);

    _lastTrigger = now;
    const newCount = getCount() + 1;
    setCount(newCount);
    console.log('[CourtFight] run', newCount, '/', MAX_RUNS);
    return true;
  }

  /* ---------- observe ---------- */
  function startObserver() {
    const target = document.getElementById('question');
    if (!target) {
      setTimeout(startObserver, 1000);
      return;
    }

    let _debounce = null;
    const obs = new MutationObserver(function(){
      if (_debounce) clearTimeout(_debounce);
      _debounce = setTimeout(function(){
        _debounce = null;
        tryTrigger();
      }, 800);
    });
    obs.observe(target, { childList: true, subtree: true });

    // Lần đầu — chờ render ổn định
    setTimeout(tryTrigger, 2000);
    setTimeout(tryTrigger, 6000);

    console.log('[CourtFight] observer ready ✓');
  }

  /* ---------- boot ---------- */
  function boot() {
    const used = getCount();
    if (used >= MAX_RUNS) {
      console.log('[CourtFight] đã chạy đủ', MAX_RUNS, 'lần, không chạy nữa');
      return;
    }
    injectCSS();
    startObserver();
    console.log('[CourtFight] ready ✓ (đã chạy', used, '/', MAX_RUNS, ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();