"""Oklahoma ALPR / Flock-tagged objects from OSM Overpass. No key."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .http import post_form
from .normalize import record

OVERPASS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)

QUERY = """
[out:json][timeout:180];
area["ISO3166-2"="US-OK"]->.ok;
(
  nwr["surveillance:type"~"^(ALPR|alpr)$"](area.ok);
  nwr["camera:type"~"^(ALPR|alpr)$"](area.ok);
  nwr["manufacturer"~"Flock",i](area.ok);
  nwr["operator"~"Flock",i](area.ok);
  nwr["brand"~"Flock",i](area.ok);
);
out center tags;
"""


def _center(el: dict) -> tuple[float | None, float | None]:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    c = el.get("center") or {}
    if "lat" in c and "lon" in c:
        return float(c["lat"]), float(c["lon"])
    return None, None


def _vendor(tags: dict[str, str]) -> str | None:
    blob = " ".join(
        str(tags.get(k, ""))
        for k in ("manufacturer", "operator", "brand", "name")
    ).lower()
    if "flock" in blob:
        return "Flock Safety"
    return tags.get("manufacturer") or tags.get("brand") or None


def fetch(cache_path: Path, force: bool = False) -> dict:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.is_file() and not force:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    last = None
    raw = b""
    for url in OVERPASS:
        try:
            raw = post_form(url, QUERY.encode("utf-8"))
            break
        except Exception as exc:  # noqa: BLE001 — try next mirror
            last = exc
    else:
        raise RuntimeError(f"overpass failed: {last}")
    cache_path.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def to_records(payload: dict) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for el in payload.get("elements") or []:
        tags = el.get("tags") or {}
        lat, lon = _center(el)
        osm_type = el.get("type", "node")
        osm_id = el.get("id")
        osm_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}"
        name = (
            tags.get("name")
            or tags.get("operator")
            or tags.get("manufacturer")
            or f"OSM {osm_type} {osm_id}"
        )
        out.append(
            record(
                id=f"cam:osm:{osm_type[0]}{osm_id}",
                type="camera",
                name=name,
                source_name="osm",
                source_url=osm_url,
                retrieved=now,
                vendor=_vendor(tags),
                city=tags.get("addr:city"),
                county=None,
                lat=lat,
                lon=lon,
                precision="pole" if lat is not None else "unknown",
                extra={"osm_tags": tags},
            )
        )
    return out
