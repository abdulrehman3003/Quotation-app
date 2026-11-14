import io
from datetime import datetime, timezone

import pandas as pd
import pytest

from app.services import automation
from app.services.kb_retrieval import select_kb_context
from app.services.parser import attachments_to_text
from app.services.email_poller import is_auto_draftable
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------- knowledge base
def test_small_kb_is_sent_whole():
    kb = ["item,price\nplate,10", "terms: net 30"]
    assert select_kb_context(kb, "anything", 1000) == (kb, False)


def test_large_kb_keeps_header_and_relevant_rows():
    rows = [f"filler-part-{i},{i}.00" for i in range(400)]
    rows[250] = "titanium flange TF-900,412.50"
    sheet = "item,unit price\n" + "\n".join(rows)
    other = "\n".join(f"unrelated note {i}" for i in range(300))
    selected, trimmed = select_kb_context([sheet, other], "Please quote 20 x titanium flange TF-900", 2500)
    text = "\n".join(selected)
    assert trimmed and len(text) <= 2600
    assert "titanium flange TF-900,412.50" in text
    assert text.startswith("item,unit price")
    assert "[...]" in text or "filler-part-0," not in text


# ---------------------------------------------------------------- attachments
def test_attachments_are_read_or_named():
    csv = b"part,qty\nbracket A,40\nbracket B,15\n"
    buf = io.BytesIO()
    pd.DataFrame({"part": ["flange"], "qty": [7]}).to_excel(buf, index=False)
    text = attachments_to_text([
        ("bom.csv", csv), ("../../order.xlsx", buf.getvalue()), ("drawing.dwg", b"\x00\x01"), ("broken.pdf", b"not a pdf"),
    ])
    assert "--- Attachment: bom.csv ---" in text and "bracket B" in text
    assert "--- Attachment: order.xlsx ---" in text and "flange" in text
    assert "drawing.dwg" in text and "broken.pdf (could not be read)" in text
    assert attachments_to_text([]) == ""


def test_attachment_limits():
    big = ("part,qty\n" + "x,1\n" * 20000).encode()
    text = attachments_to_text([("big.csv", big)] + [(f"f{i}.csv", b"a,b\n1,2\n") for i in range(6)])
    assert "[attachment truncated]" in text
    assert text.count("--- Attachment:") == 5
    assert "too large or too many" in text


def test_auto_draft_skips_automated_and_own_mail():
    assert is_auto_draftable("buyer@acme.com", "sales@seller.com")
    assert not is_auto_draftable("sales@seller.com", "Sales@Seller.com")
    assert not is_auto_draftable("no-reply@shop.com", "sales@seller.com")
    assert not is_auto_draftable("MAILER-DAEMON@google.com", "sales@seller.com")


# ---------------------------------------------------------------- webhooks
@pytest.mark.parametrize("url", [
    "http://example.com/hook", "https://127.0.0.1/hook", "https://localhost/hook", "https://10.0.0.5/x",
    "https://169.254.169.254/latest/meta-data", "https://user:pw@8.8.8.8/x", "ftp://8.8.8.8/x", "",
])
def test_webhook_url_rejects_unsafe_targets(url):
    with pytest.raises(ValueError):
        automation.validate_webhook_url(url)


def test_webhook_url_accepts_public_https():
    assert automation.validate_webhook_url("https://8.8.8.8/hooks/quotes") == "https://8.8.8.8/hooks/quotes"


def test_webhook_payload_and_signature():
    quote = {"id": "q1", "quote_number": "Q-1", "status": "dispatched", "outcome": "accepted", "total_cost": 99.5,
             "customer_email": "b@acme.com", "email_draft": "internal", "review_notes": ["internal"], "public_token": "tok",
             "itemized_breakdown": [{"description": "Plate", "quantity": 1, "unit_price": 99.5, "total_price": 99.5, "needs_review": False}]}
    payload = automation.quote_event_payload("quote.accepted", quote)
    assert payload["event"] == "quote.accepted" and payload["quote"]["total"] == 99.5
    assert payload["quote"]["customer"]["email"] == "b@acme.com"
    flat = str(payload)
    assert "internal" not in flat and "tok" not in flat
    sig = automation.sign_payload("secret", b"{}")
    assert sig.startswith("sha256=") and len(sig) == 71 and sig != automation.sign_payload("other", b"{}")


# ---------------------------------------------------------------- settings + follow-ups
@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(automation, "supabase", fake)
    return fake


def test_settings_default_off_and_validated(db):
    assert automation.get_company_settings("c1")["auto_draft_quotes"] is False
    saved = automation.save_company_settings("c1", {"auto_follow_up": True, "follow_up_after_days": 99, "webhook_url": "https://8.8.8.8/h", "bogus": 1})
    assert saved["auto_follow_up"] is True and saved["follow_up_after_days"] == 30 and "bogus" not in saved
    secret = saved["webhook_secret"]
    assert secret and automation.save_company_settings("c1", {"auto_draft_quotes": True})["webhook_secret"] == secret
    assert automation.save_company_settings("c1", {"webhook_url": ""})["webhook_url"] is None
    with pytest.raises(ValueError):
        automation.save_company_settings("c1", {"webhook_url": "https://localhost/x"})
    assert automation.get_company_settings("other")["auto_follow_up"] is False


def quote(**over):
    base = {"id": "q", "company_id": "c1", "user_id": "u1", "status": "dispatched", "outcome": None, "follow_up_sent_at": None,
            "customer_email": "buyer@acme.com", "customer_name": "Bo", "quote_number": "Q-9", "total_cost": 500, "currency": "USD",
            "sent_at": "2026-11-10T09:00:00+00:00", "valid_until": "2026-12-01", "public_token": "tok123"}
    base.update(over)
    return base


