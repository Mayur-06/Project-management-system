from typing import Optional, Dict, Any
import jwt
from jwt import PyJWKClient
from pydantic import BaseModel
from fastapi import HTTPException, status
from app.core.config import settings

_jwks_client: Optional[PyJWKClient] = None

def get_jwks_client() -> Optional[PyJWKClient]:
    global _jwks_client
    if _jwks_client is None:
        try:
            base_url = settings.SUPABASE_URL.rstrip("/")
            if base_url and not base_url.startswith("https://placeholder"):
                jwks_url = f"{base_url}/auth/v1/.well-known/jwks.json"
                _jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
        except Exception:
            _jwks_client = None
    return _jwks_client


class AuthenticatedUser(BaseModel):
    id: str
    email: Optional[str] = None
    role: Optional[str] = "authenticated"
    raw_token: str
    user_metadata: Dict[str, Any] = {}


def verify_supabase_token(token: str) -> AuthenticatedUser:
    """
    Decodes and validates a Supabase JWT access token.
    Supports both modern Supabase ECC/RSA keys (ES256/RS256 via JWKS)
    and HMAC shared secrets (HS256 via SUPABASE_JWT_SECRET).
    """
    try:
        secret = settings.SUPABASE_JWT_SECRET
        
        if settings.ENVIRONMENT == "test" and secret.startswith("placeholder-"):
            payload = jwt.decode(
                token,
                options={"verify_signature": False, "verify_aud": False}
            )
        else:
            # Check algorithm from header
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg", "HS256")

            if alg in ("ES256", "RS256"):
                jwks = get_jwks_client()
                if not jwks:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Supabase JWKS client unavailable for asymmetric token verification"
                    )
                signing_key = jwks.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    audience="authenticated",
                    leeway=60,
                )
            else:
                payload = jwt.decode(
                    token,
                    secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                    leeway=60,
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
