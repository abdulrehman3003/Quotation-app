# app/services/email_poller.py
import fcntl
import os
import tempfile
import threading
import time
import logging
from datetime import datetime, timedelta, timezone
from imap_tools import MailBox, AND
from supabase import create_client, Client
from app.core.config import settings
from app.core.encryption import decrypt_key
from app.core.security import DEFAULT_COMPANY_ID
from app.services.parser import attachments_to_text, clean_email_body
from app.services.automation import get_company_settings, run_follow_ups

logger = logging.getLogger(__name__)

# Initialize database connection inside worker context
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

LOCK_FILE_PATH = os.path.join(tempfile.gettempdir(), "axrflows_email_poller.lock")
_lock_handle = None  # kept open for the life of the process to hold the lock


# Automatic drafting spends AI quota, so a flood of mail cannot run it unbounded:
# anything beyond the cap stays in the inbox for a person to import.
MAX_AUTO_DRAFTS_PER_PASS = 5
_AUTOMATED_SENDER_HINTS = ("no-reply", "noreply", "do-not-reply", "donotreply", "mailer-daemon", "postmaster", "notifications@", "newsletter")


def is_auto_draftable(sender: str, own_address: str) -> bool:
    sender = (sender or "").strip().lower()
    if not sender or sender == (own_address or "").strip().lower():
        return False
    return not any(hint in sender for hint in _AUTOMATED_SENDER_HINTS)


def auto_draft_email(email_row: dict, user_id: str, company_id: str):
    """
    Turns a stored customer email into a lead with an AI-drafted quote waiting in
    the pipeline. Nothing is sent to the customer; a person still reviews and sends.
    """
    from app.api.quotes import create_draft_for_lead
    lead = None
    try:
        lead_res = supabase.table("leads").insert({
            "user_id": user_id,
            "company_id": company_id,
            "title": email_row["subject"],
            "raw_text": f"Sender: {email_row['sender_email']}\n\n{email_row['body']}",
            "source": "email",
            "status": "pending"
        }).execute()
        lead = lead_res.data[0]
        supabase.table("customer_emails").update({"status": "imported"}).eq("id", email_row["id"]).execute()
        create_draft_for_lead(lead, user_id, company_id)
        logger.info(f"Auto-drafted a quote for email {email_row['id']}.")
    except Exception as e:
        # The lead (if created) stays in the pipeline as New so it can be priced by hand.
        logger.error(f"Automatic draft failed for email {email_row.get('id')}: {str(e)}")


SPAM_LOOKBACK_DAYS = 7
_SPAM_FOLDER_NAMES = ("[Gmail]/Spam", "[Google Mail]/Spam", "Junk", "Junk Email", "Junk E-mail", "Spam", "INBOX.Spam", "INBOX.Junk")


def find_spam_folder(mailbox) -> str | None:
    """Returns the mailbox's spam/junk folder name: the one flagged \\Junk, else a known name."""
    try:
        folders = list(mailbox.folder.list())
    except Exception as e:
        logger.warning(f"Could not list mail folders: {e}")
        return None
    for f in folders:
        if any(flag.lower() == "\\junk" for flag in (f.flags or ())):
            return f.name
    names = {f.name.lower(): f.name for f in folders}
    for candidate in _SPAM_FOLDER_NAMES:
        if candidate.lower() in names:
            return names[candidate.lower()]
    return None


# A spam folder can hold hundreds of junk messages; take the newest few per pass.
MAX_SPAM_PER_PASS = 25


