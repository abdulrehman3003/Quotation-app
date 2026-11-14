from datetime import date, datetime, timezone

from app.schemas.pydantic_models import QuoteEngineOutput
from app.services.ai_engine import finalize_engine_output
from app.api.quotes import summarize_quotes, build_quote_fields, public_quote_url, resolve_lead_customer
from app.api.public import serialize_public_quote, is_expired


def engine_output(**overrides):
    base = dict(
        material_cost=1, labor_cost=1, total_cost=5000,
        itemized_breakdown=[
            {"description": "Steel bracket", "quantity": 100, "unit_price": 4.5, "total_price": 450, "category": "material"},
            {"description": "Welding", "quantity": 3, "unit_price": 50, "total_price": 150, "category": "labor"},
            {"description": "Powder coating", "quantity": 100, "unit_price": 0, "total_price": 0, "category": "labor", "needs_review": True},
        ],
        email_draft="Dear Sam,\nPlease find the quote.\n---\n",
        customer_name="Sam Lee", customer_email="Sam@Acme.com", customer_phone="null", customer_company="Acme",
        missing_information=["plate thickness"], assumptions=["mild steel"],
    )
    base.update(overrides)
    return QuoteEngineOutput(**base)


def test_engine_totals_come_from_line_items():
    out = finalize_engine_output(engine_output())
    assert out.material_cost == 450
    assert out.labor_cost == 150
    assert out.total_cost == 600
    assert not out.email_draft.endswith("-")


def test_engine_review_notes_cover_unpriced_mismatch_and_gaps():
    notes = " | ".join(finalize_engine_output(engine_output()).review_notes)
    assert "Powder coating" in notes
    assert "did not match" in notes
    assert "plate thickness" in notes
    assert "mild steel" in notes


def test_engine_cleans_customer_fields():
    out = finalize_engine_output(engine_output(customer_email="not an email"))
    assert out.customer_email is None
    assert out.customer_phone is None
    assert finalize_engine_output(engine_output()).customer_email == "sam@acme.com"


def test_build_quote_fields_applies_workspace_defaults():
    out = finalize_engine_output(engine_output())
    profile = {"default_quote_parameters": {"currency": "pkr", "tax_percent": 17, "quote_validity_days": 15}}
    fields = build_quote_fields(out, profile)
    assert fields["currency"] == "PKR"
    assert fields["subtotal"] == 600
    assert fields["total_cost"] == 702
    assert fields["quote_number"].startswith("Q-")
    assert len(fields["public_token"]) >= 24
    assert (date.fromisoformat(fields["valid_until"]) - date.today()).days == 15


def test_public_link_uses_frontend_url():
    assert public_quote_url("abc") == "https://app.example.com/q/abc"
    assert public_quote_url(None) is None


def test_recipient_fallback_skips_sellers_own_address():
    lead = {"source": "email", "title": "RFQ", "raw_text": "Forwarded by sales@seller.com\nFrom: buyer@acme.com\nNeed 10 plates"}
    assert resolve_lead_customer(lead, "c1", exclude_emails={"sales@seller.com"})["email"] == "buyer@acme.com"


def test_analytics_summary():
    now = datetime(2026, 11, 14, tzinfo=timezone.utc)
    leads = {"l1": {"created_at": "2026-11-01T10:00:00+00:00"}, "l2": {"created_at": "2026-11-13T10:00:00+00:00"}}
    quotes = [
        {"id": "a", "lead_id": "l1", "status": "dispatched", "outcome": "accepted", "total_cost": 1000, "sent_at": "2026-11-01T12:00:00+00:00", "view_count": 2},
        {"id": "b", "lead_id": "l1", "status": "dispatched", "outcome": "declined", "total_cost": 500, "sent_at": "2026-11-01T14:00:00+00:00"},
        {"id": "c", "lead_id": "l1", "status": "dispatched", "outcome": None, "total_cost": 300, "sent_at": "2026-11-02T10:00:00Z", "view_count": 1},
        {"id": "d", "lead_id": "l2", "status": "dispatched", "outcome": None, "total_cost": 200, "sent_at": "2026-11-13T11:00:00+00:00"},
        {"id": "e", "lead_id": "l2", "status": "draft", "total_cost": 999},
    ]
    s = summarize_quotes(quotes, leads, now=now)
    assert (s["sent"], s["accepted"], s["declined"], s["open"], s["drafts"], s["viewed"]) == (4, 1, 1, 2, 1, 2)
    assert s["win_rate"] == 50.0
    assert s["quoted_value"] == 2000 and s["won_value"] == 1000 and s["open_value"] == 500
    assert s["needs_follow_up"] == ["c"]
    assert s["median_response_hours"] == 3.0


