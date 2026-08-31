"""Agency-level Oklahoma list from areyouflocked.com. Markers are centroids, not poles."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .http import get_bytes
from .normalize import record

URL = "https://areyouflocked.com/oklahoma"


def fetch(cache_path: Path, force: bool = False) -> str:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.is_file() and not force:
        return cache_path.read_text(encoding="utf-8", errors="replace")
    html = get_bytes(URL).decode("utf-8", errors="replace")
    cache_path.write_text(html, encoding="utf-8")
    return html


def _parse_html(html: str) -> list[dict]:
    """Best-effort. The page is a directory of city + flocked/alpr tags."""
    rows: list[dict] = []
    # Embedded JSON first.
    for m in re.finditer(
        r'<script[^>]*type="application/json"[^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        try:
            payload = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        rows.extend(_from_unknown_json(payload))
        if rows:
            return rows
    # Visible "City — flocked|alpr" text.
    for m in re.finditer(
        r"([A-Z][A-Za-z .'-]{2,40})\s*(?:\||·|-)\s*(flocked|alpr)\b",
        html,
        re.I,
    ):
        rows.append({"city": m.group(1).strip(), "status": m.group(2).lower()})
    return rows


def _from_unknown_json(payload: object) -> list[dict]:
    found: list[dict] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            city = node.get("city") or node.get("name") or node.get("place")
            status = node.get("status") or node.get("tag") or node.get("kind")
            if isinstance(city, str) and isinstance(status, str):
                st = status.lower()
                if st in {"flocked", "alpr"} or "flock" in st or "alpr" in st:
                    found.append({"city": city, "status": st, "raw": node})
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found


def to_records(html: str) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    parsed = _parse_html(html)
    out = []
    for row in parsed:
        city = row["city"]
        status = row.get("status", "")
        vendor = "Flock Safety" if "flock" in status else None
        slug = re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
        out.append(
            record(
                id=f"agency:areyouflocked:{slug}",
                type="agency_record",
                name=city,
                source_name="areyouflocked",
                source_url=URL,
                retrieved=now,
                vendor=vendor,
                city=city,
                precision="agency_centroid",
                extra={"status": status, "note": "agency centroid, not a camera pole"},
            )
        )
    return out
