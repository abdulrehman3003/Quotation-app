# app/services/automation.py
"""
Per-company automation: settings, outbound webhooks and automatic follow-ups.
Everything here is opt-in and off by default, because each feature either
spends AI quota or contacts a customer without a person pressing a button.
"""
import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import socket
import threading
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from supabase import create_client, Client

from app.core.config import settings

logger = logging.getLogger(__name__)
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

DEFAULTS = {
    "auto_draft_quotes": False,
    "auto_follow_up": False,
    "follow_up_after_days": 3,
    "webhook_url": None,
    "webhook_secret": None,
    # Automatic WhatsApp follow-ups and reminders (app/services/followups.py); all off by default.
    "wa_follow_up": False,
    "wa_follow_up_after_hours": 6,
    "chat_nudge": False,
    "chat_nudge_after_hours": 4,
    "expiry_reminder": False,
    "expiry_reminder_days_before": 1,
    # Staff-only reminders in the app; on by default because they never contact a customer.
    "team_reminders": True,
    "team_reminder_after_days": 3,
    # Automatic customer messages are only sent inside business hours.
    "timezone": "Asia/Dubai",
    "business_hours_start": 9,
    "business_hours_end": 18,
    "business_days": ["mon", "tue", "wed", "thu", "fri", "sat"],
}

_BOUNDS = {
    "follow_up_after_days": (1, 30), "wa_follow_up_after_hours": (1, 22), "chat_nudge_after_hours": (1, 22),
    "expiry_reminder_days_before": (1, 7), "team_reminder_after_days": (1, 30),
    "business_hours_start": (0, 23), "business_hours_end": (1, 24),
}
_FLAGS = ("auto_draft_quotes", "auto_follow_up", "wa_follow_up", "chat_nudge", "expiry_reminder", "team_reminders")
MIGRATION_HINT = "Automation needs database migration v7 (database/migration_v7_automation.sql)."


class AutomationUnavailable(Exception):
    pass


def get_company_settings(company_id: str) -> dict:
    """Never raises: automation simply stays off if settings cannot be read."""
    result = dict(DEFAULTS)
    try:
        res = supabase.table("company_settings").select("settings").eq("company_id", company_id).execute()
        if res.data and isinstance(res.data[0].get("settings"), dict):
            result.update({k: v for k, v in res.data[0]["settings"].items() if k in DEFAULTS})
    except Exception as e:
        logger.debug(f"company_settings unavailable for {company_id}: {str(e)}")
    return result


def validate_webhook_url(url: str) -> str:
    """
    Only public https endpoints. Refusing private, loopback and link-local
    addresses stops the webhook being pointed at this server's own network.
    """
    parsed = urlparse((url or "").strip())
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Webhook URL must start with https://")
    if parsed.username or parsed.password:
        raise ValueError("Webhook URL must not contain credentials")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ValueError("Webhook URL host could not be resolved")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("Webhook URL must point to a public address")
    return parsed.geturl()


