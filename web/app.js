const map = L.map("map").setView([35.47, -97.52], 8);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
  maxZoom: 18,
}).addTo(map);

const layer = L.layerGroup().addTo(map);
let cameras = [];
let documents = [];
let terms = [];
let missing = [];
let requests = [];
let activeMarker = null;

function pinColor(p) {
  if (p.packet && p.packet.has_contract_pdf) return "#3dba7a";
  if (p.packet) return "#e0a84a";
  return "#7a7a74";
}

function money(n) {
  if (n == null || n === "") return "";
  return "$" + Number(n).toLocaleString();
}

function localPdf(url) {
  if (!url) return "";
  const name = url.split("/").pop();
  if (name && name.toLowerCase().endsWith(".pdf")) return "/docs/" + name;
  return url;
}

function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === name);
  });
  ["missing", "dossier", "calendar"].forEach((t) => {
    document.getElementById("tab-" + t).hidden = t !== name;
  });
}

function renderCameras(q) {
  layer.clearLayers();
  const needle = (q || "").trim().toLowerCase();
  cameras.forEach((f) => {
    const p = f.properties || {};
    const blob = `${p.name || ""} ${p.vendor || ""} ${p.city || ""} ${p.operator || ""}`.toLowerCase();
    if (needle && !blob.includes(needle)) return;
    const [lon, lat] = f.geometry.coordinates;
    const m = L.circleMarker([lat, lon], {
      radius: 5,
      color: pinColor(p),
      weight: 1,
      fillOpacity: 0.85,
    }).addTo(layer);
    m.on("click", () => openDossier(f, m));
  });
}

function openDossier(f, marker) {
  if (activeMarker) activeMarker.setStyle({ weight: 1, radius: 5 });
  activeMarker = marker;
  marker.setStyle({ weight: 3, radius: 8 });
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const pkt = p.packet;
  const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
  const ms = `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17`;
  const cityDocs = documents.filter(
    (d) => p.city && String(d.city || "").toLowerCase() === String(p.city).toLowerCase()
  );
  const cityTerms = terms.find(
    (t) => p.city && String(t.city || "").toLowerCase() === String(p.city).toLowerCase()
  );
  const req = requests.find(
    (r) => p.city && String(r.city || "").toLowerCase() === String(p.city).toLowerCase()
  );
  const pdfs = cityDocs
    .map((d) => {
      const href = localPdf(d.url);
      return `<li><a href="${href}" target="pdfpane">${d.name}</a></li>`;
    })
    .join("");
  const firstPdf = cityDocs[0] ? localPdf(cityDocs[0].url) : "";
  const ret = pkt && pkt.retention ? String(pkt.retention).split(";")[0] : "unknown";
  const hole = !pkt || !pkt.has_contract_pdf;
  const requestBlock = req
    ? `<div class="req">
        <p>Send results to <code>${req.inbox}</code>. Backend IMAP poller ingests PDFs; nothing is auto-filed with the city.</p>
        ${req.portal ? `<a class="btn" href="${req.portal}" target="_blank" rel="noopener">Open ${p.city} portal</a>` : ""}
        <button type="button" class="btn" id="copy-req">Copy request</button>
       </div>`
    : "";
  const el = document.getElementById("dossier");
  el.hidden = false;
  document.getElementById("dossier-empty").hidden = true;
  el.innerHTML = `
    <h2>${p.vendor || "ALPR"}</h2>
    <p>${p.operator || p.name || "Unknown operator"}</p>
    <dl>
      <dt>City</dt><dd>${p.city || "<span class='muted'>untagged</span>"}</dd>
      <dt>Facing</dt><dd>${p.direction || "—"}</dd>
      <dt>Mount</dt><dd>${p.mount || "—"}</dd>
      <dt>Dollars</dt><dd>${pkt && pkt.amount_usd != null ? money(pkt.amount_usd) : "<span class='hole'>missing</span>"}</dd>
      <dt>Retention</dt><dd>${pkt && pkt.has_contract_pdf ? ret : "<span class='hole'>missing</span>"}</dd>
      <dt>Renewal end</dt><dd>${(pkt && pkt.renewal_end) || "—"}</dd>
      <dt>Status</dt><dd>${(pkt && pkt.status) || (hole ? "no packet" : "—")}</dd>
    </dl>
    <p class="sv">
      <a href="${sv}" target="_blank" rel="noopener">Street View</a> ·
      <a href="${ms}" target="_blank" rel="noopener">Mapillary</a>
      ${p.source ? ` · <a href="${p.source}" target="_blank" rel="noopener">OSM</a>` : ""}
    </p>
    <iframe class="svframe" title="Street View" src="${sv}"></iframe>
    ${pdfs ? `<h3>Packet</h3><ul class="docs">${pdfs}</ul>
      <iframe class="pdf" name="pdfpane" src="${firstPdf}" title="contract PDF"></iframe>` : "<p class='hole'>No contract PDF on file.</p>"}
    ${cityTerms && cityTerms.sharing_and_license ? `<p class="clause">${(cityTerms.sharing_and_license.customer_data_title || cityTerms.sharing_and_license.flockos_essentials || "").toString().slice(0, 420)}</p>` : ""}
    ${requestBlock}
  `;
  const copy = document.getElementById("copy-req");
  if (copy && req) {
    copy.onclick = () => navigator.clipboard.writeText(req.subject + "\n\n" + req.body);
  }
  showTab("dossier");
}

