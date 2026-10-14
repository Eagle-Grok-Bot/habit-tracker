(function () {
  "use strict";

  const STORAGE_KEY = "eagle-habit-tracker-v1";
  const ICONS = ["✨", "🏃", "📚", "💧", "🧘", "✍️", "🥗", "😴", "🎯", "💪", "🎸", "🌱", "🧹", "🧠", "☀️", "🌙"];
  const COLORS = ["#5b6cff", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#14b8a6", "#0ea5e9", "#6366f1", "#78716c"];

  /** @typedef {{ id: string, name: string, icon: string, color: string, note: string, createdAt: string }} Habit */
  /** @typedef {{ habits: Habit[], checks: Record<string, string[]> }} Store */

  // ---------- date helpers (local calendar) ----------
  function pad(n) { return String(n).padStart(2, "0"); }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseKey(key) {
    const [y, m, day] = key.split("-").map(Number);
    return new Date(y, m - 1, day);
  }

  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function weekdayZh(d) {
    return ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  }

  function formatDisplay(key) {
    const d = parseKey(key);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekdayZh(d)}`;
  }

  function formatShort(key) {
    const d = parseKey(key);
    return `${d.getMonth() + 1}/${d.getDate()} 周${weekdayZh(d)}`;
  }

  function uid() {
    return "h_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const data = JSON.parse(raw);
      if (!data.habits || !data.checks) return defaultStore();
      return data;
    } catch {
      return defaultStore();
    }
  }

  function defaultStore() {
    return {
      habits: [
        { id: "demo_read", name: "阅读 30 分钟", icon: "📚", color: "#5b6cff", note: "示例习惯，可删可改", createdAt: new Date().toISOString() },
        { id: "demo_water", name: "喝水 8 杯", icon: "💧", color: "#0ea5e9", note: "", createdAt: new Date().toISOString() },
        { id: "demo_sport", name: "运动", icon: "🏃", color: "#10b981", note: "", createdAt: new Date().toISOString() },
      ],
      checks: {},
    };
  }

  function save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  let store = load();

  // ---------- check helpers ----------
  function isChecked(habitId, dateKey) {
    const list = store.checks[habitId] || [];
    return list.includes(dateKey);
  }

  function toggleCheck(habitId, dateKey) {
    if (!store.checks[habitId]) store.checks[habitId] = [];
    const list = store.checks[habitId];
    const i = list.indexOf(dateKey);
    if (i >= 0) {
      list.splice(i, 1);
      save(store);
      return false;
    }
    list.push(dateKey);
    list.sort();
    save(store);
    return true;
  }

  function getChecksInRange(habitId, startKey, endKey) {
    const list = store.checks[habitId] || [];
    return list.filter((k) => k >= startKey && k <= endKey);
  }

  /** consecutive days ending at endKey (or 0 if endKey not checked) */
  function calcStreak(habitId, endKey) {
    const set = new Set(store.checks[habitId] || []);
    let streak = 0;
    let cur = parseKey(endKey);
    // if today not checked, start from yesterday for "current streak" display still useful
    if (!set.has(endKey)) {
      cur = addDays(cur, -1);
    }
    while (set.has(formatDateKey(cur))) {
      streak++;
      cur = addDays(cur, -1);
    }
    return streak;
  }

  function bestStreak(habitId) {
    const list = [...(store.checks[habitId] || [])].sort();
    if (!list.length) return 0;
    let best = 1;
    let cur = 1;
    for (let i = 1; i < list.length; i++) {
      const prev = parseKey(list[i - 1]);
      const now = parseKey(list[i]);
      const diff = (now - prev) / 86400000;
      if (diff === 1) {
        cur++;
        best = Math.max(best, cur);
      } else if (diff > 1) {
        cur = 1;
      }
    }
    return best;
  }

  // ---------- UI state ----------
  let calMonth = new Date();
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  let statsCycle = "7";
  let selectedIcon = ICONS[0];
  let selectedColor = COLORS[0];
  let pendingDeleteId = null;
  let toastTimer = null;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  function setTodayLabel() {
    const d = new Date();
    $("todayLabel").textContent =
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${weekdayZh(d)}`;
  }

  // ---------- tabs ----------
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach((p) => {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    if (name === "today") renderToday();
    if (name === "calendar") renderCalendar();
    if (name === "stats") renderStats();
    if (name === "habits") renderManage();
  }

  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });

  // ---------- habit pickers ----------
  function fillHabitSelects() {
    const opts = store.habits
      .map((h) => `<option value="${h.id}">${h.icon} ${escapeHtml(h.name)}</option>`)
      .join("");
    const empty = `<option value="">暂无习惯</option>`;
    ["calHabitSelect", "statsHabitSelect"].forEach((id) => {
      const sel = $(id);
      const prev = sel.value;
      sel.innerHTML = store.habits.length ? opts : empty;
      if (prev && store.habits.some((h) => h.id === prev)) sel.value = prev;
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- today ----------
  function renderToday() {
    const list = $("todayList");
    const empty = $("todayEmpty");
    const summary = $("todaySummary");
    const today = todayKey();

    if (!store.habits.length) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      summary.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    summary.classList.remove("hidden");

    const done = store.habits.filter((h) => isChecked(h.id, today)).length;
    const total = store.habits.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    summary.innerHTML = `
      <div class="sum-title">今日进度</div>
      <div class="sum-row">
        <div class="sum-big">${done} / ${total}</div>
        <div class="sum-sub">完成率 ${pct}%</div>
      </div>`;

    list.innerHTML = store.habits
      .map((h) => {
        const checked = isChecked(h.id, today);
        const streak = calcStreak(h.id, today);
        const meta = [
          streak > 0 ? `连续 ${streak} 天` : "尚未连续",
          h.note ? escapeHtml(h.note) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return `
        <article class="habit-card ${checked ? "done" : ""}" style="--habit-color:${h.color}">
          <div class="habit-icon">${h.icon}</div>
          <div class="habit-info">
            <div class="habit-name">${escapeHtml(h.name)}</div>
            <div class="habit-meta">${meta}</div>
          </div>
          <button type="button" class="check-btn ${checked ? "checked" : ""}" data-check="${h.id}" aria-label="${checked ? "取消打卡" : "打卡"}" style="--habit-color:${h.color}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </article>`;
      })
      .join("");

    list.querySelectorAll("[data-check]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-check");
        const on = toggleCheck(id, today);
        toast(on ? "打卡成功 ✓" : "已取消今日打卡");
        renderToday();
      });
    });
  }

  // ---------- calendar ----------
  function renderCalendar() {
    fillHabitSelects();
    const habitId = $("calHabitSelect").value;
    const habit = store.habits.find((h) => h.id === habitId);
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    $("calMonthLabel").textContent = `${y}年${m + 1}月`;

    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = todayKey();
    const color = habit ? habit.color : "#5b6cff";

    const cells = [];
    const prevDays = new Date(y, m, 0).getDate();
    for (let i = startPad - 1; i >= 0; i--) {
      cells.push({ day: prevDays - i, muted: true, key: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      cells.push({ day: d, muted: false, key });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: cells.length - (startPad + daysInMonth) + 1, muted: true, key: null });
    }
    // fix trailing muted day numbers
    let next = 1;
    for (let i = startPad + daysInMonth; i < cells.length; i++) {
      cells[i] = { day: next++, muted: true, key: null };
    }

    const checkedSet = habit ? new Set(store.checks[habit.id] || []) : new Set();
    const monthCount = habit
      ? getChecksInRange(habit.id, `${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(daysInMonth)}`).length
      : 0;

    $("calGrid").innerHTML = cells
      .map((c) => {
        const isToday = c.key === today;
        const isChecked = c.key && checkedSet.has(c.key);
        const cls = ["cal-day", c.muted ? "muted" : "", isToday ? "today" : "", isChecked ? "checked" : ""]
          .filter(Boolean)
          .join(" ");
        return `<div class="${cls}" style="--habit-color:${color}">${c.day}</div>`;
      })
      .join("");

    if (!habit) {
      $("calHint").textContent = "请先新建习惯";
    } else {
      $("calHint").textContent = `本月已打卡 ${monthCount} 天 · 绿色/彩色格子为已打卡`;
    }
  }

  $("calPrev").addEventListener("click", () => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  $("calNext").addEventListener("click", () => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  $("calHabitSelect").addEventListener("change", renderCalendar);

  // ---------- stats ----------
  function rangeForCycle(cycle) {
    const end = parseKey(todayKey());
    let start;
    if (cycle === "7") {
      start = addDays(end, -6);
    } else if (cycle === "month") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else {
      start = new Date(end.getFullYear(), 0, 1);
    }
    return { startKey: formatDateKey(start), endKey: formatDateKey(end), start, end };
  }

  function daysInRange(start, end) {
    return Math.round((end - start) / 86400000) + 1;
  }

  function renderStats() {
    fillHabitSelects();
    const habitId = $("statsHabitSelect").value;
    const habit = store.habits.find((h) => h.id === habitId);
    const { startKey, endKey, start, end } = rangeForCycle(statsCycle);
    const cards = $("statsCards");
    const datesEl = $("statsDates");

    if (!habit) {
      cards.innerHTML = `<div class="stat-card wide"><div class="stat-label">提示</div><div class="stat-sub" style="margin-top:8px">请先新建习惯</div></div>`;
      datesEl.innerHTML = `<li class="empty-dates">暂无数据</li>`;
      return;
    }

    const dates = getChecksInRange(habit.id, startKey, endKey).slice().reverse();
    const totalDays = daysInRange(start, end);
    const count = dates.length;
    const rate = totalDays ? Math.round((count / totalDays) * 100) : 0;
    const streak = calcStreak(habit.id, todayKey());
    const best = bestStreak(habit.id);
    const cycleLabel = statsCycle === "7" ? "近7天" : statsCycle === "month" ? "本月" : "本年";

    cards.style.setProperty("--habit-color", habit.color);
    cards.innerHTML = `
      <div class="stat-card" style="--habit-color:${habit.color}">
        <div class="stat-label">${cycleLabel}完成</div>
        <div class="stat-value">${count}</div>
        <div class="stat-sub">共 ${totalDays} 天 · 完成率 ${rate}%</div>
      </div>
      <div class="stat-card" style="--habit-color:${habit.color}">
        <div class="stat-label">当前连续</div>
        <div class="stat-value">${streak}</div>
        <div class="stat-sub">天</div>
      </div>
      <div class="stat-card wide" style="--habit-color:${habit.color}">
        <div class="stat-label">历史最长连续</div>
        <div class="stat-value">${best} <span style="font-size:0.9rem;font-weight:600;color:var(--muted)">天</span></div>
        <div class="stat-sub">${habit.icon} ${escapeHtml(habit.name)} · ${startKey} ~ ${endKey}</div>
      </div>`;

    if (!dates.length) {
      datesEl.innerHTML = `<li class="empty-dates">该周期内暂无打卡记录</li>`;
    } else {
      datesEl.innerHTML = dates
        .map(
          (k) =>
            `<li style="--habit-color:${habit.color}"><span class="dot"></span><span>${formatDisplay(k)}</span></li>`
        )
        .join("");
    }
  }

  document.querySelectorAll(".cycle").forEach((btn) => {
    btn.addEventListener("click", () => {
      statsCycle = btn.dataset.cycle;
      document.querySelectorAll(".cycle").forEach((c) => c.classList.toggle("active", c === btn));
      renderStats();
    });
  });
  $("statsHabitSelect").addEventListener("change", renderStats);

  // ---------- manage ----------
  function renderManage() {
    const list = $("manageList");
    const empty = $("manageEmpty");
    if (!store.habits.length) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    const today = todayKey();
    list.innerHTML = store.habits
      .map((h) => {
        const total = (store.checks[h.id] || []).length;
        const streak = calcStreak(h.id, today);
        return `
        <article class="manage-card">
          <div class="habit-icon" style="--habit-color:${h.color};background:color-mix(in srgb, ${h.color} 18%, #fff)">${h.icon}</div>
          <div class="habit-info">
            <div class="habit-name">${escapeHtml(h.name)}</div>
            <div class="habit-meta">累计 ${total} 次 · 连续 ${streak} 天${h.note ? " · " + escapeHtml(h.note) : ""}</div>
          </div>
          <div class="manage-actions">
            <button type="button" class="btn btn-edit" data-edit="${h.id}">编辑</button>
            <button type="button" class="btn btn-del" data-del="${h.id}">删除</button>
          </div>
        </article>`;
      })
      .join("");

    list.querySelectorAll("[data-edit]").forEach((b) => {
      b.addEventListener("click", () => openModal(b.getAttribute("data-edit")));
    });
    list.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", () => openConfirm(b.getAttribute("data-del")));
    });
  }

  // ---------- modal create/edit ----------
  function buildPickers() {
    $("iconGrid").innerHTML = ICONS.map(
      (ic) => `<button type="button" class="icon-opt ${ic === selectedIcon ? "selected" : ""}" data-icon="${ic}">${ic}</button>`
    ).join("");
    $("colorGrid").innerHTML = COLORS.map(
      (c) =>
        `<button type="button" class="color-opt ${c === selectedColor ? "selected" : ""}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`
    ).join("");

    $("iconGrid").querySelectorAll("[data-icon]").forEach((b) => {
      b.addEventListener("click", () => {
        selectedIcon = b.getAttribute("data-icon");
        buildPickers();
      });
    });
    $("colorGrid").querySelectorAll("[data-color]").forEach((b) => {
      b.addEventListener("click", () => {
        selectedColor = b.getAttribute("data-color");
        buildPickers();
      });
    });
  }

  function openModal(editId) {
    $("editId").value = editId || "";
    if (editId) {
      const h = store.habits.find((x) => x.id === editId);
      if (!h) return;
      $("modalTitle").textContent = "编辑习惯";
      $("habitName").value = h.name;
      $("habitNote").value = h.note || "";
      selectedIcon = h.icon;
      selectedColor = h.color;
    } else {
      $("modalTitle").textContent = "新建习惯";
      $("habitName").value = "";
      $("habitNote").value = "";
      selectedIcon = ICONS[Math.floor(Math.random() * ICONS.length)];
      selectedColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    }
    buildPickers();
    $("modal").classList.remove("hidden");
    setTimeout(() => $("habitName").focus(), 50);
  }

  function closeModal() {
    $("modal").classList.add("hidden");
  }

  $("btnAdd").addEventListener("click", () => openModal(null));
  $("btnAddFromToday").addEventListener("click", () => openModal(null));
  $("btnCancel").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", closeModal);

  $("habitForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("habitName").value.trim();
    if (!name) {
      toast("请填写习惯名称");
      return;
    }
    const note = $("habitNote").value.trim();
    const editId = $("editId").value;
    if (editId) {
      const h = store.habits.find((x) => x.id === editId);
      if (h) {
        h.name = name;
        h.note = note;
        h.icon = selectedIcon;
        h.color = selectedColor;
      }
      toast("已保存修改");
    } else {
      store.habits.push({
        id: uid(),
        name,
        icon: selectedIcon,
        color: selectedColor,
        note,
        createdAt: new Date().toISOString(),
      });
      toast("习惯已创建");
    }
    save(store);
    closeModal();
    fillHabitSelects();
    const active = document.querySelector(".tab.active");
    switchTab(active ? active.dataset.tab : "today");
  });

  // ---------- delete confirm ----------
  function openConfirm(id) {
    const h = store.habits.find((x) => x.id === id);
    if (!h) return;
    pendingDeleteId = id;
    $("confirmText").textContent = `确定删除「${h.name}」吗？打卡记录也会一并清除，无法恢复。`;
    $("confirmModal").classList.remove("hidden");
  }

  function closeConfirm() {
    pendingDeleteId = null;
    $("confirmModal").classList.add("hidden");
  }

  $("btnConfirmCancel").addEventListener("click", closeConfirm);
  $("confirmBackdrop").addEventListener("click", closeConfirm);
  $("btnConfirmDelete").addEventListener("click", () => {
    if (!pendingDeleteId) return;
    store.habits = store.habits.filter((h) => h.id !== pendingDeleteId);
    delete store.checks[pendingDeleteId];
    save(store);
    toast("已删除");
    closeConfirm();
    fillHabitSelects();
    const active = document.querySelector(".tab.active");
    switchTab(active ? active.dataset.tab : "habits");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeConfirm();
    }
  });

  // ---------- init ----------
  setTodayLabel();
  fillHabitSelects();
  renderToday();
})();
