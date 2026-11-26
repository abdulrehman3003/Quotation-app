# app/services/followups.py
"""
Automatic follow-ups, all opt-in per workspace (Settings > Automation):

  * WhatsApp quote follow-up: one nudge on a WhatsApp quote the customer hasn't
    answered, a few hours after it was sent.
  * Quiet-chat nudge: one nudge when a customer stops replying before a quote.
  * Expiry reminder: one reminder shortly before a quote's validity ends
    (WhatsApp when possible, otherwise email).
  * Team reminders: quotes waiting on the customer, shown to staff in the app only.

Rules for every automatic customer message:
  * at most MAX_AUTOMATIC_PER_QUOTE per quote, counting the email follow-up;
  * never after the customer has replied, accepted or declined, or when a person
    has taken over the chat, or the customer replied STOP;
  * only inside business hours in the workspace's time zone;
  * WhatsApp only inside Meta's 24-hour customer-service window (free-form
    messages after that need approved templates);
  * claimed in the database before sending, so a second worker can't double-send;
  * recorded in the chat history and on the quote's follow_up_log.
"""
import logging
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from supabase import create_client, Client

from app.core.config import settings

logger = logging.getLogger(__name__)
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

MAX_AUTOMATIC_PER_QUOTE = 2
WHATSAPP_WINDOW = timedelta(hours=23)  # Meta allows 24h; keep a margin
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# --- time helpers ------------------------------------------------------------------------------

