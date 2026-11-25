# app/services/mail_oauth.py
"""
Mailbox access through Google / Microsoft sign-in (OAuth 2.0) instead of app
passwords. The existing IMAP poller and SMTP sender are reused: both providers
accept an OAuth access token over IMAP and SMTP (SASL XOAUTH2), so only the
login step differs from the app-password path.
"""
import base64
import logging
import smtplib
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from jose import jwt, JWTError
from supabase import create_client, Client

from app.core.config import settings
from app.core.encryption import encrypt_key, decrypt_key

logger = logging.getLogger(__name__)
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

PROVIDERS = {
    "google": {
        "label": "Google",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "https://mail.google.com/ openid email",
        "extra_authorize_params": {"access_type": "offline", "prompt": "consent"},
        "imap_host": "imap.gmail.com",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 465,
        "smtp_ssl": True,
    },
    "microsoft": {
        "label": "Microsoft",
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scope": "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access openid email",
        "extra_authorize_params": {"prompt": "select_account"},
        "imap_host": "outlook.office365.com",
        "smtp_host": "smtp.office365.com",
        "smtp_port": 587,
        "smtp_ssl": False,  # STARTTLS
    },
}


class OAuthToken(str):
    """An access token travelling where an app password used to; `provider` picks the mail servers."""
    provider: str = "google"

    def __new__(cls, value: str, provider: str):
        token = super().__new__(cls, value)
        token.provider = provider
        return token


class MailOAuthError(Exception):
    pass


def client_credentials(provider: str) -> tuple[str | None, str | None]:
    if provider == "google":
        return settings.GOOGLE_OAUTH_CLIENT_ID, settings.GOOGLE_OAUTH_CLIENT_SECRET
    if provider == "microsoft":
        return settings.MICROSOFT_OAUTH_CLIENT_ID, settings.MICROSOFT_OAUTH_CLIENT_SECRET
    return None, None


def provider_configured(provider: str) -> bool:
    client_id, client_secret = client_credentials(provider)
    return bool(client_id and client_secret)


def redirect_uri(provider: str, request_base_url: str) -> str:
    base = (settings.PUBLIC_BACKEND_URL or request_base_url).rstrip("/")
    return f"{base}/api/oauth/{provider}/callback"


# ------------------------------------------------------------------ state
# Frontend pages the callback may send the browser back to (never a free-form URL).
RETURN_PAGES = ("profile", "onboarding")


