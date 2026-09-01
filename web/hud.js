/* Living HUD: irregular side hashes, rotating rail patterns, L-brackets. */
(function (global) {
  const PATTERNS = ["doublet", "cluster", "sparse", "stagger", "burst"];

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

  function ticksFor(h, rand, name) {
    const ticks = [];
    let y = 6 + rand() * 18;
    if (name === "doublet") {
      while (y < h - 14) {
        ticks.push({ y, h: 1, w: 5 + rand() * 5 });
        ticks.push({ y: y + 3 + rand() * 2, h: 1, w: 4 + rand() * 6 });
        y += 14 + rand() * 34;
      }
    } else if (name === "cluster") {
      const clusters = 3 + Math.floor(rand() * 3);
      for (let c = 0; c < clusters; c += 1) {
        let yy = 12 + ((h - 36) * c) / clusters + rand() * 22;
        const n = 3 + Math.floor(rand() * 6);
        for (let i = 0; i < n; i += 1) {
          ticks.push({ y: yy, h: 1, w: 3 + rand() * 8 });
          yy += 3 + rand() * 7;
        }
      }
    } else if (name === "sparse") {
      while (y < h - 14) {
        ticks.push({ y, h: 1 + Math.floor(rand() * 2), w: 7 + rand() * 8 });
        y += 26 + rand() * 52;
      }
    } else if (name === "stagger") {
      while (y < h - 14) {
        ticks.push({ y, h: 1, w: 3 + rand() * 9 });
        y += 7 + rand() * 20;
      }
    } else {
      const mid = h * (0.22 + rand() * 0.55);
      for (let i = 0; i < 14; i += 1) {
        ticks.push({ y: mid + (rand() - 0.5) * 90, h: 1, w: 2 + rand() * 11 });
      }
      let yy = 10;
      while (yy < h - 12) {
        if (Math.abs(yy - mid) > 48) ticks.push({ y: yy, h: 1, w: 4 + rand() * 4 });
        yy += 20 + rand() * 44;
      }
    }
    return ticks;
  }

  function paintCol(col, name, seed) {
    if (!col) return;
    const rand = rng(seed);
    const h = col.clientHeight || 1;
    const ticks = ticksFor(h, rand, name);
    const frag = document.createDocumentFragment();
    ticks.forEach((t) => {
      if (t.y < 0 || t.y > h) return;
      const el = document.createElement("i");
      el.style.top = t.y.toFixed(1) + "px";
      el.style.height = t.h + "px";
      el.style.width = t.w.toFixed(1) + "px";
      el.style.opacity = (0.45 + rand() * 0.5).toFixed(2);
      frag.appendChild(el);
    });
    col.innerHTML = "";
    col.appendChild(frag);
  }

  let current = "";
  let timer = null;

  function applyMode() {
    if (reduceMotion()) return;
    const west = document.querySelector(".hash-col.west");
    const east = document.querySelector(".hash-col.east");
    let next = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    if (PATTERNS.length > 1) {
      while (next === current) next = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    }
    current = next;
    const eastPat =
      Math.random() > 0.45 ? next : PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    document.body.setAttribute("data-hud", next);
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    paintCol(west, next, seed);
    paintCol(east, eastPat, seed ^ 0x9e3779b9);
    const root = document.documentElement;
    root.style.setProperty("--pip-dur", (4.6 + Math.random() * 5.5).toFixed(2) + "s");
    root.style.setProperty("--pip-dur-2", (5.2 + Math.random() * 6).toFixed(2) + "s");
    root.style.setProperty("--rail-dur", (2.1 + Math.random() * 2.4).toFixed(2) + "s");
    document.body.classList.toggle("hud-flip-pip", Math.random() > 0.5);
    document.body.classList.toggle("hud-quiet-east", Math.random() > 0.62);
    document.body.classList.toggle("hud-wide-bracket", Math.random() > 0.55);
  }

  function startCycle() {
    stopCycle();
    applyMode();
    const beat = () => {
      applyMode();
      timer = setTimeout(beat, 7000 + Math.random() * 8000);
    };
    timer = setTimeout(beat, 8000 + Math.random() * 6000);
  }

  function stopCycle() {
    clearTimeout(timer);
    timer = null;
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
      if (framed && !timer) requestAnimationFrame(() => startCycle());
      if (!framed) {
        stopCycle();
        document.body.removeAttribute("data-hud");
      }
    };
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", () => {
      if (document.body.classList.contains("is-framed")) applyMode();
    });
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.OKHud = { applyMode };
})(window);