def parse_ts(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def company_zone(cfg: dict) -> ZoneInfo:
    try:
        return ZoneInfo(cfg.get("timezone") or "Asia/Dubai")
    except Exception:
        return ZoneInfo("UTC")


def within_business_hours(cfg: dict, now: datetime) -> bool:
    local = now.astimezone(company_zone(cfg))
    days = cfg.get("business_days") or WEEKDAYS[:6]
    if WEEKDAYS[local.weekday()] not in days:
        return False
    start, end = int(cfg.get("business_hours_start", 9)), int(cfg.get("business_hours_end", 18))
    return start <= local.hour < end


def first_name(name: str | None) -> str:
    from app.api.whatsapp import first_name as wa_first_name
    return wa_first_name(name)


# --- shared lookups ------------------------------------------------------------------------------

def automatic_count(quote: dict) -> int:
    """Automatic messages already claimed for this quote (email follow-up, WhatsApp follow-up, expiry reminder)."""
    return sum(int(bool(quote.get(c))) for c in ("follow_up_sent_at", "wa_follow_up_sent_at", "expiry_reminder_sent_at"))


def chat_for_quote(quote: dict) -> dict | None:
    lead_id = quote.get("lead_id")
    if not lead_id:
        return None
    lead = supabase.table("leads").select("chat_id").eq("id", lead_id).execute().data or []
    chat_id = lead[0].get("chat_id") if lead else None
    if not chat_id:
        return None
    rows = supabase.table("whatsapp_chats").select("*").eq("id", chat_id).execute().data or []
    return rows[0] if rows else None


def last_message_times(chat_id: str) -> tuple[datetime | None, datetime | None]:
    """(last customer message, last message of any kind) in a chat."""
    rows = supabase.table("whatsapp_messages").select("sender,created_at").eq("chat_id", chat_id)\
        .order("created_at", desc=True).limit(50).execute().data or []
    last_any = parse_ts(rows[0]["created_at"]) if rows else None
    last_customer = next((parse_ts(r["created_at"]) for r in rows if r.get("sender") == "customer"), None)
    return last_customer, last_any


def can_message_on_whatsapp(chat: dict | None, now: datetime) -> tuple[bool, datetime | None]:
    """Chat exists, customer not opted out, AI still in charge, and inside the 24-hour window."""
    if not chat or chat.get("opted_out") or chat.get("status") == "human_required":
        return False, None
    last_customer, _ = last_message_times(chat["id"])
    if not last_customer or now - last_customer > WHATSAPP_WINDOW:
        return False, last_customer
    return True, last_customer


def business_name(user_id: str | None, company_id: str) -> str:
    from app.api.whatsapp import business_context
    return business_context(user_id or "", company_id)["company"]


def record(quote: dict | None, chat_id: str | None, kind: str, channel: str, text: str, now: datetime) -> None:
    """Writes the automatic message to the chat history and the quote's log."""
    if chat_id and channel == "whatsapp":
        try:
            supabase.table("whatsapp_messages").insert({"chat_id": chat_id, "sender": "system", "text": text}).execute()
        except Exception as e:
            logger.warning(f"Could not record follow-up in chat {chat_id}: {e}")
    if quote:
        entry = {"at": now.isoformat(), "kind": kind, "channel": channel, "text": text[:1000]}
        log = [e for e in (quote.get("follow_up_log") or []) if isinstance(e, dict)] + [entry]
        try:
            supabase.table("quotes").update({"follow_up_log": log}).eq("id", quote["id"]).execute()
            quote["follow_up_log"] = log
        except Exception as e:
            logger.warning(f"Could not record follow-up on quote {quote.get('id')}: {e}")


def claim(quote_id: str, column: str, now: datetime) -> bool:
    """Marks the quote before sending; False if another worker got there first or it's no longer open."""
    res = supabase.table("quotes").update({column: now.isoformat()}).eq("id", quote_id)\
        .is_(column, "null").is_("outcome", "null").execute()
    return bool(res.data)


# --- message texts ------------------------------------------------------------------------------------

def quote_follow_up_text(quote: dict, company: str, link: str | None) -> str:
    name = first_name(quote.get("customer_name"))
    number = quote.get("quote_number") or "your quotation"
    text = (f"Hi {name}! " if name else "Hi! ") + (
        f"Just checking in on quotation {number} from {company}. Do you have any questions, or would you like to go ahead?")
    if link:
        text += f"\n\nYou can view or accept it here: {link}"
    return text + "\n\n(Reply STOP to turn off reminders.)"


def expiry_text(quote: dict, company: str, link: str | None) -> str:
    name = first_name(quote.get("customer_name"))
    number = quote.get("quote_number") or "your quotation"
    until = str(quote.get("valid_until") or "")[:10]
    text = (f"Hi {name}! " if name else "Hi! ") + (
        f"A quick reminder that quotation {number} from {company} is valid until {until}. "
        "Let us know if you'd like to go ahead or have any questions.")
    if link:
        text += f"\n\n{link}"
    return text + "\n\n(Reply STOP to turn off reminders.)"


def nudge_text(chat: dict, company: str, user_id: str) -> str:
    """A one-line check-in that mentions what the customer was asking about (AI, with a plain fallback)."""
    from app.api.whatsapp import chat_history
    name = first_name(chat.get("customer_name")) if chat.get("name_confirmed", True) else ""
    fallback = (f"Hi {name}! " if name else "Hi! ") + (
        f"Just checking in from {company}. Would you still like help with your enquiry? Reply any time and we'll pick up "
        "where we left off.")
    try:
        from app.core.credentials import get_ai_api_key
        from app.services import ai_provider
        key = get_ai_api_key(user_id=user_id)
        history = chat_history(chat["id"], "", limit=10)
        if not key or not history:
            return fallback
        convo = "\n".join(f"{'Customer' if t['role'] == 'user' else company}: {t['content'][:400]}" for t in history)
        client = ai_provider.make_client(key, timeout=30.0)
        res = client.chat.completions.create(model=ai_provider.active_model(), temperature=0.3, messages=[
            {"role": "system", "content": (
                f"Write ONE short, friendly WhatsApp check-in (max 30 words) from {company} to a customer who stopped "
                "replying. Mention what they were asking about. Greet them by first name only if they told you their name "
                "in the conversation. Never mention prices or invent details. No emojis overload, no markdown.")},
            {"role": "user", "content": convo},
        ])
        text = (res.choices[0].message.content or "").strip().strip('"')
        return text if 0 < len(text) <= 400 else fallback
    except Exception as e:
        logger.warning(f"Nudge text fell back to the template: {e}")
        return fallback


# --- the three customer-facing jobs ----------------------------------------------------------------------

def _send_whatsapp(phone: str, text: str, user_id: str) -> bool:
    from app.api.whatsapp import send_twilio_whatsapp
    ok, reason = send_twilio_whatsapp(phone, text, user_id)
    if not ok:
        logger.warning(f"Automatic WhatsApp message not delivered: {reason}")
    return ok


def run_whatsapp_quote_follow_ups(company_id: str, cfg: dict, now: datetime) -> int:
    if not cfg.get("wa_follow_up"):
        return 0
    from app.api.quotes import public_quote_url
    after = timedelta(hours=int(cfg.get("wa_follow_up_after_hours") or 6))
    quotes = supabase.table("quotes").select("*").eq("company_id", company_id).eq("status", "dispatched")\
        .is_("outcome", "null").is_("wa_follow_up_sent_at", "null").execute().data or []
    sent = 0
    for quote in quotes:
        sent_at = parse_ts(quote.get("sent_at")) or parse_ts(quote.get("created_at"))
        if not sent_at or now - sent_at < after or automatic_count(quote) >= MAX_AUTOMATIC_PER_QUOTE:
            continue
        chat = chat_for_quote(quote)
        ok, last_customer = can_message_on_whatsapp(chat, now)
        if not ok or (last_customer and last_customer > sent_at):
            continue  # outside the window, opted out, taken over, or the customer already replied after the quote
        if not claim(quote["id"], "wa_follow_up_sent_at", now):
            continue
        text = quote_follow_up_text(quote, business_name(quote.get("user_id"), company_id), public_quote_url(quote.get("public_token")))
        if _send_whatsapp(chat["phone_number"], text, quote.get("user_id") or chat.get("user_id")):
            record(quote, chat["id"], "quote_follow_up", "whatsapp", text, now)
            sent += 1
    return sent


def run_quiet_chat_nudges(company_id: str, cfg: dict, now: datetime) -> int:
    if not cfg.get("chat_nudge"):
        return 0
    after = timedelta(hours=int(cfg.get("chat_nudge_after_hours") or 4))
    chats = supabase.table("whatsapp_chats").select("*").eq("company_id", company_id).eq("status", "active_ai").execute().data or []
    sent = 0
    for chat in chats:
        if chat.get("opted_out"):
            continue
        last_customer, last_any = last_message_times(chat["id"])
        if not last_customer or not last_any:
            continue
        silent_for = now - last_customer
        if silent_for < after or silent_for > WHATSAPP_WINDOW or last_any <= last_customer:
            continue  # not quiet long enough, window closed, or we owe them a reply rather than a nudge
        nudged = parse_ts(chat.get("nudge_sent_at"))
        if nudged and nudged > last_customer:
            continue  # one nudge per silence
        leads = supabase.table("leads").select("id").eq("chat_id", chat["id"]).execute().data or []
        if leads:
            recent_quotes = supabase.table("quotes").select("id,created_at").in_("lead_id", [l["id"] for l in leads]).execute().data or []
            if any((parse_ts(q.get("created_at")) or last_customer) >= last_customer for q in recent_quotes):
                continue  # a quote went out since; the quote follow-up covers it
        res = supabase.table("whatsapp_chats").update({"nudge_sent_at": now.isoformat()}).eq("id", chat["id"]).execute()
        if not res.data:
            continue
        text = nudge_text(chat, business_name(chat.get("user_id"), company_id), chat.get("user_id"))
        if _send_whatsapp(chat["phone_number"], text, chat.get("user_id")):
            record(None, chat["id"], "chat_nudge", "whatsapp", text, now)
            sent += 1
    return sent


def run_expiry_reminders(company_id: str, cfg: dict, now: datetime) -> int:
    if not cfg.get("expiry_reminder"):
        return 0
    from app.api.quotes import public_quote_url
    days_before = int(cfg.get("expiry_reminder_days_before") or 1)
    today = now.astimezone(company_zone(cfg)).date()
    quotes = supabase.table("quotes").select("*").eq("company_id", company_id).eq("status", "dispatched")\
        .is_("outcome", "null").is_("expiry_reminder_sent_at", "null").execute().data or []
    sent = 0
    for quote in quotes:
        try:
            until = date.fromisoformat(str(quote.get("valid_until") or "")[:10])
        except ValueError:
            continue
        if not (today <= until <= today + timedelta(days=days_before)) or automatic_count(quote) >= MAX_AUTOMATIC_PER_QUOTE:
            continue
        chat = chat_for_quote(quote)
        sent_at = parse_ts(quote.get("sent_at")) or parse_ts(quote.get("created_at"))
        ok, last_customer = can_message_on_whatsapp(chat, now)
        if chat and (chat.get("opted_out") or chat.get("status") == "human_required"):
            continue
        if last_customer and sent_at and last_customer > sent_at:
            continue  # the customer has been talking to us since; no reminder needed
        company = business_name(quote.get("user_id"), company_id)
        link = public_quote_url(quote.get("public_token"))
        text = expiry_text(quote, company, link)
        if ok:
            if claim(quote["id"], "expiry_reminder_sent_at", now) and _send_whatsapp(chat["phone_number"], text, quote.get("user_id")):
                record(quote, chat["id"], "expiry_reminder", "whatsapp", text, now)
                sent += 1
        elif quote.get("customer_email") and not _customer_emailed_since(quote, sent_at):
            from app.core.credentials import get_gmail_credentials
            from app.api.emails import send_smtp_email
            mail, pwd = get_gmail_credentials(quote.get("user_id"))
            if not mail or not pwd or not claim(quote["id"], "expiry_reminder_sent_at", now):
                continue
            subject = f"Reminder: quotation {quote.get('quote_number') or ''} valid until {str(quote.get('valid_until'))[:10]}".strip()
            body = text.replace("(Reply STOP to turn off reminders.)", "").strip()
            try:
                if send_smtp_email(quote["customer_email"], subject, body, mail, pwd):
                    record(quote, None, "expiry_reminder", "email", body, now)
                    sent += 1
            except Exception as e:
                logger.error(f"Expiry reminder email failed for quote {quote['id']}: {getattr(e, 'detail', str(e))}")
    return sent


def _customer_emailed_since(quote: dict, since: datetime | None) -> bool:
    email = (quote.get("customer_email") or "").strip().lower()
    if not email or not since:
        return False
    try:
        rows = supabase.table("customer_emails").select("created_at,sender_email").eq("company_id", quote["company_id"]).execute().data or []
    except Exception:
        return False
    return any(email in (r.get("sender_email") or "").lower() and (parse_ts(r.get("created_at")) or since) > since for r in rows)


def run_all(now: datetime | None = None) -> dict:
    """One automation pass over every workspace; called by the background worker."""
    from app.core import plans
    from app.services.automation import DEFAULTS
    now = now or datetime.now(timezone.utc)
    totals = {"quote_follow_ups": 0, "chat_nudges": 0, "expiry_reminders": 0}
    try:
        rows = supabase.table("company_settings").select("company_id, settings").execute().data or []
    except Exception:
        return totals
    for row in rows:
        cfg = {**DEFAULTS, **(row.get("settings") or {})}
        company_id = row["company_id"]
        if not any(cfg.get(k) for k in ("wa_follow_up", "chat_nudge", "expiry_reminder")):
            continue
        if plans.is_suspended(company_id) or not within_business_hours(cfg, now):
            continue
        for key, job in (("quote_follow_ups", run_whatsapp_quote_follow_ups), ("chat_nudges", run_quiet_chat_nudges),
                         ("expiry_reminders", run_expiry_reminders)):
            try:
                totals[key] += job(company_id, cfg, now)
            except Exception as e:
                logger.warning(f"{key} failed for company {company_id}: {e}")
    if any(totals.values()):
        logger.info(f"Automatic follow-ups sent: {totals}")
    return totals


# --- team reminders (staff only) -------------------------------------------------------------------------

def team_reminders(company_id: str, cfg: dict, now: datetime | None = None) -> dict:
    """Quotes waiting on the customer, and quotes about to expire, for the staff dashboard."""
    now = now or datetime.now(timezone.utc)
    if not cfg.get("team_reminders", True):
        return {"enabled": False, "waiting": [], "expiring": []}
    wait_days = int(cfg.get("team_reminder_after_days") or 3)
    today = now.astimezone(company_zone(cfg)).date()
    quotes = supabase.table("quotes").select("*").eq("company_id", company_id).eq("status", "dispatched")\
        .is_("outcome", "null").execute().data or []
    waiting, expiring = [], []
    for q in quotes:
        sent_at = parse_ts(q.get("sent_at")) or parse_ts(q.get("created_at"))
        entry = {
            "quote_id": q["id"], "lead_id": q.get("lead_id"), "quote_number": q.get("quote_number"),
            "customer": q.get("customer_name") or q.get("customer_email") or "Customer",
            "total": float(q.get("total_cost") or 0), "currency": q.get("currency") or "USD",
            "sent_at": sent_at.isoformat() if sent_at else None, "valid_until": q.get("valid_until"),
            "automatic_messages": automatic_count(q),
        }
        if sent_at and now - sent_at >= timedelta(days=wait_days):
            waiting.append({**entry, "days_waiting": (now - sent_at).days})
        try:
            until = date.fromisoformat(str(q.get("valid_until") or "")[:10])
            if today <= until <= today + timedelta(days=2):
                expiring.append({**entry, "days_left": (until - today).days})
        except ValueError:
            pass
    waiting.sort(key=lambda e: -e["days_waiting"])
    expiring.sort(key=lambda e: e["days_left"])
    return {"enabled": True, "after_days": wait_days, "waiting": waiting, "expiring": expiring}
