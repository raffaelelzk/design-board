(() => {
  "use strict";

  const CONFIG = window.CREATIVE_TOOLBOX_CONFIG || {};
  const STORAGE_KEY = "creative-toolbox-cloud-session-v1";
  const DEFAULT_TIMEOUT = Number(CONFIG.loadTimeoutMs || 8000);
  const SAVE_DELAY = Number(CONFIG.saveDelay || 650);

  let supabase = null;
  let session = readSession();
  let currentDocument = null;
  let currentRole = session.role || "";
  let saveTimer = null;
  let queuedPayload = null;
  let saving = false;
  let realtimeChannel = null;
  let remoteUpdateHandler = null;
  let statusElement = null;
  let lastRemoteVersion = 0;
  let lastLocalSaveStartedAt = 0;

  const $ = selector => document.querySelector(selector);

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeSession(next) {
    session = { ...session, ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    updateWorkspaceBadge();
  }

  function clearSession() {
    session = {};
    currentRole = "";
    currentDocument = null;
    localStorage.removeItem(STORAGE_KEY);
    updateWorkspaceBadge();
  }

  function isConfigured() {
    return Boolean(
      CONFIG.supabaseUrl &&
      CONFIG.supabaseAnonKey &&
      !CONFIG.supabaseUrl.includes("PASTE_") &&
      !CONFIG.supabaseAnonKey.includes("PASTE_")
    );
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    if (!supabase) {
      supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        },
        realtime: {
          params: {
            eventsPerSecond: 5
          }
        }
      });
    }
    return supabase;
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function setStatus(message, state = "") {
    statusElement = statusElement || $("#cloudStatus") || $("#saveStatus");
    if (!statusElement) return;
    statusElement.textContent = message;
    const baseClass = statusElement.id === "cloudStatus" ? "cloud-status" : "save-status";
    statusElement.className = `${baseClass} ${state}`.trim();
  }

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function workspaceParam() {
    return getParams().get("workspace") || getParams().get("w") || "";
  }

  function shareParam() {
    return getParams().get("share") || getParams().get("token") || "";
  }

  function workspaceId() {
    return workspaceParam() || session.workspaceId || "";
  }

  function roleLabel(role = currentRole) {
    return role === "owner" ? "所有者" : role === "editor" ? "可编辑" : role === "viewer" ? "只读" : "未连接";
  }

  function updateWorkspaceBadge() {
    const badge = $("#workspaceBadge");
    if (!badge) return;
    if (session.workspaceId) {
      badge.innerHTML = `
        <span>当前工作区</span>
        <strong>${escapeHtml(session.workspaceName || session.workspaceId.slice(0, 8))}</strong>
        <small>${roleLabel(session.role)}</small>
      `;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function toolUrl(toolPath) {
    const workspace = session.workspaceId ? `?workspace=${encodeURIComponent(session.workspaceId)}` : "";
    return `${toolPath}${workspace}`;
  }

  async function ensureAnonymousUser() {
    const client = getClient();
    if (!client) throw new Error("Supabase 未配置");
    const { data: existing } = await client.auth.getSession();
    if (existing?.session?.user) return existing.session.user;

    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  async function createWorkspace(name) {
    const client = getClient();
    if (!client) throw new Error("Supabase 未配置。请先填写 cloud-config.js。");
    setStatus("正在创建工作区…", "saving");
    await ensureAnonymousUser();

    const { data, error } = await withTimeout(
      client.rpc("create_workspace", { p_name: name || "Creative Workspace" }),
      DEFAULT_TIMEOUT,
      "创建工作区超时"
    );
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.workspace_id) throw new Error("创建工作区失败");

    writeSession({
      workspaceId: result.workspace_id,
      workspaceName: result.workspace_name || name || "Creative Workspace",
      role: result.role || "owner",
      editToken: result.edit_token,
      viewToken: result.view_token
    });
    currentRole = session.role;
    setStatus("云端已连接", "saved");
    return result;
  }

  async function openShareToken(token) {
    const client = getClient();
    if (!client) throw new Error("Supabase 未配置。请先填写 cloud-config.js。");
    if (!token || !token.trim()) throw new Error("请输入分享码");
    setStatus("正在打开分享链接…", "saving");
    await ensureAnonymousUser();

    const { data, error } = await withTimeout(
      client.rpc("accept_share_token", { p_token: token.trim() }),
      DEFAULT_TIMEOUT,
      "打开分享码超时"
    );
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.workspace_id) throw new Error("分享码无效");

    writeSession({
      workspaceId: result.workspace_id,
      workspaceName: result.workspace_name || "Shared Workspace",
      role: result.role || "viewer"
    });
    currentRole = session.role;
    setStatus("云端已连接", "saved");
    return result;
  }

  async function boot(options) {
    const {
      toolType,
      title,
      defaultPayload,
      getPayload,
      setPayload,
      onRemoteUpdate
    } = options;

    statusElement = $("#cloudStatus") || $("#saveStatus");
    remoteUpdateHandler = onRemoteUpdate;

    if (!isConfigured()) {
      setStatus("云端未配置，本机模式", "error");
      return {
        mode: "local",
        reason: "missing-config",
        payload: null,
        role: "local"
      };
    }

    const client = getClient();
    if (!client) {
      setStatus("Supabase 脚本未加载，本机模式", "error");
      return {
        mode: "local",
        reason: "missing-client",
        payload: null,
        role: "local"
      };
    }

    try {
      setStatus("正在连接云端…", "saving");
      await withTimeout(ensureAnonymousUser(), DEFAULT_TIMEOUT, "匿名身份连接超时");

      const share = shareParam();
      if (share) {
        await openShareToken(share);
      }

      const targetWorkspace = workspaceId();
      if (!targetWorkspace) {
        setStatus("未选择工作区，本机模式", "error");
        return {
          mode: "local",
          reason: "no-workspace",
          payload: null,
          role: "local"
        };
      }

      const { data, error } = await withTimeout(
        client.rpc("get_or_create_document", {
          p_workspace_id: targetWorkspace,
          p_tool_type: toolType,
          p_title: title || toolType,
          p_default_payload: defaultPayload || {}
        }),
        DEFAULT_TIMEOUT,
        "读取云端文档超时"
      );
      if (error) throw error;

      const doc = Array.isArray(data) ? data[0] : data;
      if (!doc) throw new Error("没有读取到云端文档");

      currentDocument = {
        id: doc.document_id,
        workspaceId: doc.workspace_id,
        toolType: doc.tool_type,
        version: doc.version || 0,
        updatedAt: doc.updated_at
      };
      lastRemoteVersion = currentDocument.version;
      currentRole = doc.role || session.role || "viewer";
      writeSession({
        workspaceId: doc.workspace_id,
        role: currentRole,
        workspaceName: session.workspaceName || targetWorkspace
      });

      if (doc.payload_json && typeof setPayload === "function" && doc.version > 0) {
        setPayload(doc.payload_json);
      }

      subscribeDocument(getPayload, setPayload);
      setStatus(currentRole === "viewer" ? "云端已连接 · 只读" : "云端已连接", "saved");
      return {
        mode: "cloud",
        payload: doc.payload_json,
        role: currentRole,
        document: currentDocument
      };
    } catch (error) {
      console.error("Cloud boot failed", error);
      setStatus("云端连接失败，本机模式", "error");
      showCloudFallback(error.message || "云端连接失败");
      return {
        mode: "local",
        reason: error.message,
        payload: null,
        role: "local"
      };
    }
  }

  function subscribeDocument(getPayload, setPayload) {
    const client = getClient();
    if (!client || !currentDocument?.id) return;

    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = client
      .channel(`document-${currentDocument.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "documents",
          filter: `id=eq.${currentDocument.id}`
        },
        payload => {
          const next = payload.new;
          if (!next || next.updated_by === undefined) return;
          if (Date.now() - lastLocalSaveStartedAt < 900 && next.version <= lastRemoteVersion + 1) {
            lastRemoteVersion = next.version;
            currentDocument.version = next.version;
            return;
          }
          if (next.version <= lastRemoteVersion) return;

          lastRemoteVersion = next.version;
          currentDocument.version = next.version;
          setStatus("发现远程更新", "remote");

          if (typeof setPayload === "function") {
            setPayload(next.payload_json);
          }
          if (typeof remoteUpdateHandler === "function") {
            remoteUpdateHandler(next.payload_json);
          }
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          if (!isReadOnly()) setStatus("云端已连接", "saved");
        }
        if (status === "CHANNEL_ERROR") {
          setStatus("实时同步中断，点击重试", "error");
        }
      });

    window.addEventListener("online", () => {
      setStatus("网络已恢复，正在同步…", "saving");
      if (queuedPayload) flushSave(queuedPayload);
    });
    window.addEventListener("offline", () => {
      setStatus("离线，修改暂存中", "error");
    });
  }

  function queueSave(payload) {
    if (!currentDocument?.id || !isConfigured()) return;
    if (isReadOnly()) {
      setStatus("只读链接，无法保存修改", "error");
      return;
    }
    queuedPayload = payload;
    setStatus(navigator.onLine ? "正在同步……" : "离线，修改暂存中", "saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flushSave(queuedPayload), SAVE_DELAY);
  }

  async function flushSave(payload) {
    if (!currentDocument?.id || !payload || saving || isReadOnly()) return;
    if (!navigator.onLine) {
      setStatus("离线，修改暂存中", "error");
      return;
    }
    saving = true;
    lastLocalSaveStartedAt = Date.now();
    setStatus("正在同步……", "saving");
    try {
      const client = getClient();
      const { data, error } = await withTimeout(
        client.rpc("update_document_payload", {
          p_document_id: currentDocument.id,
          p_payload: payload,
          p_expected_version: currentDocument.version || null
        }),
        DEFAULT_TIMEOUT,
        "同步超时"
      );
      if (error) {
        if (String(error.message || "").includes("Version conflict")) {
          setStatus("发现远程更新，请刷新后重试", "remote");
        } else {
          throw error;
        }
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.version) {
          currentDocument.version = result.version;
          lastRemoteVersion = result.version;
        }
        queuedPayload = null;
        setStatus(`已同步 ${formatTime()}`, "saved");
      }
    } catch (error) {
      console.error("Cloud save failed", error);
      setStatus("同步失败，点击重试", "error");
    } finally {
      saving = false;
    }
  }

  function retrySave() {
    if (queuedPayload) flushSave(queuedPayload);
  }

  function isReadOnly() {
    return currentRole === "viewer";
  }

  function currentWorkspace() {
    return { ...session };
  }

  function shareLinks() {
    const origin = window.location.origin;
    const path = window.location.pathname.replace(/\/[^/]*$/, "/index.html");
    const base = `${origin}${path}`;
    return {
      edit: session.editToken ? `${base}?share=${encodeURIComponent(session.editToken)}` : "",
      view: session.viewToken ? `${base}?share=${encodeURIComponent(session.viewToken)}` : ""
    };
  }

  function showCloudFallback(message) {
    if ($("#cloudFallback")) return;
    const container = document.createElement("div");
    container.id = "cloudFallback";
    container.className = "cloud-fallback";
    container.innerHTML = `
      <strong>云端连接失败</strong>
      <span>${escapeHtml(message)}</span>
      <div>
        <button type="button" data-cloud-reload>重新连接</button>
        <a href="index.html">返回首页</a>
      </div>
    `;
    document.body.appendChild(container);
    container.querySelector("[data-cloud-reload]").addEventListener("click", () => location.reload());
  }

  async function listWorkspaces() {
    const client = getClient();
    if (!client) throw new Error("Supabase 未配置");
    await ensureAnonymousUser();
    const [wsRes, memRes] = await Promise.all([
      client.from("workspaces").select("id,name,updated_at").order("updated_at", { ascending: false }),
      client.from("workspace_members").select("workspace_id,role")
    ]);
    if (wsRes.error) throw wsRes.error;
    const roles = {};
    (memRes.data || []).forEach(m => { roles[m.workspace_id] = m.role; });
    return (wsRes.data || []).map(w => ({
      id: w.id, name: w.name, updatedAt: w.updated_at, role: roles[w.id] || "viewer"
    }));
  }

  function selectWorkspace(ws) {
    writeSession({ workspaceId: ws.id, workspaceName: ws.name, role: ws.role });
    currentRole = ws.role;
  }

  async function fetchTokens(id) {
    const client = getClient();
    if (!client || !id) return { edit: "", view: "" };
    const { data } = await client.from("share_tokens").select("token,role").eq("workspace_id", id);
    const out = { edit: "", view: "" };
    (data || []).forEach(t => { if (t.role === "editor") out.edit = t.token; else out.view = t.token; });
    return out;
  }

  window.CloudWorkspace = {
    isConfigured,
    createWorkspace,
    openShareToken,
    listWorkspaces,
    selectWorkspace,
    fetchTokens,
    boot,
    queueSave,
    retrySave,
    clearSession,
    currentWorkspace,
    toolUrl,
    shareLinks,
    isReadOnly,
    setStatus,
    updateWorkspaceBadge
  };

  document.addEventListener("click", event => {
    const status = event.target.closest("#cloudStatus, #saveStatus");
    if (status && /失败|重试/.test(status.textContent || "")) retrySave();
  });

  document.addEventListener("DOMContentLoaded", updateWorkspaceBadge);
})();
