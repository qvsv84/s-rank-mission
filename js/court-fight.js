/* =========================================================
   COURT FIGHT — v2.0
   ---------------------------------------------------------
   Hiệu ứng: Vua 👑 (top 1) vung 2 bàn tay 🖐️
     → Bay từ TÂM avatar Vua tới TÂM avatar Top 2 và Top 3
     → Trúng → Top 2/3 rung nhẹ → bay ra 2 bên khoảng ngắn
     → Kèm "hu hu 😭" bay lên

   SPEC v2.0:
     - Trigger: tự động khi landing court render
     - Loop 30s, tối đa 5 lần (localStorage, không reset khi F5)
     - Không âm thanh
     - Layout: advisor bay ra ~45px rồi về (không phá layout)

   Timeline (~2.7s):
     0.00 – 0.15s : 2 bàn tay xuất hiện tại tâm Vua
     0.15 – 0.75s : Bay tới tâm Top 2/3 (600ms)
     0.75         : Trúng → bàn tay biến mất
     0.75 – 1.15s : Top 2/3 rung nhẹ (4 lần)
     1.15 – 1.60s : Bay ra 2 bên ±45px
     1.60 – 2.10s : Ở đó (khóc bay lên)
     2.10 – 2.60s : Bay về vị trí cũ
     2.60 – 2.70s : Reset

   YÊU CẦU:
     - Load SAU js/main.js (đã render landing court)
   ========================================================= */
