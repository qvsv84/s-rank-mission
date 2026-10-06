/* =========================================================
   SRankScheduler — Hàng đợi request cho Apps Script
   - Serialize các poll (tránh burst 4 request cùng lúc)
   - User action đi thẳng, không bị chặn bởi poll
   ========================================================= */
(function(){
  "use strict";
  if (window.SRankScheduler) return;

  const pollQueue = [];
  const NORMAL_GAP_MS = 120;   // nghỉ giữa 2 poll
  let running = false;

  async function drain(){
    if (running) return;
    running = true;
    while (pollQueue.length){
      const fn = pollQueue.shift();
      try { await fn(); } catch(_){}
      if (pollQueue.length) await new Promise(r => setTimeout(r, NORMAL_GAP_MS));
    }
    running = false;
  }

  /**
   * Chỉ dùng cho POLL (getSecretMessages, getLiveEvents, getAttendance...).
   * KHÔNG dùng cho action người dùng (sendSecretMessage, setAttendance, checkin).
   */
  function enqueuePoll(fn){
    return new Promise((resolve, reject) => {
      pollQueue.push(() => Promise.resolve().then(fn).then(resolve, reject));
      drain();
    });
  }

  /** Xoá toàn bộ queue — dùng khi user navigate sang trang khác */
  function clear(){
    pollQueue.length = 0;
  }

  window.SRankScheduler = { enqueuePoll, clear };
})();
