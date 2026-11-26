"""Admin console: billing and suspension, overview, own account, and admin safeguards."""
import importlib
import types
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.core import plans, security, tenancy
from app.api import admin as admin_api, users as users_api, leads as leads_api
from tests.fake_supabase import FakeSupabase

ADMIN_ID = "admin"


def auth(uid, email):
    return {"Authorization": "Bearer " + jwt.encode({"sub": uid, "email": email}, "test-secret", algorithm="HS256")}


@pytest.fixture
def env(monkeypatch):
    real = importlib.reload(plans)
    db = FakeSupabase()
    updates = []
    db.auth = types.SimpleNamespace(admin=types.SimpleNamespace(
        update_user_by_id=lambda uid, attrs: updates.append((uid, attrs)),
        delete_user=lambda uid: None))
    for module in (admin_api, users_api, leads_api, tenancy, security, real):
        monkeypatch.setattr(module, "supabase", db)
    monkeypatch.setattr(admin_api, "plans", real)
    soon = (date.today() + timedelta(days=3)).isoformat()
    late = (date.today() - timedelta(days=2)).isoformat()
    db.tables["companies"] = [
        {"id": security.DEFAULT_COMPANY_ID, "name": "Default Company"},
        {"id": "acme", "name": "Acme", "plan": "growth", "status": "active", "next_invoice_date": soon, "setup_fee_paid": True},
        {"id": "beta", "name": "Beta", "plan": "starter", "status": "active", "next_invoice_date": late},
    ]
    db.tables["users"] = [
        {"id": ADMIN_ID, "email": "axrflows@gmail.com", "role": "admin", "company_id": security.DEFAULT_COMPANY_ID, "access_approved": True},
        {"id": "a1", "email": "ann@acme.com", "role": "user", "company_id": "acme", "access_approved": True},
        {"id": "b1", "email": "bob@beta.com", "role": "user", "company_id": "beta", "access_approved": True},
    ]
    for t in ("leads", "quotes", "knowledge_base", "mail_connections"):
        db.tables[t] = []
    yield TestClient(app), db, updates
    app.dependency_overrides.clear()


def test_suspending_a_company_locks_its_users_out(env):
    client, db, _ = env
    admin_h = auth(ADMIN_ID, "axrflows@gmail.com")
    assert client.get("/api/leads", headers=auth("b1", "bob@beta.com")).status_code == 200
    res = client.put("/api/admin/companies/beta/billing", json={"status": "suspended", "billing_notes": "Invoice 12 unpaid"}, headers=admin_h)
    assert res.status_code == 200
    blocked = client.get("/api/leads", headers=auth("b1", "bob@beta.com"))
    assert blocked.status_code == 403 and blocked.json()["detail"].startswith("WORKSPACE_SUSPENDED")
    profile = client.get("/api/users/profile", headers=auth("b1", "bob@beta.com")).json()
    assert profile["workspace_suspended"] is True
    assert client.get("/api/leads", headers=auth("a1", "ann@acme.com")).status_code == 200  # other companies unaffected
    assert client.get("/api/admin/overview", headers=admin_h).status_code == 200  # admin never locked out


def test_billing_validation(env):
    client, _, _ = env
    h = auth(ADMIN_ID, "axrflows@gmail.com")
    assert client.put("/api/admin/companies/acme/billing", json={"next_invoice_date": "next week"}, headers=h).status_code == 400
    assert client.put("/api/admin/companies/acme/billing", json={"status": "gone"}, headers=h).status_code == 422
    assert client.put(f"/api/admin/companies/{security.DEFAULT_COMPANY_ID}/billing", json={}, headers=h).status_code in (400, 404)


def test_overview_summarises_the_business(env):
    client, _, _ = env
    o = client.get("/api/admin/overview", headers=auth(ADMIN_ID, "axrflows@gmail.com")).json()
    assert o["companies"]["active"] == 2 and o["companies"]["by_plan"]["growth"] == 1
    assert o["estimated_mrr"] == 99 + 59
    assert [d["name"] for d in o["invoices_due"]] == ["Acme"]
    assert [d["name"] for d in o["invoices_overdue"]] == ["Beta"]
    assert [d["name"] for d in o["setup_fees_unpaid"]] == ["Beta"]
    assert o["users"]["total"] == 2


def test_admin_safeguards(env):
    client, db, _ = env
    h = auth(ADMIN_ID, "axrflows@gmail.com")
    assert client.put(f"/api/admin/users/{ADMIN_ID}", json={"role": "user", "company_id": "acme"}, headers=h).status_code == 400
    assert client.delete(f"/api/admin/users/{ADMIN_ID}", headers=h).status_code == 400
    assert client.put("/api/admin/users/a1", json={"role": "admin", "company_id": "acme"}, headers=h).status_code == 400
    # Promoting takes the user out of their company.
    assert client.put("/api/admin/users/a1", json={"role": "admin"}, headers=h).status_code == 200
    assert next(u for u in db.tables["users"] if u["id"] == "a1")["company_id"] == security.DEFAULT_COMPANY_ID


def test_admin_account_change_needs_current_password(env, monkeypatch):
    client, db, updates = env
    h = auth(ADMIN_ID, "axrflows@gmail.com")

    class Verifier:
        def __init__(self, ok): self.auth = types.SimpleNamespace(sign_in_with_password=lambda c: (
            types.SimpleNamespace(user=types.SimpleNamespace(id=ADMIN_ID)) if ok(c) else (_ for _ in ()).throw(Exception("bad"))))

    monkeypatch.setattr(admin_api, "create_client", lambda *a: Verifier(lambda c: c["password"] == "right-password"))
    assert client.put("/api/admin/account", json={"current_password": "wrong", "new_password": "a-very-long-password"}, headers=h).status_code == 400
    assert client.put("/api/admin/account", json={"current_password": "right-password", "new_password": "short"}, headers=h).status_code == 400
    assert client.put("/api/admin/account", json={"current_password": "right-password", "new_email": "ann@acme.com"}, headers=h).status_code == 409
    res = client.put("/api/admin/account", json={"current_password": "right-password", "new_password": "a-very-long-password"}, headers=h)
    assert res.status_code == 200 and updates[-1] == (ADMIN_ID, {"password": "a-very-long-password"})
    assert client.get("/api/admin/account", headers=h).json()["email"] == "axrflows@gmail.com"


def test_admin_is_never_given_a_customer_workspace(env):
    client, db, _ = env
    res = client.get("/api/users/team", headers=auth(ADMIN_ID, "axrflows@gmail.com"))
    assert res.status_code == 403
    assert next(u for u in db.tables["users"] if u["id"] == ADMIN_ID)["company_id"] == security.DEFAULT_COMPANY_ID
    assert len(db.tables["companies"]) == 3  # nothing provisioned
