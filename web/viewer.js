(function () {
  const ov = document.createElement("div");
  ov.id = "pdf-overlay";
  ov.hidden = true;
  ov.innerHTML = `
    <div class="pdf-bar">
      <span class="kicker" id="pdf-title">Document</span>
      <button type="button" id="pdf-close">Close</button>
    </div>
    <iframe title="Document"></iframe>
  `;
  document.body.appendChild(ov);
  const frame = ov.querySelector("iframe");
  const closeBtn = document.getElementById("pdf-close");

  function closePdf() {
    ov.hidden = true;
    frame.src = "about:blank";
    document.body.classList.remove("pdf-open");
  }

  function openPdf(url, title) {
    ov.hidden = false;
    document.body.classList.add("pdf-open");
    document.getElementById("pdf-title").textContent = title || "Document";
    frame.src = url;
    // Chrome's PDF plugin swallows keys once clicked. Keep Close focused
    // until then so Esc works; Close always works with the mouse.
    requestAnimationFrame(() => closeBtn.focus());
  }

  function onEsc(e) {
    if (ov.hidden) return;
    if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      closePdf();
    }
  }

  closeBtn.onclick = closePdf;
  ov.addEventListener("click", (e) => {
    if (e.target === ov || e.target === ov.querySelector(".pdf-bar")) closePdf();
  });
  window.addEventListener("keydown", onEsc, true);
  document.addEventListener("keydown", onEsc, true);
  closeBtn.addEventListener("keydown", onEsc);

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (a.hasAttribute("data-pdf") || /\.pdf($|\?)/i.test(href)) {
      if (a.target === "_blank") return;
      e.preventDefault();
      openPdf(a.href, a.textContent.trim());
    }
  });
  window.closePdf = closePdf;
  window.openPdf = openPdf;
})();