def make_state(user_id: str, provider: str, return_to: str = "profile") -> str:
    """Signed, short-lived: ties the callback to the user who started the flow (CSRF protection)."""
    return jwt.encode(
        {"sub": user_id, "provider": provider, "purpose": "mail_oauth",
         "return_to": return_to if return_to in RETURN_PAGES else "profile",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
        settings.SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )


def read_state(state: str, provider: str) -> str:
    try:
        payload = jwt.decode(state, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise MailOAuthError("The sign-in request expired. Please try again.")
    if payload.get("purpose") != "mail_oauth" or payload.get("provider") != provider or not payload.get("sub"):
        raise MailOAuthError("The sign-in request is not valid.")
    return payload["sub"]


def state_return_page(state: str | None) -> str:
    """The page the flow started from, or "profile" when the state is missing or invalid."""
    try:
        page = jwt.decode(state or "", settings.SUPABASE_JWT_SECRET, algorithms=["HS256"]).get("return_to")
    except JWTError:
        return "profile"
    return page if page in RETURN_PAGES else "profile"


def build_authorize_url(provider: str, user_id: str, request_base_url: str, return_to: str = "profile") -> str:
    cfg = PROVIDERS[provider]
    client_id, _ = client_credentials(provider)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri(provider, request_base_url),
        "response_type": "code",
        "scope": cfg["scope"],
        "state": make_state(user_id, provider, return_to),
        **cfg["extra_authorize_params"],
    }
    return f"{cfg['authorize_url']}?{urlencode(params)}"


# ------------------------------------------------------------------ tokens
def _token_request(provider: str, data: dict) -> dict:
    client_id, client_secret = client_credentials(provider)
    res = httpx.post(
        PROVIDERS[provider]["token_url"],
        data={"client_id": client_id, "client_secret": client_secret, **data},
        timeout=15.0,
    )
    if res.status_code != 200:
        # Body can name the cause (invalid_grant = access revoked) but never contains our secret.
        logger.warning(f"{provider} token endpoint answered {res.status_code}: {res.text[:200]}")
        raise MailOAuthError("The mail provider rejected the sign-in. Reconnect the mailbox in Settings.")
    return res.json()


def exchange_code(provider: str, code: str, request_base_url: str) -> dict:
    """Returns {'email', 'refresh_token', 'access_token', 'expires_in'}."""
    tokens = _token_request(provider, {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri(provider, request_base_url),
    })
    if not tokens.get("refresh_token"):
        raise MailOAuthError("The mail provider did not grant ongoing access. Please try connecting again.")
    email = None
    if tokens.get("id_token"):
        # Received directly from the provider's token endpoint over TLS, so the claims are trusted as-is.
        claims = jwt.get_unverified_claims(tokens["id_token"])
        email = claims.get("email") or claims.get("preferred_username")
    if not email:
        raise MailOAuthError("The mail provider did not return the mailbox address.")
    return {"email": email.strip().lower(), **tokens}


_token_cache: dict[str, tuple[str, float]] = {}
_cache_lock = threading.Lock()


def access_token_for(connection: dict) -> OAuthToken:
    provider = connection["provider"]
    with _cache_lock:
        cached = _token_cache.get(connection["id"])
        if cached and cached[1] - 60 > time.time():
            return OAuthToken(cached[0], provider)
    refresh_token = decrypt_key(connection.get("encrypted_refresh_token") or "")
    if not refresh_token:
        raise MailOAuthError("The stored mailbox connection could not be read. Reconnect the mailbox in Settings.")
    tokens = _token_request(provider, {"grant_type": "refresh_token", "refresh_token": refresh_token})
    with _cache_lock:
        _token_cache[connection["id"]] = (tokens["access_token"], time.time() + int(tokens.get("expires_in") or 3000))
    # Microsoft rotates refresh tokens; keep the newest or the connection dies after the old one expires.
    new_refresh = tokens.get("refresh_token")
    if new_refresh and new_refresh != refresh_token:
        try:
            supabase.table("mail_connections").update({
                "encrypted_refresh_token": encrypt_key(new_refresh),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", connection["id"]).execute()
        except Exception as e:
            logger.warning(f"Could not store rotated refresh token: {str(e)}")
    return OAuthToken(tokens["access_token"], provider)


# ------------------------------------------------------------------ storage
def store_connection(user_id: str, company_id: str, provider: str, email: str, refresh_token: str) -> dict:
    res = supabase.table("mail_connections").upsert({
        "user_id": user_id,
        "company_id": company_id,
        "provider": provider,
        "email": email,
        "encrypted_refresh_token": encrypt_key(refresh_token),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="user_id").execute()
    row = res.data[0]
    with _cache_lock:
        _token_cache.pop(row.get("id"), None)
    return row


def get_connection(user_id: str, company_id: str | None = None) -> dict | None:
    """The user's own connected mailbox, else one a teammate in the same company connected. Never raises."""
    try:
        own = supabase.table("mail_connections").select("*").eq("user_id", user_id).execute()
        if own.data:
            return own.data[0]
        if company_id is None:
            u = supabase.table("users").select("company_id").eq("id", user_id).execute()
            company_id = u.data[0].get("company_id") if u.data else None
        if not company_id or company_id == "00000000-0000-0000-0000-000000000000":
            return None
        team = supabase.table("mail_connections").select("*").eq("company_id", company_id).order("created_at").execute()
        return team.data[0] if team.data else None
    except Exception as e:
        logger.debug(f"mail_connections unavailable: {str(e)}")  # migration v8 not applied
        return None


def list_connections() -> list[dict]:
    try:
        return supabase.table("mail_connections").select("*").execute().data or []
    except Exception:
        return []


def delete_connections(company_id: str) -> int:
    res = supabase.table("mail_connections").delete().eq("company_id", company_id).execute()
    return len(res.data or [])


# ------------------------------------------------------------------ SMTP
def xoauth2_string(email: str, token: str) -> str:
    return base64.b64encode(f"user={email}\x01auth=Bearer {token}\x01\x01".encode()).decode()


def send_message_oauth(email: str, token: OAuthToken, to_address: str, message: str):
    cfg = PROVIDERS[token.provider]
    if cfg["smtp_ssl"]:
        server = smtplib.SMTP_SSL(cfg["smtp_host"], cfg["smtp_port"], timeout=30)
    else:
        server = smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"], timeout=30)
    with server:
        server.ehlo()
        if not cfg["smtp_ssl"]:
            server.starttls()
            server.ehlo()
        code, response = server.docmd("AUTH", "XOAUTH2 " + xoauth2_string(email, str(token)))
        if code != 235:
            raise smtplib.SMTPAuthenticationError(code, response)
        server.sendmail(email, to_address, message)
