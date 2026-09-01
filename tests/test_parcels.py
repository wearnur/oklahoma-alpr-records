from collectors.parcels import (
    SITED_SQL,
    centroid,
    display_situs,
    haversine_m,
    is_assessor_query,
    is_entity,
    is_named_subdivision,
    nearby_cameras,
    normalize_tokens,
    parse_sale_date,
    sanitize,
    unpublished_situs,
    variants,
    _where,
    looks_like_address,
)


def test_sanitize_strips_injection():
    assert "'" not in sanitize("O'Brien; drop table")
    assert len(sanitize("a" * 200)) == 80


def test_avenue_becomes_ave():
    assert normalize_tokens("5309 N Dewey Avenue") == "5309 N DEWEY AVE"
    assert normalize_tokens("5309 North Dewey Ave Oklahoma City") == "5309 N DEWEY AVE"
    vs = variants("5309 N Dewey Avenue")
    assert any(v == "5309 N DEWEY AVE" for v in vs)
    assert any(v == "5309 N DEWEY" for v in vs)


def test_address_where_does_not_search_owner():
    where = _where("5309 N DEWEY AVE", None)
    assert "name1" not in where
    assert "UPPER(location)" in where
    assert "5309 N DEWEY" in where


def test_display_situs_strips_repeated_city():
    assert display_situs(
        "5309 N DEWEY AVE OKLAHOMA CITY OKLAHOMA CITY",
        "OKLAHOMA CITY",
    ) == "5309 N Dewey Ave"


def test_sale_date_year_and_epoch():
    assert parse_sale_date(2012) == "2012"
    assert parse_sale_date(1609459200000) == "2021-01-01"
    assert parse_sale_date(None) is None


def test_centroid_closed_ring():
    lat, lon = centroid(
        {"rings": [[[-97.52, 35.52], [-97.53, 35.52], [-97.53, 35.53], [-97.52, 35.53], [-97.52, 35.52]]]}
    )
    assert lat == 35.525
    assert lon == -97.525


def test_nearby_cameras_radius():
    cameras = [
        {"geometry": {"coordinates": [-97.5224, 35.5245]}, "properties": {"name": "near", "packet": {"has_contract_pdf": True}}},
        {"geometry": {"coordinates": [-97.0, 35.0]}, "properties": {"name": "far"}},
    ]
    hits = nearby_cameras(35.5245, -97.5224, cameras, radius_m=800)
    assert [h["name"] for h in hits] == ["near"]
    assert hits[0]["meters"] < 50
    assert haversine_m(35.47, -97.52, 35.47, -97.52) == 0


def test_looks_like_address():
    assert looks_like_address("5309 N Dewey Ave")
    assert not looks_like_address("Tulsa")
    assert not looks_like_address("OKC")
    assert not looks_like_address("R1234567")
    assert is_assessor_query("5309 N Dewey Ave")
    assert is_assessor_query("R049701050")
    assert not is_assessor_query("OKC")
    assert not is_assessor_query("Edmond")
    assert not is_assessor_query("Oklahoma City")


def test_display_situs_drops_unknown_placeholder():
    assert display_situs("0 UNKNOWN", "EDMOND") == ""
    assert display_situs("0 Unknown", None) == ""
    assert display_situs("0 UNKNOWN  UNINCORPORATED", "UNINCORPORATED") == ""
    assert display_situs("0 UNKNOWN OKLAHOMA CITY", "OKLAHOMA CITY") == ""
    assert unpublished_situs("0 UNKNOWN  UNINCORPORATED", "UNINCORPORATED")
    assert not unpublished_situs("2000 REMINGTON PL OKLAHOMA CITY", "OKLAHOMA CITY")
    assert display_situs("2000 REMINGTON PL OKLAHOMA CITY", "OKLAHOMA CITY") == "2000 Remington Pl"


def test_sited_sql_drops_placeholder_lots():
    assert "0 UNKNOWN" in SITED_SQL
    assert "location IS NOT NULL" in SITED_SQL


def test_entity_and_subdivision_gates():
    assert is_entity("BARNES OKC LLC")
    assert is_entity("PETROLEUM CLUB OKC INC")
    assert not is_entity("WARNER EARL & JEWEL")
    assert is_named_subdivision("WILEMAN ADDITION")
    assert not is_named_subdivision("UNPLTD PT SEC 29 14N 2W")