def _process_folder(mailbox, criteria, from_spam: bool, user_id: str, company_id: str, email_address: str, auto_draft: bool):
    """Stores unread messages of the currently selected folder as customer emails."""
    auto_drafted = 0
    fetch_kwargs = {"limit": MAX_SPAM_PER_PASS, "reverse": True} if from_spam else {}
    for msg in mailbox.fetch(criteria, mark_seen=False, **fetch_kwargs):
        sender_addr = (msg.from_ or "").strip()
        subject_text = (msg.subject or "(no subject)").strip()
        body_text = clean_email_body(msg.text, msg.html)
        try:
            attachment_text = attachments_to_text(
                [(att.filename, att.payload) for att in (msg.attachments or []) if att.filename]
            )
            if attachment_text:
                body_text = f"{body_text.rstrip()}\n\n{attachment_text}"
        except Exception as att_err:
            logger.warning(f"Could not read attachments of email uid={msg.uid}: {str(att_err)}")
        msg_uid_str = str(msg.uid or "").strip()
        raw_msg_id = ""
        if getattr(msg, "headers", None):
            msg_id_vals = msg.headers.get("message-id") or msg.headers.get("Message-ID") or ()
            if msg_id_vals:
                raw_msg_id = str(msg_id_vals[0]).strip()
        dedup_uid = raw_msg_id or (f"imap:{email_address.strip().lower()}:{msg_uid_str}" if msg_uid_str else None)

        # Deduplication check: avoid inserting duplicate emails if already stored for this company
        try:
            already_exists = False
            if dedup_uid:
                try:
                    dup_check = supabase.table("customer_emails")\
                        .select("id")\
                        .eq("company_id", company_id)\
                        .eq("message_uid", dedup_uid)\
                        .limit(1)\
                        .execute()
                    if dup_check.data:
                        already_exists = True
                except Exception:
                    # Fallback if message_uid column is not yet migrated
                    pass

            if not already_exists:
                content_check = supabase.table("customer_emails")\
                    .select("id")\
                    .eq("company_id", company_id)\
                    .eq("sender_email", sender_addr)\
                    .eq("subject", subject_text)\
                    .eq("body", body_text)\
                    .limit(1)\
                    .execute()
                if content_check.data:
                    already_exists = True

            if already_exists:
                mailbox.flag(msg.uid, '\\Seen', True)
                logger.info(f"Skipped duplicate email uid={msg.uid} for user {user_id}.")
                continue
        except Exception as dedup_err:
            logger.warning(f"Email deduplication check warning for user {user_id}: {str(dedup_err)}")

        try:
            row_payload = {
                "user_id": user_id,
                "company_id": company_id,
                "sender_email": sender_addr,
                "subject": subject_text,
                "body": body_text,
                "status": "unread"
            }
            # Optional columns, newest first; dropped one by one if a migration
            # (message_uid, v16 from_spam) hasn't been applied yet.
            extras = {}
            if dedup_uid:
                extras["message_uid"] = dedup_uid
            if from_spam:
                extras["from_spam"] = True
            stored = None
            while True:
                try:
                    stored = supabase.table("customer_emails").insert({**row_payload, **extras}).execute()
                    break
                except Exception:
                    if not extras:
                        raise
                    extras.pop(next(reversed(extras)))
        except Exception as insert_err:
            logger.error(f"Failed to store email uid={msg.uid} for user {user_id}: {str(insert_err)}")
            continue

        mailbox.flag(msg.uid, '\\Seen', True)
        logger.info(f"Stored and marked email uid={msg.uid} as read for user {user_id}.")

        # Mail found in the spam folder is never auto-drafted: a person decides.
        if auto_draft and not from_spam and auto_drafted < MAX_AUTO_DRAFTS_PER_PASS and stored and stored.data \
                and is_auto_draftable(sender_addr, email_address):
            auto_drafted += 1
            auto_draft_email(stored.data[0], user_id, company_id)


def poll_user_mailbox(user_id: str, company_id: str, email_address: str, app_password: str):
    """
    Connects to a single user's Gmail IMAP account, fetches unread emails,
    inserts them into customer_emails, and marks them as read.
    A message is only marked as read after it has been stored successfully,
    and a failure on one message doesn't block the rest.
    """
    from app.services.mail_oauth import OAuthToken, PROVIDERS
    is_oauth = isinstance(app_password, OAuthToken)
    IMAP_SERVER = PROVIDERS[app_password.provider]["imap_host"] if is_oauth else "imap.gmail.com"
    try:
        logger.info(f"Polling GMail IMAP for user {user_id}...")
        auto_draft = bool(get_company_settings(company_id).get("auto_draft_quotes"))
        connect = MailBox(IMAP_SERVER)
        session = connect.xoauth2(email_address, str(app_password)) if is_oauth else connect.login(email_address, app_password)
        with session as mailbox:
            # mark_seen=False: only flag as seen once the DB insert succeeded
            _process_folder(mailbox, AND(seen=False), False, user_id, company_id, email_address, auto_draft)
            if settings.CHECK_SPAM_FOLDER:
                spam_folder = find_spam_folder(mailbox)
                if spam_folder:
                    mailbox.folder.set(spam_folder)
                    since = (datetime.now(timezone.utc) - timedelta(days=SPAM_LOOKBACK_DAYS)).date()
                    _process_folder(mailbox, AND(seen=False, date_gte=since), True, user_id, company_id, email_address, auto_draft)
    except Exception as e:
        logger.error(f"Gmail IMAP connection exception for user {user_id}: {str(e)}")


