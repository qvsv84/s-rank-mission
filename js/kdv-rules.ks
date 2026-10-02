(function(){
"use strict";
const $ = id => document.getElementById(id);

const OVERLAY_HTML = `<div id="kdvRulesOverlay" aria-hidden="true">
<section id="kdvRulesPanel" role="dialog" aria-modal="true">
<button id="kdvRulesClose" type="button" aria-label="Đóng Luật KDV">×</button>
<div class="kdvSparkle">✦　♡　✦</div>
<div id="kdvRulesTitle">📜 LUẬT KDV</div>
<div id="kdvRulesSub">Quy định duyệt bài • Đọc kỹ trước khi kiểm duyệt</div>
<div id="kdvRulesList">
<article class="kdvRule"><span class="kdvNum">01</span><div>Cấm đăng video có logo <b>(TIKTOK, DOUYIN,...)</b></div></article>
<article class="kdvRule"><span class="kdvNum">02</span><div>Cấm đăng video có <b>NHẠC NƯỚC NGOÀI</b></div></article>
<article class="kdvRule"><span class="kdvNum">03</span><div>Cấm các hình ảnh chứa <b>BỘ PHẬN NHẠY CẢM</b> của người, động vật</div></article>
<article class="kdvRule"><span class="kdvNum">04</span><div>Cấm <b>MUA - BÁN - CHO - TẶNG</b> dưới mọi hình thức</div></article>
<article class="kdvRule"><span class="kdvNum">05</span><div>Cấm các hình ảnh <b>NUÔI NHỐT - HÀNH HẠ - NGƯỢC ĐÃI ĐỘNG VẬT</b></div></article>
<article class="kdvRule"><span class="kdvNum">06</span><div>Cấm các hình ảnh <b>THUỐC SÚNG, MA TUÝ, THUỐC PHIỆN, CẦN SA</b></div></article>
<article class="kdvRule"><span class="kdvNum">07</span><div>Cấm các bài viết về <b>TÔN GIÁO, CHÍNH TRỊ, THÙ HẰN</b></div></article>
<article class="kdvRule"><span class="kdvNum">08</span><div>Các bài <b>PHỐT</b> đều phải thông qua <b>ADMIN</b> kiểm duyệt mới được đăng</div></article>
<article class="kdvRule"><span class="kdvNum">09</span><div><b>KHÔNG LIVE STREAM</b> khi chưa được <b>ADMIN</b> cho phép</div></article>
<article class="kdvRule"><span class="kdvNum">10</span><div><b>KHÔNG XOÁ BÀI</b> khi bài không vi phạm các quy định trên</div></article>
<article class="kdvRule"><span class="kdvNum">11</span><div><b>KHÔNG BÁN HÀNG</b> dưới mọi hình thức, phải đăng ký qua <b>ADMIN</b></div></article>
<article class="kdvRule"><span class="kdvNum">12</span><div><b>KHÔNG BẬT TÍNH NĂNG PHÊ DUYỆT TRƯỚC</b> cho người khác</div></article>
</div>
<div class="kdvFooter">♡ Kiểm duyệt đúng luật • Công bằng • Rõ ràng ♡</div>
</section>
</div>`;

function injectHTML(){
  if($("kdvRulesOverlay")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = OVERLAY_HTML;
  while(wrap.firstChild) document.body.appendChild(wrap.firstChild);
}

let els = {};

function cacheEls(){
  els = {
    openBtn: $("kdvRulesBtn"),
    overlay: $("kdvRulesOverlay"),
    closeBtn: $("kdvRulesClose"),
  };
}

function openOverlay(){
  if(!els.overlay) return;
  els.overlay.classList.add("show");
  els.overlay.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  if(typeof window.syncQuickTools === "function") window.syncQuickTools();
}

function closeOverlay(){
  if(!els.overlay) return;
  els.overlay.classList.remove("show");
  els.overlay.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
  if(typeof window.syncQuickTools === "function") window.syncQuickTools();
}

function bindEvents(){
  els.openBtn?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openOverlay(); });
  els.closeBtn?.addEventListener("click", closeOverlay);
  els.overlay?.addEventListener("click", e => { if(e.target === els.overlay) closeOverlay(); });
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape" || e.defaultPrevented) return;
    if(els.overlay?.classList.contains("show")){ closeOverlay(); e.preventDefault(); }
  });
}

window.SRankKdvRules = { open: openOverlay, close: closeOverlay };

function init(){
  injectHTML();
  cacheEls();
  bindEvents();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
})();
