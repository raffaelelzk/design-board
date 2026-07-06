/*
  Creative Toolbox Hi-Style Subpage Interactions
  Non-destructive enhancement layer. It does not remove or rewrite existing page logic.
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

    // Cursor glow
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
      glow.style.opacity = ".82";
    });

    // Toast
    const toast = document.createElement("div");
    toast.className = "hi-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    body.appendChild(toast);

    const showToast = (message) => {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(window.__hiToastTimer);
      window.__hiToastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
    };

    // Back-home floating link for subpages
    const isHome = /\/design-board\/?$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
    if (!isHome && !document.querySelector(".hi-home-link")) {
      const home = document.createElement("a");
      home.className = "hi-home-link";
      home.href = "./";
      home.innerHTML = "← 工具箱首页";
      body.appendChild(home);
    }

    // Soft reveal on common structural blocks
    const revealCandidates = [
      "section",
      ".card",
      ".panel",
      ".box",
      ".module",
      ".task-card",
      ".product-card",
      ".timeline-item",
      ".checklist-item",
      ".form-section",
      ".output",
      ".result"
    ].join(",");

    const items = Array.from(document.querySelectorAll(revealCandidates))
      .filter((el) => !el.closest(".hi-toast") && !el.closest(".hi-home-link"));

    items.forEach((el) => el.classList.add("hi-reveal"));

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("hi-visible");
        });
      }, { threshold: 0.12 });

      items.forEach((el) => observer.observe(el));
    } else {
      items.forEach((el) => el.classList.add("hi-visible"));
    }

    // Give existing buttons a subtle click feedback without changing click handlers
    document.addEventListener("click", (event) => {
      const clickable = event.target.closest("button, .btn, .button, [role='button'], input[type='submit'], input[type='button']");
      if (!clickable) return;
      clickable.animate([
        { transform: "scale(1)" },
        { transform: "scale(.98)" },
        { transform: "scale(1)" }
      ], { duration: 170, easing: "ease-out" });
    });

    // Page highlight action: Ctrl/Cmd + K, matching the homepage interaction language
    window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.body.animate([
          { filter: "brightness(1) saturate(1)" },
          { filter: "brightness(1.06) saturate(1.08)" },
          { filter: "brightness(1) saturate(1)" }
        ], { duration: 780, easing: "ease-out" });
        showToast("页面已点亮");
      }
    });
  });
})();
