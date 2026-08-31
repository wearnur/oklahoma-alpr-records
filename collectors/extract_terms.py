"""Extract contract terms from local PDFs. pypdf only. No API."""

from __future__ import annotations

import re
from pathlib import Path

from pypdf import PdfReader

TERM_PATTERNS = {
    "retention": re.compile(
        r".{0,80}(retain|retention|purge|delete|days|perpetual).{0,120}",
        re.I,
    ),
    "sharing": re.compile(
        r".{0,80}(nationwide|hot list|hotlist|share|sharing|FlockOS|network).{0,120}",
        re.I,
    ),
    "license": re.compile(
        r".{0,80}(perpetual|irrevocable|worldwide|license).{0,120}",
        re.I,
    ),
    "money": re.compile(
        r".{0,40}(\$\s?[\d,]+(?:\.\d{2})?|\d[\d,]*\s+dollars).{0,80}",
        re.I,
    ),
    "term": re.compile(
        r".{0,80}(term|renew|expiration|effective|July\s+\d|June\s+\d|initial term).{0,120}",
        re.I,
    ),
}


def pdf_text(path: Path, max_pages: int = 40) -> str:
    reader = PdfReader(str(path))
    parts = []
    for i, page in enumerate(reader.pages[:max_pages]):
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def snippets(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    compact = re.sub(r"[ \t]+", " ", text)
    for key, pat in TERM_PATTERNS.items():
        hits = []
        for m in pat.finditer(compact):
            s = " ".join(m.group(0).split())
            if s not in hits:
                hits.append(s)
            if len(hits) >= 12:
                break
        out[key] = hits
    return out
