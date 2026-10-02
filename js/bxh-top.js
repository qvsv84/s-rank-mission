/* =========================================================
   BXH TOP — Standalone module
   Requires từ window.SRank:
     api, rankClient, normalizeServerRank, setStatus,
     ensureHtml2Canvas, showCapturePreview, syncQuickTools, onTopOpen
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    topBtn: $("topBtn"),
    topPanel: $("topPanel"),
    topBody: document.querySelector("#topTable tbody"),
    topCloseBtn: $("topCloseBtn"),
    topMonthSelect: $("topMonthSelect"),
    topTitle: $("topTitle"),
    topCaptureBtn: $("topCaptureBtn"),
  };

  if (!els.topPanel || !els.topBody) return; // trang không có BXH

  let topRenderToken = 0;

  // Lazy access tới các dependency (vì main script có thể chưa chạy xong khi file này parse)
  const SR = () => window.SRank || {};
  const api = (...a) => (SR().api ? SR().api(...a) : Promise.reject(new Error("API chưa sẵn sàng")));
  const rankClient = (v) => (SR().rankClient ? SR().rankClient(v) : "B");
  const normalizeServerRank = (v, s) =>
    SR().normalizeServerRank ? SR().normalizeServerRank(v, s) : "B";
  const setStatus = (t) => SR().setStatus && SR().setStatus(t);
  const ensureHtml2Canvas = () =>
    SR().ensureHtml2Canvas
      ? SR().ensureHtml2Canvas()
      : Promise.reject(new Error("html2canvas chưa sẵn sàng"));
  const showCapturePreview = (...a) => SR().showCapturePreview && SR().showCapturePreview(...a);
  const syncQuickTools = () => SR().syncQuickTools && SR().syncQuickTools();
  const onTopOpen = () => SR().onTopOpen && SR().onTopOpen();

  // ---------------------------------------------------------
  // Month select
  // ---------------------------------------------------------
  function initTopMonthSelect() {
    if (!els.topMonthSelect) return;
    const currentMonth = new Date().getMonth() + 1;
    const frag = document.createDocumentFragment();
    for (let month = 1; month <= 12; month++) {
      const option = document.createElement("option");
      option.value = String(month);
      option.textContent = `Tháng ${month}`;
      option.disabled = month > currentMonth;
      frag.appendChild(option);
    }
    els.topMonthSelect.innerHTML = "";
    els.topMonthSelect.appendChild(frag);
    els.topMonthSelect.value = String(currentMonth);
  }

  function resetTopToCurrentMonth() {
    const currentMonth = new Date().getMonth() + 1;
    if (els.topMonthSelect) els.topMonthSelect.value = String(currentMonth);
    if (els.topTitle) els.topTitle.textContent = `🏆 BXH TOP THÁNG ${currentMonth}`;
  }

  // ---------------------------------------------------------
  // Render rows
  // ---------------------------------------------------------
  function renderTopRows(scoreRows, year, month) {
    const frag = document.createDocumentFragment();

    if (
      Array.isArray(scoreRows) &&
      scoreRows.length &&
      (scoreRows[0]?.points != null || scoreRows[0]?.rank)
    ) {
      scoreRows
        .map((row, i) => ({
          name: String(row?.name || "").trim(),
          points: Number(row?.points) || 0,
          rank: normalizeServerRank(row?.rank, row?.points),
          position: Number(row?.position) || i + 1,
        }))
        .filter((r) => r.name)
        .forEach((row, i) => {
          const tr = document.createElement("tr");
          if (i < 3) tr.classList.add("topRow" + (i + 1));
          tr.innerHTML = `<td>${
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1
          }</td><td class="topName"></td><td class="topPoints"></td><td><span class="topRank"></span></td>`;
          tr.querySelector(".topName").textContent = row.name;
          tr.querySelector(".topPoints").textContent = Number(row.points || 0).toLocaleString("vi-VN");
          tr.querySelector(".topRank").textContent = row.rank;
          frag.appendChild(tr);
        });
    } else {
      const daysInMonth = new Date(year, month, 0).getDate();
      const rows = (Array.isArray(scoreRows) ? scoreRows : [])
        .map((emp, index) => {
          const days = emp && emp.days ? emp.days : {};
          let tCount = 0, pCount = 0, qCount = 0, xCount = 0;
          for (let day = 1; day <= daysInMonth; day++) {
            const s = String(days[String(day)] || "").toUpperCase();
            if (s === "T") tCount++;
            else if (s === "P") pCount++;
            else if (s === "Q") qCount++;
            else if (s === "X") xCount++;
          }
          const pts = 300 + tCount * 40 - pCount * 10 - qCount * 100 - xCount * 200;
          return { name: String(emp?.name || "").trim(), points: pts, index };
        })
        .filter((r) => r.name);

      rows.sort((a, b) => b.points - a.points || a.index - b.index);

      rows.forEach((row, i) => {
        const tr = document.createElement("tr");
        if (i < 3) tr.classList.add("topRow" + (i + 1));
        tr.innerHTML = `<td>${
          i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1
        }</td><td class="topName"></td><td class="topPoints"></td><td><span class="topRank"></span></td>`;
        tr.querySelector(".topName").textContent = row.name;
        tr.querySelector(".topPoints").textContent = Number(row.points || 0).toLocaleString("vi-VN");
        tr.querySelector(".topRank").textContent = rankClient(row.points);
        frag.appendChild(tr);
      });
    }

    els.topBody.innerHTML = "";
    els.topBody.appendChild(frag);
  }

  // ---------------------------------------------------------
  // Render BXH
  // ---------------------------------------------------------
  async function renderTop(monthNumber) {
    const now = new Date();
    const month = Number(monthNumber) || now.getMonth() + 1;
    const token = ++topRenderToken;

    if (els.topMonthSelect) els.topMonthSelect.value = String(month);
    if (els.topTitle) els.topTitle.textContent = `🏆 BXH TOP THÁNG ${month}`;
    els.topBody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;padding:18px">Đang tải BXH…</td></tr>';

    try {
      const first = await api("scoreLeaderboard", { month }, 20000);
      if (!first.ok) throw new Error(first.error || "Không tải được BXH điểm");
      if (token !== topRenderToken) return;
      renderTopRows(first.data?.rows || [], now.getFullYear(), month);
    } catch (_) {
      if (token !== topRenderToken) return;
      els.topBody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:18px">Không tải được dữ liệu chấm công</td></tr>';
    }
  }

  // ---------------------------------------------------------
  // Open / Close
  // ---------------------------------------------------------
  function closeTop() {
    els.topPanel.classList.remove("show");
    els.topPanel.setAttribute("aria-hidden", "true");
  }

  function openTop() {
    onTopOpen(); // đóng các panel khác (admin, checklist…)
    resetTopToCurrentMonth();
    els.topPanel.classList.add("show");
    els.topPanel.setAttribute("aria-hidden", "false");
    renderTop();
    syncQuickTools();
  }

  // ---------------------------------------------------------
  // Capture
  // ---------------------------------------------------------
  async function captureTop() {
    if (!els.topPanel.classList.contains("show")) return;
    const btn = els.topCaptureBtn;
    if (!btn) return;

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "⏳ Đang tạo ảnh…";

    let clone = null, imageUrl = null;
    try {
      await ensureHtml2Canvas();

      clone = els.topPanel.cloneNode(true);
      clone.id = "topCaptureTemp";
      clone.querySelector("#topActions")?.remove();
      Object.assign(clone.style, {
        position: "absolute",
        left: "-100000px",
        top: "0",
        width: Math.min(window.innerWidth * 0.92, 500) + "px",
        maxHeight: "none",
        height: "auto",
        transform: "none",
        opacity: "1",
        visibility: "visible",
        pointerEvents: "none",
        background: "linear-gradient(145deg,#ffffff,#f4faf3 55%,#edf6eb)",
        border: "1px solid #cbdcc9",
        boxShadow: "0 16px 45px rgba(53,91,61,.12)",
        overflow: "visible",
      });

      const select = clone.querySelector("#topMonthSelect");
      if (select)
        Object.assign(select.style, {
          background: "#f7fbf6",
          color: "#315744",
          borderColor: "#cbdcc9",
          boxShadow: "none",
          backgroundImage: "none",
          paddingRight: "14px",
        });

      const scroll = clone.querySelector("#topScroll");
      if (scroll) {
        scroll.style.maxHeight = "none";
        scroll.style.height = "auto";
        scroll.style.overflow = "visible";
      }

      document.body.appendChild(clone);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(clone, {
        backgroundColor: null,
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 10000,
        width: clone.offsetWidth,
        height: clone.scrollHeight,
        windowWidth: clone.offsetWidth,
        windowHeight: clone.scrollHeight,
      });

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
      if (!blob) throw new Error("Không tạo được ảnh BXH");

      imageUrl = URL.createObjectURL(blob);
      showCapturePreview(
        imageUrl,
        blob,
        "📸 BXH TOP đã chụpp",
        "bxh-top-dao-meo.png",
        "Chrome / Cốc Cốc: bấm Lưu ảnh hoặc nhấn giữ vào ảnh để lưu."
      );
      setStatus("Đã tạo ảnh BXH ✓");
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "Chụp BXH thất bại");
      if (imageUrl) {
        try { URL.revokeObjectURL(imageUrl); } catch (_) {}
        imageUrl = null;
      }
    } finally {
      clone?.remove();
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  // ---------------------------------------------------------
  // Events
  // ---------------------------------------------------------
  function bindEvents() {
    els.topBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTop();
    });
    els.topMonthSelect?.addEventListener("change", () =>
      renderTop(Number(els.topMonthSelect.value))
    );
    els.topCloseBtn?.addEventListener("click", () => {
      closeTop();
      syncQuickTools();
    });
    els.topPanel?.addEventListener("click", (e) => {
      if (e.target === els.topPanel) closeTop();
    });
    els.topCaptureBtn?.addEventListener("click", captureTop);
  }

  // ---------------------------------------------------------
  // Init + Public API
  // ---------------------------------------------------------
  function init() {
    initTopMonthSelect();
    bindEvents();
  }

  window.BXH = {
    init,
    open: openTop,
    close: closeTop,
    isOpen: () => els.topPanel.classList.contains("show"),
    render: renderTop,
    resetMonth: resetTopToCurrentMonth,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
