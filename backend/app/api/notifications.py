# app/api/notifications.py
"""
Messages from the platform admin to customer companies: payment reminders and
service notices. Admins send and resolve them; every user of the company sees them
in the notification bell, and pinned ones as a banner until resolved.

Users of a suspended company can still read them (that is how they learn what is
due), so the customer endpoints accept signed-in users who are locked out.
"""
import logging
import re
from datetime import date, datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import create_client, Client

from app.core.config import settings
from app.core.security import DEFAULT_COMPANY_ID, get_signed_in_user, require_admin

router = APIRouter(tags=["Notifications"])
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

MIGRATION_HINT = "Run database/migration_v13_company_notifications.sql, then try again."
_URL_RE = re.compile(r"^https://[^\s<>\"']+$", re.IGNORECASE)


class NotificationInput(BaseModel):
    # One company, or every active customer company when all_companies is true.
    company_ids: List[str] = Field(default_factory=list)
    all_companies: bool = False
    kind: Literal["payment", "info", "warning"] = "info"
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field("", max_length=4000)
    amount: Optional[float] = Field(None, ge=0, le=10_000_000)
    currency: Optional[str] = Field(None, max_length=3)
    due_date: Optional[str] = None
    payment_link: Optional[str] = Field(None, max_length=1000)
    show_banner: bool = False


class ReadInput(BaseModel):
    ids: List[str] = Field(default_factory=list, max_length=200)


def _clean(data: NotificationInput) -> dict:
    due = (data.due_date or "").strip() or None
    if due:
        try:
            date.fromisoformat(due)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use a due date like 2026-12-01.")
    link = (data.payment_link or "").strip() or None
    if link and not _URL_RE.match(link):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The payment link must start with https://")
    currency = (data.currency or "").strip().upper() or None
    if currency and not re.fullmatch(r"[A-Z]{3}", currency):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use a 3-letter currency code such as USD.")
    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add a title.")
    return {
        "kind": data.kind, "title": title, "body": data.body.strip(),
        "amount": round(data.amount, 2) if data.amount is not None else None,
        "currency": currency or ("USD" if data.amount is not None else None),
        "due_date": due, "payment_link": link, "show_banner": data.show_banner,
    }


def _target_companies(data: NotificationInput) -> list[str]:
    companies = supabase.table("companies").select("*").execute().data or []
    known = {c["id"]: c for c in companies if c["id"] != DEFAULT_COMPANY_ID}
    if data.all_companies:
        return [cid for cid, c in known.items() if (c.get("status") or "active") == "active"]
    targets = [cid for cid in dict.fromkeys(data.company_ids) if cid]
    unknown = [cid for cid in targets if cid not in known]
    if not targets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a company to send to.")
    if unknown:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    return targets


# --- admin ------------------------------------------------------------------------------------

@router.post("/admin/notifications", status_code=status.HTTP_201_CREATED)
def send_notification(data: NotificationInput, admin: dict = Depends(require_admin)):
    fields = _clean(data)
    targets = _target_companies(data)
    if not targets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="There are no active companies to send to.")
    rows = [{**fields, "company_id": cid, "created_by": admin["id"]} for cid in targets]
    try:
        res = supabase.table("company_notifications").insert(rows).execute()
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")
        raise HTTPException(status_code=500, detail=MIGRATION_HINT)
    logger.info(f"Admin sent '{fields['title']}' ({fields['kind']}) to {len(targets)} compan{'y' if len(targets) == 1 else 'ies'}")
    return {"status": "success", "sent": len(targets), "notifications": res.data or []}


@router.get("/admin/notifications")
def list_sent_notifications(company_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    """Sent messages, newest first, with how many of the company's users have read each one."""
    try:
        query = supabase.table("company_notifications").select("*")
        if company_id:
            query = query.eq("company_id", company_id)
        notes = query.order("created_at", desc=True).limit(300).execute().data or []
        reads = supabase.table("notification_reads").select("notification_id,user_id").execute().data or []
    except Exception as e:
        logger.warning(f"Notifications unavailable: {e}")
        return {"available": False, "notifications": []}
    users = supabase.table("users").select("id,company_id,role").execute().data or []
    members: dict[str, int] = {}
    for u in users:
        if u.get("role") != "admin":
            members[u.get("company_id")] = members.get(u.get("company_id"), 0) + 1
    names = {c["id"]: c.get("name") for c in (supabase.table("companies").select("id,name").execute().data or [])}
    read_by: dict[str, int] = {}
    for r in reads:
        read_by[r["notification_id"]] = read_by.get(r["notification_id"], 0) + 1
    for n in notes:
        n["company_name"] = names.get(n["company_id"])
        n["read_count"] = read_by.get(n["id"], 0)
        n["member_count"] = members.get(n["company_id"], 0)
    return {"available": True, "notifications": notes}


@router.post("/admin/notifications/{notification_id}/resolve")
def resolve_notification(notification_id: str, admin: dict = Depends(require_admin)):
    """Marks a message done (e.g. the invoice was paid): it leaves the customer's banner."""
    res = supabase.table("company_notifications").update({"resolved_at": datetime.now(timezone.utc).isoformat()})\
        .eq("id", notification_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    return {"status": "success"}


@router.delete("/admin/notifications/{notification_id}")
def delete_notification(notification_id: str, admin: dict = Depends(require_admin)):
    res = supabase.table("company_notifications").delete().eq("id", notification_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    return {"status": "success"}


# --- customer ------------------------------------------------------------------------------------

@router.get("/notifications")
def my_notifications(current_user: dict = Depends(get_signed_in_user)):
    """The latest messages for the user's company, each with whether this user has read it."""
    company_id = current_user.get("company_id")
    if current_user.get("role") == "admin" or not company_id or company_id == DEFAULT_COMPANY_ID:
        return []
    if current_user.get("access_approved") is False:
        return []
    try:
        notes = supabase.table("company_notifications").select("*").eq("company_id", company_id)\
            .order("created_at", desc=True).limit(50).execute().data or []
        reads = supabase.table("notification_reads").select("notification_id").eq("user_id", current_user["id"]).execute().data or []
    except Exception:
        return []  # migration v13 not applied yet
    read_ids = {r["notification_id"] for r in reads}
    visible = []
    for n in notes:
        visible.append({
            "id": n["id"], "kind": n.get("kind") or "info", "title": n.get("title"), "body": n.get("body") or "",
            "amount": n.get("amount"), "currency": n.get("currency"), "due_date": n.get("due_date"),
            "payment_link": n.get("payment_link"), "show_banner": bool(n.get("show_banner")),
            "resolved": bool(n.get("resolved_at")), "created_at": n.get("created_at"), "read": n["id"] in read_ids,
        })
    return visible


@router.post("/notifications/read")
def mark_read(data: ReadInput, current_user: dict = Depends(get_signed_in_user)):
    company_id = current_user.get("company_id")
    if not data.ids or not company_id or current_user.get("role") == "admin":
        return {"status": "success", "marked": 0}
    try:
        own = supabase.table("company_notifications").select("id").eq("company_id", company_id)\
            .in_("id", list(dict.fromkeys(data.ids))).execute().data or []
        rows = [{"notification_id": n["id"], "user_id": current_user["id"]} for n in own]
        if rows:
            supabase.table("notification_reads").upsert(rows, on_conflict="notification_id,user_id").execute()
    except Exception as e:
        logger.warning(f"Could not mark notifications read: {e}")
        return {"status": "success", "marked": 0}
    return {"status": "success", "marked": len(rows)}
