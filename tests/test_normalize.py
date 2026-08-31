from collectors.normalize import record
from collectors.seed_agencies import to_records as seed_agencies
from collectors.whoapproved import to_records as wat_records


def test_record_geom_and_jurisdiction():
    row = record(
        id="cam:osm:n1",
        type="camera",
        name="test",
        source_name="osm",
        source_url="https://www.openstreetmap.org/node/1",
        retrieved="2026-08-31T00:00:00+00:00",
        vendor="Flock Safety",
        city="Edmond",
        lat=35.65,
        lon=-97.48,
        precision="pole",
    )
    assert row["jurisdiction"]["state"] == "OK"
    assert row["geom"]["precision"] == "pole"
    assert row["class"] == "alpr"


def test_seed_agencies_cover_okc_and_tulsa():
    rows = seed_agencies()
    names = {r["name"] for r in rows}
    assert "Oklahoma City" in names
    assert "Tulsa" in names
    assert "Edmond" in names
    assert all(r["type"] == "agency_record" for r in rows)
    assert all(r["geom"] is None for r in rows)


def test_whoapproved_keeps_only_oklahoma():
    csv_rows = [
        {"city": "Broken Arrow", "state": "OK", "status": "Expired"},
        {"city": "Monterey County", "state": "CA", "status": "Active"},
    ]
    payload = {
        "records": [
            {"city": "Edmond", "state": "OK", "page_url": "https://whoapprovedthis.org/city/edmond-ok/"},
            {"city": "Austin", "state": "TX"},
        ]
    }
    rows = wat_records(csv_rows, payload)
    names = {r["name"] for r in rows}
    assert names == {"Broken Arrow", "Edmond"}
    assert all(r["jurisdiction"]["state"] == "OK" for r in rows)
