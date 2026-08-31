#!/usr/bin/env python3
"""Local viewer. python serve.py  then open http://127.0.0.1:8765/"""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB = Path(__file__).resolve().parent / "web"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    args = p.parse_args()
    handler = partial(SimpleHTTPRequestHandler, directory=str(WEB))
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"http://127.0.0.1:{args.port}/")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
