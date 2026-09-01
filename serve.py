#!/usr/bin/env python3
"""Viewer + JSON API. python serve.py  → http://127.0.0.1:8765/

  GET /                      map
  GET /v1/cameras?city=
  GET /v1/terms?city=
  GET /v1/missing
  GET /v1/requests
  GET /v1/documents?city=
  GET /v1/status
  GET /v1/cities
  GET /v1/parcel?q=&account=
  GET /v1/okc
  GET /v1/okc/land?q=
  GET /docs/<file>.pdf
"""

from __future__ import annotations

import argparse
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
WEB = HERE / "web"
DOCS = HERE / "data" / "docs"
_CACHE: dict = {}


def _load(name: str):
    path = WEB / "data" / name
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _cached(name: str):
    if name not in _CACHE:
        _CACHE[name] = _load(name)
    return _CACHE[name]


def _city_match(name: str, rows: list) -> dict | None:
    needle = (name or "").strip().lower()
    if not needle:
        return None
    for row in rows or []:
        if str(row.get("city") or "").strip().lower() == needle:
            return row
    return None


def _enrich_parcels(payload: dict) -> dict:
    from collectors.parcels import nearby_cameras

    feats = payload.get("features") or []
    cameras = (_cached("cameras.geojson") or {}).get("features") or []
    cities = _cached("cities.json") or []
    requests = _cached("requests.json") or []
    for row in feats:
        lat, lon = row.get("lat"), row.get("lon")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            row["nearby_cameras"] = nearby_cameras(lat, lon, cameras)
        else:
            row["nearby_cameras"] = []
        city = _city_match(row.get("situs_city"), cities)
        if city:
            row["city_index"] = {
                "city": city.get("city"),
                "cameras": city.get("cameras"),
                "has_contract_pdf": city.get("has_contract_pdf"),
                "per_km2": city.get("per_km2"),
                "share_pct": city.get("share_pct"),
            }
            req = _city_match(city.get("city"), requests)
            if req:
                row["request"] = {
                    "portal": req.get("portal"),
                    "mailto": req.get("mailto"),
                    "inbox": req.get("inbox"),
                }
    return payload


def _city_q(qs: dict) -> str:
    return (qs.get("city") or [""])[0].strip().lower()


def api(path: str, qs: dict):
    if path in {"/v1/status", "/v1/status/"}:
        return _load("status.json") or {}
    if path in {"/v1/cities", "/v1/cities/"}:
        return _load("cities.json") or []
    if path in {"/v1/okc", "/v1/okc/"}:
        return _load("okc-catalog.json") or {"error": "okc catalog missing — run ingest"}
    if path.startswith("/v1/okc/land"):
        from collectors.okc_opendata import lookup_land

        q = (qs.get("q") or qs.get("query") or [""])[0]
        return lookup_land(q)
    if path.startswith("/v1/parcel"):
        from collectors.parcels import lookup

        q = (qs.get("q") or qs.get("query") or [""])[0]
        account = (qs.get("account") or [""])[0].strip() or None
        return _enrich_parcels(lookup(q, account=account))
    if path in {"/v1/missing", "/v1/missing/"}:
        return _load("missing.json") or []
    if path in {"/v1/requests", "/v1/requests/"}:
        return _load("requests.json") or []
    if path.startswith("/v1/cameras"):
        geo = _load("cameras.geojson") or {"type": "FeatureCollection", "features": []}
        city = _city_q(qs)
        if not city:
            return geo
        feats = [
            f
            for f in geo.get("features") or []
            if city in str((f.get("properties") or {}).get("city") or "").lower()
        ]
        return {"type": "FeatureCollection", "features": feats}
    if path.startswith("/v1/terms"):
        terms = _load("terms.json") or []
        city = _city_q(qs)
        if not city:
            return terms
        return [t for t in terms if city in str(t.get("city") or "").lower()]
    if path.startswith("/v1/documents"):
        docs = _load("documents.json") or []
        city = _city_q(qs)
        if not city:
            return docs
        return [d for d in docs if city in str(d.get("city") or "").lower()]
    if path.startswith("/v1/agencies"):
        ag = _load("agencies.json") or []
        city = _city_q(qs)
        if not city:
            return ag
        return [
            a
            for a in ag
            if city in str(a.get("city") or a.get("name") or "").lower()
        ]
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        pass

    def _json(self, payload, code: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        if path.startswith("/v1/"):
            payload = api(path, qs)
            if payload is None:
                self._json({"error": "not found", "path": path}, 404)
                return
            self._json(payload)
            return
        if path.startswith("/docs/"):
            name = Path(path).name
            if name != Path(path[6:]).name or ".." in path:
                self.send_error(400)
                return
            fp = DOCS / name
            if not fp.is_file():
                incoming = list(DOCS.joinpath("incoming").rglob(name)) if DOCS.joinpath("incoming").exists() else []
                fp = incoming[0] if incoming else fp
            if not fp.is_file():
                self.send_error(404)
                return
            data = fp.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    args = p.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"http://127.0.0.1:{args.port}/")
    print(f"api  http://127.0.0.1:{args.port}/v1/missing")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
