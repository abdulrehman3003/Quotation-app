"""Automatic WhatsApp follow-ups, nudges, expiry reminders and team reminders, with their rules."""
from datetime import datetime, timedelta, timezone

import pytest

from app.api import whatsapp
from app.services import followups
from app.services.automation import DEFAULTS
from tests.fake_supabase import FakeSupabase

# Wednesday 25 Nov 2026, 11:00 in Dubai (07:00 UTC): inside default business hours.
NOW = datetime(2026, 11, 25, 7, 0, tzinfo=timezone.utc)
CFG = {**DEFAULTS, "wa_follow_up": True, "chat_nudge": True, "expiry_reminder": True}


def ago(**kw):
    return (NOW - timedelta(**kw)).isoformat()


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    sent = []
    for module in (followups, whatsapp):
        monkeypatch.setattr(module, "supabase", db)
    monkeypatch.setattr(whatsapp, "send_twilio_whatsapp", lambda to, text, uid, media_url=None: (sent.append((to, text, media_url)), (True, None))[1])
    monkeypatch.setattr(followups, "nudge_text", lambda chat, company, uid: f"Hi! Still interested? ({company})")
    db.tables["users"] = [{"id": "u1", "company_id": "c1", "name": "Rep", "default_quote_parameters": {"company_name": "Woodcorp"}}]
    db.tables["companies"] = [{"id": "c1", "name": "Woodcorp"}]
    db.tables["whatsapp_chats"] = [{"id": "chat1", "company_id": "c1", "user_id": "u1", "phone_number": "+971500000001",
                                    "customer_name": "Ahmed Khan", "name_confirmed": True, "status": "active_ai", "opted_out": False}]
    db.tables["leads"] = [{"id": "l1", "company_id": "c1", "chat_id": "chat1"}]
    db.tables["whatsapp_messages"] = [
        {"chat_id": "chat1", "sender": "customer", "text": "quote please", "created_at": ago(hours=9)},
        {"chat_id": "chat1", "sender": "system", "text": "Here is your quotation", "created_at": ago(hours=8)},
    ]
    db.tables["quotes"] = [{"id": "q1", "company_id": "c1", "lead_id": "l1", "user_id": "u1", "status": "dispatched",
                            "outcome": None, "quote_number": "Q-1", "customer_name": "Ahmed Khan", "sent_at": ago(hours=8),
                            "created_at": ago(hours=8), "valid_until": "2026-12-20", "public_token": "tok", "follow_up_log": []}]
    db.tables["customer_emails"] = []
    return db, sent


def test_whatsapp_quote_follow_up_is_sent_once_and_recorded(env):
    db, sent = env
    assert followups.run_whatsapp_quote_follow_ups("c1", CFG, NOW) == 1
    assert "Hi Ahmed!" in sent[0][1] and "Q-1" in sent[0][1] and "Woodcorp" in sent[0][1] and "STOP" in sent[0][1]
    q = db.tables["quotes"][0]
    assert q["wa_follow_up_sent_at"] and q["follow_up_log"][0]["kind"] == "quote_follow_up"
    assert db.tables["whatsapp_messages"][-1]["text"] == sent[0][1]  # shows in the chat history
    assert followups.run_whatsapp_quote_follow_ups("c1", CFG, NOW + timedelta(hours=1)) == 0  # never twice


@pytest.mark.parametrize("change", ["customer_replied", "opted_out", "taken_over", "window_closed", "accepted", "off"])
def test_whatsapp_follow_up_stop_rules(env, change):
    db, sent = env
    cfg = dict(CFG)
    if change == "customer_replied":
        db.tables["whatsapp_messages"].append({"chat_id": "chat1", "sender": "customer", "text": "thinking", "created_at": ago(hours=1)})
    elif change == "opted_out":
        db.tables["whatsapp_chats"][0]["opted_out"] = True
    elif change == "taken_over":
        db.tables["whatsapp_chats"][0]["status"] = "human_required"
    elif change == "window_closed":
        db.tables["whatsapp_messages"][0]["created_at"] = ago(hours=30)
    elif change == "accepted":
        db.tables["quotes"][0]["outcome"] = "accepted"
    else:
        cfg["wa_follow_up"] = False
    assert followups.run_whatsapp_quote_follow_ups("c1", cfg, NOW) == 0 and sent == []


