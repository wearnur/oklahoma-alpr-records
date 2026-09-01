const $q = document.getElementById("q");
const $out = document.getElementById("out");
const $ambient = document.getElementById("ambient");
const $suggest = document.getElementById("suggest");

let cities = [];
let terms = [];
let documents = [];
let requests = [];
let catalog = [];
let status = {};
let tick = 0;
let timer;
let suggestRows = [];
let suggestI = -1;
let selectedAccount = null;

function money(n) {
  if (n == null || n === "") return null;
  return "$" + Number(n).toLocaleString();
}

function dist(m) {
  if (m == null) return "";
  const mi = m / 1609.34;
  if (mi < 0.15) return Math.round(m * 3.28084) + " ft";
  return mi.toFixed(2) + " mi";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label, value) {
  if (value == null || value === "") return "";
  return `<dt>${label}</dt><dd>${esc(value)}</dd>`;
}

function isLocalHost() {
  return location.hostname === "127.0.0.1" || location.hostname === "localhost";
}

function localPdf(url) {
  const name = (url || "").split("/").pop();
  if (!name || !name.toLowerCase().endsWith(".pdf")) return url;
  if (isLocalHost()) return "/docs/" + name;
  if (/^https?:/i.test(url)) return url;
  return "../data/docs/" + name;
}

function rise(html, i) {
  return `<div class="line" style="animation-delay:${i * 70}ms">${html}</div>`;
}

function cityBlock(c, i) {
  const dens = c.per_km2 != null ? `${c.per_km2}/km²` : "";
  const share = c.share_pct != null ? `${c.share_pct}% of mapped assets` : "";
  const pkt = c.has_contract_pdf ? "packet on file" : "<span class='hole'>packet missing</span>";
  const amt = money(c.amount_usd);
  const req = requests.find((r) => r.city === c.city);
  const actions = [
    `<a href="map.html?city=${encodeURIComponent(c.city)}">Index</a>`,
    req && req.mailto ? `<a href="${req.mailto}">Email request</a>` : "",
    req && req.portal ? `<a href="${req.portal}" target="_blank" rel="noopener">Portal</a>` : "",
  ].filter(Boolean).join(" · ");
  return rise(
    `<article class="hit">
      <p class="kicker">${c.city}</p>
      <p>${c.cameras} cameras${dens ? " · " + dens : ""}${share ? " · " + share : ""}</p>
      <p>${pkt}${amt ? " · " + amt : ""}${c.retention_days ? " · " + c.retention_days + " day retention" : ""}</p>
      <p class="actions">${actions}</p>
    </article>`,
    i
  );
}

function renderAmbient() {
  if ($q.value.trim()) return;
  const pool = cities.filter((c) => c.cameras);
  if (!pool.length) return;
  const c = pool[tick % Math.min(pool.length, 12)];
  tick += 1;
  $ambient.style.opacity = "0";
  setTimeout(() => {
    if ($q.value.trim()) return;
    const hole = c.has_contract_pdf ? "PACKET ON FILE" : "PACKET ABSENT";
    $ambient.textContent = `${c.city.toUpperCase()}  ·  ${c.cameras}  ·  ${hole}`;
    $ambient.style.opacity = "1";
  }, 280);
}

function searchLocal(q) {
  const needle = q.toLowerCase();
  const hits = [];
  cities.forEach((c) => {
    if (c.city.toLowerCase().includes(needle)) hits.push({ kind: "city", city: c });
  });
  terms.forEach((t) => {
    const blob = `${t.city} ${t.contract_id || ""} ${t.file_number || ""}`.toLowerCase();
    if (blob.includes(needle)) hits.push({ kind: "term", term: t });
  });
  documents.forEach((d) => {
    const blob = `${d.name} ${d.city || ""} ${d.contract_id || ""}`.toLowerCase();
    if (blob.includes(needle)) hits.push({ kind: "doc", doc: d });
  });
  if (["missing", "hole", "holes", "absent"].includes(needle)) {
    cities.filter((c) => !c.has_contract_pdf).slice(0, 8).forEach((c) => hits.push({ kind: "city", city: c }));
  }
  catalog.forEach((row) => {
    const blob = `${row.id} ${row.class} ${(row.query || []).join(" ")} ${row.status}`.toLowerCase();
    if (blob.includes(needle) || needle === "catalog" || needle === "what can i search") {
      hits.push({ kind: "catalog", row });
    }
  });
  return hits.slice(0, 14);
}

