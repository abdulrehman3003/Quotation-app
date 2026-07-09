# app/api/users.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.encryption import decrypt_key
from supabase import create_client, Client
from app.core.config import settings
import logging

router = APIRouter(prefix="/users", tags=["User Profile"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

class ProfileUpdateInput(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    default_quote_parameters: Optional[dict] = None

class PasswordChangeInput(BaseModel):
    new_password: str

@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the profile information for the currently authenticated user.
    """
    try:
        res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        if not res.data:
            # Fallback/auto-register public profile if missing
            supabase.table("users").insert({
                "id": current_user["id"],
                "email": current_user["email"],
                "role": "user"
            }).execute()
            res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
            
        profile = res.data[0]
        enc_gmail_email = profile.get("encrypted_gmail_email")
        gmail_email = decrypt_key(enc_gmail_email) if enc_gmail_email else None

        return {
            "id": profile["id"],
            "email": profile["email"],
            "name": profile.get("name"),
            "phone_number": profile.get("phone_number"),
            "role": profile.get("role", "user"),
            "default_quote_parameters": profile.get("default_quote_parameters", {}),
            "gmail_email": gmail_email,
            "has_gemini_key": bool(profile.get("encrypted_gemini_key")),
            "has_gmail_email": bool(profile.get("encrypted_gmail_email")),
            "has_gmail_password": bool(profile.get("encrypted_gmail_password")),
            "has_twilio_sid": bool(profile.get("encrypted_twilio_sid"))
        }
    except Exception as e:
        logger.error(f"Failed to fetch profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load profile details")

@router.put("/profile")
def update_profile(
    data: ProfileUpdateInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Updates the profile information (excluding sensitive API credentials/password).
    """
    try:
        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name
        if data.phone_number is not None:
            update_data["phone_number"] = data.phone_number
        if data.default_quote_parameters is not None:
            update_data["default_quote_parameters"] = data.default_quote_parameters

        if not update_data:
            return {"status": "success", "message": "No columns to update"}

        res = supabase.table("users").update(update_data).eq("id", current_user["id"]).execute()
        return {"status": "success", "profile": res.data[0]}
    except Exception as e:
        logger.error(f"Failed to update profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save profile changes")

@router.put("/change-password")
def change_password(
    data: PasswordChangeInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Allows a user to securely change their password.
    """
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )
    try:
        # Use auth admin api or direct auth API to update user password
        supabase.auth.admin.update_user_by_id(
            current_user["id"],
            {"password": data.new_password}
        )
        logger.info(f"User {current_user['id']} successfully updated password")
        return {"status": "success", "message": "Password changed successfully"}
    except Exception as e:
        logger.error(f"Failed to change password: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update password")
