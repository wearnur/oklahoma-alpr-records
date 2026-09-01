/* Living HUD: persistent ticks that ease up/down instead of layout cuts. */
(function (global) {
  const HASH_N = 12;
  const BAR_N = 5;

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildMosaic(root) {
    const rand = rng((Date.now() ^ 53091) >>> 0);
    const frag = document.createDocumentFragment();
    const n = 18;
    for (let i = 0; i < n; i += 1) {
      const ring = Math.pow((i + 1) / n, 0.7);
      const ang = rand() * Math.PI * 2;
      const cx = 50 + Math.cos(ang) * ring * 42;
      const cy = 50 + Math.sin(ang) * ring * 40;
      const w = 4 + rand() * 10;
      const h = 3 + rand() * 7;
      const el = document.createElement("i");
      el.style.left = (cx - w / 2).toFixed(2) + "%";
      el.style.top = (cy - h / 2).toFixed(2) + "%";
      el.style.width = w.toFixed(2) + "%";
      el.style.height = h.toFixed(2) + "%";
      el.style.setProperty("--d", (ring * 0.28).toFixed(3) + "s");
      el.style.setProperty("--d2", (ring * 0.16).toFixed(3) + "s");
      const shade = rand();
      el.style.background = shade > 0.9 ? "#c12f14" : shade > 0.5 ? "#b4b4ac" : "#cbcbc3";
      el.style.setProperty("--o", (0.35 + rand() * 0.3).toFixed(2));
      frag.appendChild(el);
    }
    root.innerHTML = "";
    root.appendChild(frag);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function spawnCol(col) {
    if (!col || col.children.length) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < HASH_N + BAR_N; i += 1) {
      const el = document.createElement("i");
      el.dataset.kind = i < HASH_N ? "hash" : "bar";
      frag.appendChild(el);
    }
    col.appendChild(frag);
  }

  function place(el, y, w, h, o, dur) {
    el.style.transition =
      "top " + dur + "s cubic-bezier(.37,.01,.16,1), " +
      "width " + (dur * 0.85).toFixed(2) + "s ease, " +
      "height " + dur + "s cubic-bezier(.37,.01,.16,1), " +
      "opacity " + (dur * 0.6).toFixed(2) + "s ease";
    el.style.top = y.toFixed(1) + "px";
    el.style.width = w.toFixed(1) + "px";
    el.style.height = h.toFixed(1) + "px";
    el.style.opacity = o.toFixed(2);
  }

  function nudge(el, col) {
    if (!live || !col.isConnected) return;
    const max = Math.max(40, col.clientHeight - 10);
    const dur = 0.9 + Math.random() * 1.8;
    const cur = parseFloat(el.style.top) || max * 0.5;
    if (el.dataset.kind === "bar") {
      const y = clamp(cur + (Math.random() - 0.5) * 52, 4, max - 24);
      place(el, y, 2 + Math.random() * 3.5, 10 + Math.random() * 46, 0.28 + Math.random() * 0.5, dur);
    } else {
      const y = clamp(cur + (Math.random() - 0.5) * 86, 4, max - 4);
      place(el, y, 3 + Math.random() * 13, 1 + Math.random() * 2.2, 0.34 + Math.random() * 0.55, dur);
    }
    el._t = setTimeout(() => nudge(el, col), dur * 1000 + 180 + Math.random() * 1600);
  }

  function seedCol(col) {
    const max = Math.max(40, col.clientHeight - 10);
    const kids = [...col.children];
    kids.forEach((el, i) => {
      clearTimeout(el._t);
      const y = 6 + ((i + 0.15) / kids.length) * (max - 12);
      el.style.transition = "none";
      if (el.dataset.kind === "bar") {
        el.style.top = y + "px";
        el.style.width = "3px";
        el.style.height = "16px";
        el.style.opacity = "0.4";
      } else {
        el.style.top = y + "px";
        el.style.width = "6px";
        el.style.height = "1px";
        el.style.opacity = "0.5";
      }
      const wait = 80 + Math.random() * 900;
      el._t = setTimeout(() => nudge(el, col), wait);
    });
  }

  let live = false;

  function startLive() {
    if (live || reduceMotion()) return;
    live = true;
    const west = document.querySelector(".hash-col.west");
    const east = document.querySelector(".hash-col.east");
    spawnCol(west);
    spawnCol(east);
    requestAnimationFrame(() => {
      seedCol(west);
      seedCol(east);
    });
  }

  function stopLive() {
    live = false;
    document.querySelectorAll(".hash-col i").forEach((el) => clearTimeout(el._t));
  }

  function boot() {
    const mosaic = document.getElementById("mosaic");
    if (mosaic) buildMosaic(mosaic);
    if (reduceMotion()) return;
    const sync = () => {
      const framed = document.body.classList.contains("is-framed");
      const loading = document.body.classList.contains("is-loading");
      const revealing = document.body.classList.contains("is-revealing");
      if (mosaic) mosaic.hidden = !loading && !revealing;
      if (framed) startLive();
      else stopLive();
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

  global.OKHud = { startLive, stopLive };
})(window);
