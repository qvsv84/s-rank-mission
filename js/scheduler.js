/* =========================================================
   SRankScheduler — Hàng đợi request cho Apps Script
   ---------------------------------------------------------
   - Serialize các poll (tránh burst nhiều request cùng lúc)
   - User action đi thẳng, không bị chặn bởi poll
   - clear() reject toàn bộ task đang chờ (không leak promise)
   ---------------------------------------------------------
   API:
     SRankScheduler.enqueuePoll(fn)  -> Promise
     SRankScheduler.clear()          -> void
     SRankScheduler.size()           -> number
     SRankScheduler.isRunning()      -> boolean

   LƯU Ý QUAN TRỌNG:
     enqueuePoll() có thể reject với QueueClearedError khi clear()
     được gọi. Caller PHẢI catch để tránh unhandledrejection.
     Ví dụ:
         try { await SRankScheduler.enqueuePoll(fetchData); }
         catch (err) {
           if (err instanceof SRankScheduler.QueueClearedError) return;
           // xử lý lỗi khác
         }
   ========================================================= */
(function(){
  "use strict";
  if (window.SRankScheduler) return;

  const DEFAULT_GAP_MS = 120;   // nghỉ giữa 2 poll
  const MAX_QUEUE_SIZE = 100;   // chống leak khi enqueue ồ ạt

  /** @type {{task:Function, resolve:Function, reject:Function, settled:boolean}[]} */
  const queue = [];
  let running = false;

  class QueueClearedError extends Error {
    constructor(msg){
      super(msg || 'Scheduler queue cleared');
      this.name = 'QueueClearedError';
      this.code = 'QUEUE_CLEARED';
    }
  }

  class QueueFullError extends Error {
    constructor(msg){
      super(msg || 'Scheduler queue is full');
      this.name = 'QueueFullError';
      this.code = 'QUEUE_FULL';
    }
  }

  function sleep(ms){
    return new Promise(r => setTimeout(r, ms));
  }

  async function drain(){
    if (running) return;
    running = true;
    try {
      while (queue.length){
        const item = queue.shift();

        // Task có thể đã bị clear() từ lúc còn nằm trong queue
        // (trường hợp này hiếm vì clear() đã splice hết, nhưng vẫn phòng).
        if (!item || item.settled) continue;

        try {
          const result = await item.task();
          if (!item.settled){
            item.settled = true;
            item.resolve(result);
          }
        } catch (err){
          if (!item.settled){
            item.settled = true;
            item.reject(err);
          }
        }

        if (queue.length) await sleep(DEFAULT_GAP_MS);
      }
    } finally {
      running = false;
    }
  }

  /**
   * Đưa 1 task vào queue poll.
   * Chỉ dùng cho POLL (getSecretMessages, getLiveEvents, getAttendance...).
   * KHÔNG dùng cho action người dùng (sendSecretMessage, setAttendance, checkin).
   *
   * @param {Function} fn  async () => any
   * @returns {Promise}
   */
  function enqueuePoll(fn){
    if (typeof fn !== 'function'){
      return Promise.reject(new TypeError('enqueuePoll: fn must be a function'));
    }
    if (queue.length >= MAX_QUEUE_SIZE){
      return Promise.reject(new QueueFullError());
    }
    return new Promise((resolve, reject) => {
      queue.push({ task: fn, resolve, reject, settled: false });
      drain();
    });
  }

  /**
   * Xoá toàn bộ task đang chờ.
   * - Task đang chạy (nếu có) sẽ hoàn tất bình thường.
   * - Các task pending sẽ bị reject với QueueClearedError.
   *   → Caller PHẢI catch để tránh unhandledrejection.
   */
  function clear(){
    const pending = queue.splice(0, queue.length);
    for (let i = 0; i < pending.length; i++){
      const item = pending[i];
      if (!item.settled){
        item.settled = true;
        item.reject(new QueueClearedError());
      }
    }
  }

  function size(){ return queue.length; }
  function isRunning(){ return running; }

  window.SRankScheduler = {
    enqueuePoll,
    clear,
    size,
    isRunning,
    QueueClearedError,
    QueueFullError
  };
})();