function renderMissing() {
  const box = document.getElementById("tab-missing");
  if (!missing.length) {
    box.innerHTML = "<p>No city-level packet holes in the joined set.</p>";
    return;
  }
  box.innerHTML =
    "<ol class='leader'>" +
    missing
      .map((m) => {
        const req = requests.find((r) => r.city === m.city);
        const portal = req && req.portal
          ? ` <a href="${req.portal}" target="_blank" rel="noopener">portal</a>`
          : "";
        return `<li><button type="button" class="city" data-city="${m.city}">${m.city}</button>
          ${m.cameras} pins · ${m.amount_usd != null ? money(m.amount_usd) : "no $"}
          ${portal}</li>`;
      })
      .join("") +
    "</ol>";
  box.querySelectorAll("button.city").forEach((b) => {
    b.onclick = () => {
      const city = b.dataset.city;
      const hit = cameras.find((f) => (f.properties || {}).city === city);
      if (!hit) return;
      const [lon, lat] = hit.geometry.coordinates;
      map.setView([lat, lon], 12);
      document.getElementById("q").value = city;
      renderCameras(city);
    };
  });
}

function renderCalendar() {
  const box = document.getElementById("tab-calendar");
  const rows = terms.map((t) => {
    const end = (t.term && t.term.renewal_2 && t.term.renewal_2.end) || "";
    const amt = t.money && (t.money.annual_usd || t.money.contract_total_usd);
    return `<li><b>${t.city}</b> · ${end || "no end date"} · ${amt ? money(amt) : ""}</li>`;
  });
  box.innerHTML = rows.length ? "<ul>" + rows.join("") + "</ul>" : "<p class='muted'>No term dates yet.</p>";
}

async function boot() {
  const [geo, docs, t, miss, reqs, status] = await Promise.all([
    fetch("data/cameras.geojson").then((r) => r.json()),
    fetch("data/documents.json").then((r) => r.json()),
    fetch("data/terms.json").then((r) => r.json()),
    fetch("data/missing.json").then((r) => r.json()),
    fetch("data/requests.json").then((r) => r.json()).catch(() => []),
    fetch("data/status.json").then((r) => r.json()),
  ]);
  cameras = geo.features || [];
  documents = docs;
  terms = t;
  missing = miss;
  requests = reqs;
  document.getElementById("stats").textContent =
    `${status.cameras} cameras · ${status.cameras_with_city || 0} with city · ${status.missing_packets || 0} packet holes`;
  renderCameras("");
  renderMissing();
  renderCalendar();
  document.getElementById("q").addEventListener("input", (e) => renderCameras(e.target.value));
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.onclick = () => showTab(b.dataset.tab);
  });
}

boot().catch((err) => {
  document.getElementById("stats").textContent = String(err);
});
