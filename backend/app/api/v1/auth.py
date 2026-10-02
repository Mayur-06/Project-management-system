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
        err_msg = str(e)
        if "already registered" in err_msg.lower() or "unique" in err_msg.lower() or "already exists" in err_msg.lower():
            # If user was created by an invitation, set their password and confirm email now
            try:
                users = db.auth.admin.list_users()
                matched = next((u for u in users if (u.email or "").lower() == data.email.lower()), None)
                if matched:
                    db.auth.admin.update_user_by_id(
                        matched.id,
                        {
                            "password": data.password,
                            "email_confirm": True,
                            "user_metadata": {"full_name": data.name},
                        },
                    )
                    return {"id": matched.id, "email": matched.email, "status": "activated"}
            except Exception as update_err:
                print("Failed to activate invited user:", update_err)
            return {"status": "exists", "message": "User already registered"}
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg,
        )


class SetPasswordRequest(BaseModel):
    password: str
    name: str = ""
    email: EmailStr = ""


@router.post("/set-password", summary="Set or update password for an invited user")
def set_password(data: SetPasswordRequest, db: Client = Depends(get_admin_db)):
    """
    Sets a password and confirms email for an invited user by email or active session.
    """
    if not data.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")
    
    users = db.auth.admin.list_users()
    matched = next((u for u in users if (u.email or "").lower() == data.email.lower().strip()), None)
    if not matched:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found")
    
    update_data = {
        "password": data.password,
        "email_confirm": True,
    }
    if data.name:
        update_data["user_metadata"] = {"full_name": data.name}

    db.auth.admin.update_user_by_id(matched.id, update_data)
    return {"status": "ok", "message": "Password set successfully"}

