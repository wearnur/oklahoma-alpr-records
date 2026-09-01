/* OKC open-data live queries. Same public FeatureServers as collectors/okc_opendata.py. */
(function (global) {
  const LAND =
    "https://utility.arcgis.com/usrsvcs/servers/fd9dbc810c9e4b3b8eb17887b796f0e5/" +
    "rest/services/OpenData/Licensing_Subdivision/FeatureServer/8/query";

  function parseDate(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") {
      if (Math.abs(v) >= 10000000) return new Date(v).toISOString().slice(0, 10);
      if (v >= 1800 && v <= 2100) return String(v);
    }
    return String(v).slice(0, 10);
  }

  async function lookupLand(q, limit) {
    const variants = global.OKParcels && OKParcels.variants ? OKParcels.variants(q) : [String(q || "").toUpperCase()];
    const clauses = [];
    variants.forEach((v) => {
      const like = String(v || "").replace(/'/g, "");
      if (!like) return;
      clauses.push("UPPER(Address) LIKE '" + like + "%'");
      clauses.push("UPPER(Address) LIKE '%" + like + "%'");
    });
    const where = clauses.filter((c, i, a) => a.indexOf(c) === i).join(" OR ") || "1=0";
    const params = new URLSearchParams({
      where,
      outFields: "IndexType,Number,Date,Location,Address,Grantor,Reference",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(limit || 8),
      f: "json",
    });
    const payload = await fetch(LAND + "?" + params.toString()).then((r) => r.json());
    if (payload.error) return { ok: false, error: payload.error, features: [] };
    const features = (payload.features || []).map((feat) => {
      const a = feat.attributes || {};
      const g = feat.geometry || {};
      return {
        kind: a.IndexType,
        number: a.Number,
        date: parseDate(a.Date),
        location: a.Location,
        address: a.Address,
        grantor: a.Grantor,
        reference: a.Reference,
        lat: g.y,
        lon: g.x,
        city: "Oklahoma City",
      };
    });
    return {
      ok: true,
      query: q,
      features,
      note: "OKC open-data land documents (city layer, not the county clerk).",
    };
  }

  global.OKC = { lookupLand };
})(window);
