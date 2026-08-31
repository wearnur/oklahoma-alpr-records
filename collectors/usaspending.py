"""Federal awards mentioning Flock, filtered to Oklahoma when the field exists. Free API, no key."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json

from .http import post_json
from .normalize import record

URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
FIELDS = [
    "Award ID",
    "Recipient Name",
    "Award Amount",
    "Description",
    "Start Date",
    "End Date",
    "Awarding Agency",
    "Place of Performance State Code",
    "Place of Performance City Name",
]


def fetch(cache_path: Path, force: bool = False) -> dict:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.is_file() and not force:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    payload = {
        "filters": {
            "keywords": ["Flock Safety", "FLOCK GROUP"],
            "time_period": [{"start_date": "2017-01-01", "end_date": "2026-12-31"}],
            "award_type_codes": ["A", "B", "C", "D"],
            "place_of_performance_locations": [{"country": "USA", "state": "OK"}],
        },
        "fields": FIELDS,
        "limit": 100,
        "page": 1,
    }
    data = post_json(URL, payload, timeout=90)
    cache_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def to_records(payload: dict) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for row in payload.get("results") or []:
        state = (row.get("Place of Performance State Code") or "").upper()
        if state and state not in {"OK", "OKLAHOMA"}:
            # Keep a national hit only if the recipient name is Flock and we
            # still need OK filter later. Drop non-OK place for v0.
            continue
        award_id = str(row.get("Award ID") or row.get("generated_internal_id") or "")
        if not award_id:
            continue
        name = row.get("Recipient Name") or award_id
        out.append(
            record(
                id=f"award:usaspending:{award_id}",
                type="award",
                name=name,
                source_name="usaspending",
                source_url="https://www.usaspending.gov/",
                retrieved=now,
                vendor="Flock Safety",
                city=row.get("Place of Performance City Name"),
                extra={"raw": row},
            )
        )
    return out
