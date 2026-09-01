(function () {
  const ov = document.createElement("div");
  ov.id = "pdf-overlay";
  ov.hidden = true;
  ov.innerHTML = `
    <div class="pdf-bar">
      <span class="kicker" id="pdf-title">Document</span>
      <button type="button" class="btn" id="pdf-close">Close</button>
    </div>
    <iframe title="Document"></iframe>
  `;
  document.body.appendChild(ov);
  const frame = ov.querySelector("iframe");

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
  }

  document.getElementById("pdf-close").onclick = closePdf;
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closePdf();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ov.hidden) {
      e.preventDefault();
      closePdf();
    }
  });
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
