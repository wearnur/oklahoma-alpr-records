/* Inquire → index iris. Same overlay on both pages. */
(function (global) {
  const KEY = "ok-arrive";

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function gate() {
    let el = document.getElementById("gate");
    if (el) return el;
    el = document.createElement("div");
    el.id = "gate";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<i class="gate-fill"></i><i class="gate-ring a"></i><i class="gate-ring b"></i>';
    document.body.appendChild(el);
    return el;
  }

  function depart(url) {
    if (!url) return;
    if (reduceMotion()) {
      location.href = url;
      return;
    }
    try {
      sessionStorage.setItem(KEY, "iris");
    } catch (e) { /* private mode */ }
    const g = gate();
    g.hidden = false;
    document.body.classList.add("is-departing");
    requestAnimationFrame(() => {
      g.classList.add("on");
    });
    setTimeout(() => {
      location.href = url;
    }, 580);
  }

  function arrive(done) {
    let pending = false;
    try {
      pending = sessionStorage.getItem(KEY) === "iris";
      sessionStorage.removeItem(KEY);
    } catch (e) { /* */ }
    if (!pending || reduceMotion()) {
      if (done) done();
      return;
    }
    const g = gate();
    g.hidden = false;
    g.classList.add("on");
    document.body.classList.add("is-arriving");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add("is-open");
        g.classList.remove("on");
      });
    });
    setTimeout(() => {
      if (done) done();
    }, 280);
    setTimeout(() => {
      g.hidden = true;
      document.body.classList.remove("is-arriving", "is-open", "is-departing");
    }, 700);
  }

  global.OKTransit = { depart, arrive };
})(window);
