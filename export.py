"""Build the public JSON the map and API read. No plates. No people."""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX = HERE / "index"
WEB = HERE / "web" / "data"
TERMS = INDEX / "terms"


def _load_records() -> list[dict]:
    path = INDEX / "records.jsonl"
    if not path.is_file():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def export() -> dict:
    WEB.mkdir(parents=True, exist_ok=True)
    rows = _load_records()
    cameras = []
    agencies = []
    documents = []
    for r in rows:
        kind = r.get("type")
        if kind == "camera" and r.get("geom"):
            cameras.append(
                {
                    "type": "Feature",
                    "id": r["id"],
                    "geometry": {
                        "type": "Point",
                        "coordinates": [r["geom"]["lon"], r["geom"]["lat"]],
                    },
                    "properties": {
                        "name": r.get("name"),
                        "vendor": r.get("vendor"),
                        "city": (r.get("jurisdiction") or {}).get("city"),
                        "operator": (r.get("extra") or {}).get("osm_tags", {}).get("operator"),
                        "source": r.get("source", {}).get("url"),
                    },
                }
            )
        elif kind == "agency_record":
            agencies.append(
                {
                    "id": r["id"],
                    "name": r.get("name"),
                    "vendor": r.get("vendor"),
                    "city": (r.get("jurisdiction") or {}).get("city"),
                    "source": r.get("source"),
                    "extra": {
                        k: v
                        for k, v in (r.get("extra") or {}).items()
                        if k
                        in {
                            "status",
                            "contract_amount_usd",
                            "camera_count",
                            "approval_date",
                            "primary_source",
                            "page_url",
                            "note",
                        }
                    },
                }
            )
        elif kind == "document":
            documents.append(
                {
                    "id": r["id"],
                    "name": r.get("name"),
                    "city": (r.get("jurisdiction") or {}).get("city"),
                    "url": r.get("source", {}).get("url"),
                    "contract_id": (r.get("extra") or {}).get("contract_id"),
                }
            )
    terms = []
    if TERMS.is_dir():
        for p in sorted(TERMS.glob("*.json")):
            terms.append(json.loads(p.read_text(encoding="utf-8")))
    geo = {"type": "FeatureCollection", "features": cameras}
    (WEB / "cameras.geojson").write_text(json.dumps(geo), encoding="utf-8")
    (WEB / "agencies.json").write_text(json.dumps(agencies, indent=2), encoding="utf-8")
    (WEB / "documents.json").write_text(json.dumps(documents, indent=2), encoding="utf-8")
    (WEB / "terms.json").write_text(json.dumps(terms, indent=2), encoding="utf-8")
    status = {
        "cameras": len(cameras),
        "agencies": len(agencies),
        "documents": len(documents),
        "terms": len(terms),
    }
    (WEB / "status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    return status


if __name__ == "__main__":
    print(json.dumps(export(), indent=2))
