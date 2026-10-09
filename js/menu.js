/* ═══════════════════════════════════════════════════════════
   MENU 3 GẠCH — Phương án B
   - Chưa login: nút hiện 🔐 (bấm → mở form login)
   - Đã login:   nút hiện 📷 (bấm → đổi avatar) + 🚪 logout
   - Fix tap/hold: ấn giữ ≠ tap, debounce toggle 350ms
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  try {
    const $ = id => document.getElementById(id);
    const btn         = $('menuToggle');
    const overlay     = $('menuOverlay');
    if (!btn || !overlay) return;

    const closeBtn    = overlay.querySelector('.menu-close');
    const loginOv     = $('loginOverlay');
    const realLogout  = $('logoutBtn');
    const realName    = $('logoutName');
    const realAvatar  = $('avatarBtn');
    const avatarInput = $('avatarFileInput');
    const menuCard    = $('menuUserCard');
    const menuNameEl  = $('menuUserName');
    const menuRoleEl  = $('menuUserRole');
    const menuAvatarEl= $('menuUserAvatar');
    const menuAvatarBtn = $('menuAvatarBtn');
    const menuLogoutBtn = $('menuLogoutBtn');
    const adminItemEl = overlay.querySelector('.menu-item[data-target="adminBtn"]');
    const STORAGE_KEY = 'menuBtnPos';
    const BUST_KEY    = 'srank_avatar_bust';
    const DEBUG       = /[?&]debug=menu/.test(location.search);
    const log         = (...a) => DEBUG && console.log('[Menu]', ...a);

    /* ───── utils ───── */
    const isImg = s => {
      if (typeof s !== 'string' || !s) return false;
      if (!/^(https?:|data:image\/|blob:)/i.test(s)) return false;
      if (/gradient\(/i.test(s)) return false;
      if (/^data:image\/svg/i.test(s)) return false;
      if (/\.svg(\?|#|$)/i.test(s)) return false;
      return true;
    };
    const strip = s => s ? String(s).replace(/^url\(["']?/, '').replace(/["']?\)$/, '').trim() : '';
    const toUrl = s => !s ? '' : /^url\(/i.test(s) ? s : `url("${s}")`;
    const clamp = (x, y) => {
      const w = btn.offsetWidth || 52, h = btn.offsetHeight || 52;
      return {
        x: Math.max(4, Math.min(x, Math.max(4, window.innerWidth  - w - 4))),
        y: Math.max(4, Math.min(y, Math.max(4, window.innerHeight - h - 4)))
      };
    };
    const applyPos = (x, y) => {
      const c = clamp(x, y);
      Object.assign(btn.style, { left: c.x + 'px', top: c.y + 'px', right: 'auto', bottom: 'auto' });
      return c;
    };
    const savePos = () => {
      const r = btn.getBoundingClientRect();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch(_){}
    };

    /* ───── restore position ───── */
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(_){}
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) applyPos(saved.x, saved.y);
      else applyPos(12, window.innerHeight - (btn.offsetHeight || 52) - 12);
    }));
    addEventListener('resize', () => { const r = btn.getBoundingClientRect(); applyPos(r.left, r.top); });
    addEventListener('orientationchange', () => setTimeout(() => {
      const r = btn.getBoundingClientRect(); applyPos(r.left, r.top);
    }, 150));

    /* ───── avatar bust ───── */
    let bust = 0;
    try { bust = parseInt(localStorage.getItem(BUST_KEY) || '0', 10) || 0; } catch(_){}

    /* ───── Supabase URL ───── */
    const getSbUrl = () => {
      const tries = [
        () => window.SRank?.config?.supabaseUrl,
        () => window.SRank?.config?.SUPABASE_URL,
        () => window.SRANK_CONFIG?.supabaseUrl,
        () => window.SRANK_CONFIG?.SUPABASE_URL,
        () => window.__sb?.supabaseUrl,
        () => window.__sb?.rest?.url,
        () => window.supabaseClient?.supabaseUrl,
        () => window.supabase?.supabaseUrl
      ];
      for (const t of tries){
        try { const v = t(); if (typeof v === 'string' && /^https?:\/\//i.test(v))
          return v.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''); } catch(_){}
      }
      return 'https://yodvujkylnvzjybvgika.supabase.co';
    };

    /* ───── auth session ───── */
    const readSession = () => {
      try {
        for (let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i);
          if (!k || !/^sb-.*-auth-token$/i.test(k)) continue;
          const v = localStorage.getItem(k);
          if (!v) continue;
          try {
            const j = JSON.parse(v);
            const u = j?.user || j?.currentSession?.user || j?.session?.user;
            if (u) return u;
          } catch(_){}
        }
      } catch(_){}
      return null;
    };
    const getUid = () => {
      try { const u = window.SRank?.Auth?.getCurrentUser?.(); if (u?.id) return u.id; } catch(_){}
      return readSession()?.id || '';
    };

    /* ───── avatar URL builder ───── */
    const buildAvatarUrl = (forceBust) => {
      const base = getSbUrl(), uid = getUid();
      if (!base || !uid) return '';
      const b = forceBust || bust;
      return `${base}/storage/v1/object/public/avatars/${encodeURIComponent(uid)}.jpg${b ? '?t=' + b : ''}`;
    };

    /* ───── role resolver ───── */
    const getRole = () => {
      const cand = [];
      try {
        const u = window.SRank?.Auth?.getCurrentUser?.() || {};
        if (u.app_metadata?.role) cand.push(u.app_metadata.role);
        if (u.user_metadata?.role) cand.push(u.user_metadata.role);
        if (u.role) cand.push(u.role);
      } catch(_){}
      try {
        const u = readSession();
        if (u){
          if (u.app_metadata?.role) cand.push(u.app_metadata.role);
          if (u.user_metadata?.role) cand.push(u.user_metadata.role);
          if (u.role) cand.push(u.role);
        }
      } catch(_){}
      try {
        for (let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i), v = localStorage.getItem(k);
          if (!k || !v) continue;
          if (/role/i.test(k) && v.length < 40 && !/[{}]/.test(v)){ cand.push(v); continue; }
          if (v[0] === '{'){
            try {
              const j = JSON.parse(v);
              const r = j.role || j.user?.role || j.user?.app_metadata?.role || j.user?.user_metadata?.role;
              if (r) cand.push(r);
            } catch(_){}
          }
        }
      } catch(_){}
      log('role candidates:', cand);
      for (const c of cand){
        const r = String(c || '').trim().toLowerCase();
        if (!r) continue;
        if (/admin|super|owner|quản.?trị|quan.?tri/.test(r))    return { label:'ADMIN',            klass:'role-admin' };
        if (/manager|leader|quản.?lý|quan.?ly|mod/.test(r))       return { label:'Quản lý',          klass:'role-manager' };
        if (/kdv|kiểm.?duyệt|kiem.?duyet|reviewer/.test(r))       return { label:'Kiểm duyệt viên',  klass:'role-kdv' };
      }
      return { label:'Thành viên', klass:'role-member' };
    };
    const applyRole = (el) => {
      if (!el) return;
      const info = getRole();
      if (el.textContent !== info.label) el.textContent = info.label;
      el.classList.remove('role-admin','role-manager','role-kdv','role-member');
      el.classList.add(info.klass);
      if (adminItemEl){
        const isAdmin = info.klass === 'role-admin';
        if (adminItemEl.hidden !== !isAdmin) adminItemEl.hidden = !isAdmin;
      }
      log('role applied:', info);
    };

    /* ───── SRank.avatar cache ───── */
    const readCache = (name) => {
      if (!name || !window.SRank?.avatar) return '';
      const c = window.SRank.avatar;
      try {
        const tryFns = [c.getCache, c.get].filter(f => typeof f === 'function');
        for (const f of tryFns){ const v = f.call(c, name); if (isImg(v)) return v; }
        const fromObj = (obj) => obj?.[name];
        for (const o of [c.cache, c.map]){ const v = fromObj(o); if (isImg(v)) return v; }
        if (typeof c[name] === 'string' && isImg(c[name])) return c[name];
      } catch(_){}
      return '';
    };

    let lastKnownUrl = '';
    const extractAvatar = () => {
      const userName = ((realName?.textContent) || '').trim();
      if (lastKnownUrl && isImg(lastKnownUrl)){ log('avatar: event →', lastKnownUrl); return toUrl(lastKnownUrl); }
      const cached = readCache(userName);
      if (cached){ log('avatar: cache →', cached); return toUrl(cached); }
      const commonKeys = ['avatarUrl','avatar_url','user_avatar_url','srank_avatar_url','meow_avatar_url'];
      try {
        for (const k of commonKeys){ const v = localStorage.getItem(k); if (isImg(v)) return toUrl(v); }
        for (let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i);
          if (!k || !/avatar/i.test(k)) continue;
          const v = localStorage.getItem(k);
          if (isImg(v)) return toUrl(v);
        }
      } catch(_){}
      const sbUrl = buildAvatarUrl();
      if (sbUrl){ log('avatar: storage →', sbUrl); return toUrl(sbUrl); }
      return '';
    };

    let currentRaw = '';
    const applyAvatar = (url) => {
      if (!menuAvatarEl) return;
      const raw = strip(url);
      if (!raw || !isImg(raw)){
        if (currentRaw){ currentRaw = ''; menuAvatarEl.style.backgroundImage = ''; menuAvatarEl.textContent = '🐱'; }
        return;
      }
      if (raw === currentRaw) return;
      currentRaw = raw;
      const img = new Image();
      img.onload  = () => { if (currentRaw !== raw) return; menuAvatarEl.style.backgroundImage = `url("${raw}")`; menuAvatarEl.textContent = ''; };
      img.onerror = () => { if (currentRaw !== raw) return; currentRaw = ''; menuAvatarEl.style.backgroundImage = ''; menuAvatarEl.textContent = '🐱'; };
      img.src = raw;
    };

    /* ───── sync user card (PHƯƠNG ÁN B) ───── */
    let syncing = false;
    const isLoggedIn = () => !!(realLogout && !realLogout.hidden);

    /* Chưa login: nút avatar biến thành 🔐 login */
    const setLoginMode = () => {
      if (menuAvatarBtn){
        menuAvatarBtn.textContent = '🔐';
        menuAvatarBtn.setAttribute('aria-label', 'Đăng nhập');
        menuAvatarBtn.dataset.mode = 'login';
        menuAvatarBtn.style.display = '';
      }
      if (menuLogoutBtn) menuLogoutBtn.style.display = 'none';
    };
    /* Đã login: nút avatar trở về 📷, hiện thêm 🚪 */
    const setUserMode = () => {
      if (menuAvatarBtn){
        menuAvatarBtn.textContent = '📷';
        menuAvatarBtn.setAttribute('aria-label', 'Đổi avatar');
        menuAvatarBtn.dataset.mode = 'avatar';
        menuAvatarBtn.style.display = '';
      }
      if (menuLogoutBtn) menuLogoutBtn.style.display = '';
    };

    const syncCard = () => {
      if (syncing || !menuCard || !menuNameEl || !menuAvatarEl) return;
      syncing = true;
      try {
        menuCard.hidden = false;

        if (!isLoggedIn()){
          /* ── Chưa login ── */
          if (menuNameEl.textContent !== 'Khách') menuNameEl.textContent = 'Khách';
          if (menuRoleEl){
            if (menuRoleEl.textContent !== 'Chưa đăng nhập') menuRoleEl.textContent = 'Chưa đăng nhập';
            menuRoleEl.classList.remove('role-admin','role-manager','role-kdv','role-member');
            menuRoleEl.classList.add('role-member');
          }
          lastKnownUrl = ''; currentRaw = '';
          if (menuAvatarEl){
            menuAvatarEl.style.backgroundImage = '';
            menuAvatarEl.textContent = '🐱';
          }
          if (adminItemEl) adminItemEl.hidden = true;
          setLoginMode();
          return;
        }

        /* ── Đã login ── */
        try { const n = ((realName?.textContent) || '').trim() || 'Thành viên';
              if (menuNameEl.textContent !== n) menuNameEl.textContent = n; } catch(_){}
        try { applyRole(menuRoleEl); } catch(e){ console.error('[Menu] role:', e); }
        try { applyAvatar(extractAvatar()); } catch(e){ console.error('[Menu] avatar:', e); }
        setUserMode();
      } finally { syncing = false; }
    };

    /* ───── event avatarUpdated ───── */
    addEventListener('avatarUpdated', (e) => {
      const d = e?.detail || {};
      if (!isImg(d.url)) return;
      lastKnownUrl = d.url;
      bust = Date.now();
      try { localStorage.setItem(BUST_KEY, String(bust)); } catch(_){}
      const cur = ((realName?.textContent) || '').trim();
      if (!d.name || !cur || d.name === cur) applyAvatar(d.url);
      if (overlay.classList.contains('open')) syncCard();
    });

    /* ───── open/close ───── */
    let syncTimer = null, syncCount = 0;
    const stopSync = () => { if (syncTimer){ clearInterval(syncTimer); syncTimer = null; } };
    const startSync = () => {
      stopSync(); syncCount = 0; syncCard();
      syncTimer = setInterval(() => { syncCard(); if (++syncCount >= 6) stopSync(); }, 300);
    };

    const stagger = () => {
      overlay.querySelectorAll('.menu-item').forEach((el, i) => {
        el.style.setProperty('--delay', (0.08 + i * 0.035).toFixed(3) + 's');
      });
    };

    const openMenu = () => {
      try { stagger(); } catch(e){ console.error('[Menu] stagger:', e); }
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
      try { startSync(); } catch(e){ console.error('[Menu] sync:', e); }
    };
    const closeMenu = () => {
      stopSync();
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    /* ───── FIX BUG TAP vs HOLD ─────
       - Tap (bấm nhả nhanh, không di chuyển) → toggle menu
       - Hold (ấn giữ > 500ms) → KHÔNG làm gì (tránh mở nhầm)
       - Drag (di chuyển) → kéo nút
       Debounce 400ms chống double-tap
    */
    let pointerId = null, startX = 0, startY = 0, startL = 0, startT = 0;
    let moved = false, holdTimer = null, wasHold = false;
    const DRAG = 8;
    const HOLD_MS = 500;
    const TOGGLE_COOLDOWN = 400;
    let _lastToggle = 0;

    const toggleMenu = () => {
      const now = Date.now();
      if (now - _lastToggle < TOGGLE_COOLDOWN){ log('toggle cooldown, bỏ qua'); return; }
      _lastToggle = now;
      overlay.classList.contains('open') ? closeMenu() : openMenu();
    };

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId;
      try { btn.setPointerCapture(pointerId); } catch(_){}
      const r = btn.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY; startL = r.left; startT = r.top;
      moved = false; wasHold = false;
      /* Bắt đầu đếm hold */
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        wasHold = true;
        log('hold detected — không toggle menu');
      }, HOLD_MS);
    });

    btn.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved){
        if (Math.hypot(dx, dy) < DRAG) return;
        moved = true;
        clearTimeout(holdTimer); /* bắt đầu drag → không phải hold */
        btn.classList.add('dragging');
      }
      applyPos(startL + dx, startT + dy);
    });

    const endPointer = (e) => {
      if (e.pointerId !== pointerId) return;
      try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch(_){}
      clearTimeout(holdTimer);
      try { btn.releasePointerCapture(pointerId); } catch(_){}
      pointerId = null;

      if (moved){
        /* Kéo → lưu vị trí */
        btn.classList.remove('dragging');
        const r = btn.getBoundingClientRect();
        applyPos(r.left, r.top); savePos();
        log('drag end, saved pos');
      } else if (!wasHold){
        /* Tap → toggle menu */
        log('tap → toggle');
        toggleMenu();
      } else {
        /* Hold → không làm gì */
        log('hold end, ignore');
      }
      moved = false; wasHold = false;
    };

    btn.addEventListener('pointerup', endPointer);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    btn.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== pointerId) return;
      clearTimeout(holdTimer);
      try { btn.releasePointerCapture(pointerId); } catch(_){}
      btn.classList.remove('dragging'); pointerId = null; moved = false; wasHold = false;
    });

    /* Chặn các event khác có thể gây logout ngoài ý muốn */
    ['mousedown','mouseup','touchstart','touchend','touchcancel','contextmenu'].forEach(evt => {
      btn.addEventListener(evt, (e) => {
        e.stopPropagation();
        if (evt !== 'contextmenu') e.preventDefault();
      }, true);
    });

    /* ───── close on ESC / outside ───── */
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeMenu();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMenu(); });

    /* ───── proxy menu items → original buttons ───── */
    overlay.querySelectorAll('.menu-item').forEach((item) => {
      item.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const real = item.dataset.target && document.getElementById(item.dataset.target);
        if (!real) return;
        if (item.animate){
          try {
            item.animate([
              { transform: 'scale(1)' },
              { transform: 'scale(1.15) rotate(-3deg)', offset: .35 },
              { transform: 'scale(1)' }
            ], { duration: 280, easing: 'ease-out' });
          } catch(_){}
        }
        closeMenu();
        requestAnimationFrame(() => setTimeout(() => { try { real.click(); } catch(_){} }, 340));
      });
    });

    /* ───── nút avatar (đổi hành vi theo mode) ───── */
    if (menuAvatarBtn){
      menuAvatarBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const mode = menuAvatarBtn.dataset.mode || 'avatar';
        if (mode === 'login'){
          /* Chưa login → mở form login */
          log('bấm 🔐 login');
          try {
            if (window.SRank?.openLogin) window.SRank.openLogin();
            else if (window.__srankOpenLogin) window.__srankOpenLogin();
            else console.warn('[Menu] Không tìm thấy hàm openLogin');
          } catch(err){ console.error('[Menu] openLogin:', err); }
          closeMenu();
          return;
        }
        /* Đã login → mở file picker */
        log('bấm 📷 avatar');
        if (realAvatar) realAvatar.click();
      });
    }

    /* ───── nút logout ───── */
    if (menuLogoutBtn){
      menuLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        log('bấm 🚪 logout');
        closeMenu();
        requestAnimationFrame(() => setTimeout(() => { try { realLogout.click(); } catch(_){} }, 340));
      });
    }

    /* ───── preview on file select ───── */
    if (avatarInput && menuAvatarEl){
      avatarInput.addEventListener('change', () => {
        const f = avatarInput.files?.[0];
        if (f && /^image\//.test(f.type)){
          const reader = new FileReader();
          reader.onload = () => {
            currentRaw = '';
            menuAvatarEl.style.backgroundImage = `url("${reader.result}")`;
            menuAvatarEl.textContent = '';
          };
          try { reader.readAsDataURL(f); } catch(_){}
        }
        [600, 1500, 2800, 4500, 7000].forEach(t => setTimeout(syncCard, t));
      });
    }

    /* ───── observers ───── */
    if (window.MutationObserver){
      const mo = new MutationObserver(() => { if (overlay.classList.contains('open')) syncCard(); });
      if (realLogout) mo.observe(realLogout, { attributes: true, attributeFilter: ['hidden','style','class'] });
      if (realName)   mo.observe(realName,   { childList: true, characterData: true, subtree: true });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && overlay.classList.contains('open')) syncCard(); });
    addEventListener('focus', () => { if (overlay.classList.contains('open')) syncCard(); });
    addEventListener('load', () => {
      syncCard();
      [500, 1500, 3000].forEach(t => setTimeout(syncCard, t));
    });

    if (DEBUG) log('init | sb =', getSbUrl(), '| uid =', getUid() || '(none)', '| role =', getRole());
  } catch (err){
    console.error('[Menu] init error:', err);
  }
})();