def test_analytics_empty():
    s = summarize_quotes([], {})
    assert s["win_rate"] is None and s["median_response_hours"] is None and s["sent"] == 0


def test_public_view_hides_internal_fields():
    quote = {
        "quote_number": "Q-1", "status": "dispatched", "created_at": "2026-11-01T00:00:00+00:00",
        "valid_until": "2026-11-30", "discount_percent": 10, "tax_percent": 0, "total_cost": 0,
        "itemized_breakdown": [{"description": "Plate", "quantity": 2, "unit_price": 50, "needs_review": False, "category": "material"}],
        "email_draft": "internal draft", "review_notes": ["internal note"], "company_id": "c1", "user_id": "u1", "lead_id": "l1",
    }
    seller = {"name": "Ana", "email": "ana@seller.com", "default_quote_parameters": {"payment_terms": "Net 30"}}
    view = serialize_public_quote(quote, seller, "Seller Ltd")
    assert view["total"] == 90 and view["discount_amount"] == 10
    assert view["payment_terms"] == "Net 30"
    assert view["seller"]["company_name"] == "Seller Ltd"
    flat = str(view)
    for secret in ("internal draft", "internal note", "c1", "u1", "l1", "needs_review", "category"):
        assert secret not in flat


def test_expiry():
    assert is_expired({"valid_until": "2026-11-13"}, today=date(2026, 11, 14))
    assert not is_expired({"valid_until": "2026-11-14"}, today=date(2026, 11, 14))
    assert not is_expired({"valid_until": None})


def test_ai_failures_are_explained_without_leaking_details():
    from app.api.quotes import explain_ai_failure
    leaked = "AI Quote engine failed: Error code: 403 - [{'error': {'code': 403, 'message': 'Your API key was reported as leaked. Please use another API key.'}}]"
    assert "disabled your Gemini API key" in explain_ai_failure(leaked)
    assert "quota" in explain_ai_failure("Error code: 429 - RESOURCE_EXHAUSTED").lower()
    assert "No Gemini API key" in explain_ai_failure("No Gemini API key is configured for this workspace")
    generic = explain_ai_failure("KeyError: 'secret-internal-thing'")
    assert "secret-internal-thing" not in generic and "Quote calculation failed" in generic


def test_engine_falls_back_when_models_are_busy_or_retired(monkeypatch):
    from app.services import ai_engine
    monkeypatch.setattr(ai_engine, "RETRY_DELAY_SECONDS", 0)
    monkeypatch.setattr(ai_engine.settings, "GEMINI_MODEL", "main")
    monkeypatch.setattr(ai_engine.settings, "GEMINI_FALLBACK_MODELS", "retired, backup ,main")
    assert ai_engine.candidate_models() == ["main", "retired", "backup"]
    calls = []

    def fake_once(client, model, system, user):
        calls.append(model)
        if model == "main":
            raise Exception("Error code: 503 - high demand")
        if model == "retired":
            raise Exception("Error code: 404 - This model is no longer available to new users")
        return "QUOTE"

    monkeypatch.setattr(ai_engine, "_generate_once", fake_once)
    assert ai_engine._generate_with_fallbacks(None, "s", "u") == "QUOTE"
    assert calls == ["main", "main", "retired", "backup"]  # busy model retried once, retired one skipped

    calls.clear()
    monkeypatch.setattr(ai_engine, "_generate_once", lambda c, m, s, u: (calls.append(m), (_ for _ in ()).throw(Exception("Error code: 403 - reported as leaked")))[1])
    import pytest
    with pytest.raises(RuntimeError, match="leaked"):
        ai_engine._generate_with_fallbacks(None, "s", "u")
    assert calls == ["main"]  # a rejected key is not retried on other models


def test_range_estimates_are_flagged_but_keep_their_price():
    out = finalize_engine_output(engine_output(total_cost=2450, itemized_breakdown=[
        {"description": "Steel bracket", "quantity": 100, "unit_price": 4.5, "total_price": 450, "category": "material"},
        {"description": "Local delivery (range 2,000-5,000)", "quantity": 1, "unit_price": 2000, "total_price": 2000, "category": "other", "needs_review": True},
    ]))
    delivery = out.itemized_breakdown[1]
    assert delivery.total_price == 2000 and delivery.needs_review is True
    assert any(n.startswith("Estimated from a range") and "Local delivery" in n for n in out.review_notes)
    assert not any(n.startswith("No price found") for n in out.review_notes)
