(() => {
  "use strict";

  const STORAGE_KEY = "creative-toolbox-timeline-planner-v1";
  /* === cloud sync === */
  const SUPABASE_URL = "https://rvklyahwvczxtpqxdnpl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_GWRqFsgEVaa02WKtGQkAfw_8NCVDxvj";
  const BUCKET_NAME = "design-images";
  let supabase = null;

  function initSupabase() {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        db: { schema: "public" }
      });
    } catch (e) {
      console.warn("Supabase init failed", e);
    }
  }

  async function cloudLoad(fileName) {
    if (!supabase) return null;
    try {
      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
      const res = await fetch(data.publicUrl + "?t=" + Date.now());
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("Cloud load failed", e);
      return null;
    }
  }

  async function cloudSave(fileName, data) {
    if (!supabase) return;
    try {
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      await supabase.storage.from(BUCKET_NAME).upload(fileName, blob, {
        upsert: true,
        cacheControl: "0"
      });
    } catch (e) {
      console.warn("Cloud save error", e);
    }
  }

  const DAY_WIDTH = 36;
  const STATUS_LABELS = {
    "not-started": "未开始",
    "in-progress": "进行中",
    "completed": "已完成",
    "at-risk": "有风险"
  };

  const TEMPLATES = {
    cultural: {
      label: "文创产品开发",
      description: "从需求确认到正式上线",
      tasks: [
        ["需求确认", "需求确认", 0, 3],
        ["文化资料整理", "资料整理", 3, 6],
        ["产品方向确定", "概念设计", 8, 5],
        ["视觉设计", "概念设计", 13, 9],
        ["供应商询价", "供应商询价", 17, 6],
        ["首轮打样", "打样", 23, 10],
        ["样品修改", "修改", 34, 7],
        ["确认生产", "方案确认", 42, 3],
        ["批量生产", "生产", 45, 18],
        ["质检与入库", "质检", 64, 5],
        ["正式上线", "上线", 70, 2]
      ]
    },
    brand: {
      label: "品牌设计项目",
      description: "从品牌调研到视觉交付",
      tasks: [
        ["需求访谈", "需求确认", 0, 3],
        ["品牌与竞品调研", "资料整理", 3, 6],
        ["策略方向确认", "方案确认", 9, 4],
        ["视觉概念设计", "概念设计", 13, 8],
        ["首轮方案提报", "方案确认", 22, 2],
        ["方案修改", "修改", 24, 7],
        ["应用延展", "概念设计", 31, 8],
        ["文件整理与交付", "上线", 40, 3]
      ]
    },
    event: {
      label: "活动策划",
      description: "从活动立项到复盘归档",
      tasks: [
        ["活动目标确认", "需求确认", 0, 3],
        ["方案与预算", "概念设计", 3, 6],
        ["场地与供应商确认", "供应商询价", 8, 7],
        ["视觉物料设计", "概念设计", 12, 9],
        ["嘉宾与传播确认", "方案确认", 16, 8],
        ["物料制作", "生产", 22, 10],
        ["现场执行准备", "上线", 31, 5],
        ["活动执行", "上线", 37, 2],
        ["复盘与资料归档", "资料整理", 40, 4]
      ]
    },
    blank: {
      label: "空白项目",
      description: "",
      tasks: []
    }
  };

  let state = loadState();
  let activeView = "timeline";
  let selectedTemplate = "cultural";
  let saveTimer = null;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function uid(prefix = "id") {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return toISO(new Date());
  }

  function addDays(value, days) {
    const date = typeof value === "string" ? parseDate(value) : new Date(value);
    date.setDate(date.getDate() + Number(days));
    return toISO(date);
  }

  function differenceInDays(startValue, endValue) {
    const start = parseDate(startValue);
    const end = parseDate(endValue);
    if (!start || !end) return 0;
    return Math.round((end - start) / 86400000);
  }

  function dateRange(startValue, endValue) {
    const count = Math.max(0, differenceInDays(startValue, endValue)) + 1;
    return Array.from({ length: count }, (_, index) => addDays(startValue, index));
  }

  function formatDate(value, withYear = false) {
    const date = parseDate(value);
    if (!date) return "未设置";
    return new Intl.DateTimeFormat("zh-CN", {
      ...(withYear ? { year: "numeric" } : {}),
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function formatUpdated(value) {
    if (!value) return "刚刚更新";
    const date = new Date(value);
    return `${date.toLocaleDateString("zh-CN")} ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit", minute: "2-digit", hour12: false
    })}`;
  }

  function normalizeTask(task = {}) {
    return {
      id: task.id || uid("task"),
      name: String(task.name || "未命名任务"),
      phase: String(task.phase || ""),
      owner: String(task.owner || ""),
      start: String(task.start || ""),
      end: String(task.end || ""),
      status: STATUS_LABELS[task.status] ? task.status : "not-started",
      dependencyId: String(task.dependencyId || ""),
      notes: String(task.notes || "")
    };
  }

  function normalizeProject(project = {}) {
    const start = project.start || todayISO();
    const end = project.end || addDays(start, 45);
    return {
      id: project.id || uid("project"),
      name: String(project.name || "未命名排期"),
      description: String(project.description || ""),
      start,
      end,
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: project.updatedAt || new Date().toISOString(),
      tasks: Array.isArray(project.tasks) ? project.tasks.map(normalizeTask) : []
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, projects: [], activeProjectId: "" };
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        projects: Array.isArray(parsed.projects) ? parsed.projects.map(normalizeProject) : [],
        activeProjectId: String(parsed.activeProjectId || "")
      };
    } catch (error) {
      console.warn("Unable to read Timeline Planner data", error);
      return { version: 1, projects: [], activeProjectId: "" };
    }
  }

  function saveState(immediate = false) {
    $("#saveStatus").textContent = "正在保存…";
    $("#saveStatus").className = "save-status saving";

    const persist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        cloudSave("timeline-planner-store.json", state);
        $("#saveStatus").textContent = `已保存 · ${new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit", minute: "2-digit", hour12: false
        })}`;
        $("#saveStatus").className = "save-status saved";
      } catch (error) {
        console.error(error);
        $("#saveStatus").textContent = "保存失败，请导出备份";
        $("#saveStatus").className = "save-status error";
        toast("浏览器存储空间不足，请先导出 JSON 备份。", "error");
      }
    };

    clearTimeout(saveTimer);
    if (immediate) persist();
    else saveTimer = setTimeout(persist, 320);
  }

  function currentProject() {
    return state.projects.find(project => project.id === state.activeProjectId) || null;
  }

  function touchProject(project) {
    project.updatedAt = new Date().toISOString();
    saveState();
  }

  function findTask(project, taskId) {
    return project.tasks.find(task => task.id === taskId) || null;
  }

  function evaluateProjectRisks(project) {
    const risks = [];
    const today = todayISO();

    project.tasks.forEach(task => {
      const taskName = task.name || "未命名任务";
      const start = parseDate(task.start);
      const end = parseDate(task.end);

      if (!task.owner.trim()) {
        risks.push({
          id: `${task.id}-owner`,
          taskId: task.id,
          level: "medium",
          title: `${taskName} 尚未设置负责人`,
          text: "没有负责人时，任务容易在交接过程中被遗漏。"
        });
      }

      if (!start || !end) {
        risks.push({
          id: `${task.id}-date`,
          taskId: task.id,
          level: "high",
          title: `${taskName} 的日期不完整`,
          text: "请补充开始日期和截止日期，才能正确生成时间轴。"
        });
      } else if (task.end < task.start) {
        risks.push({
          id: `${task.id}-date-order`,
          taskId: task.id,
          level: "high",
          title: `${taskName} 的截止日期早于开始日期`,
          text: `${formatDate(task.start, true)} → ${formatDate(task.end, true)}，请修正日期。`
        });
      }

      if (task.end && task.end < today && task.status !== "completed") {
        const overdueDays = differenceInDays(task.end, today);
        risks.push({
          id: `${task.id}-overdue`,
          taskId: task.id,
          level: "high",
          title: `${taskName} 已延期 ${overdueDays} 天`,
          text: `原定 ${formatDate(task.end, true)} 截止，当前状态为“${STATUS_LABELS[task.status]}”。`
        });
      }

      if (task.status === "at-risk") {
        risks.push({
          id: `${task.id}-marked-risk`,
          taskId: task.id,
          level: "high",
          title: `${taskName} 已被标记为有风险`,
          text: task.notes || "请检查任务进度并补充风险说明。"
        });
      }

      if (task.dependencyId) {
        const dependency = findTask(project, task.dependencyId);
        if (!dependency) {
          risks.push({
            id: `${task.id}-missing-dependency`,
            taskId: task.id,
            level: "medium",
            title: `${taskName} 的前置任务不存在`,
            text: "原前置任务可能已被删除，请重新选择依赖关系。"
          });
        } else if (dependency.status !== "completed" &&
          (task.status !== "not-started" || (task.start && task.start <= today))) {
          risks.push({
            id: `${task.id}-dependency`,
            taskId: task.id,
            level: "medium",
            title: `${taskName} 的前置任务尚未完成`,
            text: `“${dependency.name}”当前为“${STATUS_LABELS[dependency.status]}”。`
          });
        }
      }

      if (task.start && project.start && task.start < project.start) {
        risks.push({
          id: `${task.id}-before-project`,
          taskId: task.id,
          level: "medium",
          title: `${taskName} 早于项目开始日期`,
          text: `任务从 ${formatDate(task.start, true)} 开始，项目从 ${formatDate(project.start, true)} 开始。`
        });
      }

      if (task.end && project.end && task.end > project.end) {
        risks.push({
          id: `${task.id}-after-project`,
          taskId: task.id,
          level: "medium",
          title: `${taskName} 超出项目结束日期`,
          text: `任务到 ${formatDate(task.end, true)} 结束，项目计划于 ${formatDate(project.end, true)} 结束。`
        });
      }
    });

    return risks;
  }

  function statusClass(task, risks) {
    if (task.status === "completed") return "completed";
    if (task.status === "at-risk" || risks.some(risk => risk.taskId === task.id && risk.level === "high")) return "at-risk";
    return task.status;
  }

  function renderDashboard() {
    const query = $("#projectSearchInput").value.trim().toLowerCase();
    const filtered = state.projects
      .filter(project => project.name.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const allRisks = state.projects.flatMap(evaluateProjectRisks);
    $("#summaryProjects").textContent = state.projects.length;
    $("#summaryTasks").textContent = state.projects.reduce((sum, project) => sum + project.tasks.length, 0);
    $("#summaryRisks").textContent = allRisks.length;

    $("#emptyDashboard").hidden = state.projects.length !== 0;
    $("#projectGrid").hidden = state.projects.length === 0;

    $("#projectGrid").innerHTML = filtered.map(project => {
      const risks = evaluateProjectRisks(project);
      const completed = project.tasks.filter(task => task.status === "completed").length;
      const progress = project.tasks.length ? Math.round(completed / project.tasks.length * 100) : 0;

      return `
        <article class="project-card" data-project-id="${project.id}" tabindex="0" role="button">
          <div class="project-card-top">
            <span class="project-card-icon">⌁</span>
            ${risks.length ? `<span class="project-risk-badge">${risks.length} 项提醒</span>` : ""}
          </div>
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.description || `${formatDate(project.start, true)}—${formatDate(project.end, true)}`)}</p>
          <div class="project-card-footer">
            <span>${project.tasks.length} 个任务 · ${progress}% 完成</span>
            <button class="card-delete-button" type="button" data-delete-project="${project.id}" aria-label="删除 ${escapeHtml(project.name)}">删除</button>
          </div>
        </article>
      `;
    }).join("");

    $$(".project-card").forEach(card => {
      const open = event => {
        if (event.target.closest("[data-delete-project]")) return;
        state.activeProjectId = card.dataset.projectId;
        saveState(true);
        showWorkspace();
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(event);
        }
      });
    });

    $$("[data-delete-project]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        const project = state.projects.find(item => item.id === button.dataset.deleteProject);
        if (!project) return;
        if (!confirm(`确定删除“${project.name}”吗？此操作无法撤销。`)) return;
        state.projects = state.projects.filter(item => item.id !== project.id);
        if (state.activeProjectId === project.id) state.activeProjectId = "";
        saveState(true);
        renderDashboard();
        toast("排期已删除");
      });
    });
  }

  function getTimelineBounds(project) {
    const dates = [
      project.start,
      project.end,
      ...project.tasks.flatMap(task => [task.start, task.end])
    ].filter(value => parseDate(value)).sort();

    let start = dates[0] || todayISO();
    let end = dates[dates.length - 1] || addDays(start, 30);

    if (differenceInDays(start, end) < 13) end = addDays(start, 13);
    if (differenceInDays(start, end) > 365) end = addDays(start, 365);

    return { start, end };
  }

  function timelineLabelWidth() {
    if (window.innerWidth <= 520) return 175;
    if (window.innerWidth <= 760) return 210;
    return 260;
  }

  function renderTimeline(project, risks) {
    const tasks = [...project.tasks].sort((a, b) =>
      (a.start || "9999").localeCompare(b.start || "9999") || a.name.localeCompare(b.name)
    );
    $("#timelineEmpty").hidden = tasks.length !== 0;
    $("#timelineScroller").hidden = tasks.length === 0;
    if (!tasks.length) {
      $("#timelineCanvas").innerHTML = "";
      return;
    }

    const bounds = getTimelineBounds(project);
    const days = dateRange(bounds.start, bounds.end);
    const labelWidth = timelineLabelWidth();
    const trackWidth = days.length * DAY_WIDTH;
    const totalWidth = labelWidth + trackWidth;
    const today = todayISO();

    const dayHeaders = days.map(day => {
      const date = parseDate(day);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      return `<div class="day-head ${weekend ? "weekend" : ""} ${day === today ? "today" : ""}">
        ${date.getMonth() + 1}月
        <strong>${date.getDate()}</strong>
      </div>`;
    }).join("");

    const rows = tasks.map(task => {
      const startOffset = Math.max(0, differenceInDays(bounds.start, task.start));
      const rawDuration = differenceInDays(task.start, task.end) + 1;
      const duration = Math.max(1, rawDuration);
      const clippedDuration = Math.min(duration, days.length - startOffset);
      const barLeft = startOffset * DAY_WIDTH + 4;
      const barWidth = Math.max(28, clippedDuration * DAY_WIDTH - 8);
      const taskStatus = statusClass(task, risks);
      const taskRisks = risks.filter(risk => risk.taskId === task.id);
      const todayOffset = today >= bounds.start && today <= bounds.end
        ? differenceInDays(bounds.start, today) * DAY_WIDTH
        : null;

      return `
        <div class="timeline-row" style="grid-template-columns:${labelWidth}px ${trackWidth}px;width:${totalWidth}px">
          <div class="timeline-label">
            <button class="timeline-task-button" type="button" data-edit-task="${task.id}">
              <strong title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</strong>
              <small>${escapeHtml(task.owner || "未设置负责人")} · ${escapeHtml(task.phase || "未分阶段")}${taskRisks.length ? ` · ${taskRisks.length} 项提醒` : ""}</small>
            </button>
          </div>
          <div class="timeline-track" style="width:${trackWidth}px">
            ${todayOffset !== null ? `<span class="today-line" style="left:${todayOffset}px"></span>` : ""}
            <button class="timeline-bar ${taskStatus}" type="button" data-edit-task="${task.id}"
              style="left:${barLeft}px;width:${barWidth}px"
              title="${escapeHtml(task.name)}：${formatDate(task.start, true)}—${formatDate(task.end, true)}">
              ${escapeHtml(task.name)}
            </button>
          </div>
        </div>
      `;
    }).join("");

    $("#timelineCanvas").style.width = `${totalWidth}px`;
    $("#timelineCanvas").innerHTML = `
      <div class="timeline-header" style="grid-template-columns:${labelWidth}px ${trackWidth}px;width:${totalWidth}px">
        <div class="timeline-label-head">任务 / 负责人</div>
        <div class="timeline-days" style="grid-template-columns:repeat(${days.length},${DAY_WIDTH}px)">${dayHeaders}</div>
      </div>
      ${rows}
    `;

    bindTaskEditButtons();
  }

  function renderTaskTable(project, risks) {
    $("#listEmpty").hidden = project.tasks.length !== 0;
    $(".table-wrap").hidden = project.tasks.length === 0;

    const sortedTasks = [...project.tasks].sort((a, b) =>
      (a.start || "9999").localeCompare(b.start || "9999")
    );

    $("#taskTableBody").innerHTML = sortedTasks.map(task => {
      const taskRisks = risks.filter(risk => risk.taskId === task.id);
      return `
        <tr>
          <td class="task-name-cell">
            <strong>${escapeHtml(task.name)}</strong>
            <small>${escapeHtml(task.notes || "暂无备注")}</small>
          </td>
          <td>${escapeHtml(task.phase || "—")}</td>
          <td>${escapeHtml(task.owner || "未设置")}</td>
          <td>${formatDate(task.start)}</td>
          <td>${formatDate(task.end)}</td>
          <td><span class="status-pill ${task.status}">${STATUS_LABELS[task.status]}</span></td>
          <td>${taskRisks.length
            ? `<span class="risk-pill">${taskRisks.length} 项</span>`
            : `<span class="risk-pill ok">正常</span>`}
          </td>
          <td><button class="row-menu-button" type="button" data-edit-task="${task.id}" aria-label="编辑 ${escapeHtml(task.name)}">编辑</button></td>
        </tr>
      `;
    }).join("");

    bindTaskEditButtons();
  }

  function renderRisks(project, risks) {
    $("#risksEmpty").hidden = risks.length !== 0;
    $("#riskList").hidden = risks.length === 0;
    $("#riskList").innerHTML = risks.map(risk => `
      <button class="risk-item ${risk.level}" type="button" data-edit-task="${risk.taskId}">
        <span class="risk-symbol">${risk.level === "high" ? "!" : "△"}</span>
        <span>
          <h3>${escapeHtml(risk.title)}</h3>
          <p>${escapeHtml(risk.text)}</p>
        </span>
      </button>
    `).join("");
    bindTaskEditButtons();
  }

  function renderWorkspace() {
    const project = currentProject();
    if (!project) {
      showDashboard();
      return;
    }

    const risks = evaluateProjectRisks(project);
    $("#projectNameInput").value = project.name;
    $("#projectDescriptionInput").value = project.description;
    $("#projectStartInput").value = project.start;
    $("#projectEndInput").value = project.end;
    $("#projectMeta").textContent = `${project.tasks.length} 个任务 · 更新于 ${formatUpdated(project.updatedAt)}`;

    $("#riskTabCount").textContent = risks.length;
    $("#riskBanner").hidden = risks.length === 0;
    if (risks.length) {
      const highCount = risks.filter(risk => risk.level === "high").length;
      $("#riskBannerTitle").textContent = `${risks.length} 项排期提醒${highCount ? `，其中 ${highCount} 项需要优先处理` : ""}`;
      $("#riskBannerText").textContent = risks[0].title;
    }

    renderTimeline(project, risks);
    renderTaskTable(project, risks);
    renderRisks(project, risks);
    setActiveView(activeView);
  }

  function setActiveView(view) {
    activeView = view;
    $("#timelinePanel").hidden = view !== "timeline";
    $("#listPanel").hidden = view !== "list";
    $("#risksPanel").hidden = view !== "risks";
    $$(".view-tab").forEach(button => {
      button.classList.toggle("active", button.dataset.view === view);
    });
  }

  function showDashboard() {
    state.activeProjectId = "";
    saveState(true);
    $("#workspaceView").hidden = true;
    $("#dashboardView").hidden = false;
    $("#exportMenu").hidden = true;
    renderDashboard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showWorkspace() {
    if (!currentProject()) {
      showDashboard();
      return;
    }
    $("#dashboardView").hidden = true;
    $("#workspaceView").hidden = false;
    activeView = "timeline";
    renderWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCreateModal() {
    selectedTemplate = "cultural";
    $$(".template-card").forEach(card => card.classList.toggle("selected", card.dataset.template === selectedTemplate));
    const start = todayISO();
    $("#createProjectNameInput").value = "";
    $("#createProjectStartInput").value = start;
    $("#createProjectEndInput").value = addDays(start, 75);
    $("#createModal").hidden = false;
    setTimeout(() => $("#createProjectNameInput").focus(), 30);
  }

  function closeCreateModal() {
    $("#createModal").hidden = true;
  }

  function buildTemplateTasks(templateKey, start) {
    const template = TEMPLATES[templateKey] || TEMPLATES.blank;
    let previousId = "";
    return template.tasks.map(([name, phase, offset, duration], index) => {
      const id = uid("task");
      const task = {
        id,
        name,
        phase,
        owner: "",
        start: addDays(start, offset),
        end: addDays(start, offset + duration - 1),
        status: "not-started",
        dependencyId: index > 0 ? previousId : "",
        notes: ""
      };
      previousId = id;
      return task;
    });
  }

  function createProject() {
    const name = $("#createProjectNameInput").value.trim();
    const start = $("#createProjectStartInput").value;
    const end = $("#createProjectEndInput").value;

    if (!name) {
      toast("请填写项目名称。", "error");
      $("#createProjectNameInput").focus();
      return;
    }
    if (!start || !end || end < start) {
      toast("请设置有效的项目起止日期。", "error");
      return;
    }

    const template = TEMPLATES[selectedTemplate];
    const project = normalizeProject({
      id: uid("project"),
      name,
      description: template.description,
      start,
      end,
      tasks: buildTemplateTasks(selectedTemplate, start)
    });

    state.projects.unshift(project);
    state.activeProjectId = project.id;
    saveState(true);
    closeCreateModal();
    showWorkspace();
    toast("排期已创建", "success");
  }

  function populateDependencyOptions(project, currentTaskId = "", selectedId = "") {
    $("#taskDependencyInput").innerHTML = `
      <option value="">无</option>
      ${project.tasks
        .filter(task => task.id !== currentTaskId)
        .map(task => `<option value="${task.id}" ${task.id === selectedId ? "selected" : ""}>${escapeHtml(task.name)}</option>`)
        .join("")}
    `;
  }

  function openTaskModal(taskId = "") {
    const project = currentProject();
    if (!project) return;
    const task = taskId ? findTask(project, taskId) : null;
    $("#taskModalTitle").textContent = task ? "编辑任务" : "添加任务";
    $("#taskIdInput").value = task?.id || "";
    $("#taskNameInput").value = task?.name || "";
    $("#taskPhaseInput").value = task?.phase || "";
    $("#taskOwnerInput").value = task?.owner || "";
    $("#taskStartInput").value = task?.start || project.start || todayISO();
    $("#taskEndInput").value = task?.end || addDays(project.start || todayISO(), 2);
    $("#taskStatusInput").value = task?.status || "not-started";
    $("#taskNotesInput").value = task?.notes || "";
    populateDependencyOptions(project, task?.id || "", task?.dependencyId || "");
    $("#deleteTaskButton").hidden = !task;
    $("#taskModal").hidden = false;
    setTimeout(() => $("#taskNameInput").focus(), 30);
  }

  function closeTaskModal() {
    $("#taskModal").hidden = true;
  }

  function saveTask(event) {
    event.preventDefault();
    const project = currentProject();
    if (!project) return;

    const values = {
      name: $("#taskNameInput").value.trim(),
      phase: $("#taskPhaseInput").value.trim(),
      owner: $("#taskOwnerInput").value.trim(),
      start: $("#taskStartInput").value,
      end: $("#taskEndInput").value,
      status: $("#taskStatusInput").value,
      dependencyId: $("#taskDependencyInput").value,
      notes: $("#taskNotesInput").value.trim()
    };

    if (!values.name) {
      toast("请填写任务名称。", "error");
      return;
    }
    if (!values.start || !values.end || values.end < values.start) {
      toast("任务截止日期不能早于开始日期。", "error");
      return;
    }

    const id = $("#taskIdInput").value;
    if (id) {
      const task = findTask(project, id);
      if (task) Object.assign(task, values);
    } else {
      project.tasks.push(normalizeTask({ id: uid("task"), ...values }));
    }

    touchProject(project);
    closeTaskModal();
    renderWorkspace();
    toast(id ? "任务已更新" : "任务已添加", "success");
  }

  function deleteCurrentTask() {
    const project = currentProject();
    const taskId = $("#taskIdInput").value;
    const task = findTask(project, taskId);
    if (!task) return;
    if (!confirm(`确定删除“${task.name}”吗？`)) return;

    project.tasks = project.tasks
      .filter(item => item.id !== taskId)
      .map(item => item.dependencyId === taskId ? { ...item, dependencyId: "" } : item);

    touchProject(project);
    closeTaskModal();
    renderWorkspace();
    toast("任务已删除");
  }

  function bindTaskEditButtons() {
    $$("[data-edit-task]").forEach(button => {
      button.addEventListener("click", () => openTaskModal(button.dataset.editTask));
    });
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function safeFilename(value) {
    return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "timeline";
  }

  function exportProjectJson() {
    const project = currentProject();
    if (!project) return;
    downloadFile(
      `${safeFilename(project.name)}-timeline.json`,
      JSON.stringify({ type: "creative-toolbox-timeline", version: 1, project }, null, 2),
      "application/json;charset=utf-8"
    );
    toast("JSON 备份已导出", "success");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportProjectCsv() {
    const project = currentProject();
    if (!project) return;
    const rows = [
      ["任务", "阶段", "负责人", "开始日期", "截止日期", "状态", "前置任务", "备注"],
      ...project.tasks.map(task => {
        const dependency = findTask(project, task.dependencyId);
        return [
          task.name, task.phase, task.owner, task.start, task.end,
          STATUS_LABELS[task.status], dependency?.name || "", task.notes
        ];
      })
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
    downloadFile(`${safeFilename(project.name)}-tasks.csv`, csv, "text/csv;charset=utf-8");
    toast("CSV 清单已导出", "success");
  }

  function importProject(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const sourceProject = data.project || data;
        if (!sourceProject || typeof sourceProject !== "object" || !Array.isArray(sourceProject.tasks)) {
          throw new Error("文件中没有有效排期");
        }
        const project = normalizeProject({
          ...sourceProject,
          id: uid("project"),
          name: `${sourceProject.name || "导入排期"}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tasks: sourceProject.tasks.map(task => ({ ...task, id: uid("task") }))
        });

        // Dependencies from exported IDs cannot safely survive ID regeneration.
        project.tasks.forEach(task => { task.dependencyId = ""; });

        state.projects.unshift(project);
        state.activeProjectId = project.id;
        saveState(true);
        showWorkspace();
        toast("排期已导入；请重新确认前置任务。", "success");
      } catch (error) {
        console.error(error);
        toast("无法导入该文件，请确认它是 Timeline Planner JSON。", "error");
      } finally {
        $("#importFileInput").value = "";
      }
    };
    reader.readAsText(file);
  }

  function duplicateProject() {
    const project = currentProject();
    if (!project) return;
    const idMap = new Map(project.tasks.map(task => [task.id, uid("task")]));
    const tasks = project.tasks.map(task => ({
      ...task,
      id: idMap.get(task.id),
      dependencyId: idMap.get(task.dependencyId) || ""
    }));

    const copy = normalizeProject({
      ...project,
      id: uid("project"),
      name: `${project.name} 副本`,
      tasks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    state.projects.unshift(copy);
    state.activeProjectId = copy.id;
    saveState(true);
    renderWorkspace();
    toast("排期副本已创建", "success");
  }

  function positionExportMenu() {
    const button = $("#exportMenuButton");
    const menu = $("#exportMenu");
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${Math.max(12, rect.right - 190)}px`;
  }

  function locateToday() {
    const project = currentProject();
    if (!project) return;
    const bounds = getTimelineBounds(project);
    const today = todayISO();
    if (today < bounds.start || today > bounds.end) {
      toast("今天不在当前时间轴范围内。");
      return;
    }
    const offset = differenceInDays(bounds.start, today) * DAY_WIDTH;
    $("#timelineScroller").scrollTo({ left: Math.max(0, offset - 180), behavior: "smooth" });
  }

  function toast(message, kind = "") {
    const element = $("#toast");
    element.textContent = message;
    element.className = `toast ${kind}`.trim();
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.hidden = true; }, 2800);
  }

  function bindEvents() {
    $("#openCreateButton").addEventListener("click", openCreateModal);
    $$('[data-action="open-create"]').forEach(button => button.addEventListener("click", openCreateModal));
    $$('[data-action="close-modal"]').forEach(button => button.addEventListener("click", closeCreateModal));
    $$('[data-action="close-task-modal"]').forEach(button => button.addEventListener("click", closeTaskModal));
    $$('[data-action="add-task"]').forEach(button => button.addEventListener("click", () => openTaskModal()));
    $("#createProjectConfirmButton").addEventListener("click", createProject);
    $("#addTaskButton").addEventListener("click", () => openTaskModal());
    $("#taskForm").addEventListener("submit", saveTask);
    $("#deleteTaskButton").addEventListener("click", deleteCurrentTask);
    $("#backToDashboardButton").addEventListener("click", showDashboard);
    $("#projectSearchInput").addEventListener("input", renderDashboard);
    $("#importProjectButton").addEventListener("click", () => $("#importFileInput").click());
    $("#importFileInput").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) importProject(file);
    });
    $("#duplicateProjectButton").addEventListener("click", duplicateProject);
    $("#todayButton").addEventListener("click", locateToday);
    $("#showRisksButton").addEventListener("click", () => setActiveView("risks"));

    $$(".template-card").forEach(card => {
      card.addEventListener("click", () => {
        selectedTemplate = card.dataset.template;
        $$(".template-card").forEach(item => item.classList.toggle("selected", item === card));
        if (!$("#createProjectNameInput").value.trim() && selectedTemplate !== "blank") {
          $("#createProjectNameInput").placeholder = `例如：${TEMPLATES[selectedTemplate].label}`;
        }
      });
    });

    $$(".view-tab").forEach(button => {
      button.addEventListener("click", () => setActiveView(button.dataset.view));
    });

    ["projectNameInput", "projectDescriptionInput", "projectStartInput", "projectEndInput"].forEach(id => {
      $(`#${id}`).addEventListener(id.includes("Name") || id.includes("Description") ? "input" : "change", event => {
        const project = currentProject();
        if (!project) return;
        if (id === "projectNameInput") project.name = event.target.value.trim() || "未命名排期";
        if (id === "projectDescriptionInput") project.description = event.target.value;
        if (id === "projectStartInput") project.start = event.target.value;
        if (id === "projectEndInput") project.end = event.target.value;
        touchProject(project);
        renderWorkspace();
      });
    });

    $("#exportMenuButton").addEventListener("click", event => {
      event.stopPropagation();
      const menu = $("#exportMenu");
      menu.hidden = !menu.hidden;
      if (!menu.hidden) positionExportMenu();
    });

    $$("[data-export]").forEach(button => {
      button.addEventListener("click", () => {
        $("#exportMenu").hidden = true;
        if (button.dataset.export === "json") exportProjectJson();
        if (button.dataset.export === "csv") exportProjectCsv();
        if (button.dataset.export === "print") window.print();
      });
    });

    document.addEventListener("click", event => {
      if (!event.target.closest("#exportMenu") && !event.target.closest("#exportMenuButton")) {
        $("#exportMenu").hidden = true;
      }
    });

    $("#createModal").addEventListener("click", event => {
      if (event.target === $("#createModal")) closeCreateModal();
    });
    $("#taskModal").addEventListener("click", event => {
      if (event.target === $("#taskModal")) closeTaskModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeCreateModal();
        closeTaskModal();
        $("#exportMenu").hidden = true;
      }
    });

    window.addEventListener("resize", () => {
      if (!$("#workspaceView").hidden && activeView === "timeline") renderWorkspace();
    });
  }

  initSupabase();
  cloudLoad("timeline-planner-store.json").then(cloud => {
    if (cloud && cloud.version && (!state.version || cloud.version >= state.version)) {
      state = cloud;
      saveState(true);
    }
  });
  bindEvents();
  if (state.activeProjectId && currentProject()) showWorkspace();
  else renderDashboard();
})();
