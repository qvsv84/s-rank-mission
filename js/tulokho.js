/* ═══════════════════════════════════════════════════════════════
   TÚ LƠ KHƠ (TIẾN LÊN MIỀN NAM) — v1.2.0
   - Full-screen layout
   - Hand wrap (không overlap), lá to
   - Table history (bài lượt cũ mờ)
   - Smart select: click lá → cycle combo (pair → straight → single → clear)
   - Fix: tạo/join phòng vào ngay (bug đứng im)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.SRank && window.SRank.Tulokho) return;

  const Auth = window.SRank && window.SRank.Auth;
  if (!Auth) { console.warn('[Tulokho] SRank.Auth chưa load'); return; }

  /* ───── constants ───── */
  const ROOM_KEY = 'srank_card_room_v1';
  const POLL_MS = 2500;
  const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const SUITS = ['♠','♣','♦','♥'];

  const ANGT_STATUS_LABEL = {
    sanh_rong: 'Sảnh rồng 3→2',
    '5_doi_thong': '5 đôi thông',
    '6_doi': '6 đôi bất kỳ',
    tu_quy_2: 'Tứ quý 2',
    '4con2_sam': '4 con 2 + sám',
    cung_mau: '13 lá cùng màu',
    '3_sam': '3 sám cô',
    het_bai: 'Hết bài'
  };

  /* ───── state ───── */
  let _room = null;
  let _myName = '';
  let _selected = new Set();
  let _channel = null;
  let _pollTimer = null;
  let _isOpen = false;
  let _busy = false;
  let _lastErrorAt = 0;

  // Table history
  let _lastTable = [];
  let _lastTableOwner = '';
  let _lastTableStr = '';
  let _prevTable = [];
  let _prevTableOwner = '';

  // Smart select
  let _lastClickCard = null;
  let _lastClickMode = -1;

  /* ───── utils ───── */
  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function cardRank(c){ return Math.floor(c / 4); }
  function cardSuit(c){ return c % 4; }
  function isRed(c){ return cardSuit(c) >= 2; }
  function cardValue(c){ return cardRank(c) * 4 + cardSuit(c); }
  function sortAsc(a, b){ return cardValue(a) - cardValue(b); }

  function getUsername(){
    try { const u = Auth.getCurrentUser?.(); return String(u?.username || '').trim().toLowerCase(); }
    catch(_){ return ''; }
  }
  function displayUser(uname){
    if (!uname) return '';
    const d = window.DN ? window.DN(uname) : uname;
    return d || uname;
  }
  function getAvatarUrl(name){
    try { return window.getAvatarUrl ? window.getAvatarUrl(name) : ''; }
    catch(_){ return ''; }
  }
  function toast(msg, opts){
    try {
      if (window.Toast && window.Toast.show) window.Toast.show(msg, opts || { type: 'info', duration: 3200 });
    } catch(_){}
  }
  function toastError(msg){
    const now = Date.now();
    if (now - _lastErrorAt < 800) return;
    _lastErrorAt = now;
    toast(msg, { type: 'error', duration: 3500 });
  }

  /* ───── combo logic ───── */
  function comboType(cards){
    const n = cards.length;
    if (!n) return null;
    const ranks = cards.map(cardRank).sort((a, b) => a - b);
    if (n === 1) return 'single';
    if (n === 2) return ranks[0] === ranks[1] ? 'pair' : null;
    if (n === 3){
      if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 'triple';
      if (ranks[1] === ranks[0]+1 && ranks[2] === ranks[1]+1 && ranks[2] < 12) return 'straight';
      return null;
    }
    if (n === 4) return ranks[0] === ranks[3] ? 'quad' : null;
    if (n === 6){
      if (ranks[0]===ranks[1] && ranks[2]===ranks[3] && ranks[4]===ranks[5]
          && ranks[2]===ranks[0]+1 && ranks[4]===ranks[2]+1 && ranks[4]<12) return '3straight';
      let ok = true;
      for (let i = 1; i < 6; i++) if (ranks[i] !== ranks[i-1]+1){ ok = false; break; }
      if (ok && ranks[5] < 12) return 'straight';
      return null;
    }
    if (n === 8){
      if (ranks[0]===ranks[1] && ranks[2]===ranks[3] && ranks[4]===ranks[5] && ranks[6]===ranks[7]
          && ranks[2]===ranks[0]+1 && ranks[4]===ranks[2]+1 && ranks[6]===ranks[4]+1 && ranks[6]<12) return '4straight';
      return null;
    }
    if (n >= 5){
      let ok = true;
      for (let i = 1; i < n; i++) if (ranks[i] !== ranks[i-1]+1){ ok = false; break; }
      if (ok && ranks[n-1] < 12) return 'straight';
    }
    return null;
  }

  function comboBeats(newCards, newType, oldCards, oldType){
    if (!oldCards || !oldCards.length) return true;
    const nn = newCards.length, on = oldCards.length;
    if (newType === oldType && nn === on){
      const nt = Math.max(...newCards.map(cardValue));
      const ot = Math.max(...oldCards.map(cardValue));
      return nt > ot;
    }
    if (newType === 'quad' && oldType === 'single' && cardRank(oldCards[0]) === 12) return true;
    if (newType === 'quad' && oldType === 'quad') return cardRank(newCards[0]) > cardRank(oldCards[0]);
    if (newType === '3straight' && oldType === 'single' && cardRank(oldCards[0]) === 12) return true;
    if (newType === '3straight' && oldType === '3straight'){
      return Math.max(...newCards.map(cardRank)) > Math.max(...oldCards.map(cardRank));
    }
    if (newType === '4straight' && oldType === 'pair' && cardRank(oldCards[0]) === 12) return true;
    if (newType === '4straight' && oldType === 'quad') return true;
    if (newType === '4straight' && oldType === '3straight') return true;
    if (newType === '4straight' && oldType === '4straight'){
      return Math.max(...newCards.map(cardRank)) > Math.max(...oldCards.map(cardRank));
    }
    return false;
  }

  function comboLabel(t){
    return ({
      single: '1 lá',
      pair: 'Đôi',
      triple: 'Sám cô',
      straight: 'Sảnh',
      quad: 'Tứ quý',
      '3straight': '3 đôi thông',
      '4straight': '4 đôi thông'
    })[t] || t;
  }

  /* ───── SMART SELECT: tìm các combo chứa clickedCard ───── */
  function getCandidates(clickedCard, hand){
    const result = [];
    const clickedRank = cardRank(clickedCard);

    // Map rank → cards
    const rankToCards = new Map();
    hand.forEach(c => {
      const r = cardRank(c);
      if (!rankToCards.has(r)) rankToCards.set(r, []);
      rankToCards.get(r).push(c);
    });
    rankToCards.forEach(arr => arr.sort(sortAsc));

    // 1. Group cùng rank: pair → triple → quad
    const sameRankRaw = (rankToCards.get(clickedRank) || []).slice();
    // Đảm bảo clickedCard ở đầu
    const sameRank = [clickedCard, ...sameRankRaw.filter(c => c !== clickedCard)];
    if (sameRank.length >= 2) result.push(sameRank.slice(0, 2));
    if (sameRank.length >= 3) result.push(sameRank.slice(0, 3));
    if (sameRank.length >= 4) result.push(sameRank.slice(0, 4));

    // 2. Straight: len 3..N, không chứa 2 (rank 12)
    for (let len = 3; len <= 12; len++){
      for (let start = Math.max(0, clickedRank - len + 1);
           start <= Math.min(clickedRank, 12 - len);
           start++){
        const end = start + len - 1;
        if (end >= 12) continue;
        let ok = true;
        const combo = [];
        for (let r = start; r <= end; r++){
          const cards = rankToCards.get(r);
          if (!cards || !cards.length){ ok = false; break; }
          combo.push(r === clickedRank ? clickedCard : cards[0]);
        }
        if (ok) result.push(combo);
      }
    }

    // 3. 3 đôi thông: 3 cặp liên tiếp, không chứa 2
    if (sameRank.length >= 2){
      for (let start = Math.max(0, clickedRank - 2);
           start <= Math.min(clickedRank, 12 - 3);
           start++){
        const end = start + 2;
        if (end >= 12) continue;
        let ok = true;
        const combo = [];
        for (let r = start; r <= end; r++){
          const cards = rankToCards.get(r);
          if (!cards || cards.length < 2){ ok = false; break; }
          if (r === clickedRank) combo.push(...sameRank.slice(0, 2));
          else combo.push(cards[0], cards[1]);
        }
        if (ok) result.push(combo);
      }
    }

    // 4. 4 đôi thông
    if (sameRank.length >= 2){
      for (let start = Math.max(0, clickedRank - 3);
           start <= Math.min(clickedRank, 12 - 4);
           start++){
        const end = start + 3;
        if (end >= 12) continue;
        let ok = true;
        const combo = [];
        for (let r = start; r <= end; r++){
          const cards = rankToCards.get(r);
          if (!cards || cards.length < 2){ ok = false; break; }
          if (r === clickedRank) combo.push(...sameRank.slice(0, 2));
          else combo.push(cards[0], cards[1]);
        }
        if (ok) result.push(combo);
      }
    }

    // 5. Single
    result.push([clickedCard]);

    // Dedup
    const seen = new Set();
    const unique = [];
    result.forEach(combo => {
      const key = combo.slice().sort(sortAsc).join(',');
      if (!seen.has(key)){ seen.add(key); unique.push(combo); }
    });
    return unique;
  }

  /* ───── RPC ───── */
  async function callRpc(fn, params){
    const sb = window.__sb;
    if (!sb || !sb.rpc) throw new Error('Chưa kết nối máy chủ');
    const { data, error } = await sb.rpc(fn, params);
    if (error) throw new Error(error.message || 'Lỗi mạng');
    if (data && data.ok === false) throw new Error(data.error || 'Lỗi không xác định');
    return data;
  }

  /* ───── localStorage ───── */
  function saveRoomCode(code){
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code, name: _myName, at: Date.now() })); } catch(_){}
  }
  function loadRoomCode(){
    try {
      const raw = localStorage.getItem(ROOM_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.code) return null;
      return obj;
    } catch(_){ return null; }
  }
  function clearRoomCode(){
    try { localStorage.removeItem(ROOM_KEY); } catch(_){}
  }

  /* ───── DOM INJECT ───── */
  function injectDom(){
    if ($('tulokhoOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'tulokhoOverlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = `
      <section id="tlkPanel" role="dialog" aria-modal="true">
        <header id="tlkHead">
          <div id="tlkHeadTitle"><span class="tlk-head-icon">🃏</span><span>Tú lơ khơ</span></div>
          <button id="tlkClose" type="button" aria-label="Đóng">×</button>
        </header>
        <div id="tlkBody">
          <div class="tlk-view" data-view="menu">
            <div class="tlk-menu">
              <div class="tlk-menu-icon">🃏</div>
              <div class="tlk-menu-title">Tú lơ khơ</div>
              <div class="tlk-menu-sub">Tiến lên miền Nam • 2-4 người</div>
              <button class="tlk-btn primary" data-action="create" type="button">🎲 Tạo phòng</button>
              <button class="tlk-btn" data-action="show-join" type="button">🔗 Vào phòng</button>
            </div>
          </div>
          <div class="tlk-view" data-view="join" hidden>
            <div class="tlk-join">
              <div class="tlk-join-title">🔗 Nhập mã phòng</div>
              <div class="tlk-join-sub">Hỏi chủ phòng mã 6 ký tự</div>
              <input id="tlkJoinInput" type="text" maxlength="6" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="A1B2C3">
              <button class="tlk-btn primary" data-action="join" type="button">Vào phòng</button>
              <button class="tlk-btn" data-action="back-menu" type="button">← Quay lại</button>
            </div>
          </div>
          <div class="tlk-view" data-view="waiting" hidden>
            <div class="tlk-waiting">
              <div class="tlk-code-wrap">
                <div class="tlk-code-label">Mã phòng</div>
                <div id="tlkCode" class="tlk-code">------</div>
                <button class="tlk-copy-btn" data-action="copy-code" type="button">📋 Copy</button>
              </div>
              <div class="tlk-players-label">Người chơi <span id="tlkPlayerCount">0/4</span></div>
              <div id="tlkPlayers" class="tlk-players"></div>
              <div class="tlk-actions">
                <button class="tlk-btn" data-action="toggle-ready" id="tlkReadyBtn" type="button">Sẵn sàng</button>
                <button class="tlk-btn primary" data-action="start" id="tlkStartBtn" type="button" hidden>▶ Bắt đầu</button>
                <button class="tlk-btn danger" data-action="leave" type="button">Rời phòng</button>
              </div>
            </div>
          </div>
          <div class="tlk-view" data-view="playing" hidden>
            <div class="tlk-play">
              <div id="tlkOppTop" class="tlk-opp-slot top" hidden></div>
              <div id="tlkOppLeft" class="tlk-opp-slot left" hidden></div>
              <div id="tlkOppRight" class="tlk-opp-slot right" hidden></div>

              <div class="tlk-play-center">
                <div id="tlkTableHistory" class="tlk-table-history"></div>
                <div id="tlkTableCurrent" class="tlk-table-cards"></div>
                <div id="tlkTableCombo" class="tlk-table-combo-label" hidden></div>
              </div>

              <div class="tlk-play-me">
                <div id="tlkMyStatus" class="tlk-my-status"></div>
                <div id="tlkMyHand" class="tlk-my-hand"></div>
              </div>

              <div class="tlk-play-actions">
                <button class="tlk-btn small danger" data-action="leave" type="button">Rời</button>
                <button class="tlk-btn small" data-action="pass" id="tlkPassBtn" type="button">Bỏ lượt</button>
                <button class="tlk-btn primary small" data-action="play" id="tlkPlayBtn" type="button">Đánh bài</button>
              </div>
            </div>
          </div>
          <div class="tlk-view" data-view="finished" hidden>
            <div class="tlk-finished">
              <div class="tlk-trophy">🏆</div>
              <div class="tlk-winner-label">Người thắng</div>
              <div id="tlkWinnerName" class="tlk-winner-name">—</div>
              <div id="tlkWinnerReason" class="tlk-winner-reason"></div>
              <div class="tlk-actions">
                <button class="tlk-btn primary" data-action="rematch" id="tlkRematchBtn" type="button" hidden>🎲 Chơi lại</button>
                <button class="tlk-btn" data-action="back-waiting" type="button">Về phòng chờ</button>
                <button class="tlk-btn danger" data-action="leave" type="button">Rời phòng</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(ov);
  }

  /* ───── MENU INJECT ───── */
  function injectMenuItem(){
    if ($('tulokhoMenuBtn')) return;
    const menuInner = $('menuOverlayInner');
    if (!menuInner) return;
    const sections = menuInner.querySelectorAll('.menu-section');
    if (!sections.length) return;
    const lastGrid = sections[sections.length - 1].querySelector('.menu-grid');
    if (!lastGrid) return;

    const btn = document.createElement('button');
    btn.id = 'tulokhoMenuBtn';
    btn.className = 'menu-item';
    btn.type = 'button';
    btn.innerHTML = '<span class="menu-item-icon">🃏</span><span class="menu-item-label">Tú lơ khơ</span>';
    btn.addEventListener('click', function (e){
      e.preventDefault();
      e.stopPropagation();
      closeMainMenu();
      setTimeout(function(){ open(); }, 180);
    });
    lastGrid.appendChild(btn);
  }

  function closeMainMenu(){
    const menuOv = $('menuOverlay');
    const menuBtn = $('menuToggle');
    if (menuOv){
      menuOv.classList.remove('open');
      menuOv.setAttribute('aria-hidden', 'true');
    }
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }

  /* ───── CARD RENDER ───── */
  function cardEl(c, opts){
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'tlk-card' + (isRed(c) ? ' red' : ' black');
    if (opts.selected) el.classList.add('selected');
    if (opts.small) el.classList.add('small');
    if (opts.back) el.classList.add('back');
    if (opts.dataCard) el.dataset.card = String(c);
    el.innerHTML = opts.back
      ? '<span class="tlk-card-back">🐱</span>'
      : `<span class="tlk-card-rank">${RANKS[cardRank(c)]}</span><span class="tlk-card-suit">${SUITS[cardSuit(c)]}</span>`;
    return el;
  }

  /* ───── VIEW SWITCH ───── */
  function showView(name){
    document.querySelectorAll('#tlkBody .tlk-view').forEach(v => {
      v.hidden = v.dataset.view !== name;
    });
  }

  /* ───── RENDER ───── */
  function render(){
    if (!_room){ showView('menu'); return; }
    const st = _room.status;
    if (st === 'waiting') { renderWaiting(); showView('waiting'); }
    else if (st === 'playing') { renderPlaying(); showView('playing'); }
    else if (st === 'finished') { renderFinished(); showView('finished'); }
    else showView('menu');
  }

  function renderWaiting(){
    if (!_room) return;
    $('tlkCode').textContent = _room.code || '------';
    const players = _room.players || [];
    $('tlkPlayerCount').textContent = players.length + '/4';

    const hostName = _room.host || '';
    const me = players.find(p => p.name === _myName);
    const allReady = players.length >= 2 && players.every(p => p.ready === true);
    const isHost = _myName && hostName && _myName === hostName;

    const list = $('tlkPlayers');
    list.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'tlk-player-row';
      const isYou = p.name === _myName;
      const isHostRow = p.name === hostName;
      row.innerHTML = `
        <div class="tlk-player-slot">${i + 1}</div>
        <div class="tlk-player-name">${h(displayUser(p.name))}${isYou ? ' <span class="tlk-you">(bạn)</span>' : ''}${isHostRow ? ' <span class="tlk-host">👑 host</span>' : ''}</div>
        <div class="tlk-player-status ${p.ready ? 'ready' : 'waiting'}">${p.ready ? '✓ Sẵn sàng' : '⋯ Chờ'}</div>
      `;
      list.appendChild(row);
    });

    const readyBtn = $('tlkReadyBtn');
    if (me){
      readyBtn.hidden = false;
      readyBtn.textContent = me.ready ? '✓ Đã sẵn sàng — bấm để huỷ' : '✋ Sẵn sàng';
      readyBtn.classList.toggle('active', me.ready === true);
    } else {
      readyBtn.hidden = true;
    }

    const startBtn = $('tlkStartBtn');
    if (isHost){
      startBtn.hidden = false;
      startBtn.disabled = !allReady;
      startBtn.textContent = allReady ? '▶ Bắt đầu' : '⏳ Chờ mọi người sẵn sàng';
    } else {
      startBtn.hidden = true;
    }
  }

  function renderPlaying(){
    if (!_room) return;
    const players = _room.players || [];
    const me = players.find(p => p.name === _myName);
    const myHand = me && Array.isArray(me.hand) ? me.hand.slice().sort(sortAsc) : [];
    const turn = _room.turn;
    const isMyTurn = turn != null && me && turn === me.order;
    const table = _room.table || [];
    const tableType = _room.tableType;
    const tableOwner = _room.tableOwner;

    /* ─ Track prev table ─ */
    const sortedTable = table.slice().sort(sortAsc);
    const tableStr = JSON.stringify(sortedTable);
    if (_lastTableStr !== '' && _lastTableStr !== tableStr){
      if (_lastTable.length > 0 && sortedTable.length > 0){
        _prevTable = _lastTable.slice();
        _prevTableOwner = _lastTableOwner;
      } else if (sortedTable.length === 0){
        _prevTable = [];
        _prevTableOwner = '';
      }
    }
    _lastTable = sortedTable.slice();
    _lastTableOwner = tableOwner || '';
    _lastTableStr = tableStr;

    /* ─ Opponents ─ */
    const opps = players.filter(p => p.name !== _myName).sort((a, b) => a.order - b.order);
    const slotIds = { top: $('tlkOppTop'), left: $('tlkOppLeft'), right: $('tlkOppRight') };
    ['top', 'left', 'right'].forEach(k => { if (slotIds[k]) slotIds[k].hidden = true; });

    let positions = [];
    if (opps.length === 1) positions = ['top'];
    else if (opps.length === 2) positions = ['top', 'left'];
    else if (opps.length === 3) positions = ['top', 'left', 'right'];

    opps.forEach((p, i) => {
      const slot = slotIds[positions[i]];
      if (!slot) return;
      slot.hidden = false;
      slot.classList.toggle('active', turn === p.order);
      const cnt = p.cardCount != null ? p.cardCount : (Array.isArray(p.hand) ? p.hand.length : '?');
      const du = displayUser(p.name) || '?';
      const initial = du.trim().slice(0, 1).toUpperCase();
      const av = getAvatarUrl(p.name);
      const avHtml = av
        ? `<img src="${h(av)}" alt="" onerror="this.style.display='none';this.parentNode.textContent='${h(initial)}'">`
        : h(initial);
      slot.innerHTML = `
        <div class="tlk-opp-avatar">${avHtml}</div>
        <div class="tlk-opp-name" title="${h(du)}">${h(du)}</div>
        <div class="tlk-opp-cards"><span class="tlk-opp-cards-icon"></span>${cnt}</div>
      `;
    });

    /* ─ Table history ─ */
    const histBox = $('tlkTableHistory');
    histBox.innerHTML = '';
    if (_prevTable.length > 0){
      const label = document.createElement('div');
      label.className = 'tlk-table-prev-label';
      label.textContent = (displayUser(_prevTableOwner) || '?') + ' (lượt trước)';
      histBox.appendChild(label);
      const wrap = document.createElement('div');
      wrap.className = 'tlk-table-cards prev';
      _prevTable.forEach(c => wrap.appendChild(cardEl(c, { small: true })));
      histBox.appendChild(wrap);
    }

    /* ─ Table current ─ */
    const curBox = $('tlkTableCurrent');
    curBox.innerHTML = '';
    if (sortedTable.length > 0){
      sortedTable.forEach(c => curBox.appendChild(cardEl(c, { small: true })));
    } else {
      const empty = document.createElement('div');
      empty.className = 'tlk-table-empty';
      empty.textContent = 'Chưa có bài — mở vòng mới';
      curBox.appendChild(empty);
    }

    /* ─ Combo label ─ */
    const comboEl = $('tlkTableCombo');
    if (tableType && sortedTable.length > 0){
      comboEl.hidden = false;
      comboEl.textContent = comboLabel(tableType);
    } else {
      comboEl.hidden = true;
    }

    /* ─ My status ─ */
    const status = $('tlkMyStatus');
    status.innerHTML = '';
    if (isMyTurn){
      status.innerHTML = '<span class="tlk-status-tag turn">🎯 Lượt bạn</span>';
    } else if (turn != null){
      const curr = players.find(p => p.order === turn);
      status.innerHTML = `<span class="tlk-status-tag">⏳ ${h(displayUser(curr ? curr.name : '?'))}</span>`;
    }

    /* ─ Hint combo đã chọn ─ */
    const selectedCards = myHand.filter(c => _selected.has(c));
    if (selectedCards.length){
      const t = comboType(selectedCards);
      const label = t ? comboLabel(t) : 'Bộ không hợp lệ';
      status.insertAdjacentHTML('beforeend', ` <span class="tlk-status-hint">${h(label)}</span>`);
    }

    /* ─ My hand ─ */
    const handBox = $('tlkMyHand');
    handBox.innerHTML = '';
    myHand.forEach(c => {
      const el = cardEl(c, { selected: _selected.has(c), dataCard: true });
      el.addEventListener('click', function (){ onCardClick(c, myHand); });
      handBox.appendChild(el);
    });

    /* ─ Buttons ─ */
    const playBtn = $('tlkPlayBtn');
    const passBtn = $('tlkPassBtn');
    playBtn.disabled = !isMyTurn || _selected.size === 0 || !isValidSelection(myHand, sortedTable, tableType) || _busy;
    passBtn.disabled = !isMyTurn || sortedTable.length === 0 || tableOwner === _myName || _busy;
  }

  /* ───── SMART SELECT HANDLER ───── */
  function onCardClick(clickedCard, myHand){
    if (_busy) return;

    // Xác định mode kế tiếp
    if (clickedCard === _lastClickCard){
      _lastClickMode += 1;
    } else {
      _lastClickCard = clickedCard;
      _lastClickMode = 0;
    }

    const candidates = getCandidates(clickedCard, myHand);
    if (!candidates.length) return;

    // Vượt quá → clear hết
    if (_lastClickMode >= candidates.length){
      _selected.clear();
      _lastClickMode = -1;
      renderPlaying();
      return;
    }

    const combo = candidates[_lastClickMode];
    _selected.clear();
    combo.forEach(c => _selected.add(c));
    renderPlaying();
  }

  function isValidSelection(myHand, table, tableType){
    const cards = myHand.filter(c => _selected.has(c));
    if (!cards.length) return false;
    const t = comboType(cards);
    if (!t) return false;
    if (!table || !table.length) return true;
    return comboBeats(cards, t, table, tableType);
  }

  function renderFinished(){
    if (!_room) return;
    const w = _room.winner || '';
    const wt = _room.winnerType || '';
    $('tlkWinnerName').textContent = displayUser(w) || '—';
    $('tlkWinnerReason').textContent = wt ? (ANGT_STATUS_LABEL[wt] || wt) : '';
    const isHost = _myName && _room.host && _myName === _room.host;
    $('tlkRematchBtn').hidden = !isHost;
  }

  /* ───── ACTIONS ───── */
  function resetSelectionState(){
    _selected.clear();
    _lastClickCard = null;
    _lastClickMode = -1;
  }

  async function actCreate(){
    if (_busy) return; _busy = true;
    try {
      const data = await callRpc('rpc_card_create', { p_name: _myName });
      const code = data.data?.code;
      if (!code) throw new Error('Không tạo được phòng');
      saveRoomCode(code);
      // ⭐ FIX: gán _room trước khi fetchState
      _room = { code, status: 'waiting', version: 0, players: [] };
      subscribeRoom(code);
      await fetchState();
      toast('Đã tạo phòng ' + code, { type: 'success', duration: 2600 });
    } catch (e){
      toastError('Tạo phòng lỗi: ' + e.message);
    } finally { _busy = false; }
  }

  async function actJoin(){
    if (_busy) return;
    const inp = $('tlkJoinInput');
    const code = String(inp.value || '').trim().toUpperCase();
    if (!code || code.length < 4){
      toastError('Mã phòng không hợp lệ');
      return;
    }
    _busy = true;
    try {
      await callRpc('rpc_card_join', { p_code: code, p_name: _myName });
      saveRoomCode(code);
      // ⭐ FIX: gán _room trước khi fetchState
      _room = { code, status: 'waiting', version: 0, players: [] };
      subscribeRoom(code);
      await fetchState();
      toast('Đã vào phòng ' + code, { type: 'success', duration: 2600 });
    } catch (e){
      toastError('Vào phòng lỗi: ' + e.message);
    } finally { _busy = false; }
  }

  async function actToggleReady(){
    if (_busy || !_room) return;
    const me = (_room.players || []).find(p => p.name === _myName);
    if (!me) return;
    _busy = true;
    try {
      await callRpc('rpc_card_ready', { p_code: _room.code, p_name: _myName, p_ready: !me.ready });
      await fetchState();
    } catch (e){ toastError(e.message); }
    finally { _busy = false; }
  }

  async function actStart(){
    if (_busy || !_room) return;
    _busy = true;
    try {
      const r = await callRpc('rpc_card_start', { p_code: _room.code, p_name: _myName });
      resetSelectionState();
      _prevTable = []; _prevTableOwner = ''; _lastTable = []; _lastTableOwner = ''; _lastTableStr = '';
      await fetchState();
      if (r?.data?.winner){
        toast('🎉 Ăn trắng! ' + displayUser(r.data.winner), { type: 'success', duration: 4200 });
      }
    } catch (e){ toastError(e.message); }
    finally { _busy = false; }
  }

  async function actPlay(){
    if (_busy || !_room) return;
    const me = (_room.players || []).find(p => p.name === _myName);
    if (!me) return;
    const cards = (me.hand || []).filter(c => _selected.has(c));
    if (!cards.length){ toastError('Chưa chọn lá nào'); return; }
    _busy = true;
    try {
      const r = await callRpc('rpc_card_play', { p_code: _room.code, p_name: _myName, p_cards: cards });
      resetSelectionState();
      await fetchState();
      if (r?.data?.winner){
        toast('🏆 ' + displayUser(r.data.winner) + ' thắng!', { type: 'success', duration: 4200 });
      }
    } catch (e){ toastError(e.message); }
    finally { _busy = false; }
  }

  async function actPass(){
    if (_busy || !_room) return;
    _busy = true;
    try {
      resetSelectionState();
      await callRpc('rpc_card_pass', { p_code: _room.code, p_name: _myName });
      await fetchState();
    } catch (e){ toastError(e.message); }
    finally { _busy = false; }
  }

  async function actLeave(){
    if (!_room){ closeRoom(); return; }
    if (!confirm('Rời phòng? Bạn sẽ mất bài đang chơi.')) return;
    if (_busy) return;
    _busy = true;
    try {
      await callRpc('rpc_card_leave', { p_code: _room.code, p_name: _myName });
    } catch (e){
      console.warn('[Tulokho] leave:', e.message);
    } finally {
      _busy = false;
      closeRoom();
    }
  }

  async function actRematch(){
    if (_busy || !_room) return;
    _busy = true;
    try {
      const r = await callRpc('rpc_card_start', { p_code: _room.code, p_name: _myName });
      resetSelectionState();
      _prevTable = []; _prevTableOwner = ''; _lastTable = []; _lastTableOwner = ''; _lastTableStr = '';
      await fetchState();
      if (r?.data?.winner){
        toast('🎉 Ăn trắng! ' + displayUser(r.data.winner), { type: 'success', duration: 4200 });
      }
    } catch (e){ toastError(e.message); }
    finally { _busy = false; }
  }

  async function actBackWaiting(){
    if (!_room) return;
    await fetchState();
  }

  function actCopyCode(){
    if (!_room) return;
    const txt = _room.code || '';
    if (!txt) return;
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(
        () => toast('Đã copy mã phòng', { type: 'success', duration: 2000 }),
        () => toastError('Không copy được')
      );
    } else {
      toastError('Trình duyệt chưa hỗ trợ copy');
    }
  }

  /* ───── ROOM LIFE CYCLE ───── */
  function closeRoom(){
    unsubscribeRoom();
    clearRoomCode();
    _room = null;
    resetSelectionState();
    _prevTable = []; _prevTableOwner = ''; _lastTable = []; _lastTableOwner = ''; _lastTableStr = '';
    render();
  }

  async function fetchState(){
    if (!_room) return;
    try {
      const data = await callRpc('rpc_card_state', { p_code: _room.code, p_name: _myName });
      const st = data.data;
      if (!st) return;
      const prevVersion = _room.version || 0;
      const newVersion = st.version || 0;
      if (newVersion < prevVersion) return;
      const statusChanged = _room.status !== st.status;
      _room = st;
      render();
      if (statusChanged && st.status === 'playing'){
        resetSelectionState();
      }
      if (statusChanged && st.status === 'finished'){
        resetSelectionState();
        if (st.winner){
          toast('🏆 ' + displayUser(st.winner) + ' thắng!', { type: 'success', duration: 4200 });
        }
      }
    } catch (e){
      if (/không tìm thấy/i.test(e.message)){
        closeRoom();
      } else {
        console.warn('[Tulokho] fetch:', e.message);
      }
    }
  }

  /* ───── REALTIME + POLL ───── */
  function subscribeRoom(code){
    unsubscribeRoom();
    if (!code) return;
    const sb = window.__sb;
    if (!sb || !sb.channel) return;
    try {
      _channel = sb.channel('tlk_' + code)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'card_room',
          filter: 'code=eq.' + code
        }, function (){ fetchState(); })
        .subscribe();
    } catch (e){
      console.warn('[Tulokho] realtime fail:', e);
    }
  }
  function unsubscribeRoom(){
    if (_channel){
      try { _channel.unsubscribe(); } catch(_){}
      _channel = null;
    }
  }
  function startPoll(){
    stopPoll();
    _pollTimer = setInterval(function (){
      if (document.hidden) return;
      if (!_isOpen) return;
      if (_room) fetchState();
    }, POLL_MS);
  }
  function stopPoll(){
    if (_pollTimer){ clearInterval(_pollTimer); _pollTimer = null; }
  }

  /* ───── OPEN / CLOSE ───── */
  function open(){
    injectDom();
    _myName = getUsername();
    if (!_myName){
      toastError('Bạn cần đăng nhập trước');
      return;
    }
    const ov = $('tulokhoOverlay');
    if (!ov) return;
    _isOpen = true;
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tlk-open');

    const saved = loadRoomCode();
    if (saved && saved.name === _myName){
      _room = { code: saved.code, status: 'waiting', version: 0, players: [] };
      subscribeRoom(saved.code);
      fetchState();
      showView('waiting');
    } else {
      render();
    }
    startPoll();
  }

  function close(){
    const ov = $('tulokhoOverlay');
    if (!ov) return;
    _isOpen = false;
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tlk-open');
    stopPoll();
    if (!_room) unsubscribeRoom();
  }

  /* ───── EVENTS ───── */
  function handleClick(e){
    const t = e.target.closest('[data-action]');
    if (!t) return;
    e.preventDefault();
    const a = t.dataset.action;
    if (a === 'create') actCreate();
    else if (a === 'show-join'){ $('tlkJoinInput').value = ''; showView('join'); setTimeout(() => $('tlkJoinInput')?.focus(), 80); }
    else if (a === 'join') actJoin();
    else if (a === 'back-menu') showView('menu');
    else if (a === 'copy-code') actCopyCode();
    else if (a === 'toggle-ready') actToggleReady();
    else if (a === 'start') actStart();
    else if (a === 'play') actPlay();
    else if (a === 'pass') actPass();
    else if (a === 'leave') actLeave();
    else if (a === 'rematch') actRematch();
    else if (a === 'back-waiting') actBackWaiting();
  }

  function handleKeydownCapture(e){
    if (e.key !== 'Escape') return;
    const ov = $('tulokhoOverlay');
    if (!ov || !ov.classList.contains('show')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    close();
  }

  function handleJoinInputKey(e){
    if (e.key === 'Enter'){ e.preventDefault(); actJoin(); }
    else if (e.key === 'Escape'){ e.preventDefault(); showView('menu'); }
  }

  function handleVisibility(){
    if (document.hidden) return;
    if (_isOpen && _room) fetchState();
  }

  /* ───── INIT ───── */
  function init(){
    injectDom();
    setTimeout(injectMenuItem, 400);
    setTimeout(injectMenuItem, 1500);

    const ov = $('tulokhoOverlay');
    if (ov){
      ov.addEventListener('click', function (e){ if (e.target === ov) close(); });
      ov.addEventListener('click', handleClick);
    }
    const closeBtn = $('tlkClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const joinInput = $('tlkJoinInput');
    if (joinInput){
      joinInput.addEventListener('keydown', handleJoinInputKey);
      joinInput.addEventListener('input', function (){
        this.value = String(this.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      });
    }

    document.addEventListener('keydown', handleKeydownCapture, true);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    console.log('[Tulokho] ready ✓ v1.2.0');
  }

  /* ───── PUBLIC API ───── */
  window.SRank = window.SRank || {};
  window.SRank.Tulokho = {
    open,
    close,
    isOpen: () => _isOpen,
    getRoom: () => _room,
    version: '1.2.0'
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();