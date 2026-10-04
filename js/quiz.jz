/* =========================================================
   QUIZ — Bài kiểm tra Đảo Mèo
   Phụ thuộc: window.SRank.api, window.AdminSession, window.syncQuickTools
   v1.00 — 1 lần/ngày cho user, admin xem kết quả + tạo câu hỏi
   ========================================================= */
(function(){
  "use strict";

  const $ = id => document.getElementById(id);
  const TIMEOUT = {FAST:8000, NORMAL:12000, SLOW:20000};
  const LETTERS = ["A","B","C","D","E","F"];
  const MIN_ANSWERS = 2;
  const MAX_ANSWERS = 6;
  const USER_NAME_KEY = "srank_quiz_username_v1";

  const els = {
    overlay: $("quizOverlay"),
    panel: $("quizPanel"),
    close: $("quizClose"),
    tabs: $("quizModeTabs"),
    tabBtns: [...document.querySelectorAll(".quiz-mode-tab")],
    views: [...document.querySelectorAll(".quiz-view")],
    userStart: $("quizUserStart"),
    userNameInput: $("quizUserNameInput"),
    startBtn: $("quizStartBtn"),
    userStartMsg: $("quizUserStartMsg"),
    userRun: $("quizUserRun"),
    greeting: $("quizGreeting"),
    progressText: $("quizProgressText"),
    progressFill: $("quizProgressFill"),
    questionCard: $("quizQuestionCard"),
    navBar: $("quizNavBar"),
    prevBtn: $("quizPrevBtn"),
    nextBtn: $("quizNextBtn"),
    userResult: $("quizUserResult"),
    resultEmoji: $("quizResultEmoji"),
    resultScore: $("quizResultScore"),
    resultLabel: $("quizResultLabel"),
    resultDetail: $("quizResultDetail"),
    retryBtn: $("quizRetryBtn"),
    exitBtn: $("quizExitBtn"),
    questionInput: $("quizQuestionInput"),
    answersList: $("quizAnswersList"),
    addAnswerBtn: $("quizAddAnswerBtn"),
    formMsg: $("quizFormMsg"),
    saveBtn: $("quizSaveBtn"),
    cancelEditBtn: $("quizCancelEditBtn"),
    questionList: $("quizQuestionList"),
    countLabel: $("quizCountLabel"),
    resultsList: $("quizResultsList")
  };

  const state = {
    isAdmin: false,
    mode: "user",
    questions: [],
    userAnswers: {},
    userName: "",
    currentIdx: 0,
    lastResult: null,
    editingId: null,
    draftAnswers: ["", "", "", ""],
    draftCorrectIdx: 0
  };

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const api = (action, data, timeout) => window.SRank?.api
    ? window.SRank.api(action, data, timeout || TIMEOUT.NORMAL)
    : Promise.reject(new Error("API chưa sẵn sàng"));

  const setStatus = (t) => { try { window.SRank?.setStatus?.(t); } catch(_){} };
  const syncQuickTools = () => { try { window.syncQuickTools?.(); } catch(_){} };

  function switchView(name) {
    state.mode = name;
    els.views.forEach(v => v.classList.toggle("active", v.dataset.quizView === name));
    els.tabBtns.forEach(t => t.classList.toggle("active", t.dataset.quizMode === name));
  }

  /* ---------- OVERLAY ---------- */
  function open() {
    els.overlay.classList.add("show");
    els.overlay.setAttribute("aria-hidden", "false");
    state.isAdmin = !!(window.AdminSession && window.AdminSession.isValid && window.AdminSession.isValid());

    if (state.isAdmin) {
      els.tabs.hidden = false;
      switchView("user");
    } else {
      els.tabs.hidden = true;
      switchView("user");
    }
    resetUserFlow();
    syncQuickTools();
  }

  function close() {
    els.overlay.classList.remove("show");
    els.overlay.setAttribute("aria-hidden", "true");
    syncQuickTools();
  }

  /* ---------- USER FLOW ---------- */
  function resetUserFlow() {
    state.questions = [];
    state.userAnswers = {};
    state.currentIdx = 0;
    state.lastResult = null;
    state.userName = "";
    els.userStart.hidden = false;
    els.userRun.hidden = true;
    els.userResult.hidden = true;
    els.userStartMsg.textContent = "";
    try {
      const saved = localStorage.getItem(USER_NAME_KEY) || "";
      els.userNameInput.value = saved;
    } catch(_) { els.userNameInput.value = ""; }
    els.startBtn.disabled = false;
    els.startBtn.textContent = "Bắt đầu làm bài";
    els.retryBtn.disabled = false;
    els.retryBtn.textContent = "Làm lại";
    els.retryBtn.style.opacity = "";
    els.retryBtn.style.cursor = "";
  }

  async function startQuiz() {
    const name = String(els.userNameInput.value || "").trim();
    if (!name) {
      els.userStartMsg.textContent = "Vui lòng nhập tên của bạn";
      els.userNameInput.focus();
      return;
    }
    state.userName = name.slice(0, 60);
    try { localStorage.setItem(USER_NAME_KEY, state.userName); } catch(_){}
    els.userStartMsg.textContent = "";
    els.startBtn.disabled = true;
    els.startBtn.textContent = "⏳ Đang tải…";

    try {
      const r = await api("quizList", { name: state.userName }, TIMEOUT.SLOW);
      if (!r || !r.ok) throw new Error((r && r.error) || "Không tải được câu hỏi");

      const qs = Array.isArray(r.data?.questions) ? r.data.questions : [];
      state.questions = qs.map(q => ({
        id: String(q.id || ""),
        question: String(q.question || ""),
        answers: Array.isArray(q.answers) ? q.answers.map(a => String(a || "")) : []
      })).filter(q => q.id && q.question && q.answers.length >= MIN_ANSWERS);

      if (r.data?.alreadyDone && r.data?.todayResult) {
        const tr = r.data.todayResult;
        state.lastResult = {
          score: tr.score,
          total: tr.total,
          detail: Array.isArray(tr.detail) ? tr.detail : [],
          time: tr.time
        };
        els.userStart.hidden = true;
        els.userRun.hidden = true;
        els.userResult.hidden = false;
        renderResult(true);
        return;
      }

      if (!state.questions.length) throw new Error("Chưa có câu hỏi nào để làm");

      state.userAnswers = {};
      state.currentIdx = 0;
      els.userStart.hidden = true;
      els.userResult.hidden = true;
      els.userRun.hidden = false;
      els.greeting.innerHTML = `Xin chào, <b>${esc(state.userName)}</b> 👋`;
      renderCurrentQuestion();
    } catch(e) {
      els.userStartMsg.textContent = String(e.message || e);
    } finally {
      els.startBtn.disabled = false;
      els.startBtn.textContent = "Bắt đầu làm bài";
    }
  }

  function renderCurrentQuestion() {
    const q = state.questions[state.currentIdx];
    if (!q) return;
    const total = state.questions.length;
    const idx = state.currentIdx;
    const picked = state.userAnswers[q.id];

    els.progressText.textContent = `Câu ${idx + 1}/${total}`;
    els.progressFill.style.width = ((idx + 1) * 100 / total) + "%";

    const wrap = document.createElement("div");
    const idxEl = document.createElement("div");
    idxEl.className = "quiz-q-index";
    idxEl.textContent = `Câu ${idx + 1}`;
    const qEl = document.createElement("div");
    qEl.className = "quiz-q-text";
    qEl.textContent = q.question;
    const list = document.createElement("div");
    list.className = "quiz-ans-list";

    q.answers.forEach((ans, i) => {
      const label = document.createElement("label");
      label.className = "quiz-ans-opt" + (picked === i ? " picked" : "");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "quiz_ans_" + q.id;
      radio.value = String(i);
      radio.checked = picked === i;
      const mark = document.createElement("span");
      mark.className = "quiz-ans-mark";
      const letter = document.createElement("span");
      letter.className = "quiz-ans-letter";
      letter.textContent = LETTERS[i] || String(i + 1);
      const text = document.createElement("span");
      text.className = "quiz-ans-text";
      text.textContent = ans;
      label.append(radio, mark, letter, text);
      label.addEventListener("click", (e) => {
        e.preventDefault();
        state.userAnswers[q.id] = i;
        renderCurrentQuestion();
      });
      list.appendChild(label);
    });

    wrap.append(idxEl, qEl, list);
    els.questionCard.innerHTML = "";
    els.questionCard.appendChild(wrap);

    els.prevBtn.disabled = idx === 0;
    const isLast = idx === total - 1;
    els.nextBtn.textContent = isLast ? "Nộp bài ✓" : "Câu tiếp ›";
    els.nextBtn.classList.toggle("submit", isLast);
    const unanswered = picked === undefined || picked === null || picked < 0;
    els.nextBtn.disabled = unanswered;
  }

  function goPrev() {
    if (state.currentIdx > 0) {
      state.currentIdx--;
      renderCurrentQuestion();
    }
  }

  async function goNextOrSubmit() {
    const total = state.questions.length;
    if (state.currentIdx < total - 1) {
      state.currentIdx++;
      renderCurrentQuestion();
      return;
    }
    await submitQuiz();
  }

  async function submitQuiz() {
    els.nextBtn.disabled = true;
    els.nextBtn.textContent = "⏳ Đang nộp…";
    try {
      const r = await api("quizSubmit", {
        name: state.userName,
        answers: JSON.stringify(state.userAnswers)
      }, TIMEOUT.SLOW);
      if (!r || !r.ok) throw new Error((r && r.error) || "Nộp bài thất bại");
      state.lastResult = r.data || null;
      renderResult(false);
    } catch(e) {
      setStatus(String(e.message || e));
      els.nextBtn.disabled = false;
      els.nextBtn.textContent = "Nộp bài ✓";
      els.nextBtn.classList.add("submit");
    }
  }

  function renderResult(alreadyDone = false) {
    const res = state.lastResult;
    if (!res) return;
    els.userRun.hidden = true;
    els.userResult.hidden = false;

    const total = Number(res.total) || 0;
    const score = Number(res.score) || 0;
    const percent = total ? Math.round(score * 100 / total) : 0;

    let emoji = "🌱";
    let label = "Cố lên nhé!";
    if (percent >= 90) { emoji = "🏆"; label = "Xuất sắc!"; }
    else if (percent >= 70) { emoji = "🎉"; label = "Rất tốt!"; }
    else if (percent >= 50) { emoji = "👍"; label = "Khá ổn!"; }
    else if (percent >= 30) { emoji = "💪"; label = "Cần cố thêm"; }

    els.resultEmoji.textContent = emoji;
    els.resultScore.textContent = `${score}/${total}`;

    if (alreadyDone) {
      const t = state.lastResult.time ? ` · ${state.lastResult.time}` : "";
      els.resultLabel.textContent = `Đã làm hôm nay${t} · ${percent}%`;
    } else {
      els.resultLabel.textContent = `${label} · ${percent}%`;
    }

    const wrap = document.createElement("div");
    wrap.className = "quiz-result-detail";
    const detail = Array.isArray(res.detail) ? res.detail : [];
    const byId = {};
    state.questions.forEach(q => { byId[q.id] = q; });
    detail.forEach((d, i) => {
      const q = byId[d.id];
      const row = document.createElement("div");
      row.className = "quiz-result-line" + (d.ok ? "" : " bad");
      const icon = document.createElement("span");
      icon.textContent = d.ok ? "✓" : "✕";
      const t = document.createElement("span");
      t.className = "rt";
      t.textContent = `Câu ${i + 1}: ${q ? q.question : "(?)"}`;
      const m = document.createElement("span");
      m.className = "rm";
      m.textContent = d.ok ? "Đúng" : `Chọn ${LETTERS[d.picked] || "-"} · Đúng ${LETTERS[d.correct] || "-"}`;
      row.append(icon, t, m);
      wrap.appendChild(row);
    });
    els.resultDetail.innerHTML = "";
    els.resultDetail.appendChild(wrap);

    if (alreadyDone) {
      els.retryBtn.disabled = true;
      els.retryBtn.textContent = "Đã làm hôm nay";
      els.retryBtn.style.opacity = ".5";
      els.retryBtn.style.cursor = "default";
    } else {
      els.retryBtn.disabled = false;
      els.retryBtn.textContent = "Làm lại";
      els.retryBtn.style.opacity = "";
      els.retryBtn.style.cursor = "";
    }
  }

  /* ---------- ADMIN — CREATE ---------- */
  function renderDraftAnswers() {
    els.answersList.innerHTML = "";
    state.draftAnswers.forEach((val, i) => {
      const row = document.createElement("div");
      row.className = "quiz-ans-row" + (i === state.draftCorrectIdx ? " correct" : "");
      row.dataset.idx = String(i);

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "quiz_correct_idx";
      radio.checked = i === state.draftCorrectIdx;

      const radioLabel = document.createElement("span");
      radioLabel.className = "quiz-ans-radio";
      radioLabel.addEventListener("click", () => {
        state.draftCorrectIdx = i;
        renderDraftAnswers();
      });

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 200;
      input.placeholder = `Đáp án ${LETTERS[i] || (i + 1)}`;
      input.value = val;
      input.addEventListener("input", () => {
        state.draftAnswers[i] = input.value;
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "quiz-ans-remove";
      del.textContent = "×";
      del.disabled = state.draftAnswers.length <= MIN_ANSWERS;
      del.addEventListener("click", () => {
        if (state.draftAnswers.length <= MIN_ANSWERS) return;
        state.draftAnswers.splice(i, 1);
        if (state.draftCorrectIdx >= state.draftAnswers.length) {
          state.draftCorrectIdx = state.draftAnswers.length - 1;
        } else if (state.draftCorrectIdx > i) {
          state.draftCorrectIdx--;
        }
        renderDraftAnswers();
      });

      row.append(radio, radioLabel, input, del);
      els.answersList.appendChild(row);
    });
    els.addAnswerBtn.disabled = state.draftAnswers.length >= MAX_ANSWERS;
  }

  function resetCreateForm() {
    state.editingId = null;
    state.draftAnswers = ["", "", "", ""];
    state.draftCorrectIdx = 0;
    els.questionInput.value = "";
    els.formMsg.textContent = "";
    els.formMsg.classList.remove("ok");
    els.saveBtn.textContent = "Thêm câu hỏi";
    els.cancelEditBtn.hidden = true;
    renderDraftAnswers();
  }

  function loadForEdit(q) {
    state.editingId = q.id;
    els.questionInput.value = q.question;
    state.draftAnswers = q.answers.slice();
    while (state.draftAnswers.length < MIN_ANSWERS) state.draftAnswers.push("");
    state.draftCorrectIdx = Number.isInteger(q.correctIdx) ? q.correctIdx : 0;
    if (state.draftCorrectIdx >= state.draftAnswers.length) state.draftCorrectIdx = 0;
    els.formMsg.textContent = "";
    els.formMsg.classList.remove("ok");
    els.saveBtn.textContent = "Cập nhật";
    els.cancelEditBtn.hidden = false;
    renderDraftAnswers();
    els.questionInput.focus();
  }

  async function saveQuestion() {
    const question = String(els.questionInput.value || "").trim();
    const answers = state.draftAnswers.map(a => String(a || "").trim()).filter(a => a.length > 0);
    const correctIdx = state.draftCorrectIdx;

    if (!question) { els.formMsg.textContent = "Chưa nhập câu hỏi"; return; }
    if (answers.length < MIN_ANSWERS) { els.formMsg.textContent = `Cần ít nhất ${MIN_ANSWERS} đáp án`; return; }
    if (correctIdx >= answers.length) { els.formMsg.textContent = "Đáp án đúng không hợp lệ"; return; }

    els.saveBtn.disabled = true;
    els.formMsg.textContent = "⏳ Đang lưu…";
    els.formMsg.classList.remove("ok");

    try {
      const token = window.AdminSession?.get?.() || "";
      if (!token) throw new Error("Phiên admin đã hết hạn");

      const action = state.editingId ? "quizUpdate" : "quizAdd";
      const payload = {
        token, question,
        answers: JSON.stringify(answers),
        correctIdx: String(correctIdx)
      };
      if (state.editingId) payload.id = state.editingId;

      const r = await api(action, payload, TIMEOUT.SLOW);
      if (!r || !r.ok) throw new Error((r && r.error) || "Không lưu được");

      els.formMsg.classList.add("ok");
      els.formMsg.textContent = state.editingId ? "Đã cập nhật ✓" : "Đã thêm câu hỏi ✓";
      resetCreateForm();
      await refreshAdminQuestions();
    } catch(e) {
      els.formMsg.textContent = String(e.message || e);
    } finally {
      els.saveBtn.disabled = false;
    }
  }

  async function refreshAdminQuestions() {
    try {
      const r = await api("quizList", {}, TIMEOUT.SLOW);
      if (!r || !r.ok) throw new Error((r && r.error) || "Lỗi tải");
      const qs = Array.isArray(r.data?.questions) ? r.data.questions : [];
      state.questions = qs;
      renderAdminQuestionList();
    } catch(e) {
      els.questionList.innerHTML = `<div class="quiz-empty">Không tải được: ${esc(e.message || e)}</div>`;
    }
  }

  function renderAdminQuestionList() {
    const list = state.questions || [];
    els.countLabel.textContent = String(list.length);
    if (!list.length) {
      els.questionList.innerHTML = `<div class="quiz-empty">Chưa có câu hỏi nào</div>`;
      return;
    }
    els.questionList.innerHTML = "";
    list.forEach((q) => {
      const item = document.createElement("div");
      item.className = "quiz-q-item";
      item.dataset.id = q.id;

      const head = document.createElement("div");
      head.className = "quiz-q-item-head";
      const txt = document.createElement("div");
      txt.className = "quiz-q-item-text";
      txt.textContent = q.question;
      const acts = document.createElement("div");
      acts.className = "quiz-q-item-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.title = "Sửa";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", () => loadForEdit(q));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "del";
      delBtn.title = "Xoá";
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", () => deleteQuestion(q));

      acts.append(editBtn, delBtn);
      head.append(txt, acts);

      const ansBox = document.createElement("div");
      ansBox.className = "quiz-q-item-ans";
      (q.answers || []).forEach((a, i) => {
        const d = document.createElement("div");
        if (i === q.correctIdx) d.className = "ok";
        d.textContent = `${LETTERS[i] || (i + 1)}. ${a}`;
        ansBox.appendChild(d);
      });

      item.append(head, ansBox);
      els.questionList.appendChild(item);
    });
  }

  async function deleteQuestion(q) {
    if (!confirm(`Xoá câu hỏi?\n"${q.question}"`)) return;
    try {
      const token = window.AdminSession?.get?.() || "";
      if (!token) throw new Error("Phiên admin đã hết hạn");
      const r = await api("quizDelete", { token, id: q.id }, TIMEOUT.NORMAL);
      if (!r || !r.ok) throw new Error((r && r.error) || "Không xoá được");
      setStatus("Đã xoá câu hỏi ✓");
      if (state.editingId === q.id) resetCreateForm();
      await refreshAdminQuestions();
    } catch(e) {
      setStatus(String(e.message || e));
    }
  }

  /* ---------- ADMIN — RESULTS ---------- */
  async function refreshResults() {
    els.resultsList.innerHTML = `<div class="quiz-empty">⏳ Đang tải…</div>`;
    try {
      const token = window.AdminSession?.get?.() || "";
      if (!token) throw new Error("Phiên admin đã hết hạn");
      const r = await api("quizResults", { token }, TIMEOUT.SLOW);
      if (!r || !r.ok) throw new Error((r && r.error) || "Không tải được kết quả");
      const rows = Array.isArray(r.data?.results) ? r.data.results : [];
      if (!rows.length) {
        els.resultsList.innerHTML = `<div class="quiz-empty">Chưa có ai làm bài</div>`;
        return;
      }
      els.resultsList.innerHTML = "";
      rows.forEach(row => {
        const el = document.createElement("div");
        el.className = "quiz-result-row";
        const pct = row.total ? row.score / row.total : 0;
        const cls = pct >= 0.7 ? "" : pct >= 0.5 ? "mid" : "low";

        const name = document.createElement("div");
        name.className = "quiz-result-name";
        name.textContent = row.name || "(ẩn danh)";
        const time = document.createElement("div");
        time.className = "quiz-result-time";
        time.textContent = row.time || "";
        const pts = document.createElement("div");
        pts.className = "quiz-result-points" + (cls ? " " + cls : "");
        pts.textContent = `${row.score}/${row.total}`;
        el.append(name, time, pts);
        els.resultsList.appendChild(el);
      });
    } catch(e) {
      els.resultsList.innerHTML = `<div class="quiz-empty">Lỗi: ${esc(e.message || e)}</div>`;
    }
  }

  /* ---------- EVENT WIRING ---------- */
  function bindEvents() {
    els.close.addEventListener("click", close);
    els.overlay.addEventListener("click", e => { if (e.target === els.overlay) close(); });

    els.tabBtns.forEach(t => t.addEventListener("click", () => {
      const m = t.dataset.quizMode;
      if (!state.isAdmin && m !== "user") return;
      switchView(m);
      if (m === "create") refreshAdminQuestions();
      else if (m === "results") refreshResults();
    }));

    els.startBtn.addEventListener("click", startQuiz);
    els.userNameInput.addEventListener("keydown", e => { if (e.key === "Enter") startQuiz(); });
    els.prevBtn.addEventListener("click", goPrev);
    els.nextBtn.addEventListener("click", goNextOrSubmit);
    els.retryBtn.addEventListener("click", () => {
      if (els.retryBtn.disabled) return;
      state.userAnswers = {};
      state.currentIdx = 0;
      state.lastResult = null;
      els.userResult.hidden = true;
      els.userRun.hidden = false;
      renderCurrentQuestion();
    });
    els.exitBtn.addEventListener("click", close);

    els.addAnswerBtn.addEventListener("click", () => {
      if (state.draftAnswers.length >= MAX_ANSWERS) return;
      state.draftAnswers.push("");
      renderDraftAnswers();
    });
    els.saveBtn.addEventListener("click", saveQuestion);
    els.cancelEditBtn.addEventListener("click", resetCreateForm);
  }

  function initToolbar() {
    const btn = $("quizBtn");
    if (!btn) return;
    btn.addEventListener("click", open);
    window.Quiz = window.Quiz || {};
    window.Quiz.open = open;
    window.Quiz.close = close;
  }

  function init() {
    if (!els.overlay) return;
    bindEvents();
    initToolbar();
    resetCreateForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.Quiz = window.Quiz || {};
  window.Quiz.open = open;
  window.Quiz.close = close;
})();