def save_company_settings(company_id: str, changes: dict) -> dict:
    current = get_company_settings(company_id)
    for flag in _FLAGS:
        if flag in changes and changes[flag] is not None:
            current[flag] = bool(changes[flag])
    for key, (low, high) in _BOUNDS.items():
        if changes.get(key) is not None:
            current[key] = min(max(int(changes[key]), low), high)
    if current["business_hours_end"] <= current["business_hours_start"]:
        raise ValueError("Business hours must end after they start.")
    if changes.get("timezone"):
        from zoneinfo import ZoneInfo
        try:
            ZoneInfo(str(changes["timezone"]))
        except Exception:
            raise ValueError("Unknown time zone. Use a name like Asia/Dubai or Asia/Karachi.")
        current["timezone"] = str(changes["timezone"])
    if changes.get("business_days") is not None:
        days = [d for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun") if d in {str(x).lower()[:3] for x in changes["business_days"]}]
        if not days:
            raise ValueError("Choose at least one business day.")
        current["business_days"] = days
    if "webhook_url" in changes:
        url = (changes["webhook_url"] or "").strip()
        if url:
            current["webhook_url"] = validate_webhook_url(url)
            current["webhook_secret"] = current.get("webhook_secret") or secrets.token_urlsafe(32)
        else:
            current["webhook_url"] = None
    try:
        supabase.table("company_settings").upsert({
            "company_id": company_id,
            "settings": current,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="company_id").execute()
    except Exception as e:
        logger.error(f"Failed to save company settings: {str(e)}")
        raise AutomationUnavailable(MIGRATION_HINT)
    return current


def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def quote_event_payload(event: str, quote: dict) -> dict:
    return {
        "event": event,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "quote": {
            "id": quote.get("id"),
            "number": quote.get("quote_number"),
            "status": quote.get("status"),
            "outcome": quote.get("outcome"),
            "currency": quote.get("currency") or "USD",
            "subtotal": float(quote.get("subtotal") or quote.get("total_cost") or 0),
            "total": float(quote.get("total_cost") or 0),
            "valid_until": quote.get("valid_until"),
            "sent_at": quote.get("sent_at"),
            "customer": {
                "name": quote.get("customer_name"),
                "email": quote.get("customer_email"),
                "phone": quote.get("customer_phone"),
                "company": quote.get("customer_company"),
            },
            "customer_comment": quote.get("customer_comment"),
            "items": [
                {k: i.get(k) for k in ("description", "quantity", "unit_price", "total_price", "category")}
                for i in (quote.get("itemized_breakdown") or []) if isinstance(i, dict)
            ],
        },
    }


def _deliver(url: str, secret: str, payload: dict):
    try:
        validate_webhook_url(url)  # re-check at send time: DNS may have changed since it was saved
        body = json.dumps(payload, default=str).encode()
        res = httpx.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "quote-webhook/1.0",
                "X-Webhook-Event": payload["event"],
                "X-Webhook-Signature": sign_payload(secret or "", body),
            },
            timeout=5.0,
            follow_redirects=False,
        )
        if res.status_code >= 300:
            logger.warning(f"Webhook {payload['event']} was answered with HTTP {res.status_code}")
    except Exception as e:
        logger.warning(f"Webhook {payload.get('event')} delivery failed: {str(e)}")


def emit_quote_event(company_id: str, event: str, quote: dict):
    """Fire-and-forget: a slow or broken customer endpoint must never block or fail a request."""
    try:
        cfg = get_company_settings(company_id)
        if not cfg.get("webhook_url"):
            return
        payload = quote_event_payload(event, quote)
        threading.Thread(target=_deliver, args=(cfg["webhook_url"], cfg.get("webhook_secret"), payload), daemon=True).start()
    except Exception as e:
        logger.warning(f"Could not queue webhook {event}: {str(e)}")


# ---------------------------------------------------------------- follow-ups

def build_follow_up_email(quote: dict, seller_name: str, company_name: str, link: str | None) -> tuple[str, str]:
    number = quote.get("quote_number") or ""
    greeting = f"Hello {quote['customer_name']}," if quote.get("customer_name") else "Hello,"
    sent_on = str(quote.get("sent_at") or quote.get("created_at") or "")[:10]
    total = f"{float(quote.get('total_cost') or 0):,.2f} {quote.get('currency') or 'USD'}"
    lines = [
        greeting,
        "",
        f"I am following up on quotation {number} that we sent on {sent_on}, for a total of {total}.".replace("  ", " "),
        "Please let me know if you have any questions or would like anything changed.",
    ]
    if quote.get("valid_until"):
        lines.append(f"The quotation is valid until {quote['valid_until']}.")
    if link:
        lines += ["", "You can view, print or accept it here:", link]
    lines += ["", "Best regards,", seller_name or company_name or ""]
    if seller_name and company_name:
        lines.append(company_name)
    subject = f"Following up on quotation {number}".strip()
    if company_name:
        subject += f" from {company_name}"
    return subject, "\n".join(lines).rstrip()


