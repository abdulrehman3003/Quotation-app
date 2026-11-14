# app/core/encryption.py
import base64
import hashlib
import logging
from cryptography.fernet import Fernet
from app.core.config import settings

logger = logging.getLogger(__name__)

# Derive a 32-byte key for Fernet from ENCRYPTION_KEY (preferred) or SUPABASE_JWT_SECRET
try:
    key_source = settings.ENCRYPTION_KEY or settings.SUPABASE_JWT_SECRET
    if not key_source:
        raise ValueError("Missing ENCRYPTION_KEY and SUPABASE_JWT_SECRET")
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(key_source.encode()).digest())
    cipher = Fernet(derived_key)
except Exception as e:
    logger.error(f"Failed to initialize encryption key: {str(e)}")
    cipher = None

def encrypt_key(plain_text: str) -> str:
    """
    Encrypts sensitive keys or passwords using symmetric encryption.
    Never returns plaintext if encryption fails.
    """
    if not plain_text:
        return ""
    if not cipher:
        logger.error("Encryption cipher is not initialized; refusing to store plaintext secret.")
        raise RuntimeError("Encryption service is unavailable")
    try:
        return cipher.encrypt(plain_text.strip().encode()).decode()
    except Exception as e:
        logger.error(f"Encryption failed: {str(e)}")
        raise RuntimeError("Failed to encrypt sensitive credential")

def decrypt_key(encrypted_text: str) -> str:
    """
    Decrypts encrypted keys or passwords.
    """
    if not encrypted_text or not cipher:
        return ""
    try:
        return cipher.decrypt(encrypted_text.encode()).decode()
    except Exception as e:
        logger.error(f"Decryption failed: {str(e)}")
        return ""
