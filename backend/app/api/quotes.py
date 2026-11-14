# app/api/quotes.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Optional
from datetime import date, datetime, timedelta, timezone
from pydantic import BaseModel
import secrets
from app.core.security import get_current_user
from app.schemas.pydantic_models import QuoteResponse
from app.services.ai_engine import run_quote_engine
from app.services.automation import emit_quote_event
from app.services.pricing import normalize_items, compute_totals, items_needing_review, clamp_percent
from supabase import create_client, Client
from app.core.config import settings
from decimal import Decimal
import logging
import re
import json

router = APIRouter(prefix="/quotes", tags=["Quotes"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

EMAIL_PATTERN = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
PHONE_PATTERN = re.compile(r'\+?[0-9]{3}[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,8}')
NAME_PATTERN = re.compile(r'(?:Thank you,\s*|Thanks,\s*|Manager,\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)')
WHATSAPP_PHONE_PATTERN = re.compile(r'^Phone:\s*(\S+)', re.MULTILINE)

def resolve_lead_customer(lead: dict, company_id: str, exclude_emails: set[str] | None = None) -> dict:
    """
    Extracts customer name/email/phone for a lead. WhatsApp leads are resolved
    from their own chat (lead.chat_id, falling back to the phone in raw_text),
    never from an arbitrary chat in the company.
    """
    raw_text = lead.get("raw_text", "") or ""
    excluded = exclude_emails or set()
    found_emails = [m for m in EMAIL_PATTERN.findall(raw_text) if m.lower() not in excluded]
    phone_match = PHONE_PATTERN.search(raw_text)
    customer = {
        "name": "Customer",
        "email": found_emails[0] if found_emails else None,
        "phone": phone_match.group(0) if phone_match else None,
    }

    if lead.get("source") == "whatsapp":
        chat = None
        if lead.get("chat_id"):
            chat_res = supabase.table("whatsapp_chats").select("customer_name", "phone_number")\
                .eq("id", lead["chat_id"]).eq("company_id", company_id).execute()
            chat = chat_res.data[0] if chat_res.data else None
        if not chat:
            wa_phone = WHATSAPP_PHONE_PATTERN.search(raw_text)
            if wa_phone:
                chat_res = supabase.table("whatsapp_chats").select("customer_name", "phone_number")\
                    .eq("company_id", company_id).eq("phone_number", wa_phone.group(1)).execute()
                chat = chat_res.data[0] if chat_res.data else None
        if chat:
            customer["name"] = chat.get("customer_name") or "WhatsApp Lead"
            customer["phone"] = chat.get("phone_number")
        else:
            customer["name"] = "WhatsApp Lead"
    else:
        name_match = NAME_PATTERN.search(raw_text)
        if name_match:
            customer["name"] = name_match.group(1).strip()
        else:
            customer["name"] = (lead.get("title") or "Customer").replace("Request for Quote:", "").strip() or "Customer"

    return customer

# Columns added by database/migration_v6_quote_lifecycle.sql. Writes fall back to
# the original columns when the migration has not been applied yet.
V6_COLUMNS = {
    "follow_up_sent_at",
    "quote_number", "currency", "subtotal", "discount_percent", "tax_percent", "valid_until",
    "customer_name", "customer_email", "customer_phone", "customer_company", "review_notes",
    "public_token", "sent_at", "first_viewed_at", "last_viewed_at", "view_count",
    "outcome", "outcome_source", "responded_at", "customer_comment",
}
DEFAULT_VALIDITY_DAYS = 30
FOLLOW_UP_AFTER_DAYS = 3


def _is_missing_column_error(err: Exception) -> bool:
    text = str(err)
    return "PGRST204" in text or "42703" in text or ("column" in text.lower() and "does not exist" in text.lower())


def insert_quote(payload: dict):
    try:
        return supabase.table("quotes").insert(payload).execute()
    except Exception as err:
        if not _is_missing_column_error(err):
            raise
        logger.warning("quotes table is missing v6 columns; run database/migration_v6_quote_lifecycle.sql")
        legacy = {k: v for k, v in payload.items() if k not in V6_COLUMNS}
        return supabase.table("quotes").insert(legacy).execute()


def update_quote_row(quote_id: str, company_id: str, payload: dict):
    try:
        return supabase.table("quotes").update(payload).eq("id", quote_id).eq("company_id", company_id).execute()
    except Exception as err:
        if not _is_missing_column_error(err):
            raise
        logger.warning("quotes table is missing v6 columns; run database/migration_v6_quote_lifecycle.sql")
        legacy = {k: v for k, v in payload.items() if k not in V6_COLUMNS}
        if not legacy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="This feature needs database migration v6 (database/migration_v6_quote_lifecycle.sql)."
            )
        return supabase.table("quotes").update(legacy).eq("id", quote_id).eq("company_id", company_id).execute()


def new_quote_number() -> str:
    return f"Q-{datetime.now(timezone.utc):%y%m%d}-{secrets.token_hex(2).upper()}"


def new_public_token() -> str:
    return secrets.token_urlsafe(24)


def quote_defaults(user_profile: dict | None) -> dict:
    """Per-workspace defaults applied to a freshly generated quote."""
    params = (user_profile or {}).get("default_quote_parameters") or {}
    if not isinstance(params, dict):
        params = {}
    try:
        validity_days = int(params.get("quote_validity_days") or DEFAULT_VALIDITY_DAYS)
    except (TypeError, ValueError):
        validity_days = DEFAULT_VALIDITY_DAYS
    validity_days = min(max(validity_days, 1), 365)
    return {
        "currency": str(params.get("currency") or "USD").upper()[:3],
        "tax_percent": float(clamp_percent(params.get("tax_percent"))),
        "valid_until": (date.today() + timedelta(days=validity_days)).isoformat(),
        "company_name": str(params.get("company_name") or "").strip(),
    }


def build_quote_fields(ai_output, user_profile: dict | None) -> dict:
    """Database fields for a quote produced by the AI engine (shared by the pipeline and WhatsApp)."""
    defaults = quote_defaults(user_profile)
    items = normalize_items(ai_output.itemized_breakdown)
    totals = compute_totals(items, 0, defaults["tax_percent"])
    return {
        "material_cost": totals["material_cost"],
        "labor_cost": totals["labor_cost"],
        "subtotal": totals["subtotal"],
        "discount_percent": 0,
        "tax_percent": totals["tax_percent"],
        "total_cost": totals["total_cost"],
        "itemized_breakdown": items,
        "email_draft": ai_output.email_draft,
        "currency": defaults["currency"],
        "valid_until": defaults["valid_until"],
        "quote_number": new_quote_number(),
        "public_token": new_public_token(),
        "customer_name": ai_output.customer_name,
        "customer_email": ai_output.customer_email,
        "customer_phone": ai_output.customer_phone,
        "customer_company": ai_output.customer_company,
        "review_notes": list(ai_output.review_notes or []),
    }


def company_display_name(company_id: str, user_profile: dict | None = None) -> str:
    params = (user_profile or {}).get("default_quote_parameters") or {}
    if isinstance(params, dict) and str(params.get("company_name") or "").strip():
        return str(params["company_name"]).strip()
    try:
        res = supabase.table("companies").select("name").eq("id", company_id).execute()
        if res.data and res.data[0].get("name"):
            return res.data[0]["name"]
    except Exception:
        pass
    return ""


def public_quote_url(token: str | None) -> str | None:
    if not token or not settings.FRONTEND_URL:
        return None
    return f"{settings.FRONTEND_URL.rstrip('/')}/q/{token}"


def safe_parse_quote(q: dict) -> dict:
    if not q:
        return q
    breakdown = q.get("itemized_breakdown")
    if isinstance(breakdown, str):
        try:
            breakdown = json.loads(breakdown)
        except Exception:
            breakdown = []
    q["itemized_breakdown"] = normalize_items(breakdown if isinstance(breakdown, list) else [])
    notes = q.get("review_notes")
    q["review_notes"] = [str(n) for n in notes] if isinstance(notes, list) else []
    return q


def _get_company_quote(quote_id: str, company_id: str) -> dict:
    response = supabase.table("quotes").select("*").eq("id", quote_id).eq("company_id", company_id).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found or unauthorized")
    return response.data[0]


def explain_ai_failure(error_text: str) -> str:
    """Turns an AI provider failure into something the user can act on (never echoes the raw error)."""
    text = error_text.lower()
    if "no gemini api key" in text:
        return "No Gemini API key is connected. Add one in Settings to generate quotes."
    if "reported as leaked" in text:
        return ("Google has disabled your Gemini API key because it was found exposed publicly. "
                "Create a new key in Google AI Studio and save it in Settings.")
    if "api key not valid" in text or "api_key_invalid" in text or "error code: 401" in text:
        return "Your Gemini API key was rejected. Check the key saved in Settings."
    if "error code: 403" in text or "permission_denied" in text:
        return "Google refused the request for this Gemini API key. Check the key and its permissions in Google AI Studio."
    if "error code: 429" in text or "quota" in text or "resource_exhausted" in text:
        return "Your Gemini quota or rate limit has been reached. Wait a little and try again, or check your plan in Google AI Studio."
    if "error code: 503" in text or "high demand" in text or "unavailable" in text:
        return "Google's AI models are overloaded right now. Wait a minute and try again."
    if "error code: 404" in text or "not found" in text and "model" in text:
        return "The configured Gemini model is not available. Check GEMINI_MODEL on the server."
    if "timed out" in text or "timeout" in text or "connection" in text:
        return "The AI service could not be reached. Check the server's internet connection and try again."
    return "Quote calculation failed. Please try again; if it keeps failing, check the server log."


def create_draft_for_lead(lead: dict, user_id: str, company_id: str) -> dict:
    """
    Runs the AI engine for a lead and stores the result as the lead's single
    working draft. Shared by the pipeline button and automatic email drafting.
    Never sends anything to the customer.
    """
    from app.core.encryption import decrypt_key
    lead_id = lead["id"]
    kb_response = supabase.table("knowledge_base").select("parsed_content").eq("company_id", company_id).execute()
    kb_contents = [item["parsed_content"] for item in kb_response.data]

    user_res = supabase.table("users").select("*").eq("id", user_id).execute()
    user_profile = user_res.data[0] if user_res.data else {}

    gemini_key = None
    if user_profile.get("encrypted_gemini_key"):
        gemini_key = decrypt_key(user_profile["encrypted_gemini_key"])

    ai_output = run_quote_engine(
        lead["raw_text"],
        kb_contents,
        custom_api_key=gemini_key,
        user_profile=user_profile
    )

    fields = build_quote_fields(ai_output, user_profile)
    if not fields["customer_email"] or not fields["customer_name"]:
        fallback = resolve_lead_customer(lead, company_id)
        fields["customer_email"] = fields["customer_email"] or fallback["email"]
        fields["customer_phone"] = fields["customer_phone"] or fallback["phone"]
        if not fields["customer_name"] and fallback["name"] not in ("Customer", "WhatsApp Lead"):
            fields["customer_name"] = fallback["name"]

    # One working draft per lead: a re-run replaces earlier unsent drafts.
    supabase.table("quotes").delete().eq("lead_id", lead_id).eq("company_id", company_id).eq("status", "draft").execute()

    quote_response = insert_quote({
        "lead_id": lead_id,
        "user_id": user_id,
        "company_id": company_id,
        "status": "draft",
        **fields,
    })
    if not quote_response.data:
        raise RuntimeError("Failed to save generated quote")

    supabase.table("leads").update({"status": "processed"}).eq("id", lead_id).execute()
    return safe_parse_quote(quote_response.data[0])


@router.post("/generate", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
def generate_quote(
    lead_id: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """
    Triggers AI engine to calculate quote based on the company's knowledge base,
    stores the quote draft, and sets the lead's status to processed.
    """
    company_id = current_user["company_id"]
    lead_response = supabase.table("leads").select("*").eq("id", lead_id).eq("company_id", company_id).execute()
    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found or unauthorized")
    lead = lead_response.data[0]

    try:
        return create_draft_for_lead(lead, current_user["id"], company_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quote generation failure for lead {lead_id}: {str(e)}")
        try:
            supabase.table("leads").update({"status": "failed"}).eq("id", lead_id).execute()
        except Exception:
            pass
        detail = explain_ai_failure(str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)


@router.get("", response_model=List[QuoteResponse])
def list_quotes(current_user: dict = Depends(get_current_user)):
    """
    Lists all quotes belonging to the authenticated user's company.
    """
    try:
        response = supabase.table("quotes")\
            .select("*")\
            .eq("company_id", current_user["company_id"])\
            .order("created_at", desc=True)\
            .execute()
        return [safe_parse_quote(q) for q in response.data]
    except Exception as e:
        logger.error(f"Failed to retrieve quotes: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve quotes")


@router.get("/lead/{lead_id}", response_model=QuoteResponse)
def get_quote_by_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves the most recent quote for a lead.
    """
    try:
        response = supabase.table("quotes")\
            .select("*")\
            .eq("lead_id", lead_id)\
            .eq("company_id", current_user["company_id"])\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
    except Exception as e:
        logger.error(f"Failed to retrieve quote: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve quote")
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found for this lead")
    quote = response.data[0]
    if quote.get("status") == "dispatched":
        # "Start over" resets the lead to pending but keeps the sent quote on record.
        lead_res = supabase.table("leads").select("status").eq("id", lead_id).execute()
        if lead_res.data and lead_res.data[0].get("status") in ("pending", "failed"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found for this lead")
    return safe_parse_quote(quote)


class QuoteUpdateInput(BaseModel):
    email_draft: Optional[str] = None
    itemized_breakdown: Optional[List[dict]] = None
    discount_percent: Optional[float] = None
    tax_percent: Optional[float] = None
    valid_until: Optional[date] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_company: Optional[str] = None
    # Accepted for backward compatibility with older clients; ignored when line items exist,
    # because totals are always derived from the line items.
    material_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    total_cost: Optional[float] = None


@router.put("/{quote_id}", response_model=QuoteResponse)
def update_quote(
    quote_id: str,
    data: QuoteUpdateInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Human-in-the-loop edits to line items, discount, tax, recipient and the reply text.
    Totals are recomputed on the server from the line items.
    """
    company_id = current_user["company_id"]
    quote = safe_parse_quote(_get_company_quote(quote_id, company_id))
    if quote.get("status") == "dispatched":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This quote has already been sent. Use Start over to create a revised quote."
        )

    update_data: dict = {"user_id": current_user["id"]}
    if data.email_draft is not None:
        update_data["email_draft"] = data.email_draft

    for field in ("customer_name", "customer_phone", "customer_company"):
        value = getattr(data, field)
        if value is not None:
            update_data[field] = value.strip()[:200] or None
    if data.customer_email is not None:
        email = data.customer_email.strip().lower()
        if email and not EMAIL_PATTERN.fullmatch(email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer email address is not valid.")
        update_data["customer_email"] = email or None
    if data.valid_until is not None:
        update_data["valid_until"] = data.valid_until.isoformat()

    items = normalize_items(data.itemized_breakdown) if data.itemized_breakdown is not None else quote["itemized_breakdown"]
    discount = data.discount_percent if data.discount_percent is not None else quote.get("discount_percent") or 0
    tax = data.tax_percent if data.tax_percent is not None else quote.get("tax_percent") or 0

    if items:
        if data.itemized_breakdown is not None:
            # The editor clears a line's flag when a person types its price; lines they
            # did not touch stay flagged, and zero-priced lines are always flagged.
            update_data["itemized_breakdown"] = items
            if not items_needing_review(items):
                notes = [n for n in quote.get("review_notes") or [] if not n.startswith(("No price found", "Estimated from a range"))]
                update_data["review_notes"] = notes
        update_data.update(compute_totals(items, discount, tax))
        update_data.pop("discount_amount", None)
        update_data.pop("tax_amount", None)
    else:
        # Quote with no line items (legacy): honour the manually entered figures.
        if data.material_cost is not None:
            update_data["material_cost"] = max(data.material_cost, 0)
        if data.labor_cost is not None:
            update_data["labor_cost"] = max(data.labor_cost, 0)
        if data.total_cost is not None:
            update_data["total_cost"] = max(data.total_cost, 0)

    try:
        response = update_quote_row(quote_id, company_id, update_data)
        return safe_parse_quote(response.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update quote: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update quote")


class DispatchInput(BaseModel):
    # 'email' sends the reply from the connected mailbox; 'manual' only records the
    # quote as sent (the user delivers it themselves, e.g. by pasting the reply).
    mode: Optional[str] = None
    confirm_unpriced: bool = False
    include_link: bool = True


@router.post("/{quote_id}/dispatch", response_model=QuoteResponse)
def dispatch_quote(
    quote_id: str,
    data: DispatchInput | None = Body(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Sends the quote. Never reports success for an email that was not delivered to
    the mail server, and refuses to send zero-priced lines without confirmation.
    """
    data = data or DispatchInput()
    company_id = current_user["company_id"]
    quote = safe_parse_quote(_get_company_quote(quote_id, company_id))
    if quote.get("status") == "dispatched":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This quote has already been sent.")

    unpriced = items_needing_review(quote["itemized_breakdown"])
    if unpriced and not data.confirm_unpriced:
        names = ", ".join(i["description"] for i in unpriced[:3])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "unpriced_items",
                "message": f"{len(unpriced)} line item(s) still need their price set or confirmed: {names}. Save your prices, or confirm to send anyway.",
            }
        )

    lead_res = supabase.table("leads").select("*").eq("id", quote["lead_id"]).execute()
    lead = lead_res.data[0] if lead_res.data else {}

    from app.core.credentials import get_gmail_credentials
    from app.api.emails import send_smtp_email
    gmail_email, gmail_password = get_gmail_credentials(current_user["id"])
    own_addresses = {a.strip().lower() for a in (gmail_email, current_user.get("email")) if a}

    fallback = resolve_lead_customer(lead, company_id, exclude_emails=own_addresses)
    customer_email = quote.get("customer_email") or fallback["email"]
    customer_phone = quote.get("customer_phone") or fallback["phone"]
    customer_name = quote.get("customer_name") or fallback["name"]

    mode = data.mode or ("email" if customer_email else "manual")
    if mode not in ("email", "manual"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mode must be 'email' or 'manual'")

    public_token = quote.get("public_token") or new_public_token()
    link = public_quote_url(public_token)

    if mode == "email":
        if not customer_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "no_recipient", "message": "Add the customer's email address before sending."}
            )
        if not gmail_email or not gmail_password:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "no_mailbox", "message": "No mailbox is connected, so the quote was not emailed. Connect Gmail in Settings, or mark the quote as sent and deliver it yourself."}
            )
        user_res = supabase.table("users").select("default_quote_parameters").eq("id", current_user["id"]).execute()
        seller = company_display_name(company_id, user_res.data[0] if user_res.data else None)
        number = quote.get("quote_number")
        subject = " ".join(p for p in ["Quotation", number or ""] if p)
        if seller:
            subject += f" from {seller}"
        elif lead.get("title"):
            subject += f" - {lead['title']}"

        body = quote["email_draft"]
        if data.include_link and link:
            body += f"\n\nView, print or accept this quote online:\n{link}"

        # send_smtp_email raises HTTPException(502) on transport/auth failure; let it
        # propagate so the quote stays a draft instead of being recorded as sent.
        sent = send_smtp_email(
            to_address=customer_email,
            subject=subject[:200],
            body=body,
            custom_user=gmail_email,
            custom_password=gmail_password
        )
        if not sent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "no_mailbox", "message": "No mailbox is connected, so the quote was not emailed."}
            )

    try:
        breakdown = quote["itemized_breakdown"]
        cost_desc = ", ".join(item.get("description", "") for item in breakdown) or "Quote"
        try:
            quantity = int(round(sum(float(item.get("quantity") or 1) for item in breakdown))) or 1
        except Exception:
            quantity = 1

        supabase.table("dispatched_quotes").insert({
            "user_id": current_user["id"],
            "company_id": company_id,
            "customer_name": customer_name,
            "customer_email": customer_email or "No email",
            "customer_phone": customer_phone,
            "cost_description": cost_desc[:255],
            "quantity": quantity,
            "total_amount": quote.get("total_cost") or 0.00
        }).execute()

        supabase.table("leads").update({"status": "dispatched"}).eq("id", quote["lead_id"]).execute()

        dispatch_response = update_quote_row(quote_id, company_id, {
            "status": "dispatched",
            "user_id": current_user["id"],
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "public_token": public_token,
            "customer_name": customer_name if customer_name not in ("Customer", "WhatsApp Lead") else quote.get("customer_name"),
            "customer_email": customer_email,
            "customer_phone": customer_phone,
        })
        result = safe_parse_quote(dispatch_response.data[0])
        emit_quote_event(company_id, "quote.sent", result)
        result["delivery"] = mode
        result["sent_to"] = customer_email if mode == "email" else None
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to record dispatch of quote {quote_id}: {str(e)}")
        detail = "Failed to dispatch quote"
        if mode == "email":
            detail = f"The email was sent to {customer_email}, but the quote could not be marked as sent. Do not send it again; refresh and mark it as sent."
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)


class OutcomeInput(BaseModel):
    outcome: Optional[str] = None  # 'accepted' | 'declined' | None to clear


@router.post("/{quote_id}/outcome", response_model=QuoteResponse)
def set_quote_outcome(quote_id: str, data: OutcomeInput, current_user: dict = Depends(get_current_user)):
    """
    Lets staff record whether a sent quote was won or lost (for deals closed by phone or PO).
    """
    if data.outcome not in (None, "accepted", "declined"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="outcome must be 'accepted', 'declined' or null")
    company_id = current_user["company_id"]
    quote = _get_company_quote(quote_id, company_id)
    if quote.get("status") != "dispatched":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only sent quotes can be marked won or lost.")
    try:
        response = update_quote_row(quote_id, company_id, {
            "outcome": data.outcome,
            "outcome_source": "staff" if data.outcome else None,
            "responded_at": datetime.now(timezone.utc).isoformat() if data.outcome else None,
        })
        updated = safe_parse_quote(response.data[0])
        if data.outcome:
            emit_quote_event(company_id, f"quote.{data.outcome}", updated)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set outcome for quote {quote_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update quote outcome")


def _parse_ts(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def summarize_quotes(quotes: list[dict], leads_by_id: dict, now: datetime | None = None) -> dict:
    """Win rate, value and speed figures for the reports page. Pure function."""
    now = now or datetime.now(timezone.utc)
    sent = [q for q in quotes if q.get("status") == "dispatched"]
    accepted = [q for q in sent if q.get("outcome") == "accepted"]
    declined = [q for q in sent if q.get("outcome") == "declined"]
    open_quotes = [q for q in sent if not q.get("outcome")]
    decided = len(accepted) + len(declined)

    def value(rows):
        return round(sum(float(r.get("total_cost") or 0) for r in rows), 2)

    response_hours = []
    for q in sent:
        lead = leads_by_id.get(q.get("lead_id")) or {}
        received = _parse_ts(lead.get("created_at"))
        sent_at = _parse_ts(q.get("sent_at")) or _parse_ts(q.get("created_at"))
        if received and sent_at and sent_at >= received:
            response_hours.append((sent_at - received).total_seconds() / 3600)
    response_hours.sort()
    median_hours = None
    if response_hours:
        mid = len(response_hours) // 2
        median_hours = response_hours[mid] if len(response_hours) % 2 else (response_hours[mid - 1] + response_hours[mid]) / 2

    follow_up = []
    for q in open_quotes:
        sent_at = _parse_ts(q.get("sent_at")) or _parse_ts(q.get("created_at"))
        if sent_at and (now - sent_at) >= timedelta(days=FOLLOW_UP_AFTER_DAYS):
            follow_up.append(q["id"])

    return {
        "drafts": len([q for q in quotes if q.get("status") == "draft"]),
        "sent": len(sent),
        "viewed": len([q for q in sent if (q.get("view_count") or 0) > 0]),
        "accepted": len(accepted),
        "declined": len(declined),
        "open": len(open_quotes),
        "win_rate": round(len(accepted) / decided * 100, 1) if decided else None,
        "quoted_value": value(sent),
        "won_value": value(accepted),
        "open_value": value(open_quotes),
        "median_response_hours": round(median_hours, 1) if median_hours is not None else None,
        "needs_follow_up": follow_up,
        "follow_up_after_days": FOLLOW_UP_AFTER_DAYS,
    }


def _load_leads(lead_ids: list[str], company_id: str) -> dict:
    leads_by_id: dict = {}
    ids = [i for i in dict.fromkeys(lead_ids) if i]
    for start in range(0, len(ids), 100):
        res = supabase.table("leads").select("*").eq("company_id", company_id).in_("id", ids[start:start + 100]).execute()
        for lead in res.data or []:
            leads_by_id[lead["id"]] = lead
    return leads_by_id


@router.get("/analytics")
def quote_analytics(current_user: dict = Depends(get_current_user)):
    """
    Win rate, quoted and won value, response time and quotes waiting on a follow-up.
    """
    company_id = current_user["company_id"]
    try:
        quotes = supabase.table("quotes").select("*").eq("company_id", company_id).execute().data or []
        leads_by_id = _load_leads([q.get("lead_id") for q in quotes], company_id)
        return summarize_quotes(quotes, leads_by_id)
    except Exception as e:
        logger.error(f"Failed to compute quote analytics: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load analytics")


@router.get("/dispatched")
def list_dispatched_quotes(current_user: dict = Depends(get_current_user)):
    """
    Retrieves all sent quotes for the user's company with customer, attending
    employee, line items and what happened after sending.
    """
    company_id = current_user["company_id"]
    try:
        quotes_res = supabase.table("quotes")\
            .select("*")\
            .eq("company_id", company_id)\
            .eq("status", "dispatched")\
            .order("created_at", desc=True)\
            .execute()
        quotes = quotes_res.data or []

        users_res = supabase.table("users").select("id, name, email").eq("company_id", company_id).execute()
        employees_by_id = {u["id"]: u for u in (users_res.data or [])}
        leads_by_id = _load_leads([q.get("lead_id") for q in quotes], company_id)
        now = datetime.now(timezone.utc)

        result = []
        for q in quotes:
            q = safe_parse_quote(q)
            lead = leads_by_id.get(q.get("lead_id")) or {}
            customer_name = q.get("customer_name")
            customer_email = q.get("customer_email")
            customer_phone = q.get("customer_phone")
            if lead and not (customer_name and (customer_email or customer_phone)):
                customer = resolve_lead_customer(lead, company_id)
                customer_name = customer_name or customer["name"]
                customer_email = customer_email or customer["email"]
                customer_phone = customer_phone or customer["phone"]

            emp = employees_by_id.get(q.get("user_id") or lead.get("user_id"))
            emp_email = (emp.get("email") if emp else "") or ""
            emp_name = (emp.get("name") if emp else "") or (emp_email.split("@")[0] if emp_email else "Team Member")

            breakdown = q["itemized_breakdown"]
            sent_at = q.get("sent_at") or q["created_at"]
            sent_dt = _parse_ts(sent_at)
            needs_follow_up = bool(
                not q.get("outcome") and sent_dt and (now - sent_dt) >= timedelta(days=FOLLOW_UP_AFTER_DAYS)
            )

            result.append({
                "id": q["id"],
                "quote_number": q.get("quote_number"),
                "customer_name": customer_name or "Customer",
                "customer_email": customer_email or "No email",
                "customer_phone": customer_phone,
                "employee_name": emp_name,
                "employee_email": emp_email,
                "cost_description": ", ".join(item.get("description", "") for item in breakdown),
                "quantity": sum(float(item.get("quantity") or 1) for item in breakdown),
                "material_cost": q.get("material_cost") or 0.00,
                "labor_cost": q.get("labor_cost") or 0.00,
                "total_amount": q.get("total_cost") or 0.00,
                "currency": q.get("currency") or "USD",
                "itemized_breakdown": breakdown,
                "outcome": q.get("outcome"),
                "outcome_source": q.get("outcome_source"),
                "customer_comment": q.get("customer_comment"),
                "view_count": q.get("view_count") or 0,
                "last_viewed_at": q.get("last_viewed_at"),
                "needs_follow_up": needs_follow_up,
                "public_token": q.get("public_token"),
                "source": lead.get("source"),
                "created_at": sent_at,
            })

        return result
    except Exception as e:
        logger.error(f"Failed to load dispatched quotes reports: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve reports")
