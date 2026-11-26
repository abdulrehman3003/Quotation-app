# app/core/credentials.py
from supabase import create_client, Client
from app.core.config import settings
from app.core.encryption import decrypt_key
from app.core.security import DEFAULT_COMPANY_ID
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


def _get_company_teammates(user_id: str) -> list[dict]:
    """
    Returns profiles of users in the same isolated company (ordered by created_at asc,
    so the company owner/creator comes first). Never shares across DEFAULT_COMPANY_ID.
    """
    try:
        u_res = supabase.table("users").select("company_id").eq("id", user_id).execute()
        if not u_res.data:
            return []
        company_id = u_res.data[0].get("company_id")
        if not company_id or company_id == DEFAULT_COMPANY_ID:
            return []
        team_res = supabase.table("users").select("*").eq("company_id", company_id).order("created_at", desc=False).execute()
        return team_res.data or []
    except Exception as e:
        logger.warning(f"Failed to load company teammates for credential lookup ({user_id}): {str(e)}")
        return []


def get_admin_credentials() -> dict:
    """
    Queries the database for an admin's encrypted credentials and decrypts them.
    Returns a dictionary of credentials if found.
    Only used when ALLOW_ADMIN_CREDENTIAL_FALLBACK is enabled.
    """
    if not settings.ALLOW_ADMIN_CREDENTIAL_FALLBACK:
        return {}
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
                has_valid = any(v and not is_placeholder(v) for v in creds.values())
                if has_valid:
                    return creds
    except Exception as e:
        logger.error(f"Failed to retrieve admin fallback credentials: {str(e)}")
    return {}


def get_ai_api_key(user_id: str | None = None) -> str | None:
    # 1. Check user key (and company teammates' key) if user_id is provided
    if user_id:
        try:
            res = supabase.table("users").select("encrypted_gemini_key").eq("id", user_id).execute()
            if res.data and res.data[0].get("encrypted_gemini_key"):
                decrypted = decrypt_key(res.data[0]["encrypted_gemini_key"])
                if decrypted and not is_placeholder(decrypted):
                    return decrypted
            for member in _get_company_teammates(user_id):
                if member.get("encrypted_gemini_key"):
                    decrypted = decrypt_key(member["encrypted_gemini_key"])
                    if decrypted and not is_placeholder(decrypted):
                        return decrypted
        except Exception as e:
            logger.error(f"Failed to fetch gemini key for user {user_id}: {str(e)}")

    # 2. Check environment setting
    env_key = settings.AI_API_KEY
    if env_key and not is_placeholder(env_key):
        return env_key

    # 3. Fallback to admin setting from database
    admin_creds = get_admin_credentials()
    admin_key = admin_creds.get("gemini_key")
    if admin_key and not is_placeholder(admin_key):
        return admin_key

    return None


def get_gmail_credentials(user_id: str | None = None) -> tuple[str | None, str | None]:
    # 0. A mailbox connected with Google / Microsoft sign-in wins over app passwords.
    #    The second value is then an OAuthToken (a str that also names its provider).
    if user_id:
        from app.services import mail_oauth
        connection = mail_oauth.get_connection(user_id)
        if connection:
            try:
                return connection["email"], mail_oauth.access_token_for(connection)
            except Exception as e:
                logger.error(f"Connected {connection.get('provider')} mailbox could not be used: {str(e)}")

    # 1. Check user Gmail credentials (and company teammates' credentials) if user_id is provided
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
            for member in _get_company_teammates(user_id):
                enc_email = member.get("encrypted_gmail_email")
                enc_pwd = member.get("encrypted_gmail_password")
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


def has_workspace_gmail(user_id: str) -> bool:
    """
    True only when the user (or a teammate in their own company) has saved Gmail
    credentials in their settings. Deliberately ignores the env / admin fallbacks:
    it gates whether the inbox is shown at all, so it must reflect what the
    workspace itself has connected.
    """
    def _valid(profile: dict) -> bool:
        enc_email = profile.get("encrypted_gmail_email")
        enc_pwd = profile.get("encrypted_gmail_password")
        if not (enc_email and enc_pwd):
            return False
        email = decrypt_key(enc_email)
        pwd = decrypt_key(enc_pwd)
        return bool(email and pwd and not is_placeholder(email) and not is_placeholder(pwd))

    try:
        from app.services import mail_oauth
        if mail_oauth.get_connection(user_id):
            return True
        res = supabase.table("users").select("encrypted_gmail_email", "encrypted_gmail_password").eq("id", user_id).execute()
        if res.data and _valid(res.data[0]):
            return True
        return any(_valid(member) for member in _get_company_teammates(user_id))
    except Exception as e:
        logger.error(f"Failed to check Gmail configuration for user {user_id}: {str(e)}")
        return False


def get_twilio_credentials(user_id: str | None = None) -> tuple[str | None, str | None, str | None]:
    # 1. Check user Twilio credentials (and company teammates' credentials) if user_id is provided
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
            for member in _get_company_teammates(user_id):
                enc_sid = member.get("encrypted_twilio_sid")
                enc_token = member.get("encrypted_twilio_token")
                enc_phone = member.get("encrypted_twilio_phone")
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
