(() => {
  "use strict";

  const PROJECT_TABLE = "ct_cloud_projects";
  const SHARE_TABLE = "ct_cloud_share_links";
  const REDEEM_RPC = "ct_redeem_share";
  const ASSET_MARKER = "__creativeCloudAsset";
  let client = null;

  const config = () => window.CreativeCloudConfig || {};
  const configured = () => {
    const value = config();
    return Boolean(
      value.enabled &&
      /^https:\/\/.+\.supabase\.co\/?$/.test(String(value.supabaseUrl || "")) &&
      value.publishableKey &&
      !String(value.publishableKey).includes("YOUR_") &&
      window.supabase?.createClient
    );
  };

  function configurationMessage() {
    if (!config().enabled) return "云端分享尚未启用，请先编辑 supabase-config.js。";
    if (!window.supabase?.createClient) return "Supabase 客户端未加载，请检查网络连接。";
    return "Supabase 配置不完整，请检查 Project URL 和 Publishable key。";
  }

  function getClient() {
    if (!configured()) throw new Error(configurationMessage());
    if (!client) {
      client = window.supabase.createClient(
        config().supabaseUrl.replace(/\/$/, ""),
        config().publishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        }
      );
    }
    return client;
  }

  async function ensureAnonymousUser() {
    const supabaseClient = getClient();
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData?.session?.user) return sessionData.session.user;

    const { data, error } = await supabaseClient.auth.signInAnonymously();
    if (error) throw error;
    if (!data?.user) throw new Error("匿名身份创建失败。");
    return data.user;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  function randomToken(byteLength = 24) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function dataUrlInfo(value) {
    if (typeof value !== "string" || !value.startsWith("data:")) return null;
    const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) return null;
    return {
      mimeType: match[1] || "application/octet-stream",
      base64: Boolean(match[2]),
      body: match[3]
    };
  }

  function dataUrlToBlob(value) {
    const info = dataUrlInfo(value);
    if (!info) throw new Error("无法识别嵌入文件。");
    const bytes = info.base64
      ? Uint8Array.from(atob(info.body), character => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(info.body));
    return new Blob([bytes], { type: info.mimeType });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("文件读取失败。"));
      reader.readAsDataURL(blob);
    });
  }

  function extensionForMime(mimeType) {
    const known = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "application/pdf": "pdf",
      "text/plain": "txt",
      "application/json": "json",
      "application/zip": "zip"
    };
    return known[mimeType] || (mimeType.split("/")[1] || "bin").replace(/[^a-z0-9]+/gi, "");
  }

  async function optimizeImageBlob(blob) {
    const maxDimension = Number(config().imageMaxDimension) || 1600;
    const quality = Number(config().imageQuality) || 0.82;
    if (!blob.type.startsWith("image/") || /gif|svg/i.test(blob.type)) return blob;
    if (blob.size < 280 * 1024) return blob;

    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const optimized = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
      return optimized && optimized.size < blob.size ? optimized : blob;
    } catch (error) {
      console.warn("图片压缩失败，保留原文件", error);
      return blob;
    }
  }

  async function uploadEmbeddedAsset(dataUrl, projectId, progress, cache) {
    if (cache.has(dataUrl)) return cache.get(dataUrl);

    let blob = dataUrlToBlob(dataUrl);
    blob = await optimizeImageBlob(blob);

    const maxBytes = (Number(config().maxAssetSizeMB) || 5) * 1024 * 1024;
    if (blob.size > maxBytes) {
      throw new Error(`单个文件超过 ${config().maxAssetSizeMB || 5} MB，请先压缩或移除。`);
    }

    const extension = extensionForMime(blob.type);
    const path = `${projectId}/${uuid()}.${extension}`;
    progress?.(`正在上传文件 ${cache.size + 1}…`);

    const { error } = await getClient()
      .storage
      .from(config().bucket || "creative-cloud-assets")
      .upload(path, blob, {
        contentType: blob.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false
      });

    if (error) throw error;

    const marker = {
      [ASSET_MARKER]: true,
      path,
      mimeType: blob.type || "application/octet-stream",
      size: blob.size
    };
    cache.set(dataUrl, marker);
    return marker;
  }

  async function prepareValue(value, projectId, progress, cache) {
    if (typeof value === "string" && dataUrlInfo(value)) {
      return uploadEmbeddedAsset(value, projectId, progress, cache);
    }
    if (Array.isArray(value)) {
      const output = [];
      for (const item of value) output.push(await prepareValue(item, projectId, progress, cache));
      return output;
    }
    if (value && typeof value === "object") {
      const output = {};
      for (const [key, item] of Object.entries(value)) {
        output[key] = await prepareValue(item, projectId, progress, cache);
      }
      return output;
    }
    return value;
  }

  async function restoreValue(value, progress, cache) {
    if (value && typeof value === "object" && value[ASSET_MARKER] && value.path) {
      if (cache.has(value.path)) return cache.get(value.path);
      progress?.(`正在获取项目文件 ${cache.size + 1}…`);
      const { data, error } = await getClient()
        .storage
        .from(config().bucket || "creative-cloud-assets")
        .download(value.path);
      if (error) throw error;
      const dataUrl = await blobToDataUrl(data);
      cache.set(value.path, dataUrl);
      return dataUrl;
    }
    if (Array.isArray(value)) {
      const output = [];
      for (const item of value) output.push(await restoreValue(item, progress, cache));
      return output;
    }
    if (value && typeof value === "object") {
      const output = {};
      for (const [key, item] of Object.entries(value)) {
        output[key] = await restoreValue(item, progress, cache);
      }
      return output;
    }
    return value;
  }

  function buildCloudLink(token) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = `cloud=${encodeURIComponent(token)}`;
    return url.toString();
  }

  function tokenFromLocation() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return params.get("cloud") || "";
  }

  function clearCloudToken() {
    if (!tokenFromLocation()) return;
    const url = new URL(window.location.href);
    url.hash = "";
    history.replaceState(null, "", url.toString());
  }

  async function createShare({ toolType, name, payload, progress, expiresDays }) {
    if (!configured()) throw new Error(configurationMessage());
    progress?.("正在建立匿名身份…");
    const user = await ensureAnonymousUser();
    const projectId = uuid();
    const supabaseClient = getClient();

    const { error: projectError } = await supabaseClient
      .from(PROJECT_TABLE)
      .insert({
        id: projectId,
        owner_id: user.id,
        tool_type: toolType,
        name: name || "未命名项目",
        payload: { uploading: true }
      });
    if (projectError) throw projectError;

    const uploadedAssets = new Map();
    try {
      progress?.("正在整理分享内容…");
      const preparedPayload = await prepareValue(payload, projectId, progress, uploadedAssets);

      const { error: updateError } = await supabaseClient
        .from(PROJECT_TABLE)
        .update({ payload: preparedPayload, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (updateError) throw updateError;

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const days = Number(expiresDays ?? config().shareExpiresDays);
      const expiresAt = Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 86400000).toISOString()
        : null;

      progress?.("正在生成短链接…");
      const { error: shareError } = await supabaseClient
        .from(SHARE_TABLE)
        .insert({
          project_id: projectId,
          owner_id: user.id,
          token_hash: tokenHash,
          role: "viewer",
          expires_at: expiresAt
        });
      if (shareError) throw shareError;

      return {
        projectId,
        link: buildCloudLink(token),
        assetCount: uploadedAssets.size,
        expiresAt,
        userId: user.id
      };
    } catch (error) {
      console.error("云端分享创建失败", error);
      try {
        if (uploadedAssets.size) {
          await supabaseClient.storage
            .from(config().bucket || "creative-cloud-assets")
            .remove([...uploadedAssets.values()].map(item => item.path));
        }
        await supabaseClient.from(PROJECT_TABLE).delete().eq("id", projectId);
      } catch (cleanupError) {
        console.warn("云端分享清理失败", cleanupError);
      }
      throw error;
    }
  }

  async function consumeFromLocation(expectedToolType, progress) {
    const token = tokenFromLocation();
    if (!token) return null;
    if (!configured()) throw new Error(configurationMessage());

    progress?.("正在建立匿名身份…");
    await ensureAnonymousUser();
    progress?.("正在验证分享链接…");

    const { data: redeemed, error: redeemError } = await getClient()
      .rpc(REDEEM_RPC, { p_token: token });
    if (redeemError) throw redeemError;

    const access = Array.isArray(redeemed) ? redeemed[0] : redeemed;
    if (!access?.project_id) throw new Error("分享链接无效、已过期或已被撤销。");
    if (expectedToolType && access.tool_type !== expectedToolType) {
      throw new Error("该分享链接属于另一个工具。");
    }

    progress?.("正在获取项目内容…");
    const { data: project, error: projectError } = await getClient()
      .from(PROJECT_TABLE)
      .select("id,tool_type,name,payload,updated_at")
      .eq("id", access.project_id)
      .single();
    if (projectError) throw projectError;

    const restoredPayload = await restoreValue(project.payload, progress, new Map());
    clearCloudToken();

    return {
      id: project.id,
      toolType: project.tool_type,
      name: project.name,
      payload: restoredPayload,
      updatedAt: project.updated_at
    };
  }

  function ensureOverlay() {
    let overlay = document.getElementById("creativeCloudOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "creativeCloudOverlay";
    overlay.className = "creative-cloud-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="creative-cloud-dialog" role="status" aria-live="polite">
        <div class="creative-cloud-spinner"></div>
        <strong>正在获取云端分享</strong>
        <p id="creativeCloudOverlayText">请稍候…</p>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay(message = "请稍候…") {
    const overlay = ensureOverlay();
    const text = overlay.querySelector("#creativeCloudOverlayText");
    if (text) text.textContent = message;
    overlay.hidden = false;
  }

  function updateOverlay(message) {
    const overlay = ensureOverlay();
    const text = overlay.querySelector("#creativeCloudOverlayText");
    if (text) text.textContent = message;
  }

  function hideOverlay() {
    const overlay = ensureOverlay();
    overlay.hidden = true;
  }

  window.CreativeCloud = {
    configured,
    configurationMessage,
    ensureAnonymousUser,
    createShare,
    consumeFromLocation,
    tokenFromLocation,
    clearCloudToken,
    showOverlay,
    updateOverlay,
    hideOverlay
  };
})();