/* Samaritan-style mosaic + living HUD. Inquire only. */
(function (global) {
  const SEED = 53091;

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function buildMosaic(root) {
    const rand = rng(SEED);
    const frag = document.createDocumentFragment();
    const n = 92;
    for (let i = 0; i < n; i += 1) {
      const ring = Math.pow((i + 1) / n, 0.7);
      const ang = rand() * Math.PI * 2;
      const cx = 50 + Math.cos(ang) * ring * 50;
      const cy = 50 + Math.sin(ang) * ring * 48;
      const w = 3.2 + rand() * (ring < 0.32 ? 16 : 9);
      const h = 2.4 + rand() * (ring < 0.32 ? 11 : 7);
      const el = document.createElement("i");
      el.style.left = (cx - w / 2).toFixed(2) + "%";
      el.style.top = (cy - h / 2).toFixed(2) + "%";
      el.style.width = w.toFixed(2) + "%";
      el.style.height = h.toFixed(2) + "%";
      el.style.setProperty("--d", (0.04 + ring * 0.52).toFixed(3) + "s");
      el.style.setProperty("--d2", (ring * 0.26).toFixed(3) + "s");
      const shade = rand();
      el.style.background =
        shade > 0.97 ? "#c12f14" : shade > 0.62 ? "#b4b4ac" : shade > 0.32 ? "#cbcbc3" : "#9c9c94";
      el.style.setProperty("--o", shade > 0.97 ? "0.5" : (0.5 + rand() * 0.4).toFixed(2));
      frag.appendChild(el);
    }
    root.innerHTML = "";
    root.appendChild(frag);
  }

  function boot() {
    const mosaic = document.getElementById("mosaic");
    if (!mosaic) return;
    buildMosaic(mosaic);
    if (reduceMotion()) return;
    let revealTimer = null;
    const sync = () => {
      const loading = document.body.classList.contains("is-loading");
      const revealing = document.body.classList.contains("is-revealing");
      mosaic.hidden = !loading && !revealing;
      if (!loading && !revealing) {
        clearTimeout(revealTimer);
      }
    };
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.OKHud = { buildMosaic };
})(window);
