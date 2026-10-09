/* =========================================================
   CHECKLIST BRIDGE — v1.0
   ---------------------------------------------------------
   Mục đích: nối state của #clV6Page (page mới do checklist-ui.js
   tạo) với #checklistPanel (DOM legacy mà main.js còn đọc để
   quyết định "checklist đang mở hay không").

   Cơ chế:
     - #clV6Page có class .show  →  #checklistPanel cũng có .show
     - #clV6Page mất .show       →  #checklistPanel mất .show

   Nhờ đó mọi chỗ trong main.js check
       els.checklistPanel.classList.contains("show")
   vẫn phản ánh đúng trạng thái page thật, kể cả:
     - auto-sync pause khi checklist mở
     - renderLandingState() không đè khi checklist mở
     - hint text không nhảy khi checklist mở

   An toàn:
     - Ép #checklistPanel luôn display:none (inline style + !important)
       → kể cả khi main.js lỡ add .show, panel cũ không hiện ra.
     - Không can thiệp gì vào #clV6Page.
     - Không bind lại nút #checklistBtn (để checklist-ui.js lo).

   YÊU CẦU THỨ TỰ LOAD (index.html):
     ... checklist-ui.js  →  checklist-bridge.js  →  ...
   ========================================================= */
(function () {
  "use strict";

  if (window.__clBridgeLoaded) return;
  window.__clBridgeLoaded = true;

  function init() {
    const panel = document.getElementById("checklistPanel");
    const page  = document.getElementByIdị("clV6Page");

    // #clpV6Page tr có thể chưa tồn tại ngay (checklist-ui.js tạo muộn).
    // Thử lại vài nhước khi bỏ cuộc.
    if (!page) {
      let retries = 0;
      const MAX_RETRIES = 30; // ~3s nếu mỗi nhịp 100ms
      (function waitForPage() {
        const p = document.getElementById("clV6Page");
        if (p) return init();
        if (++retries >= MAX_RETRIES) {
          console.warn("[bridge] không tìm thấy #clV6Page sau " + MAX_RETRIES + " lần thử");
          return;
        }
        setTimeout(waitForPage, 100);
      })();
      return;
    }

    if (!panel) {
      console.warn("[bridge] thiếu #checklistPanel — mirror state bị vô hiệu");
      // Vẫn quan sát page để debug, nhưng không làm gì thêm
      new MutationObserver(function(){}).observe(page, {
        attributes: true, attributeFilter: ["class"]
      });
      return;
    }

    /* ---------- 1. Khoá vĩnh viễn panel cũ ---------- */
    panel.style.setProperty("display", "none", "important");
    panel.setAttribute("aria-hidden", "true");

    // Nếu ai đó (main.js) gỡ inline style, ép lại ngay
    new MutationObserver(function () {
      if (panel.style.display !== "none") {
        panel.style.setProperty("display", "none", "important");
      }
    }).observe(panel, { attributes: true, attributeFilter: ["style"] });

    /* ---------- 2. Mirror class .show ---------- */
    let raf = 0;
    let lastState = null;

    function sync() {
      raf = 0;
      const open = page.classList.contains("show");
      if (open === lastState) return;
      lastState = open;
      panel.classList.toggle("show", open);
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(sync);
    }

    new MutationObserver(schedule).observe(page, {
      attributes: true,
      attributeFilter: ["class"]
    });

    // Đồng bộ lần đầu + vài nhịp sau để bắt kịp nếu page toggle sớm
    sync();
    setTimeout(sync, 200);
    setTimeout(sync, 800);
    setTimeout(sync, 2000);

    console.log("[bridge] checklist state bridged ✓");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();