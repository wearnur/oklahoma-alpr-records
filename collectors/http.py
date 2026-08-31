"""Polite urllib. No API keys. No metered brokers."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

UA = "nerve-ok-record-index/0.1 (local civic-record ingest; Oklahoma)"


def get_bytes(url: str, timeout: int = 60, retries: int = 4) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError) as exc:
            last = exc
            code = getattr(exc, "code", None)
            if code in {429, 500, 502, 503, 504} and attempt < retries - 1:
                time.sleep(15 * (attempt + 1))
                continue
            if attempt < retries - 1 and code is None:
                time.sleep(8 * (attempt + 1))
                continue
            raise
    raise RuntimeError(f"GET failed {url}: {last}")


def post_json(url: str, payload: dict[str, Any], timeout: int = 60) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"User-Agent": UA, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_form(url: str, data: bytes, timeout: int = 180, retries: int = 4) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "User-Agent": UA,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError) as exc:
            last = exc
            code = getattr(exc, "code", None)
            if code in {429, 500, 502, 503, 504} and attempt < retries - 1:
                time.sleep(20 * (attempt + 1))
                continue
            raise
    raise RuntimeError(f"POST failed {url}: {last}")
