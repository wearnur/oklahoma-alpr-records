import json
from pathlib import Path

from collectors.parcels import sanitize
from collectors.requests import guess_city_from_text, request_text
from collectors.whoapproved import to_records as wat_records
from export import export, infer_city

ROOT = Path(__file__).resolve().parents[1]


def test_terms_files_exist():
    names = {p.name for p in (ROOT / "index" / "terms").glob("*.json")}
    assert "okc-c241032.json" in names
    assert "broken-arrow-23-1170.json" in names
    okc = json.loads((ROOT / "index" / "terms" / "okc-c241032.json").read_text(encoding="utf-8"))
    assert okc["money"]["annual_usd"] == 270000
    assert "30" in okc["retention"]["msa_default"]
    ba = json.loads((ROOT / "index" / "terms" / "broken-arrow-23-1170.json").read_text(encoding="utf-8"))
    assert ba["money"]["contract_total_usd"] == 18250
    assert ba["retention"]["order_form"] == "30 days"


def test_export_has_points_and_no_plate_payload():
    status = export()
    assert status["cameras"] > 0
    geo = json.loads((ROOT / "web" / "data" / "cameras.geojson").read_text(encoding="utf-8"))
    feat = geo["features"][0]
    lon, lat = feat["geometry"]["coordinates"]
    assert -104 < lon < -94
    assert 33 < lat < 38
    dumped = json.dumps(geo)
    assert "license plate" not in dumped.lower()
    tulsa = [f for f in geo["features"] if (f["properties"].get("operator") or "").find("Tulsa") >= 0]
    assert tulsa, "expected OSM cameras operated by Tulsa PD"
    assert tulsa[0]["properties"]["city"] == "Tulsa"
    assert tulsa[0]["properties"]["packet"]["city"] == "Tulsa"
    assert any(f["properties"].get("direction") for f in geo["features"])


def test_infer_city_from_operator():
    names = ["Tulsa", "Oklahoma City", "Edmond", "Broken Arrow"]
    assert infer_city("Tulsa Police Department", None, names) == "Tulsa"
    assert infer_city("Edmond Police Department", None, names) == "Edmond"
    assert infer_city(None, None, names) is None
    assert infer_city("The Home Depot", None, names) is None


def test_request_draft_names_inbox_and_city():
    row = request_text("Tulsa")
    assert "Tulsa" in row["subject"]
    assert "24A.1" in row["body"]
    assert row["portal"].startswith("https://")
    assert guess_city_from_text("RE: Flock contract Tulsa PD", ["Tulsa", "Edmond"]) == "Tulsa"


def test_export_writes_missing_json():
    export()
    missing = json.loads((ROOT / "web" / "data" / "missing.json").read_text(encoding="utf-8"))
    assert isinstance(missing, list)
    assert all("city" in m and "cameras" in m for m in missing)
    status = json.loads((ROOT / "web" / "data" / "status.json").read_text(encoding="utf-8"))
    assert "missing_packets" in status
    cities = json.loads((ROOT / "web" / "data" / "cities.json").read_text(encoding="utf-8"))
    assert cities and "cameras" in cities[0] and "share_pct" in cities[0]


def test_parcel_sanitize_strips_injection():
    assert "'" not in sanitize("O'Brien; drop table")
    assert len(sanitize("a" * 200)) == 80


def test_whoapproved_filter_still_ok_only():
    rows = wat_records(
        [{"city": "Tulsa", "state": "OK"}, {"city": "Dallas", "state": "TX"}],
        {"records": []},
    )
    assert [r["name"] for r in rows] == ["Tulsa"]
