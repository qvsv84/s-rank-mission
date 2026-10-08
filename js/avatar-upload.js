/* =========================================================
   SRANK AVATAR UPLOAD — v1.0
   ---------------------------------------------------------
   - User tự upload avatar cho chính mình
   - Resize → 400×400 JPEG trước khi upload
   - Storage: avatars/{uid}.jpg (RLS bảo vệ theo uid)
   - Save metadata vào table srank_avatars qua RPC
   - Update cache → dispatch "avatarUpdated" event
   ========================================================= */
(function(){
  "use strict";

  const $ = id => document.getElementById(id);
  const btn = $("avatarBtn");
  const input = $("avatarFileInput");

  if (!btn || !input) { console.warn("[AV] thiếu DOM"); return; }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
  const TARGET_SIZE = 400;

  let uploading = false;

  function getAuthUser(){
    try {
      return (window.SRank && window.SRank.Auth && typeof window.SRank.Auth.getCurrentUser === "function"
        && window.SRank.Auth.getCurrentUser()) || null;
    } catch(_) { return null; }
  }

  function setStatus(msg){
    if (window.SRank && typeof window.SRank.setStatus === "function") window.SRank.setStatus(msg);
    else console.log("[AV]", msg);
  }

  /* Resize + crop vuông → JPEG blob */
  function resizeImage(file, size){
    return new Promise(function(resolve, reject){
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function(){
        try {
          URL.revokeObjectURL(url);
          const s = Math.min(img.width, img.height);
          const sx = (img.width - s) / 2;
          const sy = (img.height - s) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
          canvas.toBlob(function(blob){
            if (blob) resolve(blob);
            else reject(new Error("Không nén được ảnh"));
          }, "image/jpeg", 0.9);
        } catch(e){
          reject(e);
        }
      };
      img.onerror = function(){
        URL.revokeObjectURL(url);
        reject(new Error("Không đọc được ảnh"));
      };
      img.src = url;
    });
  }

  async function uploadAvatar(file){
    if (uploading) return;

    const user = getAuthUser();
    if (!user) { setStatus("Vui lòng đăng nhập"); return; }
    if (!user.displayName) { setStatus("Tài khoản chưa có display_name"); return; }
    if (!file) return;

    if (file.size > MAX_SIZE) { setStatus("Ảnh quá 5MB — chọn ảnh nhỏ hơn"); return; }
    if (ALLOWED.indexOf(file.type) < 0) { setStatus("Chỉ nhận JPG / PNG / WebP"); return; }

    const sb = window.__sb;
    if (!sb || !sb.storage) { setStatus("Chưa kết nối Supabase Storage"); return; }

    uploading = true;
    btn.disabled = true;
    btn.textContent = "⏳";

    try {
      /* 1. Resize */
      setStatus("Đang xử lý ảnh…");
      const blob = await resizeImage(file, TARGET_SIZE);

      /* 2. Upload Storage — path = {uid}.jpg */
      setStatus("Đang upload…");
      const path = user.id + ".jpg";
      const upRes = await sb.storage
        .from("avatars")
        .upload(path, blob, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "3600"
        });

      if (upRes.error) throw upRes.error;

      /* 3. Get public URL */
      const urlRes = sb.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlRes && urlRes.data && urlRes.data.publicUrl;
      if (!publicUrl) throw new Error("Không lấy được URL ảnh");

      /* Cache-bust để ảnh mới hiển thị ngay */
      const finalUrl = publicUrl + "?t=" + Date.now();

      /* 4. Lưu URL vào table qua RPC */
      setStatus("Đang lưu…");
      const rpcRes = await sb.rpc("rpc_set_avatar", {
        p_name: user.displayName,
        p_url: finalUrl
      });

      if (rpcRes.error) throw rpcRes.error;
      const d = rpcRes.data;
      if (!d || d.ok !== true) throw new Error((d && d.error) || "Không lưu được avatar");

      /* 5. Update cache + broadcast */
      try {
        if (window.SRank && window.SRank.avatar && typeof window.SRank.avatar.setCache === "function"){
          window.SRank.avatar.setCache(user.displayName, finalUrl);
        }
      } catch(_) {}

      try {
        window.dispatchEvent(new CustomEvent("avatarUpdated", {
          detail: { name: user.displayName, url: finalUrl }
        }));
      } catch(_) {}

      setStatus("Đã đổi avatar ✓");
    } catch(e){
      console.error("[AV] upload error", e);
      setStatus("Lỗi: " + (e.message || "Không up được avatar"));
    } finally {
      uploading = false;
      btn.disabled = false;
      btn.textContent = "📷";
      try { input.value = ""; } catch(_) {}
    }
  }

  btn.addEventListener("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    if (uploading) return;
    const user = getAuthUser();
    if (!user) { setStatus("Vui lòng đăng nhập"); return; }
    input.click();
  });

  input.addEventListener("change", function(e){
    const f = e.target.files && e.target.files[0];
    if (f) uploadAvatar(f);
  });

  console.log("[AV] avatar-upload ready ✓");
})();