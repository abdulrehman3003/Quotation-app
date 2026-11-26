# app/api/public.py
"""
Customer-facing quote link. No login: possession of the unguessable token in the
URL is the credential, so these handlers return only what the customer was
already sent and never expose internal notes, drafts or other tenants' data.
"""
from datetime import date, datetime, timezone
from typing import Optional
import logging

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from supabase import create_client, Client

from app.core.config import settings
from app.services.pricing import normalize_items, compute_totals

router = APIRouter(prefix="/public", tags=["Public"])
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This quote link is not valid.")


def _load_quote(token: str) -> dict:
    if not token or len(token) < 20 or len(token) > 128:
        raise NOT_FOUND
    try:
        res = supabase.table("quotes").select("*").eq("public_token", token).limit(1).execute()
    except Exception as e:
        logger.error(f"Public quote lookup failed: {str(e)}")
        raise NOT_FOUND
    if not res.data:
        raise NOT_FOUND
    return res.data[0]


def is_expired(quote: dict, today: date | None = None) -> bool:
    valid_until = quote.get("valid_until")
    if not valid_until:
        return False
    try:
        return date.fromisoformat(str(valid_until)[:10]) < (today or date.today())
    except ValueError:
        return False


def serialize_public_quote(quote: dict, seller: dict, company_name: str) -> dict:
    """The customer's view of a quote. Pure function; keep internal fields out of it."""
    items = normalize_items(quote.get("itemized_breakdown") if isinstance(quote.get("itemized_breakdown"), list) else [])
    totals = compute_totals(items, quote.get("discount_percent") or 0, quote.get("tax_percent") or 0)
    if not items:
        totals["subtotal"] = float(quote.get("total_cost") or 0)
        totals["total_cost"] = float(quote.get("total_cost") or 0)
    params = seller.get("default_quote_parameters") if isinstance(seller.get("default_quote_parameters"), dict) else {}
    return {
        "quote_number": quote.get("quote_number"),
        "status": "sent" if quote.get("status") == "dispatched" else "draft",
        "issued_at": quote.get("sent_at") or quote.get("created_at"),
        "valid_until": quote.get("valid_until"),
        "expired": is_expired(quote),
        "currency": quote.get("currency") or "USD",
        "customer_name": quote.get("customer_name"),
        "customer_company": quote.get("customer_company"),
        "items": [
            {
                "description": i["description"],
                "quantity": i["quantity"],
                "unit_price": i["unit_price"],
                "total_price": i["total_price"],
            }
            for i in items
        ],
        "subtotal": totals["subtotal"],
        "discount_percent": totals["discount_percent"],
        "discount_amount": totals["discount_amount"],
        "tax_percent": totals["tax_percent"],
        "tax_amount": totals["tax_amount"],
        "total": totals["total_cost"],
        "payment_terms": str(params.get("payment_terms") or "").strip() or None,
        "outcome": quote.get("outcome"),
        "responded_at": quote.get("responded_at"),
        "seller": {
            "company_name": company_name or None,
            "name": seller.get("name"),
            "email": seller.get("email"),
            "phone": seller.get("phone_number"),
        },
    }


def _seller_context(quote: dict) -> tuple[dict, str]:
    seller: dict = {}
    company_name = ""
    try:
        res = supabase.table("users").select("name, email, phone_number, default_quote_parameters")\
            .eq("id", quote.get("user_id")).execute()
        if res.data:
            seller = res.data[0]
        params = seller.get("default_quote_parameters") if isinstance(seller.get("default_quote_parameters"), dict) else {}
        company_name = str(params.get("company_name") or "").strip()
        if not company_name:
            comp = supabase.table("companies").select("name").eq("id", quote.get("company_id")).execute()
            if comp.data:
                company_name = comp.data[0].get("name") or ""
    except Exception as e:
        logger.warning(f"Could not load seller context for public quote: {str(e)}")
    return seller, company_name


@router.get("/quotes/{token}")
def view_public_quote(token: str, preview: bool = Query(False, description="Staff preview: do not count as a customer view")):
    quote = _load_quote(token)
    if quote.get("status") == "dispatched" and not preview:
        now = datetime.now(timezone.utc).isoformat()
        try:
            update = {"view_count": (quote.get("view_count") or 0) + 1, "last_viewed_at": now}
            if not quote.get("first_viewed_at"):
                update["first_viewed_at"] = now
            supabase.table("quotes").update(update).eq("id", quote["id"]).execute()
        except Exception as e:
            logger.warning(f"Could not record quote view: {str(e)}")
    seller, company_name = _seller_context(quote)
    return serialize_public_quote(quote, seller, company_name)


@router.get("/quotes/{token}/pdf")
def download_public_quote_pdf(token: str):
    """The quotation PDF for a quote link (also fetched by Twilio to attach it on WhatsApp)."""
    from fastapi.responses import Response
    from app.api.quotes import quote_pdf_bytes
    from app.services.quote_pdf import pdf_filename
    quote = _load_quote(token)
    return Response(content=quote_pdf_bytes(quote), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{pdf_filename(quote)}"'})


class RespondInput(BaseModel):
    decision: str
    comment: Optional[str] = None


@router.post("/quotes/{token}/respond")
def respond_to_public_quote(token: str, data: RespondInput):
    if data.decision not in ("accepted", "declined"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="decision must be 'accepted' or 'declined'")
    quote = _load_quote(token)
    if quote.get("status") != "dispatched":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This quote has not been issued yet.")
    if quote.get("outcome"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This quote was already {quote['outcome']}.")
    if data.decision == "accepted" and is_expired(quote):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This quote has expired. Please ask for an updated quote.")

    comment = (data.comment or "").strip()[:1000] or None
    try:
        # The `is_("outcome", "null")` guard makes the first response win if two arrive together.
        res = supabase.table("quotes").update({
            "outcome": data.decision,
            "outcome_source": "customer",
            "responded_at": datetime.now(timezone.utc).isoformat(),
            "customer_comment": comment,
        }).eq("id", quote["id"]).is_("outcome", "null").execute()
    except Exception as e:
        logger.error(f"Failed to record customer response: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Your response could not be recorded. Please try again.")
    if not res.data:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This quote has already been responded to.")
    logger.warning(f"Quote {quote.get('quote_number') or quote['id']} was {data.decision} by the customer.")
    from app.services.automation import emit_quote_event
    emit_quote_event(quote.get("company_id"), f"quote.{data.decision}", res.data[0])
    return {"status": "recorded", "outcome": data.decision}