function parcelDossier(p) {
  const sold = p.sale_price
    ? `${money(p.sale_price)}${p.sale_date ? " · " + p.sale_date : ""}`
    : p.sale_date
      ? `year ${p.sale_date} · price not published`
      : "not published on this layer";
  const mapHref = p.lat != null
    ? `map.html?lat=${p.lat}&lng=${p.lon}&z=16`
    : "map.html";
  const city = p.city_index;
  const nearby = (p.nearby_cameras || [])
    .map((c) => {
      const label = esc(c.name || c.vendor || "camera");
      const hole = c.has_contract_pdf ? "" : " · packet missing";
      const city = c.city ? " · " + esc(c.city) : "";
      return `<li>${dist(c.meters)} · ${label}${city}${hole}</li>`;
    })
    .join("");
  const req = p.request;
  const actions = [
    `<a href="${mapHref}">Index map</a>`,
    `<a href="https://ok-county-gis-hub-ok-co.hub.arcgis.com/" target="_blank" rel="noopener">County GIS</a>`,
    req && req.mailto ? `<a href="${req.mailto}">Email request</a>` : "",
    req && req.portal ? `<a href="${req.portal}" target="_blank" rel="noopener">Portal</a>` : "",
  ].filter(Boolean).join("");
  const cityLine = city
    ? `${esc(city.city)} · ${city.cameras || 0} mapped cameras${city.has_contract_pdf ? " · packet on file" : " · <span class='hole'>packet missing</span>"}`
    : esc(p.situs_city || "");
  return `<article class="parcel">
    <p class="kicker">Oklahoma County parcel</p>
    <h2>${esc(p.situs_display || p.situs || p.account)}</h2>
    <p class="muted">${cityLine}</p>
    <dl>
      ${row("Account", p.account)}
      ${row("Owner", [p.owner, p.owner2].filter(Boolean).join(" · "))}
      ${row("Market", money(p.market) || "")}
      ${row("Assessed", money(p.assessed))}
      ${row("Taxable", money(p.taxable))}
      ${row("Land", money(p.land))}
      ${row("Last sale", sold)}
      ${row("Acres", p.acres)}
      ${row("Type", p.acct_type)}
      ${row("Subdivision", p.subdivision)}
      ${row("Legal", p.legal)}
      ${row("Mail", [p.mail, p.mail_city, p.mail_state, p.zip].filter(Boolean).join(", "))}
      ${row("Tax dist.", p.tax_district)}
    </dl>
    <p class="kicker">Nearby cameras · 1 mi</p>
    ${nearby ? `<ul class="nearby">${nearby}</ul>` : `<p class="muted">None mapped within a mile.</p>`}
    <p class="actions">${actions}</p>
  </article>`;
}

function paintSuggest(rows) {
  suggestRows = rows || [];
  if (!$suggest) return;
  if (!suggestRows.length) {
    $suggest.hidden = true;
    $suggest.innerHTML = "";
    $q.setAttribute("aria-expanded", "false");
    suggestI = -1;
    return;
  }
  $suggest.hidden = false;
  $q.setAttribute("aria-expanded", "true");
  $suggest.innerHTML = suggestRows
    .map((p, i) => {
      const sold = p.sale_price ? money(p.sale_price) : "";
      return `<li role="option" data-account="${p.account || ""}" class="${i === suggestI ? "on" : ""}">
        ${esc(p.situs_display || p.situs || p.account)}
        <span class="muted">${esc(p.situs_city || "")} ${sold ? "· last sale " + sold : ""}</span>
      </li>`;
    })
    .join("");
}

