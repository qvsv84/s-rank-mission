/* =========================================================
   ATTENDANCE — Chấm công (IIFE #2)
   Phụ thuộc các API đã export từ js/main.js:
     window.__srankApi
     window.createWheel
     window.getAvatarUrl
     window.syncQuickTools
     window.__getChecklistState
     window.__clearCheckinForName
   Sự kiện lắng nghe: "checkinDone" (dispatch từ main.js)
   ========================================================= */
(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const page = $("attendancePage");
  const back = $("attendanceBack");
  const employee = $("attendanceEmployee");
  const grid = $("attendanceGrid");
  const monthLabel = $("attendanceMonthLabel");
  const yearLabel = $("attendanceYearLabel");
  const workCount = $("attendanceWorkCount");
  const offCount = $("attendanceOffCount");
  const leaveCount = $("attendanceLeaveCount");
  const prev = $("attendancePrev");
  const next = $("attendanceNext");
  const attendanceBtn = $("attendanceBtn");
  const attendanceSyncBtn = $("attendanceSyncBtn");
  if(!page || !employee || !grid) return;

  let ATTENDANCE_EMPLOYEES = [];
  let attendanceAutoRefreshTimer = null;
  let attendanceAutoRefreshCountdown = 60;
  let attendanceLastSaveAt = 0;
  const ATTENDANCE_AUTO_REFRESH_SEC = 60;

  function startAttendanceAutoRefresh(){
    stopAttendanceAutoRefresh();
    attendanceAutoRefreshCountdown = ATTENDANCE_AUTO_REFRESH_SEC;
    updateAttendanceCountdown();
    attendanceAutoRefreshTimer = setInterval(() => {
      if(document.hidden || !page.classList.contains("show")) return;
      if(Date.now() - attendanceLastSaveAt < 10000){ attendanceAutoRefreshCountdown = ATTENDANCE_AUTO_REFRESH_SEC; updateAttendanceCountdown(); return; }
      if(attendanceStatusOverlay.classList.contains("show") || attendanceMultiMode) return;
      attendanceAutoRefreshCountdown--;
      if(attendanceAutoRefreshCountdown <= 0){ attendanceAutoRefreshCountdown = ATTENDANCE_AUTO_REFRESH_SEC; loadAttendanceMonth(true).catch(()=>{}); }
      updateAttendanceCountdown();
    }, 1000);
  }
  function stopAttendanceAutoRefresh(){ if(attendanceAutoRefreshTimer){ clearInterval(attendanceAutoRefreshTimer); attendanceAutoRefreshTimer = null; } }
  function updateAttendanceCountdown(){ const el = $("attendanceCountdown"); if(el) el.textContent = String(Math.max(0, attendanceAutoRefreshCountdown)); }
  function setAttendanceFooterState(state, message){
    const bar = $("attendanceSyncStatus");
    if(!bar) return;
    bar.className = "att-footer-line";
    if(state === "ok" || state === "syncing") bar.classList.add("syncing");
    if(state === "error") bar.classList.add("error");
    const text = bar.querySelector(".att-footer-text");
    if(text) text.textContent = message || "";
    if(state === "ok") setTimeout(() => { if(!bar.classList.contains("error")) bar.className = "att-footer-line"; }, 2000);
  }

  const ATTENDANCE_DATA = {};
  const ATTENDANCE_CACHE_PREFIX = "srank_attendance_check_v2_";
  const ATTENDANCE_RAW_MEMORY = new Map();
  let attendanceServerLoaded = false, attendanceServerLoadedKey = "";
  let attendanceLoadToken = 0, attendanceLoadPromise = null, attendanceLoadPromiseKey = "";
  let attendanceEditingDay = 0;
  let attendanceMultiMode = false;
  const attendanceMultiDays = new Set();
  let attendanceLockUntil = 0;
  let attendancePreloadedKeys = new Set();

  const attendanceStatusOverlay = $("attendanceStatusOverlay");
  const attendanceMultiBtn = $("attendanceMultiBtn");
  const attendanceMultiBar = $("attendanceMultiBar");
  const attendanceMultiCount = $("attendanceMultiCount");
  const attendanceMultiCancel = $("attendanceMultiCancel");
  const attendanceStatusClose = $("attendanceStatusClose");
  const attendanceStatusSub = $("attendanceStatusSub");
  const attendanceStatusSaving = $("attendanceStatusSaving");

  const attendanceErrorText = e => String(e?.message || e || "Lỗi không xác định").trim() || "Lỗi không xác định";
  const attendanceCacheKey = (y,m) => ATTENDANCE_CACHE_PREFIX + y + "-" + String(m + 1).padStart(2, "0");
  function loadAttendanceCache(year, month){
    try{
      const raw = localStorage.getItem(attendanceCacheKey(year, month));
      if(!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : null;
    }catch(_){ return null; }
  }
  function saveAttendanceCache(year, month, data){
    try{ localStorage.setItem(attendanceCacheKey(year, month), JSON.stringify({month:month+1, year, employees:data})); }catch(_){}
  }
  const rememberAttendanceRaw = (year, month, employees) => { ATTENDANCE_RAW_MEMORY.set(year + "-" + (month + 1), Array.isArray(employees) ? employees : []); };
  const getAttendanceRawMemory = (year, month) => ATTENDANCE_RAW_MEMORY.get(year + "-" + (month + 1)) || null;
  const pad = n => String(n).padStart(2, "0");
  const key = (y, m, d) => `${y}-${pad(m+1)}-${pad(d)}`;
  const mondayIndex = date => (date.getDay() + 6) % 7;

  function applyAttendanceData(payload, year, month){
    const map = {};
    (payload?.employees || []).forEach(person => {
      const name = String(person?.name || "").trim();
      if(!name) return;
      map[name] = {};
      const days = person?.days || {};
      Object.keys(days).forEach(day => {
        const status = String(days[day] ?? "").trim().toUpperCase();
        if(["P","O","T","Q","X"].includes(status)) map[name][key(year, month, Number(day))] = status;
      });
    });
    Object.keys(map).forEach(name => { ATTENDANCE_DATA[name] = map[name]; });
    const seen = new Set();
    const merged = [];
    (payload?.employees || []).forEach(x => {
      const name = String(x?.name || "").trim();
      if(name && !seen.has(name)){ seen.add(name); merged.push(name); }
    });
    ATTENDANCE_EMPLOYEES.forEach(n => { if(!seen.has(n)){ seen.add(n); merged.push(n); } });
    ATTENDANCE_EMPLOYEES = merged;
    const rawEmployees = Array.isArray(payload?.employees) ? payload.employees : [];
    rememberAttendanceRaw(year, month, rawEmployees);
    saveAttendanceCache(year, month, rawEmployees);
    syncAttendanceEmployeeControls();
    setAttendanceFooterState(
      ATTENDANCE_EMPLOYEES.length ? "ok" : "error",
      ATTENDANCE_EMPLOYEES.length
        ? `Đã đồng bộ ${ATTENDANCE_EMPLOYEES.length} kiểm duyệt viên • ${new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}`
        : "Google Sheet trả về 0 kiểm duyệt viên — kiểm tra Check!C19:C32."
    );
  }

  function applyAttendanceCache(year, month){
    const cache = loadAttendanceCache(year, month);
    if(!cache || !Array.isArray(cache.employees)) return false;
    rememberAttendanceRaw(year, month, cache.employees);
    const prefix = year + "-" + pad(month + 1) + "-";
    cache.employees.forEach(person => {
      const name = String(person?.name || "").trim();
      if(!name) return;
      if(!ATTENDANCE_DATA[name]) ATTENDANCE_DATA[name] = {};
      Object.keys(ATTENDANCE_DATA[name]).forEach(k => { if(k.startsWith(prefix)) delete ATTENDANCE_DATA[name][k]; });
      const days = person?.days || {};
      Object.keys(days).forEach(day => {
        const status = String(days[day] ?? "").trim().toUpperCase();
        if(["P","O","T","Q","X"].includes(status)) ATTENDANCE_DATA[name][key(year, month, Number(day))] = status;
      });
    });
    const seen = new Set(ATTENDANCE_EMPLOYEES);
    cache.employees.forEach(p => {
      const name = String(p?.name || "").trim();
      if(name && !seen.has(name)){ seen.add(name); ATTENDANCE_EMPLOYEES.push(name); }
    });
    syncAttendanceEmployeeControls();
    return true;
  }

  function statusInfo(status){
    const s = String(status || "").trim().toUpperCase();
    if(s === "V") return {className:"work", label:"✓", icon:"✓", shortLabel:""};
    if(s === "P") return {className:"leave", label:"Phép", icon:"🌴", shortLabel:"phép"};
    if(s === "O") return {className:"off", label:"OFF", icon:"—", shortLabel:"off"};
    if(s === "T") return {className:"ot", label:"OT", icon:"⚡", shortLabel:"ot"};
    if(s === "Q") return {className:"q", label:"Quên", icon:"❓", shortLabel:"quên"};
    if(s === "X") return {className:"x", label:"X", icon:"⚠️", shortLabel:"kp"};
    return {className:"empty", label:"", icon:"", shortLabel:""};
  }

  function rebuildAttendanceCacheFromCurrent(year, month){
    const employees = ATTENDANCE_EMPLOYEES.map(name => {
      const days = {};
      for(let d = 1; d <= 31; d++){
        const value = ATTENDANCE_DATA[name]?.[key(year, month, d)];
        if(["P","O","T","Q","X"].includes(value)) days[String(d)] = value;
      }
      return {name, days};
    });
    rememberAttendanceRaw(year, month, employees);
    saveAttendanceCache(year, month, employees);
  }

  function syncAttendanceEmployeeControls(){
    const cur = selectedName;
    if(ATTENDANCE_EMPLOYEES.includes(cur)) wheelIndex = ATTENDANCE_EMPLOYEES.indexOf(cur);
    else { selectedName = ATTENDANCE_EMPLOYEES[0] || ""; wheelIndex = 0; }
    const sameList = employee.options.length === ATTENDANCE_EMPLOYEES.length &&
      ATTENDANCE_EMPLOYEES.every((name, i) => employee.options[i]?.value === name);
    if(!sameList){
      const frag = document.createDocumentFragment();
      ATTENDANCE_EMPLOYEES.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name; opt.textContent = name;
        frag.appendChild(opt);
      });
      employee.innerHTML = "";
      employee.appendChild(frag);
      nameWheel.setItems(ATTENDANCE_EMPLOYEES);
    }
    employee.value = selectedName;
    updateWheelButton();
    updateEmployeeAvatar();
  }

  async function loadAttendanceMonth(force = false){
    if(!force && Date.now() < attendanceLockUntil) return {ok:true, locked:true};
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const requestKey = y + "-" + (m + 1);
    if(attendanceLoadPromise && attendanceLoadPromiseKey === requestKey) return attendanceLoadPromise;
    const token = ++attendanceLoadToken;
    if(!force && attendanceServerLoaded && attendanceServerLoadedKey === requestKey) return {ok:true, cached:true};
    if(force) setAttendanceFooterState("syncing", "Đang đồng bộ…");
    else if(!ATTENDANCE_EMPLOYEES.length){ applyAttendanceCache(y, m); render(); }

    const promise = (async () => {
      try{
        const r = await window.__srankApi("getAttendance", {month:m+1, _ts:Date.now()}, 20000);
        if(!r || r.ok !== true) throw new Error(r?.error || "Google Sheet trả về dữ liệu không hợp lệ");
        if(!r.data || !Array.isArray(r.data.employees)) throw new Error("Phản hồi getAttendance thiếu danh sách employees");
        if(viewDate.getFullYear() === y && viewDate.getMonth() === m){
          applyAttendanceData(r.data, y, m);
          attendanceServerLoaded = true;
          attendanceServerLoadedKey = requestKey;
          render();
        }
        return r;
      }catch(e){
        const msg = attendanceErrorText(e);
        const hasCache = applyAttendanceCache(y, m);
        setAttendanceFooterState("error", hasCache ? `Lỗi đồng bộ: ${msg} • đang dùng dữ liệu đã lưu` : `Lỗi đồng bộ: ${msg}`);
        render();
        throw e;
      }finally{
        if(attendanceLoadPromiseKey === requestKey){ attendanceLoadPromise = null; attendanceLoadPromiseKey = ""; }
      }
    })();
    attendanceLoadPromise = promise;
    attendanceLoadPromiseKey = requestKey;
    return promise;
  }

  async function preloadAdjacentMonths(){
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const tasks = [];
    for(let offset = -2; offset <= 2; offset++){
      if(offset === 0) continue;
      let ny = y, nm = m + offset;
      while(nm < 0){ nm += 12; ny -= 1; }
      while(nm > 11){ nm -= 12; ny += 1; }
      tasks.push({year:ny, month:nm + 1});
    }
    for(const t of tasks){
      const cacheKey = t.year + "-" + t.month;
      if(attendancePreloadedKeys.has(cacheKey)) continue;
      if(getAttendanceRawMemory(t.year, t.month - 1)){ attendancePreloadedKeys.add(cacheKey); continue; }
      attendancePreloadedKeys.add(cacheKey);
      try{
        const r = await window.__srankApi("getAttendance", {month:t.month, _ts:Date.now()}, 15000);
        if(r && r.ok && Array.isArray(r.data?.employees)){
          rememberAttendanceRaw(t.year, t.month - 1, r.data.employees);
          saveAttendanceCache(t.year, t.month - 1, r.data.employees);
        }
      }catch(_){}
    }
  }

  function updateEmployeeAvatar(){
    const el = $("attendanceEmployeeAvatar");
    if(!el) return;
    const name = selectedName || "";
    let url = "";
    try{
      if(typeof window.getAvatarUrl === "function") url = window.getAvatarUrl(name);
      else if(window.SRank && typeof window.SRank.getAvatarUrl === "function") url = window.SRank.getAvatarUrl(name);
    }catch(_){}
    if(url){
      el.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = name ? name.slice(0,1).toUpperCase() : "?";
    }
  }

  function updateAttendanceMultiUI(){
    attendanceMultiCount.textContent = `${attendanceMultiDays.size} ngày`;
    attendanceMultiBar.classList.toggle("show", attendanceMultiMode);
    attendanceMultiBar.setAttribute("aria-hidden", attendanceMultiMode ? "false" : "true");
    grid.querySelectorAll(".att-day[data-day]").forEach(el => el.classList.toggle("multi-selected", attendanceMultiDays.has(Number(el.dataset.day))));
  }
  function startAttendanceMulti(){ closeAttendanceStatus(); attendanceMultiMode = true; attendanceMultiDays.clear(); updateAttendanceMultiUI(); }
  function cancelAttendanceMulti(){ attendanceMultiMode = false; attendanceMultiDays.clear(); updateAttendanceMultiUI(); }
  function toggleAttendanceMultiDay(day){
    if(attendanceMultiDays.has(day)) attendanceMultiDays.delete(day);
    else attendanceMultiDays.add(day);
    updateAttendanceMultiUI();
  }

  async function saveAttendanceBatchStatus(status){
    const days = [...attendanceMultiDays].sort((a, b) => a - b);
    if(!days.length || !selectedName) return;
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const nameAtRequest = selectedName, monthAtRequest = m + 1;
    const cleanStatus = String(status || "").trim().toUpperCase();
    if(cleanStatus && !["P","O","T","Q","X"].includes(cleanStatus)) return;
    const snapshots = days.map(day => ({day, key:key(y,m,day), prev:ATTENDANCE_DATA[nameAtRequest]?.[key(y,m,day)] || ""}));
    if(!cleanStatus){
      try{ if(typeof window.__clearCheckinForName === "function") await window.__clearCheckinForName(nameAtRequest); }catch(_){}
    }
    if(!ATTENDANCE_DATA[nameAtRequest]) ATTENDANCE_DATA[nameAtRequest] = {};
    days.forEach(day => {
      const k = key(y, m, day);
      if(cleanStatus) ATTENDANCE_DATA[nameAtRequest][k] = cleanStatus;
      else delete ATTENDANCE_DATA[nameAtRequest][k];
    });
    if(viewDate.getFullYear() === y && viewDate.getMonth() === m && selectedName === nameAtRequest) render();
    attendanceMultiMode = false; attendanceMultiDays.clear(); updateAttendanceMultiUI();
    setAttendanceFooterState("syncing", `Đang lưu ${days.length} ngày…`);
    attendanceLastSaveAt = Date.now();
    try{
      const r = await window.__srankApi("setAttendanceBatch", {month:monthAtRequest, days, name:nameAtRequest, status:cleanStatus}, 20000);
      if(!r || r.ok !== true) throw new Error(r?.error || "Không xác nhận");
      rebuildAttendanceCacheFromCurrent(y, m);
      attendanceLockUntil = Date.now() + 3000;
      setAttendanceFooterState("ok", `Đã lưu ${days.length} ngày ✓`);
    }catch(e){
      snapshots.forEach(s => {
        if(s.prev) ATTENDANCE_DATA[nameAtRequest][s.key] = s.prev;
        else delete ATTENDANCE_DATA[nameAtRequest][s.key];
      });
      if(viewDate.getFullYear() === y && viewDate.getMonth() === m && selectedName === nameAtRequest) render();
      setAttendanceFooterState("error", "Không lưu được: " + attendanceErrorText(e));
    }
  }

  function openAttendanceStatus(day){
    if(!selectedName || !Number.isInteger(day)) return;
    attendanceEditingDay = day;
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const dateText = pad(day) + "/" + pad(m+1) + "/" + y;
    const cur = ATTENDANCE_DATA[selectedName]?.[key(y, m, day)];
    const isFuture = new Date(y, m, day) > new Date();
    const info = cur ? statusInfo(cur) : (isFuture ? {label:"Chưa tới ngày"} : {label:"✓ — Đi làm bình thường"});
    attendanceStatusSub.textContent = selectedName + " • " + dateText + " • " + info.label;
    attendanceStatusSaving.textContent = "";
    attendanceStatusOverlay.classList.add("show");
    attendanceStatusOverlay.setAttribute("aria-hidden", "false");
  }
  function closeAttendanceStatus(){
    attendanceStatusOverlay.classList.remove("show");
    attendanceStatusOverlay.setAttribute("aria-hidden", "true");
    attendanceEditingDay = 0;
  }

  async function saveAttendanceStatus(status){
    const day = attendanceEditingDay;
    if(!day || !selectedName) return;
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const cleanStatus = status === "__clear" ? "" : String(status || "").trim().toUpperCase();
    if(cleanStatus && !["P","O","T","Q","X"].includes(cleanStatus)) return;
    const nameAtRequest = selectedName, monthAtRequest = m + 1, dayAtRequest = day;
    const k = key(y, m, day);
    const prevValue = ATTENDANCE_DATA[nameAtRequest]?.[k] || "";
    if(!cleanStatus){
      try{ if(typeof window.__clearCheckinForName === "function") await window.__clearCheckinForName(nameAtRequest); }catch(_){}
    }
    if(!ATTENDANCE_DATA[nameAtRequest]) ATTENDANCE_DATA[nameAtRequest] = {};
    if(cleanStatus) ATTENDANCE_DATA[nameAtRequest][k] = cleanStatus;
    else delete ATTENDANCE_DATA[nameAtRequest][k];
    if(viewDate.getFullYear() === y && viewDate.getMonth() === m && selectedName === nameAtRequest) render();
    closeAttendanceStatus();
    setAttendanceFooterState("syncing", "Đang lưu…");
    attendanceLastSaveAt = Date.now();
    try{
      const r = await window.__srankApi("setAttendance", {month:monthAtRequest, day:dayAtRequest, name:nameAtRequest, status:cleanStatus}, 20000);
      if(!r || r.ok !== true) throw new Error(r?.error || "Google Sheet không xác nhận");
      rebuildAttendanceCacheFromCurrent(y, m);
      attendanceLockUntil = Date.now() + 3000;
      setAttendanceFooterState("ok", "Đã lưu ✓");
    }catch(e){
      if(prevValue) ATTENDANCE_DATA[nameAtRequest][k] = prevValue;
      else delete ATTENDANCE_DATA[nameAtRequest][k];
      if(viewDate.getFullYear() === y && viewDate.getMonth() === m && selectedName === nameAtRequest) render();
      setAttendanceFooterState("error", "Không lưu được: " + attendanceErrorText(e));
    }
  }

  const viewport = $("attendanceNameWheelViewport");
  const itemsBox = $("attendanceNameWheelItems");
  const wheelOverlay = $("attendanceNameWheel");
  const wheelClose = $("attendanceNameWheelClose");
  const wheelConfirm = $("attendanceNameWheelConfirm");
  const wheelBtn = $("attendanceEmployeeWheelBtn");
  const nameWheel = window.createWheel({viewport, itemsBox, itemHeight: 58, itemClass: "att-name-wheel-item"});
  nameWheel.attach();
  let wheelIndex = 0;
  let selectedName = "";

  function buildNameWheel(){ nameWheel.setItems(ATTENDANCE_EMPLOYEES); }
  function updateWheelButton(){
    const value = wheelBtn?.querySelector(".wheel-value");
    if(value) value.textContent = selectedName || "Chọn kiểm duyệt viên";
  }
  function openNameWheel(){
    if(!ATTENDANCE_EMPLOYEES.length){
      setAttendanceFooterState("syncing", "Đang tải danh sách…");
      loadAttendanceMonth(true).then(() => { if(ATTENDANCE_EMPLOYEES.length) openNameWheel(); else setAttendanceFooterState("error", "Chưa có danh sách kiểm duyệt viên"); }).catch(() => {});
      return;
    }
    nameWheel.setIndex(Math.max(0, ATTENDANCE_EMPLOYEES.indexOf(selectedName)));
    wheelOverlay.classList.add("show");
    wheelOverlay.setAttribute("aria-hidden", "false");
    nameWheel.schedule();
    requestAnimationFrame(() => { nameWheel.schedule(); requestAnimationFrame(() => nameWheel.schedule()); });
    if(typeof window.syncQuickTools === "function") window.syncQuickTools();
  }
  function closeNameWheel(){
    wheelOverlay.classList.remove("show");
    wheelOverlay.setAttribute("aria-hidden", "true");
    if(typeof window.syncQuickTools === "function") window.syncQuickTools();
  }

  let viewDate = new Date();
  viewDate.setDate(1);

  function dataFor(date){
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    const raw = String(ATTENDANCE_DATA[selectedName]?.[key(y, m, d)] || "").trim().toUpperCase();
    if(["P","O","T","Q","X"].includes(raw)) return {status:raw};
    const state = (typeof window.__getChecklistState === "function") ? window.__getChecklistState() : null;
    if(state && Array.isArray(state.names)){
      const idx = state.names.indexOf(selectedName);
      if(idx >= 0 && state.checked[idx] === true && state.times[idx]){
        const today = new Date();
        const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
        if(isToday){
          const dow = date.getDay();
          if(dow === 0) return {status:"T"};
          return {status:"V"};
        }
      }
    }
    return null;
  }

  function renderSkeleton(){
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const days = new Date(y, m+1, 0).getDate();
    const leading = mondayIndex(new Date(y, m, 1));
    let h = "";
    for(let i = 0; i < leading; i++) h += '<div class="att-day muted"></div>';
    for(let d = 1; d <= days; d++) h += `<div class="att-day skeleton"><div class="att-day-num">${d}</div><div class="att-status"></div></div>`;
    const total = leading + days, tr = (7 - total % 7) % 7;
    for(let i = 0; i < tr; i++) h += '<div class="att-day muted"></div>';
    grid.innerHTML = h;
    if(workCount) workCount.textContent = "0";
    if(offCount) offCount.textContent = "0";
    if(leaveCount) leaveCount.textContent = "0";
  }

  function render(){
    const y = viewDate.getFullYear();
    if(!selectedName || !ATTENDANCE_EMPLOYEES.length){ renderSkeleton(); return; }
    const m = viewDate.getMonth();
    monthLabel.textContent = `Tháng ${m+1}`;
    yearLabel.textContent = String(y);
    const first = new Date(y, m, 1), days = new Date(y, m+1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const leading = mondayIndex(first);
    let work = 0, off = 0, leave = 0;
    const frag = document.createDocumentFragment();
    for(let i = leading - 1; i >= 0; i--){
      const cell = document.createElement("div");
      cell.className = "att-day muted";
      cell.innerHTML = `<div class="att-day-num">${prevDays-i}</div>`;
      frag.appendChild(cell);
    }
    const now = new Date();
    for(let d = 1; d <= days; d++){
      const date = new Date(y, m, d), item = dataFor(date);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "att-day";
      cell.dataset.day = String(d);
      cell.setAttribute("aria-label", `Ngày ${d}`);
      if(date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && d === now.getDate()) cell.classList.add("today");
      let statusClass = "empty", statusIcon = "", statusLabel = "";
      if(item){
        const info = statusInfo(item.status);
        statusClass = info.className;
        statusIcon = info.icon || info.label;
        statusLabel = info.shortLabel || "";
        if(item.status === "V" || item.status === "T") work++;
        else if(item.status === "O") off++;
        else if(item.status === "P") leave++;
      }
      cell.classList.add("status-" + statusClass);
      cell.innerHTML = `<div class="att-day-num">${d}</div><div class="att-status ${statusClass}">${statusIcon}</div>` + (statusLabel ? `<div class="att-status-label">${statusLabel}</div>` : "");
      frag.appendChild(cell);
    }
    const total = leading + days, trailing = (7 - total % 7) % 7;
    for(let d = 1; d <= trailing; d++){
      const cell = document.createElement("div");
      cell.className = "att-day muted";
      cell.innerHTML = `<div class="att-day-num">${d}</div>`;
      frag.appendChild(cell);
    }
    grid.innerHTML = "";
    grid.appendChild(frag);
    workCount.textContent = work;
    offCount.textContent = off;
    leaveCount.textContent = leave;
  }

  grid.addEventListener("click", e => {
    const dayEl = e.target.closest(".att-day[data-day]");
    if(!dayEl) return;
    const day = Number(dayEl.dataset.day);
    if(attendanceMultiMode) toggleAttendanceMultiDay(day);
    else openAttendanceStatus(day);
  });
  attendanceStatusClose.addEventListener("click", closeAttendanceStatus);
  attendanceMultiBtn.addEventListener("click", startAttendanceMulti);
  attendanceMultiCancel.addEventListener("click", cancelAttendanceMulti);
  document.querySelectorAll("[data-multi-status]").forEach(btn => btn.addEventListener("click", () => saveAttendanceBatchStatus(btn.dataset.multiStatus)));
  attendanceStatusOverlay.addEventListener("click", e => { if(e.target === attendanceStatusOverlay) closeAttendanceStatus(); });
  document.querySelectorAll("#attendanceStatusOptions [data-status]").forEach(btn => btn.addEventListener("click", () => saveAttendanceStatus(btn.dataset.status)));

  async function openPage(){
    page.classList.add("show");
    if(typeof window.syncQuickTools === "function") window.syncQuickTools();
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const hasCache = applyAttendanceCache(y, m);
    if(hasCache) render();
    updateEmployeeAvatar();
    startAttendanceAutoRefresh();
    loadAttendanceMonth(false).then(() => preloadAdjacentMonths()).catch(() => {});
  }
  function closePage(){
    page.classList.remove("show");
    stopAttendanceAutoRefresh();
    if(typeof window.syncQuickTools === "function") window.syncQuickTools();
  }
  attendanceBtn?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openPage(); });
  attendanceSyncBtn?.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    attendanceSyncBtn.classList.add("spinning");
    setAttendanceFooterState("syncing", "Đang đồng bộ…");
    attendanceAutoRefreshCountdown = ATTENDANCE_AUTO_REFRESH_SEC;
    updateAttendanceCountdown();
    loadAttendanceMonth(true)
      .then(() => setAttendanceFooterState("ok", "Đã đồng bộ ✓"))
      .catch(err => setAttendanceFooterState("error", "Lỗi đồng bộ: " + attendanceErrorText(err)))
      .finally(() => setTimeout(() => attendanceSyncBtn.classList.remove("spinning"), 400));
  });
  window.__openAttendancePage = openPage;
  window.__closeAttendancePage = closePage;
  back.addEventListener("click", closePage);
  wheelBtn.addEventListener("click", openNameWheel);
  wheelClose.addEventListener("click", closeNameWheel);
  wheelOverlay.addEventListener("click", e => { if(e.target === wheelOverlay) closeNameWheel(); });
  wheelConfirm.addEventListener("click", () => {
    selectedName = ATTENDANCE_EMPLOYEES[nameWheel.getIndex()] || "";
    employee.value = selectedName;
    updateWheelButton();
    updateEmployeeAvatar();
    closeNameWheel();
    render();
  });
  document.addEventListener("keydown", e => {
    if(!wheelOverlay.classList.contains("show") || !ATTENDANCE_EMPLOYEES.length) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); nameWheel.setIndex(nameWheel.getIndex() + 1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); nameWheel.setIndex(nameWheel.getIndex() - 1); }
    else if(e.key === "Enter"){
      e.preventDefault();
      selectedName = ATTENDANCE_EMPLOYEES[nameWheel.getIndex()] || "";
      employee.value = selectedName;
      updateWheelButton();
      closeNameWheel();
      render();
    }
  });

  function goToMonth(delta){
    viewDate.setMonth(viewDate.getMonth() + delta);
    attendanceLoadPromise = null;
    attendanceLoadPromiseKey = "";
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const hasCache = applyAttendanceCache(y, m);
    if(!hasCache) Object.keys(ATTENDANCE_DATA).forEach(k => delete ATTENDANCE_DATA[k]);
    render();
    loadAttendanceMonth(false).catch(() => {});
  }
  prev.addEventListener("click", () => goToMonth(-1));
  next.addEventListener("click", () => goToMonth(1));

  const attendanceTodayBtn = $("attendanceTodayBtn");
  attendanceTodayBtn?.addEventListener("click", () => {
    const now = new Date();
    if(viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() === now.getMonth()){ loadAttendanceMonth(true).catch(() => {}); return; }
    viewDate.setMonth(now.getMonth());
    viewDate.setFullYear(now.getFullYear());
    attendanceLoadPromise = null;
    attendanceLoadPromiseKey = "";
    const hasCache = applyAttendanceCache(now.getFullYear(), now.getMonth());
    if(hasCache) render();
    loadAttendanceMonth(false).catch(() => {});
    setAttendanceFooterState("syncing", "Đang tải tháng hiện tại…");
  });

  employee.value = selectedName;
  updateWheelButton();
  buildNameWheel();
  render();

  const todayKeyAttendance = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Ho_Chi_Minh", year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(new Date());
    const g = k => parts.find(x => x.type === k)?.value || "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  function renderAttendanceIfCheckinMatches(){
    if(!page.classList.contains("show")) return;
    let ev = null;
    try{ const raw = localStorage.getItem("srank_last_checkin"); if(raw) ev = JSON.parse(raw); }catch(_){}
    if(!ev || !ev.name || !ev.date || ev.date !== todayKeyAttendance() || ev.name !== selectedName) return;
    const now = new Date();
    if(viewDate.getFullYear() !== now.getFullYear() || viewDate.getMonth() !== now.getMonth()) return;
    const day = now.getDate();
    const k = key(now.getFullYear(), now.getMonth(), day);
    const existing = ATTENDANCE_DATA[selectedName]?.[k];
    if(["P","O","T","Q","X"].includes(existing)) return;
    render();
  }
  window.addEventListener("checkinDone", () => {
    requestAnimationFrame(() => renderAttendanceIfCheckinMatches());
    setTimeout(() => { try{ localStorage.removeItem("srank_last_checkin"); }catch(_){} }, 5000);
  });
  document.addEventListener("visibilitychange", () => {
    if(document.hidden || !page.classList.contains("show")) return;
    renderAttendanceIfCheckinMatches();
  });

  window.__getAttendanceTopDataForMonth = async function(monthNumber, force = false){
    const now = new Date();
    const year = now.getFullYear();
    const month = Math.max(1, Math.min(12, Number(monthNumber) || (now.getMonth() + 1)));
    const monthIndex = month - 1;
    let employees = !force ? getAttendanceRawMemory(year, monthIndex) : null;
    if(!employees && !force){
      const cache = loadAttendanceCache(year, monthIndex);
      if(cache && Array.isArray(cache.employees)){ employees = cache.employees; rememberAttendanceRaw(year, monthIndex, employees); }
    }
    if(!(Array.isArray(employees) && employees.length)){
      const r = await window.__srankApi("getAttendance", {month, _ts:Date.now()}, 20000);
      if(!r || r.ok !== true) throw new Error(r?.error || "Google Sheet trả về dữ liệu không hợp lệ");
      employees = Array.isArray(r.data?.employees) ? r.data.employees : [];
      rememberAttendanceRaw(year, monthIndex, employees);
      saveAttendanceCache(year, monthIndex, employees);
    }
    return {year, month, employees};
  };
  window.syncAttendanceEmployees = function(){
    if(!ATTENDANCE_EMPLOYEES.length){ loadAttendanceMonth(true); return; }
    syncAttendanceEmployeeControls();
    render();
  };
})();
