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
    # Guarantee admin client always uses service role key and is never polluted by user sessions
    service_token = settings.SUPABASE_SERVICE_ROLE_KEY
    service_bearer = f"Bearer {service_token}"
    if hasattr(_supabase_admin_client, "auth") and _supabase_admin_client.auth is not None:
        _supabase_admin_client.auth._current_session = None
        if hasattr(_supabase_admin_client.auth, "_headers"):
            _supabase_admin_client.auth._headers["Authorization"] = service_bearer
            _supabase_admin_client.auth._headers["apiKey"] = service_token
        if hasattr(_supabase_admin_client.auth, "admin") and hasattr(_supabase_admin_client.auth.admin, "_headers"):
            _supabase_admin_client.auth.admin._headers["Authorization"] = service_bearer
            _supabase_admin_client.auth.admin._headers["apiKey"] = service_token
    if hasattr(_supabase_admin_client, "postgrest") and _supabase_admin_client.postgrest is not None:
        _supabase_admin_client.postgrest.auth(service_token)
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
