from typing import Any, Dict, Optional
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from supabase_auth.errors import AuthApiError

from app.core.dependencies import get_admin_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


class UserInfo(BaseModel):
    id: str
    email: Optional[str] = None
    user_metadata: Optional[Dict[str, Any]] = None


class SessionInfo(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    expires_at: Optional[int] = None


class SigninResponse(BaseModel):
    user: UserInfo
    session: SessionInfo


@router.post("/signup", summary="Register user with auto-confirmed email via Admin API to bypass SMTP rate limits")
def signup(data: SignupRequest, db: Client = Depends(get_admin_db)):
    """
    Registers a new user and marks email_confirm = True immediately.
    This prevents Supabase's free-tier SMTP email rate limits (3/hr) and
    allows instant login without email confirmation delays.
    If the email already exists, returns 409 Conflict without modifying the existing user.
    """
    try:
        user_res = db.auth.admin.create_user(
            {
                "email": data.email,
                "password": data.password,
                "email_confirm": True,
                "user_metadata": {"full_name": data.name},
            }
        )
        return {"id": user_res.user.id, "email": user_res.user.email}
    except Exception as e:
        err_msg = str(e).lower()
        err_code = getattr(e, "code", "")
        if (
            "already registered" in err_msg
            or "already been registered" in err_msg
            or "already exists" in err_msg
            or "unique" in err_msg
            or err_code == "email_exists"
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email address is already registered.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/signin",
    response_model=SigninResponse,
    summary="Sign in user and return Supabase session tokens",
)
def signin(data: SigninRequest, db: Client = Depends(get_admin_db)):
    """
    Authenticates a user via Supabase Auth with email and password.
    Returns session tokens (access_token, refresh_token) and user metadata.
    """
    try:
        auth_res = db.auth.sign_in_with_password(
            {
                "email": data.email.strip().lower(),
                "password": data.password,
            }
        )
        if not auth_res.user or not auth_res.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password. Please verify your credentials and try again.",
            )

        return SigninResponse(
            user=UserInfo(
                id=str(auth_res.user.id),
                email=auth_res.user.email,
                user_metadata=getattr(auth_res.user, "user_metadata", {}) or {},
            ),
            session=SessionInfo(
                access_token=auth_res.session.access_token,
                refresh_token=auth_res.session.refresh_token,
                token_type=getattr(auth_res.session, "token_type", "bearer") or "bearer",
                expires_in=getattr(auth_res.session, "expires_in", None),
                expires_at=getattr(auth_res.session, "expires_at", None),
            ),
        )
    except HTTPException:
        raise
    except AuthApiError as e:
        err_msg = str(e.message or "").lower()
        err_code = str(getattr(e, "code", "") or "").lower()
        if "invalid" in err_msg or "credentials" in err_msg or err_code == "invalid_credentials":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password. Please verify your credentials and try again.",
            )
        if "confirm" in err_msg or err_code == "email_not_confirmed":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your email is not verified yet. Please check your inbox or accept your team invitation.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message or "Authentication failed.",
        )
    except Exception as e:
        err_msg = str(e).lower()
        if "invalid login credentials" in err_msg or "invalid credentials" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password. Please verify your credentials and try again.",
            )
        if "email not confirmed" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your email is not verified yet. Please check your inbox or accept your team invitation.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


