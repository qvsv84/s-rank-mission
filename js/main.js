/* ═══════════════════════════════════════════════════════════════
   MAIN.JS — CORE v3.0.2 🐱
   - Landing + Checkin wheel + Court top3
   - Checklist logic + capture ảnh
   - Admin panel (3 tab)
   - Auto sync + reset schedule
   - Realtime listen sb:score:changed
   - Avatar cache + loadAvatarsFromSupabase
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const Store = window.Store;
  const AdminSession = window.AdminSession;
  const Toast = window.Toast;
  if (!Store || !AdminSession || !Toast) {
    console.error('[main] thiếu dependency: Store/AdminSession/Toast');
    return;
  }

  const TIMEOUT = Object.freeze({ FAST: 8000, NORMAL: 12000, SLOW: 20000, DEFAULT: 12000 });
  const CHECKLIST_LOCK_KEY = 'srank_checklist_lock_time_v1';
  const LAST_PICKED_NAME_KEY = 'srank_last_picked_name_v1';
  const CHECKLIST_SYNC_MS = 30000;
  const AUTO_SYNC_MS = 15000;
  const USER_ACTION_PAUSE_MS = 5000;
  const SELF_CHECK_IGNORE_MS = 20000;
  const SETTINGS_TTL = 300000;
  const ITEM_H = 58;

  const $ = id => document.getElementById(id);
  const els = {
    space: $('space'),
    question: $('question'),
    counter: $('counter'),
    wheelArea: $('wheelArea'),
    itemsBox: $('items'),
    confirm: $('confirm'),
    hint: $('hint'),
    message: $('message'),
    checklistPanel: $('checklistPanel'),
    checklistScroll: $('checklistScroll'),
    checklistBody: document.querySelector('#checklist tbody'),
    status: $('status'),
    syncBtn: $('syncBtn'),
    homeBtn: $('homeBtn'),
    checklistBtn: $('checklistBtn'),
    adminBtn: $('adminBtn'),
    captureBtn: $('captureBtn'),
    adminPage: $('adminPage'),
    adminPageBack: $('adminPageBack'),
    adminPageLogout: $('adminPageLogout'),
    adminChecklistSearch: $('adminChecklistSearch'),
    adminChecklistStats: $('adminChecklistStats'),
    adminStatTotal: $('adminStatTotal'),
    adminStatChecked: $('adminStatChecked'),
    adminStatUnchecked: $('adminStatUnchecked'),
    adminStatTop3: $('adminStatTop3'),
    adminTabs: [...document.querySelectorAll('.admin-tab')],
    adminViews: [...document.querySelectorAll('.admin-panel-view')],
    adminFilterBtns: [...document.querySelectorAll('.admin-filter-btn')],
    resetTimeInput: $('resetTimeInput'),
    checklistLockTimeInput: $('checklistLockTimeInput'),
    adminStatus: $('adminStatus'),
    adminSaveBtn: $('adminSaveBtn'),
    adminChecklistRows: $('adminChecklistRows')
  };

  /* ───── FALLBACK HELPERS ───── */
  const rankClient = v => (Store.rankClient ? Store.rankClient(v) : v);
  const normalizeServerRank = (value, score) => {
    if (Store.normalizeServerRank) return Store.normalizeServerRank(value, score);
    const v = String(value || '').trim().toUpperCase();
    if (['VIP', 'SSS', 'SS', 'S', 'A', 'B'].includes(v)) return v;
    const s = Number(score) || 0;
    if (s >= 340) return 'SSS';
    if (s >= 240) return 'SS';
    if (s >= 180) return 'S';
    if (s >= 100) return 'A';
    return 'B';
  };
  window.attendanceRankClient = rankClient;

  /* ───── AVATAR CACHE + LOADER ───── */
  const _avatarCache = new Map();
  window.__avatarCache = _avatarCache;

  function getAvatarUrl(name) {
    try {
      const k = String(name || '').trim();
      if (!k) return '';
      return _avatarCache.get(k) || '';
    } catch (_) { return ''; }
  }
  window.getAvatarUrl = getAvatarUrl;

  async function loadAvatarsFromSupabase() {
    try {
      const sb = window.__sb;
      if (!sb || !sb.rpc) return;
      const res = await sb.rpc('rpc_get_avatars');
      if (res.error) throw res.error;
      const d = res.data;
      if (!d || d.ok !== true) return;
      const list = Array.isArray(d.data) ? d.data : [];
      _avatarCache.clear();
      list.forEach(it => {
        if (it && it.name && it.url) {
          _avatarCache.set(String(it.name).trim(), String(it.url));
        }
      });
      console.log('[AV] loaded', list.length, 'avatars');
    } catch (e) {
      console.warn('[AV] load failed', e && e.message);
    }
  }
  window.__loadAvatarsFromSupabase = loadAvatarsFromSupabase;

  /* ───── UTILS ───── */
  const todayKey = () => Store.todayKey();
  const dayKeyOf = ts => Store.dayKeyOf(ts);
  const yesterdayKey = () => Store.yesterdayKey();
  const hhmm = () => Store.nowHHMM();
  const isValid24hTime = v => Store.isValid24hTime(v);
  const escapeHtml = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const throttleRAF = fn => {
    let scheduled = false, lastArgs;
    return (...args) => {
      lastArgs = args;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; fn(...lastArgs); });
    };
  };

  const uuid = () => {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'ck_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  };

  /* ───── WHEEL FACTORY ───── */
  function createWheel({ viewport, itemsBox, itemHeight = ITEM_H, itemClass = '', onChange }) {
    let index = 0, offset = 0, dragging = false, startY = 0, items = [];
    const raf = { id: 0 };

    function render() {
      if (!items.length) return;
      const mid = (viewport.clientHeight || 292) / 2;
      const children = itemsBox.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const y = (i - index) * itemHeight + mid + offset;
        const d = Math.abs(y - mid);
        const n = Math.min(1, d / (itemHeight * 2.3));
        el.style.top = y - itemHeight / 2 + 'px';
        el.style.transform = `scale(${1 - n * 0.28})`;
        el.style.opacity = 0.2 + (1 - n) * 0.8;
        el.style.filter = `blur(${n * 2.5}px)`;
        el.classList.toggle('selected', i === index && Math.abs(offset) < itemHeight * 0.35);
      }
    }

    function schedule() {
      if (raf.id) return;
      raf.id = requestAnimationFrame(() => { raf.id = 0; render(); });
    }

    function setItems(list) {
      items = Array.isArray(list) ? list.slice() : [];
      itemsBox.innerHTML = '';
      const frag = document.createDocumentFragment();
      items.forEach(name => {
        const el = document.createElement('div');
        el.className = 'wheel-item' + (itemClass ? ' ' + itemClass : '');
        el.textContent = name;
        frag.appendChild(el);
      });
      itemsBox.appendChild(frag);
      if (index >= items.length) index = Math.max(0, items.length - 1);
      schedule();
    }

    function setIndex(i) {
      index = Math.max(0, Math.min(items.length - 1, i));
      offset = 0;
      schedule();
    }

    function settle() {
      const steps = Math.round(-offset / itemHeight);
      if (steps !== 0) index = Math.max(0, Math.min(items.length - 1, index + steps));
      offset = 0;
      render();
      if (typeof onChange === 'function') {
        try { onChange(index, items[index]); } catch (_) {}
      }
    }

    function attach() {
      viewport.addEventListener('pointerdown', e => {
        dragging = true; startY = e.clientY; offset = 0;
        viewport.setPointerCapture?.(e.pointerId);
      });
      viewport.addEventListener('pointermove', e => {
        if (!dragging) return;
        offset = e.clientY - startY;
        if ((index === 0 && offset > 0) || (index === items.length - 1 && offset < 0)) offset *= 0.25;
        render();
      });
      const end = e => {
        if (!dragging) return;
        dragging = false; settle();
        viewport.releasePointerCapture?.(e.pointerId);
      };
      viewport.addEventListener('pointerup', end);
      viewport.addEventListener('pointercancel', end);
      viewport.addEventListener('wheel', e => {
        if (!items.length) return;
        e.preventDefault();
        if (!e.deltaY) return;
        index += e.deltaY > 0 ? 1 : -1;
        index = Math.max(0, Math.min(items.length - 1, index));
        offset = 0;
        render();
        if (typeof onChange === 'function') {
          try { onChange(index, items[index]); } catch (_) {}
        }
      }, { passive: false });
    }

    return { setItems, setIndex, getIndex: () => index, getItems: () => items, schedule, settle, attach, render };
  }
  window.createWheel = createWheel;

  /* ───── STATE ───── */
  let names = [], checked = [], times = [], points = [], ranks = [];
  let stateDay = '';
  let current = 0;
  let q1Opened = false;
  let _lastUserActionAt = 0;
  const _recentSelfChecks = new Map();
  const _pendingChecks = new Set();

  let _lastLockCheck = 0;
  let _cachedLocked = false;

  let settingsCache = null, settingsFetchedAt = 0, settingsFetchPromise = null;
  let syncInFlight = false;
  let autoSyncTimer = null, lastAutoSyncAt = 0;
  let resetTime = '00:00', resetTimer = null;
  let checklistLockTime = '21:00';
  let initialSheetLoaded = false;
  let adminUnlocked = AdminSession.isValid();

  let _realtimeDebounceTimer = null;

  const _getStateForCache = () => ({ names, checked, times, points, ranks, day: todayKey() });
  const cacheSchedule = (immediate = false) => {
    if (immediate) Store.flushSave(_getStateForCache);
    else Store.scheduleSave(_getStateForCache);
  };
  const cacheSave = cacheSchedule;
  window.addEventListener('beforeunload', () => Store.flushSave(_getStateForCache));

  function cacheLoad() {
    const x = Store.loadCache();
    if (!x) return false;
    names = x.names;
    checked = x.checked;
    times = x.times;
    points = x.points;
    ranks = x.ranks;
    stateDay = x.day;
    return true;
  }

  /* ───── SETTINGS ───── */
  async function getSettingsCached(force = false) {
    const now = Date.now();
    if (!force && settingsCache && now - settingsFetchedAt < SETTINGS_TTL) return settingsCache;
    if (settingsFetchPromise) return settingsFetchPromise;
    settingsFetchPromise = (async () => {
      try {
        const r = await window.__srankApi('getSettings', {}, TIMEOUT.FAST);
        if (!r.ok) throw new Error(r.error || 'Không tải được cài đặt');
        settingsCache = {
          resetTime: r.data.resetTime || '00:00',
          checklistLockTime: r.data.checklistLockTime || checklistLockTime
        };
        settingsFetchedAt = Date.now();
        return settingsCache;
      } finally {
        settingsFetchPromise = null;
      }
    })();
    return settingsFetchPromise;
  }

  function loadChecklistLockTime() {
    try {
      const saved = String(localStorage.getItem(CHECKLIST_LOCK_KEY) || '').trim();
      if (isValid24hTime(saved)) checklistLockTime = saved;
    } catch (_) {}
  }
  function saveChecklistLockTime(value) {
    checklistLockTime = String(value || '21:00').trim();
    try { localStorage.setItem(CHECKLIST_LOCK_KEY, checklistLockTime); } catch (_) {}
  }

  /* ───── STATUS/TOAST ───── */
  const ROUTINE_TOAST_PATTERNS = [
    /^Đã (cập nhật|đồng bộ|tải dữ liệu)/i,
    /^Đang (dùng|cập nhật|đồng bộ)/i,
    /^Máy chủ chưa xác nhận/i,
    /^Trình duyệt đang chặn/i,
    /^Đang lưu ảnh/i,
    /^Đã (mở chia sẻ|tạo ảnh)/i
  ];
  const isRoutineMessage = t => ROUTINE_TOAST_PATTERNS.some(re => re.test(t));
  const inferToastType = t => {
    if (t.includes('✓') || /thành công/i.test(t)) return 'success';
    if (t.includes('⚠') || /lỗi|thất bại/i.test(t)) return 'error';
    if (/^chưa|^không|mất kết nối|thử lại|đang chờ/i.test(t)) return 'warning';
    return 'info';
  };

  let _statusTimer = null;
  function setStatus(t) {
    const text = String(t || '').trim();
    if (els.status) {
      els.status.textContent = text;
      els.status.classList.add('show');
      clearTimeout(_statusTimer);
      _statusTimer = setTimeout(() => els.status.classList.remove('show'), 1400);
    }
    if (text && !isRoutineMessage(text)) Toast.show(text, { type: inferToastType(text) });
  }

  /* ───── RESET LOCAL STATE ───── */
  function resetLocalStateForNewDay(reason) {
    const oldDay = stateDay, newDay = todayKey();
    if (oldDay === newDay && reason !== 'force') return false;
    checked = names.map(() => false);
    times = names.map(() => '');
    stateDay = newDay;
    cacheSchedule(true);
    try { renderChecklist(true); } catch (_) {}
    try { if (typeof renderAdminChecklistEditor === 'function') renderAdminChecklistEditor(); } catch (_) {}
    try { if (typeof renderAdminStats === 'function') renderAdminStats(); } catch (_) {}
    if (!q1Opened && !els.checklistPanel.classList.contains('show')) {
      try { renderLandingState(true); } catch (_) {}
    }
    console.log('[CL] Reset local:', oldDay, '→', newDay);
    return true;
  }

  /* ───── RESET SCHEDULER ───── */
  function scheduleNextReset() {
    if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    const now = new Date();
    const [hh, mm] = String(resetTime || '00:00').split(':').map(Number);
    const next = new Date(now);
    next.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 3, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const rawDelay = next.getTime() - now.getTime();
    const delay = Math.max(1000, Math.min(rawDelay, 3600000));
    resetTimer = setTimeout(async function tick() {
      const now2 = new Date();
      const [hh2, mm2] = String(resetTime || '00:00').split(':').map(Number);
      const target = new Date(now2);
      target.setHours(Number.isFinite(hh2) ? hh2 : 0, Number.isFinite(mm2) ? mm2 : 0, 0, 0);
      if (now2.getTime() < target.getTime()) { scheduleNextReset(); return; }
      try {
        const didReset = resetLocalStateForNewDay('force');
        let serverOK = false;
        const token = AdminSession.get();
        if (token) {
          try {
            const r = await window.__srankApi('resetNow', { token }, TIMEOUT.FAST);
            serverOK = !!(r && r.ok);
          } catch (_) { serverOK = false; }
        }
        if (didReset || serverOK) setStatus('Checklist đã làm mới ✓');
        try { await loadData(false, true); } catch (_) {}
      } catch (e) {
        console.warn('[CL] reset error:', e);
        setStatus('Reset lỗi — sẽ thử lại');
      } finally {
        scheduleNextReset();
      }
    }, delay);
  }

  /* ───── CHECKLIST LOCK ───── */
  function checklistLockInfo() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
    const [lh, lm] = String(checklistLockTime || '21:00').split(':').map(Number);
    const lockMinutes = (Number.isFinite(lh) ? lh : 21) * 60 + (Number.isFinite(lm) ? lm : 0);
    return { locked: hour * 60 + minute >= lockMinutes, time: checklistLockTime };
  }
  const isChecklistLocked = () => checklistLockInfo().locked;

  /* ───── CHECKLIST RENDER ───── */
  function renderChecklistSkeleton() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><div class="skeleton skeleton-row medium"></div></td><td><div class="skeleton skeleton-row short"></div></td><td><div class="skeleton" style="width:25px;height:25px;border-radius:8px;margin:auto"></div></td>';
      frag.appendChild(tr);
    }
    els.checklistBody.innerHTML = '';
    els.checklistBody.appendChild(frag);
    _checklistSignature = '';
  }

  let _checklistSignature = '';
  function checklistSig() {
    return names.map((n, i) => `${n}|${checked[i] ? 1 : 0}|${times[i] || ''}`).join('::');
  }

  function renderChecklist(force = false) {
    const sig = checklistSig();
    if (!force && sig === _checklistSignature) return;
    _checklistSignature = sig;

    const rows = names.map((name, i) => ({
      name, index: i,
      checked: !!checked[i],
      time: times[i] || ''
    }));
    rows.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? -1 : 1;
      if (a.checked && b.checked) {
        const ta = a.time || '99:99', tb = b.time || '99:99';
        const c = ta.localeCompare(tb);
        if (c !== 0) return c;
      }
      return a.index - b.index;
    });

    const frag = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.index = row.index;
      tr.innerHTML = '<td class="playerName"></td><td class="checkTime"></td><td><div class="checkBox"></div></td>';
      tr.firstChild.textContent = (window.DN ? window.DN(row.name) : row.name);
      tr.querySelector('.checkTime').textContent = row.time || '—';
      if (row.checked) tr.querySelector('.checkBox').classList.add('checked');
      frag.appendChild(tr);
    });
    els.checklistBody.innerHTML = '';
    els.checklistBody.appendChild(frag);
  }

  function updateChecklistRow(index) {
    const tr = els.checklistBody.querySelector(`tr[data-index="${index}"]`);
    if (!tr) return false;
    const timeCell = tr.querySelector('.checkTime');
    const box = tr.querySelector('.checkBox');
    if (timeCell) timeCell.textContent = times[index] || '—';
    if (box) box.classList.toggle('checked', !!checked[index]);
    _checklistSignature = checklistSig();
    return true;
  }

  /* ───── SMOOTH UPDATE ───── */
  function smoothUpdateChecklist(newData) {
    if (!names.length) return false;
    if (names.length !== newData.names.length) return false;
    if (names.some((n, i) => n !== newData.names[i])) return false;

    const oldChecked = checked.slice();
    const oldTimes = times.slice();
    const oldPoints = points.slice();
    const oldRanks = ranks.slice();
    const newlyChecked = [];
    const changedIdx = [];
    const mergedChecked = newData.checked.slice();
    const mergedTimes = newData.times.slice();

    for (let i = 0; i < names.length; i++) {
      if (_pendingChecks.has(names[i])) {
        mergedChecked[i] = oldChecked[i];
        mergedTimes[i] = oldTimes[i];
      }
      const checkedChanged = oldChecked[i] !== mergedChecked[i];
      const timeChanged = String(oldTimes[i] || '') !== String(mergedTimes[i] || '');
      const pointsChanged = oldPoints[i] !== newData.points[i];
      const rankChanged = oldRanks[i] !== newData.ranks[i];
      if (checkedChanged || timeChanged || pointsChanged || rankChanged) {
        changedIdx.push(i);
        if (!oldChecked[i] && mergedChecked[i]) {
          newlyChecked.push({ name: names[i], time: mergedTimes[i] || '' });
        }
      }
    }
    if (!changedIdx.length) return true;

    checked = mergedChecked;
    times = mergedTimes;
    points = newData.points;
    ranks = newData.ranks;
    stateDay = todayKey();

    renderChecklist(true);
    changedIdx.slice(0, 5).forEach((idx, k) => {
      const tr = els.checklistBody.querySelector(`tr[data-index="${idx}"]`);
      if (!tr) return;
      tr.classList.add('row-updated');
      setTimeout(() => tr.classList.remove('row-updated'), 1200 + k * 80);
    });
    if (newlyChecked.length) notifyNewlyChecked(newlyChecked);
    return true;
  }

  /* ───── NOTIFY ───── */
  function isRecentCheckMinute(hhmmStr, maxMin) {
    const m = String(hhmmStr || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return false;
    const h = +m[1], mi = +m[2];
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const nowH = +(parts.find(p => p.type === 'hour')?.value || 0);
    const nowM = +(parts.find(p => p.type === 'minute')?.value || 0);
    let diff = nowH * 60 + nowM - (h * 60 + mi);
    if (diff < 0) diff += 1440;
    return diff <= maxMin;
  }

  function notifyNewlyChecked(list) {
    if (!Array.isArray(list) || !list.length) return;
    const now = Date.now();
    const filtered = list.filter(item => {
      const last = _recentSelfChecks.get(item.name);
      if (last && now - last < SELF_CHECK_IGNORE_MS) return false;
      return isRecentCheckMinute(item.time, 5);
    });
    if (!filtered.length) return;
    filtered.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    if (filtered.length === 1) {
      const p = filtered[0];
      Toast.show(`${p.name} vừa check lúc ${p.time || '—'}`, { type: 'person', icon: '🌸', duration: 3200 });
    } else {
      Toast.show(`${filtered[0].name} và ${filtered.length - 1} người khác vừa check`, { type: 'person', icon: '🌸', duration: 3200 });
    }
  }

  /* ───── WHEEL INSTANCE ───── */
  const mainWheel = createWheel({
    viewport: els.wheelArea.querySelector('#wheelViewport') || els.wheelArea,
    itemsBox: els.itemsBox,
    itemHeight: ITEM_H,
    onChange: () => els.confirm.classList.add('show')
  });
  mainWheel.attach();

  const origSetItems = mainWheel.setItems;
  mainWheel.setItems = list => {
    origSetItems(list);
    setTimeout(() => mainWheel.schedule(), 20);
  };
  const buildWheel = () => mainWheel.setItems(names);

  /* ───── LOAD DATA ───── */
  async function loadData(showError = true, force = false) {
    if (syncInFlight) {
      if (force) setStatus('Đang đồng bộ, vui lòng chờ...');
      return false;
    }
    if (initialSheetLoaded && !force) {
      renderChecklist();
      buildWheel();
      renderAdminChecklistEditor();
      return true;
    }

    syncInFlight = true;
    try {
      if (!names.length && cacheLoad()) {
        renderChecklist();
        buildWheel();
      } else if (!names.length && els.checklistPanel.classList.contains('show')) {
        renderChecklistSkeleton();
      }

      const r = await window.__srankApi('getData', { _ts: Date.now() }, TIMEOUT.SLOW);
      if (!r.ok) throw new Error(r.error || 'getData lỗi');

      const rawNames = Array.isArray(r.data?.names) ? r.data.names : [];
      const serverNames = rawNames.map(n => String(n ?? '').trim()).filter(n => n.length > 0 && n.length <= 100);
      const rawPoints = Array.isArray(r.data?.points) ? r.data.points : [];
      const serverPoints = serverNames.map((_, i) => {
        const p = Number(rawPoints[i]);
        return Number.isFinite(p) && p >= 0 && p <= 100000 ? p : 0;
      });
      const rawRanks = Array.isArray(r.data?.ranks) ? r.data.ranks : [];
      const serverRanks = serverNames.map((_, i) => normalizeServerRank(rawRanks[i], serverPoints[i]));
      const rawChecks = Array.isArray(r.data?.checks) ? r.data.checks : [];
      const serverChecks = serverNames.map((_, i) => rawChecks[i] === true);
      const rawTimes = Array.isArray(r.data?.times) ? r.data.times : [];
      const serverTimes = serverNames.map((_, i) => {
        const t = String(rawTimes[i] ?? '').trim();
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '';
      });

      const canSmooth = initialSheetLoaded && !force
        && els.checklistPanel.classList.contains('show')
        && names.length > 0;

      if (canSmooth) {
        const updated = smoothUpdateChecklist({
          names: serverNames, points: serverPoints,
          checked: serverChecks, times: serverTimes, ranks: serverRanks
        });
        if (updated) {
          lastAutoSyncAt = Date.now();
          window.syncAttendanceEmployees?.();
          cacheSave();
          setStatus('Đã cập nhật ✓');
          maybeRenderLanding();
          return true;
        }
      }

      let newlyChecked = [];
      if (initialSheetLoaded && names.length > 0) {
        const prevNames = names.slice();
        const prevChecked = checked.slice();
        for (let i = 0; i < Math.min(prevNames.length, serverNames.length); i++) {
          if (prevNames[i] === serverNames[i] && !prevChecked[i] && serverChecks[i]) {
            newlyChecked.push({ name: prevNames[i], time: serverTimes[i] || '' });
          }
        }
      }

      const mergedChecks = serverChecks.slice();
      const mergedTimes = serverTimes.slice();
      if (initialSheetLoaded && names.length === serverNames.length) {
        for (let i = 0; i < names.length; i++) {
          if (names[i] === serverNames[i] && _pendingChecks.has(names[i])) {
            mergedChecks[i] = checked[i] === true;
            mergedTimes[i] = times[i] || '';
          }
        }
      }

      names = serverNames;
      points = serverPoints;
      ranks = serverRanks;
      checked = mergedChecks;
      times = mergedTimes;
      stateDay = todayKey();
      initialSheetLoaded = true;
      lastAutoSyncAt = Date.now();
      window.syncAttendanceEmployees?.();
      cacheSave();
      renderChecklist(true);
      buildWheel();
      if (els.adminPage.classList.contains('show')) renderAdminChecklistEditor();
      if (els.hint) els.hint.textContent = 'Chạm vào câu hỏi';
      setStatus(force ? 'Đã cập nhật ✓' : 'Đã đồng bộ ✓');
      maybeRenderLanding();
      if (newlyChecked.length) notifyNewlyChecked(newlyChecked);
      return true;
    } catch (e) {
      if (showError && !names.length) els.hint.textContent = 'Không tải được dữ liệu';
      if (names.length) setStatus('Đang dùng dữ liệu đã lưu');
      return false;
    } finally {
      syncInFlight = false;
    }
  }

  /* ───── AUTO SYNC ───── */
  function restartAutoSync() {
    if (autoSyncTimer) { clearTimeout(autoSyncTimer); autoSyncTimer = null; }
    const interval = els.checklistPanel.classList.contains('show') ? CHECKLIST_SYNC_MS : AUTO_SYNC_MS;
    autoSyncTimer = setTimeout(async function tick() {
      const skip =
        document.hidden ||
        els.wheelArea.classList.contains('show') ||
        els.message.classList.contains('show') ||
        document.getElementById('attendancePage')?.classList.contains('show') ||
        Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS ||
        syncInFlight;
      if (!skip) {
        lastAutoSyncAt = Date.now();
        try { await loadData(false, true); } catch (_) {}
      }
      if (autoSyncTimer !== null) autoSyncTimer = setTimeout(tick, interval);
    }, interval);
  }
  const startAutoSync = restartAutoSync;

  /* ───── CHECKIN ───── */
  async function checkin(name, index) {
    if (checked[index] === true && times[index]) {
      setStatus(`Đã ghi ${times[index]} ✓`);
      return;
    }
    _lastUserActionAt = Date.now();
    _recentSelfChecks.set(name, Date.now());
    if (_recentSelfChecks.size > 100) {
      const now = Date.now();
      for (const [k, v] of _recentSelfChecks) {
        if (now - v > SELF_CHECK_IGNORE_MS * 2) _recentSelfChecks.delete(k);
      }
    }
    _pendingChecks.add(name);

    const clientTime = hhmm();
    const prevChecked = checked[index];
    const prevTime = times[index];

    times[index] = clientTime;
    checked[index] = true;
    stateDay = todayKey();
    cacheSave();
    if (!updateChecklistRow(index)) renderChecklist(true);
    if (!q1Opened && !els.checklistPanel.classList.contains('show')) renderLandingState();
    setStatus(`Đã ghi ${clientTime} ✓`);

    try {
      const r = await window.__srankApi('checkin', { name, clientTime, clientEpoch: String(Date.now()) }, TIMEOUT.NORMAL);
      if (!r.ok) throw new Error(r.error || 'Checkin thất bại');
      if (r.data && Number.isFinite(Number(r.data.points))) {
        points[index] = Number(r.data.points);
        ranks[index] = normalizeServerRank(r.data.rank, points[index]);
      }
      if (r.data && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.data.time || ''))) {
        times[index] = String(r.data.time);
      }
      _pendingChecks.delete(name);
      stateDay = todayKey();
      cacheSave();
      updateChecklistRow(index);
      setStatus(`Đã ghi ${times[index] || clientTime} ✓`);
      try {
        window.dispatchEvent(new CustomEvent('checkinDone', { detail: { name, time: times[index] || clientTime } }));
      } catch (_) {}
      try {
        localStorage.setItem('srank_last_checkin', JSON.stringify({
          name, time: times[index] || clientTime, date: todayKey()
        }));
      } catch (_) {}
    } catch (err) {
      _pendingChecks.delete(name);
      checked[index] = prevChecked;
      times[index] = prevTime;
      _recentSelfChecks.delete(name);
      cacheSave();
      if (!updateChecklistRow(index)) renderChecklist(true);
      if (!q1Opened && !els.checklistPanel.classList.contains('show')) renderLandingState();
      const msg = String(err?.message || '').trim();
      setStatus(msg ? `Không ghi được: ${msg}` : 'Không ghi được — kiểm tra mạng');
    }
  }

  /* ───── BURST ───── */
  function burst() {
    const f = document.createElement('div');
    f.className = 'flash';
    els.space.appendChild(f);
    setTimeout(() => f.remove(), 700);

    const hearts = [];
    for (let i = 0; i < 20; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      h.textContent = i % 5 === 0 ? '💗' : '♥';
      const a = Math.PI * 2 * i / 20;
      const r = 80 + Math.random() * 200;
      h.style.setProperty('--x', Math.cos(a) * r + 'px');
      h.style.setProperty('--y', Math.sin(a) * r + 'px');
      h.style.setProperty('--r', Math.random() * 120 - 60 + 'deg');
      h.style.setProperty('--s', (0.7 + Math.random() * 1.3).toFixed(2));
      h.style.setProperty('--time', (0.7 + Math.random() * 0.6).toFixed(2) + 's');
      els.space.appendChild(h);
      hearts.push(h);
    }
    setTimeout(() => { for (const h of hearts) h.remove(); }, 1600);
  }

  function showMessage(html, duration = 2200, next = null) {
    els.wheelArea.classList.remove('show');
    els.question.style.opacity = '0';
    els.hint.textContent = '';
    els.message.innerHTML = html;
    els.message.classList.remove('show');
    void els.message.offsetWidth;
    els.message.classList.add('show');
    burst();
    if (next) {
      setTimeout(() => {
        els.message.classList.remove('show');
        setTimeout(next, 220);
      }, duration);
    }
  }

  /* ───── LANDING STATE ───── */
  let _lastTop3Signature = '';
  const top3Signature = list => list.map(p => `${p.name}|${p.time}|${getAvatarUrl(p.name)}`).join('::');

  function __getCtaRender() {
    try {
      if (typeof window.__getCtaInfo === 'function') {
        const i = window.__getCtaInfo();
        if (i && i.text) return i;
      }
    } catch (_) {}
    return { text: '🔐 Đăng nhập', locked: false };
  }
  function __getKickerRender() {
    try {
      if (typeof window.__getKickerRender === 'function') {
        const r = window.__getKickerRender();
        if (r && r.version) return r;
      }
    } catch (_) {}
    return { html: null, version: 'default', text: '🐱 DAILY TEAM HUB' };
  }

  function renderLandingState(forceFullReplay = false) {
    els.question.classList.remove('hero-wheel-open');
    const locked = isChecklistLocked();
    els.question.classList.toggle('checklist-locked-home', locked);

    const checkedList = names.map((name, i) => ({
      name: String(name || '').trim(),
      time: String(times[i] || '').trim(),
      checked: !!checked[i]
    })).filter(p => p.checked && p.time && p.name).sort((a, b) => a.time.localeCompare(b.time));

    const top3 = checkedList.slice(0, 13);
    const newSig = top3Signature(top3);
    const top3Changed = newSig !== _lastTop3Signature;

    let top3HTML = '';
    if (top3.length === 0) {
      top3HTML = '<div class="landing-top3-empty">Chưa có ai check hôm nay — hãy là người đầu tiên! 🐱</div>';
    } else {
      const _av = (p, cls) => {
        const u = getAvatarUrl(p.name);
        const su = u ? u.replace(/"/g, '&quot;') : '';
        const ini = String((window.DN ? window.DN(p.name) : p.name) || '?').trim().slice(0, 1).toUpperCase();
        return u
          ? `<img src="${su}" alt="" loading="eager" decoding="async" onerror="this.style.display='none';this.nextElementSibling.classList.add('show');"><span class="${cls}-fallback">${ini}</span>`
          : `<span class="${cls}-fallback show">${ini}</span>`;
      };
      const _nm = p => String((window.DN ? window.DN(p.name) : p.name) || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      const _t1 = top3[0], _t2 = top3[1], _t3 = top3[2];
      const _court = top3.slice(3, 13);
      const _L = _court.filter((_, i) => i % 2 === 0);
      const _R = _court.filter((_, i) => i % 2 === 1);

      const _podium = `<div class="court-podium">`
        + `<div class="podium-slot podium-slot-2">${_t2 ? `<div class="advisor rank-2">${getAvatarUrl(_t2.name) ? `<div class="advisor-crown">☀️</div>` : ''}<div class="advisor-avatar">${_av(_t2, 'advisor-avatar')}</div><div class="advisor-name" title="${_nm(_t2)}">${_nm(_t2)}</div><div class="advisor-time">${_t2.time}</div></div>` : ''}</div>`
        + `<div class="podium-slot podium-slot-1">${_t1 ? `<div class="court-throne"><div class="throne-crown">👑</div><div class="throne-avatar">${_av(_t1, 'throne-avatar')}<span class="throne-medal">🥇</span></div><div class="throne-name" title="${_nm(_t1)}">${_nm(_t1)}</div><div class="throne-time">${_t1.time}</div></div>` : ''}</div>`
        + `<div class="podium-slot podium-slot-3">${_t3 ? `<div class="advisor rank-3">${getAvatarUrl(_t3.name) ? `<div class="advisor-crown">🌙</div>` : ''}<div class="advisor-avatar">${_av(_t3, 'advisor-avatar')}</div><div class="advisor-name" title="${_nm(_t3)}">${_nm(_t3)}</div><div class="advisor-time">${_t3.time}</div></div>` : ''}</div>`
        + `</div>`;

      const _cHTML = p => `<div class="courtier"><div class="courtier-avatar">${_av(p, 'courtier-avatar')}</div><div class="courtier-info"><div class="courtier-name" title="${_nm(p)}">${_nm(p)}</div><div class="courtier-time">${p.time}</div></div></div>`;
      const _ct = _court.length
        ? `<div class="court-courtiers-label"><span>✦ QUẦN THẦN ✦</span></div><div class="court-courtiers"><div class="courtiers-col">${_L.map(_cHTML).join('')}</div><div class="courtiers-col">${_R.map(_cHTML).join('')}</div></div>`
        : '';

      top3HTML = `<div class="landing-top3 landing-court">${_podium}${_ct}</div>`;
    }

    els.question.classList.toggle('landing-court-active', top3.length > 3);

    const titleEl = els.question.querySelector('.landing-title');
    const hasStructure = !!titleEl && !forceFullReplay;

    if (!hasStructure) {
      const _kr = __getKickerRender();
      const _kh = _kr.html || _kr.text;
      const _kv = _kr.version;
      els.question.classList.remove('play');

      if (locked) {
        els.question.innerHTML =
          `<span class="landing-kicker" data-kicker-version="${_kv}">${_kh}</span>`
          + `<span class="landing-title">CHECKLIST ĐẢO MÈO</span>`
          + top3HTML
          + `<span class="landing-cta locked" role="button" aria-disabled="true" tabindex="-1">Tạm khoá Checklist</span>`
          + `<span class="landing-lock-note">Sau ${checklistLockTime} sẽ khoá Checklist nha mn 🥰</span>`;
      } else {
        const _ci = __getCtaRender();
        els.question.innerHTML =
          `<span class="landing-kicker" data-kicker-version="${_kv}">${_kh}</span>`
          + `<span class="landing-title">CHECKLIST ĐẢO MÈO</span>`
          + top3HTML
          + `<span class="landing-cta${_ci.locked ? ' locked' : ''}" role="button" ${_ci.locked ? 'aria-disabled="true" tabindex="-1"' : 'tabindex="0"'}>${_ci.text}</span>`;
      }
      _lastTop3Signature = newSig;
      els.question.style.removeProperty('--top3-base');
      void els.question.offsetWidth;
      els.question.classList.add('play');
      els.question.style.opacity = '1';
      els.question.style.transform = 'scale(1)';
      els.question.style.pointerEvents = locked ? 'none' : 'auto';
      return;
    }

    if (top3Changed) {
      els.question.querySelector('.landing-top3-label')?.remove();
      els.question.querySelector('.landing-top3')?.remove();
      els.question.querySelector('.landing-top3-empty')?.remove();
      const ctaBefore = els.question.querySelector('.landing-cta');
      if (ctaBefore && top3HTML) {
        ctaBefore.insertAdjacentHTML('beforebegin', top3HTML);
        _lastTop3Signature = newSig;
        els.question.classList.remove('top3-replay');
        void els.question.offsetWidth;
        els.question.classList.add('top3-replay');
      } else return;
    }

    const cta = els.question.querySelector('.landing-cta');
    const lockNote = els.question.querySelector('.landing-lock-note');
    const kickerEl = els.question.querySelector('.landing-kicker');

    if (kickerEl) {
      const _kr = __getKickerRender();
      if (kickerEl.dataset.kickerVersion !== _kr.version) {
        if (_kr.html) kickerEl.innerHTML = _kr.html;
        else kickerEl.textContent = _kr.text;
        kickerEl.dataset.kickerVersion = _kr.version;
      }
    }

    if (locked) {
      if (cta && !cta.classList.contains('locked')) {
        cta.classList.add('locked');
        cta.setAttribute('aria-disabled', 'true');
        cta.setAttribute('tabindex', '-1');
        cta.textContent = 'Tạm khoá Checklist';
      }
      const noteTxt = `Sau ${checklistLockTime} sẽ khoá Checklist nha mn 🥰`;
      if (!lockNote) {
        const note = document.createElement('span');
        note.className = 'landing-lock-note';
        note.textContent = noteTxt;
        els.question.appendChild(note);
      } else if (lockNote.textContent !== noteTxt) {
        lockNote.textContent = noteTxt;
      }
    } else {
      const _ci2 = __getCtaRender();
      if (_ci2.locked) {
        if (cta && !cta.classList.contains('locked')) {
          cta.classList.add('locked');
          cta.setAttribute('aria-disabled', 'true');
          cta.setAttribute('tabindex', '-1');
        }
        const nTxt2 = `Sau ${checklistLockTime} sẽ khoá Checklist nha mn 🥰`;
        if (!lockNote) {
          const n = document.createElement('span');
          n.className = 'landing-lock-note';
          n.textContent = nTxt2;
          els.question.appendChild(n);
        } else if (lockNote.textContent !== nTxt2) {
          lockNote.textContent = nTxt2;
        }
      } else {
        if (cta && cta.classList.contains('locked')) {
          cta.classList.remove('locked');
          cta.removeAttribute('aria-disabled');
          cta.setAttribute('tabindex', '0');
        }
        lockNote?.remove();
      }
      if (cta && cta.textContent !== _ci2.text) cta.textContent = _ci2.text;
    }

    els.question.style.opacity = '1';
    els.question.style.transform = 'scale(1)';
    els.question.style.pointerEvents = locked ? 'none' : 'auto';
  }

  function maybeRenderLanding() {
    if (q1Opened) return;
    if (els.checklistPanel.classList.contains('show')) return;
    if (els.wheelArea.classList.contains('show')) return;
    if (els.message.classList.contains('show')) return;
    if (els.confirm.classList.contains('show')) return;
    renderLandingState();
    _lastLockCheck = Date.now();
    _cachedLocked = isChecklistLocked();
  }

  /* ───── QUESTION FLOW ───── */
  function openQuestion1(e) {
    e?.preventDefault();
    if (isChecklistLocked()) { renderLandingState(); return; }
    if (q1Opened || !names.length) return;
    q1Opened = true;
    _lastUserActionAt = Date.now();
    els.question.classList.add('hero-wheel-open');
    els.question.style.pointerEvents = 'none';
    els.question.style.opacity = '0';
    els.question.style.transform = 'scale(.8)';
    burst();
    setTimeout(() => {
      els.wheelArea.style.opacity = '1';
      els.wheelArea.style.pointerEvents = 'auto';
      els.wheelArea.classList.add('show');
      els.confirm.classList.add('show');
      try {
        const lastPicked = localStorage.getItem(LAST_PICKED_NAME_KEY);
        if (lastPicked) {
          const idx = names.indexOf(lastPicked);
          if (idx >= 0) mainWheel.setIndex(idx);
        }
      } catch (_) {}
      mainWheel.schedule();
      els.hint.textContent = 'Vuốt lên / xuống • ↑ ↓ để chọn • Enter để xác nhận';
      syncQuickTools();
    }, 180);
  }

  els.confirm.addEventListener('click', () => {
    if (isChecklistLocked()) { resetHome(); return; }
    const selected = names[mainWheel.getIndex()];
    if (!selected) return;
    try { localStorage.setItem(LAST_PICKED_NAME_KEY, selected); } catch (_) {}
    current = mainWheel.getIndex();
    showQuestion2();
  });

  function showQuestion2() {
    els.wheelArea.classList.remove('show');
    els.wheelArea.style.opacity = '0';
    els.wheelArea.style.pointerEvents = 'none';
    els.confirm.classList.remove('show');
    els.counter.textContent = 'CÂU 2';
    els.question.innerHTML = '<div class="system-question"><div class="system-question-title">HỆ THỐNG ĐẢO MÈO</div><div class="system-question-sub">Hôm nay bạn đã hoàn thành checklist chưa?</div></div>';
    els.question.style.opacity = '1';
    els.question.style.pointerEvents = 'none';
    els.question.style.transform = 'scale(1)';

    const box = document.createElement('div');
    box.id = 'q2answers';
    box.innerHTML = '<button id="doneBtn">Tôi đã hoàn thành</button><button id="laterBtn">Tôi chưa hoàn thành</button>';
    els.space.appendChild(box);
    Object.assign(box.style, {
      position: 'absolute', left: '50%', top: '64%',
      transform: 'translate(-50%,0)', zIndex: '22',
      display: 'flex', flexDirection: 'column', gap: '12px',
      width: 'min(88vw,390px)', opacity: '0', transition: 'opacity .25s'
    });
    [...box.children].forEach(b => Object.assign(b.style, {
      minHeight: '50px', padding: '10px 18px', borderRadius: '999px',
      border: '1px solid rgba(255,255,255,.25)', color: '#fff',
      fontSize: '15px', fontWeight: '700', background: 'rgba(255,255,255,.07)',
      backdropFilter: 'blur(10px)'
    }));
    box.querySelector('#doneBtn').style.background = 'linear-gradient(135deg,#ff3c91,#ff70b9)';
    requestAnimationFrame(() => box.style.opacity = '1');

    box.querySelector('#doneBtn').addEventListener('click', () => {
      const completedIndex = mainWheel.getIndex();
      const selected = names[completedIndex];
      box.remove();
      els.question.style.opacity = '0';
      els.question.style.pointerEvents = 'none';
      els.hint.textContent = '';
      els.message.classList.remove('show');
      checkin(selected, completedIndex);
      window.__clV6?.open?.();
      const row = els.checklistBody.querySelector(`tr[data-index="${completedIndex}"]`);
      if (row) setTimeout(() => row.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    });

    box.querySelector('#laterBtn').addEventListener('click', () => {
      box.remove();
      showMessage(`<div class="later-message"><span class="later-title">Không sao!</span><span class="later-name">Cố lên "${names[mainWheel.getIndex()]}" 💪</span></div>`, 0);
    });
  }

  function resetHome() {
    document.getElementById('q2answers')?.remove();
    window.__clV6?.close?.();
    restartAutoSync();
    els.message.classList.remove('show');
    els.wheelArea.classList.remove('show');
    els.wheelArea.style.opacity = '0';
    els.wheelArea.style.pointerEvents = 'none';
    els.confirm.classList.remove('show');
    syncQuickTools();
    q1Opened = false;
    els.question.classList.remove('hero-wheel-open');
    current = 0;
    mainWheel.setIndex(0);
    els.counter.textContent = 'CÂU 1';
    _lastTop3Signature = '';
    renderLandingState(true);
    els.hint.textContent = isChecklistLocked() ? '' : (names.length ? 'Chạm vào câu hỏi' : 'Đang tải dữ liệu…');
  }

  /* ───── CAPTURE CHECKLIST ───── */
  let html2canvasPromise = null;
  function ensureHtml2Canvas() {
    if (typeof html2canvas === 'function') return Promise.resolve();
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Không tải được công cụ chụp'));
      document.head.appendChild(s);
    });
    return html2canvasPromise;
  }

  function showCapturePreview(imageUrl, blob, previewTitle = '📸 Checklist đã chụp', filename = 'checklist-dao-meo.png', previewHint = 'Chrome / Cốc Cốc: bấm Lưu ảnh hoặc nhấn giữ vào ảnh để lưu.') {
    document.getElementById('capturePreview')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'capturePreview';
    overlay.innerHTML = `<div class="capturePreviewBox"><div class="capturePreviewTitle"></div><div class="capturePreviewImageWrap"><img id="capturePreviewImage" src="${imageUrl}" alt="Checklist"></div><div class="capturePreviewHint"></div><div class="capturePreviewActions"><button type="button" id="captureShareBtn">↗ Chia sẻ</button><a id="captureDownloadBtn" href="${imageUrl}" download="checklist-dao-meo.png">↓ Lưu ảnh</a><button type="button" id="captureCloseBtn">Đóng</button></div></div>`;
    overlay.querySelector('.capturePreviewTitle').textContent = previewTitle;
    overlay.querySelector('.capturePreviewHint').textContent = previewHint;
    overlay.querySelector('#captureDownloadBtn').download = filename;
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
      try { URL.revokeObjectURL(imageUrl); } catch (_) {}
    };
    overlay.querySelector('#captureCloseBtn').addEventListener('click', cleanup);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
    overlay.querySelector('#captureDownloadBtn').addEventListener('click', () => setStatus('Đang lưu ảnh…'));
    overlay.querySelector('#captureShareBtn').addEventListener('click', async () => {
      const btn = overlay.querySelector('#captureShareBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Đang mở…';
      try {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          await navigator.share({ files: [file], title: 'Checklist Đảo Mèo', text: 'Checklist nhiệm vụ' });
          setStatus('Đã mở chia sẻ ✓');
        } else {
          setStatus('Trình duyệt chưa hỗ trợ chia sẻ file. Hãy bấm Lưu ảnh.');
        }
      } catch (err) {
        if (String(err?.name || '') !== 'AbortError') {
          console.error(err);
          setStatus('Không thể mở chia sẻ');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '↗ Chia sẻ';
      }
    });
  }

  async function captureChecklist() {
    if (!els.checklistPanel.classList.contains('show')) return;
    els.captureBtn.disabled = true;
    const oldText = els.captureBtn.textContent;
    els.captureBtn.textContent = '⏳ Đang tải công cụ…';
    try { await ensureHtml2Canvas(); }
    catch (e) {
      setStatus(e.message);
      els.captureBtn.disabled = false;
      els.captureBtn.textContent = oldText;
      return;
    }
    els.captureBtn.textContent = '⏳ Đang tạo ảnh…';

    const clone = els.checklistPanel.cloneNode(true);
    clone.id = 'checklistCaptureTemp';
    clone.querySelector('#checklistActions')?.remove();
    clone.style.cssText = `position:absolute!important;left:-100000px!important;top:0!important;width:${Math.min(window.innerWidth * 0.9, 460)}px!important;max-height:none!important;height:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;background:linear-gradient(145deg,#ffffff,#f4faf3 55%,#edf6eb)!important;padding:22px!important;border-radius:26px!important;border:1px solid #cbdcc9!important;box-shadow:0 16px 45px rgba(53,91,61,.12)!important;overflow:visible!important;`;
    const scroll = clone.querySelector('#checklistScroll');
    if (scroll) {
      scroll.style.maxHeight = 'none';
      scroll.style.height = 'auto';
      scroll.style.overflow = 'visible';
    }
    document.body.appendChild(clone);

    let imageUrl = null;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(clone, {
        backgroundColor: null,
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        useCORS: true, allowTaint: false, logging: false, imageTimeout: 10000,
        width: clone.offsetWidth, height: clone.scrollHeight,
        windowWidth: clone.offsetWidth, windowHeight: clone.scrollHeight
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
      if (!blob) throw new Error('Không tạo được ảnh');
      imageUrl = URL.createObjectURL(blob);
      showCapturePreview(imageUrl, blob);
      setStatus('Đã tạo ảnh checklist ✓');
    } catch (err) {
      console.error(err);
      setStatus('Chụp checklist thất bại');
      if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
    } finally {
      clone.remove();
      els.captureBtn.disabled = false;
      els.captureBtn.textContent = oldText;
    }
  }
  els.captureBtn?.addEventListener('click', captureChecklist);

  /* ───── ADMIN PANEL ───── */
  let _adminFilter = 'all';
  let _adminSearchTerm = '';

  function renderAdminChecklistEditor() {
    if (!els.adminChecklistRows) return;
    if (!names.length) {
      els.adminChecklistRows.innerHTML = '<div class="admin-list-empty">Chưa có danh sách kiểm duyệt viên</div>';
      if (els.adminChecklistStats) els.adminChecklistStats.innerHTML = '';
      return;
    }
    const frag = document.createDocumentFragment();
    names.forEach((name, i) => {
      const isChecked = !!checked[i];
      const time = times[i] || '';
      const row = document.createElement('div');
      row.className = 'admin-row-item' + (isChecked ? ' checked' : '');
      row.dataset.name = String(name || '').toLowerCase();
      row.dataset.checked = isChecked ? '1' : '0';

      const nameEl = document.createElement('span');
      nameEl.className = 'admin-row-name';
      nameEl.textContent = (window.DN ? window.DN(name) : name) || 'Kiểm duyệt viên ' + (i + 1);

      const timeEl = document.createElement('span');
      timeEl.className = 'admin-row-time' + (time ? '' : ' empty');
      timeEl.textContent = time || '—';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-row-btn' + (isChecked ? ' checked' : '');
      btn.textContent = isChecked ? 'Bỏ check' : 'Check';
      btn.addEventListener('click', () => adminToggleCheck(i, btn));

      row.append(nameEl, timeEl, btn);
      frag.appendChild(row);
    });
    els.adminChecklistRows.innerHTML = '';
    els.adminChecklistRows.appendChild(frag);

    const checkedCount = checked.filter(Boolean).length;
    if (els.adminChecklistStats) {
      els.adminChecklistStats.innerHTML = `<span>👥 ${names.length} người</span><span>✓ ${checkedCount} đã check</span><span>○ ${names.length - checkedCount} chưa check</span>`;
    }
    applyChecklistFilter();
  }

  async function adminToggleCheck(i, btn) {
    const next = !checked[i];
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const token = AdminSession.get();
      if (!token) throw new Error('Không có quyền admin');
      const r = await window.__srankApi('adminSetCheck', {
        token, name: names[i], checked: next ? 'true' : 'false'
      }, TIMEOUT.FAST);
      if (!r.ok) throw new Error(r.error || 'Không cập nhật được');
      checked[i] = next;
      times[i] = next ? (r.data && r.data.time || hhmm()) : '';
      if (r.data && Number.isFinite(Number(r.data.points))) {
        points[i] = Number(r.data.points);
        ranks[i] = normalizeServerRank(r.data.rank, points[i]);
      }
      stateDay = todayKey();
      cacheSave();
      renderChecklist(true);
      renderAdminChecklistEditor();
      renderAdminStats();
      if (!q1Opened && !els.checklistPanel.classList.contains('show')) renderLandingState();
      setStatus(next ? 'Đã check ✓' : 'Đã bỏ check ✓');
    } catch (e) {
      const _em = (e && e.message) || 'Không cập nhật được';
      console.error('[Admin] toggle check failed:', e);
      try { Toast.show(_em, { type: 'error', duration: 4000 }); } catch (_) {}
      try {
        els.adminStatus.textContent = _em;
        els.adminStatus.classList.remove('warn');
        els.adminStatus.classList.add('error');
      } catch (_) {}
      btn.disabled = false;
      btn.textContent = checked[i] ? 'Bỏ check' : 'Check';
    }
  }

  function applyChecklistFilter() {
    if (!els.adminChecklistRows) return;
    els.adminChecklistRows.querySelectorAll('.admin-row-item').forEach(row => {
      const name = row.dataset.name || '';
      const isChecked = row.dataset.checked === '1';
      const matchSearch = !_adminSearchTerm || name.includes(_adminSearchTerm);
      const matchFilter = _adminFilter === 'all'
        || (_adminFilter === 'checked' && isChecked)
        || (_adminFilter === 'unchecked' && !isChecked);
      row.style.display = (matchSearch && matchFilter) ? '' : 'none';
    });
  }

  function renderAdminStats() {
    const total = names.length;
    const checkedCount = checked.filter(Boolean).length;
    if (els.adminStatTotal) els.adminStatTotal.textContent = String(total);
    if (els.adminStatChecked) els.adminStatChecked.textContent = String(checkedCount);
    if (els.adminStatUnchecked) els.adminStatUnchecked.textContent = String(total - checkedCount);
    if (els.adminStatTop3) {
      const top3 = names.map((name, i) => ({
        name: String(name || '').trim(),
        time: String(times[i] || '').trim(),
        checked: !!checked[i]
      })).filter(p => p.checked && p.time && p.name)
        .sort((a, b) => a.time.localeCompare(b.time))
        .slice(0, 3);
      els.adminStatTop3.innerHTML = top3.length
        ? top3.map((p, i) => `<div class="admin-row-item checked"><span class="admin-row-name">${['🥇', '🥈', '🥉'][i]} ${escapeHtml(window.DN ? window.DN(p.name) : p.name)}</span><span class="admin-row-time">${escapeHtml(p.time)}</span></div>`).join('')
        : '<div class="admin-list-empty">Chưa có ai check hôm nay</div>';
    }
  }

  function switchAdminTab(tabName) {
    els.adminTabs.forEach(t => t.classList.toggle('active', t.dataset.adminTab === tabName));
    els.adminViews.forEach(v => v.classList.toggle('active', v.dataset.adminView === tabName));
    if (tabName === 'checklist') renderAdminChecklistEditor();
    else if (tabName === 'stats') renderAdminStats();
  }

  function openAdminSettings() {
    if (!AdminSession.isValid()) { setStatus('Bạn không có quyền admin'); return; }
    adminUnlocked = true;
    syncQuickTools();
    els.adminPage.classList.add('show');
    els.adminPage.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    switchAdminTab('schedule');

    if (settingsCache) {
      els.resetTimeInput.value = settingsCache.resetTime || resetTime;
      els.checklistLockTimeInput.value = settingsCache.checklistLockTime || checklistLockTime;
      els.adminStatus.textContent = `Giờ reset: ${resetTime} • Khoá: ${checklistLockTime}`;
    } else {
      els.resetTimeInput.value = resetTime;
      els.checklistLockTimeInput.value = checklistLockTime;
      els.adminStatus.textContent = 'Đang tải cài đặt…';
    }
    els.adminStatus.classList.remove('error', 'warn');
    renderAdminChecklistEditor();
    renderAdminStats();

    getSettingsCached(false).then(s => {
      if (!s) return;
      resetTime = s.resetTime || resetTime;
      els.resetTimeInput.value = resetTime;
      if (isValid24hTime(s.checklistLockTime)) {
        checklistLockTime = s.checklistLockTime;
        saveChecklistLockTime(checklistLockTime);
      }
      els.checklistLockTimeInput.value = checklistLockTime;
      els.adminStatus.textContent = `Giờ reset: ${resetTime} • Khoá: ${checklistLockTime}`;
      els.adminStatus.classList.remove('error', 'warn');
    }).catch(() => {
      els.adminStatus.textContent = 'Không tải được cài đặt mới. Đang dùng giá trị trên máy.';
      els.adminStatus.classList.remove('error');
      els.adminStatus.classList.add('warn');
    });
  }

  const closeAdmin = () => {
    els.adminPage.classList.remove('show');
    els.adminPage.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    syncQuickTools();
  };

  /* ───── SYNC QUICK TOOLS ───── */
  function _syncQuickTools() {
    const otherOpen =
      els.checklistPanel.classList.contains('show') ||
      els.adminPage.classList.contains('show') ||
      els.wheelArea.classList.contains('show') ||
      els.message.classList.contains('show') ||
      els.confirm.classList.contains('show') ||
      document.getElementById('attendanceNameWheel')?.classList.contains('show') ||
      document.getElementById('attendancePage')?.classList.contains('show') ||
      document.getElementById('loginOverlay')?.classList.contains('show');
    document.body.classList.toggle('overlay-open', otherOpen);
  }
  const syncQuickTools = throttleRAF(_syncQuickTools);
  window.syncQuickTools = syncQuickTools;

  /* ───── EVENT LISTENERS ───── */
  els.homeBtn.addEventListener('click', () => {
    resetHome();
    syncQuickTools();
    if (syncInFlight || !initialSheetLoaded) return;
    if (Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS) return;
    if (Date.now() - lastAutoSyncAt < 3000) return;
    lastAutoSyncAt = Date.now();
    loadData(false, true);
  });

  els.syncBtn.addEventListener('click', () => {
    lastAutoSyncAt = Date.now();
    loadData(true, true);
  });

  els.adminBtn.addEventListener('click', () => {
    if (AdminSession.isValid()) openAdminSettings();
    else setStatus('Bạn không có quyền admin');
  });
  els.adminPageBack?.addEventListener('click', closeAdmin);
  els.adminPageLogout?.addEventListener('click', () => {
    if (confirm('Đăng xuất khỏi Admin?')) {
      AdminSession.clear();
      adminUnlocked = false;
      closeAdmin();
      setStatus('Đã đăng xuất admin');
    }
  });
  els.adminTabs.forEach(tab => tab.addEventListener('click', () => switchAdminTab(tab.dataset.adminTab)));
  els.adminFilterBtns.forEach(btn => btn.addEventListener('click', () => {
    els.adminFilterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _adminFilter = btn.dataset.filter;
    applyChecklistFilter();
  }));
  els.adminChecklistSearch?.addEventListener('input', e => {
    _adminSearchTerm = String(e.target.value || '').trim().toLowerCase();
    applyChecklistFilter();
  });

  els.resetTimeInput.addEventListener('input', () => {
    let v = els.resetTimeInput.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
    els.resetTimeInput.value = v;
  });
  els.checklistLockTimeInput.addEventListener('input', () => {
    let v = els.checklistLockTimeInput.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
    els.checklistLockTimeInput.value = v;
  });

  els.adminSaveBtn.addEventListener('click', async () => {
    const time = els.resetTimeInput.value.trim();
    const lockTime = els.checklistLockTimeInput.value.trim();
    if (!isValid24hTime(time) || !isValid24hTime(lockTime)) {
      els.adminStatus.textContent = 'Giờ không hợp lệ.';
      return;
    }
    els.adminSaveBtn.disabled = true;
    els.adminStatus.textContent = 'Đang lưu…';
    try {
      const token = AdminSession.get();
      if (!token) throw new Error('Không có quyền admin');
      const r = await window.__srankApi('setSettings', { token, resetTime: time, checklistLockTime: lockTime }, TIMEOUT.FAST);
      if (!r.ok) throw new Error(r.error || 'Không lưu được');
      resetTime = r.data.resetTime || time;
      checklistLockTime = r.data.checklistLockTime || lockTime;
      saveChecklistLockTime(checklistLockTime);
      els.checklistLockTimeInput.value = checklistLockTime;
      settingsCache = { resetTime, checklistLockTime };
      settingsFetchedAt = Date.now();
      scheduleNextReset();
      _lastLockCheck = 0;
      _cachedLocked = isChecklistLocked();
      renderLandingState();
      els.adminStatus.classList.remove('error', 'warn');
      els.adminStatus.textContent = `Đã lưu • Reset ${resetTime} • Khoá Checklist ${checklistLockTime}`;
    } catch (_) {
      saveChecklistLockTime(lockTime);
      els.checklistLockTimeInput.value = checklistLockTime;
      renderLandingState();
      els.adminStatus.textContent = 'Chưa lưu được lên hệ thống. Kiểm tra kết nối rồi thử lại.';
    } finally {
      els.adminSaveBtn.disabled = false;
    }
  });

  addEventListener('keydown', e => {
    if (!els.wheelArea.classList.contains('show')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mainWheel.setIndex(mainWheel.getIndex() + 1);
      els.confirm.classList.add('show');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mainWheel.setIndex(mainWheel.getIndex() - 1);
      els.confirm.classList.add('show');
    } else if (e.key === 'Enter' && els.confirm.classList.contains('show')) {
      e.preventDefault();
      els.confirm.click();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const capturePreview = document.getElementById('capturePreview');
    if (capturePreview) { capturePreview.remove(); e.preventDefault(); return; }
    if (els.checklistPanel.classList.contains('show')) { window.__clV6?.close?.(); e.preventDefault(); return; }
    if (els.adminPage.classList.contains('show')) { closeAdmin(); e.preventDefault(); return; }
    const attendanceNameWheel = document.getElementById('attendanceNameWheel');
    if (attendanceNameWheel && attendanceNameWheel.classList.contains('show')) {
      attendanceNameWheel.classList.remove('show');
      attendanceNameWheel.setAttribute('aria-hidden', 'true');
      syncQuickTools(); e.preventDefault(); return;
    }
    const attendanceStatusOverlay = document.getElementById('attendanceStatusOverlay');
    if (attendanceStatusOverlay && attendanceStatusOverlay.classList.contains('show')) {
      attendanceStatusOverlay.classList.remove('show');
      attendanceStatusOverlay.setAttribute('aria-hidden', 'true');
      e.preventDefault(); return;
    }
    const attendancePage = document.getElementById('attendancePage');
    if (attendancePage && attendancePage.classList.contains('show')) {
      if (typeof window.__closeAttendancePage === 'function') window.__closeAttendancePage();
      else attendancePage.classList.remove('show');
      syncQuickTools(); e.preventDefault(); return;
    }
    if (els.wheelArea.classList.contains('show')) { resetHome(); e.preventDefault(); return; }
  });

  function onVisible() {
    if (document.hidden) return;
    if (stateDay && stateDay !== todayKey()) {
      resetLocalStateForNewDay('visibility');
      scheduleNextReset();
    }
    _lastLockCheck = 0;
    if (syncInFlight || !initialSheetLoaded) return;
    if (els.wheelArea.classList.contains('show') || els.message.classList.contains('show')) return;
    if (Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS) return;
    if (Date.now() - lastAutoSyncAt < 3000) return;
    lastAutoSyncAt = Date.now();
    loadData(false, true);
  }
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  /* ⭐ Realtime listen — debounce 300ms */
  window.addEventListener('sb:score:changed', () => {
    if (_realtimeDebounceTimer) return;
    _realtimeDebounceTimer = setTimeout(() => {
      _realtimeDebounceTimer = null;
      if (syncInFlight) return;
      if (document.hidden) return;
      if (els.wheelArea.classList.contains('show') || els.message.classList.contains('show')) return;
      if (Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS) return;
      lastAutoSyncAt = Date.now();
      loadData(false, true);
    }, 300);
  });

  /* ───── PUBLIC API ───── */
  window.__getChecklistNames = () => Array.isArray(names) ? names.slice() : [];
  window.__getChecklistState = () => ({
    names: Array.isArray(names) ? names.slice() : [],
    checked: Array.isArray(checked) ? checked.slice() : [],
    times: Array.isArray(times) ? times.slice() : []
  });

  window.__clearCheckinForName = async function (name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return false;
    const idx = names.indexOf(cleanName);
    if (idx < 0) return false;
    if (!checked[idx] && !times[idx]) return true;

    const prevChecked = checked[idx];
    const prevTime = times[idx];
    checked[idx] = false;
    times[idx] = '';
    stateDay = todayKey();
    cacheSave();
    renderChecklist(true);
    if (!q1Opened && !els.checklistPanel.classList.contains('show')) renderLandingState();

    try {
      const token = AdminSession.get();
      if (!token) throw new Error('Không có quyền admin');
      const r = await window.__srankApi('adminSetCheck', { token, name: cleanName, checked: 'false' }, TIMEOUT.FAST);
      if (!r.ok) throw new Error(r.error || 'Không xoá được checkin');
      if (r.data && Number.isFinite(Number(r.data.points))) {
        points[idx] = Number(r.data.points);
        ranks[idx] = normalizeServerRank(r.data.rank, points[idx]);
      }
      return true;
    } catch (e) {
      checked[idx] = prevChecked;
      times[idx] = prevTime;
      cacheSave();
      renderChecklist(true);
      if (!q1Opened && !els.checklistPanel.classList.contains('show')) renderLandingState();
      throw e;
    }
  };

  window.SRank = window.SRank || {};
  Object.assign(window.SRank, {
    api: window.__srankApi,
    uuid,
    rankClient,
    normalizeServerRank,
    setStatus,
    ensureHtml2Canvas,
    showCapturePreview,
    syncQuickTools,
    getAvatarUrl,
    onTopOpen: () => { try { closeAdmin(); } catch (_) {} window.__clV6?.close?.(); },
    requestCheckin: n => {
      const i = names.indexOf(n);
      if (i < 0) return Promise.reject(new Error('Không tìm thấy ' + n));
      return checkin(n, i);
    },
    rerenderLanding: () => renderLandingState(),
    getCurrentState: () => ({
      names: names.slice(),
      checked: checked.slice(),
      times: times.slice()
    }),
    /* ⭐ v3.0.2 — Avatar API */
    avatar: {
      setCache: (name, url) => {
        try {
          const k = String(name || '').trim();
          if (!k) return;
          _avatarCache.set(k, String(url || ''));
          try { renderLandingState(true); } catch (_) {}
          try { renderChecklist(true); } catch (_) {}
        } catch (_) {}
      },
      getCache: (name) => {
        try {
          const k = String(name || '').trim();
          return k ? (_avatarCache.get(k) || '') : '';
        } catch (_) { return ''; }
      },
      reload: loadAvatarsFromSupabase
    }
  });

  /* ───── BOOT ───── */
  loadChecklistLockTime();
  if (els.checklistLockTimeInput) els.checklistLockTimeInput.value = checklistLockTime;

  /* ⭐ Load avatars từ Supabase */
  loadAvatarsFromSupabase().then(() => {
    try { renderLandingState(true); } catch (_) {}
  }).catch(() => {});

  let _loadDataPromise = null;
  if (cacheLoad()) {
    initialSheetLoaded = true;
    renderChecklist(true);
    buildWheel();
    if (els.hint) els.hint.textContent = names.length ? 'Chạm vào câu hỏi' : 'Đang tải dữ liệu…';
    setStatus('Đã tải dữ liệu lưu ✓');
    _loadDataPromise = loadData(false, true);
  } else {
    _loadDataPromise = loadData(true);
  }
  renderLandingState();

  (async () => {
    try {
      await _loadDataPromise;
      const s = await getSettingsCached(false);
      if (isValid24hTime(s.resetTime)) resetTime = s.resetTime;
      if (isValid24hTime(s.checklistLockTime)) {
        checklistLockTime = s.checklistLockTime;
        saveChecklistLockTime(checklistLockTime);
        if (els.checklistLockTimeInput) els.checklistLockTimeInput.value = checklistLockTime;
      }
      renderLandingState();
    } catch (_) {}
  })();

  scheduleNextReset();
  _cachedLocked = isChecklistLocked();

  setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - _lastLockCheck > 30000) {
      _lastLockCheck = now;
      const nextLocked = isChecklistLocked();
      const lockChanged = nextLocked !== _cachedLocked;
      _cachedLocked = nextLocked;
      if (lockChanged && !q1Opened && !els.checklistPanel.classList.contains('show')) {
        renderLandingState();
      }
    }
    if (!q1Opened && !els.checklistPanel.classList.contains('show')) {
      if (_cachedLocked) {
        if (els.hint && els.hint.textContent !== '') els.hint.textContent = '';
      } else if (names.length && els.hint && els.hint.textContent !== 'Chạm vào câu hỏi') {
        els.hint.textContent = 'Chạm vào câu hỏi';
      }
    }
  }, 1000);

  startAutoSync();

  window.addEventListener('displayNameUpdated', () => {
    try { renderLandingState(true); } catch (_) {}
    try { renderChecklist(true); } catch (_) {}
    try { renderAdminChecklistEditor(); } catch (_) {}
    try { renderAdminStats(); } catch (_) {}
  });

  console.log('[mainavatar] ready ✓ v3.0.Updated2');
'})();