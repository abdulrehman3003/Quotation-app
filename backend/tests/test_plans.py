"""Plan limits: users per company and AI-drafted quotes per month."""
import types
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core import plans, security, tenancy
from app.core.security import get_current_user
from app.api import admin as admin_api, users as users_api, quotes as quotes_api
from tests.fake_supabase import FakeSupabase

ADMIN = {"id": "admin", "email": "boss@platform.com", "company_id": security.DEFAULT_COMPANY_ID, "role": "admin"}


@pytest.fixture
def env(monkeypatch):
    import importlib
    real = importlib.reload(plans)  # undo the conftest "no limits" default for this module's tests
    db = FakeSupabase()
    db.auth = types.SimpleNamespace(admin=types.SimpleNamespace(
        create_user=lambda attrs: types.SimpleNamespace(user=types.SimpleNamespace(id="new-1", email=getattr(attrs, "email", None) or attrs["email"])),
        update_user_by_id=lambda *a: None))
    for module in (admin_api, users_api, tenancy, security, real, quotes_api):
        monkeypatch.setattr(module, "supabase", db)
    monkeypatch.setattr(admin_api, "plans", real)
    now = datetime.now(timezone.utc).isoformat()
    db.tables["companies"] = [
        {"id": "small", "name": "Small Shop", "plan": "starter", "max_users": None, "max_quotes_per_month": None},
        {"id": "big", "name": "Big Works", "plan": "scale", "max_users": None, "max_quotes_per_month": None},
        {"id": "custom", "name": "Custom Co", "plan": "starter", "max_users": 3, "max_quotes_per_month": 1},
    ]
    db.tables["users"] = [
        {"id": "admin", "email": "boss@platform.com", "role": "admin", "company_id": security.DEFAULT_COMPANY_ID},
        {"id": "s1", "email": "a@small.com", "role": "user", "company_id": "small"},
        {"id": "s2", "email": "b@small.com", "role": "user", "company_id": "small"},
        {"id": "loner", "email": "c@else.com", "role": "user", "company_id": "solo"},
    ]
    db.tables["quotes"] = [{"id": "q1", "company_id": "custom", "created_at": now},
                           {"id": "old", "company_id": "small", "created_at": "2020-01-01T00:00:00+00:00"}]
    db.tables["leads"] = []
    db.tables["knowledge_base"] = []
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    yield TestClient(app), db, real
    app.dependency_overrides.clear()


def test_effective_limits_and_custom_overrides(env):
    _, _, p = env
    assert p.company_plan("small")["max_users"] == 2
    assert p.company_plan("big")["max_users"] is None
    custom = p.company_plan("custom")
    assert custom["max_users"] == 3 and custom["max_quotes_per_month"] == 1 and custom["custom_limits"]
    assert p.company_plan(security.DEFAULT_COMPANY_ID)["max_users"] is None


def test_admin_cannot_add_or_move_users_past_the_limit(env):
    client, db, _ = env
    res = client.post("/api/admin/users", json={"email": "new@small.com", "password": "password123", "company_id": "small"})
    assert res.status_code == 403 and "Starter plan allows 2 users" in res.json()["detail"]
    res = client.put("/api/admin/users/loner", json={"company_id": "small"})
    assert res.status_code == 403
    # Upgrading the plan opens the seat.
    assert client.put("/api/admin/companies/small/plan", json={"plan": "growth"}).status_code == 200
    db.tables["companies"].append({"id": "solo", "name": "Solo"})
    assert client.put("/api/admin/users/loner", json={"company_id": "small"}).status_code == 200


def test_invite_is_refused_when_full_and_link_is_hidden(env, monkeypatch):
    client, db, _ = env
    member = {"id": "s1", "email": "a@small.com", "company_id": "small", "role": "user"}
    app.dependency_overrides[get_current_user] = lambda: member
    team = client.get("/api/users/team").json()
    assert team["seats_full"] is True and team["invite_token"] is None
    assert team["plan"]["users"] == 2 and team["plan"]["max_users"] == 2

    token = users_api._create_invite_token("small", "Small Shop", "s1", "A")
    joiner = {"id": "loner", "email": "c@else.com", "company_id": "solo", "role": "user"}
    app.dependency_overrides[security.get_signed_in_user] = lambda: joiner
    res = client.post("/api/users/team/accept-invite", json={"invite_token": token})
    assert res.status_code == 403
    assert next(u for u in db.tables["users"] if u["id"] == "loner")["company_id"] == "solo"


def test_monthly_quote_allowance(env):
    _, db, p = env
    with pytest.raises(Exception) as err:
        quotes_api.create_draft_for_lead({"id": "l1", "raw_text": "x"}, "u", "custom")
    assert "used all 1 AI-drafted quotes" in str(err.value.detail)
    p.assert_quote_allowance("small")  # last month's quote doesn't count


def test_plan_endpoint_validates_and_reports_over_limit(env):
    client, _, _ = env
    assert client.put("/api/admin/companies/small/plan", json={"plan": "gold"}).status_code == 422
    assert client.put("/api/admin/companies/small/plan", json={"plan": "starter", "max_users": 0}).status_code == 400
    res = client.put("/api/admin/companies/small/plan", json={"plan": "starter", "max_users": 1}).json()
    assert res["over_user_limit"] is True and res["users"] == 2
    listing = {c["id"]: c for c in client.get("/api/admin/companies").json()}
    assert listing["small"]["plan_label"] == "Starter" and listing["small"]["max_users"] == 1
    assert listing["custom"]["quotes_this_month"] == 1
