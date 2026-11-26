"""WhatsApp replies speak for the company, know the customer and the conversation, and offer the catalogue."""
from app.api import whatsapp
from tests.fake_supabase import FakeSupabase


def test_first_name_ignores_placeholder_names():
    assert whatsapp.first_name("Ahmed Khan") == "Ahmed"
    assert whatsapp.first_name("WhatsApp Customer") == "" and whatsapp.first_name(None) == ""


def test_prompt_uses_company_customer_and_offers_catalogue():
    biz = {"company": "Woodcorp", "industry": "Furniture", "rep": "Abdul"}
    first = whatsapp.whatsapp_system_prompt(biz, "Ahmed", True, True)
    assert "Woodcorp (Furniture)" in first and "Ahmed" in first and "catalogue" in first.lower()
    later = whatsapp.whatsapp_system_prompt(biz, "Ahmed", False, True)
    assert "do not greet" in later
    assert "No catalogue has been uploaded" in whatsapp.whatsapp_system_prompt(biz, "", True, False)


def test_history_excludes_the_message_being_answered(monkeypatch):
    db = FakeSupabase()
    db.tables["whatsapp_messages"] = [
        {"chat_id": "c", "sender": "customer", "text": "Hi", "created_at": "1"},
        {"chat_id": "c", "sender": "system", "text": "Hi Ahmed! Would you like to see our catalogue?", "created_at": "2"},
        {"chat_id": "c", "sender": "customer", "text": "yes please", "created_at": "3"},
    ]
    monkeypatch.setattr(whatsapp, "supabase", db)
    turns = whatsapp.chat_history("c", "yes please")
    assert [t["role"] for t in turns] == ["user", "assistant"] and "catalogue" in turns[1]["content"]


def test_catalogue_requests_are_not_sent_to_the_quote_engine():
    import re
    body = "can you send your catalogue with prices"
    is_cat = any(re.search(r"\b" + k + r"\b", body) for k in whatsapp.CATALOGUE_KEYWORDS)
    assert is_cat


def test_yes_to_a_quotation_offer_is_detected():
    assert whatsapp.AFFIRMATIVE_RE.match("Yes please") and whatsapp.AFFIRMATIVE_RE.match("ok")
    assert not whatsapp.AFFIRMATIVE_RE.match("not yet")
    assert whatsapp.QUOTE_OFFER_RE.search("Shall I prepare a formal quotation for you?")
    import re
    assert not any(re.search(r"\b" + k + r"\b", "how much is the queen bed") for k in whatsapp.QUOTE_KEYWORDS)


def test_assistant_output_parsing_keeps_only_real_names():
    assert whatsapp.parse_assistant_output('{"reply": "Thanks Sara!", "customer_name": "Sara Khan."}') == ("Thanks Sara!", "Sara Khan")
    assert whatsapp.parse_assistant_output('{"reply": "Hi", "customer_name": null}') == ("Hi", None)
    assert whatsapp.parse_assistant_output('{"reply": "Hi", "customer_name": "WhatsApp Customer"}')[1] is None
    assert whatsapp.parse_assistant_output("plain text reply") == ("plain text reply", None)


def test_prompt_asks_for_name_until_given():
    biz = {"company": "Woodcorp", "industry": "", "rep": ""}
    asking = whatsapp.whatsapp_system_prompt(biz, "", True, True, name_confirmed=False, profile_name="Cool Guy 99")
    assert "May I have your name" in asking and "Cool Guy 99" in asking and "do not address them by it" in asking
    known = whatsapp.whatsapp_system_prompt(biz, "Sara", False, True, name_confirmed=True)
    assert "Do not ask for it again" in known
    gated = whatsapp.whatsapp_system_prompt(biz, "", False, True, name_confirmed=False, quote_needs_name=True)
    assert "need their name to prepare it" in gated
