from typing import Optional, Dict, Any
import jwt
from pydantic import BaseModel
from fastapi import HTTPException, status
from app.core.config import settings


class AuthenticatedUser(BaseModel):
    id: str
    email: Optional[str] = None
    role: Optional[str] = "authenticated"
    raw_token: str
    user_metadata: Dict[str, Any] = {}


def verify_supabase_token(token: str) -> AuthenticatedUser:
    """
    Decodes and validates a Supabase JWT access token.
    Extracts the user id (sub), email, and claims.
    """
    try:
        # In local/testing development where JWT secret might be placeholder,
        # support standard Supabase decode or unverified options for local mock
        secret = settings.SUPABASE_JWT_SECRET
        
        if settings.ENVIRONMENT == "test" or secret.startswith("placeholder-"):
            # Test or dummy mode: decode without cryptographic signature verification
            payload = jwt.decode(
                token,
                options={"verify_signature": False, "verify_aud": False}
            )
        else:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing user identity (sub)",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return AuthenticatedUser(
            id=user_id,
            email=payload.get("email"),
            role=payload.get("role", "authenticated"),
            raw_token=token,
            user_metadata=payload.get("user_metadata", {})
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
