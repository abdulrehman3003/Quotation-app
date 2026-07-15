# app/core/security.py
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from supabase import create_client, Client

security = HTTPBearer()

# Initialize Supabase client for token verification
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dependency to get the currently authenticated user from the Supabase JWT.
    Enforces server-side authentication validation.
    """
    token = credentials.credentials
    try:
        # 1. Decodes the JWT using HS256 and the Supabase JWT Secret.
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}  # Supabase aud is typically 'authenticated'
        )
        
        user_id = payload.get("sub")
        email = payload.get("email")
        
        if not user_id:
            raise JWTError("Invalid token: missing subject claim")
            
        # Fetch the user profile from public.users to get the company_id
        company_id = '00000000-0000-0000-0000-000000000000'
        try:
            user_res = supabase.table("users").select("company_id").eq("id", user_id).execute()
            if user_res.data and user_res.data[0].get("company_id"):
                company_id = user_res.data[0]["company_id"]
        except Exception:
            pass

        return {
            "id": user_id,
            "email": email,
            "company_id": company_id
        }
    except JWTError as e:
        # 2. Fallback to Supabase Auth API verification (handles RS256 or other custom token algorithms)
        try:
            res = supabase.auth.get_user(token)
            if not res or not res.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid token verification: {str(e)}"
                )
            
            user_id = res.user.id
            company_id = '00000000-0000-0000-0000-000000000000'
            try:
                user_res = supabase.table("users").select("company_id").eq("id", user_id).execute()
                if user_res.data and user_res.data[0].get("company_id"):
                    company_id = user_res.data[0]["company_id"]
            except Exception:
                pass

            return {
                "id": user_id,
                "email": res.user.email,
                "company_id": company_id
            }
        except Exception as api_err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token validation failed: {str(api_err)}"
            )

