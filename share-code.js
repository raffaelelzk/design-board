(() => {
  "use strict";

  const GZIP_PREFIX = "CTB1G.";
  const PLAIN_PREFIX = "CTB1.";

  function bytesToBase64Url(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function compress(bytes) {
    if (!("CompressionStream" in window)) return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function decompress(bytes) {
    if (!("DecompressionStream" in window)) {
      throw new Error("当前浏览器无法解压该分享码，请使用新版 Chrome、Edge、Safari 或 Firefox。");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encode(payload) {
    const text = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(text);
    const compressed = await compress(bytes);
    if (compressed && compressed.length < bytes.length) {
      return GZIP_PREFIX + bytesToBase64Url(compressed);
    }
    return PLAIN_PREFIX + bytesToBase64Url(bytes);
  }

  async function decode(rawCode) {
    const code = String(rawCode || "").trim().replace(/\s+/g, "");
    if (!code) throw new Error("请先粘贴分享码。");

    let bytes;
    if (code.startsWith(GZIP_PREFIX)) {
      bytes = await decompress(base64UrlToBytes(code.slice(GZIP_PREFIX.length)));
    } else if (code.startsWith(PLAIN_PREFIX)) {
      bytes = base64UrlToBytes(code.slice(PLAIN_PREFIX.length));
    } else {
      throw new Error("无法识别该分享码，请确认复制完整。");
    }

    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("分享码内容损坏或不完整。");
    }
  }

  async function copy(text) {
    const value = String(text || "");
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("浏览器未允许自动复制，请手动选择分享码复制。");
    return true;
  }

  function sizeLabel(code) {
    const length = String(code || "").length;
    if (length < 1000) return `${length} 字符`;
    return `${(length / 1000).toFixed(length > 10000 ? 0 : 1)}k 字符`;
  }

  function makeLink(code) {
    const url = new URL(window.location.href);
    url.hash = `share=${encodeURIComponent(String(code || ""))}`;
    return url.toString();
  }

  function codeFromLocation() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return "";
    const params = new URLSearchParams(hash);
    return params.get("share") || "";
  }

  function clearLocationCode() {
    if (!window.location.hash) return;
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
  }

  function download(code, filename = "creative-toolbox-share.ctbshare") {
    const blob = new Blob([String(code || "")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readFile(file) {
    if (!file) throw new Error("请选择分享文件。");
    const code = (await file.text()).trim();
    if (!code.startsWith(GZIP_PREFIX) && !code.startsWith(PLAIN_PREFIX)) {
      throw new Error("无法识别该分享文件。");
    }
    return code;
  }

  function renderQr(canvas, fallback, code, options = {}) {
    const link = makeLink(code);
    try {
      if (!window.CreativeQR) throw new Error("二维码组件未加载");
      window.CreativeQR.render(canvas, link, options);
      canvas.hidden = false;
      if (fallback) fallback.hidden = true;
      return { available: true, link };
    } catch (error) {
      canvas.hidden = true;
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "当前内容较多，单个二维码无法容纳。请下载分享文件发送给对方。";
      }
      return { available: false, link, error };
    }
  }

  window.CreativeShare = {
    encode,
    decode,
    copy,
    sizeLabel,
    makeLink,
    codeFromLocation,
    clearLocationCode,
    download,
    readFile,
    renderQr
  };
})();