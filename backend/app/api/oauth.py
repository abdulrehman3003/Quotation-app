# app/api/oauth.py
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.security import get_current_user, _load_profile_fields
from app.services import mail_oauth

router = APIRouter(prefix="/oauth", tags=["Mailbox sign-in"])
logger = logging.getLogger(__name__)


def _check_provider(provider: str):
    if provider not in mail_oauth.PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown mail provider")
    if not mail_oauth.provider_configured(provider):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{mail_oauth.PROVIDERS[provider]['label']} sign-in is not set up on this server yet."
        )


@router.get("/status")
def oauth_status(request: Request, current_user: dict = Depends(get_current_user)):
    connection = mail_oauth.get_connection(current_user["id"], current_user["company_id"])
    return {
        "providers": {
            name: {
                "configured": mail_oauth.provider_configured(name),
                "redirect_uri": mail_oauth.redirect_uri(name, str(request.base_url)),
            }
            for name in mail_oauth.PROVIDERS
        },
        "connection": {"provider": connection["provider"], "email": connection["email"]} if connection else None,
    }


@router.get("/{provider}/start")
def oauth_start(provider: str, request: Request, current_user: dict = Depends(get_current_user)):
    _check_provider(provider)
    return {"url": mail_oauth.build_authorize_url(provider, current_user["id"], str(request.base_url))}


@router.get("/{provider}/callback")
def oauth_callback(provider: str, request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    """
    Where Google / Microsoft send the browser back. Unauthenticated by nature;
    the signed `state` proves which signed-in user started the flow.
    """
    frontend = (settings.FRONTEND_URL or "").rstrip("/")

    def finish(result: str):
        if frontend:
            return RedirectResponse(f"{frontend}/profile?mail={result}", status_code=status.HTTP_303_SEE_OTHER)
        return {"status": result}

    if provider not in mail_oauth.PROVIDERS or not mail_oauth.provider_configured(provider):
        return finish("error")
    if error or not code or not state:
        return finish("cancelled")
    try:
        user_id = mail_oauth.read_state(state, provider)
        tokens = mail_oauth.exchange_code(provider, code, str(request.base_url))
        company_id = _load_profile_fields(user_id)["company_id"]
        mail_oauth.store_connection(user_id, company_id, provider, tokens["email"], tokens["refresh_token"])
    except mail_oauth.MailOAuthError as e:
        logger.warning(f"Mailbox sign-in failed: {str(e)}")
        return finish("error")
    except Exception as e:
        logger.error(f"Mailbox sign-in could not be saved: {str(e)}")
        return finish("error")
    return finish("connected")


@router.delete("/connection")
def oauth_disconnect(current_user: dict = Depends(get_current_user)):
    try:
        removed = mail_oauth.delete_connections(current_user["company_id"])
    except Exception as e:
        logger.error(f"Failed to disconnect mailbox: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to disconnect the mailbox")
    return {"status": "disconnected", "removed": removed}
