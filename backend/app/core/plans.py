# app/core/plans.py
"""
Subscription plans and their limits, set per company by an admin.

Enforced: users per company (on invite, admin create and move) and AI-drafted
quotes per calendar month (pipeline, automatic email drafts, WhatsApp). The
platform's own default company is never limited. Before migration v11 the plan
columns don't exist and nothing is limited, which is how the app behaved before.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from supabase import create_client, Client

from app.core.config import settings

logger = logging.getLogger(__name__)
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000000"
DEFAULT_PLAN = "starter"

# Keep in step with the pricing section of the landing page.
PLANS: dict[str, dict] = {
    "starter": {"label": "Starter", "max_users": 2, "max_quotes_per_month": 150},
    "growth": {"label": "Growth", "max_users": 5, "max_quotes_per_month": 500},
    "scale": {"label": "Scale", "max_users": None, "max_quotes_per_month": None},
}

# Monthly list prices in USD, for the admin overview's revenue estimate only.
PLAN_PRICES = {"starter": 59, "growth": 99, "scale": 249}

UPGRADE_HINT = "Contact us to upgrade your plan."

SUSPENDED_DETAIL = ("WORKSPACE_SUSPENDED: This workspace is paused. "
                    "Please contact AXRFLOWS to restore access.")


def _unlimited(plan: str = "scale") -> dict:
    return {"plan": plan, "label": PLANS.get(plan, PLANS["scale"])["label"], "max_users": None,
            "max_quotes_per_month": None, "custom_limits": False}


def company_plan(company_id: str | None) -> dict:
    """The company's plan with its effective limits (custom limits override the plan's). None = unlimited."""
    if not company_id or company_id == DEFAULT_COMPANY_ID:
        return {**_unlimited(), "label": "Platform"}
    try:
        res = supabase.table("companies").select("plan,max_users,max_quotes_per_month").eq("id", company_id).execute()
    except Exception as e:
        # Fail open: a plan lookup problem must never stop a customer quoting.
        if "plan" in str(e) or "max_users" in str(e):
            logger.warning("companies.plan is missing: run database/migration_v11_plans.sql to enforce plan limits.")
        else:
            logger.error(f"Could not read the plan for company {company_id}; not enforcing limits: {e}")
        return _unlimited()
    row = (res.data or [{}])[0]
    plan = row.get("plan") if row.get("plan") in PLANS else DEFAULT_PLAN
    base = PLANS[plan]
    custom_users, custom_quotes = row.get("max_users"), row.get("max_quotes_per_month")
    return {
        "plan": plan,
        "label": base["label"],
        "max_users": custom_users if custom_users is not None else base["max_users"],
        "max_quotes_per_month": custom_quotes if custom_quotes is not None else base["max_quotes_per_month"],
        "custom_limits": custom_users is not None or custom_quotes is not None,
    }


def is_suspended(company_id: str | None) -> bool:
    """True when an admin has suspended the company (migration v12). Fails open."""
    if not company_id or company_id == DEFAULT_COMPANY_ID:
        return False
    try:
        res = supabase.table("companies").select("status").eq("id", company_id).execute()
    except Exception as e:
        if "status" not in str(e):
            logger.error(f"Could not read the status of company {company_id}: {e}")
        return False
    return bool(res.data) and res.data[0].get("status") == "suspended"


def member_count(company_id: str, exclude_user_id: str | None = None) -> int:
    rows = supabase.table("users").select("id").eq("company_id", company_id).execute().data or []
    return sum(1 for r in rows if r.get("id") != exclude_user_id)


def month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def quotes_this_month(company_id: str) -> int:
    try:
        rows = supabase.table("quotes").select("id").eq("company_id", company_id)\
            .gte("created_at", month_start().isoformat()).execute().data or []
    except Exception as e:
        logger.error(f"Could not count this month's quotes for {company_id}: {e}")
        return 0
    return len(rows)


def usage(company_id: str) -> dict:
    plan = company_plan(company_id)
    return {**plan, "users": member_count(company_id), "quotes_this_month": quotes_this_month(company_id)}


def assert_seat_available(company_id: str, joining_user_id: str | None = None) -> None:
    """Refuses adding a user to a company whose plan is full. A user already in it is not counted twice."""
    plan = company_plan(company_id)
    limit = plan["max_users"]
    if limit is None:
        return
    if member_count(company_id, exclude_user_id=joining_user_id) >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"The {plan['label']} plan allows {limit} user{'s' if limit != 1 else ''} and this company has reached it. {UPGRADE_HINT}",
        )


def assert_quote_allowance(company_id: str) -> None:
    """Refuses another AI-drafted quote when the company has used its monthly allowance."""
    plan = company_plan(company_id)
    limit = plan["max_quotes_per_month"]
    if limit is None:
        return
    if quotes_this_month(company_id) >= limit:
        next_month = (month_start().replace(day=28) + timedelta(days=4)).replace(day=1)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(f"You've used all {limit} AI-drafted quotes in your {plan['label']} plan this month. "
                    f"{UPGRADE_HINT} The allowance resets on {next_month.day} {next_month.strftime('%B')}."),
        )
