/* ═══════════════════════════════════════════════════════════════
   TÚ LƠ KHƠ (TIẾN LÊN MIỀN NAM) — v1.5.6
   - FIX: cho phép build dần combo (VD click 4-5-6-7 để lên sảnh)
     canBuildToCombo thay isValidSelectionStructure
   - Smart select v3: swap chất, bỏ rank, add rank
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.SRank && window.SRank.Tulokho) return;

  const Auth = window.SRank && window.SRank.Auth;
  if (!Auth) { console.warn('[Tulokho] SRank.Auth chưa load'); return; }

  const ROOM_KEY = 'srank_card_room_v2';
  const LEGACY_ROOM_KEY = 'srank_card_room_v1';
  const POLL_MS = 2500;
  const ROOM_POLL_MS = 5000;
  const TICK_MS = 1000;
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
    het_bai: 'Hết bài',
    out: 'Đối thủ rời'
  };

  let _room = null;
  let _myName = '';
  let _selected = new Set();
  let _channel = null;
  let _pollTimer = null;
  let _roomPollTimer = null;
  let _tickTimer = null;
  let _isOpen = false;
  let _busy = false;
  let _lastErrorAt = 0;

  let _lastTable = [];
  let _lastTableOwner = '';
  let _lastTableStr = '';
  let _prevTable = [];
  let _prevTableOwner = '';
  let _lastTimeoutKey = '';

  const $ = id => document.getElementById(id);
  const h = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function cardRank(c){ return Math.floor(c / 4); }
  function cardSuit(c){ return c % 4; }
  function isRed(c){ return cardSuit(c) >= 2; }
  function cardValue(c){ return cardRank(c) * 4 + cardSuit(c); }
  function sortAsc(a, b){ return cardValue(a) - cardValue(b); }

  function getUserIdentity(){
    try {
      const u = Auth.getCurrentUser?.();
      if (!u) return '';
      const dn = String(u.displayName || '').trim();
      if (dn) return dn;
      const m = u.user_metadata || {};
      const raw = String(m.display_name || m.full_name || m.name || '').trim();
      if (raw) return raw;
      return String(u.username || '').trim().toLowerCase();
    } catch(_){ return ''; }
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

  function comboType(cards){
    const n = cards.length;
    if (!n) return null;
    const ranks = cards.map(cardRank).sort((a, b) => a - b);

    if (n === 1) return 'single';
    if (n === 2) return ranks[0] === ranks[1] ? 'pair' : null;
    if (n === 3 && ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 'triple';
    if (n === 4 && ranks[0] === ranks[3]) return 'quad';

    if (n === 6
        && ranks[0]===ranks[1] && ranks[2]===ranks[3] && ranks[4]===ranks[5]
        && ranks[2]===ranks[0]+1 && ranks[4]===ranks[2]+1 && ranks[4]<12){
      return '3straight';
    }
    if (n === 8
        && ranks[0]===ranks[1] && ranks[2]===ranks[3]
        && ranks[4]===ranks[5] && ranks[6]===ranks[7]
        && ranks[2]===ranks[0]+1 && ranks[4]===ranks[2]+1
        && ranks[6]===ranks[4]+1 && ranks[6]<12){
      return '4straight';
    }

    if (n >= 3){
      let isStraight = true;
      for (let i = 1; i < n; i++){
        if (ranks[i] !== ranks[i-1]+1){ isStraight = false; break; }
      }
      if (isStraight && ranks[n-1] < 12) return 'straight';
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

  function enumerateAllCombos(hand){
    const combos = [];
    const byRank = new Map();
    hand.forEach(c => {
      const r = cardRank(c);
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(c);
    });
    byRank.forEach(arr => arr.sort((a, b) => cardSuit(a) - cardSuit(b)));

    for (const c of hand) combos.push([c]);

    byRank.forEach(cards => {
      if (cards.length >= 2) combos.push([cards[0], cards[1]]);
      if (cards.length >= 3) combos.push([cards[0], cards[1], cards[2]]);
      if (cards.length >= 4) combos.push([cards[0], cards[1], cards[2], cards[3]]);
    });

    for (let len = 3; len <= 12; len++){
      for (let start = 0; start <= 12 - len; start++){
        const end = start + len - 1;
        if (end >= 12) continue;
        let ok = true;
        const combo = [];
        for (let r = start; r <= end; r++){
          const cards = byRank.get(r);
          if (!cards || !cards.length){ ok = false; break; }
          combo.push(cards[0]);
        }
        if (ok) combos.push(combo);
      }
    }

    for (let start = 0; start <= 12 - 3; start++){
      const end = start + 2;
      if (end >= 12) continue;
      let ok = true;
      const combo = [];
      for (let r = start; r <= end; r++){
        const cards = byRank.get(r);
        if (!cards || cards.length < 2){ ok = false; break; }
        combo.push(cards[0], cards[1]);
      }
      if (ok) combos.push(combo);
    }

    for (let start = 0; start <= 12 - 4; start++){
      const end = start + 3;
      if (end >= 12) continue;
      let ok = true;
      const combo = [];
      for (let r = start; r <= end; r++){
        const cards = byRank.get(r);
        if (!cards || cards.length < 2){ ok = false; break; }
        combo.push(cards[0], cards[1]);
      }
      if (ok) combos.push(combo);
    }

    return combos;
  }

  function getValidCombos(hand, table, tableType){
    const all = enumerateAllCombos(hand);
    if (!table || !table.length) return all;
    return all.filter(c => {
      const t = comboType(c);
      return t && comboBeats(c, t, table, tableType);
    });
  }

  /* ⭐ v1.5.6: cho phép build dần (subset của combo) */
  function canBuildToCombo(selectedSet, combos){
    const size = selectedSet.size;
    if (size <= 1) return true;
    const selArr = [...selectedSet];
    return combos.some(combo => selArr.every(c => combo.indexOf(c) >= 0));
  }

  function getBestCombo(card, combos){
    const containing = combos.filter(c => c.indexOf(card) >= 0);
    if (!containing.length) return null;
    containing.sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      const sumA = a.reduce((s, c) => s + cardValue(c), 0);
      const sumB = b.reduce((s, c) => s + cardValue(c), 0);
      return sumA - sumB;
    });
    return containing[0];
  }

  /* ⭐ Smart select v3.1 */
  function onCardClick(card, hand){
    if (_busy) return;

    const table = _room.table || [];
    const tableType = _room.tableType;
    const validCombos = getValidCombos(hand, table, tableType);

    if (table.length > 0 && validCombos.length === 0){
      toastError('Không có bài đánh lại');
      return;
    }

    const rank = cardRank(card);

    /* Case 1: Click lá đang chọn → bỏ hết rank đó */
    if (_selected.has(card)){
      [..._selected].filter(c => cardRank(c) === rank).forEach(c => _selected.delete(c));
      if (_selected.size > 0 && !canBuildToCombo(_selected, validCombos)){
        _selected.clear();
      }
      renderPlaying();
      return;
    }

    /* Case 2: Selection rỗng → auto best */
    if (_selected.size === 0){
      const best = getBestCombo(card, validCombos);
      if (best) best.forEach(c => _selected.add(c));
      renderPlaying();
      return;
    }

    /* Case 3: Thử add 1 lá */
    const tryAdd1 = new Set(_selected);
    tryAdd1.add(card);
    if (canBuildToCombo(tryAdd1, validCombos)){
      _selected = tryAdd1;
      renderPlaying();
      return;
    }

    /* Case 4: Thử swap lá cùng rank (giữ 1 lá mới, bỏ lá cũ) */
    const sameRankInSel = [..._selected].filter(c => cardRank(c) === rank);
    if (sameRankInSel.length > 0){
      const trySwap = new Set(_selected);
      sameRankInSel.forEach(c => trySwap.delete(c));
      trySwap.add(card);
      if (canBuildToCombo(trySwap, validCombos)){
        _selected = trySwap;
        renderPlaying();
        return;
      }
    }

    /* Case 5: Thử add cả rank (để lên đôi thông/tứ quý) */
    const allRank = hand.filter(c => cardRank(c) === rank);
    const tryAddAll = new Set(_selected);
    allRank.forEach(c => tryAddAll.add(c));
    if (canBuildToCombo(tryAddAll, validCombos)){
      _selected = tryAddAll;
      renderPlaying();
      return;
    }

    /* Case 6: Fallback best combo chứa card */
    _selected.clear();
    const best = getBestCombo(card, validCombos);
    if (best) best.forEach(c => _selected.add(c));
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

  async function callRpc(fn, params){
    const sb = window.__sb;
    if (!sb || !sb.rpc) throw new Error('Chưa kết nối máy chủ');
    const { data, error } = await sb.rpc(fn, params);
    if (error) throw new Error(error.message || 'Lỗi mạng');
    if (data && data.ok === false) throw new Error(data.error || 'Lỗi không xác định');
    return data;
  }

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
  function clearLegacyRoomKey(){
    try { localStorage.removeItem(LEGACY_ROOM_KEY); } catch(_){}
  }

  function injectDom(){
    if ($('tulokhoOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'tulokhoOverlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.style.display = 'none';
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
            </div>
            <div class="tlk-rooms-section">
              <div class="tlk-rooms-head">
                <span class="tlk-rooms-title">Phòng đang mở</span>
                <button class="tlk-rooms-refresh" data-action="refresh-rooms" type="button" aria-label="Làm mới">⟳</button>
              </div>
              <div id="tlkRoomsList" class="tlk-rooms-list"></div>
            </div>
          </div>
          <div class="tlk-view" data-view="waiting" hidden>
            <div class="tlk-waiting">
              <div id="tlkTimeSetting" class="tlk-time-setting" hidden>
                <label for="tlkTimeInput">⏱ Giới hạn mỗi lượt</label>
                <div class="tlk-time-row">
                  <input id="tlkTimeInput" type="number" min="0" max="300" step="5" value="30" inputmode="numeric">
                  <span>giây</span>
                  <button data-action="save-time" type="button">Lưu</button>
                </div>
                <div class="tlk-time-hint">0 = tắt giới hạn • Hết giờ sẽ tự bỏ lượt (hoặc tự đánh lá thấp nhất nếu đang mở vòng)</div>
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
              <div id="tlkFinishedHands" class="tlk-finished-hands"></div>
              <div class="tlk-actions">
                <button class="tlk-btn primary" data-action="back-waiting" id="tlkBackWaitingBtn" type="button" hidden>↩ Về phòng chờ</button>
                <button class="tlk-btn danger" data-action="leave" type="button">Rời phòng</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(ov);
  }

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

  function showView(name){
    document.querySelectorAll('#tlkBody .tlk-view').forEach(v => {
      v.hidden = v.dataset.view !== name;
    });
    if (name === 'menu') loadRoomList();
  }

  function render(){
    if (!_room){ showView('menu'); return; }
    const st = _room.status;
    if (st === 'waiting') { renderWaiting(); showView('waiting'); }
    else if (st === 'playing') { renderPlaying(); showView('playing'); }
    else if (st === 'finished') { renderFinished(); showView('finished'); }
    else showView('menu');
  }

  async function loadRoomList(){
    const box = $('tlkRoomsList');
    if (!box) return;
    box.innerHTML = '<div class="tlk-rooms-empty">Đang tải…</div>';
    try {
      const data = await callRpc('rpc_card_list_rooms', {});
      const rooms = (data && data.data && Array.isArray(data.data.rooms)) ? data.data.rooms : [];
      renderRoomList(rooms);
    } catch (e){
      console.warn('[Tulokho] rooms:', e.message);
      box.innerHTML = '<div class="tlk-rooms-empty">Không tải được danh sách phòng</div>';
    }
  }

  function renderRoomList(rooms){
    const box = $('tlkRoomsList');
    if (!box) return;
    if (!rooms.length){
      box.innerHTML = '<div class="tlk-rooms-empty">Chưa có phòng nào. Tạo phòng đi! 🎲</div>';
      return;
    }
    box.innerHTML = '';
    rooms.forEach(r => {
      const isFull = r.playerCount >= r.maxPlayers;
      const row = document.createElement('div');
      row.className = 'tlk-room-row';
      row.innerHTML = `
        <div class="tlk-room-info">
          <div class="tlk-room-code">${h(r.code)}</div>
          <div class="tlk-room-host">👑 ${h(displayUser(r.host))}</div>
        </div>
        <div class="tlk-room-slots ${isFull?'full':''}">${r.playerCount}/${r.maxPlayers}</div>
        <button class="tlk-room-join ${isFull?'full':''}" type="button" ${isFull?'disabled':''}>${isFull ? 'FULL' : 'Tham gia'}</button>
      `;
      if (!isFull){
        row.querySelector('.tlk-room-join').addEventListener('click', () => joinRoom(r.code));
      }
      box.appendChild(row);
    });
  }

  async function joinRoom(code){
    if (_busy) return;
    _busy = true;
    try {
      await callRpc('rpc_card_join', { p_code: code, p_name: _myName });
      saveRoomCode(code);
      _room = { code, status: 'waiting', version: 0, players: [] };
      subscribeRoom(code);
      await fetchState();
      toast('Đã vào phòng ' + code, { type: 'success', duration: 2600 });
    } catch (e){
      toastError('Vào phòng lỗi: ' + e.message);
    } finally { _busy = false; }
  }

  function renderWaiting(){
    if (!_room) return;
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

    const timeBox = $('tlkTimeSetting');
    if (timeBox){
      timeBox.hidden = !isHost;
      if (isHost){
        const inp = $('tlkTimeInput');
        if (inp && document.activeElement !== inp){
          inp.value = String(_room.turnSeconds != null ? _room.turnSeconds : 30);
        }
      }
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
    const hasTimer = _room.turnSeconds > 0 && _room.turnStartedAt;

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
      _selected.clear();
    }
    _lastTable = sortedTable.slice();
    _lastTableOwner = tableOwner || '';
    _lastTableStr = tableStr;

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
      let timerHtml = '';
      if (turn === p.order && hasTimer){
        const remain = Math.max(0, Math.ceil((_room.turnStartedAt + _room.turnSeconds*1000 - Date.now())/1000));
        timerHtml = `<div class="tlk-opp-timer ${remain <= 5 ? 'urgent' : ''}">⏱ <span data-tlk-timer>${remain}</span>s</div>`;
      }
      slot.innerHTML = `
        <div class="tlk-opp-avatar">${avHtml}</div>
        <div class="tlk-opp-name" title="${h(du)}">${h(du)}</div>
        <div class="tlk-opp-cards"><span class="tlk-opp-cards-icon"></span>${cnt}</div>
        ${timerHtml}
      `;
    });

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

    const comboEl = $('tlkTableCombo');
    if (tableType && sortedTable.length > 0){
      comboEl.hidden = false;
      comboEl.textContent = comboLabel(tableType);
    } else {
      comboEl.hidden = true;
    }

    const status = $('tlkMyStatus');
    status.innerHTML = '';
    if (isMyTurn){
      let timerHtml = '';
      if (hasTimer){
        const remain = Math.max(0, Math.ceil((_room.turnStartedAt + _room.turnSeconds*1000 - Date.now())/1000));
        timerHtml = ` <span class="tlk-timer ${remain <= 5 ? 'urgent' : ''}">⏱ <span data-tlk-timer>${remain}</span>s</span>`;
      }
      status.innerHTML = `<span class="tlk-status-tag turn">🎯 Lượt bạn</span>${timerHtml}`;
    } else if (turn != null){
      const curr = players.find(p => p.order === turn);
      status.innerHTML = `<span class="tlk-status-tag">⏳ ${h(displayUser(curr ? curr.name : '?'))}</span>`;
    }

    const selectedCards = myHand.filter(c => _selected.has(c));
    if (selectedCards.length){
      const t = comboType(selectedCards);
      const label = t ? comboLabel(t) : 'Đang chọn…';
      status.insertAdjacentHTML('beforeend', ` <span class="tlk-status-hint">${h(label)}</span>`);
    }

    const handBox = $('tlkMyHand');
    handBox.innerHTML = '';
    myHand.forEach(c => {
      const el = cardEl(c, { selected: _selected.has(c), dataCard: true });
      el.addEventListener('click', function (){ onCardClick(c, myHand); });
      handBox.appendChild(el);
    });

    const playBtn = $('tlkPlayBtn');
    const passBtn = $('tlkPassBtn');
    playBtn.disabled = !isMyTurn || _selected.size === 0 || !isValidSelection(myHand, sortedTable, tableType) || _busy;
    passBtn.disabled = !isMyTurn || sortedTable.length === 0 || tableOwner === _myName || _busy;
  }

  function renderFinished(){
    if (!_room) return;
    const w = _room.winner || '';
    const wt = _room.winnerType || '';
    $('tlkWinnerName').textContent = displayUser(w) || '—';
    $('tlkWinnerReason').textContent = wt ? (ANGT_STATUS_LABEL[wt] || wt) : '';

    const players = _room.players || [];
    const handsBox = $('tlkFinishedHands');
    handsBox.innerHTML = '';
    const sorted = players.slice().sort((a, b) => {
      if (a.name === w) return -1;
      if (b.name === w) return 1;
      return (a.order || 0) - (b.order || 0);
    });
    sorted.forEach(p => {
      const hand = Array.isArray(p.hand) ? p.hand.slice().sort(sortAsc) : [];
      const wrap = document.createElement('div');
      wrap.className = 'tlk-finished-hand' + (p.name === w ? ' winner' : '');
      const isMe = p.name === _myName;
      const tag = isMe ? ' (bạn)' : '';
      const du = displayUser(p.name);
      if (hand.length === 0){
        wrap.innerHTML = `<div class="tlk-finished-hand-name">${h(du)}${tag} — 🏆 Hết bài</div>`;
      } else {
        wrap.innerHTML = `
          <div class="tlk-finished-hand-name">${h(du)}${tag} — còn ${hand.length} lá</div>
          <div class="tlk-finished-hand-cards"></div>
        `;
        const cardsBox = wrap.querySelector('.tlk-finished-hand-cards');
        hand.forEach(c => cardsBox.appendChild(cardEl(c, { small: true })));
      }
      handsBox.appendChild(wrap);
    });

    const isHost = _myName && _room.host && _myName === _room.host;
    $('tlkBackWaitingBtn').hidden = !isHost;
  }

  function resetSelectionState(){
    _selected.clear();
  }

  function updateTimers(){
    if (!_room || _room.status !== 'playing') return;
    if (!_room.turnSeconds || _room.turnSeconds <= 0) return;
    if (!_room.turnStartedAt) return;
    const deadline = _room.turnStartedAt + _room.turnSeconds * 1000;
    const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    document.querySelectorAll('[data-tlk-timer]').forEach(el => {
      if (el.textContent !== String(remain)) el.textContent = String(remain);
      const parent = el.parentElement;
      if (parent) parent.classList.toggle('urgent', remain <= 5);
    });
  }

  function checkTimeout(){
    if (!_room || _room.status !== 'playing') return;
    if (!_room.turnSeconds || _room.turnSeconds <= 0) return;
    if (!_room.turnStartedAt) return;
    const deadline = _room.turnStartedAt + _room.turnSeconds * 1000;
    if (Date.now() < deadline) return;
    const key = _room.turnStartedAt + ':' + _room.turn;
    if (_lastTimeoutKey === key) return;
    _lastTimeoutKey = key;
    callRpc('rpc_card_timeout', { p_code: _room.code }).then(() => {
      fetchState();
    }).catch(() => {});
  }

  function startTick(){
    stopTick();
    _tickTimer = setInterval(function (){
      if (document.hidden) return;
      if (!_isOpen) return;
      if (!_room || _room.status !== 'playing') return;
      if (!_room.turnSeconds || _room.turnSeconds <= 0) return;
      updateTimers();
      checkTimeout();
    }, TICK_MS);
  }
  function stopTick(){
    if (_tickTimer){ clearInterval(_tickTimer); _tickTimer = null; }
  }

  async function actCreate(){
    if (_busy) return; _busy = true;
    try {
      const data = await callRpc('rpc_card_create', { p_name: _myName });
      const code = data.data?.code;
      if (!code) throw new Error('Không tạo được phòng');
      saveRoomCode(code);
      _room = { code, status: 'waiting', version: 0, players: [] };
      subscribeRoom(code);
      await fetchState();
      toast('Đã tạo phòng', { type: 'success', duration: 2600 });
    } catch (e){
      toastError('Tạo phòng lỗi: ' + e.message);
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

  async function actSaveTime(){
    if (_busy || !_room) return;
    const inp = $('tlkTimeInput');
    if (!inp) return;
    const sec = Math.max(0, Math.min(300, parseInt(inp.value, 10) || 0));
    _busy = true;
    try {
      await callRpc('rpc_card_set_time', { p_code: _room.code, p_name: _myName, p_seconds: sec });
      await fetchState();
      toast(sec === 0 ? 'Đã tắt giới hạn thời gian' : 'Đã đặt ' + sec + 's/lượt', { type: 'success', duration: 2400 });
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
      _lastTimeoutKey = '';
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
      _lastTimeoutKey = '';
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
      _lastTimeoutKey = '';
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

  async function actBackWaiting(){
    if (_busy || !_room) return;
    if (_room.status !== 'finished'){ toastError('Ván chưa kết thúc'); return; }
    _busy = true;
    try {
      await callRpc('rpc_card_back_waiting', { p_code: _room.code, p_name: _myName });
      resetSelectionState();
      _prevTable = []; _prevTableOwner = ''; _lastTable = []; _lastTableOwner = ''; _lastTableStr = '';
      _lastTimeoutKey = '';
      await fetchState();
      toast('Đã về phòng chờ', { type: 'success', duration: 2000 });
    } catch (e){ toastError(e.message); }
    finally { _busy = false; }
  }

  function closeRoom(){
    unsubscribeRoom();
    clearRoomCode();
    _room = null;
    resetSelectionState();
    _prevTable = []; _prevTableOwner = ''; _lastTable = []; _lastTableOwner = ''; _lastTableStr = '';
    _lastTimeoutKey = '';
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
        _lastTimeoutKey = '';
      }
      if (statusChanged && st.status === 'finished'){
        resetSelectionState();
        _lastTimeoutKey = '';
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
  function startRoomPoll(){
    stopRoomPoll();
    _roomPollTimer = setInterval(function (){
      if (document.hidden) return;
      if (!_isOpen) return;
      if (!_room) loadRoomList();
    }, ROOM_POLL_MS);
  }
  function stopRoomPoll(){
    if (_roomPollTimer){ clearInterval(_roomPollTimer); _roomPollTimer = null; }
  }

  function open(){
    injectDom();
    clearLegacyRoomKey();
    _myName = getUserIdentity();
    if (!_myName){
      toastError('Bạn cần đăng nhập trước');
      return;
    }
    const ov = $('tulokhoOverlay');
    if (!ov) return;
    _isOpen = true;
    ov.style.display = 'block';
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
      showView('menu');
    }
    startPoll();
    startRoomPoll();
    startTick();
  }

  function close(){
    const ov = $('tulokhoOverlay');
    if (!ov) return;
    _isOpen = false;
    ov.style.display = 'none';
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tlk-open');
    stopPoll();
    stopRoomPoll();
    stopTick();
    if (!_room) unsubscribeRoom();
  }

  function handleClick(e){
    const t = e.target.closest('[data-action]');
    if (!t) return;
    e.preventDefault();
    const a = t.dataset.action;
    if (a === 'create') actCreate();
    else if (a === 'refresh-rooms') loadRoomList();
    else if (a === 'toggle-ready') actToggleReady();
    else if (a === 'save-time') actSaveTime();
    else if (a === 'start') actStart();
    else if (a === 'play') actPlay();
    else if (a === 'pass') actPass();
    else if (a === 'leave') actLeave();
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

  function handleVisibility(){
    if (document.hidden) return;
    if (_isOpen && _room) fetchState();
    if (_isOpen && !_room) loadRoomList();
  }

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

    document.addEventListener('keydown', handleKeydownCapture, true);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    console.log('[Tulokho] ready ✓ v1.5.6');
  }

  window.SRank = window.SRank || {};
  window.SRank.Tulokho = {
    open,
    close,
    isOpen: () => _isOpen,
    getRoom: () => _room,
    version: '1.5.6'
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();