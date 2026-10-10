/* =========================================================
   COURT FIGHT — v3.0
   ---------------------------------------------------------
   Hiệu ứng: Vua đánh tuần tự Top 2 → Top 3

   SPEC v3.0:
     - Trigger: tự động khi landing court render
     - Loop 30s, tối đa 5 lần (localStorage)
     - Không âm thanh, KHÔNG có "hu hu"
     - Sequential: đánh Top 2 xong mới sang Top 3
     - Cả 2 advisor bay về cùng lúc sau khi đều đã ở xa
     - Bay ra ±45px, nghiêng ±8° cho tự nhiên

   Timeline (~2.9s):
     0.00 → 0.55s  🖐️ bay Vua → Top 2
     0.55 → 0.77s  Top 2 rung nhẹ
     0.77 → 1.07s  Top 2 bay ra
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

  const STORAGE_KEY = 'srank_court_fight_count_v1';
  const MAX_RUNS = 5;
  const LOOP_MS = 30000;

  /* ── Timing (ms) ── */
  const T_HAND_FLY   = 550;   // tay bay từ vua → advisor
  const T_SHAKE      = 220;   // rung nhẹ sau khi trúng
  const T_FLY_OUT    = 300;   // bay ra
  const T_HOLD       = 350;   // chờ ở xa
  const T_FLY_BACK   = 380;   // bay về

  /* ── Khoảng cách / góc ── */
  const FLY_DIST = 45;
  const FLY_UP   = 12;
  const FLY_ROT  = 8;   // độ

  let _lastTrigger = 0;

  /* ---------- counter ---------- */
  function getCount() {
    try { return Math.max(0, parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0); }
    catch(_) { return 0; }
  }
  function setCount(n) { try { localStorage.setItem(STORAGE_KEY, String(n)); } catch(_) {} }

  /* ---------- helpers ---------- */
  function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  function animateDone(el, kf, opt) {
    return new Promise(function(resolve){
      try {
        const a = el.animate(kf, opt);
        if (a && a.finished) { a.finished.then(resolve).catch(resolve); }
        else { setTimeout(resolve, (opt && opt.duration) || 300); }
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
      #question .landing-court { position: relative !important; overflow: visible !important; }
      #question .court-advisors { position: relative !important; overflow: visible !important; }
      #question .court-advisors .advisor {
        position: relative !important;
        overflow: visible !important;
        will-change: transform;
      }
      #question .court-advisors.is-fighting { z-index: 60 !important; }

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
  function centerOf(el, container) {
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - c.left,
      y: r.top + r.height / 2 - c.top
    };
  }

  /* ---------- fight 1 advisor ---------- */
  async function fightOne(court, tCenter, adv) {
    const avatarEl = adv.querySelector('.advisor-avatar') || adv;
    const aCenter = centerOf(avatarEl, court);
    const dx = aCenter.x - tCenter.x;
    const dy = aCenter.y - tCenter.y;
    const isRank3 = adv.classList.contains('rank-3');
    const dir = isRank3 ? 1 : -1;

    /* ── 1. Bàn tay bay ── */
    const hand = document.createElement('div');
    hand.className = 'cf-hand';
    hand.textContent = '🖐️';
    hand.style.left = (tCenter.x + dir * 8) + 'px';
    hand.style.top  = tCenter.y + 'px';
    if (!isRank3) hand.style.transform = 'translate(-50%, -50%) scaleX(-1)';
    court.appendChild(hand);

    const baseTf = isRank3
      ? 'translate(-50%,-50%)'
      : 'translate(-50%,-50%) scaleX(-1)';

    await animateDone(hand, [
      { transform: baseTf + ' translate(0,0) scale(0.5)',                opacity: 0 },
      { transform: baseTf + ' translate(0,0) scale(1)',                  opacity: 1, offset: 0.15 },
      { transform: baseTf + ` translate(${dx}px,${dy}px) scale(1.15)`,   opacity: 1, offset: 0.9 },
      { transform: baseTf + ` translate(${dx}px,${dy}px) scale(0.9)`,    opacity: 0 }
    ], { duration: T_HAND_FLY, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });

    hand.remove();

    /* ── 2. Rung nhẹ ── */
    await animateDone(adv, [
      { transform: 'translate(0,0)',              offset: 0    },
      { transform: `translate(${dir*4}px,0)`,     offset: 0.15 },
      { transform: `translate(${dir*-4}px,0)`,    offset: 0.30 },
      { transform: `translate(${dir*4}px,0)`,     offset: 0.45 },
      { transform: `translate(${dir*-4}px,0)`,    offset: 0.60 },
      { transform: `translate(${dir*3}px,0)`,     offset: 0.75 },
      { transform: 'translate(0,0)' }
    ], { duration: T_SHAKE, easing: 'ease-out' });

    /* ── 3. Bay ra + nghiêng nhẹ ── */
    adv.style.transition = `transform ${T_FLY_OUT}ms cubic-bezier(.3, 0, .4, 1)`;
    adv.style.transform  = `translate(${dir * FLY_DIST}px, -${FLY_UP}px) rotate(${dir * FLY_ROT}deg)`;
    await sleep(T_FLY_OUT);
  }

  /* ---------- fight all (sequential) ---------- */
  async function doFight() {
    const court  = findCourt();
    const throne = findThrone();
    if (!court || !throne || !hasAdvisors(court)) return false;
    if (court.classList.contains('is-fighting')) return false;

    court.classList.add('is-fighting');

    const tCenter = centerOf(throne, court);

    /* Sort: rank-2 đánh trước, rank-3 sau */
    const advisors = Array.from(court.querySelectorAll('.advisor')).sort(function(a, b) {
      const aR = a.classList.contains('rank-2') ? 2 : 3;
      const bR = b.classList.contains('rank-2') ? 2 : 3;
      return aR - bR;
    });

    /* Đánh tuần tự từng advisor */
    for (let i = 0; i < advisors.length; i++) {
      await fightOne(court, tCenter, advisors[i]);
    }

    /* Chờ 1 nhịp để cả 2 cùng ở xa */
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
    court.classList.remove('is-fighting');
    return true;
  }

  /* ---------- trigger ---------- */
  function tryTrigger() {
    if (getCount() >= MAX_RUNS) return false;
    const now = Date.now();
    if (now - _lastTrigger < LOOP_MS) return false;

    const court = findCourt();
    if (!court || !hasAdvisors(court)) return false;

    _lastTrigger = now;
    const newCount = getCount() + 1;
    setCount(newCount);
    doFight().catch(function(e){ console.warn('[CourtFight] error', e); });
    console.log('[CourtFight] run', newCount, '/', MAX_RUNS);
    return true;
  }

  /* ---------- observer ---------- */
  function startObserver() {
    const target = document.getElementById('question');
    if (!target) { setTimeout(startObserver, 1000); return; }

    let _debounce = null;
    const obs = new MutationObserver(function(){
      if (_debounce) clearTimeout(_debounce);
      _debounce = setTimeout(function(){
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
    console.log('[CourtFight] v3.0 ready ✓ (đã chạy', used, '/', MAX_RUNS, ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();