from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from typing import List
from app.core.security import get_current_user
from app.schemas.pydantic_models import LeadCreate, LeadResponse
from supabase import create_client, Client
from app.core.config import settings

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["Leads"])

# Standard Supabase Client using Service Role key
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead(lead: LeadCreate, current_user: dict = Depends(get_current_user)):
    """
    Creates a new lead associated with the authenticated user's company.
    """
    try:
        response = supabase.table("leads").insert({
            "user_id": current_user["id"],
            "company_id": current_user["company_id"],
            "title": lead.title,
            "raw_text": lead.raw_text,
            "source": lead.source,
            "status": "pending"
        }).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database insert failed"
            )
            
        return response.data[0]
    except Exception as e:
        logger.error(f"Failed to create lead: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create lead"
        )

@router.get("", response_model=List[LeadResponse])
def list_leads(current_user: dict = Depends(get_current_user)):
    """
    Lists all leads belonging to the authenticated user's company.
    """
    try:
        response = supabase.table("leads")\
            .select("*")\
            .eq("company_id", current_user["company_id"])\
            .order("created_at", desc=True)\
            .execute()
        return response.data
    except Exception as e:
        logger.error(f"Failed to retrieve leads: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve leads"
        )

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves a single lead, validating company ownership.
    """
    try:
        response = supabase.table("leads")\
            .select("*")\
            .eq("id", lead_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found or unauthorized"
            )
            
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve lead: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve lead"
        )

@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Deletes a lead, validating company ownership.
    """
    try:
        # Check ownership first
        check_response = supabase.table("leads")\
            .select("id")\
            .eq("id", lead_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not check_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found or unauthorized"
            )
            
        supabase.table("leads").delete().eq("id", lead_id).execute()
        return
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete lead: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete lead"
        )

# Webhook lead ingestion endpoint (e.g. from postmark, sendgrid, or custom email forwarder)
@router.post("/webhook", status_code=status.HTTP_201_CREATED)
def lead_webhook(payload: dict, request: Request):
    """
    Public webhook route for automatic email ingestion.
    Requires the X-Webhook-Token header to match WEBHOOK_SECRET_TOKEN; disabled when unset.
    """
    import hmac
    expected_token = settings.WEBHOOK_SECRET_TOKEN
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Lead webhook is disabled (WEBHOOK_SECRET_TOKEN not configured)"
        )
    webhook_token = request.headers.get("X-Webhook-Token") or ""
    if not hmac.compare_digest(webhook_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook token"
        )

    try:
        # Expected keys: user_id (tenant routing), subject, html/text body
        user_id = payload.get("user_id")
        subject = payload.get("subject", "Unstructured Lead via Webhook")
        body = payload.get("body", "")
        
        if not user_id or not body:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing user_id or body in payload"
            )
            
        # Fetch company_id for this user
        company_id = '00000000-0000-0000-0000-000000000000'
        user_res = supabase.table("users").select("company_id").eq("id", user_id).execute()
        if user_res.data and user_res.data[0].get("company_id"):
            company_id = user_res.data[0]["company_id"]

        response = supabase.table("leads").insert({
            "user_id": user_id,
            "company_id": company_id,
            "title": subject,
            "raw_text": body,
            "source": "webhook",
            "status": "pending"
        }).execute()
        
        return {"status": "success", "lead_id": response.data[0]["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook ingestion failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook ingestion failed"
        )

@router.post("/{lead_id}/reimport", response_model=LeadResponse)
def reimport_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Resets the lead status to 'pending' to allow re-triggering the quotation process.
    Also deletes any existing quote drafts associated with this lead.
    """
    try:
        # Check ownership
        check_response = supabase.table("leads")\
            .select("id")\
            .eq("id", lead_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not check_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found or unauthorized"
            )
            
        # Delete unsent drafts only. Quotes that were already sent stay on record
        # (customer link, reports, win rate); the next quote is a revision.
        supabase.table("quotes").delete().eq("lead_id", lead_id).eq("company_id", current_user["company_id"]).eq("status", "draft").execute()
        
        # Reset status to pending
        res = supabase.table("leads").update({"status": "pending"}).eq("id", lead_id).execute()
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reimport lead: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reimport lead"
        )


@router.post("/{lead_id}/part-file")
async def add_part_file(lead_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Measures a DXF or STL part file and appends the measurements to the lead's
    request text, so the quote is priced from real cut length / volume.
    The file itself is not stored.
    """
    from app.services.geometry import analyze_part_file, describe_geometry, GeometryError, MAX_PART_FILE_BYTES

    check = supabase.table("leads").select("*").eq("id", lead_id).eq("company_id", current_user["company_id"]).execute()
    if not check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found or unauthorized")
    lead = check.data[0]
    if lead.get("status") == "dispatched":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This lead's quote was already sent. Use Revise first.")

    data = await file.read(MAX_PART_FILE_BYTES + 1)
    try:
        geometry = analyze_part_file(file.filename or "", data)
    except GeometryError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Part file analysis failed: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This part file could not be analysed.")

    block = describe_geometry(file.filename or "part", geometry)
    try:
        res = supabase.table("leads").update({"raw_text": f"{lead['raw_text'].rstrip()}\n\n{block}"}).eq("id", lead_id).execute()
        return {"lead": res.data[0], "geometry": geometry}
    except Exception as e:
        logger.error(f"Failed to attach part geometry to lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save the part measurements")
