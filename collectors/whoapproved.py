"""whoapprovedthis.org Oklahoma tracker. CSV/JSON export is $0."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from .http import get_bytes
from .normalize import record

CSV_URL = "https://whoapprovedthis.org/?wat_export=csv"
JSON_URL = "https://whoapprovedthis.org/?wat_export=json"
STATE_URL = "https://whoapprovedthis.org/state/ok/"


def _ok_rows(csv_rows: list[dict], payload: object) -> list[dict]:
    records: list[dict] = []
    if isinstance(payload, dict):
        inner = payload.get("records")
        if isinstance(inner, list):
            records.extend(x for x in inner if isinstance(x, dict))
    elif isinstance(payload, list):
        records.extend(x for x in payload if isinstance(x, dict))
    records.extend(csv_rows)
    out = []
    for row in records:
        if str(row.get("state") or "").upper() in {"OK", "OKLAHOMA"}:
            out.append(row)
    return out


def fetch(cache_dir: Path, force: bool = False) -> tuple[list[dict], object]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    csv_path = cache_dir / "whoapproved.csv"
    json_path = cache_dir / "whoapproved.json"
    if force or not csv_path.is_file():
        csv_path.write_bytes(get_bytes(CSV_URL, timeout=90))
    if force or not json_path.is_file():
        json_path.write_bytes(get_bytes(JSON_URL, timeout=90))
    raw_json = json.loads(json_path.read_text(encoding="utf-8"))
    text = csv_path.read_text(encoding="utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    csv_rows = [r for r in reader]
    return csv_rows, raw_json


def to_records(csv_rows: list[dict], payload: object) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    out: list[dict] = []
    seen: set[str] = set()
    for row in _ok_rows(csv_rows, payload):
        city = str(row.get("city") or "").strip()
        if not city:
            continue
        slug = city.lower().replace(" ", "-")
        rid = f"agency:whoapproved:{slug}"
        if rid in seen:
            continue
        seen.add(rid)
        extra = {k: v for k, v in row.items() if v not in (None, "")}
        out.append(
            record(
                id=rid,
                type="agency_record",
                name=city,
                source_name="whoapprovedthis",
                source_url=str(row.get("page_url") or STATE_URL),
                retrieved=now,
                vendor="Flock Safety",
                city=city,
                extra=extra,
            )
        )
    return out
