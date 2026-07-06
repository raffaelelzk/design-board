/*
  Creative Toolbox UI Effects
  Safe interaction layer. It does not mutate layout or business data.
*/
(function () {
  const ready = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  };

  ready(() => {
    const body = document.body;

    const glow = document.createElement("div");
    glow.className = "hi-cursor-light";
    glow.setAttribute("aria-hidden", "true");
    body.appendChild(glow);

    window.addEventListener("pointermove", (event) => {
      glow.style.left = event.clientX + "px";
      glow.style.top = event.clientY + "px";
    }, { passive: true });

    window.addEventListener("pointerleave", () => {
      glow.style.opacity = "0";
    });

    window.addEventListener("pointerenter", () => {
      glow.style.opacity = ".74";
    });

    const toast = document.createElement("div");
    toast.className = "hi-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    body.appendChild(toast);

    const showToast = (message) => {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(window.__hiToastTimer);
      window.__hiToastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
    };

    document.addEventListener("click", (event) => {
      const target = event.target.closest("button, .button, .cloud-button, .icon-button, .view-tab, .project-mini-button, [role='button']");
      if (!target || target.disabled) return;
      target.animate([
        { transform: "scale(1)" },
        { transform: "scale(.985)" },
        { transform: "scale(1)" }
      ], { duration: 150, easing: "ease-out" });
    });

    window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.body.animate([
          { filter: "brightness(1) saturate(1)" },
          { filter: "brightness(1.055) saturate(1.07)" },
          { filter: "brightness(1) saturate(1)" }
        ], { duration: 650, easing: "ease-out" });
        showToast("页面已点亮");
      }
    });
  });
})();
