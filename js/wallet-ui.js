/* ═══════════════════════════════════════════════════════════════
   SRANK WALLET — v1.2.0 💰
   - Menu user card: ví bản thân
   - Landing court: inject ví vào TỪNG slot (throne/advisor/courtier)
   - Auto claim bonus khi checkin
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const Auth = window.SRank && window.SRank.Auth;
  if (!Auth) { console.warn('[Wallet] Auth chưa load — cần load auth.js trước'); return; }

  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  let _wallet = { username: '', balance: 0, lastBonusDate: null };
  let _inflight = false;
  let _inflightBonus = false;

  /* All wallets map (tên gốc → balance) */
  let _allWallets = {};
  let _allFetchedAt = 0;
  let _allInflight = false;
  const ALL_WALLETS_TTL = 60000; /* 60s */

  let _landingObserver = null;
  let _injectDebounce = null;

  /* ───── Format ───── */
  function formatMoney(n){
    const num = Math.round(Number(n) || 0);
    return num.toLocaleString('vi-VN') + 'đ';
  }
  function formatMoneyBare(n){
    return Math.round(Number(n) || 0).toLocaleString('vi-VN');
  }
  function formatDelta(n){
    const num = Math.round(Number(n) || 0);
    const sign = num > 0 ? '+' : '';
    return sign + num.toLocaleString('vi-VN') + 'đ';
  }

  function getUsername(){
    try {
      const u = Auth.getCurrentUser?.();
      if (!u) return '';
      const dn = String(u.displayName || '').trim();
      if (dn) return dn;
      const m = u.user_metadata || {};
      const raw = String(m.display_name || m.full_name || m.name || '').trim();
      if (raw) return raw;
      return String(u.username || '').trim();
    } catch(_){ return ''; }
  }

  async function callRpc(fn, params){
    const sb = window.__sb;
    if (!sb || !sb.rpc) throw new Error('Chưa kết nối máy chủ');
    const { data, error } = await sb.rpc(fn, params);
    if (error) throw new Error(error.message || 'Lỗi mạng');
    if (data && data.ok === false) throw new Error(data.error || 'Lỗi không xác định');
    return data;
  }

  /* ───── Refresh ví bản thân ───── */
  async function refresh(){
    const uname = getUsername();
    if (!uname) return _wallet;
    if (_inflight) return _wallet;
    _inflight = true;
    try {
      const data = await callRpc('rpc_wallet_get', { p_name: uname });
      const d = (data && data.data) || {};
      _wallet = {
        username: d.username || uname,
        balance: Number(d.balance) || 0,
        lastBonusDate: d.lastBonusDate || null
      };
      renderMenu();
      try { window.dispatchEvent(new CustomEvent('walletUpdated', { detail: _wallet })); } catch(_){}
    } catch(e){
      console.warn('[Wallet] refresh:', e.message);
    } finally {
      _inflight = false;
    }
    return _wallet;
  }

  /* ───── Refresh all wallets ───── */
  async function refreshAllWallets(force){
    if (!force && Date.now() - _allFetchedAt < ALL_WALLETS_TTL) return _allWallets;
    if (_allInflight) return _allWallets;
    _allInflight = true;
    try {
      const data = await callRpc('rpc_wallet_get_all', {});
      const list = (data && data.data && Array.isArray(data.data.wallets)) ? data.data.wallets : [];
      const map = {};
      list.forEach(w => {
        const name = String(w.username || '').trim();
        if (name) map[name] = Number(w.balance) || 0;
      });
      _allWallets = map;
      _allFetchedAt = Date.now();
      scheduleInject();
    } catch(e){
      console.warn('[Wallet] refreshAll:', e.message);
    } finally {
      _allInflight = false;
    }
    return _allWallets;
  }

  /* ───── Claim bonus ───── */
  async function claimBonus(){
    const uname = getUsername();
    if (!uname) return null;
    if (_inflightBonus) return null;
    _inflightBonus = true;
    try {
      const data = await callRpc('rpc_wallet_claim_bonus', { p_name: uname });
      const d = (data && data.data) || {};
      if (d.claimed){
        _wallet.balance = Number(d.balance) || _wallet.balance;
        renderMenu();
        refreshAllWallets(true);
        try { window.dispatchEvent(new CustomEvent('walletUpdated', { detail: _wallet })); } catch(_){}
        try {
          if (window.Toast && window.Toast.show){
            window.Toast.show('+100.000 VNĐ vào tài khoản 💰', { type: 'success', duration: 3600 });
          }
        } catch(_){}
      }
      return d;
    } catch(e){
      console.warn('[Wallet] claimBonus:', e.message);
      return null;
    } finally {
      _inflightBonus = false;
    }
  }

  function get(){ return _wallet; }
  function getBalance(){ return _wallet.balance || 0; }

  /* ═══════════════════════════════════════════════════════════════
     CSS
     ═══════════════════════════════════════════════════════════════ */
  function injectCss(){
    if (document.getElementById('srankWalletCss')) return;
    const s = document.createElement('style');
    s.id = 'srankWalletCss';
    s.textContent = `
/* Menu user card — ví */
.menu-user-wallet {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  margin-top: 4px !important;
  padding: 3px 10px !important;
  background: linear-gradient(135deg, #fff8e6, #ffe9b8) !important;
  border: 1.5px solid #ffd88a !important;
  border-radius: 999px !important;
  font-size: 12px !important;
  font-weight: 950 !important;
  color: #5a3a00 !important;
  font-variant-numeric: tabular-nums !important;
  box-shadow: 0 2px 8px -3px rgba(232, 165, 60, .4) !important;
  align-self: flex-start !important;
  max-width: 100% !important;
  white-space: nowrap !important;
  letter-spacing: .01em !important;
  line-height: 1.2 !important;
}
.menu-user-wallet .wallet-icon { font-size: 12px !important; }
.menu-user-wallet .wallet-amount { font-weight: 950 !important; }
.menu-user-wallet.wallet-low {
  background: linear-gradient(135deg, #fff0f0, #ffd9d9) !important;
  border-color: #ffb8b8 !important;
  color: #b8434e !important;
  animation: walletPulseWarn 1.8s ease-in-out infinite !important;
}
@keyframes walletPulseWarn {
  0%, 100% { box-shadow: 0 2px 8px -3px rgba(232, 85, 107, .4); }
  50%      { box-shadow: 0 2px 14px -2px rgba(232, 85, 107, .8); }
}
@media (prefers-reduced-motion: reduce) {
  .menu-user-wallet.wallet-low { animation: none !important; }
}

/* Landing court — ví từng slot */
.courtier-wallet {
  display: inline-block !important;
  padding: 1px 7px !important;
  border-radius: 999px !important;
  background: linear-gradient(135deg, #fff8e6, #ffe9b8) !important;
  border: 1px solid #ffd88a !important;
  font-weight: 950 !important;
  color: #7a5410 !important;
  font-variant-numeric: tabular-nums !important;
  white-space: nowrap !important;
  letter-spacing: .01em !important;
  line-height: 1.2 !important;
  margin-top: 2px !important;
  box-shadow: 0 2px 6px -2px rgba(232, 165, 60, .35) !important;
  text-shadow: 0 1px 1px rgba(255, 255, 255, .5) !important;
}
.courtier-wallet.wallet-low {
  background: linear-gradient(135deg, #fff0f0, #ffd9d9) !important;
  border-color: #ffb8b8 !important;
  color: #b8434e !important;
}

/* Size theo vị trí */
html body #question .court-throne .courtier-wallet { font-size: 11px !important; }
html body #question .advisor .courtier-wallet { font-size: 10px !important; }
html body #question .courtier .courtier-wallet { font-size: 9px !important; }

/* Tú lơ khơ header — ví */
.tlk-wallet {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 5px 11px !important;
  background: linear-gradient(135deg, #fff8e6, #ffe9b8) !important;
  border: 1.5px solid #ffd88a !important;
  border-radius: 999px !important;
  font-size: 12px !important;
  font-weight: 950 !important;
  color: #5a3a00 !important;
  margin-right: 8px !important;
  box-shadow: 0 2px 8px -3px rgba(232, 165, 60, .4) !important;
  font-variant-numeric: tabular-nums !important;
  white-space: nowrap !important;
}
.tlk-wallet[hidden] { display: none !important; }
#tlkHeadTitle { margin-right: auto !important; }

/* Finished overlay — delta ví */
.tlk-wallet-delta {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 8px 18px !important;
  border-radius: 999px !important;
  font-size: 18px !important;
  font-weight: 950 !important;
  margin-bottom: 14px !important;
  font-variant-numeric: tabular-nums !important;
  animation: walletDeltaIn .5s cubic-bezier(.2,.9,.3,1.4) !important;
}
.tlk-wallet-delta.win {
  background: linear-gradient(135deg, #d4f5e0, #a8e8c0) !important;
  color: #1a6b3a !important;
  box-shadow: 0 6px 20px -6px rgba(47, 155, 87, .6) !important;
  border: 1.5px solid #7ce0a0 !important;
}
.tlk-wallet-delta.lose {
  background: linear-gradient(135deg, #ffe0e0, #ffc4c4) !important;
  color: #b8434e !important;
  box-shadow: 0 6px 20px -6px rgba(232, 85, 107, .6) !important;
  border: 1.5px solid #ff9ec6 !important;
}
.tlk-wallet-delta .delta-icon { font-size: 20px !important; }
.tlk-wallet-delta .delta-amount { font-weight: 950 !important; }
.tlk-wallet-delta .delta-balance {
  font-size: 12px !important;
  font-weight: 800 !important;
  opacity: .75 !important;
  margin-left: 6px !important;
}
@keyframes walletDeltaIn {
  0%   { transform: scale(.5); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .tlk-wallet-delta { animation: none !important; }
}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════
     Menu user card wallet
     ═══════════════════════════════════════════════════════════════ */
  function injectMenuWallet(){
    const info = document.querySelector('#menuUserCard .menu-user-info');
    if (!info) return null;
    let el = info.querySelector('#menuUserWallet');
    if (!el){
      el = document.createElement('div');
      el.id = 'menuUserWallet';
      el.className = 'menu-user-wallet';
      info.appendChild(el);
    }
    return el;
  }

  function renderMenu(){
    const el = injectMenuWallet();
    if (!el) return;
    const uname = getUsername();
    if (!uname){
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const bal = _wallet.balance || 0;
    el.innerHTML = `<span class="wallet-icon">💰</span><span class="wallet-amount">${h(formatMoney(bal))}</span>`;
    el.classList.toggle('wallet-low', bal < 100000);
  }

  /* ═══════════════════════════════════════════════════════════════
     Landing court — inject ví vào từng slot
     ═══════════════════════════════════════════════════════════════ */
  function buildDnLookup(){
    const map = new Map();
    try {
      const names = (window.__getChecklistNames && window.__getChecklistNames()) || [];
      names.forEach(n => {
        const raw = String(n || '').trim();
        if (!raw) return;
        const dn = window.DN ? String(window.DN(raw) || raw).trim() : raw;
        if (dn) map.set(dn, raw);
        /* Cũng map chính tên gốc (fallback nếu DN không áp dụng) */
        map.set(raw, raw);
      });
    } catch(_){}
    return map;
  }

  function injectIntoSlot(nameEl){
    if (!nameEl) return;
    const dn = String(nameEl.textContent || '').trim();
    if (!dn) return;

    const lookup = buildDnLookup();
    const rawName = lookup.get(dn);
    if (!rawName) return;

    const bal = _allWallets[rawName];
    if (bal == null) return;

    const parent = nameEl.parentElement;
    if (!parent) return;

    /* Tìm hoặc tạo element ví — chèn sau nameEl */
    let w = parent.querySelector('.courtier-wallet');
    if (!w){
      w = document.createElement('div');
      w.className = 'courtier-wallet';
      nameEl.insertAdjacentElement('afterend', w);
    }
    w.textContent = '💰 ' + formatMoneyBare(bal);
    w.classList.toggle('wallet-low', bal < 100000);
  }

  function injectCourtWallets(){
    const q = $('question');
    if (!q) return;
    if (!Object.keys(_allWallets).length) return;

    /* Throne */
    const throne = q.querySelector('.court-throne .throne-name');
    if (throne) injectIntoSlot(throne);

    /* Advisors (top2 + top3) */
    q.querySelectorAll('.advisor .advisor-name').forEach(el => injectIntoSlot(el));

    /* Courtiers (top 4-13) */
    q.querySelectorAll('.courtier .courtier-name').forEach(el => injectIntoSlot(el));
  }

  function scheduleInject(){
    if (_injectDebounce) return;
    _injectDebounce = setTimeout(function(){
      _injectDebounce = null;
      injectCourtWallets();
    }, 60);
  }

  function setupLandingObserver(){
    const q = $('question');
    if (!q){
      setTimeout(setupLandingObserver, 800);
      return;
    }
    if (_landingObserver){
      try { _landingObserver.disconnect(); } catch(_){}
    }
    _landingObserver = new MutationObserver(function(){
      if (!getUsername()) return;
      scheduleInject();
    });
    _landingObserver.observe(q, { childList: true, subtree: true });
    /* Inject lần đầu */
    scheduleInject();
  }

  /* ═══════════════════════════════════════════════════════════════
     HOOKS
     ═══════════════════════════════════════════════════════════════ */
  window.addEventListener('checkinDone', function(){
    setTimeout(function(){
      claimBonus();
      /* Bonus vừa cộng → refresh all để landing cập nhật */
      setTimeout(function(){ refreshAllWallets(true); }, 900);
    }, 500);
  });

  try {
    Auth.onChange(function(u){
      if (u){
        setTimeout(function(){
          refresh();
          refreshAllWallets(true);
        }, 400);
      } else {
        _wallet = { username: '', balance: 0, lastBonusDate: null };
        _allWallets = {};
        _allFetchedAt = 0;
        renderMenu();
      }
    });
  } catch(_){}

  /* Poll định kỳ để đồng bộ ví mọi người */
  setInterval(function(){
    if (document.hidden) return;
    if (!Auth.getCurrentUser?.()) return;
    refresh();
    refreshAllWallets(false);
  }, 45000);

  /* ═══════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════ */
  function init(){
    injectCss();

    if (Auth.getCurrentUser?.()){
      setTimeout(function(){
        refresh();
        refreshAllWallets(true);
      }, 400);
    }

    /* Menu wallet — retry phòng khi menu DOM chưa có */
    [1500, 3000].forEach(t => setTimeout(function(){
      injectMenuWallet();
      renderMenu();
    }, t));

    /* Landing court — observer */
    setupLandingObserver();
    /* Retry inject phòng khi main.js render chậm */
    [1500, 3000, 5000].forEach(t => setTimeout(scheduleInject, t));

    console.log('[Wallet] ready ✓ v1.2.0');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SRank = window.SRank || {};
  window.SRank.Wallet = {
    get,
    getBalance,
    refresh,
    refreshAllWallets,
    claimBonus,
    formatMoney,
    formatDelta
  };
})();