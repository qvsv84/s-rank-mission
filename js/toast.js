/* =========================================================
   TOAST — v1.0
   ---------------------------------------------------------
   Tách khỏi main.js để có thể dùng độc lập từ bất kỳ module
   nào (lunch.js, attendance.js, birthday-chat.js, ...).

   API:
     Toast.show(text, options)   -> HTMLElement | null
       options.type: 'info' | 'success' | 'error' | 'warning' | 'person'
       options.icon: string (override icon mặc định)
       options.duration: number (ms, min 1200)
       options.dedup: boolean (default true, chống spam)
     Toast.dismiss(el)           -> void

   Đặc điểm:
     - Dedup theo text trong 2s
     - Tối đa 3 toast hiển thị
     - Auto-dismiss sau duration (default 1800ms)
     - Click để dismiss ngay
     - Có progress bar animation
     - aria-live="polite" cho screen reader

   YÊU CẦU:
     - Load SAU config.js, TRƯỚC main.js (vì main.js dùng Toast
       trong setStatus()).
     - Cần CSS: #toastContainer, .toast, .toast-icon, .toast-text,
       .toast-progress, @keyframes toast-in / toast-out
       (đã có trong css/main.css).
   ========================================================= */
(function () {
  "use strict";

  if (window.Toast) return; // đã load

  let container = null;
  const recent = new Map();
  const DEDUP_MS = 2000;
  const MAX_TOASTS = 3;

  function ensure() {
    if (container && container.isConnected) return container;
    container = document.createElement("div");
    container.id = "toastContainer";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
    return container;
  }

  function iconFor(type) {
    if (type === "success") return "✓";
    if (type === "error")   return "⚠";
    if (type === "warning") return "!";
    if (type === "person")  return "🌸";
    return "i";
  }

  function dismiss(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el._toastTimer);
    el.classList.add("hide");
    setTimeout(function () { el.remove(); }, 300);
  }

  function show(text, options) {
    options = options || {};
    const type = options.type || "info";
    const duration = Math.max(1200, options.duration || 1800);
    const icon = options.icon || iconFor(type);
    const msg = String(text || "").trim();
    if (!msg) return null;

    // Dedup theo text
    if (options.dedup !== false) {
      const now = Date.now();
      const last = recent.get(msg);
      if (last && now - last < DEDUP_MS) return null;
      recent.set(msg, now);
      if (recent.size > 60) {
        for (const [k, t] of recent) {
          if (now - t > 10000) recent.delete(k);
        }
      }
    }

    const c = ensure();

    // Xoá toast cùng type + cùng text nếu đang hiện
    if (options.dedup !== false) {
      const dup = Array.from(c.children).find(function (el) {
        return el.classList.contains(type) &&
          el.querySelector(".toast-text") &&
          el.querySelector(".toast-text").textContent === msg;
      });
      if (dup) dup.remove();
    }

    // Giới hạn MAX_TOASTS
    while (c.children.length >= MAX_TOASTS) {
      if (c.firstElementChild) c.firstElementChild.remove();
    }

    const el = document.createElement("div");
    el.className = "toast " + type;
    el.style.setProperty("--duration", duration + "ms");
    el.setAttribute("role", type === "error" ? "alert" : "status");

    const iconEl = document.createElement("div");
    iconEl.className = "toast-icon";
    iconEl.textContent = icon;

    const textEl = document.createElement("div");
    textEl.className = "toast-text";
    textEl.textContent = msg;

    const progressEl = document.createElement("div");
    progressEl.className = "toast-progress";

    el.append(iconEl, textEl, progressEl);
    el.addEventListener("click", function () { dismiss(el); }, { once: true });
    c.appendChild(el);

    el._toastTimer = setTimeout(function () { dismiss(el); }, duration);
    return el;
  }

  window.Toast = { show: show, dismiss: dismiss };
  console.log("[Toast] ready ✓");
})();