def poll_gmail_once():
    """
    Runs one polling pass over every user that has Gmail credentials configured,
    plus the globally configured (env) mailbox, which is assigned to the first admin.
    """
    users_res = supabase.table("users").select(
        "id", "company_id", "role", "encrypted_gmail_email", "encrypted_gmail_password"
    ).execute()
    from app.core import plans
    suspended: dict[str, bool] = {}

    def paused(company_id: str | None) -> bool:
        key = company_id or DEFAULT_COMPANY_ID
        if key not in suspended:
            suspended[key] = plans.is_suspended(key)
        return suspended[key]

    profiles = [p for p in (users_res.data or []) if not paused(p.get("company_id"))]
    polled_addresses = set()

    # Mailboxes connected with Google / Microsoft sign-in
    from app.services import mail_oauth
    for connection in mail_oauth.list_connections():
        key = (connection.get("email") or "").strip().lower()
        if not key or key in polled_addresses or paused(connection.get("company_id")):
            continue
        polled_addresses.add(key)
        try:
            token = mail_oauth.access_token_for(connection)
        except Exception as token_err:
            logger.error(f"Connected mailbox for user {connection.get('user_id')} needs reconnecting: {str(token_err)}")
            continue
        poll_user_mailbox(connection["user_id"], connection.get("company_id") or DEFAULT_COMPANY_ID, connection["email"], token)

    for profile in profiles:
        enc_email = profile.get("encrypted_gmail_email")
        enc_pwd = profile.get("encrypted_gmail_password")
        if not (enc_email and enc_pwd):
            continue
        email_addr = decrypt_key(enc_email)
        app_pwd = decrypt_key(enc_pwd)
        if not (email_addr and app_pwd):
            continue
        key = email_addr.strip().lower()
        if key in polled_addresses:
            continue
        polled_addresses.add(key)
        poll_user_mailbox(
            profile["id"],
            profile.get("company_id") or DEFAULT_COMPANY_ID,
            email_addr,
            app_pwd
        )

    # Global mailbox from env/settings: route it to the first admin account
    # (not an arbitrary first user) so it lands in a deliberate tenant.
    from app.core.credentials import get_gmail_credentials
    fallback_email, fallback_pwd = get_gmail_credentials()
    if fallback_email and fallback_pwd and fallback_email.strip().lower() not in polled_addresses:
        admins = [p for p in profiles if p.get("role") == "admin"]
        if admins:
            owner = admins[0]
            poll_user_mailbox(
                owner["id"],
                owner.get("company_id") or DEFAULT_COMPANY_ID,
                fallback_email,
                fallback_pwd
            )
        else:
            logger.warning("Global Gmail mailbox configured but no admin user exists to own its emails; skipping.")


def poll_gmail_loop():
    """
    Background worker loop that polls all configured mailboxes on an interval.
    """
    interval = max(10, settings.EMAIL_POLL_INTERVAL_SECONDS)
    last_follow_up_check = 0.0
    while True:
        try:
            poll_gmail_once()
        except Exception as global_err:
            logger.error(f"Global GMail poller loop error: {str(global_err)}")
        if time.time() - last_follow_up_check >= settings.FOLLOW_UP_CHECK_INTERVAL_SECONDS:
            last_follow_up_check = time.time()
            try:
                run_follow_ups()
            except Exception as follow_err:
                logger.error(f"Automatic follow-up pass failed: {str(follow_err)}")
            try:
                from app.services.followups import run_all as run_whatsapp_follow_ups
                run_whatsapp_follow_ups()
            except Exception as follow_err:
                logger.error(f"WhatsApp follow-up pass failed: {str(follow_err)}")
        time.sleep(interval)


def _acquire_single_instance_lock() -> bool:
    """
    Ensures only one process per host/container runs the poller (gunicorn starts
    several workers, each of which runs the app startup hook).
    """
    global _lock_handle
    try:
        handle = open(LOCK_FILE_PATH, "w")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_handle = handle
        return True
    except OSError:
        return False


def start_email_poller():
    """
    Launches the Gmail IMAP poller worker in a background daemon thread,
    unless disabled or already running in another worker process.
    """
    if not settings.ENABLE_EMAIL_POLLER:
        logger.info("Email poller disabled via ENABLE_EMAIL_POLLER=false.")
        return
    if not _acquire_single_instance_lock():
        logger.info(f"Email poller already running in another worker (pid {os.getpid()} skipping).")
        return
    logger.info(f"Starting email poller in worker pid {os.getpid()}.")
    thread = threading.Thread(target=poll_gmail_loop, daemon=True)
    thread.start()
