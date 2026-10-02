(function(){
"use strict";
const $ = id => document.getElementById(id);

const LUNCH_SAVORY = [
"Thịt kho trứng","Thịt rang cháy cạnh","Thịt xào hành tây","Thịt xào sả ớt","Thịt xào rau củ","Thịt xào lá khế","Sườn xào chua ngọt","Sườn ram mặn","Sườn nướng","Sườn kho tiêu",
"Gà chiên nước mắm","Gà kho gừng","Gà kho sả","Gà chiên giòn","Gà xào sả ớt","Gà nướng","Gà kho tiêu","Gà rim nước mắm","Gà rang gừng","Gà xào nấm",
"Cá kho tộ","Cá kho tiêu","Cá chiên mắm","Cá chiên sốt cà","Cá nướng","Cá hấp gừng","Cá sốt cà chua","Cá kho nghệ","Cá chiên giòn","Cá kho riềng",
"Tôm rim mặn ngọt","Tôm rang me","Tôm rang thịt","Tôm kho tàu","Mực xào rau củ","Mực chiên nước mắm","Mực xào cần tây","Trứng chiên thịt bằm","Trứng chiên cà chua","Trứng kho",
"Đậu hũ sốt cà chua","Đậu hũ chiên sả ớt","Đậu hũ sốt thịt bằm","Rau muống xào tỏi","Rau muống xào thịt bò","Cải thìa xào tỏi","Bắp cải xào trứng","Khổ qua xào trứng","Cà tím xào thịt","Đậu que xào thịt bò"
];
const LUNCH_SOUP = [
"Canh chua cá","Canh chua tôm","Canh chua thịt","Canh bí đỏ nấu thịt bằm","Canh bí xanh nấu tôm","Canh bầu nấu tôm","Canh mồng tơi nấu tôm","Canh rau ngót thịt bằm","Canh cải xanh thịt bằm","Canh cải thìa thịt bằm",
"Canh khổ qua nhồi thịt","Canh khổ qua nấu tôm","Canh bí đao thịt bằm","Canh bí đao nấu tôm","Canh khoai mỡ thịt bằm","Canh khoai mỡ tôm","Canh rau đay mồng tơi","Canh cua rau đay","Canh cua mồng tơi","Canh cua rau ngót",
"Canh cải chua thịt bằm","Canh cải chua cá","Canh cải chua sườn","Canh cà chua trứng","Canh cà chua thịt bằm","Canh nấm thịt bằm","Canh nấm đậu hũ","Canh rong biển thịt bằm","Canh rong biển đậu hũ","Canh rong biển trứng",
"Canh bắp cải thịt bằm","Canh bắp cải cuộn thịt","Canh rau củ thịt bằm","Canh rau củ hầm xương","Canh củ sen hầm sườn","Canh mướp nấu mồng tơi","Canh mướp nấu tôm","Canh mướp đắng nhồi thịt","Canh rau muống nấu chua","Canh rau muống nấu tôm",
"Canh bí xanh thịt bằm","Canh cải ngọt thịt bằm","Canh cải ngọt nấu tôm","Canh cải thảo thịt bằm","Canh cải thảo nấu tôm","Canh đậu hũ cà chua","Canh giá đỗ thịt bằm","Canh bầu thịt bằm","Canh rau củ chay","Canh nấm rau củ"
];
const LUNCH_OUT = [
"Cơm tấm sườn","Cơm tấm sườn bì chả","Cơm gà xối mỡ","Cơm gà nướng","Cơm gà chiên mắm","Cơm bò lúc lắc","Cơm thịt nướng","Cơm heo quay","Cơm xá xíu","Cơm cá","Phở bò","Phở gà","Hủ tiếu Nam Vang","Hủ tiếu bò kho","Bún bò Huế","Bún thịt nướng","Bún chả","Bún riêu","Bún mắm","Bún đậu mắm tôm","Bún nem nướng","Bún bò xào","Bún hải sản","Mì Quảng","Cao lầu","Bánh canh cua","Bánh canh giò heo","Mì hoành thánh","Mì vịt tiềm","Mì cay","Mì trộn","Bánh mì thịt","Bánh mì xíu mại","Bánh mì chảo","Bò né","Bò kho + bánh mì","Bánh xèo","Bánh cuốn","Bánh ướt thịt nướng","Cháo gà","Cháo lòng","Súp cua","Gà rán","Gà nướng","Há cảo","Kimbap","Cơm trộn Hàn Quốc","Tokbokki","Pizza","Hamburger"
];
const LUNCH_CUSTOM_KEY = "DAOMEo_LUNCH_CUSTOM_V2";
const LEGACY_KEY = "DAOMEo_LUNCH_CUSTOM_V1";

const PAGE_HTML = `<section id="lunchPage" aria-label="Bữa trưa ăn gì">
<div class="lunch-page-inner"><div class="lunch-shell">
<header class="lunch-head">
<button id="lunchBack" class="lunch-back" type="button" aria-label="Quay lại">‹</button>
<div class="lunch-head-copy"><div class="lunch-kicker">HỆ THỐNG 03</div><div class="lunch-title">Bữa trưa ăn gì?</div></div>
</header>
<div id="lunchResultCard" class="lunch-result-card">
<div class="lunch-result-icon">🍽️</div>
<span class="lunch-result-label">Thực đơn hôm nay</span>
<div id="lunchResultBody"><div class="lunch-result-placeholder">Chọn kiểu ăn bên dưới để quay món nha 🎲</div></div>
<button id="lunchRerollBtn" class="lunch-reroll-btn" type="button" style="display:none;">🎲 QUAY LẠI</button>
</div>
<span class="lunch-section-title">Chọn kiểu ăn</span>
<div class="lunch-mode-grid">
<button type="button" class="lunch-mode-card home" data-mode="home"><span class="mode-icon">🏠</span><span class="mode-label">Ăn tại nhà</span><span class="mode-desc">50 món mặn + 50 món canh</span></button>
<button type="button" class="lunch-mode-card out" data-mode="out"><span class="mode-icon">🍜</span><span class="mode-label">Ăn ngoài</span><span class="mode-desc">50 món</span></button>
<button type="button" class="lunch-mode-card all" data-mode="all"><span class="mode-icon">🎲</span><span class="mode-label">Ngẫu nhiên</span><span class="mode-desc">Nhà hoặc ngoài</span></button>
</div>
<div class="lunch-actions-grid">
<button id="lunchAddBtn2" class="lunch-action-btn" type="button">＋ Thêm món ăn</button>
<div id="lunchAddForm2" class="lunch-add-form">
<input id="lunchAddInput2" class="lunch-add-input" type="text" maxlength="60" autocomplete="off" placeholder="Nhập tên món muốn thêm...">
<div class="lunch-add-cats">
<button type="button" class="lunch-add-cat home" data-add-category="savory">🍖 Món mặn</button>
<button type="button" class="lunch-add-cat soup" data-add-category="soup">🍲 Món canh</button>
<button type="button" class="lunch-add-cat out" data-add-category="out">🍜 Ăn ngoài</button>
</div>
<div id="lunchAddStatus2" class="lunch-add-status" aria-live="polite"></div>
</div>
<button id="lunchManageBtn2" class="lunch-action-btn solid" type="button">⚙ Quản lý danh sách món</button>
</div>
</div></div></section>`;

const OVERLAY_HTML = `<div id="lunchManageOverlay" aria-hidden="true">
<section id="lunchManagePanel" role="dialog" aria-modal="true">
<button id="lunchManageClose" type="button" aria-label="Đóng">×</button>
<div id="lunchManageTitle">⚙ QUẢN LÝ DANH SÁCH MÓN</div>
<div id="lunchManageSub">Đổi tên hoặc xóa món. Thay đổi được lưu trên thiết bị này.</div>
<div id="lunchManageTabs">
<button class="lunchManageTab active" type="button" data-manage-category="savory">🍖 Món mặn</button>
<button class="lunchManageTab" type="button" data-manage-category="soup">🍲 Món canh</button>
<button class="lunchManageTab" type="button" data-manage-category="out">🍜 Ăn ngoài</button>
</div>
<div id="lunchManageList"></div>
<div id="lunchManageStatus" aria-live="polite"></div>
</section></div>`;

function injectHTML(){
if($("lunchPage")) return;
const wrap = document.createElement("div");
wrap.innerHTML = PAGE_HTML + OVERLAY_HTML;
while(wrap.firstChild) document.body.appendChild(wrap.firstChild);
}

let LUNCH_DATA = { savory: [...LUNCH_SAVORY], soup: [...LUNCH_SOUP], out: [...LUNCH_OUT] };
let lunchMode = "all";
let lunchRolling = false;
let lunchTimer = null;
let lunchManageCategory = "savory";
let _statusTimer = null;
let els = {};

function saveLunchData(){
try{ localStorage.setItem(LUNCH_CUSTOM_KEY, JSON.stringify(LUNCH_DATA)); }catch(_){}
}
function loadLunchData(){
try{
const saved = JSON.parse(localStorage.getItem(LUNCH_CUSTOM_KEY) || "null");
if(saved && Array.isArray(saved.savory) && Array.isArray(saved.soup) && Array.isArray(saved.out)){
LUNCH_DATA = { savory: saved.savory.filter(Boolean), soup: saved.soup.filter(Boolean), out: saved.out.filter(Boolean) };
if(!LUNCH_DATA.savory.length) LUNCH_DATA.savory = [...LUNCH_SAVORY];
if(!LUNCH_DATA.soup.length) LUNCH_DATA.soup = [...LUNCH_SOUP];
if(!LUNCH_DATA.out.length) LUNCH_DATA.out = [...LUNCH_OUT];
saveLunchData();
} else {
const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
if(old && Array.isArray(old.home)) LUNCH_DATA.savory.push(...old.home.filter(Boolean));
if(old && Array.isArray(old.out)) LUNCH_DATA.out.push(...old.out.filter(Boolean));
saveLunchData();
}
}catch(_){}
}

const randomFrom = list => list[Math.floor(Math.random() * list.length)] || "";
function randomLunchChoice(mode){
if(mode === "home") return { type:"home", savory: randomFrom(LUNCH_DATA.savory), soup: randomFrom(LUNCH_DATA.soup) };
if(mode === "out") return { type:"out", out: randomFrom(LUNCH_DATA.out) };
return Math.random() < 0.5
? { type:"home", savory: randomFrom(LUNCH_DATA.savory), soup: randomFrom(LUNCH_DATA.soup) }
: { type:"out", out: randomFrom(LUNCH_DATA.out) };
}

function renderLunchChoice(choice){
const body = els.lunchResultBody;
if(!body) return;
if(choice.type === "home"){
const savory = choice.savory || randomFrom(LUNCH_DATA.savory);
const soup = choice.soup || randomFrom(LUNCH_DATA.soup);
body.innerHTML = `<div class="lunch-result-line savory"><span class="line-label">Món mặn</span><span class="lunch-result-value"></span></div><div class="lunch-result-line soup"><span class="line-label">Món canh</span><span class="lunch-result-value"></span></div>`;
const v = body.querySelectorAll(".lunch-result-value");
if(v[0]) v[0].textContent = savory;
if(v[1]) v[1].textContent = soup;
} else {
const out = choice.out || randomFrom(LUNCH_DATA.out);
body.innerHTML = `<div class="lunch-result-line out"><span class="line-label">Ăn ngoài</span><span class="lunch-result-value"></span></div>`;
const v = body.querySelector(".lunch-result-value");
if(v) v.textContent = out;
}
}

function openLunchPage(){
if(!els.lunchPage) return;
els.lunchPage.classList.add("show");
document.body.style.overflow = "hidden";
if(typeof window.syncQuickTools === "function") window.syncQuickTools();
}
function closeLunchPage(){
if(!els.lunchPage) return;
els.lunchPage.classList.remove("show");
document.body.style.overflow = "";
if(typeof window.syncQuickTools === "function") window.syncQuickTools();
}

function pickLunch(){
if(lunchRolling) return;
lunchRolling = true;
if(els.lunchResultCard) els.lunchResultCard.classList.add("rolling");
if(els.lunchRerollBtn) els.lunchRerollBtn.style.display = "none";
let elapsed = 0, delay = 55;
const roll = () => {
if(elapsed >= 2850){
const finalChoice = randomLunchChoice(lunchMode);
renderLunchChoice(finalChoice);
if(els.lunchResultCard) els.lunchResultCard.classList.remove("rolling");
if(els.lunchRerollBtn) els.lunchRerollBtn.style.display = "inline-flex";
lunchRolling = false;
const dish = finalChoice.savory || finalChoice.soup || finalChoice.out || "";
try{ window.SRank?.LiveFeed?.push({ type:"lunch", name:"Bữa trưa", meta:{ dish } }); }catch(_){}
return;
}
renderLunchChoice(randomLunchChoice(lunchMode));
elapsed += delay;
delay = Math.min(210, delay + 7);
lunchTimer = setTimeout(roll, delay);
};
clearTimeout(lunchTimer);
roll();
}

function openLunchManage(){
renderLunchManage();
els.lunchManageOverlay.classList.add("show");
els.lunchManageOverlay.setAttribute("aria-hidden","false");
}
function closeLunchManage(){
els.lunchManageOverlay.classList.remove("show");
els.lunchManageOverlay.setAttribute("aria-hidden","true");
}
function updateLunchManageStatus(msg){
if(!els.lunchManageStatus) return;
els.lunchManageStatus.textContent = msg;
clearTimeout(_statusTimer);
if(msg) _statusTimer = setTimeout(() => els.lunchManageStatus.textContent = "", 1800);
}
function renderLunchManage(){
document.querySelectorAll(".lunchManageTab").forEach(t => t.classList.toggle("active", t.dataset.manageCategory === lunchManageCategory));
const list = els.lunchManageList;
if(!list) return;
const arr = LUNCH_DATA[lunchManageCategory] || [];
if(!arr.length){ list.innerHTML = '<div id="lunchManageEmpty">Danh sách đang trống.</div>'; return; }
const frag = document.createDocumentFragment();
arr.forEach((name, i) => {
const row = document.createElement("div"); row.className = "lunchManageRow";
const no = document.createElement("div"); no.className = "lunchManageNo"; no.textContent = String(i+1);
const input = document.createElement("input"); input.className = "lunchManageInput"; input.value = name; input.maxLength = 60;
const save = document.createElement("button"); save.className = "lunchManageSave"; save.type = "button"; save.textContent = "Lưu";
save.addEventListener("click", () => {
const value = input.value.trim().replace(/\s+/g, " ");
if(!value){ updateLunchManageStatus("Tên món không được để trống"); return; }
const duplicate = Object.entries(LUNCH_DATA).some(([cat, items]) =>
items.some((x, j) => x.toLowerCase() === value.toLowerCase() && !(cat === lunchManageCategory && j === i))
);
if(duplicate){ updateLunchManageStatus("Tên món này đã tồn tại"); return; }
LUNCH_DATA[lunchManageCategory][i] = value;
saveLunchData(); renderLunchManage(); updateLunchManageStatus("Đã cập nhật món ✓");
});
const del = document.createElement("button"); del.className = "lunchManageDelete"; del.type = "button"; del.textContent = "Xóa";
del.addEventListener("click", () => {
if(LUNCH_DATA[lunchManageCategory].length <= 1){ updateLunchManageStatus("Danh sách cần có ít nhất 1 món"); return; }
if(!confirm('Xóa món "' + LUNCH_DATA[lunchManageCategory][i] + '" khỏi danh sách?')) return;
LUNCH_DATA[lunchManageCategory].splice(i, 1);
saveLunchData(); renderLunchManage(); updateLunchManageStatus("Đã xóa món ✓");
});
row.append(no, input, save, del);
frag.appendChild(row);
});
list.innerHTML = "";
list.appendChild(frag);
}

function cacheEls(){
els = {
lunchBtn: $("lunchBtn"),
lunchPage: $("lunchPage"),
lunchBack: $("lunchBack"),
lunchResultBody: $("lunchResultBody"),
lunchResultCard: $("lunchResultCard"),
lunchRerollBtn: $("lunchRerollBtn"),
lunchAddBtn2: $("lunchAddBtn2"),
lunchAddForm2: $("lunchAddForm2"),
lunchAddInput2: $("lunchAddInput2"),
lunchAddStatus2: $("lunchAddStatus2"),
lunchManageBtn2: $("lunchManageBtn2"),
lunchManageOverlay: $("lunchManageOverlay"),
lunchManageClose: $("lunchManageClose"),
lunchManageList: $("lunchManageList"),
lunchManageStatus: $("lunchManageStatus"),
};
}

function bindEvents(){
els.lunchBtn?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openLunchPage(); });
els.lunchBack?.addEventListener("click", closeLunchPage);
document.querySelectorAll(".lunch-mode-card").forEach(btn =>
btn.addEventListener("click", () => { lunchMode = btn.dataset.mode; pickLunch(); })
);
els.lunchRerollBtn?.addEventListener("click", pickLunch);
els.lunchAddBtn2?.addEventListener("click", () => {
const form = els.lunchAddForm2;
if(!form) return;
form.classList.toggle("show");
if(form.classList.contains("show")){
setTimeout(() => els.lunchAddInput2?.focus(), 100);
if(els.lunchAddStatus2) els.lunchAddStatus2.textContent = "";
}
});
document.querySelectorAll(".lunch-add-cat").forEach(btn => {
btn.addEventListener("click", () => {
const category = btn.dataset.addCategory;
const name = (els.lunchAddInput2?.value || "").trim().replace(/\s+/g, " ");
if(!name){
if(els.lunchAddStatus2){ els.lunchAddStatus2.textContent = "Vui lòng nhập tên món"; els.lunchAddStatus2.style.color = "#c05a3a"; }
els.lunchAddInput2?.focus();
return;
}
const all = Object.values(LUNCH_DATA).flat().map(x => x.toLowerCase());
if(all.includes(name.toLowerCase())){
if(els.lunchAddStatus2){ els.lunchAddStatus2.textContent = "Món này đã có trong danh sách"; els.lunchAddStatus2.style.color = "#c05a3a"; }
return;
}
LUNCH_DATA[category].push(name);
saveLunchData();
if(els.lunchAddInput2) els.lunchAddInput2.value = "";
if(els.lunchAddStatus2){
els.lunchAddStatus2.textContent = `Đã thêm "${name}" ✓`;
els.lunchAddStatus2.style.color = "#4a8a58";
setTimeout(() => { els.lunchAddStatus2.textContent = ""; }, 2200);
}
});
});
els.lunchAddInput2?.addEventListener("keydown", e => {
if(e.key === "Enter"){ e.preventDefault(); document.querySelector(".lunch-add-cat.home")?.click(); }
});
els.lunchManageBtn2?.addEventListener("click", () => { closeLunchPage(); openLunchManage(); });
els.lunchManageClose?.addEventListener("click", closeLunchManage);
els.lunchManageOverlay?.addEventListener("click", e => { if(e.target === els.lunchManageOverlay) closeLunchManage(); });
document.querySelectorAll(".lunchManageTab").forEach(tab =>
tab.addEventListener("click", () => { lunchManageCategory = tab.dataset.manageCategory; renderLunchManage(); })
);
document.addEventListener("keydown", e => {
if(e.key !== "Escape" || e.defaultPrevented) return;
if(els.lunchManageOverlay?.classList.contains("show")){ closeLunchManage(); e.preventDefault(); return; }
if(els.lunchPage?.classList.contains("show")){ closeLunchPage(); e.preventDefault(); return; }
});
}

window.SRankLunch = { open: openLunchPage, close: closeLunchPage, pick: pickLunch };

function init(){
injectHTML();
cacheEls();
loadLunchData();
bindEvents();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
})();
