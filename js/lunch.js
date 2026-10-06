/* =========================================================
   LUNCH — Bữa trưa ăn gì? (v1.0.1)
   FIX: bug shadowing biến trong runSpinAnimation()
        → nút kẹt "ĐANG QUAY..." và không push Live Feed
   ========================================================= */
(function(){
  "use strict";
  if (window.__lunchV2Loaded) return;
  window.__lunchV2Loaded = true;

  const API_TIMEOUT        = 12e3;
  const PUSH_TIMEOUT       = 15e3;
  const SPIN_DURATION_MS   = 1800;
  const SPIN_TICK_START_MS = 60;
  const SPIN_TICK_END_MS   = 260;
  const MAX_NAME_LEN       = 80;
  const POLL_INTERVAL      = 5e3;
  const LAST_PICKED_NAME_KEY = "srank_last_picked_name_v1";

  const CATEGORIES = [
    { key:"home",    label:"Cơm nhà",   icon:"🏠", desc:"Món cơm, mì, bún khô" },
    { key:"soup",    label:"Món nước",  icon:"🍲", desc:"Phở, bún nước, canh" },
    { key:"out",     label:"Ăn ngoài",  icon:"🛵", desc:"Quán ăn, đồ ngoài" },
    { key:"special", label:"Đặc biệt",  icon:"👑", desc:"Món đặc biệt" }
  ];
  const CATEGORY_MAP = {};
  CATEGORIES.forEach(function(c){ CATEGORY_MAP[c.key] = c; });

  const MODES = [
    { key:"all",     label:"Cả 3",      icon:"🎲" },
    { key:"home",    label:"Cơm nhà",   icon:"🏠" },
    { key:"soup",    label:"Món nước",  icon:"🍲" },
    { key:"out",     label:"Ăn ngoài",  icon:"🛵" },
    { key:"special", label:"Đặc biệt",  icon:"👑" }
  ];

  const SPECIAL_PROB         = 0.05;
  const SPECIAL_MAX_PER_DAY  = 3;
  const SPECIAL_ONCE_PER_DAY = true;
  const SPECIAL_API_TIMEOUT  = 8e3;
  const SPECIAL_CACHE_TTL    = 15e3;

  const state = {
    dishes: [],
    loading: false,
    spinning: false,
    sending: false,
    currentMode: "all",
    searchTerm: "",
    lastResult: null,
    pageOpen: false,
    editingDish: null,
    pendingAddCategory: "home",
    specialStat: { total: 0, wonByMe: false, loaded: false }
  };

  let _pollTimer = null;
  let _specialStatCache = { ts: 0, data: null };

  const $ = id => document.getElementById(id);

  const escapeHtml = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const getApi = () =>
    window.__srankApi ? window.__srankApi
    : (window.SRank && window.SRank.api ? window.SRank.api : null);

  const isAdmin = () => {
    try {
      if (window.__srankIsAdmin === true) return true;
      if (window.isAdmin === true) return true;
      const SR = window.SRank;
      if (SR) {
        if (typeof SR.isAdmin === "function") return !!SR.isAdmin();
        if (typeof SR.isAdmin === "boolean") return SR.isAdmin;
        if (SR.role === "admin" || SR.role === "owner") return true;
        if (Array.isArray(SR.roles) && (SR.roles.indexOf("admin") >= 0 || SR.roles.indexOf("owner") >= 0)) return true;
        const c = [SR.user, SR.me, SR.currentUser, SR.profile, SR.account, SR.auth && SR.auth.user];
        for (let i = 0; i < c.length; i++) {
          const u = c[i];
          if (!u) continue;
          if (u.isAdmin === true || u.admin === true || u.is_admin === true) return true;
          if (u.role === "admin" || u.role === "owner") return true;
          if (Array.isArray(u.roles) && (u.roles.indexOf("admin") >= 0 || u.roles.indexOf("owner") >= 0)) return true;
        }
      }
      try {
        const v = localStorage.getItem("srank_is_admin") || localStorage.getItem("isAdmin") || localStorage.getItem("srank_role");
        if (v === "true" || v === "1" || v === "admin" || v === "owner") return true;
      } catch (_) {}
      return false;
    } catch (_) { return false; }
  };

  const uuid = () => {
    if (window.SRank && typeof window.SRank.uuid === "function") return window.SRank.uuid();
    try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return "ck_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  };

  const notify = (msg, type) => {
    try {
      if (typeof window.SRank === "object" && typeof window.SRank.setStatus === "function") {
        return void window.SRank.setStatus(msg);
      }
    } catch (_) {}
    console.log("[" + (type || "info") + "]", msg);
  };

  function pickRandom(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function getMyName() {
    try { return String(localStorage.getItem(LAST_PICKED_NAME_KEY) || "").trim() || "Ẩn danh"; }
    catch (_) { return "Ẩn danh"; }
  }

  async function pushLunchToFeed(dish) {
    if (!dish || !dish.name) return { ok: false, reason: "invalid_dish" };
    try {
      const LF = window.SRank && window.SRank.LiveFeed;
      if (!LF || typeof LF.push !== "function") return { ok: false, reason: "no_livefeed" };

      const cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;
      const clientKey = uuid();
      const pushed = LF.push({
        type: "lunch",
        name: getMyName(),
        clientKey: clientKey,
        meta: { dish: dish.name, category: dish.category, icon: cat.icon, special: dish.category === "special" }
      });

      if (!pushed) return { ok: false, reason: "push_failed", clientKey: clientKey };

      if (typeof LF.waitForPush === "function") {
        const res = await LF.waitForPush(clientKey, PUSH_TIMEOUT);
        return { ok: !!(res && res.ok), clientKey: clientKey, event: res && res.event, reason: res && res.reason };
      }
      return { ok: true, clientKey: clientKey, event: pushed };
    } catch (e) {
      console.log("[lunch] push feed error", e);
      return { ok: false, reason: "exception" };
    }
  }

  function getTodayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  async function countSpecialToday(force) {
    const now = Date.now();
    if (!force && _specialStatCache.data && now - _specialStatCache.ts < SPECIAL_CACHE_TTL) {
      return _specialStatCache.data;
    }
    const api = getApi();
    if (!api) {
      const e = { total: 0, wonByMe: false };
      _specialStatCache = { ts: now, data: e };
      return e;
    }
    try {
      const call = () => api("getLiveEvents", { since: 0, _ts: Date.now() }, SPECIAL_API_TIMEOUT);
      const r = window.SRankScheduler ? await window.SRankScheduler.enqueuePoll(call) : await call();

      if (!r || !r.ok || !r.data || !Array.isArray(r.data.events)) {
        const e = { total: 0, wonByMe: false };
        _specialStatCache = { ts: now, data: e };
        return e;
      }
      const today = getTodayKey();
      const me = getMyName();
      let total = 0, wonByMe = false;

      r.data.events.forEach(function(e) {
        if (e.type !== "lunch") return;
        if (!e.meta || e.meta.special !== true) return;
        const ts = Number(e.ts) || 0;
        if (!ts) return;
        const d = new Date(ts);
        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        if (key !== today) return;
        total++;
        if (String(e.name || "").trim() === me) wonByMe = true;
      });
      const data = { total: total, wonByMe: wonByMe };
      _specialStatCache = { ts: now, data: data };
      return data;
    } catch (e) {
      console.log("[lunch] count special error", e);
      const e2 = { total: 0, wonByMe: false };
      _specialStatCache = { ts: now, data: e2 };
      return e2;
    }
  }

  async function decideSpecialRoll() {
    if (SPECIAL_PROB <= 0) return { hit: false, reason: "disabled", slotsLeft: 0 };
    const pool = getSpecialPool();
    if (!pool.length) return { hit: false, reason: "no_special_dish", slotsLeft: 0 };

    const stat = await countSpecialToday(false);
    state.specialStat = { total: stat.total, wonByMe: stat.wonByMe, loaded: true };

    const slotsLeft = Math.max(0, SPECIAL_MAX_PER_DAY - stat.total);
    if (stat.total >= SPECIAL_MAX_PER_DAY) return { hit: false, reason: "out_of_slots", slotsLeft: 0 };
    if (SPECIAL_ONCE_PER_DAY && stat.wonByMe) return { hit: false, reason: "already_won", slotsLeft: slotsLeft };
    if (Math.random() >= SPECIAL_PROB) return { hit: false, reason: "miss", slotsLeft: slotsLeft };

    const dish = pool[Math.floor(Math.random() * pool.length)];
    return { hit: true, dish: dish, slotsLeft: Math.max(0, slotsLeft - 1) };
  }

  function getSpecialPool() { return state.dishes.filter(function(d) { return d.category === "special"; }); }

  function showSpecialCelebration(dish, slotsLeft) {
    try {
      notify("👑 TRÚNG MÓN ĐẶC BIỆT: " + dish.name, "success");
      const host = document.getElementById("lunchPage") || document.body;
      for (let i = 0; i < 24; i++) {
        const piece = document.createElement("div");
        piece.textContent = i % 3 === 0 ? "👑" : (i % 3 === 1 ? "✨" : "💖");
        piece.style.cssText = "position:fixed;left:50%;top:50%;z-index:99999;font-size:26px;pointer-events:none;";
        const angle = Math.PI * 2 * i / 24;
        const dist = 100 + Math.random() * 260;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        piece.animate([
          { opacity: 0, transform: "translate(-50%,-50%) scale(.3)" },
          { opacity: 1, transform: "translate(-50%,-50%) scale(1.2)", offset: 0.15 },
          { opacity: 0, transform: "translate(calc(-50% + " + x + "px),calc(-50% + " + y + "px)) scale(.6)" }
        ], { duration: 1400, easing: "cubic-bezier(.16,.9,.25,1)", fill: "forwards" });
        host.appendChild(piece);
        setTimeout(function(){ piece.remove(); }, 1500);
      }
      if (typeof slotsLeft === "number" && slotsLeft >= 0) {
        setTimeout(function(){ notify("Còn " + slotsLeft + " suất đặc biệt hôm nay", "info"); }, 1200);
      }
    } catch (_) {}
  }

  async function loadDishes(showError) {
    const api = getApi();
    if (!api) return false;
    state.loading = true;
    renderDishGrid();
    try {
      const r = await api("getLunchDishes", { _ts: Date.now() }, API_TIMEOUT);
      if (!r || !r.ok) throw new Error((r && r.error) || "Không tải được danh sách món");
      const list = (r.data && Array.isArray(r.data.dishes)) ? r.data.dishes : [];
      state.dishes = list
        .filter(function(d) { return d && d.id && d.name; })
        .map(function(d) {
          return { id: String(d.id), category: String(d.category || "home"), name: String(d.name || "").trim() };
        });
      state.loading = false;
      renderDishGrid();
      return true;
    } catch (e) {
      state.loading = false;
      renderDishGrid();
      if (showError !== false) notify((e && e.message) || "Lỗi tải danh sách món", "error");
      return false;
    }
  }

  async function addDish(name, category) {
    const api = getApi();
    if (!api) return { ok: false, error: "Chưa kết nối server" };
    const cleanName = String(name || "").trim();
    if (!cleanName) return { ok: false, error: "Nhập tên món đi" };
    if (cleanName.length > MAX_NAME_LEN) return { ok: false, error: "Tên quá dài" };
    if (cleanName.length < 2) return { ok: false, error: "Tên quá ngắn" };
    try {
      const r = await api("addLunchDish", { name: cleanName, category: category || "home" }, API_TIMEOUT);
      if (r && r.ok) {
        if (r.data && r.data.id) {
          state.dishes.push({
            id: String(r.data.id),
            category: String(r.data.category || category || "home"),
            name: String(r.data.name || cleanName)
          });
          renderDishGrid();
        }
        loadDishes(false);
        return { ok: true, dish: r.data };
      }
      return { ok: false, error: (r && r.error) || "Không thêm được" };
    } catch (e) {
      return { ok: false, error: (e && e.message) || "Lỗi thêm món" };
    }
  }

  async function updateDish(id, name) {
    const api = getApi();
    if (!api) return { ok: false, error: "Chưa kết nối server" };
    const cleanName = String(name || "").trim();
    if (!cleanName) return { ok: false, error: "Nhập tên món đi" };
    if (cleanName.length > MAX_NAME_LEN) return { ok: false, error: "Tên quá dài" };
    if (cleanName.length < 2) return { ok: false, error: "Tên quá ngắn" };
    try {
      const r = await api("updateLunchDish", { id: id, name: cleanName }, API_TIMEOUT);
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || "Không sửa được" };
      const idx = state.dishes.findIndex(function(d) { return d.id === id; });
      if (idx >= 0) state.dishes[idx].name = cleanName;
      renderDishGrid();
      loadDishes(false);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) || "Lỗi sửa món" };
    }
  }

  async function deleteDish(id) {
    const api = getApi();
    if (!api) return { ok: false, error: "Chưa kết nối server" };
    try {
      const r = await api("deleteLunchDish", { id: id }, API_TIMEOUT);
      if (r && r.ok) {
        state.dishes = state.dishes.filter(function(d) { return d.id !== id; });
        renderDishGrid();
        loadDishes(false);
        return { ok: true };
      }
      return { ok: false, error: (r && r.error) || "Không xoá được" };
    } catch (e) {
      return { ok: false, error: (e && e.message) || "Lỗi xoá món" };
    }
  }

  function startPolling() {
    stopPolling();
    _pollTimer = setInterval(function() {
      if (!state.pageOpen) return;
      if (document.hidden) return;
      if (state.spinning || state.sending) return;
      const sheet = $("lcSheetOverlay");
      if (sheet && sheet.classList.contains("show")) return;
      loadDishes(false);
    }, POLL_INTERVAL);
  }
  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function injectStyles() {
    if ($("lunchV2Styles")) return;
    const style = document.createElement("style");
    style.id = "lunchV2Styles";
    style.textContent = [
      "#lunchPage{position:fixed;inset:0;z-index:20500;display:none;overflow:hidden;background:radial-gradient(circle at 12% 8%,rgba(255,220,180,.45),transparent 42%),radial-gradient(circle at 88% 92%,rgba(255,180,140,.35),transparent 44%),radial-gradient(circle at 50% 50%,rgba(255,240,220,.3),transparent 60%),linear-gradient(180deg,#fffaf2 0%,#fff5e6 50%,#fff0dc 100%);color:#4a2410;font-family:var(--font, ui-rounded, system-ui);overflow:hidden}",
      "#lunchPage.show{display:block}",
      ".lc-inner{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:calc(14px + env(safe-area-inset-top)) 14px calc(120px + env(safe-area-inset-bottom));box-sizing:border-box}",
      ".lc-shell{width:min(100%,680px);margin:0 auto}",
      ".lc-head{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:10px;margin-bottom:16px}",
      ".lc-head-title{min-width:0;text-align:center;display:flex;flex-direction:column;gap:2px}",
      ".lc-kicker{font-size:9px;font-weight:900;letter-spacing:.26em;color:#b98860;text-transform:uppercase;line-height:1}",
      ".lc-title{font-size:20px;font-weight:950;color:#4a2410;letter-spacing:-.02em;line-height:1.1;margin-top:3px}",
      ".lc-icon-btn{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:1.5px solid rgba(200,140,80,.24);border-radius:14px;background:rgba(255,255,255,.9);color:#8a5a28;font-size:19px;font-weight:900;cursor:pointer;transition:transform .15s ease,background .15s ease;box-shadow:0 3px 10px rgba(200,140,80,.06)}",
      ".lc-icon-btn:active{transform:scale(.92);background:#fff}",
      ".lc-icon-btn.spinning{animation:lcSpin .8s linear infinite;pointer-events:none}",
      "@keyframes lcSpin{to{transform:rotate(360deg)}}",
      ".lc-hero{position:relative;padding:26px 22px 24px;margin-bottom:14px;border-radius:28px;text-align:center;overflow:hidden;background:radial-gradient(ellipse 90% 60% at 50% 0%,rgba(255,255,255,.98) 0%,rgba(255,250,240,.72) 45%,transparent 75%),linear-gradient(180deg,rgba(255,255,255,.96) 0%,rgba(255,250,240,.94) 55%,rgba(255,245,225,.92) 100%);border:1px solid rgba(200,140,80,.22);box-shadow:0 24px 60px -20px rgba(120,80,40,.18),0 12px 32px -12px rgba(120,80,40,.12),inset 0 1px 0 rgba(255,255,255,.95);min-height:200px;display:flex;flex-direction:column;justify-content:center;align-items:center}",
      ".lc-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,rgba(255,255,255,.6) 0%,transparent 45%);pointer-events:none}",
      ".lc-hero.rolling{animation:lcHeroRoll .18s ease-in-out infinite alternate}",
      "@keyframes lcHeroRoll{from{transform:rotate(-.25deg) scale(.998)}to{transform:rotate(.25deg) scale(1.002)}}",
      ".lc-hero-icon{font-size:42px;margin-bottom:8px;line-height:1;filter:drop-shadow(0 4px 8px rgba(120,80,40,.14));transition:transform .3s cubic-bezier(.16,.9,.25,1)}",
      ".lc-hero-label{display:block;margin-bottom:12px;color:#a97848;font-size:10px;font-weight:900;letter-spacing:.28em;text-transform:uppercase}",
      ".lc-hero-dish{display:block;color:#4a2410;font-size:clamp(22px,5.5vw,30px);font-weight:950;line-height:1.15;letter-spacing:-.02em;text-shadow:0 2px 0 rgba(255,255,255,.95);padding:0 8px;word-break:break-word;transition:transform .2s ease}",
      ".lc-hero-cat{display:inline-block;margin-top:10px;padding:3px 12px;border-radius:999px;background:rgba(200,140,80,.14);color:#8a5a28;font-size:11px;font-weight:900;letter-spacing:.06em}",
      ".lc-hero-placeholder{color:#b89878;font-size:clamp(14px,3.5vw,16px);font-weight:800;line-height:1.5;padding:12px 0}",
      ".lc-hero-actions{display:flex;gap:8px;margin-top:16px;justify-content:center;flex-wrap:wrap}",
      ".lc-spin-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:180px;min-height:50px;padding:12px 28px;border:1px solid rgba(200,140,80,.45);border-radius:999px;background:linear-gradient(180deg,#f0a860 0%,#e08840 100%);color:#fff;font-family:inherit;font-size:clamp(13px,3.4vw,15px);font-weight:950;letter-spacing:.14em;text-shadow:0 1px 2px rgba(120,80,40,.28);box-shadow:0 12px 28px -8px rgba(224,136,64,.55),0 4px 10px -2px rgba(120,80,40,.16),inset 0 1px 0 rgba(255,255,255,.32);cursor:pointer;transition:transform .22s ease,box-shadow .22s ease}",
      ".lc-spin-btn:active{transform:scale(.97)}",
      ".lc-spin-btn:disabled{opacity:.6;pointer-events:none}",
      ".lc-spin-btn.sending{background:linear-gradient(180deg,#d0b090 0%,#b08858 100%);box-shadow:none}",
      ".lc-spin-btn.success{background:linear-gradient(180deg,#6fbf7a 0%,#4ea25b 100%);box-shadow:0 8px 18px -6px rgba(78,162,91,.5)}",
      ".lc-spin-btn.error{background:linear-gradient(180deg,#ef5b5b 0%,#d84040 100%);box-shadow:0 8px 18px -6px rgba(216,64,64,.5)}",
      ".lc-spin-btn.special{background:linear-gradient(180deg,#f0c060 0%,#d89020 100%);box-shadow:0 12px 28px -8px rgba(216,144,32,.6),inset 0 1px 0 rgba(255,255,255,.4)}",
      ".lc-spin-btn.viewonly{background:linear-gradient(180deg,#d8c8b0 0%,#b8a888 100%);box-shadow:none;opacity:.7}",
      ".lc-spin-btn-icon{font-size:18px;line-height:1;display:inline-block}",
      ".lc-modes{display:flex;gap:6px;margin-bottom:16px;padding:4px;background:rgba(255,255,255,.7);border:1px solid rgba(200,140,80,.16);border-radius:16px;overflow-x:auto;scrollbar-width:none}",
      ".lc-modes::-webkit-scrollbar{display:none}",
      ".lc-mode{flex:1 1 auto;min-height:42px;padding:6px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:1.5px solid transparent;border-radius:12px;background:transparent;color:#a97848;font-family:inherit;font-size:10.5px;font-weight:900;letter-spacing:.02em;cursor:pointer;white-space:nowrap;transition:background .18s ease,color .18s ease,border-color .18s ease;position:relative}",
      ".lc-mode-icon{font-size:15px;line-height:1}",
      ".lc-mode.active{background:linear-gradient(180deg,#fff5e6,#ffe6cc);border-color:#e0a870;color:#5a3a18}",
      ".lc-mode.mode-special.active{background:linear-gradient(180deg,#fffbe6,#ffe9b8);border-color:#d89020;color:#7a4a10}",
      ".lc-mode-slot{position:absolute;top:2px;right:6px;font-size:8.5px;font-weight:950;padding:1px 5px;border-radius:999px;background:#d89020;color:#fff;letter-spacing:.02em}",
      ".lc-search{position:relative;margin-bottom:14px}",
      ".lc-search-input{width:100%;height:46px;padding:0 44px 0 44px;border:1.5px solid rgba(200,140,80,.24);border-radius:14px;background:rgba(255,255,255,.95);color:#4a2410;font-family:inherit;font-size:15px;font-weight:700;outline:none;transition:border-color .2s ease,box-shadow .2s ease;box-sizing:border-box}",
      ".lc-search-input::placeholder{color:#c9a888}",
      ".lc-search-input:focus{border-color:#e0a870;box-shadow:0 0 0 4px rgba(224,168,112,.15)}",
      ".lc-search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;color:#b98860}",
      ".lc-search-clear{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:26px;height:26px;padding:0;border:0;border-radius:50%;background:rgba(200,140,80,.15);color:#8a5a28;font-size:14px;font-weight:900;cursor:pointer;display:none;align-items:center;justify-content:center}",
      ".lc-search-clear.show{display:flex}",
      ".lc-section{display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 4px}",
      ".lc-section-title{color:#8a5a28;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}",
      ".lc-section-count{font-size:10.5px;font-weight:900;color:#b98860;background:rgba(200,140,80,.12);padding:2px 8px;border-radius:999px}",
      ".lc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:20px}",
      "@media(min-width:520px){.lc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}",
      ".lc-dish{position:relative;padding:14px 12px;min-height:98px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;border:1.5px solid rgba(200,140,80,.2);border-radius:18px;background:linear-gradient(160deg,#ffffff 0%,#fffaf2 100%);box-shadow:0 6px 16px -6px rgba(200,140,80,.14),inset 0 1px 0 rgba(255,255,255,.9);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;overflow:hidden}",
      ".lc-dish:active{transform:scale(.97)}",
      ".lc-dish.highlight{border-color:#e0a870;background:linear-gradient(160deg,#fff5e6 0%,#ffe6cc 100%);box-shadow:0 12px 28px -8px rgba(224,136,64,.32),inset 0 1px 0 rgba(255,255,255,.9)}",
      ".lc-dish.cat-home{border-left:4px solid #7ab896}",
      ".lc-dish.cat-soup{border-left:4px solid #7aa8d8}",
      ".lc-dish.cat-out{border-left:4px solid #d8a878}",
      ".lc-dish.cat-special{border-left:4px solid #e0a870}",
      ".lc-dish-special{border-color:#e0a870;background:linear-gradient(160deg,#fff9e6 0%,#fff2cc 100%);box-shadow:0 8px 20px -6px rgba(224,168,112,.32),inset 0 1px 0 rgba(255,255,255,.95);position:relative}",
      ".lc-dish-special::before{content:'👑';position:absolute;top:6px;right:6px;font-size:14px;line-height:1;filter:drop-shadow(0 2px 3px rgba(180,120,40,.3))}",
      ".lc-dish-special .lc-dish-name{color:#8a5a28;font-weight:950}",
      ".lc-dish-special .lc-dish-cat{background:rgba(224,168,112,.24);color:#7a4a10}",
      ".lc-dish-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}",
      ".lc-dish-cat{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:999px;background:rgba(200,140,80,.12);color:#8a5a28;font-size:9px;font-weight:900;letter-spacing:.03em}",
      ".lc-dish-menu{width:28px;height:28px;padding:0;flex:0 0 auto;display:flex;align-items:center;justify-content:center;border:0;border-radius:9px;background:transparent;color:#b98860;font-size:16px;font-weight:900;cursor:pointer;line-height:1;transition:background .15s ease}",
      ".lc-dish-menu:hover,.lc-dish-menu:active{background:rgba(200,140,80,.15)}",
      ".lc-dish-name{font-size:14px;font-weight:900;color:#4a2410;line-height:1.3;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
      ".lc-empty{grid-column:1/-1;padding:60px 24px;text-align:center;background:rgba(255,255,255,.6);border:1.5px dashed rgba(200,140,80,.32);border-radius:20px}",
      ".lc-empty-icon{font-size:54px;margin-bottom:10px;opacity:.7}",
      ".lc-empty-title{font-size:15px;font-weight:900;color:#8a5a28;margin-bottom:4px}",
      ".lc-empty-sub{font-size:12px;font-weight:700;color:#b89878;line-height:1.5}",
      ".lc-skeleton{min-height:98px;border-radius:18px;background:linear-gradient(90deg,#f5e8d8 0%,#fff5e6 50%,#f5e8d8 100%);background-size:200% 100%;animation:lcSkeleton 1.4s ease-in-out infinite}",
      "@keyframes lcSkeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}",
      ".lc-fab{position:fixed;right:18px;z-index:20600;bottom:max(24px,calc(18px + env(safe-area-inset-bottom)));width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#f0a860,#e08840);color:#fff;font-size:26px;font-weight:900;line-height:1;display:none;align-items:center;justify-content:center;box-shadow:0 14px 32px -8px rgba(224,136,64,.55),0 4px 10px -2px rgba(120,80,40,.2),inset 0 1px 0 rgba(255,255,255,.35);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}",
      ".lc-fab.show{display:flex}",
      ".lc-fab:active{transform:scale(.92)}",
      ".lc-sheet-overlay{position:fixed;inset:0;z-index:20700;display:none;align-items:flex-end;justify-content:center;background:rgba(74,36,16,.42);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}",
      ".lc-sheet-overlay.show{display:flex;animation:lcFade .22s ease}",
      "@keyframes lcFade{from{opacity:0}to{opacity:1}}",
      ".lc-sheet{position:relative;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:20px 18px calc(24px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#fffaf2 0%,#fff5e6 100%);border-radius:26px 26px 0 0;box-shadow:0 -20px 60px rgba(120,80,40,.22);transform:translateY(100%);animation:lcSlideUp .32s cubic-bezier(.16,.9,.25,1) forwards;box-sizing:border-box}",
      "@keyframes lcSlideUp{to{transform:translateY(0)}}",
      ".lc-sheet-handle{width:44px;height:5px;border-radius:99px;background:rgba(200,140,80,.24);margin:0 auto 16px}",
      ".lc-sheet-title{font-size:18px;font-weight:950;color:#4a2410;text-align:center;margin-bottom:4px}",
      ".lc-sheet-sub{font-size:12px;font-weight:800;color:#b89878;text-align:center;margin-bottom:16px;line-height:1.4}",
      ".lc-form-label{display:block;margin-bottom:6px;font-size:11px;font-weight:900;color:#8a5a28;letter-spacing:.08em;text-transform:uppercase}",
      ".lc-form-input{width:100%;height:48px;padding:0 16px;border:1.5px solid rgba(200,140,80,.24);border-radius:14px;background:#fff;color:#4a2410;font-family:inherit;font-size:16px;font-weight:700;outline:none;box-sizing:border-box;transition:border-color .2s ease,box-shadow .2s ease}",
      ".lc-form-input::placeholder{color:#c9a888}",
      ".lc-form-input:focus{border-color:#e0a870;box-shadow:0 0 0 4px rgba(224,168,112,.15)}",
      ".lc-form-group{margin-bottom:14px}",
      ".lc-cat-picker{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}",
      ".lc-cat-opt{padding:10px 6px;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px solid rgba(200,140,80,.2);border-radius:14px;background:#fff;color:#8a5a28;font-family:inherit;font-size:10.5px;font-weight:900;cursor:pointer;transition:transform .15s ease,background .15s ease,border-color .15s ease}",
      ".lc-cat-opt:active{transform:scale(.96)}",
      ".lc-cat-opt.active{background:linear-gradient(160deg,#fff5e6,#ffe6cc);border-color:#e0a870;color:#5a3a18}",
      ".lc-cat-opt.admin-special{background:linear-gradient(160deg,#fffbe6,#ffe9b8);border-color:#d89020;color:#7a4a10}",
      ".lc-cat-opt.admin-special.active{background:linear-gradient(160deg,#fff3c8,#ffe08a);border-color:#c07808;color:#5a3a08}",
      ".lc-cat-opt-icon{font-size:20px;line-height:1}",
      ".lc-form-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}",
      ".lc-form-actions.three{grid-template-columns:1fr 1fr 1fr}",
      ".lc-btn{min-height:48px;padding:0 16px;border:1.5px solid rgba(200,140,80,.24);border-radius:14px;background:#fff;color:#8a5a28;font-family:inherit;font-size:13px;font-weight:900;cursor:pointer;transition:transform .15s ease,background .15s ease}",
      ".lc-btn:active{transform:scale(.96)}",
      ".lc-btn.primary{background:linear-gradient(180deg,#f0a860 0%,#e08840 100%);color:#fff;border-color:transparent;box-shadow:0 8px 18px -6px rgba(224,136,64,.5)}",
      ".lc-btn.danger{background:linear-gradient(180deg,#ef5b5b 0%,#d84040 100%);color:#fff;border-color:transparent;box-shadow:0 8px 18px -6px rgba(216,64,64,.5)}",
      ".lc-btn:disabled{opacity:.5;pointer-events:none}",
      ".lc-form-status{min-height:18px;margin-top:10px;text-align:center;font-size:12px;font-weight:800;color:#4a8a58;line-height:1.3}",
      ".lc-form-status.error{color:#c44a4a}",
      ".lc-confirm{padding:16px;border-radius:16px;background:linear-gradient(160deg,#fff5f5,#ffe8e8);border:1.5px solid rgba(216,64,64,.24);margin-top:4px}",
      ".lc-confirm-text{font-size:13px;font-weight:800;color:#a04040;text-align:center;margin-bottom:14px;line-height:1.45}",
      ".lc-confirm-dish{display:block;margin-top:6px;font-size:15px;font-weight:950;color:#7a2a2a}",
      ".lc-special-bar{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 0 14px;padding:8px 14px;border-radius:999px;background:linear-gradient(180deg,#fffbe6,#ffe9b8);border:1.5px solid rgba(216,144,32,.32);color:#7a4a10;font-size:11.5px;font-weight:900;letter-spacing:.02em;box-shadow:0 4px 12px -4px rgba(216,144,32,.25)}",
      ".lc-special-bar .lc-special-dot{width:7px;height:7px;border-radius:50%;background:#d89020;box-shadow:0 0 0 4px rgba(216,144,32,.18);animation:lcPulse 1.6s ease-in-out infinite}",
      "@keyframes lcPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.25);opacity:.7}}",
      ".lc-special-bar.mine{background:linear-gradient(180deg,#e8f8ea,#d6f0db);border-color:rgba(78,162,91,.35);color:#2f6a3a}",
      ".lc-special-bar.mine .lc-special-dot{background:#4ea25b;box-shadow:0 0 0 4px rgba(78,162,91,.18)}",
      ".lc-special-bar.out{background:linear-gradient(180deg,#f5f5f5,#e8e8e8);border-color:rgba(150,150,150,.3);color:#7a7a7a}",
      ".lc-special-bar.out .lc-special-dot{background:#999;box-shadow:0 0 0 4px rgba(150,150,150,.15);animation:none}",
      ".lc-special-bar.viewonly{background:linear-gradient(180deg,#eef4ff,#dde9ff);border-color:rgba(100,140,220,.35);color:#2a4a80}",
      ".lc-special-bar.viewonly .lc-special-dot{background:#4a7ac8;box-shadow:0 0 0 4px rgba(74,122,200,.18);animation:none}",
      "@media(max-width:420px){.lc-grid{gap:8px}.lc-dish{padding:12px 10px;min-height:90px}.lc-dish-name{font-size:13px}.lc-hero{padding:22px 18px 20px}.lc-hero-dish{font-size:clamp(20px,5.5vw,26px)}.lc-title{font-size:18px}.lc-fab{width:52px;height:52px;font-size:24px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function buildPage() {
    if ($("lunchPage")) return;
    const page = document.createElement("section");
    page.id = "lunchPage";
    page.setAttribute("aria-hidden", "true");
    page.innerHTML = [
      '<div class="lc-inner">',
      '<div class="lc-shell">',
        '<header class="lc-head">',
          '<button type="button" class="lc-icon-btn" id="lcBackBtn" aria-label="Quay lại">←</button>',
          '<div class="lc-head-title">',
            '<span class="lc-kicker">HỆ THỐNG 03</span>',
            '<span class="lc-title">Bữa trưa ăn gì?</span>',
          '</div>',
          '<button type="button" class="lc-icon-btn" id="lcRefreshBtn" aria-label="Tải lại">⟳</button>',
        '</header>',
        '<section class="lc-hero" id="lcHero">',
          '<div class="lc-hero-icon" id="lcHeroIcon">🍜</div>',
          '<span class="lc-hero-label">Hôm nay ăn gì?</span>',
          '<div id="lcHeroBody">',
            '<span class="lc-hero-placeholder">Bấm "Quay ngay" để chọn món</span>',
          '</div>',
          '<div class="lc-hero-actions">',
            '<button type="button" class="lc-spin-btn" id="lcSpinBtn">',
              '<span class="lc-spin-btn-icon" id="lcSpinBtnIcon">🎲</span>',
              '<span id="lcSpinBtnText">QUAY NGAY</span>',
            '</button>',
          '</div>',
        '</section>',
        '<div id="lcSpecialBar"></div>',
        '<div class="lc-modes" id="lcModes"></div>',
        '<div class="lc-search">',
          '<span class="lc-search-icon">🔍</span>',
          '<input type="text" class="lc-search-input" id="lcSearchInput" placeholder="Tìm món ăn…" autocomplete="off">',
          '<button type="button" class="lc-search-clear" id="lcSearchClear" aria-label="Xoá tìm kiếm">×</button>',
        '</div>',
        '<div class="lc-section">',
          '<span class="lc-section-title">Danh sách món</span>',
          '<span class="lc-section-count" id="lcSectionCount">0 món</span>',
        '</div>',
        '<div class="lc-grid" id="lcGrid"></div>',
      '</div>',
      '</div>',
      '<button type="button" class="lc-fab" id="lcAddFab" aria-label="Thêm món">+</button>',
      '<div class="lc-sheet-overlay" id="lcSheetOverlay" aria-hidden="true">',
        '<div class="lc-sheet" id="lcSheet" role="dialog" aria-modal="true">',
          '<div class="lc-sheet-handle"></div>',
          '<div id="lcSheetContent"></div>',
        '</div>',
      '</div>'
    ].join("");
    document.body.appendChild(page);
  }

  function getFilteredDishes() {
    const term = state.searchTerm.toLowerCase().trim();
    return state.dishes.filter(function(d) {
      if (state.currentMode === "all" && d.category === "special") return false;
      if (state.currentMode !== "all" && d.category !== state.currentMode) return false;
      if (term && d.name.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function getDishPool() {
    const nonSpecial = state.dishes.filter(function(d) { return d.category !== "special"; });
    if (state.currentMode === "all") return nonSpecial;
    if (state.currentMode === "special") return getSpecialPool();
    return nonSpecial.filter(function(d) { return d.category === state.currentMode; });
  }

  function renderModes() {
    const host = $("lcModes");
    if (!host) return;
    host.innerHTML = "";
    const slotsLeft = Math.max(0, SPECIAL_MAX_PER_DAY - (state.specialStat.total || 0));
    MODES.forEach(function(mode) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lc-mode" + (state.currentMode === mode.key ? " active" : "");
      if (mode.key === "special") btn.classList.add("mode-special");
      btn.dataset.mode = mode.key;
      let html = '<span class="lc-mode-icon">' + mode.icon + '</span><span>' + mode.label + "</span>";
      if (mode.key === "special" && state.specialStat.loaded && slotsLeft > 0) {
        html += '<span class="lc-mode-slot">' + slotsLeft + "</span>";
      }
      btn.innerHTML = html;
      btn.addEventListener("click", function() {
        if (state.spinning || state.sending) return;
        state.currentMode = mode.key;
        renderModes();
        updateSpinBtnForMode();
        renderSpecialBar();
        renderDishGrid();
      });
      host.appendChild(btn);
    });
  }

  function updateSpinBtnForMode() {
    const btn = $("lcSpinBtn");
    const text = $("lcSpinBtnText");
    const icon = $("lcSpinBtnIcon");
    if (!btn || !text) return;
    if (state.spinning || state.sending) return;
    if (state.currentMode === "special") {
      btn.classList.add("viewonly");
      btn.disabled = true;
      btn.style.opacity = "0.7";
      if (icon) icon.textContent = "👑";
      text.textContent = "CHỈ ĐỂ XEM";
      return;
    }
    btn.classList.remove("viewonly");
    btn.disabled = false;
    btn.style.opacity = "";
    if (icon) icon.textContent = "🎲";
    text.textContent = "QUAY NGAY";
  }

  function renderSpecialBar() {
    const host = $("lcSpecialBar");
    if (!host) return;
    if (state.currentMode === "special") {
      host.innerHTML = '<div class="lc-special-bar viewonly"><span class="lc-special-dot"></span><span>Tab Đặc biệt chỉ để xem · Quay ở "Cả 3" để có cơ hội trúng 👑</span></div>';
      return;
    }
    if (!state.specialStat.loaded) { host.innerHTML = ""; return; }
    const total = state.specialStat.total || 0;
    const left = Math.max(0, SPECIAL_MAX_PER_DAY - total);
    if (left <= 0) {
      host.innerHTML = '<div class="lc-special-bar out"><span class="lc-special-dot"></span><span>Hết suất đặc biệt hôm nay · Mai quay lại nhé</span></div>';
      return;
    }
    if (SPECIAL_ONCE_PER_DAY && state.specialStat.wonByMe) {
      host.innerHTML = '<div class="lc-special-bar mine"><span class="lc-special-dot"></span><span>Bạn đã trúng đặc biệt hôm nay rồi 👑</span></div>';
      return;
    }
    host.innerHTML = '<div class="lc-special-bar"><span class="lc-special-dot"></span><span>Còn ' + left + "/" + SPECIAL_MAX_PER_DAY + " suất đặc biệt hôm nay · Cơ hội " + Math.round(SPECIAL_PROB * 100) + "%</span></div>";
  }

  function renderHero() {
    const body = $("lcHeroBody");
    const icon = $("lcHeroIcon");
    if (!body || !icon) return;
    if (!state.lastResult) {
      icon.textContent = "🍜";
      body.innerHTML = '<span class="lc-hero-placeholder">Bấm "Quay ngay" để chọn món</span>';
      return;
    }
    const r = state.lastResult;
    const cat = CATEGORY_MAP[r.category] || CATEGORY_MAP.home;
    icon.textContent = cat.icon;
    body.innerHTML = '<span class="lc-hero-dish">' + escapeHtml(r.name) + '</span><span class="lc-hero-cat">' + escapeHtml(cat.label) + "</span>";
  }

  function renderDishGrid() {
    const grid = $("lcGrid");
    const countEl = $("lcSectionCount");
    if (!grid) return;
    if (state.loading && state.dishes.length === 0) {
      grid.innerHTML = "";
      for (let i = 0; i < 4; i++) {
        const sk = document.createElement("div");
        sk.className = "lc-skeleton";
        grid.appendChild(sk);
      }
      if (countEl) countEl.textContent = "Đang tải…";
      return;
    }
    const list = getFilteredDishes();
    if (countEl) countEl.textContent = list.length + " món";
    if (list.length === 0) {
      const hasSearch = state.searchTerm.trim().length > 0;
      const isFiltered = state.currentMode !== "all";
      let title = "Chưa có món nào";
      let sub = "Bấm nút + để thêm món đầu tiên";
      if (state.currentMode === "special" && !hasSearch) {
        title = "Chưa có món đặc biệt";
        sub = isAdmin() ? "Bấm nút + để thêm món đặc biệt 👑" : "Món đặc biệt được thêm từ phía admin 👑";
      } else if (hasSearch) {
        title = "Không tìm thấy";
        sub = 'Không có món nào khớp "' + escapeHtml(state.searchTerm) + '"';
      } else if (isFiltered) {
        title = "Mục này trống";
        sub = "Bấm nút + để thêm món vào mục này";
      }
      grid.innerHTML = '<div class="lc-empty"><div class="lc-empty-icon">🍽️</div><div class="lc-empty-title">' + title + '</div><div class="lc-empty-sub">' + sub + "</div></div>";
      return;
    }
    grid.innerHTML = "";
    list.forEach(function(dish) {
      const cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;
      const isHighlight = state.lastResult && state.lastResult.id === dish.id;
      const isSpecial = dish.category === "special";
      const card = document.createElement("div");
      card.className = "lc-dish cat-" + dish.category + (isHighlight ? " highlight" : "") + (isSpecial ? " lc-dish-special" : "");
      card.innerHTML = '<div class="lc-dish-top"><span class="lc-dish-cat">' + cat.icon + " " + escapeHtml(cat.label) + '</span><button type="button" class="lc-dish-menu" aria-label="Tuỳ chọn">⋯</button></div>' + '<div class="lc-dish-name">' + escapeHtml(dish.name) + "</div>";
      card.addEventListener("click", function(e) {
        if (e.target.closest(".lc-dish-menu")) return;
        if (state.spinning || state.sending) return;
        state.lastResult = { id: dish.id, name: dish.name, category: dish.category };
        renderHero();
        renderDishGrid();
      });
      const menuBtn = card.querySelector(".lc-dish-menu");
      menuBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        openEditSheet(dish);
      });
      grid.appendChild(card);
    });
  }

  function render() {
    renderModes();
    updateSpinBtnForMode();
    renderSpecialBar();
    renderHero();
    renderDishGrid();
  }

  async function refreshSpecialStat(force) {
    try {
      const stat = await countSpecialToday(!!force);
      state.specialStat = { total: stat.total, wonByMe: stat.wonByMe, loaded: true };
      renderModes();
      renderSpecialBar();
    } catch (_) {}
  }

  function setSpinButtonState(kind, label) {
    const btn = $("lcSpinBtn");
    const icon = $("lcSpinBtnIcon");
    const text = $("lcSpinBtnText");
    if (!btn || !text) return;
    btn.classList.remove("sending", "success", "error", "special", "viewonly");
    if (kind === "spin") {
      btn.disabled = true; btn.classList.add("sending");
      if (icon) icon.textContent = "🎲"; text.textContent = label || "ĐANG QUAY…";
      return;
    }
    if (kind === "send") {
      btn.disabled = true; btn.classList.add("sending");
      if (icon) icon.textContent = "⏳"; text.textContent = label || "ĐANG GỬI…";
      return;
    }
    if (kind === "ok") {
      btn.disabled = true; btn.classList.add("success");
      if (icon) icon.textContent = "✓"; text.textContent = label || "ĐÃ GỬI";
      return;
    }
    if (kind === "special-ok") {
      btn.disabled = true; btn.classList.add("special");
      if (icon) icon.textContent = "👑"; text.textContent = label || "ĐẶC BIỆT!";
      return;
    }
    if (kind === "err") {
      btn.disabled = false; btn.classList.add("error");
      if (icon) icon.textContent = "⚠"; text.textContent = label || "LỖI — THỬ LẠI";
      return;
    }
    btn.disabled = false;
    if (icon) icon.textContent = "🎲";
    text.textContent = label || "QUAY NGAY";
  }

  /* FIX: đổi tên biến nội bộ để không shadow biến ngoài */
  function runSpinAnimation(pool, finalDish) {
    return new Promise(function(resolve) {
      const hero = $("lcHero");
      const body = $("lcHeroBody");
      const icon = $("lcHeroIcon");
      if (hero) hero.classList.add("rolling");
      setSpinButtonState("spin", "ĐANG QUAY…");

      const source = (pool && pool.length) ? pool : [finalDish];
      const shuffled = shuffleArray(source);
      const totalTicks = Math.max(12, Math.min(24, 2 * source.length));
      const frames = [];
      for (let i = 0; i < totalTicks; i++) frames.push(shuffled[i % shuffled.length]);
      frames.push(finalDish);

      const startTime = Date.now();
      const duration = 1800;
      let lastIdx = 0;

      !function frame() {
        const now = Date.now();
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const idx = Math.floor(eased * (frames.length - 1));
        if (idx > lastIdx) lastIdx = idx;

        const dish = frames[Math.min(lastIdx, frames.length - 1)];
        const cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;

        if (icon) icon.textContent = cat.icon;
        if (body) body.innerHTML = '<span class="lc-hero-dish">' + escapeHtml(dish.name) + '</span><span class="lc-hero-cat">' + escapeHtml(cat.label) + "</span>";

        if (progress < 1) {
          const tick = SPIN_TICK_START_MS + (SPIN_TICK_END_MS - SPIN_TICK_START_MS) * eased;
          setTimeout(frame, tick);
        } else {
          if (hero) hero.classList.remove("rolling");
          resolve();
        }
      }();
    });
  }

  async function spin() {
    if (state.spinning || state.sending) return;
    if (state.currentMode === "special") {
      notify("Tab Đặc biệt chỉ để xem — quay ở 'Cả 3' để có cơ hội trúng 👑", "info");
      return;
    }
    state.spinning = true;
    const pool = getDishPool();
    if (pool.length === 0) {
      state.spinning = false;
      notify("Chưa có món nào để quay", "error");
      return;
    }
    let rollResult = null;
    if (state.currentMode === "all") {
      rollResult = await decideSpecialRoll();
      renderModes();
      renderSpecialBar();
      if (rollResult.reason === "out_of_slots") notify("Hôm nay đã hết suất đặc biệt rồi 👑", "info");
      else if (rollResult.reason === "already_won") notify("Bạn đã trúng suất đặc biệt hôm nay rồi 👑", "info");
    }
    let finalDish;
    let isSpecial = false;
    if (rollResult && rollResult.hit && rollResult.dish) {
      finalDish = rollResult.dish;
      isSpecial = true;
    } else {
      finalDish = pool.length === 1 ? pool[0] : pickRandom(pool);
    }
    let animationPool = pool;
    if (isSpecial) {
      const nonSpecial = state.dishes.filter(function(d) { return d.category !== "special"; });
      animationPool = nonSpecial.length ? nonSpecial : pool;
    }
    await runSpinAnimation(animationPool, finalDish);
    state.spinning = false;
    state.lastResult = { id: finalDish.id, name: finalDish.name, category: finalDish.category };
    renderHero();
    renderDishGrid();
    if (isSpecial) {
      setSpinButtonState("special-ok", "ĐẶC BIỆT 👑");
      showSpecialCelebration(finalDish, rollResult.slotsLeft);
      refreshSpecialStat(true);
    } else if (pool.length === 1) {
      notify("Chỉ có 1 món — chọn luôn: " + finalDish.name, "success");
    } else {
      notify("Chọn: " + finalDish.name, "success");
    }
    await finalizeSpin(finalDish, isSpecial);
  }

  async function finalizeSpin(dish, isSpecial) {
    if (state.sending) return;
    state.sending = true;
    setSpinButtonState("send", "ĐANG GỬI…");
    let ok = false;
    try {
      const res = await pushLunchToFeed(dish);
      ok = !!(res && res.ok);
    } catch (_) { ok = false; }
    state.sending = false;
    if (ok) {
      if (isSpecial) setSpinButtonState("special-ok", "ĐÃ GỬI 👑");
      else setSpinButtonState("ok", "ĐÃ GỬI ✓");
      setTimeout(function() {
        setSpinButtonState("idle", "QUAY LẠI");
        updateSpinBtnForMode();
      }, 900);
    } else {
      setSpinButtonState("err", "LỖI — THỬ LẠI");
      notify("Không gửi được bữa trưa — bấm thử lại", "error");
    }
  }

  function openAddSheet() {
    if (state.spinning || state.sending) return;
    state.pendingAddCategory = state.currentMode === "all" ? "home" : state.currentMode === "special" ? "special" : state.currentMode;
    showSheet(buildAddContent(), "add");
    setTimeout(function() {
      const inp = $("lcAddInput");
      if (inp) inp.focus();
    }, 250);
  }

  function buildAddContent() {
    const isAdm = isAdmin();
    let catHTML = '<div class="lc-cat-picker" id="lcAddCatPicker">';
    CATEGORIES.forEach(function(c) {
      if (c.key === "special" && !isAdm) return;
      const isActive = state.pendingAddCategory === c.key;
      const cls = "lc-cat-opt" + (c.key === "special" ? " admin-special" : "") + (isActive ? " active" : "");
      catHTML += '<button type="button" class="' + cls + '" data-cat="' + c.key + '"><span class="lc-cat-opt-icon">' + c.icon + '</span><span>' + c.label + "</span></button>";
    });
    catHTML += "</div>";
    return [
      '<div class="lc-sheet-title">Thêm món mới</div>',
      '<div class="lc-sheet-sub">' + (isAdm ? "Admin có thể thêm món đặc biệt 👑" : "Món sẽ xuất hiện trong danh sách ngay lập tức") + "</div>",
      '<div class="lc-form-group">',
        '<label class="lc-form-label" for="lcAddInput">Tên món</label>',
        '<input type="text" class="lc-form-input" id="lcAddInput" maxlength="' + MAX_NAME_LEN + '" placeholder="VD: Cơm tấm sườn…" autocomplete="off">',
      "</div>",
      '<div class="lc-form-group">',
        '<label class="lc-form-label">Danh mục</label>',
        catHTML,
      "</div>",
      '<div class="lc-form-actions">',
        '<button type="button" class="lc-btn" id="lcAddCancel">Huỷ</button>',
        '<button type="button" class="lc-btn primary" id="lcAddSave">Thêm món</button>',
      "</div>",
      '<div class="lc-form-status" id="lcAddStatus"></div>'
    ].join("");
  }

  function bindAddEvents() {
    const inp = $("lcAddInput");
    const save = $("lcAddSave");
    const cancel = $("lcAddCancel");
    const status = $("lcAddStatus");
    const picker = $("lcAddCatPicker");
    if (picker) {
      picker.querySelectorAll("[data-cat]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          state.pendingAddCategory = btn.dataset.cat;
          picker.querySelectorAll("[data-cat]").forEach(function(b) {
            b.classList.toggle("active", b.dataset.cat === state.pendingAddCategory);
          });
        });
      });
    }
    if (cancel) cancel.addEventListener("click", closeSheet);
    if (save && inp) {
      const doSave = async function() {
        const name = inp.value.trim();
        if (!name) { inp.focus(); return; }
        save.disabled = true;
        save.textContent = "Đang thêm…";
        if (status) { status.className = "lc-form-status"; status.textContent = ""; }
        const res = await addDish(name, state.pendingAddCategory);
        save.disabled = false;
        save.textContent = "Thêm món";
        if (res.ok) {
          if (status) { status.className = "lc-form-status"; status.textContent = "Đã thêm!"; }
          inp.value = "";
          notify("Đã thêm: " + name, "success");
          setTimeout(closeSheet, 400);
        } else if (status) {
          status.className = "lc-form-status error";
          status.textContent = res.error || "Lỗi";
        }
      };
      save.addEventListener("click", doSave);
      inp.addEventListener("keydown", function(e) {
        if (e.key === "Enter") { e.preventDefault(); doSave(); }
      });
    }
  }

  function openEditSheet(dish) {
    if (state.spinning || state.sending) return;
    state.editingDish = dish;
    showSheet(buildEditContent(dish), "edit");
    setTimeout(function() {
      const inp = $("lcEditInput");
      if (inp) { inp.focus(); inp.select(); }
    }, 250);
  }

  function buildEditContent(dish) {
    const cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;
    return [
      '<div class="lc-sheet-title">Sửa món ăn</div>',
      '<div class="lc-sheet-sub">' + cat.icon + " " + escapeHtml(cat.label) + "</div>",
      '<div class="lc-form-group">',
        '<label class="lc-form-label" for="lcEditInput">Tên món</label>',
        '<input type="text" class="lc-form-input" id="lcEditInput" maxlength="' + MAX_NAME_LEN + '" value="' + escapeHtml(dish.name) + '" autocomplete="off">',
      "</div>",
      '<div class="lc-form-actions three">',
        '<button type="button" class="lc-btn danger" id="lcEditDelete">Xoá</button>',
        '<button type="button" class="lc-btn" id="lcEditCancel">Huỷ</button>',
        '<button type="button" class="lc-btn primary" id="lcEditSave">Lưu</button>',
      "</div>",
      '<div class="lc-form-status" id="lcEditStatus"></div>'
    ].join("");
  }

  function bindEditEvents() {
    const inp = $("lcEditInput");
    const save = $("lcEditSave");
    const del = $("lcEditDelete");
    const cancel = $("lcEditCancel");
    const status = $("lcEditStatus");
    if (cancel) cancel.addEventListener("click", closeSheet);
    if (del) del.addEventListener("click", function() {
      if (!state.editingDish) return;
      showSheet(buildDeleteConfirm(state.editingDish), "confirm");
    });
    if (save && inp) {
      const doSave = async function() {
        const name = inp.value.trim();
        if (!name || !state.editingDish) return;
        if (name === state.editingDish.name) { closeSheet(); return; }
        save.disabled = true;
        save.textContent = "Đang lưu…";
        if (status) { status.className = "lc-form-status"; status.textContent = ""; }
        const res = await updateDish(state.editingDish.id, name);
        save.disabled = false;
        save.textContent = "Lưu";
        if (res.ok) {
          if (status) { status.className = "lc-form-status"; status.textContent = "Đã lưu!"; }
          notify("Đã sửa món", "success");
          setTimeout(closeSheet, 400);
        } else if (status) {
          status.className = "lc-form-status error";
          status.textContent = res.error || "Lỗi";
        }
      };
      save.addEventListener("click", doSave);
      inp.addEventListener("keydown", function(e) {
        if (e.key === "Enter") { e.preventDefault(); doSave(); }
      });
    }
  }

  function buildDeleteConfirm(dish) {
    return [
      '<div class="lc-sheet-title">Xoá món này?</div>',
      '<div class="lc-confirm">',
        '<div class="lc-confirm-text">Món sẽ bị ẩn khỏi danh sách. Bạn vẫn có thể thêm lại sau.',
          '<span class="lc-confirm-dish">' + escapeHtml(dish.name) + "</span>",
        "</div>",
      "</div>",
      '<div class="lc-form-actions">',
        '<button type="button" class="lc-btn" id="lcDelCancel">Huỷ</button>',
        '<button type="button" class="lc-btn danger" id="lcDelConfirm">Xoá món</button>',
      "</div>",
      '<div class="lc-form-status" id="lcDelStatus"></div>'
    ].join("");
  }

  function bindDeleteEvents() {
    const cancel = $("lcDelCancel");
    const confirm = $("lcDelConfirm");
    const status = $("lcDelStatus");
    if (cancel) cancel.addEventListener("click", closeSheet);
    if (confirm) confirm.addEventListener("click", async function() {
      if (!state.editingDish) return;
      const dish = state.editingDish;
      confirm.disabled = true;
      confirm.textContent = "Đang xoá…";
      if (status) { status.className = "lc-form-status"; status.textContent = ""; }
      const res = await deleteDish(dish.id);
      confirm.disabled = false;
      confirm.textContent = "Xoá món";
      if (res.ok) {
        if (status) { status.className = "lc-form-status"; status.textContent = "Đã xoá!"; }
        if (state.lastResult && state.lastResult.id === dish.id) {
          state.lastResult = null;
          renderHero();
        }
        notify("Đã xoá: " + dish.name, "success");
        setTimeout(closeSheet, 400);
      } else if (status) {
        status.className = "lc-form-status error";
        status.textContent = res.error || "Lỗi";
      }
    });
  }

  function showSheet(html, mode) {
    const overlay = $("lcSheetOverlay");
    const content = $("lcSheetContent");
    if (!overlay || !content) return;
    content.innerHTML = html;
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    if (mode === "confirm") bindDeleteEvents();
    else if (mode === "edit") bindEditEvents();
    else bindAddEvents();
  }

  function closeSheet() {
    const overlay = $("lcSheetOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    state.editingDish = null;
    setTimeout(function() {
      const content = $("lcSheetContent");
      if (content) content.innerHTML = "";
    }, 320);
  }

  async function openPage() {
    const page = $("lunchPage");
    if (!page) return;
    page.classList.add("show");
    page.setAttribute("aria-hidden", "false");
    state.pageOpen = true;
    document.body.style.overflow = "hidden";
    const fab = $("lcAddFab");
    if (fab) fab.classList.add("show");
    const trigger = $("lunchBtn");
    if (trigger) trigger.classList.add("running");
    render();
    loadDishes(true);
    refreshSpecialStat(true);
    startPolling();
    if (typeof window.syncQuickTools === "function") window.syncQuickTools();
  }

  function closePage() {
    const page = $("lunchPage");
    if (!page) return;
    page.classList.remove("show");
    page.setAttribute("aria-hidden", "true");
    state.pageOpen = false;
    document.body.style.overflow = "";
    closeSheet();
    stopPolling();
    const fab = $("lcAddFab");
    if (fab) fab.classList.remove("show");
    const trigger = $("lunchBtn");
    if (trigger) trigger.classList.remove("running");
    if (typeof window.syncQuickTools === "function") window.syncQuickTools();
  }

  function bindEvents() {
    const trigger = $("lunchBtn");
    if (trigger) trigger.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      openPage();
    });
    const back = $("lcBackBtn");
    if (back) back.addEventListener("click", closePage);
    const refresh = $("lcRefreshBtn");
    if (refresh) refresh.addEventListener("click", async function() {
      if (state.spinning || state.sending) return;
      refresh.classList.add("spinning");
      await Promise.all([loadDishes(true), refreshSpecialStat(true)]);
      setTimeout(function() { refresh.classList.remove("spinning"); }, 400);
    });
    const spinBtn = $("lcSpinBtn");
    if (spinBtn) spinBtn.addEventListener("click", spin);
    const addFab = $("lcAddFab");
    if (addFab) addFab.addEventListener("click", openAddSheet);
    const searchInput = $("lcSearchInput");
    const searchClear = $("lcSearchClear");
    if (searchInput) searchInput.addEventListener("input", function(e) {
      state.searchTerm = e.target.value;
      if (searchClear) searchClear.classList.toggle("show", state.searchTerm.length > 0);
      renderDishGrid();
    });
    if (searchClear) searchClear.addEventListener("click", function() {
      if (searchInput) searchInput.value = "";
      state.searchTerm = "";
      searchClear.classList.remove("show");
      renderDishGrid();
    });
    const overlay = $("lcSheetOverlay");
    if (overlay) overlay.addEventListener("click", function(e) {
      if (e.target === overlay) closeSheet();
    });
    document.addEventListener("visibilitychange", function() {
      if (document.hidden || !state.pageOpen) return;
      loadDishes(false);
      refreshSpecialStat(false);
    });
    document.addEventListener("keydown", function(e) {
      if (e.key !== "Escape") return;
      const overlay = $("lcSheetOverlay");
      if (overlay && overlay.classList.contains("show")) {
        closeSheet();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (state.pageOpen) {
        closePage();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });
  }

  function init() {
    injectStyles();
    buildPage();
    bindEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();