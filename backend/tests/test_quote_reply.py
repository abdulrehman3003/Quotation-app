"""The reply's quotation table is generated from the line items and follows every edit."""
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import get_current_user
from app.api import quotes as quotes_api
from app.services.quote_text import apply_pricing_block, render_pricing_block, refresh_reply, reply_warnings
from tests.fake_supabase import FakeSupabase

ITEMS = [
    {"description": "King Bed (6.5 x 6 ft), laminated plywood", "quantity": 1, "unit_price": 165000, "total_price": 165000, "category": "material", "needs_review": False},
    {"description": "Upholstered headboard", "quantity": 1, "unit_price": 0, "total_price": 0, "category": "material", "needs_review": True},
    {"description": "Karachi delivery", "quantity": 1, "unit_price": 2000, "total_price": 2000, "category": "other", "needs_review": True},
]

AI_REPLY = "Dear Ahmed,\n\nThank you for your enquiry.\n\n{{PRICING_TABLE}}\n\nProduction takes 7-21 working days.\n\nBest regards,\nAbdul"


def test_table_renders_from_items():
    block = render_pricing_block(ITEMS, "PKR", 5, 0, "Q-1", "2026-12-10")
    assert "=== Quotation Q-1 ===" in block and "1 x PKR 165,000.00 = PKR 165,000.00" in block
    assert "price to be confirmed" in block and "Discount (5%): -PKR 8,350.00" in block
    assert "Total: PKR 158,650.00" in block and "Valid until 2026-12-10." in block
    assert block.endswith("=== End of quotation ===")


def test_placeholder_then_edit_replaces_the_table():
    reply = apply_pricing_block(AI_REPLY, render_pricing_block(ITEMS, "PKR", 0, 0, "Q-1"))
    assert "{{PRICING_TABLE}}" not in reply and "Total: PKR 167,000.00" in reply
    edited = [dict(ITEMS[0]), {**ITEMS[1], "unit_price": 12000, "total_price": 12000}, ITEMS[2]]
    again = refresh_reply(reply, edited, "PKR", 0, 0, "Q-1", None)
    assert "Total: PKR 179,000.00" in again and "167,000" not in again
    assert again.startswith("Dear Ahmed,") and again.rstrip().endswith("Abdul")  # the person's text is kept
    assert again.count("=== Quotation") == 1


def test_missing_placeholder_goes_before_sign_off_and_old_replies_are_untouched():
    reply = apply_pricing_block("Hello,\n\nSee below.\n\nKind regards,\nSam", render_pricing_block(ITEMS, "USD"))
    assert reply.index("=== Quotation") < reply.index("Kind regards")
    assert refresh_reply("An old reply with no table", ITEMS, "USD", 0, 0, None, None) == "An old reply with no table"


def test_saving_edited_prices_updates_the_reply(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(quotes_api, "supabase", db)
    reply = apply_pricing_block(AI_REPLY, render_pricing_block(ITEMS, "PKR", 0, 0, "Q-1"))
    db.tables["quotes"] = [{"id": "q1", "lead_id": "l1", "created_at": "2026-11-26T10:00:00+00:00", "company_id": "c1", "status": "draft", "currency": "PKR", "quote_number": "Q-1",
                            "itemized_breakdown": ITEMS, "email_draft": reply, "discount_percent": 0, "tax_percent": 0,
                            "total_cost": 167000, "review_notes": []}]
    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "company_id": "c1", "role": "user"}
    try:
        edited = [ITEMS[0], {**ITEMS[1], "unit_price": 12000, "total_price": 12000, "needs_review": False}, ITEMS[2]]
        res = TestClient(app).put("/api/quotes/q1", json={"itemized_breakdown": edited, "email_draft": reply, "discount_percent": 10})
        assert res.status_code == 200, res.text
        body = res.json()["email_draft"]
        assert "Discount (10%): -PKR 17,900.00" in body and "Total: PKR 161,100.00" in body
    finally:
        app.dependency_overrides.clear()


def test_warnings_for_prices_in_prose_and_internal_cost_lines():
    clean = apply_pricing_block(AI_REPLY, render_pricing_block(ITEMS, "PKR"))
    assert reply_warnings(clean, ITEMS) == []
    prose = apply_pricing_block("Our bed is PKR 165,000.\n\n{{PRICING_TABLE}}", render_pricing_block(ITEMS, "PKR"))
    internal = ITEMS + [{"description": "Material markup for plywood", "quantity": 1, "unit_price": 1, "total_price": 1}]
    notes = reply_warnings(prose, internal)
    assert any("outside the quotation table" in n for n in notes) and any("internal costs" in n for n in notes)
