/* ═══════════════════════════════════════════════════════════════
   SRANK WALLET — v1.1.0 💰
   - Hiển thị ví ở menu user card
   - Hiển thị ví ở landing (dưới dòng lock note)
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
  let _landingObserver = null;

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

  /* ───── Refresh ───── */
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
      renderAll();
      try { window.dispatchEvent(new CustomEvent('walletUpdated', { detail: _wallet })); } catch(_){}
    } catch(e){
      console.warn('[Wallet] refresh:', e.message);
    } finally {
      _inflight = false;
    }
    return _wallet;
  }

  /* ───── Claim bonus (100k/ngày) ───── */
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
        renderAll();
        try { window.dispatchEvent(new CustomEvent('walletUpdated', { detail: _wallet })); } catch(_){}
        try {
          if (window.Toast && window.Toast.show){
            window.Toast.show('💰 +100.000đ bonus checklist', { type: 'success', duration: 3600 });
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

/* Landing — ví dưới lock note */
.landing-wallet {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin-top: 10px !important;
  margin-bottom: 6px !important;
  padding: 7px 16px !important;
  background: linear-gradient(135deg, #fff8e6, #ffe9b8) !important;
  border: 1.5px solid #ffd88a !important;
  border-radius: 999px !important;
  font-size: 15px !important;
  font-weight: 950 !important;
  color: #5a3a00 !important;
  font-variant-numeric: tabular-nums !important;
  box-shadow: 0 4px 14px -5px rgba(232, 165, 60, .55) !important;
  white-space: nowrap !important;
  letter-spacing: .01em !important;
  animation: lwIn .4s cubic-bezier(.2,.9,.3,1.4) !important;
  pointer-events: none !important;
  position: relative !important;
  z-index: 1 !important;
}
.landing-wallet .lw-amount { font-weight: 950 !important; }
.landing-wallet .lw-icon {
  font-size: 17px !important;
  filter: drop-shadow(0 2px 4px rgba(232, 165, 60, .4)) !important;
}
.landing-wallet.wallet-low {
  background: linear-gradient(135deg, #fff0f0, #ffd9d9) !important;
  border-color: #ffb8b8 !important;
  color: #b8434e !important;
  animation: lwIn .4s cubic-bezier(.2,.9,.3,1.4), walletPulseWarn 1.8s ease-in-out infinite !important;
}
@keyframes lwIn {
  0%   { transform: scale(.6); opacity: 0; }
  60%  { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .landing-wallet, .landing-wallet.wallet-low { animation: none !important; }
}

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
     UI — menu user card
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
     UI — landing (dưới lock note)
     ═══════════════════════════════════════════════════════════════ */
  function injectLandingWallet(){
    const q = $('question');
    if (!q) return null;

    const uname = getUsername();
    if (!uname){
      const old = q.querySelector('#landingWallet');
      if (old) old.remove();
      return null;
    }

    let el = q.querySelector('#landingWallet');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'landingWallet';
    el.className = 'landing-wallet';

    /* Ưu tiên chèn sau .landing-lock-note, fallback sau .landing-cta */
    const lockNote = q.querySelector('.landing-lock-note');
    const cta = q.querySelector('.landing-cta');
    const anchor = lockNote || cta;

    if (anchor && anchor.parentNode === q){
      anchor.insertAdjacentElement('afterend', el);
    } else {
      q.appendChild(el);
    }
    return el;
  }

  function renderLanding(){
    const el = injectLandingWallet();
    if (!el) return;
    const bal = _wallet.balance || 0;
    el.innerHTML = `<span class="lw-amount">${h(formatMoneyBare(bal))}</span> <span class="lw-icon">💰</span>`;
    el.classList.toggle('wallet-low', bal < 100000);
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
      if (!q.querySelector('#landingWallet')) renderLanding();
    });
    _landingObserver.observe(q, { childList: true, subtree: false });
    /* Inject lần đầu */
    renderLanding();
  }

  function renderAll(){
    renderMenu();
    renderLanding();
  }

  /* ═══════════════════════════════════════════════════════════════
     HOOKS
     ═══════════════════════════════════════════════════════════════ */
  window.addEventListener('checkinDone', function(){
    setTimeout(function(){ claimBonus(); }, 500);
  });

  try {
    Auth.onChange(function(u){
      if (u) setTimeout(refresh, 400);
      else {
        _wallet = { username: '', balance: 0, lastBonusDate: null };
        renderAll();
      }
    });
  } catch(_){}

  setInterval(function(){
    if (document.hidden) return;
    if (!Auth.getCurrentUser?.()) return;
    refresh();
  }, 30000);

  /* ═══════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════ */
  function init(){
    injectCss();
    if (Auth.getCurrentUser?.()) setTimeout(refresh, 400);

    /* Menu wallet — retry phòng khi menu DOM chưa có */
    [1500, 3000].forEach(t => setTimeout(function(){
      injectMenuWallet();
      renderMenu();
    }, t));

    /* Landing wallet — retry + observer */
    [800, 1500, 3000].forEach(t => setTimeout(function(){
      renderLanding();
    }, t));
    setupLandingObserver();

    console.log('[Wallet] ready ✓ v1.1.0');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SRank = window.SRank || {};
  window.SRank.Wallet = {
    get,
    getBalance,
    refresh,
    claimBonus,
    formatMoney,
    formatDelta
  };
})();