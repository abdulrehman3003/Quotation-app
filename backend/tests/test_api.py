import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import get_current_user
from app.api import quotes as quotes_api, public as public_api, leads as leads_api, emails as emails_api
from app.core import credentials
from app.schemas.pydantic_models import QuoteEngineOutput
from app.services.ai_engine import finalize_engine_output
from tests.fake_supabase import FakeSupabase

USER = {"id": "u1", "email": "rep@seller.com", "company_id": "c1", "role": "user"}
OTHER = {"id": "u2", "email": "x@other.com", "company_id": "c2", "role": "user"}


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    db.defaults["quotes"] = {"view_count": 0, "outcome": None, "discount_percent": 0, "tax_percent": 0}
    for module in (quotes_api, public_api, leads_api):
        monkeypatch.setattr(module, "supabase", db)
    db.tables["users"] = [{"id": "u1", "email": "rep@seller.com", "name": "Rita Rep", "company_id": "c1",
                           "default_quote_parameters": {"company_name": "Seller Ltd", "currency": "USD", "payment_terms": "Net 30"}}]
    db.tables["leads"] = [{"id": "l1", "company_id": "c1", "user_id": "u1", "source": "email", "status": "pending",
                           "title": "RFQ brackets", "raw_text": "Sender: buyer@acme.com\n\nNeed 100 brackets and powder coating",
                           "created_at": "2026-11-10T10:00:00+00:00"}]
    db.tables["knowledge_base"] = []

    sent_mail = []
    state = {"mailbox": ("rep@seller.com", "app-pw"), "smtp_ok": True, "user": USER}

    def fake_send(to_address, subject, body, custom_user=None, custom_password=None, attachments=None):
        if not state["smtp_ok"]:
            raise HTTPException(status_code=502, detail="Failed to send email")
        sent_mail.append({"to": to_address, "subject": subject, "body": body, "attachments": attachments or []})
        return True

    monkeypatch.setattr(emails_api, "send_smtp_email", fake_send)
    monkeypatch.setattr(credentials, "get_gmail_credentials", lambda user_id=None: state["mailbox"])

    def fake_engine(lead_text, kb, custom_api_key=None, user_profile=None):
        return finalize_engine_output(QuoteEngineOutput(
            material_cost=0, labor_cost=0, total_cost=450,
            itemized_breakdown=[
                {"description": "Steel bracket", "quantity": 100, "unit_price": 4.5, "total_price": 450, "category": "material"},
                {"description": "Powder coating", "quantity": 100, "unit_price": 0, "total_price": 0, "category": "labor", "needs_review": True},
            ],
            email_draft="Dear buyer, here is your quote.", customer_name="Bo Buyer", customer_email="buyer@acme.com",
        ))

    monkeypatch.setattr(quotes_api, "run_quote_engine", fake_engine)
    app.dependency_overrides[get_current_user] = lambda: state["user"]
    yield {"db": db, "client": TestClient(app), "mail": sent_mail, "state": state}
    app.dependency_overrides.clear()


def generate(env):
    res = env["client"].post("/api/quotes/generate", json={"lead_id": "l1"})
    assert res.status_code == 201, res.text
    return res.json()


def test_generate_stores_recipient_number_and_flags(env):
    q = generate(env)
    assert q["quote_number"].startswith("Q-") and q["public_token"]
    assert q["customer_email"] == "buyer@acme.com"
    assert float(q["total_cost"]) == 450
    assert q["itemized_breakdown"][1]["needs_review"] is True
    assert any("Powder coating" in n for n in q["review_notes"])
    assert env["db"].tables["leads"][0]["status"] == "processed"


def test_regenerate_replaces_the_draft(env):
    generate(env); generate(env)
    assert len(env["db"].tables["quotes"]) == 1


def test_send_is_blocked_while_a_line_has_no_price(env):
    q = generate(env)
    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={})
    assert res.status_code == 409 and res.json()["detail"]["code"] == "unpriced_items"
    assert env["mail"] == [] and env["db"].tables["quotes"][0]["status"] == "draft"


def test_edit_reprices_on_server_then_sends_with_link(env):
    q = generate(env)
    items = q["itemized_breakdown"]
    items[1]["unit_price"] = 2
    items[1]["needs_review"] = False  # the editor clears the flag when a person types a price
    items[1]["total_price"] = 123456  # client-supplied totals are ignored
    res = env["client"].put(f"/api/quotes/{q['id']}", json={"itemized_breakdown": items, "discount_percent": 10, "tax_percent": 5})
    assert res.status_code == 200, res.text
    saved = res.json()
    assert float(saved["subtotal"]) == 650
    assert float(saved["total_cost"]) == 614.25
    assert float(saved["material_cost"]) == 450 and float(saved["labor_cost"]) == 200
    assert not any(n.startswith("No price found") for n in saved["review_notes"])

    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={})
    assert res.status_code == 200, res.text
    assert res.json()["delivery"] == "email" and res.json()["sent_to"] == "buyer@acme.com"
    mail = env["mail"][0]
    assert mail["to"] == "buyer@acme.com"
    assert "Seller Ltd" in mail["subject"] and "AxrflowsQuotes" not in mail["subject"]
    assert f"https://app.example.com/q/{q['public_token']}" in mail["body"]
    (filename, content, mime), = mail["attachments"]  # the approved quote goes out with its PDF
    assert filename.endswith(".pdf") and mime == "application/pdf" and content.startswith(b"%PDF")
    row = env["db"].tables["quotes"][0]
    assert row["status"] == "dispatched" and row["sent_at"]
    assert env["db"].tables["leads"][0]["status"] == "dispatched"

    # sent quotes are frozen and cannot be sent twice
    assert env["client"].put(f"/api/quotes/{q['id']}", json={"discount_percent": 50}).status_code == 409
    assert env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={}).status_code == 409
    assert len(env["mail"]) == 1


