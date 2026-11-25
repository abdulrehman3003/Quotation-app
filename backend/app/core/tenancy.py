# app/core/tenancy.py
"""
Company (tenant) membership helpers shared by the admin panel and self-service settings.

A company is the isolation boundary: data rows carry company_id, and teammates in one
company share Gemini/Gmail/Twilio credentials (see core/credentials.py). Two different
companies must never point at the same mailbox or WhatsApp number, otherwise:
  - the email poller ingests the same inbox into both companies, and replies go out
    from the other company's address;
  - the WhatsApp webhook routes by the Twilio "To" number and picks whichever user it
    finds first, so one company's customers land in the other's pipeline.
find_credential_clash() enforces that.
"""
import logging

from fastapi import HTTPException, status
from supabase import create_client, Client

from app.core.config import settings
from app.core.encryption import decrypt_key
from app.core.security import DEFAULT_COMPANY_ID

logger = logging.getLogger(__name__)

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

# Tables whose rows belong to the user who created them (user_id) and a company (company_id).
USER_OWNED_TABLES = ("leads", "quotes", "knowledge_base", "customer_emails", "whatsapp_chats", "dispatched_quotes")


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_phone(value: str | None) -> str:
    """'whatsapp:+1 (555) 010-0000' and '+15550100000' compare equal."""
    raw = (value or "").strip().lower().replace("whatsapp:", "")
    return "".join(ch for ch in raw if ch.isdigit() or ch == "+")


def get_company(company_id: str) -> dict | None:
    if not company_id or company_id == DEFAULT_COMPANY_ID:
        return None
    res = supabase.table("companies").select("*").eq("id", company_id).execute()
    return res.data[0] if res.data else None


def require_company(company_id: str) -> dict:
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    return company


def company_name_taken(name: str, exclude_id: str | None = None) -> bool:
    wanted = (name or "").strip().lower()
    res = supabase.table("companies").select("id,name").execute()
    return any(
        (c.get("name") or "").strip().lower() == wanted and c.get("id") != exclude_id
        for c in (res.data or [])
    )


def _user_identities(profile: dict) -> tuple[str, str]:
    enc_mail = profile.get("encrypted_gmail_email")
    enc_phone = profile.get("encrypted_twilio_phone")
    return (
        normalize_email(decrypt_key(enc_mail)) if enc_mail else "",
        normalize_phone(decrypt_key(enc_phone)) if enc_phone else "",
    )


def find_credential_clash(
    user_id: str,
    company_id: str,
    gmail_email: str | None = None,
    twilio_phone: str | None = None,
) -> str | None:
    """
    Returns a human-readable reason when gmail_email or twilio_phone is already used by a
    user (or a Google/Microsoft-connected mailbox) in a *different* company. Sharing inside
    the same company is allowed. Returns None when there is no clash.
    """
    mail = normalize_email(gmail_email)
    phone = normalize_phone(twilio_phone)
    if not mail and not phone:
        return None

    users = supabase.table("users").select("*").execute().data or []
    company_names = {c["id"]: c.get("name") for c in (supabase.table("companies").select("id,name").execute().data or [])}

    def label(cid: str | None) -> str:
        return f'"{company_names.get(cid) or "another company"}"'

    for other in users:
        if other.get("id") == user_id or (other.get("company_id") or DEFAULT_COMPANY_ID) == company_id:
            continue
        other_mail, other_phone = _user_identities(other)
        if mail and other_mail == mail:
            return f"The mailbox {mail} is already used by {label(other.get('company_id'))}. Each company needs its own mailbox."
        if phone and other_phone == phone:
            return f"The WhatsApp number {phone} is already used by {label(other.get('company_id'))}. Each company needs its own number."

    if mail:
        try:
            conns = supabase.table("mail_connections").select("user_id,company_id,email").execute().data or []
        except Exception:
            conns = []
        for c in conns:
            if c.get("user_id") != user_id and c.get("company_id") != company_id and normalize_email(c.get("email")) == mail:
                return f"The mailbox {mail} is already connected by {label(c.get('company_id'))}. Each company needs its own mailbox."
    return None


def assert_no_credential_clash(user_id: str, company_id: str, gmail_email: str | None = None, twilio_phone: str | None = None) -> None:
    reason = find_credential_clash(user_id, company_id, gmail_email, twilio_phone)
    if reason:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)


def assert_user_can_join(user_id: str, target_company_id: str) -> None:
    """Checks the user's already-saved mailbox / WhatsApp number against companies other than the target."""
    res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        return
    mail, phone = _user_identities(res.data[0])
    try:
        conn = supabase.table("mail_connections").select("email").eq("user_id", user_id).execute().data or []
    except Exception:
        conn = []
    assert_no_credential_clash(user_id, target_company_id, mail or None, phone or None)
    if conn:
        assert_no_credential_clash(user_id, target_company_id, conn[0].get("email"), None)


def move_user_to_company(user_id: str, target_company_id: str) -> dict:
    """
    Reassigns a user to target_company_id. Their records follow them only when they were the
    sole member of the old company (a personal workspace); records in a shared company stay
    with that company so teammates keep them. Returns {"from": old_id, "moved_records": bool}.
    """
    company = require_company(target_company_id)
    res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    profile = res.data[0]
    old_company_id = profile.get("company_id") or DEFAULT_COMPANY_ID
    if old_company_id == target_company_id:
        return {"from": old_company_id, "moved_records": False}

    assert_user_can_join(user_id, target_company_id)

    members = supabase.table("users").select("id").eq("company_id", old_company_id).execute().data or []
    sole_member = old_company_id != DEFAULT_COMPANY_ID and all(m.get("id") == user_id for m in members)

    params = profile.get("default_quote_parameters") if isinstance(profile.get("default_quote_parameters"), dict) else {}
    supabase.table("users").update({
        "company_id": target_company_id,
        "default_quote_parameters": {**params, "company_name": company.get("name")},
    }).eq("id", user_id).execute()

    if sole_member:
        for tbl in USER_OWNED_TABLES:
            try:
                supabase.table(tbl).update({"company_id": target_company_id})\
                    .eq("user_id", user_id).eq("company_id", old_company_id).execute()
            except Exception as e:
                logger.warning(f"Could not move {tbl} rows for user {user_id}: {str(e)}")
    try:
        supabase.table("mail_connections").update({"company_id": target_company_id}).eq("user_id", user_id).execute()
    except Exception:
        pass

    logger.info(f"Moved user {user_id} from company {old_company_id} to {target_company_id} (records moved: {sole_member})")
    return {"from": old_company_id, "moved_records": sole_member}
