const $q = document.getElementById("q");
const $out = document.getElementById("out");
const $ambient = document.getElementById("ambient");
const $suggest = document.getElementById("suggest");
const $load = document.getElementById("load");
const $loadFill = document.getElementById("load-fill");
const $loadPct = document.getElementById("load-pct");

let cities = [];
let terms = [];
let documents = [];
let requests = [];
let catalog = [];
let okcCatalog = { items: [] };
let okcRows = [];
let status = {};
let tick = 0;
let timer;
let suggestRows = [];
let suggestI = -1;
let selectedAccount = null;
let loadSeq = 0;
let loadTimer = null;

function reduceMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setLoad(n) {
  if (!$loadFill || !$loadPct) return;
  const v = Math.max(0, Math.min(100, Math.round(n)));
  $loadFill.style.width = v + "%";
  $loadPct.textContent = v + "%";
}

function startLoad() {
  const seq = ++loadSeq;
  document.body.classList.add("is-framed", "is-loading");
  if ($load) $load.hidden = false;
  if (reduceMotion()) {
    setLoad(100);
    return seq;
  }
  setLoad(0);
  let p = 0;
  clearInterval(loadTimer);
  loadTimer = setInterval(() => {
    if (seq !== loadSeq) return;
    p += p < 38 ? 8 : p < 68 ? 3.2 : p < 88 ? 1.1 : 0.25;
    if (p > 92) p = 92;
    setLoad(p);
  }, 45);
  return seq;
}

function finishLoad(seq) {
  if (seq !== loadSeq) return;
  clearInterval(loadTimer);
  setLoad(100);
  document.body.classList.remove("is-loading");
  const hide = () => {
    if (seq !== loadSeq) return;
    if ($load) $load.hidden = true;
    setLoad(0);
  };
  if (reduceMotion()) hide();
  else setTimeout(hide, 240);
}

function clearFrame() {
  loadSeq += 1;
  clearInterval(loadTimer);
  document.body.classList.remove("is-framed", "is-loading");
  if ($load) $load.hidden = true;
  setLoad(0);
}

async function withLoad(fn) {
  const seq = startLoad();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const wait = reduceMotion() ? 0 : Math.max(0, 340 - (Date.now() - t0));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    finishLoad(seq);
  }
}

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

function situsLabel(p) {
  return (p && (p.situs_display || p.account)) || "No published situs";
}

function isEntity(name) {
  if (globalThis.OKParcels && typeof OKParcels.isEntity === "function") return OKParcels.isEntity(name);
  return /\b(LLC|L\.L\.C\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|LTD\.?|LLP|PLLC|COMPANY)\b/i.test(name || "");
}

function isNamedSubdivision(name) {
  if (globalThis.OKParcels && typeof OKParcels.isNamedSubdivision === "function") {
    return OKParcels.isNamedSubdivision(name);
  }
  const s = String(name || "").trim().toUpperCase();
  return s.length >= 3 && !s.startsWith("UNPLTD");
}

function sosUrl() {
  return "https://www.sos.ok.gov/corp/corpInquiryFind.aspx";
}

function reviewsUrl(name) {
  return "https://www.google.com/search?q=" + encodeURIComponent(String(name || "") + " Oklahoma reviews");
}

function socialUrl(name, site) {
  return "https://www.google.com/search?q=" + encodeURIComponent("site:" + site + " " + String(name || "") + " Oklahoma");
}

function rollBtn(kind, value, label) {
  if (!value) return "";
  return `<button type="button" class="linkish" data-roll="${kind}" data-value="${encodeURIComponent(value)}">${esc(label)}</button>`;
}

