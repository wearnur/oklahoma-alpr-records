"""Oklahoma County assessor parcels. Live query, no key. Not leases."""

from __future__ import annotations

import json
import math
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from .http import UA

LAYER = (
    "https://services8.arcgis.com/euhkr1dAJeQBIjV0/arcgis/rest/services/"
    "TaxParcelsPublics_view/FeatureServer/0/query"
)
FIELDS = (
    "accountno,pin,name1,name2,location,locationcity,mailingaddress1,city,state,"
    "zipcode,currentmarket,currentassessed,currenttaxable,landvalue,acres,legal,"
    "SalePrice,saledate,RecordedDate,SalesValidity,subname,lot,block,section,"
    "township,range,taxdistrictname,accttype,trlink,nbhd"
)
NEARBY_M = 1600
NEARBY_LIMIT = 8

_DIR = {
    "NORTH": "N",
    "SOUTH": "S",
    "EAST": "E",
    "WEST": "W",
    "NORTHEAST": "NE",
    "NORTHWEST": "NW",
    "SOUTHEAST": "SE",
    "SOUTHWEST": "SW",
}
_SUF = {
    "AVENUE": "AVE",
    "AV": "AVE",
    "STREET": "ST",
    "STR": "ST",
    "ROAD": "RD",
    "DRIVE": "DR",
    "LANE": "LN",
    "BOULEVARD": "BLVD",
    "BL": "BLVD",
    "COURT": "CT",
    "CIRCLE": "CIR",
    "PLACE": "PL",
    "TERRACE": "TER",
    "TERR": "TER",
    "PARKWAY": "PKWY",
    "HIGHWAY": "HWY",
    "TRAIL": "TRL",
}
_CITY_TAILS = (
    "OKLAHOMA CITY",
    "OKC",
    "EDMOND",
    "NICHOLS HILLS",
    "THE VILLAGE",
    "BETHANY",
    "WARR ACRES",
    "MIDWEST CITY",
    "DEL CITY",
    "YUKON",
    "MOORE",
    "CHOCTAW",
    "HARRAH",
    "LUTHER",
    "JONES",
    "SPENCER",
    "FOREST PARK",
    "LAKE ALUMA",
    "SMITH VILLAGE",
    "UNINCORPORATED",
)

SITED_SQL = (
    "location IS NOT NULL AND UPPER(location) NOT LIKE '0 UNKNOWN%' "
    "AND UPPER(location) <> 'UNKNOWN'"
)
_UNSITED_RE = re.compile(r"^0+\s*UNKNOWN\b")


def sanitize(q: str) -> str:
    q = (q or "").strip().upper()
    q = re.sub(r"[^A-Z0-9 #.\-]", " ", q)
    q = re.sub(r"\s+", " ", q).strip()
    return q[:80]


def looks_like_account(q: str) -> bool:
    compact = sanitize(q).replace(" ", "")
    return bool(re.fullmatch(r"R?\d{6,}", compact))


def looks_like_address(q: str) -> bool:
    s = sanitize(q)
    if len(s) < 3 or looks_like_account(s):
        return False
    return bool(re.search(r"\d", s))


def is_assessor_query(q: str) -> bool:
    """Situs or account only. 'OKC' is a city token, not an owner search."""
    return looks_like_account(q) or looks_like_address(q)


ENTITY_RE = re.compile(
    r"\b(LLC|L\.L\.C\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|LTD\.?|LLP|PLLC|COMPANY)\b",
    re.I,
)


def is_entity(name: str) -> bool:
    return bool(ENTITY_RE.search(name or ""))


def is_named_subdivision(name: str) -> bool:
    s = sanitize(name)
    if len(s) < 3:
        return False
    if s.startswith("UNPLTD"):
        return False
    return True


def _strip_city_tail(s: str) -> str:
    out = s
    changed = True
    while changed:
        changed = False
        for city in _CITY_TAILS:
            tail = " " + city
            if out.endswith(tail):
                out = out[: -len(tail)].rstrip(" ,")
                changed = True
    return out


def unpublished_situs(location: str | None, city: str | None = None) -> bool:
    """Assessor placeholder lots: '0 UNKNOWN', plus city/unincorporated tails."""
    s = (location or "").strip()
    if not s:
        return True
    city = (city or "").strip()
    if city:
        tail = " " + city.upper()
        up = s.upper()
        while up.endswith(tail):
            s = s[: -len(city) - 1].rstrip(" ,")
            up = s.upper()
    s = _strip_city_tail(s.upper()).strip()
    if not s or s in {"UNKNOWN", "N/A", "NONE", "NULL"}:
        return True
    return bool(_UNSITED_RE.match(s))


