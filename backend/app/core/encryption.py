# app/core/encryption.py
import base64
import hashlib
import logging
from cryptography.fernet import Fernet
from app.core.config import settings

logger = logging.getLogger(__name__)

# Derive a 32-byte key for Fernet from the Supabase JWT Secret
try:
    key_source = settings.SUPABASE_JWT_SECRET or "default_ephemeral_fallback_key_for_testing"
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(key_source.encode()).digest())
    cipher = Fernet(derived_key)
except Exception as e:
    logger.error(f"Failed to initialize encryption key: {str(e)}")
    cipher = None

def encrypt_key(plain_text: str) -> str:
    """
    Encrypts sensitive keys or passwords using symmetric encryption.
    """
    if not plain_text or not cipher:
        return plain_text or ""
    try:
        return cipher.encrypt(plain_text.encode()).decode()
    except Exception as e:
        logger.error(f"Encryption failed: {str(e)}")
        return ""

def decrypt_key(encrypted_text: str) -> str:
    """
    Decrypts encrypted keys or passwords.
    """
    if not encrypted_text or not cipher:
        return encrypted_text or ""
    try:
        return cipher.decrypt(encrypted_text.encode()).decode()
    except Exception as e:
        logger.error(f"Decryption failed: {str(e)}")
        return ""
