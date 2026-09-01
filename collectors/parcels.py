"""Oklahoma County assessor parcels. Live query, no key. Not leases."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

from .http import UA

LAYER = (
    "https://services8.arcgis.com/euhkr1dAJeQBIjV0/arcgis/rest/services/"
    "TaxParcelsPublics_view/FeatureServer/0/query"
)
FIELDS = (
    "accountno,name1,location,locationcity,mailingaddress1,city,"
    "currentmarket,currentassessed,landvalue,acres,legal,SalePrice,saledate"
)


def sanitize(q: str) -> str:
    q = (q or "").strip().upper()
    q = re.sub(r"[^A-Z0-9 #.\-]", " ", q)
    q = re.sub(r"\s+", " ", q).strip()
    return q[:80]


def lookup(q: str, limit: int = 8) -> dict:
    needle = sanitize(q)
    if len(needle) < 3:
        return {"ok": True, "query": needle, "features": [], "note": "type more"}
    if re.fullmatch(r"R?\d{6,}", needle.replace(" ", "")):
        acct = needle.replace(" ", "")
        if not acct.startswith("R"):
            acct = "R" + acct
        where = f"accountno='{acct}'"
    else:
        like = needle.replace("'", "")
        where = (
            f"UPPER(location) LIKE '%{like}%' OR "
            f"UPPER(mailingaddress1) LIKE '%{like}%' OR "
            f"UPPER(name1) LIKE '%{like}%'"
        )
    qs = urllib.parse.urlencode(
        {
            "where": where,
            "outFields": FIELDS,
            "returnGeometry": "false",
            "resultRecordCount": str(limit),
            "f": "json",
        }
    )
    req = urllib.request.Request(LAYER + "?" + qs, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=20).read()
    payload = json.loads(raw.decode())
    if payload.get("error"):
        return {"ok": False, "error": payload["error"], "features": []}
    rows = []
    for feat in payload.get("features") or []:
        a = feat.get("attributes") or {}
        rows.append(
            {
                "account": a.get("accountno"),
                "owner": a.get("name1"),
                "situs": a.get("location"),
                "situs_city": a.get("locationcity"),
                "mail": a.get("mailingaddress1"),
                "mail_city": a.get("city"),
                "market": a.get("currentmarket"),
                "assessed": a.get("currentassessed"),
                "land": a.get("landvalue"),
                "acres": a.get("acres"),
                "sale_price": a.get("SalePrice"),
                "sale_date": a.get("saledate"),
                "legal": a.get("legal"),
                "county": "Oklahoma County",
            }
        )
    return {
        "ok": True,
        "query": needle,
        "county": "Oklahoma County",
        "features": rows,
        "note": "Assessor public layer. Residential leases are not a public record.",
    }
