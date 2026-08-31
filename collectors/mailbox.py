"""Poll RECORDS_IMAP_* for Open Records replies. Saves PDFs, marks the queue received.

Does not send mail. Set:
  RECORDS_IMAP_HOST  RECORDS_IMAP_USER  RECORDS_IMAP_PASS
  RECORDS_IMAP_FOLDER (default INBOX)
"""

from __future__ import annotations

import email
import imaplib
import os
from email.header import decode_header
from pathlib import Path

from .requests import _cities, guess_city_from_text, mark_received, slug

HERE = Path(__file__).resolve().parents[1]
INCOMING = HERE / "data" / "docs" / "incoming"


def _decode(val: str | None) -> str:
    if not val:
        return ""
    parts = decode_header(val)
    out = []
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            out.append(chunk.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(chunk)
    return " ".join(out)


def poll() -> dict:
    host = os.environ.get("RECORDS_IMAP_HOST")
    user = os.environ.get("RECORDS_IMAP_USER")
    password = os.environ.get("RECORDS_IMAP_PASS")
    folder = os.environ.get("RECORDS_IMAP_FOLDER", "INBOX")
    if not (host and user and password):
        return {"ok": False, "error": "RECORDS_IMAP_HOST/USER/PASS not set", "saved": []}
    INCOMING.mkdir(parents=True, exist_ok=True)
    cities = _cities()
    saved: list[str] = []
    mail = imaplib.IMAP4_SSL(host)
    try:
        mail.login(user, password)
        mail.select(folder)
        typ, data = mail.search(None, "UNSEEN")
        if typ != "OK":
            return {"ok": False, "error": "imap search failed", "saved": []}
        for num in data[0].split():
            typ, msg_data = mail.fetch(num, "(RFC822)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            subj = _decode(msg.get("Subject"))
            city = guess_city_from_text(subj, cities) or guess_city_from_text(
                _decode(msg.get("From")) + " " + subj, cities
            )
            paths = []
            for part in msg.walk():
                if part.get_content_disposition() != "attachment":
                    continue
                name = part.get_filename() or "attachment.bin"
                if not name.lower().endswith(".pdf"):
                    continue
                raw = part.get_payload(decode=True)
                if not raw:
                    continue
                dest_dir = INCOMING / (slug(city) if city else "_unsorted")
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / name
                dest.write_bytes(raw)
                paths.append(str(dest))
                saved.append(str(dest))
            if city and paths:
                mark_received(city, paths)
    finally:
        try:
            mail.logout()
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True, "saved": saved}