def display_situs(location: str | None, city: str | None) -> str:
    s = (location or "").strip()
    if unpublished_situs(s, city):
        return ""
    city = (city or "").strip()
    if city:
        tail = " " + city.upper()
        up = s.upper()
        while up.endswith(tail):
            s = s[: -len(city) - 1].rstrip(" ,")
            up = s.upper()
    cleaned = _strip_city_tail(s.upper())
    return cleaned.title() if s.isupper() or s.upper() == s else s


def normalize_tokens(q: str) -> str:
    s = _strip_city_tail(sanitize(q))
    parts = []
    for tok in s.replace(".", "").split():
        if tok in _DIR:
            parts.append(_DIR[tok])
        elif tok in _SUF:
            parts.append(_SUF[tok])
        else:
            parts.append(tok)
    return " ".join(parts)


def variants(q: str) -> list[str]:
    raw = sanitize(q)
    norm = normalize_tokens(q)
    out: list[str] = []
    for item in (raw, norm):
        if item and item not in out:
            out.append(item)
        stripped = _strip_city_tail(item)
        if stripped and stripped not in out:
            out.append(stripped)
        toks = stripped.split()
        if toks and toks[-1] in set(_SUF.values()) | set(_SUF):
            shorter = " ".join(toks[:-1])
            if shorter and shorter not in out:
                out.append(shorter)
    return out[:6]


def parse_sale_date(v) -> str | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        if v >= 10_000_000:
            return datetime.fromtimestamp(v / 1000, tz=timezone.utc).date().isoformat()
        if 1800 <= int(v) <= 2100:
            return str(int(v))
    text = str(v).strip()
    return text[:10] if text else None


def centroid(geom: dict | None) -> tuple[float | None, float | None]:
    if not geom:
        return None, None
    rings = geom.get("rings") or []
    if not rings:
        return None, None
    pts = rings[0]
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return None, None
    lon = sum(p[0] for p in pts) / len(pts)
    lat = sum(p[1] for p in pts) / len(pts)
    return round(lat, 7), round(lon, 7)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearby_cameras(lat: float, lon: float, cameras: list, radius_m: int = NEARBY_M, limit: int = NEARBY_LIMIT) -> list[dict]:
    hits = []
    for feat in cameras or []:
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        clon, clat = float(coords[0]), float(coords[1])
        meters = haversine_m(lat, lon, clat, clon)
        if meters > radius_m:
            continue
        p = feat.get("properties") or {}
        hits.append(
            {
                "name": p.get("name"),
                "vendor": p.get("vendor"),
                "city": p.get("city"),
                "operator": p.get("operator"),
                "meters": int(round(meters)),
                "lat": clat,
                "lon": clon,
                "has_contract_pdf": bool((p.get("packet") or {}).get("has_contract_pdf")),
            }
        )
    hits.sort(key=lambda r: r["meters"])
    return hits[:limit]


def _where(needle: str, account: str | None) -> str:
    if account:
        acct = sanitize(account).replace(" ", "")
        if not acct.startswith("R"):
            acct = "R" + acct
        return f"accountno='{acct}'"
    if looks_like_account(needle):
        acct = needle.replace(" ", "")
        if not acct.startswith("R"):
            acct = "R" + acct
        return f"accountno='{acct}'"
    clauses = []
    for v in variants(needle):
        like = v.replace("'", "")
        if not like:
            continue
        if looks_like_address(like):
            clauses.append(f"UPPER(location) LIKE '{like}%'")
            clauses.append(f"UPPER(location) LIKE '%{like}%'")
            clauses.append(f"UPPER(mailingaddress1) LIKE '{like}%'")
        else:
            clauses.append(f"UPPER(location) LIKE '%{like}%'")
            clauses.append(f"UPPER(mailingaddress1) LIKE '%{like}%'")
            clauses.append(f"UPPER(name1) LIKE '%{like}%'")
    # Dedupe while preserving order.
    seen = set()
    uniq = []
    for c in clauses:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return " OR ".join(uniq[:12]) or "1=0"


def _score(row: dict, needle: str) -> tuple:
    situs = sanitize(row.get("situs") or "")
    mail = sanitize(row.get("mail") or "")
    norm = normalize_tokens(needle)
    exact = situs.startswith(norm) or situs.startswith(sanitize(needle))
    prefix = any(situs.startswith(v) for v in variants(needle))
    unpublished = 0 if (row.get("situs_display") or "") else 1
    return (
        unpublished,
        0 if exact else 1 if prefix else 2,
        0 if norm and norm in situs else 1 if norm in mail else 2,
        situs,
    )


