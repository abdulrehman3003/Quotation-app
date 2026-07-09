# app/services/email_poller.py
import threading
import time
import logging
from imap_tools import MailBox, AND
from supabase import create_client, Client
from app.core.config import settings
from app.core.encryption import decrypt_key

logger = logging.getLogger(__name__)

# Initialize database connection inside worker context
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def poll_user_mailbox(user_id: str, email_address: str, app_password: str):
    """
    Connects to a single user's Gmail IMAP account, fetches unread emails,
    inserts them into customer_emails, and marks them as read.
    """
    IMAP_SERVER = "imap.gmail.com"
    try:
        logger.info(f"Polling GMail IMAP for user {user_id} ({email_address})...")
        with MailBox(IMAP_SERVER).login(email_address, app_password) as mailbox:
            for msg in mailbox.fetch(AND(seen=False)):
                sender = msg.from_
                subject = msg.subject
                body = msg.text or msg.html or ""

                logger.info(f"New quotation email fetched for user {user_id} from {sender}: {subject}")

                # Save email in database customer_emails table
                supabase.table("customer_emails").insert({
                    "user_id": user_id,
                    "sender_email": sender,
                    "subject": subject,
                    "body": body,
                    "status": "unread"
                }).execute()

                # Mark as read on the remote Gmail server
                mailbox.flag(msg.uid, '\\Seen', True)
                logger.info(f"Marked email '{subject}' as read on user {user_id} Gmail server.")
    except Exception as e:
        logger.error(f"Gmail IMAP connection exception for user {user_id} ({email_address}): {str(e)}")

def poll_gmail_loop():
    """
    Background worker loop that iterates over all configured tenant user mailboxes,
    plus the global default GMail address fallback, and triggers IMAP polling.
    """
    while True:
        try:
            # 1. Fetch all tenant profiles
            users_res = supabase.table("users").select("*").execute()
            polled_user_ids = set()

            if users_res.data:
                for profile in users_res.data:
                    user_id = profile["id"]
                    enc_email = profile.get("encrypted_gmail_email")
                    enc_pwd = profile.get("encrypted_gmail_password")

                    if enc_email and enc_pwd:
                        email_addr = decrypt_key(enc_email)
                        app_pwd = decrypt_key(enc_pwd)
                        if email_addr and app_pwd:
                            polled_user_ids.add(user_id)
                            poll_user_mailbox(user_id, email_addr, app_pwd)

            # 2. Fallback to global GMail email from .env (assigning to the first user) if not already polled
            if settings.GMAIL_EMAIL and settings.GMAIL_APP_PASSWORD and "your_gmail_address_here" not in settings.GMAIL_EMAIL:
                if users_res.data:
                    first_user_id = users_res.data[0]["id"]
                    if first_user_id not in polled_user_ids:
                        poll_user_mailbox(first_user_id, settings.GMAIL_EMAIL, settings.GMAIL_APP_PASSWORD)

        except Exception as global_err:
            logger.error(f"Global GMail poller loop error: {str(global_err)}")

        # Wait 30 seconds before next polling cycle
        time.sleep(30)

def start_email_poller():
    """
    Launches the Gmail IMAP poller worker in a background daemon thread.
    """
    thread = threading.Thread(target=poll_gmail_loop, daemon=True)
    thread.start()