function ownerRow(p) {
  if (!p.owner) return "";
  const extra = p.owner2 ? ` · ${esc(p.owner2)}` : "";
  const entity = isEntity(p.owner);
  const links = [
    rollBtn("owner", p.owner, p.owner),
    extra,
    entity ? `<a href="${sosUrl()}" target="_blank" rel="noopener">SOS filing</a>` : "",
    entity ? `<a href="${reviewsUrl(p.owner)}" target="_blank" rel="noopener">Reviews</a>` : "",
    entity ? `<a href="${socialUrl(p.owner, "facebook.com")}" target="_blank" rel="noopener">Facebook</a>` : "",
    entity ? `<a href="${socialUrl(p.owner, "instagram.com")}" target="_blank" rel="noopener">Instagram</a>` : "",
  ].filter(Boolean).join(" ");
  const note = entity
    ? `<p class="muted">SOS / reviews / social are search link-outs, not a scrape. Registered agent is on the filing; beneficial owners often are not.</p>`
    : `<p class="muted">Tax-roll name. Click for other parcels under the same string. No personal social join.</p>`;
  return `<dt>Owner</dt><dd>${links}${note}</dd>`;
}

function subdivisionRow(p) {
  if (!p.subdivision) return "";
  if (!isNamedSubdivision(p.subdivision)) return row("Subdivision", p.subdivision);
  return `<dt>Subdivision</dt><dd>${rollBtn("subdivision", p.subdivision, p.subdivision)}</dd>`;
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

const CITY_ALIAS = { okc: "Oklahoma City" };

function matchCity(needle, city) {
  const n = needle.toLowerCase();
  const name = (city || "").toLowerCase();
  if (CITY_ALIAS[n] && name === CITY_ALIAS[n].toLowerCase()) return true;
  if (n.length < 2) return false;
  if (name === n || name.startsWith(n)) return true;
  if (n.length >= 4 && name.includes(n)) return true;
  return false;
}

function searchLocal(q) {
  const needle = q.toLowerCase().trim();
  const hits = [];
  if (!needle) return hits;
  cities.forEach((c) => {
    if (matchCity(needle, c.city)) hits.push({ kind: "city", city: c });
  });
  terms.forEach((t) => {
    const blob = `${t.city} ${t.contract_id || ""} ${t.file_number || ""}`.toLowerCase();
    if (needle.length >= 3 && blob.includes(needle)) hits.push({ kind: "term", term: t });
  });
  documents.forEach((d) => {
    const blob = `${d.name} ${d.city || ""} ${d.contract_id || ""}`.toLowerCase();
    if (needle.length >= 3 && blob.includes(needle)) hits.push({ kind: "doc", doc: d });
  });
  if (["missing", "hole", "holes", "absent"].includes(needle)) {
    cities.filter((c) => !c.has_contract_pdf).slice(0, 8).forEach((c) => hits.push({ kind: "city", city: c }));
  }
  catalog.forEach((row) => {
    const blob = `${row.id} ${row.class} ${(row.query || []).join(" ")} ${row.status}`.toLowerCase();
    if (needle === "catalog" || needle === "what can i search" || (needle.length >= 3 && blob.includes(needle))) {
      hits.push({ kind: "catalog", row });
    }
  });
  const cityWide = needle === "okc" || needle === "oklahoma city";
  if (cityWide) {
    hits.push({ kind: "okc-overview", row: okcCatalog });
    (okcCatalog.items || []).forEach((row) => {
      if (row.status === "absent" || row.kind === "absent") hits.push({ kind: "okc-layer", row });
    });
  } else if (needle.length >= 3) {
    (okcCatalog.items || []).forEach((row) => {
      const title = (row.title || "").toLowerCase();
      const klass = (row.class || "").replace(/^okc-/, "").toLowerCase();
      if (title.includes(needle) || klass.includes(needle)) hits.push({ kind: "okc-layer", row });
    });
    okcRows.forEach((row) => {
      const blob = `${row.name || ""} ${row.address || ""} ${row.layer || ""}`.toLowerCase();
      if (blob.includes(needle)) hits.push({ kind: "okc-row", row });
    });
  }
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
    <h2>${esc(situsLabel(p))}</h2>
    <p class="muted">${cityLine}</p>
    <dl>
      ${row("Account", p.account)}
      ${ownerRow(p)}
      ${row("Market", money(p.market) || "")}
      ${row("Assessed", money(p.assessed))}
      ${row("Taxable", money(p.taxable))}
      ${row("Land", money(p.land))}
      ${row("Last sale", sold)}
      ${row("Acres", p.acres)}
      ${row("Type", p.acct_type)}
      ${subdivisionRow(p)}
      ${row("Legal", p.legal)}
      ${row("Mail", [p.mail, p.mail_city, p.mail_state, p.zip].filter(Boolean).join(", "))}
      ${row("Tax dist.", p.tax_district)}
    </dl>
    <p class="kicker">Nearby cameras · 1 mi</p>
    ${nearby ? `<ul class="nearby">${nearby}</ul>` : `<p class="muted">None mapped within a mile.</p>`}
    ${clerkBlock(p.clerk)}
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
        ${esc(situsLabel(p))}
        <span class="muted">${esc(p.situs_city || "")} ${sold ? "· last sale " + sold : ""}</span>
      </li>`;
    })
    .join("");
}

function clerkBlock(clerk) {
  if (!clerk) return "";
  const portal = (clerk.portal && clerk.portal.url) || "https://www.okcc.online/index.php#ROD-Addr";
  const hint = clerk.portal || {};
  const feats = clerk.features || [];
  const rows = feats
    .map((d) => `<li>${esc(d.date || "")} · ${esc(d.type || "")} · bk ${esc(d.book || "")} p ${esc(d.page || "")} · ${esc(d.grantor || "")} → ${esc(d.grantee || "")}</li>`)
    .join("");
  const how = hint.plat
    ? `Search platted ${esc(hint.plat)} lot ${esc(hint.lot || "")} block ${esc(hint.block || "")}`
    : "Search by plat / lot / block";
  return `<p class="kicker">County clerk instruments</p>
    ${rows ? `<ul class="nearby">${rows}</ul>` : `<p class="muted">${esc(clerk.note || "Not loaded here.")} ${how} on the official portal.</p>`}
    <p class="actions"><a href="${portal}" target="_blank" rel="noopener">okcc.online</a></p>`;
}

function paintLand(docs, i0) {
  const feats = (docs && docs.features) || [];
  if (!feats.length) return [];
  const parts = [rise(`<p class="kicker">OKC land documents · ${feats.length}</p>`, i0)];
  feats.forEach((d, n) => {
    parts.push(rise(
      `<article class="hit">
        <p>${esc(d.address || d.location || d.reference || "")}</p>
        <p class="muted">${esc(d.kind || "")} ${esc(d.number || "")} · ${esc(d.date || "")} · ${esc(d.grantor || "")}</p>
      </article>`,
      i0 + 1 + n
    ));
  });
  return parts;
}

function paint(hits, parcels, chosen, land) {
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
      if (h.kind === "okc-overview") {
        const r = h.row || {};
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">OKC open data</p>
            <p>${r.layers || 0} layers labeled · ${Number(r.pulled_rows || 0).toLocaleString()} civic rows pulled</p>
            <p class="muted">Huge GIS stays live-query. 311, building permits, and business licenses are absent on this portal.</p>
          </article>`,
          i++
        ));
      }
      if (h.kind === "okc-layer") {
        const r = h.row;
        const n = r.count != null ? r.count.toLocaleString() : "";
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">${esc(r.status || "okc")} · ${esc(r.class || "")}</p>
            <p>${esc(r.title || "")}${n ? " · " + n + " records" : ""}</p>
            ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ""}
            ${r.landing ? `<p class="actions"><a href="${esc(r.landing)}" target="_blank" rel="noopener">Source</a></p>` : ""}
          </article>`,
          i++
        ));
      }
      if (h.kind === "okc-row") {
        const r = h.row;
        parts.push(rise(
          `<article class="hit">
            <p class="kicker">${esc(r.layer || r.class || "OKC")}</p>
            <p>${esc(r.name || r.address || "")}</p>
            <p class="muted">${esc(r.address || "")}</p>
          </article>`,
          i++
        ));
      }
    });
  }
  if (!chosen && addressQ && parcels && parcels.features && parcels.features.length > 1) {
    parts.push(rise(`<p class="kicker">Oklahoma County assessor · ${parcels.features.length} matches</p>`, i++));
    parcels.features.forEach((p) => {
      const sold = p.sale_price ? ` · last recorded sale ${money(p.sale_price)}` : "";
      parts.push(rise(
        `<article class="hit" data-pick="${p.account || ""}">
          <p>${esc(situsLabel(p))}</p>
          <p class="muted">${esc(p.situs_city || p.mail_city || "")} · market ${money(p.market) || "—"}</p>
          <p>assessed ${money(p.assessed) || "—"} · land ${money(p.land) || "—"}${sold}</p>
        </article>`,
        i++
      ));
    });
  } else if (parcels && parcels.ok && addressQ && !(parcels.features || []).length && !chosen) {
    parts.push(rise(`<p class="muted">No Oklahoma County parcel. Recorded sales come from the assessor, not Zillow. Leases are not public.</p>`, i++));
  }
  paintLand(land, i).forEach((el) => parts.push(el));
  if (!parts.length) {
    parts.push(rise(`<p class="muted">Nothing in the index.</p>`, 0));
  }
  $out.innerHTML = parts.join("");
}

function qLooksLikeParcel(q) {
  const s = q.trim();
  if (s.length < 3) return false;
  if (/^r?\d{6,}$/i.test(s.replace(/\s/g, ""))) return true;
  if (!/\d/.test(s)) return false;
  if (/^(missing|holes?|absent|flock|alpr|catalog|what can i search)$/i.test(s)) return false;
  if (cities.some((c) => c.city.toLowerCase() === s.toLowerCase())) return false;
  if (CITY_ALIAS[s.toLowerCase()]) return false;
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

async function fetchClerk(p) {
  if (!p || !p.subdivision || !p.lot || !p.block) {
    return {
      features: [],
      portal: { url: "https://www.okcc.online/index.php#ROD-Addr", plat: p && p.subdivision, lot: p && p.lot, block: p && p.block },
      note: "Need named subdivision + lot + block.",
    };
  }
  const qs = new URLSearchParams({
    subdivision: p.subdivision,
    lot: String(p.lot),
    block: String(p.block),
  });
  try {
    const r = await fetch("/v1/clerk?" + qs.toString());
    if (r.ok) return r.json();
  } catch (e) {
    /* Pages has no /v1 and okcc.online has no CORS */
  }
  return {
    features: [],
    portal: {
      url: "https://www.okcc.online/index.php#ROD-Addr",
      plat: p.subdivision,
      lot: p.lot,
      block: p.block,
    },
    note: "Clerk list needs the local server. On GitHub Pages, use the official portal.",
  };
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
  await withLoad(async () => {
    let parcels = null;
    try {
      parcels = await fetchParcels(q || $q.value.trim(), account);
    } catch (e) {
      parcels = null;
    }
    const chosen = (parcels && parcels.features || []).find((p) => p.account === account)
      || (parcels && parcels.features && parcels.features[0]);
    if (chosen && chosen.situs_display) $q.value = chosen.situs_display;
    if (chosen) {
      try {
        chosen.clerk = await fetchClerk(chosen);
      } catch (e) {
        chosen.clerk = null;
      }
    }
    let land = null;
    try {
      if (globalThis.OKC && chosen) land = await OKC.lookupLand(chosen.situs_display || q);
    } catch (e) {
      land = null;
    }
    paint([], parcels, chosen, land);
  });
}

async function run() {
  const q = $q.value.trim();
  if (!q) {
    $out.innerHTML = "";
    $ambient.hidden = false;
    paintSuggest([]);
    selectedAccount = null;
    clearFrame();
    return;
  }
  $ambient.hidden = true;
  $ambient.textContent = "";
  await withLoad(async () => {
    const hits = searchLocal(q).concat(extraLinks(q));
    let parcels = null;
    let land = null;
    if (qLooksLikeParcel(q)) {
      try {
        parcels = await fetchParcels(q, selectedAccount);
      } catch (e) {
        parcels = null;
      }
      try {
        if (globalThis.OKC) land = await OKC.lookupLand(q);
      } catch (e) {
        land = null;
      }
    }
    if ($q.value.trim() !== q) return;
    const rows = (parcels && parcels.features) || [];
    if (selectedAccount && rows.length) {
      const chosen = rows.find((p) => p.account === selectedAccount) || rows[0];
      try {
        chosen.clerk = await fetchClerk(chosen);
      } catch (e) {
        chosen.clerk = null;
      }
      paintSuggest([]);
      paint(hits, parcels, chosen, land);
      return;
    }
    selectedAccount = null;
    const one = rows.length === 1 && /\d/.test(q);
    const pick = one ? rows[0] : null;
    if (pick) {
      try {
        pick.clerk = await fetchClerk(pick);
      } catch (e) {
        pick.clerk = null;
      }
    }
    paintSuggest(one ? [] : rows);
    paint(hits, parcels, pick, land);
  });
}

Promise.all([
  fetch("data/cities.json").then((r) => r.json()).catch(() => []),
  fetch("data/terms.json").then((r) => r.json()),
  fetch("data/documents.json").then((r) => r.json()),
  fetch("data/requests.json").then((r) => r.json()).catch(() => []),
  fetch("data/status.json").then((r) => r.json()),
  fetch("data/catalog.json").then((r) => r.json()).catch(() => []),
  fetch("data/okc-catalog.json").then((r) => r.json()).catch(() => ({ items: [] })),
  fetch("data/okc-rows.json").then((r) => r.json()).catch(() => ({ rows: [] })),
]).then(([c, t, d, r, s, cat, okc, rows]) => {
  cities = c.sort((a, b) => (b.cameras || 0) - (a.cameras || 0));
  terms = t;
  documents = d;
  requests = r;
  status = s;
  catalog = cat;
  okcCatalog = okc || { items: [] };
  okcRows = (rows && rows.rows) || [];
  renderAmbient();
  setInterval(renderAmbient, 4200);
  const boot = new URLSearchParams(location.search);
  if (boot.get("frame") === "1") document.body.classList.add("is-framed");
  const bootRoll = boot.get("roll");
  const bootName = boot.get("name");
  const bootQ = boot.get("q");
  if (bootRoll && bootName) {
    $q.value = bootName;
    openRoll(bootRoll, bootName);
  } else if (bootQ) {
    $q.value = bootQ;
    run();
  }
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
async function openRoll(kind, value) {
  paintSuggest([]);
  $ambient.hidden = true;
  await withLoad(async () => {
    if (!globalThis.OKParcels || typeof OKParcels.lookupBy !== "function") {
      $out.innerHTML = rise(`<p class="muted">Assessor roll is unavailable.</p>`, 0);
      return;
    }
    const payload = await OKParcels.lookupBy(kind, value, { limit: 40 });
    const feats = payload.features || [];
    const sited = payload.sited != null ? payload.sited : feats.length;
    const cap = feats.length >= 40 || sited > feats.length;
    const parts = [
      rise(`<p class="kicker">Tax roll · ${esc(kind)} · ${feats.length}${cap ? "+" : ""}</p>`, 0),
      rise(`<p class="muted">${esc(value)} — same assessor string, not beneficial ownership. Unpublished situs omitted.${sited > feats.length ? " " + sited + " with a published address." : ""} Cap 40.</p>`, 1),
    ];
    if (payload.note && !feats.length) {
      parts.push(rise(`<p class="muted">${esc(payload.note)}</p>`, 2));
    }
    feats.forEach((p, i) => {
      const label = p.situs_display || p.account || "No published situs";
      parts.push(rise(
        `<article class="hit" data-pick="${p.account || ""}">
          <p>${esc(label)}</p>
          <p class="muted">${esc(p.owner || "")} · market ${money(p.market) || "—"}</p>
        </article>`,
        i + 2
      ));
    });
    $out.innerHTML = parts.join("");
  });
}

$out.addEventListener("click", (e) => {
  const roll = e.target.closest("[data-roll]");
  if (roll) {
    e.preventDefault();
    const kind = roll.getAttribute("data-roll");
    const value = decodeURIComponent(roll.getAttribute("data-value") || "");
    openRoll(kind, value);
    return;
  }
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