def _row(feat: dict) -> dict:
    a = feat.get("attributes") or {}
    lat, lon = centroid(feat.get("geometry"))
    situs_city = a.get("locationcity")
    situs_raw = a.get("location")
    return {
        "account": a.get("accountno"),
        "pin": a.get("pin"),
        "owner": a.get("name1"),
        "owner2": a.get("name2"),
        "situs": situs_raw,
        "situs_display": display_situs(situs_raw, situs_city),
        "situs_city": situs_city,
        "mail": a.get("mailingaddress1"),
        "mail_city": a.get("city"),
        "mail_state": a.get("state"),
        "zip": a.get("zipcode"),
        "market": a.get("currentmarket"),
        "assessed": a.get("currentassessed"),
        "taxable": a.get("currenttaxable"),
        "land": a.get("landvalue"),
        "acres": a.get("acres"),
        "sale_price": a.get("SalePrice") or None,
        "sale_date": parse_sale_date(a.get("saledate")),
        "recorded_date": parse_sale_date(a.get("RecordedDate")),
        "sale_validity": a.get("SalesValidity"),
        "legal": a.get("legal"),
        "subdivision": a.get("subname"),
        "lot": a.get("lot"),
        "block": a.get("block"),
        "section": a.get("section"),
        "township": a.get("township"),
        "range": a.get("range"),
        "tax_district": a.get("taxdistrictname"),
        "acct_type": a.get("accttype"),
        "neighborhood": a.get("nbhd"),
        "trlink": a.get("trlink"),
        "lat": lat,
        "lon": lon,
        "county": "Oklahoma County",
    }


def lookup(q: str, limit: int = 8, account: str | None = None) -> dict:
    needle = sanitize(q)
    if account:
        needle = sanitize(account) or needle
    if len(needle) < 3:
        return {"ok": True, "query": needle, "features": [], "note": "type more"}
    if not account and not is_assessor_query(needle):
        return {
            "ok": True,
            "query": needle,
            "features": [],
            "note": "Assessor lookup needs a street address or account number.",
        }
    where = _where(needle, account)
    qs = urllib.parse.urlencode(
        {
            "where": where,
            "outFields": FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": str(max(limit, 12)),
            "f": "json",
        }
    )
    req = urllib.request.Request(LAYER + "?" + qs, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=20).read()
    payload = json.loads(raw.decode())
    if payload.get("error"):
        return {"ok": False, "error": payload["error"], "features": []}
    rows = [_row(feat) for feat in payload.get("features") or []]
    rows.sort(key=lambda r: _score(r, needle))
    if account:
        acct = sanitize(account).replace(" ", "")
        if not acct.startswith("R"):
            acct = "R" + acct
        rows = [r for r in rows if sanitize(r.get("account") or "").replace(" ", "") == acct] or rows[:1]
    return {
        "ok": True,
        "query": needle,
        "county": "Oklahoma County",
        "features": rows[:limit],
        "note": "Oklahoma County assessor public layer. Recorded sale if published. Residential leases are not a public record.",
    }


def _arcgis(where: str, *, limit: int = 40, geometry: bool = False, count_only: bool = False, order: str | None = None) -> dict:
    params = {"where": where, "f": "json"}
    if count_only:
        params["returnCountOnly"] = "true"
    else:
        params["outFields"] = FIELDS
        params["returnGeometry"] = "true" if geometry else "false"
        params["outSR"] = "4326"
        params["resultRecordCount"] = str(min(limit, 40))
        if order:
            params["orderByFields"] = order
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(LAYER + "?" + qs, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=20).read()
    return json.loads(raw.decode())


def lookup_by(field: str, value: str, limit: int = 40) -> dict:
    """Exact assessor roll: same owner string or same plat name. Not a person dossier."""
    key = {"owner": "name1", "subdivision": "subname"}.get(field)
    needle = sanitize(value)
    if not key or len(needle) < 3:
        return {"ok": True, "query": needle, "features": [], "note": "need owner or subdivision"}
    if field == "subdivision" and not is_named_subdivision(needle):
        return {"ok": True, "query": needle, "features": [], "note": "unplatted tract, not a named subdivision"}
    like = needle.replace("'", "")
    where_all = f"UPPER({key})='{like}'"
    where = f"{where_all} AND {SITED_SQL}"
    payload = _arcgis(where, limit=limit, geometry=True, order="location")
    if payload.get("error"):
        return {"ok": False, "error": payload["error"], "features": []}
    rows = [_row(feat) for feat in payload.get("features") or []]
    rows = [r for r in rows if r.get("situs_display")]
    seen = set()
    uniq = []
    for r in rows:
        acct = r.get("account") or r.get("situs_display")
        if acct in seen:
            continue
        seen.add(acct)
        uniq.append(r)
    rows = uniq
    rows.sort(key=lambda r: sanitize(r.get("situs_display") or r.get("account") or ""))
    counted = _arcgis(where, count_only=True)
    sited = counted.get("count") if isinstance(counted.get("count"), int) else len(rows)
    return {
        "ok": True,
        "query": needle,
        "field": field,
        "county": "Oklahoma County",
        "features": rows[:limit],
        "sited": sited,
        "note": "Oklahoma County tax roll. Same name string, not beneficial ownership. Unpublished situs omitted.",
    }