def test_failed_or_missing_mailbox_never_marks_quote_sent(env):
    q = generate(env)
    env["state"]["smtp_ok"] = False
    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={"confirm_unpriced": True})
    assert res.status_code == 502
    assert env["db"].tables["quotes"][0]["status"] == "draft"

    env["state"]["mailbox"] = (None, None)
    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={"confirm_unpriced": True})
    assert res.status_code == 409 and res.json()["detail"]["code"] == "no_mailbox"
    assert env["db"].tables["quotes"][0]["status"] == "draft"

    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={"confirm_unpriced": True, "mode": "manual"})
    assert res.status_code == 200 and res.json()["delivery"] == "manual"
    assert env["db"].tables["quotes"][0]["status"] == "dispatched"


def send(env):
    q = generate(env)
    assert env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={"confirm_unpriced": True}).status_code == 200
    return q


def test_customer_link_tracks_views_and_accepts_once(env):
    q = send(env)
    url = f"/api/public/quotes/{q['public_token']}"
    assert env["client"].get(url + "?preview=true").status_code == 200
    assert env["db"].tables["quotes"][0]["view_count"] == 0

    view = env["client"].get(url).json()
    assert view["seller"]["company_name"] == "Seller Ltd" and view["total"] == 450 and view["payment_terms"] == "Net 30"
    assert "email_draft" not in view and "review_notes" not in view
    assert env["db"].tables["quotes"][0]["view_count"] == 1 and env["db"].tables["quotes"][0]["first_viewed_at"]

    res = env["client"].post(url + "/respond", json={"decision": "accepted", "comment": "PO 4471"})
    assert res.status_code == 200
    row = env["db"].tables["quotes"][0]
    assert row["outcome"] == "accepted" and row["outcome_source"] == "customer" and row["customer_comment"] == "PO 4471"
    assert env["client"].post(url + "/respond", json={"decision": "declined"}).status_code == 409
    assert env["db"].tables["quotes"][0]["outcome"] == "accepted"


def test_customer_link_rejects_bad_tokens_drafts_and_expired(env):
    assert env["client"].get("/api/public/quotes/short").status_code == 404
    assert env["client"].get("/api/public/quotes/" + "x" * 32).status_code == 404
    q = generate(env)
    url = f"/api/public/quotes/{q['public_token']}"
    assert env["client"].post(url + "/respond", json={"decision": "accepted"}).status_code == 409  # still a draft
    env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={"confirm_unpriced": True})
    env["db"].tables["quotes"][0]["valid_until"] = "2020-01-01"
    assert env["client"].get(url).json()["expired"] is True
    assert env["client"].post(url + "/respond", json={"decision": "accepted"}).status_code == 409
    assert env["client"].post(url + "/respond", json={"decision": "maybe"}).status_code == 400


def test_staff_outcome_reports_and_analytics(env):
    q = send(env)
    assert env["client"].post(f"/api/quotes/{q['id']}/outcome", json={"outcome": "won"}).status_code == 400
    assert env["client"].post(f"/api/quotes/{q['id']}/outcome", json={"outcome": "declined"}).status_code == 200
    report = env["client"].get("/api/quotes/dispatched").json()
    assert len(report) == 1 and report[0]["outcome"] == "declined" and report[0]["customer_email"] == "buyer@acme.com"
    assert report[0]["employee_name"] == "Rita Rep"
    stats = env["client"].get("/api/quotes/analytics").json()
    assert stats["sent"] == 1 and stats["declined"] == 1 and stats["win_rate"] == 0.0


def test_other_company_cannot_touch_the_quote(env):
    q = send(env)
    env["state"]["user"] = OTHER
    assert env["client"].put(f"/api/quotes/{q['id']}", json={"discount_percent": 99}).status_code == 404
    assert env["client"].post(f"/api/quotes/{q['id']}/outcome", json={"outcome": "accepted"}).status_code == 404
    assert env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={}).status_code == 404
    assert env["client"].get("/api/quotes/dispatched").json() == []
    assert env["client"].get("/api/quotes/analytics").json()["sent"] == 0


def test_revise_keeps_the_sent_quote(env):
    q = send(env)
    assert env["client"].post("/api/leads/l1/reimport").status_code == 200
    assert len(env["db"].tables["quotes"]) == 1  # sent quote kept for reports
    assert env["client"].get("/api/quotes/lead/l1").status_code == 404  # lead is ready for a fresh quote
    q2 = generate(env)
    assert q2["id"] != q["id"] and len(env["db"].tables["quotes"]) == 2
    assert env["client"].get("/api/quotes/lead/l1").json()["id"] == q2["id"]


