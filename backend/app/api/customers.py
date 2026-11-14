# app/api/customers.py
"""
Customer directory derived from quotes. There is no separate customer table to
keep in sync: a customer exists because they were quoted, and their history is
their quotes.
"""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import create_client, Client

from app.core.config import settings
from app.core.security import get_current_user
from app.services.pricing import normalize_items

router = APIRouter(prefix="/customers", tags=["Customers"])
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)


def customer_key(quote: dict) -> str | None:
    """Email identifies a customer; without one, fall back to the name."""
    email = (quote.get("customer_email") or "").strip().lower()
    if email and "@" in email:
        return email
    name = re.sub(r"\s+", " ", (quote.get("customer_name") or "").strip().lower())
    if name and name not in ("customer", "whatsapp lead"):
        return f"name:{name}"
    return None


def _when(quote: dict) -> str:
    return str(quote.get("sent_at") or quote.get("created_at") or "")


def build_customer_directory(quotes: list[dict]) -> list[dict]:
    customers: dict[str, dict] = {}
    for q in sorted(quotes, key=_when):
        key = customer_key(q)
        if not key:
            continue
        c = customers.setdefault(key, {
            "key": key, "name": None, "email": None, "phone": None, "company": None,
            "quotes": 0, "sent": 0, "won": 0, "lost": 0, "open": 0,
            "quoted_value": 0.0, "won_value": 0.0, "last_activity": None, "currency": q.get("currency") or "USD",
        })
        # Later quotes overwrite earlier details, so the directory shows the newest known name/phone.
        c["name"] = q.get("customer_name") or c["name"]
        c["email"] = (q.get("customer_email") or "").strip().lower() or c["email"]
        c["phone"] = q.get("customer_phone") or c["phone"]
        c["company"] = q.get("customer_company") or c["company"]
        c["quotes"] += 1
        c["last_activity"] = _when(q) or c["last_activity"]
        if q.get("status") == "dispatched":
            total = float(q.get("total_cost") or 0)
            c["sent"] += 1
            c["quoted_value"] = round(c["quoted_value"] + total, 2)
            if q.get("outcome") == "accepted":
                c["won"] += 1
                c["won_value"] = round(c["won_value"] + total, 2)
            elif q.get("outcome") == "declined":
                c["lost"] += 1
            else:
                c["open"] += 1
    for c in customers.values():
        decided = c["won"] + c["lost"]
        c["win_rate"] = round(c["won"] / decided * 100, 1) if decided else None
    return sorted(customers.values(), key=lambda c: c["last_activity"] or "", reverse=True)


def build_customer_history(quotes: list[dict], key: str) -> dict | None:
    """One customer's quotes (newest first) and what they were charged per item over time."""
    mine = [q for q in quotes if customer_key(q) == key]
    if not mine:
        return None
    summary = build_customer_directory(mine)[0]
    mine.sort(key=_when, reverse=True)
    history, prices = [], {}
    for q in mine:
        items = normalize_items(q.get("itemized_breakdown") if isinstance(q.get("itemized_breakdown"), list) else [])
        history.append({
            "id": q.get("id"),
            "lead_id": q.get("lead_id"),
            "quote_number": q.get("quote_number"),
            "date": _when(q),
            "status": q.get("status"),
            "outcome": q.get("outcome"),
            "total": float(q.get("total_cost") or 0),
            "currency": q.get("currency") or "USD",
            "items": [{k: i[k] for k in ("description", "quantity", "unit_price", "total_price")} for i in items],
        })
        if q.get("status") != "dispatched":
            continue  # only prices the customer actually saw
        for item in items:
            if item["unit_price"] <= 0:
                continue
            label = re.sub(r"\s+", " ", item["description"].strip())
            entry = prices.setdefault(label.lower(), {"description": label, "prices": []})
            entry["prices"].append({
                "date": _when(q), "unit_price": item["unit_price"], "quantity": item["quantity"],
                "quote_number": q.get("quote_number"), "outcome": q.get("outcome"),
            })
    price_history = sorted(prices.values(), key=lambda p: (-len(p["prices"]), p["description"].lower()))
    return {"customer": summary, "quotes": history, "price_history": price_history}


def _company_quotes(company_id: str) -> list[dict]:
    return supabase.table("quotes").select("*").eq("company_id", company_id).execute().data or []


@router.get("")
def list_customers(current_user: dict = Depends(get_current_user)):
    try:
        return build_customer_directory(_company_quotes(current_user["company_id"]))
    except Exception as e:
        logger.error(f"Failed to build customer directory: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load customers")


@router.get("/history")
def customer_history(key: str = Query(..., min_length=1, max_length=320), current_user: dict = Depends(get_current_user)):
    try:
        result = build_customer_history(_company_quotes(current_user["company_id"]), key.strip().lower())
    except Exception as e:
        logger.error(f"Failed to load customer history: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load customer history")
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return result
