# app/api/customers.py
"""
Customer directory. Quoted customers are derived from their quotes (their history
is their quotes). Customers met offline (walk-ins, phone calls) are saved by hand
in the customers table, so they appear before their first quote, and a quote made
for them always carries their details.
"""
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
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


def _saved_customers(company_id: str) -> list[dict]:
    try:
        return supabase.table("customers").select("*").eq("company_id", company_id).execute().data or []
    except Exception as e:  # table missing before migration v10
        logger.warning(f"Saved customers unavailable (run migration_v10?): {e}")
        return []


def saved_customer_key(row: dict) -> str | None:
    return customer_key({"customer_email": row.get("email"), "customer_name": row.get("name")})


def _empty_entry(row: dict, key: str) -> dict:
    return {
        "key": key, "name": row.get("name"), "email": (row.get("email") or None), "phone": row.get("phone"),
        "company": row.get("company"), "quotes": 0, "sent": 0, "won": 0, "lost": 0, "open": 0,
        "quoted_value": 0.0, "won_value": 0.0, "last_activity": row.get("created_at"), "currency": "USD",
        "win_rate": None,
    }


def merge_saved_customers(directory: list[dict], saved: list[dict]) -> list[dict]:
    """Adds hand-saved customers to the quote-derived directory, matched on the same key."""
    by_key = {c["key"]: c for c in directory}
    for c in directory:
        c.setdefault("id", None)
        c.setdefault("notes", None)
    for row in saved:
        key = saved_customer_key(row)
        if not key:
            continue
        entry = by_key.get(key)
        if entry is None:
            entry = _empty_entry(row, key)
            directory.append(entry)
            by_key[key] = entry
        entry["id"] = row.get("id")
        entry["notes"] = row.get("notes")
        for field in ("name", "phone", "company"):
            entry[field] = entry.get(field) or row.get(field)
        entry["email"] = entry.get("email") or (row.get("email") or None)
    return sorted(directory, key=lambda c: c["last_activity"] or "", reverse=True)


@router.get("")
def list_customers(current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    try:
        directory = build_customer_directory(_company_quotes(company_id))
        return merge_saved_customers(directory, _saved_customers(company_id))
    except Exception as e:
        logger.error(f"Failed to build customer directory: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load customers")


@router.get("/history")
def customer_history(key: str = Query(..., min_length=1, max_length=320), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    key = key.strip().lower()
    try:
        result = build_customer_history(_company_quotes(company_id), key)
        saved = [row for row in _saved_customers(company_id) if saved_customer_key(row) == key]
    except Exception as e:
        logger.error(f"Failed to load customer history: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load customer history")
    if not result and saved:
        result = {"customer": _empty_entry(saved[0], key), "quotes": [], "price_history": []}
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    result["customer"] = merge_saved_customers([result["customer"]], saved)[0]
    return result


# --- customers added by hand (walk-ins, phone calls) ---------------------------------------------

_EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")


class CustomerInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    company: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=320)
    phone: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=2000)
    # What they asked for. When given, a lead is created so it can be priced in the pipeline.
    request: Optional[str] = Field(None, max_length=20000)


def _clean(value: Optional[str]) -> Optional[str]:
    text = re.sub(r"\s+", " ", (value or "").strip())
    return text or None


def _customer_fields(data: CustomerInput) -> dict:
    email = (_clean(data.email) or "").lower() or None
    if email and not _EMAIL_RE.match(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That email address doesn't look right.")
    name = _clean(data.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter the customer's name.")
    notes = (data.notes or "").strip() or None
    return {"name": name, "company": _clean(data.company), "email": email, "phone": _clean(data.phone), "notes": notes}


def lead_text_for(customer: dict, request: str) -> str:
    """The lead the AI prices. The contact block lets it fill in the customer details."""
    lines = ["Walk-in / offline enquiry (taken in person or by phone)", f"Customer name: {customer['name']}"]
    for label, field in (("Company", "company"), ("Phone", "phone"), ("Email", "email")):
        if customer.get(field):
            lines.append(f"{label}: {customer[field]}")
    return "\n".join(lines) + "\n\nRequest:\n" + request.strip()


def _create_lead(customer: dict, request: str, current_user: dict) -> dict:
    res = supabase.table("leads").insert({
        "user_id": current_user["id"],
        "company_id": current_user["company_id"],
        "customer_id": customer["id"],
        "title": f"Walk-in: {customer['name']}"[:200],
        "raw_text": lead_text_for(customer, request),
        "source": "walk-in",
        "status": "pending",
    }).execute()
    if not res.data:
        raise RuntimeError("Lead insert returned no row")
    return res.data[0]


def _find_saved(company_id: str, key: str) -> dict | None:
    return next((row for row in _saved_customers(company_id) if saved_customer_key(row) == key), None)


@router.post("", status_code=status.HTTP_201_CREATED)
def add_customer(data: CustomerInput, current_user: dict = Depends(get_current_user)):
    """
    Saves a customer met offline. If one with the same email (or, without email,
    the same name) is already saved, its details are updated instead of duplicated.
    With a request, also creates a walk-in lead ready to be priced.
    """
    company_id = current_user["company_id"]
    fields = _customer_fields(data)
    key = saved_customer_key(fields)
    try:
        existing = _find_saved(company_id, key) if key else None
        if existing:
            updates = {k: v for k, v in fields.items() if v}
            res = supabase.table("customers").update({**updates, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", existing["id"]).eq("company_id", company_id).execute()
            customer = (res.data or [{**existing, **updates}])[0]
        else:
            res = supabase.table("customers").insert({**fields, "company_id": company_id, "created_by": current_user["id"]}).execute()
            if not res.data:
                raise RuntimeError("Customer insert returned no row")
            customer = res.data[0]
        lead = _create_lead(customer, data.request, current_user) if (data.request or "").strip() else None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save customer: {str(e)}")
        missing = "customers" in str(e) or "customer_id" in str(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Run database/migration_v10_walk_in_customers.sql, then try again." if missing else "Failed to save customer",
        )
    return {"customer": customer, "key": key, "lead": lead, "updated": bool(existing)}


@router.post("/{customer_id}/requests", status_code=status.HTTP_201_CREATED)
def add_customer_request(customer_id: str, request: str = Body(..., embed=True, min_length=1, max_length=20000),
                         current_user: dict = Depends(get_current_user)):
    """A new quote request for a saved customer: creates a walk-in lead with their details."""
    res = supabase.table("customers").select("*").eq("id", customer_id).eq("company_id", current_user["company_id"]).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    try:
        return {"lead": _create_lead(res.data[0], request, current_user)}
    except Exception as e:
        logger.error(f"Failed to create customer request: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create the request")


@router.delete("/{customer_id}")
def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    """Removes a hand-saved customer. Their quotes and leads are kept."""
    res = supabase.table("customers").select("id").eq("id", customer_id).eq("company_id", current_user["company_id"]).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    supabase.table("customers").delete().eq("id", customer_id).eq("company_id", current_user["company_id"]).execute()
    return {"status": "deleted"}
