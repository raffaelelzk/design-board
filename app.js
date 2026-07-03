(() => {
  "use strict";

  const DB_NAME = "design-board-local";
  const DB_VERSION = 1;
  const OBJECT_STORE = "app-data";
  const APP_KEY = "design-board-store-v2";
  const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
  const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
  const SAVE_DELAY = 250;

  const PHASES = {
    research: { label: "调研", className: "phase-research" },
    extract: { label: "提取", className: "phase-extract" },
    design: { label: "设计", className: "phase-design" },
    dev: { label: "打样", className: "phase-dev" },
    launch: { label: "量产", className: "phase-launch" }
  };
  const PHASE_ORDER = Object.keys(PHASES);
  const EMOJIS = ["📁", "📋", "🎨", "🚀", "💡", "🎯", "📦", "⭐", "🌟", "🔥", "💎", "🎪", "🏆", "📚", "✏️", "🖌️"];
  const THEME_COLORS = ["#b8872d", "#5d7696", "#9a5f5a", "#4f7f69", "#755f91", "#8a6a49", "#567d86", "#a45f7a"];

  let database = null;
  let store = { version: 2, projects: {}, activeProjectId: null };
  let activeProject = null;
  let activeProjectId = null;
  let isReadOnly = false;
  let activeTab = 0;
  let selectedRows = new Set();
  let selectedEmoji = EMOJIS[0];
  let saveTimer = null;
  let saveInProgress = false;
  let pendingSave = false;
  let storageAvailable = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowText = () => new Date().toLocaleString("zh-CN", { hour12: false });
  const dateText = value => new Date(value || Date.now()).toLocaleDateString("zh-CN");
  const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatCopy = value => escapeHtml(value || "").replace(/\n/g, "<br>");
  const safeFilePart = value => String(value || "project")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";

  function emptyRow(themeId = "default_theme") {
    return {
      id: uid("row"),
      theme: themeId,
      name: "",
      category: "",
      phase: "research",
      targetPrice: "",
      estimatedCost: "",
      audience: "",
      channel: "",
      material: "",
      process: "",
      specs: "",
      supplier: "",
      moq: "",
      delivery: "",
      sampleStatus: "未开始",
      risk: "",
      owner: "",
      nextAction: "",
      story: "",
      visual: "",
      notes: "",
      img: "",
      conceptImg: "",
      ref: "",
      moodboard: [],
      elementExtract: "",
      designDraft: ""
    };
  }

  function defaultProject(id, name, icon = "📁") {
    return {
      id,
      name,
      icon,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      overview: "",
      meta: {
        client: "",
        objective: "",
        audience: "",
        channel: "",
        budget: "",
        deadline: ""
      },
      overviewFiles: [],
      themes: ["default_theme"],
      themeMeta: { default_theme: { label: "默认主题", color: THEME_COLORS[0] } },
      rows: [],
      versions: [],
      undoStack: [],
      redoStack: []
    };
  }

  function createDemoProject() {
    const project = defaultProject("demo_project", "燕园秋日 · 文创新品提案", "🏛️");
    project.overview = "围绕燕园秋日、校园记忆与日常使用场景，形成一组兼顾文化表达、成本控制和礼赠需求的文创产品提案。";
    project.meta = {
      client: "高校文创中心",
      objective: "完成秋季新品组合与第一轮打样建议",
      audience: "在校生、校友、校园访客",
      channel: "校园店、线上商城、校友活动",
      budget: "首批预算 8–12 万元",
      deadline: "8 月完成打样，9 月上市"
    };
    project.themes = ["autumn", "memory", "gift"];
    project.themeMeta = {
      autumn: { label: "燕园秋日", color: "#b8872d" },
      memory: { label: "校园记忆", color: "#5d7696" },
      gift: { label: "校友礼赠", color: "#755f91" }
    };
    project.rows = [
      {
        ...emptyRow("autumn"),
        id: "demo_row_1",
        name: "温感玻璃杯",
        category: "杯具",
        phase: "design",
        targetPrice: "¥68",
        estimatedCost: "¥22–26",
        audience: "学生 / 校友",
        channel: "校园店 / 线上",
        material: "高硼硅玻璃",
        process: "热敏变色印刷",
        specs: "350ml",
        supplier: "待比价",
        moq: "500",
        delivery: "确认稿后 25 天",
        sampleStatus: "结构样确认",
        owner: "产品组",
        nextAction: "确认温感油墨颜色与洗碗机测试",
        risk: "温感图层耐磨性需验证",
        story: "以博雅塔、未名湖与秋月为视觉线索，把校园记忆藏在温度变化中。",
        visual: "常温为克制的线描校园景观；倒入热饮后，银杏与人物剪影逐渐显现。",
        notes: "控制图层数量，避免成品颜色浑浊。"
      },
      {
        ...emptyRow("memory"),
        id: "demo_row_2",
        name: "纸雕夜灯",
        category: "家居灯具",
        phase: "dev",
        targetPrice: "¥128",
        estimatedCost: "¥48–55",
        audience: "校友 / 礼赠",
        channel: "校友活动 / 礼品采购",
        material: "米白艺术纸、榉木底座",
        process: "激光雕刻、层叠装配",
        specs: "160 × 160mm",
        supplier: "华东纸艺供应商",
        moq: "300",
        delivery: "样品确认后 30 天",
        sampleStatus: "第一次打样",
        owner: "设计组",
        nextAction: "减少层数并测试暖白光透光效果",
        risk: "运输易压损，包装成本偏高",
        story: "通过层叠纸雕，把不同年代的校园建筑与人物活动叠合在同一个夜晚。",
        visual: "外层为博雅塔，中层为水纹和银杏，内层为步行人物；点亮后形成纵深。",
        notes: "纸雕控制在五层以内，底座预留替换灯带结构。"
      },
      {
        ...emptyRow("gift"),
        id: "demo_row_3",
        name: "建筑纹样丝巾",
        category: "服饰配件",
        phase: "research",
        targetPrice: "¥198",
        estimatedCost: "¥72–88",
        audience: "校友 / 商务礼赠",
        channel: "定制礼赠 / 校友会",
        material: "真丝斜纹绸",
        process: "数码印花、手工卷边",
        specs: "65 × 65cm",
        supplier: "待筛选",
        moq: "200",
        delivery: "待确认",
        sampleStatus: "未开始",
        owner: "策划组",
        nextAction: "完成建筑元素版权与使用范围核对",
        risk: "礼赠定位较高，需要强化包装与故事卡",
        story: "从校园建筑窗格、屋脊与石刻中提取几何纹样，形成可日常佩戴的校园识别。",
        visual: "低饱和蓝灰为底，金色线条构成建筑纹样，中心留出具有纪念章感的构图。",
        notes: "首轮先做两套色稿，避免过度依赖具体建筑写实形象。"
      }
    ];
    return project;
  }

  const DEMO_PROJECT = createDemoProject();

  function normalizeRow(row, firstTheme) {
    return { ...emptyRow(firstTheme), ...(row || {}), moodboard: Array.isArray(row?.moodboard) ? row.moodboard : [] };
  }

  function normalizeProject(project) {
    const base = defaultProject(project?.id || uid("project"), project?.name || "未命名项目", project?.icon || "📁");
    const merged = { ...base, ...(project || {}) };
    merged.meta = { ...base.meta, ...(project?.meta || {}) };
    merged.themes = Array.isArray(project?.themes) && project.themes.length ? project.themes : base.themes;
    merged.themeMeta = { ...base.themeMeta, ...(project?.themeMeta || {}) };
    merged.themes.forEach((themeId, index) => {
      if (!merged.themeMeta[themeId]) {
        merged.themeMeta[themeId] = { label: themeId, color: THEME_COLORS[index % THEME_COLORS.length] };
      }
    });
    merged.rows = Array.isArray(project?.rows) ? project.rows.map(row => normalizeRow(row, merged.themes[0])) : [];
    merged.overviewFiles = Array.isArray(project?.overviewFiles) ? project.overviewFiles : [];
    merged.versions = Array.isArray(project?.versions) ? project.versions : [];
    merged.undoStack = Array.isArray(project?.undoStack) ? project.undoStack.slice(-25) : [];
    merged.redoStack = Array.isArray(project?.redoStack) ? project.redoStack.slice(-25) : [];
    merged.createdAt = project?.createdAt || project?.created || Date.now();
    merged.updatedAt = project?.updatedAt || project?.created || Date.now();
    return merged;
  }

  function normalizeStore(value) {
    const normalized = { version: 2, projects: {}, activeProjectId: null };
    if (value?.projects) {
      const projects = Array.isArray(value.projects) ? value.projects : Object.values(value.projects);
      projects.forEach(project => {
        const item = normalizeProject(project);
        normalized.projects[item.id] = item;
      });
    }
    return normalized;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OBJECT_STORE)) {
          db.createObjectStore(OBJECT_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, "readonly");
      const request = transaction.objectStore(OBJECT_STORE).get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }

  function idbPut(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      transaction.objectStore(OBJECT_STORE).put({ key, value });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("保存已中止"));
    });
  }

  function setSaveStatus(message, state = "") {
    const element = $("#saveStatus");
    element.textContent = message;
    element.className = `save-status ${state}`.trim();
  }

  function queueSave() {
    if (isReadOnly || !activeProject) return;
    if (!storageAvailable || !database) {
      pendingSave = true;
      setSaveStatus("本地数据库不可用，请导出备份", "error");
      return;
    }
    activeProject.updatedAt = Date.now();
    pendingSave = true;
    setSaveStatus("有未保存修改", "saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistStore, SAVE_DELAY);
  }

  async function persistStore() {
    if (isReadOnly || !pendingSave || saveInProgress) return;
    if (!storageAvailable || !database) {
      setSaveStatus("本地数据库不可用，请导出备份", "error");
      return;
    }
    saveInProgress = true;
    pendingSave = false;
    setSaveStatus("正在保存到本机…", "saving");
    try {
      Object.values(store.projects).forEach(project => {
        project.undoStack = (project.undoStack || []).slice(-25);
        project.redoStack = (project.redoStack || []).slice(-25);
      });
      await idbPut(APP_KEY, store);
      setSaveStatus(`已保存到本机 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })}`, "saved");
    } catch (error) {
      console.error(error);
      pendingSave = true;
      storageAvailable = false;
      setSaveStatus("保存失败，请导出备份", "error");
      toast("本地保存失败，请立即导出项目备份", "error");
    } finally {
      saveInProgress = false;
      if (pendingSave && storageAvailable) queueSave();
    }
  }

  async function saveStoreImmediately() {
    if (isReadOnly) return;
    pendingSave = true;
    clearTimeout(saveTimer);
    await persistStore();
  }

  function snapshotProject(project) {
    return clone({
      overview: project.overview,
      meta: project.meta,
      overviewFiles: project.overviewFiles,
      themes: project.themes,
      themeMeta: project.themeMeta,
      rows: project.rows
    });
  }

  function applySnapshot(project, snapshot) {
    project.overview = snapshot.overview || "";
    project.meta = { ...defaultProject("x", "x").meta, ...(snapshot.meta || {}) };
    project.overviewFiles = Array.isArray(snapshot.overviewFiles) ? clone(snapshot.overviewFiles) : [];
    project.themes = Array.isArray(snapshot.themes) && snapshot.themes.length ? clone(snapshot.themes) : ["default_theme"];
    project.themeMeta = clone(snapshot.themeMeta || { default_theme: { label: "默认主题", color: THEME_COLORS[0] } });
    project.rows = Array.isArray(snapshot.rows) ? snapshot.rows.map(row => normalizeRow(row, project.themes[0])) : [];
  }

  function pushUndo() {
    if (isReadOnly || !activeProject) return;
    activeProject.undoStack.push(snapshotProject(activeProject));
    activeProject.undoStack = activeProject.undoStack.slice(-25);
    activeProject.redoStack = [];
  }

  function undo() {
    if (isReadOnly || !activeProject?.undoStack.length) return;
    activeProject.redoStack.push(snapshotProject(activeProject));
    const snapshot = activeProject.undoStack.pop();
    applySnapshot(activeProject, snapshot);
    selectedRows.clear();
    queueSave();
    renderEditor();
    toast("已撤销");
  }

  function redo() {
    if (isReadOnly || !activeProject?.redoStack.length) return;
    activeProject.undoStack.push(snapshotProject(activeProject));
    const snapshot = activeProject.redoStack.pop();
    applySnapshot(activeProject, snapshot);
    selectedRows.clear();
    queueSave();
    renderEditor();
    toast("已重做");
  }

  function themeInfo(themeId) {
    return activeProject?.themeMeta?.[themeId] || { label: themeId || "未分类", color: "#777777" };
  }

  function renderDashboard() {
    const query = $("#projectSearch").value.trim().toLowerCase();
    const projects = Object.values(store.projects)
      .filter(project => project.name.toLowerCase().includes(query))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const newProjectCard = `<article class="project-card new-project-card" data-action="new-project" tabindex="0" role="button">
      <div class="project-icon">＋</div>
      <h3>新建空白项目</h3>
      <p>从产品地图开始整理。</p>
    </article>`;
    $("#projectGrid").innerHTML = projects.length ? projects.map(project => projectCardHtml(project)).join("") + newProjectCard : "";
    const emptyState = $("#emptyProjects");
    emptyState.hidden = projects.length !== 0;
    $("h3", emptyState).textContent = query ? "没有匹配的项目" : "还没有本地项目";
    $("p", emptyState).textContent = query ? "换一个关键词试试。" : "新建一个项目，从产品地图开始整理。";
    $("#emptyNewProjectButton").hidden = Boolean(query);
  }

  function projectCardHtml(project, options = {}) {
    const demo = Boolean(options.demo);
    const count = project.rows?.length || 0;
    const description = demo ? "完整体验产品地图、文化叙事、工艺与提案输出。" : (project.overview || "尚未填写项目概述。");
    return `<article class="project-card ${demo ? "demo" : ""}" data-action="open-project" data-project-id="${escapeHtml(project.id)}" data-demo="${demo}" tabindex="0" role="button">
      <div class="project-card-top">
        <div class="project-icon">${escapeHtml(project.icon)}</div>
        ${demo ? `<span class="project-card-badge">只读示例</span>` : `<div class="project-card-menu">
          <button class="project-mini-button" type="button" title="复制项目" data-action="duplicate-project" data-project-id="${escapeHtml(project.id)}">⧉</button>
          <button class="project-mini-button" type="button" title="删除项目" data-action="delete-project" data-project-id="${escapeHtml(project.id)}">×</button>
        </div>`}
      </div>
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(description.slice(0, 74))}${description.length > 74 ? "…" : ""}</p>
      <div class="project-card-meta">
        <span>${count} 个产品</span>
        <span>${demo ? "打开体验" : `更新于 ${dateText(project.updatedAt)}`}</span>
      </div>
    </article>`;
  }

  function openNewProjectModal() {
    selectedEmoji = EMOJIS[0];
    $("#newProjectName").value = "";
    $("#emojiGrid").innerHTML = EMOJIS.map(emoji =>
      `<button class="emoji-option ${emoji === selectedEmoji ? "selected" : ""}" type="button" data-emoji="${emoji}">${emoji}</button>`
    ).join("");
    openModal("newProjectModal");
    setTimeout(() => $("#newProjectName").focus(), 30);
  }

  async function createProject() {
    const name = $("#newProjectName").value.trim();
    if (!name) {
      toast("请输入项目名称", "error");
      return;
    }
    const project = defaultProject(uid("project"), name, selectedEmoji);
    store.projects[project.id] = project;
    closeModal("newProjectModal");
    await saveStoreImmediately();
    renderDashboard();
    enterProject(project.id, false);
  }

  async function duplicateProject(projectId) {
    const original = store.projects[projectId];
    if (!original) return;
    const duplicate = normalizeProject(clone(original));
    duplicate.id = uid("project");
    duplicate.name = `${original.name} · 副本`;
    duplicate.createdAt = Date.now();
    duplicate.updatedAt = Date.now();
    duplicate.undoStack = [];
    duplicate.redoStack = [];
    duplicate.versions = clone(original.versions || []);
    store.projects[duplicate.id] = duplicate;
    await saveStoreImmediately();
    renderDashboard();
    toast("项目已复制");
  }

  async function deleteProject(projectId) {
    const project = store.projects[projectId];
    if (!project) return;
    if (!confirm(`确定删除“${project.name}”吗？此操作无法撤销。`)) return;
    delete store.projects[projectId];
    await saveStoreImmediately();
    renderDashboard();
    toast("项目已删除");
  }

  function enterProject(projectId, demo = false) {
    isReadOnly = demo;
    activeProjectId = projectId;
    activeProject = demo ? normalizeProject(clone(DEMO_PROJECT)) : store.projects[projectId];
    if (!activeProject) return;
    activeTab = 0;
    selectedRows.clear();
    $("#dashboard").hidden = true;
    $("#editor").hidden = false;
    renderEditor();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function backToDashboard() {
    clearTimeout(saveTimer);
    if (!isReadOnly && pendingSave) persistStore();
    activeProject = null;
    activeProjectId = null;
    isReadOnly = false;
    selectedRows.clear();
    $("#editor").hidden = true;
    $("#dashboard").hidden = false;
    renderDashboard();
  }

  async function copyDemoToLocal() {
    const project = normalizeProject(clone(DEMO_PROJECT));
    project.id = uid("project");
    project.name = `${DEMO_PROJECT.name} · 我的副本`;
    project.createdAt = Date.now();
    project.updatedAt = Date.now();
    project.undoStack = [];
    project.redoStack = [];
    project.versions = [];
    store.projects[project.id] = project;
    isReadOnly = false;
    activeProjectId = project.id;
    activeProject = project;
    await saveStoreImmediately();
    renderEditor();
    toast("示例已复制，现在可以编辑");
  }

  function renderEditor() {
    if (!activeProject) return;
    $("#editorTitle").textContent = activeProject.name;
    $("#readOnlyBadge").hidden = !isReadOnly;
    $("#copyDemoButton").hidden = !isReadOnly;
    setSaveStatus(isReadOnly ? "只读示例 · 修改不会保存" : "已保存到本机", isReadOnly ? "" : "saved");

    $("#overviewText").value = activeProject.overview || "";
    $("#clientField").value = activeProject.meta.client || "";
    $("#objectiveField").value = activeProject.meta.objective || "";
    $("#audienceField").value = activeProject.meta.audience || "";
    $("#channelField").value = activeProject.meta.channel || "";
    $("#budgetField").value = activeProject.meta.budget || "";
    $("#deadlineField").value = activeProject.meta.deadline || "";
    ["overviewText", "clientField", "objectiveField", "audienceField", "channelField", "budgetField", "deadlineField"].forEach(id => {
      $(`#${id}`).disabled = isReadOnly;
    });

    $("#addProductButton").disabled = isReadOnly;
    $("#addRowButton").disabled = isReadOnly;
    $("#duplicateRowsButton").disabled = isReadOnly;
    $("#deleteRowsButton").disabled = isReadOnly;
    $("#versionButton").disabled = isReadOnly;
    $("#attachmentUploadLabel").classList.toggle("disabled", isReadOnly);
    $("#overviewFileInput").disabled = isReadOnly;

    switchTab(activeTab, false);
    renderOverviewFiles();
    renderTables();
    renderProposal();
    updateRowCount();
    updateUndoButtons();
  }

  function updateProjectOverview() {
    if (isReadOnly || !activeProject) return;
    activeProject.overview = $("#overviewText").value;
    activeProject.meta = {
      client: $("#clientField").value,
      objective: $("#objectiveField").value,
      audience: $("#audienceField").value,
      channel: $("#channelField").value,
      budget: $("#budgetField").value,
      deadline: $("#deadlineField").value
    };
    queueSave();
    renderProposal();
  }

  function renderOverviewFiles() {
    const files = activeProject?.overviewFiles || [];
    $("#overviewFiles").innerHTML = files.map(file => `<div class="attachment-chip">
      <span>📄</span>
      <a href="${escapeHtml(file.data)}" download="${escapeHtml(file.name)}" title="下载 ${escapeHtml(file.name)}">${escapeHtml(file.name)}</a>
      ${isReadOnly ? "" : `<button type="button" data-action="remove-attachment" data-file-id="${escapeHtml(file.id)}" aria-label="删除附件">×</button>`}
    </div>`).join("");
  }

  const TABLE_CONFIGS = [
    {
      target: "productTable",
      columns: [
        { id: "drag", label: "", width: 34, type: "drag", sticky: "sticky-col" },
        { id: "select", label: "", width: 34, type: "select", sticky: "sticky-col-2" },
        { id: "number", label: "#", width: 34, type: "number", sticky: "sticky-col-3" },
        { id: "theme", label: "主题", width: 110, type: "theme" },
        { id: "name", label: "产品名", width: 150, type: "edit" },
        { id: "category", label: "品类", width: 90, type: "edit" },
        { id: "phase", label: "阶段", width: 76, type: "phase" },
        { id: "targetPrice", label: "目标售价", width: 86, type: "edit" },
        { id: "estimatedCost", label: "预估成本", width: 90, type: "edit" },
        { id: "audience", label: "目标人群", width: 120, type: "edit" },
        { id: "channel", label: "销售渠道", width: 120, type: "edit" },
        { id: "notes", label: "关键约束", width: 190, type: "edit" },
        { id: "img", label: "效果图", width: 92, type: "image" }
      ]
    },
    {
      target: "storyTable",
      columns: [
        { id: "drag", label: "", width: 34, type: "drag", sticky: "sticky-col" },
        { id: "select", label: "", width: 34, type: "select", sticky: "sticky-col-2" },
        { id: "number", label: "#", width: 34, type: "number", sticky: "sticky-col-3" },
        { id: "theme", label: "主题", width: 110, type: "theme" },
        { id: "name", label: "产品名", width: 150, type: "edit" },
        { id: "story", label: "文化背景 / 故事", width: 260, type: "edit" },
        { id: "visual", label: "视觉方向", width: 240, type: "edit" },
        { id: "moodboard", label: "情绪板", width: 210, type: "images" },
        { id: "elementExtract", label: "元素提取", width: 92, type: "image" },
        { id: "designDraft", label: "设计初稿", width: 92, type: "image" },
        { id: "ref", label: "竞品参考", width: 92, type: "image" },
        { id: "conceptImg", label: "概念图", width: 92, type: "image" }
      ]
    },
    {
      target: "craftTable",
      columns: [
        { id: "drag", label: "", width: 34, type: "drag", sticky: "sticky-col" },
        { id: "select", label: "", width: 34, type: "select", sticky: "sticky-col-2" },
        { id: "number", label: "#", width: 34, type: "number", sticky: "sticky-col-3" },
        { id: "theme", label: "主题", width: 110, type: "theme" },
        { id: "name", label: "产品名", width: 150, type: "edit" },
        { id: "material", label: "材质", width: 130, type: "edit" },
        { id: "process", label: "工艺", width: 140, type: "edit" },
        { id: "specs", label: "规格", width: 100, type: "edit" },
        { id: "supplier", label: "供应商", width: 130, type: "edit" },
        { id: "moq", label: "MOQ", width: 80, type: "edit" },
        { id: "delivery", label: "交期", width: 120, type: "edit" },
        { id: "sampleStatus", label: "打样状态", width: 110, type: "edit" },
        { id: "risk", label: "风险", width: 170, type: "edit" },
        { id: "owner", label: "负责人", width: 100, type: "edit" },
        { id: "nextAction", label: "下一步", width: 210, type: "edit" },
        { id: "img", label: "效果图", width: 92, type: "image" }
      ]
    }
  ];

  function renderTables() {
    TABLE_CONFIGS.forEach(config => {
      const target = $(`#${config.target}`);
      target.innerHTML = buildTable(config.columns);
    });
  }

  function buildTable(columns) {
    const header = columns.map(column => `<th class="${column.sticky || ""}" style="width:${column.width}px;min-width:${column.width}px">${escapeHtml(column.label)}</th>`).join("");
    const body = activeProject.rows.map((row, index) => {
      const selected = selectedRows.has(row.id);
      const cells = columns.map(column => buildCell(row, index, column)).join("");
      return `<tr data-row-id="${escapeHtml(row.id)}" class="${selected ? "selected" : ""}" draggable="${!isReadOnly}">${cells}</tr>`;
    }).join("");
    return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function buildCell(row, index, column) {
    const cellClass = column.sticky || "";
    let content = "";
    if (column.type === "drag") {
      content = `<span class="drag-handle ${isReadOnly ? "disabled" : ""}" title="拖动排序">⠿</span>`;
    } else if (column.type === "select") {
      content = `<input class="row-checkbox" type="checkbox" data-action="select-row" ${selectedRows.has(row.id) ? "checked" : ""}>`;
    } else if (column.type === "number") {
      content = String(index + 1);
    } else if (column.type === "theme") {
      content = `<select class="theme-select" data-action="change-theme" ${isReadOnly ? "disabled" : ""} style="color:${escapeHtml(themeInfo(row.theme).color)}">${activeProject.themes.map(themeId => `<option value="${escapeHtml(themeId)}" ${row.theme === themeId ? "selected" : ""}>${escapeHtml(themeInfo(themeId).label)}</option>`).join("")}</select>`;
    } else if (column.type === "phase") {
      const phase = PHASES[row.phase] || PHASES.research;
      content = `<button class="phase-pill ${phase.className}" type="button" data-action="cycle-phase" ${isReadOnly ? "disabled" : ""}>${phase.label}</button>`;
    } else if (column.type === "edit") {
      content = `<div class="edit-cell ${isReadOnly ? "readonly-cell" : ""}" data-field="${escapeHtml(column.id)}" data-placeholder="${escapeHtml(column.label)}" contenteditable="${!isReadOnly}" spellcheck="false">${escapeHtml(row[column.id] || "")}</div>`;
    } else if (column.type === "image") {
      content = imageCell(row, column.id, false);
    } else if (column.type === "images") {
      content = imageCell(row, column.id, true);
    }
    return `<td class="${cellClass}" style="width:${column.width}px;min-width:${column.width}px">${content}</td>`;
  }

  function imageCell(row, field, multiple) {
    const values = multiple ? (Array.isArray(row[field]) ? row[field] : []) : (row[field] ? [row[field]] : []);
    const images = values.map((url, index) => `<div class="image-thumb">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(row.name || "产品图片")}" data-action="preview-image">
      ${isReadOnly ? "" : `<button class="image-delete" type="button" data-action="delete-image" data-field="${escapeHtml(field)}" data-image-index="${index}">×</button>`}
    </div>`).join("");
    const upload = isReadOnly ? `<span class="image-upload disabled">＋</span>` : `<label class="image-upload">＋<input type="file" accept="image/*" data-action="upload-image" data-field="${escapeHtml(field)}" ${multiple ? "multiple" : ""} hidden></label>`;
    return `<div class="image-list">${images}${upload}</div>`;
  }

  function findRow(rowId) {
    return activeProject.rows.find(row => row.id === rowId);
  }

  function handleTableClick(event) {
    const rowElement = event.target.closest("tr[data-row-id]");
    if (!rowElement) return;
    const rowId = rowElement.dataset.rowId;
    const actionElement = event.target.closest("[data-action]");
    const action = actionElement?.dataset.action;

    if (action === "select-row") {
      toggleRowSelection(rowId, actionElement.checked);
      return;
    }
    if (action === "cycle-phase") {
      cyclePhase(rowId);
      return;
    }
    if (action === "preview-image") {
      showLightbox(actionElement.src);
      return;
    }
    if (action === "delete-image") {
      deleteImage(rowId, actionElement.dataset.field, Number(actionElement.dataset.imageIndex));
      return;
    }
    if (!event.target.closest("input,select,button,label,[contenteditable='true']")) {
      toggleRowSelection(rowId, !selectedRows.has(rowId));
    }
  }

  function handleTableChange(event) {
    const rowElement = event.target.closest("tr[data-row-id]");
    if (!rowElement || isReadOnly) return;
    const rowId = rowElement.dataset.rowId;
    const row = findRow(rowId);
    if (!row) return;
    const action = event.target.dataset.action;
    if (action === "change-theme") {
      pushUndo();
      row.theme = event.target.value;
      queueSave();
      renderTables();
      renderProposal();
    } else if (action === "upload-image") {
      uploadRowImages(rowId, event.target.dataset.field, event.target.files, event.target.multiple);
    }
  }

  function handleTableFocusIn(event) {
    if (isReadOnly || !event.target.matches(".edit-cell[contenteditable='true']")) return;
    if (!event.target.dataset.undoCaptured) {
      pushUndo();
      event.target.dataset.undoCaptured = "1";
    }
  }

  function handleTableFocusOut(event) {
    const cell = event.target;
    if (isReadOnly || !cell.matches(".edit-cell[contenteditable='true']")) return;
    const rowElement = cell.closest("tr[data-row-id]");
    const row = findRow(rowElement.dataset.rowId);
    const field = cell.dataset.field;
    const value = cell.textContent.trim();
    delete cell.dataset.undoCaptured;
    if (row && row[field] !== value) {
      row[field] = value;
      queueSave();
      renderProposal();
    } else if (activeProject.undoStack.length) {
      const last = activeProject.undoStack[activeProject.undoStack.length - 1];
      if (JSON.stringify(last) === JSON.stringify(snapshotProject(activeProject))) activeProject.undoStack.pop();
    }
    updateUndoButtons();
  }

  function handleDragStart(event) {
    if (isReadOnly) return;
    const row = event.target.closest("tr[data-row-id]");
    if (!row) return;
    event.dataTransfer.setData("text/plain", row.dataset.rowId);
    event.dataTransfer.effectAllowed = "move";
    row.style.opacity = ".45";
  }

  function handleDragEnd(event) {
    const row = event.target.closest("tr[data-row-id]");
    if (row) row.style.opacity = "";
  }

  function handleDragOver(event) {
    if (isReadOnly || !event.target.closest("tr[data-row-id]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event) {
    if (isReadOnly) return;
    const target = event.target.closest("tr[data-row-id]");
    if (!target) return;
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    const targetId = target.dataset.rowId;
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = activeProject.rows.findIndex(row => row.id === sourceId);
    const targetIndex = activeProject.rows.findIndex(row => row.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    pushUndo();
    const [row] = activeProject.rows.splice(sourceIndex, 1);
    activeProject.rows.splice(targetIndex, 0, row);
    queueSave();
    renderTables();
  }

  function toggleRowSelection(rowId, selected) {
    if (selected) selectedRows.add(rowId);
    else selectedRows.delete(rowId);
    renderTables();
    updateRowCount();
  }

  function selectAllRows() {
    activeProject.rows.forEach(row => selectedRows.add(row.id));
    renderTables();
    updateRowCount();
  }

  function clearSelection() {
    selectedRows.clear();
    renderTables();
    updateRowCount();
  }

  function updateRowCount() {
    $("#rowCount").textContent = `${activeProject?.rows.length || 0} 个产品 · 选中 ${selectedRows.size}`;
  }

  function updateUndoButtons() {
    $("#undoButton").disabled = isReadOnly || !activeProject?.undoStack.length;
    $("#redoButton").disabled = isReadOnly || !activeProject?.redoStack.length;
  }

  function addRow() {
    if (isReadOnly) return;
    pushUndo();
    activeProject.rows.push(emptyRow(activeProject.themes[0]));
    queueSave();
    renderTables();
    renderProposal();
    updateRowCount();
    updateUndoButtons();
    toast("已添加空白产品行");
  }

  function deleteSelectedRows() {
    if (isReadOnly) return;
    if (!selectedRows.size) {
      toast("请先选择产品", "error");
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedRows.size} 个产品吗？`)) return;
    pushUndo();
    activeProject.rows = activeProject.rows.filter(row => !selectedRows.has(row.id));
    selectedRows.clear();
    queueSave();
    renderTables();
    renderProposal();
    updateRowCount();
    updateUndoButtons();
    toast("已删除所选产品");
  }

  function duplicateSelectedRows() {
    if (isReadOnly) return;
    if (!selectedRows.size) {
      toast("请先选择产品", "error");
      return;
    }
    pushUndo();
    const output = [];
    activeProject.rows.forEach(row => {
      output.push(row);
      if (selectedRows.has(row.id)) output.push({ ...clone(row), id: uid("row"), name: `${row.name || "新产品"} · 副本` });
    });
    activeProject.rows = output;
    selectedRows.clear();
    queueSave();
    renderTables();
    renderProposal();
    updateRowCount();
    updateUndoButtons();
    toast("所选产品已复制");
  }

  function cyclePhase(rowId) {
    if (isReadOnly) return;
    const row = findRow(rowId);
    if (!row) return;
    pushUndo();
    const index = PHASE_ORDER.indexOf(row.phase);
    row.phase = PHASE_ORDER[(index + 1) % PHASE_ORDER.length];
    queueSave();
    renderTables();
    renderProposal();
    updateUndoButtons();
  }

  function openProductModal() {
    if (isReadOnly) return;
    ["productName", "productCategory", "productPrice", "productCost", "productVisual", "productStory"].forEach(id => { $(`#${id}`).value = ""; });
    $("#productTheme").innerHTML = activeProject.themes.map(themeId => `<option value="${escapeHtml(themeId)}">${escapeHtml(themeInfo(themeId).label)}</option>`).join("");
    $("#productPhase").innerHTML = PHASE_ORDER.map(phaseId => `<option value="${phaseId}">${PHASES[phaseId].label}</option>`).join("");
    openModal("productModal");
    setTimeout(() => $("#productName").focus(), 30);
  }

  function createProduct() {
    if (isReadOnly) return;
    pushUndo();
    const row = emptyRow($("#productTheme").value || activeProject.themes[0]);
    row.name = $("#productName").value.trim() || "新产品";
    row.category = $("#productCategory").value.trim();
    row.phase = $("#productPhase").value;
    row.targetPrice = $("#productPrice").value.trim();
    row.estimatedCost = $("#productCost").value.trim();
    row.visual = $("#productVisual").value.trim();
    row.story = $("#productStory").value.trim();
    activeProject.rows.push(row);
    closeModal("productModal");
    queueSave();
    renderTables();
    renderProposal();
    updateRowCount();
    updateUndoButtons();
    toast("产品已添加");
  }

  async function uploadRowImages(rowId, field, fileList, multiple) {
    if (isReadOnly) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const row = findRow(rowId);
    if (!row) return;
    try {
      const dataUrls = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} 不是图片文件`);
        if (file.size > MAX_IMAGE_SIZE) throw new Error(`${file.name} 超过 3MB`);
        dataUrls.push(await fileToDataUrl(file));
      }
      pushUndo();
      if (multiple) row[field] = [...(Array.isArray(row[field]) ? row[field] : []), ...dataUrls];
      else row[field] = dataUrls[0];
      queueSave();
      renderTables();
      renderProposal();
      updateUndoButtons();
      toast("图片已保存到本机项目");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function deleteImage(rowId, field, index) {
    if (isReadOnly) return;
    const row = findRow(rowId);
    if (!row || !confirm("确定删除这张图片吗？")) return;
    pushUndo();
    if (Array.isArray(row[field])) row[field].splice(index, 1);
    else row[field] = "";
    queueSave();
    renderTables();
    renderProposal();
    updateUndoButtons();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function addOverviewFiles(fileList) {
    if (isReadOnly) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    try {
      const items = [];
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_SIZE) throw new Error(`${file.name} 超过 5MB`);
        items.push({
          id: uid("file"),
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          data: await fileToDataUrl(file)
        });
      }
      pushUndo();
      activeProject.overviewFiles.push(...items);
      queueSave();
      renderOverviewFiles();
      updateUndoButtons();
      toast("附件已保存到本机项目");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      $("#overviewFileInput").value = "";
    }
  }

  function removeOverviewFile(fileId) {
    if (isReadOnly || !confirm("确定删除这个附件吗？")) return;
    pushUndo();
    activeProject.overviewFiles = activeProject.overviewFiles.filter(file => file.id !== fileId);
    queueSave();
    renderOverviewFiles();
    updateUndoButtons();
  }

  function switchTab(tabIndex, render = true) {
    activeTab = Number(tabIndex);
    $$(".module-tab").forEach((button, index) => button.classList.toggle("active", index === activeTab));
    $$(".module-panel").forEach((panel, index) => panel.classList.toggle("active", index === activeTab));
    $("#tableToolbar").hidden = activeTab === 3;
    if (activeTab === 3) renderProposal();
    if (render && activeTab < 3) renderTables();
  }

  function openThemeModal() {
    renderThemeList();
    openModal("themeModal");
  }

  function renderThemeList() {
    $("#themeList").innerHTML = activeProject.themes.map(themeId => `<div class="theme-row" data-theme-id="${escapeHtml(themeId)}">
      <span class="theme-color" style="background:${escapeHtml(themeInfo(themeId).color)}"></span>
      <input type="text" value="${escapeHtml(themeInfo(themeId).label)}" data-action="rename-theme" ${isReadOnly ? "disabled" : ""}>
      ${isReadOnly ? "" : `<button type="button" data-action="delete-theme" aria-label="删除主题">×</button>`}
    </div>`).join("");
    $("#newThemeRow").hidden = isReadOnly;
  }

  function addTheme() {
    if (isReadOnly) return;
    const name = $("#newThemeName").value.trim();
    if (!name) return;
    pushUndo();
    const id = uid("theme");
    activeProject.themes.push(id);
    activeProject.themeMeta[id] = { label: name, color: THEME_COLORS[(activeProject.themes.length - 1) % THEME_COLORS.length] };
    $("#newThemeName").value = "";
    queueSave();
    renderThemeList();
    renderTables();
    renderProposal();
    updateUndoButtons();
  }

  function renameTheme(themeId, name) {
    if (isReadOnly || !activeProject.themeMeta[themeId]) return;
    pushUndo();
    activeProject.themeMeta[themeId].label = name.trim() || "未命名主题";
    queueSave();
    renderTables();
    renderProposal();
    updateUndoButtons();
  }

  function deleteTheme(themeId) {
    if (isReadOnly) return;
    if (activeProject.themes.length <= 1) {
      toast("至少保留一个主题", "error");
      return;
    }
    if (activeProject.rows.some(row => row.theme === themeId)) {
      toast("该主题仍被产品使用，无法删除", "error");
      return;
    }
    pushUndo();
    activeProject.themes = activeProject.themes.filter(id => id !== themeId);
    delete activeProject.themeMeta[themeId];
    queueSave();
    renderThemeList();
    renderTables();
    renderProposal();
    updateUndoButtons();
  }

  function openVersionModal() {
    if (isReadOnly) return;
    $("#versionNote").value = "";
    renderVersionList();
    openModal("versionModal");
  }

  function saveVersion() {
    if (isReadOnly) return;
    const note = $("#versionNote").value.trim() || `手动版本 ${activeProject.versions.length + 1}`;
    activeProject.versions.push({
      id: uid("version"),
      time: Date.now(),
      note,
      snapshot: snapshotProject(activeProject)
    });
    activeProject.versions = activeProject.versions.slice(-30);
    $("#versionNote").value = "";
    queueSave();
    renderVersionList();
    toast("当前完整项目已存为版本");
  }

  function renderVersionList() {
    const versions = activeProject.versions || [];
    if (!versions.length) {
      $("#versionList").innerHTML = `<div class="version-empty">还没有历史版本。重要评审前可以手动保存一次。</div>`;
      return;
    }
    $("#versionList").innerHTML = versions.slice().reverse().map(version => `<div class="version-item">
      <div><strong>${escapeHtml(version.note)}</strong><p>${new Date(version.time).toLocaleString("zh-CN", { hour12: false })}</p></div>
      <button class="button compact secondary" type="button" data-action="restore-version" data-version-id="${escapeHtml(version.id)}">恢复</button>
    </div>`).join("");
  }

  function restoreVersion(versionId) {
    if (isReadOnly) return;
    const version = activeProject.versions.find(item => item.id === versionId);
    if (!version || !confirm(`确定恢复“${version.note}”吗？当前状态会先进入撤销记录。`)) return;
    pushUndo();
    applySnapshot(activeProject, version.snapshot);
    queueSave();
    closeModal("versionModal");
    renderEditor();
    toast("版本已恢复");
  }

  function renderProposal() {
    if (!activeProject) return;
    const groups = {};
    activeProject.rows.forEach(row => {
      const themeId = row.theme || activeProject.themes[0];
      (groups[themeId] ||= []).push(row);
    });
    const inDevelopment = activeProject.rows.filter(row => ["design", "dev"].includes(row.phase)).length;
    const ready = activeProject.rows.filter(row => row.phase === "launch").length;
    const meta = activeProject.meta;
    const groupHtml = Object.entries(groups).map(([themeId, rows]) => {
      const theme = activeProject.themeMeta[themeId] || { label: themeId, color: "#777" };
      const cards = rows.map(row => `<article class="proposal-product">
        <div class="proposal-product-header"><div><h4>${escapeHtml(row.name || "未命名产品")}</h4><span class="product-category">${escapeHtml(row.category || "未填写品类")}</span></div><span class="phase-pill ${(PHASES[row.phase] || PHASES.research).className}">${escapeHtml((PHASES[row.phase] || PHASES.research).label)}</span></div>
        ${row.img ? `<img class="proposal-product-image" src="${escapeHtml(row.img)}" alt="${escapeHtml(row.name)}">` : ""}
        <dl>
          <div><dt>目标售价</dt><dd>${escapeHtml(row.targetPrice || "—")}</dd></div>
          <div><dt>预估成本</dt><dd>${escapeHtml(row.estimatedCost || "—")}</dd></div>
          <div><dt>材质</dt><dd>${escapeHtml(row.material || "—")}</dd></div>
          <div><dt>工艺</dt><dd>${escapeHtml(row.process || "—")}</dd></div>
          ${row.story ? `<div class="long-copy"><dt>文化叙事</dt><dd>${formatCopy(row.story)}</dd></div>` : ""}
          ${row.visual ? `<div class="long-copy"><dt>视觉方向</dt><dd>${formatCopy(row.visual)}</dd></div>` : ""}
          ${row.nextAction ? `<div class="long-copy"><dt>下一步</dt><dd>${formatCopy(row.nextAction)}</dd></div>` : ""}
        </dl>
      </article>`).join("");
      return `<section class="proposal-theme">
        <div class="proposal-theme-title"><span class="theme-dot" style="background:${escapeHtml(theme.color)}"></span><h3>${escapeHtml(theme.label)}</h3></div>
        <div class="proposal-product-grid">${cards}</div>
      </section>`;
    }).join("") || `<p>尚未添加产品。</p>`;

    const craftRows = activeProject.rows.map(row => `<tr>
      <td>${escapeHtml(row.name || "—")}</td><td>${escapeHtml(row.material || "—")}</td><td>${escapeHtml(row.process || "—")}</td><td>${escapeHtml(row.supplier || "—")}</td><td>${escapeHtml(row.moq || "—")}</td><td>${escapeHtml(row.delivery || "—")}</td><td>${escapeHtml(row.sampleStatus || "—")}</td><td>${escapeHtml(row.risk || "—")}</td>
    </tr>`).join("");

    $("#proposalPreview").innerHTML = `
      <header class="proposal-cover">
        <span class="proposal-kicker">DESIGN BOARD · PRODUCT PROPOSAL</span>
        <h1>${escapeHtml(activeProject.name)}</h1>
        <p>${escapeHtml(meta.client || "文创产品策划提案")}</p>
        <p class="proposal-date">生成日期：${new Date().toLocaleDateString("zh-CN")}</p>
      </header>
      <section class="proposal-section">
        <h2>01 项目概览</h2>
        <p>${formatCopy(activeProject.overview || "尚未填写项目概述。")}</p>
        <div class="proposal-meta-grid">
          ${proposalMeta("委托方 / 品牌", meta.client)}${proposalMeta("项目目标", meta.objective)}${proposalMeta("目标人群", meta.audience)}${proposalMeta("销售渠道", meta.channel)}${proposalMeta("预算范围", meta.budget)}${proposalMeta("计划节点", meta.deadline)}
        </div>
        <div class="proposal-stats">
          <div class="proposal-stat"><strong>${activeProject.rows.length}</strong><span>候选产品</span></div>
          <div class="proposal-stat"><strong>${activeProject.themes.length}</strong><span>主题方向</span></div>
          <div class="proposal-stat"><strong>${inDevelopment}</strong><span>设计 / 打样中</span></div>
          <div class="proposal-stat"><strong>${ready}</strong><span>已进入量产</span></div>
        </div>
      </section>
      <section class="proposal-section"><h2>02 产品与叙事</h2>${groupHtml}</section>
      <section class="proposal-section">
        <h2>03 工艺与供应摘要</h2>
        <table class="proposal-table"><thead><tr><th>产品</th><th>材质</th><th>工艺</th><th>供应商</th><th>MOQ</th><th>交期</th><th>打样状态</th><th>风险</th></tr></thead><tbody>${craftRows || `<tr><td colspan="8">尚无数据</td></tr>`}</tbody></table>
      </section>`;
    window.designBoardMarkdown = buildMarkdown();
  }

  function proposalMeta(label, value) {
    return `<div class="proposal-meta-item"><span>${label}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
  }

  function buildMarkdown() {
    const lines = [`# ${activeProject.name}`, "", `生成日期：${new Date().toLocaleDateString("zh-CN")}`, "", "## 项目概览", activeProject.overview || "尚未填写项目概述。", ""];
    const metaLabels = { client: "委托方 / 品牌", objective: "项目目标", audience: "目标人群", channel: "销售渠道", budget: "预算范围", deadline: "计划节点" };
    Object.entries(metaLabels).forEach(([key, label]) => lines.push(`- ${label}：${activeProject.meta[key] || "—"}`));
    lines.push("", "## 产品与叙事", "");
    activeProject.themes.forEach(themeId => {
      const rows = activeProject.rows.filter(row => row.theme === themeId);
      if (!rows.length) return;
      lines.push(`### ${themeInfo(themeId).label}`, "");
      rows.forEach(row => {
        lines.push(`#### ${row.name || "未命名产品"}`);
        lines.push(`- 品类：${row.category || "—"}`);
        lines.push(`- 阶段：${(PHASES[row.phase] || PHASES.research).label}`);
        lines.push(`- 目标售价：${row.targetPrice || "—"}`);
        lines.push(`- 预估成本：${row.estimatedCost || "—"}`);
        lines.push(`- 材质：${row.material || "—"}`);
        lines.push(`- 工艺：${row.process || "—"}`);
        if (row.story) lines.push(`- 文化叙事：${row.story}`);
        if (row.visual) lines.push(`- 视觉方向：${row.visual}`);
        if (row.risk) lines.push(`- 风险：${row.risk}`);
        if (row.nextAction) lines.push(`- 下一步：${row.nextAction}`);
        lines.push("");
      });
    });
    return lines.join("\n");
  }

  function printProposal() {
    switchTab(3);
    renderProposal();
    setTimeout(() => window.print(), 80);
  }

  async function copyMarkdown() {
    renderProposal();
    try {
      await navigator.clipboard.writeText(window.designBoardMarkdown || "");
      toast("Markdown 已复制");
    } catch {
      toast("浏览器未允许复制，请下载文件", "error");
    }
  }

  function downloadMarkdown() {
    renderProposal();
    downloadBlob(window.designBoardMarkdown || "", `design-board-proposal-${safeFilePart(activeProject.name)}.md`, "text/markdown;charset=utf-8");
  }

  function cleanProjectForExport(project) {
    const output = clone(project);
    output.undoStack = [];
    output.redoStack = [];
    return output;
  }

  function exportCurrentProject() {
    const payload = {
      app: "Design Board",
      version: 2,
      exportedAt: new Date().toISOString(),
      project: cleanProjectForExport(activeProject)
    };
    downloadBlob(JSON.stringify(payload, null, 2), `design-board-project-${safeFilePart(activeProject.name)}.json`, "application/json");
    toast("项目备份已导出");
  }

  function exportAllProjects() {
    const projects = Object.values(store.projects).map(cleanProjectForExport);
    const payload = { app: "Design Board", version: 2, exportedAt: new Date().toISOString(), projects };
    downloadBlob(JSON.stringify(payload, null, 2), `design-board-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    toast("全部本地项目已导出");
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      let projects = [];
      if (parsed.project) projects = [parsed.project];
      else if (Array.isArray(parsed.projects)) projects = parsed.projects;
      else if (parsed.projects && typeof parsed.projects === "object") projects = Object.values(parsed.projects);
      else if (parsed.rows && parsed.name) projects = [parsed];
      if (!projects.length) throw new Error("文件中没有可识别的项目数据");

      projects.forEach(raw => {
        const project = normalizeProject(raw);
        const originalId = project.id;
        if (store.projects[project.id] || project.id === DEMO_PROJECT.id) {
          project.id = uid("project");
          project.name = `${project.name} · 导入`;
        }
        project.rows = project.rows.map(row => ({ ...row, id: uid("row") }));
        project.createdAt = project.createdAt || Date.now();
        project.updatedAt = Date.now();
        project.undoStack = [];
        project.redoStack = [];
        store.projects[project.id] = project;
        if (originalId !== project.id) console.info("Imported project id changed", originalId, project.id);
      });
      await saveStoreImmediately();
      renderDashboard();
      toast(`已导入 ${projects.length} 个项目`);
    } catch (error) {
      console.error(error);
      toast(`导入失败：${error.message}`, "error");
    } finally {
      $("#importFile").value = "";
    }
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showLightbox(src) {
    $("#lightboxImage").src = src;
    $("#lightbox").hidden = false;
  }

  function closeLightbox() {
    $("#lightbox").hidden = true;
    $("#lightboxImage").src = "";
  }

  function openModal(id) {
    $(`#${id}`).hidden = false;
  }

  function closeModal(id) {
    $(`#${id}`).hidden = true;
  }

  function toast(message, type = "") {
    const element = document.createElement("div");
    element.className = `toast ${type}`.trim();
    element.textContent = message;
    $("#toastRegion").appendChild(element);
    setTimeout(() => element.remove(), 2500);
  }

  function handleProjectGridAction(event) {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    const projectId = actionElement.dataset.projectId;
    if (action === "open-project") enterProject(projectId, actionElement.dataset.demo === "true");
    else if (action === "new-project") openNewProjectModal();
    else if (action === "duplicate-project") {
      event.stopPropagation();
      duplicateProject(projectId);
    } else if (action === "delete-project") {
      event.stopPropagation();
      deleteProject(projectId);
    }
  }

  function bindEvents() {
    $("#newProjectButton").addEventListener("click", openNewProjectModal);
    $("#emptyNewProjectButton").addEventListener("click", openNewProjectModal);
    $("#createProjectConfirmButton").addEventListener("click", createProject);
    $("#projectSearch").addEventListener("input", renderDashboard);
    $("#exportAllButton").addEventListener("click", exportAllProjects);
    $("#importFile").addEventListener("change", event => importBackup(event.target.files[0]));
    $("#projectGrid").addEventListener("click", handleProjectGridAction);
    $("#projectGrid").addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) handleProjectGridAction(event); });

    $("#emojiGrid").addEventListener("click", event => {
      const button = event.target.closest("[data-emoji]");
      if (!button) return;
      selectedEmoji = button.dataset.emoji;
      $$(".emoji-option", $("#emojiGrid")).forEach(item => item.classList.toggle("selected", item === button));
    });

    $("#backButton").addEventListener("click", backToDashboard);
    $("#copyDemoButton").addEventListener("click", copyDemoToLocal);
    $("#themeButton").addEventListener("click", openThemeModal);
    $("#versionButton").addEventListener("click", openVersionModal);
    $("#exportProjectButton").addEventListener("click", exportCurrentProject);
    $("#printProposalButton").addEventListener("click", printProposal);
    $("#addProductButton").addEventListener("click", openProductModal);
    $("#createProductConfirmButton").addEventListener("click", createProduct);

    $$(".module-tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    $("#toggleOverviewButton").addEventListener("click", () => {
      const content = $("#overviewContent");
      content.hidden = !content.hidden;
      $("#toggleOverviewButton").textContent = content.hidden ? "展开" : "收起";
    });

    const overviewInputs = ["overviewText", "clientField", "objectiveField", "audienceField", "channelField", "budgetField", "deadlineField"];
    overviewInputs.forEach(id => {
      const element = $(`#${id}`);
      element.addEventListener("focus", () => {
        if (!isReadOnly && !element.dataset.undoCaptured) {
          pushUndo();
          element.dataset.undoCaptured = "1";
          updateUndoButtons();
        }
      });
      element.addEventListener("input", updateProjectOverview);
      element.addEventListener("blur", () => { delete element.dataset.undoCaptured; });
    });
    $("#overviewFileInput").addEventListener("change", event => addOverviewFiles(event.target.files));
    $("#overviewFiles").addEventListener("click", event => {
      const button = event.target.closest("[data-action='remove-attachment']");
      if (button) removeOverviewFile(button.dataset.fileId);
    });

    $("#addRowButton").addEventListener("click", addRow);
    $("#deleteRowsButton").addEventListener("click", deleteSelectedRows);
    $("#duplicateRowsButton").addEventListener("click", duplicateSelectedRows);
    $("#selectAllButton").addEventListener("click", selectAllRows);
    $("#clearSelectionButton").addEventListener("click", clearSelection);
    $("#undoButton").addEventListener("click", undo);
    $("#redoButton").addEventListener("click", redo);

    ["productTable", "storyTable", "craftTable"].forEach(id => {
      const wrapper = $(`#${id}`);
      wrapper.addEventListener("click", handleTableClick);
      wrapper.addEventListener("change", handleTableChange);
      wrapper.addEventListener("focusin", handleTableFocusIn);
      wrapper.addEventListener("focusout", handleTableFocusOut);
      wrapper.addEventListener("dragstart", handleDragStart);
      wrapper.addEventListener("dragend", handleDragEnd);
      wrapper.addEventListener("dragover", handleDragOver);
      wrapper.addEventListener("drop", handleDrop);
    });

    $("#addThemeButton").addEventListener("click", addTheme);
    $("#themeList").addEventListener("change", event => {
      if (event.target.dataset.action === "rename-theme") renameTheme(event.target.closest("[data-theme-id]").dataset.themeId, event.target.value);
    });
    $("#themeList").addEventListener("click", event => {
      const button = event.target.closest("[data-action='delete-theme']");
      if (button) deleteTheme(button.closest("[data-theme-id]").dataset.themeId);
    });

    $("#saveVersionButton").addEventListener("click", saveVersion);
    $("#versionList").addEventListener("click", event => {
      const button = event.target.closest("[data-action='restore-version']");
      if (button) restoreVersion(button.dataset.versionId);
    });

    $("#copyMarkdownButton").addEventListener("click", copyMarkdown);
    $("#downloadMarkdownButton").addEventListener("click", downloadMarkdown);
    $("#closeLightboxButton").addEventListener("click", closeLightbox);
    $("#lightbox").addEventListener("click", event => { if (event.target === $("#lightbox")) closeLightbox(); });

    $$(".close-modal").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
    $$(".modal").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModal(modal.id); }));

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        $$(".modal:not([hidden])").forEach(modal => closeModal(modal.id));
        if (!$("#lightbox").hidden) closeLightbox();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.target.matches("input,textarea,[contenteditable='true']")) {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y" && !event.target.matches("input,textarea,[contenteditable='true']")) {
        event.preventDefault();
        redo();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && pendingSave && !isReadOnly) persistStore();
    });
  }

  async function bootstrap() {
    bindEvents();
    try {
      database = await openDatabase();
      const loaded = await idbGet(APP_KEY);
      store = normalizeStore(loaded || store);
    } catch (error) {
      console.error(error);
      storageAvailable = false;
      toast("无法打开本地数据库，建议使用最新版 Chrome、Edge 或 Safari", "error");
    }
    $("#loading").hidden = true;
    $("#dashboard").hidden = false;
    renderDashboard();
  }

  bootstrap();
})();
