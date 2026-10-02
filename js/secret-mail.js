(function(){
"use strict";

const K = "srank_secret_mail_sender_v1";
const ANON = "Ẩn danh";
const MAX = 200;
const $ = id => document.getElementById(id);

const BUTTON_HTML = `<button id="secretMailBtn" class="sm-fab" type="button" aria-label="Mở Hòm thư bí mật">
<span class="sm-fab-icon" aria-hidden="true">💌</span>
<span class="sm-fab-text">Hòm thư bí mật</span>
<span class="sm-fab-shine" aria-hidden="true"></span>
</button>`;

const PAGE_HTML = `<section id="secretMailPage" class="secret-mail-page" aria-label="Hòm thư bí mật">
<div class="sm-page-inner">
<header class="sm-page-head">
<button id="smPageBack" class="sm-page-icon-btn" type="button" aria-label="Quay lại"><span aria-hidden="true">←</span></button>
<div class="sm-page-title"><span class="sm-page-kicker">HỆ THỐNG 04</span><span class="sm-page-name">💌 Hòm thư bí mật</span></div>
<button id="smPageRefresh" class="sm-page-icon-btn" type="button" aria-label="Tải lại"><span aria-hidden="true">↻</span></button>
</header>
<section class="sm-composer">
<div class="sm-composer-head"><span class="sm-composer-icon" aria-hidden="true">✎</span><span class="sm-composer-title">Viết lời nhắn mới</span></div>
<textarea id="smPageInput" class="sm-page-input" maxlength="200" rows="3" placeholder="Viết điều gì đó thật dễ thương..." autocomplete="off" aria-label="Nội dung lời nhắn"></textarea>
<label class="sm-sign-toggle" for="smPageSignCheckbox">
<input type="checkbox" id="smPageSignCheckbox" class="sm-sign-check" />
<span class="sm-sign-box" aria-hidden="true"><span class="sm-sign-checkmark">✓</span></span>
<span class="sm-sign-label">Ký tên:</span>
<button type="button" id="smPageSenderBtn" class="sm-sender-pill empty" aria-label="Chọn tên người gửi"><span id="smPageSenderName" class="sm-sender-name">Ẩn danh</span><span class="sm-sender-chevron" aria-hidden="true">⌄</span></button>
</label>
<div class="sm-send-row"><span id="smPageCounter" class="sm-counter">0/200</span><button type="button" id="smPageSendBtn" class="sm-send-btn"><span aria-hidden="true">📮</span><span class="sm-send-text">Gửi</span></button></div>
<div id="smPageStatus" class="sm-status" aria-live="polite"></div>
</section>
<section class="sm-wall-wrap">
<div class="sm-wall-head"><span class="sm-wall-deco" aria-hidden="true">✧</span><span id="smWallCount">Đang tải...</span><span class="sm-wall-deco" aria-hidden="true">✧</span></div>
<div id="smFloatStage" class="sm-float-stage"></div>
<div id="smCanvasEmpty" class="sm-canvas-empty" hidden><div class="sm-empty-emoji">📭</div><div class="sm-empty-text">Chưa có lời nhắn nào</div><div class="sm-empty-sub">Hãy là người đầu tiên gửi nhé!</div></div>
</section>
</div>
</section>`;

function injectHTML(){
  if($("secretMailPage")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = BUTTON_HTML + PAGE_HTML;
  while(wrap.firstChild) document.body.appendChild(wrap.firstChild);
}

const CACHE_KEY = "srank_secret_mail_cache_v1";
const CACHE_TTL = 5 * 60 * 1000;
let sender = "", open = false, wheel = null, wheelIndex = 0;
let mailAutoTimer = null, lastRenderedRowsKey = "";
const AUTO_REFRESH_MS = 5000;
let _mailCurrentRows = [], _mailHasLoadedOnce = false;

const loadMailCache = () => {
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !Array.isArray(data.rows)) return null;
    if(Date.now() - (data.ts || 0) > CACHE_TTL) return null;
    return data.rows;
  }catch(_){ return null; }
};
const saveMailCache = rows => { try{ localStorage.setItem(CACHE_KEY, JSON.stringify({rows, ts:Date.now()})); }catch(_){} };
const clearMailCache = () => { try{ localStorage.removeItem(CACHE_KEY); }catch(_){} };
const rowsSignature = rows => (rows || []).map(r => `${r.name}|${r.message}|${r.time}`).join("::");
const rowKey = r => `${r.name}|${r.message}|${r.time}`;
const sortMailRows = rows => (rows || []).slice().sort((a, b) => String(b.time||"").localeCompare(String(a.time||"")));

function renderListIfChanged(rows){
  if(rows === null || typeof rows === "undefined") return false;
  const sorted = sortMailRows(rows);
  const sig = rowsSignature(sorted);
  if(!_mailHasLoadedOnce){
    _mailHasLoadedOnce = true;
    lastRenderedRowsKey = sig;
    _mailCurrentRows = sorted;
    renderList(sorted);
    return true;
  }
  if(sig === lastRenderedRowsKey) return false;
  const oldKeys = new Set(_mailCurrentRows.map(rowKey));
  const newOnes = sorted.filter(r => !oldKeys.has(rowKey(r)));
  const removedAny = _mailCurrentRows.some(r => !sorted.some(s => rowKey(s) === rowKey(r)));
  if(newOnes.length > 0 && !removedAny){
    const list = stage.querySelector(".sm-wall-list");
    if(list){
      empty.classList.remove("show");
      const oldHeight = list.offsetHeight;
      const scrollBefore = stage.scrollTop;
      for(let i = newOnes.length - 1; i >= 0; i--){
        const m = newOnes[i];
        const card = wallCard(m, 0);
        card.classList.add("sm-wall-card-enter");
        card.addEventListener("animationend", () => card.classList.remove("sm-wall-card-enter"), {once:true});
        list.insertBefore(card, list.firstChild);
      }
      const addedHeight = list.offsetHeight - oldHeight;
      if(scrollBefore > 2 && addedHeight > 0) stage.scrollTop = scrollBefore + addedHeight;
      count.textContent = `${sorted.length} lời nhắn`;
      _mailCurrentRows = sorted;
      lastRenderedRowsKey = sig;
      return true;
    }
  }
  const scrollTop = stage.scrollTop;
  const wasAtTop = scrollTop < 40;
  _mailCurrentRows = sorted;
  lastRenderedRowsKey = sig;
  renderList(sorted);
  stage.scrollTop = wasAtTop ? 0 : scrollTop;
  return true;
}

function startMailAutoRefresh(){
  stopMailAutoRefresh();
  if(!open) return;
  mailAutoTimer = setInterval(async () => {
    if(!open || document.hidden) return;
    try{ const rows = await fetchMessages(true); if(open && rows) renderListIfChanged(rows); }catch(_){}
  }, AUTO_REFRESH_MS);
}
function stopMailAutoRefresh(){ if(mailAutoTimer){ clearInterval(mailAutoTimer); mailAutoTimer = null; } }

const getNames = () => {
  try{ return typeof window.__getChecklistNames === "function" ? (window.__getChecklistNames() || []).map(x => String(x).trim()).filter(Boolean) : []; }catch(_){ return []; }
};
const saveSender = x => { try{ x ? localStorage.setItem(K, x) : localStorage.removeItem(K); }catch(_){} };

let page, back, refresh, input, counter, check, senderBtn, senderName, send, statusEl, count, stage, empty, navBtn;

try{ sender = String(localStorage.getItem(K) || "").trim(); }catch(_){}

function cacheEls(){
  page = $("secretMailPage"); back = $("smPageBack"); refresh = $("smPageRefresh");
  input = $("smPageInput"); counter = $("smPageCounter");
  check = $("smPageSignCheckbox"); senderBtn = $("smPageSenderBtn"); senderName = $("smPageSenderName");
  send = $("smPageSendBtn"); statusEl = $("smPageStatus"); count = $("smWallCount");
  stage = $("smFloatStage"); empty = $("smCanvasEmpty"); navBtn = $("secretMailBtn");
}

function renderSender(){
  check.checked = !!sender;
  senderName.textContent = sender || ANON;
  senderBtn.classList.toggle("empty", !sender);
}
function setStatus(x, t){
  statusEl.textContent = String(x || "").trim();
  statusEl.className = "sm-status" + (t ? " " + t : "");
}

function buildWheel(){
  if(wheel) return wheel;
  wheel = document.createElement("div");
  wheel.id = "smWheelOverlay";
  wheel.style.cssText = "position:fixed;inset:0;z-index:45000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(80,60,80,.32);backdrop-filter:blur(14px)";
  wheel.innerHTML = '<div class="sm-wheel-panel" role="dialog" aria-modal="true"><div class="sm-wheel-head"><div class="sm-wheel-title">Chọn tên của bạn</div><button type="button" class="sm-wheel-close">×</button></div><div class="sm-wheel-viewport wheel-viewport"><div class="wheel-selection"></div><div class="sm-wheel-items wheel-items"></div></div><div class="sm-wheel-hint">Vuốt lên / xuống để chọn</div><button type="button" class="sm-wheel-confirm">Xác nhận</button></div>';
  document.body.appendChild(wheel);
  const vp = wheel.querySelector(".sm-wheel-viewport");
  const itemsBox = wheel.querySelector(".sm-wheel-items");
  const inner = window.createWheel({viewport: vp, itemsBox, itemHeight: 58, itemClass: "sm-wheel-item"});
  inner.attach();
  wheel._innerWheel = inner;
  wheel.querySelector(".sm-wheel-close").onclick = closeWheel;
  wheel.onclick = e => { if(e.target === wheel) closeWheel(); };
  wheel.querySelector(".sm-wheel-confirm").onclick = () => {
    const ns = getNames();
    if(ns.length){ sender = ns[inner.getIndex()] || ""; saveSender(sender); renderSender(); closeWheel(); }
  };
  return wheel;
}
function openWheel(){
  const ns = getNames();
  if(!ns.length){ setStatus("Đang tải danh sách…"); setTimeout(openWheel, 1200); return; }
  buildWheel();
  const i = sender ? ns.indexOf(sender) : -1;
  wheelIndex = i >= 0 ? i : 0;
  wheel._innerWheel.setIndex(wheelIndex);
  wheel.style.display = "flex";
  requestAnimationFrame(() => wheel._innerWheel.schedule());
}
function closeWheel(){ if(wheel) wheel.style.display = "none"; }

function updateCounter(){
  counter.textContent = `${input.value.length}/${MAX}`;
  counter.classList.toggle("warn", input.value.length > MAX * .9);
}

function heart(){
  const r = document.querySelector(".sm-composer")?.getBoundingClientRect();
  if(!r) return;
  const e = ["♡", "💗", "💖", "💌", "♥", "🌸"];
  for(let i = 0; i < 10; i++){
    setTimeout(() => {
      const x = document.createElement("div");
      x.className = "sm-heart-burst";
      x.textContent = e[i % e.length];
      x.style.left = r.left + r.width / 2 + (Math.random() - .5) * r.width * .7 + "px";
      x.style.top = r.top + r.height / 2 + (Math.random() - .5) * 30 + "px";
      x.style.setProperty("--sm-dx", (Math.random() - .5) * 200 + "px");
      x.style.setProperty("--sm-dy", -(innerHeight * .85 + Math.random() * 120) + "px");
      x.style.setProperty("--sm-rot", (Math.random() * 40 - 20) + "deg");
      document.body.appendChild(x);
      setTimeout(() => x.remove(), 3300);
    }, i * 90 + Math.random() * 80);
  }
}

async function sendMessage(){
  const text = String(input.value || "").trim();
  if(!text){ setStatus("Nhập gì đó đã nha ♡", "error"); input.focus(); return; }
  if(text.length > MAX){ setStatus(`Tối đa ${MAX} ký tự`, "error"); return; }
  if(check.checked && !sender){ setStatus("Chọn tên trước đã nhé", "error"); openWheel(); return; }
  send.disabled = true;
  setStatus("Đang gửi...");
  try{
    const name = check.checked && sender ? sender : ANON;
    const time = new Intl.DateTimeFormat("vi-VN", {timeZone:"Asia/Ho_Chi_Minh", hour:"2-digit", minute:"2-digit", hour12:false}).format(new Date());
    const r = await window.__srankApi("sendSecretMessage", {name, message:text, clientTime:time}, 12000);
    if(!r?.ok) throw Error(r?.error || "Không gửi được");
    setStatus("Gửi xong rồi ♡", "success");
    heart();
    input.value = "";
    updateCounter();
    clearMailCache();
    setTimeout(async () => {
      try{ const rows = await fetchMessages(true); if(rows) renderListIfChanged(rows); }catch(_){}
    }, 150);
  }catch(e){
    setStatus(e.message || "Không gửi được, thử lại nha", "error");
  }finally{ send.disabled = false; }
}

function fetchMessages(force = false){
  if(!force){
    const cached = loadMailCache();
    if(cached){
      fetchMessages(true).then(rows => { if(open && rows) renderListIfChanged(rows); }).catch(() => {});
      return Promise.resolve(cached);
    }
  }
  return window.__srankApi("getSecretMessages", {_ts:Date.now()}, 10000).then(r => {
    if(!r?.ok || !Array.isArray(r.data?.rows)) return null;
    const rows = r.data.rows.map(x => ({
      name: String(x?.name || "").trim() || ANON,
      message: String(x?.message || "").trim(),
      time: String(x?.clientTime || "").trim()
    })).filter(x => x.message);
    saveMailCache(rows);
    return rows;
  }).catch(() => null);
}

function wallCard(m, i){
  const el = document.createElement("article");
  const cs = ["color-pink", "color-mint", "color-yellow", "color-lilac"];
  el.className = "sm-wall-card " + cs[i % 4];
  el.innerHTML = `<div class="card-avatar"></div><div class="card-body"><div class="card-head"><span class="card-name"></span><span class="card-time"></span></div><div class="card-text"></div></div>`;
  el.querySelector(".card-avatar").textContent = m.name === ANON ? "?" : m.name.charAt(0).toUpperCase();
  el.querySelector(".card-name").textContent = m.name;
  el.querySelector(".card-time").textContent = m.time;
  el.querySelector(".card-text").textContent = m.message;
  return el;
}

function renderList(rows){
  lastRenderedRowsKey = rowsSignature(rows);
  stage.dataset.mode = "wall";
  count.textContent = rows.length ? `${rows.length} lời nhắn` : "Chưa có lời nhắn";
  if(!rows.length){ stage.innerHTML = ""; empty.classList.add("show"); return; }
  empty.classList.remove("show");
  const list = document.createElement("div");
  list.className = "sm-wall-list";
  const frag = document.createDocumentFragment();
  rows.forEach((m, i) => frag.appendChild(wallCard(m, i)));
  list.appendChild(frag);
  stage.innerHTML = "";
  stage.appendChild(list);
}

function renderLoading(){
  stage.dataset.mode = "wall";
  stage.innerHTML = '<div class="sm-wall-loading">Đang tải lời nhắn…</div>';
  empty.classList.remove("show");
}

async function openPage(){
  if(open) return;
  open = true;
  page.classList.add("show");
  document.body.style.overflow = "hidden";
  if(typeof window.syncQuickTools === "function") window.syncQuickTools();
  const cached = loadMailCache();
  const hasList = stage.querySelector(".sm-wall-list");
  if(!hasList && cached && cached.length) renderListIfChanged(cached);
  else if(!hasList) renderLoading();
  fetchMessages(true).then(rows => {
    if(!open) return;
    if(rows) renderListIfChanged(rows);
    startMailAutoRefresh();
  }).catch(() => startMailAutoRefresh());
}
function closePage(){
  open = false;
  page.classList.remove("show");
  document.body.style.overflow = "";
  stopMailAutoRefresh();
  if(typeof window.syncQuickTools === "function") window.syncQuickTools();
}

function bindEvents(){
  check.addEventListener("change", () => {
    if(check.checked && !sender) openWheel();
    else if(!check.checked){ sender = ""; saveSender(""); renderSender(); }
  });
  senderBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); check.checked = true; openWheel(); };
  input.addEventListener("input", updateCounter);
  send.onclick = e => { e.preventDefault(); e.stopPropagation(); sendMessage(); };
  input.addEventListener("keydown", e => { if((e.ctrlKey || e.metaKey) && e.key === "Enter"){ e.preventDefault(); sendMessage(); } });
  navBtn?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openPage(); });
  back?.addEventListener("click", closePage);
  refresh?.addEventListener("click", async () => {
    const icon = refresh.querySelector("span") || refresh;
    const oldIcon = icon.textContent;
    icon.textContent = "↻";
    icon.style.animation = "attSpin 1s linear infinite";
    try{
      const rows = await fetchMessages(true);
      if(rows && Array.isArray(rows)){ renderListIfChanged(rows); setStatus("Đã làm mới ✓", "success"); }
      else setStatus("Server đang khởi động, giữ list cũ", "error");
    }catch(_){ setStatus("Không tải được — giữ list cũ", "error"); }
    finally{ icon.style.animation = ""; icon.textContent = oldIcon; }
  });
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape") return;
    if(wheel && wheel.style.display === "flex"){ closeWheel(); return; }
    if(open) closePage();
  });
  document.addEventListener("visibilitychange", () => {
    if(document.hidden || !open) return;
    fetchMessages(true).then(rows => { if(open && rows) renderListIfChanged(rows); }).catch(() => {});
  });
}

window.__openSecretMailPage = openPage;
window.__closeSecretMailPage = closePage;
window.__refreshSecretMail = fetchMessages;

function init(){
  injectHTML();
  cacheEls();
  renderSender();
  updateCounter();
  bindEvents();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
})();
