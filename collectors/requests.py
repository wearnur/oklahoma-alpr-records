"""Open Records drafts. Does not send. Cities reply to RECORDS_INBOX; mailbox.py ingests."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parents[1]
INDEX = HERE / "index"
SEED = HERE / "seed" / "ok-agencies.json"

PORTALS = {
    "Oklahoma City": "https://oklahomacityok.justfoia.com/publicportal/",
    "Tulsa": "https://tulsaok.justfoia.com/publicportal",
    "Edmond": "https://edmondok.justfoia.com/publicportal/",
    "Norman": "https://normanok.nextrequest.com/",
}

BODY = """Under the Oklahoma Open Records Act, 51 O.S. § 24A.1 et seq., please provide electronic copies of:

1. Every contract, master services agreement, order form, statement of work, quote, renewal, addendum, and invoice between the City / Police Department and Flock Group, Inc. (Flock Safety), including any other ALPR vendor (Motorola/Vigilant, Axon, Rekor, ELSAG, Genetec), from 2018 to present.
2. The current and prior data-retention settings, data-sharing / network-opt-in settings, and any agreement that lets another agency query this city's ALPR data (or lets this city query another agency).
3. The number of ALPR cameras deployed, by vendor, and any map or location list the city treats as public. If locations are withheld, state the statutory exemption.
4. Policies, SOPs, audit procedures, and usage/transparency reports for ALPR / Flock. If none exist, say so in writing.

Please produce PDFs by email to {inbox}. I am not requesting license-plate reads, footage, or investigative files.
"""


def inbox() -> str:
    return os.environ.get("RECORDS_INBOX", "records@localhost").strip()


def request_text(city: str) -> dict:
    subj = f"Open Records request — Flock Safety / ALPR contracts — {city}, OK"
    body = BODY.format(inbox=inbox())
    portal = PORTALS.get(city)
    mailto = "mailto:?subject={}&body={}".format(quote(subj), quote(body))
    return {
        "city": city,
        "subject": subj,
        "body": body,
        "portal": portal,
        "mailto": mailto,
        "inbox": inbox(),
    }


def _cities() -> list[str]:
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    names = list(seed.get("flocked") or []) + list(seed.get("alpr_vendor_unconfirmed") or [])
    # Unique, Oklahoma City / Tulsa first (biggest holes by camera count later).
    seen = []
    for n in names:
        if n not in seen:
            seen.append(n)
    return seen


def draft_queue(missing: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    path = INDEX / "requests" / "queue.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
    by_city = {r["city"]: r for r in existing}
    for row in missing:
        city = row["city"]
        draft = request_text(city)
        prev = by_city.get(city) or {}
        if prev.get("status") in {"submitted", "received"}:
            continue
        by_city[city] = {
            **draft,
            "status": prev.get("status") or "drafted",
            "cameras": row.get("cameras"),
            "updated": now,
            "submitted_at": prev.get("submitted_at"),
            "received_at": prev.get("received_at"),
            "docs": prev.get("docs") or [],
        }
    queue = sorted(by_city.values(), key=lambda r: (-(r.get("cameras") or 0), r["city"]))
    path.write_text(json.dumps(queue, indent=2), encoding="utf-8")
    return queue


def mark_received(city: str, docs: list[str]) -> None:
    path = INDEX / "requests" / "queue.json"
    if not path.is_file():
        return
    queue = json.loads(path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat()
    slug = city.lower()
    for row in queue:
        if row["city"].lower() == slug:
            row["status"] = "received"
            row["received_at"] = now
            row["docs"] = list({*(row.get("docs") or []), *docs})
    path.write_text(json.dumps(queue, indent=2), encoding="utf-8")


def guess_city_from_text(text: str, cities: list[str] | None = None) -> str | None:
    blob = (text or "").lower()
    names = cities or _cities()
    for name in sorted(names, key=len, reverse=True):
        if name.lower() in blob:
            return name
    return None


def slug(city: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")
