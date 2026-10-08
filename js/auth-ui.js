/* =========================================================
   SRANK AUTH UI — v7.5 (CTA + TRUE sequential wave)
   ---------------------------------------------------------
   FIX v7.5:
   - Mỗi chữ có KEYFRAME RIÊNG, chỉ active trong 1/N cycle
   - Chạy xong → tĩnh ngay (không loop cá nhân)
   - Loop lại cả chuỗi khi hết chu kỳ tổng
   - Space được bỏ qua, không tính vào thời gian
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

  /* ============ CSS BASE ============ */
  function injectBaseCss(){
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
        will-change: transform;
        transform-origin: center bottom;
        transform: translateY(0) scale(1);
      }
      @media (prefers-reduced-motion: reduce) {
        .landing-kicker .boss-wave .bw-c { animation: none !important; }
      }
    `;
    document.head.appendChild(s);
  }
  injectBaseCss();

  /* ============ DYNAMIC KEYFRAMES (dựa vào số chữ) ============ */
  const STEP_MS = 350;  // thời gian mỗi chữ chạy
  let _waveStyleEl = null;
  let _waveCount = 0;

  function ensureWaveKeyframes(count){
    if (_waveStyleEl && _waveCount === count) return;

    // Xoá style cũ
    if (_waveStyleEl && _waveStyleEl.parentNode) _waveStyleEl.remove();

    _waveStyleEl = document.createElement('style');
    _waveStyleEl.id = 'bossWaveKeyframes';

    const rules = [];
    for (let i = 0; i < count; i++){
      const startPct = (i / count) * 100;
      const endPct = ((i + 1) / count) * 100;
      const peakPct = (startPct + endPct) / 2;

      rules.push(`@keyframes bwW_${i} {`);
      if (startPct === 0){
        rules.push(`  0% { transform: translateY(0) scale(1); }`);
      } else {
        rules.push(`  0%, ${startPct.toFixed(4)}% { transform: translateY(0) scale(1); }`);
      }
      rules.push(`  ${peakPct.toFixed(4)}% { transform: translateY(-8px) scale(1.15); }`);
      rules.push(`  ${endPct.toFixed(4)}%, 100% { transform: translateY(0) scale(1); }`);
      rules.push(`}`);
    }

    _waveStyleEl.textContent = rules.join('\n');
    document.head.appendChild(_waveStyleEl);
    _waveCount = count;
  }

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

  function splitGraphemes(text){
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter){
        const seg = new Intl.Segmenter('vi', { granularity: 'grapheme' });
        return Array.from(seg.segment(text), s => s.segment);
      }
    } catch(_) {}
    return Array.from(text);
  }

  function buildWaveHtml(text){
    const chars = splitGraphemes(text);

    // Đếm số ký tự KHÔNG phải space (bỏ qua space khỏi timing)
    let visibleCount = 0;
    for (const c of chars){
      if (c.trim() !== '' && c !== '\u00A0') visibleCount++;
    }

    ensureWaveKeyframes(visibleCount);

    const totalMs = visibleCount * STEP_MS;
    let animIdx = 0;

    const inner = chars.map((c) => {
      // Space: không tính vào animation
      if (c.trim() === '' || c === '\u00A0'){
        return `<span class="bw-c" style="animation:none">&nbsp;</span>`;
      }
      const i = animIdx++;
      const safe = c
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="bw-c" style="animation: bwW_${i} ${totalMs}ms ease-in-out infinite">${safe}</span>`;
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

  console.log("[AUTH-UI] ready ✓ v7.5 — sequential wave");
})();