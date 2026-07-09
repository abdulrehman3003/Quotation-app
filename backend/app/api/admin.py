# app/api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status, Body, Header, Request
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from app.core.security import get_current_user
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
    role: Optional[str] = None
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
    role: str = "user"

def verify_admin(request: Request):
    """
    Verifies that the request is authorized as admin.
    Allows local admin subdomain bypass using static header or standard Supabase JWT validation.
    """
    x_admin_auth = request.headers.get("x-admin-auth") or request.headers.get("X-Admin-Auth")
    import os
    if os.getenv("ENV") != "production" and x_admin_auth == "admin":
        return {"id": "admin", "email": "admin@axrflows.internal", "role": "admin"}
        
    try:
        from fastapi.security.utils import get_authorization_scheme_param
        authorization = request.headers.get("Authorization")
        scheme, credentials = get_authorization_scheme_param(authorization)
        if not authorization or scheme.lower() != "bearer":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
            
        from jose import jwt
        payload = jwt.decode(
            credentials,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        user_id = payload.get("sub")
        email = payload.get("email")
        
        # Verify role in public.users DB
        res = supabase.table("users").select("role").eq("id", user_id).execute()
        if not res.data or res.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Admin role required."
            )
            
        return {"id": user_id, "email": email, "role": "admin"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin verification failure: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )

@router.get("/users")
def list_users(admin: dict = Depends(verify_admin)):
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
            
            # If public profile is missing, auto-insert it
            if not profile:
                try:
                    insert_res = supabase.table("users").insert({
                        "id": user_id,
                        "email": auth_user.email,
                        "role": "user"
                    }).execute()
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
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_new_user(
    data: UserCreateInput,
    admin: dict = Depends(verify_admin)
):
    """
    Creates a new user account in auth and registers their profile.
    """
    try:
        # Create user in auth via admin API (supports gotrue/AdminUserAttributes and dictionary formats)
        auth_res = None
        try:
            from gotrue.types import AdminUserAttributes
            auth_res = supabase.auth.admin.create_user(AdminUserAttributes(
                email=data.email,
                password=data.password,
                email_confirm=True,
                user_metadata={"email_verified": True}
            ))
        except Exception as e_gotrue:
            logger.info(f"Failed to use AdminUserAttributes class, falling back to dict: {str(e_gotrue)}")
            auth_res = supabase.auth.admin.create_user({
                "email": data.email,
                "password": data.password,
                "email_confirm": True,
                "user_metadata": {"email_verified": True}
            })
        
        if not auth_res or not auth_res.user:
            raise HTTPException(status_code=500, detail="Failed to create user in auth database")
            
        user_id = auth_res.user.id
        
        # Update public profile (since the Postgres trigger on auth.users automatically inserts it)
        try:
            supabase.table("users").update({
                "name": data.name,
                "phone_number": data.phone_number,
                "role": data.role
            }).eq("id", user_id).execute()
        except Exception as update_err:
            logger.info(f"Update failed, falling back to upsert: {str(update_err)}")
            supabase.table("users").upsert({
                "id": user_id,
                "email": data.email,
                "name": data.name,
                "phone_number": data.phone_number,
                "role": data.role
            }).execute()
        
        logger.info(f"Admin created new user: {data.email}")
        return {"status": "success", "user_id": user_id}
    except Exception as e:
        logger.error(f"Failed to create new user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/users/{user_id}")
def update_user_profile(
    user_id: str,
    data: UserUpdateInput,
    admin: dict = Depends(verify_admin)
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
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(verify_admin)):
    """
    Deletes a user account.
    """
    try:
        supabase.auth.admin.delete_user(user_id)
        logger.info(f"Admin deleted user {user_id}")
        return {"status": "success", "message": f"User {user_id} successfully deleted"}
    except Exception as e:
        logger.error(f"Failed to delete user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/system-status")
def system_status(admin: dict = Depends(verify_admin)):
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
def list_logs(limit: int = 100, admin: dict = Depends(verify_admin)):
    """
    Lists system logs from database.
    """
    try:
        res = supabase.table("system_logs").select("*").order("created_at", desc=True).limit(limit).execute()
        return res.data
    except Exception as e:
        logger.error(f"Failed to fetch system logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/logs")
def add_log(
    source: str = Body(...),
    level: str = Body(...),
    message: str = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Allows logging of frontend (and backend) diagnostics into the system_logs database.
    """
    try:
        supabase.table("system_logs").insert({
            "source": source,
            "level": level,
            "message": message
        }).execute()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to save system log: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save log")

import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "global_settings.json")

def load_global_settings():
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load global settings: {e}")
    # Default fallback parameters
    return {
        "base_labor_rate": 50.0,
        "base_material_markup": 1.2
    }

def save_global_settings(settings_data):
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings_data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Failed to save global settings: {e}")
        return False

@router.get("/settings")
def get_settings(admin: dict = Depends(verify_admin)):
    return load_global_settings()

@router.post("/settings")
def update_settings(
    base_labor_rate: float = Body(...),
    base_material_markup: float = Body(...),
    admin: dict = Depends(verify_admin)
):
    settings_data = {
        "base_labor_rate": base_labor_rate,
        "base_material_markup": base_material_markup
    }
    if save_global_settings(settings_data):
        return {"status": "success", "settings": settings_data}
    raise HTTPException(status_code=500, detail="Failed to save settings file")
