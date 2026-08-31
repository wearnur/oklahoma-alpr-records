"""Broken Arrow Legistar file 23-1170."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from .http import get_bytes
from .normalize import record

BASE = "https://brokenarrow.legistar.com/"
FILES = (
    (
        "Legislation text 23-1170",
        "ViewReport.ashx?M=R&N=TextL5&GID=567&ID=15740&GUID=LATEST&Title=Legislation+Text",
        "Legislation-Text.pdf",
    ),
    (
        "FY24 Flock Safety agreement",
        "View.ashx?M=F&ID=12303172&GUID=105ADC55-9DD4-4122-B160-628527ACC28F",
        "FY24-Flock-Safety-agreement.pdf",
    ),
)


def fetch(dest_dir: Path, force: bool = False) -> list[dict]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for title, rel, name in FILES:
        url = BASE + rel
        local = dest_dir / name
        if force or not local.is_file():
            local.write_bytes(get_bytes(url, timeout=90))
        slug = Path(name).stem.lower()
        rows.append(
            record(
                id=f"document:broken-arrow:{slug}",
                type="document",
                name=title,
                source_name="brokenarrow-legistar",
                source_url=url,
                retrieved=now,
                vendor="Flock Safety",
                city="Broken Arrow",
                extra={"file_number": "23-1170", "local_path": str(local), "bytes": local.stat().st_size},
            )
        )
    return rows
