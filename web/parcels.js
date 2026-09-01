/* Oklahoma County assessor lookup in the browser. Same public layer as collectors/parcels.py.
   GitHub Pages has no /v1, so inquire talks to ArcGIS + the static camera index. */
(function (global) {
  const LAYER =
    "https://services8.arcgis.com/euhkr1dAJeQBIjV0/arcgis/rest/services/" +
    "TaxParcelsPublics_view/FeatureServer/0/query";
  const FIELDS =
    "accountno,pin,name1,name2,location,locationcity,mailingaddress1,city,state," +
    "zipcode,currentmarket,currentassessed,currenttaxable,landvalue,acres,legal," +
    "SalePrice,saledate,RecordedDate,SalesValidity,subname,lot,block,section," +
    "township,range,taxdistrictname,accttype,trlink,nbhd";
  const NEARBY_M = 1600;
  const NEARBY_LIMIT = 8;
  const DIR = {
    NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
    NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
  };
  const SUF = {
    AVENUE: "AVE", AV: "AVE", STREET: "ST", STR: "ST", ROAD: "RD", DRIVE: "DR",
    LANE: "LN", BOULEVARD: "BLVD", BL: "BLVD", COURT: "CT", CIRCLE: "CIR",
    PLACE: "PL", TERRACE: "TER", TERR: "TER", PARKWAY: "PKWY", HIGHWAY: "HWY",
    TRAIL: "TRL",
  };
  const CITY_TAILS = [
    "OKLAHOMA CITY", "OKC", "EDMOND", "NICHOLS HILLS", "THE VILLAGE", "BETHANY",
    "WARR ACRES", "MIDWEST CITY", "DEL CITY", "YUKON", "MOORE", "CHOCTAW",
    "HARRAH", "LUTHER", "JONES", "SPENCER", "FOREST PARK", "LAKE ALUMA",
    "SMITH VILLAGE",
  ];

  function sanitize(q) {
    return String(q || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9 #.\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function looksLikeAccount(q) {
    return /^R?\d{6,}$/.test(sanitize(q).replace(/ /g, ""));
  }

  function looksLikeAddress(q) {
    const s = sanitize(q);
    if (s.length < 3 || looksLikeAccount(s)) return false;
    return /\d/.test(s);
  }

  function stripCityTail(s) {
    let out = s;
    let changed = true;
    while (changed) {
      changed = false;
      CITY_TAILS.forEach((city) => {
        const tail = " " + city;
        if (out.endsWith(tail)) {
          out = out.slice(0, -tail.length).replace(/[ ,]+$/, "");
          changed = true;
        }
      });
    }
    return out;
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  function displaySitus(location, city) {
    let s = String(location || "").trim();
    if (!s) return "";
    const cityU = String(city || "").trim().toUpperCase();
    if (cityU) {
      const tail = " " + cityU;
      let up = s.toUpperCase();
      while (up.endsWith(tail)) {
        s = s.slice(0, -(cityU.length + 1)).replace(/[ ,]+$/, "");
        up = s.toUpperCase();
      }
    }
    s = stripCityTail(s.toUpperCase());
    return titleCase(s);
  }

  function normalizeTokens(q) {
    const s = stripCityTail(sanitize(q));
    return s
      .replace(/\./g, "")
      .split(" ")
      .filter(Boolean)
      .map((tok) => DIR[tok] || SUF[tok] || tok)
      .join(" ");
  }

  function variants(q) {
    const raw = sanitize(q);
    const norm = normalizeTokens(q);
    const out = [];
    [raw, norm].forEach((item) => {
      if (item && !out.includes(item)) out.push(item);
      const stripped = stripCityTail(item);
      if (stripped && !out.includes(stripped)) out.push(stripped);
      const toks = stripped.split(" ").filter(Boolean);
      const last = toks[toks.length - 1];
      const sufVals = Object.keys(SUF).concat(Object.values(SUF));
      if (last && sufVals.indexOf(last) >= 0) {
        const shorter = toks.slice(0, -1).join(" ");
        if (shorter && !out.includes(shorter)) out.push(shorter);
      }
    });
    return out.slice(0, 6);
  }

  function parseSaleDate(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") {
      if (v >= 10000000) return new Date(v).toISOString().slice(0, 10);
      if (v >= 1800 && v <= 2100) return String(v);
    }
    return String(v).trim().slice(0, 10) || null;
  }

  function centroid(geom) {
    const rings = (geom && geom.rings) || [];
    if (!rings.length) return { lat: null, lon: null };
    let pts = rings[0];
    if (pts.length >= 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) {
      pts = pts.slice(0, -1);
    }
    if (!pts.length) return { lat: null, lon: null };
    const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 };
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const r = 6371000;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearbyCameras(lat, lon, cameras, radiusM, limit) {
    const hits = [];
    (cameras || []).forEach((feat) => {
      const coords = (feat.geometry && feat.geometry.coordinates) || [];
      if (coords.length < 2) return;
      const meters = haversineM(lat, lon, coords[1], coords[0]);
      if (meters > (radiusM || NEARBY_M)) return;
      const p = feat.properties || {};
      hits.push({
        name: p.name,
        vendor: p.vendor,
        city: p.city,
        operator: p.operator,
        meters: Math.round(meters),
        lat: coords[1],
        lon: coords[0],
        has_contract_pdf: !!(p.packet && p.packet.has_contract_pdf),
      });
    });
    hits.sort((a, b) => a.meters - b.meters);
    return hits.slice(0, limit || NEARBY_LIMIT);
  }

  function cityMatch(name, rows) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return null;
    return (rows || []).find((r) => String(r.city || "").trim().toLowerCase() === needle) || null;
  }

  function whereClause(needle, account) {
    if (account) {
      let acct = sanitize(account).replace(/ /g, "");
      if (!acct.startsWith("R")) acct = "R" + acct;
      return "accountno='" + acct + "'";
    }
    if (looksLikeAccount(needle)) {
      let acct = needle.replace(/ /g, "");
      if (!acct.startsWith("R")) acct = "R" + acct;
      return "accountno='" + acct + "'";
    }
    const clauses = [];
    variants(needle).forEach((v) => {
      const like = v.replace(/'/g, "");
      if (!like) return;
      if (looksLikeAddress(like)) {
        clauses.push("UPPER(location) LIKE '" + like + "%'");
        clauses.push("UPPER(location) LIKE '%" + like + "%'");
        clauses.push("UPPER(mailingaddress1) LIKE '" + like + "%'");
      } else {
        clauses.push("UPPER(location) LIKE '%" + like + "%'");
        clauses.push("UPPER(mailingaddress1) LIKE '%" + like + "%'");
        clauses.push("UPPER(name1) LIKE '%" + like + "%'");
      }
    });
    const uniq = [];
    clauses.forEach((c) => {
      if (uniq.indexOf(c) < 0) uniq.push(c);
    });
    return uniq.slice(0, 12).join(" OR ") || "1=0";
  }

  function score(row, needle) {
    const situs = sanitize(row.situs || "");
    const mail = sanitize(row.mail || "");
    const norm = normalizeTokens(needle);
    const exact = situs.startsWith(norm) || situs.startsWith(sanitize(needle));
    const prefix = variants(needle).some((v) => situs.startsWith(v));
    return [exact ? 0 : prefix ? 1 : 2, norm && situs.indexOf(norm) >= 0 ? 0 : mail.indexOf(norm) >= 0 ? 1 : 2, situs];
  }

  function rowFromFeature(feat) {
    const a = feat.attributes || {};
    const c = centroid(feat.geometry);
    const situsCity = a.locationcity;
    const situsRaw = a.location;
    return {
      account: a.accountno,
      pin: a.pin,
      owner: a.name1,
      owner2: a.name2,
      situs: situsRaw,
      situs_display: displaySitus(situsRaw, situsCity),
      situs_city: situsCity,
      mail: a.mailingaddress1,
      mail_city: a.city,
      mail_state: a.state,
      zip: a.zipcode,
      market: a.currentmarket,
      assessed: a.currentassessed,
      taxable: a.currenttaxable,
      land: a.landvalue,
      acres: a.acres,
      sale_price: a.SalePrice || null,
      sale_date: parseSaleDate(a.saledate),
      recorded_date: parseSaleDate(a.RecordedDate),
      sale_validity: a.SalesValidity,
      legal: a.legal,
      subdivision: a.subname,
      lot: a.lot,
      block: a.block,
      section: a.section,
      township: a.township,
      range: a.range,
      tax_district: a.taxdistrictname,
      acct_type: a.accttype,
      neighborhood: a.nbhd,
      trlink: a.trlink,
      lat: c.lat,
      lon: c.lon,
      county: "Oklahoma County",
    };
  }

  function enrich(rows, cameras, cities, requests) {
    return (rows || []).map((row) => {
      const next = Object.assign({}, row);
      if (typeof next.lat === "number" && typeof next.lon === "number") {
        next.nearby_cameras = nearbyCameras(next.lat, next.lon, cameras);
      } else {
        next.nearby_cameras = [];
      }
      const city = cityMatch(next.situs_city, cities);
      if (city) {
        next.city_index = {
          city: city.city,
          cameras: city.cameras,
          has_contract_pdf: city.has_contract_pdf,
          per_km2: city.per_km2,
          share_pct: city.share_pct,
        };
        const req = cityMatch(city.city, requests);
        if (req) {
          next.request = { portal: req.portal, mailto: req.mailto, inbox: req.inbox };
        }
      }
      return next;
    });
  }

  async function lookup(q, opts) {
    opts = opts || {};
    const needle = sanitize(opts.account || q);
    if (needle.length < 3) {
      return { ok: true, query: needle, features: [], note: "type more" };
    }
    const params = new URLSearchParams({
      where: whereClause(needle, opts.account || null),
      outFields: FIELDS,
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "12",
      f: "json",
    });
    const res = await fetch(LAYER + "?" + params.toString());
    const payload = await res.json();
    if (payload.error) return { ok: false, error: payload.error, features: [] };
    let rows = (payload.features || []).map(rowFromFeature);
    rows.sort((a, b) => {
      const sa = score(a, needle);
      const sb = score(b, needle);
      if (sa[0] !== sb[0]) return sa[0] - sb[0];
      if (sa[1] !== sb[1]) return sa[1] - sb[1];
      return String(sa[2]).localeCompare(String(sb[2]));
    });
    if (opts.account) {
      let acct = sanitize(opts.account).replace(/ /g, "");
      if (!acct.startsWith("R")) acct = "R" + acct;
      const pinned = rows.filter((r) => sanitize(r.account || "").replace(/ /g, "") === acct);
      rows = pinned.length ? pinned : rows.slice(0, 1);
    }
    rows = enrich(rows.slice(0, opts.limit || 8), opts.cameras, opts.cities, opts.requests);
    return {
      ok: true,
      query: needle,
      county: "Oklahoma County",
      features: rows,
      note: "Oklahoma County assessor public layer. Recorded sale if published. Residential leases are not a public record.",
    };
  }

  global.OKParcels = {
    lookup,
    sanitize,
    variants,
    normalizeTokens,
    displaySitus,
    nearbyCameras,
  };
})(window);
