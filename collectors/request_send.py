"""Dry-run Open Records sender. Never hits a live portal unless both
--live and RECORDS_SEND_LIVE=1 are set. Default is print-only.
JustFOIA/NextRequest do not accept a reliable URL prefill; mailto does.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
QUEUE = HERE / "index" / "requests" / "queue.json"


def plan() -> list[dict]:
    if not QUEUE.is_file():
        return []
    rows = json.loads(QUEUE.read_text(encoding="utf-8"))
    return [r for r in rows if r.get("status") == "drafted"]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--live", action="store_true", help="actually submit (also needs RECORDS_SEND_LIVE=1)")
    args = p.parse_args()
    rows = plan()
    live = args.live and os.environ.get("RECORDS_SEND_LIVE") == "1"
    if live:
        print(json.dumps({"error": "live send is not implemented; JustFOIA has no public submit API", "n": len(rows)}))
        return 2
    print(json.dumps({"dry_run": True, "n": len(rows), "would_email": [r.get("city") for r in rows]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
