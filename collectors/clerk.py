"""Oklahoma County Clerk recorded instruments via the official okcc.online search.

Guest JSON search. Metadata only — no document images (those go through the
clerk portal / cart). GitHub Pages has no CORS, so the public site link-outs;
python serve.py exposes GET /v1/clerk.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

from .http import UA
from .parcels import sanitize

FETCH = "https://www.okcc.online/Mobile/Search/ajax/FetchDocuments.php"
PORTAL = "https://www.okcc.online/index.php#ROD-Addr"
_PLAT_TAILS = (" ADDITION", " ADDN", " ADD", " SUBDIVISION", " SUBD", " SUB")


def clerk_plat(subname: str) -> str:
    s = sanitize(subname)
    for tail in _PLAT_TAILS:
        if s.endswith(tail):
            s = s[: -len(tail)].rstrip()
            break
    return s


def portal_hint(subname: str, lot: str, block: str) -> dict:
    plat = clerk_plat(subname)
    return {
        "url": PORTAL,
        "plat": plat or None,
        "lot": sanitize(lot) or None,
        "block": sanitize(block) or None,
        "note": "Search platted: subdivision / lot / block on okcc.online. Document images stay on the clerk portal.",
    }


def _post(fields: dict, timeout: int = 40) -> dict:
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        FETCH,
        data=body,
        headers={
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://www.okcc.online",
            "Referer": "https://www.okcc.online/index.php",
        },
        method="POST",
    )
    raw = urllib.request.urlopen(req, timeout=timeout).read()
    return json.loads(raw.decode("utf-8"))


def _row(item: dict) -> dict:
    legal = re.sub(r"<br\s*/?>", " ", item.get("legal") or "")
    legal = re.sub(r"\s+", " ", legal).strip()
    return {
        "date": item.get("recdate"),
        "type": (item.get("dtype") or "").strip(),
        "book": item.get("bk"),
        "page": item.get("pg"),
        "instrument": item.get("docno"),
        "grantor": (item.get("grantor") or "").strip(),
        "grantee": (item.get("grantee") or "").strip(),
        "legal": legal,
        "pid": item.get("pid") or None,
    }


def lookup_plat(subname: str, lot: str, block: str, limit: int = 25) -> dict:
    plat = clerk_plat(subname)
    lot_s = sanitize(lot)
    block_s = sanitize(block)
    hint = portal_hint(subname, lot, block)
    if not plat or not lot_s or not block_s:
        return {
            "ok": True,
            "features": [],
            "portal": hint,
            "note": "Need named subdivision + lot + block to query the clerk.",
        }
    payload = _post(
        {
            "legaltype": "platted",
            "rodSubDivTxt": plat,
            "rodLotTxt": lot_s,
            "rodBlockTxt": block_s,
            "rodAddSrch": "",
            "rodResultLimiter": str(min(limit, 25)),
            "rodDateFromTxt": "01/01/1980",
            "rodToDateTxt": "12/31/2026",
            "t": "rod",
            "p": "1",
            "sb": "",
            "sd": "",
        }
    )
    if payload.get("err") not in {1, "1"}:
        return {
            "ok": True,
            "features": [],
            "portal": hint,
            "note": "Clerk search returned no list. Use the portal.",
            "raw_err": payload.get("err"),
        }
    rows = [_row(item) for item in payload.get("data") or []]
    return {
        "ok": True,
        "query": {"plat": plat, "lot": lot_s, "block": block_s},
        "features": rows[:limit],
        "portal": hint,
        "note": "Oklahoma County Clerk recorded instruments. Metadata only; images on okcc.online.",
    }
