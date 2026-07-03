(() => {
  "use strict";

  const STORAGE_KEY = "creative-toolbox-launch-checklist-v1";
  const STATUS_LABELS = {
    data: "资料整理中",
    sampling: "等待打样",
    "sample-confirmation": "产前样确认",
    production: "生产中",
    warehouse: "待入库",
    completed: "已完成",
    "at-risk": "有风险"
  };
  const SIZE_KEYS = ["xs", "s", "m", "l", "xl", "xxl"];
  const ADVANCED_STATUSES = new Set(["production", "warehouse", "completed"]);

  let state = loadState();
  let saveTimer = null;
  let editingImageData = "";
  let riskOnlyFilter = false;
  let printCleanupTimer = null;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function uid(prefix = "id") {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function todayISO() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
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
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })}`;
  }

  function differenceInDays(startValue, endValue) {
    const start = parseDate(startValue);
    const end = parseDate(endValue);
    if (!start || !end) return 0;
    return Math.round((end - start) / 86400000);
  }

  function nonNegativeInteger(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function normalizeSizes(sizes = {}) {
    return {
      xs: nonNegativeInteger(sizes.xs),
      s: nonNegativeInteger(sizes.s),
      m: nonNegativeInteger(sizes.m),
      l: nonNegativeInteger(sizes.l),
      xl: nonNegativeInteger(sizes.xl),
      xxl: nonNegativeInteger(sizes.xxl)
    };
  }

  function normalizeProduct(product = {}) {
    return {
      id: product.id || uid("product"),
      number: String(product.number || ""),
      name: String(product.name ?? ""),
      imageDataUrl: String(product.imageDataUrl || ""),
      status: STATUS_LABELS[product.status] ? product.status : "data",
      supplier: String(product.supplier || ""),
      privateCostQuote: String(product.privateCostQuote || ""),
      moq: nonNegativeInteger(product.moq),
      arrivalDate: String(product.arrivalDate || ""),
      dimensions: String(product.dimensions || ""),
      material: String(product.material || ""),
      designConcept: String(product.designConcept || ""),
      preProductionNotes: String(product.preProductionNotes || ""),
      replenishmentCycle: String(product.replenishmentCycle || ""),
      sampleSize: String(product.sampleSize || ""),
      sizeQuantities: normalizeSizes(product.sizeQuantities),
      sampleConfirmed: Boolean(product.sampleConfirmed),
      filesReady: Boolean(product.filesReady),
      finalApprover: String(product.finalApprover || ""),
      externalRefs: product.externalRefs && typeof product.externalRefs === "object"
        ? { ...product.externalRefs }
        : {},
      createdAt: product.createdAt || new Date().toISOString(),
      updatedAt: product.updatedAt || new Date().toISOString()
    };
  }

  function normalizeProject(project = {}) {
    return {
      id: project.id || uid("checklist"),
      name: String(project.name || "未命名清单"),
      description: String(project.description || ""),
      products: Array.isArray(project.products) ? project.products.map(normalizeProduct) : [],
      externalRefs: project.externalRefs && typeof project.externalRefs === "object"
        ? { ...project.externalRefs }
        : {},
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: project.updatedAt || new Date().toISOString()
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
      console.warn("Launch Checklist local data could not be read", error);
      return { version: 1, projects: [], activeProjectId: "" };
    }
  }

  function saveState(immediate = false) {
    const status = $("#saveStatus");
    status.textContent = "正在保存…";
    status.className = "save-status saving";

    const persist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        status.textContent = `已保存 · ${new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })}`;
        status.className = "save-status saved";
      } catch (error) {
        console.error(error);
        status.textContent = "保存失败，请导出备份";
        status.className = "save-status error";
        toast("本地空间可能不足。请移除部分图片，或先导出 JSON 备份。", "error");
      }
    };

    clearTimeout(saveTimer);
    if (immediate) persist();
    else saveTimer = setTimeout(persist, 320);
  }

  function currentProject() {
    return state.projects.find(project => project.id === state.activeProjectId) || null;
  }

  function findProduct(project, productId) {
    return project?.products.find(product => product.id === productId) || null;
  }

  function touchProject(project) {
    project.updatedAt = new Date().toISOString();
    saveState();
  }

  function totalQuantity(product) {
    return SIZE_KEYS.reduce((total, key) => total + nonNegativeInteger(product.sizeQuantities?.[key]), 0);
  }

  function productCompletion(product) {
    const checks = [
      Boolean(product.number.trim()),
      Boolean(product.name.trim()),
      Boolean(product.imageDataUrl),
      Boolean(product.supplier.trim()),
      product.moq > 0,
      Boolean(product.arrivalDate),
      Boolean(product.dimensions.trim()),
      Boolean(product.material.trim()),
      Boolean(product.designConcept.trim()),
      Boolean(product.preProductionNotes.trim()),
      Boolean(product.replenishmentCycle.trim()),
      Boolean(product.sampleSize.trim()),
      totalQuantity(product) > 0,
      product.sampleConfirmed,
      product.filesReady
    ];
    const complete = checks.filter(Boolean).length;
    return {
      complete,
      total: checks.length,
      percent: Math.round((complete / checks.length) * 100)
    };
  }

  function evaluateProductRisks(product) {
    const risks = [];
    const add = (level, code, title, text) => risks.push({
      level,
      code,
      productId: product.id,
      title,
      text
    });

    if (!product.name.trim()) add("high", "missing-name", "缺少产品名称", "产品无法在清单中被清晰识别。");
    if (!product.number.trim()) add("medium", "missing-number", "缺少产品编号", "建议设置唯一编号，便于后续核对与归档。");
    if (!product.imageDataUrl) add("medium", "missing-image", "缺少高清效果图", "补充效果图可以减少设计与生产沟通偏差。");
    if (!product.supplier.trim()) add("medium", "missing-supplier", "尚未填写合作供应商", "生产责任方还不明确。");
    if (!product.arrivalDate) add("high", "missing-arrival", "缺少大货到店日期", "无法判断交付是否按计划推进。");
    if (!product.dimensions.trim()) add("medium", "missing-dimensions", "缺少尺寸与规格", "生产资料中的关键规格尚未补齐。");
    if (!product.material.trim()) add("medium", "missing-material", "缺少面料或材料", "材料信息会直接影响打样和生产确认。");
    if (!product.designConcept.trim()) add("medium", "missing-concept", "缺少设计思路及元素介绍", "建议补充设计依据，方便对外说明与内部复核。");
    if (!product.preProductionNotes.trim()) add("medium", "missing-sample-notes", "缺少产前样备注", "建议记录颜色、尺寸、工艺或包装的确认结果。");
    if (!product.replenishmentCycle.trim()) add("medium", "missing-replenishment", "缺少补货周期", "后续补货时间目前无法预估。");
    if (!product.sampleSize.trim()) add("medium", "missing-sample-size", "缺少样衣尺码", "样衣基准尺码尚未记录。");
    if (product.moq <= 0) add("medium", "missing-moq", "缺少起订量", "无法核对当前尺码数量是否满足生产要求。");

    const quantity = totalQuantity(product);
    if (quantity <= 0) {
      add("medium", "missing-quantity", "尚未填写尺码数量", "至少填写一个尺码数量，系统才能计算生产总量。");
    } else if (product.moq > 0 && quantity < product.moq) {
      add(
        "high",
        "below-moq",
        `当前总量低于起订量 ${product.moq - quantity} 件`,
        `尺码合计 ${quantity} 件，供应商起订量为 ${product.moq} 件。`
      );
    }

    if (product.arrivalDate && product.arrivalDate < todayISO() && product.status !== "completed") {
      const overdue = differenceInDays(product.arrivalDate, todayISO());
      add(
        "high",
        "overdue",
        `大货到店已延期 ${overdue} 天`,
        `原计划 ${formatDate(product.arrivalDate, true)} 到店，当前状态为“${STATUS_LABELS[product.status]}”。`
      );
    }

    if (product.status === "at-risk") {
      add("high", "marked-risk", "产品已被标记为有风险", "请检查当前生产状态并补充必要说明。");
    }

    if (ADVANCED_STATUSES.has(product.status) && !product.sampleConfirmed) {
      add(
        "high",
        "sample-unconfirmed",
        "产前样尚未确认",
        `产品已进入“${STATUS_LABELS[product.status]}”，但产前样确认仍未完成。`
      );
    }

    if (ADVANCED_STATUSES.has(product.status) && !product.filesReady) {
      add(
        "high",
        "files-not-ready",
        "生产文件尚未齐全",
        `产品已进入“${STATUS_LABELS[product.status]}”，请确认源文件和工艺说明。`
      );
    }

    return risks;
  }

  function productHasHighRisk(product) {
    return evaluateProductRisks(product).some(risk => risk.level === "high");
  }

  function projectMetrics(project) {
    const entries = project.products.map(product => ({
      product,
      completion: productCompletion(product),
      risks: evaluateProductRisks(product)
    }));
    const riskProducts = entries.filter(entry => entry.risks.some(risk => risk.level === "high")).length;
    const completeProducts = entries.filter(entry =>
      entry.completion.percent === 100 && !entry.risks.some(risk => risk.level === "high")
    ).length;
    const pendingProducts = entries.filter(entry =>
      entry.completion.percent < 100 && !entry.risks.some(risk => risk.level === "high")
    ).length;
    return {
      all: entries.length,
      complete: completeProducts,
      pending: pendingProducts,
      risk: riskProducts,
      riskItems: entries.flatMap(entry => entry.risks)
    };
  }

  function renderDashboard() {
    const query = $("#dashboardSearchInput").value.trim().toLowerCase();
    const projects = [...state.projects]
      .filter(project =>
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query)
      )
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const allProducts = state.projects.reduce((sum, project) => sum + project.products.length, 0);
    const allRisks = state.projects.reduce(
      (sum, project) => sum + projectMetrics(project).riskItems.length,
      0
    );

    $("#dashboardProjectCount").textContent = state.projects.length;
    $("#dashboardProductCount").textContent = allProducts;
    $("#dashboardRiskCount").textContent = allRisks;
    $("#emptyDashboard").hidden = state.projects.length !== 0;
    $("#projectGrid").hidden = state.projects.length === 0;

    $("#projectGrid").innerHTML = projects.map(project => {
      const metrics = projectMetrics(project);
      const average = project.products.length
        ? Math.round(project.products.reduce((sum, product) => sum + productCompletion(product).percent, 0) / project.products.length)
        : 0;
      return `
        <article class="project-card" data-project-id="${project.id}" tabindex="0" role="button">
          <div class="project-card-top">
            <span class="project-card-icon">✓</span>
            ${metrics.risk
              ? `<span class="project-risk-badge">${metrics.risk} 个风险产品</span>`
              : ""}
          </div>
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.description || "产品生产资料与交付检查清单")}</p>
          <div class="project-card-footer">
            <span>${project.products.length} 个产品 · 平均 ${average}%</span>
            <button class="card-delete-button" type="button" data-delete-project="${project.id}">删除</button>
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
        if (!confirm(`确定删除“${project.name}”吗？其中的产品和图片也会从当前浏览器删除。`)) return;
        state.projects = state.projects.filter(item => item.id !== project.id);
        if (state.activeProjectId === project.id) state.activeProjectId = "";
        saveState(true);
        renderDashboard();
        toast("清单已删除");
      });
    });
  }

  function filteredProducts(project) {
    const query = $("#productSearchInput").value.trim().toLowerCase();
    const status = $("#statusFilter").value;
    return project.products
      .filter(product => {
        const matchesSearch = !query ||
          product.number.toLowerCase().includes(query) ||
          product.name.toLowerCase().includes(query) ||
          product.supplier.toLowerCase().includes(query);
        const matchesStatus = !status || product.status === status;
        const matchesRisk = !riskOnlyFilter || productHasHighRisk(product);
        return matchesSearch && matchesStatus && matchesRisk;
      })
      .sort((a, b) =>
        (a.number || "zzzz").localeCompare(b.number || "zzzz", "zh-CN", { numeric: true }) ||
        a.name.localeCompare(b.name, "zh-CN")
      );
  }

  function renderWorkspace() {
    const project = currentProject();
    if (!project) {
      showDashboard();
      return;
    }

    const metrics = projectMetrics(project);
    const products = filteredProducts(project);

    $("#projectNameInput").value = project.name;
    $("#projectMeta").textContent =
      `${project.products.length} 个产品 · 更新于 ${formatUpdated(project.updatedAt)}`;
    $("#summaryAll").textContent = metrics.all;
    $("#summaryComplete").textContent = metrics.complete;
    $("#summaryPending").textContent = metrics.pending;
    $("#summaryRisk").textContent = metrics.risk;

    const highRisks = metrics.riskItems.filter(risk => risk.level === "high");
    $("#riskBanner").hidden = highRisks.length === 0;
    if (highRisks.length) {
      $("#riskBannerTitle").textContent =
        `${metrics.risk} 个产品存在交付风险，共 ${highRisks.length} 项高优先级提醒`;
      $("#riskBannerText").textContent = highRisks[0].title;
    }
    $("#showRiskProductsButton").textContent = riskOnlyFilter ? "显示全部产品" : "只看风险产品";

    $("#filterResultText").textContent =
      riskOnlyFilter ? `${products.length} 个风险产品` : `${products.length} 个产品`;

    const hasProducts = project.products.length > 0;
    const hasFilteredProducts = products.length > 0;
    $("#productTableWrap").hidden = !hasProducts || !hasFilteredProducts;
    $("#emptyProducts").hidden = hasProducts;
    $("#emptyFilter").hidden = !hasProducts || hasFilteredProducts;

    $("#productTableBody").innerHTML = products.map(product => {
      const completion = productCompletion(product);
      const risks = evaluateProductRisks(product);
      const highRiskCount = risks.filter(risk => risk.level === "high").length;
      return `
        <tr data-product-id="${product.id}">
          <td>
            <div class="product-thumb">
              ${product.imageDataUrl
                ? `<img src="${product.imageDataUrl}" alt="${escapeHtml(product.name)} 效果图">`
                : "暂无图片"}
            </div>
          </td>
          <td class="product-name-cell">
            <strong>${escapeHtml(product.name || "未命名产品")}</strong>
            <small>${escapeHtml(product.number || "未设置编号")}${product.supplier ? ` · ${escapeHtml(product.supplier)}` : ""}</small>
          </td>
          <td><span class="status-pill ${product.status}">${STATUS_LABELS[product.status]}</span></td>
          <td>${formatDate(product.arrivalDate, true)}</td>
          <td>
            <div class="completion-cell">
              <div class="completion-bar"><span style="width:${completion.percent}%"></span></div>
              <small>${completion.percent}% · ${completion.complete}/${completion.total} 项</small>
            </div>
          </td>
          <td>
            ${highRiskCount
              ? `<span class="risk-pill">${highRiskCount} 项高风险</span>`
              : risks.length
                ? `<span class="risk-pill">${risks.length} 项提醒</span>`
                : `<span class="risk-pill ok">正常</span>`}
          </td>
          <td><button class="row-action-button" type="button" data-edit-product="${product.id}">编辑</button></td>
        </tr>
      `;
    }).join("");

    $$("[data-product-id]").forEach(row => {
      row.addEventListener("click", event => {
        if (event.target.closest("button")) return;
        openProductModal(row.dataset.productId);
      });
    });
    $$("[data-edit-product]").forEach(button => {
      button.addEventListener("click", () => openProductModal(button.dataset.editProduct));
    });
  }

  function showDashboard() {
    state.activeProjectId = "";
    riskOnlyFilter = false;
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
    renderWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCreateProjectModal() {
    $("#createProjectNameInput").value = "";
    $("#createProjectDescriptionInput").value = "";
    $("#createProjectModal").hidden = false;
    setTimeout(() => $("#createProjectNameInput").focus(), 20);
  }

  function closeCreateProjectModal() {
    $("#createProjectModal").hidden = true;
  }

  function createProject() {
    const name = $("#createProjectNameInput").value.trim();
    const description = $("#createProjectDescriptionInput").value.trim();
    if (!name) {
      toast("请填写清单名称。", "error");
      $("#createProjectNameInput").focus();
      return;
    }
    const project = normalizeProject({
      id: uid("checklist"),
      name,
      description,
      products: []
    });
    state.projects.unshift(project);
    state.activeProjectId = project.id;
    saveState(true);
    closeCreateProjectModal();
    showWorkspace();
    toast("交付清单已创建", "success");
  }

  function blankProduct(project) {
    return normalizeProduct({
      id: uid("product"),
      number: String(project.products.length + 1).padStart(3, "0"),
      name: "",
      status: "data",
      externalRefs: {}
    });
  }

  function formProductData(baseProduct = null) {
    return normalizeProduct({
      ...(baseProduct || {}),
      id: baseProduct?.id || $("#productIdInput").value || uid("product"),
      number: $("#productNumberInput").value.trim(),
      name: $("#productNameInput").value.trim(),
      imageDataUrl: editingImageData,
      status: $("#productStatusInput").value,
      supplier: $("#supplierInput").value.trim(),
      privateCostQuote: $("#privateCostQuoteInput").value.trim(),
      moq: nonNegativeInteger($("#moqInput").value),
      arrivalDate: $("#arrivalDateInput").value,
      dimensions: $("#dimensionsInput").value.trim(),
      material: $("#materialInput").value.trim(),
      designConcept: $("#designConceptInput").value.trim(),
      preProductionNotes: $("#preProductionNotesInput").value.trim(),
      replenishmentCycle: $("#replenishmentCycleInput").value.trim(),
      sampleSize: $("#sampleSizeInput").value.trim(),
      sizeQuantities: {
        xs: nonNegativeInteger($("#sizeXsInput").value),
        s: nonNegativeInteger($("#sizeSInput").value),
        m: nonNegativeInteger($("#sizeMInput").value),
        l: nonNegativeInteger($("#sizeLInput").value),
        xl: nonNegativeInteger($("#sizeXlInput").value),
        xxl: nonNegativeInteger($("#sizeXxlInput").value)
      },
      sampleConfirmed: $("#sampleConfirmedInput").checked,
      filesReady: $("#filesReadyInput").checked,
      finalApprover: $("#finalApproverInput").value.trim(),
      externalRefs: baseProduct?.externalRefs || {},
      createdAt: baseProduct?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  function openProductModal(productId = "") {
    const project = currentProject();
    if (!project) return;
    const existing = productId ? findProduct(project, productId) : null;
    const product = existing || blankProduct(project);

    $("#productModalTitle").textContent = existing ? "编辑产品" : "新增产品";
    $("#productIdInput").value = existing?.id || "";
    $("#productNumberInput").value = product.number;
    $("#productNameInput").value = existing ? product.name : "";
    $("#productStatusInput").value = product.status;
    $("#arrivalDateInput").value = product.arrivalDate;
    $("#dimensionsInput").value = product.dimensions;
    $("#materialInput").value = product.material;
    $("#sampleSizeInput").value = product.sampleSize;
    $("#moqInput").value = product.moq || "";
    $("#designConceptInput").value = product.designConcept;
    $("#preProductionNotesInput").value = product.preProductionNotes;
    $("#sampleConfirmedInput").checked = product.sampleConfirmed;
    $("#filesReadyInput").checked = product.filesReady;
    $("#supplierInput").value = product.supplier;
    $("#replenishmentCycleInput").value = product.replenishmentCycle;
    $("#finalApproverInput").value = product.finalApprover;
    $("#privateCostQuoteInput").value = product.privateCostQuote;
    $("#sizeXsInput").value = product.sizeQuantities.xs;
    $("#sizeSInput").value = product.sizeQuantities.s;
    $("#sizeMInput").value = product.sizeQuantities.m;
    $("#sizeLInput").value = product.sizeQuantities.l;
    $("#sizeXlInput").value = product.sizeQuantities.xl;
    $("#sizeXxlInput").value = product.sizeQuantities.xxl;
    editingImageData = product.imageDataUrl;
    updateImagePreview();
    $("#deleteProductButton").hidden = !existing;
    $("#productModal").hidden = false;
    document.body.style.overflow = "hidden";
    updateProductFormInsights();
    setTimeout(() => $("#productNameInput").focus(), 30);
  }

  function closeProductModal() {
    $("#productModal").hidden = true;
    document.body.style.overflow = "";
    editingImageData = "";
    $("#productImageInput").value = "";
  }

  function updateImagePreview() {
    const preview = $("#productImagePreview");
    const placeholder = $("#imagePlaceholder");
    if (editingImageData) {
      preview.src = editingImageData;
      preview.hidden = false;
      placeholder.hidden = true;
      $("#removeImageButton").hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
      placeholder.hidden = false;
      $("#removeImageButton").hidden = true;
    }
  }

  function updateProductFormInsights() {
    const project = currentProject();
    if (!project || $("#productModal").hidden) return;
    const existing = findProduct(project, $("#productIdInput").value);
    const product = formProductData(existing);
    const quantity = totalQuantity(product);
    const completion = productCompletion(product);
    const risks = evaluateProductRisks(product);

    $("#sizeTotalOutput").textContent = quantity;
    const hint = $("#moqHint");
    if (product.moq > 0 && quantity > 0) {
      if (quantity < product.moq) {
        hint.textContent = `当前合计 ${quantity} 件，低于起订量 ${product.moq} 件。`;
        hint.className = "field-hint warning";
      } else {
        hint.textContent = `当前合计 ${quantity} 件，已达到起订量 ${product.moq} 件。`;
        hint.className = "field-hint success";
      }
    } else if (quantity > 0) {
      hint.textContent = `当前尺码合计 ${quantity} 件。填写起订量后可自动核对。`;
      hint.className = "field-hint";
    } else {
      hint.textContent = "填写尺码数量后将自动计算总量。";
      hint.className = "field-hint";
    }

    $("#productCompletionText").textContent =
      `资料完成度 ${completion.percent}% · ${risks.length} 项提醒`;

    $("#productRiskSection").hidden = risks.length === 0;
    $("#productRiskList").innerHTML = risks.map(risk => `
      <div class="product-risk-item ${risk.level}">
        <span>${risk.level === "high" ? "!" : "△"}</span>
        <span><b>${escapeHtml(risk.title)}</b><small>${escapeHtml(risk.text)}</small></span>
      </div>
    `).join("");
  }

  async function compressImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
    if (file.size > 12 * 1024 * 1024) throw new Error("图片不能超过 12MB");

    const sourceUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片无法打开"));
      element.src = sourceUrl;
    });

    const maxDimension = 900;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  async function handleImage(file) {
    try {
      $("#saveStatus").textContent = "正在处理图片…";
      $("#saveStatus").className = "save-status saving";
      editingImageData = await compressImage(file);
      updateImagePreview();
      updateProductFormInsights();
      $("#saveStatus").textContent = "图片已准备，保存产品后写入本机";
      $("#saveStatus").className = "save-status saved";
    } catch (error) {
      console.error(error);
      toast(error.message || "图片处理失败。", "error");
    }
  }

  function saveProduct(event) {
    event.preventDefault();
    const project = currentProject();
    if (!project) return;
    const currentId = $("#productIdInput").value;
    const existing = findProduct(project, currentId);
    const product = formProductData(existing);

    if (!product.name.trim()) {
      toast("请填写产品名称。", "error");
      $("#productNameInput").focus();
      return;
    }

    if (existing) {
      const index = project.products.findIndex(item => item.id === existing.id);
      project.products[index] = product;
    } else {
      project.products.push(product);
    }

    touchProject(project);
    saveState(true);
    closeProductModal();
    renderWorkspace();
    toast(existing ? "产品资料已更新" : "产品已加入清单", "success");
  }

  function deleteCurrentProduct() {
    const project = currentProject();
    const product = findProduct(project, $("#productIdInput").value);
    if (!project || !product) return;
    if (!confirm(`确定删除“${product.name}”吗？图片和资料也会从当前浏览器移除。`)) return;
    project.products = project.products.filter(item => item.id !== product.id);
    touchProject(project);
    saveState(true);
    closeProductModal();
    renderWorkspace();
    toast("产品已删除");
  }

  function duplicateProject() {
    const project = currentProject();
    if (!project) return;
    const copy = normalizeProject({
      ...project,
      id: uid("checklist"),
      name: `${project.name} 副本`,
      products: project.products.map(product => ({
        ...product,
        id: uid("product"),
        externalRefs: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })),
      externalRefs: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    state.projects.unshift(copy);
    state.activeProjectId = copy.id;
    saveState(true);
    renderWorkspace();
    toast("清单副本已创建", "success");
  }

  function safeFilename(value) {
    return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "launch-checklist";
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

  function exportableProduct(product, includePrivate) {
    const output = {
      ...product,
      externalRefs: product.externalRefs || {}
    };
    if (!includePrivate) delete output.privateCostQuote;
    return output;
  }

  function exportJson() {
    const project = currentProject();
    if (!project) return;
    const includePrivate = $("#includePrivateExportInput").checked;
    const payload = {
      type: "creative-toolbox-launch-checklist",
      version: 1,
      exportedAt: new Date().toISOString(),
      includesPrivateCostQuote: includePrivate,
      project: {
        ...project,
        products: project.products.map(product => exportableProduct(product, includePrivate)),
        externalRefs: project.externalRefs || {}
      }
    };
    downloadFile(
      `${safeFilename(project.name)}-launch-checklist.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
    toast(includePrivate ? "JSON 已导出，并包含私密报价" : "JSON 已导出，不包含私密报价", "success");
  }

  function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const project = currentProject();
    if (!project) return;
    const includePrivate = $("#includePrivateExportInput").checked;
    const headers = [
      "编号", "产品名称", "状态", "合作供应商", "起订量", "大货到店日期",
      "尺寸与规格", "面料/材料", "设计思路及元素介绍", "产前样备注",
      "补货周期", "样衣尺码", "XS/155", "S/160", "M/165", "L/170",
      "XL/175", "XXL/180", "数量合计", "产前样已确认", "生产文件已齐全",
      "最终确认人", "资料完成度", "高风险数量"
    ];
    if (includePrivate) headers.splice(4, 0, "成本报价");

    const rows = project.products.map(product => {
      const completion = productCompletion(product);
      const highRisks = evaluateProductRisks(product).filter(risk => risk.level === "high").length;
      const row = [
        product.number,
        product.name,
        STATUS_LABELS[product.status],
        product.supplier,
        product.moq,
        product.arrivalDate,
        product.dimensions,
        product.material,
        product.designConcept,
        product.preProductionNotes,
        product.replenishmentCycle,
        product.sampleSize,
        product.sizeQuantities.xs,
        product.sizeQuantities.s,
        product.sizeQuantities.m,
        product.sizeQuantities.l,
        product.sizeQuantities.xl,
        product.sizeQuantities.xxl,
        totalQuantity(product),
        product.sampleConfirmed ? "是" : "否",
        product.filesReady ? "是" : "否",
        product.finalApprover,
        `${completion.percent}%`,
        highRisks
      ];
      if (includePrivate) row.splice(4, 0, product.privateCostQuote);
      return row;
    });

    const csv = "\uFEFF" + [headers, ...rows]
      .map(row => row.map(csvEscape).join(","))
      .join("\r\n");
    downloadFile(
      `${safeFilename(project.name)}-products.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
    toast(includePrivate ? "CSV 已导出，并包含私密报价" : "CSV 已导出，不包含私密报价", "success");
  }

  function buildPrintReport(includePrivate) {
    removePrintReport();
    const project = currentProject();
    if (!project) return;
    const report = document.createElement("section");
    report.id = "printReport";
    report.className = "print-report";
    report.innerHTML = `
      <header>
        <p>LAUNCH CHECKLIST</p>
        <h1>${escapeHtml(project.name)}</h1>
        <span>${escapeHtml(project.description || "")}</span>
      </header>
      ${project.products.map(product => {
        const completion = productCompletion(product);
        const risks = evaluateProductRisks(product);
        return `
          <article class="print-product">
            <div class="print-product-heading">
              ${product.imageDataUrl ? `<img src="${product.imageDataUrl}" alt="">` : ""}
              <div>
                <small>${escapeHtml(product.number || "未设置编号")}</small>
                <h2>${escapeHtml(product.name)}</h2>
                <p>${STATUS_LABELS[product.status]} · 资料完成度 ${completion.percent}% · ${risks.length} 项提醒</p>
              </div>
            </div>
            <dl>
              <div><dt>合作供应商</dt><dd>${escapeHtml(product.supplier || "—")}</dd></div>
              ${includePrivate ? `<div><dt>成本报价</dt><dd>${escapeHtml(product.privateCostQuote || "—")}</dd></div>` : ""}
              <div><dt>起订量 / 数量</dt><dd>${product.moq || "—"} / ${totalQuantity(product)}</dd></div>
              <div><dt>大货到店</dt><dd>${formatDate(product.arrivalDate, true)}</dd></div>
              <div><dt>尺寸与规格</dt><dd>${escapeHtml(product.dimensions || "—")}</dd></div>
              <div><dt>面料 / 材料</dt><dd>${escapeHtml(product.material || "—")}</dd></div>
              <div><dt>样衣尺码</dt><dd>${escapeHtml(product.sampleSize || "—")}</dd></div>
              <div><dt>补货周期</dt><dd>${escapeHtml(product.replenishmentCycle || "—")}</dd></div>
              <div class="wide"><dt>设计思路及元素介绍</dt><dd>${escapeHtml(product.designConcept || "—")}</dd></div>
              <div class="wide"><dt>产前样备注</dt><dd>${escapeHtml(product.preProductionNotes || "—")}</dd></div>
              <div class="wide"><dt>尺码数量</dt><dd>XS ${product.sizeQuantities.xs} · S ${product.sizeQuantities.s} · M ${product.sizeQuantities.m} · L ${product.sizeQuantities.l} · XL ${product.sizeQuantities.xl} · XXL ${product.sizeQuantities.xxl}</dd></div>
            </dl>
          </article>
        `;
      }).join("")}
    `;
    document.body.appendChild(report);
    document.body.classList.add("printing-report");
  }

  function removePrintReport() {
    $("#printReport")?.remove();
    document.body.classList.remove("printing-report");
  }

  function printReport() {
    const includePrivate = $("#includePrivateExportInput").checked;
    buildPrintReport(includePrivate);
    clearTimeout(printCleanupTimer);
    window.print();
    printCleanupTimer = setTimeout(removePrintReport, 1200);
  }

  function importProject(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const sourceProject = data.project || data;
        if (!sourceProject || typeof sourceProject !== "object" || !Array.isArray(sourceProject.products)) {
          throw new Error("文件不包含有效产品清单");
        }
        const project = normalizeProject({
          ...sourceProject,
          id: uid("checklist"),
          name: sourceProject.name || "导入的产品清单",
          products: sourceProject.products.map(product => ({
            ...product,
            id: uid("product"),
            externalRefs: product.externalRefs || {}
          })),
          externalRefs: sourceProject.externalRefs || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        state.projects.unshift(project);
        state.activeProjectId = project.id;
        saveState(true);
        showWorkspace();
        toast("产品交付清单已导入", "success");
      } catch (error) {
        console.error(error);
        toast("无法导入。请确认文件来自 Launch Checklist。", "error");
      } finally {
        $("#importFileInput").value = "";
      }
    };
    reader.readAsText(file);
  }

  function positionExportMenu() {
    const button = $("#exportMenuButton");
    const menu = $("#exportMenu");
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${Math.max(12, rect.right - 230)}px`;
  }

  function toast(message, type = "") {
    const element = $("#toast");
    element.textContent = message;
    element.className = `toast ${type}`.trim();
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      element.hidden = true;
    }, 3000);
  }

  function bindEvents() {
    $("#openCreateProjectButton").addEventListener("click", openCreateProjectModal);
    $$('[data-action="open-create-project"]').forEach(button =>
      button.addEventListener("click", openCreateProjectModal)
    );
    $$('[data-action="close-create-project"]').forEach(button =>
      button.addEventListener("click", closeCreateProjectModal)
    );
    $("#createProjectConfirmButton").addEventListener("click", createProject);

    $("#backToDashboardButton").addEventListener("click", showDashboard);
    $("#addProductButton").addEventListener("click", () => openProductModal());
    $$('[data-action="add-product"]').forEach(button =>
      button.addEventListener("click", () => openProductModal())
    );
    $$('[data-action="close-product"]').forEach(button =>
      button.addEventListener("click", closeProductModal)
    );

    $("#productForm").addEventListener("submit", saveProduct);
    $("#deleteProductButton").addEventListener("click", deleteCurrentProduct);
    $("#duplicateProjectButton").addEventListener("click", duplicateProject);

    $("#dashboardSearchInput").addEventListener("input", renderDashboard);
    $("#productSearchInput").addEventListener("input", renderWorkspace);
    $("#statusFilter").addEventListener("change", () => {
      riskOnlyFilter = false;
      renderWorkspace();
    });
    $("#clearFilterButton").addEventListener("click", () => {
      $("#productSearchInput").value = "";
      $("#statusFilter").value = "";
      riskOnlyFilter = false;
      renderWorkspace();
    });
    $("#showRiskProductsButton").addEventListener("click", () => {
      riskOnlyFilter = !riskOnlyFilter;
      renderWorkspace();
    });

    $("#projectNameInput").addEventListener("input", event => {
      const project = currentProject();
      if (!project) return;
      project.name = event.target.value.trim() || "未命名清单";
      touchProject(project);
    });

    $("#imagePreviewButton").addEventListener("click", () => $("#productImageInput").click());
    $("#productImageInput").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) handleImage(file);
    });
    $("#removeImageButton").addEventListener("click", () => {
      editingImageData = "";
      updateImagePreview();
      updateProductFormInsights();
    });

    [
      "productNumberInput", "productNameInput", "productStatusInput", "arrivalDateInput",
      "dimensionsInput", "materialInput", "sampleSizeInput", "moqInput",
      "designConceptInput", "preProductionNotesInput", "sampleConfirmedInput",
      "filesReadyInput", "supplierInput", "replenishmentCycleInput",
      "finalApproverInput", "privateCostQuoteInput", "sizeXsInput", "sizeSInput",
      "sizeMInput", "sizeLInput", "sizeXlInput", "sizeXxlInput"
    ].forEach(id => {
      const element = $(`#${id}`);
      element.addEventListener(
        element.type === "checkbox" || element.tagName === "SELECT" || element.type === "date"
          ? "change"
          : "input",
        updateProductFormInsights
      );
    });

    $("#importProjectButton").addEventListener("click", () => $("#importFileInput").click());
    $("#importFileInput").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) importProject(file);
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
        if (button.dataset.export === "json") exportJson();
        if (button.dataset.export === "csv") exportCsv();
        if (button.dataset.export === "print") printReport();
      });
    });

    document.addEventListener("click", event => {
      if (!event.target.closest("#exportMenu") && !event.target.closest("#exportMenuButton")) {
        $("#exportMenu").hidden = true;
      }
    });

    $("#createProjectModal").addEventListener("click", event => {
      if (event.target === $("#createProjectModal")) closeCreateProjectModal();
    });
    $("#productModal").addEventListener("click", event => {
      if (event.target === $("#productModal")) closeProductModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeCreateProjectModal();
        closeProductModal();
        $("#exportMenu").hidden = true;
      }
    });

    window.addEventListener("afterprint", removePrintReport);
  }

  bindEvents();
  if (state.activeProjectId && currentProject()) showWorkspace();
  else renderDashboard();
})();
