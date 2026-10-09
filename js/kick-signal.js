/* =========================================================
   SRANK KICK SIGNAL — v1.0
   ---------------------------------------------------------
   - Nghe realtime INSERT trên public.srank_kick_signals
   - Nếu user_id trùng user hiện tại → signOut + reload
   - KHÔNG polling — chỉ websocket push
   ---------------------------------------------------------
   Debug: thêm ?debug=kick vào URL
   ========================================================= */
(function(){
  "use strict";

  const DEBUG = /[?&]debug=kick/.test(location.search);
  function log(){ if (DEBUG) console.log.apply(console, ["[Kick]"].concat([].slice.call(arguments))); }
  function warn(){ console.warn.apply(console, ["[Kick]"].concat([].slice.call(arguments))); }

  /* ---------- Tìm Supabase client ---------- */
  function getSb(){
    return window.__sb || window.supabaseClient || window.supabase || null;
  }

  function waitForSb(cb, tries){
    tries = tries || 0;
    const sb = getSb();
    if (sb && sb.auth && typeof sb.channel === "function"){
      cb(sb);
      return;
    }
    if (tries >= 50){
      warn("Không tìm thấy Supabase client sau 10s");
      return;
    }
    setTimeout(function(){ waitForSb(cb, tries + 1); }, 200);
  }

  /* ---------- Lấy UID hiện tại ---------- */
  async function getMyUid(sb){
    try {
      const res = await sb.auth.getUser();
      if (!res.error && res.data && res.data.user && res.data.user.id){
        return res.data.user.id;
      }
    } catch(e){}

    // Fallback: đọc từ localStorage
    try {
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if (!k || !/^sb-.*-auth-token$/i.test(k)) continue;
        const v = localStorage.getItem(k);
        if (!v) continue;
        try {
          const j = JSON.parse(v);
          const u =
            (j && j.user) ||
            (j && j.currentSession && j.currentSession.user) ||
            (j && j.session && j.session.user);
          if (u && u.id) return u.id;
        } catch(e){}
      }
    } catch(e){}
    return "";
  }

  /* ---------- Xử lý khi bị kick ---------- */
  let kicking = false;
  async function handleKick(sb, reason){
    if (kicking) return;
    kicking = true;

    log("BỊ KICK. reason =", reason || "logout");

    try {
      await sb.auth.signOut({ scope: "global" });
    } catch(e){
      try { await sb.auth.signOut(); } catch(e2){}
    }

    // Xoá cache phụ
    try { localStorage.removeItem("srank_avatar_bust"); } catch(e){}

    // Thông báo rồi reload
    try {
      alert("Tài khoản của bạn đã được đăng xuất. Vui lòng đăng nhập lại.");
    } catch(e){}

    location.reload();
  }

  /* ---------- Khởi động ---------- */
  waitForSb(function(sb){
    let myUid = "";

    // Lấy uid ngay lập tức
    getMyUid(sb).then(function(uid){
      myUid = uid || "";
      log("init. My UID =", myUid || "(chưa login)");
    });

    // Cập nhật uid khi login/logout
    try {
      sb.auth.onAuthStateChange(function(_event, session){
        const u = session && session.user;
        myUid = (u && u.id) || "";
        log("auth change. My UID =", myUid || "(chưa login)");
      });
    } catch(e){
      warn("onAuthStateChange lỗi:", e);
    }

    // Subscribe realtime channel
    let channel;
    try {
      channel = sb
        .channel("srank_kick_channel")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "srank_kick_signals"
          },
          async function(payload){
            const row = payload && payload.new;
            if (!row || !row.user_id) return;

            if (!myUid) myUid = await getMyUid(sb);
            if (!myUid) return;

            if (String(row.user_id).toLowerCase() !== String(myUid).toLowerCase()){
              return;
            }
            handleKick(sb, row.reason);
          }
        )
        .subscribe(function(status){
          log("realtime status:", status);
        });
    } catch(e){
      warn("Không subscribe được channel:", e);
    }

    // Cleanup khi rời trang
    window.addEventListener("beforeunload", function(){
      if (!channel) return;
      try { sb.removeChannel(channel); } catch(e){}
    });
  });

  log("ready ✓");
})();
