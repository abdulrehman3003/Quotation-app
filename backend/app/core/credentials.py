# app/core/credentials.py
from supabase import create_client, Client
from app.core.config import settings
from app.core.encryption import decrypt_key
import logging

logger = logging.getLogger(__name__)

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def is_placeholder(val: str | None) -> bool:
    if not val:
        return True
    val_lower = val.lower().strip()
    return any(p in val_lower for p in [
        "your_gemini", "your-gemini", "your_gmail", "your-gmail", 
        "your_twilio", "your-twilio", "placeholder", "your_supabase", "your-supabase",
        "your-project", "your-supabase-jwt-secret"
    ])

def get_admin_credentials() -> dict:
    """
    Queries the database for an admin's encrypted credentials and decrypts them.
    Returns a dictionary of credentials if found.
    """
    try:
        res = supabase.table("users").select("*").eq("role", "admin").execute()
        if res.data:
            for profile in res.data:
                enc_gemini = profile.get("encrypted_gemini_key")
                enc_gmail_email = profile.get("encrypted_gmail_email")
                enc_gmail_pwd = profile.get("encrypted_gmail_password")
                enc_twilio_sid = profile.get("encrypted_twilio_sid")
                enc_twilio_token = profile.get("encrypted_twilio_token")
                enc_twilio_phone = profile.get("encrypted_twilio_phone")
                
                creds = {
                    "gemini_key": decrypt_key(enc_gemini) if enc_gemini else None,
                    "gmail_email": decrypt_key(enc_gmail_email) if enc_gmail_email else None,
                    "gmail_password": decrypt_key(enc_gmail_pwd) if enc_gmail_pwd else None,
                    "twilio_sid": decrypt_key(enc_twilio_sid) if enc_twilio_sid else None,
                    "twilio_token": decrypt_key(enc_twilio_token) if enc_twilio_token else None,
                    "twilio_phone": decrypt_key(enc_twilio_phone) if enc_twilio_phone else None,
                }
                # Check if we have valid non-placeholder credentials
                has_valid = any(v and not is_placeholder(v) for v in creds.values())
                if has_valid:
                    return creds
    except Exception as e:
        logger.error(f"Failed to retrieve admin fallback credentials: {str(e)}")
    return {}

def get_gemini_api_key(user_id: str | None = None) -> str | None:
    # 1. Check user key if user_id is provided
    if user_id:
        try:
            res = supabase.table("users").select("encrypted_gemini_key").eq("id", user_id).execute()
            if res.data and res.data[0].get("encrypted_gemini_key"):
                decrypted = decrypt_key(res.data[0]["encrypted_gemini_key"])
                if decrypted and not is_placeholder(decrypted):
                    return decrypted
        except Exception as e:
            logger.error(f"Failed to fetch gemini key for user {user_id}: {str(e)}")

    # 2. Check environment setting
    env_key = settings.GEMINI_API_KEY
    if env_key and not is_placeholder(env_key):
        return env_key

    # 3. Fallback to admin setting from database
    admin_creds = get_admin_credentials()
    admin_key = admin_creds.get("gemini_key")
    if admin_key and not is_placeholder(admin_key):
        return admin_key

    return None

def get_gmail_credentials(user_id: str | None = None) -> tuple[str | None, str | None]:
    # 1. Check user Gmail credentials if user_id is provided
    if user_id:
        try:
            res = supabase.table("users").select("encrypted_gmail_email", "encrypted_gmail_password").eq("id", user_id).execute()
            if res.data:
                profile = res.data[0]
                enc_email = profile.get("encrypted_gmail_email")
                enc_pwd = profile.get("encrypted_gmail_password")
                email = decrypt_key(enc_email) if enc_email else None
                pwd = decrypt_key(enc_pwd) if enc_pwd else None
                if email and pwd and not is_placeholder(email) and not is_placeholder(pwd):
                    return email, pwd
        except Exception as e:
            logger.error(f"Failed to fetch Gmail credentials for user {user_id}: {str(e)}")

    # 2. Check environment setting
    env_email = settings.GMAIL_EMAIL
    env_pwd = settings.GMAIL_APP_PASSWORD
    if env_email and env_pwd and not is_placeholder(env_email) and not is_placeholder(env_pwd):
        return env_email, env_pwd

    # 3. Fallback to admin setting from database
    admin_creds = get_admin_credentials()
    admin_email = admin_creds.get("gmail_email")
    admin_pwd = admin_creds.get("gmail_password")
    if admin_email and admin_pwd and not is_placeholder(admin_email) and not is_placeholder(admin_pwd):
        return admin_email, admin_pwd

    return None, None

def get_twilio_credentials(user_id: str | None = None) -> tuple[str | None, str | None, str | None]:
    # 1. Check user Twilio credentials if user_id is provided
    if user_id:
        try:
            res = supabase.table("users").select(
                "encrypted_twilio_sid",
                "encrypted_twilio_token",
                "encrypted_twilio_phone"
            ).eq("id", user_id).execute()
            if res.data:
                profile = res.data[0]
                enc_sid = profile.get("encrypted_twilio_sid")
                enc_token = profile.get("encrypted_twilio_token")
                enc_phone = profile.get("encrypted_twilio_phone")
                
                sid = decrypt_key(enc_sid) if enc_sid else None
                token = decrypt_key(enc_token) if enc_token else None
                phone = decrypt_key(enc_phone) if enc_phone else None
                
                if sid and token and phone and not is_placeholder(sid) and not is_placeholder(token) and not is_placeholder(phone):
                    return sid, token, phone
        except Exception as e:
            logger.error(f"Failed to fetch Twilio credentials for user {user_id}: {str(e)}")

    # 2. Check environment setting
    env_sid = settings.TWILIO_ACCOUNT_SID
    env_token = settings.TWILIO_AUTH_TOKEN
    env_phone = settings.TWILIO_WHATSAPP_NUMBER
    if env_sid and env_token and env_phone and not is_placeholder(env_sid) and not is_placeholder(env_token) and not is_placeholder(env_phone):
        return env_sid, env_token, env_phone

    # 3. Fallback to admin setting from database
    admin_creds = get_admin_credentials()
    admin_sid = admin_creds.get("twilio_sid")
    admin_token = admin_creds.get("twilio_token")
    admin_phone = admin_creds.get("twilio_phone")
    if admin_sid and admin_token and admin_phone and not is_placeholder(admin_sid) and not is_placeholder(admin_token) and not is_placeholder(admin_phone):
        return admin_sid, admin_token, admin_phone

    return None, None, None
