# app/api/automation.py
from typing import List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import get_current_user, DEFAULT_COMPANY_ID
from app.services.automation import get_company_settings, save_company_settings, AutomationUnavailable

router = APIRouter(prefix="/automation", tags=["Automation"])
logger = logging.getLogger(__name__)


class AutomationInput(BaseModel):
    auto_draft_quotes: Optional[bool] = None
    auto_follow_up: Optional[bool] = None
    follow_up_after_days: Optional[int] = None
    webhook_url: Optional[str] = None
    wa_follow_up: Optional[bool] = None
    wa_follow_up_after_hours: Optional[int] = None
    chat_nudge: Optional[bool] = None
    chat_nudge_after_hours: Optional[int] = None
    expiry_reminder: Optional[bool] = None
    expiry_reminder_days_before: Optional[int] = None
    team_reminders: Optional[bool] = None
    team_reminder_after_days: Optional[int] = None
    timezone: Optional[str] = None
    business_hours_start: Optional[int] = None
    business_hours_end: Optional[int] = None
    business_days: Optional[List[str]] = None


@router.get("")
def read_automation(current_user: dict = Depends(get_current_user)):
    return get_company_settings(current_user["company_id"])


@router.put("")
def update_automation(data: AutomationInput, current_user: dict = Depends(get_current_user)):
    if current_user["company_id"] == DEFAULT_COMPANY_ID:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Automation is not available in the shared default workspace.")
    try:
        return save_company_settings(current_user["company_id"], data.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except AutomationUnavailable as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@router.get("/reminders")
def read_reminders(current_user: dict = Depends(get_current_user)):
    """Quotes waiting on the customer and quotes about to expire, for the staff dashboard."""
    from app.services.followups import team_reminders
    try:
        return team_reminders(current_user["company_id"], get_company_settings(current_user["company_id"]))
    except Exception as e:
        logger.warning(f"Reminders unavailable: {e}")
        return {"enabled": False, "waiting": [], "expiring": []}
