# app/core/config.py
import os
import secrets
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PROJECT_NAME: str = "AXRFLOWS Backend"
    
    # Supabase Settings
    SUPABASE_URL: str = Field(..., env="SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., env="SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_JWT_SECRET: str = Field(..., env="SUPABASE_JWT_SECRET")
    ENCRYPTION_KEY: str | None = Field(None, env="ENCRYPTION_KEY")
    
    # AI provider: AIML API (https://aimlapi.com), OpenAI-compatible.
    # The model is picked in Admin > System Settings; AI_MODEL is the default.
    AI_API_KEY: str | None = None
    AI_BASE_URL: str = "https://api.aimlapi.com/v1"
    AI_MODELS_URL: str = "https://api.aimlapi.com/models"
    AI_MODEL: str = "openai/gpt-4o-mini"
    # Tried in order when the main model is overloaded or unavailable (comma-separated).
    AI_FALLBACK_MODELS: str = "openai/gpt-4.1-mini"
    # low | medium | high for reasoning models (o-series, gpt-5); leave empty for gpt-4o / gpt-4.1.
    AI_REASONING_EFFORT: str = ""
    
    # Twilio WhatsApp Settings (Optional - falls back to mock)
    TWILIO_ACCOUNT_SID: str | None = Field(None, env="TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN: str | None = Field(None, env="TWILIO_AUTH_TOKEN")
    TWILIO_WHATSAPP_NUMBER: str | None = Field(None, env="TWILIO_WHATSAPP_NUMBER")

    # Gmail IMAP Settings (Optional - falls back to mock)
    GMAIL_EMAIL: str | None = Field(None, env="GMAIL_EMAIL")
    GMAIL_APP_PASSWORD: str | None = Field(None, env="GMAIL_APP_PASSWORD")

    # Background IMAP poller. Only one process per deployment should run it;
    # set to false on extra replicas.
    ENABLE_EMAIL_POLLER: bool = True
    EMAIL_POLL_INTERVAL_SECONDS: int = 30

    # When true, tenants without their own Gemini/Gmail/Twilio credentials
    # silently use the admin user's credentials. Off by default: it lets any
    # tenant send mail from / spend quota on the admin's accounts.
    ALLOW_ADMIN_CREDENTIAL_FALLBACK: bool = False

    # Shared secret required in the X-Webhook-Token header for POST /api/leads/webhook.
    # The endpoint is disabled when unset.
    WEBHOOK_SECRET_TOKEN: str | None = None

    # Public base URL of this backend as Twilio sees it (e.g. https://api.example.com).
    # Used to validate X-Twilio-Signature behind proxies. Falls back to the request URL.
    PUBLIC_BACKEND_URL: str | None = None

    # "Sign in with Google / Microsoft" for mailboxes. Register an OAuth app with each
    # provider and add <PUBLIC_BACKEND_URL>/api/oauth/<provider>/callback as a redirect URI.
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: str | None = None
    MICROSOFT_OAUTH_CLIENT_ID: str | None = None
    MICROSOFT_OAUTH_CLIENT_SECRET: str | None = None

    # Knowledge base text sent with each quote request is capped at this many
    # characters; above it only the parts most relevant to the request are sent.
    KB_CONTEXT_MAX_CHARS: int = 60000

    # How often the background worker looks for sent quotes due an automatic follow-up.
    FOLLOW_UP_CHECK_INTERVAL_SECONDS: int = 900

    # Server Settings
    PORT: int = 8000
    HOST: str = "127.0.0.1"  # Security: MUST listen on 127.0.0.1, not 0.0.0.0
    FRONTEND_URL: str | None = Field(None, env="FRONTEND_URL")

settings = Settings()
