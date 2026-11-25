import io
import struct
from urllib.parse import urlparse, parse_qs

import ezdxf
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import get_current_user
from app.api import customers as customers_api, leads as leads_api, oauth as oauth_api
from app.api.customers import build_customer_directory, build_customer_history
from app.services import mail_oauth
from app.core import tenancy
from app.services.geometry import analyze_part_file, analyze_stl, describe_geometry, GeometryError
from app.services.parser import attachments_to_text
from tests.fake_supabase import FakeSupabase

USER = {"id": "u1", "email": "rep@seller.com", "company_id": "c1", "role": "user"}


# ------------------------------------------------------------------ geometry
def dxf_bytes(units=4, inch=False):
    doc = ezdxf.new()
    doc.header["$INSUNITS"] = units
    msp = doc.modelspace()
    for a, b in [((0, 0), (100, 0)), ((100, 0), (100, 50)), ((100, 50), (0, 50)), ((0, 50), (0, 0))]:
        msp.add_line(a, b)
    msp.add_circle((50, 25), 5)
    msp.add_lwpolyline([(10, 10), (20, 10), (20, 15), (10, 15)], close=True)
    msp.add_text("PART 7")  # annotations are not cut
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode()


def cube_stl(size=10.0, ascii_=False):
    s = size
    v = [(0, 0, 0), (s, 0, 0), (s, s, 0), (0, s, 0), (0, 0, s), (s, 0, s), (s, s, s), (0, s, s)]
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    if ascii_:
        out = "solid cube\n"
        for f in faces:
            out += "facet normal 0 0 0\nouter loop\n" + "".join(f"vertex {v[i][0]} {v[i][1]} {v[i][2]}\n" for i in f) + "endloop\nendfacet\n"
        return (out + "endsolid cube\n").encode()
    data = b"\0" * 80 + struct.pack("<I", len(faces))
    for f in faces:
        data += struct.pack("<3f", 0, 0, 0) + b"".join(struct.pack("<3f", *v[i]) for i in f) + b"\0\0"
    return data


def test_dxf_cut_length_contours_and_blank():
    g = analyze_part_file("plate.dxf", dxf_bytes())
    assert g["cut_length_mm"] == pytest.approx(300 + 31.416 + 30, abs=0.2)
    assert g["contours"] == 3  # outline (4 joined lines), hole, slot
    assert (g["width_mm"], g["height_mm"]) == (100.0, 50.0)
    text = describe_geometry("plate.dxf", g)
    assert "Separate contours (one pierce each): 3." in text and "100.00 x 50.00 mm" in text


def test_dxf_inches_are_converted():
    g = analyze_part_file("plate.dxf", dxf_bytes(units=1))
    assert g["width_mm"] == pytest.approx(2540.0) and g["drawing_units"] == "in"


def test_dxf_without_units_says_so():
    g = analyze_part_file("plate.dxf", dxf_bytes(units=0))
    assert g["units_assumed"] and "millimetres were assumed" in describe_geometry("plate.dxf", g)


@pytest.mark.parametrize("ascii_", [False, True])
def test_stl_volume_area_and_size(ascii_):
    g = analyze_stl(cube_stl(10.0, ascii_))
    assert g["volume_cm3"] == pytest.approx(1.0)
    assert g["surface_area_cm2"] == pytest.approx(6.0)
    assert (g["size_x_mm"], g["size_y_mm"], g["size_z_mm"]) == (10.0, 10.0, 10.0)


def test_bad_part_files_are_rejected():
    for name, data in [("part.step", b"x"), ("part.dxf", b"not a dxf"), ("part.stl", b"garbage"), ("part.stl", b""), ("part.dxf", b"0" * (10 * 1024 * 1024 + 1))]:
        with pytest.raises(GeometryError):
            analyze_part_file(name, data)


def test_email_attachment_part_files_are_measured():
    text = attachments_to_text([("bracket.dxf", dxf_bytes()), ("block.stl", cube_stl())])
    assert "Part geometry (measured from bracket.dxf)" in text and "Volume: 1.000 cm3" in text


