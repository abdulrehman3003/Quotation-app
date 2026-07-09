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
    
    # Gemini Settings (via OpenAI SDK compatibility)
    GEMINI_API_KEY: str | None = Field(None, env="GEMINI_API_KEY")
    OPENAI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    GEMINI_MODEL: str = "gemini-1.5-flash"  # or gemini-2.5-flash
    
    # Twilio WhatsApp Settings (Optional - falls back to mock)
    TWILIO_ACCOUNT_SID: str | None = Field(None, env="TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN: str | None = Field(None, env="TWILIO_AUTH_TOKEN")
    TWILIO_WHATSAPP_NUMBER: str | None = Field(None, env="TWILIO_WHATSAPP_NUMBER")

    # Gmail IMAP Settings (Optional - falls back to mock)
    GMAIL_EMAIL: str | None = Field(None, env="GMAIL_EMAIL")
    GMAIL_APP_PASSWORD: str | None = Field(None, env="GMAIL_APP_PASSWORD")

    # Server Settings
    PORT: int = 8000
    HOST: str = "127.0.0.1"  # Security: MUST listen on 127.0.0.1, not 0.0.0.0
    FRONTEND_URL: str | None = Field(None, env="FRONTEND_URL")

settings = Settings()
