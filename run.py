#!/usr/bin/env python3
"""Ingest Oklahoma civic-record sources. $0 paths. No metered search."""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
INDEX = HERE / "index"
sys.path.insert(0, str(HERE))

from collectors.ba_docs import fetch as fetch_ba_docs  # noqa: E402
from collectors.okc_docs import fetch as fetch_okc_docs
from collectors.osm_alpr import fetch as fetch_osm
from collectors.osm_alpr import to_records as osm_records
from collectors.seed_agencies import to_records as seed_agency_records
from collectors.usaspending import fetch as fetch_usa
from collectors.usaspending import to_records as usa_records
from collectors.whoapproved import fetch as fetch_wat
from collectors.whoapproved import to_records as wat_records


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def ingest(force: bool = False) -> dict:
    DATA.mkdir(parents=True, exist_ok=True)
    INDEX.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    rows: list[dict] = []

    try:
        osm = fetch_osm(DATA / "osm-ok-alpr.json", force=force)
        osm_rows = osm_records(osm)
        rows.extend(osm_rows)
        osm_n = len(osm_rows)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"osm: {exc}")
        osm_n = 0

    try:
        ayf_rows = seed_agency_records()
        rows.extend(ayf_rows)
        ayf_n = len(ayf_rows)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"agencies: {exc}")
        ayf_n = 0

    try:
        usa = fetch_usa(DATA / "usaspending-flock.json", force=force)
        usa_rows = usa_records(usa)
        rows.extend(usa_rows)
        usa_n = len(usa_rows)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"usaspending: {exc}")
        usa_n = 0

    try:
        doc_rows = fetch_okc_docs(DATA / "docs", force=force)
        rows.extend(doc_rows)
        docs_n = len(doc_rows)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"okc_docs: {exc}")
        docs_n = 0

    try:
        ba_rows = fetch_ba_docs(DATA / "docs", force=force)
        rows.extend(ba_rows)
        ba_n = len(ba_rows)
        docs_n += ba_n
    except Exception as exc:  # noqa: BLE001
        errors.append(f"ba_docs: {exc}")

    try:
        csv_rows, wat_json = fetch_wat(DATA, force=force)
        wat_rows = wat_records(csv_rows, wat_json)
        rows.extend(wat_rows)
        wat_n = len(wat_rows)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"whoapproved: {exc}")
        wat_n = 0

    # De-dupe by id, last writer wins.
    by_id = {r["id"]: r for r in rows}
    merged = list(by_id.values())
    _write_jsonl(INDEX / "records.jsonl", merged)
    summary = {
        "osm_cameras": osm_n,
        "agency_records": ayf_n,
        "ok_awards": usa_n,
        "okc_documents": docs_n,
        "whoapproved_ok": wat_n,
        "merged": len(merged),
        "errors": errors,
        "index": str(INDEX / "records.jsonl"),
    }
    (INDEX / "status.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def status() -> dict:
    path = INDEX / "status.json"
    if not path.is_file():
        return {"error": "no ingest yet"}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    force = "--force" in sys.argv
    if cmd == "ingest":
        summary = ingest(force=force)
        print(json.dumps(summary, indent=2))
        return 1 if summary["errors"] and summary["merged"] == 0 else 0
    if cmd == "status":
        print(json.dumps(status(), indent=2))
        return 0
    if cmd == "export":
        from export import export as export_web

        print(json.dumps(export_web(), indent=2))
        return 0
    if cmd == "places":
        from collectors.ok_places import fetch as fetch_places

        payload = fetch_places(DATA / "ok-places.json", force=force)
        print(json.dumps({"relations": len(payload.get("elements") or [])}, indent=2))
        return 0
    if cmd == "mailbox":
        from collectors.mailbox import poll

        print(json.dumps(poll(), indent=2))
        return 0
    print("usage: run.py ingest|status|export|places|mailbox [--force]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