# ------------------------------------------------------------------ customers
QUOTES = [
    {"id": "q1", "lead_id": "l1", "customer_email": "Bo@Acme.com", "customer_name": "Bo", "status": "dispatched", "outcome": "accepted",
     "total_cost": 1000, "sent_at": "2026-09-01T00:00:00+00:00", "quote_number": "Q-1",
     "itemized_breakdown": [{"description": "Steel bracket", "quantity": 100, "unit_price": 4.0}]},
    {"id": "q2", "lead_id": "l2", "customer_email": "bo@acme.com", "customer_name": "Bo Buyer", "customer_company": "Acme", "status": "dispatched",
     "outcome": "declined", "total_cost": 600, "sent_at": "2026-10-01T00:00:00+00:00", "quote_number": "Q-2",
     "itemized_breakdown": [{"description": "steel  bracket", "quantity": 100, "unit_price": 4.5}, {"description": "Coating", "quantity": 1, "unit_price": 0}]},
    {"id": "q3", "lead_id": "l3", "customer_email": "bo@acme.com", "status": "draft", "total_cost": 50, "created_at": "2026-11-01T00:00:00+00:00",
     "itemized_breakdown": [{"description": "Steel bracket", "quantity": 10, "unit_price": 5.0}]},
    {"id": "q4", "lead_id": "l4", "customer_name": "Walk In", "status": "dispatched", "outcome": None, "total_cost": 70, "sent_at": "2026-08-01T00:00:00+00:00"},
    {"id": "q5", "lead_id": "l5", "customer_name": "Customer", "status": "dispatched", "total_cost": 5, "sent_at": "2026-08-01T00:00:00+00:00"},
]


def test_directory_groups_by_email_and_totals():
    directory = build_customer_directory(QUOTES)
    assert [c["key"] for c in directory] == ["bo@acme.com", "name:walk in"]
    bo = directory[0]
    assert (bo["quotes"], bo["sent"], bo["won"], bo["lost"], bo["open"]) == (3, 2, 1, 1, 0)
    assert bo["quoted_value"] == 1600 and bo["won_value"] == 1000 and bo["win_rate"] == 50.0
    assert bo["name"] == "Bo Buyer" and bo["company"] == "Acme"
    assert directory[1]["open"] == 1 and directory[1]["win_rate"] is None


def test_history_tracks_prices_the_customer_saw():
    h = build_customer_history(QUOTES, "bo@acme.com")
    assert [q["quote_number"] for q in h["quotes"]] == [None, "Q-2", "Q-1"]
    bracket = h["price_history"][0]
    assert bracket["description"].lower() == "steel bracket"
    assert [p["unit_price"] for p in bracket["prices"]] == [4.5, 4.0]  # draft's 5.0 and the unpriced line are excluded
    assert len(h["price_history"]) == 1
    assert build_customer_history(QUOTES, "nobody@x.com") is None


@pytest.fixture
def client(monkeypatch):
    db = FakeSupabase()
    for module in (customers_api, leads_api, mail_oauth, tenancy):
        monkeypatch.setattr(module, "supabase", db)
    db.tables["quotes"] = [{**q, "company_id": "c1"} for q in QUOTES] + [
        {"id": "x", "company_id": "c2", "customer_email": "secret@other.com", "status": "dispatched", "total_cost": 9, "sent_at": "2026-01-01"}]
    db.tables["leads"] = [{"id": "l1", "company_id": "c1", "status": "pending", "raw_text": "Need 50 plates, 3 mm mild steel"},
                          {"id": "l9", "company_id": "c2", "status": "pending", "raw_text": "other"}]
    db.tables["users"] = [{"id": "u1", "company_id": "c1"}]
    app.dependency_overrides[get_current_user] = lambda: USER
    yield TestClient(app), db
    app.dependency_overrides.clear()


def test_customer_api_is_company_scoped(client):
    c, _ = client
    listing = c.get("/api/customers").json()
    assert {x["key"] for x in listing} == {"bo@acme.com", "name:walk in"}
    assert c.get("/api/customers/history", params={"key": "BO@acme.com"}).json()["customer"]["sent"] == 2
    assert c.get("/api/customers/history", params={"key": "secret@other.com"}).status_code == 404