def test_cap_of_two_automatic_messages_per_quote(env):
    db, sent = env
    db.tables["quotes"][0].update({"follow_up_sent_at": ago(hours=2), "expiry_reminder_sent_at": ago(hours=1)})
    assert followups.run_whatsapp_quote_follow_ups("c1", CFG, NOW) == 0


def test_business_hours_and_time_zone(env):
    db, sent = env
    night = datetime(2026, 11, 25, 18, 0, tzinfo=timezone.utc)  # 22:00 in Dubai
    assert not followups.within_business_hours(CFG, night)
    assert followups.within_business_hours({**CFG, "timezone": "America/New_York"}, night)  # 13:00 in New York
    sunday = datetime(2026, 11, 29, 7, 0, tzinfo=timezone.utc)
    assert not followups.within_business_hours(CFG, sunday)
    db.tables["company_settings"] = [{"company_id": "c1", "settings": CFG}]
    assert followups.run_all(night) == {"quote_follow_ups": 0, "chat_nudges": 0, "expiry_reminders": 0} and sent == []


def test_quiet_chat_nudge_once_per_silence(env):
    db, sent = env
    db.tables["quotes"] = []
    assert followups.run_quiet_chat_nudges("c1", CFG, NOW) == 1
    assert followups.run_quiet_chat_nudges("c1", CFG, NOW + timedelta(hours=2)) == 0
    # The customer speaks again and goes quiet again: one more nudge is allowed.
    db.tables["whatsapp_messages"].append({"chat_id": "chat1", "sender": "customer", "text": "ok", "created_at": (NOW + timedelta(hours=3)).isoformat()})
    db.tables["whatsapp_messages"].append({"chat_id": "chat1", "sender": "system", "text": "Which size?", "created_at": (NOW + timedelta(hours=3, minutes=1)).isoformat()})
    assert followups.run_quiet_chat_nudges("c1", CFG, NOW + timedelta(hours=8)) == 1
    assert len(sent) == 2


def test_no_nudge_when_we_owe_the_customer_a_reply(env):
    db, sent = env
    db.tables["quotes"] = []
    db.tables["whatsapp_messages"].append({"chat_id": "chat1", "sender": "customer", "text": "hello?", "created_at": ago(hours=5)})
    assert followups.run_quiet_chat_nudges("c1", CFG, NOW) == 0


def test_expiry_reminder_on_whatsapp(env):
    db, sent = env
    db.tables["quotes"][0]["valid_until"] = "2026-11-26"
    db.tables["quotes"][0]["sent_at"] = ago(hours=8)
    assert followups.run_expiry_reminders("c1", CFG, NOW) == 1
    assert "valid until 2026-11-26" in sent[0][1]
    assert followups.run_expiry_reminders("c1", CFG, NOW) == 0


def test_team_reminders_list_waiting_and_expiring(env):
    db, _ = env
    db.tables["quotes"].append({"id": "q2", "company_id": "c1", "status": "dispatched", "outcome": None, "quote_number": "Q-2",
                                "customer_name": "Sara", "sent_at": ago(days=5), "created_at": ago(days=5),
                                "valid_until": "2026-11-26", "total_cost": 500, "currency": "PKR"})
    r = followups.team_reminders("c1", CFG, NOW)
    assert [w["quote_number"] for w in r["waiting"]] == ["Q-2"] and r["waiting"][0]["days_waiting"] == 5
    assert [e["quote_number"] for e in r["expiring"]] == ["Q-2"]
    assert followups.team_reminders("c1", {**CFG, "team_reminders": False}, NOW)["enabled"] is False
