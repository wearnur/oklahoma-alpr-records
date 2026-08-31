"""Load the curated Oklahoma agency list. Page is JS; HTML parse is not the source of truth."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .normalize import record

SEED = Path(__file__).resolve().parents[1] / "seed" / "ok-agencies.json"
SOURCE_URL = "https://areyouflocked.com/oklahoma"


def to_records() -> list[dict]:
    payload = json.loads(SEED.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for city in payload.get("flocked") or []:
        out.append(_row(city, "flocked", "Flock Safety", now))
    for city in payload.get("alpr_vendor_unconfirmed") or []:
        out.append(_row(city, "alpr", None, now))
    return out


def _row(city: str, status: str, vendor: str | None, now: str) -> dict:
    slug = re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
    return record(
        id=f"agency:areyouflocked:{slug}",
        type="agency_record",
        name=city,
        source_name="areyouflocked-seed",
        source_url=SOURCE_URL,
        retrieved=now,
        vendor=vendor,
        city=city,
        precision="agency_centroid",
        extra={"status": status, "note": "agency centroid, not a camera pole"},
    )
