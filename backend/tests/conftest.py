import os

# Dummy configuration so app modules import without a real project. These take
# priority over backend/.env, which also guarantees tests never touch a live database.
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret"
os.environ["ENABLE_EMAIL_POLLER"] = "false"
os.environ["FRONTEND_URL"] = "https://app.example.com"
os.environ["GEMINI_API_KEY"] = ""