(function(){
  "use strict";
  if (window.__courtFightLoaded) return;
  window.__courtFightLoaded = true;

  const STORAGE_KEY = 'srank_court_fight_count_v1';
  const MAX_RUNS = 5;
  const LOOP_MS = 30000;
  const ANIM_MS = 2700;
  const HAND_FLY_MS = 700;
  const ADV_ANIM_MS = 1900;
  const FLY_DIST = 45;      // khoảng cách bay ra (px)
  const FLY_UP = 15;        // bay lên (px)

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
      /* Container cần relative + visible để hand bay không bị cắt */
      #question .landing-court { position: relative !important; overflow: visible !important; }
      #question .court-advisors { position: relative !important; overflow: visible !important; }
      #question .court-advisors .advisor { position: relative !important; overflow: visible !important; }
      #question .court-advisors.is-fighting { z-index: 60 !important; }

      /* ── BÀN TAY 🖐️ ── */
      .cf-hand {
        position: absolute;
        font-size: 34px;
        line-height: 1;
        pointer-events: none;
        opacity: 0;
        z-index: 200;
        will-change: transform, opacity;
        filter: drop-shadow(0 4px 10px rgba(0,0,0,.35));
        transform: translate(-50%, -50%);
      }

      /* ── KHÓC "hu hu 😭" ── */
      .cf-cry {
        position: absolute;
        top: -30px;
        left: 50%;
        transform: translate(-50%, 0);
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
        z-index: 210;
        line-height: 1.2;
        font-family: var(--font, ui-rounded, system-ui);
      }
      .cf-cry::after {
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

      @media (prefers-reduced-motion: reduce) {
        .cf-hand, .cf-cry { display: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------- DOM helpers ---------- */
  function findCourt() {
    return document.querySelector('#question .landing-court .court-advisors');
  }

  function findThrone() {
    return document.querySelector('#question .landing-court .throne-avatar')
        || document.querySelector('#question .landing-court .court-throne');
  }

  function hasAdvisors(court) {
    return court && court.querySelectorAll('.advisor').length > 0;
  }

  /* ---------- get center of element relative to container ---------- */
  function centerOf(el, container) {
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - c.left,
      y: r.top + r.height / 2 - c.top
    };
  }

  /* ---------- main fight ---------- */
  function doFight() {
    const court = findCourt();
    const throne = findThrone();
    if (!court || !throne || !hasAdvisors(court)) return false;
    if (court.classList.contains('is-fighting')) return false;

    court.classList.add('is-fighting');

    const tCenter = centerOf(throne, court);
    const advisors = court.querySelectorAll('.advisor');

    // Mỗi advisor có 1 bàn tay bay tới
    advisors.forEach(function(adv, idx) {
      const avatarEl = adv.querySelector('.advisor-avatar') || adv;
      const aCenter = centerOf(avatarEl, court);
      const dx = aCenter.x - tCenter.x;
      const dy = aCenter.y - tCenter.y;
      const isRank3 = adv.classList.contains('rank-3');
      const dir = isRank3 ? 1 : -1;

      // ── 1. Tạo bàn tay tại tâm Vua ──
      const hand = document.createElement('div');
      hand.className = 'cf-hand';
      hand.textContent = '🖐️';
      // Offset nhẹ 2 bên để 2 bàn tay không chồng khít lên nhau
      hand.style.left = (tCenter.x + dir * 8) + 'px';
      hand.style.top  = tCenter.y + 'px';
      // Tay trái mirror để hướng đúng
      if (!isRank3) hand.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      court.appendChild(hand);

      // ── 2. Animate bàn tay bay từ tâm Vua → tâm advisor ──
      const baseTf = isRank3 ? 'translate(-50%,-50%)' : 'translate(-50%,-50%) scaleX(-1)';
      hand.animate([
        { transform: baseTf + ' translate(0,0) scale(0.4)',              opacity: 0, offset: 0 },
        { transform: baseTf + ' translate(0,0) scale(1)',                opacity: 1, offset: 0.18 },
        { transform: baseTf + ` translate(${dx}px,${dy}px) scale(1.15)`, opacity: 1, offset: 0.85 },
        { transform: baseTf + ` translate(${dx}px,${dy}px) scale(0.85)`, opacity: 0, offset: 1 }
      ], {
        duration: HAND_FLY_MS,
        easing: 'cubic-bezier(.4, 0, .2, 1)',
        fill: 'forwards'
      });

      // ── 3. Sau khi trúng (700ms) → advisor rung + bay + khóc ──
      setTimeout(function() {
        hand.remove();

        // Advisor: rung nhẹ 4 lần (200ms) → bay ra ngắn → về
        adv.animate([
          { transform: 'translate(0, 0)',                              offset: 0.00 },
          { transform: `translate(${dir * 5}px, 0)`,                   offset: 0.04 },
          { transform: `translate(${dir * -5}px, 0)`,                  offset: 0.08 },
          { transform: `translate(${dir * 5}px, 0)`,                   offset: 0.12 },
          { transform: `translate(${dir * -5}px, 0)`,                  offset: 0.16 },
          { transform: `translate(${dir * 3}px, 0)`,                   offset: 0.20 },
          { transform: 'translate(0, 0)',                              offset: 0.24 },
          { transform: `translate(${dir * FLY_DIST}px, -${FLY_UP}px)`, offset: 0.42 },
          { transform: `translate(${dir * FLY_DIST}px, -${FLY_UP}px)`, offset: 0.72 },
          { transform: `translate(${dir * FLY_DIST * 0.5}px, -${FLY_UP * 0.5}px)`, offset: 0.86 },
          { transform: 'translate(0, 0)',                              offset: 1.00 }
        ], {
          duration: ADV_ANIM_MS,
          easing: 'ease-out',
          fill: 'forwards'
        });

        // Khóc: hiện ra + bay lên + mờ dần
        let cry = adv.querySelector('.cf-cry');
        if (!cry) {
          cry = document.createElement('div');
          cry.className = 'cf-cry';
          cry.textContent = 'hu hu 😭';
          adv.appendChild(cry);
        }
        cry.animate([
          { transform: 'translate(-50%, 0)',      opacity: 0, offset: 0.00 },
          { transform: 'translate(-50%, -12px)',  opacity: 1, offset: 0.10 },
          { transform: 'translate(-50%, -30px)',  opacity: 1, offset: 0.50 },
          { transform: 'translate(-50%, -55px)',  opacity: 1, offset: 0.80 },
          { transform: 'translate(-50%, -75px)',  opacity: 0, offset: 1.00 }
        ], {
          duration: ADV_ANIM_MS,
          easing: 'ease-in-out',
          fill: 'forwards'
        });

        // Dọn cry sau khi xong
        setTimeout(function() {
          if (cry && cry.parentNode) cry.remove();
        }, ADV_ANIM_MS + 100);

      }, HAND_FLY_MS);
    });

    // Reset class sau khi xong toàn bộ
    setTimeout(function() {
      court.classList.remove('is-fighting');
    }, ANIM_MS);

    return true;
  }

  /* ---------- trigger ---------- */
  function tryTrigger() {
    if (getCount() >= MAX_RUNS) return false;
    const now = Date.now();
    if (now - _lastTrigger < LOOP_MS) return false;

    const court = findCourt();
    if (!court || !hasAdvisors(court)) return false;

    const ok = doFight();
    if (!ok) return false;

    _lastTrigger = now;
    const newCount = getCount() + 1;
    setCount(newCount);
    console.log('[CourtFight] run', newCount, '/', MAX_RUNS);
    return true;
  }

  /* ---------- observe ---------- */
  function startObserver() {
    const target = document.getElementById('question');
    if (!target) { setTimeout(startObserver, 1000); return; }

    let _debounce = null;
    const obs = new MutationObserver(function() {
      if (_debounce) clearTimeout(_debounce);
      _debounce = setTimeout(function() {
        _debounce = null;
        tryTrigger();
      }, 800);
    });
    obs.observe(target, { childList: true, subtree: true });

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
    console.log('[CourtFight] v2.0 ready ✓ (đã chạy', used, '/', MAX_RUNS, ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();