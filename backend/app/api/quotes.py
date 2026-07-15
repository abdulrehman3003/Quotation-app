# app/api/quotes.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List
from app.core.security import get_current_user
from app.schemas.pydantic_models import QuoteResponse, QuoteCreate
from app.services.ai_engine import run_quote_engine
from supabase import create_client, Client
from app.core.config import settings
from decimal import Decimal
import logging

router = APIRouter(prefix="/quotes", tags=["Quotes"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

def safe_parse_quote(q: dict) -> dict:
    if not q:
        return q
    breakdown = q.get("itemized_breakdown")
    if isinstance(breakdown, str):
        try:
            import json
            q["itemized_breakdown"] = json.loads(breakdown)
        except Exception:
            q["itemized_breakdown"] = []
    elif breakdown is None:
        q["itemized_breakdown"] = []
    return q

@router.post("/generate", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
def generate_quote(
    lead_id: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """
    Triggers AI engine to calculate quote based on user's active knowledge base files,
    stores the quote draft, and sets the lead's status to processed.
    """
    try:
        # 1. Fetch and verify ownership of the Lead (by company)
        lead_response = supabase.table("leads")\
            .select("*")\
            .eq("id", lead_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not lead_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found or unauthorized"
            )
            
        lead = lead_response.data[0]
        
        # 2. Fetch all active Knowledge Base content for this company
        kb_response = supabase.table("knowledge_base")\
            .select("parsed_content")\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        kb_contents = [item["parsed_content"] for item in kb_response.data]
        
        # 3. Retrieve user profile and decrypt Gemini API key if available
        from app.core.encryption import decrypt_key
        user_res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
        user_profile = user_res.data[0] if user_res.data else {}
        
        gemini_key = None
        if user_profile.get("encrypted_gemini_key"):
            gemini_key = decrypt_key(user_profile["encrypted_gemini_key"])
            
        # 4. Invoke the Gemini Core AI Engine
        ai_output = run_quote_engine(
            lead["raw_text"], 
            kb_contents, 
            custom_api_key=gemini_key, 
            user_profile=user_profile
        )
        
        # Convert items to list of dict for JSONB column
        itemized_list = [item.model_dump() for item in ai_output.itemized_breakdown]
        
        # 4. Insert generated Quote as draft into DB
        quote_response = supabase.table("quotes").insert({
            "lead_id": lead_id,
            "user_id": current_user["id"],
            "company_id": current_user["company_id"],
            "material_cost": ai_output.material_cost,
            "labor_cost": ai_output.labor_cost,
            "total_cost": ai_output.total_cost,
            "itemized_breakdown": itemized_list,
            "email_draft": ai_output.email_draft,
            "status": "draft"
        }).execute()
        
        if not quote_response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save generated quote"
            )
            
        # 5. Update Lead status to 'processed'
        supabase.table("leads").update({"status": "processed"}).eq("id", lead_id).execute()
        
        return safe_parse_quote(quote_response.data[0])
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quote generation failure for lead {lead_id}: {str(e)}")
        # Update lead status to failed if generation crash
        try:
            supabase.table("leads").update({"status": "failed"}).eq("id", lead_id).execute()
        except Exception:
            pass
            
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Quote calculation failed: {str(e)}"
        )

@router.get("", response_model=List[QuoteResponse])
def list_quotes(current_user: dict = Depends(get_current_user)):
    """
    Lists all quotes belonging to the authenticated user's company.
    """
    try:
        response = supabase.table("quotes")\
            .select("*")\
            .eq("company_id", current_user["company_id"])\
            .order("created_at", desc=True)\
            .execute()
        return [safe_parse_quote(q) for q in response.data]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve quotes: {str(e)}"
        )

@router.get("/lead/{lead_id}", response_model=QuoteResponse)
def get_quote_by_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves the quote corresponding to a specific lead.
    """
    try:
        response = supabase.table("quotes")\
            .select("*")\
            .eq("lead_id", lead_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quote not found for this lead"
            )
            
        return safe_parse_quote(response.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve quote: {str(e)}"
        )

@router.put("/{quote_id}", response_model=QuoteResponse)
def update_quote(
    quote_id: str,
    material_cost: float = Body(None),
    labor_cost: float = Body(None),
    total_cost: float = Body(None),
    email_draft: str = Body(None),
    itemized_breakdown: List[dict] = Body(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Allows human-in-the-loop manual adjustments of pricing and email drafts.
    Strictly verifies company ownership before updating.
    """
    try:
        # Check ownership
        check_response = supabase.table("quotes")\
            .select("id")\
            .eq("id", quote_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not check_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quote not found or unauthorized"
            )
            
        update_data = {}
        if material_cost is not None:
            update_data["material_cost"] = material_cost
        if labor_cost is not None:
            update_data["labor_cost"] = labor_cost
        if total_cost is not None:
            update_data["total_cost"] = total_cost
        if email_draft is not None:
            update_data["email_draft"] = email_draft
        if itemized_breakdown is not None:
            update_data["itemized_breakdown"] = itemized_breakdown
            
        response = supabase.table("quotes")\
            .update(update_data)\
            .eq("id", quote_id)\
            .execute()
            
        return safe_parse_quote(response.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update quote: {str(e)}"
        )

@router.post("/{quote_id}/dispatch", response_model=QuoteResponse)
def dispatch_quote(quote_id: str, current_user: dict = Depends(get_current_user)):
    """
    Dispatches the generated quote (sends SMTP email, updates status, and logs details).
    """
    try:
        # Check ownership
        response = supabase.table("quotes")\
            .select("*")\
            .eq("id", quote_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quote not found or unauthorized"
            )
            
        quote = response.data[0]
        
        # Resolve lead details to extract customer info
        lead_res = supabase.table("leads").select("*").eq("id", quote["lead_id"]).execute()
        lead = lead_res.data[0] if lead_res.data else {}
        
        import re
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', lead.get("raw_text", ""))
        customer_email = email_match.group(0) if email_match else None
        
        phone_match = re.search(r'\+?[0-9]{3}[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,8}', lead.get("raw_text", ""))
        customer_phone = phone_match.group(0) if phone_match else None
        
        customer_name = "Customer"
        # If WhatsApp lead, resolve name and phone from chat
        if lead.get("source") == "whatsapp":
            chat_res = supabase.table("whatsapp_chats").select("customer_name", "phone_number").eq("company_id", current_user["company_id"]).execute()
            if chat_res.data:
                customer_name = chat_res.data[0].get("customer_name", "WhatsApp Lead")
                customer_phone = chat_res.data[0].get("phone_number")
        else:
            name_match = re.search(r'(?:Thank you,|Thanks,\s*|Manager,\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', lead.get("raw_text", ""))
            if name_match:
                customer_name = name_match.group(1).strip()
            else:
                customer_name = lead.get("title", "Customer").replace("Request for Quote:", "").strip()

        # Send SMTP mail using custom user credentials if customer email is present
        sent = False
        if customer_email:
            try:
                from app.core.encryption import decrypt_key
                from app.api.emails import send_smtp_email
                
                # Fetch user profile to get decrypted SMTP credentials
                user_res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
                user_profile = user_res.data[0] if user_res.data else {}
                
                gmail_email = None
                gmail_password = None
                if user_profile.get("encrypted_gmail_email") and user_profile.get("encrypted_gmail_password"):
                    gmail_email = decrypt_key(user_profile["encrypted_gmail_email"])
                    gmail_password = decrypt_key(user_profile["encrypted_gmail_password"])
                
                subject = f"AXRFLOWS Quotation - {lead.get('title', 'Cost Estimate')}"
                sent = send_smtp_email(
                    to_address=customer_email,
                    subject=subject,
                    body=quote["email_draft"],
                    custom_user=gmail_email,
                    custom_password=gmail_password
                )
            except Exception as smtp_err:
                logger.error(f"Failed to send quote SMTP email: {str(smtp_err)}")

        breakdown = quote.get("itemized_breakdown", [])
        if isinstance(breakdown, str):
            try:
                import json
                breakdown = json.loads(breakdown)
            except Exception:
                breakdown = []
                
        cost_desc = ", ".join([item.get("description", "") for item in breakdown]) if isinstance(breakdown, list) else "AI Calculated Quote"
        
        # Force cast quantity to integer to prevent Postgres "invalid input syntax for type integer: '292.0'" error
        raw_quantity = sum([item.get("quantity", 1) for item in breakdown]) if isinstance(breakdown, list) else 1
        try:
            quantity = int(round(float(raw_quantity)))
        except Exception:
            quantity = 1

        # Insert dispatch details into dispatched_quotes table for reporting/exports
        supabase.table("dispatched_quotes").insert({
            "user_id": current_user["id"],
            "company_id": current_user["company_id"],
            "customer_name": customer_name,
            "customer_email": customer_email or "No email",
            "customer_phone": customer_phone,
            "cost_description": cost_desc[:255] if cost_desc else "Quote",
            "quantity": quantity,
            "total_amount": quote.get("total_cost") or 0.00
        }).execute()
        
        # Update lead status to dispatched
        supabase.table("leads").update({"status": "dispatched"}).eq("id", quote["lead_id"]).execute()

        # Update quote status to dispatched
        dispatch_response = supabase.table("quotes")\
            .update({"status": "dispatched"})\
            .eq("id", quote_id)\
            .execute()
            
        return safe_parse_quote(dispatch_response.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to dispatch quote: {str(e)}"
        )

@router.get("/dispatched")
def list_dispatched_quotes(current_user: dict = Depends(get_current_user)):
    """
    Retrieves all dispatched quotation tracking records.
    Resolves customer information from the associated lead and includes the full itemized breakdown.
    """
    try:
        # 1. Fetch dispatched quotes
        quotes_res = supabase.table("quotes")\
            .select("*")\
            .eq("company_id", current_user["company_id"])\
            .eq("status", "dispatched")\
            .order("created_at", desc=True)\
            .execute()
            
        quotes = quotes_res.data if quotes_res.data else []
        
        # 2. Resolve associated leads for each quote to get customer details
        result = []
        for q in quotes:
            lead_id = q.get("lead_id")
            customer_name = "Customer"
            customer_email = "No email"
            customer_phone = None
            
            if lead_id:
                lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
                if lead_res.data:
                    lead = lead_res.data[0]
                    
                    import re
                    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', lead.get("raw_text", ""))
                    customer_email = email_match.group(0) if email_match else "No email"
                    
                    phone_match = re.search(r'\+?[0-9]{3}[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,8}', lead.get("raw_text", ""))
                    customer_phone = phone_match.group(0) if phone_match else None
                    
                    if lead.get("source") == "whatsapp":
                        chat_res = supabase.table("whatsapp_chats").select("customer_name", "phone_number").eq("company_id", current_user["company_id"]).execute()
                        if chat_res.data:
                            customer_name = chat_res.data[0].get("customer_name", "WhatsApp Lead")
                            customer_phone = chat_res.data[0].get("phone_number")
                    else:
                        name_match = re.search(r'(?:Thank you,|Thanks,\s*|Manager,\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', lead.get("raw_text", ""))
                        if name_match:
                            customer_name = name_match.group(1).strip()
                        else:
                            customer_name = lead.get("title", "Customer").replace("Request for Quote:", "").strip()
            
            # Safe JSON parsing if itemized_breakdown is a string
            breakdown = q.get("itemized_breakdown") or []
            if isinstance(breakdown, str):
                try:
                    import json
                    breakdown = json.loads(breakdown)
                except Exception:
                    breakdown = []

            cost_desc = ", ".join([item.get("description", "") for item in breakdown]) if isinstance(breakdown, list) else "AI Calculated Quote"
            qty = sum([item.get("quantity", 1) for item in breakdown]) if isinstance(breakdown, list) else 1

            result.append({
                "id": q["id"],
                "customer_name": customer_name,
                "customer_email": customer_email,
                "customer_phone": customer_phone,
                "cost_description": cost_desc,
                "quantity": qty,
                "material_cost": q.get("material_cost") or 0.00,
                "labor_cost": q.get("labor_cost") or 0.00,
                "total_amount": q.get("total_cost") or 0.00,
                "itemized_breakdown": breakdown,
                "created_at": q["created_at"]
            })
            
        return result
    except Exception as e:
        logger.error(f"Failed to load dispatched quotes reports: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve reports"
        )
