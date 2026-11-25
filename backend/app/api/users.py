# app/api/users.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from app.core.security import get_current_user, DEFAULT_COMPANY_ID, _provision_isolated_company
from app.core.encryption import encrypt_key, decrypt_key
from app.core import tenancy
from supabase import create_client, Client
from app.core.config import settings
import logging

router = APIRouter(prefix="/users", tags=["User Profile"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

INVITE_TOKEN_EXPIRY_DAYS = 14


class ProfileUpdateInput(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    company_name: Optional[str] = None
    default_quote_parameters: Optional[dict] = None
    onboarding_completed: Optional[bool] = None
    gemini_key: Optional[str] = None
    gmail_email: Optional[str] = None
    gmail_password: Optional[str] = None
    twilio_sid: Optional[str] = None
    twilio_token: Optional[str] = None
    twilio_phone: Optional[str] = None


class OnboardingSubmitInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    company_name: str = Field(..., min_length=1, max_length=150)
    phone_number: Optional[str] = None
    industry: Optional[str] = None
    currency: str = "USD"
    base_labor_rate: Optional[float] = Field(default=50.0, gt=0)
    base_material_markup: Optional[float] = Field(default=1.2, gt=0)
    payment_terms: Optional[str] = None
    gemini_key: Optional[str] = None
    gmail_email: Optional[str] = None
    gmail_password: Optional[str] = None
    twilio_sid: Optional[str] = None
    twilio_token: Optional[str] = None
    twilio_phone: Optional[str] = None


class AcceptInviteInput(BaseModel):
    invite_token: str
    name: Optional[str] = None


class PasswordChangeInput(BaseModel):
    current_password: str
    new_password: str


def _create_invite_token(company_id: str, company_name: str, inviter_id: str, inviter_name: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=INVITE_TOKEN_EXPIRY_DAYS)
    payload = {
        "purpose": "team_invite",
        "company_id": company_id,
        "company_name": company_name,
        "invited_by_id": inviter_id,
        "invited_by_name": inviter_name,
        "exp": exp
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


def _decode_invite_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "team_invite" or not payload.get("company_id"):
            raise ValueError("Invalid invite token purpose")
        return payload
    except (JWTError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired team invitation link."
        ) from e


def _resolve_company_name(company_id: str | None, fallback_params: dict | None = None) -> str:
    if company_id and company_id != DEFAULT_COMPANY_ID:
        try:
            comp_res = supabase.table("companies").select("name").eq("id", company_id).execute()
            if comp_res.data and comp_res.data[0].get("name"):
                return comp_res.data[0]["name"]
        except Exception as e:
            logger.warning(f"Failed to resolve company name for {company_id}: {str(e)}")
    if fallback_params and isinstance(fallback_params, dict) and fallback_params.get("company_name"):
        return str(fallback_params["company_name"])
    return ""


def _upsert_company_name(user_id: str, current_company_id: str | None, email: str | None, company_name: str) -> str:
    clean_name = company_name.strip()
    if not clean_name:
        return current_company_id or DEFAULT_COMPANY_ID

    if not current_company_id or current_company_id == DEFAULT_COMPANY_ID:
        return _provision_isolated_company(user_id, email=email, preferred_name=clean_name)

    try:
        supabase.table("companies").update({"name": clean_name}).eq("id", current_company_id).execute()
    except Exception as e:
        logger.warning(f"Failed to update company name for {current_company_id}: {str(e)}")
    return current_company_id


def _serialize_profile(profile: dict) -> dict:
    params = profile.get("default_quote_parameters")
    if not isinstance(params, dict):
        params = {}

    enc_gmail_email = profile.get("encrypted_gmail_email")
    gmail_email = decrypt_key(enc_gmail_email) if enc_gmail_email else None

    enc_twilio_phone = profile.get("encrypted_twilio_phone")
    twilio_phone = decrypt_key(enc_twilio_phone) if enc_twilio_phone else None

    company_id = profile.get("company_id") or DEFAULT_COMPANY_ID
    company_name = _resolve_company_name(company_id, params)

    # Determine onboarding completion state from column or JSONB fallback
    role = profile.get("role", "user")
    col_onboarded = profile.get("onboarding_completed")
    json_onboarded = params.get("onboarding_completed")
    onboarding_completed = bool(col_onboarded) or bool(json_onboarded) or (role == "admin")

    return {
        "id": profile["id"],
        "email": profile["email"],
        "name": profile.get("name") or "",
        "phone_number": profile.get("phone_number") or "",
        "role": role,
        "company_id": company_id,
        "company_name": company_name,
        "onboarding_completed": onboarding_completed,
        "default_quote_parameters": params,
        "gmail_email": gmail_email,
        "twilio_phone": twilio_phone,
        "has_gemini_key": bool(profile.get("encrypted_gemini_key")),
        "has_gmail_email": bool(profile.get("encrypted_gmail_email")),
        "has_gmail_password": bool(profile.get("encrypted_gmail_password")),
        "has_twilio_sid": bool(profile.get("encrypted_twilio_sid")),
        "has_twilio_token": bool(profile.get("encrypted_twilio_token")),
        "has_twilio_phone": bool(profile.get("encrypted_twilio_phone")),
    }


@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the profile information for the currently authenticated user.
    Uses upsert if the public.users row is missing to prevent duplicate email/key errors.
    """
    try:
        res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        if not res.data:
            company_id = current_user.get("company_id") or _provision_isolated_company(
                current_user["id"], email=current_user.get("email")
            )
            supabase.table("users").upsert({
                "id": current_user["id"],
                "email": (current_user.get("email") or "").strip().lower(),
                "role": "user",
                "company_id": company_id
            }, on_conflict="id").execute()
            res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()

        profile = res.data[0]
        return _serialize_profile(profile)
    except Exception as e:
        logger.error(f"Failed to fetch profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load profile details")


@router.get("/team")
def get_company_team(current_user: dict = Depends(get_current_user)):
    """
    Returns all team members belonging to the authenticated user's company
    along with a signed shareable invite token for inviting teammates.
    """
    try:
        company_id = current_user.get("company_id") or DEFAULT_COMPANY_ID
        if company_id == DEFAULT_COMPANY_ID:
            company_id = _provision_isolated_company(current_user["id"], email=current_user.get("email"))

        me_res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        me_profile = me_res.data[0] if me_res.data else {}
        me_params = me_profile.get("default_quote_parameters") if isinstance(me_profile.get("default_quote_parameters"), dict) else {}

        company_name = _resolve_company_name(company_id, me_params) or "Company Workspace"
        inviter_name = me_profile.get("name") or (current_user.get("email") or "").split("@")[0] or "Team Admin"

        invite_token = _create_invite_token(
            company_id=company_id,
            company_name=company_name,
            inviter_id=current_user["id"],
            inviter_name=inviter_name
        )

        members_res = supabase.table("users")\
            .select("id, email, name, phone_number, role, created_at")\
            .eq("company_id", company_id)\
            .order("created_at", desc=False)\
            .execute()

        members = []
        for m in (members_res.data or []):
            members.append({
                "id": m["id"],
                "email": m["email"],
                "name": m.get("name") or m["email"].split("@")[0],
                "phone_number": m.get("phone_number") or "",
                "role": m.get("role", "user"),
                "created_at": m.get("created_at")
            })

        return {
            "company_id": company_id,
            "company_name": company_name,
            "invite_token": invite_token,
            "members": members
        }
    except Exception as e:
        logger.error(f"Failed to fetch company team for user {current_user['id']}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load team details")


@router.get("/team/invite-info")
def verify_invite_token_info(token: str = Query(..., description="Signed team invitation token")):
    """
    Public endpoint to inspect a team invitation token before login/signup.
    """
    payload = _decode_invite_token(token)
    company_id = payload["company_id"]
    company_name = _resolve_company_name(company_id) or payload.get("company_name") or "Company Workspace"
    return {
        "valid": True,
        "company_id": company_id,
        "company_name": company_name,
        "invited_by_name": payload.get("invited_by_name") or "A team member"
    }


@router.post("/team/accept-invite")
def accept_team_invite(
    data: AcceptInviteInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Attaches the currently authenticated user to the company specified in the signed
    invite_token, inherits company quotation defaults, and marks onboarding completed.
    """
    payload = _decode_invite_token(data.invite_token)
    target_company_id = payload["company_id"]
    company_name = _resolve_company_name(target_company_id) or payload.get("company_name") or "Company Workspace"

    try:
        # Ensure target company exists in public.companies
        comp_check = supabase.table("companies").select("id, name").eq("id", target_company_id).execute()
        if not comp_check.data:
            supabase.table("companies").insert({"id": target_company_id, "name": company_name}).execute()

        # Inherit baseline default_quote_parameters from inviter or existing company member
        inherited_params = {
            "company_name": company_name,
            "onboarding_completed": True
        }
        inviter_id = payload.get("invited_by_id")
        if inviter_id:
            inviter_res = supabase.table("users").select("default_quote_parameters").eq("id", inviter_id).execute()
            if inviter_res.data and isinstance(inviter_res.data[0].get("default_quote_parameters"), dict):
                inherited_params = {
                    **inviter_res.data[0]["default_quote_parameters"],
                    "company_name": company_name,
                    "onboarding_completed": True
                }

        # The joiner's own mailbox / WhatsApp number must not belong to a third company.
        tenancy.assert_user_can_join(current_user["id"], target_company_id)

        existing_res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        existing = existing_res.data[0] if existing_res.data else {}
        existing_name = existing.get("name")
        final_name = (data.name or "").strip() or existing_name or (current_user.get("email") or "").split("@")[0]

        update_data = {
            "company_id": target_company_id,
            "name": final_name,
            "default_quote_parameters": inherited_params
        }

        try:
            supabase.table("users").update({
                **update_data,
                "onboarding_completed": True
            }).eq("id", current_user["id"]).execute()
        except Exception:
            supabase.table("users").update(update_data).eq("id", current_user["id"]).execute()

        refreshed = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        return {
            "status": "success",
            "company_id": target_company_id,
            "company_name": company_name,
            "profile": _serialize_profile(refreshed.data[0])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to accept team invite for user {current_user['id']}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to join company workspace")


@router.put("/profile")
def update_profile(
    data: ProfileUpdateInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Updates the user's profile information, company workspace name, quotation defaults,
    and optional self-service encrypted API credentials.
    """
    try:
        existing_res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        existing = existing_res.data[0] if existing_res.data else {}
        existing_params = existing.get("default_quote_parameters")
        if not isinstance(existing_params, dict):
            existing_params = {}

        tenancy.assert_no_credential_clash(
            current_user["id"],
            existing.get("company_id") or current_user.get("company_id") or DEFAULT_COMPANY_ID,
            data.gmail_email, data.twilio_phone
        )

        update_data = {}
        if data.name is not None:
            update_data["name"] = data.name.strip()
        if data.phone_number is not None:
            update_data["phone_number"] = data.phone_number.strip()

        merged_params = dict(existing_params)
        if data.default_quote_parameters is not None and isinstance(data.default_quote_parameters, dict):
            merged_params.update(data.default_quote_parameters)

        if data.company_name is not None and data.company_name.strip():
            clean_company = data.company_name.strip()
            new_comp_id = _upsert_company_name(
                current_user["id"],
                existing.get("company_id") or current_user.get("company_id"),
                current_user.get("email"),
                clean_company
            )
            update_data["company_id"] = new_comp_id
            merged_params["company_name"] = clean_company

        if data.onboarding_completed is not None:
            merged_params["onboarding_completed"] = bool(data.onboarding_completed)

        if merged_params != existing_params:
            update_data["default_quote_parameters"] = merged_params

        # Encrypt self-service credentials when non-empty strings are supplied
        if data.gemini_key is not None and data.gemini_key.strip():
            update_data["encrypted_gemini_key"] = encrypt_key(data.gemini_key.strip())
        if data.gmail_email is not None and data.gmail_email.strip():
            update_data["encrypted_gmail_email"] = encrypt_key(data.gmail_email.strip())
        if data.gmail_password is not None and data.gmail_password.strip():
            update_data["encrypted_gmail_password"] = encrypt_key(data.gmail_password.strip())
        if data.twilio_sid is not None and data.twilio_sid.strip():
            update_data["encrypted_twilio_sid"] = encrypt_key(data.twilio_sid.strip())
        if data.twilio_token is not None and data.twilio_token.strip():
            update_data["encrypted_twilio_token"] = encrypt_key(data.twilio_token.strip())
        if data.twilio_phone is not None and data.twilio_phone.strip():
            update_data["encrypted_twilio_phone"] = encrypt_key(data.twilio_phone.strip())

        if not update_data:
            return {"status": "success", "profile": _serialize_profile(existing)}

        if data.onboarding_completed is not None:
            try:
                supabase.table("users").update({
                    **update_data,
                    "onboarding_completed": bool(data.onboarding_completed)
                }).eq("id", current_user["id"]).execute()
            except Exception:
                supabase.table("users").update(update_data).eq("id", current_user["id"]).execute()
        else:
            supabase.table("users").update(update_data).eq("id", current_user["id"]).execute()

        refreshed = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        return {"status": "success", "profile": _serialize_profile(refreshed.data[0])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save profile changes")


@router.post("/onboarding")
def complete_onboarding(
    data: OnboardingSubmitInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Completes the multi-step onboarding wizard for a user.
    """
    try:
        existing_res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        existing = existing_res.data[0] if existing_res.data else {}
        existing_params = existing.get("default_quote_parameters")
        if not isinstance(existing_params, dict):
            existing_params = {}

        tenancy.assert_no_credential_clash(
            current_user["id"],
            existing.get("company_id") or current_user.get("company_id") or DEFAULT_COMPANY_ID,
            data.gmail_email, data.twilio_phone
        )

        clean_company = data.company_name.strip()
        company_id = _upsert_company_name(
            current_user["id"],
            existing.get("company_id") or current_user.get("company_id"),
            current_user.get("email"),
            clean_company
        )

        quote_params = {
            **existing_params,
            "company_name": clean_company,
            "industry": (data.industry or "").strip() or "Metal Fabrication & Manufacturing",
            "currency": (data.currency or "USD").strip().upper(),
            "base_labor_rate": float(data.base_labor_rate or 50.0),
            "base_material_markup": float(data.base_material_markup or 1.2),
            "payment_terms": (data.payment_terms or "Net 30 days. Quote valid for 14 days.").strip(),
            "onboarding_completed": True,
        }

        update_data = {
            "name": data.name.strip(),
            "phone_number": (data.phone_number or "").strip(),
            "company_id": company_id,
            "default_quote_parameters": quote_params,
        }

        if data.gemini_key and data.gemini_key.strip():
            update_data["encrypted_gemini_key"] = encrypt_key(data.gemini_key.strip())
        if data.gmail_email and data.gmail_email.strip():
            update_data["encrypted_gmail_email"] = encrypt_key(data.gmail_email.strip())
        if data.gmail_password and data.gmail_password.strip():
            update_data["encrypted_gmail_password"] = encrypt_key(data.gmail_password.strip())
        if data.twilio_sid and data.twilio_sid.strip():
            update_data["encrypted_twilio_sid"] = encrypt_key(data.twilio_sid.strip())
        if data.twilio_token and data.twilio_token.strip():
            update_data["encrypted_twilio_token"] = encrypt_key(data.twilio_token.strip())
        if data.twilio_phone and data.twilio_phone.strip():
            update_data["encrypted_twilio_phone"] = encrypt_key(data.twilio_phone.strip())

        try:
            supabase.table("users").update({
                **update_data,
                "onboarding_completed": True
            }).eq("id", current_user["id"]).execute()
        except Exception:
            supabase.table("users").update(update_data).eq("id", current_user["id"]).execute()

        refreshed = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        return {"status": "success", "profile": _serialize_profile(refreshed.data[0])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to complete onboarding for user {current_user['id']}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to complete onboarding setup")


@router.post("/onboarding/sample-kb")
def seed_sample_knowledge_base(current_user: dict = Depends(get_current_user)):
    """
    Seeds a starter Knowledge Base pricing catalog for the user's company.
    """
    try:
        company_id = current_user["company_id"]
        user_id = current_user["id"]

        sample_filename = "starter_pricing_catalog.csv"
        existing_kb = supabase.table("knowledge_base")\
            .select("id")\
            .eq("company_id", company_id)\
            .eq("filename", sample_filename)\
            .execute()

        if not existing_kb.data:
            sample_content = (
                "Item Code | Description | Unit | Base Price (USD) | Notes\n"
                "MAT-AL6061 | Aluminum 6061-T6 Sheet (4x8 ft, 3mm) | Sheet | 145.00 | Raw material subject to markup\n"
                "MAT-SS304 | Stainless Steel 304 Plate (4x8 ft, 4mm) | Sheet | 260.00 | Raw material subject to markup\n"
                "MAT-MS1018 | Mild Steel 1018 Sheet (4x8 ft, 3mm) | Sheet | 95.00 | Raw material subject to markup\n"
                "LAB-LASER | CNC Fiber Laser Cutting | Hour | 75.00 | Includes setup and nitrogen assist\n"
                "LAB-WELD | TIG/MIG Precision Welding | Hour | 65.00 | Certified structural welding\n"
                "LAB-BEND | CNC Press Brake Bending | Hour | 55.00 | Per hour machine + operator\n"
                "FIN-POWDER | Industrial Powder Coating (Matte/Gloss) | SqFt | 4.50 | Standard RAL colors\n"
            )
            supabase.table("knowledge_base").insert({
                "user_id": user_id,
                "company_id": company_id,
                "filename": sample_filename,
                "file_path": f"{user_id}/starter_pricing_catalog.csv",
                "content_type": "csv",
                "parsed_content": sample_content
            }).execute()

        return {"status": "success", "message": "Starter pricing catalog added to your Knowledge Base."}
    except Exception as e:
        logger.error(f"Failed to seed starter KB for user {current_user['id']}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to seed starter Knowledge Base")


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
    # Re-authenticate: a stolen session token alone must not be enough to take over
    # the account. A throwaway client is used so the shared service client's
    # credentials are never replaced by this user's session.
    try:
        from supabase import create_client
        verifier = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        verified = verifier.auth.sign_in_with_password({"email": current_user["email"], "password": data.current_password})
        if not verified or not verified.user or verified.user.id != current_user["id"]:
            raise ValueError("mismatch")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect."
        )
    try:
        supabase.auth.admin.update_user_by_id(
            current_user["id"],
            {"password": data.new_password}
        )
        logger.info(f"User {current_user['id']} successfully updated password")
        return {"status": "success", "message": "Password changed successfully"}
    except Exception as e:
        logger.error(f"Failed to change password: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update password")