function paint(hits, parcels, chosen) {
  const parts = [];
  let i = 0;
  const addressQ = qLooksLikeParcel($q.value) && /\d/.test($q.value);
  if (chosen) {
    parts.push(rise(parcelDossier(chosen), i++));
  } else if (parcels && parcels.features && parcels.features.length === 1 && addressQ) {
    parts.push(rise(parcelDossier(parcels.features[0]), i++));
  } else if (!addressQ) {
    hits.forEach((h) => {
      if (h.kind === "city") parts.push(cityBlock(h.city, i++));
      if (h.kind === "term") {
        const t = h.term;
        const amt = t.money && money(t.money.annual_usd || t.money.contract_total_usd);
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">${t.city} · contract</p>
            <p>${t.contract_id || t.file_number || ""} ${amt ? "· " + amt : ""}</p>
            <p class="muted">${((t.retention && (t.retention.order_form || t.retention.msa_default)) || "").split(";")[0]}</p>
            <p class="actions"><a href="records.html">Records</a></p>
          </article>`,
          i++
        ));
      }
      if (h.kind === "doc") {
        const d = h.doc;
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">Document</p>
            <p><a href="${localPdf(d.url)}" data-pdf>${d.city || ""} — ${d.name}</a></p>
          </article>`,
          i++
        ));
      }
      if (h.kind === "catalog") {
        const r = h.row;
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">${r.status}</p>
            <p>${r.class}${r.url ? ` · <a href="${r.url}" target="_blank" rel="noopener">source</a>` : ""}</p>
          </article>`,
          i++
        ));
      }
      if (h.kind === "link") {
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">${h.label}</p>
            <p><a href="${h.url}" target="_blank" rel="noopener">${h.text}</a></p>
          </article>`,
          i++
        ));
      }
    });
  }
  if (!chosen && parcels && parcels.features && parcels.features.length > 1) {
    parts.push(rise(`<p class="kicker">Oklahoma County assessor · ${parcels.features.length} matches</p>`, i++));
    parcels.features.forEach((p) => {
      const sold = p.sale_price ? ` · last recorded sale ${money(p.sale_price)}` : "";
      parts.push(rise(
        `<article class="hit" data-pick="${p.account || ""}">
          <p>${esc(p.situs_display || p.situs || p.account)}</p>
          <p class="muted">${esc(p.situs_city || p.mail_city || "")} · market ${money(p.market) || "—"}</p>
          <p>assessed ${money(p.assessed) || "—"} · land ${money(p.land) || "—"}${sold}</p>
        </article>`,
        i++
      ));
    });
  } else if (parcels && parcels.ok && addressQ && !(parcels.features || []).length && !chosen) {
    parts.push(rise(`<p class="muted">No Oklahoma County parcel. Recorded sales come from the assessor, not Zillow. Leases are not public. Tulsa County is next.</p>`, i++));
  }
  if (!parts.length) {
    parts.push(rise(`<p class="muted">Nothing in the index.</p>`, 0));
  }
  $out.innerHTML = parts.join("");
}

function qLooksLikeParcel(q) {
  const s = q.trim();
  if (s.length < 3) return false;
  if (/^(missing|holes?|absent|flock|alpr|catalog|what can i search)$/i.test(s)) return false;
  if (cities.some((c) => c.city.toLowerCase() === s.toLowerCase())) return false;
  return true;
}

function extraLinks(q) {
  const n = q.trim();
  const enc = encodeURIComponent(n);
  const links = [];
  if (/\b(llc|inc|corp|company|business|sos)\b/i.test(n)) {
    links.push({
      kind: "link",
      label: "Oklahoma SOS",
      text: "Search business filings",
      url: "https://www.sos.ok.gov/corp/corpInquiryFind.aspx",
    });
  }
  if (/\b(court|docket|felony|case|filing|lawsuit)\b/i.test(n) || (/^[a-z][a-z.'\-]+(?:\s+[a-z][a-z.'\-]+)+$/i.test(n) && !/\d/.test(n))) {
    links.push({
      kind: "link",
      label: "OSCN",
      text: "Search Oklahoma state courts",
      url: "https://www.oscn.net/dockets/Search.aspx",
    });
  }
  if (/\b(sex offender|predator|sors|offender registry)\b/i.test(n)) {
    links.push({
      kind: "link",
      label: "SORS",
      text: "Oklahoma Sex Offender Registry (official)",
      url: "https://sors.doc.ok.gov/svor/html/SOR.html",
    });
  }
  return links;
}

let cameraCache = null;
async function loadCameras() {
  if (cameraCache) return cameraCache;
  try {
    const geo = await fetch("data/cameras.geojson").then((r) => r.json());
    cameraCache = geo.features || [];
  } catch (e) {
    cameraCache = [];
  }
  return cameraCache;
}

