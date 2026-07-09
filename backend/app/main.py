# app/main.py
import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os

from app.core.config import settings
from app.api import leads, kb, quotes, emails, whatsapp, admin, users
from supabase import create_client, Client

supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

class SupabaseDBHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = record.getMessage()
            if record.name.startswith("supabase") or record.name.startswith("httpx") or "system_logs" in msg:
                return
            supabase_client.table("system_logs").insert({
                "source": "backend",
                "level": record.levelname,
                "message": f"[{record.name}] {msg}"
            }).execute()
        except Exception:
            pass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

db_handler = SupabaseDBHandler()
db_handler.setLevel(logging.INFO)
logging.getLogger().addHandler(db_handler)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Full-stack AI cost calculator and B2B quote dispatch engine",
    version="0.1.0"
)

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://admin.localhost:5173",
    "http://admin.localhost:5174",
]

if settings.FRONTEND_URL:
    allowed_origins.append(settings.FRONTEND_URL)

env_origins = os.getenv("CORS_ORIGINS")
if env_origins:
    allowed_origins.extend([origin.strip() for origin in env_origins.split(",") if origin.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cyatvsjgybtnkhyyetwi.supabase.co https://generativelanguage.googleapis.com; frame-ancestors 'none';"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Register API Routers
app.include_router(leads.router, prefix="/api")
app.include_router(kb.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(emails.router, prefix="/api")
app.include_router(whatsapp.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(users.router, prefix="/api")

from app.services.email_poller import start_email_poller

# Global secure exception handler to mask database/model internals
@app.on_event("startup")
def on_startup():
    start_email_poller()

@app.exception_handler(Exception)
def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception encountered at {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please contact support."}
    )

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "project": settings.PROJECT_NAME}

if __name__ == "__main__":
    # Security Guideline check: Listen on 127.0.0.1 instead of 0.0.0.0 for security during testing
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
