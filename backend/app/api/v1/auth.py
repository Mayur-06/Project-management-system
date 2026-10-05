from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.dependencies import get_admin_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


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

