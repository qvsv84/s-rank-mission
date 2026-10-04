/* =========================================================
   MAIN — Core app (IIFE #1)
   v6.1: thêm quizOverlay vào _syncQuickTools cho module Quiz
   ========================================================= */
(function(){
  "use strict";

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwJ1ebyNNe7fxlNR6TObBYebp7zRORGZTO0kTzlFl-S39I2vIJjDx9h0quV84od9JAfeg/exec";
  const CACHE_SCHEMA_VERSION = 6;
  const CACHE_KEY = `srank_check_v${CACHE_SCHEMA_VERSION}`;
  const ADMIN_TOKEN_KEY = "srank_admin_token_v1";
  const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;
  const ADMIN_RATE_LIMIT_KEY = "srank_admin_rl_v1";
  const ADMIN_MAX_ATTEMPTS = 5;
  const ADMIN_LOCKOUT_MS = 5 * 60 * 1000;
  const TIMEOUT = Object.freeze({FAST:8000, NORMAL:12000, SLOW:20000, DEFAULT:12000});
  const CHECKLIST_LOCK_KEY = "srank_checklist_lock_time_v1";
  const LAST_PICKED_NAME_KEY = "srank_last_picked_name_v1";
  const MONITOR_LINKS_KEY = "srank_monitor_links_v1";
  const CHECKLIST_SYNC_MS = 30000;
  const AUTO_SYNC_MS = 15000;
  const USER_ACTION_PAUSE_MS = 5000;
  const SELF_CHECK_IGNORE_MS = 20000;
  const SETTINGS_TTL = 5 * 60 * 1000;
  const ITEM_H = 58;

  const $ = id => document.getElementById(id);
  const els = {
    space: $("space"), question: $("question"), counter: $("counter"),
    wheelArea: $("wheelArea"), itemsBox: $("items"), confirm: $("confirm"),
    hint: $("hint"), message: $("message"), checklistPanel: $("checklistPanel"),
    checklistScroll: $("checklistScroll"),
    checklistBody: document.querySelector("#checklist tbody"),
    status: $("status"), syncBtn: $("syncBtn"),
    homeBtn: $("homeBtn"), checklistBtn: $("checklistBtn"),
    adminBtn: $("adminBtn"), monitorBtn: $("monitorBtn"),
    monitorOverlay: $("monitorOverlay"),
    monitorBody: document.querySelector("#monitorTable tbody"),
    monitorCloseBtn: $("monitorCloseBtn"),
    secondaryNav: $("secondaryNav"),
    lunchBtn: $("lunchBtn"),
    linkEditorOverlay: $("linkEditorOverlay"), linkEditorName: $("linkEditorName"),
    linkEditorInput: $("linkEditorInput"),
    linkEditorCancel: $("linkEditorCancel"), linkEditorClear: $("linkEditorClear"), linkEditorSave: $("linkEditorSave"),
    adminPage: $("adminPage"), adminPageBack: $("adminPageBack"), adminPageLogout: $("adminPageLogout"),
    adminChecklistSearch: $("adminChecklistSearch"), adminChecklistStats: $("adminChecklistStats"),
    adminStatTotal: $("adminStatTotal"), adminStatChecked: $("adminStatChecked"), adminStatUnchecked: $("adminStatUnchecked"),
    adminStatTop3: $("adminStatTop3"),
    adminTabs: [...document.querySelectorAll(".admin-tab")],
    adminViews: [...document.querySelectorAll(".admin-panel-view")],
    adminFilterBtns: [...document.querySelectorAll(".admin-filter-btn")],
    resetTimeInput: $("resetTimeInput"), checklistLockTimeInput: $("checklistLockTimeInput"),
    adminStatus: $("adminStatus"), adminSaveBtn: $("adminSaveBtn"),
    adminChecklistRows: $("adminChecklistRows"),
    captureBtn: $("captureBtn"),
    adminPasswordOverlay: $("adminPasswordOverlay"), adminPasswordInput: $("adminPasswordInput"),
    adminPasswordMsg: $("adminPasswordMsg"), adminPasswordOk: $("adminPasswordOk"), adminPasswordCancel: $("adminPasswordCancel")
  };

  const dtParts = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const todayKey = () => {
    const p = dtParts(); const g = k => p.find(x=>x.type===k)?.value || "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const dayKeyOf = (ts) => {
    const p = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(ts));
    const g = k => p.find(x=>x.type===k)?.value || "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const yesterdayKey = () => {
    const d = new Date(Date.now() - 86400000);
    const p = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
    const g = k => p.find(x=>x.type===k)?.value || "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const hhmm = () => new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  const escapeHtml = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const isValid24hTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||"").trim());
  const throttleRAF = fn => { let s = false, arg; return (...a) => { arg = a; if(s) return; s = true; requestAnimationFrame(() => { s = false; fn(...arg); }); }; };

  const uuid = () => {
    try{
      if(typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    }catch(_){}
    return "ck_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  };

  let requestSeq = 0;
  window.__srankApi = function(action, data = {}, timeout = TIMEOUT.DEFAULT){
    return new Promise((resolve, reject) => {
      const watchdog = setTimeout(() => reject(new Error("Request watchdog timeout")), timeout + 3000);
      const cb = "__srank_" + Date.now() + "_" + (++requestSeq);
      const script = document.createElement("script");
      const u = new URL(SCRIPT_URL);
      u.searchParams.set("action", action);
      u.searchParams.set("callback", cb);
      for(const [k,v] of Object.entries(data)) u.searchParams.set(k, v);
      let done = false;
      const finish = (fn, value) => {
        if(done) return;
        done = true;
        clearTimeout(timer); clearTimeout(watchdog);
        delete window[cb]; script.remove();
        fn(value);
      };
      window[cb] = result => finish(resolve, result);
      script.onerror = () => finish(reject, new Error("Không kết nối được Google Sheet"));
      const timer = setTimeout(() => finish(reject, new Error("Google Sheet phản hồi chậm")), timeout);
      script.src = u.toString();
      document.head.appendChild(script);
    });
  };

  const AdminSession = (() => {
    let _token = null, _expiresAt = 0;
    const HASH_KEY = "srank_admin_pwd_hash_v1";
    async function sha256Hex(str){
      try{
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      }catch(_){ return ""; }
    }
    const getStoredHash = () => { try{ return localStorage.getItem(HASH_KEY) || ""; }catch(_){ return ""; } };
    const setStoredHash = h => { try{ h ? localStorage.setItem(HASH_KEY, h) : localStorage.removeItem(HASH_KEY); }catch(_){} };
    async function checkPasswordLocal(p){
      const stored = getStoredHash();
      if(!stored) return null;
      const hex = await sha256Hex(p);
      return hex && hex === stored;
    }
    async function rememberPassword(p){ const hex = await sha256Hex(p); if(hex) setStoredHash(hex); }
    function forgetPassword(){ try{ localStorage.removeItem(HASH_KEY); }catch(_){} }
    function load(){
      try{
        const raw = localStorage.getItem(ADMIN_TOKEN_KEY);
        if(!raw) return null;
        const data = JSON.parse(raw);
        if(!data || typeof data.token !== "string") return null;
        if(Date.now() > (data.expiresAt || 0)){ localStorage.removeItem(ADMIN_TOKEN_KEY); return null; }
        _token = data.token; _expiresAt = data.expiresAt;
        return _token;
      }catch(_){ return null; }
    }
    function save(token, expiresAt){
      _token = token; _expiresAt = expiresAt;
      try{ localStorage.setItem(ADMIN_TOKEN_KEY, JSON.stringify({token, expiresAt})); }catch(_){}
    }
    function clear(){ _token = null; _expiresAt = 0; try{ localStorage.removeItem(ADMIN_TOKEN_KEY); }catch(_){} }
    const isValid = () => !!_token && Date.now() < _expiresAt;
    const get = () => isValid() ? _token : null;
    function checkRateLimit(){
      try{
        const raw = localStorage.getItem(ADMIN_RATE_LIMIT_KEY);
        const data = raw ? JSON.parse(raw) : {attempts:0, lockedUntil:0};
        if(Date.now() < (data.lockedUntil || 0)) return {allowed:false, remainSec:Math.ceil((data.lockedUntil - Date.now())/1000)};
        return {allowed:true, data};
      }catch(_){ return {allowed:true, data:{attempts:0, lockedUntil:0}}; }
    }
    function recordFailure(){
      try{
        const raw = localStorage.getItem(ADMIN_RATE_LIMIT_KEY);
        const data = raw ? JSON.parse(raw) : {attempts:0, lockedUntil:0};
        data.attempts = (data.attempts || 0) + 1;
        if(data.attempts >= ADMIN_MAX_ATTEMPTS){ data.lockedUntil = Date.now() + ADMIN_LOCKOUT_MS; data.attempts = 0; }
        localStorage.setItem(ADMIN_RATE_LIMIT_KEY, JSON.stringify(data));
      }catch(_){}
    }
    function recordSuccess(){ try{ localStorage.removeItem(ADMIN_RATE_LIMIT_KEY); }catch(_){} }
    return {load, save, clear, isValid, get, checkRateLimit, recordFailure, recordSuccess, sha256Hex, checkPasswordLocal, rememberPassword, forgetPassword};
  })();
  AdminSession.load();

  const Toast = (() => {
    let container = null;
    const recent = new Map();
    const DEDUP_MS = 2000, MAX_TOASTS = 3;
    function ensure(){
      if(container && container.isConnected) return container;
      container = document.createElement("div");
      container.id = "toastContainer";
      container.setAttribute("aria-live","polite");
      document.body.appendChild(container);
      return container;
    }
    const iconFor = t => t==="success"?"✓":t==="error"?"⚠":t==="warning"?"!" :t==="person"?"🌸":"i";
    function dismiss(el){
      if(!el || !el.parentNode) return;
      clearTimeout(el._toastTimer);
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    }
    function show(text, options = {}){
      const type = options.type || "info";
      const duration = Math.max(1200, options.duration || 1800);
      const icon = options.icon || iconFor(type);
      const msg = String(text || "").trim();
      if(!msg) return null;
      if(options.dedup !== false){
        const now = Date.now();
        const last = recent.get(msg);
        if(last && now - last < DEDUP_MS) return null;
        recent.set(msg, now);
        if(recent.size > 60){ for(const [k,t] of recent){ if(now-t > 10000) recent.delete(k); } }
      }
      const c = ensure();
      if(options.dedup !== false){
        const dup = Array.from(c.children).find(el => el.classList.contains(type) && el.querySelector(".toast-text")?.textContent === msg);
        if(dup) dup.remove();
      }
      while(c.children.length >= MAX_TOASTS) c.firstElementChild?.remove();
      const el = document.createElement("div");
      el.className = "toast " + type;
      el.style.setProperty("--duration", duration + "ms");
      el.setAttribute("role", type === "error" ? "alert" : "status");
      const iconEl = document.createElement("div");
      iconEl.className = "toast-icon"; iconEl.textContent = icon;
      const textEl = document.createElement("div");
      textEl.className = "toast-text"; textEl.textContent = msg;
      const progressEl = document.createElement("div");
      progressEl.className = "toast-progress";
      el.append(iconEl, textEl, progressEl);
      el.addEventListener("click", () => dismiss(el), {once:true});
      c.appendChild(el);
      el._toastTimer = setTimeout(() => dismiss(el), duration);
      return el;
    }
    return {show, dismiss};
  })();

  function createWheel({viewport, itemsBox, itemHeight = ITEM_H, itemClass = "", onChange}){
    let index = 0, offset = 0, dragging = false, startY = 0, items = [];
    const raf = {id: 0};
    function render(){
      if(!items.length) return;
      const mid = (viewport.clientHeight || 292) / 2;
      const children = itemsBox.children;
      for(let i = 0; i < children.length; i++){
        const el = children[i];
        const y = (i - index) * itemHeight + mid + offset;
        const d = Math.abs(y - mid);
        const n = Math.min(1, d / (itemHeight * 2.3));
        el.style.top = (y - itemHeight/2) + "px";
        el.style.transform = `scale(${1 - n*.28})`;
        el.style.opacity = .20 + (1 - n) * .80;
        el.style.filter = `blur(${n*2.5}px)`;
        el.classList.toggle("selected", i === index && Math.abs(offset) < itemHeight*.35);
      }
    }
    function schedule(){ if(raf.id) return; raf.id = requestAnimationFrame(() => { raf.id = 0; render(); }); }
    function setItems(list){
      items = Array.isArray(list) ? list.slice() : [];
      itemsBox.innerHTML = "";
      const frag = document.createDocumentFragment();
      items.forEach(name => {
        const el = document.createElement("div");
        el.className = "wheel-item" + (itemClass ? " " + itemClass : "");
        el.textContent = name;
        frag.appendChild(el);
      });
      itemsBox.appendChild(frag);
      if(index >= items.length) index = Math.max(0, items.length - 1);
      schedule();
    }
    function setIndex(i){
      index = Math.max(0, Math.min(items.length - 1, i));
      offset = 0;
      schedule();
    }
    function settle(){
      const steps = Math.round(-offset / itemHeight);
      if(steps !== 0) index = Math.max(0, Math.min(items.length - 1, index + steps));
      offset = 0;
      render();
      if(typeof onChange === "function"){ try{ onChange(index, items[index]); }catch(_){} }
    }
    function attach(){
      viewport.addEventListener("pointerdown", e => {
        dragging = true; startY = e.clientY; offset = 0;
        viewport.setPointerCapture?.(e.pointerId);
      });
      viewport.addEventListener("pointermove", e => {
        if(!dragging) return;
        offset = e.clientY - startY;
        if((index === 0 && offset > 0) || (index === items.length - 1 && offset < 0)) offset *= .25;
        render();
      });
      const end = e => {
        if(!dragging) return;
        dragging = false; settle();
        viewport.releasePointerCapture?.(e.pointerId);
      };
      viewport.addEventListener("pointerup", end);
      viewport.addEventListener("pointercancel", end);
      viewport.addEventListener("wheel", e => {
        if(!items.length) return;
        e.preventDefault();
        if(!e.deltaY) return;
        index += e.deltaY > 0 ? 1 : -1;
        index = Math.max(0, Math.min(items.length - 1, index));
        offset = 0;
        render();
        if(typeof onChange === "function"){ try{ onChange(index, items[index]); }catch(_){} }
      }, {passive:false});
    }
    return {setItems, setIndex, getIndex: () => index, getItems: () => items, schedule, settle, attach, render};
  }
  window.createWheel = createWheel;

  let names = [], checked = [], times = [], points = [], ranks = [];
  let stateDay = "";
  let current = 0, q1Opened = false;
  let _lastUserActionAt = 0;
  const _recentSelfChecks = new Map();
  const _pendingChecks = new Set();
  let _lastLockCheck = 0, _cachedLocked = false;
  let _dataLoadResolve;
  const _dataLoadPromise = new Promise(r => { _dataLoadResolve = r; });
  let _dataLoadResolved = false;
  let settingsCache = null, settingsFetchedAt = 0, settingsFetchPromise = null;
  let syncInFlight = false, autoSyncTimer = null;
  let lastAutoSyncAt = 0, lastSyncSuccessAt = 0;
  let resetTime = "00:00", resetTimer = null;
  let checklistLockTime = "21:00";
  let initialSheetLoaded = false;
  let adminUnlocked = AdminSession.isValid();
  let monitorLinks = {}, editingMonitorName = "";

  let _cacheSaveTimer = null, _cacheDirty = false;
  const cacheSchedule = (immediate = false) => {
    _cacheDirty = true;
    const doWrite = () => {
      _cacheDirty = false;
      try{
        localStorage.setItem(CACHE_KEY, JSON.stringify({v:CACHE_SCHEMA_VERSION, names, checked, times, points, ranks, day:todayKey(), ts:Date.now()}));
      }catch(_){ try{ localStorage.removeItem(CACHE_KEY); }catch(_){} }
    };
    if(immediate){ clearTimeout(_cacheSaveTimer); _cacheSaveTimer = null; doWrite(); return; }
    if(_cacheSaveTimer) return;
    const idle = window.requestIdleCallback || (cb => setTimeout(() => cb({didTimeout:false}), 250));
    _cacheSaveTimer = idle(() => { _cacheSaveTimer = null; if(_cacheDirty) doWrite(); });
  };
  const cacheSave = cacheSchedule;
  window.addEventListener("beforeunload", () => { if(_cacheDirty) cacheSchedule(true); });

  function cacheLoad(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return false;
      const x = JSON.parse(raw);
      if(!x || x.v !== CACHE_SCHEMA_VERSION || x.day !== todayKey()){ localStorage.removeItem(CACHE_KEY); return false; }
      if(!Array.isArray(x.names) || !Array.isArray(x.checked)) return false;
      names = x.names.filter(n => typeof n === "string" && n.trim());
      checked = x.checked.slice(0, names.length).map(c => c === true);
      times = Array.isArray(x.times) ? x.times.slice(0, names.length).map(t => typeof t === "string" ? t : "") : names.map(() => "");
      points = Array.isArray(x.points) ? x.points.slice(0, names.length).map(p => Number.isFinite(Number(p)) ? Number(p) : 0) : names.map(() => 0);
      ranks = points.map(rankClient);
      stateDay = x.day || todayKey();
      return names.length > 0;
    }catch(_){ try{ localStorage.removeItem(CACHE_KEY); }catch(_){} }
    return false;
  }

  async function getSettingsCached(force = false){
    const now = Date.now();
    if(!force && settingsCache && (now - settingsFetchedAt) < SETTINGS_TTL) return settingsCache;
    if(settingsFetchPromise) return settingsFetchPromise;
    settingsFetchPromise = (async () => {
      try{
        const r = await window.__srankApi("getSettings", {}, TIMEOUT.FAST);
        if(!r.ok) throw new Error(r.error || "Không tải được cài đặt");
        settingsCache = {resetTime:r.data.resetTime || "00:00", checklistLockTime:r.data.checklistLockTime || checklistLockTime};
        settingsFetchedAt = Date.now();
        return settingsCache;
      } finally { settingsFetchPromise = null; }
    })();
    return settingsFetchPromise;
  }

  function loadChecklistLockTime(){
    try{
      const saved = String(localStorage.getItem(CHECKLIST_LOCK_KEY) || "").trim();
      if(isValid24hTime(saved)) checklistLockTime = saved;
    }catch(_){}
  }
  function saveChecklistLockTime(value){
    checklistLockTime = String(value || "21:00").trim();
    try{ localStorage.setItem(CHECKLIST_LOCK_KEY, checklistLockTime); }catch(_){}
  }

  function scheduleNextReset(){
    if(resetTimer) clearTimeout(resetTimer);
    const now = new Date();
    const [hh,mm] = String(resetTime || "00:00").split(":").map(Number);
    const next = new Date(now);
    next.setHours(Number.isFinite(hh)?hh:0, Number.isFinite(mm)?mm:0, 3, 0);
    if(next.getTime() <= now.getTime()) next.setDate(next.getDate()+1);
    resetTimer = setTimeout(async () => {
      try{
        const token = AdminSession.get();
        if(!token) return;
        const r = await window.__srankApi("resetNow", {token}, TIMEOUT.FAST);
        if(!r.ok) throw new Error(r.error);
        checked = names.map(() => false);
        times = names.map(() => "");
        stateDay = todayKey();
        cacheSave();
        renderChecklist();
        LiveFeed.refresh();
        if(els.adminPage.classList.contains("show")) renderAdminChecklistEditor();
        setStatus("Checklist đã làm mới ✓");
      }catch(_){ setStatus("Reset chưa thành công — sẽ thử lại ✓"); }
      finally{ scheduleNextReset(); }
    }, Math.max(1000, next.getTime()-now.getTime()));
  }

  const MONITOR_FB_LINK = "https://facebook.com/kinya03";
  const MONITOR_DEFAULT_LINKS = {
    "Huong Lye":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=61593390746763&with_note=false&automatic_action=false",
    "Quỳnh Trang":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100093857294560&with_note=false&automatic_action=false",
    "Phương Thảo":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=61585575394411&with_note=false&automatic_action=false",
    "Thảo Uyên":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100006013845550&with_note=false&automatic_action=false",
    "Minh Thư":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100012882251402&with_note=false&automatic_action=false",
    "Như Dương":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100024250441939&with_note=false&automatic_action=false",
    "Rosalie":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100050294476265&with_note=false&automatic_action=false",
    "Tuan Nguyen":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100013605286802&with_note=false&automatic_action=false",
    "Minh Quân":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100021729860926&with_note=false&automatic_action=false",
    "Kim Chi":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=61589092540444&with_note=false&automatic_action=false",
    "Mỹ Dung":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100092430943394&with_note=false&automatic_action=false",
    "Phạm Kim Chi":"https://www.facebook.com/groups/263510030791508/admin_activities/?activity_actor=100024183575661&with_note=false&automatic_action=false"
  };
  const AVATAR_LINKS = {
    "Tiến Lợi":"https://drive.google.com/file/d/1d1u2VbvH3DtCUwUszKsqpU_Z4RCW4zZ-/view?usp=drivesdk",
    "Quỳnh Trang":"https://drive.google.com/file/d/1dKGPL_u-MjheN938HCrMXJhq6X9VQy7F/view?usp=drivesdk",
    "Thảo Uyên":"https://drive.google.com/file/d/1XSFfP0fvcH78lYCGKV8TLu6g_atBH7tT/view?usp=drivesdk",
    "Tuan Nguyen":"https://drive.google.com/file/d/1Xz4IEe14wKZXg8x-qdmk-bjbNYPr1jXo/view?usp=drivesdk",
    "Phương Thảo":"https://drive.google.com/file/d/1OyLV1ukW-CHVvro3P-g4_BmcrxDRTDrj/view?usp=drivesdk",
    "Huong Lye":"https://drive.google.com/file/d/1OsMjwKuvAaGTUWqjDxcfPJM0GMHZ_c07/view?usp=drivesdk",
    "Minh Thư":"","Như Dương":"",
    "Rosalie":"https://drive.google.com/file/d/1w1VozFwApcIHCwmV6R1-Y8LfBTWPbzya/view?usp=drivesdk",
    "Minh Quân":"https://drive.google.com/file/d/1Xqr1vZua3BdBJHg_qTREkAjtjBftOYSg/view?usp=drivesdk",
    "Minh Thuỳ":"https://drive.google.com/file/d/1sDgOs5M-Am-SIUr1GjcctBbdkTmrYlcr/view?usp=drivesdk",
    "Kim Chi":"","Mỹ Dung":"https://drive.google.com/file/d/1Jh9x4nUFQF_aKMIiqF4ZTyJMXTnO5gdA/view?usp=drivesdk",
    "Phạm Kim Chi":""
  };
  const avatarCache = new Map();
  function getAvatarUrl(name){
    const key = String(name || "").trim();
    if(avatarCache.has(key)) return avatarCache.get(key);
    const raw = String(AVATAR_LINKS[key] || "").trim();
    let result = "";
    if(raw){
      const gdMatch = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if(gdMatch && /drive\.google\.com/i.test(raw)) result = `https://drive.google.com/thumbnail?id=${gdMatch[1]}&sz=w800`;
      else if(/^\d+$/.test(raw)) result = `https://graph.facebook.com/${raw}/picture?width=800&height=800`;
      else if(/^https?:\/\//i.test(raw)) result = raw;
      else result = raw;
    }
    avatarCache.set(key, result);
    return result;
  }
  window.getAvatarUrl = getAvatarUrl;

  function loadMonitorLinks(){
    try{
      const saved = JSON.parse(localStorage.getItem(MONITOR_LINKS_KEY) || "{}");
      monitorLinks = Object.assign({}, saved && typeof saved === "object" ? saved : {}, MONITOR_DEFAULT_LINKS);
      localStorage.setItem(MONITOR_LINKS_KEY, JSON.stringify(monitorLinks));
    }catch(_){ monitorLinks = Object.assign({}, MONITOR_DEFAULT_LINKS); }
  }
  const saveMonitorLinks = () => { try{ localStorage.setItem(MONITOR_LINKS_KEY, JSON.stringify(monitorLinks)); }catch(_){} };
  const getMonitorLink = name => String(monitorLinks[String(name||"").trim()] || "").trim() || String(MONITOR_DEFAULT_LINKS[String(name||"").trim()] || "").trim() || MONITOR_FB_LINK;
  function normalizeMonitorLink(v){
    v = String(v || "").trim();
    if(!v) return "";
    try{ const u = new URL(v); if(u.protocol !== "http:" && u.protocol !== "https:") return ""; return u.toString(); }catch(_){ return ""; }
  }
  function openMonitorFacebook(name){
    const link = getMonitorLink(name);
    let win = null;
    try{ win = window.open("about:blank", "_blank"); }catch(_){}
    if(!win){ setStatus("Trình duyệt đang chặn tab mới."); return; }
    try{ win.location.replace(link); try{ win.focus(); }catch(_){} }catch(_){ try{ win.close(); }catch(_){} setStatus("Không mở được liên kết."); }
  }

  function rankClient(value){
    const score = Number(value) || 0;
    if(score >= 340) return "SSS";
    if(score >= 240) return "SS";
    if(score >= 180) return "S";
    if(score >= 100) return "A";
    return "B";
  }
  function normalizeServerRank(value, score){
    const r = String(value || "").trim().toUpperCase();
    return ["B","A","S","SS","SSS","VIP"].includes(r) ? r : rankClient(score);
  }
  window.attendanceRankClient = rankClient;

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
    if(t.includes("✓") || /thành công/i.test(t)) return "success";
    if(t.includes("⚠") || /lỗi|thất bại/i.test(t)) return "error";
    if(/^chưa|^không|mất kết nối|thử lại|đang chờ/i.test(t)) return "warning";
    return "info";
  };
  let _statusTimer = null;
  function setStatus(t){
    const text = String(t || "").trim();
    els.status.textContent = text;
    els.status.classList.add("show");
    clearTimeout(_statusTimer);
    _statusTimer = setTimeout(() => els.status.classList.remove("show"), 1400);
    if(text && !isRoutineMessage(text)) Toast.show(text, {type: inferToastType(text)});
  }

  /* =========================================================
     LIVE FEED — derive check + event lunch
     ========================================================= */
  const LiveFeed = (() => {
    const EVENTS_KEY = "srank_live_feed_events_v3";
    const SEEN_KEY = "srank_live_feed_seen_v3";
    const LAST_SYNC_KEY = "srank_live_feed_last_sync_v3";
    const MAX_EVENTS = 60;
    const POLL_INTERVAL = 3000;
    const RECENT_THRESHOLD_MS = 5 * 60 * 1000;
    const INITIAL_PULL_MS = 6 * 60 * 60 * 1000;

    let events = [];
    let lastSeen = { checks: {}, lunchTs: 0 };
    let _pollTimer = null, _lastServerTs = 0, _syncInFlight = false;

    function load(){
      try{
        const arr = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
        events = Array.isArray(arr)
          ? arr.filter(e => e && e.type === "lunch" && typeof e.name === "string" && typeof e.ts === "number")
          : [];
      }catch(_){ events = []; }
      try{
        const s = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
        lastSeen = (s && typeof s === "object") ? { checks: s.checks || {}, lunchTs: Number(s.lunchTs) || 0 } : { checks: {}, lunchTs: 0 };
      }catch(_){ lastSeen = { checks: {}, lunchTs: 0 }; }
      try{ _lastServerTs = Number(localStorage.getItem(LAST_SYNC_KEY) || 0) || 0; }catch(_){ _lastServerTs = 0; }
      if(_lastServerTs === 0) _lastServerTs = Date.now() - INITIAL_PULL_MS;
    }
    function saveEvents(){
      try{ localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS))); }catch(_){}
      try{ localStorage.setItem(LAST_SYNC_KEY, String(_lastServerTs)); }catch(_){}
    }
    function saveSeen(){
      try{ localStorage.setItem(SEEN_KEY, JSON.stringify(lastSeen)); }catch(_){}
    }

    function formatTsToTime(ts){
      const d = new Date(ts);
      return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
    }

    function getCheckEntries(){
      const day = stateDay || todayKey();
      const today = todayKey();
      const yest = yesterdayKey();
      if(day !== today && day !== yest) return [];
      const [y, mo, da] = day.split("-").map(Number);
      const out = [];
      for(let i = 0; i < names.length; i++){
        if(checked[i] !== true) continue;
        const t = String(times[i] || "").trim();
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) continue;
        const [hh, mm] = t.split(":").map(Number);
        const d = new Date(y, mo - 1, da, hh, mm, 0, 0);
        out.push({
          id: "chk_" + day + "_" + names[i],
          type: "check",
          name: names[i],
          time: t,
          ts: d.getTime(),
          meta: {}
        });
      }
      return out;
    }

    function getLunchEntries(){
      const today = todayKey();
      const yest = yesterdayKey();
      return events.filter(e => {
        const dk = dayKeyOf(e.ts);
        return dk === today || dk === yest;
      });
    }

    function getAllEntries(){
      return [...getCheckEntries(), ...getLunchEntries()].sort((a, b) => b.ts - a.ts);
    }

    function countUnread(){
      let n = 0;
      for(let i = 0; i < names.length; i++){
        if(checked[i] !== true) continue;
        const t = times[i];
        if(!t) continue;
        if(lastSeen.checks[names[i]] !== t) n++;
      }
      const lunchTs = lastSeen.lunchTs || 0;
      events.forEach(e => { if(e.ts > lunchTs) n++; });
      return n;
    }

    function updateBadge(){
      const badge = document.getElementById("liveFeedBadge");
      if(!badge) return;
      const n = countUnread();
      if(n <= 0){ badge.hidden = true; badge.textContent = ""; }
      else { badge.hidden = false; badge.textContent = n > 99 ? "99+" : String(n); }
    }

    function markAllSeen(){
      const seen = { checks: {}, lunchTs: 0 };
      for(let i = 0; i < names.length; i++){
        if(checked[i] === true && times[i]) seen.checks[names[i]] = times[i];
      }
      events.forEach(e => { if(e.ts > seen.lunchTs) seen.lunchTs = e.ts; });
      lastSeen = seen;
      saveSeen();
      updateBadge();
    }

    const typeLabel = function(ev){
      if (ev.type === "check") return "check lúc " + (ev.time || "—");
      if (ev.type === "lunch"){
        const meta = ev.meta || {};
        const dish = meta.dish || "";
        const icon = meta.icon || "🍜";
        return dish ? "quay được: " + icon + " " + dish : "vừa quay bữa trưa";
      }
      return "vừa hoạt động";
    };
    const typeIcon = function(ev){
      if (ev.type === "check") return "🌸";
      if (ev.type === "lunch"){
        const meta = ev.meta || {};
        return meta.icon || "🍜";
      }
      return "•";
    };

    function dayLabel(ts){
      const dk = dayKeyOf(ts);
      if(dk === todayKey()) return "Hôm nay";
      if(dk === yesterdayKey()) return "Hôm qua";
      const d = new Date(ts);
      return new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit"}).format(d);
    }

    function render(){
      const list = document.getElementById("liveFeedList");
      if(!list) return;
      const all = getAllEntries();
      if(!all.length){
        list.innerHTML = '<div class="live-empty"><div class="live-empty-icon">📭</div>Chưa có hoạt động nào.<br>Mọi người check đi nào!</div>';
      } else {
        const frag = document.createDocumentFragment();
        let lastDay = "";
        all.forEach(ev => {
          const dl = dayLabel(ev.ts);
          if(dl !== lastDay){
            const label = document.createElement("div");
            label.className = "live-day-label";
            label.textContent = dl;
            frag.appendChild(label);
            lastDay = dl;
          }
          const row = document.createElement("div");
          row.className = "live-event type-" + ev.type;
          row.innerHTML = '<div class="ev-icon"></div><div class="ev-body"><div class="ev-name"></div><div class="ev-meta"></div></div><div class="ev-time"></div>';
          row.querySelector(".ev-icon").textContent = typeIcon(ev);
          row.querySelector(".ev-name").textContent = ev.name;
          row.querySelector(".ev-meta").textContent = typeLabel(ev);
          row.querySelector(".ev-time").textContent = ev.time;
          frag.appendChild(row);
        });
        list.innerHTML = "";
        list.appendChild(frag);
      }
      const count = document.getElementById("liveFeedCount");
      if(count) count.textContent = all.length ? (all.length + " hoạt động") : "Không có hoạt động";
    }

    function refresh(){ render(); updateBadge(); }

    async function pushToServer(ev){
      const api = window.__srankApi || (window.SRank && window.SRank.api);
      if(!api) return null;
      try{
        const r = await api("pushLiveEvent", {
          type: ev.type,
          name: ev.name,
          meta: JSON.stringify(ev.meta || {}),
          clientTs: String(Date.now()),
          clientKey: ev.clientKey || ""
        }, 12000);
        if(!r || !r.ok) return null;
        return r.data || null;
      }catch(_){ return null; }
    }

    function push(ev){
      if(!ev || ev.type !== "lunch" || !ev.name) return null;
      const now = Date.now();
      const time = ev.time || hhmm();
      const clientKey = ev.clientKey || uuid();

      const full = {
        id: clientKey,
        type: "lunch",
        name: String(ev.name).slice(0, 60),
        time,
        meta: ev.meta || {},
        ts: now,
        _clientKey: clientKey,
        _pending: true
      };
      events.unshift(full);
      if(events.length > MAX_EVENTS) events.length = MAX_EVENTS;
      saveEvents(); refresh();

      pushToServer({ ...ev, clientKey }).then(function(serverEv){
        if(!serverEv || !serverEv.id) return;
        const idx = events.findIndex(e => e.id === clientKey);
        if(idx >= 0){
          events[idx].id = String(serverEv.id);
          events[idx]._pending = false;
          const sTs = Number(serverEv.ts);
          if(Number.isFinite(sTs) && sTs > 0) events[idx].ts = sTs;
          if(serverEv.time) events[idx].time = String(serverEv.time);
          if(events[idx].ts > _lastServerTs) _lastServerTs = events[idx].ts;
          saveEvents(); refresh();
        }
        syncFromServer();
      }).catch(function(){});

      return full;
    }

    function removeLocal(localId){
      const idx = events.findIndex(e => e.id === localId || e._clientKey === localId);
      if(idx < 0) return;
      events.splice(idx, 1);
      saveEvents(); refresh();
    }

    function waitForPush(clientKey, timeoutMs){
      const start = Date.now();
      const t = Math.max(1000, Number(timeoutMs) || 12000);
      return new Promise(resolve => {
        function check(){
          const e = events.find(x => x.id === clientKey || x._clientKey === clientKey);
          if(e && e._pending === false){
            resolve({ ok: true, event: e });
            return;
          }
          if(!e){
            resolve({ ok: false, reason: "removed" });
            return;
          }
          if(Date.now() - start > t){
            resolve({ ok: false, reason: "timeout", event: e });
            return;
          }
          setTimeout(check, 200);
        }
        check();
      });
    }

    async function syncFromServer(){
      if(_syncInFlight) return;
      const api = window.__srankApi || (window.SRank && window.SRank.api);
      if(!api) return;
      _syncInFlight = true;
      try{
        const since = _lastServerTs > 0 ? _lastServerTs - 60000 : 0;
        const r = await api("getLiveEvents", { since, _ts: Date.now() }, 12000);
        if(!r || !r.ok) return;
        const arr = Array.isArray(r.data && r.data.events) ? r.data.events : [];
        let added = false, newest = 0;
        arr.forEach(function(raw){
          if(!raw || !raw.id) return;
          const type = String(raw.type || "").trim();
          if(type !== "lunch") return;
          const rawId = String(raw.id);
          if(events.some(e => e.id === rawId)) return;
          const ts = Number(raw.ts) || Date.now();
          events.push({
            id: rawId,
            type: "lunch",
            name: String(raw.name || "Ẩn danh"),
            time: formatTsToTime(ts),
            meta: raw.meta || {},
            ts
          });
          added = true;
          if(ts > newest) newest = ts;
        });
        if(newest > _lastServerTs) _lastServerTs = newest;
        if(added){
          events.sort((a, b) => b.ts - a.ts);
          if(events.length > MAX_EVENTS) events.length = MAX_EVENTS;
          saveEvents(); refresh();
        }
      }catch(_){}
      finally{ _syncInFlight = false; }
    }

    function startPolling(){
      stopPolling();
      _pollTimer = setInterval(function(){
        if(document.hidden) return;
        syncFromServer();
      }, POLL_INTERVAL);
    }
    function stopPolling(){
      if(_pollTimer){ clearInterval(_pollTimer); _pollTimer = null; }
    }

    function clear(){ events = []; lastSeen = { checks: {}, lunchTs: 0 }; _lastServerTs = 0; saveEvents(); saveSeen(); refresh(); }

    const open = () => {
      const overlay = document.getElementById("liveFeedOverlay");
      if(!overlay) return;
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden","false");
      render(); markAllSeen();
      syncFromServer();
      if (typeof window.syncQuickTools === "function") window.syncQuickTools();
    };
    const close = () => {
      const overlay = document.getElementById("liveFeedOverlay");
      if(!overlay) return;
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden","true");
      if (typeof window.syncQuickTools === "function") window.syncQuickTools();
    };

    function init(){
      load(); updateBadge(); render();
      setTimeout(syncFromServer, 800);
      startPolling();
      document.getElementById("liveFeedBtn")?.addEventListener("click", open);
      document.getElementById("liveFeedClose")?.addEventListener("click", close);
      document.getElementById("liveFeedOverlay")?.addEventListener("click", e => { if(e.target && e.target.id === "liveFeedOverlay") close(); });
      document.getElementById("liveFeedClear")?.addEventListener("click", () => { if(confirm("Xoá lịch sử hiển thị trên máy này?\n(Sự kiện trên server vẫn còn)")) clear(); });
      document.addEventListener("visibilitychange", () => {
        if(!document.hidden) syncFromServer();
      });
    }
    return {push, removeLocal, waitForPush, refresh, init, open, close, clear, markAllSeen, updateBadge, syncFromServer};
  })();

  window.SRank = window.SRank || {};
  window.SRank.LiveFeed = LiveFeed;

  function isRecentCheckMinute(hhmmStr, maxMin){
    const m = String(hhmmStr || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if(!m) return false;
    const h = +m[1], mi = +m[2];
    const parts = new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Ho_Chi_Minh", hour:"2-digit", minute:"2-digit", hour12:false}).formatToParts(new Date());
    const nowH = +(parts.find(p => p.type === "hour")?.value || 0);
    const nowM = +(parts.find(p => p.type === "minute")?.value || 0);
    let diff = (nowH*60 + nowM) - (h*60 + mi);
    if(diff < 0) diff += 1440;
    return diff <= maxMin;
  }

  function notifyNewlyChecked(list){
    if(!Array.isArray(list) || !list.length) return;
    const now = Date.now();
    const filtered = list.filter(item => {
      const last = _recentSelfChecks.get(item.name);
      if(last && (now - last) < SELF_CHECK_IGNORE_MS) return false;
      return isRecentCheckMinute(item.time, 5);
    });
    if(!filtered.length) return;
    filtered.sort((a,b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    if(filtered.length === 1){
      const p = filtered[0];
      Toast.show(`${p.name} vừa check lúc ${p.time || "—"}`, {type:"person", icon:"🌸", duration:3200});
    } else {
      Toast.show(`${filtered[0].name} và ${filtered.length - 1} người khác vừa check`, {type:"person", icon:"🌸", duration:3200});
    }
  }

  let _checklistSignature = "";
  function checklistSig(){ return names.map((n,i) => `${n}|${checked[i]?1:0}|${times[i]||""}`).join("::"); }
  function renderChecklistSkeleton(){
    const frag = document.createDocumentFragment();
    for(let i = 0; i < 5; i++){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><div class="skeleton skeleton-row medium"></div></td><td><div class="skeleton skeleton-row short"></div></td><td><div class="skeleton" style="width:25px;height:25px;border-radius:8px;margin:auto"></div></td>`;
      frag.appendChild(tr);
    }
    els.checklistBody.innerHTML = "";
    els.checklistBody.appendChild(frag);
    _checklistSignature = "";
  }
  function renderChecklist(force = false){
    const sig = checklistSig();
    if(!force && sig === _checklistSignature) return;
    _checklistSignature = sig;
    const rows = names.map((name, i) => ({name, index:i, checked: !!checked[i], time: times[i] || ""}));
    rows.sort((a, b) => {
      if(a.checked !== b.checked) return a.checked ? -1 : 1;
      if(a.checked && b.checked){
        const ta = a.time || "99:99", tb = b.time || "99:99";
        const c = ta.localeCompare(tb);
        if(c !== 0) return c;
      }
      return a.index - b.index;
    });
    const frag = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.dataset.index = row.index;
      tr.innerHTML = `<td class="playerName"></td><td class="checkTime"></td><td><div class="checkBox"></div></td>`;
      tr.firstChild.textContent = row.name;
      tr.querySelector(".checkTime").textContent = row.time || "—";
      if(row.checked) tr.querySelector(".checkBox").classList.add("checked");
      frag.appendChild(tr);
    });
    els.checklistBody.innerHTML = "";
    els.checklistBody.appendChild(frag);
  }

  function smoothUpdateChecklist(newData){
    if(!names.length) return false;
    if(names.length !== newData.names.length) return false;
    if(names.some((n, i) => n !== newData.names[i])) return false;
    const oldChecked = checked.slice(), oldTimes = times.slice();
    const oldPoints = points.slice(), oldRanks = ranks.slice();
    const newlyChecked = [];
    const changedIdx = [];
    const mergedChecked = newData.checked.slice();
    const mergedTimes = newData.times.slice();
    for(let i = 0; i < names.length; i++){
      if(_pendingChecks.has(names[i])){
        mergedChecked[i] = oldChecked[i];
        mergedTimes[i] = oldTimes[i];
      }
      const checkedChanged = oldChecked[i] !== mergedChecked[i];
      const timeChanged = String(oldTimes[i] || "") !== String(mergedTimes[i] || "");
      const pointsChanged = oldPoints[i] !== newData.points[i];
      const rankChanged = oldRanks[i] !== newData.ranks[i];
      if(checkedChanged || timeChanged || pointsChanged || rankChanged){
        changedIdx.push(i);
        if(!oldChecked[i] && mergedChecked[i]) newlyChecked.push({name:names[i], time:mergedTimes[i] || ""});
      }
    }
    if(!changedIdx.length) return true;
    checked = mergedChecked; times = mergedTimes; points = newData.points; ranks = newData.ranks;
    stateDay = todayKey();
    renderChecklist(true);
    changedIdx.slice(0, 5).forEach((idx, k) => {
      const tr = els.checklistBody.querySelector(`tr[data-index="${idx}"]`);
      if(!tr) return;
      tr.classList.add("row-updated");
      setTimeout(() => tr.classList.remove("row-updated"), 1200 + k * 80);
    });
    if(newlyChecked.length) notifyNewlyChecked(newlyChecked);
    return true;
  }
  function updateChecklistRow(index){
    const tr = els.checklistBody.querySelector(`tr[data-index="${index}"]`);
    if(!tr) return false;
    const timeCell = tr.querySelector(".checkTime");
    const box = tr.querySelector(".checkBox");
    if(timeCell) timeCell.textContent = times[index] || "—";
    if(box) box.classList.toggle("checked", !!checked[index]);
    _checklistSignature = checklistSig();
    return true;
  }

  const mainWheel = createWheel({
    viewport: els.wheelArea.querySelector("#wheelViewport") || els.wheelArea,
    itemsBox: els.itemsBox,
    itemHeight: ITEM_H,
    onChange: () => els.confirm.classList.add("show")
  });
  mainWheel.attach();
  const origSetItems = mainWheel.setItems;
  mainWheel.setItems = list => { origSetItems(list); setTimeout(() => mainWheel.schedule(), 20); };
  const buildWheel = () => mainWheel.setItems(names);

  async function loadData(showError = true, force = false){
    if(syncInFlight){
      if(force) setStatus("Đang đồng bộ, vui lòng chờ...");
      return false;
    }
    if(initialSheetLoaded && !force){ renderChecklist(); buildWheel(); renderAdminChecklistEditor(); return true; }
    syncInFlight = true;
    try{
      if(!names.length && cacheLoad()){ renderChecklist(); buildWheel(); }
      else if(!names.length && els.checklistPanel.classList.contains("show")) renderChecklistSkeleton();

      const r = await window.__srankApi("getData", {_ts: Date.now()}, TIMEOUT.SLOW);
      if(!r.ok) throw new Error(r.error || "getData lỗi");

      const rawNames = Array.isArray(r.data?.names) ? r.data.names : [];
      const serverNames = rawNames.map(n => String(n ?? "").trim()).filter(n => n.length > 0 && n.length <= 100);
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
        const t = String(rawTimes[i] ?? "").trim();
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : "";
      });

      const canSmooth = initialSheetLoaded && !force && els.checklistPanel.classList.contains("show") && names.length > 0;
      if(canSmooth){
        const updated = smoothUpdateChecklist({names:serverNames, points:serverPoints, checked:serverChecks, times:serverTimes, ranks:serverRanks});
        if(updated){
          lastAutoSyncAt = Date.now();
          window.syncAttendanceEmployees?.();
          cacheSave();
          LiveFeed.refresh();
          setStatus("Đã cập nhật ✓");
          maybeRenderLanding();
          return true;
        }
      }

      let newlyChecked = [];
      if(initialSheetLoaded && names.length > 0){
        const prevNames = names.slice(), prevChecked = checked.slice();
        for(let i = 0; i < Math.min(prevNames.length, serverNames.length); i++){
          if(prevNames[i] === serverNames[i] && !prevChecked[i] && serverChecks[i]){
            newlyChecked.push({name:prevNames[i], time:serverTimes[i] || ""});
          }
        }
      }

      const mergedChecks = serverChecks.slice();
      const mergedTimes = serverTimes.slice();
      if(initialSheetLoaded && names.length === serverNames.length){
        for(let i = 0; i < names.length; i++){
          if(names[i] === serverNames[i] && _pendingChecks.has(names[i])){
            mergedChecks[i] = checked[i] === true;
            mergedTimes[i] = times[i] || "";
          }
        }
      }

      names = serverNames;
      points = serverPoints;
      ranks = serverRanks;
      checked = mergedChecks; times = mergedTimes;
      stateDay = todayKey();
      initialSheetLoaded = true;
      lastAutoSyncAt = Date.now();
      window.syncAttendanceEmployees?.();
      cacheSave();
      renderChecklist(true);
      buildWheel();
      LiveFeed.refresh();
      if(els.adminPage.classList.contains("show")) renderAdminChecklistEditor();
      els.hint.textContent = "Chạm vào câu hỏi";
      setStatus(force ? "Đã cập nhật ✓" : "Đã đồng bộ ✓");
      lastSyncSuccessAt = Date.now();
      maybeRenderLanding();
      if(newlyChecked.length) notifyNewlyChecked(newlyChecked);
      return true;
    }catch(e){
      if(showError && !names.length) els.hint.textContent = "Không tải được dữ liệu";
      if(names.length) setStatus("Đang dùng dữ liệu đã lưu");
      return false;
    }finally{
      syncInFlight = false;
      if(!_dataLoadResolved){ _dataLoadResolved = true; _dataLoadResolve(); }
    }
  }

  function restartAutoSync(){
    if(autoSyncTimer){ clearTimeout(autoSyncTimer); autoSyncTimer = null; }
    const interval = els.checklistPanel.classList.contains("show") ? CHECKLIST_SYNC_MS : AUTO_SYNC_MS;
    autoSyncTimer = setTimeout(async function tick(){
      let skip = document.hidden ||
        els.wheelArea.classList.contains("show") ||
        els.message.classList.contains("show") ||
        (window.BXH?.isOpen?.()) ||
        document.getElementById("attendancePage")?.classList.contains("show") ||
        Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS ||
        syncInFlight;
      if(!skip){ lastAutoSyncAt = Date.now(); try{ await loadData(false, true); }catch(_){} }
      if(autoSyncTimer !== null) autoSyncTimer = setTimeout(tick, interval);
    }, interval);
  }
  const startAutoSync = restartAutoSync;

  async function checkin(name, index){
    if(checked[index] === true && times[index]){ setStatus(`Đã ghi ${times[index]} ✓`); return; }
    _lastUserActionAt = Date.now();
    _recentSelfChecks.set(name, Date.now());
    if(_recentSelfChecks.size > 100){
      const now = Date.now();
      for(const [k,v] of _recentSelfChecks){ if(now-v > SELF_CHECK_IGNORE_MS*2) _recentSelfChecks.delete(k); }
    }

    _pendingChecks.add(name);

    const clientTime = hhmm();
    const prevChecked = checked[index], prevTime = times[index];
    times[index] = clientTime;
    checked[index] = true;
    stateDay = todayKey();
    cacheSave();
    if(!updateChecklistRow(index)) renderChecklist(true);
    LiveFeed.refresh();
    if(!q1Opened && !els.checklistPanel.classList.contains("show")) renderLandingState();
    setStatus(`Đã ghi ${clientTime} ✓`);

    try{
      const r = await window.__srankApi("checkin", {name, clientTime, clientEpoch:String(Date.now())}, TIMEOUT.NORMAL);
      if(!r.ok) throw new Error(r.error || "Checkin thất bại");

      if(r.data && Number.isFinite(Number(r.data.points))){
        points[index] = Number(r.data.points);
        ranks[index] = normalizeServerRank(r.data.rank, points[index]);
      }
      if(r.data && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.data.time || ""))){
        times[index] = String(r.data.time);
      }
      _pendingChecks.delete(name);
      stateDay = todayKey();
      cacheSave();
      updateChecklistRow(index);
      LiveFeed.refresh();
      setStatus(`Đã ghi ${times[index] || clientTime} ✓`);
      try{ window.dispatchEvent(new CustomEvent("checkinDone", {detail:{name, time:times[index] || clientTime}})); }catch(_){}
      try{ localStorage.setItem("srank_last_checkin", JSON.stringify({name, time:times[index] || clientTime, date:todayKey()})); }catch(_){}
    }catch(err){
      _pendingChecks.delete(name);
      checked[index] = prevChecked;
      times[index] = prevTime;
      _recentSelfChecks.delete(name);
      cacheSave();
      if(!updateChecklistRow(index)) renderChecklist(true);
      LiveFeed.refresh();
      if(!q1Opened && !els.checklistPanel.classList.contains("show")) renderLandingState();
      const msg = String(err?.message || "").trim();
      setStatus(msg ? `Không ghi được: ${msg}` : "Không ghi được — kiểm tra mạng");
    }
  }

  function burst(){
    const f = document.createElement("div"); f.className = "flash"; els.space.appendChild(f);
    setTimeout(() => f.remove(), 700);
    const hearts = [];
    for(let i = 0; i < 20; i++){
      const h = document.createElement("div"); h.className = "heart"; h.textContent = i % 5 === 0 ? "💗" : "♥";
      const a = Math.PI * 2 * i / 20, r = 80 + Math.random() * 200;
      h.style.setProperty("--x", Math.cos(a) * r + "px");
      h.style.setProperty("--y", Math.sin(a) * r + "px");
      h.style.setProperty("--r", (Math.random() * 120 - 60) + "deg");
      h.style.setProperty("--s", (0.7 + Math.random() * 1.3).toFixed(2));
      h.style.setProperty("--time", (0.7 + Math.random() * .6).toFixed(2) + "s");
      els.space.appendChild(h);
      hearts.push(h);
    }
    setTimeout(() => { for(const h of hearts) h.remove(); }, 1600);
  }

  function showMessage(html, duration = 2200, next = null){
    els.wheelArea.classList.remove("show");
    els.question.style.opacity = "0";
    els.hint.textContent = "";
    els.message.innerHTML = html;
    els.message.classList.remove("show"); void els.message.offsetWidth; els.message.classList.add("show");
    burst();
    if(next) setTimeout(() => { els.message.classList.remove("show"); setTimeout(next, 220); }, duration);
  }

  function checklistLockInfo(){
    const parts = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
    const minute = Number(parts.find(p => p.type === "minute")?.value || 0);
    const [lh, lm] = String(checklistLockTime || "21:00").split(":").map(Number);
    const lockMinutes = (Number.isFinite(lh)?lh:21) * 60 + (Number.isFinite(lm)?lm:0);
    return {locked: (hour*60+minute) >= lockMinutes, time: checklistLockTime};
  }
  const isChecklistLocked = () => checklistLockInfo().locked;

  function maybeRenderLanding(){
    if(q1Opened) return;
    if(els.checklistPanel.classList.contains("show")) return;
    if(window.BXH?.isOpen?.()) return;
    if(els.wheelArea.classList.contains("show")) return;
    if(els.message.classList.contains("show")) return;
    if(els.confirm.classList.contains("show")) return;
    renderLandingState();
    _lastLockCheck = Date.now();
    _cachedLocked = isChecklistLocked();
  }

  let _lastTop3Signature = "";
  const top3Signature = list => list.map(p => `${p.name}|${p.time}|${getAvatarUrl(p.name)}`).join("::");

  function renderLandingState(forceFullReplay = false){
    els.question.classList.remove("hero-wheel-open");
    const locked = isChecklistLocked();
    els.question.classList.toggle("checklist-locked-home", locked);
    const checkedList = names.map((name, i) => ({name:String(name||"").trim(), time:String(times[i]||"").trim(), checked: !!checked[i]}))
      .filter(p => p.checked && p.time && p.name)
      .sort((a, b) => a.time.localeCompare(b.time));
    const top3 = checkedList.slice(0, 3);
    const newSig = top3Signature(top3);
    const top3Changed = newSig !== _lastTop3Signature;

    let top3HTML = "";
    if(top3.length === 0){
      top3HTML = `<div class="landing-top3-empty">Chưa có ai check hôm nay — hãy là người đầu tiên! 🐱</div>`;
    } else {
      const order = [];
      if(top3[1]) order.push({...top3[1], rank:2, medal:"🥈"});
      if(top3[0]) order.push({...top3[0], rank:1, medal:"🥇"});
      if(top3[2]) order.push({...top3[2], rank:3, medal:"🥉"});
      top3HTML = `
        <span class="landing-top3-label"><span class="w">TOP</span> <span class="w">CHECK</span> <span class="w">SỚM</span> <span class="w">NHẤT</span></span>
        <div class="landing-top3">
          ${order.map(p => {
            const url = getAvatarUrl(p.name);
            const safeName = String(p.name).replace(/"/g, "&quot;");
            const safeUrl = url.replace(/"/g, "&quot;");
            const avatarHTML = url
              ? `<span class="podium-avatar"><img src="${safeUrl}" alt="" loading="eager" decoding="async" onerror="this.style.display='none';this.nextElementSibling.classList.add('show');"><span class="podium-avatar-fallback">?</span></span>`
              : `<span class="podium-avatar"><span class="podium-avatar-fallback show">?</span></span>`;
            return `<div class="podium-slot rank-${p.rank}" data-rank="${p.rank}">${avatarHTML}<span class="podium-medal">${p.medal}</span><span class="podium-name" title="${safeName}">${safeName}</span><span class="podium-time">${p.time}</span></div>`;
          }).join("")}
        </div>`;
    }

    const titleEl = els.question.querySelector(".landing-title");
    const hasStructure = !!titleEl && !forceFullReplay;
    if(!hasStructure){
      els.question.classList.remove("play");
      if(locked){
        els.question.innerHTML = `
          <span class="landing-kicker">🐱 DAILY TEAM HUB</span>
          <span class="landing-title">CHECKLIST ĐẢO MÈO</span>
          ${top3HTML}
          <span class="landing-cta locked" role="button" aria-disabled="true" tabindex="-1">Tạm khoá Checklist</span>
          <span class="landing-lock-note">Sau ${checklistLockTime} sẽ khoá Checklist nha mn 🥰</span>`;
      } else {
        els.question.innerHTML = `
          <span class="landing-kicker">🐱 DAILY TEAM HUB</span>
          <span class="landing-title">CHECKLIST ĐẢO MÈO</span>
          ${top3HTML}
          <span class="landing-cta" role="button" tabindex="0">CLICK HERE</span>`;
      }
      _lastTop3Signature = newSig;
      els.question.style.removeProperty("--top3-base");
      void els.question.offsetWidth;
      els.question.classList.add("play");
      els.question.style.opacity = "1";
      els.question.style.transform = "scale(1)";
      els.question.style.pointerEvents = locked ? "none" : "auto";
      return;
    }
    if(top3Changed){
      els.question.querySelector(".landing-top3-label")?.remove();
      els.question.querySelector(".landing-top3")?.remove();
      els.question.querySelector(".landing-top3-empty")?.remove();
      const ctaBefore = els.question.querySelector(".landing-cta");
      if(ctaBefore && top3HTML) ctaBefore.insertAdjacentHTML("beforebegin", top3HTML);
      _lastTop3Signature = newSig;
      els.question.classList.remove("top3-replay");
      void els.question.offsetWidth;
      els.question.classList.add("top3-replay");
    }
    const cta = els.question.querySelector(".landing-cta");
    const lockNote = els.question.querySelector(".landing-lock-note");
    if(locked){
      if(cta && !cta.classList.contains("locked")){
        cta.classList.add("locked");
        cta.setAttribute("aria-disabled", "true");
        cta.setAttribute("tabindex", "-1");
        cta.textContent = "Tạm khoá Checklist";
        if(!lockNote){
          const note = document.createElement("span");
          note.className = "landing-lock-note";
          note.textContent = `Sau ${checklistLockTime} sẽ khoá Checklist nha mn 🥰`;
          els.question.appendChild(note);
        }
      }
    } else if(cta && cta.classList.contains("locked")){
      cta.classList.remove("locked");
      cta.removeAttribute("aria-disabled");
      cta.setAttribute("tabindex", "0");
      cta.textContent = "CLICK HERE";
      lockNote?.remove();
    }
    els.question.style.opacity = "1";
    els.question.style.transform = "scale(1)";
    els.question.style.pointerEvents = locked ? "none" : "auto";
  }

  function openQuestion1(e){
    e?.preventDefault();
    if(isChecklistLocked()){ renderLandingState(); return; }
    if(q1Opened || !names.length) return;
    q1Opened = true;
    _lastUserActionAt = Date.now();
    els.question.classList.add("hero-wheel-open");
    els.question.style.pointerEvents = "none";
    els.question.style.opacity = "0";
    els.question.style.transform = "scale(.8)";
    burst();
    setTimeout(() => {
      els.wheelArea.style.opacity = "1";
      els.wheelArea.style.pointerEvents = "auto";
      els.wheelArea.classList.add("show");
      els.confirm.classList.add("show");
      try{
        const lastPicked = localStorage.getItem(LAST_PICKED_NAME_KEY);
        if(lastPicked){ const idx = names.indexOf(lastPicked); if(idx >= 0) mainWheel.setIndex(idx); }
      }catch(_){}
      mainWheel.schedule();
      els.hint.textContent = "Vuốt lên / xuống • ↑ ↓ để chọn • Enter để xác nhận";
      syncQuickTools();
    }, 180);
  }
  els.question.addEventListener("pointerup", openQuestion1, {passive:false});
  els.question.addEventListener("click", openQuestion1);
  els.question.addEventListener("keydown", e => {
    const cta = e.target.closest(".landing-cta");
    if(!cta || cta.classList.contains("locked")) return;
    if(e.key === "Enter" || e.key === " "){ e.preventDefault(); openQuestion1(e); }
  });

  els.confirm.addEventListener("click", () => {
    if(isChecklistLocked()){ resetHome(); return; }
    const selected = names[mainWheel.getIndex()];
    if(!selected) return;
    try{ localStorage.setItem(LAST_PICKED_NAME_KEY, selected); }catch(_){}
    current = mainWheel.getIndex();
    showQuestion2();
  });

  function showQuestion2(){
    els.wheelArea.classList.remove("show");
    els.wheelArea.style.opacity = "0";
    els.wheelArea.style.pointerEvents = "none";
    els.confirm.classList.remove("show");
    els.counter.textContent = "CÂU 2";
    els.question.innerHTML = `<div class="system-question"><div class="system-question-title">HỆ THỐNG ĐẢO MÈO</div><div class="system-question-sub">Hôm nay bạn đã hoàn thành checklist chưa?</div></div>`;
    els.question.style.opacity = "1"; els.question.style.pointerEvents = "none"; els.question.style.transform = "scale(1)";
    const box = document.createElement("div");
    box.id = "q2answers";
    box.innerHTML = `<button id="doneBtn">Tôi đã hoàn thành</button><button id="laterBtn">Tôi chưa hoàn thành</button>`;
    els.space.appendChild(box);
    Object.assign(box.style, {position:"absolute", left:"50%", top:"64%", transform:"translate(-50%,0)", zIndex:"22", display:"flex", flexDirection:"column", gap:"12px", width:"min(88vw,390px)", opacity:"0", transition:"opacity .25s"});
    [...box.children].forEach(b => Object.assign(b.style, {minHeight:"50px", padding:"10px 18px", borderRadius:"999px", border:"1px solid rgba(255,255,255,.25)", color:"#fff", fontSize:"15px", fontWeight:"700", background:"rgba(255,255,255,.07)", backdropFilter:"blur(10px)"}));
    box.querySelector("#doneBtn").style.background = "linear-gradient(135deg,#ff3c91,#ff70b9)";
    requestAnimationFrame(() => box.style.opacity = "1");

    box.querySelector("#doneBtn").addEventListener("click", () => {
      const completedIndex = mainWheel.getIndex(), selected = names[completedIndex];
      box.remove();
      els.question.style.opacity = "0";
      els.question.style.pointerEvents = "none";
      els.hint.textContent = "";
      els.message.classList.remove("show");
      checkin(selected, completedIndex);
      els.checklistPanel.classList.add("show");
      const row = els.checklistBody.querySelector(`tr[data-index="${completedIndex}"]`);
      if(row) setTimeout(() => row.scrollIntoView({block:"center", behavior:"smooth"}), 80);
    });
    box.querySelector("#laterBtn").addEventListener("click", () => {
      box.remove();
      showMessage(`<div class="later-message"><span class="later-title">Không sao!</span><span class="later-name">Cố lên "${names[mainWheel.getIndex()]}" 💪</span></div>`, 0);
    });
  }

  let html2canvasPromise = null;
  function ensureHtml2Canvas(){
    if(typeof html2canvas === "function") return Promise.resolve();
    if(html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Không tải được công cụ chụp"));
      document.head.appendChild(s);
    });
    return html2canvasPromise;
  }

  function showCapturePreview(imageUrl, blob, previewTitle = "📸 Checklist đã chụp", filename = "checklist-dao-meo.png", previewHint = "Chrome / Cốc Cốc: bấm Lưu ảnh hoặc nhấn giữ vào ảnh để lưu."){
    document.getElementById("capturePreview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "capturePreview";
    overlay.innerHTML = `<div class="capturePreviewBox"><div class="capturePreviewTitle"></div><div class="capturePreviewImageWrap"><img id="capturePreviewImage" src="${imageUrl}" alt="Checklist"></div><div class="capturePreviewHint"></div><div class="capturePreviewActions"><button type="button" id="captureShareBtn">↗ Chia sẻ</button><a id="captureDownloadBtn" href="${imageUrl}" download="checklist-dao-meo.png">↓ Lưu ảnh</a><button type="button" id="captureCloseBtn">Đóng</button></div></div>`;
    overlay.querySelector(".capturePreviewTitle").textContent = previewTitle;
    overlay.querySelector(".capturePreviewHint").textContent = previewHint;
    overlay.querySelector("#captureDownloadBtn").download = filename;
    document.body.appendChild(overlay);
    const cleanup = () => { overlay.remove(); try{ URL.revokeObjectURL(imageUrl); }catch(_){} };
    overlay.querySelector("#captureCloseBtn").addEventListener("click", cleanup);
    overlay.addEventListener("click", e => { if(e.target === overlay) cleanup(); });
    overlay.querySelector("#captureDownloadBtn").addEventListener("click", () => setStatus("Đang lưu ảnh…"));
    overlay.querySelector("#captureShareBtn").addEventListener("click", async () => {
      const btn = overlay.querySelector("#captureShareBtn");
      btn.disabled = true; btn.textContent = "⏳ Đang mở…";
      try{
        const file = new File([blob], filename, {type:"image/png"});
        if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
          await navigator.share({files:[file], title:"Checklist Đảo Mèo", text:"Checklist nhiệm vụ"});
          setStatus("Đã mở chia sẻ ✓");
        } else setStatus("Trình duyệt chưa hỗ trợ chia sẻ file. Hãy bấm Lưu ảnh.");
      }catch(err){
        if(String(err?.name||"") !== "AbortError"){ console.error(err); setStatus("Không thể mở chia sẻ"); }
      }finally{ btn.disabled = false; btn.textContent = "↗ Chia sẻ"; }
    });
  }

  async function captureChecklist(){
    if(!els.checklistPanel.classList.contains("show")) return;
    els.captureBtn.disabled = true;
    const oldText = els.captureBtn.textContent;
    els.captureBtn.textContent = "⏳ Đang tải công cụ…";
    try{ await ensureHtml2Canvas(); }
    catch(e){ setStatus(e.message); els.captureBtn.disabled = false; els.captureBtn.textContent = oldText; return; }
    els.captureBtn.textContent = "⏳ Đang tạo ảnh…";
    const clone = els.checklistPanel.cloneNode(true);
    clone.id = "checklistCaptureTemp";
    clone.querySelector("#checklistActions")?.remove();
    clone.style.cssText = `position:absolute!important;left:-100000px!important;top:0!important;width:${Math.min(window.innerWidth*0.90, 460)}px!important;max-height:none!important;height:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;background:linear-gradient(145deg,#ffffff,#f4faf3 55%,#edf6eb)!important;padding:22px!important;border-radius:26px!important;border:1px solid #cbdcc9!important;box-shadow:0 16px 45px rgba(53,91,61,.12)!important;overflow:visible!important;`;
    const scroll = clone.querySelector("#checklistScroll");
    if(scroll){ scroll.style.maxHeight = "none"; scroll.style.height = "auto"; scroll.style.overflow = "visible"; }
    document.body.appendChild(clone);
    let imageUrl = null;
    try{
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(clone, {backgroundColor:null, scale:Math.min(3, Math.max(2, window.devicePixelRatio || 2)), useCORS:true, allowTaint:false, logging:false, imageTimeout:10000, width:clone.offsetWidth, height:clone.scrollHeight, windowWidth:clone.offsetWidth, windowHeight:clone.scrollHeight});
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 1));
      if(!blob) throw new Error("Không tạo được ảnh");
      imageUrl = URL.createObjectURL(blob);
      showCapturePreview(imageUrl, blob);
      setStatus("Đã tạo ảnh checklist ✓");
    }catch(err){
      console.error(err);
      setStatus("Chụp checklist thất bại");
      if(imageUrl){ URL.revokeObjectURL(imageUrl); imageUrl = null; }
    }finally{
      clone.remove();
      els.captureBtn.disabled = false;
      els.captureBtn.textContent = oldText;
    }
  }
  els.captureBtn.addEventListener("click", captureChecklist);

  function resetHome(){
    document.getElementById("q2answers")?.remove();
    window.BXH?.close?.();
    els.checklistPanel.classList.remove("show");
    restartAutoSync();
    els.message.classList.remove("show");
    els.wheelArea.classList.remove("show");
    els.wheelArea.style.opacity = "0";
    els.wheelArea.style.pointerEvents = "none";
    els.confirm.classList.remove("show");
    syncQuickTools();
    q1Opened = false;
    els.question.classList.remove("hero-wheel-open");
    current = 0;
    mainWheel.setIndex(0);
    els.counter.textContent = "CÂU 1";
    _lastTop3Signature = "";
    renderLandingState(true);
    els.hint.textContent = isChecklistLocked() ? "" : (names.length ? "Chạm vào câu hỏi" : "Đang tải dữ liệu…");
  }

  let _adminFilter = "all", _adminSearchTerm = "";
  function renderAdminChecklistEditor(){
    if(!els.adminChecklistRows) return;
    if(!names.length){
      els.adminChecklistRows.innerHTML = '<div class="admin-list-empty">Chưa có danh sách kiểm duyệt viên</div>';
      if(els.adminChecklistStats) els.adminChecklistStats.innerHTML = "";
      return;
    }
    const frag = document.createDocumentFragment();
    names.forEach((name, i) => {
      const isChecked = !!checked[i], time = times[i] || "";
      const row = document.createElement("div");
      row.className = "admin-row-item" + (isChecked ? " checked" : "");
      row.dataset.name = String(name || "").toLowerCase();
      row.dataset.checked = isChecked ? "1" : "0";
      const nameEl = document.createElement("span");
      nameEl.className = "admin-row-name";
      nameEl.textContent = name || ("Kiểm duyệt viên " + (i+1));
      const timeEl = document.createElement("span");
      timeEl.className = "admin-row-time" + (time ? "" : " empty");
      timeEl.textContent = time || "—";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-row-btn" + (isChecked ? " checked" : "");
      btn.textContent = isChecked ? "Bỏ check" : "Check";
      btn.addEventListener("click", () => adminToggleCheck(i, btn));
      row.append(nameEl, timeEl, btn);
      frag.appendChild(row);
    });
    els.adminChecklistRows.innerHTML = "";
    els.adminChecklistRows.appendChild(frag);
    const checkedCount = checked.filter(Boolean).length;
    if(els.adminChecklistStats) els.adminChecklistStats.innerHTML = `<span>👥 ${names.length} người</span><span>✓ ${checkedCount} đã check</span><span>○ ${names.length-checkedCount} chưa check</span>`;
    applyChecklistFilter();
  }

  async function adminToggleCheck(i, btn){
    const next = !checked[i];
    btn.disabled = true; btn.textContent = "...";
    try{
      const token = AdminSession.get();
      if(!token) throw new Error("Phiên admin đã hết hạn");
      const r = await window.__srankApi("adminSetCheck", {token, name:names[i], checked: next ? "true" : "false"}, TIMEOUT.FAST);
      if(!r.ok) throw new Error(r.error || "Không cập nhật được");
      checked[i] = next;
      times[i] = next ? ((r.data && r.data.time) || hhmm()) : "";
      if(r.data && Number.isFinite(Number(r.data.points))){
        points[i] = Number(r.data.points);
        ranks[i] = normalizeServerRank(r.data.rank, points[i]);
      }
      stateDay = todayKey();
      cacheSave(); renderChecklist(true); renderAdminChecklistEditor(); renderAdminStats();
      LiveFeed.refresh();
      if(!q1Opened && !els.checklistPanel.classList.contains("show")) renderLandingState();
      setStatus(next ? "Đã check ✓" : "Đã bỏ check ✓");
    }catch(e){
      els.adminStatus.textContent = e.message || "Không cập nhật được";
      els.adminStatus.classList.remove("warn"); els.adminStatus.classList.add("error");
      btn.disabled = false; btn.textContent = checked[i] ? "Bỏ check" : "Check";
    }
  }
  function applyChecklistFilter(){
    if(!els.adminChecklistRows) return;
    els.adminChecklistRows.querySelectorAll(".admin-row-item").forEach(row => {
      const name = row.dataset.name || "", isChecked = row.dataset.checked === "1";
      const matchSearch = !_adminSearchTerm || name.includes(_adminSearchTerm);
      const matchFilter = _adminFilter === "all" || (_adminFilter === "checked" && isChecked) || (_adminFilter === "unchecked" && !isChecked);
      row.style.display = matchSearch && matchFilter ? "" : "none";
    });
  }
  function renderAdminStats(){
    const total = names.length, checkedCount = checked.filter(Boolean).length;
    if(els.adminStatTotal) els.adminStatTotal.textContent = String(total);
    if(els.adminStatChecked) els.adminStatChecked.textContent = String(checkedCount);
    if(els.adminStatUnchecked) els.adminStatUnchecked.textContent = String(total - checkedCount);
    if(els.adminStatTop3){
      const top3 = names.map((name, i) => ({name:String(name||"").trim(), time:String(times[i]||"").trim(), checked:!!checked[i]}))
        .filter(p => p.checked && p.time && p.name)
        .sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3);
      els.adminStatTop3.innerHTML = top3.length
        ? top3.map((p, i) => `<div class="admin-row-item checked"><span class="admin-row-name">${["🥇","🥈","🥉"][i]} ${escapeHtml(p.name)}</span><span class="admin-row-time">${escapeHtml(p.time)}</span></div>`).join("")
        : '<div class="admin-list-empty">Chưa có ai check hôm nay</div>';
    }
  }
  function switchAdminTab(tabName){
    els.adminTabs.forEach(t => t.classList.toggle("active", t.dataset.adminTab === tabName));
    els.adminViews.forEach(v => v.classList.toggle("active", v.dataset.adminView === tabName));
    if(tabName === "checklist") renderAdminChecklistEditor();
    else if(tabName === "stats") renderAdminStats();
  }

  function openAdminSettings(){
    if(!AdminSession.isValid()){
      closeAdminPassword();
      adminUnlocked = false;
      openAdminPassword();
      return;
    }
    closeAdminPassword();
    adminUnlocked = true;
    renderMonitor();
    syncQuickTools();
    els.adminPage.classList.add("show");
    els.adminPage.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    switchAdminTab("schedule");
    if(settingsCache){
      els.resetTimeInput.value = settingsCache.resetTime || resetTime;
      els.checklistLockTimeInput.value = settingsCache.checklistLockTime || checklistLockTime;
      els.adminStatus.textContent = `Giờ reset: ${resetTime} • Khoá: ${checklistLockTime}`;
    } else {
      els.resetTimeInput.value = resetTime;
      els.checklistLockTimeInput.value = checklistLockTime;
      els.adminStatus.textContent = "Đang tải cài đặt…";
    }
    els.adminStatus.classList.remove("error","warn");
    renderAdminChecklistEditor();
    renderAdminStats();
    getSettingsCached(false).then(s => {
      if(!s) return;
      resetTime = s.resetTime || resetTime;
      els.resetTimeInput.value = resetTime;
      if(isValid24hTime(s.checklistLockTime)){ checklistLockTime = s.checklistLockTime; saveChecklistLockTime(checklistLockTime); }
      els.checklistLockTimeInput.value = checklistLockTime;
      els.adminStatus.textContent = `Giờ reset: ${resetTime} • Khoá: ${checklistLockTime}`;
      els.adminStatus.classList.remove("error","warn");
    }).catch(() => {
      els.adminStatus.textContent = "Không tải được cài đặt mới. Đang dùng giá trị trên máy.";
      els.adminStatus.classList.remove("error"); els.adminStatus.classList.add("warn");
    });
  }
  const closeAdmin = () => { els.adminPage.classList.remove("show"); els.adminPage.setAttribute("aria-hidden","true"); document.body.style.overflow = ""; syncQuickTools(); };
  function openAdminPassword(){
    els.adminPasswordMsg.textContent = "";
    els.adminPasswordInput.value = "";
    els.adminPasswordOverlay.style.display = "flex";
    els.adminPasswordOverlay.setAttribute("aria-hidden","false");
    setTimeout(() => els.adminPasswordInput.focus(), 50);
  }
  function closeAdminPassword(){
    els.adminPasswordOverlay.style.display = "none";
    els.adminPasswordOverlay.setAttribute("aria-hidden","true");
  }
  let _adminVerifying = false;
  async function verifyAdmin(){
    if(_adminVerifying) return;
    const rl = AdminSession.checkRateLimit();
    if(!rl.allowed){ els.adminPasswordMsg.textContent = `Quá nhiều lần thử. Vui lòng chờ ${rl.remainSec}s.`; return; }
    const password = els.adminPasswordInput.value.trim();
    if(!password){ els.adminPasswordMsg.textContent = "Vui lòng nhập mật khẩu."; els.adminPasswordInput.focus(); return; }
    _adminVerifying = true;
    els.adminPasswordOk.disabled = true;
    els.adminPasswordOk.textContent = "⏳ Đang mở…";
    try{
      const localOk = await AdminSession.checkPasswordLocal(password);

      if(localOk === false){
        AdminSession.recordFailure();
        els.adminPasswordMsg.textContent = "Mật khẩu không đúng.";
        els.adminPasswordInput.value = "";
        els.adminPasswordInput.focus();
        return;
      }

      els.adminPasswordMsg.textContent = localOk === true
        ? "Đang xác thực với server…"
        : "Đang kết nối server (lần đầu có thể mất 10-15s)…";

      await verifyAdminServer(password);
    }catch(_){
      if(!els.adminPasswordMsg.textContent) els.adminPasswordMsg.textContent = "Không kết nối được server. Kiểm tra mạng rồi thử lại.";
    }finally{
      _adminVerifying = false;
      els.adminPasswordOk.disabled = false;
      els.adminPasswordOk.textContent = "Xác nhận";
    }
  }
  async function verifyAdminServer(password){
    try{
      const r = await window.__srankApi("adminLogin", {password}, TIMEOUT.SLOW);
      if(!r || !r.ok){
        AdminSession.recordFailure(); AdminSession.forgetPassword();
        els.adminPasswordMsg.textContent = (r && r.error) || "Mật khẩu không đúng.";
        els.adminPasswordInput.value = ""; els.adminPasswordInput.focus();
        throw new Error("Sai mật khẩu");
      }
      const token = String(r.data?.token || "");
      const expiresAt = Number(r.data?.expiresAt) || (Date.now() + ADMIN_SESSION_TTL);
      if(!token) throw new Error("Token invalid");
      AdminSession.save(token, expiresAt);
      AdminSession.recordSuccess();
      await AdminSession.rememberPassword(password);
      els.adminPasswordInput.value = "";
      els.adminPasswordMsg.textContent = "";
      openAdminSettings();
    }catch(e){
      if(els.adminPage.classList.contains("show") && !AdminSession.isValid()){
        closeAdmin(); adminUnlocked = false; openAdminPassword();
        els.adminPasswordMsg.textContent = "Xác thực server thất bại. Vui lòng thử lại.";
      }
      throw e;
    }
  }

  function renderMonitor(){
    if(!els.monitorBody) return;
    if(!names.length){
      els.monitorBody.innerHTML = '<tr><td colspan="2" class="monitorEmpty">Chưa có danh sách kiểm duyệt viên.</td></tr>';
      return;
    }
    const frag = document.createDocumentFragment();
    names.forEach((name, i) => {
      const player = name || ("Kiểm duyệt viên " + (i+1));
      const customLink = String(monitorLinks[player] || "").trim();
      const defaultLink = String(MONITOR_DEFAULT_LINKS[player] || "").trim();
      const effectiveLink = customLink || defaultLink || MONITOR_FB_LINK;
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      const nameWrap = document.createElement("div");
      nameWrap.className = "monitorName";
      nameWrap.innerHTML = `<span class="monitorDot"></span><div style="min-width:0"><div class="monitorNameText"></div><span class="monitorLinkState"></span></div>`;
      nameWrap.querySelector(".monitorNameText").textContent = player;
      nameWrap.querySelector(".monitorLinkState").textContent = effectiveLink;
      tdName.appendChild(nameWrap);
      const tdActions = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "monitorActions";
      if(adminUnlocked){
        const assignBtn = document.createElement("button");
        assignBtn.type = "button";
        assignBtn.className = "monitorAssignBtn";
        assignBtn.textContent = customLink ? "Sửa link" : "Gán link";
        assignBtn.addEventListener("click", () => openLinkEditor(player));
        actions.appendChild(assignBtn);
      }
      const checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.className = "monitorCheckBtn";
      checkBtn.textContent = "CHECK";
      checkBtn.addEventListener("click", () => openMonitorFacebook(player));
      actions.appendChild(checkBtn);
      tdActions.appendChild(actions);
      tr.appendChild(tdName);
      tr.appendChild(tdActions);
      frag.appendChild(tr);
    });
    els.monitorBody.innerHTML = "";
    els.monitorBody.appendChild(frag);
  }
  const openMonitor = () => { renderMonitor(); els.monitorOverlay.classList.add("show"); els.monitorOverlay.setAttribute("aria-hidden","false"); syncQuickTools(); };
  const closeMonitor = () => { els.monitorOverlay.classList.remove("show"); els.monitorOverlay.setAttribute("aria-hidden","true"); syncQuickTools(); };
  function openLinkEditor(name){
    editingMonitorName = String(name || "");
    els.linkEditorName.textContent = editingMonitorName || "Kiểm Duyệt Viên";
    els.linkEditorInput.value = String(monitorLinks[editingMonitorName] || "").trim();
    els.linkEditorOverlay.classList.add("show");
    els.linkEditorOverlay.setAttribute("aria-hidden","false");
    setTimeout(() => els.linkEditorInput.focus(), 50);
  }
  function closeLinkEditor(){
    els.linkEditorOverlay.classList.remove("show");
    els.linkEditorOverlay.setAttribute("aria-hidden","true");
    editingMonitorName = "";
  }
  function saveEditedMonitorLink(){
    const name = editingMonitorName;
    if(!name) return;
    const raw = els.linkEditorInput.value.trim();
    if(!raw){ delete monitorLinks[name]; saveMonitorLinks(); closeLinkEditor(); renderMonitor(); setStatus("Đã dùng link mặc định ✓"); return; }
    const link = normalizeMonitorLink(raw);
    if(!link){ setStatus("Link không hợp lệ"); els.linkEditorInput.focus(); return; }
    monitorLinks[name] = link;
    saveMonitorLinks(); closeLinkEditor(); renderMonitor(); setStatus("Đã gán link ✓");
  }
  function clearEditedMonitorLink(){
    const name = editingMonitorName;
    if(!name) return;
    delete monitorLinks[name];
    saveMonitorLinks(); closeLinkEditor(); renderMonitor(); setStatus("Đã xoá link riêng ✓");
  }

  function _syncQuickTools(){
    const otherOpen =
      document.getElementById("kdvRulesOverlay")?.classList.contains("show") ||
      els.monitorOverlay.classList.contains("show") ||
      (window.BXH?.isOpen?.()) ||
      els.checklistPanel.classList.contains("show") ||
      els.adminPage.classList.contains("show") ||
      els.adminPasswordOverlay.style.display === "flex" ||
      els.linkEditorOverlay.classList.contains("show") ||
      els.wheelArea.classList.contains("show") ||
      els.message.classList.contains("show") ||
      els.confirm.classList.contains("show") ||
      document.getElementById("attendanceNameWheel")?.classList.contains("show") ||
      document.getElementById("attendancePage")?.classList.contains("show") ||
      document.getElementById("lunchPage")?.classList.contains("show") ||
      document.getElementById("quizOverlay")?.classList.contains("show") ||
      document.getElementById("liveFeedOverlay")?.classList.contains("show") ||
      document.getElementById("secretMailPage")?.classList.contains("show");
    els.secondaryNav.classList.toggle("nav-hidden", otherOpen);
    els.secondaryNav.setAttribute("aria-hidden", otherOpen ? "true" : "false");
    const smFab = document.getElementById("secretMailBtn");
    if(smFab){
      smFab.classList.toggle("hidden", otherOpen);
      smFab.setAttribute("aria-hidden", otherOpen ? "true" : "false");
    }
  }
  const syncQuickTools = throttleRAF(_syncQuickTools);
  window.syncQuickTools = syncQuickTools;

  els.homeBtn.addEventListener("click", () => {
    resetHome();
    syncQuickTools();
    if(syncInFlight || !initialSheetLoaded) return;
    if(Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS) return;
    if(Date.now() - lastAutoSyncAt < 3000) return;
    lastAutoSyncAt = Date.now();
    loadData(false, true);
  });
  els.checklistBtn.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    _lastUserActionAt = Date.now();
    const willShow = !els.checklistPanel.classList.contains("show");
    if(willShow){
      window.BXH?.close?.();
      els.checklistPanel.classList.add("show");
      renderChecklist();
      if(!initialSheetLoaded) loadData(false);
      els.checklistBtn.setAttribute("aria-expanded", "true");
    } else {
      els.checklistPanel.classList.remove("show");
      els.checklistBtn.setAttribute("aria-expanded", "false");
    }
    restartAutoSync();
    syncQuickTools();
  });
  els.syncBtn.addEventListener("click", () => { lastAutoSyncAt = Date.now(); loadData(true, true); });

  els.monitorBtn.addEventListener("click", openMonitor);
  els.monitorCloseBtn.addEventListener("click", closeMonitor);
  els.monitorOverlay.addEventListener("click", e => { if(e.target === els.monitorOverlay) closeMonitor(); });
  els.linkEditorCancel.addEventListener("click", closeLinkEditor);
  els.linkEditorSave.addEventListener("click", saveEditedMonitorLink);
  els.linkEditorClear.addEventListener("click", clearEditedMonitorLink);
  els.linkEditorOverlay.addEventListener("click", e => { if(e.target === els.linkEditorOverlay) closeLinkEditor(); });
  els.linkEditorInput.addEventListener("keydown", e => { if(e.key === "Enter") saveEditedMonitorLink(); });

  els.adminBtn.addEventListener("click", () => { if(AdminSession.isValid()) openAdminSettings(); else openAdminPassword(); });
  els.adminPasswordOk.addEventListener("click", verifyAdmin);
  els.adminPasswordCancel.addEventListener("click", closeAdminPassword);
  els.adminPasswordOverlay.addEventListener("click", e => { if(e.target === els.adminPasswordOverlay) closeAdminPassword(); });
  els.adminPasswordInput.addEventListener("keydown", e => { if(e.key === "Enter") verifyAdmin(); });
  els.adminPageBack?.addEventListener("click", closeAdmin);
  els.adminPageLogout?.addEventListener("click", () => {
    if(confirm("Đăng xuất khỏi Admin?")){
      AdminSession.clear(); AdminSession.forgetPassword(); adminUnlocked = false; closeAdmin();
      setStatus("Đã đăng xuất admin");
    }
  });
  els.adminTabs.forEach(tab => tab.addEventListener("click", () => switchAdminTab(tab.dataset.adminTab)));
  els.adminFilterBtns.forEach(btn => btn.addEventListener("click", () => {
    els.adminFilterBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    _adminFilter = btn.dataset.filter;
    applyChecklistFilter();
  }));
  els.adminChecklistSearch?.addEventListener("input", e => { _adminSearchTerm = String(e.target.value||"").trim().toLowerCase(); applyChecklistFilter(); });

  els.resetTimeInput.addEventListener("input", () => {
    let v = els.resetTimeInput.value.replace(/\D/g, "").slice(0, 4);
    if(v.length > 2) v = v.slice(0,2) + ":" + v.slice(2);
    els.resetTimeInput.value = v;
  });
  els.checklistLockTimeInput.addEventListener("input", () => {
    let v = els.checklistLockTimeInput.value.replace(/\D/g, "").slice(0, 4);
    if(v.length > 2) v = v.slice(0,2) + ":" + v.slice(2);
    els.checklistLockTimeInput.value = v;
  });
  els.adminSaveBtn.addEventListener("click", async () => {
    const time = els.resetTimeInput.value.trim();
    const lockTime = els.checklistLockTimeInput.value.trim();
    if(!isValid24hTime(time) || !isValid24hTime(lockTime)){ els.adminStatus.textContent = "Giờ không hợp lệ."; return; }
    els.adminSaveBtn.disabled = true;
    els.adminStatus.textContent = "Đang lưu…";
    try{
      const token = AdminSession.get();
      if(!token) throw new Error("Phiên admin đã hết hạn");
      const r = await window.__srankApi("setSettings", {token, resetTime:time, checklistLockTime:lockTime}, TIMEOUT.FAST);
      if(!r.ok) throw new Error(r.error || "Không lưu được");
      resetTime = r.data.resetTime || time;
      checklistLockTime = r.data.checklistLockTime || lockTime;
      saveChecklistLockTime(checklistLockTime);
      els.checklistLockTimeInput.value = checklistLockTime;
      settingsCache = {resetTime, checklistLockTime};
      settingsFetchedAt = Date.now();
      scheduleNextReset();
      _lastLockCheck = 0;
      _cachedLocked = isChecklistLocked();
      renderLandingState();
      els.adminStatus.classList.remove("error","warn");
      els.adminStatus.textContent = `Đã lưu • Reset ${resetTime} • Khoá Checklist ${checklistLockTime}`;
    }catch(_){
      saveChecklistLockTime(lockTime);
      els.checklistLockTimeInput.value = checklistLockTime;
      renderLandingState();
      els.adminStatus.textContent = "Chưa lưu được lên hệ thống. Kiểm tra kết nối rồi thử lại.";
    }finally{ els.adminSaveBtn.disabled = false; }
  });

  addEventListener("keydown", e => {
    if(!els.wheelArea.classList.contains("show")) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); mainWheel.setIndex(mainWheel.getIndex() + 1); els.confirm.classList.add("show"); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); mainWheel.setIndex(mainWheel.getIndex() - 1); els.confirm.classList.add("show"); }
    else if(e.key === "Enter" && els.confirm.classList.contains("show")){ e.preventDefault(); els.confirm.click(); }
  });

  document.addEventListener("keydown", e => {
    if(e.key !== "Escape") return;
    const capturePreview = document.getElementById("capturePreview");
    if(capturePreview){ capturePreview.remove(); e.preventDefault(); return; }
    const quizOverlay = document.getElementById("quizOverlay");
    if(quizOverlay && quizOverlay.classList.contains("show")){
      if(typeof window.Quiz?.close === "function") window.Quiz.close();
      e.preventDefault(); return;
    }
    const liveFeed = document.getElementById("liveFeedOverlay");
    if(liveFeed && liveFeed.classList.contains("show")){ LiveFeed.close(); e.preventDefault(); return; }
    if(els.linkEditorOverlay.classList.contains("show")){ closeLinkEditor(); e.preventDefault(); return; }
    if(els.monitorOverlay.classList.contains("show")){ closeMonitor(); e.preventDefault(); return; }
    if(window.BXH?.isOpen?.()){ window.BXH.close(); syncQuickTools(); e.preventDefault(); return; }
    if(els.checklistPanel.classList.contains("show")){ els.checklistPanel.classList.remove("show"); syncQuickTools(); e.preventDefault(); return; }
    if(els.adminPage.classList.contains("show")){ closeAdmin(); e.preventDefault(); return; }
    if(els.adminPasswordOverlay.style.display === "flex"){ closeAdminPassword(); e.preventDefault(); return; }
    const attendanceNameWheel = document.getElementById("attendanceNameWheel");
    if(attendanceNameWheel && attendanceNameWheel.classList.contains("show")){
      attendanceNameWheel.classList.remove("show"); attendanceNameWheel.setAttribute("aria-hidden","true"); syncQuickTools(); e.preventDefault(); return;
    }
    const attendanceStatusOverlay = document.getElementById("attendanceStatusOverlay");
    if(attendanceStatusOverlay && attendanceStatusOverlay.classList.contains("show")){
      attendanceStatusOverlay.classList.remove("show"); attendanceStatusOverlay.setAttribute("aria-hidden","true"); e.preventDefault(); return;
    }
    const attendancePage = document.getElementById("attendancePage");
    if(attendancePage && attendancePage.classList.contains("show")){
      if(typeof window.__closeAttendancePage === "function") window.__closeAttendancePage();
      else attendancePage.classList.remove("show");
      syncQuickTools(); e.preventDefault(); return;
    }
    if(els.wheelArea.classList.contains("show")){ resetHome(); e.preventDefault(); return; }
  });

  document.addEventListener("visibilitychange", () => {
    if(document.hidden) return;
    _lastLockCheck = 0;
    if(syncInFlight || !initialSheetLoaded) return;
    if(els.wheelArea.classList.contains("show") || els.message.classList.contains("show")) return;
    if(Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS) return;
    if(Date.now() - lastAutoSyncAt < 3000) return;
    lastAutoSyncAt = Date.now();
    loadData(false, true);
  });

  window.addEventListener("focus", () => {
    if(document.hidden) return;
    if(syncInFlight || !initialSheetLoaded) return;
    if(els.wheelArea.classList.contains("show") || els.message.classList.contains("show")) return;
    if(Date.now() - _lastUserActionAt < USER_ACTION_PAUSE_MS) return;
    if(Date.now() - lastAutoSyncAt < 3000) return;
    lastAutoSyncAt = Date.now();
    loadData(false, true);
  });

  window.__getChecklistNames = () => Array.isArray(names) ? names.slice() : [];
  window.__getChecklistState = () => ({
    names: Array.isArray(names) ? names.slice() : [],
    checked: Array.isArray(checked) ? checked.slice() : [],
    times: Array.isArray(times) ? times.slice() : []
  });
  window.__clearCheckinForName = async function(name){
    const cleanName = String(name || "").trim();
    if(!cleanName) return false;
    const idx = names.indexOf(cleanName);
    if(idx < 0) return false;
    if(!checked[idx] && !times[idx]) return true;
    const prevChecked = checked[idx], prevTime = times[idx];
    checked[idx] = false; times[idx] = "";
    stateDay = todayKey();
    cacheSave(); renderChecklist(true);
    LiveFeed.refresh();
    if(!q1Opened && !els.checklistPanel.classList.contains("show")) renderLandingState();
    try{
      const token = AdminSession.get();
      if(!token) throw new Error("Phiên admin đã hết hạn — không xoá được checkin");
      const r = await window.__srankApi("adminSetCheck", {token, name:cleanName, checked:"false"}, TIMEOUT.FAST);
      if(!r.ok) throw new Error(r.error || "Không xoá được checkin");
      if(r.data && Number.isFinite(Number(r.data.points))){
        points[idx] = Number(r.data.points);
        ranks[idx] = normalizeServerRank(r.data.rank, points[idx]);
      }
      return true;
    }catch(e){
      checked[idx] = prevChecked; times[idx] = prevTime;
      cacheSave(); renderChecklist(true);
      LiveFeed.refresh();
      if(!q1Opened && !els.checklistPanel.classList.contains("show")) renderLandingState();
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
    onTopOpen: () => {
      try{ closeAdmin(); }catch(_){}
      els.checklistPanel.classList.remove("show");
    }
  });

  loadChecklistLockTime();
  els.checklistLockTimeInput.value = checklistLockTime;

  let _loadDataPromise = null;
  if(cacheLoad()){
    initialSheetLoaded = true;
    renderChecklist(true);
    buildWheel();
    els.hint.textContent = names.length ? "Chạm vào câu hỏi" : "Đang tải dữ liệu…";
    setStatus("Đã tải dữ liệu lưu ✓");
    _loadDataPromise = loadData(false, true);
  } else _loadDataPromise = loadData(true);

  renderLandingState();

  (async () => {
    try{
      await _loadDataPromise;
      const s = await getSettingsCached(false);
      if(isValid24hTime(s.resetTime)) resetTime = s.resetTime;
      if(isValid24hTime(s.checklistLockTime)){
        checklistLockTime = s.checklistLockTime;
        saveChecklistLockTime(checklistLockTime);
        els.checklistLockTimeInput.value = checklistLockTime;
      }
      renderLandingState();
    }catch(_){}
  })();

  scheduleNextReset();
  _cachedLocked = isChecklistLocked();

  setInterval(() => {
    if(document.hidden) return;
    const now = Date.now();
    if(now - _lastLockCheck > 30000){
      _lastLockCheck = now;
      const nextLocked = isChecklistLocked();
      const lockChanged = nextLocked !== _cachedLocked;
      _cachedLocked = nextLocked;
      if(lockChanged && !q1Opened && !els.checklistPanel.classList.contains("show") && !window.BXH?.isOpen?.()) renderLandingState();
    }
    if(!q1Opened && !els.checklistPanel.classList.contains("show") && !window.BXH?.isOpen?.()){
      if(_cachedLocked){ if(els.hint.textContent !== "") els.hint.textContent = ""; }
      else if(names.length && els.hint.textContent !== "Chạm vào câu hỏi") els.hint.textContent = "Chạm vào câu hỏi";
    }
  }, 1000);

  let _warmupStarted = false;
  function warmupAdmin(){
    if(_warmupStarted) return;
    _warmupStarted = true;
    const ping = () => { if(document.hidden) return; try{ window.__srankApi("getSettings", {_ts:Date.now()}, TIMEOUT.SLOW).catch(()=>{}); }catch(_){} };
    setTimeout(ping, 1500);
    setInterval(ping, 4 * 60 * 1000);
  }
  warmupAdmin();

  (function warmSecretMail(){
    const ping = () => { if(document.hidden) return; try{ window.__srankApi("getSecretMessages", {_ts:Date.now()}, 8000).catch(()=>{}); }catch(_){} };
    setTimeout(ping, 800);
    setInterval(ping, 3 * 60 * 1000);
  })();

  startAutoSync();
  requestAnimationFrame(() => { try{ LiveFeed.init(); }catch(e){ console.error("[LiveFeed]", e); } });
})();

if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", {scope:"/"}).then(reg => {
      reg.update().catch(()=>{});
      if(reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});
    }).catch(err => console.warn("[PWA] SW failed:", err));
  });
}