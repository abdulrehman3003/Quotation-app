"""Twilio webhook signatures: proxy URL variants are accepted, a wrong token never is."""
import types

from app.api import whatsapp

PARAMS = {"From": ["whatsapp:+971500000000"], "To": ["whatsapp:+14155238886"], "Body": ["hi"]}


def fake_request(signature, url="http://localhost:8001/api/whatsapp/webhook", host="abc.ngrok-free.dev"):
    from starlette.datastructures import URL
    return types.SimpleNamespace(headers={"X-Twilio-Signature": signature, "host": host}, url=URL(url))


def test_signature_over_public_url_variants(monkeypatch):
    monkeypatch.setattr(whatsapp.settings, "PUBLIC_BACKEND_URL", "https://abc.ngrok-free.dev")
    for signed in ("https://abc.ngrok-free.dev/api/whatsapp/webhook", "https://abc.ngrok-free.dev/api/whatsapp/webhook/"):
        sig = whatsapp.compute_twilio_signature("right-token", signed, PARAMS)
        assert whatsapp._is_valid_twilio_request(fake_request(sig), PARAMS, "right-token")


def test_wrong_token_or_other_host_is_refused(monkeypatch):
    monkeypatch.setattr(whatsapp.settings, "PUBLIC_BACKEND_URL", "https://abc.ngrok-free.dev")
    sig = whatsapp.compute_twilio_signature("other-token", "https://abc.ngrok-free.dev/api/whatsapp/webhook", PARAMS)
    assert not whatsapp._is_valid_twilio_request(fake_request(sig), PARAMS, "right-token")
    sig = whatsapp.compute_twilio_signature("right-token", "https://evil.example.com/api/whatsapp/webhook", PARAMS)
    assert not whatsapp._is_valid_twilio_request(fake_request(sig), PARAMS, "right-token")
    assert not whatsapp._is_valid_twilio_request(fake_request(""), PARAMS, "right-token")


def test_number_saved_with_formatting_still_routes_to_its_customer(monkeypatch):
    from app.core.encryption import encrypt_key
    from tests.fake_supabase import FakeSupabase
    db = FakeSupabase()
    db.tables["users"] = [
        {"id": "admin", "role": "admin", "encrypted_twilio_phone": encrypt_key("+14155238886"), "created_at": "1"},
        {"id": "cust", "role": "user", "encrypted_twilio_phone": encrypt_key("+1 (415) 523-8886"), "created_at": "2"},
    ]
    monkeypatch.setattr(whatsapp, "supabase", db)
    assert whatsapp._resolve_tenant_by_recipient("whatsapp:+14155238886") == "cust"   # never the admin
    assert whatsapp._resolve_tenant_by_recipient("whatsapp:+15550000000") is None


def test_outgoing_numbers_are_sent_in_twilio_format():
    assert whatsapp.whatsapp_address("+1 (415) 523-8886") == "whatsapp:+14155238886"
    assert whatsapp.whatsapp_address("whatsapp:+971 50 123 4567") == "whatsapp:+971501234567"
    assert whatsapp.whatsapp_address("971501234567") == "whatsapp:+971501234567"
