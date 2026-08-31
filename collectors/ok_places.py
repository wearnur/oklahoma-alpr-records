"""Oklahoma municipal polygons from OSM, one Overpass pull. Assigns cameras to cities."""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import MultiPoint, Polygon, box
from shapely.ops import unary_union

from .http import post_form
from .osm_alpr import OVERPASS

SEED = Path(__file__).resolve().parents[1] / "seed" / "ok-agencies.json"


def _names() -> list[str]:
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    return list(seed.get("flocked") or []) + list(seed.get("alpr_vendor_unconfirmed") or [])


def _query(names: list[str]) -> str:
    # Exact name match; Oklahoma City / Broken Arrow are admin_level 8.
    alt = "|".join(n.replace(".", r"\.") for n in names)
    return f"""
[out:json][timeout:180];
area["ISO3166-2"="US-OK"]->.ok;
rel["boundary"="administrative"]["admin_level"~"^(7|8)$"]["name"~"^({alt})$"](area.ok);
out geom;
"""


def _rel_shape(el: dict):
    rings = []
    pts = []
    for m in el.get("members") or []:
        geom = m.get("geometry") or []
        for p in geom:
            pts.append((p["lon"], p["lat"]))
        if m.get("type") != "way":
            continue
        role = m.get("role") or "outer"
        if role not in {"outer", ""}:
            continue
        if len(geom) < 4:
            continue
        coords = [(p["lon"], p["lat"]) for p in geom]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        try:
            poly = Polygon(coords)
        except Exception:  # noqa: BLE001
            continue
        if poly.is_valid and poly.area > 0:
            rings.append(poly)
    assembled = unary_union(rings) if rings else None
    b = el.get("bounds")
    bb = None
    if b:
        bb = box(float(b["minlon"]), float(b["minlat"]), float(b["maxlon"]), float(b["maxlat"]))
    hull = MultiPoint(pts).convex_hull if len(pts) >= 3 else None
    if assembled is not None and not assembled.is_empty:
        if bb is None or assembled.area >= 0.35 * bb.area:
            return assembled
    if hull is not None and not hull.is_empty:
        return hull
    return assembled or bb


def fetch(cache_path: Path, force: bool = False) -> dict:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.is_file() and not force:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    names = _names()
    last = None
    raw = b""
    q = _query(names)
    for url in OVERPASS:
        try:
            raw = post_form(url, q.encode("utf-8"))
            break
        except Exception as exc:  # noqa: BLE001
            last = exc
    else:
        raise RuntimeError(f"overpass places failed: {last}")
    cache_path.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def city_shapes(payload: dict) -> list[tuple[str, object]]:
    out = []
    for el in payload.get("elements") or []:
        if el.get("type") != "relation":
            continue
        name = (el.get("tags") or {}).get("name")
        if not name:
            continue
        shp = _rel_shape(el)
        if shp is None or shp.is_empty:
            continue
        out.append((name, shp))
    # Largest first so a town inside a city still... actually we want smallest
    # containing polygon. Sort by area ascending and take first hit.
    out.sort(key=lambda pair: pair[1].area)
    return out


def assign_city(lon: float, lat: float, shapes: list[tuple[str, object]]) -> str | None:
    from shapely.geometry import Point

    pt = Point(lon, lat)
    for name, shp in shapes:
        try:
            if shp.contains(pt) or shp.touches(pt):
                return name
        except Exception:  # noqa: BLE001
            continue
    return None
