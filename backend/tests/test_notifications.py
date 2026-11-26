"""Admin messages to companies: payment reminders and notices."""
import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.core import security
from app.api import notifications as notes_api
from tests.fake_supabase import FakeSupabase

ADMIN = ("admin", "axrflows@gmail.com")


def auth(uid, email):
    return {"Authorization": "Bearer " + jwt.encode({"sub": uid, "email": email}, "test-secret", algorithm="HS256")}


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    for module in (notes_api, security):
        monkeypatch.setattr(module, "supabase", db)
    db.tables["companies"] = [
        {"id": security.DEFAULT_COMPANY_ID, "name": "Default Company"},
        {"id": "acme", "name": "Acme", "status": "active"},
        {"id": "beta", "name": "Beta", "status": "suspended"},
    ]
    db.tables["users"] = [
        {"id": "admin", "email": "axrflows@gmail.com", "role": "admin", "company_id": security.DEFAULT_COMPANY_ID, "access_approved": True},
        {"id": "a1", "email": "ann@acme.com", "role": "user", "company_id": "acme", "access_approved": True},
        {"id": "a2", "email": "al@acme.com", "role": "user", "company_id": "acme", "access_approved": True},
        {"id": "b1", "email": "bob@beta.com", "role": "user", "company_id": "beta", "access_approved": True},
    ]
    db.tables["company_notifications"] = []
    db.tables["notification_reads"] = []
    yield TestClient(app), db


def test_payment_reminder_reaches_the_company_and_tracks_reads(env):
    client, db = env
    res = client.post("/api/admin/notifications", headers=auth(*ADMIN), json={
        "company_ids": ["acme"], "kind": "payment", "title": "Invoice for December", "body": "Growth plan",
        "amount": 99, "due_date": "2026-12-01", "payment_link": "https://link.payoneer.com/abc", "show_banner": True})
    assert res.status_code == 201 and res.json()["sent"] == 1

    mine = client.get("/api/notifications", headers=auth("a1", "ann@acme.com")).json()
    assert len(mine) == 1 and mine[0]["amount"] == 99 and mine[0]["currency"] == "USD" and mine[0]["read"] is False
    assert client.get("/api/notifications", headers=auth("b1", "bob@beta.com")).json() == []  # other company sees nothing

    client.post("/api/notifications/read", headers=auth("a1", "ann@acme.com"), json={"ids": [mine[0]["id"], "not-theirs"]})
    assert client.get("/api/notifications", headers=auth("a1", "ann@acme.com")).json()[0]["read"] is True
    assert client.get("/api/notifications", headers=auth("a2", "al@acme.com")).json()[0]["read"] is False
    sent = client.get("/api/admin/notifications", headers=auth(*ADMIN)).json()["notifications"]
    assert sent[0]["read_count"] == 1 and sent[0]["member_count"] == 2 and sent[0]["company_name"] == "Acme"

    assert client.post(f"/api/admin/notifications/{mine[0]['id']}/resolve", headers=auth(*ADMIN)).status_code == 200
    assert client.get("/api/notifications", headers=auth("a1", "ann@acme.com")).json()[0]["resolved"] is True


def test_suspended_company_can_still_read_what_is_due(env, monkeypatch):
    client, db = env
    from app.core import plans
    monkeypatch.setattr(plans, "is_suspended", lambda cid: cid == "beta")
    client.post("/api/admin/notifications", headers=auth(*ADMIN), json={"company_ids": ["beta"], "kind": "payment", "title": "Overdue", "amount": 59})
    assert client.get("/api/notifications", headers=auth("b1", "bob@beta.com")).json()[0]["title"] == "Overdue"


def test_broadcast_goes_to_active_companies_only(env):
    client, db = env
    res = client.post("/api/admin/notifications", headers=auth(*ADMIN), json={"all_companies": True, "title": "Maintenance on Sunday"})
    assert res.json()["sent"] == 1 and db.tables["company_notifications"][0]["company_id"] == "acme"


def test_validation_and_admin_only(env):
    client, _ = env
    bad = [{"company_ids": ["acme"], "title": "x", "payment_link": "javascript:alert(1)"},
           {"company_ids": ["acme"], "title": "x", "due_date": "soon"},
           {"company_ids": [], "title": "x"},
           {"company_ids": ["acme"], "title": "   "}]
    for body in bad:
        assert client.post("/api/admin/notifications", headers=auth(*ADMIN), json=body).status_code == 400
    assert client.post("/api/admin/notifications", headers=auth(*ADMIN), json={"company_ids": [security.DEFAULT_COMPANY_ID], "title": "x"}).status_code == 404
    assert client.post("/api/admin/notifications", headers=auth("a1", "ann@acme.com"), json={"company_ids": ["acme"], "title": "x"}).status_code == 403