def test_follow_up_due_rules():
    due = automation.is_due_for_follow_up
    assert due(quote(), 3, NOW)
    assert not due(quote(sent_at="2026-11-13T09:00:00+00:00"), 3, NOW)       # too recent
    assert not due(quote(outcome="accepted"), 3, NOW)
    assert not due(quote(follow_up_sent_at="2026-11-13T00:00:00+00:00"), 3, NOW)
    assert not due(quote(customer_email=None), 3, NOW)
    assert not due(quote(valid_until="2026-11-01"), 3, NOW)                   # expired
    assert not due(quote(status="draft"), 3, NOW)


def test_follow_ups_send_once_only_for_opted_in_companies(db, monkeypatch):
    from app.api import emails as emails_api
    from app.core import credentials
    sent = []
    monkeypatch.setattr(emails_api, "send_smtp_email", lambda to, subject, body, u=None, p=None: sent.append((to, subject, body)) or True)
    monkeypatch.setattr(credentials, "get_gmail_credentials", lambda user_id=None: ("rep@seller.com", "pw"))
    db.tables["company_settings"] = [
        {"company_id": "c1", "settings": {"auto_follow_up": True, "follow_up_after_days": 3}},
        {"company_id": "c2", "settings": {"auto_follow_up": False}},
    ]
    db.tables["users"] = [{"id": "u1", "name": "Rita Rep", "default_quote_parameters": {"company_name": "Seller Ltd"}}]
    db.tables["quotes"] = [
        quote(id="due"),
        quote(id="recent", sent_at="2026-11-13T09:00:00+00:00"),
        quote(id="won", outcome="accepted"),
        quote(id="other-company", company_id="c2"),
    ]
    assert automation.run_follow_ups(now=NOW) == 1
    to, subject, body = sent[0]
    assert to == "buyer@acme.com" and "Q-9" in subject and "Seller Ltd" in subject
    assert "Hello Bo," in body and "500.00 USD" in body and "https://app.example.com/q/tok123" in body and "Rita Rep" in body
    assert [q["id"] for q in db.tables["quotes"] if q["follow_up_sent_at"]] == ["due"]
    assert automation.run_follow_ups(now=NOW) == 0 and len(sent) == 1


def test_failed_follow_up_is_not_retried(db, monkeypatch):
    from app.api import emails as emails_api
    from app.core import credentials
    attempts = []

    def boom(*a, **k):
        attempts.append(1)
        raise RuntimeError("smtp down")

    monkeypatch.setattr(emails_api, "send_smtp_email", boom)
    monkeypatch.setattr(credentials, "get_gmail_credentials", lambda user_id=None: ("rep@seller.com", "pw"))
    db.tables["company_settings"] = [{"company_id": "c1", "settings": {"auto_follow_up": True}}]
    db.tables["quotes"] = [quote()]
    assert automation.run_follow_ups(now=NOW) == 0
    assert automation.run_follow_ups(now=NOW) == 0
    assert len(attempts) == 1


# ---------------------------------------------------------------- email bodies
def test_html_email_becomes_readable_text():
    from app.services.parser import html_to_text, clean_email_body, looks_like_html
    markup = """<!DOCTYPE html><html><head><title>x</title><style>p { color: red; }</style></head><body>
      <div class="preheader" style="display: none; max-height: 0;">Hidden preview &nbsp;&zwnj;&nbsp;&zwnj;</div>
      <!--[if mso]><v:roundrect>ignored</v:roundrect><![endif]-->
      <table><tr><td><h1>Request for quote</h1></td></tr>
      <tr><td><p>Hello,<br>We need 100&nbsp;brackets &amp; 2 plates.</p><ul><li>Steel</li><li>5 mm</li></ul>
      <a href="https://example.com/track?x=1">View order</a></td></tr></table>
      <img src="https://t.example.com/open" width="1" height="1"><script>alert(1)</script></body></html>"""
    text = html_to_text(markup)
    assert "Request for quote" in text and "We need 100 brackets & 2 plates." in text
    assert "- Steel" in text and "View order" in text
    for junk in ("<", "color: red", "Hidden preview", "roundrect", "alert(1)", "‌", "DOCTYPE", "track?x"):
        assert junk not in text
    assert "\n\n\n" not in text
    assert looks_like_html(markup) and not looks_like_html("Need 5 plates < 3 mm thick")
    assert clean_email_body("Plain request", markup) == "Plain request"
    assert "Request for quote" in clean_email_body("", markup)
    assert "Request for quote" in clean_email_body(markup, None)  # HTML delivered in the text part


def test_twilio_errors_are_explained():
    from app.api.whatsapp import explain_twilio_error
    assert "Account SID" in explain_twilio_error(401, None)
    assert "sandbox" in explain_twilio_error(400, {"code": 63015})
    assert "24 hours" in explain_twilio_error(400, {"code": 63016})
    assert "Odd thing" in explain_twilio_error(400, {"code": 99999, "message": "Odd thing"})


def test_pdf_glyph_damage_is_repaired():
    from app.services.parser import normalize_extracted_text
    raw = "EsƟmated cost of Oﬃce desk 4 × 2 Ō\n Custom carving 10–20%  \nwriƩen approval, gross proﬁt"
    assert normalize_extracted_text(raw) == "Estimated cost of Office desk 4 × 2 ft\n- Custom carving 10–20%\nwritten approval, gross profit"
    assert normalize_extracted_text("") == ""
