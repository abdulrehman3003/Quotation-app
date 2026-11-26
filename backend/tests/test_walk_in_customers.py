"""Customers added by hand: walk-ins and phone enquiries that were quoted offline."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import get_current_user
from app.api import customers as customers_api, quotes as quotes_api
from app.schemas.pydantic_models import QuoteEngineOutput
from tests.fake_supabase import FakeSupabase

USER = {"id": "u1", "email": "me@shop.com", "company_id": "c1", "role": "user"}


@pytest.fixture
def client(monkeypatch):
    db = FakeSupabase()
    for module in (customers_api, quotes_api):
        monkeypatch.setattr(module, "supabase", db)
    db.tables.update({"quotes": [], "leads": [], "customers": [], "knowledge_base": [],
                      "users": [{"id": "u1", "company_id": "c1"}]})
    app.dependency_overrides[get_current_user] = lambda: USER
    yield TestClient(app), db
    app.dependency_overrides.clear()


def test_walk_in_appears_in_directory_before_any_quote(client):
    api, db = client
    res = api.post("/api/customers", json={"name": "  Omar  Haddad ", "company": "Gulf Glass", "phone": "+971 50 123 4567"})
    assert res.status_code == 201 and res.json()["lead"] is None
    assert db.tables["customers"][0]["company_id"] == "c1"

    directory = api.get("/api/customers").json()
    assert len(directory) == 1
    omar = directory[0]
    assert omar["name"] == "Omar Haddad" and omar["company"] == "Gulf Glass" and omar["quotes"] == 0
    assert omar["id"] == db.tables["customers"][0]["id"]

    history = api.get("/api/customers/history", params={"key": omar["key"]}).json()
    assert history["quotes"] == [] and history["customer"]["phone"] == "+971 50 123 4567"


def test_request_creates_a_walk_in_lead_with_contact_details(client):
    api, db = client
    res = api.post("/api/customers", json={"name": "Omar", "email": "Omar@GulfGlass.ae", "request": "12 x 6 mm clear glass panels 1200x800"})
    lead = res.json()["lead"]
    assert lead["source"] == "walk-in" and lead["customer_id"] == res.json()["customer"]["id"]
    assert "Customer name: Omar" in lead["raw_text"] and "omar@gulfglass.ae" in lead["raw_text"]
    assert lead["raw_text"].endswith("12 x 6 mm clear glass panels 1200x800")


def test_same_email_updates_instead_of_duplicating(client):
    api, db = client
    api.post("/api/customers", json={"name": "Omar", "email": "omar@gulfglass.ae"})
    res = api.post("/api/customers", json={"name": "Omar Haddad", "email": "OMAR@gulfglass.ae", "phone": "050 1"})
    assert res.json()["updated"] is True
    assert len(db.tables["customers"]) == 1 and db.tables["customers"][0]["phone"] == "050 1"


def test_saved_customer_merges_with_their_quotes(client):
    api, db = client
    db.tables["quotes"] = [{"id": "q1", "company_id": "c1", "customer_email": "omar@gulfglass.ae", "customer_name": "Omar",
                            "status": "dispatched", "outcome": "accepted", "total_cost": 500, "sent_at": "2026-11-01"}]
    api.post("/api/customers", json={"name": "Omar", "email": "omar@gulfglass.ae", "company": "Gulf Glass"})
    directory = api.get("/api/customers").json()
    assert len(directory) == 1 and directory[0]["won"] == 1 and directory[0]["company"] == "Gulf Glass"


def test_bad_input_and_other_companies_are_refused(client):
    api, db = client
    assert api.post("/api/customers", json={"name": "Omar", "email": "not-an-email"}).status_code == 400
    assert api.post("/api/customers", json={"name": "   "}).status_code == 400
    db.tables["customers"].append({"id": "theirs", "company_id": "c2", "name": "Secret"})
    assert api.post("/api/customers/theirs/requests", json={"request": "x"}).status_code == 404
    assert api.delete("/api/customers/theirs").status_code == 404
    assert all(c["name"] != "Secret" for c in api.get("/api/customers").json())


def test_quote_for_saved_customer_keeps_typed_details(client, monkeypatch):
    api, db = client
    res = api.post("/api/customers", json={"name": "Omar Haddad", "email": "omar@gulfglass.ae", "phone": "+971501234567",
                                           "company": "Gulf Glass", "request": "10 glass panels"})
    lead = res.json()["lead"]

    def fake_engine(*_a, **_k):
        return QuoteEngineOutput(material_cost=0, labor_cost=0, total_cost=0, itemized_breakdown=[], email_draft="Hi",
                                 customer_name="Mr Omar", customer_email=None, customer_phone=None, customer_company=None)

    monkeypatch.setattr(quotes_api, "run_quote_engine", fake_engine)
    quotes_api.create_draft_for_lead(lead, "u1", "c1")
    quote = db.tables["quotes"][0]
    assert quote["customer_name"] == "Omar Haddad" and quote["customer_email"] == "omar@gulfglass.ae"
    assert quote["customer_phone"] == "+971501234567" and quote["customer_company"] == "Gulf Glass"
