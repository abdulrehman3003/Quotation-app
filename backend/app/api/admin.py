# app/api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from typing import List, Optional, Literal
from pydantic import BaseModel
from app.core.security import get_current_user, require_admin, _provision_isolated_company
from app.core.encryption import encrypt_key
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

class UserCreateInput(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    phone_number: Optional[str] = None
    role: Literal["user", "admin"] = "user"

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
        comp_id = _provision_isolated_company(user_id, email=clean_email, preferred_name=f"{data.name}'s Workspace" if data.name else None)
        
        # Upsert public profile
        supabase.table("users").upsert({
            "id": user_id,
            "email": clean_email,
            "name": data.name,
            "phone_number": data.phone_number,
            "role": data.role,
            "company_id": comp_id
        }, on_conflict="id").execute()
        
        logger.info(f"Admin created new user: {clean_email}")
        return {"status": "success", "user_id": user_id}
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
    except Exception as e:
        logger.error(f"Failed to update user profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Admin operation failed. Check system logs for details.")

@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    """
    Deletes a user account.
    """
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
        "base_labor_rate": base_labor_rate,
        "base_material_markup": base_material_markup
    }
    if save_global_settings(settings_data):
        return {"status": "success", "settings": settings_data}
    raise HTTPException(status_code=500, detail="Failed to save settings")
