const $q = document.getElementById("q");
const $out = document.getElementById("out");
const $ambient = document.getElementById("ambient");

let cities = [];
let terms = [];
let documents = [];
let requests = [];
let status = {};
let tick = 0;
let timer;

function money(n) {
  if (n == null || n === "") return null;
  return "$" + Number(n).toLocaleString();
}

function localPdf(url) {
  const name = (url || "").split("/").pop();
  if (name && name.toLowerCase().endsWith(".pdf")) return "/docs/" + name;
  return url;
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
    req && req.portal ? `<a href="${req.portal}" target="_blank" rel="noopener">Portal</a>` : "",
    req ? `<button type="button" class="btn" data-copy="${c.city}">Copy request</button>` : "",
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
  return hits.slice(0, 12);
}

function paint(hits, parcels) {
  const parts = [];
  let i = 0;
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
          <p><a href="${localPdf(d.url)}">${d.city || ""} — ${d.name}</a></p>
        </article>`,
        i++
      ));
    }
  });
  if (parcels && parcels.features && parcels.features.length) {
    parts.push(rise(`<p class="kicker">Oklahoma County assessor</p>`, i++));
    parcels.features.forEach((p) => {
      parts.push(rise(
        `<article class="hit">
          <p>${p.situs || p.mail || p.account}</p>
          <p class="muted">${p.situs_city || p.mail_city || ""} · ${p.owner || ""}</p>
          <p>market ${money(p.market) || "—"} · assessed ${money(p.assessed) || "—"} · land ${money(p.land) || "—"}</p>
        </article>`,
        i++
      ));
    });
  } else if (parcels && parcels.ok && /\d/.test($q.value) && $q.value.trim().length >= 5 && !(parcels.features || []).length) {
    parts.push(rise(`<p class="muted">No Oklahoma County parcel for that string. Leases are not public.</p>`, i++));
  }
  if (!parts.length) {
    parts.push(rise(`<p class="muted">Nothing in the index.</p>`, 0));
  }
  $out.innerHTML = parts.join("");
  $out.querySelectorAll("[data-copy]").forEach((b) => {
    b.onclick = () => {
      const req = requests.find((r) => r.city === b.dataset.copy);
      if (req) navigator.clipboard.writeText(req.subject + "\n\n" + req.body);
    };
  });
}

async function run() {
  const q = $q.value.trim();
  if (!q) {
    $out.innerHTML = "";
    $ambient.hidden = false;
    return;
  }
  $ambient.hidden = true;
  $ambient.textContent = "";
  const hits = searchLocal(q);
  let parcels = null;
  if (/\d/.test(q) && q.length >= 5) {
    try {
      parcels = await fetch("/v1/parcel?q=" + encodeURIComponent(q)).then((r) => r.json());
    } catch (e) {
      parcels = null;
    }
  }
  if ($q.value.trim() !== q) return;
  paint(hits, parcels);
}

Promise.all([
  fetch("data/cities.json").then((r) => r.json()).catch(() => []),
  fetch("data/terms.json").then((r) => r.json()),
  fetch("data/documents.json").then((r) => r.json()),
  fetch("data/requests.json").then((r) => r.json()).catch(() => []),
  fetch("data/status.json").then((r) => r.json()),
]).then(([c, t, d, r, s]) => {
  cities = c.sort((a, b) => (b.cameras || 0) - (a.cameras || 0));
  terms = t;
  documents = d;
  requests = r;
  status = s;
  renderAmbient();
  setInterval(renderAmbient, 4200);
});

$q.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(run, 180);
});
$q.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});
