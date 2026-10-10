/* =========================================================
   COURT FIGHT — v3.1 (fix position + kill loop)
   ---------------------------------------------------------
   FIX v3.1:
     - Hand dùng position: fixed → toạ độ tuyệt đối, không lệch
     - Đợi 2 rAF trước khi đo toạ độ → layout stable
     - Bỏ MutationObserver → setInterval 1.5s
     - Guard 4 lớp: _running + _lastTrigger + count + clearInterval
     - Storage key đổi sang v2 để reset count về 0 khi upgrade
   ========================================================= */
(function(){
  "use strict";
  if (window.__courtFightLoaded) return;
  window.__courtFightLoaded = true;

  const STORAGE_KEY = 'srank_court_fight_count_v2';
  const MAX_RUNS = 5;
  const LOOP_MS = 30000;
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

  /* ---------- counter ---------- */
  function getCount() {
    try { return Math.max(0, parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0); }
    catch(_) { return 0; }
  }
  function setCount(n) { try { localStorage.setItem(STORAGE_KEY, String(n)); } catch(_) {} }

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
        font-size: 34px;
        line-height: 1;
        pointer-events: none;
        opacity: 0;
        z-index: 99999;
        will-change: transform, opacity;
        filter: drop-shadow(0 4px 10px rgba(0,0,0,.35));
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
  /* Toạ độ tuyệt đối trên viewport */
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
    const isRank3 = adv.classList.contains('rank-3');
    const dir = isRank3 ? 1 : -1;

    /* ── Tạo hand tại tâm Vua (position: fixed, toạ độ tuyệt đối) ── */
    const hand = document.createElement('div');
    hand.className = 'cf-hand';
    hand.textContent = '🖐️';
    // Đặt hand với transform-origin: 0 0, left/top = tâm Vua
    // Sau đó translate(-50%, -50%) để tâm hand tại điểm đó
    hand.style.left = tCenterAbs.x + 'px';
    hand.style.top  = tCenterAbs.y + 'px';
    document.body.appendChild(hand);

    const baseTf = isRank3
      ? 'translate(-50%, -50%)'
      : 'translate(-50%, -50%) scaleX(-1)';

    /* ── Bay tới tâm advisor ── */
    await animateDone(hand, [
      { transform: baseTf + ' translate(0,0) scale(0.5)',              opacity: 0 },
      { transform: baseTf + ' translate(0,0) scale(1)',                opacity: 1, offset: 0.15 },
      { transform: baseTf + ` translate(${dx}px,${dy}px) scale(1.15)`, opacity: 1, offset: 0.9 },
      { transform: baseTf + ` translate(${dx}px,${dy}px) scale(0.9)`,  opacity: 0 }
    ], { duration: T_HAND_FLY, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });

    hand.remove();

    /* ── Rung nhẹ ── */
    await animateDone(adv, [
      { transform: 'translate(0,0)',            offset: 0    },
      { transform: `translate(${dir*4}px,0)`,   offset: 0.15 },
      { transform: `translate(${dir*-4}px,0)`,  offset: 0.30 },
      { transform: `translate(${dir*4}px,0)`,   offset: 0.45 },
      { transform: `translate(${dir*-4}px,0)`,  offset: 0.60 },
      { transform: `translate(${dir*3}px,0)`,   offset: 0.75 },
      { transform: 'translate(0,0)' }
    ], { duration: T_SHAKE, easing: 'ease-out' });

    /* ── Bay ra + nghiêng nhẹ ── */
    adv.style.transition = `transform ${T_FLY_OUT}ms cubic-bezier(.3, 0, .4, 1)`;
    adv.style.transform  = `translate(${dir * FLY_DIST}px, -${FLY_UP}px) rotate(${dir * FLY_ROT}deg)`;
    await sleep(T_FLY_OUT);
  }

  /* ---------- fight all (sequential) ---------- */
  async function doFight() {
    const court  = findCourt();
    const throne = findThrone();
    if (!court || !throne || !hasAdvisors(court)) return false;

    /* Đợi 2 frame cho layout stable */
    await raf2();

    /* Đo lại toạ độ SAU khi layout stable */
    const tCenterAbs = absCenter(throne);

    /* Sort: rank-2 trước, rank-3 sau */
    const advisors = Array.from(court.querySelectorAll('.advisor')).sort(function(a, b) {
      const aR = a.classList.contains('rank-2') ? 2 : 3;
      const bR = b.classList.contains('rank-2') ? 2 : 3;
      return aR - bR;
    });

    /* Đánh tuần tự */
    for (let i = 0; i < advisors.length; i++) {
      /* Đợi 1 frame giữa mỗi advisor để layout ổn định */
      await raf2();
      await fightOne(tCenterAbs, advisors[i]);
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
    return true;
  }

  /* ---------- trigger với 4 lớp guard ---------- */
  function tryTrigger() {
    /* Lớp 1: đang chạy → bỏ qua */
    if (_running) return false;

    /* Lớp 2: đã đủ số lần */
    const used = getCount();
    if (used >= MAX_RUNS) return false;

    /* Lớp 3: chưa đủ 30s kể từ lần trước */
    const now = Date.now();
    if (_lastTrigger > 0 && now - _lastTrigger < LOOP_MS) return false;

    /* Lớp 4: DOM chưa sẵn sàng */
    const court = findCourt();
    if (!court || !hasAdvisors(court)) return false;

    /* Set flag NGAY LẬP TỨC để chặn concurrent call */
    _running = true;
    _lastTrigger = now;
    const newCount = used + 1;
    setCount(newCount);
    console.log('[CourtFight] run', newCount, '/', MAX_RUNS);

    doFight()
      .then(function(ok){
        if (!ok) {
          /* Nếu fail (không có advisor) → trả lại count */
          setCount(used);
          _lastTrigger = 0;
        }
      })
      .catch(function(e){
        console.warn('[CourtFight] error', e);
        setCount(used);
        _lastTrigger = 0;
      })
      .finally(function(){
        _running = false;
      });

    return true;
  }

  /* ---------- polling ---------- */
  function startPolling() {
    const timer = setInterval(function(){
      /* Nếu hết lượt → clear interval */
      if (getCount() >= MAX_RUNS) {
        clearInterval(timer);
        console.log('[CourtFight] đã chạy đủ', MAX_RUNS, 'lần, dừng polling');
        return;
      }
      tryTrigger();
    }, POLL_MS);

    /* Thử trigger lần đầu sau 2s */
    setTimeout(tryTrigger, 2000);
  }

  /* ---------- boot ---------- */
  function boot() {
    const used = getCount();
    if (used >= MAX_RUNS) {
      console.log('[CourtFight] đã chạy đủ', MAX_RUNS, 'lần, không chạy nữa');
      return;
    }
    injectCSS();
    startPolling();
    console.log('[CourtFight] v3.1 ready ✓ (đã chạy', used, '/', MAX_RUNS, ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();