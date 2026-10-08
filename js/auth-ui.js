/* =========================================================
   SRANK AUTH UI — v6 (Reverse thinking)
   ---------------------------------------------------------
   TƯ DUY NGƯỢC:
   - Không kill animation (mất state cuối → mất nút)
   - Skip animation tới cuối bằng animation-delay: -999s
   - Pause tại state cuối bằng animation-play-state: paused
   - CSS thuần → apply trước paint → không nháy, không phụ
     thuộc timing JS/MutationObserver
   ========================================================= */
(function(){
  "use strict";

  const Auth = window.SRank && window.SRank.Auth;
  if (!Auth) { console.error("[AUTH-UI] SRank.Auth chưa load"); return; }

  const $ = id => document.getElementById(id);
  const question = $("question");
  const overlay = $("loginOverlay");
  const closeBtn = $("loginClose");
  const userInput = $("loginUsername");
  const passInput = $("loginPassword");
  const msgEl = $("loginMsg");
  const submitBtn = $("loginSubmit");
  const logoutBtn = $("logoutBtn");
  const logoutName = $("logoutName");
  const appVersion = $("appVersion");

  if (!question || !overlay) { console.warn("[AUTH-UI] thiếu DOM"); return; }

  let currentUser = null;
  let submitting = false;

  /* ============================================================
     CSS — TƯ DUY NGƯỢC
     ------------------------------------------------------------
     Mọi .landing-cta ngay khi vào DOM → skip animation tới cuối
     → hiện tĩnh, không nháy. Chỉ idle mới cho animation chạy.
     ============================================================ */
  function injectCtaFixCss(){
    if (document.getElementById('authCtaFixCss')) return;
    const s = document.createElement('style');
    s.id = 'authCtaFixCss';
    s.textContent = `
      /* MẶC ĐỊNH: mọi CTA → skip animation tới cuối + pause
         → element luôn visible ngay frame đầu, không nháy */
      .landing-cta {
        animation-delay: -999s !important;
        animation-play-state: paused !important;
      }

      /* Chỉ khi ở trạng thái idle (⏰ Chấm công) → cho animation chạy */
      .landing-cta[data-auth-state="idle"] {
        animation-delay: 0s !important;
        animation-play-state: running !important;
      }
    `;
    document.head.appendChild(s);
  }
  injectCtaFixCss();

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

  function getCtaInfo(){
    if (isChecklistLocked()){
      return { text: "🔒 Tạm khoá Checklist", action: "none", disabled: true, state: "done" };
    }
    if (!currentUser){
      return { text: "🔐 Đăng nhập", action: "login", disabled: false, state: "login" };
    }
    const idx = findUserIndex(currentUser.displayName);
    if (idx < 0){
      return { text: "⚠ Tên không khớp checklist", action: "none", disabled: true, state: "done" };
    }
    try {
      const st = window.SRank.getCurrentState ? window.SRank.getCurrentState() : null;
      if (st && st.checked && st.checked[idx] && st.times && st.times[idx]){
        return { text: "✓ Đã chấm công (" + st.times[idx] + ")", action: "none", disabled: true, state: "done" };
      }
    } catch(_) {}
    return { text: "⏰ Chấm công", action: "checkin", disabled: false, state: "idle" };
  }

  /* ============ CTA UPDATE ============ */
  function updateCta(){
    const cta = question.querySelector(".landing-cta");
    if (!cta) return false;
    const info = getCtaInfo();

    // Set data-attr TRƯỚC — CSS dựa vào attr này để quyết định
    if (cta.dataset.authState !== info.state) {
      cta.dataset.authState = info.state;
    }

    if (cta.textContent !== info.text) cta.textContent = info.text;

    if (info.disabled){
      if (!cta.classList.contains("locked")) cta.classList.add("locked");
      cta.setAttribute("aria-disabled", "true");
      cta.setAttribute("tabindex", "-1");
    } else {
      cta.classList.remove("locked");
      cta.removeAttribute("aria-disabled");
      cta.setAttribute("tabindex", "0");
    }
    return true;
  }

  let _updateScheduled = false;
  function scheduleUpdate(){
    if (_updateScheduled) return;
    _updateScheduled = true;
    requestAnimationFrame(function(){
      _updateScheduled = false;
      updateCta();
    });
  }

  // Set state mặc định ngay khi init
  setTimeout(updateCta, 0);

  let retryCount = 0;
  const retryTimer = setInterval(function(){
    retryCount++;
    updateCta();
    if (retryCount >= 10) clearInterval(retryTimer);
  }, 150);

  // MutationObserver — chủ yếu để set data-attr sớm nhất có thể
  // (CSS đã tự xử lý animation, observer chỉ để cập nhật text/state)
  try {
    new MutationObserver(scheduleUpdate).observe(question, {
      childList: true, subtree: true, characterData: true
    });
  } catch(_) {}

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

  /* ============ BURST ============ */
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

  /* ============ CHECKIN ============ */
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
      if (window.SRank.rerenderLanding) window.SRank.rerenderLanding();
      scheduleUpdate();
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
    if (info.disabled) return;
    if (info.action === "login") openLoginForm();
    else if (info.action === "checkin") handleCheckin();
  }

  question.addEventListener("click", intercept, true);
  question.addEventListener("pointerup", intercept, true);
  question.addEventListener("keydown", function(e){
    if (e.key !== "Enter" && e.key !== " ") return;
    intercept(e);
  }, true);

  /* ============ LOGIN OVERLAY EVENTS ============ */
  closeBtn.addEventListener("click", closeLoginForm);
  overlay.addEventListener("click", function(e){
    if (e.target === overlay) closeLoginForm();
  });
  submitBtn.addEventListener("click", handleLoginSubmit);
  passInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") handleLoginSubmit();
  });
  userInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") passInput.focus();
  });

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && overlay.classList.contains("show")){
      e.preventDefault();
      e.stopImmediatePropagation();
      closeLoginForm();
    }
  }, true);

  /* ============ LOGOUT BTN ============ */
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
    updateCta();
  });

  currentUser = Auth.getCurrentUser();
  updateLogoutBtn();
  updateCta();

  setInterval(function(){
    if (!document.hidden) updateCta();
  }, 2000);

  /* ============ EXPOSE ============ */
  window.SRank.openLogin = openLoginForm;

  console.log("[AUTH-UI] ready ✓ v6");
})();