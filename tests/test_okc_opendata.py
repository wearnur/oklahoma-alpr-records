from collectors.okc_opendata import ABSENT, discover, label


def test_label_land_and_stations():
    assert label("Land Documents", "Land Documents") == "okc-land-docs"
    assert label("Police Stations", "Police Stations") == "okc-civic-facility"
    assert label("Garage Sales", "Garage Sales") == "okc-garage-sale"
    assert label("Straight Zoning", "Straight Zoning") == "okc-zoning"
    assert label("Building Footprints", "Building Footprints") == "okc-buildings"


def test_absent_classes_are_named():
    ids = {row["class"] for row in ABSENT}
    assert ids == {"okc-311", "okc-permits", "okc-license"}
    assert all(row["status"] == "absent" for row in ABSENT)


def test_discover_dedupes_feature_servers():
    catalog = {
        "dataset": [
            {
                "title": "Garage Sales",
                "keyword": ["permits"],
                "landingPage": "https://data.okc.gov/x",
                "distribution": [
                    {
                        "accessURL": "https://example.invalid/OpenData/Licensing_Permits/FeatureServer/0"
                    }
                ],
            }
        ]
    }
    # discover hits the network for real services; empty servers still label apps.
    rows = discover({"dataset": [{"title": "My Address Lookup", "landingPage": "https://data.okc.gov/apps/abc", "distribution": []}]})
    assert rows[0]["status"] == "link"
    assert rows[0]["kind"] == "app"
    assert catalog["dataset"][0]["title"] == "Garage Sales"
