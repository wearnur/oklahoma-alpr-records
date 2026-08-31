const map = L.map("map").setView([35.47, -97.52], 8);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
  maxZoom: 18,
}).addTo(map);

const layer = L.layerGroup().addTo(map);
let cameras = [];
let agencies = [];

function vendorClass(v) {
  return v && String(v).toLowerCase().includes("flock") ? "flock" : "";
}

function renderCameras(q) {
  layer.clearLayers();
  const needle = (q || "").trim().toLowerCase();
  cameras.forEach((f) => {
    const p = f.properties || {};
    const blob = `${p.name || ""} ${p.vendor || ""} ${p.city || ""} ${p.operator || ""}`.toLowerCase();
    if (needle && !blob.includes(needle)) return;
    const [lon, lat] = f.geometry.coordinates;
    const color = vendorClass(p.vendor) ? "#e0a84a" : "#6aa7d8";
    L.circleMarker([lat, lon], { radius: 4, color, weight: 1, fillOpacity: 0.8 }).addTo(layer)
      .bindPopup(`<b>${p.vendor || "ALPR"}</b><br>${p.operator || p.name || ""}<br>${p.city || ""}`);
  });
}

async function boot() {
  const [geo, ag, docs, terms, status] = await Promise.all([
    fetch("data/cameras.geojson").then((r) => r.json()),
    fetch("data/agencies.json").then((r) => r.json()),
    fetch("data/documents.json").then((r) => r.json()),
    fetch("data/terms.json").then((r) => r.json()),
    fetch("data/status.json").then((r) => r.json()),
  ]);
  cameras = geo.features || [];
  agencies = ag;
  document.getElementById("stats").textContent =
    `${status.cameras} cameras · ${status.agencies} agency records · ${status.documents} documents · ${status.terms} term files`;
  renderCameras("");
  const agUl = document.getElementById("agencies");
  agencies
    .slice()
    .sort((a, b) => String(a.name).localeCompare(b.name))
    .forEach((a) => {
      const li = document.createElement("li");
      const amt = a.extra && a.extra.contract_amount_usd;
      li.innerHTML = `<span class="${vendorClass(a.vendor)}">${a.name}</span>${amt ? ` · $${Number(amt).toLocaleString()}` : ""}`;
      agUl.appendChild(li);
    });
  const dUl = document.getElementById("docs");
  docs.forEach((d) => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="${d.url}">${d.name}</a>`;
    dUl.appendChild(li);
  });
  const tBox = document.getElementById("terms");
  terms.forEach((t) => {
    const div = document.createElement("div");
    div.className = "term";
    const ret = (t.retention && (t.retention.msa_default || t.retention.order_form)) || "";
    const money = t.money && (t.money.annual_usd || t.money.contract_total_usd);
    div.innerHTML = `<b>${t.city}</b>${money ? `$${Number(money).toLocaleString()}` : ""}<br>${ret}`;
    tBox.appendChild(div);
  });
  document.getElementById("q").addEventListener("input", (e) => renderCameras(e.target.value));
}

boot().catch((err) => {
  document.getElementById("stats").textContent = String(err);
});
