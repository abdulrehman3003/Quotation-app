"""Hardening checks: KB storage paths, API docs hidden in production."""
import importlib

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.core import security


def auth(uid):
    return {"Authorization": "Bearer " + jwt.encode({"sub": uid, "email": f"{uid}@x.com"}, "test-secret", algorithm="HS256")}


@pytest.fixture
def client(monkeypatch):
    user = {"id": "u1", "email": "u1@x.com", "company_id": "c1", "role": "user", "access_approved": True, "workspace_suspended": False}
    monkeypatch.setattr(security, "resolve_user_from_token", lambda *a, **k: user)
    app.dependency_overrides[security.get_current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["u2/prices.csv", "u1/../u2/prices.csv", "u1/..%2Fu2/x.csv", "u1\\..\\u2\\x.csv"])
def test_kb_processing_refuses_paths_outside_own_folder(client, path):
    res = client.post("/api/kb/process", params={"file_path": path, "filename": "x.csv"}, headers=auth("u1"))
    assert res.status_code == 403


def test_api_docs_hidden_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    import app.main as main_module
    prod = importlib.reload(main_module)
    try:
        c = TestClient(prod.app)
        assert c.get("/docs").status_code == 404
        assert c.get("/openapi.json").status_code == 404
        assert c.get("/health").status_code == 200
    finally:
        monkeypatch.delenv("ENV")
        importlib.reload(main_module)
