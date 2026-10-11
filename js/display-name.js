/* =========================================================
   DISPLAY NAME — v1.1
   ---------------------------------------------------------
   Single source of truth cho "tên hiển thị".
     checklist_name (= Auth displayName) ↔ display_name (user tự đổi)
   - API: DN(name), DisplayName.set/openDialog/...
   - Realtime sync từ Supabase
   - Cache localStorage
   ========================================================= */
(function(){
  "use strict";
  if (window.__displayNameLoaded) return;
  window.__displayNameLoaded = true;

  const CACHE_KEY = 'srank_display_names_v1';
  const MAP = new Map();
  let _loaded = false;

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(k => MAP.set(k, String(obj[k] || '')));
      }
    } catch(_) {}
  }

  function saveCache() {
    try {
      const obj = {};
      MAP.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch(_) {}
  }

  function get(name) {
    const key = String(name || '').trim();
    if (!key) return name;
    const dn = MAP.get(key);
    return (dn && dn.trim()) ? dn.trim() : key;
  }

  function dispatchUpdate() {
    try { window.dispatchEvent(new CustomEvent('displayNameUpdated')); } catch(_) {}
  }

  async function loadAll(force) {
    if (_loaded && !force) return;
    _loaded = true;
    const sb = window.__sb;
    if (!sb || !sb.rpc) return;
    try {
      const res = await sb.rpc('rpc_get_profiles');
      if (res.error) throw res.error;
      const d = res.data || {};
      if (d.ok !== true) return;
      const list = Array.isArray(d.data) ? d.data : [];
      list.forEach(it => {
        if (it && it.name) {
          MAP.set(String(it.name).trim(), String(it.displayName || '').trim());
        }
      });
      saveCache();
      dispatchUpdate();
      console.log('[DN] loaded', list.length, 'profiles');
    } catch(e) {
      console.warn('[DN] load failed', e && e.message);
    }
  }

  async function set(name, display) {
    const key = String(name || '').trim();
    const val = String(display || '').trim();
    if (!key) throw new Error('Thiếu tên định danh');
    if (!val) throw new Error('Tên không được rỗng');
    if (val.length > 40) throw new Error('Tối đa 40 ký tự');

    const sb = window.__sb;
    if (!sb || !sb.rpc) throw new Error('Chưa kết nối Supabase');

    const res = await sb.rpc('rpc_set_profile', { p_name: key, p_display: val });
    if (res.error) throw res.error;
    const d = res.data || {};
    if (d.ok !== true) throw new Error(d.error || 'Không lưu được');

    MAP.set(key, val);
    saveCache();
    dispatchUpdate();
    return val;
  }

  function subscribeRealtime() {
    const sb = window.__sb;
    if (!sb || !sb.channel) return;
    try {
      sb.channel('realtime-display-names')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'srank_profiles' },
          function(payload) {
            const row = payload.new || {};
            if (!row.checklist_name) return;
            const key = String(row.checklist_name).trim();
            const val = String(row.display_name || '').trim();
            const old = MAP.get(key);
            if (old === val) return;
            MAP.set(key, val);
            saveCache();
            dispatchUpdate();
            console.log('[DN] realtime:', key, '→', val);
          }
        )
        .subscribe(function(status){
          console.log('[DN] realtime:', status);
        });
    } catch(e) { console.warn('[DN] realtime failed', e); }
  }

  function currentName() {
    try {
      const u = window.SRank && window.SRank.Auth && window.SRank.Auth.getCurrentUser && window.SRank.Auth.getCurrentUser();
      if (u && u.displayName) return String(u.displayName).trim();
    } catch(_) {}
    try {
      const v = String(localStorage.getItem('srank_last_picked_name_v1') || '').trim();
      if (v) return v;
    } catch(_) {}
    return '';
  }

  function openDialog() {
    const name = currentName();
    if (!name) {
      alert('Không tìm thấy tên định danh.\nHãy chấm công (Câu 1) trước rồi đổi tên.');
      return;
    }
    const current = get(name);
    const next = prompt(
      'Tên hiển thị của bạn\n(hiện tại: "' + current + '")\n\nTối đa 40 ký tự, mọi người đều thấy:',
      current === name ? '' : current
    );
    if (next === null) return;
    const val = String(next).trim();
    if (!val) { alert('Tên không được rỗng'); return; }
    if (val === current) return;

    set(name, val)
      .then(function(){
        if (window.Toast) {
          Toast.show('Đã đổi tên hiển thị ✓', { type: 'success', duration: 2400 });
        }
        console.log('[DN] renamed', name, '→', val);
      })
      .catch(function(e){
        alert('Lỗi: ' + (e.message || e));
      });
  }

  function bindButton() {
    let btn = document.getElementById('displayNameBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'displayNameBtn';
      btn.type = 'button';
      btn.hidden = true;
      btn.style.display = 'none';
      document.body.appendChild(btn);
    }
    if (!btn.__dnBound) {
      btn.__dnBound = true;
      btn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        openDialog();
      });
    }
  }

  function boot() {
    loadCache();
    bindButton();
    loadAll(true).finally(subscribeRealtime);
    [1500, 4000, 8000].forEach(function(t){
      setTimeout(function(){ loadAll(false); }, t);
    });
    console.log('[DN] ready ✓');
  }

  window.DN = get;
  window.DisplayName = {
    get: get,
    set: set,
    loadAll: loadAll,
    currentName: currentName,
    openDialog: openDialog,
    map: MAP
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();