const map = L.map("map").setView([35.47, -97.52], 8);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Esri · OSM",
  maxZoom: 16,
}).addTo(map);

const layer = L.layerGroup().addTo(map);
let cameras = [];
let documents = [];
let terms = [];
let requests = [];
let activeMarker = null;

function pinColor(p) {
  if (p.packet && p.packet.has_contract_pdf) return "#141414";
  if (p.packet) return "#c4471a";
  return "#c8c8c2";
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

function renderCameras(q) {
  layer.clearLayers();
  const needle = (q || "").trim().toLowerCase();
  cameras.forEach((f) => {
    const p = f.properties || {};
    const blob = `${p.name || ""} ${p.vendor || ""} ${p.city || ""} ${p.operator || ""}`.toLowerCase();
    if (needle && !blob.includes(needle)) return;
    const [lon, lat] = f.geometry.coordinates;
    const m = L.circleMarker([lat, lon], {
      radius: 4,
      color: pinColor(p),
      weight: 1.25,
      fillColor: pinColor(p),
      fillOpacity: 0.9,
    }).addTo(layer);
    m.on("click", () => openDossier(f, m));
  });
}

function openDossier(f, marker) {
  if (activeMarker) activeMarker.setStyle({ weight: 1.25, radius: 4 });
  activeMarker = marker;
  marker.setStyle({ weight: 2.5, radius: 7 });
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
    .map((d) => `<li><a href="${localPdf(d.url)}" data-pdf>${d.name}</a></li>`)
    .join("");
  const ret = pkt && pkt.retention ? String(pkt.retention).split(";")[0] : "unknown";
  const hole = !pkt || !pkt.has_contract_pdf;
  const requestBlock = req
    ? `<div class="req">
        <p>Reply to <code>${req.inbox}</code>. We do not auto-file the portal.</p>
        ${req.mailto ? `<a class="btn" href="${req.mailto}">Email request</a>` : ""}
        ${req.portal ? `<a class="btn" href="${req.portal}" target="_blank" rel="noopener">Portal</a>` : ""}
       </div>`
    : "";
  const share = cityTerms && cityTerms.sharing_and_license
    ? (cityTerms.sharing_and_license.customer_data_title
      || (Array.isArray(cityTerms.sharing_and_license.flockos_essentials)
        ? cityTerms.sharing_and_license.flockos_essentials.slice(0, 3).join(" · ")
        : ""))
    : "";
  const el = document.getElementById("dossier");
  el.hidden = false;
  document.getElementById("dossier-empty").hidden = true;
  el.innerHTML = `
    <p class="kicker">${p.city || "Untagged"}</p>
    <h2>${p.vendor || "ALPR"}</h2>
    <p class="muted">${p.operator || p.name || "Unknown operator"}</p>
    <dl>
      <dt>Facing</dt><dd>${p.direction || "—"}</dd>
      <dt>Mount</dt><dd>${p.mount || "—"}</dd>
      <dt>Cost</dt><dd>${pkt && pkt.amount_usd != null ? money(pkt.amount_usd) : "<span class='hole'>missing</span>"}</dd>
      <dt>Retention</dt><dd>${pkt && pkt.has_contract_pdf ? ret : "<span class='hole'>missing</span>"}</dd>
      <dt>Term</dt><dd>${(pkt && pkt.renewal_end) || "—"}</dd>
      <dt>Status</dt><dd>${(pkt && pkt.status) || (hole ? "no packet" : "—")}</dd>
    </dl>
    <p class="sv">
      <a href="${sv}" target="_blank" rel="noopener">Street view</a>
      <a href="${ms}" target="_blank" rel="noopener">Mapillary</a>
      ${p.source ? `<a href="${p.source}" target="_blank" rel="noopener">OSM</a>` : ""}
    </p>
    <iframe class="svframe" title="Street View" src="${sv}"></iframe>
    ${pdfs ? `<p class="kicker">Packet</p><ul class="docs">${pdfs}</ul>
      <p class="muted">Open a document. Close or Esc to return.</p>` : "<p class='hole'>No contract PDF.</p>"}
    ${share ? `<p class="clause">${String(share).slice(0, 420)}</p>` : ""}
    ${requestBlock}
  `;
}

async function boot() {
  const [geo, docs, t, reqs, status] = await Promise.all([
    fetch("data/cameras.geojson").then((r) => r.json()),
    fetch("data/documents.json").then((r) => r.json()),
    fetch("data/terms.json").then((r) => r.json()),
    fetch("data/requests.json").then((r) => r.json()).catch(() => []),
    fetch("data/status.json").then((r) => r.json()),
  ]);
  cameras = geo.features || [];
  documents = docs;
  terms = t;
  requests = reqs;
  const n = (x) => Number(x || 0).toLocaleString();
  document.getElementById("stats").textContent =
    `${n(status.cameras)} assets · ${n(status.missing_packets)} holes`;
  const params = new URLSearchParams(location.search);
  const city = params.get("city") || "";
  if (city) {
    document.getElementById("q").value = city;
    const hit = cameras.find((f) => (f.properties || {}).city === city);
    if (hit) {
      const [lon, lat] = hit.geometry.coordinates;
      map.setView([lat, lon], 12);
    }
  }
  renderCameras(city);
  document.getElementById("q").addEventListener("input", (e) => renderCameras(e.target.value));
  setTimeout(() => map.invalidateSize(), 50);
}

boot().catch((err) => {
  document.getElementById("stats").textContent = String(err);
});
