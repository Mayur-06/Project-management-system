from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client

from app.core.security import AuthenticatedUser, verify_supabase_token
from app.core.database import get_supabase_admin, get_supabase_user_client

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> AuthenticatedUser:
    """
    FastAPI dependency that extracts the Bearer JWT token from the Authorization header,
    validates it, and yields the authenticated user.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_supabase_token(credentials.credentials)


async def get_db_client(
    current_user: AuthenticatedUser = Depends(get_current_user)
) -> Client:
    """
    FastAPI dependency yielding a Supabase client configured with the current user's token.
    This enforces RLS policies in PostgreSQL.
    """
    return get_supabase_user_client(current_user.raw_token)


def get_admin_db() -> Client:
    """
    FastAPI dependency yielding the Supabase administrative client.
    """
    return get_supabase_admin()
