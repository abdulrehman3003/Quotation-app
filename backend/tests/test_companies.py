"""Admin company management and cross-company mailbox / WhatsApp number clash checks."""
import types

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core import security, tenancy
from app.core.encryption import encrypt_key
from app.core.security import get_current_user
from app.api import admin as admin_api, users as users_api, oauth as oauth_api
from app.services import mail_oauth
from tests.fake_supabase import FakeSupabase

ADMIN = {"id": "admin", "email": "boss@platform.com", "company_id": security.DEFAULT_COMPANY_ID, "role": "admin"}


class FakeAuthAdmin:
    def __init__(self):
        self.created = []

    def create_user(self, attrs):
        email = attrs["email"] if isinstance(attrs, dict) else attrs.email
        uid = f"new-{len(self.created) + 1}"
        self.created.append(email)
        return types.SimpleNamespace(user=types.SimpleNamespace(id=uid, email=email))

    def update_user_by_id(self, uid, attrs):
        pass


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    db.auth = types.SimpleNamespace(admin=FakeAuthAdmin())
    for module in (admin_api, users_api, tenancy, security, mail_oauth):
        monkeypatch.setattr(module, "supabase", db)
    db.tables["companies"] = [
        {"id": security.DEFAULT_COMPANY_ID, "name": "Default Company", "created_at": "2026-01-01"},
        {"id": "acme", "name": "Acme Fabrication", "created_at": "2026-01-02"},
        {"id": "beta", "name": "Beta Steel", "created_at": "2026-01-03"},
        {"id": "solo", "name": "Sam's Workspace", "created_at": "2026-01-04"},
    ]
    db.tables["users"] = [
        {"id": "admin", "email": "boss@platform.com", "role": "admin", "company_id": security.DEFAULT_COMPANY_ID},
        {"id": "a1", "email": "ann@acme.com", "role": "user", "company_id": "acme",
         "encrypted_gmail_email": encrypt_key("sales@acme.com"),
         "encrypted_twilio_phone": encrypt_key("whatsapp:+15550001111")},
        {"id": "b1", "email": "bob@beta.com", "role": "user", "company_id": "beta"},
        {"id": "s1", "email": "sam@solo.com", "role": "user", "company_id": "solo"},
    ]
    db.tables["leads"] = [{"id": "l-s1", "user_id": "s1", "company_id": "solo"},
                          {"id": "l-a1", "user_id": "a1", "company_id": "acme"}]
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    yield TestClient(app), db
    app.dependency_overrides.clear()


def user(db, uid):
    return next(u for u in db.tables["users"] if u["id"] == uid)


def test_company_crud_and_duplicate_names(env):
    c, db = env
    listing = c.get("/api/admin/companies").json()
    assert [x["name"] for x in listing] == ["Acme Fabrication", "Beta Steel", "Sam's Workspace"]  # default hidden
    assert next(x for x in listing if x["id"] == "acme")["member_count"] == 1

    assert c.post("/api/admin/companies", json={"name": "  acme fabrication "}).status_code == 409
    created = c.post("/api/admin/companies", json={"name": "Gamma Metals"})
    assert created.status_code == 201
    gid = created.json()["id"]

    assert c.put(f"/api/admin/companies/{gid}", json={"name": "Beta Steel"}).status_code == 409
    assert c.put(f"/api/admin/companies/{gid}", json={"name": "Gamma Metal Works"}).status_code == 200

    assert c.delete("/api/admin/companies/acme").status_code == 409  # still has users
    assert c.delete(f"/api/admin/companies/{gid}").status_code == 200
    assert c.delete(f"/api/admin/companies/{security.DEFAULT_COMPANY_ID}").status_code == 404


def test_create_user_in_existing_or_new_company(env):
    c, db = env
    res = c.post("/api/admin/users", json={"email": "Cat@Acme.com", "password": "longenough", "company_id": "acme"})
    assert res.status_code == 201, res.text
    assert res.json()["company_id"] == "acme"
    assert user(db, res.json()["user_id"])["company_id"] == "acme"

    res = c.post("/api/admin/users", json={"email": "dan@delta.com", "password": "longenough", "new_company_name": "Delta Works"})
    assert res.status_code == 201, res.text
    new_cid = res.json()["company_id"]
    assert next(x for x in db.tables["companies"] if x["id"] == new_cid)["name"] == "Delta Works"

    # Unknown company or a name that already exists: refused before an auth user is created.
    before = len(db.auth.admin.created)
    assert c.post("/api/admin/users", json={"email": "e@x.com", "password": "longenough", "company_id": "nope"}).status_code == 404
    assert c.post("/api/admin/users", json={"email": "e@x.com", "password": "longenough", "new_company_name": "beta steel"}).status_code == 409
    assert len(db.auth.admin.created) == before


def test_users_list_shows_company(env):
    c, db = env
    db.auth.admin.list_users = lambda: [types.SimpleNamespace(id="a1", email="ann@acme.com", created_at=None, last_sign_in_at=None)]
    row = c.get("/api/admin/users").json()[0]
    assert (row["company_id"], row["company_name"]) == ("acme", "Acme Fabrication")


