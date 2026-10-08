/* =========================================================
   SRANK AUTH UI — v7.4 (CTA + sequential wave kicker)
   ---------------------------------------------------------
   FIX v7.4:
   - Wave animation TUẦN TỰ: mỗi chữ chạy xong mới đến chữ sau
     · duration: 0.5s (CSS)
     · step: 500ms (JS) — khớp duration → không overlap
   - Chỉ 1 chữ động tại 1 thời điểm
   ========================================================= */
(function(){
  "use strict";

  const Auth = window.SRank && window.SRank.Auth;
  if (!Auth) { console.error("[AUTH-UI] SRank.Auth chưa load"); return; }

  const $ = id => document.getElementById(id);
  const overlay = $("loginOverlay");
  const closeBtn = $("loginClose");
  const userInput = $("loginUsername");
  const passInput = $("loginPassword");
  const msgEl = $("loginMsg");
  const submitBtn = $("loginSubmit");
  const logoutBtn = $("logoutBtn");
  const logoutName = $("logoutName");
  const appVersion = $("appVersion");
  const question = $("question");

  if (!overlay) { console.warn("[AUTH-UI] thiếu DOM"); return; }

  let currentUser = null;
  let submitting = false;

  /* ============ CSS WAVE ANIMATION — TUẦN TỰ ============ */
  function injectKickerCss(){
    if (document.getElementById('bossKickerCss')) return;
    const s = document.createElement('style');
    s.id = 'bossKickerCss';
    s.textContent = `
      .landing-kicker .boss-wave {
        display: inline-block;
        white-space: nowrap;
      }
      .landing-kicker .boss-wave .bw-c {
        display: inline-block;
        animation: bossWave 0.5s ease-in-out infinite;
        will-change: transform;
        transform-origin: center bottom;
      }
      @keyframes bossWave {
        0%, 100% { transform: translateY(0) scale(1); }
        30%      { transform: translateY(-8px) scale(1.15); }
        60%      { transform: translateY(4px) scale(0.92); }
      }
      @media (prefers-reduced-motion: reduce) {
        .landing-kicker .boss-wave .bw-c { animation: none; }
      }
    `;
    document.head.appendChild(s);
  }
  injectKickerCss();

  /* ============ HELPERS ============ */
  function isChecklistLocked(){
    try {
      const p = new Intl.DateTimeFormat("en-US",{
        timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:!1
      }).formatToParts(new Date());
      const h = +(p.find(x => x.type === "hour")?.value || 0);
      const m = +(p.find(x => x.type === "minute")?.value || 0);
      const lockStr = localStorage.getItem("srank_checklist_lock_time_v1") || "21:00";
      const [lh, lm] = lockStr.split(":").map(Number);
      return h * 60 + m >= (lh || 21) * 60 + (lm || 0);
    } catch(_) { return false; }
  }

  function findUserIndex(name){
    if (!name) return -1;
    try {
      const list = window.__getChecklistNames ? window.__getChecklistNames() : [];
      return list.indexOf(name);
    } catch(_) { return -1; }
  }

  /* ============ HOOK: CTA ============ */
  function getCtaInfo(){
    if (isChecklistLocked()){
      return { text: "🔒 Tạm khoá Checklist", locked: true };
    }
    if (!currentUser){
      return { text: "🔐 Đăng nhập", locked: false };
    }
    const idx = findUserIndex(currentUser.displayName);
    if (idx < 0){
      return { text: "⚠ Tên không khớp checklist", locked: true };
    }
    try {
      const st = window.SRank && window.SRank.getCurrentState ? window.SRank.getCurrentState() : null;
      if (st && st.checked && st.checked[idx] && st.times && st.times[idx]){
        return { text: "✓ Đã chấm công (" + st.times[idx] + ")", locked: true };
      }
    } catch(_) {}
    return { text: "⏰ Chấm công", locked: false };
  }
  window.__getCtaInfo = getCtaInfo;

  /* ============ HOOK: KICKER + WAVE ============ */
  const BOSS_WHITELIST = ['tienloi', 'mydung', 'quynhtrang', 'phamkimchi', 'minhthuy'];
  const KICKER_DEFAULT = '🐱 DAILY TEAM HUB';
  const KICKER_BOSS = '🕶️ BOSS TỔ CHỨC ÁO ĐEN';

  function isBossMode(){
    try {
      if (window.AdminSession && typeof window.AdminSession.isValid === "function" && window.AdminSession.isValid()){
        return true;
      }
    } catch(_) {}
    if (currentUser){
      const un = String(currentUser.username || '').trim().toLowerCase();
      if (un && BOSS_WHITELIST.indexOf(un) >= 0) return true;
    }
    return false;
  }

  function buildWaveHtml(text){
    let chars;
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter){
        const seg = new Intl.Segmenter('vi', { granularity: 'grapheme' });
        chars = Array.from(seg.segment(text), s => s.segment);
      } else {
        chars = Array.from(text);
      }
    } catch(_) {
      chars = Array.from(text);
    }
    /* ✅ TUẦN TỰ: step = duration = 500ms → mỗi lúc 1 chữ động */
    const step = 500;
    const inner = chars.map((c, i) => {
      const delay = i * step;
      const ch = (c === ' ') ? '&nbsp;' : c
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="bw-c" style="animation-delay:${delay}ms">${ch}</span>`;
    }).join('');
    const safeLabel = text.replace(/"/g, '&quot;');
    return `<span class="boss-wave" aria-label="${safeLabel}">${inner}</span>`;
  }

  function getKickerRender(){
    if (isBossMode()){
      return { html: buildWaveHtml(KICKER_BOSS), text: KICKER_BOSS, version: 'boss' };
    }
    return { html: null, text: KICKER_DEFAULT, version: 'default' };
  }

  function getKickerText(){
    return isBossMode() ? KICKER_BOSS : KICKER_DEFAULT;
  }

  window.__getKickerRender = getKickerRender;
  window.__getKickerText = getKickerText;

  /* ============ CTA CLICK HANDLER ============ */
  function miniBurst(){
    const space = document.getElementById("space");
    if (!space) return;
    const f = document.createElement("div");
    f.className = "flash";
    space.appendChild(f);
    setTimeout(function(){ f.remove(); }, 700);
    const hearts = [];
    for (let i = 0; i < 20; i++){
      const h = document.createElement("div");
      h.className = "heart";
      h.textContent = (i % 5 === 0) ? "💗" : "♥";
      const a = Math.PI * 2 * i / 20, r = 80 + Math.random() * 200;
      h.style.setProperty("--x", Math.cos(a) * r + "px");
      h.style.setProperty("--y", Math.sin(a) * r + "px");
      h.style.setProperty("--r", (Math.random() * 120 - 60) + "deg");
      h.style.setProperty("--s", (0.7 + Math.random() * 1.3).toFixed(2));
      h.style.setProperty("--time", (0.7 + Math.random() * 0.6).toFixed(2) + "s");
      space.appendChild(h);
      hearts.push(h);
    }
    setTimeout(function(){ for (const h of hearts) h.remove(); }, 1600);
  }

  async function handleCheckin(){
    if (!currentUser) return;
    const idx = findUserIndex(currentUser.displayName);
    if (idx < 0){
      if (window.SRank.setStatus) window.SRank.setStatus("Tên không khớp checklist");
      return;
    }
    if (typeof window.SRank.requestCheckin !== "function"){
      if (window.SRank.setStatus) window.SRank.setStatus("Chức năng chưa sẵn sàng");
      return;
    }
    miniBurst();
    try {
      await window.SRank.requestCheckin(currentUser.displayName);
    } catch(err){
      console.error("[AUTH-UI] checkin error:", err);
    }
  }

  function intercept(e){
    const cta = e.target && e.target.closest ? e.target.closest(".landing-cta") : null;
    if (!cta) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const info = getCtaInfo();
    if (info.locked) return;

    if (!currentUser) openLoginForm();
    else handleCheckin();
  }

  if (question){
    question.addEventListener("click", intercept, true);
    question.addEventListener("pointerup", intercept, true);
    question.addEventListener("keydown", function(e){
      if (e.key !== "Enter" && e.key !== " ") return;
      intercept(e);
    }, true);
  }

  /* ============ LOGIN FORM ============ */
  function openLoginForm(){
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    msgEl.textContent = "";
    msgEl.classList.remove("ok");
    setTimeout(function(){ userInput.focus(); }, 60);
  }

  function closeLoginForm(){
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    userInput.value = "";
    passInput.value = "";
    msgEl.textContent = "";
    msgEl.classList.remove("ok");
  }

  function setMsg(text, ok){
    msgEl.textContent = text || "";
    msgEl.classList.toggle("ok", !!ok);
  }

  async function handleLoginSubmit(){
    if (submitting) return;
    const u = userInput.value.trim();
    const p = passInput.value;
    if (!u){ setMsg("Vui lòng nhập tên đăng nhập"); userInput.focus(); return; }
    if (!p){ setMsg("Vui lòng nhập mật khẩu"); passInput.focus(); return; }

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Đang đăng nhập…";
    setMsg("");

    try {
      await Auth.login(u, p);
      try {
        if (window.AdminSession && typeof window.AdminSession.clear === "function") window.AdminSession.clear();
        localStorage.removeItem("srank_admin_pwd_v1");
      } catch(_) {}
      setMsg("Đăng nhập thành công ✓", true);
      setTimeout(closeLoginForm, 350);
    } catch(err){
      setMsg(err.message || "Đăng nhập thất bại");
      passInput.value = "";
      passInput.focus();
    } finally {
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Đăng nhập";
    }
  }

  if (closeBtn) closeBtn.addEventListener("click", closeLoginForm);
  overlay.addEventListener("click", function(e){
    if (e.target === overlay) closeLoginForm();
  });
  if (submitBtn) submitBtn.addEventListener("click", handleLoginSubmit);
  if (passInput) passInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") handleLoginSubmit();
  });
  if (userInput) userInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") passInput.focus();
  });

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && overlay.classList.contains("show")){
      e.preventDefault();
      e.stopImmediatePropagation();
      closeLoginForm();
    }
  }, true);

  /* ============ LOGOUT ============ */
  function updateLogoutBtn(){
    if (currentUser){
      if (logoutBtn) logoutBtn.hidden = false;
      if (logoutName) logoutName.textContent = currentUser.displayName || currentUser.username || "";
      if (appVersion) appVersion.style.display = "none";
    } else {
      if (logoutBtn) logoutBtn.hidden = true;
      if (logoutName) logoutName.textContent = "";
      if (appVersion) appVersion.style.display = "";
    }
  }

  async function handleLogout(){
    if (!confirm("Đăng xuất khỏi tài khoản?")) return;
    try { await Auth.logout(); } catch(_) {}
  }

  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

  /* ============ AUTH CHANGE ============ */
  Auth.onChange(function(user){
    if (user){
      try {
        if (window.AdminSession && typeof window.AdminSession.clear === "function") window.AdminSession.clear();
        localStorage.removeItem("srank_admin_pwd_v1");
      } catch(_) {}
    }
    currentUser = user;
    updateLogoutBtn();

    if (window.SRank && typeof window.SRank.rerenderLanding === "function"){
      try { window.SRank.rerenderLanding(); } catch(_) {}
    }
  });

  /* ============ INIT ============ */
  currentUser = Auth.getCurrentUser();
  updateLogoutBtn();

  if (window.SRank && typeof window.SRank.rerenderLanding === "function"){
    try { window.SRank.rerenderLanding(); } catch(_) {}
  }

  window.SRank.openLogin = openLoginForm;

  console.log("[AUTH-UI] ready ✓ v7.4 — CTA + sequential wave");
})();