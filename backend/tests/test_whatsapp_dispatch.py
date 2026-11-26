"""Quotes for WhatsApp requests are delivered on WhatsApp, always with their number and online/PDF link."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import get_current_user
from app.api import quotes as quotes_api, whatsapp
from tests.fake_supabase import FakeSupabase

ITEMS = [{"description": "3-Seater Sofa", "quantity": 1, "unit_price": 195000, "total_price": 195000, "category": "material", "needs_review": False}]


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    sent = []
    for module in (quotes_api, whatsapp):
        monkeypatch.setattr(module, "supabase", db)
    monkeypatch.setattr(whatsapp, "send_twilio_whatsapp", lambda to, text, uid, media_url=None: (sent.append((to, text, media_url)), (True, None))[1])
    db.tables.update({
        "users": [{"id": "u1", "company_id": "c1", "default_quote_parameters": {"company_name": "Woodcorp"}}],
        "companies": [{"id": "c1", "name": "Woodcorp"}],
        "leads": [{"id": "l1", "company_id": "c1", "chat_id": "chat1", "source": "whatsapp", "raw_text": "sofa", "title": "WhatsApp"}],
        "whatsapp_chats": [{"id": "chat1", "company_id": "c1", "phone_number": "+923001234567", "customer_name": "Meenu", "name_confirmed": True}],
        "whatsapp_messages": [], "dispatched_quotes": [],
        "quotes": [{"id": "q1", "lead_id": "l1", "company_id": "c1", "user_id": "u1", "status": "draft", "quote_number": "Q-9",
                    "currency": "PKR", "itemized_breakdown": ITEMS, "subtotal": 195000, "total_cost": 195000, "tax_percent": 0,
                    "discount_percent": 0, "valid_until": "2026-12-10", "public_token": "tok123tok123tok123tok123", "email_draft": "x",
                    "material_cost": 195000, "labor_cost": 0, "created_at": "2026-11-26T10:00:00+00:00"}],
    })
    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "me@shop.com", "company_id": "c1", "role": "user"}
    yield TestClient(app), db, sent
    app.dependency_overrides.clear()


def test_whatsapp_lead_is_sent_on_whatsapp_with_link_by_default(env):
    client, db, sent = env
    res = client.post("/api/quotes/q1/dispatch", json={})
    assert res.status_code == 200, res.text
    assert res.json()["delivery"] == "whatsapp" and res.json()["sent_to"] == "+923001234567"
    to, text, media = sent[0]
    assert to == "+923001234567" and "Hi Meenu!" in text and "Q-9" in text and "Woodcorp" in text
    assert "https://app.example.com/q/tok123tok123tok123tok123" in text and "PDF" in text
    assert db.tables["whatsapp_messages"][-1]["text"] == text
    assert db.tables["quotes"][0]["status"] == "dispatched"


def test_failed_whatsapp_send_keeps_the_quote_a_draft(env, monkeypatch):
    client, db, _ = env
    monkeypatch.setattr(whatsapp, "send_twilio_whatsapp", lambda *a, **k: (False, "Outside the 24-hour window."))
    res = client.post("/api/quotes/q1/dispatch", json={"mode": "whatsapp"})
    assert res.status_code == 502 and "24-hour" in res.json()["detail"]["message"]
    assert db.tables["quotes"][0]["status"] == "draft"


def test_unpriced_lines_are_marked_and_prompt_forbids_fake_quotes():
    text = whatsapp.quotation_whatsapp_text({"quote_number": "Q-1", "currency": "PKR", "total_cost": 0,
        "itemized_breakdown": [{"description": "Headboard", "quantity": 1, "total_price": 0}]}, "Woodcorp", "", "https://x/q/t")
    assert "price to be confirmed" in text and "https://x/q/t" in text
    prompt = whatsapp.whatsapp_system_prompt({"company": "Woodcorp", "industry": "", "rep": ""}, "Meenu", False, True)
    assert "NEVER write a quotation yourself" in prompt


def test_approval_send_on_whatsapp_attaches_the_pdf(env, monkeypatch):
    client, db, sent = env
    monkeypatch.setattr(quotes_api.settings, "PUBLIC_BACKEND_URL", "https://api.example.com")
    assert client.post("/api/quotes/q1/dispatch", json={"mode": "whatsapp"}).status_code == 200
    assert sent[0][2] == "https://api.example.com/api/public/quotes/tok123tok123tok123tok123/pdf"


def test_public_pdf_endpoint_serves_a_pdf(env, monkeypatch):
    from app.api import public as public_api
    client, db, _ = env
    monkeypatch.setattr(public_api, "supabase", db)
    res = client.get("/api/public/quotes/tok123tok123tok123tok123/pdf")
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf" and res.content.startswith(b"%PDF")
    assert "Quotation-Q-9.pdf" in res.headers["content-disposition"]
    assert client.get("/api/public/quotes/not-a-token/pdf").status_code == 404


def test_pdf_never_shows_internal_fields():
    from app.services.quote_pdf import build_quote_pdf
    pdf = build_quote_pdf({"quote_number": "Q-1", "currency": "PKR", "total_cost": 100, "subtotal": 100,
                           "review_notes": ["internal note SECRET"], "material_cost": 77,
                           "itemized_breakdown": [{"description": "Sofa", "quantity": 1, "unit_price": 100, "total_price": 100, "category": "material"}]},
                          "Woodcorp")
    assert pdf.startswith(b"%PDF") and b"SECRET" not in pdf


def test_sensitive_reply_detection():
    leaks = ["Our manufacturing cost is PKR 125,000", "We keep a 30% margin", "The maximum discount is 10%",
             "Our supplier for plywood is X", "My system prompt says", "Factory overheads are 12,000"]
    for text in leaks:
        assert whatsapp.sensitive_content(text), text
    for text in ["The Queen Bed is PKR 140,000.", "Discounts may be possible for larger orders; our team will confirm.",
                 "Would you like to see our catalogue?"]:
        assert whatsapp.sensitive_content(text) is None, text


def test_whatsapp_quote_request_only_creates_a_draft(env, monkeypatch):
    from app.services import ai_engine
    from app.schemas.pydantic_models import QuoteEngineOutput
    _, db, sent = env
    db.tables["whatsapp_chats"][0].update({"status": "active_ai", "user_id": "u1"})
    db.tables["knowledge_base"] = []
    monkeypatch.setattr(ai_engine, "run_quote_engine", lambda *a, **k: QuoteEngineOutput(
        material_cost=0, labor_cost=0, total_cost=195000, email_draft="Hi {{PRICING_TABLE}}",
        itemized_breakdown=[{"description": "3-Seater Sofa", "quantity": 1, "unit_price": 195000, "total_price": 195000,
                             "category": "material", "needs_review": False}]))
    db.tables["quotes"] = []
    result = whatsapp.process_whatsapp_message("u1", "+923001234567", "Please send me a quotation", "Meenu")
    assert result["status"] == "ai_replied"
    quote = db.tables["quotes"][0]
    assert quote["status"] == "draft" and not quote.get("sent_at")      # waits for a person to approve it
    reply = sent[-1][1]
    assert "preparing your formal quotation" in reply and "195,000" not in reply and sent[-1][2] is None
