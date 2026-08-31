"""Oklahoma City contract packet mirrored at deflockokc.com. Direct files, no search API."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from .http import get_bytes
from .normalize import record

BASE = "https://deflockokc.com/"
# Primary source packet only. Skip advocacy templates and IA files.
FILES = (
    ("Master Agreement C241032", "docs/Master-Agreement-06-20-23.pdf", "C241032"),
    ("City Council Memo Renewal 1", "docs/City-Council-Memo-Renewal-1.pdf", "C241032"),
    ("City Council Memo Renewal 2", "docs/City-Council-Memo-Renewal-2.pdf", "C241032"),
    ("Contract Addendum", "docs/Addendum.pdf", "C241032"),
    ("Renewal Letter Year 1", "docs/Renewal-Letter-Year-1.pdf", "C241032"),
    ("Renewal Letter Year 2", "docs/Renewal-Letter-Year-2.pdf", "C241032"),
    ("OKCPD memo OCPD-2885-2026", "docs/Department-Memorandum-OCPD-2885-2026.pdf", "OCPD-2885-2026"),
    ("Police SOPs ALPR/FR/drones", "docs/Police-SOPs-ALPR-FacialRecognition-Drones.pdf", None),
)


def fetch(dest_dir: Path, force: bool = False) -> list[dict]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for title, rel, contract_id in FILES:
        url = urljoin(BASE, rel)
        local = dest_dir / Path(rel).name
        if force or not local.is_file():
            local.write_bytes(get_bytes(url, timeout=90))
        slug = Path(rel).stem.lower().replace(" ", "-")
        rows.append(
            record(
                id=f"document:deflockokc:{slug}",
                type="document",
                name=title,
                source_name="deflockokc",
                source_url=url,
                retrieved=now,
                vendor="Flock Safety",
                city="Oklahoma City",
                extra={
                    "contract_id": contract_id,
                    "local_path": str(local),
                    "bytes": local.stat().st_size,
                },
            )
        )
    return rows
