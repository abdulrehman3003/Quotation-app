# app/core/security.py
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from supabase import create_client, Client
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()

DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000000'

# Returned as the 403 detail for signed-in accounts an admin has not approved yet.
# The frontend matches on this prefix to show the "waiting for approval" screen.
PENDING_APPROVAL_DETAIL = "ACCOUNT_PENDING_APPROVAL: Your account is waiting for approval by an administrator."

# Returned as the 403 detail for signed-in accounts an admin has not approved yet.
# The frontend matches on this prefix to show the "waiting for approval" screen.
PENDING_APPROVAL_DETAIL = "ACCOUNT_PENDING_APPROVAL: Your account is waiting for approval by an administrator."

# Initialize Supabase client for token verification
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def _provision_isolated_company(user_id: str, email: str | None = None, preferred_name: str | None = None) -> str:
    """
    Creates a dedicated company row for a tenant user and migrates any records
    created by this user away from DEFAULT_COMPANY_ID so tenants are strictly isolated.
    """
    workspace_label = (preferred_name or "").strip()
    if not workspace_label:
        prefix = (email or "user").split("@")[0].strip() or "User"
        workspace_label = f"{prefix}'s Workspace"
    try:
        comp_res = supabase.table("companies").insert({"name": workspace_label}).execute()
        if comp_res.data and comp_res.data[0].get("id"):
            new_company_id = comp_res.data[0]["id"]
            supabase.table("users").update({"company_id": new_company_id}).eq("id", user_id).execute()
            # Migrate any existing user-owned records from DEFAULT_COMPANY_ID to the user's isolated company
            for tbl in ("leads", "quotes", "knowledge_base", "customer_emails", "whatsapp_chats", "dispatched_quotes"):
                try:
                    supabase.table(tbl).update({"company_id": new_company_id})\
                        .eq("user_id", user_id)\
                        .eq("company_id", DEFAULT_COMPANY_ID)\
                        .execute()
                except Exception:
                    pass
            return new_company_id
    except Exception as e:
        logger.warning(f"Failed to provision isolated company for user {user_id}: {str(e)}")
    return DEFAULT_COMPANY_ID


def is_access_approved(user_id: str) -> bool:
    """
    Whether an admin has approved this account (users.access_approved, migration v9).
    Before that migration is applied the column doesn't exist and every account is
    treated as approved, which is how the app behaved before.
    """
    try:
        res = supabase.table("users").select("access_approved").eq("id", user_id).execute()
    except Exception as e:
        if "access_approved" in str(e):
            logger.warning("users.access_approved is missing: run database/migration_v9_access_approval.sql to close open sign-up.")
            return True
        logger.error(f"Could not read access approval for {user_id}: {e}")
        return False
    return bool(res.data and res.data[0].get("access_approved"))


def is_access_approved(user_id: str) -> bool:
    """
    Whether an admin has approved this account (users.access_approved, migration v9).
    Before that migration is applied the column doesn't exist and every account is
    treated as approved, which is how the app behaved before.
    """
    try:
        res = supabase.table("users").select("access_approved").eq("id", user_id).execute()
    except Exception as e:
        if "access_approved" in str(e):
            logger.warning("users.access_approved is missing: run database/migration_v9_access_approval.sql to close open sign-up.")
            return True
        logger.error(f"Could not read access approval for {user_id}: {e}")
        return False
    return bool(res.data and res.data[0].get("access_approved"))


def _load_profile_fields(user_id: str, email: str | None = None) -> dict:
    """
    Returns company_id and role for a user from public.users.
    Automatically provisions a profile and an isolated company if missing or if a
    regular user is still attached to the shared DEFAULT_COMPANY_ID.
    """
    company_id = DEFAULT_COMPANY_ID
    role = "user"
    try:
        user_res = supabase.table("users").select("company_id", "role", "name", "default_quote_parameters").eq("id", user_id).execute()
        if user_res.data:
            row = user_res.data[0]
            company_id = row.get("company_id") or DEFAULT_COMPANY_ID
            role = row.get("role") or "user"
            params = row.get("default_quote_parameters") or {}
            preferred_company = params.get("company_name") if isinstance(params, dict) else None
            # Security fix: isolate non-admin users who were placed in the shared DEFAULT_COMPANY_ID
            if role != "admin" and company_id == DEFAULT_COMPANY_ID:
                company_id = _provision_isolated_company(user_id, email=email, preferred_name=preferred_company)
        else:
            # Profile row missing from public.users: create isolated company + upsert profile
            company_id = _provision_isolated_company(user_id, email=email)
            supabase.table("users").upsert({
                "id": user_id,
                "email": (email or "").strip().lower(),
                "role": "user",
                "company_id": company_id
            }, on_conflict="id").execute()
    except Exception as e:
        logger.warning(f"Failed to load profile fields for user {user_id}: {str(e)}")
    return {"company_id": company_id, "role": role}


def resolve_user_from_token(token: str, require_approved: bool = True) -> dict:
    """
    Validates a Supabase access token and returns {id, email, company_id, role}.
    Tries local HS256 verification first, then falls back to the Supabase Auth API
    (handles asymmetric signing keys). Raises HTTPException(401) on failure, and
    403 for an account an admin has not approved unless require_approved is False.
    """
    user_id = None
    email = None
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}  # Supabase aud is typically 'authenticated'
        )
        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id:
            raise JWTError("Invalid token: missing subject claim")
    except JWTError:
        try:
            res = supabase.auth.get_user(token)
        except Exception:
            res = None
        if not res or not res.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token"
            )
        user_id = res.user.id
        email = res.user.email

    user = {"id": user_id, "email": email, **_load_profile_fields(user_id, email=email)}
    user["access_approved"] = user.get("role") == "admin" or is_access_approved(user_id)
    if require_approved and not user["access_approved"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PENDING_APPROVAL_DETAIL)
    from app.core import plans
    user["workspace_suspended"] = user.get("role") != "admin" and plans.is_suspended(user.get("company_id"))
    if require_approved and user["workspace_suspended"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=plans.SUSPENDED_DETAIL)
    return user


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dependency to get the currently authenticated user from the Supabase JWT.
    Enforces server-side authentication validation, and refuses accounts an admin
    has not approved (open sign-up is closed).
    """
    return resolve_user_from_token(credentials.credentials)


def get_signed_in_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Like get_current_user, but also lets through accounts still waiting for approval.
    Only for the few endpoints such an account needs: reading its own profile and
    accepting a team invite.
    """
    return resolve_user_from_token(credentials.credentials, require_approved=False)


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency that only allows users whose public.users.role is 'admin'.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Admin role required."
        )
    return current_user