def test_part_file_upload_appends_measurements(client):
    c, db = client
    res = c.post("/api/leads/l1/part-file", files={"file": ("plate.dxf", dxf_bytes(), "application/dxf")})
    assert res.status_code == 200, res.text
    assert res.json()["geometry"]["contours"] == 3
    text = db.tables["leads"][0]["raw_text"]
    assert text.startswith("Need 50 plates") and "Part geometry (measured from plate.dxf)" in text
    assert c.post("/api/leads/l1/part-file", files={"file": ("x.step", b"abc", "x")}).status_code == 400
    assert c.post("/api/leads/l9/part-file", files={"file": ("plate.dxf", dxf_bytes(), "x")}).status_code == 404


# ------------------------------------------------------------------ mailbox sign-in
@pytest.fixture
def google(monkeypatch):
    monkeypatch.setattr(mail_oauth.settings, "GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setattr(mail_oauth.settings, "GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
    monkeypatch.setattr(mail_oauth.settings, "PUBLIC_BACKEND_URL", "https://api.example.com")


def test_oauth_unconfigured_provider_is_refused(client):
    c, _ = client
    status = c.get("/api/oauth/status").json()
    assert status["providers"]["google"]["configured"] is False and status["connection"] is None
    assert c.get("/api/oauth/google/start").status_code == 503
    assert c.get("/api/oauth/yahoo/start").status_code == 404


def test_oauth_full_flow_stores_encrypted_token_and_is_used(client, google, monkeypatch):
    c, db = client
    url = c.get("/api/oauth/google/start").json()["url"]
    query = parse_qs(urlparse(url).query)
    assert url.startswith("https://accounts.google.com/") and query["client_id"] == ["cid"]
    assert query["redirect_uri"] == ["https://api.example.com/api/oauth/google/callback"]
    assert query["access_type"] == ["offline"] and "https://mail.google.com/" in query["scope"][0]
    state = query["state"][0]

    calls = []

    def fake_token_request(provider, data):
        calls.append(data["grant_type"])
        if data["grant_type"] == "authorization_code":
            assert data["code"] == "the-code"
            from jose import jwt
            return {"access_token": "at-1", "refresh_token": "rt-secret", "expires_in": 3600,
                    "id_token": jwt.encode({"email": "Sales@Seller.com"}, "k", algorithm="HS256")}
        assert data["refresh_token"] == "rt-secret"
        return {"access_token": "at-2", "expires_in": 3600}

    monkeypatch.setattr(mail_oauth, "_token_request", fake_token_request)
    monkeypatch.setattr(oauth_api, "_load_profile_fields", lambda uid: {"company_id": "c1", "role": "user"})

    res = c.get("/api/oauth/google/callback", params={"code": "the-code", "state": state}, follow_redirects=False)
    assert res.status_code == 303 and res.headers["location"] == "https://app.example.com/profile?mail=connected"
    row = db.tables["mail_connections"][0]
    assert row["email"] == "sales@seller.com" and row["user_id"] == "u1" and row["company_id"] == "c1"
    assert "rt-secret" not in row["encrypted_refresh_token"]

    assert c.get("/api/oauth/status").json()["connection"] == {"provider": "google", "email": "sales@seller.com"}

    from app.core import credentials
    email, secret = credentials.get_gmail_credentials("u1")
    assert email == "sales@seller.com" and secret == "at-2" and isinstance(secret, mail_oauth.OAuthToken) and secret.provider == "google"
    credentials.get_gmail_credentials("u1")
    assert calls == ["authorization_code", "refresh_token"]  # second lookup used the cached access token

    assert c.delete("/api/oauth/connection").json()["removed"] == 1
    assert db.tables["mail_connections"] == []


def test_oauth_callback_rejects_forged_or_mismatched_state(client, google, monkeypatch):
    c, db = client
    monkeypatch.setattr(mail_oauth, "_token_request", lambda *a, **k: pytest.fail("must not exchange a code for a bad state"))
    microsoft_state = mail_oauth.make_state("u1", "microsoft")
    for state in ("forged", microsoft_state):
        res = c.get("/api/oauth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
        assert res.headers["location"].endswith("mail=error")
    res = c.get("/api/oauth/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert res.headers["location"].endswith("mail=cancelled")
    assert "mail_connections" not in db.tables or db.tables["mail_connections"] == []


def test_xoauth2_string():
    import base64
    assert base64.b64decode(mail_oauth.xoauth2_string("a@b.com", "tok")) == b"user=a@b.com\x01auth=Bearer tok\x01\x01"