def test_works_before_migration_v6_is_applied(env):
    legacy = {"id", "created_at", "lead_id", "user_id", "company_id", "material_cost", "labor_cost", "total_cost",
              "itemized_breakdown", "email_draft", "status"}
    env["db"].columns["quotes"] = legacy
    env["db"].defaults["quotes"] = {}
    q = generate(env)
    assert float(q["total_cost"]) == 450 and q["quote_number"] is None
    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={"confirm_unpriced": True})
    assert res.status_code == 200, res.text
    assert env["mail"][0]["to"] == "buyer@acme.com"  # recipient found from the request text
    assert env["db"].tables["quotes"][0]["status"] == "dispatched"
    assert env["client"].post(f"/api/quotes/{q['id']}/outcome", json={"outcome": "accepted"}).status_code == 503


def test_automation_settings_api(env, monkeypatch):
    from app.services import automation
    monkeypatch.setattr(automation, "supabase", env["db"])
    assert env["client"].get("/api/automation").json()["auto_draft_quotes"] is False
    res = env["client"].put("/api/automation", json={"auto_draft_quotes": True, "webhook_url": "http://insecure.example"})
    assert res.status_code == 400
    res = env["client"].put("/api/automation", json={"auto_draft_quotes": True})
    assert res.status_code == 200 and res.json()["auto_draft_quotes"] is True
    env["state"]["user"] = OTHER
    assert env["client"].get("/api/automation").json()["auto_draft_quotes"] is False


def test_webhook_fires_on_send_and_customer_accept(env, monkeypatch):
    from app.services import automation
    events = []
    monkeypatch.setattr(quotes_api, "emit_quote_event", lambda company, event, quote: events.append((company, event, quote.get("outcome"))))
    monkeypatch.setattr(automation, "emit_quote_event", lambda company, event, quote: events.append((company, event, quote.get("outcome"))))
    q = send(env)
    env["client"].post(f"/api/public/quotes/{q['public_token']}/respond", json={"decision": "accepted"})
    assert events == [("c1", "quote.sent", None), ("c1", "quote.accepted", "accepted")]


def test_auto_draft_creates_lead_and_draft_without_sending(env, monkeypatch):
    from app.services import email_poller
    monkeypatch.setattr(email_poller, "supabase", env["db"])
    env["db"].tables["customer_emails"] = [{"id": "e1", "company_id": "c1", "subject": "RFQ plates", "sender_email": "buyer@acme.com",
                                            "body": "Need 100 brackets", "status": "unread"}]
    email_poller.auto_draft_email(env["db"].tables["customer_emails"][0], "u1", "c1")
    lead = [l for l in env["db"].tables["leads"] if l["title"] == "RFQ plates"][0]
    assert lead["status"] == "processed" and lead["source"] == "email"
    assert env["db"].tables["customer_emails"][0]["status"] == "imported"
    drafts = [q for q in env["db"].tables["quotes"] if q["lead_id"] == lead["id"]]
    assert len(drafts) == 1 and drafts[0]["status"] == "draft"
    assert env["mail"] == []


def test_password_change_requires_current_password(env, monkeypatch):
    import supabase as supabase_pkg
    from app.api import users as users_api
    changed = []

    class FakeAuth:
        def sign_in_with_password(self, creds):
            if creds["password"] != "right-old-pw":
                raise Exception("Invalid login credentials")
            return type("R", (), {"user": type("U", (), {"id": "u1"})()})()

    monkeypatch.setattr(supabase_pkg, "create_client", lambda url, key: type("C", (), {"auth": FakeAuth()})())
    admin = type("A", (), {"update_user_by_id": lambda self, uid, attrs: changed.append((uid, attrs))})()
    monkeypatch.setattr(users_api, "supabase", type("S", (), {"auth": type("X", (), {"admin": admin})()})())

    assert env["client"].put("/api/users/change-password", json={"new_password": "new-password-1"}).status_code == 422
    res = env["client"].put("/api/users/change-password", json={"current_password": "wrong", "new_password": "new-password-1"})
    assert res.status_code == 400 and changed == []
    res = env["client"].put("/api/users/change-password", json={"current_password": "right-old-pw", "new_password": "new-password-1"})
    assert res.status_code == 200 and changed == [("u1", {"password": "new-password-1"})]


def test_untouched_estimates_stay_flagged_after_save(env):
    q = generate(env)
    items = q["itemized_breakdown"]
    items[1].update(unit_price=2000, needs_review=True)   # an estimate nobody has confirmed
    saved = env["client"].put(f"/api/quotes/{q['id']}", json={"itemized_breakdown": items}).json()
    assert saved["itemized_breakdown"][1]["needs_review"] is True
    res = env["client"].post(f"/api/quotes/{q['id']}/dispatch", json={})
    assert res.status_code == 409 and res.json()["detail"]["code"] == "unpriced_items"

