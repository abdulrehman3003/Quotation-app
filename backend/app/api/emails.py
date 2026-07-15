# app/api/emails.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List
from app.core.security import get_current_user
from supabase import create_client, Client
from app.core.config import settings
from app.core.encryption import decrypt_key
import logging

router = APIRouter(prefix="/emails", tags=["Simulated Emails"])

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
logger = logging.getLogger(__name__)

@router.get("")
def list_emails(current_user: dict = Depends(get_current_user)):
    """
    Retrieves all simulated customer emails for the authenticated user's company.
    """
    try:
        response = supabase.table("customer_emails")\
            .select("*")\
            .eq("company_id", current_user["company_id"])\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
        return response.data
    except Exception as e:
        logger.error(f"Failed to fetch customer emails: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve customer emails"
        )

@router.post("/{email_id}/transfer")
def transfer_email_to_leads(email_id: str, current_user: dict = Depends(get_current_user)):
    """
    Transfers a customer email into the leads table as a new lead.
    Sets status of the email to 'imported'.
    """
    try:
        # 1. Fetch and verify ownership of the email by company
        email_res = supabase.table("customer_emails")\
            .select("*")\
            .eq("id", email_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not email_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not found or unauthorized"
            )
            
        email = email_res.data[0]
        
        # 2. Insert into the leads table
        lead_res = supabase.table("leads").insert({
            "user_id": current_user["id"],
            "company_id": current_user["company_id"],
            "title": email["subject"],
            "raw_text": f"Sender: {email['sender_email']}\n\n{email['body']}",
            "source": "email",
            "status": "pending"
        }).execute()
        
        if not lead_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to copy email into leads pipeline"
            )
            
        # 3. Update email status to 'imported'
        supabase.table("customer_emails")\
            .update({"status": "imported"})\
            .eq("id", email_id)\
            .execute()
            
        return {"lead": lead_res.data[0], "status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to transfer email {email_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Email transfer failed"
        )


def send_smtp_email(to_address: str, subject: str, body: str, custom_user: str | None = None, custom_password: str | None = None) -> bool:
    """
    Sends a real email via Gmail SMTP using configured credentials.
    Returns True on success, False if credentials are not configured.
    Raises an HTTPException on SMTP transport errors.
    """
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    from app.core.credentials import get_gmail_credentials, is_placeholder

    gmail_user = custom_user
    gmail_password = custom_password

    if not gmail_user or not gmail_password or is_placeholder(gmail_user) or is_placeholder(gmail_password):
        gmail_user, gmail_password = get_gmail_credentials()

    if not gmail_user or not gmail_password or is_placeholder(gmail_user) or is_placeholder(gmail_password):
        logger.warning("Gmail SMTP credentials not configured. Cannot send real email.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = to_address

    # Plain text part
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, gmail_password)
            server.sendmail(gmail_user, to_address, msg.as_string())
        logger.info(f"Email successfully sent to {to_address} via Gmail SMTP.")
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail SMTP authentication failed. Check GMAIL_EMAIL and GMAIL_APP_PASSWORD.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gmail authentication failed. Please check your App Password in .env or user settings."
        )
    except Exception as e:
        logger.error(f"Gmail SMTP send error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send email: {str(e)}"
        )


@router.post("/{email_id}/reply")
def reply_to_email(
    email_id: str,
    reply_body: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """
    Sends the generated email response back to the customer via real Gmail SMTP.
    Falls back to simulation log if Gmail credentials are not configured.
    """
    try:
        # Verify ownership by company
        email_res = supabase.table("customer_emails")\
            .select("*")\
            .eq("id", email_id)\
            .eq("company_id", current_user["company_id"])\
            .execute()
            
        if not email_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not found or unauthorized"
            )
            
        email = email_res.data[0]
        to_address = email["sender_email"]
        subject = f"Re: {email['subject']}"

        # Resolve user specific Gmail configurations from DB profile
        user_res = supabase.table("users").select("encrypted_gmail_email", "encrypted_gmail_password").eq("id", current_user["id"]).execute()
        gmail_user = None
        gmail_password = None
        if user_res.data:
            db_user = user_res.data[0]
            enc_email = db_user.get("encrypted_gmail_email")
            enc_pass = db_user.get("encrypted_gmail_password")
            if enc_email:
                gmail_user = decrypt_key(enc_email)
            if enc_pass:
                gmail_password = decrypt_key(enc_pass)

        # Attempt real SMTP dispatch via Gmail
        sent = send_smtp_email(to_address, subject, reply_body, gmail_user, gmail_password)
        
        if not sent:
            # Fallback: log the simulated dispatch
            logger.info(f"[SIMULATED] Email reply to: {to_address} | Subject: {subject}")
        
        # Update email status to 'replied'
        supabase.table("customer_emails")\
            .update({"status": "replied"})\
            .eq("id", email_id)\
            .execute()
            
        mode = "sent via Gmail" if sent else "simulated (configure Gmail credentials to send real emails)"
        return {
            "status": "success",
            "sent": sent,
            "to": to_address,
            "message": f"Reply {mode} to {to_address}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reply to email {email_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to dispatch email reply"
        )
