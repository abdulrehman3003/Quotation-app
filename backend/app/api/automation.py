# app/api/automation.py
from typing import Optional
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