def test_mailbox_and_number_cannot_be_shared_across_companies(env):
    c, db = env
    clash = c.put("/api/admin/users/b1", json={"gmail_email": " Sales@ACME.com "})
    assert clash.status_code == 409 and "Acme Fabrication" in clash.json()["detail"]
    clash = c.put("/api/admin/users/b1", json={"twilio_phone": "+1 555 000 1111"})
    assert clash.status_code == 409 and "WhatsApp number" in clash.json()["detail"]
    assert "encrypted_gmail_email" not in user(db, "b1")  # nothing written

    # The same company may share them.
    db.tables["users"].append({"id": "a2", "email": "al@acme.com", "role": "user", "company_id": "acme"})
    assert c.put("/api/admin/users/a2", json={"gmail_email": "sales@acme.com"}).status_code == 200
    # A different mailbox is fine for Beta.
    assert c.put("/api/admin/users/b1", json={"gmail_email": "sales@beta.com"}).status_code == 200


def test_oauth_connected_mailbox_counts_as_taken(env):
    c, db = env
    db.tables["mail_connections"] = [{"id": "m1", "user_id": "a1", "company_id": "acme", "email": "ops@acme.com"}]
    assert c.put("/api/admin/users/b1", json={"gmail_email": "ops@acme.com"}).status_code == 409
    assert tenancy.find_credential_clash("b1", "beta", gmail_email="ops@acme.com")
    assert tenancy.find_credential_clash("a2", "acme", gmail_email="ops@acme.com") is None


def test_move_user_between_companies(env):
    c, db = env
    # Sam was alone in a personal workspace: his records follow him.
    assert c.put("/api/admin/users/s1", json={"company_id": "beta"}).status_code == 200
    assert user(db, "s1")["company_id"] == "beta"
    assert user(db, "s1")["default_quote_parameters"]["company_name"] == "Beta Steel"
    assert next(l for l in db.tables["leads"] if l["id"] == "l-s1")["company_id"] == "beta"

    # Ann shares Acme with a teammate: her records stay with Acme.
    db.tables["users"].append({"id": "a2", "email": "al@acme.com", "role": "user", "company_id": "acme"})
    db.tables["users"] = [u for u in db.tables["users"] if u["id"] != "a1"] + [
        {**user(db, "a1"), "encrypted_gmail_email": None, "encrypted_twilio_phone": None}]
    assert c.put("/api/admin/users/a1", json={"company_id": "beta"}).status_code == 200
    assert next(l for l in db.tables["leads"] if l["id"] == "l-a1")["company_id"] == "acme"


def test_move_refused_when_users_mailbox_belongs_to_a_third_company(env):
    c, db = env
    db.tables["users"].append({"id": "a2", "email": "al@acme.com", "role": "user", "company_id": "acme"})
    # Ann's saved mailbox is also Al's (Acme). Moving Ann to Beta would split one mailbox across two companies.
    user(db, "a2")["encrypted_gmail_email"] = encrypt_key("sales@acme.com")
    res = c.put("/api/admin/users/a1", json={"company_id": "beta"})
    assert res.status_code == 409
    assert user(db, "a1")["company_id"] == "acme"
    assert c.put("/api/admin/users/a1", json={"company_id": "missing"}).status_code == 404


def test_self_service_profile_and_oauth_are_checked(env, monkeypatch):
    c, db = env
    app.dependency_overrides[get_current_user] = lambda: {"id": "b1", "email": "bob@beta.com", "company_id": "beta", "role": "user"}
    res = c.put("/api/users/profile", json={"gmail_email": "sales@acme.com"})
    assert res.status_code == 409, res.text

    monkeypatch.setattr(oauth_api, "_load_profile_fields", lambda uid: {"company_id": "beta", "role": "user"})
    monkeypatch.setattr(mail_oauth, "PROVIDERS", {"google": {}})
    monkeypatch.setattr(mail_oauth, "provider_configured", lambda p: True)
    monkeypatch.setattr(mail_oauth, "read_state", lambda state, p: "b1")
    monkeypatch.setattr(mail_oauth, "exchange_code", lambda p, code, base: {"email": "sales@acme.com", "refresh_token": "r"})
    stored = []
    monkeypatch.setattr(mail_oauth, "store_connection", lambda *a: stored.append(a))
    monkeypatch.setattr(oauth_api.settings, "FRONTEND_URL", None)
    res = c.get("/api/oauth/google/callback", params={"code": "x", "state": "y"})
    assert res.json() == {"status": "in_use"} and stored == []


def test_onboarding_can_skip_all_integrations(env):
    c, db = env
    app.dependency_overrides[get_current_user] = lambda: {"id": "b1", "email": "bob@beta.com", "company_id": "beta", "role": "user"}
    res = c.post("/api/users/onboarding", json={"name": "Bob", "company_name": "Beta Steel"})
    assert res.status_code == 200, res.text
    assert not user(db, "b1").get("encrypted_gmail_email")


def test_mail_sign_in_returns_to_the_page_it_started_from(monkeypatch):
    state = mail_oauth.make_state("u1", "google", "onboarding")
    assert mail_oauth.read_state(state, "google") == "u1"
    assert mail_oauth.state_return_page(state) == "onboarding"
    assert mail_oauth.state_return_page(mail_oauth.make_state("u1", "google", "https://evil.example")) == "profile"
    assert mail_oauth.state_return_page("garbage") == "profile"

    monkeypatch.setattr(mail_oauth, "PROVIDERS", {"google": {}})
    monkeypatch.setattr(mail_oauth, "provider_configured", lambda p: True)
    monkeypatch.setattr(oauth_api.settings, "FRONTEND_URL", "https://app.example.com")
    res = TestClient(app).get("/api/oauth/google/callback", params={"error": "access_denied", "state": state}, follow_redirects=False)
    assert res.headers["location"] == "https://app.example.com/onboarding?mail=cancelled"
