/* =========================================================
   PUZZLE GAME — Wordle tiếng Việt v1.0.0
   ========================================================= */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const overlay=$('puzzleOverlay');
  if(!overlay)return;
  const closeBtn=$('puzzleClose');
  const tabsEl=$('puzzleTabs');
  const adminTab=$('puzzleAdminTab');
  const playView=overlay.querySelector('[data-view="play"]');
  const adminView=overlay.querySelector('[data-view="admin"]');
  const playContent=$('puzzlePlayContent');
  const adminContent=$('puzzleAdminContent');
  const Toast=window.Toast;
  const DN=window.DN||(n=>n);
  const isAdmin=()=>{try{return window.AdminSession?.isValid?.()===true}catch(_){return false}};

  let activePuzzles=[],selectedPuzzle=null,attemptState=null,guessHistory=[];
  let currentTab='play',cells=[],isSubmitting=!1,timerHandle=null;
  let hintItems=[],revealedHintCount=0,leaderboardRows=[];

  function firstGrapheme(str){if(!str)return '';try{if(Intl&&Intl.Segmenter){const seg=new Intl.Segmenter('vi',{granularity:'grapheme'});for(const s of seg.segment(str))return s.segment}}catch(_){}return str[0]||''}
  function splitGraphemes(str){const out=[];if(!str)return out;try{if(Intl&&Intl.Segmenter){const seg=new Intl.Segmenter('vi',{granularity:'grapheme'});for(const s of seg.segment(str))out.push(s.segment);return out}}catch(_){}return Array.from(str)}
  function normalizeUp(ch){if(!ch)return '';try{return ch.normalize('NFC').toUpperCase()}catch(_){return String(ch).toUpperCase()}}
  function fmtTime(sec){sec=Math.max(0,Math.floor(sec));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
  function fmtSeconds(sec){sec=Math.max(0,Math.floor(sec));if(sec<60)return sec+'s';const m=Math.floor(sec/60),s=sec%60;return m+'m'+(s?s+'s':'')}
  function escHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

  async function callRPC(name,params){
    const sb=window.__sb;
    if(!sb||typeof sb.rpc!=='function')throw new Error('Supabase chưa sẵn sàng');
    const {data,error}=await sb.rpc(name,params||{});
    if(error)throw new Error(error.message||'Lỗi kết nối');
    if(!data||typeof data!=='object')throw new Error('Phản hồi không hợp lệ');
    if(data.ok!==true)throw new Error(data.error||'Lỗi không xác định');
    return data.data;
  }

  const API={
    getActive:()=>callRPC('rpc_puzzle_get_active'),
    start:id=>callRPC('rpc_puzzle_start',{p_puzzle_id:id}),
    guess:(id,g)=>callRPC('rpc_puzzle_guess',{p_puzzle_id:id,p_guess:g}),
    hint:(id,i)=>callRPC('rpc_puzzle_reveal_hint',{p_puzzle_id:id,p_index:i}),
    create:p=>callRPC('rpc_puzzle_create',{p_title:p.title,p_answer:p.answer,p_hints:p.hints,p_points:p.points,p_duration:p.duration}),
    leaderboard:id=>callRPC('rpc_puzzle_leaderboard',{p_puzzle_id:id}),
    adminList:()=>callRPC('rpc_puzzle_admin_list'),
    archive:id=>callRPC('rpc_puzzle_archive',{p_puzzle_id:id})
  };

  function stopTimer(){if(timerHandle){clearInterval(timerHandle);timerHandle=null}}
  function startTimer(expiresAt,onTimeUp){
    stopTimer();
    const end=new Date(expiresAt).getTime();
    function tick(){
      const remain=Math.floor((end-Date.now())/1000);
      const el=playContent.querySelector('.pz-timer');
      if(!el){stopTimer();return}
      if(remain<=0){el.classList.add('danger');el.querySelector('.pz-timer-text').textContent='00:00';stopTimer();onTimeUp&&onTimeUp();return}
      el.querySelector('.pz-timer-text').textContent=fmtTime(remain);
      el.classList.toggle('warn',remain<=300&&remain>60);
      el.classList.toggle('danger',remain<=60);
    }
    tick();
    timerHandle=setInterval(tick,1000);
  }

  function renderPlayView(){
    stopTimer();
    if(!activePuzzles.length){playContent.innerHTML='<div class="pz-empty"><span class="pz-empty-icon">🧩</span>Chưa có puzzle nào.<br>Đợi admin tạo nhé!</div>';return}
    if(!selectedPuzzle){
      if(activePuzzles.length===1){selectPuzzle(activePuzzles[0]);return}
      renderPuzzleList();return;
    }
    if(!attemptState){renderPreview();return}
    const solved=!!attemptState.solved_at;
    const expired=!solved&&new Date(attemptState.expires_at).getTime()<Date.now();
    if(solved||expired){renderFinished(solved,expired);return}
    renderPlaying();
  }

  function renderPuzzleList(){
    playContent.innerHTML='<div class="pz-list">'+activePuzzles.map(p=>{
      const status=p.attempt_solved_at?'solved':(p.is_expired?'expired':(p.has_attempt?'playing':'new'));
      const statusText={solved:'✓ Đã giải',expired:'✗ Hết hạn',playing:'⏸ Đang chơi',new:'🆕 Chưa chơi'}[status];
      return '<div class="pz-list-card" data-pid="'+escHtml(p.id)+'">'
        +'<div class="pz-list-card-title">'+escHtml(p.title||'Puzzle')+'</div>'
        +'<div class="pz-list-card-meta">'
        +'<span>💰 '+p.points_reward+'đ</span>'
        +'<span>⏱ '+p.duration_minutes+'p</span>'
        +'<span>🔤 '+(p.word_lengths||[]).reduce((a,b)=>a+b,0)+' chữ</span>'
        +(p.hint_count?'<span>💡 '+p.hint_count+'</span>':'')
        +'</div>'
        +'<span class="pz-list-card-status '+status+'">'+statusText+'</span>'
        +'</div>';
    }).join('')+'</div>';
    playContent.querySelectorAll('.pz-list-card').forEach(card=>{
      card.addEventListener('click',()=>{
        const p=activePuzzles.find(x=>x.id===card.dataset.pid);
        if(p)selectPuzzle(p);
      });
    });
  }

  function renderPreview(){
    const p=selectedPuzzle;
    const total=(p.word_lengths||[]).reduce((a,b)=>a+b,0);
    playContent.innerHTML=
      '<div class="pz-playing-head">'
      +'<div class="pz-points-badge">💰 '+p.points_reward+'đ</div>'
      +'<div class="pz-timer"><span>⏱</span><span class="pz-timer-text">'+p.duration_minutes+':00</span></div>'
      +'</div>'
      +'<div style="text-align:center;padding:24px 8px;">'
      +'<div style="font-weight:900;color:#2a5a38;font-size:18px;margin-bottom:8px;">'+escHtml(p.title||'Puzzle')+'</div>'
      +'<div style="color:#7a9a80;font-weight:700;font-size:13px;margin-bottom:16px;">Đáp án gồm <b>'+total+' chữ cái</b> ('+(p.word_lengths||[]).join(' + ')+')</div>'
      +'<button type="button" class="pz-btn" id="pzStartBtn">🎮 Bắt đầu chơi</button>'
      +'</div>';
    $('pzStartBtn').addEventListener('click',startSelectedPuzzle);
  }

  function renderPlaying(){
    const p=selectedPuzzle;
    playContent.innerHTML=
      '<div class="pz-playing-head">'
      +'<div class="pz-points-badge">💰 '+p.points_reward+'đ</div>'
      +'<div class="pz-timer"><span>⏱</span><span class="pz-timer-text">--:--</span></div>'
      +'</div>'
      +'<div class="pz-grid" id="pzGrid"></div>'
      +'<div class="pz-hints" id="pzHints"></div>'
      +'<div class="pz-actions">'
      +'<button type="button" class="pz-btn" id="pzSubmitBtn" disabled>🔍 Đoán</button>'
      +'<button type="button" class="pz-btn secondary" id="pzClearBtn">✕ Xoá</button>'
      +'</div>'
      +'<div class="pz-history" id="pzHistory"></div>'
      +'<div class="pz-lb" id="pzLb"></div>';
    buildGrid(p.word_lengths||[]);
    renderHints();
    renderHistory();
    loadLeaderboard();
    $('pzClearBtn').addEventListener('click',clearGrid);
    $('pzSubmitBtn').addEventListener('click',submitGuess);
    startTimer(attemptState.expires_at,()=>{refreshActiveAndSelect(p.id,true)});
  }

  function buildGrid(wordLengths){
    const gridEl=$('pzGrid');
    cells=[];let idx=0;
    wordLengths.forEach(len=>{
      const wordEl=document.createElement('div');
      wordEl.className='pz-word';
      for(let i=0;i<len;i++){
        const inp=document.createElement('input');
        inp.type='text';inp.inputMode='text';inp.autocapitalize='characters';
        inp.spellcheck=false;inp.autocomplete='off';
        inp.className='pz-cell';inp.dataset.idx=String(idx);inp.maxLength=4;
        wordEl.appendChild(inp);cells.push(inp);idx++;
      }
      gridEl.appendChild(wordEl);
    });
    setupCellHandlers();
    if(cells[0])setTimeout(()=>cells[0].focus(),120);
    updateSubmitState();
  }

  function setupCellHandlers(){
    cells.forEach((cell,i)=>{
      cell.addEventListener('input',()=>{
        const g=firstGrapheme(cell.value);
        const up=normalizeUp(g);
        cell.value=up;
        cell.classList.toggle('filled',!!up);
        if(up&&cells[i+1])cells[i+1].focus();
        updateSubmitState();
      });
      cell.addEventListener('keydown',e=>{
        if(e.key==='Backspace'&&!cell.value&&cells[i-1]){
          e.preventDefault();cells[i-1].focus();cells[i-1].value='';
          cells[i-1].classList.remove('filled');updateSubmitState();
        }else if(e.key==='ArrowLeft'&&cells[i-1]){e.preventDefault();cells[i-1].focus()}
        else if(e.key==='ArrowRight'&&cells[i+1]){e.preventDefault();cells[i+1].focus()}
        else if(e.key==='Enter'){e.preventDefault();if(allFilled())submitGuess()}
      });
      cell.addEventListener('paste',e=>{
        e.preventDefault();
        const txt=(e.clipboardData||window.clipboardData).getData('text')||'';
        const gs=splitGraphemes(txt).filter(g=>g.trim()!==''&&g!==' ');
        let j=i;
        for(const g of gs){if(j>=cells.length)break;cells[j].value=normalizeUp(g);cells[j].classList.add('filled');j++}
        if(cells[j])cells[j].focus();
        updateSubmitState();
      });
    });
  }

  function allFilled(){return cells.length>0&&cells.every(c=>c.value)}
  function updateSubmitState(){const btn=$('pzSubmitBtn');if(btn)btn.disabled=!allFilled()||isSubmitting}
  function clearGrid(){cells.forEach(c=>{c.value='';c.classList.remove('filled')});if(cells[0])cells[0].focus();updateSubmitState()}

  function renderHints(){
    const el=$('pzHints');if(!el)return;
    const total=selectedPuzzle.hint_count||0;
    if(!total){el.innerHTML='<div class="pz-hints-title">💡 Gợi ý <span>Không có</span></div>';return}
    const shown=hintItems.slice(0,revealedHintCount);
    const canReveal=revealedHintCount<total;
    el.innerHTML='<div class="pz-hints-title">'
      +'<span>💡 Gợi ý ('+revealedHintCount+'/'+total+')</span>'
      +(canReveal?'<button type="button" class="pz-hint-btn" id="pzHintBtn">Mở gợi ý</button>':'')
      +'</div>'
      +shown.map((h,i)=>'<div class="pz-hint-item">'+(i+1)+'. '+escHtml(h)+'</div>').join('')
      +(!shown.length?'<div style="font-size:12px;color:#a08a4a;font-weight:700;">Chưa mở gợi ý nào</div>':'');
    const hb=$('pzHintBtn');
    if(hb)hb.addEventListener('click',async()=>{
      hb.disabled=true;
      try{
        const r=await API.hint(selectedPuzzle.id,revealedHintCount);
        hintItems[revealedHintCount]=r.hint;revealedHintCount++;renderHints();
      }catch(e){hb.disabled=false;Toast?.show(e.message||'Không mở được',{type:'error'})}
    });
  }

  function renderHistory(){
    const el=$('pzHistory');if(!el)return;
    if(!guessHistory.length){el.innerHTML='';return}
    el.innerHTML='<div class="pz-history-title">📋 Lịch sử đoán ('+guessHistory.length+')</div>'
      +'<div class="pz-history-rows">'
      +guessHistory.map(row=>'<div class="pz-history-row">'
        +row.colors.map(c=>'<div class="pz-hcell '+c.color+'">'+escHtml(c.char)+'</div>').join('')
        +'</div>').join('')
      +'</div>';
  }

  async function loadLeaderboard(){
    try{leaderboardRows=(await API.leaderboard(selectedPuzzle.id))||[];renderLeaderboard()}catch(_){}
  }

  function renderLeaderboard(){
    const el=$('pzLb');if(!el)return;
    if(!leaderboardRows.length){el.innerHTML='';return}
    const icons=['🥇','🥈','🥉'];
    el.innerHTML='<div class="pz-lb-title">🏆 Bảng xếp hạng</div>'
      +leaderboardRows.map((r,i)=>'<div class="pz-lb-row">'
        +'<span class="pz-lb-rank">'+(icons[i]||('#'+(i+1)))+'</span>'
        +'<span class="pz-lb-name">'+escHtml(DN(r.user_name))+'</span>'
        +'<span class="pz-lb-stat">'+fmtSeconds(r.time_seconds)+' · '+r.total_guesses+' lần</span>'
        +'</div>').join('');
  }

  function renderFinished(solved,expired){
    const p=selectedPuzzle;
    const answer=(p.revealed_answer||attemptState.revealed_answer||'').toUpperCase();
    playContent.innerHTML=
      (solved
        ?'<div class="pz-banner solved"><span class="pz-banner-title">🎉 Chính xác!</span>'
          +'<div>Bạn đã giải đúng sau '+attemptState.total_guesses+' lần đoán</div>'
          +'<div style="margin-top:6px;font-size:13px;">+'+attemptState.points_earned+' điểm</div>'
          +(answer?'<div class="pz-banner-answer">Đáp án: <b>'+escHtml(answer)+'</b></div>':'')
          +'</div>'
        :'<div class="pz-banner expired"><span class="pz-banner-title">⏰ Hết thời gian!</span>'
          +'<div>Bạn đã dùng '+attemptState.total_guesses+' lần đoán</div>'
          +(answer?'<div class="pz-banner-answer">Đáp án là: <b>'+escHtml(answer)+'</b></div>':'')
          +'</div>')
      +'<div class="pz-history" id="pzHistory"></div>'
      +'<div class="pz-lb" id="pzLb"></div>'
      +'<div class="pz-actions"><button type="button" class="pz-btn secondary" id="pzBackBtn">← Danh sách puzzle</button></div>';
    renderHistory();loadLeaderboard();
    $('pzBackBtn').addEventListener('click',()=>{
      selectedPuzzle=null;attemptState=null;guessHistory=[];
      hintItems=[];revealedHintCount=0;renderPlayView();
    });
  }

  async function selectPuzzle(p){
    selectedPuzzle=p;attemptState=null;guessHistory=[];
    hintItems=[];revealedHintCount=0;
    if(p.has_attempt){
      try{
        const s=await API.start(p.id);
        attemptState={attempt_id:s.attempt_id,expires_at:s.expires_at,started_at:s.started_at,solved_at:s.solved_at,total_guesses:s.total_guesses,points_earned:s.points_earned||0,revealed_answer:s.revealed_answer};
        guessHistory=s.guess_history||[];
        hintItems=s.hint_items||[];
        revealedHintCount=s.revealed_hint_count||0;
        if(s.word_lengths)selectedPuzzle.word_lengths=s.word_lengths;
      }catch(e){Toast?.show(e.message||'Không tải được state',{type:'error'})}
    }
    renderPlayView();
  }

  async function startSelectedPuzzle(){
    if(!selectedPuzzle)return;
    try{
      const s=await API.start(selectedPuzzle.id);
      attemptState={attempt_id:s.attempt_id,expires_at:s.expires_at,started_at:s.started_at,solved_at:s.solved_at,total_guesses:s.total_guesses,points_earned:s.points_earned||0,revealed_answer:s.revealed_answer};
      guessHistory=s.guess_history||[];
      hintItems=s.hint_items||[];
      revealedHintCount=s.revealed_hint_count||0;
      if(s.word_lengths)selectedPuzzle.word_lengths=s.word_lengths;
      renderPlayView();
    }catch(e){Toast?.show(e.message||'Không bắt đầu được',{type:'error'})}
  }

  async function submitGuess(){
    if(isSubmitting||!selectedPuzzle||!attemptState)return;
    const guess=cells.map(c=>c.value||'').join('');
    const total=(selectedPuzzle.word_lengths||[]).reduce((a,b)=>a+b,0);
    if(guess.length!==total){Toast?.show('Cần điền đủ '+total+' ô',{type:'warning'});return}
    isSubmitting=!0;updateSubmitState();
    try{
      const r=await API.guess(selectedPuzzle.id,guess);
      guessHistory.push({guess,colors:r.colors});
      attemptState.total_guesses=r.total_guesses;
      clearGrid();renderHistory();
      if(r.is_first_correct){
        attemptState.solved_at=r.solved_at;
        attemptState.points_earned=r.points_earned;
        selectedPuzzle.revealed_answer=r.revealed_answer;
        const lp=activePuzzles.find(x=>x.id===selectedPuzzle.id);
        if(lp){lp.attempt_solved_at=r.solved_at;lp.has_attempt=!0}
        Toast?.show('🎉 Chính xác! +'+r.points_earned+'đ',{type:'success',duration:5000});
        burstPuzzle();
        renderPlayView();
      }else if(r.is_correct&&!r.is_first_correct){
        Toast?.show('✓ Đúng (không cộng thêm điểm)',{type:'info'});
      }else if(r.is_repeat){
        Toast?.show('Bạn đã đoán từ này rồi',{type:'info'});
      }
    }catch(e){Toast?.show(e.message||'Không đoán được',{type:'error'})}
    finally{isSubmitting=!1;updateSubmitState()}
  }

  function burstPuzzle(){
    try{
      const space=document.getElementById('space')||document.body;
      const f=document.createElement('div');f.className='flash';space.appendChild(f);
      setTimeout(()=>f.remove(),700);
      const hearts=[];
      for(let i=0;i<20;i++){
        const h=document.createElement('div');h.className='heart';
        h.textContent=i%5===0?'🎉':'✨';
        const a=Math.PI*2*i/20,r=80+Math.random()*200;
        h.style.setProperty('--x',Math.cos(a)*r+'px');
        h.style.setProperty('--y',Math.sin(a)*r+'px');
        h.style.setProperty('--r',(Math.random()*120-60)+'deg');
        h.style.setProperty('--s',(.7+Math.random()*1.3).toFixed(2));
        h.style.setProperty('--time',(.7+Math.random()*.6).toFixed(2)+'s');
        space.appendChild(h);hearts.push(h);
      }
      setTimeout(()=>{for(const h of hearts)h.remove()},1600);
    }catch(_){}
  }

  async function refreshActiveAndSelect(pid,keep){
    try{
      activePuzzles=(await API.getActive())||[];
      if(keep&&pid){
        const p=activePuzzles.find(x=>x.id===pid);
        if(p){selectedPuzzle=p;await selectPuzzle(p);return}
      }
      renderPlayView();
    }catch(e){Toast?.show(e.message||'Lỗi',{type:'error'})}
  }

  async function renderAdminView(){
    adminContent.innerHTML='<div style="text-align:center;padding:20px;color:#7a9a80;">Đang tải…</div>';
    try{
      const list=(await API.adminList())||[];
      adminContent.innerHTML=
        '<form class="pz-admin-form" id="pzCreateForm">'
        +'<div class="pz-field"><label>Tiêu đề puzzle</label><input type="text" id="pzFldTitle" placeholder="VD: Đoán loài hoa" maxlength="80"></div>'
        +'<div class="pz-field"><label>Đáp án (tự UPPERCASE, có thể có khoảng trắng)</label><input type="text" id="pzFldAnswer" placeholder="VD: Hoa Hồng" maxlength="40" required></div>'
        +'<div class="pz-field"><label>Gợi ý (mỗi dòng 1 gợi ý)</label><textarea id="pzFldHints" placeholder="Loài hoa có gai&#10;Thường màu đỏ hoặc trắng&#10;Biểu tượng tình yêu"></textarea></div>'
        +'<div class="pz-field-row">'
        +'<div class="pz-field"><label>Điểm thưởng</label><input type="number" id="pzFldPoints" value="50" min="0" max="1000"></div>'
        +'<div class="pz-field"><label>Thời gian (phút)</label><input type="number" id="pzFldDuration" value="60" min="1" max="1440"></div>'
        +'</div>'
        +'<button type="submit" class="pz-btn" id="pzCreateBtn">✚ Tạo puzzle mới</button>'
        +'</form>'
        +'<div class="pz-admin-list">'
        +'<div class="pz-admin-list-title">📋 Danh sách puzzle ('+list.length+')</div>'
        +(list.length?list.map(p=>
          '<div class="pz-admin-item">'
          +'<div class="pz-admin-item-head"><span class="pz-admin-item-title">'+escHtml(p.title||'Puzzle')+'</span><span class="pz-admin-item-meta">'+(p.active?'🟢 Active':'⚪ Archived')+'</span></div>'
          +'<div class="pz-admin-item-answer">Đáp án: '+escHtml(p.answer)+'</div>'
          +'<div class="pz-admin-item-meta">'+p.points_reward+'đ · '+p.duration_minutes+'p · 🔤 '+(p.word_lengths||[]