/* =========================================================
   REALTIME — WebSocket subscribe cho Chat + Live Feed
   Load SAU supabase-adapter.js
   ========================================================= */
(function(){
  "use strict";
  if (window.__realtimeLoaded) return;
  window.__realtimeLoaded = true;

  function init() {
    const sb = window.__sb;
    if (!sb) { setTimeout(init, 200); return; }

    console.log('[RT] Khởi tạo realtime...');

    /* CHAT */
    sb.channel('realtime-chat')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'secret_chat' },
        function(payload) {
          const row = payload.new;
          window.dispatchEvent(new CustomEvent('sb:chat:new', { detail: row }));
        }
      )
      .subscribe(function(status) {
        console.log('[RT] Chat channel:', status);
      });

    /* LIVE FEED */
    sb.channel('realtime-livefeed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_feed' },
        function(payload) {
          const row = payload.new;
          window.dispatchEvent(new CustomEvent('sb:livefeed:new', { detail: row }));
          // Trigger main.js pull events mới
          try {
            if (window.SRank && window.SRank.LiveFeed && window.SRank.LiveFeed.syncFromServer) {
              window.SRank.LiveFeed.syncFromServer();
            }
          } catch (_) {}
        }
      )
      .subscribe(function(status) {
        console.log('[RT] LiveFeed channel:', status);
      });

    console.log('[RT] Realtime installed ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();