async function fetchParcels(q, account) {
  const cameras = await loadCameras();
  if (globalThis.OKParcels && typeof OKParcels.lookup === "function") {
    return OKParcels.lookup(q, { account, cameras, cities, requests });
  }
  const url = "/v1/parcel?q=" + encodeURIComponent(q) + (account ? "&account=" + encodeURIComponent(account) : "");
  return fetch(url).then((r) => r.json());
}

async function selectAccount(account, q) {
  selectedAccount = account;
  paintSuggest([]);
  let parcels = null;
  try {
    parcels = await fetchParcels(q || $q.value.trim(), account);
  } catch (e) {
    parcels = null;
  }
  const chosen = (parcels && parcels.features || []).find((p) => p.account === account)
    || (parcels && parcels.features && parcels.features[0]);
  if (chosen && chosen.situs_display) $q.value = chosen.situs_display;
  paint([], parcels, chosen);
}

async function run() {
  const q = $q.value.trim();
  if (!q) {
    $out.innerHTML = "";
    $ambient.hidden = false;
    paintSuggest([]);
    selectedAccount = null;
    return;
  }
  $ambient.hidden = true;
  $ambient.textContent = "";
  const hits = searchLocal(q).concat(extraLinks(q));
  let parcels = null;
  if (qLooksLikeParcel(q)) {
    try {
      parcels = await fetchParcels(q, selectedAccount);
    } catch (e) {
      parcels = null;
    }
  }
  if ($q.value.trim() !== q) return;
  const rows = (parcels && parcels.features) || [];
  if (selectedAccount && rows.length) {
    const chosen = rows.find((p) => p.account === selectedAccount) || rows[0];
    paintSuggest([]);
    paint(hits, parcels, chosen);
    return;
  }
  selectedAccount = null;
  const one = rows.length === 1 && /\d/.test(q);
  paintSuggest(one ? [] : rows);
  paint(hits, parcels, one ? rows[0] : null);
}

Promise.all([
  fetch("data/cities.json").then((r) => r.json()).catch(() => []),
  fetch("data/terms.json").then((r) => r.json()),
  fetch("data/documents.json").then((r) => r.json()),
  fetch("data/requests.json").then((r) => r.json()).catch(() => []),
  fetch("data/status.json").then((r) => r.json()),
  fetch("data/catalog.json").then((r) => r.json()).catch(() => []),
]).then(([c, t, d, r, s, cat]) => {
  cities = c.sort((a, b) => (b.cameras || 0) - (a.cameras || 0));
  terms = t;
  documents = d;
  requests = r;
  status = s;
  catalog = cat;
  renderAmbient();
  setInterval(renderAmbient, 4200);
});

$q.addEventListener("input", () => {
  selectedAccount = null;
  clearTimeout(timer);
  timer = setTimeout(run, 220);
});
$q.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" && suggestRows.length) {
    e.preventDefault();
    suggestI = Math.min(suggestRows.length - 1, suggestI + 1);
    paintSuggest(suggestRows);
    return;
  }
  if (e.key === "ArrowUp" && suggestRows.length) {
    e.preventDefault();
    suggestI = Math.max(0, suggestI - 1);
    paintSuggest(suggestRows);
    return;
  }
  if (e.key === "Enter") {
    if (suggestI >= 0 && suggestRows[suggestI]) {
      e.preventDefault();
      selectAccount(suggestRows[suggestI].account, $q.value.trim());
      return;
    }
    run();
  }
  if (e.key === "Escape") {
    paintSuggest([]);
  }
});
if ($suggest) {
  $suggest.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault();
    selectAccount(li.getAttribute("data-account"), $q.value.trim());
  });
}
$out.addEventListener("click", (e) => {
  const hit = e.target.closest("[data-pick]");
  if (!hit) return;
  selectAccount(hit.getAttribute("data-pick"), $q.value.trim());
});

const HINTS = [
  "Tulsa",
  "C241032",
  "508 S Main",
  "missing",
  "catalog",
  "Oklahoma City",
];
let hintI = 0;
function cycleHint() {
  if (document.activeElement === $q && $q.value) return;
  $q.placeholder = HINTS[hintI % HINTS.length];
  hintI += 1;
}
cycleHint();
setInterval(cycleHint, 3200);
