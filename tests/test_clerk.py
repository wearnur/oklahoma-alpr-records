from collectors.clerk import clerk_plat, portal_hint


def test_clerk_plat_strips_addition():
    assert clerk_plat("WILEMAN ADDITION") == "WILEMAN"
    assert clerk_plat("LAKE VIEW HEIGHTS") == "LAKE VIEW HEIGHTS"
    assert clerk_plat("FOO SUBDIVISION") == "FOO"


def test_portal_hint_has_official_host():
    h = portal_hint("WILEMAN ADDITION", "18", "3")
    assert h["url"].startswith("https://www.okcc.online/")
    assert h["plat"] == "WILEMAN"
    assert h["lot"] == "18"
    assert h["block"] == "3"
