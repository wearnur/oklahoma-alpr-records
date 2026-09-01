"""Oklahoma City open data (data.okc.gov DCAT + ArcGIS). No key.

Ingests the catalog of every published dataset, labels each layer, and
pulls small civic tables. Huge GIS (footprints, contours, 326k addresses)
stays live-query. There is no 311 or building-permit table on this portal.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from .http import get_bytes

CATALOG_URL = "https://data.okc.gov/data.json"
PULL_MAX = 8000
HUGE_MIN = 20000
PULL_CLASSES = {
    "okc-civic-facility",
    "okc-garage-sale",
    "okc-ward",
    "okc-finance",
    "okc-emergency",
    "okc-trash",
    "okc-boundary",
}

_LABELS = (
    (r"garage sale", "okc-garage-sale"),
    (r"land document", "okc-land-docs"),
    (r"\baddress", "okc-address"),
    (r"zoning|zngdswl|overlay parcel|overlay point", "okc-zoning"),
    (r"plat|lots and blocks|subdivision|neighborhood", "okc-plats"),
    (r"ward|council", "okc-ward"),
    (r"emergency response|wreck|crash", "okc-emergency"),
    (r"police station|fire station|city facilit", "okc-civic-facility"),
    (r"trash|recycle|bulky|waste", "okc-trash"),
    (r"tif|hotel motel tax|finance", "okc-finance"),
    (r"building footprint", "okc-buildings"),
    (r"permit", "okc-permits"),
    (r"license", "okc-license"),
    (r"311|service request", "okc-311"),
    (r"park", "okc-parks"),
    (r"work zone|street|sidewalk|bike|trail|pavement|intersection", "okc-transport"),
    (r"storm|waterbody|waterway|hydrology", "okc-storm"),
    (r"boundary|zipcode|airport", "okc-boundary"),
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def label(title: str, layer_name: str = "", keywords: list | None = None) -> str:
    blob = " ".join(
        [title or "", layer_name or "", " ".join(keywords or [])]
    ).lower()
    for pat, class_id in _LABELS:
        if re.search(pat, blob):
            return class_id
    return "okc-gis"


def _get_json(url: str, timeout: int = 60) -> dict:
    raw = get_bytes(url, timeout=timeout)
    return json.loads(raw.decode("utf-8"))


def _feature_servers(dataset: dict) -> list[str]:
    out = []
    for dist in dataset.get("distribution") or []:
        for k in ("accessURL", "downloadURL"):
            u = (dist.get(k) or "").split("?")[0].rstrip("/")
            if "/FeatureServer/" in u:
                out.append(u.split("/FeatureServer/")[0] + "/FeatureServer")
            elif u.endswith("/FeatureServer"):
                out.append(u)
    return out


def discover(catalog: dict) -> list[dict]:
    """Unique layers across duplicate Hub item IDs."""
    seen_svc: set[str] = set()
    layers: dict[str, dict] = {}
    apps = []
    for ds in catalog.get("dataset") or []:
        title = ds.get("title") or ""
        keywords = ds.get("keyword") or []
        landing = ds.get("landingPage") or ds.get("identifier")
        servers = _feature_servers(ds)
        if not servers:
            apps.append(
                {
                    "title": title,
                    "class": label(title, keywords=keywords),
                    "kind": "app" if "/apps/" in (landing or "") or "/maps/" in (landing or "") else "page",
                    "count": None,
                    "query": None,
                    "landing": landing,
                    "status": "link",
                }
            )
            continue
        for svc in servers:
            if svc in seen_svc:
                continue
            seen_svc.add(svc)
            try:
                meta = _get_json(svc + "?f=json")
            except Exception as exc:  # noqa: BLE001
                apps.append(
                    {
                        "title": title,
                        "class": label(title, keywords=keywords),
                        "kind": "service",
                        "count": None,
                        "query": svc,
                        "landing": landing,
                        "status": "error",
                        "error": str(exc)[:200],
                    }
                )
                continue
            if meta.get("error"):
                continue
            for layer in meta.get("layers") or []:
                lid = layer.get("id")
                name = layer.get("name") or title
                gtype = layer.get("geometryType")
                qbase = f"{svc}/{lid}"
                try:
                    count = _get_json(
                        qbase
                        + "/query?"
                        + urllib.parse.urlencode(
                            {"where": "1=1", "returnCountOnly": "true", "f": "json"}
                        )
                    ).get("count")
                except Exception:  # noqa: BLE001
                    count = None
                key = f"{name}|{gtype}|{count}"
                if key in layers:
                    continue
                class_id = label(title, name, keywords)
                if count is None:
                    status = "unknown"
                elif count >= HUGE_MIN:
                    status = "live-query"
                elif (
                    count
                    and count <= PULL_MAX
                    and (class_id in PULL_CLASSES or count <= 200)
                ):
                    status = "pulled"
                else:
                    status = "live-query"
                layers[key] = {
                    "title": name,
                    "source_title": title,
                    "class": class_id,
                    "kind": "layer",
                    "count": count,
                    "geometry": gtype,
                    "query": qbase,
                    "landing": landing,
                    "status": status,
                    "fields": [f.get("name") for f in (layer.get("fields") or [])][:40],
                }
    rows = list(layers.values()) + apps
    rows.sort(key=lambda r: (r.get("class") or "", r.get("title") or ""))
    return rows


def _centroid(geom: dict | None) -> tuple[float | None, float | None]:
    if not geom:
        return None, None
    if "x" in geom and "y" in geom:
        return geom.get("y"), geom.get("x")
    rings = geom.get("rings") or []
    if rings:
        pts = rings[0]
        if len(pts) >= 2 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if pts:
            lon = sum(p[0] for p in pts) / len(pts)
            lat = sum(p[1] for p in pts) / len(pts)
            return round(lat, 7), round(lon, 7)
    return None, None


def pull_layer(query_url: str, limit: int = PULL_MAX) -> list[dict]:
    rows = []
    offset = 0
    while offset < limit:
        page = min(2000, limit - offset)
        qs = urllib.parse.urlencode(
            {
                "where": "1=1",
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": "4326",
                "resultOffset": str(offset),
                "resultRecordCount": str(page),
                "f": "json",
            }
        )
        payload = _get_json(query_url + "/query?" + qs, timeout=90)
        feats = payload.get("features") or []
        if not feats:
            break
        for feat in feats:
            a = feat.get("attributes") or {}
            lat, lon = _centroid(feat.get("geometry"))
            rows.append({"attributes": a, "lat": lat, "lon": lon})
        if len(feats) < page:
            break
        offset += len(feats)
    return rows


def flatten_row(layer: dict, feat: dict) -> dict:
    a = feat.get("attributes") or {}
    name = (
        a.get("FacilityName")
        or a.get("Facility")
        or a.get("name")
        or a.get("Grantor")
        or a.get("Address")
        or a.get("ADDRESS")
        or layer.get("title")
    )
    address = a.get("Address") or a.get("ADDRESS") or a.get("Location")
    return {
        "class": layer.get("class"),
        "layer": layer.get("title"),
        "name": name,
        "address": address,
        "lat": feat.get("lat"),
        "lon": feat.get("lon"),
        "attrs": {
            k: a.get(k)
            for k in a
            if k
            not in {
                "OBJECTID",
                "ObjectID",
                "GlobalID",
                "Shape__Area",
                "Shape__Length",
            }
        },
    }


LAND_LAYER = (
    "https://utility.arcgis.com/usrsvcs/servers/fd9dbc810c9e4b3b8eb17887b796f0e5/"
    "rest/services/OpenData/Licensing_Subdivision/FeatureServer/8"
)


def lookup_land(q: str, limit: int = 8) -> dict:
    from .parcels import looks_like_address, parse_sale_date, sanitize, variants

    needle = sanitize(q)
    if len(needle) < 3:
        return {"ok": True, "query": needle, "features": [], "note": "type more"}
    if not looks_like_address(needle):
        return {
            "ok": True,
            "query": needle,
            "features": [],
            "note": "Land documents lookup needs a street address.",
        }
    clauses = []
    for v in variants(needle) if looks_like_address(needle) else [needle]:
        like = v.replace("'", "")
        if like:
            clauses.append(f"UPPER(Address) LIKE '{like}%'")
            clauses.append(f"UPPER(Address) LIKE '%{like}%'")
            clauses.append(f"UPPER(Grantor) LIKE '%{like}%'")
    where = " OR ".join(dict.fromkeys(clauses)) or "1=0"
    qs = urllib.parse.urlencode(
        {
            "where": where,
            "outFields": "IndexType,Number,Date,Location,Address,Grantor,Reference",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": str(limit),
            "f": "json",
        }
    )
    payload = _get_json(LAND_LAYER + "/query?" + qs)
    if payload.get("error"):
        return {"ok": False, "error": payload["error"], "features": []}
    rows = []
    for feat in payload.get("features") or []:
        a = feat.get("attributes") or {}
        lat, lon = _centroid(feat.get("geometry"))
        rows.append(
            {
                "kind": a.get("IndexType"),
                "number": a.get("Number"),
                "date": parse_sale_date(a.get("Date")),
                "location": a.get("Location"),
                "address": a.get("Address"),
                "grantor": a.get("Grantor"),
                "reference": a.get("Reference"),
                "lat": lat,
                "lon": lon,
                "city": "Oklahoma City",
            }
        )
    return {
        "ok": True,
        "query": needle,
        "features": rows,
        "note": "OKC open-data land documents (city layer, not the county clerk).",
    }


ABSENT = (
    {
        "title": "311 / service requests",
        "class": "okc-311",
        "kind": "absent",
        "count": 0,
        "query": None,
        "landing": "https://data.okc.gov/data.json",
        "status": "absent",
        "note": "Not in the 2026-08 data.okc.gov DCAT catalog.",
    },
    {
        "title": "Building permits",
        "class": "okc-permits",
        "kind": "absent",
        "count": 0,
        "query": None,
        "landing": "https://data.okc.gov/data.json",
        "status": "absent",
        "note": "Portal publishes garage-sale permits, not building permits.",
    },
    {
        "title": "Business licenses",
        "class": "okc-license",
        "kind": "absent",
        "count": 0,
        "query": None,
        "landing": "https://data.okc.gov/data.json",
        "status": "absent",
        "note": "No business-license table on this portal.",
    },
)


def ingest(out_dir: Path, web_dir: Path, force: bool = False) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    web_dir.mkdir(parents=True, exist_ok=True)
    raw_path = out_dir / "okc-data.json"
    if raw_path.is_file() and not force:
        catalog = json.loads(raw_path.read_text(encoding="utf-8"))
    else:
        catalog = _get_json(CATALOG_URL, timeout=90)
        raw_path.write_text(json.dumps(catalog), encoding="utf-8")
    layers = discover(catalog)
    layers.extend(ABSENT)
    pulled = []
    for layer in layers:
        if layer.get("status") != "pulled" or not layer.get("query"):
            continue
        try:
            feats = pull_layer(layer["query"], limit=min(PULL_MAX, int(layer.get("count") or 0) or PULL_MAX))
            layer["pulled"] = len(feats)
            for feat in feats:
                pulled.append(flatten_row(layer, feat))
        except Exception as exc:  # noqa: BLE001
            layer["status"] = "error"
            layer["error"] = str(exc)[:200]
    retrieved = now_iso()
    summary = {
        "retrieved": retrieved,
        "source": CATALOG_URL,
        "datasets": len(catalog.get("dataset") or []),
        "layers": len([x for x in layers if x.get("kind") == "layer"]),
        "pulled_rows": len(pulled),
        "absent": [x["class"] for x in ABSENT],
        "items": layers,
    }
    (out_dir / "okc-catalog.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (web_dir / "okc-catalog.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (web_dir / "okc-rows.json").write_text(
        json.dumps({"retrieved": retrieved, "rows": pulled}, ensure_ascii=False),
        encoding="utf-8",
    )
    return {
        "datasets": summary["datasets"],
        "layers": summary["layers"],
        "pulled_rows": summary["pulled_rows"],
        "absent": summary["absent"],
        "errors": [x.get("title") for x in layers if x.get("status") == "error"],
    }
