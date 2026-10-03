/* =========================================================
   LUNCH v2 — Bữa trưa ăn gì? (Bản lột xác + polling + LiveFeed)
   v2.13: UX lock + idempotency key (clientKey)
   ========================================================= */
(function(){
  "use strict";

  if (window.__lunchV2Loaded) return;
  window.__lunchV2Loaded = true;

  const API_TIMEOUT = 12000;
  const PUSH_TIMEOUT = 15000;
  const SPIN_DURATION_MS = 1800;
  const SPIN_TICK_START_MS = 60;
  const SPIN_TICK_END_MS = 260;
  const MAX_NAME_LEN = 80;
  const POLL_INTERVAL = 5000;
  const LAST_PICKED_NAME_KEY = "srank_last_picked_name_v1";

  const CATEGORIES = [
    { key: "home", label: "Cơm nhà",  icon: "🏠", desc: "Món cơm, mì, bún khô" },
    { key: "soup", label: "Món nước", icon: "🍲", desc: "Phở, bún nước, canh" },
    { key: "out",  label: "Đi ngoài", icon: "🛵", desc: "Quán ăn, đồ ngoài" }
  ];

  const CATEGORY_MAP = {};
  CATEGORIES.forEach(function(c){ CATEGORY_MAP[c.key] = c; });

  const MODES = [
    { key: "all",  label: "Cả 3",       icon: "🎲" },
    { key: "home", label: "Cơm nhà",    icon: "🏠" },
    { key: "soup", label: "Món nước",   icon: "🍲" },
    { key: "out",  label: "Đi ngoài",   icon: "🛵" }
  ];

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
    pendingAddCategory: "home"
  };

  var _pollTimer = null;

  const $ = function(id){ return document.getElementById(id); };

  const escapeHtml = function(s){
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const getApi = function(){
    if (window.__srankApi) return window.__srankApi;
    if (window.SRank && window.SRank.api) return window.SRank.api;
    return null;
  };

  const uuid = function(){
    if (window.SRank && typeof window.SRank.uuid === "function") return window.SRank.uuid();
    try{ if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); }catch(_){}
    return "ck_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  };

  const notify = function(msg, type){
    try{
      if (typeof window.SRank === "object" && typeof window.SRank.setStatus === "function"){
        window.SRank.setStatus(msg);
        return;
      }
    }catch(_){}
    console.log("[" + (type || "info") + "]", msg);
  };

  function pickRandom(arr){
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffleArray(arr){
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ============ LUNCH → LIVE FEED ============
  function getMyName(){
    try{
      var saved = String(localStorage.getItem(LAST_PICKED_NAME_KEY) || "").trim();
      return saved || "Ẩn danh";
    }catch(_){ return "Ẩn danh"; }
  }

  // Push lunch với clientKey (idempotency) + chờ server ack
  async function pushLunchToFeed(dish){
    if (!dish || !dish.name) return { ok: false, reason: "invalid_dish" };
    try{
      var lf = window.SRank && window.SRank.LiveFeed;
      if (!lf || typeof lf.push !== "function") return { ok: false, reason: "no_livefeed" };

      const cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;
      const clientKey = uuid();

      const pushed = lf.push({
        type: "lunch",
        name: getMyName(),
        clientKey: clientKey,
        meta: {
          dish: dish.name,
          category: dish.category,
          icon: cat.icon
        }
      });
      if (!pushed) return { ok: false, reason: "push_failed", clientKey };

      // Chờ server ack (hoặc timeout)
      if (typeof lf.waitForPush === "function"){
        const res = await lf.waitForPush(clientKey, PUSH_TIMEOUT);
        return { ok: !!res.ok, clientKey: clientKey, event: res.event, reason: res.reason };
      }
      return { ok: true, clientKey: clientKey, event: pushed };
    }catch(e){
      console.log("[lunch] push feed error", e);
      return { ok: false, reason: "exception" };
    }
  }

  // =========================================================
  // API
  // =========================================================
  async function loadDishes(showError){
    const api = getApi();
    if (!api) return false;

    state.loading = true;
    renderDishGrid();

    try{
      const r = await api("getLunchDishes", { _ts: Date.now() }, API_TIMEOUT);
      if (!r || !r.ok){
        throw new Error((r && r.error) || "Không tải được danh sách món");
      }
      const arr = (r.data && Array.isArray(r.data.dishes)) ? r.data.dishes : [];
      state.dishes = arr
        .filter(function(d){ return d && d.id && d.name; })
        .map(function(d){
          return {
            id: String(d.id),
            category: String(d.category || "home"),
            name: String(d.name || "").trim()
          };
        });
      state.loading = false;
      renderDishGrid();
      return true;
    } catch(e){
      state.loading = false;
      renderDishGrid();
      if (showError !== false){
        notify((e && e.message) || "Lỗi tải danh sách món", "error");
      }
      return false;
    }
  }

  async function addDish(name, category){
    const api = getApi();
    if (!api) return { ok: false, error: "Chưa kết nối server" };

    const clean = String(name || "").trim();
    if (!clean) return { ok: false, error: "Nhập tên món đi" };
    if (clean.length > MAX_NAME_LEN) return { ok: false, error: "Tên quá dài" };
    if (clean.length < 2) return { ok: false, error: "Tên quá ngắn" };

    try{
      const r = await api("addLunchDish", { name: clean, category: category || "home" }, API_TIMEOUT);
      if (!r || !r.ok){
        return { ok: false, error: (r && r.error) || "Không thêm được" };
      }
      if (r.data && r.data.id){
        state.dishes.push({
          id: String(r.data.id),
          category: String(r.data.category || category || "home"),
          name: String(r.data.name || clean)
        });
        renderDishGrid();
      }
      loadDishes(false);
      return { ok: true, dish: r.data };
    } catch(e){
      return { ok: false, error: (e && e.message) || "Lỗi thêm món" };
    }
  }

  async function updateDish(id, newName){
    const api = getApi();
    if (!api) return { ok: false, error: "Chưa kết nối server" };

    const clean = String(newName || "").trim();
    if (!clean) return { ok: false, error: "Nhập tên món đi" };
    if (clean.length > MAX_NAME_LEN) return { ok: false, error: "Tên quá dài" };
    if (clean.length < 2) return { ok: false, error: "Tên quá ngắn" };

    try{
      const r = await api("updateLunchDish", { id: id, name: clean }, API_TIMEOUT);
      if (!r || !r.ok){
        return { ok: false, error: (r && r.error) || "Không sửa được" };
      }
      const idx = state.dishes.findIndex(function(d){ return d.id === id; });
      if (idx >= 0) state.dishes[idx].name = clean;
      renderDishGrid();
      loadDishes(false);
      return { ok: true };
    } catch(e){
      return { ok: false, error: (e && e.message) || "Lỗi sửa món" };
    }
  }

  async function deleteDish(id){
    const api = getApi();
    if (!api) return { ok: false, error: "Chưa kết nối server" };

    try{
      const r = await api("deleteLunchDish", { id: id }, API_TIMEOUT);
      if (!r || !r.ok){
        return { ok: false, error: (r && r.error) || "Không xoá được" };
      }
      state.dishes = state.dishes.filter(function(d){ return d.id !== id; });
      renderDishGrid();
      loadDishes(false);
      return { ok: true };
    } catch(e){
      return { ok: false, error: (e && e.message) || "Lỗi xoá món" };
    }
  }

  // =========================================================
  // POLLING
  // =========================================================
  function startPolling(){
    stopPolling();
    _pollTimer = setInterval(function(){
      if (!state.pageOpen) return;
      if (document.hidden) return;
      if (state.spinning || state.sending) return;
      var ov = $("lcSheetOverlay");
      if (ov && ov.classList.contains("show")) return;
      loadDishes(false);
    }, POLL_INTERVAL);
  }

  function stopPolling(){
    if (_pollTimer){
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  // =========================================================
  // CSS INJECTION
  // =========================================================
  function injectStyles(){
    if ($("lunchV2Styles")) return;
    const style = document.createElement("style");
    style.id = "lunchV2Styles";
    style.textContent = [
      "/* ============ LUNCH v2 ============ */",
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
      ".lc-hero{position:relative;padding:26px 22px 24px;margin-bottom:18px;border-radius:28px;text-align:center;overflow:hidden;background:radial-gradient(ellipse 90% 60% at 50% 0%,rgba(255,255,255,.98) 0%,rgba(255,250,240,.72) 45%,transparent 75%),linear-gradient(180deg,rgba(255,255,255,.96) 0%,rgba(255,250,240,.94) 55%,rgba(255,245,225,.92) 100%);border:1px solid rgba(200,140,80,.22);box-shadow:0 24px 60px -20px rgba(120,80,40,.18),0 12px 32px -12px rgba(120,80,40,.12),inset 0 1px 0 rgba(255,255,255,.95);min-height:200px;display:flex;flex-direction:column;justify-content:center;align-items:center}",
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
      ".lc-spin-btn-icon{font-size:18px;line-height:1;display:inline-block}",
      ".lc-modes{display:flex;gap:6px;margin-bottom:16px;padding:4px;background:rgba(255,255,255,.7);border:1px solid rgba(200,140,80,.16);border-radius:16px;overflow-x:auto;scrollbar-width:none}",
      ".lc-modes::-webkit-scrollbar{display:none}",
      ".lc-mode{flex:1 1 auto;min-height:42px;padding:6px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:1.5px solid transparent;border-radius:12px;background:transparent;color:#a97848;font-family:inherit;font-size:10.5px;font-weight:900;letter-spacing:.02em;cursor:pointer;white-space:nowrap;transition:background .18s ease,color .18s ease,border-color .18s ease}",
      ".lc-mode-icon{font-size:15px;line-height:1}",
      ".lc-mode.active{background:linear-gradient(180deg,#fff5e6,#ffe6cc);border-color:#e0a870;color:#5a3a18}",
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
      "@media(max-width:420px){.lc-grid{gap:8px}.lc-dish{padding:12px 10px;min-height:90px}.lc-dish-name{font-size:13px}.lc-hero{padding:22px 18px 20px}.lc-hero-dish{font-size:clamp(20px,5.5vw,26px)}.lc-title{font-size:18px}.lc-fab{width:52px;height:52px;font-size:24px}}"
    ].join("");
    document.head.appendChild(style);
  }

  // =========================================================
  // BUILD PAGE
  // =========================================================
  function buildPage(){
    if ($("lunchPage")) return;
    var page = document.createElement("section");
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

  // =========================================================
  // RENDER
  // =========================================================
  function getFilteredDishes(){
    var term = state.searchTerm.toLowerCase().trim();
    return state.dishes.filter(function(d){
      if (state.currentMode !== "all" && d.category !== state.currentMode) return false;
      if (term && d.name.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function getDishPool(){
    if (state.currentMode === "all") return state.dishes.slice();
    return state.dishes.filter(function(d){ return d.category === state.currentMode; });
  }

  function renderModes(){
    var box = $("lcModes");
    if (!box) return;
    box.innerHTML = "";
    MODES.forEach(function(m){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lc-mode" + (state.currentMode === m.key ? " active" : "");
      btn.dataset.mode = m.key;
      btn.innerHTML = '<span class="lc-mode-icon">' + m.icon + '</span><span>' + m.label + '</span>';
      btn.addEventListener("click", function(){
        if (state.spinning || state.sending) return;
        state.currentMode = m.key;
        renderModes();
        renderDishGrid();
      });
      box.appendChild(btn);
    });
  }

  function renderHero(){
    var heroBody = $("lcHeroBody");
    var heroIcon = $("lcHeroIcon");
    if (!heroBody || !heroIcon) return;

    if (!state.lastResult){
      heroIcon.textContent = "🍜";
      heroBody.innerHTML = '<span class="lc-hero-placeholder">Bấm "Quay ngay" để chọn món</span>';
      return;
    }

    var dish = state.lastResult;
    var cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;
    heroIcon.textContent = cat.icon;
    heroBody.innerHTML =
      '<span class="lc-hero-dish">' + escapeHtml(dish.name) + '</span>' +
      '<span class="lc-hero-cat">' + escapeHtml(cat.label) + '</span>';
  }

  function renderDishGrid(){
    var grid = $("lcGrid");
    var countEl = $("lcSectionCount");
    if (!grid) return;

    if (state.loading && state.dishes.length === 0){
      grid.innerHTML = "";
      for (var i = 0; i < 4; i++){
        var sk = document.createElement("div");
        sk.className = "lc-skeleton";
        grid.appendChild(sk);
      }
      if (countEl) countEl.textContent = "Đang tải…";
      return;
    }

    var filtered = getFilteredDishes();
    if (countEl) countEl.textContent = filtered.length + " món";

    if (filtered.length === 0){
      var isEmptySearch = state.searchTerm.trim().length > 0;
      var isFiltered = state.currentMode !== "all";
      var title = "Chưa có món nào";
      var sub = "Bấm nút + để thêm món đầu tiên";
      if (isEmptySearch){
        title = "Không tìm thấy";
        sub = 'Không có món nào khớp "' + escapeHtml(state.searchTerm) + '"';
      } else if (isFiltered){
        title = "Mục này trống";
        sub = "Bấm nút + để thêm món vào mục này";
      }
      grid.innerHTML =
        '<div class="lc-empty">' +
          '<div class="lc-empty-icon">🍽️</div>' +
          '<div class="lc-empty-title">' + title + '</div>' +
          '<div class="lc-empty-sub">' + sub + '</div>' +
        '</div>';
      return;
    }

    grid.innerHTML = "";
    filtered.forEach(function(d){
      var cat = CATEGORY_MAP[d.category] || CATEGORY_MAP.home;
      var isHighlight = state.lastResult && state.lastResult.id === d.id;

      var card = document.createElement("div");
      card.className = "lc-dish cat-" + d.category + (isHighlight ? " highlight" : "");

      card.innerHTML =
        '<div class="lc-dish-top">' +
          '<span class="lc-dish-cat">' + cat.icon + ' ' + escapeHtml(cat.label) + '</span>' +
          '<button type="button" class="lc-dish-menu" aria-label="Tuỳ chọn">⋯</button>' +
        '</div>' +
        '<div class="lc-dish-name">' + escapeHtml(d.name) + '</div>';

      card.addEventListener("click", function(e){
        if (e.target.closest(".lc-dish-menu")) return;
        if (state.spinning || state.sending) return;
        state.lastResult = { id: d.id, name: d.name, category: d.category };
        renderHero();
        renderDishGrid();
      });

      var menuBtn = card.querySelector(".lc-dish-menu");
      menuBtn.addEventListener("click", function(e){
        e.stopPropagation();
        openEditSheet(d);
      });

      grid.appendChild(card);
    });
  }

  function render(){
    renderModes();
    renderHero();
    renderDishGrid();
  }

  // =========================================================
  // SPIN — có UX lock
  // =========================================================
  function setSpinButtonState(kind, text){
    const btn = $("lcSpinBtn");
    const icon = $("lcSpinBtnIcon");
    const label = $("lcSpinBtnText");
    if(!btn || !label) return;
    btn.classList.remove("sending", "success", "error");
    if(kind === "spin"){
      btn.disabled = true;
      btn.classList.add("sending");
      if(icon) icon.textContent = "🎲";
      label.textContent = text || "ĐANG QUAY…";
      return;
    }
    if(kind === "send"){
      btn.disabled = true;
      btn.classList.add("sending");
      if(icon) icon.textContent = "⏳";
      label.textContent = text || "ĐANG GỬI…";
      return;
    }
    if(kind === "ok"){
      btn.disabled = true;
      btn.classList.add("success");
      if(icon) icon.textContent = "✓";
      label.textContent = text || "ĐÃ GỬI";
      return;
    }
    if(kind === "err"){
      btn.disabled = false;
      btn.classList.add("error");
      if(icon) icon.textContent = "⚠";
      label.textContent = text || "LỖI — THỬ LẠI";
      return;
    }
    // idle
    btn.disabled = false;
    if(icon) icon.textContent = "🎲";
    label.textContent = text || "QUAY NGAY";
  }

  function spin(){
    if (state.spinning || state.sending) return;

    var pool = getDishPool();
    if (pool.length === 0){
      notify("Chưa có món nào để quay", "error");
      return;
    }

    if (pool.length === 1){
      state.lastResult = { id: pool[0].id, name: pool[0].name, category: pool[0].category };
      renderHero();
      renderDishGrid();
      notify("Chỉ có 1 món — chọn luôn: " + pool[0].name, "success");
      finalizeSpin(pool[0]);
      return;
    }

    state.spinning = true;
    state.lastResult = null;

    var hero = $("lcHero");
    var heroBody = $("lcHeroBody");
    var heroIcon = $("lcHeroIcon");

    if (hero) hero.classList.add("rolling");
    setSpinButtonState("spin", "ĐANG QUAY…");

    var shuffled = shuffleArray(pool);
    var totalSteps = Math.max(12, Math.min(24, pool.length * 2));
    var sequence = [];
    for (var i = 0; i < totalSteps; i++){
      sequence.push(shuffled[i % shuffled.length]);
    }
    var finalDish = pickRandom(pool);
    sequence.push(finalDish);

    var startTime = Date.now();
    var totalDuration = SPIN_DURATION_MS;
    var step = 0;

    function tick(){
      var elapsed = Date.now() - startTime;
      var progress = Math.min(1, elapsed / totalDuration);
      var easeOut = 1 - Math.pow(1 - progress, 3);
      var targetIndex = Math.floor(easeOut * (sequence.length - 1));

      step = Math.max(step, targetIndex);
      var dish = sequence[Math.min(step, sequence.length - 1)];
      var cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;

      if (heroIcon) heroIcon.textContent = cat.icon;
      if (heroBody){
        heroBody.innerHTML =
          '<span class="lc-hero-dish">' + escapeHtml(dish.name) + '</span>' +
          '<span class="lc-hero-cat">' + escapeHtml(cat.label) + '</span>';
      }

      if (progress < 1){
        var delay = SPIN_TICK_START_MS + (SPIN_TICK_END_MS - SPIN_TICK_START_MS) * easeOut;
        setTimeout(tick, delay);
      } else {
        state.spinning = false;
        state.lastResult = { id: finalDish.id, name: finalDish.name, category: finalDish.category };
        if (hero) hero.classList.remove("rolling");
        renderHero();
        renderDishGrid();
        notify("Chọn: " + finalDish.name, "success");
        finalizeSpin(finalDish);
      }
    }
    tick();
  }

  // Gửi kết quả lên server + UX lock
  async function finalizeSpin(dish){
    if (state.sending) return;
    state.sending = true;
    setSpinButtonState("send", "ĐANG GỬI…");

    let ok = false;
    try{
      const res = await pushLunchToFeed(dish);
      ok = !!(res && res.ok);
    }catch(_){
      ok = false;
    }
    state.sending = false;

    if (ok){
      setSpinButtonState("ok", "ĐÃ GỬI ✓");
      setTimeout(() => {
        setSpinButtonState("idle", "QUAY LẠI");
      }, 800);
    } else {
      setSpinButtonState("err", "LỖI — THỬ LẠI");
      notify("Không gửi được bữa trưa — bấm thử lại", "error");
    }
  }

  // =========================================================
  // SHEET — ADD
  // =========================================================
  function openAddSheet(){
    if (state.spinning || state.sending) return;
    state.pendingAddCategory = state.currentMode === "all" ? "home" : state.currentMode;
    showSheet(buildAddContent(), "add");
    setTimeout(function(){
      var inp = $("lcAddInput");
      if (inp) inp.focus();
    }, 250);
  }

  function buildAddContent(){
    var catHtml = '<div class="lc-cat-picker" id="lcAddCatPicker">';
    CATEGORIES.forEach(function(c){
      var active = state.pendingAddCategory === c.key;
      catHtml +=
        '<button type="button" class="lc-cat-opt' + (active ? " active" : "") + '" data-cat="' + c.key + '">' +
          '<span class="lc-cat-opt-icon">' + c.icon + '</span>' +
          '<span>' + c.label + '</span>' +
        '</button>';
    });
    catHtml += '</div>';

    return [
      '<div class="lc-sheet-title">Thêm món mới</div>',
      '<div class="lc-sheet-sub">Món sẽ xuất hiện trong danh sách ngay lập tức</div>',
      '<div class="lc-form-group">',
        '<label class="lc-form-label" for="lcAddInput">Tên món</label>',
        '<input type="text" class="lc-form-input" id="lcAddInput" maxlength="' + MAX_NAME_LEN + '" placeholder="VD: Cơm tấm sườn…" autocomplete="off">',
      '</div>',
      '<div class="lc-form-group">',
        '<label class="lc-form-label">Danh mục</label>',
        catHtml,
      '</div>',
      '<div class="lc-form-actions">',
        '<button type="button" class="lc-btn" id="lcAddCancel">Huỷ</button>',
        '<button type="button" class="lc-btn primary" id="lcAddSave">Thêm món</button>',
      '</div>',
      '<div class="lc-form-status" id="lcAddStatus"></div>'
    ].join("");
  }

  function bindAddEvents(){
    var inp = $("lcAddInput");
    var save = $("lcAddSave");
    var cancel = $("lcAddCancel");
    var status = $("lcAddStatus");

    var picker = $("lcAddCatPicker");
    if (picker){
      picker.querySelectorAll("[data-cat]").forEach(function(btn){
        btn.addEventListener("click", function(){
          state.pendingAddCategory = btn.dataset.cat;
          picker.querySelectorAll("[data-cat]").forEach(function(b){
            b.classList.toggle("active", b.dataset.cat === state.pendingAddCategory);
          });
        });
      });
    }

    if (cancel) cancel.addEventListener("click", closeSheet);

    if (save && inp){
      var doSave = async function(){
        var name = inp.value.trim();
        if (!name) { inp.focus(); return; }

        save.disabled = true;
        save.textContent = "Đang thêm…";
        if (status){ status.className = "lc-form-status"; status.textContent = ""; }

        var res = await addDish(name, state.pendingAddCategory);
        save.disabled = false;
        save.textContent = "Thêm món";

        if (res.ok){
          if (status){ status.className = "lc-form-status"; status.textContent = "Đã thêm!"; }
          inp.value = "";
          notify("Đã thêm: " + name, "success");
          setTimeout(closeSheet, 400);
        } else {
          if (status){ status.className = "lc-form-status error"; status.textContent = res.error || "Lỗi"; }
        }
      };
      save.addEventListener("click", doSave);
      inp.addEventListener("keydown", function(e){
        if (e.key === "Enter"){ e.preventDefault(); doSave(); }
      });
    }
  }

  // =========================================================
  // SHEET — EDIT
  // =========================================================
  function openEditSheet(dish){
    if (state.spinning || state.sending) return;
    state.editingDish = dish;
    showSheet(buildEditContent(dish), "edit");
    setTimeout(function(){
      var inp = $("lcEditInput");
      if (inp){ inp.focus(); inp.select(); }
    }, 250);
  }

  function buildEditContent(dish){
    var cat = CATEGORY_MAP[dish.category] || CATEGORY_MAP.home;
    return [
      '<div class="lc-sheet-title">Sửa món ăn</div>',
      '<div class="lc-sheet-sub">' + cat.icon + ' ' + escapeHtml(cat.label) + '</div>',
      '<div class="lc-form-group">',
        '<label class="lc-form-label" for="lcEditInput">Tên món</label>',
        '<input type="text" class="lc-form-input" id="lcEditInput" maxlength="' + MAX_NAME_LEN + '" value="' + escapeHtml(dish.name) + '" autocomplete="off">',
      '</div>',
      '<div class="lc-form-actions three">',
        '<button type="button" class="lc-btn danger" id="lcEditDelete">Xoá</button>',
        '<button type="button" class="lc-btn" id="lcEditCancel">Huỷ</button>',
        '<button type="button" class="lc-btn primary" id="lcEditSave">Lưu</button>',
      '</div>',
      '<div class="lc-form-status" id="lcEditStatus"></div>'
    ].join("");
  }

  function bindEditEvents(){
    var inp = $("lcEditInput");
    var save = $("lcEditSave");
    var del = $("lcEditDelete");
    var cancel = $("lcEditCancel");
    var status = $("lcEditStatus");

    if (cancel) cancel.addEventListener("click", closeSheet);

    if (del){
      del.addEventListener("click", function(){
        if (!state.editingDish) return;
        var dish = state.editingDish;
        showSheet(buildDeleteConfirm(dish), "confirm");
      });
    }

    if (save && inp){
      var doSave = async function(){
        var name = inp.value.trim();
        if (!name || !state.editingDish) return;
        if (name === state.editingDish.name){ closeSheet(); return; }

        save.disabled = true;
        save.textContent = "Đang lưu…";
        if (status){ status.className = "lc-form-status"; status.textContent = ""; }

        var res = await updateDish(state.editingDish.id, name);
        save.disabled = false;
        save.textContent = "Lưu";

        if (res.ok){
          if (status){ status.className = "lc-form-status"; status.textContent = "Đã lưu!"; }
          notify("Đã sửa món", "success");
          setTimeout(closeSheet, 400);
        } else {
          if (status){ status.className = "lc-form-status error"; status.textContent = res.error || "Lỗi"; }
        }
      };
      save.addEventListener("click", doSave);
      inp.addEventListener("keydown", function(e){
        if (e.key === "Enter"){ e.preventDefault(); doSave(); }
      });
    }
  }

  // =========================================================
  // SHEET — DELETE
  // =========================================================
  function buildDeleteConfirm(dish){
    return [
      '<div class="lc-sheet-title">Xoá món này?</div>',
      '<div class="lc-confirm">',
        '<div class="lc-confirm-text">Món sẽ bị ẩn khỏi danh sách. Bạn vẫn có thể thêm lại sau.',
          '<span class="lc-confirm-dish">' + escapeHtml(dish.name) + '</span>',
        '</div>',
      '</div>',
      '<div class="lc-form-actions">',
        '<button type="button" class="lc-btn" id="lcDelCancel">Huỷ</button>',
        '<button type="button" class="lc-btn danger" id="lcDelConfirm">Xoá món</button>',
      '</div>',
      '<div class="lc-form-status" id="lcDelStatus"></div>'
    ].join("");
  }

  function bindDeleteEvents(){
    var cancel = $("lcDelCancel");
    var confirm = $("lcDelConfirm");
    var status = $("lcDelStatus");

    if (cancel) cancel.addEventListener("click", closeSheet);

    if (confirm){
      confirm.addEventListener("click", async function(){
        if (!state.editingDish) return;
        var dish = state.editingDish;

        confirm.disabled = true;
        confirm.textContent = "Đang xoá…";
        if (status){ status.className = "lc-form-status"; status.textContent = ""; }

        var res = await deleteDish(dish.id);
        confirm.disabled = false;
        confirm.textContent = "Xoá món";

        if (res.ok){
          if (status){ status.className = "lc-form-status"; status.textContent = "Đã xoá!"; }
          if (state.lastResult && state.lastResult.id === dish.id){
            state.lastResult = null;
            renderHero();
          }
          notify("Đã xoá: " + dish.name, "success");
          setTimeout(closeSheet, 400);
        } else {
          if (status){ status.className = "lc-form-status error"; status.textContent = res.error || "Lỗi"; }
        }
      });
    }
  }

  // =========================================================
  // SHEET — CONTROL
  // =========================================================
  function showSheet(html, mode){
    var overlay = $("lcSheetOverlay");
    var content = $("lcSheetContent");
    if (!overlay || !content) return;

    content.innerHTML = html;
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");

    if (mode === "confirm"){
      bindDeleteEvents();
    } else if (mode === "edit"){
      bindEditEvents();
    } else {
      bindAddEvents();
    }
  }

  function closeSheet(){
    var overlay = $("lcSheetOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    state.editingDish = null;
    setTimeout(function(){
      var content = $("lcSheetContent");
      if (content) content.innerHTML = "";
    }, 320);
  }

  // =========================================================
  // OPEN / CLOSE PAGE
  // =========================================================
  async function openPage(){
    var page = $("lunchPage");
    if (!page) return;

    page.classList.add("show");
    page.setAttribute("aria-hidden", "false");
    state.pageOpen = true;
    document.body.style.overflow = "hidden";

    var fab = $("lcAddFab");
    if (fab) fab.classList.add("show");

    var openBtn = $("lunchBtn");
    if (openBtn) openBtn.classList.add("running");

    render();
    loadDishes(true);
    startPolling();

    if (typeof window.syncQuickTools === "function") window.syncQuickTools();
  }

  function closePage(){
    var page = $("lunchPage");
    if (!page) return;
    page.classList.remove("show");
    page.setAttribute("aria-hidden", "true");
    state.pageOpen = false;
    document.body.style.overflow = "";
    closeSheet();
    stopPolling();

    var fab = $("lcAddFab");
    if (fab) fab.classList.remove("show");

    var openBtn = $("lunchBtn");
    if (openBtn) openBtn.classList.remove("running");

    if (typeof window.syncQuickTools === "function") window.syncQuickTools();
  }

  // =========================================================
  // BIND EVENTS
  // =========================================================
  function bindEvents(){
    var openBtn = $("lunchBtn");
    if (openBtn){
      openBtn.addEventListener("click", function(e){
        e.preventDefault();
        e.stopPropagation();
        openPage();
      });
    }

    var backBtn = $("lcBackBtn");
    if (backBtn) backBtn.addEventListener("click", closePage);

    var refreshBtn = $("lcRefreshBtn");
    if (refreshBtn){
      refreshBtn.addEventListener("click", async function(){
        if (state.spinning || state.sending) return;
        refreshBtn.classList.add("spinning");
        await loadDishes(true);
        setTimeout(function(){ refreshBtn.classList.remove("spinning"); }, 400);
      });
    }

    var spinBtn = $("lcSpinBtn");
    if (spinBtn) spinBtn.addEventListener("click", spin);

    var addFab = $("lcAddFab");
    if (addFab) addFab.addEventListener("click", openAddSheet);

    var searchInput = $("lcSearchInput");
    var searchClear = $("lcSearchClear");
    if (searchInput){
      searchInput.addEventListener("input", function(e){
        state.searchTerm = e.target.value;
        if (searchClear) searchClear.classList.toggle("show", state.searchTerm.length > 0);
        renderDishGrid();
      });
    }
    if (searchClear){
      searchClear.addEventListener("click", function(){
        if (searchInput) searchInput.value = "";
        state.searchTerm = "";
        searchClear.classList.remove("show");
        renderDishGrid();
      });
    }

    var overlay = $("lcSheetOverlay");
    if (overlay){
      overlay.addEventListener("click", function(e){
        if (e.target === overlay) closeSheet();
      });
    }

    document.addEventListener("visibilitychange", function(){
      if (!document.hidden && state.pageOpen){
        loadDishes(false);
      }
    });

    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape") return;
      var ov = $("lcSheetOverlay");
      if (ov && ov.classList.contains("show")){
        closeSheet();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (state.pageOpen){
        closePage();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================
  function init(){
    injectStyles();
    buildPage();
    bindEvents();
    render();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
