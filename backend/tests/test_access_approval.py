"""Closed sign-up: accounts an admin has not approved can sign in but cannot use the app."""
import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.core import security, tenancy
from app.api import admin as admin_api, users as users_api, leads as leads_api
from tests.fake_supabase import FakeSupabase


def token_for(uid: str, email: str) -> str:
    return jwt.encode({"sub": uid, "email": email, "aud": "authenticated"}, "test-secret", algorithm="HS256")


def auth(uid: str, email: str) -> dict:
    return {"Authorization": f"Bearer {token_for(uid, email)}"}


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    for module in (admin_api, users_api, leads_api, tenancy, security):
        monkeypatch.setattr(module, "supabase", db)
    db.tables["companies"] = [{"id": "acme", "name": "Acme"}, {"id": "spam", "name": "Spam"}]
    db.tables["users"] = [
        {"id": "admin", "email": "boss@platform.com", "role": "admin", "company_id": security.DEFAULT_COMPANY_ID, "access_approved": False},
        {"id": "ok", "email": "ann@acme.com", "role": "user", "company_id": "acme", "access_approved": True},
        {"id": "stranger", "email": "x@spam.com", "role": "user", "company_id": "spam", "access_approved": False},
    ]
    db.tables["leads"] = []
    yield TestClient(app), db
    app.dependency_overrides.clear()


def test_unapproved_account_is_refused_everywhere_but_its_profile(env):
    client, _ = env
    headers = auth("stranger", "x@spam.com")
    res = client.get("/api/leads", headers=headers)
    assert res.status_code == 403
    assert res.json()["detail"].startswith("ACCOUNT_PENDING_APPROVAL")

    profile = client.get("/api/users/profile", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["access_approved"] is False


def test_approved_users_and_admins_get_through(env):
    client, _ = env
    assert client.get("/api/leads", headers=auth("ok", "ann@acme.com")).status_code == 200
    # Admins are never locked out, even if their flag was left false.
    assert client.get("/api/admin/settings", headers=auth("admin", "boss@platform.com")).status_code == 200


def test_admin_can_approve_and_revoke(env):
    client, db = env
    admin_headers = auth("admin", "boss@platform.com")
    res = client.put("/api/admin/users/stranger", json={"access_approved": True}, headers=admin_headers)
    assert res.status_code == 200
    assert next(u for u in db.tables["users"] if u["id"] == "stranger")["access_approved"] is True
    assert client.get("/api/leads", headers=auth("stranger", "x@spam.com")).status_code == 200

    client.put("/api/admin/users/stranger", json={"access_approved": False}, headers=admin_headers)
    assert client.get("/api/leads", headers=auth("stranger", "x@spam.com")).status_code == 403


def test_missing_column_keeps_old_behaviour(monkeypatch, env):
    _, db = env

    def broken_select(*_args, **_kwargs):
        raise Exception("column users.access_approved does not exist")

    class Q:
        def select(self, *a): return self
        def eq(self, *a): return self
        def execute(self): broken_select()

    monkeypatch.setattr(security, "supabase", type("S", (), {"table": lambda self, name: Q()})())
    assert security.is_access_approved("anyone") is True
