# app/api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from typing import List, Optional, Literal
from pydantic import BaseModel
from app.core.security import get_current_user, require_admin, _provision_isolated_company, DEFAULT_COMPANY_ID
from app.core.encryption import encrypt_key
from app.core import tenancy, plans
from supabase import create_client, Client
from app.core.config import settings
import logging

router = APIRouter(prefix="/admin", tags=["Admin Control Panel"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

class UserUpdateInput(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    role: Optional[Literal["user", "admin"]] = None
    password: Optional[str] = None
    gemini_key: Optional[str] = None
    gmail_email: Optional[str] = None
    gmail_password: Optional[str] = None
    twilio_sid: Optional[str] = None
    twilio_token: Optional[str] = None
    twilio_phone: Optional[str] = None
    default_quote_parameters: Optional[dict] = None
    # Move the user into this existing company.
    company_id: Optional[str] = None
    # Approve (or revoke) a self-registered account.
    access_approved: Optional[bool] = None

class UserCreateInput(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    phone_number: Optional[str] = None
    role: Literal["user", "admin"] = "user"
    # Put the user in an existing company; when omitted a new company is created,
    # named new_company_name (or "<name>'s Workspace").
    company_id: Optional[str] = None
    new_company_name: Optional[str] = None
    # Plan for the new company (ignored when company_id is given).
    plan: Optional[Literal["starter", "growth", "scale"]] = None

class CompanyInput(BaseModel):
    name: str
    plan: Optional[Literal["starter", "growth", "scale"]] = None

class CompanyBillingInput(BaseModel):
    status: Literal["active", "suspended"] = "active"
    next_invoice_date: Optional[str] = None  # YYYY-MM-DD, or empty to clear
    setup_fee_paid: bool = False
    billing_notes: Optional[str] = None
    contact_email: Optional[str] = None

class AdminAccountUpdate(BaseModel):
    current_password: str
    new_email: Optional[str] = None
    new_password: Optional[str] = None

class CompanyPlanInput(BaseModel):
    plan: Literal["starter", "growth", "scale"]
    # Custom limits for this company; None uses the plan's limit.
    max_users: Optional[int] = None
    max_quotes_per_month: Optional[int] = None

def _clean_company_name(name: str) -> str:
    clean = (name or "").strip()
    if not clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is required.")
    if len(clean) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is too long.")
    return clean

@router.get("/companies")
def list_companies(admin: dict = Depends(require_admin)):
    """All companies (except the internal default) with their member counts."""
    try:
        companies = supabase.table("companies").select("*").order("created_at").execute().data or []
        users = supabase.table("users").select("id,company_id").execute().data or []
        counts: dict = {}
        for u in users:
            counts[u.get("company_id")] = counts.get(u.get("company_id"), 0) + 1
        health = _company_health()
        result = []
        for c in companies:
            if c["id"] == DEFAULT_COMPANY_ID:
                continue
            plan = plans.company_plan(c["id"])
            h = health.get(c["id"], {})
            result.append({
                "id": c["id"], "name": c.get("name"), "created_at": c.get("created_at"),
                "member_count": counts.get(c["id"], 0),
                "plan": plan["plan"], "plan_label": plan["label"],
                "max_users": plan["max_users"], "max_quotes_per_month": plan["max_quotes_per_month"],
                "custom_limits": plan["custom_limits"],
                "custom_max_users": c.get("max_users"), "custom_max_quotes_per_month": c.get("max_quotes_per_month"),
                "quotes_this_month": plans.quotes_this_month(c["id"]),
                "status": c.get("status") or "active",
                "next_invoice_date": c.get("next_invoice_date"),
                "setup_fee_paid": bool(c.get("setup_fee_paid")),
                "billing_notes": c.get("billing_notes"),
                "contact_email": c.get("contact_email"),
                "monthly_price": plans.PLAN_PRICES.get(plan["plan"]),
                "mailbox_connected": h.get("mailbox", False),
                "whatsapp_connected": h.get("whatsapp", False),
                "kb_files": h.get("kb_files", 0),
                "quotes_total": h.get("quotes_total", 0),
                "last_activity": h.get("last_activity"),
            })
        return result
    except Exception as e:
        logger.error(f"Failed to list companies: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

def _company_health() -> dict:
    """Per company: mailbox / WhatsApp connected, knowledge-base files, quotes and last activity."""
    health: dict = {}

    def h(cid):
        return health.setdefault(cid, {"mailbox": False, "whatsapp": False, "kb_files": 0, "quotes_total": 0, "last_activity": None})

    def seen(cid, when):
        if when and (h(cid)["last_activity"] or "") < str(when):
            h(cid)["last_activity"] = str(when)

    try:
        for u in supabase.table("users").select("company_id,encrypted_gmail_email,encrypted_twilio_phone").execute().data or []:
            if u.get("encrypted_gmail_email"):
                h(u.get("company_id"))["mailbox"] = True
            if u.get("encrypted_twilio_phone"):
                h(u.get("company_id"))["whatsapp"] = True
        try:
            for m in supabase.table("mail_connections").select("company_id").execute().data or []:
                h(m.get("company_id"))["mailbox"] = True
        except Exception:
            pass
        for k in supabase.table("knowledge_base").select("company_id").execute().data or []:
            h(k.get("company_id"))["kb_files"] += 1
        for q in supabase.table("quotes").select("company_id,created_at").execute().data or []:
            h(q.get("company_id"))["quotes_total"] += 1
            seen(q.get("company_id"), q.get("created_at"))
        for l in supabase.table("leads").select("company_id,created_at").execute().data or []:
            seen(l.get("company_id"), l.get("created_at"))
    except Exception as e:
        logger.warning(f"Company health summary incomplete: {e}")
    return health


@router.put("/companies/{company_id}/billing")
def set_company_billing(company_id: str, data: CompanyBillingInput, admin: dict = Depends(require_admin)):
    """Account status (active / suspended) and billing details for a customer company."""
    tenancy.require_company(company_id)
    if company_id == DEFAULT_COMPANY_ID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The platform company has no billing.")
    invoice_date = (data.next_invoice_date or "").strip() or None
    if invoice_date:
        try:
            from datetime import date
            date.fromisoformat(invoice_date)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use a date like 2026-12-01.")
    contact = (data.contact_email or "").strip().lower() or None
    if contact and "@" not in contact:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The billing contact email doesn't look right.")
    try:
        supabase.table("companies").update({
            "status": data.status,
            "next_invoice_date": invoice_date,
            "setup_fee_paid": data.setup_fee_paid,
            "billing_notes": (data.billing_notes or "").strip()[:4000] or None,
            "contact_email": contact,
        }).eq("id", company_id).execute()
    except Exception as e:
        logger.error(f"Failed to save billing for {company_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not save billing details. Run database/migration_v12_company_billing.sql and try again.")
    logger.info(f"Admin set company {company_id} status={data.status}")
    return {"status": "success"}


@router.get("/overview")
def admin_overview(admin: dict = Depends(require_admin)):
    """Business summary for the platform owner."""
    from datetime import date, timedelta
    companies = [c for c in list_companies(admin) if c["id"] != DEFAULT_COMPANY_ID]
    users = supabase.table("users").select("id,role,access_approved,company_id").execute().data or []
    month_start = plans.month_start().isoformat()
    quotes = supabase.table("quotes").select("company_id,status,outcome,total_cost,created_at,currency")\
        .gte("created_at", month_start).execute().data or []
    today = date.today()
    soon = today + timedelta(days=7)

    by_plan = {key: 0 for key in plans.PLANS}
    for c in companies:
        if c["status"] == "active":
            by_plan[c["plan"]] = by_plan.get(c["plan"], 0) + 1
    due, overdue, near_limit = [], [], []
    for c in companies:
        if c["status"] != "active":
            continue
        if c.get("next_invoice_date"):
            d = date.fromisoformat(str(c["next_invoice_date"])[:10])
            entry = {"id": c["id"], "name": c["name"], "date": str(d), "plan": c["plan_label"], "amount": c["monthly_price"]}
            if d < today:
                overdue.append(entry)
            elif d <= soon:
                due.append(entry)
        reasons = []
        if c.get("max_users") is not None and c["member_count"] >= c["max_users"]:
            reasons.append(f"users {c['member_count']}/{c['max_users']}")
        if c.get("max_quotes_per_month") and c["quotes_this_month"] >= 0.8 * c["max_quotes_per_month"]:
            reasons.append(f"AI quotes {c['quotes_this_month']}/{c['max_quotes_per_month']}")
        if reasons:
            near_limit.append({"id": c["id"], "name": c["name"], "plan": c["plan_label"], "reasons": reasons})
    not_set_up = [{"id": c["id"], "name": c["name"], "missing": [label for label, ok in (
        ("price list", c["kb_files"] > 0), ("mailbox", c["mailbox_connected"]), ("WhatsApp", c["whatsapp_connected"])) if not ok]}
        for c in companies if c["status"] == "active" and (c["kb_files"] == 0 or not c["mailbox_connected"])]

    sent = [q for q in quotes if q.get("status") == "dispatched"]
    return {
        "companies": {"total": len(companies), "active": sum(1 for c in companies if c["status"] == "active"),
                      "suspended": sum(1 for c in companies if c["status"] == "suspended"), "by_plan": by_plan},
        "users": {"total": sum(1 for u in users if u.get("role") != "admin"),
                  "pending_approval": sum(1 for u in users if u.get("role") != "admin" and u.get("access_approved") is False)},
        "estimated_mrr": sum(plans.PLAN_PRICES.get(p, 0) * n for p, n in by_plan.items()),
        "quotes_this_month": {"drafted": len(quotes), "sent": len(sent),
                              "won": sum(1 for q in sent if q.get("outcome") == "accepted")},
        "invoices_due": sorted(due, key=lambda e: e["date"]),
        "invoices_overdue": sorted(overdue, key=lambda e: e["date"]),
        "setup_fees_unpaid": [{"id": c["id"], "name": c["name"]} for c in companies if c["status"] == "active" and not c["setup_fee_paid"]],
        "near_limit": near_limit,
        "not_set_up": not_set_up,
    }


@router.get("/account")
def get_admin_account(admin: dict = Depends(require_admin)):
    return {"id": admin["id"], "email": admin.get("email")}


@router.put("/account")
def update_admin_account(data: AdminAccountUpdate, admin: dict = Depends(require_admin)):
    """Changes the signed-in admin's own email and/or password. The current password is always required."""
    new_email = (data.new_email or "").strip().lower() or None
    new_password = data.new_password or None
    if not new_email and not new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to change.")
    if new_password and len(new_password) < 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use at least 12 characters for the admin password.")
    if new_email and ("@" not in new_email or "." not in new_email.split("@")[-1]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That email address doesn't look right.")
    try:
        verifier = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        verified = verifier.auth.sign_in_with_password({"email": admin["email"], "password": data.current_password})
        if not verified or not verified.user or verified.user.id != admin["id"]:
            raise ValueError("mismatch")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your current password is incorrect.")
    if new_email and new_email != (admin.get("email") or "").lower():
        taken = supabase.table("users").select("id").eq("email", new_email).execute().data or []
        if any(u["id"] != admin["id"] for u in taken):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Another account already uses that email.")
    attrs: dict = {}
    if new_password:
        attrs["password"] = new_password
    if new_email:
        attrs["email"] = new_email
        attrs["email_confirm"] = True
    try:
        supabase.auth.admin.update_user_by_id(admin["id"], attrs)
        if new_email:
            supabase.table("users").update({"email": new_email}).eq("id", admin["id"]).execute()
    except Exception as e:
        logger.error(f"Failed to update admin account: {e}")
        raise HTTPException(status_code=500, detail="Could not update the admin account.")
    logger.info(f"Admin {admin['id']} updated their own {'email and password' if new_email and new_password else 'email' if new_email else 'password'}")
    return {"status": "success", "email": new_email or admin.get("email")}


@router.post("/companies", status_code=status.HTTP_201_CREATED)
def create_company(data: CompanyInput, admin: dict = Depends(require_admin)):
    name = _clean_company_name(data.name)
    if tenancy.company_name_taken(name):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f'A company named "{name}" already exists.')
    row = {"name": name}
    if data.plan:
        row["plan"] = data.plan
    res = supabase.table("companies").insert(row).execute()
    logger.info(f"Admin created company {name}")
    return res.data[0]


@router.get("/plans")
def list_plans(admin: dict = Depends(require_admin)):
    return [{"id": key, **value} for key, value in plans.PLANS.items()]


@router.put("/companies/{company_id}/plan")
def set_company_plan(company_id: str, data: CompanyPlanInput, admin: dict = Depends(require_admin)):
    """Sets a company's plan and optional custom limits. Existing users are never removed."""
    tenancy.require_company(company_id)
    if company_id == DEFAULT_COMPANY_ID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The platform company has no plan.")
    if data.max_users is not None and data.max_users < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A company needs at least 1 user.")
    if data.max_quotes_per_month is not None and data.max_quotes_per_month < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The quote limit can't be negative.")
    try:
        supabase.table("companies").update({
            "plan": data.plan, "max_users": data.max_users, "max_quotes_per_month": data.max_quotes_per_month,
        }).eq("id", company_id).execute()
    except Exception as e:
        logger.error(f"Failed to set plan for {company_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not save the plan. Run database/migration_v11_plans.sql and try again.")
    usage = plans.usage(company_id)
    over = usage["max_users"] is not None and usage["users"] > usage["max_users"]
    return {"status": "success", **usage, "over_user_limit": over}

@router.put("/companies/{company_id}")
def rename_company(company_id: str, data: CompanyInput, admin: dict = Depends(require_admin)):
    tenancy.require_company(company_id)
    name = _clean_company_name(data.name)
    if tenancy.company_name_taken(name, exclude_id=company_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f'A company named "{name}" already exists.')
    supabase.table("companies").update({"name": name}).eq("id", company_id).execute()
    return {"status": "success", "id": company_id, "name": name}

@router.delete("/companies/{company_id}")
def delete_company(company_id: str, admin: dict = Depends(require_admin)):
    """Deletes an empty company. Companies with members are refused: deleting cascades to their data."""
    tenancy.require_company(company_id)
    members = supabase.table("users").select("id").eq("company_id", company_id).execute().data or []
    if members:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This company still has {len(members)} user(s). Move or delete them first."
        )
    supabase.table("companies").delete().eq("id", company_id).execute()
    logger.info(f"Admin deleted empty company {company_id}")
    return {"status": "success"}

@router.get("/users")
def list_users(admin: dict = Depends(require_admin)):
    """
    Lists all registered users along with their settings flags (credentials are masked).
    Guarantees auth users show up even if missing from public users table.
    """
    try:
        # Fetch auth users via Supabase Admin API
        auth_users_res = supabase.auth.admin.list_users()
        if isinstance(auth_users_res, list):
            auth_users = auth_users_res
        elif auth_users_res:
            auth_users = getattr(auth_users_res, "users", [])
        else:
            auth_users = []
        
        # Fetch public profiles
        res = supabase.table("users").select("*").execute()
        profiles_by_id = {p["id"]: p for p in res.data} if res.data else {}
        company_names = {c["id"]: c.get("name") for c in (supabase.table("companies").select("id,name").execute().data or [])}
        
        users_list = []
        for auth_user in auth_users:
            user_id = auth_user.id
            profile = profiles_by_id.get(user_id)
            
            # If public profile is missing, auto-upsert it with an isolated company
            if not profile:
                try:
                    comp_id = _provision_isolated_company(user_id, email=auth_user.email)
                    insert_res = supabase.table("users").upsert({
                        "id": user_id,
                        "email": (auth_user.email or "").strip().lower(),
                        "role": "user",
                        "company_id": comp_id
                    }, on_conflict="id").execute()
                    profile = insert_res.data[0] if insert_res.data else {}
                except Exception as insert_err:
                    logger.warning(f"Failed to auto-insert public profile for user {user_id}: {str(insert_err)}")
                    profile = {"email": auth_user.email, "role": "user"}

            users_list.append({
                "id": user_id,
                "email": auth_user.email,
                "name": profile.get("name"),
                "phone_number": profile.get("phone_number"),
                "role": profile.get("role", "user"),
                "access_approved": profile.get("role") == "admin" or profile.get("access_approved", True) is not False,
                "company_id": profile.get("company_id"),
                "company_name": ("Platform admin" if profile.get("role") == "admin"
                                 else company_names.get(profile.get("company_id")) if profile.get("company_id") != DEFAULT_COMPANY_ID else None),
                "created_at": auth_user.created_at,
                "last_sign_in_at": auth_user.last_sign_in_at,
                "has_gemini_key": bool(profile.get("encrypted_gemini_key")),
                "has_gmail_email": bool(profile.get("encrypted_gmail_email")),
                "has_gmail_password": bool(profile.get("encrypted_gmail_password")),
                "has_twilio_sid": bool(profile.get("encrypted_twilio_sid")),
                "default_quote_parameters": profile.get("default_quote_parameters", {})
            })
        return users_list
    except Exception as e:
        logger.error(f"Failed to list users: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_new_user(
    data: UserCreateInput,
    admin: dict = Depends(require_admin)
):
    """
    Creates a new user account in auth and registers their profile in an isolated company.
    """
    clean_email = (data.email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address."
        )
    if not data.password or len(data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )

    # Pre-check if email already exists in public.users
    try:
        existing_user = supabase.table("users").select("id").ilike("email", clean_email).limit(1).execute()
        if existing_user.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists."
            )
    except HTTPException:
        raise
    except Exception:
        pass

    target_company_id = (data.company_id or "").strip() or None
    new_company_name = (data.new_company_name or "").strip() or None
    if data.role == "admin":
        target_company_id, new_company_name = DEFAULT_COMPANY_ID, None  # admins belong to no customer company
    elif target_company_id:
        tenancy.require_company(target_company_id)
        plans.assert_seat_available(target_company_id)
    elif new_company_name and tenancy.company_name_taken(new_company_name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'A company named "{new_company_name}" already exists. Pick it from the list instead.'
        )

    try:
        # Create user in auth via admin API (supports gotrue/AdminUserAttributes and dictionary formats)
        auth_res = None
        try:
            from gotrue.types import AdminUserAttributes
            auth_res = supabase.auth.admin.create_user(AdminUserAttributes(
                email=clean_email,
                password=data.password,
                email_confirm=True,
                user_metadata={"email_verified": True, "full_name": data.name or ""}
            ))
        except Exception as e_gotrue:
            err_msg = str(e_gotrue).lower()
            if any(k in err_msg for k in ("already", "registered", "exists", "duplicate", "23505")):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email address already exists."
                )
            logger.info(f"Failed to use AdminUserAttributes class, falling back to dict: {str(e_gotrue)}")
            auth_res = supabase.auth.admin.create_user({
                "email": clean_email,
                "password": data.password,
                "email_confirm": True,
                "user_metadata": {"email_verified": True, "full_name": data.name or ""}
            })
        
        if not auth_res or not auth_res.user:
            raise HTTPException(status_code=500, detail="Failed to create user in auth database")
            
        user_id = auth_res.user.id
        if target_company_id:
            comp_id = target_company_id
        else:
            comp_id = _provision_isolated_company(
                user_id, email=clean_email,
                preferred_name=new_company_name or (f"{data.name}'s Workspace" if data.name else None)
            )
        if not target_company_id and data.plan:
            try:
                supabase.table("companies").update({"plan": data.plan}).eq("id", comp_id).execute()
            except Exception as e:  # column missing before migration v11
                logger.warning(f"Could not set plan for new company {comp_id}: {e}")
        company_name = (tenancy.get_company(comp_id) or {}).get("name")
        
        # Upsert public profile
        supabase.table("users").upsert({
            "id": user_id,
            "email": clean_email,
            "name": data.name,
            "phone_number": data.phone_number,
            "role": data.role,
            "company_id": comp_id,
            "default_quote_parameters": {"company_name": company_name} if company_name else {}
        }, on_conflict="id").execute()
        
        try:
            supabase.table("users").update({"access_approved": True}).eq("id", user_id).execute()
        except Exception as e:  # column missing before migration v9
            logger.warning(f"Could not mark {clean_email} as approved: {e}")

        logger.info(f"Admin created new user: {clean_email}")
        return {"status": "success", "user_id": user_id, "company_id": comp_id}
    except HTTPException:
        raise
    except Exception as e:
        err_lower = str(e).lower()
        if any(k in err_lower for k in ("already", "registered", "exists", "duplicate", "23505")):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists."
            )
        logger.error(f"Failed to create new user: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

@router.put("/users/{user_id}")
def update_user_profile(
    user_id: str,
    data: UserUpdateInput,
    admin: dict = Depends(require_admin)
):
    """
    Allows admin to modify user details, encrypt credentials, and reset passwords.
    """
    try:
        current = supabase.table("users").select("company_id,role").eq("id", user_id).execute()
        if not current.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        current_role = current.data[0].get("role") or "user"
        new_role = data.role or current_role
        if user_id == admin["id"] and new_role != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't remove your own admin role.")
        if user_id == admin["id"] and data.access_approved is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't revoke your own access.")
        if new_role == "admin":
            # Admins belong to no customer company.
            if (data.company_id or "").strip() not in ("", DEFAULT_COMPANY_ID):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins can't be put in a customer company.")
            data.company_id = None
        elif current_role == "admin" and not (data.company_id or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose the company this user should join when removing admin rights.")
        target_company_id = (data.company_id or "").strip() or current.data[0].get("company_id") or DEFAULT_COMPANY_ID
        if new_role == "admin":
            target_company_id = DEFAULT_COMPANY_ID

        # Refuse before writing anything if the mailbox / number belongs to another company.
        tenancy.assert_no_credential_clash(user_id, target_company_id, data.gmail_email, data.twilio_phone)
        if new_role == "admin" and current.data[0].get("company_id") != DEFAULT_COMPANY_ID:
            # Promoted: leave the customer company; its records stay with it.
            supabase.table("users").update({"company_id": DEFAULT_COMPANY_ID}).eq("id", user_id).execute()
        elif target_company_id != current.data[0].get("company_id"):
            plans.assert_seat_available(target_company_id, joining_user_id=user_id)
            tenancy.move_user_to_company(user_id, target_company_id)

        # 1. Update Auth settings (password) if provided
        if data.password:
            supabase.auth.admin.update_user_by_id(
                user_id,
                {"password": data.password}
            )
            logger.info(f"Admin reset password for user {user_id}")

        # 2. Prepare public profile updates
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.phone_number is not None:
            update_data["phone_number"] = data.phone_number
        if data.role is not None:
            update_data["role"] = data.role
        if data.default_quote_parameters is not None:
            update_data["default_quote_parameters"] = data.default_quote_parameters
        if data.access_approved is not None:
            update_data["access_approved"] = data.access_approved

        # Encrypt credential strings if provided
        if data.gemini_key is not None:
            update_data["encrypted_gemini_key"] = encrypt_key(data.gemini_key)
        if data.gmail_email is not None:
            update_data["encrypted_gmail_email"] = encrypt_key(data.gmail_email)
        if data.gmail_password is not None:
            update_data["encrypted_gmail_password"] = encrypt_key(data.gmail_password)
        if data.twilio_sid is not None:
            update_data["encrypted_twilio_sid"] = encrypt_key(data.twilio_sid)
        if data.twilio_token is not None:
            update_data["encrypted_twilio_token"] = encrypt_key(data.twilio_token)
        if data.twilio_phone is not None:
            update_data["encrypted_twilio_phone"] = encrypt_key(data.twilio_phone)

        if update_data:
            supabase.table("users").update(update_data).eq("id", user_id).execute()
            logger.info(f"Admin updated public profile columns for user {user_id}")

        return {"status": "success", "message": f"User profile {user_id} updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    """
    Deletes a user account. You can't delete your own admin account.
    """
    if user_id == admin["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't delete your own admin account.")
    try:
        supabase.auth.admin.delete_user(user_id)
        logger.info(f"Admin deleted user {user_id}")
        return {"status": "success", "message": f"User {user_id} successfully deleted"}
    except Exception as e:
        logger.error(f"Failed to delete user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

@router.get("/system-status")
def system_status(admin: dict = Depends(require_admin)):
    """
    Verifies backend, DB connection status and returns workspace resource statistics.
    """
    db_ok = False
    stats = {}
    try:
        # Check DB connection
        res = supabase.table("users").select("count", count="exact").limit(1).execute()
        db_ok = True
        stats["users_count"] = res.count
        
        # Collect table statistics
        stats["leads_count"] = supabase.table("leads").select("count", count="exact").limit(1).execute().count
        stats["quotes_count"] = supabase.table("quotes").select("count", count="exact").limit(1).execute().count
        stats["kb_count"] = supabase.table("knowledge_base").select("count", count="exact").limit(1).execute().count
        stats["emails_count"] = supabase.table("customer_emails").select("count", count="exact").limit(1).execute().count
        stats["logs_count"] = supabase.table("system_logs").select("count", count="exact").limit(1).execute().count
    except Exception as e:
        logger.error(f"System status check failure: {str(e)}")
        db_ok = False

    return {
        "backend_status": "healthy",
        "database_status": "healthy" if db_ok else "unreachable",
        "table_stats": stats
    }

@router.get("/logs")
def list_logs(limit: int = Query(100, ge=1, le=1000), admin: dict = Depends(require_admin)):
    """
    Lists system logs from database.
    """
    try:
        res = supabase.table("system_logs").select("*").order("created_at", desc=True).limit(limit).execute()
        return res.data
    except Exception as e:
        logger.error(f"Failed to fetch system logs: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

ALLOWED_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR"}
MAX_LOG_MESSAGE_LENGTH = 2000

@router.post("/logs")
def add_log(
    source: str = Body(...),
    level: str = Body(...),
    message: str = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Allows logging of frontend diagnostics into the system_logs database.
    Source is forced to 'frontend', level is whitelisted and the message is
    truncated and tagged with the submitting user to prevent log spoofing.
    """
    level_norm = (level or "").upper()
    if level_norm not in ALLOWED_LOG_LEVELS:
        level_norm = "INFO"
    try:
        supabase.table("system_logs").insert({
            "source": "frontend",
            "level": level_norm,
            "message": f"[user:{current_user['id']}] {str(message)[:MAX_LOG_MESSAGE_LENGTH]}"
        }).execute()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to save system log: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save log")

import json
import os

# Legacy file location: only read as a fallback when the app_settings table is missing/empty.
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "global_settings.json")
SETTINGS_ROW_ID = "global"
DEFAULT_GLOBAL_SETTINGS = {
    "base_labor_rate": 50.0,
    "base_material_markup": 1.2
}

def _load_settings_file():
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load legacy global settings file: {e}")
    return None

def load_global_settings():
    """
    Loads global quotation parameters from the shared app_settings table
    (so all workers/containers see the same values). Falls back to the
    legacy JSON file, then to defaults.
    """
    try:
        res = supabase.table("app_settings").select("value").eq("id", SETTINGS_ROW_ID).execute()
        if res.data and isinstance(res.data[0].get("value"), dict):
            return {**DEFAULT_GLOBAL_SETTINGS, **res.data[0]["value"]}
    except Exception as e:
        logger.warning(f"Failed to load global settings from database (run migration_v4?): {e}")
    file_settings = _load_settings_file()
    if file_settings:
        return {**DEFAULT_GLOBAL_SETTINGS, **file_settings}
    return dict(DEFAULT_GLOBAL_SETTINGS)

def save_global_settings(settings_data):
    try:
        supabase.table("app_settings").upsert({
            "id": SETTINGS_ROW_ID,
            "value": settings_data
        }).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to save global settings to database: {e}")
        return False

@router.get("/settings")
def get_settings(admin: dict = Depends(require_admin)):
    return load_global_settings()

@router.post("/settings")
def update_settings(
    base_labor_rate: float = Body(..., gt=0),
    base_material_markup: float = Body(..., gt=0),
    admin: dict = Depends(require_admin)
):
    settings_data = {
        **load_global_settings(),  # keep other stored keys, e.g. the AI model
        "base_labor_rate": base_labor_rate,
        "base_material_markup": base_material_markup
    }
    if save_global_settings(settings_data):
        return {"status": "success", "settings": settings_data}
    raise HTTPException(status_code=500, detail="Failed to save settings")


@router.get("/ai-models")
def get_ai_models(refresh: bool = Query(False), admin: dict = Depends(require_admin)):
    """The AI provider's chat models, the recommended shortlist and the active model."""
    from app.services import ai_provider
    models, live = ai_provider.list_chat_models(force_refresh=refresh)
    available = {m["id"] for m in models}
    stored = load_global_settings()
    return {
        "active_model": ai_provider.active_model(),
        "fallback_models": stored.get("ai_fallback_models") if isinstance(stored.get("ai_fallback_models"), str) else settings.AI_FALLBACK_MODELS,
        "default_model": settings.AI_MODEL,
        "recommended": [m for m in ai_provider.RECOMMENDED_MODELS if not live or m in available],
        "models": models,
        "live": live,
    }


class AIModelUpdate(BaseModel):
    model: str
    fallback_models: Optional[str] = None


@router.post("/ai-model")
def set_ai_model(data: AIModelUpdate, admin: dict = Depends(require_admin)):
    from app.services import ai_provider
    model = data.model.strip()
    fallbacks = [m.strip() for m in (data.fallback_models or "").split(",") if m.strip()]
    if not model or len(model) > 200:
        raise HTTPException(status_code=400, detail="Choose a model.")
    models, live = ai_provider.list_chat_models()
    if live:
        available = {m["id"] for m in models}
        unknown = [m for m in [model] + fallbacks if m not in available]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Not a chat model offered by the AI provider: {', '.join(unknown)}")
    settings_data = {**load_global_settings(), "ai_model": model}
    if data.fallback_models is not None:
        settings_data["ai_fallback_models"] = ",".join(fallbacks)
    if not save_global_settings(settings_data):
        raise HTTPException(status_code=500, detail="Could not save the model. Run database/migration_v4.sql (app_settings table) and try again.")
    return {"status": "success", "active_model": model, "fallback_models": settings_data.get("ai_fallback_models", settings.AI_FALLBACK_MODELS)}
