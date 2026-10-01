from typing import Optional
from supabase import create_client, Client
from app.core.config import settings

_supabase_admin_client: Optional[Client] = None


def get_supabase_admin() -> Client:
    """
    Returns the Supabase client initialized with the SERVICE ROLE key.
    Bypasses RLS for authoritative backend operations and system routines.
    """
    global _supabase_admin_client
    if _supabase_admin_client is None:
        _supabase_admin_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
    return _supabase_admin_client


def get_supabase_user_client(access_token: str) -> Client:
    """
    Returns a Supabase client initialized with the user's access token.
    Enforces Row-Level Security (RLS) as the authenticated user.
    """
    client: Client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY
    )
    # Set authorization header for user requests
    client.postgrest.auth(access_token)
    return client
