/* =========================================================
   COURT FIGHT — v3.2 (infinite loop)
   ---------------------------------------------------------
   v3.2 thay đổi:
     - Fix toạ độ bàn tay: dùng flyDir theo dx (vị trí thật)
     - Bỏ scaleX(-1) cho top 2
     - Loop VÔ HẠN (bỏ MAX_RUNS)
     - Bỏ localStorage count
     - Giữ khoảng nghỉ 30s giữa mỗi lần
     - Guard: _running + _lastTrigger

   Timeline (~2.9s):
     0.00 → 0.55s  🖐️ bay Vua → Top 2
     0.55 → 0.77s  Top 2 rung nhẹ
     0.77 → 1.07s  Top 2 bay ra (theo hướng thật)
     1.07 → 1.62s  🖐️ bay Vua → Top 3
     1.62 → 1.84s  Top 3 rung nhẹ
     1.84 → 2.14s  Top 3 bay ra
     2.14 → 2.49s  Chờ
     2.49 → 2.87s  Cả 2 bay về
   ========================================================= */
(function(){
  "use strict";
  if (window.__courtFightLoaded) return;
  window.__courtFightLoaded = true;

  const LOOP_MS = 8000;   // nghỉ 30s giữa mỗi lần
  const POLL_MS = 1500;

  /* ── Timing (ms) ── */
  const T_HAND_FLY   = 550;
  const T_SHAKE      = 220;
  const T_FLY_OUT    = 300;
  const T_HOLD       = 350;
  const T_FLY_BACK   = 380;

  /* ── Khoảng cách / góc ── */
  const FLY_DIST = 45;
  const FLY_UP   = 12;
  const FLY_ROT  = 8;

  let _lastTrigger = 0;
  let _running = false;
  let _runCount = 0;

  /* ---------- helpers ---------- */
  function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }
  function raf2() {
    return new Promise(function(r){
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){ r(); });
      });
    });
  }
  function animateDone(el, kf, opt) {
    return new Promise(function(resolve){
      try {
        const a = el.animate(kf, opt);
        if (a && a.finished) a.finished.then(resolve).catch(resolve);
        else setTimeout(resolve, (opt && opt.duration) || 300);
      } catch(_) {
        setTimeout(resolve, (opt && opt.duration) || 300);
      }
    });
  }

  /* ---------- CSS ---------- */
  function injectCSS() {
    if (document.getElementById('courtFightStyles')) return;
    const s = document.createElement('style');
    s.id = 'courtFightStyles';
    s.textContent = `
      #question .court-advisors .advisor {
        position: relative !important;
        will-change: transform;
      }
      .cf-hand {
        position: fixed !important;
        left: 0;
        top: 0;
        font-size: 30px;
        line-height: 1;
        pointer-events: none;
        opacity: 0;
        z-index: 2;
        will-change: transform, opacity;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,.3));
        transform-origin: 0 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .cf-hand { display: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------- DOM ---------- */
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
  function absCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------- fight 1 advisor ---------- */
  async function fightOne(tCenterAbs, adv) {
    const avatarEl = adv.querySelector('.advisor-avatar') || adv;
    const aCenter = absCenter(avatarEl);
    const dx = aCenter.x - tCenterAbs.x;
    const dy = aCenter.y - tCenterAbs.y;

    /* Hướng bay: theo vị trí THỰC của đích */
    const flyDir = dx >= 0 ? 1 : -1;

    /* ── Tạo hand: xuất phát từ tâm Vua, offset nhẹ về cùng phía đích ── */
    const hand = document.createElement('div');
    hand.className = 'cf-hand';
    hand.textContent = '🖐️';
    hand.style.left = (tCenterAbs.x + flyDir * 8) + 'px';
    hand.style.top  = tCenterAbs.y + 'px';
    document.body.appendChild(hand);

    /* 2 tay cùng hướng — KHÔNG flip scaleX */
    const baseTf = 'translate(-50%, -50%)';

    /* ── Bay tới tâm advisor — fade in/out nhanh để không đè UI khác ── */
    await animateDone(hand, [
      { transform: baseTf + ' translate(0,0) scale(0.5)',              opacity: 0 },
      { transform: baseTf + ' translate(0,0) scale(1)',                opacity: 0.9, offset: 0.08 },
      { transform: baseTf + ` translate(${dx*0.35}px,${dy*0.35}px) scale(1.1)`, opacity: 0.95, offset: 0.35 },
      { transform: baseTf + ` translate(${dx*0.75}px,${dy*0.75}px) scale(1.15)`, opacity: 0.95, offset: 0.7 },
      { transform: baseTf + ` translate(${dx}px,${dy}px) scale(1.15)`, opacity: 1, offset: 0.88 },
      { transform: baseTf + ` translate(${dx}px,${dy}px) scale(0.9)`,  opacity: 0 }
    ], { duration: T_HAND_FLY, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });

    hand.remove();

    /* ── Rung nhẹ ── */
    await animateDone(adv, [
      { transform: 'translate(0,0)',                  offset: 0    },
      { transform: `translate(${flyDir*4}px,0)`,     offset: 0.15 },
      { transform: `translate(${flyDir*-4}px,0)`,    offset: 0.30 },
      { transform: `translate(${flyDir*4}px,0)`,     offset: 0.45 },
      { transform: `translate(${flyDir*-4}px,0)`,    offset: 0.60 },
      { transform: `translate(${flyDir*3}px,0)`,     offset: 0.75 },
      { transform: 'translate(0,0)' }
    ], { duration: T_SHAKE, easing: 'ease-out' });

    /* ── Bay ra theo hướng thật ── */
    adv.style.transition = `transform ${T_FLY_OUT}ms cubic-bezier(.3, 0, .4, 1)`;
    adv.style.transform  = `translate(${flyDir * FLY_DIST}px, -${FLY_UP}px) rotate(${flyDir * FLY_ROT}deg)`;
    await sleep(T_FLY_OUT);
  }

  /* ---------- fight all (sequential) ---------- */
  async function doFight() {
    const court  = findCourt();
    const throne = findThrone();
    if (!court || !throne || !hasAdvisors(court)) return false;

    /* Đợi 2 frame cho layout stable */
    await raf2();

    const tCenterAbs = absCenter(throne);

    /* Sort: rank-2 trước, rank-3 sau */
    const advisors = Array.from(court.querySelectorAll('.advisor')).sort(function(a, b) {
      const aR = a.classList.contains('rank-2') ? 2 : (a.classList.contains('rank-3') ? 3 : 99);
      const bR = b.classList.contains('rank-2') ? 2 : (b.classList.contains('rank-3') ? 3 : 99);
      return aR - bR;
    });

    /* Đánh tuần tự */
    for (let i = 0; i < advisors.length; i++) {
      await raf2();
      await fightOne(tCenterAbs, advisors[i]);
    }

    /* Chờ 1 nhịp */
    await sleep(T_HOLD);

    /* Bay về cùng lúc */
    advisors.forEach(function(adv){
      adv.style.transition = `transform ${T_FLY_BACK}ms cubic-bezier(.4, 0, .2, 1)`;
      adv.style.transform  = 'translate(0,0) rotate(0deg)';
    });
    await sleep(T_FLY_BACK);

    /* Cleanup */
    advisors.forEach(function(adv){
      adv.style.transition = '';
      adv.style.transform  = '';
    });
    return true;
  }

  /* ---------- trigger ---------- */
  function tryTrigger() {
    if (_running) return false;

    const now = Date.now();
    if (_lastTrigger > 0 && now - _lastTrigger < LOOP_MS) return false;

    const court = findCourt();
    if (!court || !hasAdvisors(court)) return false;

    _running = true;
    _lastTrigger = now;
    _runCount++;
    console.log('[CourtFight] run #' + _runCount);

    doFight()
      .catch(function(e){
        console.warn('[CourtFight] error', e);
      })
      .finally(function(){
        _running = false;
      });

    return true;
  }

  /* ---------- polling ---------- */
  function startPolling() {
    setInterval(tryTrigger, POLL_MS);
    setTimeout(tryTrigger, 2000);
  }

  /* ---------- boot ---------- */
  function boot() {
    injectCSS();
    startPolling();
    console.log('[CourtFight] v3.2 ready ✓ (loop vô hạn, nghỉ 30s/lần)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();