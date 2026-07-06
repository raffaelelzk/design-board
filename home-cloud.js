(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function toast(message) {
    const existing = $("#homeToast");
    if (existing) existing.remove();
    const div = document.createElement("div");
    div.id = "homeToast";
    div.className = "home-toast";
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2400);
  }

  function updateToolLinks() {
    $$("[data-tool-path]").forEach(link => {
      const path = link.dataset.toolPath;
      if (window.CloudWorkspace?.currentWorkspace?.().workspaceId) {
        link.href = window.CloudWorkspace.toolUrl(path);
      } else {
        link.href = path;
      }
    });
  }

  function updateShareLinks() {
    const links = window.CloudWorkspace?.shareLinks?.() || {};
    const box = $("#shareLinksBox");
    if (links.edit || links.view) {
      $("#editShareLink").value = links.edit || "";
      $("#viewShareLink").value = links.view || "";
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  async function createWorkspace() {
    try {
      if (!window.CloudWorkspace?.isConfigured?.()) {
        window.CloudWorkspace?.setStatus?.("云端未配置，请先填写 cloud-config.js", "error");
        toast("请先配置 Supabase URL 和 anon key。");
        return;
      }
      const name = $("#workspaceNameInput").value.trim() || "Creative Workspace";
      await window.CloudWorkspace.createWorkspace(name);
      updateToolLinks();
      updateShareLinks();
      toast("工作区已创建");
    } catch (error) {
      console.error(error);
      window.CloudWorkspace?.setStatus?.("创建失败，点击重试", "error");
      toast(error.message || "创建失败");
    }
  }

  async function openShare() {
    try {
      if (!window.CloudWorkspace?.isConfigured?.()) {
        window.CloudWorkspace?.setStatus?.("云端未配置，请先填写 cloud-config.js", "error");
        toast("请先配置 Supabase。");
        return;
      }
      const token = $("#shareTokenInput").value.trim();
      await window.CloudWorkspace.openShareToken(token);
      updateToolLinks();
      updateShareLinks();
      toast("工作区已打开");
    } catch (error) {
      console.error(error);
      window.CloudWorkspace?.setStatus?.("分享码无效或连接失败", "error");
      toast(error.message || "无法打开分享码");
    }
  }

  async function refreshShareLinksFor(workspaceId, role) {
    // owner/editor 才展示分享码；优先用 session 缓存，否则回云端取回
    const box = $("#shareLinksBox");
    if (role === "viewer") { box.hidden = true; return; }
    let links = window.CloudWorkspace?.shareLinks?.() || {};
    if ((!links.edit && !links.view) && workspaceId && window.CloudWorkspace?.fetchTokens) {
      try {
        const t = await window.CloudWorkspace.fetchTokens(workspaceId);
        const origin = location.origin;
        const path = location.pathname.replace(/\/[^/]*$/, "/index.html");
        const base = `${origin}${path}`;
        links = {
          edit: t.edit ? `${base}?share=${encodeURIComponent(t.edit)}` : "",
          view: t.view ? `${base}?share=${encodeURIComponent(t.view)}` : ""
        };
      } catch (e) { /* ignore */ }
    }
    if (links.edit || links.view) {
      $("#editShareLink").value = links.edit || "";
      $("#viewShareLink").value = links.view || "";
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  async function listMyWorkspaces() {
    const box = $("#workspaceListBox");
    if (!box) return;
    if (!window.CloudWorkspace?.isConfigured?.()) {
      toast("请先配置 Supabase。");
      return;
    }
    box.hidden = false;
    box.innerHTML = '<p class="workspace-list-empty">加载中…</p>';
    try {
      const list = await window.CloudWorkspace.listWorkspaces();
      if (!list.length) {
        box.innerHTML = '<p class="workspace-list-empty">还没有工作区，先新建一个。</p>';
        return;
      }
      box.innerHTML = list.map(w =>
        `<button type="button" class="workspace-list-item" data-ws="${w.id}" data-name="${escapeHtml(w.name || "")}" data-role="${w.role}">
          <span>${escapeHtml(w.name || "未命名工作区")}</span>
          <small>${w.role === "owner" ? "所有者" : w.role === "editor" ? "可编辑" : "只读"}</small>
        </button>`
      ).join("");
      box.querySelectorAll(".workspace-list-item").forEach(item => {
        item.addEventListener("click", async () => {
          window.CloudWorkspace.selectWorkspace({
            id: item.dataset.ws, name: item.dataset.name, role: item.dataset.role
          });
          window.CloudWorkspace?.updateWorkspaceBadge?.();
          updateToolLinks();
          await refreshShareLinksFor(item.dataset.ws, item.dataset.role);
          toast("已切换到该工作区");
        });
      });
    } catch (error) {
      console.error(error);
      box.innerHTML = `<p class="workspace-list-empty">加载失败：${escapeHtml(error.message || String(error))}</p>`;
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  }

  function bind() {
    $("#createWorkspaceButton")?.addEventListener("click", createWorkspace);
    $("#openShareButton")?.addEventListener("click", openShare);
    $("#listWorkspacesButton")?.addEventListener("click", listMyWorkspaces);
    $("#shareTokenInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") openShare();
    });
    $("#workspaceNameInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") createWorkspace();
    });

    $$("[data-copy-target]").forEach(button => {
      button.addEventListener("click", async () => {
        const target = $(`#${button.dataset.copyTarget}`);
        if (!target?.value) return;
        await navigator.clipboard.writeText(target.value);
        toast("已复制链接");
      });
    });

    const params = new URLSearchParams(location.search);
    const share = params.get("share") || params.get("token");
    if (share) {
      $("#shareTokenInput").value = share;
      openShare().then(() => {
        history.replaceState(null, "", "index.html");
      });
    }

    updateToolLinks();
    updateShareLinks();
    window.CloudWorkspace?.updateWorkspaceBadge?.();
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
