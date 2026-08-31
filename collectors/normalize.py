from __future__ import annotations

from typing import Any


def record(
    *,
    id: str,
    type: str,
    name: str,
    source_name: str,
    source_url: str,
    retrieved: str,
    vendor: str | None = None,
    city: str | None = None,
    county: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    precision: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    geom = None
    if lat is not None and lon is not None:
        geom = {"lat": lat, "lon": lon, "precision": precision or "unknown"}
    return {
        "id": id,
        "type": type,
        "class": "alpr",
        "vendor": vendor,
        "name": name,
        "jurisdiction": {"state": "OK", "city": city, "county": county},
        "geom": geom,
        "source": {"name": source_name, "url": source_url, "retrieved": retrieved},
        "extra": extra or {},
    }
