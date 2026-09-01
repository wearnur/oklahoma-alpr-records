"""Build the public JSON the map and API read. No plates. No people."""

from __future__ import annotations

import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX = HERE / "index"
WEB = HERE / "web" / "data"
TERMS = INDEX / "terms"
SEED = HERE / "seed" / "ok-agencies.json"


def infer_city(operator: str | None, tagged_city: str | None, names: list[str]) -> str | None:
    """OSM almost never has addr:city on these poles. Operator is the join key."""
    if tagged_city:
        return tagged_city
    blob = (operator or "").lower()
    if not blob:
        return None
    # Longest name first so "Oklahoma City" beats "Yukon" etc.
    for name in sorted(names, key=len, reverse=True):
        if name.lower() in blob:
            return name
    return None


def _load_records() -> list[dict]:
    path = INDEX / "records.jsonl"
    if not path.is_file():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def _packet_for(city: str | None, terms_by_city: dict, agency_by_city: dict) -> dict | None:
    if not city:
        return None
    t = terms_by_city.get(city.lower())
    ag = agency_by_city.get(city.lower())
    extra = (ag or {}).get("extra") or {}
    packet = {
        "city": city,
        "amount_usd": None,
        "retention": None,
        "retention_days": None,
        "renewal_end": None,
        "status": extra.get("status"),
        "has_contract_pdf": bool(t),
    }
    if t:
        money = t.get("money") or {}
        packet["amount_usd"] = money.get("annual_usd") or money.get("contract_total_usd")
        ret = t.get("retention") or {}
        packet["retention"] = ret.get("order_form") or ret.get("msa_default")
        term = t.get("term") or {}
        r2 = term.get("renewal_2") or {}
        packet["renewal_end"] = r2.get("end") or term.get("initial", {}).get("end")
        if packet["retention"] and "7 day" in str(packet["retention"]).lower():
            packet["retention_days"] = 7
        elif packet["retention"] and "30" in str(packet["retention"]):
            packet["retention_days"] = 30
        elif packet["retention"] and "60" in str(packet["retention"]):
            packet["retention_days"] = 60
    elif extra.get("contract_amount_usd"):
        try:
            packet["amount_usd"] = float(extra["contract_amount_usd"])
        except (TypeError, ValueError):
            packet["amount_usd"] = extra.get("contract_amount_usd")
    return packet


def export() -> dict:
    WEB.mkdir(parents=True, exist_ok=True)
    rows = _load_records()
    seed = json.loads(SEED.read_text(encoding="utf-8")) if SEED.is_file() else {}
    city_names = list(seed.get("flocked") or []) + list(seed.get("alpr_vendor_unconfirmed") or [])
    shapes = []
    places_path = HERE / "data" / "ok-places.json"
    if places_path.is_file():
        from collectors.ok_places import city_shapes

        shapes = city_shapes(json.loads(places_path.read_text(encoding="utf-8")))
    terms_by_city = {}
    if TERMS.is_dir():
        for p in TERMS.glob("*.json"):
            t = json.loads(p.read_text(encoding="utf-8"))
            if t.get("city"):
                terms_by_city[t["city"].lower()] = t
    agency_by_city: dict[str, dict] = {}
    cameras = []
    agencies = []
    documents = []
    for r in rows:
        kind = r.get("type")
        if kind == "agency_record":
            city = (r.get("jurisdiction") or {}).get("city") or r.get("name")
            if city:
                agency_by_city.setdefault(city.lower(), r)
    for r in rows:
        kind = r.get("type")
        if kind == "camera" and r.get("geom"):
            tags = (r.get("extra") or {}).get("osm_tags") or {}
            operator = tags.get("operator")
            city = infer_city(operator, (r.get("jurisdiction") or {}).get("city"), city_names)
            if not city and shapes and r.get("geom"):
                from collectors.ok_places import assign_city

                city = assign_city(r["geom"]["lon"], r["geom"]["lat"], shapes)
            packet = _packet_for(city, terms_by_city, agency_by_city)
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
                        "city": city,
                        "operator": operator,
                        "direction": tags.get("direction") or tags.get("camera:direction"),
                        "mount": tags.get("camera:mount"),
                        "zone": tags.get("surveillance:zone"),
                        "source": r.get("source", {}).get("url"),
                        "packet": packet,
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
    missing_map: dict[str, dict] = {}
    for f in cameras:
        p = f.get("properties") or {}
        city = p.get("city")
        pkt = p.get("packet") or {}
        if not city:
            continue
        row = missing_map.setdefault(
            city,
            {
                "city": city,
                "cameras": 0,
                "has_contract_pdf": bool(pkt.get("has_contract_pdf")),
                "amount_usd": pkt.get("amount_usd"),
                "retention_days": pkt.get("retention_days"),
                "renewal_end": pkt.get("renewal_end"),
                "status": pkt.get("status"),
            },
        )
        row["cameras"] += 1
        row["has_contract_pdf"] = row["has_contract_pdf"] or bool(pkt.get("has_contract_pdf"))
    area_km2 = {}
    for name, shp in shapes:
        try:
            area_km2[name] = round(
                float(shp.area) * 111.32 * (111.32 * math.cos(math.radians(35.47))),
                2,
            )
        except Exception:  # noqa: BLE001
            continue
    total_cams = sum(v["cameras"] for v in missing_map.values()) or 1
    cities = []
    for v in missing_map.values():
        km2 = area_km2.get(v["city"])
        cities.append(
            {
                **v,
                "km2": km2,
                "per_km2": round(v["cameras"] / km2, 2) if km2 else None,
                "share_pct": round(100.0 * v["cameras"] / total_cams, 1),
            }
        )
    cities.sort(key=lambda r: -r["cameras"])
    missing = sorted(
        [v for v in cities if not v["has_contract_pdf"]],
        key=lambda r: -r["cameras"],
    )
    try:
        from collectors.requests import draft_queue

        draft_queue(missing)
    except Exception:  # noqa: BLE001
        pass
    geo = {"type": "FeatureCollection", "features": cameras}
    (WEB / "cameras.geojson").write_text(json.dumps(geo), encoding="utf-8")
    (WEB / "agencies.json").write_text(json.dumps(agencies, indent=2), encoding="utf-8")
    (WEB / "documents.json").write_text(json.dumps(documents, indent=2), encoding="utf-8")
    (WEB / "terms.json").write_text(json.dumps(terms, indent=2), encoding="utf-8")
    (WEB / "missing.json").write_text(json.dumps(missing, indent=2), encoding="utf-8")
    (WEB / "cities.json").write_text(json.dumps(cities, indent=2), encoding="utf-8")
    queue_path = INDEX / "requests" / "queue.json"
    queue = json.loads(queue_path.read_text(encoding="utf-8")) if queue_path.is_file() else []
    (WEB / "requests.json").write_text(json.dumps(queue, indent=2), encoding="utf-8")
    with_city = sum(1 for f in cameras if (f.get("properties") or {}).get("city"))
    status = {
        "cameras": len(cameras),
        "cameras_with_city": with_city,
        "agencies": len(agencies),
        "documents": len(documents),
        "terms": len(terms),
        "missing_packets": len(missing),
    }
    (WEB / "status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    return status


if __name__ == "__main__":
    print(json.dumps(export(), indent=2))