def is_due_for_follow_up(quote: dict, after_days: int, now: datetime) -> bool:
    if quote.get("status") != "dispatched" or quote.get("outcome") or quote.get("follow_up_sent_at"):
        return False
    if not quote.get("customer_email"):
        return False
    valid_until = quote.get("valid_until")
    if valid_until:
        try:
            if date.fromisoformat(str(valid_until)[:10]) < now.date():
                return False
        except ValueError:
            pass
    try:
        sent_at = datetime.fromisoformat(str(quote.get("sent_at") or "").replace("Z", "+00:00"))
    except ValueError:
        return False
    if not sent_at.tzinfo:
        sent_at = sent_at.replace(tzinfo=timezone.utc)
    return now - sent_at >= timedelta(days=after_days)


def run_follow_ups(now: datetime | None = None) -> int:
    """
    Sends at most one follow-up email per sent quote, for companies that turned
    automatic follow-ups on. A quote is claimed in the database before the email
    goes out, so a crash or a second worker can never send it twice.
    """
    from app.core.credentials import get_gmail_credentials
    from app.api.emails import send_smtp_email
    from app.api.quotes import public_quote_url

    now = now or datetime.now(timezone.utc)
    try:
        rows = supabase.table("company_settings").select("company_id, settings").execute().data or []
    except Exception:
        return 0  # migration v7 not applied: feature is off

    from app.services import followups

    sent_count = 0
    for row in rows:
        cfg = {**DEFAULTS, **(row.get("settings") or {})}
        if not cfg.get("auto_follow_up"):
            continue
        company_id = row["company_id"]
        from app.core import plans
        if plans.is_suspended(company_id) or not followups.within_business_hours(cfg, now):
            continue
        try:
            quotes = supabase.table("quotes").select("*").eq("company_id", company_id)\
                .eq("status", "dispatched").is_("outcome", "null").is_("follow_up_sent_at", "null").execute().data or []
        except Exception as e:
            logger.warning(f"Follow-up scan failed for company {company_id}: {str(e)}")
            continue

        for quote in quotes:
            if not is_due_for_follow_up(quote, int(cfg.get("follow_up_after_days") or 3), now):
                continue
            if followups.automatic_count(quote) >= followups.MAX_AUTOMATIC_PER_QUOTE:
                continue
            sent_at = followups.parse_ts(quote.get("sent_at")) or followups.parse_ts(quote.get("created_at"))
            if followups._customer_emailed_since(quote, sent_at):
                continue  # the customer wrote back: a person should answer, not an automatic reminder
            gmail_email, gmail_password = get_gmail_credentials(quote.get("user_id"))
            if not gmail_email or not gmail_password:
                break  # no mailbox for this company; nothing can be sent
            claim = supabase.table("quotes").update({"follow_up_sent_at": now.isoformat()})\
                .eq("id", quote["id"]).is_("follow_up_sent_at", "null").is_("outcome", "null").execute()
            if not claim.data:
                continue
            seller, company_name = {}, ""
            try:
                u = supabase.table("users").select("name, default_quote_parameters").eq("id", quote.get("user_id")).execute()
                seller = u.data[0] if u.data else {}
                params = seller.get("default_quote_parameters") if isinstance(seller.get("default_quote_parameters"), dict) else {}
                company_name = str(params.get("company_name") or "").strip()
            except Exception:
                pass
            subject, body = build_follow_up_email(quote, seller.get("name") or "", company_name, public_quote_url(quote.get("public_token")))
            try:
                if send_smtp_email(quote["customer_email"], subject, body, gmail_email, gmail_password):
                    sent_count += 1
                    followups.record(quote, None, "quote_follow_up", "email", body, now)
                    logger.warning(f"Automatic follow-up sent for quote {quote.get('quote_number') or quote['id']}.")
            except Exception as e:
                # Stays claimed: one missed follow-up is better than a customer emailed repeatedly.
                logger.error(f"Follow-up email failed for quote {quote['id']}: {getattr(e, 'detail', str(e))}")
    return sent_count
